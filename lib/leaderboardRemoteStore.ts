import { getServiceSupabase, isSupabaseBackend, supabase } from '../services/supabase';
import type { LeaderboardEntry, LeaderboardPeriod, LeaderboardRankMode } from './leaderboardUtils';
import { entriesHaveActivity } from './leaderboardSnapshotCache';

const TABLE = 'leaderboard_snapshots';

export type RemoteLeaderboardSnapshot = {
  snapshotKey: string;
  entries: LeaderboardEntry[];
  cachedAt: number;
  peerCount: number;
};

function readClient() {
  if (!isSupabaseBackend()) return null;
  return getServiceSupabase() ?? supabase;
}

function writeClient() {
  if (!isSupabaseBackend()) return null;
  return getServiceSupabase() ?? supabase;
}

function parseCachedAt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const t = Date.parse(String(value ?? ''));
  return Number.isFinite(t) ? t : 0;
}

function rowToSnapshot(row: Record<string, unknown>): RemoteLeaderboardSnapshot | null {
  const entries = Array.isArray(row.entries) ? (row.entries as LeaderboardEntry[]) : [];
  if (entries.length === 0) return null;
  return {
    snapshotKey: String(row.snapshot_key ?? ''),
    entries,
    cachedAt: parseCachedAt(row.cached_at),
    peerCount: Number(row.peer_count) || entries.length,
  };
}

export async function loadRemoteLeaderboardSnapshot(opts: {
  preferredKey: string;
  clubScope: string;
  period: LeaderboardPeriod;
  rankMode: LeaderboardRankMode;
  periodStartMs: number;
}): Promise<RemoteLeaderboardSnapshot | null> {
  const sb = readClient();
  if (!sb) return null;

  try {
    if (opts.preferredKey) {
      const exact = await sb.from(TABLE).select('*').eq('snapshot_key', opts.preferredKey).maybeSingle();
      if (!exact.error && exact.data) {
        const parsed = rowToSnapshot(exact.data as Record<string, unknown>);
        if (parsed) return parsed;
      }
    }

    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .eq('period', opts.period)
      .eq('rank_mode', opts.rankMode)
      .eq('period_start_ms', opts.periodStartMs)
      .order('cached_at', { ascending: false })
      .limit(8);

    if (error || !data?.length) return null;

    const scoped = data.find((row) => String((row as { club_scope?: string }).club_scope ?? '') === opts.clubScope);
    const chosen = scoped ?? data[0];
    return rowToSnapshot(chosen as Record<string, unknown>);
  } catch (e) {
    console.warn('[leaderboard] remote load failed:', e);
    return null;
  }
}

export async function saveRemoteLeaderboardSnapshot(opts: {
  snapshotKey: string;
  clubScope: string;
  period: LeaderboardPeriod;
  rankMode: LeaderboardRankMode;
  periodStartMs: number;
  entries: LeaderboardEntry[];
  peerCount: number;
}): Promise<void> {
  if (!opts.snapshotKey || opts.entries.length === 0) return;
  if (!entriesHaveActivity(opts.entries)) return;
  const sb = writeClient();
  if (!sb) return;

  try {
    const { error } = await sb.from(TABLE).upsert(
      {
        snapshot_key: opts.snapshotKey,
        club_scope: opts.clubScope,
        period: opts.period,
        rank_mode: opts.rankMode,
        period_start_ms: opts.periodStartMs,
        entries: opts.entries,
        peer_count: opts.peerCount,
        cached_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'snapshot_key' },
    );
    if (error) console.warn('[leaderboard] remote save failed:', error.message);
  } catch (e) {
    console.warn('[leaderboard] remote save failed:', e);
  }
}
