import type { CSSProperties } from 'react';
import type { Square } from 'chess.js';
import { makeBuilderGame } from './studyUtils';

export type ThreatOverlay = {
  squareStyles: Record<string, CSSProperties>;
  arrows: Array<{ startSquare: string; endSquare: string; color: string }>;
};

const THREAT_FILL = 'radial-gradient(circle, rgba(239,68,68,0.42) 18%, transparent 72%)';
const THREAT_RING = 'inset 0 0 0 2px rgba(239,68,68,0.6)';
const THREAT_ARROW = 'rgba(239,68,68,0.72)';

/** Rakibin mevcut pozisyonda tehdit ettiği kareler ve savunmasız taşlar (Lichess `x` modu). */
export function computeThreatOverlay(fen: string): ThreatOverlay {
  const squareStyles: Record<string, CSSProperties> = {};
  const arrows: ThreatOverlay['arrows'] = [];
  const seenArrows = new Set<string>();

  try {
    const game = makeBuilderGame(fen);
    const us = game.turn();
    const them: 'w' | 'b' = us === 'w' ? 'b' : 'w';
    const files = 'abcdefgh';
    const board = game.board();

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (!piece || piece.color !== us) continue;

        const sq = `${files[file]}${8 - rank}` as Square;
        if (!game.isAttacked(sq, them)) continue;

        squareStyles[sq] = {
          background: THREAT_FILL,
          boxShadow: THREAT_RING,
        };

        const attackers = game.attackers(sq, them) ?? [];
        for (const from of attackers) {
          const key = `${from}-${sq}`;
          if (seenArrows.has(key)) continue;
          seenArrows.add(key);
          arrows.push({
            startSquare: from.toLowerCase(),
            endSquare: sq.toLowerCase(),
            color: THREAT_ARROW,
          });
        }
      }
    }
  } catch {
    /* geçersiz FEN */
  }

  return { squareStyles, arrows };
}
