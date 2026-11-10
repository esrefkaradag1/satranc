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

export type RemoteLeaderboardMonthOption = {
  periodStartMs: number;
  /** Örn. "Ekim 2026" */
  label: string;
  cachedAt: number;
};

/**
 * Bu kulüp + sıralama modu için arşivlenmiş (geçmiş dahil) aylık snapshot'ların listesi —
 * "geçmiş ay raporu al" seçicisini doldurmak için. Her ay kendi `snapshot_key`'i altında
 * saklandığından (bkz. leaderboardSnapshotKey) bir sonraki ayın yazması eskisini silmez;
 * bu liste o yüzden doğal bir arşiv görevi görür.
 */
export async function listRemoteLeaderboardMonths(
  clubScope: string,
  rankMode: LeaderboardRankMode,
): Promise<RemoteLeaderboardMonthOption[]> {
  const sb = readClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from(TABLE)
      .select('period_start_ms, cached_at, club_scope')
      .eq('period', 'month')
      .eq('rank_mode', rankMode)
      .order('period_start_ms', { ascending: false })
      .limit(60);
    if (error || !data?.length) return [];

    const scoped = data.filter((row) => String((row as { club_scope?: string }).club_scope ?? '') === clubScope);
    const rows = scoped.length > 0 ? scoped : data;

    const byMonth = new Map<number, number>();
    for (const row of rows) {
      const periodStartMs = Number((row as { period_start_ms?: unknown }).period_start_ms);
      if (!Number.isFinite(periodStartMs)) continue;
      const cachedAt = parseCachedAt((row as { cached_at?: unknown }).cached_at);
      const prev = byMonth.get(periodStartMs);
      if (prev === undefined || cachedAt > prev) byMonth.set(periodStartMs, cachedAt);
    }

    return Array.from(byMonth.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([periodStartMs, cachedAt]) => ({
        periodStartMs,
        cachedAt,
        label: new Date(periodStartMs).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
      }));
  } catch (e) {
    console.warn('[leaderboard] listRemoteLeaderboardMonths failed:', e);
    return [];
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
