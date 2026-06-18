type Req = { query: Record<string, string | string[] | undefined> };
type Res = {
  status(code: number): { json(body: unknown): void; end(): void };
  setHeader(name: string, value: string): void;
};

function queryParam(q: Record<string, string | string[] | undefined>, key: string): string {
  const raw = q[key];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase() ?? '';
}

export default async function handler(req: Req, res: Res) {
  const username = queryParam(req.query, 'username');
  const year = queryParam(req.query, 'year');
  const month = queryParam(req.query, 'month');

  if (!username || !year || !month) {
    res.status(400).json({ error: 'username, year, month gerekli' });
    return;
  }
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) {
    res.status(400).json({ error: 'Geçersiz tarih' });
    return;
  }

  const mm = month.padStart(2, '0');
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${mm}`;

  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'NetChessAcademy/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Chess.com oyun arşivi alınamadı' });
      return;
    }
    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Chess.com bağlantı hatası';
    res.status(502).json({ error: msg });
  }
}
