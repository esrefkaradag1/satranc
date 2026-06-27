import type { HomeworkPuzzleAttempt, Student } from '../types';
import {
  fetchChessComAllUserGames,
  fetchChessComMemberStats,
  fetchChessComPuzzlesBundle,
  fetchChessComStats,
  fetchLichessActivity,
  fetchLichessUser,
  type ChessComGame,
} from './chessPlatformService';
import { buildLeaderboardPlatformSnapshot } from '../lib/leaderboardPlatformUtils';
import {
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type LeaderboardPointSettings,
  type LeaderboardRankMode,
  type PeriodBounds,
  DEFAULT_LEADERBOARD_POINT_SETTINGS,
  entryForStudent,
  getPeriodBounds,
  isEpochMsInPeriod,
  isTimestampInPeriod,
  lichessActivityGameCount,
  lichessActivityGameResultsByMode,
  lichessActivityPuzzleCount,
  rankLeaderboardEntries,
} from '../lib/leaderboardUtils';
import {
  type GameResultsByMode,
  emptyGameResultsByMode,
  normalizeScoringMode,
  sumGameResultsByMode,
} from '../lib/leaderboardPointSettings';

function chessComGameResult(game: ChessComGame, username: string): 'win' | 'draw' | 'loss' | null {
  const me = username.toLowerCase();
  const white = (game.white?.username || '').toLowerCase();
  const black = (game.black?.username || '').toLowerCase();
  const isWhite = white === me;
  const isBlack = black === me;
  if (!isWhite && !isBlack) return null;
  const myResult = isWhite ? game.white?.result : game.black?.result;
  if (myResult === 'win') return 'win';
  if (myResult === 'draw' || myResult === 'agreed' || myResult === 'repetition' || myResult === 'stalemate' || myResult === 'insufficient') {
    return 'draw';
  }
  if (myResult === 'lose' || myResult === 'resigned' || myResult === 'timeout' || myResult === 'checkmated' || myResult === 'abandoned') {
    return 'loss';
  }
  return null;
}

function addChessComGameToByMode(byMode: GameResultsByMode, game: ChessComGame, username: string): void {
  const result = chessComGameResult(game, username);
  if (!result) return;
  const mode = normalizeScoringMode(game.time_class || game.time_control || 'other');
  if (result === 'win') byMode[mode].wins += 1;
  else if (result === 'draw') byMode[mode].draws += 1;
  else byMode[mode].losses += 1;
}

async function studentPeriodStats(
  student: Student,
  bounds: PeriodBounds,
  homeworkAttempts: HomeworkPuzzleAttempt[],
): Promise<{
  puzzles: number;
  games: number;
  internalPuzzles: number;
  wins: number;
  draws: number;
  losses: number;
  gameResultsByMode: GameResultsByMode;
}> {
  const internalPuzzles = homeworkAttempts.filter(
    (a) => a.studentId === student.id && isTimestampInPeriod(a.timestamp, bounds) && a.correct,
  ).length;

  let externalPuzzles = 0;
  let games = 0;
  const gameResultsByMode = emptyGameResultsByMode();

  const lichessUsername = student.lichessUsername?.trim();
  if (lichessUsername) {
    try {
      const activity = await fetchLichessActivity(lichessUsername);
      for (const row of activity) {
        const start = row.interval?.start;
        if (!start || !isEpochMsInPeriod(start, bounds)) continue;
        externalPuzzles += lichessActivityPuzzleCount(row);
        games += lichessActivityGameCount(row);
        const modeResults = lichessActivityGameResultsByMode(row);
        for (const mode of Object.keys(modeResults) as (keyof GameResultsByMode)[]) {
          gameResultsByMode[mode].wins += modeResults[mode].wins;
          gameResultsByMode[mode].draws += modeResults[mode].draws;
          gameResultsByMode[mode].losses += modeResults[mode].losses;
        }
      }
    } catch {
      /* ignore */
    }
  }

  const chessComUsername = student.chessComUsername?.trim();
  if (chessComUsername) {
    try {
      const bundle = await fetchChessComPuzzlesBundle(chessComUsername);
      if (bundle) {
        const attempts = [...bundle.rated, ...bundle.learning, ...bundle.rush];
        externalPuzzles += attempts.filter((a) => a.passed && isTimestampInPeriod(a.date, bounds)).length;
      }
    } catch {
      /* ignore */
    }
    try {
      const ccGames = await fetchChessComAllUserGames(chessComUsername, { maxTotal: 400 });
      for (const g of ccGames) {
        const ms = (g.end_time ?? 0) * 1000;
        if (ms <= 0 || !isEpochMsInPeriod(ms, bounds)) continue;
        games += 1;
        addChessComGameToByMode(gameResultsByMode, g, chessComUsername);
      }
    } catch {
      /* ignore */
    }
  }

  const totals = sumGameResultsByMode(gameResultsByMode);

  return {
    puzzles: externalPuzzles + internalPuzzles,
    games,
    internalPuzzles,
    wins: totals.wins,
    draws: totals.draws,
    losses: totals.losses,
    gameResultsByMode,
  };
}

async function studentPlatformSnapshot(student: Student) {
  const lichessUsername = student.lichessUsername?.trim();
  const chessComUsername = student.chessComUsername?.trim();

  const [lichessProfile, memberStats, pubStats] = await Promise.all([
    lichessUsername ? fetchLichessUser(lichessUsername).catch(() => null) : Promise.resolve(null),
    chessComUsername ? fetchChessComMemberStats(chessComUsername).catch(() => null) : Promise.resolve(null),
    chessComUsername ? fetchChessComStats(chessComUsername).catch(() => null) : Promise.resolve(null),
  ]);

  return buildLeaderboardPlatformSnapshot(student, lichessProfile, memberStats, pubStats);
}

/** Kulüp öğrencileri için haftalık/aylık lider tablosu (sırayla, API yükünü sınırlar) */
export async function buildClubLeaderboard(
  peers: Student[],
  homeworkAttempts: HomeworkPuzzleAttempt[],
  period: LeaderboardPeriod,
  rankMode: LeaderboardRankMode = 'activity',
  onProgress?: (done: number, total: number) => void,
  pointSettings: LeaderboardPointSettings = DEFAULT_LEADERBOARD_POINT_SETTINGS,
): Promise<LeaderboardEntry[]> {
  const bounds = getPeriodBounds(period);
  const rows: ReturnType<typeof entryForStudent>[] = [];

  for (let i = 0; i < peers.length; i++) {
    const student = peers[i]!;
    const [stats, platform] = await Promise.all([
      studentPeriodStats(student, bounds, homeworkAttempts),
      studentPlatformSnapshot(student),
    ]);
    rows.push(
      entryForStudent(
        student,
        stats.puzzles,
        stats.games,
        stats.internalPuzzles,
        platform,
        stats.gameResultsByMode,
        stats.wins,
        stats.draws,
        stats.losses,
      ),
    );
    onProgress?.(i + 1, peers.length);
    if (i < peers.length - 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return rankLeaderboardEntries(rows, rankMode, pointSettings);
}
