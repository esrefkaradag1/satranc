import type { HomeworkAssignment, HomeworkPuzzleAttempt, Student, StudentDailyTarget } from '../types';
import type { HomeworkStudentStatus } from './homeworkAnalysisUtils';
import { countPerPuzzleResults } from './homeworkAnalysisUtils';
import {
  dedupeChessComPuzzleAttempts,
  type ChessComPuzzleTab,
  type ChessComPuzzleAttempt,
} from '../lib/chesscomPuzzleParse';
import {
  fetchChessComDailyPuzzleStats,
  fetchChessComGamesForDay,
  fetchChessComGamesListForDay,
  fetchChessComPuzzlesBundle,
  fetchLichessDayStats,
  fetchLichessGamesCountForDay,
  fetchLichessGamesForDay,
  type ChessComGame,
  type LichessGame,
} from '../services/chessPlatformService';
import { fetchLichessOAuthDayPuzzleStats, isStudentLichessOAuthConnected } from '../services/lichessOAuthClient';
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
      let oauthUsed = false;
      if (student.id?.trim() && isStudentLichessOAuthConnected(student)) {
        const oauth = await fetchLichessOAuthDayPuzzleStats(student.id, dayIso);
        if (oauth.connected) {
          oauthUsed = true;
          lichessDay = {
            games: 0,
            puzzles: { count: oauth.count, passed: oauth.passed, failed: oauth.failed },
            activityRateLimited: false,
          };
          try {
            lichessDay.games = await fetchLichessGamesCountForDay(lichessUsername, dayIso);
          } catch {
            lichessError = true;
          }
        }
      }
      if (!oauthUsed) {
        lichessDay = await fetchLichessDayStats(lichessUsername, dayIso);
        if (lichessDay.activityRateLimited) lichessError = true;
      }
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

export function homeworkAttemptsForDay(
  attempts: HomeworkPuzzleAttempt[],
  homeworkId: string,
  studentId: string,
  dayIso: string,
): HomeworkPuzzleAttempt[] {
  return attempts.filter(
    (a) =>
      a.homeworkId === homeworkId &&
      a.studentId === studentId &&
      puzzleAttemptMatchesDay(a.timestamp, dayIso),
  );
}

