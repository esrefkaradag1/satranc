/**
 * Lichess upstream isteklerini sıraya alır (sunucu tarafı 429 önleme).
 *
 * Lichess dokümantasyonu: "Only make one request at a time. If you receive 429,
 * waiting one minute before retrying will be sufficient." Bu modül:
 *  - Aynı anda tek upstream isteği (promise zinciri)
 *  - İstekler arası minimum boşluk
 *  - 429'da Retry-After (veya 60 sn) global backoff
 *  - Taze/stale bellek + DB önbelleği ile gereksiz tekrar çağrıları engeller
 */

import { readLichessApiCache, writeLichessApiCache } from './lichessApiCacheDb.mjs';

let chain = Promise.resolve();
let lastDoneAt = 0;
let backoffUntil = 0;

/** Ardışık istekler arası boşluk — Lichess tek-tek ister; 2.5 sn güvenli aralık. */
const MIN_GAP_MS = 2500;
/** Retry-After yoksa varsayılan bekleme (Lichess: "in most cases, waiting one minute"). */
const DEFAULT_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const USER_PROFILE_CACHE_TTL_MS = 45 * 60 * 1000;
const ACTIVITY_CACHE_TTL_MS = 30 * 60 * 1000;
const GAMES_CACHE_TTL_MS = 15 * 60 * 1000;

/** Aynı sunucu örneğinde Lichess yanıtlarını önbelleğe al (canlıda 429 sonrası stale servis). */
const responseCache = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Lichess 429 Retry-After: saniye (sayı) veya HTTP-date. */
function parseRetryAfterMs(headerValue) {
  if (headerValue == null || headerValue === '') return null;
  const raw = String(headerValue).trim();
  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(MAX_BACKOFF_MS, Math.max(DEFAULT_BACKOFF_MS, Math.round(asSeconds * 1000)));
  }
  const when = Date.parse(raw);
  if (Number.isFinite(when)) {
    const delta = when - Date.now();
    if (delta > 0) return Math.min(MAX_BACKOFF_MS, Math.max(DEFAULT_BACKOFF_MS, delta));
  }
  return null;
}

function applyBackoff(retryAfterHeader) {
  const fromHeader = parseRetryAfterMs(retryAfterHeader);
  const wait = fromHeader ?? DEFAULT_BACKOFF_MS;
  backoffUntil = Math.max(backoffUntil, Date.now() + wait);
}

function cacheTtlForPath(path) {
  if (/^user\/[A-Za-z0-9_-]{1,30}$/.test(path)) return USER_PROFILE_CACHE_TTL_MS;
  if (/^user\/[A-Za-z0-9_-]{1,30}\/activity$/.test(path)) return ACTIVITY_CACHE_TTL_MS;
  if (/^games\/user\/[A-Za-z0-9_-]{1,30}$/.test(path)) return GAMES_CACHE_TTL_MS;
  return 0;
}

