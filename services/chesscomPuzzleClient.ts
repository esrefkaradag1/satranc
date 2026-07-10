import type { ChessComPuzzleAttempt } from '../lib/chesscomPuzzleParse';

export type ChessComLatestPuzzlePullResult = {
  ok: boolean;
  snapshot?: {
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
  attempt?: ChessComPuzzleAttempt;
  error?: string;
};

export async function fetchStudentLatestChessComPuzzle(
  studentId: string,
): Promise<ChessComLatestPuzzlePullResult> {
  try {
    const res = await fetch(`/api/chesscom-puzzle-latest?studentId=${encodeURIComponent(studentId)}`);
    const data = (await res.json().catch(() => ({}))) as ChessComLatestPuzzlePullResult;
    if (!res.ok) return { ok: false, error: data.error || 'Bulmaca çekilemedi' };
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Ağ hatası' };
  }
}
