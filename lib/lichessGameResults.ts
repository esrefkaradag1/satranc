import {
  type GameResultsByMode,
  emptyGameResultsByMode,
  normalizeScoringMode,
} from './leaderboardPointSettings';
import { istanbulDayBoundsMs } from './homeworkDayUtils';

export type LichessGameLike = {
  status?: string;
  winner?: 'white' | 'black' | string | null;
  speed?: string;
  perf?: string;
  createdAt?: number | string;
  lastMoveAt?: number | string;
  players?: {
    white?: { user?: { name?: string; id?: string } };
    black?: { user?: { name?: string; id?: string } };
  };
};

export type LichessActivityLike = {
  interval?: { start?: number; end?: number };
  games?: Record<string, { win?: number; loss?: number; draw?: number } | undefined>;
  tournaments?: {
    nb?: number;
    best?: Array<{ nbGames?: number; name?: string }>;
  };
};

const SKIP_STATUS = new Set(['aborted', 'nostart', 'noStart', 'unknownFinish']);

export function lichessGameTimestampMs(game: LichessGameLike): number {
  const raw = game.lastMoveAt ?? game.createdAt;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw > 10_000_000_000 ? raw : raw * 1000;
  if (typeof raw === 'string') {
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

export function lichessGameInvolvesUser(game: LichessGameLike, username: string): boolean {
  const want = username.trim().toLowerCase();
  if (!want) return false;
  const w = game.players?.white?.user?.id ?? game.players?.white?.user?.name;
  const b = game.players?.black?.user?.id ?? game.players?.black?.user?.name;
  return String(w ?? '').toLowerCase() === want || String(b ?? '').toLowerCase() === want;
}

export function lichessGameResultForUser(
  game: LichessGameLike,
  username: string,
): 'win' | 'draw' | 'loss' | null {
  const want = username.trim().toLowerCase();
  if (!want) return null;
  const status = String(game.status ?? '').toLowerCase();
  if (SKIP_STATUS.has(status) || SKIP_STATUS.has(String(game.status ?? ''))) return null;
  const w = String(game.players?.white?.user?.id ?? game.players?.white?.user?.name ?? '').toLowerCase();
  const b = String(game.players?.black?.user?.id ?? game.players?.black?.user?.name ?? '').toLowerCase();
  const isWhite = w === want;
  const isBlack = b === want;
  if (!isWhite && !isBlack) return null;
  if (status === 'draw' || status === 'stalemate') return 'draw';
  const winner = String(game.winner ?? '').toLowerCase();
  if (winner === 'white') return isWhite ? 'win' : 'loss';
  if (winner === 'black') return isBlack ? 'win' : 'loss';
  if (!winner) return 'draw';
  return null;
}

export function addLichessGameToByMode(
  byMode: GameResultsByMode,
  game: LichessGameLike,
  username: string,
): boolean {
  const result = lichessGameResultForUser(game, username);
  if (!result) return false;
  const mode = normalizeScoringMode(game.speed || game.perf || 'other');
  if (result === 'win') byMode[mode].wins += 1;
  else if (result === 'draw') byMode[mode].draws += 1;
  else byMode[mode].losses += 1;
  return true;
}

export function gameResultsFromLichessGames(
  games: LichessGameLike[],
  username: string,
): GameResultsByMode {
  const byMode = emptyGameResultsByMode();
  for (const game of games) addLichessGameToByMode(byMode, game, username);
  return byMode;
}

export function lichessTournamentGameCount(row: LichessActivityLike): number {
  const best = row.tournaments?.best;
  if (!Array.isArray(best) || best.length === 0) return 0;
  return best.reduce((sum, item) => sum + Math.max(0, Number(item?.nbGames) || 0), 0);
}

export function lichessActivityRatedGameCount(row: LichessActivityLike): number {
  const games = row.games;
  if (!games) return 0;
  let total = 0;
  for (const mode of Object.values(games)) {
    if (!mode) continue;
    total += (mode.win || 0) + (mode.loss || 0) + (mode.draw || 0);
  }
  return total;
}

/** Aktivite `games` + turnuva maçları (turnuva Lichess'te ayrı satırdadır). */
export function lichessActivityTotalGameCount(row: LichessActivityLike): number {
  return lichessActivityRatedGameCount(row) + lichessTournamentGameCount(row);
}

export function activityIntervalOverlapsIstanbulDay(row: LichessActivityLike, day: string): boolean {
  const start = Number(row.interval?.start);
  if (!Number.isFinite(start) || start <= 0) return false;
  const startMs = start > 10_000_000_000 ? start : start * 1000;
  const endRaw = Number(row.interval?.end);
  const endMs = Number.isFinite(endRaw) && endRaw > 0
    ? (endRaw > 10_000_000_000 ? endRaw : endRaw * 1000)
    : startMs + 24 * 60 * 60 * 1000;
  const { startMs: dayStart, endMs: dayEnd } = istanbulDayBoundsMs(day);
  return startMs <= dayEnd && endMs > dayStart;
}
