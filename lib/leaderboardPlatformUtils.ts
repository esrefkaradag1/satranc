import type { Student } from '../types';
import type {
  ChessComMemberStats,
  ChessComModeStat,
  ChessComStats,
  LichessPerf,
  LichessUserProfile,
} from '../services/chessPlatformService';
import { lichessPerfLabel } from '../services/chessPlatformService';

export type LeaderboardRankMode =
  | 'activity'
  | 'rapid'
  | 'blitz'
  | 'bullet'
  | 'classical'
  | 'puzzle'
  | 'ukd'
  | 'fide';

export const LEADERBOARD_RANK_MODES: { id: LeaderboardRankMode; label: string }[] = [
  { id: 'activity', label: 'Aktivite' },
  { id: 'rapid', label: 'Rapid' },
  { id: 'blitz', label: 'Blitz' },
  { id: 'bullet', label: 'Bullet' },
  { id: 'classical', label: 'Klasik' },
  { id: 'puzzle', label: 'Bulmaca' },
  { id: 'ukd', label: 'UKD' },
  { id: 'fide', label: 'FIDE ELO' },
];

export interface PlatformModeRating {
  rating: number;
  prog?: number;
  games?: number;
  source?: 'lichess' | 'chesscom';
}

export interface LeaderboardPlatformSnapshot {
  primaryPlatform: 'lichess' | 'chesscom' | 'both' | 'none';
  lichessUsername?: string;
  chessComUsername?: string;
  rapid?: PlatformModeRating;
  blitz?: PlatformModeRating;
  bullet?: PlatformModeRating;
  classical?: PlatformModeRating;
  puzzle?: PlatformModeRating;
  ukd?: number;
  fideElo?: number;
}

function fromLichessPerf(perf: LichessPerf): PlatformModeRating {
  return {
    rating: perf.rating,
    prog: typeof perf.prog === 'number' ? perf.prog : undefined,
    games: perf.games ?? 0,
    source: 'lichess',
  };
}

function fromChessComMode(mode: ChessComModeStat): PlatformModeRating {
  return {
    rating: mode.rating,
    prog: mode.ratingChange,
    games: mode.totalGames ?? 0,
    source: 'chesscom',
  };
}

function mergeModeRating(
  lichess?: LichessPerf,
  chesscom?: ChessComModeStat,
): PlatformModeRating | undefined {
  const l = lichess && lichess.rating > 0 ? fromLichessPerf(lichess) : undefined;
  const c = chesscom && chesscom.rating > 0 ? fromChessComMode(chesscom) : undefined;
  if (l && c) return l.rating >= c.rating ? l : c;
  return l ?? c;
}

function pubChessComRating(pub: ChessComStats | null | undefined, key: string): number | undefined {
  const data = pub?.[key as keyof ChessComStats] as { last?: { rating: number } } | undefined;
  const r = data?.last?.rating;
  return r != null && r > 0 ? r : undefined;
}

export function buildLeaderboardPlatformSnapshot(
  student: Student,
  lichess?: LichessUserProfile | null,
  memberStats?: ChessComMemberStats | null,
  pubStats?: ChessComStats | null,
): LeaderboardPlatformSnapshot {
  const hasLichess = !!student.lichessUsername?.trim();
  const hasChessCom = !!student.chessComUsername?.trim();
  const primaryPlatform: LeaderboardPlatformSnapshot['primaryPlatform'] =
    hasLichess && hasChessCom ? 'both' : hasLichess ? 'lichess' : hasChessCom ? 'chesscom' : 'none';

  const lPerfs = lichess?.perfs;
  const rapid = mergeModeRating(
    lPerfs?.rapid,
    memberStats?.rapid ??
      (pubChessComRating(pubStats, 'chess_rapid')
        ? ({ rating: pubChessComRating(pubStats, 'chess_rapid')! } as ChessComModeStat)
        : undefined),
  );
  const blitz = mergeModeRating(
    lPerfs?.blitz,
    memberStats?.blitz ??
      (pubChessComRating(pubStats, 'chess_blitz')
        ? ({ rating: pubChessComRating(pubStats, 'chess_blitz')! } as ChessComModeStat)
        : undefined),
  );
  const bullet = mergeModeRating(
    lPerfs?.bullet,
    memberStats?.bullet ??
      (pubChessComRating(pubStats, 'chess_bullet')
        ? ({ rating: pubChessComRating(pubStats, 'chess_bullet')! } as ChessComModeStat)
        : undefined),
  );
  const classical = mergeModeRating(
    lPerfs?.classical ?? lPerfs?.correspondence,
    memberStats?.daily ??
      (pubChessComRating(pubStats, 'chess_daily')
        ? ({ rating: pubChessComRating(pubStats, 'chess_daily')! } as ChessComModeStat)
        : undefined),
  );

  let puzzle: PlatformModeRating | undefined;
  const lPuzzle = lPerfs?.puzzle;
  const cPuzzle = memberStats?.tactics?.rating ?? pubStats?.tactics?.highest?.rating;
  if (lPuzzle && lPuzzle.rating > 0 && cPuzzle && cPuzzle > 0) {
    puzzle =
      lPuzzle.rating >= cPuzzle
        ? fromLichessPerf(lPuzzle)
        : { rating: cPuzzle, games: memberStats?.tactics?.attemptCount, source: 'chesscom' };
  } else if (lPuzzle && lPuzzle.rating > 0) {
    puzzle = fromLichessPerf(lPuzzle);
  } else if (cPuzzle && cPuzzle > 0) {
    puzzle = { rating: cPuzzle, games: memberStats?.tactics?.attemptCount, source: 'chesscom' };
  }

  return {
    primaryPlatform,
    lichessUsername: student.lichessUsername?.trim() || undefined,
    chessComUsername: student.chessComUsername?.trim() || undefined,
    rapid,
    blitz,
    bullet,
    classical,
    puzzle,
    ukd: student.ukd != null && student.ukd > 0 ? student.ukd : undefined,
    fideElo: student.elo != null && student.elo > 0 ? student.elo : pubStats?.fide,
  };
}

export function leaderboardModeRating(
  platform: LeaderboardPlatformSnapshot,
  mode: LeaderboardRankMode,
): PlatformModeRating | undefined {
  if (mode === 'rapid') return platform.rapid;
  if (mode === 'blitz') return platform.blitz;
  if (mode === 'bullet') return platform.bullet;
  if (mode === 'classical') return platform.classical;
  if (mode === 'puzzle') return platform.puzzle;
  return undefined;
}

export function leaderboardSortValue(
  entry: {
    score: number;
    platform: LeaderboardPlatformSnapshot;
    puzzles: number;
    games: number;
    wins: number;
  },
  mode: LeaderboardRankMode,
): number {
  if (mode === 'activity') return entry.score;
  if (mode === 'ukd') return entry.platform.ukd ?? 0;
  if (mode === 'fide') return entry.platform.fideElo ?? 0;
  return leaderboardModeRating(entry.platform, mode)?.rating ?? 0;
}

export function leaderboardModeLabel(mode: LeaderboardRankMode): string {
  if (mode === 'activity') return 'Aktivite puanı';
  if (mode === 'ukd') return 'UKD';
  if (mode === 'fide') return 'FIDE ELO';
  if (mode === 'classical') return 'Klasik';
  if (mode === 'puzzle') return 'Bulmaca';
  return lichessPerfLabel(mode);
}

export function leaderboardModeProg(
  platform: LeaderboardPlatformSnapshot,
  mode: LeaderboardRankMode,
): number | undefined {
  const r = leaderboardModeRating(platform, mode);
  return r?.prog;
}
