import { Chess } from 'chess.js';
import { getBestMoveAsync, getEvaluationPawnsAsync } from '../services/chessEngine';

export type MoveJudgement = 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export const JUDGEMENT_LABELS: Record<MoveJudgement, string> = {
  good: 'İyi',
  inaccuracy: 'İsabetsiz',
  mistake: 'Hata',
  blunder: 'Büyük hata',
};

export function classifyCpLoss(cpLoss: number): MoveJudgement {
  if (cpLoss >= 250) return 'blunder';
  if (cpLoss >= 120) return 'mistake';
  if (cpLoss >= 60) return 'inaccuracy';
  return 'good';
}

export interface ReviewedMove {
  ply: number;
  moveNumber: number;
  san: string;
  fenBefore: string;
  fenAfter: string;
  cpLoss: number;
  judgement: MoveJudgement;
  bestSan: string | null;
  color: 'w' | 'b';
}

export function loadPgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of pgn.split(/\r?\n/)) {
    const m = line.match(/^\[(\w+)\s+"(.*)"\]\s*$/);
    if (m) headers[m[1]] = m[2];
  }
  return headers;
}

export function inferPlayerColorFromPgn(
  pgn: string,
  username: string
): 'w' | 'b' | null {
  const headers = loadPgnHeaders(pgn);
  const u = username.trim().toLowerCase();
  const white = (headers.White || '').trim().toLowerCase();
  const black = (headers.Black || '').trim().toLowerCase();
  if (white === u) return 'w';
  if (black === u) return 'b';
  return null;
}

/**
 * Tek bir oyunda öğrencinin hamlelerini Stockfish ile tarar; yalnızca isabetsizlik ve üzeri döner.
 */
export async function reviewPlayerMovesInPgn(
  pgn: string,
  playerColor: 'w' | 'b',
  opts?: {
    maxPlies?: number;
    engineLevel?: number;
    onProgress?: (done: number, total: number) => void;
  }
): Promise<ReviewedMove[]> {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn, { sloppy: true });
  } catch {
    return [];
  }

  const history = chess.history({ verbose: true });
  if (!history.length) return [];

  const replay = new Chess();
  const startFen = replay.fen();
  const mistakes: ReviewedMove[] = [];
  const maxPlies = opts?.maxPlies ?? 120;
  const level = opts?.engineLevel ?? 6;
  const total = Math.min(history.length, maxPlies);

  for (let i = 0; i < total; i++) {
    if (i > 0 && i % 4 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    opts?.onProgress?.(i + 1, total);
    const mv = history[i];
    const side = replay.turn();
    if (side !== playerColor) {
      replay.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
      continue;
    }

    const fenBefore = replay.fen();
    const posBefore = new Chess(fenBefore);
    const bestSan = await getBestMoveAsync(posBefore, level);

    let bestEval = 0;
    if (bestSan) {
      const bestPos = new Chess(fenBefore);
      try {
        bestPos.move(bestSan);
        bestEval = await getEvaluationPawnsAsync(bestPos);
      } catch {
        bestEval = await getEvaluationPawnsAsync(posBefore);
      }
    } else {
      bestEval = await getEvaluationPawnsAsync(posBefore);
    }

    const playedPos = new Chess(fenBefore);
    playedPos.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
    const playedEval = await getEvaluationPawnsAsync(playedPos);

    const sign = playerColor === 'w' ? 1 : -1;
    const cpLoss = Math.max(0, Math.round((bestEval - playedEval) * 100 * sign));
    const judgement = classifyCpLoss(cpLoss);

    if (judgement !== 'good') {
      mistakes.push({
        ply: i + 1,
        moveNumber: Math.ceil((i + 1) / 2),
        san: mv.san,
        fenBefore,
        fenAfter: playedPos.fen(),
        cpLoss,
        judgement,
        bestSan,
        color: playerColor,
      });
    }

    replay.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
  }

  if (replay.fen() !== chess.fen()) {
    void startFen;
  }

  return mistakes.sort((a, b) => b.cpLoss - a.cpLoss);
}
