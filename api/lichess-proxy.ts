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

function isAllowedLichessPath(path: string): boolean {
  if (!path || path.includes('..')) return false;
  return (
    /^user\/[A-Za-z0-9_-]{1,30}$/.test(path)
    || /^user\/[A-Za-z0-9_-]{1,30}\/activity$/.test(path)
    || /^games\/user\/[A-Za-z0-9_-]{1,30}$/.test(path)
    || /^game\/export\/[a-zA-Z0-9]+$/.test(path)
  );
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const path = queryParam(req.query, 'path').replace(/^\/+/, '');
  if (!isAllowedLichessPath(path)) {
    res.status(400).json({ error: 'Geçersiz Lichess API yolu' });
    return;
  }

  const qs = new URLSearchParams();
  for (const [key, raw] of Object.entries(req.query)) {
    if (key === 'path') continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value != null && value !== '') qs.set(key, String(value));
  }

  const upstreamUrl = `https://lichess.org/api/${path}${qs.toString() ? `?${qs}` : ''}`;
  const acceptRaw = req.headers.accept;
  const accept = (Array.isArray(acceptRaw) ? acceptRaw[0] : acceptRaw) || 'application/json';

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: accept,
        'User-Agent': 'NetChessAcademy/1.0',
      },
      signal: AbortSignal.timeout(15000),
    });
    const body = await upstream.text();
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 's-maxage=90, stale-while-revalidate=180');
    res.status(upstream.status).send(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lichess bağlantı hatası';
    res.status(502).json({ error: msg });
  }
}
