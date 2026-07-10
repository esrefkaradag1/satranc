import type { LichessGame } from '../services/chessPlatformService';
import { lichessProxyRequest } from './lichessProxyThrottle.mjs';
import { timestampMatchesDay } from './homeworkDayUtils';
import { lichessGameDurationSeconds } from './chesscomGameDuration';

function parseNdjsonGames(text: string): LichessGame[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as LichessGame;
      } catch {
        return null;
      }
    })
    .filter((g): g is LichessGame => g != null);
}

function lichessGameTimestamp(game: LichessGame): number {
  const createdAt = game.createdAt ?? game.lastMoveAt;
  if (typeof createdAt === 'number') return createdAt;
  if (typeof createdAt === 'string') {
    const ms = new Date(createdAt).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function lichessGameInvolvesUser(game: LichessGame, username: string): boolean {
  const want = username.trim().toLowerCase();
  if (!want) return false;
  const w = game.players?.white?.user?.id ?? game.players?.white?.user?.name;
  const b = game.players?.black?.user?.id ?? game.players?.black?.user?.name;
  const ws = w != null ? String(w).toLowerCase() : '';
  const bs = b != null ? String(b).toLowerCase() : '';
  return ws === want || bs === want;
}

export async function fetchLichessGamesTimeSecondsForDay(
  username: string,
  dayIso: string,
  env?: NodeJS.ProcessEnv,
): Promise<number> {
  const trimmed = username.trim();
  if (!trimmed) return 0;
  const target = dayIso.slice(0, 10);
  const [y, m, d] = target.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const since = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const until = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  try {
    const params = new URLSearchParams();
    params.set('max', '100');
    params.set('moves', '0');
    params.set('since', String(since));
    params.set('until', String(until));
    const upstream = await lichessProxyRequest(
      `games/user/${trimmed}`,
      params,
      'application/x-ndjson',
      env,
    );
    if (upstream.status < 200 || upstream.status >= 300) return 0;
    const games = parseNdjsonGames(upstream.body).filter((g) => {
      const ts = lichessGameTimestamp(g);
      return lichessGameInvolvesUser(g, trimmed) && ts > 0 && timestampMatchesDay(ts, target);
    });
    return games.reduce((sum, g) => sum + lichessGameDurationSeconds(g), 0);
  } catch {
    return 0;
  }
}
