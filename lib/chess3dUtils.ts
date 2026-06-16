import type { CSSProperties } from 'react';
import { Chess, type PieceSymbol, type Color } from 'chess.js';

export type BoardOrientation = 'white' | 'black';

export type BoardPiece = {
  square: string;
  color: Color;
  type: PieceSymbol;
};

const FILES = 'abcdefgh';

/** Kare merkezi — tahta XZ düzleminde, Y yukarı */
export function squareToPosition(square: string): [number, number, number] {
  const file = FILES.indexOf(square[0]?.toLowerCase() ?? 'a');
  const rank = parseInt(square[1] ?? '1', 10) - 1;
  const x = file - 3.5;
  const z = rank - 3.5;
  return [x, 0, z];
}

export function isLightSquare(square: string): boolean {
  const file = FILES.indexOf(square[0]?.toLowerCase() ?? 'a');
  const rank = parseInt(square[1] ?? '1', 10) - 1;
  return (file + rank) % 2 === 0;
}

export function fenToPieces(fen: string): BoardPiece[] {
  try {
    const chess = new Chess(fen);
    const rows = chess.board();
    const out: BoardPiece[] = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const cell = rows[r][f];
        if (!cell) continue;
        const file = FILES[f];
        const rank = 8 - r;
        out.push({
          square: `${file}${rank}`,
          color: cell.color,
          type: cell.type,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function parseHighlightColor(style: CSSProperties | undefined): string | null {
  if (!style) return null;
  const bg = style.background ?? style.backgroundColor;
  return typeof bg === 'string' && bg.length > 0 ? bg : null;
}
