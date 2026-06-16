/** Chess.com bulmaca parse — sunucu (Vercel API) ve istemci tarafında paylaşılır. */

export type ChessComPuzzleTab = 'rated' | 'learning' | 'rush';

export interface ChessComPuzzleAttempt {
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

function parseChessComSeconds(value: unknown): number {
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

function normalizeChessComPuzzleAttempt(raw: Record<string, unknown>): ChessComPuzzleAttempt | null {
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
    avgTimeSec: parseChessComSeconds(
      raw.average_time ?? raw.averageTime ?? raw.target_time ?? raw.targetTime ?? raw.avg_time,
    ),
    myTimeSec: parseChessComSeconds(raw.my_time ?? raw.myTime ?? raw.time ?? raw.time_spent),
    passed,
    ratingChange,
    myRatingAfter: myRatingAfter || puzzleRating,
    fen: typeof raw.fen === 'string' ? raw.fen : undefined,
    flipBoard: Boolean(raw.flipBoard ?? raw.flip_board),
  };
}

const TACTICS2_PUZZLE_LIST_KEYS: Record<ChessComPuzzleTab, string> = {
  rated: 'recentRatedProblems',
  learning: 'recentLearningProblems',
  rush: 'recentTacticsChallenges',
};

/** Chess.com tactics2/new/puzzles yanıtından sekme listesini çıkarır */
export function parseChessComTactics2Puzzles(data: unknown, type: ChessComPuzzleTab): ChessComPuzzleAttempt[] {
  if (!data || typeof data !== 'object') return [];
  const root = data as Record<string, unknown>;
  const key = TACTICS2_PUZZLE_LIST_KEYS[type];
  const list = root[key];
  if (!Array.isArray(list)) return [];
  const out: ChessComPuzzleAttempt[] = [];
  const seen = new Set<number>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const parsed = normalizeChessComPuzzleAttempt(item as Record<string, unknown>);
    if (!parsed || seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    out.push(parsed);
  }
  return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function formatChessComApiError(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object') {
    const o = value as { message?: unknown; error?: unknown; code?: unknown };
    if (typeof o.message === 'string' && o.message.trim()) return o.message;
    if (typeof o.error === 'string' && o.error.trim()) return o.error;
    if (typeof o.code === 'string' && o.code.trim()) return o.code;
  }
  return 'Bilinmeyen hata';
}