function softEmptyBodyForPath(path) {
  if (/^games\/user\//.test(path)) return '';
  return '[]';
}

function readCachedResponse(cacheKey, { allowStale = false } = {}) {
  const hit = responseCache.get(cacheKey);
  if (!hit) return null;
  if (hit.expiresAt > Date.now()) return hit;
  if (allowStale || hit.stale) return hit;
  return null;
}

function writeCachedResponse(cacheKey, entry, ttlMs) {
  if (ttlMs <= 0) return;
  const prev = responseCache.get(cacheKey);
  responseCache.set(cacheKey, {
    status: entry.status,
    body: entry.body,
    contentType: entry.contentType || 'application/json',
    expiresAt: Date.now() + ttlMs,
    stale: false,
    backup:
      entry.status >= 200 && entry.status < 300
        ? { status: entry.status, body: entry.body, contentType: entry.contentType || 'application/json' }
        : prev?.backup ?? null,
  });
}

function pickStaleFallback(cacheKey, persisted) {
  const mem = readCachedResponse(cacheKey, { allowStale: true });
  if (mem?.body && mem.status >= 200 && mem.status < 300) {
    return { status: mem.status, body: mem.body, contentType: mem.contentType || 'application/json' };
  }
  const memBackup = responseCache.get(cacheKey)?.backup;
  if (memBackup?.body) return memBackup;
  if (persisted?.body && persisted.status >= 200 && persisted.status < 300) {
    return {
      status: persisted.status,
      body: persisted.body,
      contentType: persisted.contentType || 'application/json',
    };
  }
  return null;
}

function markCacheStale(cacheKey) {
  const hit = responseCache.get(cacheKey);
  if (!hit) return;
  responseCache.set(cacheKey, { ...hit, stale: true, expiresAt: Date.now() + USER_PROFILE_CACHE_TTL_MS });
}

export function isAllowedLichessPath(path) {
  if (!path || path.includes('..')) return false;
  return (
    /^user\/[A-Za-z0-9_-]{1,30}$/.test(path)
    || /^user\/[A-Za-z0-9_-]{1,30}\/activity$/.test(path)
    || /^games\/user\/[A-Za-z0-9_-]{1,30}$/.test(path)
    || /^game\/export\/[a-zA-Z0-9]+$/.test(path)
  );
}

export function getLichessBackoffRemainingMs() {
  return Math.max(0, backoffUntil - Date.now());
}

export async function lichessProxyRequest(apiPath, searchParams, accept = 'application/json', env = process.env) {
  const path = String(apiPath ?? '').replace(/^\/+/, '');
  if (!isAllowedLichessPath(path)) {
    return { status: 400, body: JSON.stringify({ error: 'Geçersiz Lichess API yolu' }), contentType: 'application/json' };
  }
  const qs = new URLSearchParams(searchParams ?? undefined);
  qs.delete('path');
  const softFail = qs.get('soft') === '1';
  /** Tek oyun PGN — /api/ değil, kök /game/export/ (Lichess dokümantasyonu). */
  const exportMatch = path.match(/^game\/export\/([a-zA-Z0-9]+)$/);
  const upstreamUrl = exportMatch
    ? `https://lichess.org/game/export/${exportMatch[1]}${qs.toString() ? `?${qs}` : ''}`
    : `https://lichess.org/api/${path}${qs.toString() ? `?${qs}` : ''}`;
  const cacheKey = upstreamUrl;
  const cacheTtl = cacheTtlForPath(path);

  const cached = cacheTtl > 0 ? readCachedResponse(cacheKey) : null;
  if (cached && !cached.stale) {
    return {
      status: cached.status,
      body: cached.body,
      contentType: cached.contentType || 'application/json',
    };
  }

  let persisted = null;
  if (cacheTtl > 0) {
    persisted = await readLichessApiCache(cacheKey, env);
    if (persisted && !persisted.stale) {
      writeCachedResponse(cacheKey, persisted, cacheTtl);
      return {
        status: persisted.status,
        body: persisted.body,
        contentType: persisted.contentType || 'application/json',
      };
    }
  }

  if (Date.now() < backoffUntil && cacheTtl > 0) {
    const stale = pickStaleFallback(cacheKey, persisted);
    if (stale) {
      return stale;
    }
    if (softFail) {
      return {
        status: 200,
        body: softEmptyBodyForPath(path),
        contentType: path.startsWith('games/') ? 'application/x-ndjson' : 'application/json',
        rateLimited: true,
      };
    }
  }

  const upstream = await fetchLichessUpstream(upstreamUrl, {
    headers: { Accept: accept, 'User-Agent': 'NetChessAcademy/1.0' },
    signal: AbortSignal.timeout(15000),
  });

  if (upstream.status >= 200 && upstream.status < 300 && cacheTtl > 0) {
    writeCachedResponse(cacheKey, upstream, cacheTtl);
    void writeLichessApiCache(cacheKey, upstream, cacheTtl, env);
  }

  if ((upstream.status === 429 || upstream.rateLimited) && cacheTtl > 0) {
    const stale = pickStaleFallback(cacheKey, persisted);
    if (stale) {
      markCacheStale(cacheKey);
      return stale;
    }
    if (softFail) {
      return {
        status: 200,
        body: softEmptyBodyForPath(path),
        contentType: path.startsWith('games/') ? 'application/x-ndjson' : 'application/json',
        rateLimited: true,
      };
    }
  }

  return {
    status: upstream.status,
    body: upstream.body,
    contentType: upstream.contentType || 'application/json',
    rateLimited: upstream.rateLimited === true,
  };
}

export async function fetchLichessUpstream(url, init) {
  // Global backoff aktifken sıraya girip 60 sn beklemek yerine hemen 429 döndür.
  // Böylece tek bir 429, lichess'li tüm öğrenciler için batch isteğini kilitlemez;
  // çağıran taraf (soft) boş yanıtla veya stale önbellekle devam eder.
  if (Date.now() < backoffUntil) {
    return { ok: false, status: 429, body: '', contentType: 'application/json', rateLimited: true };
  }
  const task = async () => {
    // Backoff görev sırasındayken de açılmış olabilir — tekrar kontrol et.
    if (Date.now() < backoffUntil) {
      return { ok: false, status: 429, body: '', contentType: 'application/json', rateLimited: true };
    }
    const gapWait = Math.min(MIN_GAP_MS, lastDoneAt + MIN_GAP_MS - Date.now());
    if (gapWait > 0) await sleep(gapWait);
    if (Date.now() < backoffUntil) {
      return { ok: false, status: 429, body: '', contentType: 'application/json', rateLimited: true };
    }
    try {
      const upstream = await fetch(url, init);
      const body = await upstream.text();
      const contentType = upstream.headers.get('content-type');
      if (upstream.status === 429) {
        applyBackoff(upstream.headers.get('retry-after'));
      }
      return {
        ok: upstream.ok,
        status: upstream.status,
        body,
        contentType,
        rateLimited: upstream.status === 429,
      };
    } finally {
      lastDoneAt = Date.now();
    }
  };
  const next = chain.then(task, task);
  chain = next.catch(() => {});
  return next;
}
