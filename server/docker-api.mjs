/**
 * Docker/nginx dağıtımı için yerel API sunucusu.
 * Vercel serverless `api/*.ts` ile aynı uç noktaları sağlar.
 */
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { insertHomeworkAttemptViaEnv } from '../lib/homeworkAttemptDb.mjs';
import { appendLiveLessonChatViaEnv } from '../lib/liveLessonChatDb.mjs';
import { replaceSessionMediaViaEnv, sessionMediaOpViaEnv } from '../lib/liveLessonSessionMediaDb.mjs';
import { insertSiteMessageViaEnv, listSiteMessagesViaEnv } from '../lib/siteMessagesDb.mjs';
import {
  lichessOAuthDisconnectViaEnv,
  lichessOAuthStatusViaEnv,
  lichessOAuthTokenViaEnv,
  lichessPuzzleActivityViaEnv,
  lichessPuzzleDashboardViaEnv,
  lichessPuzzleLatestViaEnv,
  lichessPuzzleNextViaEnv,
  lichessOAuthAccountViaEnv,
} from '../lib/lichessOAuthApi.mjs';
import { lichessProxyRequest } from '../lib/lichessProxyThrottle.mjs';
import { parentStudentLoginViaEnv } from '../lib/studentParentAuth.mjs';
import { trainingNotifyHandler, startTrainingNotifyScheduler } from '../lib/trainingWhatsAppNotify.mjs';
import { fetchUkdFromTsfServer } from '../lib/tsfUkdFetch.mjs';

function syncServerEnv() {
  const pairs = [
    ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
    ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY'],
    ['SUPABASE_DB_PASSWORD', 'POSTGRES_PASSWORD'],
  ];
  for (const [target, source] of pairs) {
    if (!process.env[target]?.trim() && process.env[source]?.trim()) {
      process.env[target] = process.env[source].trim();
    }
  }
}

syncServerEnv();

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

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

/**
 * Vercel tarzı TS handler'ları (server/generated/*.mjs) çalıştırır.
 * Docker yalnızca .mjs yükleyebildiği için bu handler'lar build sırasında
 * `scripts/build-docker-handlers.mjs` ile paketlenir. Dosya yoksa sunucunun
 * tamamı çökmesin diye tembel/dinamik import kullanılır.
 */
const generatedHandlerCache = new Map();
async function runGeneratedHandler(name, reqLike, res) {
  let handler = generatedHandlerCache.get(name);
  if (!handler) {
    try {
      const mod = await import(`./generated/${name}.mjs`);
      handler = mod.default ?? mod;
      generatedHandlerCache.set(name, handler);
    } catch {
      sendJson(res, 500, {
        error: `Handler paketi bulunamadı (${name}). Docker imajını 'npm run build:server' ile yeniden oluşturun.`,
      });
      return;
    }
  }
  let status = 200;
  let payload = {};
  const mockRes = {
    status(code) {
      status = code;
      return { json(data) { payload = data; } };
    },
    setHeader() {},
  };
  await handler(reqLike, mockRes);
  sendJson(res, status, payload);
}

async function handleHomeworkAttempt(req, res) {
  const body = await readJsonBody(req);
  const result = await insertHomeworkAttemptViaEnv(body);
  return sendJson(res, result.status, result.body);
}

async function handleAuthParent(req, res) {
  const body = await readJsonBody(req);
  const result = await parentStudentLoginViaEnv(body, process.env);
  return sendJson(res, result.status, result.body);
}

async function handleFetchUkd(req, res) {
  const body = await readJsonBody(req);
  const result = await fetchUkdFromTsfServer({
    tc: typeof body.tc === 'string' ? body.tc : undefined,
    soyad: typeof body.soyad === 'string' ? body.soyad : undefined,
  });
  if ('error' in result && result.error === 'Kayıt bulunamadı') {
    return sendJson(res, 200, result);
  }
  if ('error' in result) {
    const status =
      result.error === 'tc veya soyad gerekli' || result.error.includes('11 haneli') ? 400 : 502;
    return sendJson(res, status, result);
  }
  return sendJson(res, 200, result, 'no-store');
}

async function handleLiveLessonChat(req, res) {
  const body = await readJsonBody(req);
  const result = await appendLiveLessonChatViaEnv(body);
  return sendJson(res, result.status, result.body);
}

async function handleLiveLessonSessionMedia(req, res) {
  const body = await readJsonBody(req);
  const result =
    body.replace === true ? await replaceSessionMediaViaEnv(body) : await sessionMediaOpViaEnv(body);
  return sendJson(res, result.status, result.body);
}

