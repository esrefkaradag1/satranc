import type { HomeworkAssignment, HomeworkPuzzleAttempt, Student, StudentDailyTarget } from '../types';
import {
  dedupeChessComPuzzleAttempts,
  selectHomeworkGoalPuzzles,
  type ChessComPuzzleTab,
  type ChessComPuzzleAttempt,
} from '../lib/chesscomPuzzleParse';
import {
  fetchChessComDailyPuzzleStats,
  fetchChessComGamesForDay,
  fetchChessComPuzzlesBundle,
  fetchLichessDayStats,
  fetchLichessGamesForDay,
  type LichessGame,
} from '../services/chessPlatformService';
import { timestampMatchesDay } from './homeworkDayUtils';
import { weekdayKeyFromIso } from './homeworkDayUtils';

export type PlatformDayStats = {
  games: number;
  puzzleSolved: number;
  puzzlePassed: number;
  puzzleFailed: number;
  lichessGames: number;
  lichessPuzzles: number;
  lichessPuzzlePassed: number;
  lichessPuzzleFailed: number;
  chessComGames: number;
  chessComPuzzles: number;
  chessComPuzzlePassed: number;
  chessComPuzzleFailed: number;
  lichessError?: boolean;
  chessComError?: boolean;
};

export async function fetchStudentPlatformDayStats(
  student: Student,
  dayIso: string,
): Promise<PlatformDayStats> {
  const lichessUsername = student.lichessUsername?.trim();
  const chessComUsername = student.chessComUsername?.trim();

  let lichessDay = { games: 0, puzzles: { count: 0, passed: 0, failed: 0 }, activityRateLimited: false };
  let lichessError = false;
  let chessComGames = 0;
  let chessComPuzzles = { count: 0, passed: 0, failed: 0 };
  let chessComError = false;

  if (lichessUsername) {
    try {
      lichessDay = await fetchLichessDayStats(lichessUsername, dayIso);
      if (lichessDay.activityRateLimited) lichessError = true;
    } catch {
      lichessError = true;
    }
  }

  if (chessComUsername) {
    try {
      const [games, puzzles] = await Promise.all([
        fetchChessComGamesForDay(chessComUsername, dayIso),
        fetchChessComDailyPuzzleStats(chessComUsername, dayIso),
      ]);
      chessComGames = games;
      chessComPuzzles = puzzles;
    } catch {
      chessComError = true;
    }
  }

  return {
    games: lichessDay.games + chessComGames,
    puzzleSolved: (lichessDay.puzzles.count ?? 0) + (chessComPuzzles.count ?? 0),
    puzzlePassed: (lichessDay.puzzles.passed ?? 0) + (chessComPuzzles.passed ?? 0),
    puzzleFailed: (lichessDay.puzzles.failed ?? 0) + (chessComPuzzles.failed ?? 0),
    lichessGames: lichessDay.games,
    lichessPuzzles: lichessDay.puzzles.count ?? 0,
    lichessPuzzlePassed: lichessDay.puzzles.passed ?? 0,
    lichessPuzzleFailed: lichessDay.puzzles.failed ?? 0,
    chessComGames,
    chessComPuzzles: chessComPuzzles.count ?? 0,
    chessComPuzzlePassed: chessComPuzzles.passed ?? 0,
    chessComPuzzleFailed: chessComPuzzles.failed ?? 0,
    lichessError: lichessUsername ? lichessError : undefined,
    chessComError: chessComUsername ? chessComError : undefined,
  };
}

export function resolveDayTargets(
  draft: StudentDailyTarget | undefined,
  hw: HomeworkAssignment,
  weekday: number,
): { gameTarget: number; puzzleTarget: number; minAccuracy: number } {
  const dayData = draft?.weeklySchedule?.[weekday];
  return {
    gameTarget: Math.max(0, dayData?.dailyGameTarget ?? draft?.dailyGameTarget ?? hw.dailyGameTarget ?? 0),
    puzzleTarget: Math.max(0, dayData?.dailyPuzzleTarget ?? draft?.dailyPuzzleTarget ?? hw.dailyPuzzleTarget ?? 0),
    minAccuracy: Math.max(
      0,
      Math.min(100, dayData?.minPuzzleAccuracyPct ?? draft?.minPuzzleAccuracyPct ?? hw.minPuzzleAccuracyPct ?? 60),
    ),
  };
}

export function evaluateDayGoals(
  gameTarget: number,
  puzzleTarget: number,
  minAccuracy: number,
  platform: PlatformDayStats | undefined,
  internalAttempts: HomeworkPuzzleAttempt[],
): { gamesMet: boolean; puzzlesMet: boolean; done: boolean; puzzleSolved: number; puzzleAccuracy: number } {
  const internalSolved = internalAttempts.length;
  const internalCorrect = internalAttempts.filter((a) => a.correct).length;
  const puzzleSolved = internalSolved + (platform?.puzzleSolved ?? 0);
  const puzzleCorrect = internalCorrect + (platform?.puzzlePassed ?? 0);
  const puzzleAccuracy = puzzleSolved > 0 ? (puzzleCorrect / puzzleSolved) * 100 : 0;
  const gamesMet = gameTarget <= 0 || (platform?.games ?? 0) >= gameTarget;
  const puzzlesMet = puzzleTarget <= 0 || (puzzleSolved >= puzzleTarget && puzzleAccuracy >= minAccuracy);
  return {
    gamesMet,
    puzzlesMet,
    done: gamesMet && puzzlesMet,
    puzzleSolved,
    puzzleAccuracy,
  };
}

export function weekdayFromIso(iso: string): number {
  return weekdayKeyFromIso(iso);
}

