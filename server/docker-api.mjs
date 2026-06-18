/**
 * Docker/nginx dağıtımı için yerel API sunucusu.
 * Vercel serverless `api/*.ts` ile aynı uç noktaları sağlar.
 */
import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.API_PORT || 3001);
const HOST = process.env.API_HOST || '127.0.0.1';

function qp(url, key) {
  return url.searchParams.get(key)?.trim() ?? '';
}

function sendJson(res, status, body, cacheControl) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...(cacheControl ? { 'Cache-Control': cacheControl } : {}),
  });
  res.end(payload);
}

function sendText(res, status, body, contentType, cacheControl) {
  res.writeHead(status, {
    'Content-Type': contentType || 'text/plain; charset=utf-8',
    ...(cacheControl ? { 'Cache-Control': cacheControl } : {}),
  });
  res.end(body);
}

function parseSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum)) return Math.max(0, asNum);
    const m = trimmed.match(/^(\d+):(\d{2})$/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
  }
  return 0;
}

const TACTICS2_KEYS = {
  rated: 'recentRatedProblems',
  learning: 'recentLearningProblems',
  rush: 'recentTacticsChallenges',
};

function normalizeAttempt(raw) {
  const id = Number(raw.id ?? raw.puzzleId ?? raw.puzzle_id ?? 0);
  if (!id) return null;
  const moveCount = Number(raw.move_count ?? raw.moveCount ?? raw.moves ?? raw.total_moves ?? 0);
  const correctMoveCount = Number(
    raw.correct_move_count ?? raw.correctMoveCount ?? raw.correct_moves ?? raw.movesCorrect ?? moveCount,
  );
  const movesTotal = moveCount > 0 ? moveCount : Math.max(correctMoveCount, 1);
  const movesCorrect = Math.min(correctMoveCount, movesTotal);
  const ratingChange = Number(raw.rating_change ?? raw.ratingChange ?? raw.ratingDiff ?? 0);
  const myRatingAfter = Number(raw.my_rating ?? raw.myRating ?? raw.ratingAfter ?? raw.rating_after ?? 0);
  const puzzleRating = Number(raw.rating ?? raw.puzzle_rating ?? raw.puzzleRating ?? 0);
  const passed = Boolean(raw.is_passed ?? raw.isPassed ?? raw.passed ?? (raw.result === 1 || raw.result === 'win'));
  const dateRaw = raw.date ?? raw.createDate ?? raw.create_date ?? raw.last_date ?? '';
  const date = typeof dateRaw === 'number'
    ? new Date(dateRaw * 1000).toISOString()
    : String(dateRaw || new Date().toISOString());
  return {
    id,
    date,
    puzzleRating,
    movesCorrect,
    movesTotal,
    avgTimeSec: parseSeconds(raw.average_time ?? raw.averageTime ?? raw.target_time ?? raw.targetTime ?? raw.avg_time),
    myTimeSec: parseSeconds(raw.my_time ?? raw.myTime ?? raw.time ?? raw.time_spent),
    passed,
    ratingChange,
    myRatingAfter: myRatingAfter || puzzleRating,
    fen: typeof raw.fen === 'string' ? raw.fen : undefined,
    flipBoard: Boolean(raw.flipBoard ?? raw.flip_board),
  };
}

function parseTactics2Puzzles(data, type) {
  if (!data || typeof data !== 'object') return [];
  const list = data[TACTICS2_KEYS[type]];
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const parsed = normalizeAttempt(item);
    if (!parsed || seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    out.push(parsed);
  }
  return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function handleChessComRecentPuzzles(url, res) {
  const username = qp(url, 'username').toLowerCase();
  const type = qp(url, 'type').toLowerCase() || 'rated';
  const valid = ['rated', 'learning', 'rush', 'all'];
  if (!username) return sendJson(res, 400, { error: 'username gerekli' });
  if (!valid.includes(type)) return sendJson(res, 400, { error: 'type rated | learning | rush | all olmalı' });

  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(username)}/stats/puzzles`;
  try {
    const upstream = await fetch(
      `https://www.chess.com/callback/stats/tactics2/new/puzzles/${encodeURIComponent(username)}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'NetChessAcademy/1.0',
          Referer: profileUrl,
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!upstream.ok) {
      return sendJson(res, upstream.status, { error: 'Chess.com bulmaca listesi alınamadı', profileUrl });
    }
    const data = await upstream.json();
    const rated = parseTactics2Puzzles(data, 'rated');
    const learning = parseTactics2Puzzles(data, 'learning');
    const rush = parseTactics2Puzzles(data, 'rush');
    const cache = 's-maxage=300, stale-while-revalidate=600';
    if (type === 'all') return sendJson(res, 200, { rated, learning, rush, profileUrl }, cache);
    const attempts = type === 'learning' ? learning : type === 'rush' ? rush : rated;
    return sendJson(res, 200, { attempts, unavailable: attempts.length === 0, profileUrl }, cache);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Chess.com bağlantı hatası';
    return sendJson(res, 502, { error: msg, profileUrl });
  }
}

