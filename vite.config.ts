import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { insertHomeworkAttemptViaEnv } from './lib/homeworkAttemptDb.mjs';
import { appendLiveLessonChatViaEnv } from './lib/liveLessonChatDb.mjs';
import { replaceSessionMediaViaEnv, sessionMediaOpViaEnv } from './lib/liveLessonSessionMediaDb.mjs';

function devApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api-routes',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const route = req.url?.split('?')[0];
        if (
          route !== '/api/homework-attempt' &&
          route !== '/api/live-lesson-chat' &&
          route !== '/api/live-lesson-session-media'
        ) {
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
              const result =
                route === '/api/homework-attempt'
                  ? await insertHomeworkAttemptViaEnv(body, env)
                  : route === '/api/live-lesson-chat'
                    ? await appendLiveLessonChatViaEnv(body, env)
                    : body.replace === true
                      ? await replaceSessionMediaViaEnv(body, env)
                      : await sessionMediaOpViaEnv(body, env);
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
          '/api/lichess-proxy': {
            target: 'https://lichess.org',
            changeOrigin: true,
            rewrite: (path) => {
              const u = new URL(path, 'http://local');
              const apiPath = u.searchParams.get('path');
              if (!apiPath) return path;
              u.searchParams.delete('path');
              const qs = u.searchParams.toString();
              return `/api/${apiPath}${qs ? `?${qs}` : ''}`;
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
