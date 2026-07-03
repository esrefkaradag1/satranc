/** Lichess kazanma şansı eğrisi (WinPercent.scala / winningChances.ts) */
export const WINNING_CHANCES_MULTIPLIER = -0.00368208;

export type EngineScoreLine = {
  score: number;
  mate: number | null;
  depth?: number;
};

/** Ham cp → [-1, +1] kazanma şansı (beyaz perspektif değil; ham motor skoru) */
export function rawWinningChances(cpCentipawns: number): number {
  const v = 2 / (1 + Math.exp(WINNING_CHANCES_MULTIPLIER * cpCentipawns)) - 1;
  return Math.max(-1, Math.min(1, v));
}

export function cpWinningChances(cpCentipawns: number): number {
  const clamped = Math.min(1000, Math.max(-1000, cpCentipawns));
  return rawWinningChances(clamped);
}

/** Mat mesafesine göre kademeli kazanma şansı — çubuk aniden %100'e fırlamaz */
export function mateWinningChances(mate: number): number {
  const cp = (21 - Math.min(10, Math.abs(mate))) * 100;
  const signed = cp * (mate > 0 ? 1 : -1);
  return rawWinningChances(signed);
}

export function evalWinningChances(line: EngineScoreLine): number {
  if (line.mate !== null) return mateWinningChances(line.mate);
  return cpWinningChances(Math.round(line.score * 100));
}

/** Beyaz perspektifinde kazanma şansı [-1, +1] */
export function whitePovWinningChances(line: EngineScoreLine, turn: 'w' | 'b'): number {
  const raw = evalWinningChances(line);
  return turn === 'b' ? -raw : raw;
}

/** Eval çubuğu doluluk oranı (0 = siyah, 100 = beyaz) */
export function winningChancesToBarPercent(chances: number): number {
  const c = Math.max(-1, Math.min(1, chances));
  return 50 + 50 * c;
}

export function pvLineToWinningChances(
  line: EngineScoreLine | null | undefined,
  turn: 'w' | 'b',
): number {
  if (!line) return 0;
  return whitePovWinningChances(line, turn);
}

export function formatEngineEvalLabel(
  line: EngineScoreLine | null | undefined,
  turn: 'w' | 'b',
): string {
  if (!line) return '—';
  const flip = turn === 'b' ? -1 : 1;
  if (line.mate !== null) {
    const m = line.mate * flip;
    return m > 0 ? `#${Math.abs(m)}` : `-#${Math.abs(m)}`;
  }
  const s = line.score * flip;
  return `${s >= 0 ? '+' : ''}${s.toFixed(1)}`;
}
