import React from 'react';

const GOLD = '#E8B923';
const EMBLEM_SRC = '/satrancedu-emblem.png';

type Props = {
  /** Tam marka (ikon + metin) veya yalnızca amblem */
  variant?: 'full' | 'icon';
  className?: string;
  /** Dar sidebar için alt başlığı gizle */
  compact?: boolean;
};

function BrandEmblem({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <img
      src={EMBLEM_SRC}
      alt=""
      className={`object-contain shrink-0 ${className}`}
      draggable={false}
    />
  );
}

export const SatrancEduLogo: React.FC<Props> = ({
  variant = 'full',
  className = '',
  compact = false,
}) => {
  if (variant === 'icon') {
    return (
      <span className={`inline-flex shrink-0 ${className}`}>
        <BrandEmblem className="h-10 w-10" />
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 min-w-0 ${className}`}>
      <BrandEmblem className="h-10 w-10" />
      <span className="flex flex-col min-w-0 text-left leading-none">
        <span className="text-[17px] font-bold tracking-[-0.01em] whitespace-nowrap leading-tight">
          <span className="text-white">Satranc</span>
          <span style={{ color: GOLD }}>Edu</span>
        </span>
        {!compact && (
          <span className="text-[11px] font-normal text-white mt-[3px] whitespace-nowrap leading-tight">
            Satranç Eğitim Platformu
          </span>
        )}
      </span>
    </span>
  );
};

export default SatrancEduLogo;
