import { Chess } from 'chess.js';
import type { Puzzle } from '../types';

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Hamle string'ini chess.js ile uygular: SAN veya UCI (e2e4, e7f7q). */
export function applyPuzzleMove(game: Chess, moveStr: string): ReturnType<Chess['move']> {
  if (!moveStr || typeof moveStr !== 'string') return null;
  const s = moveStr.trim().replace(/\s+/g, '');
  try {
    if (s.length >= 4 && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(s.toLowerCase())) {
      const from = s.slice(0, 2).toLowerCase();
      const to = s.slice(2, 4).toLowerCase();
      const promotion = s[4] ? (s[4].toLowerCase() as 'q' | 'r' | 'b' | 'n') : undefined;
      return game.move({ from, to, ...(promotion && { promotion }) });
    }
    return game.move(s);
  } catch {
    return null;
  }
}

export type NormalizedPuzzlePlay = {
  startFen: string;
  /** Öğrencinin sırayla oynaması gereken hamleler (rakip hamleleri hariç). */
  studentMoves: string[];
  /** Öğrencinin rengi — startFen'deki sıra ile aynı olmalı. */
  studentColor: 'w' | 'b';
  /** Lichess: otomatik oynanan rakip kurulum hamlesi (SAN). */
  setupMoveSan?: string;
  dataError?: string;
  /** Pozisyon/çözüm uyumsuz — gevşek eşleştirme ile oynanabilir. */
  relaxedMode?: boolean;
};

function looksLikeUciMove(s: string): boolean {
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(s.trim());
}

export function isLichessStylePuzzle(
  puzzle: Pick<Puzzle, 'source' | 'lichessThemes' | 'solution' | 'gamePgn' | 'lichessId'>,
): boolean {
  if (puzzle.source === 'lichess') return true;
  if (puzzle.lichessThemes) return true;
  if (puzzle.gamePgn) return true;
  if (puzzle.lichessId) return true;
  const sol = puzzle.solution ?? [];
  return sol.length > 0 && sol.every(looksLikeUciMove);
}

export function looksLikeLichessPuzzleId(id: string): boolean {
  const s = id.trim();
  if (!s) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return false;
  return /^[a-zA-Z0-9_-]{1,12}$/.test(s);
}

/**
 * Lichess (CSV ve API): FEN rakip hamlesinden önce, solution[0] rakip kurulumu.
 * Öğretmen editörü (custom): FEN'de öğrenci oynar, solution[0] öğrenci hamlesi.
 */
export function normalizePuzzleForStudentPlay(
  puzzle: Pick<Puzzle, 'fen' | 'solution' | 'source' | 'gamePgn' | 'lichessThemes' | 'lichessId'>,
): NormalizedPuzzlePlay {
  const rawFen = puzzle.fen?.trim() || DEFAULT_FEN;
  const rawSolution = Array.isArray(puzzle.solution) ? puzzle.solution.filter(Boolean) : [];

  let game: Chess;
  try {
    game = new Chess(rawFen);
  } catch {
    game = new Chess(DEFAULT_FEN);
  }
  const turnAtStart = game.turn();

  if (rawSolution.length === 0) {
    return { startFen: rawFen, studentMoves: [], studentColor: turnAtStart };
  }

  const lichessOpponentSetup = isLichessStylePuzzle(puzzle);

  if (lichessOpponentSetup) {
    const setupGame = new Chess(rawFen);
    const setup = applyPuzzleMove(setupGame, rawSolution[0]);
    if (setup) {
      const studentMoves = rawSolution.slice(1);
      const studentColor = setupGame.turn();
      const nextOk = studentMoves.length === 0
        || applyPuzzleMove(new Chess(setupGame.fen()), studentMoves[0]) != null;
      if (nextOk) {
        return {
          startFen: setupGame.fen(),
          studentMoves,
          studentColor,
          setupMoveSan: setup.san,
        };
      }
    }

    // Kurulum uygulanamadı — FEN zaten kurulum sonrası olabilir
    const studentFirst = applyPuzzleMove(new Chess(rawFen), rawSolution[0]);
    if (studentFirst && studentFirst.color === turnAtStart) {
      return {
        startFen: rawFen,
        studentMoves: rawSolution,
        studentColor: turnAtStart,
      };
    }

    return {
      startFen: rawFen,
      studentMoves: rawSolution,
      studentColor: turnAtStart,
      dataError: 'Bulmaca pozisyonu ile çözüm hattı uyuşmuyor. Öğretmeninize bildirin.',
      relaxedMode: true,
    };
  }

  const first = applyPuzzleMove(new Chess(rawFen), rawSolution[0]);
  if (!first) {
    return {
      startFen: rawFen,
      studentMoves: rawSolution,
      studentColor: turnAtStart,
      dataError: 'Bulmaca pozisyonu ile çözüm hattı uyuşmuyor. Öğretmeninize bildirin.',
      relaxedMode: true,
    };
  }

  return {
    startFen: rawFen,
    studentMoves: rawSolution,
    studentColor: turnAtStart,
  };
}