export function internalPuzzleCountsForDay(
  puzzleIds: string[],
  attempts: HomeworkPuzzleAttempt[],
): { passed: number; failed: number; solved: number } {
  const { correct, wrong } = countPerPuzzleResults(puzzleIds, attempts);
  return { passed: correct, failed: wrong, solved: correct + wrong };
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

export function resolvePlatformHomeworkStatus(opts: {
  hasTargets: boolean;
  done: boolean;
  hasActivity: boolean;
  dayClosed: boolean;
}): HomeworkStudentStatus {
  if (!opts.hasTargets) return 'Başlamadı';
  if (opts.done) return 'Tamamlandı';
  if (opts.dayClosed) return opts.hasActivity ? 'Kısmi yaptı' : 'Yapılmadı';
  if (opts.hasActivity) return 'Devam Ediyor';
  return 'Başlamadı';
}

/** Min doğruluk % yalnızca bulmaca hedefinde geçerlidir; maç hedefi yalnızca adet sayılır. */
export function minCorrectRequiredForPuzzleGoal(puzzleTarget: number, minAccuracy: number): number {
  if (puzzleTarget <= 0) return 0;
  if (minAccuracy <= 0) return 0;
  return Math.ceil(puzzleTarget * minAccuracy / 100);
}

/**
 * Bulmaca hedefi: en az puzzleTarget deneme + min doğruluk oranına göre yeterli doğru.
 * Örn. 20 bulmaca / %40 → 20 deneme ve en az 8 doğru.
 */
export function evaluatePuzzleGoalMet(
  puzzleTarget: number,
  minAccuracy: number,
  puzzleSolved: number,
  puzzlePassed: number,
): boolean {
  if (puzzleTarget <= 0) return true;
  if (puzzleSolved < puzzleTarget) return false;
  const minCorrect = minCorrectRequiredForPuzzleGoal(puzzleTarget, minAccuracy);
  if (minCorrect <= 0) return true;
  return puzzlePassed >= minCorrect;
}

export function evaluateDayGoals(
  gameTarget: number,
  puzzleTarget: number,
  minAccuracy: number,
  platform: PlatformDayStats | undefined,
  internalAttempts: HomeworkPuzzleAttempt[],
  homeworkPuzzleIds: string[] = [],
): { gamesMet: boolean; puzzlesMet: boolean; done: boolean; puzzleSolved: number; puzzleAccuracy: number; puzzlePassed: number; puzzleFailed: number } {
  const internal = homeworkPuzzleIds.length > 0
    ? internalPuzzleCountsForDay(homeworkPuzzleIds, internalAttempts)
    : {
        passed: internalAttempts.filter((a) => a.correct).length,
        failed: internalAttempts.filter((a) => !a.correct).length,
        solved: internalAttempts.length,
      };
  const puzzlePassed = internal.passed + (platform?.puzzlePassed ?? 0);
  const puzzleFailed = internal.failed + (platform?.puzzleFailed ?? 0);
  const puzzleSolved = internal.solved + (platform?.puzzleSolved ?? 0);
  const puzzleAccuracy = puzzleSolved > 0 ? (puzzlePassed / puzzleSolved) * 100 : 0;
  const gamesMet = gameTarget <= 0 || (platform?.games ?? 0) >= gameTarget;
  const puzzlesMet = evaluatePuzzleGoalMet(puzzleTarget, minAccuracy, puzzleSolved, puzzlePassed);
  return {
    gamesMet,
    puzzlesMet,
    done: gamesMet && puzzlesMet,
    puzzleSolved,
    puzzleAccuracy,
    puzzlePassed,
    puzzleFailed,
  };
}

/** Platform günlük hedefi — yalnızca Lichess/Chess.com sayıları (atanan ödev bulmacaları dahil değil). */
export function evaluatePlatformDayGoalsFromStats(
  gameTarget: number,
  puzzleTarget: number,
  minAccuracy: number,
  platform: PlatformDayStats | undefined,
): {
  gamesMet: boolean;
  puzzlesMet: boolean;
  done: boolean;
  puzzleAccuracy: number;
  puzzleSolved: number;
  puzzlePassed: number;
  puzzleFailed: number;
  games: number;
} {
  const games = platform?.games ?? 0;
  const puzzleSolved = platform?.puzzleSolved ?? 0;
  const puzzlePassed = platform?.puzzlePassed ?? 0;
  const puzzleFailed = platform?.puzzleFailed ?? 0;
  const base = evaluatePlatformDailyGoals(
    gameTarget,
    puzzleTarget,
    minAccuracy,
    games,
    puzzleSolved,
    puzzlePassed,
  );
  return {
    ...base,
    puzzleSolved,
    puzzlePassed,
    puzzleFailed,
    games,
  };
}

/** Yalnızca Lichess/Chess.com — öğretmen Günlük Program ve öğrenci paneli aynı mantık. */
export function evaluatePlatformDailyGoals(
  gameTarget: number,
  puzzleTarget: number,
  minAccuracy: number,
  games: number,
  puzzleSolved: number,
  puzzlePassed: number,
): { gamesMet: boolean; puzzlesMet: boolean; done: boolean; puzzleAccuracy: number } {
  const puzzleAccuracy = puzzleSolved > 0 ? (puzzlePassed / puzzleSolved) * 100 : 0;
  const gamesMet = gameTarget <= 0 || games >= gameTarget;
  const puzzlesMet = evaluatePuzzleGoalMet(puzzleTarget, minAccuracy, puzzleSolved, puzzlePassed);
  const hasTargets = gameTarget > 0 || puzzleTarget > 0;
  return {
    gamesMet,
    puzzlesMet,
    done: hasTargets && gamesMet && puzzlesMet,
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

function parseClockSeconds(raw: string | undefined): number | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const parts = value.split(':').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((num) => !Number.isFinite(num))) return null;
  if (nums.length === 2) {
    const [minutes, seconds] = nums;
    return Math.round(minutes * 60 + seconds);
  }
  const [hours, minutes, seconds] = nums;
  return Math.round(hours * 3600 + minutes * 60 + seconds);
}

function parseInitialTimeControlSeconds(raw: string | undefined): { initialSeconds: number; incrementSeconds: number } | null {
  const value = String(raw ?? '').trim();
  if (!value || value === '-' || value.includes('/')) return null;
  const [baseRaw, incrementRaw = '0'] = value.split('+');
  const base = Number(baseRaw);
  const increment = Number(incrementRaw);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(increment) || increment < 0) return null;
  return {
    initialSeconds: Math.round(base),
    incrementSeconds: Math.round(increment),
  };
}

