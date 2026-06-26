import { Chess } from 'chess.js';
import {
  initStockfish,
  getBestMoveFromStockfish,
  getEvalFromStockfish,
  isStockfishReady,
} from './stockfishService';

/** Tahta yapıcıdan gelen geçersiz FEN (eksik kral vb.) için skipValidation fallback */
function safeChessFromFen(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch {
    // biome-ignore lint/suspicious/noExplicitAny: chess.js v1 options
    return new Chess(fen, { skipValidation: true } as any);
  }
}

const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000
};

/** Beyaz lehine pozisyon değeri (pozitif = beyaz iyi). Materyal + basit konum. Centipawn cinsinden. */
export function evaluatePosition(chess: Chess): number {
  const fen = chess.fen();
  const board = fen.split(' ')[0];
  if (!board) return 0;

  let score = 0;
  const pieceMap: Record<string, number> = { P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6, p: -1, n: -2, b: -3, r: -4, q: -5, k: -6 };
  const val: Record<number, number> = { 1: 100, 2: 320, 3: 330, 4: 500, 5: 900, 6: 20000 };

  let row = 0;
  let col = 0;
  for (let i = 0; i < board.length; i++) {
    const c = board[i];
    if (c === '/') {
      row++;
      col = 0;
      continue;
    }
    const n = parseInt(c, 10);
    if (!Number.isNaN(n)) {
      col += n;
      continue;
    }
    const p = pieceMap[c];
    if (p === undefined) continue;
    const pieceVal = val[Math.abs(p)] || 0;
    const sign = p > 0 ? 1 : -1;
    score += sign * pieceVal;
    // Piyon ilerlemesi (beyaz yukarı, siyah aşağı)
    if (Math.abs(p) === 1) {
      const advance = p > 0 ? row : (7 - row);
      score += sign * advance * 5;
    }
    col++;
  }

  // Şah tehdidi
  if (chess.isCheckmate()) return chess.turn() === 'b' ? 100000 : -100000;
  if (chess.isCheck()) score += chess.turn() === 'w' ? -30 : 30;

  return score;
}

/** Hamleleri sırala: capture ve şah önce (alpha-beta budaması için). */
function orderMoves(moves: { san: string; captured?: string }[]): typeof moves {
  return [...moves].sort((a, b) => {
    const capA = a.captured ? (PIECE_VALUES[a.captured] ?? 100) : 0;
    const capB = b.captured ? (PIECE_VALUES[b.captured] ?? 100) : 0;
    return capB - capA;
  });
}

