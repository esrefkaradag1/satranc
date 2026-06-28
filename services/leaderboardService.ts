import type { HomeworkPuzzleAttempt, Student } from '../types';
import {
  chessComGameInvolvesUser,
  fetchChessComMemberStats,
  fetchChessComPuzzlesBundle,
  fetchChessComStats,
  fetchLichessActivity,
  fetchLichessUser,
  type ChessComGame,
} from './chessPlatformService';
import {
  buildLeaderboardPlatformSnapshot,
  leaderboardModeRating,
  type LeaderboardPlatformSnapshot,
} from '../lib/leaderboardPlatformUtils';
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

const CHESSCOM_PUB_API = 'https://api.chess.com/pub';
const PLATFORM_SNAPSHOT_CACHE_TTL_MS = 60 * 60 * 1000;
const LEADERBOARD_STUDENT_CONCURRENCY = 4;

const platformSnapshotCache = new Map<string, { at: number; snapshot: LeaderboardPlatformSnapshot }>();

const RATING_PLATFORM_MODES = new Set<LeaderboardRankMode>([
  'rapid',
  'blitz',
  'bullet',
  'classical',
  'puzzle',
]);

function rankModeNeedsPeriodStats(mode: LeaderboardRankMode): boolean {
  return mode === 'activity';
}

function rankModeNeedsPlatformApi(mode: LeaderboardRankMode): boolean {
  return RATING_PLATFORM_MODES.has(mode);
}

function minimalPlatformSnapshot(student: Student): LeaderboardPlatformSnapshot {
  const hasLichess = !!student.lichessUsername?.trim();
  const hasChessCom = !!student.chessComUsername?.trim();
  return {
    primaryPlatform:
      hasLichess && hasChessCom ? 'both' : hasLichess ? 'lichess' : hasChessCom ? 'chesscom' : 'none',
    lichessUsername: student.lichessUsername?.trim() || undefined,
    chessComUsername: student.chessComUsername?.trim() || undefined,
    ukd: student.ukd != null && student.ukd > 0 ? student.ukd : undefined,
    fideElo: student.elo != null && student.elo > 0 ? student.elo : undefined,
  };
}

