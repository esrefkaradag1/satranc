import React from 'react';

export type MainlineMoveRow = {
  num: number;
  white: string;
  black: string;
  whitePly?: number;
  blackPly?: number;
  blackOnlyFirst?: boolean;
};

/** SAN dizisinden Lichess tarzı beyaz/siyah satırları üretir. */
export function buildMainlineMoveRows(
  moves: string[],
  startsWithWhite = true,
  startMoveNumber = 1,
): MainlineMoveRow[] {
  const rows: MainlineMoveRow[] = [];
  let ply = 0;
  let moveNumber = startMoveNumber;

  if (!startsWithWhite && moves.length > 0) {
    rows.push({
      num: moveNumber,
      white: '',
      black: moves[0] ?? '',
      blackPly: 0,
      blackOnlyFirst: true,
    });
    ply = 1;
    moveNumber++;
  }

  for (let i = ply; i < moves.length; i += 2) {
    rows.push({
      num: moveNumber,
      white: moves[i] ?? '',
      black: moves[i + 1] ?? '',
      whitePly: i,
      blackPly: moves[i + 1] ? i + 1 : undefined,
    });
    moveNumber++;
  }

  return rows;
}

type MainlineMoveGridProps = {
  moves: string[];
  startsWithWhite?: boolean;
  startMoveNumber?: number;
  /** Aktif yarım hamle (1 = ilk hamle sonrası); 0 = başlangıç */
  activeHalfMove?: number | null;
  /** Hover önizlemesi için yarım hamle */
  hoverHalfMove?: number | null;
  compact?: boolean;
  showHeader?: boolean;
  className?: string;
  onSelectHalfMove?: (halfMove: number) => void;
  onHoverHalfMove?: (halfMove: number | null) => void;
};

export const MainlineMoveGrid: React.FC<MainlineMoveGridProps> = ({
  moves,
  startsWithWhite = true,
  startMoveNumber = 1,
  activeHalfMove = null,
  hoverHalfMove = null,
  compact = false,
  showHeader = true,
  className = '',
  onSelectHalfMove,
  onHoverHalfMove,
}) => {
  const rows = buildMainlineMoveRows(moves, startsWithWhite, startMoveNumber);
  const textSize = compact ? 'text-[11px]' : 'text-[13px]';
  const rowGrid = 'grid grid-cols-[2rem_1fr_1fr] gap-x-1.5 items-stretch w-full';
  const indexCell = `text-[11px] font-bold text-slate-500 text-right pr-1.5 tabular-nums bg-slate-800/50 flex items-center justify-end ${compact ? 'py-1' : 'py-1.5'}`;
  const moveCell = `min-w-0 flex items-center ${compact ? 'py-0.5' : 'py-1'}`;

  const renderMove = (san: string, halfMove: number) => {
    const ply = halfMove + 1;
    const isActive = activeHalfMove === ply;
    const isHover = hoverHalfMove === ply;
    const interactive = !!onSelectHalfMove;

    const inner = (
      <span
        className={`inline-flex px-1.5 rounded font-bold font-mono transition-colors ${
          isActive
            ? 'bg-[#3692e7] text-white'
            : isHover
            ? 'bg-sky-500/25 text-white'
            : interactive
            ? 'text-slate-200 hover:bg-white/10 cursor-pointer'
            : 'text-slate-200'
        }`}
      >
        {san}
      </span>
    );

    if (!interactive) return inner;

    return (
      <button
        type="button"
        className="text-left min-w-0"
        onClick={() => onSelectHalfMove?.(ply)}
        onMouseEnter={() => onHoverHalfMove?.(ply)}
        onMouseLeave={() => onHoverHalfMove?.(null)}
      >
        {inner}
      </button>
    );
  };

  if (!moves.length) {
    return <p className={`text-slate-500 ${textSize}`}>—</p>;
  }

  return (
    <div
      className={`${textSize} font-sans text-slate-300 select-none space-y-0.5 ${className}`}
      onMouseLeave={onHoverHalfMove ? () => onHoverHalfMove(null) : undefined}
    >
      {showHeader && (
        <div className={`${rowGrid} pb-1 mb-1 border-b border-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-500`}>
          <span />
          <span>Beyaz</span>
          <span>Siyah</span>
        </div>
      )}
      {rows.map((row) => (
        <div key={`${row.num}-${row.whitePly ?? 'b'}`} className={rowGrid}>
          <span className={indexCell}>{row.num}</span>
          <div className={moveCell}>
            {row.white && row.whitePly !== undefined ? renderMove(row.white, row.whitePly) : null}
          </div>
          <div className={moveCell}>
            {row.blackOnlyFirst ? (
              <>
                <span className="text-slate-500 font-bold tabular-nums mr-1">{row.num}...</span>
                {row.blackPly !== undefined ? renderMove(row.black, row.blackPly) : null}
              </>
            ) : row.black && row.blackPly !== undefined ? (
              renderMove(row.black, row.blackPly)
            ) : (
              <span className="text-slate-600">…</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
