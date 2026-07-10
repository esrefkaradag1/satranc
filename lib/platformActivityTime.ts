import type { ChessComPuzzleAttempt } from './chesscomPuzzleParse';
import type { ChessComGame, LichessGame } from '../services/chessPlatformService';
import { istanbulDayKey, timestampMatchesDay } from './homeworkDayUtils';
import {
  chessComGamesTimeSecondsForDay,
  lichessGameDurationSeconds,
} from './chesscomGameDuration';
import {
  chessComDailyTimeFromLifetimeTracker,
  type TacticsLifetimeCounts,
} from './chesscomDailyTacticsTracker';

function puzzleAttemptOnDay(isoDate: string | undefined, day: string): boolean {
  if (!isoDate?.trim()) return false;
  try {
    const ms = new Date(isoDate).getTime();
    if (!Number.isFinite(ms)) return false;
    const target = day.slice(0, 10);
    return timestampMatchesDay(ms, target) || istanbulDayKey(new Date(ms)) === target;
  } catch {
    return false;
  }
}

export function chessComPuzzleTimeSecondsForDay(
  attempts: ChessComPuzzleAttempt[],
  dayIso: string,
): number {
  const target = dayIso.slice(0, 10);
  return attempts
    .filter((a) => puzzleAttemptOnDay(a.date, target))
    .reduce((sum, a) => sum + Math.max(0, a.myTimeSec ?? 0), 0);
}

/** Lifetime/list eksik kaldığında günlük bulmaca sayısından süre tahmini. */
export function chessComPuzzleTimeEstimateForDay(
  attempts: ChessComPuzzleAttempt[],
  dayIso: string,
  dayAttemptCount: number,
): number {
  if (dayAttemptCount <= 0) return 0;
  const target = dayIso.slice(0, 10);
  const today = attempts.filter((a) => puzzleAttemptOnDay(a.date, target));
  const listTime = today.reduce((sum, a) => sum + Math.max(0, a.myTimeSec ?? 0), 0);
  if (today.length === 0) {
    return Math.round(dayAttemptCount * 45);
  }
  const avgSec = today.reduce((sum, a) => {
    if ((a.myTimeSec ?? 0) > 0) return sum + a.myTimeSec;
    if ((a.avgTimeSec ?? 0) > 0) return sum + a.avgTimeSec;
    return sum + 45;
  }, 0) / today.length;
  if (today.length >= dayAttemptCount) {
    return Math.round(Math.max(listTime, dayAttemptCount * avgSec));
  }
  return Math.round(Math.max(listTime, dayAttemptCount * avgSec));
}

export function lichessGamesTimeSecondsForDay(games: LichessGame[]): number {
  return games.reduce((sum, g) => sum + lichessGameDurationSeconds(g), 0);
}

export function computeChessComActivityTimeSeconds(
  username: string,
  dayIso: string,
  ratedAttempts: ChessComPuzzleAttempt[],
  monthGames: ChessComGame[],
  lifetime: TacticsLifetimeCounts | null | undefined,
  dayPuzzleAttemptCount = 0,
): number {
  const games = chessComGamesTimeSecondsForDay(monthGames, username, dayIso);
  const listPuzzle = chessComPuzzleTimeSecondsForDay(ratedAttempts, dayIso);
  const lifetimePuzzle = lifetime
    ? chessComDailyTimeFromLifetimeTracker(username, dayIso, lifetime)
    : 0;
  const estimatedPuzzle = dayPuzzleAttemptCount > 0
    ? chessComPuzzleTimeEstimateForDay(ratedAttempts, dayIso, dayPuzzleAttemptCount)
    : 0;
  const puzzleTime = Math.max(listPuzzle, lifetimePuzzle, estimatedPuzzle);
  return games + puzzleTime;
}

/** Platform istatistiklerinden gösterilecek toplam süre (sn). */
export function resolvePlatformActivityTimeSeconds(
  platform: { activityTimeSeconds?: number; chessComPuzzlePassed?: number; chessComPuzzleFailed?: number; lichessPuzzlePassed?: number; lichessPuzzleFailed?: number } | undefined,
  storedSeconds: number | undefined,
): number {
  const stored = Math.max(0, storedSeconds ?? 0);
  const fromStats = Math.max(0, platform?.activityTimeSeconds ?? 0);
  const best = Math.max(stored, fromStats);
  if (best > 0) return best;
  if (!platform) return 0;
  const puzzleAttempts =
    (platform.chessComPuzzlePassed ?? 0)
    + (platform.chessComPuzzleFailed ?? 0)
    + (platform.lichessPuzzlePassed ?? 0)
    + (platform.lichessPuzzleFailed ?? 0);
  if (puzzleAttempts <= 0) return 0;
  return puzzleAttempts * 45;
}
