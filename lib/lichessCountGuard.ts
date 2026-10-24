/**
 * Lichess gün sayısı güven politikası.
 *
 * Eski hata: 429 / eksik `until` ile 0 yazılıyor, gün kapanınca DB/önbellek
 * "tamam" sayılıp bir daha çekilmiyordu. Bu sürüm damgası olmadan kayıt
 * güvenilir değildir; 429 kaydı da güvenilir değildir.
 */
export const PLATFORM_LICHESS_COUNT_VERSION = 3;

export type LichessCountTrustInput = {
  lichessError?: boolean;
  lichessCountVersion?: number;
  lichessGames?: number;
  chessComGames?: number;
};

/** Kapalı gün API'sini atlamak yalnızca güvenilir kayıtlarda serbest. */
export function isTrustedPlatformDayStats(
  stats: LichessCountTrustInput | undefined | null,
): boolean {
  if (!stats) return false;
  if (stats.lichessError) return false;
  return (stats.lichessCountVersion ?? 0) >= PLATFORM_LICHESS_COUNT_VERSION;
}

export function lichessCountVersionAfterFetch(opts: {
  lichessError?: boolean;
  hasLichessUser?: boolean;
}): number | undefined {
  if (opts.hasLichessUser && opts.lichessError) return undefined;
  return PLATFORM_LICHESS_COUNT_VERSION;
}

export function pickLichessGameCount(...counts: Array<number | undefined | null>): number {
  let best = 0;
  for (const n of counts) {
    const v = Number(n);
    if (Number.isFinite(v) && v > best) best = v;
  }
  return best;
}

export function mergedLichessCountVersion(
  prev: LichessCountTrustInput | undefined,
  next: LichessCountTrustInput,
): number | undefined {
  const nextEmpty =
    (next.lichessGames ?? 0) === 0
    && (next.lichessCountVersion == null || next.lichessError);
  if (next.lichessError && nextEmpty) {
    return prev?.lichessCountVersion;
  }
  const a = prev?.lichessCountVersion ?? 0;
  const b = next.lichessCountVersion ?? 0;
  const max = Math.max(a, b);
  return max > 0 ? max : undefined;
}

export function assertLichessCountGuard(): void {
  const fail: string[] = [];
  if (isTrustedPlatformDayStats(undefined)) fail.push('empty-trusted');
  if (isTrustedPlatformDayStats({ lichessGames: 0, chessComGames: 7 })) fail.push('poison-v0');
  if (isTrustedPlatformDayStats({ lichessError: true, lichessCountVersion: 3, lichessGames: 24 })) {
    fail.push('error-trusted');
  }
  if (!isTrustedPlatformDayStats({ lichessCountVersion: 3, lichessGames: 0 })) fail.push('real-zero');
  if (pickLichessGameCount(0, 11, 24) !== 24) fail.push('pick-max');
  if (lichessCountVersionAfterFetch({ hasLichessUser: true, lichessError: true }) != null) {
    fail.push('stamp-on-error');
  }
  if (lichessCountVersionAfterFetch({ hasLichessUser: true, lichessError: false }) !== 3) {
    fail.push('stamp-ok');
  }
  if (fail.length > 0) {
    throw new Error(`[lichessCountGuard] ${fail.join(', ')}`);
  }
}

assertLichessCountGuard();
