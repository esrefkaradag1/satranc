import { lichessImportToPlayState } from './puzzlePlayUtils';
import {
  fetchLichessLatestPuzzleActivity,
  fetchLichessPuzzleNext,
  getStudentLichessToken,
  type LichessPuzzleActivityRow,
  type LichessPuzzleAndGame,
} from './lichessOAuthServer';
import { CHESSCOM_PUZZLE_RECENT_MS } from './studentChessComPuzzlePull';

export type LichessPuzzleBoardSnapshot = {
  fen: string;
  moves: string[];
  baseFen: string;
  source: 'lichess';
  gameId: string;
  gameUrl: string;
  label: string;
  activityKind?: 'puzzle';
  updatedAt: string;
};

export function lichessPuzzleApiToBoardSnapshot(
  data: LichessPuzzleAndGame,
  opts?: { inProgress?: boolean },
): LichessPuzzleBoardSnapshot | null {
  const puzzle = data.puzzle;
  if (!puzzle || typeof puzzle !== 'object') return null;
  const puzzleId = String(
    (puzzle as Record<string, unknown>).id
    ?? (puzzle as Record<string, unknown>).gameId
    ?? '',
  ).trim();
  if (!puzzleId) return null;

  let fen = typeof puzzle.fen === 'string' ? puzzle.fen.trim() : '';
  const sol = Array.isArray(puzzle.solution)
    ? puzzle.solution.map((m) => String(m).trim()).filter(Boolean)
    : [];
  if (!fen) return null;
  if (sol.length > 0) {
    fen = lichessImportToPlayState(fen, sol).playFen;
  }

  const rating = typeof puzzle.rating === 'number' ? puzzle.rating : undefined;
  const suffix = opts?.inProgress ? ' · çözülüyor' : '';
  const label = `Lichess bulmaca${rating ? ` · ${rating}` : ''}${suffix}`;

  return {
    fen,
    moves: [],
    baseFen: fen,
    source: 'lichess',
    gameId: puzzleId,
    gameUrl: `https://lichess.org/training/${encodeURIComponent(puzzleId)}`,
    label,
    activityKind: 'puzzle',
    updatedAt: new Date().toISOString(),
  };
}

async function fetchLichessPuzzlePlayFen(puzzleId: string): Promise<string | null> {
  const clean = String(puzzleId ?? '').trim();
  if (!clean) return null;
  try {
    const res = await fetch(`https://lichess.org/api/puzzle/${encodeURIComponent(clean)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { game?: { pgn?: string }; puzzle: Record<string, unknown> };
    const puzzle = data.puzzle;
    if (!puzzle || typeof puzzle !== 'object') return null;
    let fen = typeof puzzle.fen === 'string' ? puzzle.fen.trim() : '';
    const sol = Array.isArray(puzzle.solution)
      ? puzzle.solution.map((m) => String(m).trim()).filter(Boolean)
      : [];
    if (!fen) return null;
    return lichessImportToPlayState(fen, sol).playFen;
  } catch {
    return null;
  }
}

function puzzleAttemptLabel(attempt: LichessPuzzleActivityRow): string {
  const rating = attempt.rating != null ? ` · ${attempt.rating}` : '';
  const result = attempt.win ? 'doğru' : 'yanlış';
  return `Lichess bulmaca${rating} · ${result}`;
}

export async function lichessPuzzleAttemptToBoardSnapshot(
  attempt: LichessPuzzleActivityRow,
): Promise<LichessPuzzleBoardSnapshot | null> {
  const puzzleId = String(attempt.puzzleId ?? '').trim();
  if (!puzzleId) return null;
  const playFen = await fetchLichessPuzzlePlayFen(puzzleId);
  if (!playFen) return null;
  return {
    fen: playFen,
    moves: [],
    baseFen: playFen,
    source: 'lichess',
    gameId: puzzleId,
    gameUrl: `https://lichess.org/training/${encodeURIComponent(puzzleId)}`,
    label: puzzleAttemptLabel(attempt),
    activityKind: 'puzzle',
    updatedAt: new Date().toISOString(),
  };
}

/** Devam eden bulmaca — puzzle/next tamamlanmamış bulmacayı döndürür */
export async function fetchStudentLichessCurrentPuzzle(studentId: string): Promise<{
  ok: boolean;
  snapshot?: LichessPuzzleBoardSnapshot;
  error?: string;
}> {
  const token = await getStudentLichessToken(studentId);
  if (!token) {
    return { ok: false, error: 'Lichess hesabı bağlı değil' };
  }
  try {
    const data = await fetchLichessPuzzleNext({ token });
    if (!data) {
      return { ok: false, error: 'Aktif Lichess bulmacası yok' };
    }
    const snapshot = lichessPuzzleApiToBoardSnapshot(data, { inProgress: true });
    if (!snapshot) {
      return { ok: false, error: 'Bulmaca konumu alınamadı' };
    }
    return { ok: true, snapshot };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Bulmaca çekilemedi',
    };
  }
}

export async function fetchLichessPuzzleRecentStatus(studentId: string): Promise<boolean> {
  const token = await getStudentLichessToken(studentId);
  if (!token) return false;
  try {
    const current = await fetchLichessPuzzleNext({ token });
    if (current?.puzzle) return true;
  } catch {
    /* devam et */
  }
  try {
    const attempt = await fetchLichessLatestPuzzleActivity({ token, lookbackDays: 1 });
    if (!attempt) return false;
    return Date.now() - attempt.date < CHESSCOM_PUZZLE_RECENT_MS;
  } catch {
    return false;
  }
}

export async function fetchStudentLatestLichessPuzzle(studentId: string): Promise<{
  ok: boolean;
  snapshot?: LichessPuzzleBoardSnapshot;
  attempt?: LichessPuzzleActivityRow;
  error?: string;
}> {
  const token = await getStudentLichessToken(studentId);
  if (!token) {
    return { ok: false, error: 'Lichess hesabı bağlı değil' };
  }
  try {
    const attempt = await fetchLichessLatestPuzzleActivity({ token, lookbackDays: 7 });
    if (!attempt) {
      return { ok: false, error: 'Son Lichess bulmacası bulunamadı' };
    }
    const snapshot = await lichessPuzzleAttemptToBoardSnapshot(attempt);
    if (!snapshot) {
      return { ok: false, error: 'Bulmaca konumu alınamadı' };
    }
    return { ok: true, snapshot, attempt };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Bulmaca çekilemedi',
    };
  }
}
