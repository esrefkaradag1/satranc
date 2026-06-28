import React from 'react';
import type { PgnTagPair } from '../../lib/studyPgnTags';
import { pgnResultNotationFooter } from '../../lib/studyPgnTags';

type Props = {
  pgnTags?: PgnTagPair[];
  compact?: boolean;
  className?: string;
};

/** Lichess — hamle listesi altında Result + açıklama. */
export const StudyNotationPgnFooter: React.FC<Props> = ({ pgnTags, compact = false, className = '' }) => {
  const footer = pgnResultNotationFooter(pgnTags);
  if (!footer) return null;

  return (
    <div
      className={`mt-2 pt-3 border-t border-white/10 text-center ${compact ? 'px-1' : 'px-2'} ${className}`}
    >
      <p className={`font-bold text-slate-200 tabular-nums ${compact ? 'text-sm' : 'text-base'}`}>
        {footer.result}
      </p>
      {footer.subtitle ? (
        <p className={`italic text-slate-500 mt-0.5 ${compact ? 'text-[11px]' : 'text-sm'}`}>
          {footer.subtitle}
        </p>
      ) : null}
    </div>
  );
};