function sumClockDurationsFromPgn(rawPgn: string | undefined, timeControl?: string): number {
  const pgn = String(rawPgn ?? '');
  if (!pgn.trim()) return 0;

  const emtMatches = [...pgn.matchAll(/\[%emt\s+([0-9:.]+)\]/gi)];
  if (emtMatches.length > 0) {
    return emtMatches.reduce((sum, match) => {
      const sec = parseClockSeconds(match[1]);
      return sum + Math.max(0, sec ?? 0);
    }, 0);
  }

  const clockMatches = [...pgn.matchAll(/\[%clk\s+([0-9:.]+)\]/gi)];
  if (clockMatches.length === 0) return 0;

  const tc = parseInitialTimeControlSeconds(timeControl);
  if (!tc) return 0;

  let prevWhite = tc.initialSeconds;
  let prevBlack = tc.initialSeconds;
  let total = 0;
  clockMatches.forEach((match, index) => {
    const remaining = parseClockSeconds(match[1]);
    if (remaining == null) return;
    if (index % 2 === 0) {
      total += Math.max(0, prevWhite + tc.incrementSeconds - remaining);
      prevWhite = remaining;
    } else {
      total += Math.max(0, prevBlack + tc.incrementSeconds - remaining);
      prevBlack = remaining;
    }
  });
  return total;
}

function chessComGameDurationSeconds(game: ChessComGame): number {
  const headerTimeControl = game.pgn?.match(/\[TimeControl\s+"([^"]+)"\]/i)?.[1];
  return sumClockDurationsFromPgn(game.pgn, headerTimeControl ?? game.time_control);
}

/** Gün boyu tüm platform aktivitesinin toplam süresi (sn). */
export async function fetchStudentPlatformActivityTimeSeconds(
  student: Student,
  dayIso: string,
): Promise<number> {
  let total = 0;

  const chessComUsername = student.chessComUsername?.trim().toLowerCase();
  if (chessComUsername) {
    try {
      const rows = await fetchChessComPuzzlesForDay(chessComUsername, dayIso, {
        tabs: ['rated', 'learning', 'rush'],
      });
      total += rows.reduce((sum, row) => sum + Math.max(0, row.attempt.myTimeSec ?? 0), 0);
    } catch {
      /* platform süresi atlanır */
    }

    try {
      const games = await fetchChessComGamesListForDay(chessComUsername, dayIso);
      total += games.reduce((sum, game) => sum + chessComGameDurationSeconds(game), 0);
    } catch {
      /* platform süresi atlanır */
    }
  }

  const lichessUsername = student.lichessUsername?.trim();
  if (lichessUsername) {
    try {
      const games = await fetchLichessGamesForDay(lichessUsername, dayIso);
      total += games.reduce((sum, g) => sum + lichessGameDurationSeconds(g), 0);
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
  return {
    correct: Math.min(correct, puzzleTarget),
    wrong,
  };
}

/** Rate limit veya geçici hata sonrası daha düşük sayıların iyi verinin üzerine yazılmasını önler. */
export function mergePlatformDayStats(
  prev: PlatformDayStats | undefined,
  next: PlatformDayStats,
): PlatformDayStats {
  if (!prev) return { ...next };

  const lichessGames = Math.max(prev.lichessGames, next.lichessGames);
  const chessComGames = Math.max(prev.chessComGames, next.chessComGames);
  const lichessPuzzles = Math.max(prev.lichessPuzzles, next.lichessPuzzles);
  const chessComPuzzles = Math.max(prev.chessComPuzzles, next.chessComPuzzles);
  const lichessPuzzlePassed = Math.max(prev.lichessPuzzlePassed, next.lichessPuzzlePassed);
  const chessComPuzzlePassed = Math.max(prev.chessComPuzzlePassed, next.chessComPuzzlePassed);
  const lichessPuzzleFailed = Math.max(prev.lichessPuzzleFailed, next.lichessPuzzleFailed);
  const chessComPuzzleFailed = Math.max(prev.chessComPuzzleFailed, next.chessComPuzzleFailed);

  const games = Math.max(prev.games, next.games, lichessGames + chessComGames);
  const puzzleSolved = Math.max(prev.puzzleSolved, next.puzzleSolved, lichessPuzzles + chessComPuzzles);
  const puzzlePassed = Math.max(prev.puzzlePassed, next.puzzlePassed, lichessPuzzlePassed + chessComPuzzlePassed);
  const puzzleFailed = Math.max(prev.puzzleFailed, next.puzzleFailed, lichessPuzzleFailed + chessComPuzzleFailed);

  const lichessKept = lichessGames > 0 || lichessPuzzles > 0;
  const chessKept = chessComGames > 0 || chessComPuzzles > 0;

  return {
    games,
    puzzleSolved,
    puzzlePassed,
    puzzleFailed,
    lichessGames,
    lichessPuzzles,
    lichessPuzzlePassed,
    lichessPuzzleFailed,
    chessComGames,
    chessComPuzzles,
    chessComPuzzlePassed,
    chessComPuzzleFailed,
    lichessError: next.lichessError && !lichessKept ? true : (prev.lichessError && !lichessKept ? true : undefined),
    chessComError: next.chessComError && !chessKept ? true : (prev.chessComError && !chessKept ? true : undefined),
  };
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
