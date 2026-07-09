/**
 * Lichess upstream isteklerini sıraya alır (sunucu tarafı 429 önleme).
 */

import { readLichessApiCache, writeLichessApiCache } from './lichessApiCacheDb.mjs';

let chain = Promise.resolve();
let lastDoneAt = 0;
let backoffUntil = 0;

const MIN_GAP_MS = 2000;
const BACKOFF_MS = 60_000;
const USER_PROFILE_CACHE_TTL_MS = 30 * 60 * 1000;
const ACTIVITY_CACHE_TTL_MS = 15 * 60 * 1000;

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

export async function lichessProxyRequest(apiPath, searchParams, accept = 'application/json', env = process.env) {
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
  }

  return {
    status: upstream.status,
    body: upstream.body,
    contentType: upstream.contentType || 'application/json',
    rateLimited: upstream.rateLimited === true,
  };
}

export async function fetchLichessUpstream(url, init) {
  const task = async () => {
    const now = Date.now();
    if (now < backoffUntil) {
      await sleep(backoffUntil - now);
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
