import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { insertHomeworkAttemptViaEnv } from './lib/homeworkAttemptDb.mjs';
import { insertStudyEventViaEnv, appendStudyPracticeLogsViaEnv } from './lib/studyEventDb.mjs';
import { appendLiveLessonChatViaEnv } from './lib/liveLessonChatDb.mjs';
import { replaceSessionMediaViaEnv, sessionMediaOpViaEnv } from './lib/liveLessonSessionMediaDb.mjs';
import { insertSiteMessageViaEnv, listSiteMessagesViaEnv } from './lib/siteMessagesDb.mjs';
import { whatsappApiGetHandler, whatsappApiPostHandler } from './lib/whatsappApi.mjs';
import {
  lichessOAuthDisconnectViaEnv,
  lichessOAuthStatusViaEnv,
  lichessOAuthTokenViaEnv,
  lichessPuzzleActivityViaEnv,
  lichessPuzzleDashboardViaEnv,
  lichessPuzzleLatestViaEnv,
  lichessPuzzleNextViaEnv,
  lichessOAuthAccountViaEnv,
} from './lib/lichessOAuthApi.mjs';
import { lichessProxyRequest } from './lib/lichessProxyThrottle.mjs';
import { fetchUkdFromTsfServer } from './lib/tsfUkdFetch';
import { parentStudentLoginViaEnv } from './lib/studentParentAuth.mjs';
import { fetchChessComMonthGames } from './lib/chesscomMonthGamesFetch';
import { startTrainingNotifyScheduler, trainingNotifyHandler } from './lib/trainingWhatsAppNotify.mjs';
import { runPlatformDaySync } from './lib/api-handlers/platform-day-sync';
import platformWeekStatsHandler from './lib/api-handlers/platform-week-stats';
import externalGameSnapshotHandler from './lib/api-handlers/external-game-snapshot';
import chesscomPuzzleLatestHandler from './lib/api-handlers/chesscom-puzzle-latest';
import chesscomPuzzleHandler from './lib/api-handlers/chesscom-puzzle';

