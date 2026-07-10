import type { ChessComGame } from '../services/chessPlatformService';
import { parseChessComMonthlyPgn } from './chesscomGamesParse';
import { fetchChessComUpstream } from './chesscomUpstreamFetch.mjs';
import { chessComGameDurationSeconds } from './chesscomGameDuration';

export type ChessComMonthGamesResult = {
  games: ChessComGame[];
  unavailable?: boolean;
  upstreamStatus?: number;
  source?: 'json' | 'pgn';
  error?: string;
};

async function fetchMonthlyJson(
  username: string,
  year: string,
  month: string,
): Promise<{ ok: boolean; status: number; games: ChessComGame[] }> {
  const mm = month.padStart(2, '0');
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${mm}`;
  const upstream = await fetchChessComUpstream(url, {}, 15000);
  if (!upstream.ok) {
    return { ok: false, status: upstream.status, games: [] };
  }
  const data = (await upstream.json()) as { games?: ChessComGame[] };
  return { ok: true, status: upstream.status, games: data.games ?? [] };
}

async function fetchMonthlyPgn(username: string, year: string, month: string): Promise<ChessComGame[]> {
  const mm = month.padStart(2, '0');
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${mm}/pgn`;
  const upstream = await fetchChessComUpstream(
    url,
    { headers: { Accept: 'application/x-chess-pgn, text/plain, */*' } },
    20000,
  );
  if (!upstream.ok) return [];
  const text = await upstream.text();
  return parseChessComMonthlyPgn(text);
}

function gameMergeKey(game: ChessComGame): string {
  return game.uuid?.trim() || game.url?.trim() || String(game.end_time ?? '');
}

function jsonGamesNeedPgnDuration(games: ChessComGame[]): boolean {
  return games.some((g) => chessComGameDurationSeconds(g) <= 0);
}

function mergeJsonGamesWithPgn(jsonGames: ChessComGame[], pgnGames: ChessComGame[]): ChessComGame[] {
  const pgnByKey = new Map<string, ChessComGame>();
  for (const g of pgnGames) {
    const key = gameMergeKey(g);
    if (key) pgnByKey.set(key, g);
  }
  return jsonGames.map((g) => {
    if (chessComGameDurationSeconds(g) > 0) return g;
    const key = gameMergeKey(g);
    const pgn = key ? pgnByKey.get(key) : undefined;
    if (pgn?.pgn) return { ...g, pgn: pgn.pgn };
    return g;
  });
}

/**
 * Chess.com aylık oyun arşivi — JSON boş/404 olduğunda PGN yedeği.
 * Güncel ay arşivi pub API'de gecikmeli yayınlanır; PGN genelde daha erken gelir.
 */
export async function fetchChessComMonthGames(
  username: string,
  year: string,
  month: string,
): Promise<ChessComMonthGamesResult> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed || !year || !month) {
    return { games: [], unavailable: true, error: 'username, year, month gerekli' };
  }

  let jsonStatus = 0;
  let jsonOk = false;

  try {
    const json = await fetchMonthlyJson(trimmed, year, month);
    jsonStatus = json.status;
    jsonOk = json.ok;
    if (json.ok && json.games.length > 0) {
      if (!jsonGamesNeedPgnDuration(json.games)) {
        return { games: json.games, source: 'json' };
      }
      try {
        const pgnGames = await fetchMonthlyPgn(trimmed, year, month);
        if (pgnGames.length > 0) {
          return { games: mergeJsonGamesWithPgn(json.games, pgnGames), source: 'json' };
        }
      } catch {
        /* PGN birleştirme başarısız — JSON ile devam */
      }
      return { games: json.games, source: 'json' };
    }
  } catch {
    /* JSON arşivi başarısız — PGN yedeğine devam */
  }

  try {
    const pgnGames = await fetchMonthlyPgn(trimmed, year, month);
    if (pgnGames.length > 0) {
      return { games: pgnGames, source: 'pgn', upstreamStatus: jsonOk ? undefined : jsonStatus || undefined };
    }
  } catch {
    /* PGN yedeği de başarısız */
  }

  if (jsonOk) {
    return { games: [], source: 'json' };
  }

  return {
    games: [],
    unavailable: true,
    upstreamStatus: jsonStatus || undefined,
    error: 'Chess.com oyun arşivi alınamadı',
  };
}
