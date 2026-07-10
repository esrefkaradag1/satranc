import { fetchChessComUpstream } from '../chesscomUpstreamFetch.mjs';

type Req = { query: Record<string, string | string[] | undefined> };
type Res = {
  status(code: number): { json(body: unknown): void; end(): void };
  setHeader(name: string, value: string): void;
};

type PuzzleTab = 'rated' | 'learning' | 'rush';

interface PuzzleAttempt {
  id: number;
  date: string;
  puzzleRating: number;
  movesCorrect: number;
  movesTotal: number;
  avgTimeSec: number;
  myTimeSec: number;
  passed: boolean;
  ratingChange: number;
  myRatingAfter: number;
  fen?: string;
  flipBoard?: boolean;
}

const VALID_TYPES = ['rated', 'learning', 'rush', 'all'];
const CACHE_TTL_MS = 5 * 60 * 1000;

const responseCache = new Map<string, { expiresAt: number; body: unknown }>();

export const config = { maxDuration: 15 };

const TACTICS2_KEYS: Record<PuzzleTab, string> = {
  rated: 'recentRatedProblems',
  learning: 'recentLearningProblems',
  rush: 'recentTacticsChallenges',
};

function parseSeconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum)) return Math.max(0, asNum);
    const m = trimmed.match(/^(\d+):(\d{2})$/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
  }
  return 0;
}

function normalizeAttempt(raw: Record<string, unknown>): PuzzleAttempt | null {
  const id = Number(raw.id ?? raw.puzzleId ?? raw.puzzle_id ?? 0);
  if (!id) return null;

  const moveCount = Number(raw.move_count ?? raw.moveCount ?? raw.moves ?? raw.total_moves ?? 0);
  const correctMoveCount = Number(
    raw.correct_move_count ?? raw.correctMoveCount ?? raw.correct_moves ?? raw.movesCorrect ?? moveCount,
  );
  const movesTotal = moveCount > 0 ? moveCount : Math.max(correctMoveCount, 1);
  const movesCorrect = Math.min(correctMoveCount, movesTotal);

  const ratingChange = Number(raw.rating_change ?? raw.ratingChange ?? raw.ratingDiff ?? 0);
  const myRatingAfter = Number(raw.my_rating ?? raw.myRating ?? raw.ratingAfter ?? raw.rating_after ?? 0);
  const puzzleRating = Number(raw.rating ?? raw.puzzle_rating ?? raw.puzzleRating ?? 0);

  const passed = Boolean(raw.is_passed ?? raw.isPassed ?? raw.passed ?? (raw.result === 1 || raw.result === 'win'));
  const dateRaw = raw.date ?? raw.createDate ?? raw.create_date ?? raw.last_date ?? '';
  const date =
    typeof dateRaw === 'number'
      ? new Date(dateRaw * 1000).toISOString()
      : String(dateRaw || new Date().toISOString());

  return {
    id,
    date,
    puzzleRating,
    movesCorrect,
    movesTotal,
    avgTimeSec: parseSeconds(
      raw.average_time ?? raw.averageTime ?? raw.target_time ?? raw.targetTime ?? raw.avg_time,
    ),
    myTimeSec: parseSeconds(raw.my_time ?? raw.myTime ?? raw.time ?? raw.time_spent),
    passed,
    ratingChange,
    myRatingAfter: myRatingAfter || puzzleRating,
    fen: typeof raw.fen === 'string' ? raw.fen : undefined,
    flipBoard: Boolean(raw.flipBoard ?? raw.flip_board),
  };
}

function parseTactics2Puzzles(data: unknown, type: PuzzleTab): PuzzleAttempt[] {
  if (!data || typeof data !== 'object') return [];
  const list = (data as Record<string, unknown>)[TACTICS2_KEYS[type]];
  if (!Array.isArray(list)) return [];
  const out: PuzzleAttempt[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const parsed = normalizeAttempt(item as Record<string, unknown>);
    if (!parsed) continue;
    out.push(parsed);
  }
  return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function sendSoftUnavailable(res: Res, type: string, profileUrl: string, error: string, upstreamStatus?: number): void {
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  if (type === 'all') {
    res.status(200).json({
      rated: [],
      learning: [],
      rush: [],
      unavailable: true,
      profileUrl,
      upstreamStatus,
      error,
    });
    return;
  }
  res.status(200).json({
    attempts: [],
    unavailable: true,
    profileUrl,
    upstreamStatus,
    error,
  });
}

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
    res.status(400).json({ error: 'type rated | learning | rush | all olmalı' });
    return;
  }

  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(username)}/stats/puzzles`;
  const cacheKey = `${username}:${type}`;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('X-ChessCom-Cache', 'hit');
    res.status(200).json(cached.body);
    return;
  }

  try {
    const upstream = await fetchChessComUpstream(
      `https://www.chess.com/callback/stats/tactics2/new/puzzles/${encodeURIComponent(username)}`,
      {
        headers: {
          Accept: 'application/json',
          Referer: profileUrl,
        },
      },
      12000,
    );
    if (!upstream.ok) {
      sendSoftUnavailable(res, type, profileUrl, 'Chess.com bulmaca listesi alınamadı', upstream.status);
      return;
    }
    const data = await upstream.json();

    const rated = parseTactics2Puzzles(data, 'rated');
    const learning = parseTactics2Puzzles(data, 'learning');
    const rush = parseTactics2Puzzles(data, 'rush');

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

    if (type === 'all') {
      const body = { rated, learning, rush, profileUrl };
      responseCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, body });
      res.status(200).json(body);
      return;
    }

    const attempts = type === 'learning' ? learning : type === 'rush' ? rush : rated;

    const body = {
      attempts,
      unavailable: attempts.length === 0,
      profileUrl,
    };
    responseCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, body });
    res.status(200).json(body);
  } catch (err) {
    const stale = responseCache.get(cacheKey);
    if (stale?.body) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      res.setHeader('X-ChessCom-Cache', 'stale');
      res.status(200).json(stale.body);
      return;
    }
    const msg = err instanceof Error ? err.message : 'Chess.com bağlantı hatası';
    sendSoftUnavailable(res, type, profileUrl, msg);
  }
}
