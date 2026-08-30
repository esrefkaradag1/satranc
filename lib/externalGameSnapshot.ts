import { Chess } from 'chess.js';
import { parsePgnBlockToMoves } from './studyUtils';
import type { TcnMove } from './chesscomTcn';
import type { ExternalGamePlatform } from './externalGameLink';

export type ExternalGameSnapshot = {
  fen: string;
  moves: string[];
  baseFen: string;
  source: ExternalGamePlatform | 'linked';
  gameId: string;
  gameUrl: string;
  label?: string;
  isFinished?: boolean;
};

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function fenAtSanMoves(baseFen: string, moves: string[], ply: number | null = null): string {
  try {
    const game = new Chess(baseFen);
    const total = moves.length;
    const target = ply ?? total;
    for (let i = 0; i < Math.min(target, total); i++) {
      const m = moves[i];
      if (!m) break;
      try {
        if (!game.move(m)) break;
      } catch {
        break;
      }
    }
    return game.fen();
  } catch {
    return baseFen;
  }
}

/** Lichess NDJSON `moves` alanı: boşlukla ayrılmış SAN ("e4 e5 Nf3"). */
export function snapshotFromSanList(
  sanText: string,
  meta: {
    source: ExternalGameSnapshot['source'];
    gameId: string;
    gameUrl: string;
    label?: string;
    isFinished?: boolean;
  },
  opts?: { initialFen?: string; headFen?: string },
): ExternalGameSnapshot | null {
  const trimmed = sanText.trim();
  if (!trimmed) return null;
  const baseFen = opts?.initialFen?.trim() || START_FEN;
  try {
    const game = new Chess(baseFen);
    const sans: string[] = [];
    for (const raw of trimmed.split(/\s+/)) {
      const token = raw.replace(/^\d+\.+\.?/, '').trim();
      if (!token || token === '1-0' || token === '0-1' || token === '1/2-1/2' || token === '*') continue;
      const played = game.move(token);
      if (!played) break;
      sans.push(played.san);
    }
    if (sans.length === 0) return null;
    const fen = opts?.headFen?.trim() || game.fen();
    return { fen, moves: sans, baseFen, ...meta };
  } catch {
    return null;
  }
}

export function snapshotFromPgn(pgn: string, meta: {
  source: ExternalGameSnapshot['source'];
  gameId: string;
  gameUrl: string;
  label?: string;
  isFinished?: boolean;
}): ExternalGameSnapshot | null {
  const trimmed = pgn.trim();
  if (!trimmed) return null;
  const { startFen, moves } = parsePgnBlockToMoves(trimmed);
  const baseFen = startFen || START_FEN;
  const fen = moves.length > 0 ? fenAtSanMoves(baseFen, moves, moves.length) : baseFen;
  return {
    fen,
    moves,
    baseFen,
    ...meta,
  };
}

export function snapshotFromTcnMoves(
  tcnMoves: TcnMove[],
  meta: {
    source: 'chesscom';
    gameId: string;
    gameUrl: string;
    label?: string;
    isFinished?: boolean;
    initialFen?: string;
  },
): ExternalGameSnapshot | null {
  if (tcnMoves.length === 0) return null;
  const baseFen = meta.initialFen?.trim() || START_FEN;
  try {
    const game = new Chess(baseFen);
    const sans: string[] = [];
    for (const m of tcnMoves) {
      if (m.drop) {
        const piece = m.drop === 'p' ? 'p' : m.drop;
        const played = game.move({
          from: m.to as `${string}${number}`,
          to: m.to as `${string}${number}`,
          promotion: m.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
        });
        if (!played) {
          const alt = game.move({
            from: 'a1',
            to: m.to as `${string}${number}`,
            promotion: (m.promotion ?? piece) as 'q' | 'r' | 'b' | 'n' | 'p' | undefined,
          });
          if (!alt) break;
          sans.push(alt.san);
          continue;
        }
        sans.push(played.san);
        continue;
      }
      if (!m.from) break;
      const played = game.move({
        from: m.from as `${string}${number}`,
        to: m.to as `${string}${number}`,
        promotion: m.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
      });
      if (!played) break;
      sans.push(played.san);
    }
    if (sans.length === 0) return null;
    return {
      fen: game.fen(),
      moves: sans,
      baseFen,
      source: meta.source,
      gameId: meta.gameId,
      gameUrl: meta.gameUrl,
      label: meta.label,
      isFinished: meta.isFinished,
    };
  } catch {
    return null;
  }
}

export function snapshotFromLichessStreamLine(
  line: Record<string, unknown>,
  meta: { gameId: string; gameUrl: string; label?: string },
): ExternalGameSnapshot | null {
  const type = String(line.type ?? '');
  /** gameFull: hamleler `state.moves` / `state.fen` içinde; gameState: üst düzey `moves` */
  const state =
    line.state && typeof line.state === 'object'
      ? (line.state as Record<string, unknown>)
      : null;
  const initialFenRaw =
    typeof line.initialFen === 'string' && line.initialFen.trim()
      ? line.initialFen.trim()
      : START_FEN;
  const fenRaw =
    (typeof line.fen === 'string' && line.fen.trim())
    || (typeof state?.fen === 'string' && state.fen.trim())
    || '';
  const movesUci =
    (typeof line.moves === 'string' && line.moves.trim())
    || (typeof state?.moves === 'string' && state.moves.trim())
    || '';
  if (!fenRaw && !movesUci && type !== 'gameFull') return null;

  const baseFen = initialFenRaw.includes('/') ? initialFenRaw : START_FEN;
  try {
    const game = new Chess(baseFen);
    const sans: string[] = [];
    if (movesUci) {
      const ucis = movesUci.split(/\s+/).filter(Boolean);
      for (const uci of ucis) {
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci[4] : undefined;
        const played = game.move({
          from: from as `${string}${number}`,
          to: to as `${string}${number}`,
          promotion: promotion as 'q' | 'r' | 'b' | 'n' | undefined,
        });
        if (!played) break;
        sans.push(played.san);
      }
    }
    const fen = fenRaw || (sans.length ? game.fen() : baseFen);
    if (!fen.includes('/')) return null;
    const status = String(state?.status ?? line.status ?? '');
    return {
      fen,
      moves: sans,
      baseFen,
      source: 'lichess',
      gameId: meta.gameId,
      gameUrl: meta.gameUrl,
      label: meta.label,
      isFinished:
        status === 'mate'
        || status === 'draw'
        || status === 'stalemate'
        || status === 'resign'
        || status === 'outoftime'
        || status === 'aborted'
        || status === 'timeout',
    };
  } catch {
    // Hamle listesi olmadan FEN-only snapshot üretme — üst katman PGN export dener.
    return null;
  }
}
