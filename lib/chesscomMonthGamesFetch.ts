import type { ChessComGame } from '../services/chessPlatformService';
import { parseChessComMonthlyPgn } from './chesscomGamesParse';

const UPSTREAM_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'NetChessAcademy/1.0',
};

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
  const upstream = await fetch(url, {
    headers: UPSTREAM_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!upstream.ok) {
    return { ok: false, status: upstream.status, games: [] };
  }
  const data = (await upstream.json()) as { games?: ChessComGame[] };
  return { ok: true, status: upstream.status, games: data.games ?? [] };
}

async function fetchMonthlyPgn(username: string, year: string, month: string): Promise<ChessComGame[]> {
  const mm = month.padStart(2, '0');
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${mm}/pgn`;
  const upstream = await fetch(url, {
    headers: { ...UPSTREAM_HEADERS, Accept: 'application/x-chess-pgn, text/plain, */*' },
    signal: AbortSignal.timeout(20000),
  });
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

  try {
    const json = await fetchMonthlyJson(trimmed, year, month);
    if (json.ok && json.games.length > 0) {
      return { games: json.games, source: 'json' };
    }

    const pgnGames = await fetchMonthlyPgn(trimmed, year, month);
    if (pgnGames.length > 0) {
      return { games: pgnGames, source: 'pgn', upstreamStatus: json.ok ? undefined : json.status };
    }

    if (json.ok) {
      return { games: [], source: 'json' };
    }

    return {
      games: [],
      unavailable: true,
      upstreamStatus: json.status,
      error: 'Chess.com oyun arşivi alınamadı',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Chess.com bağlantı hatası';
    return { games: [], unavailable: true, error: msg };
  }
}
