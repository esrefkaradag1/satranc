import type { HomeworkPuzzleAttempt, Student } from '../types';
import {
  chessComGameInvolvesUser,
  fetchChessComMemberStats,
  fetchChessComMonthGamesViaProxy,
  fetchChessComPlayer,
  fetchChessComStats,
  fetchLichessActivity,
  fetchLichessUser,
  isChessPlatformBackendAvailable,
  isLichessGloballyRateLimited,
  reconcileChessComMemberStats,
  type ChessComGame,
  type LichessActivity,
} from './chessPlatformService';
import { loadPlatformDayStatsFromDb } from './platformStatsCacheService';
import type { PlatformDayStats } from '../lib/homeworkPlatformUtils';
import { istanbulDayKey } from '../lib/homeworkDayUtils';
import {
  isRemotePeriodStatsFresh,
  loadRemotePeriodStats,
  saveRemotePeriodStats,
} from '../lib/leaderboardPeriodRemoteStore';
import type { CachedStudentPeriodStats } from '../lib/leaderboardPeriodCache';
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
  parseLichessActivityPuzzles,
  rankLeaderboardEntries,
} from '../lib/leaderboardUtils';
import {
  type GameResultsByMode,
  emptyGameResultsByMode,
  normalizeScoringMode,
  sumGameResultsByMode,
} from '../lib/leaderboardPointSettings';
import {
  readCachedStudentPeriodStats,
  writeCachedStudentPeriodStats,
  mergePeriodStatsMax,
} from '../lib/leaderboardPeriodCache';

const PLATFORM_SNAPSHOT_CACHE_TTL_MS = 60 * 60 * 1000;
const LEADERBOARD_STUDENT_CONCURRENCY = 4;
const STUDENT_ROW_TIMEOUT_MS = 8_000;
const SCAN_BUDGET_MS = 18_000;
const CHESSCOM_USERNAME_RE = /^[a-z0-9_-]{1,25}$/i;

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

function chessComRangeMonths(bounds: PeriodBounds): Array<{ year: string; month: string }> {
  const months: Array<{ year: string; month: string }> = [];
  const cursor = new Date(bounds.endMs);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  const earliest = new Date(bounds.startMs);
  earliest.setDate(1);
  earliest.setHours(0, 0, 0, 0);
  while (cursor.getTime() >= earliest.getTime()) {
    months.push({
      year: String(cursor.getFullYear()),
      month: String(cursor.getMonth() + 1).padStart(2, '0'),
    });
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return months;
}

function isoDaysInBounds(bounds: PeriodBounds): string[] {
  const out: string[] = [];
  const cursor = new Date(bounds.startMs);
  const endDay = istanbulDayKey(new Date(bounds.endMs));
  for (let i = 0; i < 40; i += 1) {
    const key = istanbulDayKey(cursor);
    out.push(key);
    if (key >= endDay) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function statsFromLichessActivity(
  activities: LichessActivity[],
  bounds: PeriodBounds,
): Omit<CachedStudentPeriodStats, 'cachedAt'> {
  const gameResultsByMode = emptyGameResultsByMode();
  let puzzles = 0;
  let puzzleWrong = 0;
  let games = 0;
  for (const row of activities) {
    const start = row.interval?.start;
    if (!start || !isEpochMsInPeriod(start, bounds)) continue;
    puzzles += lichessActivityPuzzleCount(row);
    const parsed = parseLichessActivityPuzzles(row);
    puzzleWrong += parsed.failed;
    games += lichessActivityGameCount(row);
    const modeResults = lichessActivityGameResultsByMode(row);
    for (const mode of Object.keys(modeResults) as (keyof GameResultsByMode)[]) {
      gameResultsByMode[mode].wins += modeResults[mode].wins;
      gameResultsByMode[mode].draws += modeResults[mode].draws;
      gameResultsByMode[mode].losses += modeResults[mode].losses;
    }
  }
  const totals = sumGameResultsByMode(gameResultsByMode);
  return {
    puzzles,
    puzzleWrong,
    games: Math.max(games, totals.games),
    internalPuzzles: 0,
    wins: totals.wins,
    draws: totals.draws,
    losses: totals.losses,
    gameResultsByMode,
  };
}

function statsFromPlatformDays(
  byDay: Record<string, PlatformDayStats> | undefined,
): Omit<CachedStudentPeriodStats, 'cachedAt'> {
  const empty = {
    puzzles: 0,
    puzzleWrong: 0,
    games: 0,
    internalPuzzles: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    gameResultsByMode: emptyGameResultsByMode(),
  };
  if (!byDay) return empty;
  for (const stats of Object.values(byDay)) {
    empty.puzzles += Math.max(
      0,
      stats.puzzlePassed || ((stats.lichessPuzzlePassed || 0) + (stats.chessComPuzzlePassed || 0)),
    );
    empty.puzzleWrong += Math.max(
      0,
      stats.puzzleFailed || ((stats.lichessPuzzleFailed || 0) + (stats.chessComPuzzleFailed || 0)),
    );
    empty.games += Math.max(
      0,
      stats.games || ((stats.lichessGames || 0) + (stats.chessComGames || 0)),
    );
  }
  return empty;
}

function withHomeworkInternals(
  stats: Omit<CachedStudentPeriodStats, 'cachedAt'>,
  internalCorrect: number,
  internalWrong: number,
): Omit<CachedStudentPeriodStats, 'cachedAt'> {
  const extPuzzles = Math.max(0, stats.puzzles - (stats.internalPuzzles ?? 0));
  const extWrong = Math.max(0, stats.puzzleWrong - Math.max(0, (stats.internalPuzzles ?? 0) - internalCorrect));
  return {
    ...stats,
    puzzles: extPuzzles + internalCorrect,
    puzzleWrong: extWrong + internalWrong,
    internalPuzzles: internalCorrect,
  };
}

function raceWithTimeout<T>(work: Promise<T>, timeoutMs: number, fallback: () => T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback());
    }, timeoutMs);
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(fallback());
      },
    );
  });
}

