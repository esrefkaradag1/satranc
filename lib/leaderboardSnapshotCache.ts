import type { LeaderboardEntry, LeaderboardPeriod, LeaderboardRankMode } from './leaderboardUtils';
import type { LeaderboardPointSettings } from './leaderboardPointSettings';

const STORAGE_KEY = 'netchess_leaderboard_snapshot_v2';
const LEGACY_STORAGE_KEY = 'netchess_leaderboard_snapshot_v1';
/** Günlük otomatik yenileme saati (yerel saat). */
export const LEADERBOARD_DAILY_REFRESH_HOUR = 6;

type SnapshotRecord = {
  entries: LeaderboardEntry[];
  cachedAt: number;
  peerCount: number;
};

type SnapshotFile = {
  version: 2;
  snapshots: Record<string, SnapshotRecord>;
};

function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function entriesHaveActivity(entries: LeaderboardEntry[] | undefined): boolean {
  return !!entries?.some((e) => (e.puzzles ?? 0) > 0 || (e.games ?? 0) > 0 || (e.score ?? 0) > 0);
}

function readFile(): SnapshotFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SnapshotFile;
      if (parsed && parsed.version === 2 && typeof parsed.snapshots === 'object') {
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }

  // Eski v1 anahtarlarını mümkün olduğunca aktar
  try {
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) return { version: 2, snapshots: {} };
    const legacy = JSON.parse(legacyRaw) as { snapshots?: Record<string, SnapshotRecord> };
    const snapshots: Record<string, SnapshotRecord> = {};
    for (const [key, value] of Object.entries(legacy.snapshots ?? {})) {
      if (!value?.entries?.length) continue;
      // v1: periodStart|period|rankMode|settingsHash|peerHash
      const parts = key.split('|');
      if (parts.length >= 4) {
        const migratedKey = `legacy|${parts[0]}|${parts[1]}|${parts[2]}|${parts[3]}`;
        const existing = snapshots[migratedKey];
        if (!existing || (value.cachedAt ?? 0) >= (existing.cachedAt ?? 0)) {
          snapshots[migratedKey] = value;
        }
      }
    }
    const file: SnapshotFile = { version: 2, snapshots };
    writeFile(file);
    return file;
  } catch {
    return { version: 2, snapshots: {} };
  }
}

function writeFile(file: SnapshotFile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Snapshot anahtarı — öğrenci listesi hash'i YOK.
 * Peer listesi büyüdükçe / değiştikçe önbellek kaybolmasın.
 */
export function leaderboardSnapshotKey(opts: {
  clubScope: string;
  period: LeaderboardPeriod;
  rankMode: LeaderboardRankMode;
  periodStartMs: number;
  pointSettings: LeaderboardPointSettings;
}): string {
  const club = (opts.clubScope || 'club').trim().toLocaleLowerCase('tr-TR') || 'club';
  const settingsKey = simpleHash(JSON.stringify(opts.pointSettings));
  return `${club}|${opts.periodStartMs}|${opts.period}|${opts.rankMode}|${settingsKey}`;
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

/** Aynı dönem+mod için en güncel snapshot (kulüp anahtarı farklı olsa bile). */
export function findBestLeaderboardSnapshot(opts: {
  preferredKey: string;
  period: LeaderboardPeriod;
  rankMode: LeaderboardRankMode;
  periodStartMs: number;
}): SnapshotRecord | null {
  const preferred = readLeaderboardSnapshot(opts.preferredKey);
  if (preferred?.entries.length) return preferred;

  const file = readFile();
  let best: SnapshotRecord | null = null;
  for (const [key, value] of Object.entries(file.snapshots)) {
    if (!value?.entries?.length) continue;
    const parts = key.split('|');
    // club|periodStart|period|rankMode|settings  OR  legacy|periodStart|period|rankMode|settings
    const startIdx = key.startsWith('legacy|') ? 1 : 1;
    const periodStart = parts[startIdx];
    const period = parts[startIdx + 1];
    const rankMode = parts[startIdx + 2];
    if (periodStart !== String(opts.periodStartMs) || period !== opts.period || rankMode !== opts.rankMode) {
      continue;
    }
    if (!best || value.cachedAt > best.cachedAt) best = value;
  }
  return best;
}

/**
 * Snapshot yaz. Gelen tablo tamamen boş/sıfırsa ve eski kayıt anlamlıysa eskiyi koru.
 * (Caller zaten merge etmiş olmalı; bu ek güvenlik.)
 */
export function writeLeaderboardSnapshot(
  key: string,
  entries: LeaderboardEntry[],
  peerCount: number,
) {
  if (!key || entries.length === 0) return;
  const file = readFile();
  const existing = file.snapshots[key];

  if (!entriesHaveActivity(entries) && entriesHaveActivity(existing?.entries) && existing) {
    file.snapshots[key] = {
      ...existing,
      peerCount: Math.max(existing.peerCount, peerCount),
    };
    writeFile(file);
    return;
  }

  file.snapshots[key] = {
    entries,
    cachedAt: Date.now(),
    peerCount: Math.max(peerCount, existing?.peerCount ?? 0),
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
