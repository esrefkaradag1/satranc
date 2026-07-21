import type { CSSProperties } from 'react';
import {
  formatEngineEvalLabel,
  pvLineToWinningChances,
  winningChancesToBarPercent,
  type EngineScoreLine,
} from './winningChances';

/** @deprecated Lichess çubuğu artık kazanma şansı kullanır; terminal pozisyonlar için */
export const EVAL_BAR_DECISIVE_SCORE = 100;

/** Kazanma şansı (-1..+1) veya legacy puan skorundan beyaz pay (0–100) */
export function evalBarWhitePercent(scoreOrChances: number): number {
  if (Math.abs(scoreOrChances) <= 1) return winningChancesToBarPercent(scoreOrChances);
  if (scoreOrChances >= EVAL_BAR_DECISIVE_SCORE) return 100;
  if (scoreOrChances <= -EVAL_BAR_DECISIVE_SCORE) return 0;
  return 50 + (50 * (2 / Math.PI)) * Math.atan(Math.max(-3, Math.min(3, scoreOrChances)) * 0.5);
}

export function formatEvalLabel(scoreOrChances: number): string {
  if (Math.abs(scoreOrChances) <= 1) {
    if (scoreOrChances > 0.98) return '1 hamlede mat';
    if (scoreOrChances < -0.98) return '1 hamlede mat';
    return `${scoreOrChances >= 0 ? '+' : ''}${(scoreOrChances * 10).toFixed(1)}`;
  }
  if (Math.abs(scoreOrChances) >= EVAL_BAR_DECISIVE_SCORE) return 'Bitti';
  const sign = scoreOrChances > 0 ? '+' : '';
  return `${sign}${scoreOrChances.toFixed(1)}`;
}

/** Stockfish PV satırından beyaz perspektif kazanma şansı (-1..+1) */
export function pvLineToEvalBarPawns(
  line: EngineScoreLine | null | undefined,
  turn: 'w' | 'b',
): number {
  return pvLineToWinningChances(line, turn);
}

export { formatEngineEvalLabel, winningChancesToBarPercent };

/** react-chessboard: taş hareket geçişleri (Lichess benzeri) */
export const CHESSBOARD_ANIMATION = {
  showAnimations: true as const,
  animationDurationInMs: 280,
};

/** Kare içi a/h notasyonu kapalı — dış koordinatlar ChessBoardFrame ile gösterilir */
export const CHESSBOARD_NO_NOTATION = {
  showNotation: false as const,
};

export type SquareMarkColor = 'yellow' | 'red' | 'green' | 'blue' | 'orange' | 'purple' | 'cyan' | 'lime';

export const MARK_STYLE: Record<SquareMarkColor, CSSProperties> = {
  yellow: { background: 'rgba(255, 220, 80, 0.48)' },
  red: { background: 'rgba(255, 95, 95, 0.45)' },
  green: { background: 'rgba(90, 210, 130, 0.42)' },
  blue: { background: 'rgba(90, 155, 255, 0.45)' },
  orange: { background: 'rgba(255, 165, 0, 0.45)' },
  purple: { background: 'rgba(160, 32, 240, 0.45)' },
  cyan: { background: 'rgba(0, 255, 255, 0.45)' },
  lime: { background: 'rgba(50, 205, 50, 0.45)' },
};

export const CIRCLE_STYLE: Record<SquareMarkColor, CSSProperties> = {
  yellow: { border: '4px solid rgba(255, 220, 80, 0.8)', borderRadius: '50%' },
  red: { border: '4px solid rgba(255, 95, 95, 0.8)', borderRadius: '50%' },
  green: { border: '4px solid rgba(90, 210, 130, 0.8)', borderRadius: '50%' },
  blue: { border: '4px solid rgba(90, 155, 255, 0.8)', borderRadius: '50%' },
  orange: { border: '4px solid rgba(255, 165, 0, 0.8)', borderRadius: '50%' },
  purple: { border: '4px solid rgba(160, 32, 240, 0.8)', borderRadius: '50%' },
  cyan: { border: '4px solid rgba(0, 255, 255, 0.8)', borderRadius: '50%' },
  lime: { border: '4px solid rgba(50, 205, 50, 0.8)', borderRadius: '50%' },
};

