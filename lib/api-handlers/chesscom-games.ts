import { fetchChessComMonthGames } from '../chesscomMonthGamesFetch';

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

  const result = await fetchChessComMonthGames(username, year, month);

  if (result.unavailable) {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json({
      games: [],
      unavailable: true,
      upstreamStatus: result.upstreamStatus,
      error: result.error ?? 'Chess.com oyun arşivi alınamadı',
    });
    return;
  }

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({
    games: result.games,
    source: result.source,
  });
}
