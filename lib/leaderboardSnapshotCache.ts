import type { LeaderboardEntry, LeaderboardPeriod, LeaderboardRankMode } from './leaderboardUtils';
import type { LeaderboardPointSettings } from './leaderboardPointSettings';

const STORAGE_KEY = 'netchess_leaderboard_snapshot_v1';
/** Günlük otomatik yenileme saati (yerel saat). */
export const LEADERBOARD_DAILY_REFRESH_HOUR = 6;

type SnapshotRecord = {
  entries: LeaderboardEntry[];
  cachedAt: number;
  peerCount: number;
};

type SnapshotFile = {
  version: 1;
  snapshots: Record<string, SnapshotRecord>;
};

function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function readFile(): SnapshotFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, snapshots: {} };
    const parsed = JSON.parse(raw) as SnapshotFile;
    if (!parsed || parsed.version !== 1 || typeof parsed.snapshots !== 'object') {
      return { version: 1, snapshots: {} };
    }
    return parsed;
  } catch {
    return { version: 1, snapshots: {} };
  }
}

function writeFile(file: SnapshotFile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  } catch {
    /* quota / private mode */
  }
}

export function leaderboardSnapshotKey(opts: {
  peerIds: string[];
  period: LeaderboardPeriod;
  rankMode: LeaderboardRankMode;
  periodStartMs: number;
  pointSettings: LeaderboardPointSettings;
}): string {
  const peers = [...opts.peerIds].sort().join(',');
  const settingsKey = simpleHash(JSON.stringify(opts.pointSettings));
  return `${opts.periodStartMs}|${opts.period}|${opts.rankMode}|${settingsKey}|${simpleHash(peers)}`;
}

/** Son günlük yenileme eşiği (bugün 06:00 veya henüz gelmediyse dün 06:00). */
export function lastLeaderboardRefreshCutoffMs(ref = new Date()): number {
  const cutoff = new Date(ref);
  cutoff.setHours(LEADERBOARD_DAILY_REFRESH_HOUR, 0, 0, 0);
  if (ref.getTime() < cutoff.getTime()) {
    cutoff.setDate(cutoff.getDate() - 1);
  }
  return cutoff.getTime();
}

export function isLeaderboardSnapshotFresh(cachedAt: number, ref = new Date()): boolean {
  return cachedAt >= lastLeaderboardRefreshCutoffMs(ref);
}

export function msUntilNextLeaderboardDailyRefresh(ref = new Date()): number {
  const next = new Date(lastLeaderboardRefreshCutoffMs(ref));
  next.setDate(next.getDate() + 1);
  return Math.max(60_000, next.getTime() - ref.getTime());
}

export function readLeaderboardSnapshot(key: string): SnapshotRecord | null {
  if (!key) return null;
  const hit = readFile().snapshots[key];
  if (!hit || !Array.isArray(hit.entries)) return null;
  return hit;
}

export function writeLeaderboardSnapshot(
  key: string,
  entries: LeaderboardEntry[],
  peerCount: number,
) {
  if (!key || entries.length === 0) return;
  const file = readFile();
  file.snapshots[key] = {
    entries,
    cachedAt: Date.now(),
    peerCount,
  };
  const keys = Object.keys(file.snapshots);
  if (keys.length > 40) {
    keys
      .sort((a, b) => (file.snapshots[a]?.cachedAt ?? 0) - (file.snapshots[b]?.cachedAt ?? 0))
      .slice(0, keys.length - 40)
      .forEach((k) => delete file.snapshots[k]);
  }
  writeFile(file);
}

export function formatLeaderboardSnapshotAge(cachedAt: number, ref = new Date()): string {
  const d = new Date(cachedAt);
  const sameDay =
    d.getDate() === ref.getDate()
    && d.getMonth() === ref.getMonth()
    && d.getFullYear() === ref.getFullYear();
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `bugün ${time}`;
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
