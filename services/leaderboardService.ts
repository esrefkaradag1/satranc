import type { HomeworkPuzzleAttempt, Student } from '../types';
import {
  fetchChessComAllUserGames,
  fetchChessComMemberStats,
  fetchChessComPuzzlesBundle,
  fetchChessComStats,
  fetchLichessActivity,
  fetchLichessUser,
} from './chessPlatformService';
import { buildLeaderboardPlatformSnapshot } from '../lib/leaderboardPlatformUtils';
import {
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type LeaderboardRankMode,
  type PeriodBounds,
  entryForStudent,
  getPeriodBounds,
  isEpochMsInPeriod,
  isTimestampInPeriod,
  lichessActivityGameCount,
  lichessActivityGameResults,
  lichessActivityPuzzleCount,
  rankLeaderboardEntries,
} from '../lib/leaderboardUtils';

async function studentPeriodStats(
  student: Student,
  bounds: PeriodBounds,
  homeworkAttempts: HomeworkPuzzleAttempt[],
): Promise<{ puzzles: number; games: number; internalPuzzles: number; wins: number; draws: number; losses: number }> {
  const internalPuzzles = homeworkAttempts.filter(
    (a) => a.studentId === student.id && isTimestampInPeriod(a.timestamp, bounds) && a.correct,
  ).length;

  let externalPuzzles = 0;
  let games = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;

  const lichessUsername = student.lichessUsername?.trim();
  if (lichessUsername) {
    try {
      const activity = await fetchLichessActivity(lichessUsername);
      for (const row of activity) {
        const start = row.interval?.start;
        if (!start || !isEpochMsInPeriod(start, bounds)) continue;
        externalPuzzles += lichessActivityPuzzleCount(row);
        games += lichessActivityGameCount(row);
        const gr = lichessActivityGameResults(row);
        wins += gr.wins;
        draws += gr.draws;
        losses += gr.losses;
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
      const me = chessComUsername.toLowerCase();
      for (const g of ccGames) {
        const ms = (g.end_time ?? 0) * 1000;
        if (ms <= 0 || !isEpochMsInPeriod(ms, bounds)) continue;
        games += 1;
        const white = (g.white?.username || '').toLowerCase();
        const black = (g.black?.username || '').toLowerCase();
        const isWhite = white === me;
        const isBlack = black === me;
        const myResult = isWhite ? g.white?.result : isBlack ? g.black?.result : undefined;
        if (myResult === 'win') wins += 1;
        else if (myResult === 'draw' || myResult === 'agreed' || myResult === 'repetition' || myResult === 'stalemate' || myResult === 'insufficient') draws += 1;
        else if (myResult === 'lose' || myResult === 'resigned' || myResult === 'timeout' || myResult === 'checkmated' || myResult === 'abandoned') losses += 1;
      }
    } catch {
      /* ignore */
    }
  }

  return {
    puzzles: externalPuzzles + internalPuzzles,
    games,
    internalPuzzles,
    wins,
    draws,
    losses,
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

  return rankLeaderboardEntries(rows, rankMode);
}
