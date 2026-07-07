import React from 'react';
import { useApp } from '../../AppContext';
import { canShowStudentCounts, formatStudentCountLabel, formatStudentCountPairLabel } from '../../lib/studentCountVisibility';

type CountProps = {
  count: number;
  suffix?: string;
  className?: string;
  /** Yetkisiz rolde hiç render etme (varsayılan) */
  hideWhenMasked?: boolean;
  /** Yetkisiz rolde gösterilecek alternatif metin */
  fallback?: React.ReactNode;
};

export const StudentCountText: React.FC<CountProps> = ({
  count,
  suffix = 'öğrenci',
  className,
  hideWhenMasked = true,
  fallback = null,
}) => {
  const { auth } = useApp();
  const label = formatStudentCountLabel(count, auth, { suffix });
  if (!label) {
    if (hideWhenMasked) return fallback ? <>{fallback}</> : null;
    return <span className={className}>{fallback}</span>;
  }
  return <span className={className}>{label}</span>;
};

type PairProps = {
  current: number;
  total: number;
  suffix?: string;
  className?: string;
  hideWhenMasked?: boolean;
  fallback?: React.ReactNode;
};

export const StudentCountPairText: React.FC<PairProps> = ({
  current,
  total,
  suffix = 'öğrenci',
  className,
  hideWhenMasked = true,
  fallback = null,
}) => {
  const { auth } = useApp();
  const label = formatStudentCountPairLabel(current, total, auth, suffix);
  if (!label) {
    if (hideWhenMasked) return fallback ? <>{fallback}</> : null;
    return <span className={className}>{fallback}</span>;
  }
  return <span className={className}>{label}</span>;
};

export function useCanShowStudentCounts(): boolean {
  const { auth } = useApp();
  return canShowStudentCounts(auth);
}
