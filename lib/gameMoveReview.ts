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

/** Chess.com PGN saat/eval notlarını kaldırır (chess.js uyumu). */
export function normalizeGamePgn(pgn: string): string {
  return pgn
    .replace(/\{\[%clk[^\]]*\]\}/gi, '')
    .replace(/\{\[%eval[^\]]*\]\}/gi, '')
    .replace(/\{\[%emt[^\]]*\]\}/gi, '')
    .trim();
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

export type ReviewPgnResult =
  | { ok: true; mistakes: ReviewedMove[] }
  | { ok: false; reason: 'parse' | 'empty' };

const REVIEW_MOVETIME_MS = 160;

/**
 * Tek bir oyunda öğrencinin hamlelerini Stockfish ile tarar; yalnızca isabetsizlik ve üzeri döner.
 * Hızlı mod: önce eval düşüşü ölçülür; yalnızca şüpheli hamlelerde en iyi hamle aranır.
 */
export async function reviewPlayerMovesInPgn(
  pgn: string,
  playerColor: 'w' | 'b',
  opts?: {
    maxPlies?: number;
    engineLevel?: number;
    evalMovetimeMs?: number;
    onProgress?: (done: number, total: number) => void;
  }
): Promise<ReviewPgnResult> {
  const normalized = normalizeGamePgn(pgn);
  const chess = new Chess();
  try {
    chess.loadPgn(normalized, { strict: false });
  } catch {
    return { ok: false, reason: 'parse' };
  }

  const history = chess.history({ verbose: true });
  if (!history.length) return { ok: false, reason: 'empty' };

  const replay = new Chess();
  const mistakes: ReviewedMove[] = [];
  const maxPlies = opts?.maxPlies ?? 120;
  const level = opts?.engineLevel ?? 8;
  const evalMs = opts?.evalMovetimeMs ?? REVIEW_MOVETIME_MS;
  const totalPlies = Math.min(history.length, maxPlies);
  const sign = playerColor === 'w' ? 1 : -1;

  let playerMovesTotal = 0;
  for (let i = 0; i < totalPlies; i++) {
    const side: 'w' | 'b' = i % 2 === 0 ? 'w' : 'b';
    if (side === playerColor) playerMovesTotal++;
  }

  let playerMovesDone = 0;
  opts?.onProgress?.(0, playerMovesTotal);

  for (let i = 0; i < totalPlies; i++) {
    const mv = history[i];
    const side = replay.turn();
    if (side !== playerColor) {
      replay.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
      continue;
    }

    playerMovesDone++;
    opts?.onProgress?.(playerMovesDone, playerMovesTotal);

    const fenBefore = replay.fen();
    const evalBefore = await getEvaluationPawnsAsync(new Chess(fenBefore), evalMs);

    const playedPos = new Chess(fenBefore);
    playedPos.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
    const evalAfter = await getEvaluationPawnsAsync(playedPos, evalMs);

    const cpLoss = Math.max(0, Math.round((evalBefore - evalAfter) * 100 * sign));
    const judgement = classifyCpLoss(cpLoss);

    let bestSan: string | null = null;
    if (judgement !== 'good') {
      bestSan = await getBestMoveAsync(new Chess(fenBefore), level, {
        strictFallback: true,
        movetimeMs: evalMs,
      });
      if (bestSan === mv.san) {
        replay.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
        continue;
      }
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

    if (playerMovesDone % 4 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return { ok: true, mistakes: mistakes.sort((a, b) => b.cpLoss - a.cpLoss) };
}
