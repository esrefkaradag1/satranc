import React from 'react';
import type { SquareRenderer } from 'react-chessboard';
import {
  glyphBadgeClass,
  groupGlyphEntriesBySquare,
  type GlyphSquareEntry,
} from '../../lib/studyAnnotations';

function GlyphBadge({
  symbol,
  highlighted,
}: {
  symbol: string;
  highlighted: boolean;
}) {
  const compact = symbol.length > 1;
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-full font-black text-white',
        'shadow-[0_2px_6px_rgba(0,0,0,0.5)] ring-1 ring-black/30',
        glyphBadgeClass(symbol),
        highlighted ? 'z-10 scale-110' : '',
        compact
          ? highlighted
            ? 'h-[clamp(20px,36%,30px)] min-w-[clamp(24px,44%,34px)] px-0.5 text-[clamp(10px,50%,13px)]'
            : 'h-[clamp(18px,32%,26px)] min-w-[clamp(22px,40%,30px)] px-0.5 text-[clamp(9px,46%,12px)]'
          : highlighted
            ? 'h-[clamp(24px,42%,34px)] w-[clamp(24px,42%,34px)] text-[clamp(12px,56%,17px)]'
            : 'h-[clamp(20px,36%,30px)] w-[clamp(20px,36%,30px)] text-[clamp(11px,52%,15px)]',
      ].join(' ')}
      title={symbol}
    >
      {symbol}
    </span>
  );
}

/** Kare içinde taşın sağ-üstünde rozet yığını */
export function SquareGlyphBadges({
  glyphs,
  highlightPly,
}: {
  glyphs: GlyphSquareEntry[];
  highlightPly?: number | null;
}) {
  if (glyphs.length === 0) return null;
  return (
    <div
      className="absolute top-0 right-0 z-[40] flex flex-row-reverse items-start gap-[2px] pointer-events-none"
      style={{ transform: 'translate(18%, -18%)' }}
      aria-hidden
    >
      {glyphs.map(({ symbol, ply }, i) => (
        <GlyphBadge
          key={`${ply}-${symbol}-${i}`}
          symbol={symbol}
          highlighted={highlightPly != null && ply === highlightPly}
        />
      ))}
    </div>
  );
}

/**
 * react-chessboard squareRenderer — rozetler taş katmanının üstünde (kare içi z-40).
 */
export function createGlyphSquareRenderer(
  entries: GlyphSquareEntry[],
  squareStyles: Record<string, React.CSSProperties>,
  highlightPly: number | null = null,
): SquareRenderer {
  const bySquare = groupGlyphEntriesBySquare(entries);
  return ({ square, children }) => {
    const sq = square.toLowerCase();
    const glyphs = bySquare.get(sq) ?? [];
    const sqStyle = squareStyles[sq] ?? {};
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          ...sqStyle,
        }}
      >
        {children}
        <SquareGlyphBadges glyphs={glyphs} highlightPly={highlightPly} />
      </div>
    );
  };
}
