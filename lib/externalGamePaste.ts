import { Chess } from 'chess.js';
import { normalizeExternalGamePasteInput, parseExternalGameLink } from './externalGameLink';
import { fenAtSanMoves } from './externalGameSnapshot';
import { parsePgnBlockToMoves } from './studyUtils';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type ExternalGamePasteKind = 'link' | 'pgn' | 'fen';

export type PastedStudentBoardSnapshot = {
  fen: string;
  moves: string[];
  baseFen: string;
  source: 'lichess' | 'chesscom' | 'linked';
  gameId: string;
  gameUrl: string;
  label: string;
  shareKind: ExternalGamePasteKind;
  pastePayload?: string;
};

function isLikelyFen(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('/')) return false;
  try {
    new Chess(trimmed);
    return true;
  } catch {
    return false;
  }
}

function isLikelyPgn(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/\[[A-Za-z]+\s+"/.test(trimmed)) return true;
  return /\d+\.\s*\S+/.test(trimmed);
}

export function detectExternalGamePasteKind(input: string): ExternalGamePasteKind | null {
  const trimmed = normalizeExternalGamePasteInput(input);
  if (!trimmed) return null;
  if (parseExternalGameLink(trimmed)) return 'link';
  if (isLikelyPgn(trimmed)) return 'pgn';
  const firstLine = trimmed.split(/\s+/).length <= 12 ? trimmed : trimmed.split('\n')[0]?.trim() ?? '';
  if (isLikelyFen(firstLine)) return 'fen';
  return null;
}

function labelFromPgn(pgn: string): string {
  const event = pgn.match(/\[Event\s+"([^"]+)"/i)?.[1]?.trim();
  const white = pgn.match(/\[White\s+"([^"]+)"/i)?.[1]?.trim();
  const black = pgn.match(/\[Black\s+"([^"]+)"/i)?.[1]?.trim();
  const link = pgn.match(/\[Link\s+"([^"]+)"/i)?.[1]?.trim();
  const vs = white && black ? `${white} — ${black}` : white || black || '';
  const head = [event, vs].filter(Boolean).join(' · ');
  if (head) return `Chess.com · ${head}`;
  if (link?.includes('lichess')) return 'Lichess · yapıştırılan oyun';
  return 'Chess.com · yapıştırılan oyun';
}

function boardFromPgn(pgn: string): PastedStudentBoardSnapshot | null {
  const trimmed = pgn.trim();
  if (!trimmed) return null;
  const { startFen, moves } = parsePgnBlockToMoves(trimmed);
  const baseFen = startFen || START_FEN;
  const fen = moves.length > 0 ? fenAtSanMoves(baseFen, moves, moves.length) : baseFen;
  const link = trimmed.match(/\[Link\s+"([^"]+)"/i)?.[1]?.trim();
  const platform = link?.includes('lichess.org') ? 'lichess' : 'chesscom';
  return {
    fen,
    moves,
    baseFen,
    source: platform,
    gameId: `paste-${moves.length}`,
    gameUrl: link || 'https://www.chess.com/play/computer',
    label: labelFromPgn(trimmed),
    shareKind: 'pgn',
    pastePayload: trimmed,
  };
}

function boardFromFen(fenInput: string): PastedStudentBoardSnapshot | null {
  const fen = fenInput.trim().split('\n')[0]?.trim() ?? '';
  if (!fen) return null;
  try {
    new Chess(fen);
  } catch {
    return null;
  }
  return {
    fen,
    moves: [],
    baseFen: fen,
    source: 'chesscom',
    gameId: 'paste-fen',
    gameUrl: 'https://www.chess.com/play/computer',
    label: 'Chess.com · FEN konumu',
    shareKind: 'fen',
    pastePayload: fen,
  };
}

export function studentBoardFromPaste(input: string): PastedStudentBoardSnapshot | null {
  const normalized = normalizeExternalGamePasteInput(input);
  const kind = detectExternalGamePasteKind(normalized);
  if (!kind) return null;
  if (kind === 'pgn') return boardFromPgn(normalized);
  if (kind === 'fen') {
    const line = normalized.split('\n').find((l) => l.trim().includes('/'))?.trim() ?? normalized;
    return boardFromFen(line);
  }
  return null;
}
