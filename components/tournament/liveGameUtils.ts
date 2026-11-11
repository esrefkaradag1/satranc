import { Chess } from 'chess.js';
import type { CSSProperties } from 'react';
import type { TournamentGame } from '../../lib/tournamentGames';

export function formatClock(ms: number): string {
  const clamped = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Sırası gelen tarafın saatinden son hamleden beri geçen süreyi düşer (oyuncu ekranıyla aynı hesap). */
export function liveClocks(game: TournamentGame, now: number): { whiteMs: number; blackMs: number; turn: 'w' | 'b' } {
  const turn: 'w' | 'b' = (game.fen.split(' ')[1] as 'w' | 'b') || 'w';
  const elapsed = game.status === 'active' && game.turnStartedAt
    ? Math.max(0, now - new Date(game.turnStartedAt).getTime())
    : 0;
  return {
    turn,
    whiteMs: turn === 'w' ? Math.max(0, game.whiteTimeMs - elapsed) : game.whiteTimeMs,
    blackMs: turn === 'b' ? Math.max(0, game.blackTimeMs - elapsed) : game.blackTimeMs,
  };
}

export type ReplayedPosition = { fen: string; from?: string; to?: string };

/** Hamle listesini baştan oynatıp her hamleden sonraki konumu verir (0 = başlangıç). */
export function replayPositions(moves: string[]): ReplayedPosition[] {
  const chess = new Chess();
  const out: ReplayedPosition[] = [{ fen: chess.fen() }];
  for (const san of moves) {
    try {
      const m = chess.move(san);
      out.push({ fen: chess.fen(), from: m.from, to: m.to });
    } catch {
      break; // bozuk hamle: kalanını gösterme, tahtayı yine de DB'deki FEN ile göster
    }
  }
  return out;
}

const LAST_MOVE_STYLE: CSSProperties = { backgroundColor: 'rgba(155, 199, 0, 0.41)' };

export function lastMoveStyles(pos: ReplayedPosition | undefined): Record<string, CSSProperties> {
  if (!pos?.from || !pos.to) return {};
  return { [pos.from]: LAST_MOVE_STYLE, [pos.to]: LAST_MOVE_STYLE };
}
