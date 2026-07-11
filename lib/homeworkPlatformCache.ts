import type { PlatformDayStats } from './homeworkPlatformUtils';
import { mergePlatformDayStats } from './homeworkPlatformUtils';
import { todayDayKey } from './homeworkDayUtils';

const CACHE_KEY = 'chees_coach_platform_stats_v1';
const CACHE_MAX_AGE_DAYS = 21;

export type CoachPlatformCachePayload = {
  stats: Record<string, Record<string, PlatformDayStats>>;
  timeSeconds: Record<string, Record<string, number>>;
  updatedAt: string;
};

/**
 * Kalıcı depo: localStorage (tarayıcı/sekme kapansa da korunur).
 * Geçmiş günler yeniden sorgulandığında platform API'leri eski veriyi getiremediği
 * için (lifetime delta sıfırlanır, son ~25 bulmaca listesi) önceden çekilen doğru
 * veri burada saklanır ve üstüne 0 yazılmaz.
 */
function cacheStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function pruneByIsoDate<T>(
  byStudent: Record<string, Record<string, T>>,
  cutoffIso: string,
): Record<string, Record<string, T>> {
  const out: Record<string, Record<string, T>> = {};
  for (const [sid, byDate] of Object.entries(byStudent)) {
    const kept: Record<string, T> = {};
    for (const [iso, val] of Object.entries(byDate ?? {})) {
      if (iso >= cutoffIso) kept[iso] = val;
    }
    if (Object.keys(kept).length > 0) out[sid] = kept;
  }
  return out;
}

function parseCachePayload(raw: string | null): CoachPlatformCachePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CoachPlatformCachePayload;
    if (!parsed || typeof parsed !== 'object' || !parsed.stats) return null;
    return {
      stats: parsed.stats ?? {},
      timeSeconds: parsed.timeSeconds ?? {},
      updatedAt: parsed.updatedAt ?? '',
    };
  } catch {
    return null;
  }
}

export function readCoachPlatformCache(): CoachPlatformCachePayload | null {
  const store = cacheStore();
  if (!store) return null;
  const fromLocal = parseCachePayload(store.getItem(CACHE_KEY));
  // Eski sessionStorage kayıtlarını localStorage'a taşı (geçiş yedeği).
  let fromSession: CoachPlatformCachePayload | null = null;
  try {
    fromSession = parseCachePayload(window.sessionStorage.getItem(CACHE_KEY));
  } catch {
    fromSession = null;
  }
  if (!fromLocal) return fromSession;
  if (!fromSession) return fromLocal;
  return {
    stats: mergePlatformWeekStatsStore(fromLocal.stats, fromSession.stats),
    timeSeconds: mergePlatformWeekTimeStore(fromLocal.timeSeconds, fromSession.timeSeconds),
    updatedAt: new Date().toISOString(),
  };
}

export function writeCoachPlatformCache(
  stats: Record<string, Record<string, PlatformDayStats>>,
  timeSeconds: Record<string, Record<string, number>>,
): void {
  const store = cacheStore();
  if (!store) return;
  try {
    // Var olan kayıtla birleştir: başka bir sekme/oturumun verisini ezme.
    const existing = parseCachePayload(store.getItem(CACHE_KEY));
    const mergedStats = existing
      ? mergePlatformWeekStatsStore(existing.stats, stats)
      : stats;
    const mergedTime = existing
      ? mergePlatformWeekTimeStore(existing.timeSeconds, timeSeconds)
      : timeSeconds;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CACHE_MAX_AGE_DAYS);
    const cutoffIso = todayDayKey(cutoff);
    const payload: CoachPlatformCachePayload = {
      stats: pruneByIsoDate(mergedStats, cutoffIso),
      timeSeconds: pruneByIsoDate(mergedTime, cutoffIso),
      updatedAt: new Date().toISOString(),
    };
    store.setItem(CACHE_KEY, JSON.stringify(payload));
    try {
      window.sessionStorage.removeItem(CACHE_KEY);
    } catch {
      /* yok say */
    }
  } catch {
    /* quota / private mode */
  }
}

export function mergePlatformActivitySeconds(prev: number | undefined, next: number): number {
  if (prev == null || !Number.isFinite(prev)) return Math.max(0, next);
  if (!Number.isFinite(next)) return prev;
  return Math.max(prev, next);
}

/** Önceki öğrenci/gün kayıtlarını koruyarak yeni platform sayılarını birleştir. */
export function mergePlatformWeekStatsStore(
  prev: Record<string, Record<string, PlatformDayStats>>,
  patch: Record<string, Record<string, PlatformDayStats>>,
): Record<string, Record<string, PlatformDayStats>> {
  const next: Record<string, Record<string, PlatformDayStats>> = { ...prev };
  for (const [sid, byDate] of Object.entries(patch)) {
    next[sid] = { ...(next[sid] ?? {}) };
    for (const [iso, stats] of Object.entries(byDate)) {
      next[sid][iso] = mergePlatformDayStats(next[sid][iso], stats);
    }
  }
  return next;
}

export function mergePlatformWeekTimeStore(
  prev: Record<string, Record<string, number>>,
  patch: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  const next: Record<string, Record<string, number>> = { ...prev };
  for (const [sid, byDate] of Object.entries(patch)) {
    next[sid] = { ...(next[sid] ?? {}) };
    for (const [iso, sec] of Object.entries(byDate)) {
      next[sid][iso] = mergePlatformActivitySeconds(next[sid][iso], sec);
    }
  }
  return next;
}

export function loadCoachPlatformCacheIntoRefs(
  statsRef: { current: Record<string, Record<string, PlatformDayStats>> },
  timeRef: { current: Record<string, Record<string, number>> },
): CoachPlatformCachePayload | null {
  const cached = readCoachPlatformCache();
  if (!cached) return null;
  statsRef.current = cached.stats;
  timeRef.current = cached.timeSeconds;
  return cached;
}
