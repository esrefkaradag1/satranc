import React from 'react';
import { FIGURINE_PIECE_IMG, parseSanFigurineSegments } from '../../lib/chessFigurine';

type Props = {
  san: string;
  /** false ise ham harf SAN gösterilir */
  figurine?: boolean;
  className?: string;
  /** Taş ikon boyutu — varsayılan biraz büyük */
  iconSize?: 'sm' | 'md' | 'lg';
};

const ICON_SIZE: Record<NonNullable<Props['iconSize']>, string> = {
  sm: 'h-[0.95em] w-[0.95em] min-w-[0.95em]',
  md: 'h-[1.2em] w-[1.2em] min-w-[1.2em]',
  lg: 'h-[1.35em] w-[1.35em] min-w-[1.35em]',
};

/** Hamle metnini Lichess tarzı taş ikonları + metin olarak gösterir. */
export const FigurineSan: React.FC<Props> = ({
  san,
  figurine = true,
  className = '',
  iconSize = 'md',
}) => {
  if (!figurine) {
    return <span className={className}>{san}</span>;
  }

  const segments = parseSanFigurineSegments(san);
  const hasPieceIcon = segments.some((s) => s.type === 'piece');

  if (!hasPieceIcon) {
    return <span className={`font-bold tracking-wide ${className}`}>{san}</span>;
  }

  const iconCls = ICON_SIZE[iconSize];

  return (
    <span className={`inline-flex items-center gap-0.5 font-bold tracking-wide leading-none ${className}`}>
      {segments.map((seg, i) => {
        if (seg.type === 'piece') {
          return (
            <img
              key={`p-${i}-${seg.letter}`}
              src={FIGURINE_PIECE_IMG(seg.letter)}
              alt={seg.letter}
              draggable={false}
              className={`${iconCls} inline-block object-contain shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)] brightness-110 contrast-125 -translate-y-[0.04em]`}
            />
          );
        }
        return (
          <span key={`t-${i}`} className="whitespace-pre">
            {seg.value}
          </span>
        );
      })}
    </span>
  );
};
