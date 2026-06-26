import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { insertHomeworkAttemptViaEnv } from './lib/homeworkAttemptDb.mjs';
import { appendLiveLessonChatViaEnv } from './lib/liveLessonChatDb.mjs';
import { replaceSessionMediaViaEnv, sessionMediaOpViaEnv } from './lib/liveLessonSessionMediaDb.mjs';
import { insertSiteMessageViaEnv, listSiteMessagesViaEnv } from './lib/siteMessagesDb.mjs';
import {
  lichessOAuthDisconnectViaEnv,
  lichessOAuthStatusViaEnv,
  lichessOAuthTokenViaEnv,
  lichessPuzzleActivityViaEnv,
  lichessPuzzleDashboardViaEnv,
} from './lib/lichessOAuthApi.mjs';
import { lichessProxyRequest } from './lib/lichessProxyThrottle.mjs';
import { fetchUkdFromTsfServer } from './lib/tsfUkdFetch';
import { parentStudentLoginViaEnv } from './lib/studentParentAuth.mjs';

const DEV_GET_ROUTES = new Set([
  '/api/site-messages',
  '/api/lichess-oauth-status',
  '/api/lichess-puzzle-activity',
  '/api/lichess-puzzle-dashboard',
  '/api/lichess-proxy',
]);
const DEV_POST_ROUTES = new Set([
  '/api/homework-attempt',
  '/api/live-lesson-chat',
  '/api/live-lesson-session-media',
  '/api/site-messages',
  '/api/fetch-ukd',
  '/api/auth-parent',
  '/api/lichess-oauth-token',
  '/api/lichess-oauth-disconnect',
]);

function devApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api-routes',
    configureServer(server) {
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
              } else if (route === '/api/lichess-oauth-status') {
                result = await lichessOAuthStatusViaEnv(parsed.searchParams.get('studentId'), env);
              } else if (route === '/api/lichess-puzzle-activity') {
                result = await lichessPuzzleActivityViaEnv(parsed.searchParams, env);
              } else if (route === '/api/lichess-puzzle-dashboard') {
                result = await lichessPuzzleDashboardViaEnv(parsed.searchParams, env);
              } else {
                const accept = req.headers.accept || 'application/json';
                const upstream = await lichessProxyRequest(
                  parsed.searchParams.get('path') ?? '',
                  parsed.searchParams,
                  Array.isArray(accept) ? accept[0] : accept,
                );
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
              } else if (route === '/api/live-lesson-chat') {
                result = await appendLiveLessonChatViaEnv(body, env);
              } else if (route === '/api/site-messages') {
                result = await insertSiteMessageViaEnv(body, env);
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
    return {
      server: {
        port: 3000,
        host: '127.0.0.1',
        proxy: {
          '/api/chesscom-puzzle': {
            target: 'https://www.chess.com',
            changeOrigin: true,
            rewrite: (path) => {
              const id = new URL(path, 'http://local').searchParams.get('id');
              return id ? `/callback/puzzle/tactics/${id}` : path;
            },
          },
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
