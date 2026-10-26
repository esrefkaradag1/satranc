import type { LeaderboardEntry, LeaderboardPeriod, LeaderboardRankMode } from './leaderboardUtils';
import type { LeaderboardPointSettings } from './leaderboardPointSettings';

const STORAGE_KEY = 'netchess_leaderboard_snapshot_v2';
const LEGACY_STORAGE_KEY = 'netchess_leaderboard_snapshot_v1';
/** Eski sabit (footer/metin uyumu). Yeni otomatik tarama 2 saatte bir. */
export const LEADERBOARD_DAILY_REFRESH_HOUR = 6;
/** Antrenör/admin tarayıcısında lider tablosu yenileme aralığı. */
export const LEADERBOARD_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

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

export function entriesHaveActivity(entries: LeaderboardEntry[] | undefined): boolean {
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
  return `${club}|${opts.periodStartMs}|${opts.period}|${opts.rankMode}|${settingsKey}|lg4`;
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
  const at = Number(cachedAt);
  if (!Number.isFinite(at) || at <= 0) return false;
  return ref.getTime() - at < LEADERBOARD_REFRESH_INTERVAL_MS;
}

export function msUntilNextLeaderboardDailyRefresh(ref = new Date()): number {
  return msUntilNextLeaderboardRefresh(null, ref);
}

export function msUntilNextLeaderboardRefresh(cachedAt: number | null, ref = new Date()): number {
  if (!cachedAt) return 5_000;
  const due = Number(cachedAt) + LEADERBOARD_REFRESH_INTERVAL_MS;
  const wait = due - ref.getTime();
  if (wait <= 0) return 5_000;
  return wait;
}

export function readLeaderboardSnapshot(key: string): SnapshotRecord | null {
  if (!key) return null;
  const hit = readFile().snapshots[key];
  if (!hit || !Array.isArray(hit.entries)) return null;
  return hit;
}

function snapshotKeyParts(key: string): { periodStart: string; period: string; rankMode: string } | null {
  const parts = key.split('|');
  // club|periodStart|period|rankMode|settings|lg4  OR  legacy|periodStart|period|rankMode|settings
  const startIdx = key.startsWith('legacy|') ? 1 : 1;
  const periodStart = parts[startIdx];
  const period = parts[startIdx + 1];
  const rankMode = parts[startIdx + 2];
  if (!periodStart || !period || !rankMode) return null;
  return { periodStart, period, rankMode };
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
  let exact: SnapshotRecord | null = null;
  let samePeriod: SnapshotRecord | null = null;
  for (const [key, value] of Object.entries(file.snapshots)) {
    if (!value?.entries?.length) continue;
    const parts = snapshotKeyParts(key);
    if (!parts) continue;
    if (parts.period !== opts.period || parts.rankMode !== opts.rankMode) continue;
    if (!samePeriod || value.cachedAt > samePeriod.cachedAt) samePeriod = value;
    if (parts.periodStart !== String(opts.periodStartMs)) continue;
    if (!exact || value.cachedAt > exact.cachedAt) exact = value;
  }
  return exact ?? samePeriod;
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
