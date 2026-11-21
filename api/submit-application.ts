/** POST /api/submit-application — girişsiz başvuru (bkz. lib/publicApplication.mjs). */
import { submitApplicationHandler } from '../lib/publicApplication.mjs';

type Req = {
  method?: string;
  body?: string | Record<string, unknown>;
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

function header(req: Req, name: string): string {
  const raw = req.headers?.[name];
  return Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '');
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Yalnızca POST desteklenir' });
    return;
  }
  const ip = header(req, 'x-forwarded-for').split(',')[0]?.trim() || header(req, 'x-real-ip');
  const result = await submitApplicationHandler(parseBody(req), process.env as Record<string, string>, { ip });
  res.status(result.status).json(result.body);
}
