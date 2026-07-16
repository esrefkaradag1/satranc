import type { ChessComPuzzleAttempt } from '../lib/chesscomPuzzleParse';
import type { LichessPuzzleActivityRow } from '../lib/lichessOAuthServer';
import { getServiceSupabase, isSupabaseBackend, supabase } from './supabase';

/**
 * Platform günlük aktivite DETAYI (bulmaca kayıtları) önbelleği — Supabase.
 *
 * Chess.com herkese açık API yalnızca son ~25 bulmaca denemesini tutar. Antrenör
 * öğrenci detayını her açtığında taze listeyi çekip mevcut (önceden kaydedilmiş)
 * kayıtlarla `id` üzerinden birleştiririz; böylece sıfırdan başlamak yerine yalnızca
 * yeniler eklenir ve günün tamamı kalıcı kalır.
 */

const TABLE = 'chess_platform_day_activity';

export type PlatformDayActivityRecords = {
  chessComPuzzles: ChessComPuzzleAttempt[];
  lichessPuzzles: LichessPuzzleActivityRow[];
};

export function emptyActivityRecords(): PlatformDayActivityRecords {
  return { chessComPuzzles: [], lichessPuzzles: [] };
}

function dbClient() {
  return getServiceSupabase() ?? supabase;
}

/** id ile birleştirir; aynı id'de taze kayıt öncekinin yerine geçer. Sıra korunur. */
export function mergeById<T>(prev: T[], fresh: T[], idOf: (item: T) => string | number): T[] {
  const map = new Map<string | number, T>();
  for (const item of prev) {
    const id = idOf(item);
    if (id != null) map.set(id, item);
  }
  for (const item of fresh) {
    const id = idOf(item);
    if (id != null) map.set(id, item);
  }
  return Array.from(map.values());
}

export function mergeActivityRecords(
  prev: PlatformDayActivityRecords,
  fresh: Partial<PlatformDayActivityRecords>,
): PlatformDayActivityRecords {
  return {
    chessComPuzzles: mergeById(
      prev.chessComPuzzles,
      fresh.chessComPuzzles ?? [],
      (a) => a.id,
    ),
    lichessPuzzles: mergeById(
      prev.lichessPuzzles,
      fresh.lichessPuzzles ?? [],
      (a) => a.id,
    ),
  };
}

export async function loadPlatformDayActivity(
  studentId: string,
  day: string,
): Promise<PlatformDayActivityRecords> {
  if (!isSupabaseBackend()) return emptyActivityRecords();
  const sid = String(studentId ?? '').trim();
  const iso = String(day ?? '').slice(0, 10);
  if (!sid || !iso) return emptyActivityRecords();

  try {
    const client = dbClient();
    if (!client) return emptyActivityRecords();
    const { data, error } = await client
      .from(TABLE)
      .select('records')
      .eq('student_id', sid)
      .eq('day', iso)
      .maybeSingle();
    if (error || !data?.records || typeof data.records !== 'object') {
      return emptyActivityRecords();
    }
    const r = data.records as Partial<PlatformDayActivityRecords>;
    return {
      chessComPuzzles: Array.isArray(r.chessComPuzzles) ? r.chessComPuzzles : [],
      lichessPuzzles: Array.isArray(r.lichessPuzzles) ? r.lichessPuzzles : [],
    };
  } catch (e) {
    console.warn('[PlatformActivityCache] load failed:', e);
    return emptyActivityRecords();
  }
}

export async function savePlatformDayActivity(
  studentId: string,
  day: string,
  records: PlatformDayActivityRecords,
): Promise<void> {
  if (!isSupabaseBackend()) return;
  const sid = String(studentId ?? '').trim();
  const iso = String(day ?? '').slice(0, 10);
  if (!sid || !iso) return;
  if (records.chessComPuzzles.length === 0 && records.lichessPuzzles.length === 0) return;

  try {
    const client = dbClient();
    if (!client) return;
    const { error } = await client.from(TABLE).upsert(
      {
        student_id: sid,
        day: iso,
        records,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,day' },
    );
    if (error) console.warn('[PlatformActivityCache] save error:', error.message);
  } catch (e) {
    console.warn('[PlatformActivityCache] save failed:', e);
  }
}

/** Kayıtlı bulmaca listelerinden günlük doğru/yanlış özeti. */
export function puzzleStatsFromActivityRecords(records: PlatformDayActivityRecords): {
  chessCom: { count: number; passed: number; failed: number };
  lichess: { count: number; passed: number; failed: number };
} {
  const ccPassed = records.chessComPuzzles.filter((a) => a.passed).length;
  const ccFailed = records.chessComPuzzles.length - ccPassed;
  const liPassed = records.lichessPuzzles.filter((a) => a.win).length;
  const liFailed = records.lichessPuzzles.length - liPassed;
  return {
    chessCom: { count: records.chessComPuzzles.length, passed: ccPassed, failed: ccFailed },
    lichess: { count: records.lichessPuzzles.length, passed: liPassed, failed: liFailed },
  };
}

/** Birden fazla öğrenci + gün için aktivite önbelleğini toplu yükler. */
export async function loadPlatformDayActivityBatch(
  studentIds: string[],
  days: string[],
): Promise<Record<string, Record<string, PlatformDayActivityRecords>>> {
  const out: Record<string, Record<string, PlatformDayActivityRecords>> = {};
  if (!isSupabaseBackend()) return out;
  const ids = [...new Set(studentIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  const isoDays = [...new Set(days.map((d) => String(d ?? '').slice(0, 10)).filter(Boolean))];
  if (ids.length === 0 || isoDays.length === 0) return out;

  try {
    const client = dbClient();
    if (!client) return out;
    const { data, error } = await client
      .from(TABLE)
      .select('student_id, day, records')
      .in('student_id', ids)
      .in('day', isoDays);
    if (error) {
      console.warn('[PlatformActivityCache] batch load error:', error.message);
      return out;
    }
    for (const row of data ?? []) {
      const sid = String((row as { student_id: string }).student_id);
      const iso = String((row as { day: string }).day).slice(0, 10);
      const r = (row as { records?: Partial<PlatformDayActivityRecords> }).records;
      const records: PlatformDayActivityRecords = {
        chessComPuzzles: Array.isArray(r?.chessComPuzzles) ? r.chessComPuzzles : [],
        lichessPuzzles: Array.isArray(r?.lichessPuzzles) ? r.lichessPuzzles : [],
      };
      (out[sid] ??= {})[iso] = records;
    }
  } catch (e) {
    console.warn('[PlatformActivityCache] batch load failed:', e);
  }
  return out;
}
