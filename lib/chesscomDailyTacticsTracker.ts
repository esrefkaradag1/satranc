/** Chess.com günlük bulmaca sayımı — lifetime istatistik farkı (yeniden denemeler dahil). */

import type { DayPuzzleStats } from './platformWeekStatsDerive';
import { istanbulDayKey, shiftIstanbulDayKey } from './homeworkDayUtils';

export type TacticsLifetimeCounts = {
  attemptCount: number;
  passedCount: number;
  failedCount: number;
  totalSeconds: number;
};

type TrackerEntry = {
  day: string;
  opening: TacticsLifetimeCounts;
  closing: TacticsLifetimeCounts;
};

const STORAGE_KEY = 'chesscom_tactics_lifetime_v1';
const serverMemory = new Map<string, TrackerEntry>();

function clampCounts(value: TacticsLifetimeCounts): TacticsLifetimeCounts {
  return {
    attemptCount: Math.max(0, Math.round(value.attemptCount)),
    passedCount: Math.max(0, Math.round(value.passedCount)),
    failedCount: Math.max(0, Math.round(value.failedCount)),
    totalSeconds: Math.max(0, Math.round(value.totalSeconds ?? 0)),
  };
}

function subtractCounts(current: TacticsLifetimeCounts, opening: TacticsLifetimeCounts): DayPuzzleStats {
  const passed = Math.max(0, current.passedCount - opening.passedCount);
  const failed = Math.max(0, current.failedCount - opening.failedCount);
  const count = Math.max(
    Math.max(0, current.attemptCount - opening.attemptCount),
    passed + failed,
  );
  return { count, passed, failed };
}

function readStore(): Record<string, TrackerEntry> {
  if (typeof window === 'undefined') {
    const out: Record<string, TrackerEntry> = {};
    for (const [username, entry] of serverMemory.entries()) {
      out[username] = entry;
    }
    return out;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TrackerEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, TrackerEntry>): void {
  if (typeof window === 'undefined') {
    serverMemory.clear();
    for (const [username, entry] of Object.entries(store)) {
      serverMemory.set(username, entry);
    }
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode */
  }
}

export function tacticsLifetimeFromMemberStats(
  stats: { attemptCount?: number; passedCount?: number; failedCount?: number; totalSeconds?: number } | null | undefined,
): TacticsLifetimeCounts | null {
  if (!stats) return null;
  const attemptCount = Number(stats.attemptCount ?? 0);
  const passedCount = Number(stats.passedCount ?? 0);
  const failedCount = Number(stats.failedCount ?? 0);
  const totalSeconds = Number(stats.totalSeconds ?? 0);
  if (![attemptCount, passedCount, failedCount, totalSeconds].every((n) => Number.isFinite(n))) return null;
  return clampCounts({ attemptCount, passedCount, failedCount, totalSeconds });
}

export function chessComDailyTimeFromLifetimeTracker(
  username: string,
  day: string,
  current: TacticsLifetimeCounts,
): number {
  const entry = updateChessComTacticsTracker(username, day, current);
  return Math.max(0, entry.closing.totalSeconds - entry.opening.totalSeconds);
}

export function updateChessComTacticsTracker(
  username: string,
  day: string,
  current: TacticsLifetimeCounts,
): TrackerEntry {
  const trimmed = username.trim().toLowerCase();
  const targetDay = day.slice(0, 10);
  const store = readStore();
  const prev = store[trimmed];
  const yesterday = shiftIstanbulDayKey(targetDay, -1);
  const normalized = clampCounts(current);

  let opening: TacticsLifetimeCounts;
  if (prev?.day === targetDay) {
    opening = prev.opening;
  } else if (prev?.day === yesterday) {
    opening = prev.closing;
  } else {
    opening = normalized;
  }

  const entry: TrackerEntry = {
    day: targetDay,
    opening,
    closing: normalized,
  };
  store[trimmed] = entry;
  writeStore(store);
  return entry;
}

export function chessComDailyStatsFromLifetimeTracker(
  username: string,
  day: string,
  current: TacticsLifetimeCounts,
): DayPuzzleStats {
  const entry = updateChessComTacticsTracker(username, day, current);
  return subtractCounts(entry.closing, entry.opening);
}

export function preferRicherChessComDayStats(a: DayPuzzleStats, b: DayPuzzleStats): DayPuzzleStats {
  if (b.count > a.count) return b;
  if (a.count > b.count) return a;
  if (b.passed + b.failed > a.passed + a.failed) return b;
  return a;
}
