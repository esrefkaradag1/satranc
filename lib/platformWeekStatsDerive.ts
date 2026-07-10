import type { ChessComPuzzleAttempt } from './chesscomPuzzleParse';
import { localDayKeyFromMs, timestampMatchesDay, istanbulDayKey } from './homeworkDayUtils';
import { parseLichessActivityPuzzles } from './leaderboardUtils';

export type LichessActivityRow = {
  interval?: { start: number; end: number };
  games?: Record<string, { win: number; loss: number; draw: number }>;
  puzzles?: { score?: { win: number; loss: number; draw: number }; count?: number };
};

export type ChessComGameRow = {
  uuid?: string;
  url?: string;
  end_time?: number;
  white?: { username?: string };
  black?: { username?: string };
};

function chessComGameInvolvesUser(game: ChessComGameRow, username: string): boolean {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  const w = game.white?.username?.toLowerCase() ?? '';
  const b = game.black?.username?.toLowerCase() ?? '';
  return w === u || b === u;
}

export type DayPuzzleStats = { count: number; passed: number; failed: number };

export type PlatformDayStatsPayload = {
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
  activityTimeSeconds?: number;
  lichessError?: boolean;
  chessComError?: boolean;
};

export function lichessGamesForDayFromActivity(activities: LichessActivityRow[], day: string): number {
  const target = day.slice(0, 10);
  for (const row of activities) {
    if (!row.interval?.start) continue;
    if (!timestampMatchesDay(row.interval.start, target)) continue;
    const games = row.games;
    if (!games) continue;
    let total = 0;
    for (const mode of Object.values(games)) {
      if (!mode || typeof mode !== 'object') continue;
      total += (mode.win || 0) + (mode.loss || 0) + (mode.draw || 0);
    }
    return total;
  }
  return 0;
}

export function lichessPuzzleStatsForDayFromActivity(
  activities: LichessActivityRow[],
  day: string,
): DayPuzzleStats {
  const target = day.slice(0, 10);
  for (const row of activities) {
    if (!row.interval?.start) continue;
    if (!timestampMatchesDay(row.interval.start, target)) continue;
    const { total, passed, failed } = parseLichessActivityPuzzles(row);
    if (total > 0) return { count: total, passed, failed };
  }
  return { count: 0, passed: 0, failed: 0 };
}

function puzzleAttemptOnDay(isoDate: string | undefined, day: string): boolean {
  if (!isoDate) return false;
  try {
    const ms = new Date(isoDate).getTime();
    if (!Number.isFinite(ms)) return false;
    const target = day.slice(0, 10);
    return timestampMatchesDay(ms, target) || istanbulDayKey(new Date(ms)) === target;
  } catch {
    return false;
  }
}

/** Son bulmaca listesinden günlük sayım — her satır bir deneme (yeniden denemeler dahil). */
export function chessComPuzzleStatsForDay(
  rated: ChessComPuzzleAttempt[],
  day: string,
): DayPuzzleStats {
  const target = day.slice(0, 10);
  const ratedToday = rated.filter((a) => puzzleAttemptOnDay(a.date, target));
  const passed = ratedToday.filter((a) => a.passed).length;
  const failed = ratedToday.filter((a) => !a.passed).length;
  return { count: ratedToday.length, passed, failed };
}

export function chessComGamesForDay(
  monthGames: ChessComGameRow[],
  username: string,
  day: string,
): number {
  const trimmed = username.trim().toLowerCase();
  const target = day.slice(0, 10);
  return monthGames.filter(
    (g) =>
      chessComGameInvolvesUser(g, trimmed) &&
      g.end_time &&
      localDayKeyFromMs(g.end_time * 1000) === target,
  ).length;
}

export function buildPlatformDayStats(
  lichess: { games: number; puzzles: DayPuzzleStats; error?: boolean },
  chess: { games: number; puzzles: DayPuzzleStats; error?: boolean },
  activityTimeSeconds?: number,
): PlatformDayStatsPayload {
  const payload: PlatformDayStatsPayload = {
    games: lichess.games + chess.games,
    puzzleSolved: lichess.puzzles.count + chess.puzzles.count,
    puzzlePassed: lichess.puzzles.passed + chess.puzzles.passed,
    puzzleFailed: lichess.puzzles.failed + chess.puzzles.failed,
    lichessGames: lichess.games,
    lichessPuzzles: lichess.puzzles.count,
    lichessPuzzlePassed: lichess.puzzles.passed,
    lichessPuzzleFailed: lichess.puzzles.failed,
    chessComGames: chess.games,
    chessComPuzzles: chess.puzzles.count,
    chessComPuzzlePassed: chess.puzzles.passed,
    chessComPuzzleFailed: chess.puzzles.failed,
    lichessError: lichess.error,
    chessComError: chess.error,
  };
  if (activityTimeSeconds != null && activityTimeSeconds > 0) {
    payload.activityTimeSeconds = Math.round(activityTimeSeconds);
  }
  return payload;
}

export function uniqueYearMonths(days: string[]): Array<{ year: string; month: string }> {
  const seen = new Set<string>();
  const out: Array<{ year: string; month: string }> = [];
  for (const day of days) {
    const [year, month] = day.slice(0, 10).split('-');
    if (!year || !month) continue;
    const key = `${year}-${month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ year, month });
  }
  return out;
}
