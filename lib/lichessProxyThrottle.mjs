/**
 * Lichess upstream isteklerini sıraya alır (sunucu tarafı 429 önleme).
 */

let chain = Promise.resolve();
let lastDoneAt = 0;
let backoffUntil = 0;

const MIN_GAP_MS = 1400;
const BACKOFF_MS = 45_000;
const USER_PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;
const ACTIVITY_CACHE_TTL_MS = 5 * 60 * 1000;

/** Aynı sunucu örneğinde Lichess yanıtlarını önbelleğe al (canlıda 429 sonrası stale servis). */
const responseCache = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cacheTtlForPath(path) {
  if (/^user\/[A-Za-z0-9_-]{1,30}$/.test(path)) return USER_PROFILE_CACHE_TTL_MS;
  if (/^user\/[A-Za-z0-9_-]{1,30}\/activity$/.test(path)) return ACTIVITY_CACHE_TTL_MS;
  return 0;
}

function readCachedResponse(cacheKey) {
  const hit = responseCache.get(cacheKey);
  if (!hit) return null;
  if (hit.expiresAt > Date.now()) return hit;
  return hit.stale ? hit : null;
}

function writeCachedResponse(cacheKey, entry, ttlMs) {
  if (ttlMs <= 0) return;
  responseCache.set(cacheKey, {
    status: entry.status,
    body: entry.body,
    contentType: entry.contentType,
    expiresAt: Date.now() + ttlMs,
    stale: false,
  });
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

export async function lichessProxyRequest(apiPath, searchParams, accept = 'application/json') {
  const path = String(apiPath ?? '').replace(/^\/+/, '');
  if (!isAllowedLichessPath(path)) {
    return { status: 400, body: JSON.stringify({ error: 'Geçersiz Lichess API yolu' }), contentType: 'application/json' };
  }
  const qs = new URLSearchParams(searchParams ?? undefined);
  qs.delete('path');
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

  const upstream = await fetchLichessUpstream(upstreamUrl, {
    headers: { Accept: accept, 'User-Agent': 'NetChessAcademy/1.0' },
    signal: AbortSignal.timeout(15000),
  });

  if (upstream.status >= 200 && upstream.status < 300 && cacheTtl > 0) {
    writeCachedResponse(cacheKey, upstream, cacheTtl);
  }

  if ((upstream.status === 429 || upstream.rateLimited) && cacheTtl > 0) {
    const stale = responseCache.get(cacheKey);
    if (stale) {
      markCacheStale(cacheKey);
      return {
        status: stale.status,
        body: stale.body,
        contentType: stale.contentType || 'application/json',
      };
    }
  }

  return {
    status: upstream.status,
    body: upstream.body,
    contentType: upstream.contentType || 'application/json',
  };
}

export async function fetchLichessUpstream(url, init) {
  const task = async () => {
    const now = Date.now();
    if (now < backoffUntil) {
      return { ok: false, status: 429, body: '', contentType: 'application/json', rateLimited: true };
    }
    const gapWait = lastDoneAt + MIN_GAP_MS - Date.now();
    if (gapWait > 0) await sleep(gapWait);
    try {
      const upstream = await fetch(url, init);
      const body = await upstream.text();
      const contentType = upstream.headers.get('content-type');
      if (upstream.status === 429) backoffUntil = Date.now() + BACKOFF_MS;
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