async function handleChessComPuzzle(url, res) {
  const id = qp(url, 'id');
  if (!id || !/^\d+$/.test(id)) return sendJson(res, 400, { error: 'Geçersiz puzzle id' });
  try {
    const upstream = await fetch(`https://www.chess.com/callback/puzzle/tactics/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'NetChessAcademy/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) return sendJson(res, upstream.status, { error: 'Bulmaca bulunamadı' });
    const data = await upstream.json();
    const pgn = data.pgn?.trim();
    if (!pgn) return sendJson(res, 404, { error: 'PGN yok' });
    return sendJson(res, 200, { pgn, isHumanPlayerWhite: Boolean(data.isHumanPlayerWhite) }, 's-maxage=3600, stale-while-revalidate=86400');
  } catch {
    return sendJson(res, 502, { error: 'Chess.com yanıt vermedi' });
  }
}

async function handleChessComMemberStats(url, res) {
  const username = qp(url, 'username').toLowerCase();
  const type = qp(url, 'type').toLowerCase() || 'rated';
  const valid = ['rated', 'learning', 'rush'];
  if (!username) return sendJson(res, 400, { error: 'username gerekli' });
  if (!valid.includes(type)) return sendJson(res, 400, { error: 'type rated | learning | rush olmalı' });
  try {
    const upstream = await fetch(
      `https://www.chess.com/callback/member/stats/puzzles/${encodeURIComponent(username)}?type=${encodeURIComponent(type)}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'NetChessAcademy/1.0',
          Referer: `https://www.chess.com/member/${encodeURIComponent(username)}/stats/puzzles`,
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!upstream.ok) return sendJson(res, upstream.status, { error: 'Chess.com istatistik yanıt vermedi' });
    const data = await upstream.json();
    return sendJson(res, 200, data, 's-maxage=600, stale-while-revalidate=1800');
  } catch {
    return sendJson(res, 502, { error: 'Chess.com bağlantı hatası' });
  }
}

async function handleChessComGames(url, res) {
  const username = qp(url, 'username').toLowerCase();
  const year = qp(url, 'year');
  const month = qp(url, 'month');
  if (!username || !year || !month) return sendJson(res, 400, { error: 'username, year, month gerekli' });
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) return sendJson(res, 400, { error: 'Geçersiz tarih' });
  const mm = month.padStart(2, '0');
  const apiUrl = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${mm}`;
  try {
    const upstream = await fetch(apiUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'NetChessAcademy/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!upstream.ok) return sendJson(res, upstream.status, { error: 'Chess.com oyun arşivi alınamadı' });
    const data = await upstream.json();
    return sendJson(res, 200, data, 's-maxage=120, stale-while-revalidate=300');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Chess.com bağlantı hatası';
    return sendJson(res, 502, { error: msg });
  }
}

function isAllowedLichessPath(path) {
  if (!path || path.includes('..')) return false;
  return (
    /^user\/[A-Za-z0-9_-]{1,30}$/.test(path)
    || /^user\/[A-Za-z0-9_-]{1,30}\/activity$/.test(path)
    || /^games\/user\/[A-Za-z0-9_-]{1,30}$/.test(path)
    || /^game\/export\/[a-zA-Z0-9]+$/.test(path)
  );
}

async function handleLichessProxy(url, req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  const path = qp(url, 'path').replace(/^\/+/, '');
  if (!isAllowedLichessPath(path)) return sendJson(res, 400, { error: 'Geçersiz Lichess API yolu' });

  const qs = new URLSearchParams(url.searchParams);
  qs.delete('path');
  const upstreamUrl = `https://lichess.org/api/${path}${qs.toString() ? `?${qs}` : ''}`;
  const accept = req.headers.accept || 'application/json';

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: accept, 'User-Agent': 'NetChessAcademy/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    const body = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'application/json';
    return sendText(res, upstream.status, body, contentType, 's-maxage=90, stale-while-revalidate=180');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lichess bağlantı hatası';
    return sendJson(res, 502, { error: msg });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/api/health') {
      return sendJson(res, 200, { ok: true });
    }
    if (path === '/api/chesscom-recent-puzzles') return handleChessComRecentPuzzles(url, res);
    if (path === '/api/chesscom-puzzle') return handleChessComPuzzle(url, res);
    if (path === '/api/chesscom-member-stats') return handleChessComMemberStats(url, res);
    if (path === '/api/chesscom-games') return handleChessComGames(url, res);
    if (path === '/api/lichess-proxy') return handleLichessProxy(url, req, res);

    return sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sunucu hatası';
    return sendJson(res, 500, { error: msg });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[docker-api] listening on http://${HOST}:${PORT}`);
});
