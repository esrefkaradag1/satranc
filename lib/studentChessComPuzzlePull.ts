import { fetchChessComUpstream } from './chesscomUpstreamFetch.mjs';
import {
  parseChessComTactics2Puzzles,
  puzzleSetupFenFromPgn,
  sanitizeChessComPuzzlePgn,
  type ChessComPuzzleAttempt,
} from './chesscomPuzzleParse';
import { getStudentPlatformPullProfile } from './studentPlatformPullProfile';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const CHESSCOM_PUZZLE_RECENT_MS = 20 * 60 * 1000;

export type ChessComPuzzleBoardSnapshot = {
  fen: string;
  moves: string[];
  baseFen: string;
  source: 'chesscom';
  gameId: string;
  gameUrl: string;
  label: string;
  boardOrientation?: 'white' | 'black';
  updatedAt: string;
};

async function fetchChessComTactics2Bundle(username: string): Promise<unknown | null> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(trimmed)}/stats/puzzles`;
  const upstream = await fetchChessComUpstream(
    `https://www.chess.com/callback/stats/tactics2/new/puzzles/${encodeURIComponent(trimmed)}`,
    {
      headers: {
        Accept: 'application/json',
        Referer: profileUrl,
      },
    },
    12000,
  );
  if (!upstream.ok) return null;
  return upstream.json();
}

export function pickLatestChessComPuzzleAttempt(data: unknown): ChessComPuzzleAttempt | null {
  if (!data || typeof data !== 'object') return null;
  const rated = parseChessComTactics2Puzzles(data, 'rated');
  const learning = parseChessComTactics2Puzzles(data, 'learning');
  const rush = parseChessComTactics2Puzzles(data, 'rush');
  const all = [...rated, ...learning, ...rush].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  return all[0] ?? null;
}

export function isChessComPuzzleRecentlyActive(
  attempt: ChessComPuzzleAttempt | null,
  bundle?: unknown,
): boolean {
  if (!attempt) return false;
  const attemptMs = new Date(attempt.date).getTime();
  if (Number.isFinite(attemptMs) && Date.now() - attemptMs < CHESSCOM_PUZZLE_RECENT_MS) {
    return true;
  }
  if (!bundle || typeof bundle !== 'object') return false;
  const statsInfo = (bundle as Record<string, unknown>).statsInfo;
  if (!statsInfo || typeof statsInfo !== 'object') return false;
  if ((statsInfo as Record<string, unknown>).lastPlayed !== true) return false;
  const stats = (statsInfo as Record<string, unknown>).stats;
  if (!stats || typeof stats !== 'object') return false;
  const lastDate = (stats as Record<string, unknown>).last_date;
  if (typeof lastDate !== 'string' || !lastDate.trim()) return false;
  const lastMs = new Date(lastDate).getTime();
  return Number.isFinite(lastMs) && Date.now() - lastMs < CHESSCOM_PUZZLE_RECENT_MS;
}

async function fetchChessComPuzzlePgn(puzzleId: number): Promise<string | null> {
  const upstream = await fetchChessComUpstream(
    `https://www.chess.com/callback/puzzle/tactics/${encodeURIComponent(String(puzzleId))}`,
    {},
    12000,
  );
  if (!upstream.ok) return null;
  const data = (await upstream.json()) as { pgn?: string };
  const pgn = data.pgn?.trim();
  return pgn || null;
}

function puzzleAttemptLabel(attempt: ChessComPuzzleAttempt): string {
  const rating = attempt.puzzleRating > 0 ? ` · ${attempt.puzzleRating}` : '';
  const result = attempt.passed ? 'doğru' : 'yanlış';
  return `Chess.com bulmaca${rating} · ${result}`;
}

export async function chessComPuzzleAttemptToBoardSnapshot(
  attempt: ChessComPuzzleAttempt,
): Promise<ChessComPuzzleBoardSnapshot | null> {
  const puzzleId = Number(attempt.id);
  if (!puzzleId) return null;

  const pgn = await fetchChessComPuzzlePgn(puzzleId);
  let fen = START_FEN;
  if (pgn) {
    const setup = puzzleSetupFenFromPgn(sanitizeChessComPuzzlePgn(pgn));
    if (setup) fen = setup;
  } else if (attempt.fen?.trim()) {
    fen = attempt.fen.trim();
  }

  return {
    fen,
    moves: [],
    baseFen: fen,
    source: 'chesscom',
    gameId: String(puzzleId),
    gameUrl: `https://www.chess.com/puzzles/problem/${encodeURIComponent(String(puzzleId))}`,
    label: puzzleAttemptLabel(attempt),
    boardOrientation: attempt.flipBoard ? 'black' : 'white',
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchChessComLatestPuzzleByUsername(username: string): Promise<{
  ok: boolean;
  snapshot?: ChessComPuzzleBoardSnapshot;
  attempt?: ChessComPuzzleAttempt;
  error?: string;
}> {
  const bundle = await fetchChessComTactics2Bundle(username);
  if (!bundle) {
    return { ok: false, error: 'Chess.com bulmaca listesi alınamadı' };
  }
  const attempt = pickLatestChessComPuzzleAttempt(bundle);
  if (!attempt) {
    return { ok: false, error: 'Son Chess.com bulmacası bulunamadı' };
  }
  const snapshot = await chessComPuzzleAttemptToBoardSnapshot(attempt);
  if (!snapshot) {
    return { ok: false, error: 'Bulmaca konumu alınamadı' };
  }
  return { ok: true, snapshot, attempt };
}

export async function fetchStudentLatestChessComPuzzle(studentId: string): Promise<{
  ok: boolean;
  snapshot?: ChessComPuzzleBoardSnapshot;
  attempt?: ChessComPuzzleAttempt;
  error?: string;
}> {
  const profile = await getStudentPlatformPullProfile(studentId);
  if (!profile?.chessComUsername) {
    return { ok: false, error: 'Chess.com kullanıcı adı tanımlı değil' };
  }
  return fetchChessComLatestPuzzleByUsername(profile.chessComUsername);
}

export async function fetchChessComPuzzleRecentStatus(username: string): Promise<boolean> {
  const bundle = await fetchChessComTactics2Bundle(username);
  if (!bundle) return false;
  const attempt = pickLatestChessComPuzzleAttempt(bundle);
  return isChessComPuzzleRecentlyActive(attempt, bundle);
}