function platformSnapshotCacheKey(student: Student): string {
  return `${student.id}:${student.lichessUsername ?? ''}:${student.chessComUsername ?? ''}:${student.ukd ?? ''}:${student.elo ?? ''}`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) break;
      results[index] = await fn(items[index]!, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

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

function archiveMonthEndMs(archiveUrl: string): number | null {
  const match = archiveUrl.match(/\/games\/(\d{4})\/(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return new Date(year, month, 0, 23, 59, 59, 999).getTime();
}

/** Dönem içindeki Chess.com maçları — yalnızca gerekli arşiv ayları (400 oyun taraması yok). */
async function fetchChessComGamesForPeriod(
  username: string,
  bounds: PeriodBounds,
): Promise<ChessComGame[]> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return [];
  try {
    const archivesRes = await fetch(
      `${CHESSCOM_PUB_API}/player/${encodeURIComponent(trimmed)}/games/archives`,
    );
    if (!archivesRes.ok) return [];
    const archivesData = (await archivesRes.json()) as { archives?: string[] };
    const archives = archivesData.archives ?? [];
    if (archives.length === 0) return [];

    const all: ChessComGame[] = [];
    for (const archiveUrl of archives.slice().reverse()) {
      const monthEndMs = archiveMonthEndMs(archiveUrl);
      if (monthEndMs != null && monthEndMs < bounds.startMs) break;

      const gamesRes = await fetch(archiveUrl);
      if (!gamesRes.ok) continue;
      const gamesData = (await gamesRes.json()) as { games?: ChessComGame[] };
      for (const game of gamesData.games ?? []) {
        const ms = (game.end_time ?? 0) * 1000;
        if (ms <= 0 || !isEpochMsInPeriod(ms, bounds)) continue;
        if (!chessComGameInvolvesUser(game, trimmed)) continue;
        all.push(game);
      }
    }
    return all;
  } catch {
    return [];
  }
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
  const chessComUsername = student.chessComUsername?.trim();

  const [lichessActivityResult, chessComBundle, chessComGames] = await Promise.all([
    lichessUsername
      ? fetchLichessActivity(lichessUsername).catch(() => [] as Awaited<ReturnType<typeof fetchLichessActivity>>)
      : Promise.resolve([] as Awaited<ReturnType<typeof fetchLichessActivity>>),
    chessComUsername
      ? fetchChessComPuzzlesBundle(chessComUsername).catch(() => null)
      : Promise.resolve(null),
    chessComUsername
      ? fetchChessComGamesForPeriod(chessComUsername, bounds).catch(() => [] as ChessComGame[])
      : Promise.resolve([] as ChessComGame[]),
  ]);

  for (const row of lichessActivityResult) {
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

  if (chessComBundle) {
    const attempts = [...chessComBundle.rated, ...chessComBundle.learning, ...chessComBundle.rush];
    externalPuzzles += attempts.filter((a) => a.passed && isTimestampInPeriod(a.date, bounds)).length;
  }

  if (chessComUsername) {
    for (const game of chessComGames) {
      games += 1;
      addChessComGameToByMode(gameResultsByMode, game, chessComUsername);
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

async function studentPlatformSnapshot(student: Student): Promise<LeaderboardPlatformSnapshot> {
  const cacheKey = platformSnapshotCacheKey(student);
  const cached = platformSnapshotCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PLATFORM_SNAPSHOT_CACHE_TTL_MS) {
    return cached.snapshot;
  }

  const lichessUsername = student.lichessUsername?.trim();
  const chessComUsername = student.chessComUsername?.trim();

  const [lichessProfile, memberStats, pubStats] = await Promise.all([
    lichessUsername ? fetchLichessUser(lichessUsername).catch(() => null) : Promise.resolve(null),
    chessComUsername ? fetchChessComMemberStats(chessComUsername).catch(() => null) : Promise.resolve(null),
    chessComUsername ? fetchChessComStats(chessComUsername).catch(() => null) : Promise.resolve(null),
  ]);

  const snapshot = buildLeaderboardPlatformSnapshot(student, lichessProfile, memberStats, pubStats);
  platformSnapshotCache.set(cacheKey, { at: Date.now(), snapshot });
  return snapshot;
}

async function buildStudentLeaderboardRow(
  student: Student,
  bounds: PeriodBounds,
  homeworkAttempts: HomeworkPuzzleAttempt[],
  rankMode: LeaderboardRankMode,
): Promise<Omit<LeaderboardEntry, 'rank' | 'score' | 'rankMetric'>> {
  const needsPeriod = rankModeNeedsPeriodStats(rankMode);
  const needsPlatformApi = rankModeNeedsPlatformApi(rankMode);

  const [stats, platform] = await Promise.all([
    needsPeriod
      ? studentPeriodStats(student, bounds, homeworkAttempts)
      : Promise.resolve({
          puzzles: 0,
          games: 0,
          internalPuzzles: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          gameResultsByMode: emptyGameResultsByMode(),
        }),
    needsPlatformApi ? studentPlatformSnapshot(student) : Promise.resolve(minimalPlatformSnapshot(student)),
  ]);

  const displayStats = needsPeriod
    ? stats
    : {
        ...stats,
        puzzles: platform.puzzle?.games ?? 0,
        games:
          rankMode === 'puzzle'
            ? (platform.puzzle?.games ?? 0)
            : RATING_PLATFORM_MODES.has(rankMode)
              ? (leaderboardModeRating(platform, rankMode)?.games ?? 0)
              : stats.games,
      };

  return entryForStudent(
    student,
    displayStats.puzzles,
    displayStats.games,
    displayStats.internalPuzzles,
    platform,
    displayStats.gameResultsByMode,
    displayStats.wins,
    displayStats.draws,
    displayStats.losses,
  );
}

/** Kulüp öğrencileri için haftalık/aylık lider tablosu */
export async function buildClubLeaderboard(
  peers: Student[],
  homeworkAttempts: HomeworkPuzzleAttempt[],
  period: LeaderboardPeriod,
  rankMode: LeaderboardRankMode = 'activity',
  onProgress?: (done: number, total: number, partial?: LeaderboardEntry[]) => void,
  pointSettings: LeaderboardPointSettings = DEFAULT_LEADERBOARD_POINT_SETTINGS,
): Promise<LeaderboardEntry[]> {
  const bounds = getPeriodBounds(period);
  const total = peers.length;
  const partialRows: Array<Omit<LeaderboardEntry, 'rank' | 'score' | 'rankMetric'>> = new Array(total);
  let done = 0;

  const rows = await mapWithConcurrency(peers, LEADERBOARD_STUDENT_CONCURRENCY, async (student, index) => {
    const row = await buildStudentLeaderboardRow(student, bounds, homeworkAttempts, rankMode);
    partialRows[index] = row;
    done += 1;
    onProgress?.(
      done,
      total,
      rankLeaderboardEntries(
        partialRows.filter((entry): entry is Omit<LeaderboardEntry, 'rank' | 'score' | 'rankMetric'> => !!entry),
        rankMode,
        pointSettings,
      ),
    );
    return row;
  });

  return rankLeaderboardEntries(rows, rankMode, pointSettings);
}
