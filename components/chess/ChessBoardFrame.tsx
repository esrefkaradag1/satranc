import React from 'react';
import { EVAL_BAR_DECISIVE_SCORE, evalBarWhitePercent, formatEvalLabel } from '../../lib/chessBoardUi';

const RANK_SIZE = '1.25rem';
const FILE_SIZE = '1.25rem';
const EVAL_WIDTH = '1.375rem';

export type BoardOrientation = 'white' | 'black';

export { EVAL_BAR_DECISIVE_SCORE, evalBarWhitePercent, formatEvalLabel };

export type EvalBarProps = {
  score: number;
  orientation?: BoardOrientation;
  label?: string;
  className?: string;
  darkClassName?: string;
  lightClassName?: string;
  labelClassName?: string;
};

/** Tahta yüksekliğiyle hizalı dikey eval çubuğu (üst etiket + iki segment) */
export function ChessEvalBar({
  score,
  orientation = 'white',
  label,
  className = '',
  darkClassName = 'bg-[#334155]',
  lightClassName = 'bg-[#f8fafc]',
  labelClassName = 'text-[9px] font-extrabold text-white bg-indigo-600',
}: EvalBarProps) {
  const whiteH = evalBarWhitePercent(score);
  const blackH = 100 - whiteH;
  const flipped = orientation === 'black';
  const display = label ?? formatEvalLabel(score);
  return (
    <div className={`flex flex-col h-full min-h-0 w-full overflow-hidden ${className}`}>
      <span
        className={`shrink-0 w-full text-center py-1 border-b border-white/10 uppercase tracking-tighter tabular-nums leading-tight ${labelClassName}`}
        title={display}
      >
        {display}
      </span>
      <div className={`flex-1 min-h-0 w-full flex ${flipped ? 'flex-col-reverse' : 'flex-col'}`}>
        <div
          className={`${darkClassName} transition-[height] duration-200 ease-out shrink-0`}
          style={{ height: `${blackH}%` }}
          title="Siyah avantajı"
          aria-hidden
        />
        <div className={`${lightClassName} transition-[height] duration-200 ease-out flex-1 min-h-0`} title="Beyaz avantajı" aria-hidden />
      </div>
    </div>
  );
}

export type ChessBoardFrameProps = {
  boardOrientation?: BoardOrientation;
  children: React.ReactNode;
  /** Eval çubuğu — yalnızca tahta satırı yüksekliğinde uzanır */
  evalBar?: React.ReactNode;
  /** Eval sütun genişliği (varsayılan 1.375rem) */
  evalColumnWidth?: string;
  /** true: dış koordinatlar gizlenir (küçük önizlemeler) */
  hideCoordinates?: boolean;
  className?: string;
  boardClassName?: string;
  shellClassName?: string;
};

/**
 * Tahta + dış koordinatlar (rakam/harf) + isteğe bağlı eval çubuğu.
 * react-chessboard iç notasyonu kapalı kalmalı (showNotation: false).
 */
export function ChessBoardFrame({
  boardOrientation = 'white',
  children,
  evalBar,
  evalColumnWidth = EVAL_WIDTH,
  hideCoordinates = false,
  className = '',
  boardClassName = '',
  shellClassName = '',
}: ChessBoardFrameProps) {
  const ranks = boardOrientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const hasEval = !!evalBar;
  const showCoords = !hideCoordinates;
  const evalW = evalColumnWidth;

  const gridCols = (() => {
    if (!showCoords && !hasEval) return 'minmax(0, 1fr)';
    if (!showCoords && hasEval) return `${evalW} minmax(0, 1fr)`;
    if (showCoords && !hasEval) return `${RANK_SIZE} minmax(0, 1fr)`;
    return `${evalW} ${RANK_SIZE} minmax(0, 1fr)`;
  })();

  const boardCol = hasEval && showCoords ? 3 : hasEval ? 2 : showCoords ? 2 : 1;
  const rankCol = hasEval ? 2 : 1;
  const fileRow = showCoords ? 2 : 1;

  return (
    <div
      className={`w-full min-w-0 ${className}`}
      style={{
        display: 'grid',
        gridTemplateColumns: gridCols,
        gridTemplateRows: showCoords ? 'auto auto' : 'auto',
        alignItems: 'stretch',
      }}
    >
      {hasEval && (
        <div
          className={`col-start-1 row-start-1 flex flex-col min-h-0 self-stretch overflow-hidden ${shellClassName}`}
          style={{ gridColumn: 1, gridRow: 1 }}
        >
          {evalBar}
        </div>
      )}

      {showCoords && (
        <div
          className="row-start-1 flex flex-col justify-between items-center self-stretch min-h-0 text-[11px] font-bold text-slate-500 select-none py-px"
          style={{ gridColumn: rankCol, gridRow: 1 }}
          aria-hidden
        >
          {ranks.map((r) => (
            <span key={r} className="leading-none tabular-nums">
              {r}
            </span>
          ))}
        </div>
      )}

      <div
        className={`relative w-full min-w-0 aspect-square ${boardClassName}`}
        style={{ gridColumn: boardCol, gridRow: 1 }}
      >
        {children}
      </div>

      {showCoords && (
        <>
          <div style={{ gridColumn: rankCol, gridRow: fileRow, height: FILE_SIZE }} className="shrink-0" aria-hidden />
          <div
            className="flex items-center justify-around text-[11px] font-bold text-slate-500 select-none px-0.5"
            style={{ gridColumn: boardCol, gridRow: fileRow, height: FILE_SIZE }}
            aria-hidden
          >
            {files.map((f) => (
              <span key={f} className="flex-1 text-center leading-none">
                {f}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