async function handleSiteMessages(req, res, url) {
  if (req.method === 'GET') {
    const conversationId = qp(url, 'conversationId');
    const result = await listSiteMessagesViaEnv(conversationId || undefined, process.env);
    return sendJson(res, result.status, result.body);
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  const body = await readJsonBody(req);
  const result = await insertSiteMessageViaEnv(body, process.env);
  return sendJson(res, result.status, result.body);
}

async function handleLichessOAuthToken(req, res) {
  const body = await readJsonBody(req);
  const result = await lichessOAuthTokenViaEnv(body, process.env, req.headers);
  return sendJson(res, result.status, result.body);
}

async function handleLichessOAuthStatus(url, res) {
  const result = await lichessOAuthStatusViaEnv(url.searchParams.get('studentId'), process.env);
  return sendJson(res, result.status, result.body);
}

async function handleLichessOAuthAccount(url, res) {
  const result = await lichessOAuthAccountViaEnv(url.searchParams, process.env);
  return sendJson(res, result.status, result.body);
}

async function handleLichessOAuthDisconnect(req, res) {
  const body = await readJsonBody(req);
  const result = await lichessOAuthDisconnectViaEnv(body, process.env);
  return sendJson(res, result.status, result.body);
}

async function handleLichessPuzzleActivity(url, res) {
  const result = await lichessPuzzleActivityViaEnv(url.searchParams, process.env);
  return sendJson(res, result.status, result.body);
}

async function handleLichessPuzzleDashboard(url, res) {
  const result = await lichessPuzzleDashboardViaEnv(url.searchParams, process.env);
  return sendJson(res, result.status, result.body);
}

async function handleLichessPuzzleNext(url, res) {
  const result = await lichessPuzzleNextViaEnv(url.searchParams, process.env);
  return sendJson(res, result.status, result.body);
}

async function handleLichessPuzzleLatest(url, res) {
  const result = await lichessPuzzleLatestViaEnv(url.searchParams, process.env);
  return sendJson(res, result.status, result.body);
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
    ? new Date((dateRaw > 1e12 ? dateRaw : dateRaw * 1000)).toISOString()
    : (() => {
      const s = String(dateRaw || '').trim();
      if (!s) return new Date().toISOString();
      const ms = new Date(s).getTime();
      return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
    })();
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
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const parsed = normalizeAttempt(item);
    if (!parsed) continue;
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
      const body = type === 'all'
        ? { rated: [], learning: [], rush: [], unavailable: true, profileUrl, upstreamStatus: upstream.status, error: 'Chess.com bulmaca listesi alınamadı' }
        : { attempts: [], unavailable: true, profileUrl, upstreamStatus: upstream.status, error: 'Chess.com bulmaca listesi alınamadı' };
      return sendJson(res, 200, body, 's-maxage=120, stale-while-revalidate=300');
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
    const body = type === 'all'
      ? { rated: [], learning: [], rush: [], unavailable: true, profileUrl, error: msg }
      : { attempts: [], unavailable: true, profileUrl, error: msg };
    return sendJson(res, 200, body, 's-maxage=120, stale-while-revalidate=300');
  }
}

async function handleChessComPuzzle(url, res) {
  const id = qp(url, 'id');
  const { fetchChessComPuzzleDetailUpstream } = await import('../lib/chesscomPuzzleDetailFetch.mjs');
  const result = await fetchChessComPuzzleDetailUpstream(id);
  if (!result.ok) {
    const status = result.status === 429 ? 429 : result.status || 502;
    return sendJson(res, status, {
      error: status === 429 ? 'Chess.com istek limiti — biraz sonra tekrar deneyin' : 'Bulmaca bulunamadı',
    });
  }
  return sendJson(res, 200, result.body, 's-maxage=3600, stale-while-revalidate=86400');
}

function puzzleSetupFenFromPgn(pgn) {
  const m = String(pgn ?? '').match(/\[FEN\s+"([^"]+)"\]/i);
  return m?.[1]?.trim() ?? null;
}

function pickLatestChessComAttempt(data) {
  const rated = parseTactics2Puzzles(data, 'rated');
  const learning = parseTactics2Puzzles(data, 'learning');
  const rush = parseTactics2Puzzles(data, 'rush');
  const all = [...rated, ...learning, ...rush].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  return all[0] ?? null;
}

