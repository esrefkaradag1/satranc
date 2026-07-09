import type { ChessComGame } from '../services/chessPlatformService';
import { parseChessComMonthlyPgn } from './chesscomGamesParse';
import { fetchChessComUpstream } from './chesscomUpstreamFetch.mjs';

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
