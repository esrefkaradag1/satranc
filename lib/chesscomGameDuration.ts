/** Chess.com / Lichess oyun süresi — PGN saat etiketlerinden (paylaşımlı). */

import type { ChessComGame, LichessGame } from '../services/chessPlatformService';
import { localDayKeyFromMs } from './homeworkDayUtils';

function parseClockSeconds(raw: string | undefined): number | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const parts = value.split(':').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((num) => !Number.isFinite(num))) return null;
  if (nums.length === 2) {
    const [minutes, seconds] = nums;
    return Math.round(minutes * 60 + seconds);
  }
  const [hours, minutes, seconds] = nums;
  return Math.round(hours * 3600 + minutes * 60 + seconds);
}

function parseInitialTimeControlSeconds(raw: string | undefined): { initialSeconds: number; incrementSeconds: number } | null {
  const value = String(raw ?? '').trim();
  if (!value || value === '-' || value.includes('/')) return null;
  const [baseRaw, incrementRaw = '0'] = value.split('+');
  const base = Number(baseRaw);
  const increment = Number(incrementRaw);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(increment) || increment < 0) return null;
  return {
    initialSeconds: Math.round(base),
    incrementSeconds: Math.round(increment),
  };
}

export function sumClockDurationsFromPgn(rawPgn: string | undefined, timeControl?: string): number {
  const pgn = String(rawPgn ?? '');
  if (!pgn.trim()) return 0;

  const emtMatches = [...pgn.matchAll(/\[%emt\s+([0-9:.]+)\]/gi)];
  if (emtMatches.length > 0) {
    return emtMatches.reduce((sum, match) => {
      const sec = parseClockSeconds(match[1]);
      return sum + Math.max(0, sec ?? 0);
    }, 0);
  }

  const clockMatches = [...pgn.matchAll(/\[%clk\s+([0-9:.]+)\]/gi)];
  if (clockMatches.length === 0) return 0;

  const tc = parseInitialTimeControlSeconds(timeControl);
  if (!tc) return 0;

  let prevWhite = tc.initialSeconds;
  let prevBlack = tc.initialSeconds;
  let total = 0;
  clockMatches.forEach((match, index) => {
    const remaining = parseClockSeconds(match[1]);
    if (remaining == null) return;
    if (index % 2 === 0) {
      total += Math.max(0, prevWhite + tc.incrementSeconds - remaining);
      prevWhite = remaining;
    } else {
      total += Math.max(0, prevBlack + tc.incrementSeconds - remaining);
      prevBlack = remaining;
    }
  });
  return total;
}

export function chessComGameDurationSeconds(game: ChessComGame): number {
  const headerTimeControl = game.pgn?.match(/\[TimeControl\s+"([^"]+)"\]/i)?.[1];
  return sumClockDurationsFromPgn(game.pgn, headerTimeControl ?? game.time_control);
}

export function lichessGameDurationSeconds(game: LichessGame): number {
  const start = game.createdAt;
  const end = game.lastMoveAt ?? start;
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end - start) / 1000));
}

export function chessComGameInvolvesUser(game: ChessComGame, username: string): boolean {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  const w = game.white?.username?.toLowerCase() ?? '';
  const b = game.black?.username?.toLowerCase() ?? '';
  return w === u || b === u;
}

export function chessComGamesTimeSecondsForDay(
  monthGames: ChessComGame[],
  username: string,
  dayIso: string,
): number {
  const trimmed = username.trim().toLowerCase();
  const target = dayIso.slice(0, 10);
  return monthGames
    .filter(
      (g) =>
        chessComGameInvolvesUser(g, trimmed) &&
        g.end_time &&
        localDayKeyFromMs(g.end_time * 1000) === target,
    )
    .reduce((sum, g) => sum + chessComGameDurationSeconds(g), 0);
}
