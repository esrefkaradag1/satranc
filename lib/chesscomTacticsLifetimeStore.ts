/** Chess.com lifetime tactics → Supabase günlük snapshot (sunucu / gece senkronu). */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TacticsLifetimeCounts } from './chesscomDailyTacticsTracker';
import type { DayPuzzleStats } from './platformWeekStatsDerive';
import {
  MAX_PLAUSIBLE_DAILY_PUZZLES,
  preferRicherChessComDayStats,
} from './chesscomDailyTacticsTracker';

const TABLE = 'chess_com_tactics_lifetime';

export function supabaseFromEnv(env: Record<string, string | undefined> = process.env): SupabaseClient | null {
  const url = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const key = String(env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadTacticsLifetimeSnapshots(
  usernames: string[],
  days: string[],
  client?: SupabaseClient | null,
): Promise<Record<string, Record<string, TacticsLifetimeCounts>>> {
  const out: Record<string, Record<string, TacticsLifetimeCounts>> = {};
  const users = [...new Set(usernames.map((u) => u.trim().toLowerCase()).filter(Boolean))];
  const isoDays = [...new Set(days.map((d) => d.slice(0, 10)).filter(Boolean))];
  if (users.length === 0 || isoDays.length === 0) return out;
  const sb = client ?? supabaseFromEnv();
  if (!sb) return out;

  try {
    const { data, error } = await sb
      .from(TABLE)
      .select('username, day, attempt_count, passed_count, failed_count, total_seconds')
      .in('username', users)
      .in('day', isoDays);
    if (error) {
      // Tablo henüz oluşturulmamış olabilir
      console.warn('[tactics-lifetime] load:', error.message);
      return out;
    }
    for (const row of data ?? []) {
      const user = String((row as { username: string }).username).toLowerCase();
      const day = String((row as { day: string }).day).slice(0, 10);
      (out[user] ??= {})[day] = {
        attemptCount: Number((row as { attempt_count: number }).attempt_count) || 0,
        passedCount: Number((row as { passed_count: number }).passed_count) || 0,
        failedCount: Number((row as { failed_count: number }).failed_count) || 0,
        totalSeconds: Number((row as { total_seconds: number }).total_seconds) || 0,
      };
    }
  } catch (e) {
    console.warn('[tactics-lifetime] load failed:', e);
  }
  return out;
}

export async function saveTacticsLifetimeSnapshots(
  rows: Array<{ username: string; day: string; counts: TacticsLifetimeCounts }>,
  client?: SupabaseClient | null,
): Promise<void> {
  if (rows.length === 0) return;
  const sb = client ?? supabaseFromEnv();
  if (!sb) return;
  const payload = rows.map((r) => ({
    username: r.username.trim().toLowerCase(),
    day: r.day.slice(0, 10),
    attempt_count: Math.max(0, Math.round(r.counts.attemptCount)),
    passed_count: Math.max(0, Math.round(r.counts.passedCount)),
    failed_count: Math.max(0, Math.round(r.counts.failedCount)),
    total_seconds: Math.max(0, Math.round(r.counts.totalSeconds ?? 0)),
    updated_at: new Date().toISOString(),
  })).filter((r) => r.username && r.day);
  if (payload.length === 0) return;
  try {
    const { error } = await sb.from(TABLE).upsert(payload, { onConflict: 'username,day' });
    if (error) console.warn('[tactics-lifetime] save:', error.message);
  } catch (e) {
    console.warn('[tactics-lifetime] save failed:', e);
  }
}

export function dayPuzzleStatsFromLifetimeDelta(
  opening: TacticsLifetimeCounts | null | undefined,
  closing: TacticsLifetimeCounts | null | undefined,
): DayPuzzleStats {
  if (!opening || !closing) return { count: 0, passed: 0, failed: 0 };
  const passed = Math.max(0, closing.passedCount - opening.passedCount);
  const failed = Math.max(0, closing.failedCount - opening.failedCount);
  const count = Math.max(
    Math.max(0, closing.attemptCount - opening.attemptCount),
    passed + failed,
  );
  if (count > MAX_PLAUSIBLE_DAILY_PUZZLES || passed > MAX_PLAUSIBLE_DAILY_PUZZLES) {
    return { count: 0, passed: 0, failed: 0 };
  }
  if (opening.attemptCount === 0 && closing.attemptCount > MAX_PLAUSIBLE_DAILY_PUZZLES) {
    return { count: 0, passed: 0, failed: 0 };
  }
  return { count, passed, failed };
}

export function enrichChessComPuzzlesWithLifetime(
  listStats: DayPuzzleStats,
  opening: TacticsLifetimeCounts | null | undefined,
  closing: TacticsLifetimeCounts | null | undefined,
): DayPuzzleStats {
  return preferRicherChessComDayStats(
    listStats,
    dayPuzzleStatsFromLifetimeDelta(opening, closing),
  );
}