export function puzzleAttemptMatchesDay(isoDate: string | undefined, dayIso: string): boolean {
  if (!isoDate?.trim()) return false;
  try {
    const ms = new Date(isoDate).getTime();
    if (!Number.isFinite(ms)) return false;
    return timestampMatchesDay(ms, dayIso);
  } catch {
    return false;
  }
}

export type PlatformChessComPuzzleRow = {
  source: 'chesscom';
  tab: ChessComPuzzleTab;
  attempt: ChessComPuzzleAttempt;
};

/** Günlük ödev hedefi: yalnızca Chess.com puanlı bulmacalar sayılır. */
export const HOMEWORK_CHESSCOM_PUZZLE_TABS: ChessComPuzzleTab[] = ['rated'];

export function chessComAttemptsForHomeworkDay(
  bundle: { rated: ChessComPuzzleAttempt[]; learning: ChessComPuzzleAttempt[]; rush: ChessComPuzzleAttempt[] },
  dayIso: string,
  tabs: ChessComPuzzleTab[] = HOMEWORK_CHESSCOM_PUZZLE_TABS,
): ChessComPuzzleAttempt[] {
  const lists: Record<ChessComPuzzleTab, ChessComPuzzleAttempt[]> = {
    rated: bundle.rated,
    learning: bundle.learning,
    rush: bundle.rush,
  };
  const merged: ChessComPuzzleAttempt[] = [];
  for (const tab of tabs) {
    for (const attempt of lists[tab]) {
      if (puzzleAttemptMatchesDay(attempt.date, dayIso)) merged.push(attempt);
    }
  }
  return dedupeChessComPuzzleAttempts(merged);
}

export async function fetchChessComPuzzlesForDay(
  username: string,
  dayIso: string,
  opts?: { tabs?: ChessComPuzzleTab[] },
): Promise<PlatformChessComPuzzleRow[]> {
  const bundle = await fetchChessComPuzzlesBundle(username);
  if (!bundle) return [];
  const tabs = opts?.tabs ?? HOMEWORK_CHESSCOM_PUZZLE_TABS;
  const unique = chessComAttemptsForHomeworkDay(bundle, dayIso, tabs);
  const tabById = new Map<number, ChessComPuzzleTab>();
  const lists: Record<ChessComPuzzleTab, ChessComPuzzleAttempt[]> = {
    rated: bundle.rated,
    learning: bundle.learning,
    rush: bundle.rush,
  };
  for (const tab of tabs) {
    for (const attempt of lists[tab]) {
      if (!puzzleAttemptMatchesDay(attempt.date, dayIso)) continue;
      if (!tabById.has(attempt.id)) tabById.set(attempt.id, tab);
    }
  }
  return unique.map((attempt) => ({
    source: 'chesscom' as const,
    tab: tabById.get(attempt.id) ?? 'rated',
    attempt,
  }));
}

function lichessGameDurationSeconds(game: LichessGame): number {
  const start = game.createdAt;
  const end = game.lastMoveAt ?? start;
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end - start) / 1000));
}

/** Ödev hedefi kadar platform aktivitesinin toplam süresi (sn). */
export async function fetchStudentPlatformActivityTimeSeconds(
  student: Student,
  dayIso: string,
  opts?: { puzzleTarget?: number; gameTarget?: number },
): Promise<number> {
  const puzzleTarget = Math.max(0, opts?.puzzleTarget ?? 0);
  const gameTarget = Math.max(0, opts?.gameTarget ?? 0);
  let total = 0;

  const chessComUsername = student.chessComUsername?.trim().toLowerCase();
  if (chessComUsername && puzzleTarget > 0) {
    try {
      const rows = await fetchChessComPuzzlesForDay(chessComUsername, dayIso);
      const goal = selectHomeworkGoalPuzzles(rows.map((r) => r.attempt), puzzleTarget);
      total += goal.reduce((sum, a) => sum + Math.max(0, a.myTimeSec ?? 0), 0);
    } catch {
      /* platform süresi atlanır */
    }
  }

  const lichessUsername = student.lichessUsername?.trim();
  if (lichessUsername && gameTarget > 0) {
    try {
      const games = await fetchLichessGamesForDay(lichessUsername, dayIso);
      total += games
        .slice(0, gameTarget)
        .reduce((sum, g) => sum + lichessGameDurationSeconds(g), 0);
    } catch {
      /* platform süresi atlanır */
    }
  }

  return total;
}

export function capDailyPuzzleDisplay(
  correct: number,
  wrong: number,
  puzzleTarget: number,
): { correct: number; wrong: number } {
  if (puzzleTarget <= 0) return { correct, wrong };
  const cappedCorrect = Math.min(correct, puzzleTarget);
  const remainingSlots = Math.max(0, puzzleTarget - cappedCorrect);
  const cappedWrong = Math.min(wrong, remainingSlots);
  return { correct: cappedCorrect, wrong: cappedWrong };
}

export function platformSyncSummary(stats: PlatformDayStats | undefined, student: Student): string | null {
  if (!stats) return null;
  const parts: string[] = [];
  if (student.lichessUsername?.trim()) {
    parts.push(stats.lichessError
      ? 'Lichess: erişilemiyor'
      : `Lichess: ${stats.lichessGames} maç, ${stats.lichessPuzzles} bulmaca`);
  }
  if (student.chessComUsername?.trim()) {
    parts.push(stats.chessComError
      ? 'Chess.com: erişilemiyor'
      : `Chess.com: ${stats.chessComGames} maç, ${stats.chessComPuzzles} puanlı bulmaca`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
