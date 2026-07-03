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

const MIN_DEPTH_TO_SHOW = 8;

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

function applyBarHysteresis(prevPercent: number, nextPercent: number): number {
  const prevChances = (prevPercent - 50) / 50;
  const nextChances = (nextPercent - 50) / 50;

  if (nextChances >= 0.92 && prevChances >= 0.85) return Math.max(prevPercent, nextPercent);
  if (nextChances <= -0.92 && prevChances <= -0.85) return Math.min(prevPercent, nextPercent);

  const delta = Math.abs(nextPercent - prevPercent);
  if (delta > 18 && prevChances * nextChances > 0) {
    const maxStep = 12;
    return prevPercent + Math.sign(nextPercent - prevPercent) * maxStep;
  }

  return nextPercent;
}

/**
 * Lichess tarzı eval çubuğu:
 * - Yalnızca derinlik arttığında güncellenir (sığ arama titremesi yok)
 * - Mat bulunduktan sonra cp skoruna geri dönülmez
 * - Pozisyon değişince çubuk sıfırlanmaz; son değer korunur
 * - Kesin avantajda histerezis ile uç değerlerde zıplama azaltılır
 */
export function useStableEvalDisplay(
  fen: string,
  line: EngineScoreLine | null | undefined,
  turn: 'w' | 'b',
  enabled: boolean,
  labelOverride?: string,
): EvalBarDisplay {
  const [display, setDisplay] = useState<EvalBarDisplay>(enabled ? { ...OFF, pending: true, label: '…' } : OFF);

  const fenRef = useRef(fen);
  const committedDepthRef = useRef(0);
  const lockedMateRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDisplay(OFF);
      committedDepthRef.current = 0;
      lockedMateRef.current = null;
      return;
    }

    if (fen !== fenRef.current) {
      fenRef.current = fen;
      committedDepthRef.current = 0;
      lockedMateRef.current = null;
      setDisplay((prev) => ({
        ...prev,
        pending: true,
        label: '…',
      }));
    }

    if (!line) return;

    const depth = line.depth ?? 0;
    if (depth <= 0) return;

    if (depth < committedDepthRef.current) {
      committedDepthRef.current = 0;
    }

    if (depth <= committedDepthRef.current) return;

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

    setDisplay((prev) => {
      const whitePercent = applyBarHysteresis(prev.whitePercent, rawPercent);
      return {
        whitePercent,
        label: labelOverride ?? formatEngineEvalLabel(labelLine, turn),
        winningChances: chances,
        pending: false,
      };
    });

    committedDepthRef.current = depth;
  }, [enabled, fen, turn, line, line?.depth, line?.score, line?.mate, labelOverride]);

  return display;
}