/** Vite dev: TS API handler'ları process.env yerine loadEnv çıktısını kullanır */
function syncSupabaseProcessEnv(env: Record<string, string>) {
  const url = (env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '').trim();
  const key = (env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (url) {
    process.env.VITE_SUPABASE_URL = url;
    process.env.SUPABASE_URL = url;
  }
  if (key) {
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = key;
    process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  }
}

const DEV_GET_ROUTES = new Set([
  '/api/site-messages',
  '/api/whatsapp',
  '/api/chesscom-member-stats',
  '/api/chesscom-recent-puzzles',
  '/api/chesscom-games',
  '/api/lichess-oauth-status',
  '/api/lichess-oauth-account',
  '/api/lichess-puzzle-activity',
  '/api/lichess-puzzle-dashboard',
  '/api/lichess-puzzle-next',
  '/api/lichess-puzzle-latest',
  '/api/chesscom-puzzle-latest',
  '/api/chesscom-puzzle',
  '/api/external-game-snapshot',
  '/api/lichess-proxy',
]);
const DEV_POST_ROUTES = new Set([
  '/api/homework-attempt',
  '/api/study-event',
  '/api/study-practice-log',
  '/api/live-lesson-chat',
  '/api/live-lesson-session-media',
  '/api/site-messages',
  '/api/whatsapp',
  '/api/fetch-ukd',
  '/api/auth-parent',
  '/api/lichess-oauth-token',
  '/api/lichess-oauth-disconnect',
  '/api/training-notify',
  '/api/platform-week-stats',
  '/api/platform-day-sync',
  '/api/nightly',
]);

function devApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api-routes',
    configureServer(server) {
      startTrainingNotifyScheduler(env, {
        onNightly: () => runPlatformDaySync(env),
      });
      server.middlewares.use((req, res, next) => {
        const fullUrl = req.url ?? '';
        const route = fullUrl.split('?')[0];

        if (DEV_GET_ROUTES.has(route) && req.method === 'GET') {
          void (async () => {
            try {
              const parsed = new URL(fullUrl, 'http://local');
              let result;
              if (route === '/api/site-messages') {
                const conversationId = parsed.searchParams.get('conversationId')?.trim() ?? '';
                result = await listSiteMessagesViaEnv(conversationId || undefined, env);
              } else if (route === '/api/whatsapp') {
                result = await whatsappApiGetHandler(fullUrl, env);
              } else if (route === '/api/chesscom-member-stats') {
                const username = parsed.searchParams.get('username')?.trim().toLowerCase() ?? '';
                const type = parsed.searchParams.get('type')?.trim().toLowerCase() || 'rated';
                if (!username) {
                  result = { status: 200, body: {} };
                } else {
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
                  result = upstream.ok
                    ? { status: 200, body: await upstream.json() }
                    : { status: 200, body: { unavailable: true, upstreamStatus: upstream.status } };
                }
              } else if (route === '/api/chesscom-recent-puzzles') {
                const username = parsed.searchParams.get('username')?.trim().toLowerCase() ?? '';
                const type = parsed.searchParams.get('type')?.trim().toLowerCase() || 'rated';
                const profileUrl = username
                  ? `https://www.chess.com/member/${encodeURIComponent(username)}/stats/puzzles`
                  : undefined;
                if (!username) {
                  result = { status: 200, body: { rated: [], learning: [], rush: [], unavailable: true, profileUrl } };
                } else {
                  const upstream = await fetch(
                    `https://www.chess.com/callback/stats/tactics2/new/puzzles/${encodeURIComponent(username)}`,
                    {
                      headers: {
                        Accept: 'application/json',
                        'User-Agent': 'NetChessAcademy/1.0',
                        Referer: profileUrl,
                      },
                      signal: AbortSignal.timeout(15000),
                    },
                  );
                  if (!upstream.ok) {
                    result = {
                      status: 200,
                      body: type === 'all'
                        ? { rated: [], learning: [], rush: [], unavailable: true, profileUrl, upstreamStatus: upstream.status }
                        : { attempts: [], unavailable: true, profileUrl, upstreamStatus: upstream.status },
                    };
                  } else {
                    result = { status: 200, body: await upstream.json() };
                  }
                }
              } else if (route === '/api/chesscom-games') {
                const username = parsed.searchParams.get('username')?.trim().toLowerCase() ?? '';
                const year = parsed.searchParams.get('year')?.trim() ?? '';
                const month = parsed.searchParams.get('month')?.trim() ?? '';
                if (!username || !year || !month) {
                  result = { status: 200, body: { games: [], unavailable: true } };
                } else {
                  const monthResult = await fetchChessComMonthGames(username, year, month);
                  result = {
                    status: 200,
                    body: monthResult.unavailable
                      ? {
                          games: [],
                          unavailable: true,
                          upstreamStatus: monthResult.upstreamStatus,
                          error: monthResult.error ?? 'Chess.com oyun arşivi alınamadı',
                        }
                      : { games: monthResult.games, source: monthResult.source },
                  };
                }
              } else if (route === '/api/lichess-oauth-status') {
                result = await lichessOAuthStatusViaEnv(parsed.searchParams.get('studentId'), env);
              } else if (route === '/api/lichess-oauth-account') {
                result = await lichessOAuthAccountViaEnv(parsed.searchParams, env);
              } else if (route === '/api/lichess-puzzle-activity') {
                result = await lichessPuzzleActivityViaEnv(parsed.searchParams, env);
              } else if (route === '/api/lichess-puzzle-dashboard') {
                result = await lichessPuzzleDashboardViaEnv(parsed.searchParams, env);
              } else if (route === '/api/lichess-puzzle-next') {
                result = await lichessPuzzleNextViaEnv(parsed.searchParams, env);
              } else if (route === '/api/lichess-puzzle-latest') {
                result = await lichessPuzzleLatestViaEnv(parsed.searchParams, env);
              } else if (route === '/api/chesscom-puzzle') {
                let status = 200;
                let payload: unknown = {};
                const mockRes = {
                  status(code: number) {
                    status = code;
                    return {
                      json(data: unknown) {
                        payload = data;
                      },
                      end() {},
                    };
                  },
                  setHeader() {},
                };
                const query: Record<string, string | string[] | undefined> = {};
                parsed.searchParams.forEach((value, key) => {
                  query[key] = value;
                });
                await chesscomPuzzleHandler({ query }, mockRes);
                result = { status, body: payload };
              } else if (route === '/api/chesscom-puzzle-latest') {
                syncSupabaseProcessEnv(env);
                let status = 200;
                let payload: unknown = {};
                const mockRes = {
                  status(code: number) {
                    status = code;
                    return {
                      json(data: unknown) {
                        payload = data;
                      },
                    };
                  },
                };
                const query: Record<string, string | string[] | undefined> = {};
                parsed.searchParams.forEach((value, key) => {
                  query[key] = value;
                });
                await chesscomPuzzleLatestHandler({ method: 'GET', query }, mockRes);
                result = { status, body: payload };
              } else if (route === '/api/external-game-snapshot') {
                syncSupabaseProcessEnv(env);
                let status = 200;
                let payload: unknown = {};
                const mockRes = {
                  status(code: number) {
                    status = code;
                    return {
                      json(data: unknown) {
                        payload = data;
                      },
                    };
                  },
                };
                const query: Record<string, string | string[] | undefined> = {};
                parsed.searchParams.forEach((value, key) => {
                  query[key] = value;
                });
                await externalGameSnapshotHandler({ method: 'GET', query }, mockRes);
                result = { status, body: payload };
              } else if (route === '/api/platform-day-sync') {
                syncSupabaseProcessEnv(env);
                const syncResult = await runPlatformDaySync(env, {
                  day: parsed.searchParams.get('day')?.slice(0, 10) || undefined,
                });
                result = { status: syncResult.ok ? 200 : 500, body: syncResult };
              } else if (route === '/api/nightly') {
                syncSupabaseProcessEnv(env);
                const platform = await runPlatformDaySync(env);
                const training = await trainingNotifyHandler({ mode: 'evening' }, env);
                result = {
                  status: 200,
                  body: { ok: true, at: new Date().toISOString(), platform, training: training.body },
                };
              } else {
                const accept = req.headers.accept || 'application/json';
                const softFail = parsed.searchParams.get('soft') === '1';
                const searchParams = new URLSearchParams(parsed.searchParams);
                searchParams.delete('path');
                // soft'u Lichess throttle'a ilet — silinirse soft bypass/boş yanıt çalışmaz, kuyruk kilitlenir.
                if (softFail) searchParams.set('soft', '1');
                else searchParams.delete('soft');
                const upstream = await lichessProxyRequest(
                  parsed.searchParams.get('path') ?? '',
                  searchParams,
                  Array.isArray(accept) ? accept[0] : accept,
                  env,
                );
                if (softFail && (upstream.status === 429 || upstream.rateLimited || upstream.status >= 400)) {
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  res.setHeader('X-Lichess-Rate-Limited', '1');
                  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
                  res.end('[]');
                  return;
                }
                res.statusCode = upstream.status;
                if (upstream.contentType) res.setHeader('Content-Type', upstream.contentType);
                res.setHeader('Cache-Control', 's-maxage=90, stale-while-revalidate=180');
                res.end(upstream.body);
                return;
              }
              res.statusCode = result.status;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(result.body));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Sunucu hatası' }));
            }
          })();
          return;
        }

        if (!DEV_POST_ROUTES.has(route)) {
          next();
          return;
        }

        if (req.method !== 'POST') {
          next();
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('end', () => {
          void (async () => {
            try {
              const body = chunks.length
                ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
                : {};
              let result;
              if (route === '/api/homework-attempt') {
                result = await insertHomeworkAttemptViaEnv(body, env);
              } else if (route === '/api/study-event') {
                result = await insertStudyEventViaEnv(body, env);
              } else if (route === '/api/study-practice-log') {
                result = await appendStudyPracticeLogsViaEnv(body, env);
              } else if (route === '/api/live-lesson-chat') {
                result = await appendLiveLessonChatViaEnv(body, env);
              } else if (route === '/api/site-messages') {
                result = await insertSiteMessageViaEnv(body, env);
              } else if (route === '/api/whatsapp') {
                result = await whatsappApiPostHandler(body, env, fullUrl);
              } else if (route === '/api/lichess-oauth-token') {
                result = await lichessOAuthTokenViaEnv(body, env, req.headers as Record<string, string | string[] | undefined>);
              } else if (route === '/api/lichess-oauth-disconnect') {
                result = await lichessOAuthDisconnectViaEnv(body, env);
              } else if (route === '/api/fetch-ukd') {
                result = {
                  status: 200,
                  body: await fetchUkdFromTsfServer({
                    tc: typeof body.tc === 'string' ? body.tc : undefined,
                    soyad: typeof body.soyad === 'string' ? body.soyad : undefined,
                  }),
                };
              } else if (route === '/api/auth-parent') {
                result = await parentStudentLoginViaEnv(body, env);
              } else if (route === '/api/training-notify') {
                result = await trainingNotifyHandler(body, env);
              } else if (route === '/api/platform-week-stats') {
                let status = 200;
                let payload: unknown = {};
                const mockRes = {
                  status(code: number) {
                    status = code;
                    return {
                      json(data: unknown) {
                        payload = data;
                      },
                    };
                  },
                  setHeader() {},
                };
                await platformWeekStatsHandler({ method: 'POST', body }, mockRes);
                result = { status, body: payload };
              } else if (route === '/api/platform-day-sync') {
                syncSupabaseProcessEnv(env);
                const syncResult = await runPlatformDaySync(env, {
                  day: typeof body.day === 'string' ? body.day.slice(0, 10) : undefined,
                });
                result = { status: syncResult.ok ? 200 : 500, body: syncResult };
              } else if (route === '/api/nightly') {
                syncSupabaseProcessEnv(env);
                const platform = await runPlatformDaySync(env);
                const training = await trainingNotifyHandler({ mode: 'evening' }, env);
                result = {
                  status: 200,
                  body: { ok: true, at: new Date().toISOString(), platform, training: training.body },
                };
              } else if (body.replace === true) {
                result = await replaceSessionMediaViaEnv(body, env);
              } else {
                result = await sessionMediaOpViaEnv(body, env);
              }
              res.statusCode = result.status;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(result.body));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Sunucu hatası' }));
            }
          })();
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const appBuildId = process.env.APP_BUILD_ID?.trim()
      || `${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`;
    return {
      server: {
        port: 3000,
        host: '127.0.0.1',
        proxy: {
          '/api/chesscom-member-stats': {
            target: 'https://www.chess.com',
            changeOrigin: true,
            rewrite: (path) => {
              const u = new URL(path, 'http://local');
              const username = u.searchParams.get('username');
              const type = u.searchParams.get('type') || 'rated';
              return username
                ? `/callback/member/stats/puzzles/${encodeURIComponent(username)}?type=${encodeURIComponent(type)}`
                : path;
            },
          },
          '/api/chesscom-recent-puzzles': {
            target: 'https://www.chess.com',
            changeOrigin: true,
            rewrite: (path) => {
              const u = new URL(path, 'http://local');
              const username = u.searchParams.get('username');
              return username
                ? `/callback/stats/tactics2/new/puzzles/${encodeURIComponent(username)}`
                : path;
            },
          },
          '/api/chesscom-games': {
            target: 'https://api.chess.com',
            changeOrigin: true,
            rewrite: (path) => {
              const u = new URL(path, 'http://local');
              const username = u.searchParams.get('username');
              const year = u.searchParams.get('year');
              const month = u.searchParams.get('month');
              if (!username || !year || !month) return path;
              const mm = month.padStart(2, '0');
              return `/pub/player/${encodeURIComponent(username)}/games/${year}/${mm}`;
            },
          },
        },
      },
      optimizeDeps: {
        include: ['pdfjs-dist'],
      },
      plugins: [react(), tailwindcss(), devApiPlugin(env)],
      define: {
        __APP_BUILD_ID__: JSON.stringify(appBuildId),
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.VITE_OPENROUTER_API_KEY': JSON.stringify(env.VITE_OPENROUTER_API_KEY),
        'process.env.VITE_OPENROUTER_MODEL': JSON.stringify(env.VITE_OPENROUTER_MODEL)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        sourcemap: false,
        reportCompressedSize: false,
        chunkSizeWarningLimit: 2000,
      }
    };
});
