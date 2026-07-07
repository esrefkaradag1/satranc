import { lichessProxyRequest } from '../lichessProxyThrottle.mjs';

type Req = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
};
type Res = {
  status(code: number): {
    json(body: unknown): void;
    send(body: string): void;
    end(): void;
  };
  setHeader(name: string, value: string): void;
};

function queryParam(q: Record<string, string | string[] | undefined>, key: string): string {
  const raw = q[key];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const path = queryParam(req.query, 'path');
  const softFail = queryParam(req.query, 'soft') === '1';
  const qs = new URLSearchParams();
  for (const [key, raw] of Object.entries(req.query)) {
    if (key === 'path' || key === 'soft') continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value != null && value !== '') qs.set(key, String(value));
  }

  const acceptRaw = req.headers.accept;
  const accept = (Array.isArray(acceptRaw) ? acceptRaw[0] : acceptRaw) || 'application/json';

  try {
    const upstream = await lichessProxyRequest(path, qs, accept);
    if (softFail && upstream.status === 429) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Lichess-Rate-Limited', '1');
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      res.status(200).send('[]');
      return;
    }
    if (upstream.contentType) res.setHeader('Content-Type', upstream.contentType);
    res.setHeader('Cache-Control', 's-maxage=90, stale-while-revalidate=180');
    res.status(upstream.status).send(upstream.body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lichess bağlantı hatası';
    res.status(502).json({ error: msg });
  }
}
