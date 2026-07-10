import { fetchChessComPuzzleDetailUpstream } from '../chesscomPuzzleDetailFetch.mjs';

type Req = { query: Record<string, string | string[] | undefined> };
type Res = {
  status(code: number): { json(body: unknown): void; end(): void };
  setHeader(name: string, value: string): void;
};

export default async function handler(req: Req, res: Res) {
  const raw = req.query.id;
  const id = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';

  const result = await fetchChessComPuzzleDetailUpstream(id);
  if (!result.ok) {
    const status = result.status === 429 ? 429 : result.status || 502;
    res.status(status).json({ error: status === 429 ? 'Chess.com istek limiti — biraz sonra tekrar deneyin' : 'Bulmaca bulunamadı' });
    return;
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  if (result.cached) res.setHeader('X-ChessCom-Cache', 'hit');
  res.status(200).json(result.body);
}
