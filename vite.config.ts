import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
        },
      },
      optimizeDeps: {
        include: ['pdfjs-dist'],
      },
      plugins: [react(), tailwindcss()],
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
