import React from 'react';

interface ResponsiveTableProps {
  children: React.ReactNode;
  /** Masaüstünde yatay kaydırma için minimum tablo genişliği (px) */
  minWidth?: number;
  className?: string;
}

/**
 * Mobil: satırları kart olarak gösterir (`td[data-label]` gerekir).
 * Masaüstü: gerekirse yatay kaydırma.
 */
export const ResponsiveTable: React.FC<ResponsiveTableProps> = ({
  children,
  minWidth = 600,
  className = '',
}) => (
  <div
    className={`responsive-table-shell ${className}`.trim()}
    style={{ ['--rt-min-width' as string]: `${minWidth}px` }}
  >
    <div className="responsive-table-inner">{children}</div>
  </div>
);

export default ResponsiveTable;
