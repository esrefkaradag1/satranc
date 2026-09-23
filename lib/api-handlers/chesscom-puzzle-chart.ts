import { fetchChessComUpstream } from '../chesscomUpstreamFetch.mjs';

type Req = { query: Record<string, string | string[] | undefined> };
type Res = {
  status(code: number): { json(body: unknown): void; end(): void };
  setHeader(name: string, value: string): void;
};

export const config = { maxDuration: 15 };

const CHESSCOM_USER_RE = /^[a-z0-9_-]{1,25}$/i;

function firstQuery(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? '';
  return value?.trim() ?? '';
}

/**
 * Chess.com günlük bulmaca grafiği proxy — tarayıcı CORS'unu aşar.
 * GET /api/chesscom-puzzle-chart?username=...
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  const username = firstQuery(req.query.username).toLowerCase();
  if (!username || !CHESSCOM_USER_RE.test(username)) {
    res.status(200).json({ dailyStats: [], unavailable: true });
    return;
  }

  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(username)}/stats/puzzles`;
  try {
    const upstream = await fetchChessComUpstream(
      `https://www.chess.com/callback/tactics/stats/${encodeURIComponent(username)}/chart`,
      {
        headers: {
          Accept: 'application/json',
          Referer: profileUrl,
        },
      },
      12_000,
    );
    if (!upstream.ok) {
      res.status(200).json({
        dailyStats: [],
        unavailable: true,
        upstreamStatus: upstream.status,
      });
      return;
    }
    const data = await upstream.json();
    res.status(200).json(data ?? { dailyStats: [] });
  } catch {
    res.status(200).json({ dailyStats: [], unavailable: true });
  }
}
