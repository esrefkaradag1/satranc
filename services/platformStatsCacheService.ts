import type { PlatformDayStats } from '../lib/homeworkPlatformUtils';
import { getServiceSupabase, isSupabaseBackend, supabase } from './supabase';

/**
 * Platform (Lichess + Chess.com) günlük istatistik önbelleği — Supabase.
 *
 * Geçmiş günler platform API'lerinden yeniden çekilemediği için (lifetime sayaç
 * farkı sıfırlanır, "son bulmacalar" listesi yalnızca ~25 kayıt tutar) bir kez
 * hesaplanan doğru veri burada kalıcı saklanır ve tüm cihaz/antrenörlerde paylaşılır.
 */

const TABLE = 'chess_platform_day_stats';

export type PlatformDayCacheRow = {
  studentId: string;
  day: string;
  stats: PlatformDayStats;
  timeSeconds: number;
};

export type PlatformStatsCachePayload = {
  stats: Record<string, Record<string, PlatformDayStats>>;
  timeSeconds: Record<string, Record<string, number>>;
};

function normalizeIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))];
}

function normalizeDays(days: string[]): string[] {
  return [...new Set(days.map((d) => String(d ?? '').slice(0, 10)).filter(Boolean))];
}

/** Belirtilen öğrenci + günler için DB'deki önbelleği yükler. */
export async function loadPlatformDayStatsFromDb(
  studentIds: string[],
  days: string[],
): Promise<PlatformStatsCachePayload | null> {
  if (!isSupabaseBackend()) return null;
  const ids = normalizeIds(studentIds);
  const isoDays = normalizeDays(days);
  if (ids.length === 0 || isoDays.length === 0) return { stats: {}, timeSeconds: {} };

  const run = async (): Promise<PlatformStatsCachePayload | null> => {
    try {
      const client = getServiceSupabase() ?? supabase;
      const { data, error } = await client
        .from(TABLE)
        .select('student_id, day, stats, time_seconds')
        .in('student_id', ids)
        .in('day', isoDays);
      if (error) {
        console.warn('[PlatformStatsCache] load error:', error.message);
        return null;
      }
      const stats: Record<string, Record<string, PlatformDayStats>> = {};
      const timeSeconds: Record<string, Record<string, number>> = {};
      for (const row of (data ?? []) as Array<{
        student_id: string;
        day: string;
        stats: PlatformDayStats | null;
        time_seconds: number | null;
      }>) {
        const sid = String(row.student_id);
        const iso = String(row.day).slice(0, 10);
        if (row.stats && typeof row.stats === 'object') {
          (stats[sid] ??= {})[iso] = row.stats;
        }
        const sec = Number(row.time_seconds) || 0;
        if (sec > 0) (timeSeconds[sid] ??= {})[iso] = sec;
      }
      return { stats, timeSeconds };
    } catch (e) {
      console.warn('[PlatformStatsCache] load failed:', e);
      return null;
    }
  };

  // CORS/DNS takılırsa Platform Çek sonsuza kilitlenmesin — API yoluna düş.
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 5_000);
    void run().then((value) => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      }
    });
  });
}

/** Verilen satırları DB'ye upsert eder (student_id + day birincil anahtar). */
export async function savePlatformDayStatsToDb(rows: PlatformDayCacheRow[]): Promise<void> {
  if (!isSupabaseBackend()) return;
  const client = getServiceSupabase() ?? supabase;
  if (!client) return;

  const payload = rows
    .filter((r) => r.studentId && r.day)
    .map((r) => ({
      student_id: String(r.studentId),
      day: r.day.slice(0, 10),
      stats: r.stats ?? {},
      time_seconds: Math.max(0, Math.round(r.timeSeconds || 0)),
      updated_at: new Date().toISOString(),
    }));
  if (payload.length === 0) return;

  const CHUNK = 200;
  try {
    for (let i = 0; i < payload.length; i += CHUNK) {
      const { error } = await client
        .from(TABLE)
        .upsert(payload.slice(i, i + CHUNK), { onConflict: 'student_id,day' });
      if (error) {
        console.warn('[PlatformStatsCache] save error:', error.message);
        break;
      }
    }
  } catch (e) {
    console.warn('[PlatformStatsCache] save failed:', e);
  }
}
