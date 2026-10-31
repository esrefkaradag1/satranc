import { chessduelloApiHandler } from '../chessduelloCoachApi.mjs';

type Req = {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};
type Res = {
  status(code: number): {
    json(body: unknown): void;
    send(body: string): void;
    end(): void;
  };
};

function queryToSearch(query: Record<string, string | string[] | undefined> | undefined): string {
  const qs = new URLSearchParams();
  if (!query) return '';
  for (const [key, raw] of Object.entries(query)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value != null && value !== '') qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export default async function handler(req: Req, res: Res) {
  const method = req.method || 'GET';
  const fullUrl = req.url || `/api/chessduello${queryToSearch(req.query)}`;
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const result = await chessduelloApiHandler(method, fullUrl, body, process.env);
  res.status(result.status).json(result.body);
}