/** Minimax + alpha-beta; derinlik 0'da pozisyon değeri döner. Beyaz max, siyah min. */
function minimax(chess: Chess, depth: number, alpha: number, beta: number): number {
  if (depth <= 0) return evaluatePosition(chess);

  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return evaluatePosition(chess);

  const isWhite = chess.turn() === 'w';
  const ordered = depth >= 2 ? orderMoves(moves) : moves;

  if (isWhite) {
    let maxEval = -Infinity;
    for (const move of ordered) {
      const copy = safeChessFromFen(chess.fen());
      copy.move(move.san);
      const evalScore = minimax(copy, depth - 1, alpha, beta);
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of ordered) {
      const copy = safeChessFromFen(chess.fen());
      copy.move(move.san);
      const evalScore = minimax(copy, depth - 1, alpha, beta);
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

/** 1 = en zayıf, 10 = en güçlü (derin arama, hatasız). */
export type EngineLevel = number;

/**
 * Seviye 1–10: Derinlik ve rastgele hata oranı ayarlanır.
 * 1–2: Derinlik 1, yüksek hata. 3–4: Derinlik 2. 5–6: Derinlik 3. 7–8: Derinlik 4. 9: Derinlik 5. 10: Derinlik 6, hatasız.
 */
export const getBestMove = (chess: Chess, level: EngineLevel = 5): string | null => {
  const copy = safeChessFromFen(chess.fen());
  const moves = copy.moves({ verbose: true });
  if (moves.length === 0) return null;

  const lvl = Math.max(1, Math.min(10, Math.round(level)));
  const depthMap: Record<number, number> = {
    1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 4, 10: 4,
  };
  const depth = depthMap[lvl] ?? 3;
  const mistakeChance = lvl <= 2 ? 0.5 : lvl <= 4 ? 0.28 : lvl <= 6 ? 0.12 : 0;

  const scored: { san: string; score: number }[] = [];

  for (const move of moves) {
    const child = safeChessFromFen(copy.fen());
    child.move(move.san);
    if (child.isCheckmate()) return move.san;
    const scoreForUs = -minimax(child, depth - 1, -Infinity, Infinity);
    scored.push({ san: move.san, score: scoreForUs });
  }

  if (scored.length === 0) return null;

  const bestScore = Math.max(...scored.map((s) => s.score));
  const bestMoves = scored.filter((s) => s.score === bestScore).map((s) => s.san);

  if (mistakeChance > 0 && Math.random() < mistakeChance) {
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    const weakCount = lvl <= 2 ? 5 : 3;
    const topCandidates = sorted.slice(0, Math.min(weakCount, sorted.length));
    if (topCandidates.length > 1) {
      const pick = topCandidates[Math.floor(Math.random() * topCandidates.length)];
      return pick.san;
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
};

/** Pozisyon değerini piyon biriminde döndürür (görüntüleme için, örn. 0.5 = beyaz yarım piyon üstün). */
export function getEvaluationPawns(chess: Chess): number {
  return evaluatePosition(chess) / 100;
}

// ─── Stockfish entegrasyonu (bulmaca / çalışma alanı) ─────────────────────────
let stockfishInitStarted = false;

/** Seviye 1–10 için movetime (ms): 1=300, 10=2500 */
function movetimeMsForLevel(level: number): number {
  const lvl = Math.max(1, Math.min(20, Math.round(level)));
  // 1-10: 200-2500ms, 11-20: 2750-5000ms
  return 200 + lvl * 240;
}

/** UCI hamlesini (e2e4) SAN'a çevirir; geçersizse null. */
function uciToSan(chess: Chess, uci: string): string | null {
  if (!uci || uci.length < 4) return null;
  const from = uci.slice(0, 2) as `${string}${string}`;
  const to = uci.slice(2, 4) as `${string}${string}`;
  const promotion = uci.length >= 5 ? (uci[4].toLowerCase() as 'q' | 'r' | 'b' | 'n') : undefined;
  try {
    const copy = safeChessFromFen(chess.fen());
    const move = copy.move({ from, to, promotion });
    return move ? move.san : null;
  } catch {
    return null;
  }
}

/**
 * En iyi hamleyi döndürür — Stockfish hazırsa onu kullanır, değilse yerel minimax.
 * Bulmaca / çalışma alanında kullanılır.
 */
export async function getBestMoveAsync(
  chess: Chess,
  level: EngineLevel = 5,
  opts?: { strictFallback?: boolean },
): Promise<string | null> {
  if (!chess || chess.isGameOver()) return null;
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  if (!stockfishInitStarted) {
    stockfishInitStarted = true;
    await initStockfish();
  }
  if (isStockfishReady()) {
    const fen = chess.fen();
    const movetime = movetimeMsForLevel(level);
    const uci = await getBestMoveFromStockfish(fen, movetime);
    if (uci) {
      const san = uciToSan(chess, uci);
      if (san) return san;
    }
  }
  return getBestMove(chess, opts?.strictFallback ? 10 : level);
}

/**
 * Pozisyon değerlendirmesi (piyon birimi) — Stockfish hazırsa onu kullanır.
 */
export async function getEvaluationPawnsAsync(chess: Chess, movetimeMs?: number): Promise<number> {
  if (!chess) return 0;
  if (!stockfishInitStarted) {
    stockfishInitStarted = true;
    await initStockfish();
  }
  if (isStockfishReady()) {
    const v = await getEvalFromStockfish(chess.fen(), movetimeMs ?? 500);
    return v;
  }
  return getEvaluationPawns(chess);
}
