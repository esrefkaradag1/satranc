/** Chess.com / Lichess oyun süresi — PGN saat etiketlerinden (paylaşımlı). */

import type { ChessComGame, LichessGame } from '../services/chessPlatformService';
import { istanbulDayKey, localDayKeyFromMs } from './homeworkDayUtils';

/** Tek maç için üst sınır (günlük/yazışmalı maçlarda haftalar süren wall-clock şişmesini keser). */
const MAX_GAME_DURATION_SECONDS = 3 * 3600;

function parseClockSeconds(raw: string | undefined): number | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  // "0:15:08.4" gibi ondalıklı saniyeleri kabul et
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

/**
 * Maç süresi: PGN [%emt]/[%clk] düşünme süreleri; bunlar yoksa (özellikle Chess.com
 * daily/yazışmalı maçlarda) kartlarda gösterilen wall-clock'a düş (UTCDate/UTCTime → end_time).
 */
export function chessComGameWallClockSeconds(game: ChessComGame): number {
  if (!game.end_time || !game.pgn) return 0;
  const startMatch = game.pgn.match(/\[UTCDate\s+"([^"]+)"\][\s\S]*?\[UTCTime\s+"([^"]+)"\]/i);
  if (!startMatch) return 0;
  try {
    const startMs = Date.parse(`${startMatch[1].replace(/\./g, '-')}T${startMatch[2]}Z`);
    const endMs = game.end_time * 1000;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
    return Math.max(0, Math.round((endMs - startMs) / 1000));
  } catch {
    return 0;
  }
}

export function chessComGameDurationSeconds(game: ChessComGame): number {
  const headerTimeControl = game.pgn?.match(/\[TimeControl\s+"([^"]+)"\]/i)?.[1];
  const fromClocks = sumClockDurationsFromPgn(game.pgn, headerTimeControl ?? game.time_control);
  const wall = chessComGameWallClockSeconds(game);
  // Kartlardaki "Süre" wall-clock; günlük maçlarda clk yok. İkisinin max'ı tüm günü kapsar.
  const raw = Math.max(fromClocks, wall);
  return Math.min(MAX_GAME_DURATION_SECONDS, Math.max(0, raw));
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

function chessComGameOnDay(game: ChessComGame, dayIso: string): boolean {
  if (!game.end_time) return false;
  const ms = game.end_time * 1000;
  const target = dayIso.slice(0, 10);
  // Vercel UTC'de localDayKey günü kaydırabilir; önce İstanbul günü, sonra yerel/UTC.
  return (
    istanbulDayKey(new Date(ms)) === target
    || localDayKeyFromMs(ms) === target
  );
}

export function chessComGamesTimeSecondsForDay(
  monthGames: ChessComGame[],
  username: string,
  dayIso: string,
): number {
  const trimmed = username.trim().toLowerCase();
  return monthGames
    .filter((g) => chessComGameInvolvesUser(g, trimmed) && chessComGameOnDay(g, dayIso))
    .reduce((sum, g) => sum + chessComGameDurationSeconds(g), 0);
}
