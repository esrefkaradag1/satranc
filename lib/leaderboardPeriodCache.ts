import { emptyGameResultsByMode } from './leaderboardPointSettings';

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
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function periodCacheKey(bounds: { startMs: number; endMs: number }): string {
  return `${bounds.startMs}:${bounds.endMs}`;
}

function readFile(): CacheFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, entries: {} };
    const parsed = JSON.parse(raw) as CacheFile;
    if (!parsed || parsed.version !== 1 || typeof parsed.entries !== 'object') {
      return { version: 1, entries: {} };
    }
    return parsed;
  } catch {
    return { version: 1, entries: {} };
  }
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
  file.entries[entryKey(periodKey, studentId)] = {
    ...stats,
    cachedAt: Date.now(),
  };
  writeFile(file);
}

export function pruneLeaderboardPeriodCache(maxAgeMs = 14 * 24 * 60 * 60 * 1000) {
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