/** Bozuk kayıtlar için ek onarım denemeleri. */
export function repairPuzzleForStudentPlay(puzzle: Puzzle): NormalizedPuzzlePlay {
  const direct = normalizePuzzleForStudentPlay(puzzle);
  if (!direct.dataError) return direct;

  const rawFen = puzzle.fen?.trim() || DEFAULT_FEN;
  const rawSolution = puzzle.solution?.filter(Boolean) ?? [];
  if (rawSolution.length === 0) return direct;

  if (isLichessStylePuzzle(puzzle)) {
    const forced = normalizePuzzleForStudentPlay({ ...puzzle, source: 'lichess' });
    if (!forced.dataError) return forced;

    // Çözüm hattının başından itibaren uygulanabilir kısmı bul
    const replay = new Chess(rawFen);
    let prefix = 0;
    for (const m of rawSolution) {
      if (!applyPuzzleMove(replay, m)) break;
      prefix += 1;
    }
    if (prefix > 0) {
      const studentMoves = rawSolution.slice(prefix);
      const studentColor = replay.turn();
      const ok = studentMoves.length === 0
        || applyPuzzleMove(new Chess(replay.fen()), studentMoves[0]) != null;
      if (ok) {
        return {
          startFen: replay.fen(),
          studentMoves,
          studentColor,
          setupMoveSan: prefix >= 1
            ? resolveExpectedMoveSquares(rawFen, rawSolution[0])?.san
            : undefined,
        };
      }
    }

    // Öğrencinin sıradaki hamlesi çözümde daha ileride olabilir
    const turn = new Chess(rawFen).turn();
    for (let i = 0; i < rawSolution.length; i++) {
      const probe = resolveExpectedMoveSquares(rawFen, rawSolution[i]);
      if (probe) {
        const piece = new Chess(rawFen).get(probe.from as `${string}${number}`);
        if (piece && piece.color === turn) {
          return {
            startFen: rawFen,
            studentMoves: rawSolution.slice(i),
            studentColor: turn,
          };
        }
      }
    }
  }

  return { ...direct, relaxedMode: true };
}

/** Mevcut pozisyonda çözüm hattında eşleşen hamleyi bul (gevşek mod). */
export function findMatchingSolutionMove(
  fen: string,
  moves: string[],
  startIndex: number,
  from: string,
  to: string,
): { index: number; san: string; moveStr: string } | null {
  for (let i = startIndex; i < moves.length; i++) {
    const exp = resolveExpectedMoveSquares(fen, moves[i]);
    if (exp && exp.from === from && exp.to === to) {
      return { index: i, san: exp.san, moveStr: moves[i] };
    }
  }
  return null;
}

export function resolveExpectedMoveSquares(
  currentFen: string,
  moveStr: string,
): { from: string; to: string; san: string } | null {
  try {
    const g = new Chess(currentFen);
    const move = applyPuzzleMove(g, moveStr);
    return move ? { from: move.from, to: move.to, san: move.san } : null;
  } catch {
    return null;
  }
}

/** Mevcut pozisyonda beklenen hamleyi SAN olarak döndürür; geçersizse null. */
export function expectedMoveSan(currentFen: string, moveStr: string): string | null {
  return resolveExpectedMoveSquares(currentFen, moveStr)?.san ?? null;
}

/** İpucu metni — yalnızca geçerli hamle varsa SAN, yoksa açıklayıcı mesaj. */
export function formatHintMove(currentFen: string, moveStr: string): string {
  const san = expectedMoveSan(currentFen, moveStr);
  if (san) return san;
  return 'Bu pozisyonda beklenen hamle uygulanamıyor';
}