async function createSupabaseClient() {
  const url = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const key = (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function handleChessComPuzzleLatest(url, res) {
  const studentId = qp(url, 'studentId');
  if (!studentId) return sendJson(res, 400, { error: 'studentId gerekli' });

  const sb = await createSupabaseClient();
  if (!sb) return sendJson(res, 200, { ok: false, error: 'Öğrenci profili bulunamadı' });

  const { data, error } = await sb
    .from('students')
    .select('chess_com_username')
    .eq('id', studentId)
    .maybeSingle();
  if (error || !data) return sendJson(res, 200, { ok: false, error: 'Öğrenci profili bulunamadı' });

  const username = String(data.chess_com_username ?? '').trim().toLowerCase();
  if (!username) return sendJson(res, 200, { ok: false, error: 'Chess.com kullanıcı adı tanımlı değil' });

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
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!upstream.ok) {
      return sendJson(res, 200, { ok: false, error: 'Chess.com bulmaca listesi alınamadı' });
    }
    const bundle = await upstream.json();
    const attempt = pickLatestChessComAttempt(bundle);
    if (!attempt) {
      return sendJson(res, 200, { ok: false, error: 'Son Chess.com bulmacası bulunamadı' });
    }

    let fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const puzzleRes = await fetch(
      `https://www.chess.com/callback/puzzle/tactics/${encodeURIComponent(String(attempt.id))}`,
      {
        headers: { Accept: 'application/json', 'User-Agent': 'NetChessAcademy/1.0' },
        signal: AbortSignal.timeout(12000),
      },
    );
    if (puzzleRes.ok) {
      const puzzleData = await puzzleRes.json();
      const setup = puzzleSetupFenFromPgn(puzzleData.pgn ?? '');
      if (setup) fen = setup;
    } else if (attempt.fen?.trim()) {
      fen = attempt.fen.trim();
    }

    const rating = attempt.puzzleRating > 0 ? ` · ${attempt.puzzleRating}` : '';
    const resultLabel = attempt.passed ? 'doğru' : 'yanlış';
    return sendJson(res, 200, {
      ok: true,
      attempt,
      snapshot: {
        fen,
        moves: [],
        baseFen: fen,
        source: 'chesscom',
        gameId: String(attempt.id),
        gameUrl: `https://www.chess.com/puzzles/problem/${encodeURIComponent(String(attempt.id))}`,
        label: `Chess.com bulmaca${rating} · ${resultLabel}`,
        boardOrientation: attempt.flipBoard ? 'black' : 'white',
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bulmaca çekilemedi';
    return sendJson(res, 200, { ok: false, error: msg });
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
    if (!upstream.ok) {
      return sendJson(
        res,
        200,
        { games: [], unavailable: true, upstreamStatus: upstream.status, error: 'Chess.com oyun arşivi alınamadı' },
        's-maxage=60, stale-while-revalidate=120',
      );
    }
    const data = await upstream.json();
    return sendJson(res, 200, data, 's-maxage=120, stale-while-revalidate=300');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Chess.com bağlantı hatası';
    return sendJson(res, 200, { games: [], unavailable: true, error: msg }, 's-maxage=60, stale-while-revalidate=120');
  }
}

async function handleLichessProxy(url, req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  const path = qp(url, 'path').replace(/^\/+/, '');
  const softFail = qp(url, 'soft') === '1';
  const accept = req.headers.accept || 'application/json';
  try {
    const searchParams = new URLSearchParams(url.searchParams);
    searchParams.delete('path');
    searchParams.delete('soft');
    const upstream = await lichessProxyRequest(path, searchParams, accept, process.env);
    if (softFail && upstream.status === 429) {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 's-maxage=30, stale-while-revalidate=60',
        'X-Lichess-Rate-Limited': '1',
      });
      res.end('[]');
      return;
    }
    const isUserProfile = /^user\/[A-Za-z0-9_-]{1,30}$/.test(path);
    const cacheControl = isUserProfile
      ? 's-maxage=1800, stale-while-revalidate=3600'
      : 's-maxage=300, stale-while-revalidate=600';
    res.writeHead(upstream.status, {
      'Content-Type': upstream.contentType || 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      ...(upstream.status === 429 || upstream.rateLimited
        ? { 'X-Lichess-Rate-Limited': '1', 'Retry-After': '60' }
        : {}),
    });
    res.end(upstream.body);
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lichess bağlantı hatası';
    return sendJson(res, 502, { error: msg });
  }
}

/** @returns {Promise<boolean>} true if route handled */
export async function dispatchApi(req, res, url) {
  try {
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/api/health') {
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (path === '/api/chesscom-recent-puzzles') {
      await handleChessComRecentPuzzles(url, res);
      return true;
    }
    if (path === '/api/chesscom-puzzle') {
      await handleChessComPuzzle(url, res);
      return true;
    }
    if (path === '/api/chesscom-puzzle-latest' && req.method === 'GET') {
      await handleChessComPuzzleLatest(url, res);
      return true;
    }
    if (path === '/api/chesscom-member-stats') {
      await handleChessComMemberStats(url, res);
      return true;
    }
    if (path === '/api/chesscom-games') {
      await handleChessComGames(url, res);
      return true;
    }
    if (path === '/api/lichess-proxy') {
      await handleLichessProxy(url, req, res);
      return true;
    }
    if (path === '/api/platform-week-stats' && req.method === 'POST') {
      const body = await readJsonBody(req);
      await runGeneratedHandler('platform-week-stats', { method: 'POST', body }, res);
      return true;
    }
    if (path === '/api/platform-day-sync' && (req.method === 'GET' || req.method === 'POST')) {
      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      const query = {};
      url.searchParams.forEach((value, key) => { query[key] = value; });
      await runGeneratedHandler('platform-day-sync', { method: req.method, body, query, headers: req.headers }, res);
      return true;
    }
    if (path === '/api/nightly' && (req.method === 'GET' || req.method === 'POST')) {
      try {
        const { runPlatformDaySync } = await import('./generated/platform-day-sync.mjs');
        const platform = await runPlatformDaySync(process.env);
        const training = await trainingNotifyHandler({ mode: 'evening' }, process.env);
        sendJson(res, 200, { ok: true, at: new Date().toISOString(), platform, training: training.body });
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : 'Sunucu hatası' });
      }
      return true;
    }
    if (path === '/api/external-game-snapshot' && req.method === 'GET') {
      const query = {};
      url.searchParams.forEach((value, key) => { query[key] = value; });
      await runGeneratedHandler('external-game-snapshot', { method: 'GET', query }, res);
      return true;
    }
    if (path === '/api/homework-attempt' && req.method === 'POST') {
      await handleHomeworkAttempt(req, res);
      return true;
    }
    if (path === '/api/auth-parent' && req.method === 'POST') {
      await handleAuthParent(req, res);
      return true;
    }
    if (path === '/api/fetch-ukd' && req.method === 'POST') {
      await handleFetchUkd(req, res);
      return true;
    }
    if (path === '/api/live-lesson-chat' && req.method === 'POST') {
      await handleLiveLessonChat(req, res);
      return true;
    }
    if (path === '/api/live-lesson-session-media' && req.method === 'POST') {
      await handleLiveLessonSessionMedia(req, res);
      return true;
    }
    if (path === '/api/site-messages' && (req.method === 'GET' || req.method === 'POST')) {
      await handleSiteMessages(req, res, url);
      return true;
    }
    if (path === '/api/lichess-oauth-token' && req.method === 'POST') {
      await handleLichessOAuthToken(req, res);
      return true;
    }
    if (path === '/api/lichess-oauth-status' && req.method === 'GET') {
      await handleLichessOAuthStatus(url, res);
      return true;
    }
    if (path === '/api/lichess-oauth-account' && req.method === 'GET') {
      await handleLichessOAuthAccount(url, res);
      return true;
    }
    if (path === '/api/lichess-oauth-disconnect' && req.method === 'POST') {
      await handleLichessOAuthDisconnect(req, res);
      return true;
    }
    if (path === '/api/lichess-puzzle-activity' && req.method === 'GET') {
      await handleLichessPuzzleActivity(url, res);
      return true;
    }
    if (path === '/api/lichess-puzzle-dashboard' && req.method === 'GET') {
      await handleLichessPuzzleDashboard(url, res);
      return true;
    }
    if (path === '/api/lichess-puzzle-next' && req.method === 'GET') {
      await handleLichessPuzzleNext(url, res);
      return true;
    }
    if (path === '/api/lichess-puzzle-latest' && req.method === 'GET') {
      await handleLichessPuzzleLatest(url, res);
      return true;
    }
    if (path === '/api/training-notify' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = await trainingNotifyHandler(body, process.env);
      sendJson(res, result.status, result.body);
      return true;
    }

    sendJson(res, 404, { error: 'Not found' });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sunucu hatası';
    sendJson(res, 500, { error: msg });
    return true;
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    await dispatchApi(req, res, url);
  });
  server.listen(PORT, HOST, () => {
    console.log(`[docker-api] listening on http://${HOST}:${PORT}`);
    startTrainingNotifyScheduler(process.env, {
      onNightly: async () => {
        const mod = await import('./generated/platform-day-sync.mjs');
        return mod.runPlatformDaySync(process.env);
      },
    });
  });
}
