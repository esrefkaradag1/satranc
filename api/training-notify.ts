import { trainingNotifyHandler } from '../lib/trainingWhatsAppNotify.mjs';

type Req = {
  method?: string;
  url?: string;
  body?: string | Record<string, unknown>;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

type Res = {
  status(code: number): { json(body: unknown): void };
};

function parseBody(req: Req): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return req.body;
}

function headerValue(req: Req, name: string): string {
  const raw = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '');
}

// Vercel Cron GET çağrılarında mode query string'den okunur (?mode=evening|poll).
function modeFromQuery(req: Req): string {
  const q = req.query?.mode;
  if (typeof q === 'string' && q) return q;
  if (Array.isArray(q) && q[0]) return q[0];
  if (req.url) {
    try {
      const u = new URL(req.url, 'http://localhost');
      const m = u.searchParams.get('mode');
      if (m) return m;
    } catch {
      /* ignore */
    }
  }
  return 'evening';
}

// CRON_SECRET tanımlıysa GET tetiklerini korur. Vercel Cron isteklerine
// otomatik olarak "Authorization: Bearer <CRON_SECRET>" başlığı ekler.
function cronAuthorized(req: Req): boolean {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret) return true;
  return headerValue(req, 'authorization') === `Bearer ${secret}`;
}

export default async function handler(req: Req, res: Res) {
  const method = String(req.method || 'GET').toUpperCase();
  try {
    if (method === 'GET') {
      if (!cronAuthorized(req)) {
        res.status(401).json({ error: 'Yetkisiz' });
        return;
      }
      const result = await trainingNotifyHandler({ mode: modeFromQuery(req) }, process.env);
      res.status(result.status).json(result.body);
      return;
    }
    if (method === 'POST') {
      const result = await trainingNotifyHandler(parseBody(req), process.env);
      res.status(result.status).json(result.body);
      return;
    }
    res.status(405).json({ error: 'Yalnızca GET veya POST' });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Sunucu hatası' });
  }
}
