/**
 * Docker production: statik SPA + platform API tek Node sürecinde.
 * nginx→Node proxy 502 sorunlarını önler; Dokploy/deploy branch ile uyumludur.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dispatchApi } from './docker-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const RUNTIME_ENV_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'VITE_AGORA_APP_ID',
  'VITE_AGORA_CHANNEL_PREFIX',
  'VITE_OPENROUTER_API_KEY',
  'VITE_OPENROUTER_MODEL',
  'VITE_API_URL',
];

/** VITE_* değerlerini sunucu API handler'ları için SUPABASE_* olarak yansıt */
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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function writeEnvConfig() {
  const env = {};
  for (const key of RUNTIME_ENV_KEYS) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  const target = path.join(STATIC_DIR, 'env-config.js');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `window.__RUNTIME_ENV__ = ${JSON.stringify(env, null, 2)};\n`);
  console.log(`[docker-production] env-config.js yazıldı (${Object.keys(env).length} anahtar)`);
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
  return normalized.startsWith('/') ? normalized.slice(1) : normalized;
}

function sendFile(res, filePath, cacheControl) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(404);
    res.end();
  });
  res.writeHead(200, {
    'Content-Type': type,
    ...(cacheControl ? { 'Cache-Control': cacheControl } : {}),
  });
  stream.pipe(res);
}

function serveStatic(req, res, url) {
  const pathname = safePath(url.pathname);
  if (!pathname || pathname === '/') {
    return sendFile(res, path.join(STATIC_DIR, 'index.html'), 'public, max-age=0, must-revalidate');
  }

  const filePath = path.join(STATIC_DIR, pathname);
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const cache = pathname.startsWith('assets/')
      ? 'public, max-age=31536000, immutable'
      : pathname === 'index.html'
        ? 'public, max-age=0, must-revalidate'
        : undefined;
    return sendFile(res, filePath, cache);
  }

  return sendFile(res, path.join(STATIC_DIR, 'index.html'), 'public, max-age=0, must-revalidate');
}

syncServerEnv();
writeEnvConfig();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const route = url.pathname.replace(/\/+$/, '') || '/';

  if (route === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  if (route.startsWith('/api/')) {
    await dispatchApi(req, res, url);
    return;
  }

  serveStatic(req, res, url);
});

server.listen(PORT, HOST, () => {
  console.log(`[docker-production] http://${HOST}:${PORT} (static: ${STATIC_DIR})`);
});
