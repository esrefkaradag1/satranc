type Req = { query: Record<string, string | string[] | undefined> };
type Res = {
  status(code: number): { json(body: unknown): void; end(): void };
  setHeader(name: string, value: string): void;
};

const VALID_TYPES = ['rated', 'learning', 'rush'];

export default async function handler(req: Req, res: Res) {
  const rawUser = req.query.username;
  const username = (Array.isArray(rawUser) ? rawUser[0] : rawUser)?.trim().toLowerCase() ?? '';
  const rawType = req.query.type;
  const type = (Array.isArray(rawType) ? rawType[0] : rawType)?.trim().toLowerCase() || 'rated';

  if (!username) {
    res.status(400).json({ error: 'username gerekli' });
    return;
  }
  if (!VALID_TYPES.includes(type)) {
    res.status(400).json({ error: 'type rated | learning | rush olmalı' });
    return;
  }

  try {
    const upstream = await fetch(
      `https://www.chess.com/callback/member/stats/puzzles/${encodeURIComponent(username)}?type=${encodeURIComponent(type)}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'NetChessAcademy/1.0',
          Referer: `https://www.chess.com/member/${encodeURIComponent(username)}/stats/puzzles`,
        },
      },
    );
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Chess.com istatistik yanıt vermedi' });
      return;
    }
    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json(data);
  } catch {
    res.status(502).json({ error: 'Chess.com bağlantı hatası' });
  }
}
