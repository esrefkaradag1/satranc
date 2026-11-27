/** Chess.com tek bulmaca PGN — önbellek + kuyruk (429 önleme). */

const CACHE_TTL_MS = 60 * 60 * 1000;
const MIN_GAP_MS = 400;
const MAX_CONCURRENT = 2;

const cache = new Map();
let inFlight = 0;
const waitQueue = [];
let lastStartMs = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readCache(id) {
  const row = cache.get(id);
  if (!row) return null;
  if (row.expiresAt > Date.now()) return row.body;
  cache.delete(id);
  return null;
}

function writeCache(id, body) {
  cache.set(id, { expiresAt: Date.now() + CACHE_TTL_MS, body });
}

async function acquireSlot() {
  if (inFlight < MAX_CONCURRENT) {
    const gap = Math.max(0, MIN_GAP_MS - (Date.now() - lastStartMs));
    if (gap > 0) await sleep(gap);
    inFlight += 1;
    lastStartMs = Date.now();
    return;
  }
  await new Promise((resolve) => waitQueue.push(resolve));
  const gap = Math.max(0, MIN_GAP_MS - (Date.now() - lastStartMs));
  if (gap > 0) await sleep(gap);
  inFlight += 1;
  lastStartMs = Date.now();
}

function releaseSlot() {
  inFlight = Math.max(0, inFlight - 1);
  const next = waitQueue.shift();
  if (next) next();
}

async function upstreamFetch(id) {
  const upstream = await fetch(`https://www.chess.com/callback/puzzle/tactics/${encodeURIComponent(id)}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'NetChessAcademy/1.0',
      Referer: 'https://www.chess.com/puzzles/rated',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (upstream.status === 429) {
    return { ok: false, status: 429, body: null };
  }
  if (!upstream.ok) {
    return { ok: false, status: upstream.status, body: null };
  }
  const data = await upstream.json();
  const pgn = data?.pgn?.trim();
  if (!pgn) return { ok: false, status: 404, body: null };
  return {
    ok: true,
    status: 200,
    body: { pgn, isHumanPlayerWhite: Boolean(data.isHumanPlayerWhite) },
  };
}

/** @returns {{ ok: boolean, status: number, body: { pgn: string, isHumanPlayerWhite: boolean } | null, cached?: boolean }} */
export async function fetchChessComPuzzleDetailUpstream(id) {
  const trimmed = String(id ?? '').trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return { ok: false, status: 400, body: null };
  }

  const cached = readCache(trimmed);
  if (cached) return { ok: true, status: 200, body: cached, cached: true };

  await acquireSlot();
  try {
    const again = readCache(trimmed);
    if (again) return { ok: true, status: 200, body: again, cached: true };

    let result = await upstreamFetch(trimmed);
    if (!result.ok && result.status === 429) {
      await sleep(2000);
      result = await upstreamFetch(trimmed);
    }

    if (result.ok && result.body) {
      writeCache(trimmed, result.body);
      return { ok: true, status: 200, body: result.body };
    }

    const stale = cache.get(trimmed)?.body;
    if (stale && result.status === 429) {
      return { ok: true, status: 200, body: stale, cached: true };
    }

    return result;
  } finally {
    releaseSlot();
  }
}
