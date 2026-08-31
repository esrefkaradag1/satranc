import {
  type GameResultsByMode,
  emptyGameResultsByMode,
} from './leaderboardPointSettings';

export type CachedStudentPeriodStats = {
  puzzles: number;
  puzzleWrong: number;
  games: number;
  internalPuzzles: number;
  wins: number;
  draws: number;
  losses: number;
  gameResultsByMode: GameResultsByMode;
  cachedAt: number;
};

type CacheFile = {
  version: 1;
  entries: Record<string, CachedStudentPeriodStats>;
};

const STORAGE_KEY = 'netchess_leaderboard_period_v1';
/** Haftalık dönem boyunca sakla (8 gün tampon). */
const CACHE_TTL_MS = 8 * 24 * 60 * 60 * 1000;

/** Dönem anahtarı — yalnızca başlangıç (endMs her gün değiştiği için dahil edilmez). */
function periodCacheKey(bounds: { startMs: number }): string {
  return String(bounds.startMs);
}

function readFile(): CacheFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, entries: {} };
    const parsed = JSON.parse(raw) as CacheFile;
    if (!parsed || parsed.version !== 1 || typeof parsed.entries !== 'object') {
      return { version: 1, entries: {} };
    }
    const migrated = migrateLegacyPeriodKeys(parsed.entries);
    if (migrated !== parsed.entries) {
      writeFile({ version: 1, entries: migrated });
    }
    return { version: 1, entries: migrated };
  } catch {
    return { version: 1, entries: {} };
  }
}

/** Eski anahtarlar `startMs:endMs|studentId` idi; endMs her gün değiştiği için birleştir. */
function migrateLegacyPeriodKeys(
  entries: Record<string, CachedStudentPeriodStats>,
): Record<string, CachedStudentPeriodStats> {
  let changed = false;
  const out: Record<string, CachedStudentPeriodStats> = { ...entries };
  for (const [key, value] of Object.entries(entries)) {
    const pipe = key.indexOf('|');
    if (pipe === -1) continue;
    const periodKey = key.slice(0, pipe);
    const studentId = key.slice(pipe + 1);
    const colon = periodKey.indexOf(':');
    if (colon === -1) continue;
    const startMs = periodKey.slice(0, colon);
    if (!startMs || !studentId) continue;
    const newKey = entryKey(startMs, studentId);
    if (newKey === key) continue;
    const existing = out[newKey];
    out[newKey] = existing
      ? { ...mergePeriodStatsMax(existing, value), cachedAt: Math.max(existing.cachedAt, value.cachedAt) }
      : value;
    delete out[key];
    changed = true;
  }
  return changed ? out : entries;
}

function writeFile(file: CacheFile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  } catch {
    /* quota / private mode */
  }
}

function entryKey(periodKey: string, studentId: string): string {
  return `${periodKey}|${studentId}`;
}

function mergeGameResultsByMode(a: GameResultsByMode, b: GameResultsByMode): GameResultsByMode {
  const out = emptyGameResultsByMode();
  for (const mode of Object.keys(out) as (keyof GameResultsByMode)[]) {
    out[mode] = {
      wins: Math.max(a[mode].wins, b[mode].wins),
      draws: Math.max(a[mode].draws, b[mode].draws),
      losses: Math.max(a[mode].losses, b[mode].losses),
    };
  }
  return out;
}

/** Dönem içinde puanlar geriye gitmesin — API boş dönse bile son bilinen değer korunur. */
export function mergePeriodStatsMax(
  prev: Omit<CachedStudentPeriodStats, 'cachedAt'>,
  next: Omit<CachedStudentPeriodStats, 'cachedAt'>,
): Omit<CachedStudentPeriodStats, 'cachedAt'> {
  return {
    puzzles: Math.max(prev.puzzles, next.puzzles),
    puzzleWrong: Math.max(prev.puzzleWrong, next.puzzleWrong),
    games: Math.max(prev.games, next.games),
    internalPuzzles: Math.max(prev.internalPuzzles, next.internalPuzzles),
    wins: Math.max(prev.wins, next.wins),
    draws: Math.max(prev.draws, next.draws),
    losses: Math.max(prev.losses, next.losses),
    gameResultsByMode: mergeGameResultsByMode(prev.gameResultsByMode, next.gameResultsByMode),
  };
}

export function readCachedStudentPeriodStats(
  studentId: string,
  bounds: { startMs: number; endMs: number },
): CachedStudentPeriodStats | null {
  if (!studentId.trim()) return null;
  const periodKey = periodCacheKey(bounds);
  const hit = readFile().entries[entryKey(periodKey, studentId)];
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > CACHE_TTL_MS) return null;
  return hit;
}

export function writeCachedStudentPeriodStats(
  studentId: string,
  bounds: { startMs: number; endMs: number },
  stats: Omit<CachedStudentPeriodStats, 'cachedAt'>,
) {
  if (!studentId.trim()) return;
  const periodKey = periodCacheKey(bounds);
  const file = readFile();
  const key = entryKey(periodKey, studentId);
  const existing = file.entries[key];
  const merged = existing
    ? mergePeriodStatsMax(existing, stats)
    : stats;
  file.entries[key] = {
    ...merged,
    cachedAt: Date.now(),
  };
  writeFile(file);
}

export function pruneLeaderboardPeriodCache(maxAgeMs = 21 * 24 * 60 * 60 * 1000) {
  const file = readFile();
  const now = Date.now();
  let changed = false;
  for (const [key, value] of Object.entries(file.entries)) {
    if (now - value.cachedAt > maxAgeMs) {
      delete file.entries[key];
      changed = true;
    }
  }
  if (changed) writeFile(file);
}

export function emptyCachedStudentPeriodStats(): Omit<CachedStudentPeriodStats, 'cachedAt'> {
  return {
    puzzles: 0,
    puzzleWrong: 0,
    games: 0,
    internalPuzzles: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    gameResultsByMode: emptyGameResultsByMode(),
  };
}
