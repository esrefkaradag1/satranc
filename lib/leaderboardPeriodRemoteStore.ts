import { getServiceSupabase, isSupabaseBackend, supabase } from '../services/supabase';
import type { LeaderboardPeriod } from './leaderboardUtils';
import {
  type CachedStudentPeriodStats,
  mergePeriodStatsMax,
} from './leaderboardPeriodCache';
import { emptyGameResultsByMode, type GameResultsByMode } from './leaderboardPointSettings';
import { istanbulDayKey } from './homeworkDayUtils';

const TABLE = 'leaderboard_period_stats';
const REMOTE_FRESH_MS = 6 * 60 * 60 * 1000;

function client() {
  if (!isSupabaseBackend()) return null;
  return getServiceSupabase() ?? supabase;
}

function asModeMap(raw: unknown): GameResultsByMode {
  const out = emptyGameResultsByMode();
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, { wins?: number; draws?: number; losses?: number }>;
  for (const mode of Object.keys(out) as (keyof GameResultsByMode)[]) {
    const row = src[mode];
    if (!row) continue;
    out[mode] = {
      wins: Math.max(0, Number(row.wins) || 0),
      draws: Math.max(0, Number(row.draws) || 0),
      losses: Math.max(0, Number(row.losses) || 0),
    };
  }
  return out;
}

function rowToStats(row: Record<string, unknown>): CachedStudentPeriodStats {
  return {
    puzzles: Math.max(0, Number(row.puzzles) || 0),
    puzzleWrong: Math.max(0, Number(row.puzzle_wrong) || 0),
    games: Math.max(0, Number(row.games) || 0),
    internalPuzzles: Math.max(0, Number(row.internal_puzzles) || 0),
    wins: Math.max(0, Number(row.wins) || 0),
    draws: Math.max(0, Number(row.draws) || 0),
    losses: Math.max(0, Number(row.losses) || 0),
    gameResultsByMode: asModeMap(row.game_results_by_mode),
    cachedAt: Date.parse(String(row.fetched_at ?? row.updated_at ?? '')) || Date.now(),
  };
}

export function isRemotePeriodStatsFresh(cachedAt: number, now = Date.now()): boolean {
  return cachedAt > 0 && now - cachedAt < REMOTE_FRESH_MS;
}

/** İstanbul takvim gününde bir kez çekilmiş mi? */
export function wasHarvestedToday(cachedAt: number | null | undefined, now = new Date()): boolean {
  if (!cachedAt || cachedAt <= 0) return false;
  return istanbulDayKey(new Date(cachedAt)) === istanbulDayKey(now);
}

export async function loadRemotePeriodStats(
  studentIds: string[],
  period: LeaderboardPeriod,
  periodStartMs: number,
): Promise<Map<string, CachedStudentPeriodStats>> {
  const out = new Map<string, CachedStudentPeriodStats>();
  const ids = [...new Set(studentIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  const sb = client();
  if (!sb || ids.length === 0) return out;

  try {
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .eq('period', period)
      .eq('period_start_ms', periodStartMs)
      .in('student_id', ids);
    if (error || !data?.length) return out;
    for (const row of data as Record<string, unknown>[]) {
      const id = String(row.student_id ?? '').trim();
      if (!id) continue;
      out.set(id, rowToStats(row));
    }
  } catch (e) {
    console.warn('[leaderboard] period stats load failed:', e);
  }
  return out;
}

export async function saveRemotePeriodStats(
  studentId: string,
  period: LeaderboardPeriod,
  periodStartMs: number,
  stats: Omit<CachedStudentPeriodStats, 'cachedAt'>,
): Promise<void> {
  const id = studentId.trim();
  const sb = client();
  if (!sb || !id) return;

  try {
    const existing = await sb
      .from(TABLE)
      .select('*')
      .eq('student_id', id)
      .eq('period', period)
      .eq('period_start_ms', periodStartMs)
      .maybeSingle();
    const prev = existing.data ? rowToStats(existing.data as Record<string, unknown>) : null;
    const merged = prev ? mergePeriodStatsMax(prev, stats) : stats;
    const { error } = await sb.from(TABLE).upsert(
      {
        student_id: id,
        period,
        period_start_ms: periodStartMs,
        puzzles: merged.puzzles,
        puzzle_wrong: merged.puzzleWrong,
        games: merged.games,
        internal_puzzles: merged.internalPuzzles,
        wins: merged.wins,
        draws: merged.draws,
        losses: merged.losses,
        game_results_by_mode: merged.gameResultsByMode,
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,period,period_start_ms' },
    );
    if (error) console.warn('[leaderboard] period stats save failed:', error.message);
  } catch (e) {
    console.warn('[leaderboard] period stats save failed:', e);
  }
}