export const X_STYLE: Record<SquareMarkColor, CSSProperties> = {
  yellow: { backgroundImage: 'linear-gradient(45deg, transparent 45%, rgba(255, 220, 80, 0.8) 45%, rgba(255, 220, 80, 0.8) 55%, transparent 55%), linear-gradient(-45deg, transparent 45%, rgba(255, 220, 80, 0.8) 45%, rgba(255, 220, 80, 0.8) 55%, transparent 55%)' },
  red: { backgroundImage: 'linear-gradient(45deg, transparent 45%, rgba(255, 95, 95, 0.8) 45%, rgba(255, 95, 95, 0.8) 55%, transparent 55%), linear-gradient(-45deg, transparent 45%, rgba(255, 95, 95, 0.8) 45%, rgba(255, 95, 95, 0.8) 55%, transparent 55%)' },
  green: { backgroundImage: 'linear-gradient(45deg, transparent 45%, rgba(90, 210, 130, 0.8) 45%, rgba(90, 210, 130, 0.8) 55%, transparent 55%), linear-gradient(-45deg, transparent 45%, rgba(90, 210, 130, 0.8) 45%, rgba(90, 210, 130, 0.8) 55%, transparent 55%)' },
  blue: { backgroundImage: 'linear-gradient(45deg, transparent 45%, rgba(90, 155, 255, 0.8) 45%, rgba(90, 155, 255, 0.8) 55%, transparent 55%), linear-gradient(-45deg, transparent 45%, rgba(90, 155, 255, 0.8) 45%, rgba(90, 155, 255, 0.8) 55%, transparent 55%)' },
  orange: { backgroundImage: 'linear-gradient(45deg, transparent 45%, rgba(255, 165, 0, 0.8) 45%, rgba(255, 165, 0, 0.8) 55%, transparent 55%), linear-gradient(-45deg, transparent 45%, rgba(255, 165, 0, 0.8) 45%, rgba(255, 165, 0, 0.8) 55%, transparent 55%)' },
  purple: { backgroundImage: 'linear-gradient(45deg, transparent 45%, rgba(160, 32, 240, 0.8) 45%, rgba(160, 32, 240, 0.8) 55%, transparent 55%), linear-gradient(-45deg, transparent 45%, rgba(160, 32, 240, 0.8) 45%, rgba(160, 32, 240, 0.8) 55%, transparent 55%)' },
  cyan: { backgroundImage: 'linear-gradient(45deg, transparent 45%, rgba(0, 255, 255, 0.8) 45%, rgba(0, 255, 255, 0.8) 55%, transparent 55%), linear-gradient(-45deg, transparent 45%, rgba(0, 255, 255, 0.8) 45%, rgba(0, 255, 255, 0.8) 55%, transparent 55%)' },
  lime: { backgroundImage: 'linear-gradient(45deg, transparent 45%, rgba(50, 205, 50, 0.8) 45%, rgba(50, 205, 50, 0.8) 55%, transparent 55%), linear-gradient(-45deg, transparent 45%, rgba(50, 205, 50, 0.8) 45%, rgba(50, 205, 50, 0.8) 55%, transparent 55%)' },
};

/** Kare işaretlerini squareStyles sözlüğüne çevirir */
export function squareMarksToStyles(marks: Partial<Record<string, { color: SquareMarkColor, type: 'square' | 'circle' | 'x' }>>): Record<string, CSSProperties> {
  const out: Record<string, CSSProperties> = {};
  for (const [sq, mark] of Object.entries(marks)) {
    if (mark) {
      if (mark.type === 'square') out[sq] = MARK_STYLE[mark.color];
      else if (mark.type === 'circle') out[sq] = CIRCLE_STYLE[mark.color];
      else if (mark.type === 'x') out[sq] = X_STYLE[mark.color];
    }
  }
  return out;
}

export const SQUARE_MARK_BUTTON_PREVIEW: Record<SquareMarkColor, string> = {
  yellow: 'bg-amber-300',
  red: 'bg-rose-500',
  green: 'bg-emerald-500',
  blue: 'bg-sky-500',
  orange: 'bg-orange-500',
  purple: 'bg-purple-500',
  cyan: 'bg-cyan-500',
  lime: 'bg-lime-500',
};

export const COLOR_VALUES: Record<SquareMarkColor, string> = {
  yellow: '#ffd450',
  red: '#ff5f5f',
  green: '#5ad282',
  blue: '#5a9bff',
  orange: '#ffa500',
  purple: '#a020f0',
  cyan: '#00ffff',
  lime: '#32cd32',
};
