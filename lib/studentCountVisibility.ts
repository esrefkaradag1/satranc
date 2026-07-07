import type { AuthUser } from '../types';

/** Öğrenci sayısı yalnızca yönetici ve antrenör tarafından görülebilir (kendi kapsamları). */
export function canShowStudentCounts(auth: AuthUser | null | undefined): boolean {
  return auth?.role === 'admin' || auth?.role === 'coach';
}

export function maskStudentCount(
  count: number,
  auth: AuthUser | null | undefined,
  mask = '—',
): string {
  return canShowStudentCounts(auth) ? String(count) : mask;
}

export function formatStudentCountLabel(
  count: number,
  auth: AuthUser | null | undefined,
  opts?: { suffix?: string; hidden?: string },
): string {
  if (!canShowStudentCounts(auth)) return opts?.hidden ?? '';
  const suffix = opts?.suffix ?? 'öğrenci';
  return `${count} ${suffix}`;
}

export function formatStudentCountPair(
  current: number,
  total: number,
  auth: AuthUser | null | undefined,
): string | null {
  if (!canShowStudentCounts(auth)) return null;
  return `${current}/${total}`;
}

export function formatStudentCountPairLabel(
  current: number,
  total: number,
  auth: AuthUser | null | undefined,
  suffix = 'öğrenci',
): string {
  const pair = formatStudentCountPair(current, total, auth);
  if (!pair) return '';
  return suffix ? `${pair} ${suffix}` : pair;
}

export function maskStudentCountDisplay(
  count: number,
  auth: AuthUser | null | undefined,
  mask = '—',
): string {
  return canShowStudentCounts(auth) ? String(count) : mask;
}

export function maskStudentCountPairDisplay(
  current: number,
  total: number,
  auth: AuthUser | null | undefined,
  mask = '—',
): string {
  return canShowStudentCounts(auth) ? `${current}/${total}` : mask;
}
