import { useEffect, useRef, useState } from 'react';
import {
  formatEngineEvalLabel,
  mateWinningChances,
  pvLineToWinningChances,
  winningChancesToBarPercent,
  type EngineScoreLine,
} from '../lib/winningChances';

export type EvalBarDisplay = {
  whitePercent: number;
  label: string;
  winningChances: number;
  pending: boolean;
};

const OFF: EvalBarDisplay = {
  whitePercent: 50,
  label: '—',
  winningChances: 0,
  pending: false,
};

const MIN_DEPTH_TO_SHOW = 6;

export function evalBarEqual(a: EvalBarDisplay, b: EvalBarDisplay): boolean {
  return (
    a.whitePercent === b.whitePercent
    && a.label === b.label
    && a.winningChances === b.winningChances
    && a.pending === b.pending
  );
}

/** Beyaz perspektifinde mat mesafesi (+ = beyaz mat eder) */
function whitePovMate(line: EngineScoreLine, turn: 'w' | 'b'): number | null {
  if (line.mate === null) return null;
  return turn === 'b' ? -line.mate : line.mate;
}

function chancesFromLine(
  line: EngineScoreLine,
  turn: 'w' | 'b',
  lockedMate: number | null,
): number {
  const liveMate = whitePovMate(line, turn);
  if (liveMate !== null) return mateWinningChances(liveMate);
  if (lockedMate !== null) return mateWinningChances(lockedMate);
  return pvLineToWinningChances(line, turn);
}

/**
 * Lichess (lila) eval çubuğu mantığı — birebir:
 * - Değer = en iyi hattın `povChances` (kazanma şansı) değeri; ham cp titremesi değil
 * - Yalnızca daha derin bir değerlendirme geldiğinde hedef güncellenir
 * - Mat bulunduktan sonra cp skoruna geri dönülmez
 * - Pozisyon değişince çubuk nötr (%50) olur; yeni motor sonucu gelene kadar bekler
 * - Yumuşatma tek katmanda yapılır: ChessEvalBar CSS geçişi (transition: height 1s)
 *   Lichess'te olduğu gibi hedef doğrudan atanır, histerezis/step-cap yoktur.
 */
export function useStableEvalDisplay(
  fen: string,
  line: EngineScoreLine | null | undefined,
  turn: 'w' | 'b',
  enabled: boolean,
  labelOverride?: string,
): EvalBarDisplay {
  const [display, setDisplay] = useState<EvalBarDisplay>(enabled ? { ...OFF, pending: true, label: '…' } : OFF);
  const displayRef = useRef(display);
  displayRef.current = display;

  const commitDisplay = (next: EvalBarDisplay) => {
    if (evalBarEqual(displayRef.current, next)) return;
    displayRef.current = next;
    setDisplay(next);
  };

  const fenRef = useRef(fen);
  const committedDepthRef = useRef(0);
  const lockedMateRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (!evalBarEqual(displayRef.current, OFF)) {
        committedDepthRef.current = 0;
        lockedMateRef.current = null;
        commitDisplay(OFF);
      }
      return;
    }

    if (fen !== fenRef.current) {
      fenRef.current = fen;
      committedDepthRef.current = 0;
      lockedMateRef.current = null;
      commitDisplay({
        whitePercent: 50,
        label: '…',
        winningChances: 0,
        pending: true,
      });
      return;
    }

    if (!line) return;

    const depth = line.depth ?? 0;
    if (depth <= 0) return;

    if (depth < committedDepthRef.current) {
      committedDepthRef.current = 0;
    }

    if (depth < committedDepthRef.current) return;

    if (depth < MIN_DEPTH_TO_SHOW && committedDepthRef.current === 0) return;

    const liveMate = whitePovMate(line, turn);
    if (liveMate !== null) {
      const prev = lockedMateRef.current;
      if (
        prev === null
        || Math.sign(liveMate) !== Math.sign(prev)
        || Math.abs(liveMate) < Math.abs(prev)
      ) {
        lockedMateRef.current = liveMate;
      }
    }

    const chances = chancesFromLine(line, turn, lockedMateRef.current);
    const rawPercent = winningChancesToBarPercent(chances);
    const labelLine =
      lockedMateRef.current !== null && line.mate === null
        ? { ...line, mate: turn === 'b' ? -lockedMateRef.current : lockedMateRef.current }
        : line;

    commitDisplay({
      whitePercent: rawPercent,
      label: labelOverride ?? formatEngineEvalLabel(labelLine, turn),
      winningChances: chances,
      pending: false,
    });

    committedDepthRef.current = depth;
  }, [enabled, fen, turn, line, line?.depth, line?.score, line?.mate, labelOverride]);

  return display;
}
