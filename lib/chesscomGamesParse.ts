import type { ChessComGame } from '../services/chessPlatformService';

function parsePgnHeaders(pgn: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

function splitMonthlyPgnBlocks(pgnText: string): string[] {
  const trimmed = pgnText.trim();
  if (!trimmed) return [];
  return trimmed.split(/\n\n(?=\[Event)/).filter((block) => block.trim().length > 0);
}

function parseUtcTimestamp(date?: string, time?: string): number {
  if (!date) return 0;
  const normalizedDate = date.replace(/\./g, '-');
  const normalizedTime = time?.trim() || '00:00:00';
  const ms = Date.parse(`${normalizedDate}T${normalizedTime}Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function timeClassFromTimeControl(timeControl?: string): string {
  const tc = (timeControl ?? '').trim();
  if (!tc) return 'rapid';
  if (tc === '-' || tc === '1/259200') return 'daily';
  const base = Number(tc.split('+')[0]);
  if (!Number.isFinite(base) || base <= 0) return 'rapid';
  if (base <= 60) return 'bullet';
  if (base <= 600) return 'blitz';
  return 'rapid';
}

function playerResultFromPgnResult(result: string, color: 'white' | 'black'): string {
  if (result === '1-0') return color === 'white' ? 'win' : 'lose';
  if (result === '0-1') return color === 'black' ? 'win' : 'lose';
  if (result === '1/2-1/2') return 'agreed';
  return 'lose';
}

function gameUuidFromLink(link?: string): string | undefined {
  if (!link) return undefined;
  const m = link.match(/\/game\/(?:live|daily)\/(\d+)/i);
  return m?.[1];
}

function pgnBlockToGame(block: string): ChessComGame | null {
  const headers = parsePgnHeaders(block);
  const white = headers.White?.trim();
  const black = headers.Black?.trim();
  if (!white || !black) return null;

  const endTime =
    parseUtcTimestamp(headers.EndDate, headers.EndTime) ||
    parseUtcTimestamp(headers.UTCDate, headers.UTCTime) ||
    parseUtcTimestamp(headers.Date, headers.StartTime);

  const timeControl = headers.TimeControl?.trim() || undefined;
  const link = headers.Link?.trim() || undefined;

  return {
    url: link,
    uuid: gameUuidFromLink(link),
    pgn: block.trim(),
    time_control: timeControl,
    end_time: endTime || undefined,
    rated: true,
    white: {
      username: white,
      rating: Number(headers.WhiteElo) || undefined,
      result: playerResultFromPgnResult(headers.Result ?? '', 'white'),
    },
    black: {
      username: black,
      rating: Number(headers.BlackElo) || undefined,
      result: playerResultFromPgnResult(headers.Result ?? '', 'black'),
    },
    fen: headers.CurrentPosition?.trim() || undefined,
    time_class: timeClassFromTimeControl(timeControl),
    rules: 'chess',
  };
}

/** Chess.com aylık PGN arşivini pub API ChessComGame listesine çevirir. */
export function parseChessComMonthlyPgn(pgnText: string): ChessComGame[] {
  const games: ChessComGame[] = [];
  for (const block of splitMonthlyPgnBlocks(pgnText)) {
    const game = pgnBlockToGame(block);
    if (game) games.push(game);
  }
  return games.sort((a, b) => (a.end_time ?? 0) - (b.end_time ?? 0));
}

export function parseChessComArchiveUrl(
  archiveUrl: string,
): { year: string; month: string } | null {
  const m = archiveUrl.match(/\/games\/(\d{4})\/(\d{1,2})(?:\/pgn)?$/i);
  if (!m) return null;
  return { year: m[1], month: m[2].padStart(2, '0') };
}
