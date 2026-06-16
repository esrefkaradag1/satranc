type Req = { query: Record<string, string | string[] | undefined> };
type Res = {
  status(code: number): { json(body: unknown): void; end(): void };
  setHeader(name: string, value: string): void;
};

export default async function handler(req: Req, res: Res) {
  const raw = req.query.id;
  const id = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  if (!id || !/^\d+$/.test(id)) {
    res.status(400).json({ error: 'Geçersiz puzzle id' });
    return;
  }

  try {
    const upstream = await fetch(`https://www.chess.com/callback/puzzle/tactics/${encodeURIComponent(id)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NetChessAcademy/1.0',
      },
    });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Bulmaca bulunamadı' });
      return;
    }
    const data = (await upstream.json()) as { pgn?: string; isHumanPlayerWhite?: boolean };
    const pgn = data.pgn?.trim();
    if (!pgn) {
      res.status(404).json({ error: 'PGN yok' });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ pgn, isHumanPlayerWhite: Boolean(data.isHumanPlayerWhite) });
  } catch {
    res.status(502).json({ error: 'Chess.com yanıt vermedi' });
  }
}
