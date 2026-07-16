/**
 * Günde bir kez (~23:00 TR) platform istatistiklerini Lichess/Chess.com'dan çekip
 * chess_platform_day_stats tablosuna yazar. Gün içi ödev ekranı bu önbelleği kullanır;
 * Lichess rate-limit'ini (tek istek / dakikada bir) aşmamak için toplu istemci poll yoktur.
 */

import { createClient } from '@supabase/supabase-js';
import { istanbulDayKey } from '../homeworkDayUtils';
import { mergePlatformDayStats, type PlatformDayStats } from '../homeworkPlatformUtils';
import { computePlatformWeekStats } from './platform-week-stats';

type Env = Record<string, string | undefined>;

const CHUNK = 40;

function supabaseFromEnv(env: Env) {
  const url = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const key = String(env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function mapStudentRow(row: Record<string, unknown>) {
  const id = String(row.id ?? '').trim();
  if (!id) return null;
  const lichessUsername = String(row.lichess_username ?? row.lichessUsername ?? '').trim();
  const chessComUsername = String(
    row.chess_com_username ?? row.chesscom_username ?? row.chessComUsername ?? '',
  ).trim();
  if (!lichessUsername && !chessComUsername) return null;
  return { id, lichessUsername: lichessUsername || undefined, chessComUsername: chessComUsername || undefined };
}

export async function runPlatformDaySync(
  env: Env = process.env,
  opts?: { day?: string },
): Promise<{ ok: boolean; day: string; students: number; saved: number; error?: string }> {
  const day = (opts?.day || istanbulDayKey()).slice(0, 10);
  const sb = supabaseFromEnv(env);
  if (!sb) {
    return { ok: false, day, students: 0, saved: 0, error: 'Supabase yapılandırması eksik' };
  }

  const { data, error } = await sb
    .from('students')
    .select('id, lichess_username, chess_com_username, chesscom_username');
  if (error) {
    return { ok: false, day, students: 0, saved: 0, error: error.message };
  }

  const students = (data ?? [])
    .map((row) => mapStudentRow(row as Record<string, unknown>))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  let saved = 0;
  for (let i = 0; i < students.length; i += CHUNK) {
    const chunk = students.slice(i, i + CHUNK);
    const chunkIds = chunk.map((s) => s.id);

    // Önceki DB kaydı: Chess.com "son 25" penceresi geçmiş günü 0'a düşürmesin.
    const existingByStudent = new Map<string, PlatformDayStats>();
    const { data: existingRows } = await sb
      .from('chess_platform_day_stats')
      .select('student_id, stats, time_seconds')
      .eq('day', day)
      .in('student_id', chunkIds);
    for (const row of existingRows ?? []) {
      const sid = String((row as { student_id: string }).student_id);
      const stats = (row as { stats?: PlatformDayStats }).stats;
      const timeSeconds = Number((row as { time_seconds?: number }).time_seconds) || 0;
      if (stats && typeof stats === 'object') {
        existingByStudent.set(sid, {
          ...stats,
          activityTimeSeconds: Math.max(stats.activityTimeSeconds ?? 0, timeSeconds),
        });
      }
    }

    const { stats } = await computePlatformWeekStats(chunk, [day]);
    const rows = Object.entries(stats).map(([studentId, byDay]) => {
      const fresh = (byDay[day] ?? {}) as PlatformDayStats;
      const merged = mergePlatformDayStats(existingByStudent.get(studentId), fresh);
      return {
        student_id: studentId,
        day,
        stats: merged,
        time_seconds: Math.max(0, Math.round(Number(merged.activityTimeSeconds) || 0)),
        updated_at: new Date().toISOString(),
      };
    });
    if (rows.length === 0) continue;
    const { error: upErr } = await sb.from('chess_platform_day_stats').upsert(rows, {
      onConflict: 'student_id,day',
    });
    if (upErr) {
      console.warn('[platform-day-sync] upsert:', upErr.message);
      continue;
    }
    saved += rows.length;
  }

  console.log(`[platform-day-sync] day=${day} students=${students.length} saved=${saved}`);
  return { ok: true, day, students: students.length, saved };
}

type Req = {
  method?: string;
  body?: string | Record<string, unknown>;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
};
type Res = {
  status(code: number): { json(body: unknown): void };
};

function headerValue(req: Req, name: string): string {
  const raw = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '');
}

function cronAuthorized(req: Req): boolean {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret) return true;
  return headerValue(req, 'authorization') === `Bearer ${secret}`;
}

function dayFromReq(req: Req): string | undefined {
  const q = req.query?.day;
  if (typeof q === 'string' && q) return q.slice(0, 10);
  if (Array.isArray(q) && q[0]) return String(q[0]).slice(0, 10);
  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body as string); } catch { return {}; } })()
    : (req.body ?? {});
  if (typeof (body as { day?: string }).day === 'string') {
    return String((body as { day: string }).day).slice(0, 10);
  }
  return undefined;
}

export default async function handler(req: Req, res: Res) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    res.status(405).json({ error: 'Yalnızca GET veya POST' });
    return;
  }
  if (method === 'GET' && !cronAuthorized(req)) {
    res.status(401).json({ error: 'Yetkisiz' });
    return;
  }
  try {
    const result = await runPlatformDaySync(process.env, { day: dayFromReq(req) });
    res.status(result.ok ? 200 : 500).json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Sunucu hatası' });
  }
}