/** Dönem içindeki Chess.com maçları — yalnızca gerekli arşiv ayları (400 oyun taraması yok). */
async function fetchChessComGamesForPeriod(
  username: string,
  bounds: PeriodBounds,
): Promise<ChessComGame[]> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed || !CHESSCOM_USERNAME_RE.test(trimmed)) return [];
  try {
    const all: ChessComGame[] = [];
    for (const { year, month } of chessComRangeMonths(bounds)) {
      const monthGames = await fetchChessComMonthGamesViaProxy(trimmed, year, month);
      for (const game of monthGames) {
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
  opts?: {
    allowLiveLichess?: boolean;
    remote?: CachedStudentPeriodStats | null;
    dayStats?: Record<string, PlatformDayStats>;
    persistRemote?: boolean;
    period?: LeaderboardPeriod;
  },
): Promise<{
  puzzles: number;
  puzzleWrong: number;
  games: number;
  internalPuzzles: number;
  wins: number;
  draws: number;
  losses: number;
  gameResultsByMode: GameResultsByMode;
}> {
  const cached = readCachedStudentPeriodStats(student.id, bounds);
  const internalCorrect = homeworkAttempts.filter(
    (a) => a.studentId === student.id && isTimestampInPeriod(a.timestamp, bounds) && a.correct,
  ).length;
  const internalWrong = homeworkAttempts.filter(
    (a) => a.studentId === student.id && isTimestampInPeriod(a.timestamp, bounds) && !a.correct,
  ).length;

  let externalCorrect = 0;
  let externalWrong = 0;
  let games = 0;
  const gameResultsByMode = emptyGameResultsByMode();

  const lichessUsername = student.lichessUsername?.trim();
  const chessComUsername = student.chessComUsername?.trim();

  const allowLiveLichess = opts?.allowLiveLichess === true;
  const skipLichess = !lichessUsername || isLichessGloballyRateLimited() || !allowLiveLichess;
  const [lichessActivityResult, chessComGames] = await Promise.all([
    skipLichess
      ? Promise.resolve([] as Awaited<ReturnType<typeof fetchLichessActivity>>)
      : fetchLichessActivity(lichessUsername).catch(() => [] as Awaited<ReturnType<typeof fetchLichessActivity>>),
    chessComUsername && allowLiveLichess
      ? raceWithTimeout(
        fetchChessComGamesForPeriod(chessComUsername, bounds),
        6_000,
        () => [] as ChessComGame[],
      )
      : Promise.resolve([] as ChessComGame[]),
  ]);

  const fromActivity = statsFromLichessActivity(lichessActivityResult, bounds);
  externalCorrect += Math.max(0, fromActivity.puzzles);
  externalWrong += Math.max(0, fromActivity.puzzleWrong);
  games += fromActivity.games;
  for (const mode of Object.keys(gameResultsByMode) as (keyof GameResultsByMode)[]) {
    gameResultsByMode[mode].wins += fromActivity.gameResultsByMode[mode].wins;
    gameResultsByMode[mode].draws += fromActivity.gameResultsByMode[mode].draws;
    gameResultsByMode[mode].losses += fromActivity.gameResultsByMode[mode].losses;
  }

  if (chessComUsername) {
    for (const game of chessComGames) {
      games += 1;
      addChessComGameToByMode(gameResultsByMode, game, chessComUsername);
    }
  }

  const totals = sumGameResultsByMode(gameResultsByMode);

  const fresh = {
    puzzles: externalCorrect + internalCorrect,
    puzzleWrong: externalWrong + internalWrong,
    games,
    internalPuzzles: internalCorrect,
    wins: totals.wins,
    draws: totals.draws,
    losses: totals.losses,
    gameResultsByMode,
  };

  const hasPlatformAccount = !!(lichessUsername || chessComUsername);
  const externalEmpty = externalCorrect === 0 && externalWrong === 0 && games === 0;

  if (cached && hasPlatformAccount && externalEmpty) {
    const extPuzzles = Math.max(0, cached.puzzles - (cached.internalPuzzles ?? 0));
    const extWrong = Math.max(0, cached.puzzleWrong - Math.max(0, (cached.internalPuzzles ?? 0) - internalCorrect));
    let merged = mergePeriodStatsMax(cached, {
      puzzles: extPuzzles + internalCorrect,
      puzzleWrong: extWrong + internalWrong,
      games: cached.games,
      internalPuzzles: internalCorrect,
      wins: cached.wins,
      draws: cached.draws,
      losses: cached.losses,
      gameResultsByMode: cached.gameResultsByMode,
    });
    if (opts?.remote) merged = mergePeriodStatsMax(merged, opts.remote);
    const fromDays = statsFromPlatformDays(opts?.dayStats);
    if (fromDays.puzzles > 0 || fromDays.games > 0 || fromDays.puzzleWrong > 0) {
      merged = mergePeriodStatsMax(merged, withHomeworkInternals(fromDays, internalCorrect, internalWrong));
    }
    writeCachedStudentPeriodStats(student.id, bounds, merged);
    if (opts?.persistRemote && opts.period) {
      void saveRemotePeriodStats(student.id, opts.period, bounds.startMs, merged);
    }
    return merged;
  }

  let merged = cached ? mergePeriodStatsMax(cached, fresh) : fresh;
  if (opts?.remote) merged = mergePeriodStatsMax(merged, opts.remote);
  const fromDays = statsFromPlatformDays(opts?.dayStats);
  if (fromDays.puzzles > 0 || fromDays.games > 0 || fromDays.puzzleWrong > 0) {
    merged = mergePeriodStatsMax(merged, withHomeworkInternals(fromDays, internalCorrect, internalWrong));
  }
  writeCachedStudentPeriodStats(student.id, bounds, merged);
  if (opts?.persistRemote && opts.period) {
    void saveRemotePeriodStats(student.id, opts.period, bounds.startMs, merged);
  }
  return merged;
}

async function studentPlatformSnapshot(student: Student): Promise<LeaderboardPlatformSnapshot> {
  const cacheKey = platformSnapshotCacheKey(student);
  const cached = platformSnapshotCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PLATFORM_SNAPSHOT_CACHE_TTL_MS) {
    return cached.snapshot;
  }

  const lichessUsername = student.lichessUsername?.trim();
  const chessComUsername = student.chessComUsername?.trim();

  const [lichessProfile, chessComProfile, memberStatsRaw, pubStats] = await Promise.all([
    lichessUsername ? fetchLichessUser(lichessUsername).catch(() => null) : Promise.resolve(null),
    chessComUsername ? fetchChessComPlayer(chessComUsername).catch(() => null) : Promise.resolve(null),
    chessComUsername && isChessPlatformBackendAvailable()
      ? fetchChessComMemberStats(chessComUsername).catch(() => null)
      : Promise.resolve(null),
    chessComUsername ? fetchChessComStats(chessComUsername).catch(() => null) : Promise.resolve(null),
  ]);

  const memberStats = reconcileChessComMemberStats(memberStatsRaw, pubStats, chessComProfile);

  const snapshot = buildLeaderboardPlatformSnapshot(student, lichessProfile, memberStats, pubStats);
  platformSnapshotCache.set(cacheKey, { at: Date.now(), snapshot });
  return snapshot;
}

async function buildStudentLeaderboardRow(
  student: Student,
  bounds: PeriodBounds,
  homeworkAttempts: HomeworkPuzzleAttempt[],
  rankMode: LeaderboardRankMode,
  opts?: {
    allowLiveLichess?: boolean;
    remote?: CachedStudentPeriodStats | null;
    dayStats?: Record<string, PlatformDayStats>;
    persistRemote?: boolean;
    period?: LeaderboardPeriod;
  },
): Promise<Omit<LeaderboardEntry, 'rank' | 'score' | 'rankMetric'>> {
  const needsPeriod = rankModeNeedsPeriodStats(rankMode);
  const needsPlatformApi = rankModeNeedsPlatformApi(rankMode);

  const [stats, platform] = await Promise.all([
    needsPeriod
      ? studentPeriodStats(student, bounds, homeworkAttempts, opts)
      : Promise.resolve({
          puzzles: 0,
          puzzleWrong: 0,
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
    displayStats.puzzleWrong ?? 0,
  );
}

function cachedStudentLeaderboardRow(
  student: Student,
  bounds: PeriodBounds,
  homeworkAttempts: HomeworkPuzzleAttempt[],
): Omit<LeaderboardEntry, 'rank' | 'score' | 'rankMetric'> {
  const cached = readCachedStudentPeriodStats(student.id, bounds);
  const internalCorrect = homeworkAttempts.filter(
    (a) => a.studentId === student.id && isTimestampInPeriod(a.timestamp, bounds) && a.correct,
  ).length;
  const internalWrong = homeworkAttempts.filter(
    (a) => a.studentId === student.id && isTimestampInPeriod(a.timestamp, bounds) && !a.correct,
  ).length;
  if (!cached) {
    return entryForStudent(
      student,
      internalCorrect,
      0,
      internalCorrect,
      minimalPlatformSnapshot(student),
      emptyGameResultsByMode(),
      0,
      0,
      0,
      internalWrong,
    );
  }
  const extPuzzles = Math.max(0, cached.puzzles - (cached.internalPuzzles ?? 0));
  const extWrong = Math.max(0, cached.puzzleWrong - Math.max(0, (cached.internalPuzzles ?? 0) - internalCorrect));
  return entryForStudent(
    student,
    extPuzzles + internalCorrect,
    cached.games,
    internalCorrect,
    minimalPlatformSnapshot(student),
    cached.gameResultsByMode,
    cached.wins,
    cached.draws,
    cached.losses,
    extWrong + internalWrong,
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
  const days = isoDaysInBounds(bounds);
  const ids = peers.map((peer) => String(peer.id));
  const [dayDb, remotePeriod] = await Promise.all([
    rankMode === 'activity' ? loadPlatformDayStatsFromDb(ids, days) : Promise.resolve(null),
    loadRemotePeriodStats(ids, period, bounds.startMs),
  ]);

  const partialRows: Array<Omit<LeaderboardEntry, 'rank' | 'score' | 'rankMetric'>> = new Array(total);
  let done = 0;
  const rows = await mapWithConcurrency(peers, LEADERBOARD_STUDENT_CONCURRENCY, async (student, index) => {
    const row = await raceWithTimeout(
      buildStudentLeaderboardRow(student, bounds, homeworkAttempts, rankMode, {
        allowLiveLichess: false,
        remote: remotePeriod.get(String(student.id)) ?? null,
        dayStats: dayDb?.stats[String(student.id)],
        persistRemote: rankMode === 'activity',
        period,
      }),
      STUDENT_ROW_TIMEOUT_MS,
      () => cachedStudentLeaderboardRow(student, bounds, homeworkAttempts),
    );
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

  const ranked = rankLeaderboardEntries(rows, rankMode, pointSettings);
  onProgress?.(total, total, ranked);
  return ranked;
}

export async function persistLeaderboardStatsFromDays(
  student: Student,
  byDay: Record<string, PlatformDayStats>,
  homeworkAttempts: HomeworkPuzzleAttempt[] = [],
): Promise<void> {
  if (!student.id || !byDay || Object.keys(byDay).length === 0) return;
  const period: LeaderboardPeriod = 'week';
  const bounds = getPeriodBounds(period);
  const internalCorrect = homeworkAttempts.filter(
    (a) => a.studentId === student.id && isTimestampInPeriod(a.timestamp, bounds) && a.correct,
  ).length;
  const internalWrong = homeworkAttempts.filter(
    (a) => a.studentId === student.id && isTimestampInPeriod(a.timestamp, bounds) && !a.correct,
  ).length;
  const fromDays = withHomeworkInternals(statsFromPlatformDays(byDay), internalCorrect, internalWrong);
  const cached = readCachedStudentPeriodStats(student.id, bounds);
  const merged = cached ? mergePeriodStatsMax(cached, fromDays) : fromDays;
  writeCachedStudentPeriodStats(student.id, bounds, merged);
  await saveRemotePeriodStats(student.id, period, bounds.startMs, merged);
}

export async function persistLeaderboardStatsFromActivity(
  student: Student,
  activities: LichessActivity[],
  homeworkAttempts: HomeworkPuzzleAttempt[] = [],
): Promise<void> {
  if (!student.id || activities.length === 0) return;
  for (const period of ['week', 'month'] as const) {
    const bounds = getPeriodBounds(period);
    const internalCorrect = homeworkAttempts.filter(
      (a) => a.studentId === student.id && isTimestampInPeriod(a.timestamp, bounds) && a.correct,
    ).length;
    const internalWrong = homeworkAttempts.filter(
      (a) => a.studentId === student.id && isTimestampInPeriod(a.timestamp, bounds) && !a.correct,
    ).length;
    const fromActivity = withHomeworkInternals(
      statsFromLichessActivity(activities, bounds),
      internalCorrect,
      internalWrong,
    );
    const cached = readCachedStudentPeriodStats(student.id, bounds);
    const merged = cached ? mergePeriodStatsMax(cached, fromActivity) : fromActivity;
    writeCachedStudentPeriodStats(student.id, bounds, merged);
    await saveRemotePeriodStats(student.id, period, bounds.startMs, merged);
  }
}

/** Antrenör tarayıcısından en fazla 1 eksik öğrenciyi yavaşça tamamla (15/2dk limiti). */
export async function harvestStaleLeaderboardStudent(
  peers: Student[],
  homeworkAttempts: HomeworkPuzzleAttempt[],
  period: LeaderboardPeriod,
): Promise<LeaderboardEntry | null> {
  if (isLichessGloballyRateLimited()) return null;
  const bounds = getPeriodBounds(period);
  const remote = await loadRemotePeriodStats(peers.map((p) => String(p.id)), period, bounds.startMs);
  const stale = peers.find((peer) => {
    if (!peer.lichessUsername?.trim()) return false;
    const hit = remote.get(String(peer.id));
    return !hit || !isRemotePeriodStatsFresh(hit.cachedAt);
  });
  if (!stale?.lichessUsername?.trim()) return null;
  const activities = await fetchLichessActivity(stale.lichessUsername).catch(() => []);
  if (isLichessGloballyRateLimited() && activities.length === 0) return null;
  if (activities.length === 0) return null;
  await persistLeaderboardStatsFromActivity(stale, activities, homeworkAttempts);
  return rankLeaderboardEntries(
    [await buildStudentLeaderboardRow(stale, bounds, homeworkAttempts, 'activity', {
      allowLiveLichess: false,
      persistRemote: true,
      period,
    })],
    'activity',
  )[0] ?? null;
}

/** API beklerken anında gösterilecek önbellek tablosu (yalnızca aktivite modu). */
export function buildCachedClubLeaderboardPreview(
  peers: Student[],
  homeworkAttempts: HomeworkPuzzleAttempt[],
  period: LeaderboardPeriod,
  rankMode: LeaderboardRankMode = 'activity',
  pointSettings: LeaderboardPointSettings = DEFAULT_LEADERBOARD_POINT_SETTINGS,
): LeaderboardEntry[] {
  if (rankMode !== 'activity' || peers.length === 0) return [];
  const bounds = getPeriodBounds(period);
  const rows = peers.map((student) => cachedStudentLeaderboardRow(student, bounds, homeworkAttempts));
  return rankLeaderboardEntries(rows, rankMode, pointSettings);
}
