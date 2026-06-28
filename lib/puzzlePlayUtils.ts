import { Chess } from 'chess.js';
import type { Puzzle, HomeworkAssignment } from '../types';

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
    try {
      return game.move(s);
    } catch {
      return game.move(s, { sloppy: true } as Parameters<Chess['move']>[1]);
    }
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

/** Bulmaca yönetimi oturumu: oynanabilir FEN + öğrenci çözüm hattı. */
export type CoachStyleSession = {
  playFen: string;
  solutionMoves: string[];
  studentColor: 'w' | 'b';
  setupMoveSan?: string;
  rawFen: string;
};

function looksLikeCastlingUci(moveStr: string): boolean {
  const s = moveStr.trim().toLowerCase();
  return looksLikeUciMove(s) && (s.endsWith('g1') || s.endsWith('g8') || s.endsWith('c1') || s.endsWith('c8'));
}

/** Hamle bu FEN'de sıradaki taraf tarafından oynanabilir mi? */
export function isMoveLegalForSideToMove(fen: string, moveStr: string): boolean {
  try {
    const probe = resolveExpectedMoveSquares(fen, moveStr);
    if (!probe) return false;
    const g = new Chess(fen);
    const piece = g.get(probe.from as `${string}${number}`);
    if (!piece || piece.color !== g.turn()) return false;
    if (looksLikeCastlingUci(moveStr) && piece.type !== 'k') return false;
    return applyPuzzleMove(new Chess(fen), moveStr) != null;
  } catch {
    return false;
  }
}

/**
 * puzzle.fen zaten çözüm pozisyonu: çözümde ilk geçerli öğrenci hamlesini bul.
 * e1g1 gibi eski Lichess kurulum UCI'leri (vezir kayması) elenir.
 */
function findStudentStartAtRawFen(
  rawFen: string,
  rawSolution: string[],
): CoachStyleSession | null {
  for (let i = 0; i < rawSolution.length; i++) {
    if (!canReplayMovesFrom(rawFen, rawSolution, i)) continue;
    if (!isMoveLegalForSideToMove(rawFen, rawSolution[i]!)) continue;
    return {
      playFen: rawFen,
      solutionMoves: rawSolution.slice(i),
      studentColor: new Chess(rawFen).turn(),
      rawFen,
    };
  }
  return null;
}

/**
 * Lichess CSV/API import: FEN kurulum öncesi, moves[0] rakip kurulumu.
 * Her zaman kurulumu uygular; playFen + öğrenci hattı döner.
 */
export function lichessImportToPlayState(
  rawFen: string,
  uciMoves: string[],
): { playFen: string; solutionMoves: string[]; setupMoveSan?: string; lichessSetupMove?: string } {
  const fen = rawFen.trim() || DEFAULT_FEN;
  const moves = uciMoves.map((m) => String(m).trim()).filter(Boolean);
  if (moves.length === 0) {
    return { playFen: fen, solutionMoves: [] };
  }
  if (moves.length === 1) {
    return { playFen: fen, solutionMoves: moves };
  }

  const setupGame = new Chess(fen);
  const setup = applyPuzzleMove(setupGame, moves[0]!);
  if (setup && !setupGame.isGameOver()) {
    const rest = moves.slice(1);
    if (rest.length > 0 && canReplayMovesFrom(setupGame.fen(), rest)) {
      return {
        playFen: setupGame.fen(),
        solutionMoves: rest,
        setupMoveSan: setup.san,
        lichessSetupMove: moves[0],
      };
    }
  }

  if (isMoveLegalForSideToMove(fen, moves[0]!) && canReplayMovesFrom(fen, moves)) {
    return { playFen: fen, solutionMoves: moves };
  }

  return { playFen: fen, solutionMoves: moves };
}

/** @deprecated lichessImportToPlayState kullanın */
export function lichessUciLineToPlayState(
  rawFen: string,
  uciMoves: string[],
): { playFen: string; solutionMoves: string[]; setupMoveSan?: string } {
  return lichessImportToPlayState(rawFen, uciMoves);
}

function safeTurnAtFen(fen: string): 'w' | 'b' {
  try {
    return new Chess(fen).turn();
  } catch {
    return 'w';
  }
}

/**
 * Supabase / bellekteki Lichess kaydı → oynanış oturumu.
 * Import sonrası kayıtlar doğrudan kullanılır; eski ham kayıtlar onarılır.
 */
export function lichessPlayStateFromStored(
  puzzle: Pick<Puzzle, 'fen' | 'solution' | 'hint' | 'lichessSetupMove' | 'source' | 'lichessId' | 'lichessThemes' | 'gamePgn'>,
): { playFen: string; solutionMoves: string[]; setupMoveSan?: string; studentColor: 'w' | 'b'; lichessSetupMove?: string } {
  const rawFen = puzzle.fen?.trim() || DEFAULT_FEN;
  const rawSolution = Array.isArray(puzzle.solution)
    ? puzzle.solution.map((m) => String(m).trim()).filter(Boolean)
    : [];

  if (rawSolution.length === 0) {
    return { playFen: rawFen, solutionMoves: [], studentColor: safeTurnAtFen(rawFen) };
  }

  const hint = puzzle.hint?.trim();
  const setupMove = puzzle.lichessSetupMove?.trim();
  const directOk =
    isMoveLegalForSideToMove(rawFen, rawSolution[0]!) &&
    canReplayMovesFrom(rawFen, rawSolution);

  // Import sonrası normalize kayıt (kurulum FEN'de uygulanmış)
  if (setupMove && directOk) {
    return {
      playFen: rawFen,
      solutionMoves: rawSolution,
      studentColor: safeTurnAtFen(rawFen),
      lichessSetupMove: setupMove,
    };
  }

  if (directOk && hint && hint === rawSolution[0]!) {
    return {
      playFen: rawFen,
      solutionMoves: rawSolution,
      studentColor: safeTurnAtFen(rawFen),
      lichessSetupMove: setupMove,
    };
  }

  // Eski kayıt: kurulum öncesi FEN + tam Lichess hattı (hint = öğrenci hamlesi)
  if (rawSolution.length >= 2 && hint && hint !== rawSolution[0]!) {
    const imported = lichessImportToPlayState(rawFen, rawSolution);
    if (imported.solutionMoves.length > 0 && imported.playFen !== rawFen) {
      return {
        playFen: imported.playFen,
        solutionMoves: imported.solutionMoves,
        setupMoveSan: imported.setupMoveSan,
        studentColor: safeTurnAtFen(imported.playFen),
        lichessSetupMove: imported.lichessSetupMove,
      };
    }
  }

  // Eski kayıt: kurulum öncesi FEN, hint yok veya kurulum UCI
  if (rawSolution.length >= 2) {
    const imported = lichessImportToPlayState(rawFen, rawSolution);
    if (
      imported.playFen !== rawFen &&
      imported.solutionMoves.length === rawSolution.length - 1 &&
      imported.lichessSetupMove
    ) {
      return {
        playFen: imported.playFen,
        solutionMoves: imported.solutionMoves,
        setupMoveSan: imported.setupMoveSan,
        studentColor: safeTurnAtFen(imported.playFen),
        lichessSetupMove: imported.lichessSetupMove,
      };
    }
  }

  if (directOk) {
    return {
      playFen: rawFen,
      solutionMoves: rawSolution,
      studentColor: safeTurnAtFen(rawFen),
      lichessSetupMove: setupMove,
    };
  }

  if (hint && hint !== rawSolution[0]) {
    const fromHint = lichessImportToPlayState(rawFen, [hint, ...rawSolution]);
    return {
      playFen: fromHint.playFen,
      solutionMoves: fromHint.solutionMoves,
      setupMoveSan: fromHint.setupMoveSan,
      studentColor: safeTurnAtFen(fromHint.playFen),
      lichessSetupMove: fromHint.lichessSetupMove,
    };
  }

  return {
    playFen: rawFen,
    solutionMoves: rawSolution,
    studentColor: safeTurnAtFen(rawFen),
    lichessSetupMove: setupMove,
  };
}

function tryLichessSetupSession(
  rawFen: string,
  uciMoves: string[],
): CoachStyleSession | null {
  if (uciMoves.length < 2) return null;
  const setupGame = new Chess(rawFen);
  const setup = applyPuzzleMove(setupGame, uciMoves[0]!);
  if (!setup || setupGame.isGameOver()) return null;
  const rest = uciMoves.slice(1);
  if (rest.length === 0 || !canReplayMovesFrom(setupGame.fen(), rest)) return null;
  return sessionFromPlayState(rawFen, setupGame.fen(), rest, setup.san);
}

/**
 * Supabase / bellekteki Lichess kaydını oynanış pozisyonuna çevirir.
 * Import sırasında zaten normalize edilmiş kayıtlara kurulum tekrar uygulanmaz.
 */
function normalizeStoredLichessPuzzle(
  puzzle: Pick<Puzzle, 'hint' | 'source' | 'lichessThemes' | 'lichessId' | 'gamePgn'>,
  rawFen: string,
  rawSolution: string[],
): { playFen: string; solutionMoves: string[]; setupMoveSan?: string } {
  const fen = rawFen.trim() || DEFAULT_FEN;
  const moves = rawSolution.map((m) => String(m).trim()).filter(Boolean);
  if (moves.length === 0) return { playFen: fen, solutionMoves: [] };
  if (moves.length === 1) return { playFen: fen, solutionMoves: moves };

  const directOk =
    isMoveLegalForSideToMove(fen, moves[0]!) &&
    canReplayMovesFrom(fen, moves);

  const setupSession = tryLichessSetupSession(fen, moves);
  const hint = puzzle.hint?.trim();

  // Ham kurulum öncesi kayıt: hint genelde öğrenci hamlesi, solution[0] rakip kurulumu
  if (
    setupSession &&
    setupSession.playFen !== fen &&
    directOk &&
    moves.length > setupSession.solutionMoves.length &&
    hint &&
    hint !== moves[0]!.trim()
  ) {
    return {
      playFen: setupSession.playFen,
      solutionMoves: setupSession.solutionMoves,
      setupMoveSan: setupSession.setupMoveSan,
    };
  }

  if (directOk) {
    return { playFen: fen, solutionMoves: moves };
  }

  if (setupSession && setupSession.solutionMoves.length > 0) {
    return {
      playFen: setupSession.playFen,
      solutionMoves: setupSession.solutionMoves,
      setupMoveSan: setupSession.setupMoveSan,
    };
  }

  return lichessUciLineToPlayState(fen, moves);
}

/**
 * Ham Lichess kaydı: FEN kurulum öncesi, solution[0] rakip kurulumu.
 * Kurulum sonrası import: solution[0] öğrenci hamlesi (hint genelde aynı UCI/SAN).
 */
function shouldApplyLichessSetupFromRaw(
  puzzle: Pick<Puzzle, 'hint' | 'source' | 'lichessThemes' | 'lichessId' | 'gamePgn'>,
  rawFen: string,
  rawSolution: string[],
): boolean {
  if (!isLichessStylePuzzle(puzzle) || rawSolution.length < 2) return false;
  const hint = puzzle.hint?.trim();
  if (hint && hint === rawSolution[0]!.trim()) return false;

  const setup = tryLichessSetupSession(rawFen, rawSolution);
  if (!setup || setup.playFen === rawFen) return false;

  let turnAtRaw: 'w' | 'b';
  try {
    turnAtRaw = new Chess(rawFen).turn();
  } catch {
    return false;
  }

  return turnAtRaw !== setup.studentColor;
}

function sessionFromPlayState(
  rawFen: string,
  playFen: string,
  solutionMoves: string[],
  setupMoveSan?: string,
): CoachStyleSession {
  let studentColor: 'w' | 'b' = 'w';
  try {
    studentColor = new Chess(playFen).turn();
  } catch {
    /* default */
  }
  return { playFen, solutionMoves, studentColor, setupMoveSan, rawFen };
}

function buildSessionCandidates(
  puzzle: Pick<Puzzle, 'fen' | 'solution' | 'hint' | 'source' | 'lichessId' | 'lichessThemes' | 'gamePgn'>,
): CoachStyleSession[] {
  const rawFen = puzzle.fen?.trim() || DEFAULT_FEN;
  const rawSolution = Array.isArray(puzzle.solution)
    ? puzzle.solution.map((m) => String(m).trim()).filter(Boolean)
    : [];
  const out: CoachStyleSession[] = [];
  const hint = puzzle.hint?.trim();

  if (rawSolution.length === 0) return out;

  const push = (playFen: string, solutionMoves: string[], setupMoveSan?: string) => {
    out.push(sessionFromPlayState(rawFen, playFen, solutionMoves, setupMoveSan));
  };

  const lichessSetupFromRaw = shouldApplyLichessSetupFromRaw(puzzle, rawFen, rawSolution);
  const setupFromRaw = lichessSetupFromRaw
    ? tryLichessSetupSession(rawFen, rawSolution)
    : null;

  const directOk =
    isMoveLegalForSideToMove(rawFen, rawSolution[0]!) &&
    canReplayMovesFrom(rawFen, rawSolution) &&
    !lichessSetupFromRaw;

  // 1) Kayıtlı FEN zaten oynanış pozisyonu (kurulum sonrası)
  if (directOk) {
    push(rawFen, rawSolution);
  }

  // 1b) Ham Lichess: kurulum öncesi FEN + tam hat
  if (setupFromRaw) {
    push(setupFromRaw.playFen, setupFromRaw.solutionMoves, setupFromRaw.setupMoveSan);
  }

  // 2) Eski import: hint = kurulum UCI, çözüm kırpılmış
  if (hint && hint !== rawSolution[0]) {
    const repaired = lichessUciLineToPlayState(rawFen, [hint, ...rawSolution]);
    if (repaired.solutionMoves.length > 0) {
      push(repaired.playFen, repaired.solutionMoves, repaired.setupMoveSan);
    }
  }

  // 3) Tam Lichess hattı, FEN kurulum öncesi
  if (rawSolution.length > 1) {
    const fromRaw = lichessUciLineToPlayState(rawFen, rawSolution);
    if (fromRaw.solutionMoves.length > 0) {
      push(fromRaw.playFen, fromRaw.solutionMoves, fromRaw.setupMoveSan);
    }
    const setupSession = tryLichessSetupSession(rawFen, rawSolution);
    if (setupSession) out.push({ ...setupSession, rawFen });
  }

  // 4) Çözümde ilk geçerli hamle
  const atRaw = findStudentStartAtRawFen(rawFen, rawSolution);
  if (atRaw) out.push({ ...atRaw, rawFen });

  // 5) normalizePuzzleForStudentPlay onarımı (Lichess kurulum adayından sonra)
  if (!isLichessStylePuzzle(puzzle) || rawSolution.length <= 1) {
    const norm = repairPuzzleForStudentPlay(puzzle as Puzzle);
    if (norm.studentMoves.length > 0) {
      push(norm.startFen, norm.studentMoves, norm.setupMoveSan);
    }
  }

  return out;
}

function scorePlaySession(
  session: CoachStyleSession,
  rawSolution: string[] = session.solutionMoves,
): number {
  if (session.solutionMoves.length === 0) return 0;
  if (!isMoveLegalForSideToMove(session.playFen, session.solutionMoves[0]!)) return 0;

  let start: Chess;
  try {
    start = new Chess(session.playFen);
  } catch {
    return 0;
  }
  if (start.turn() !== session.studentColor) return 0;
  if (!canReplayMovesFrom(session.playFen, session.solutionMoves)) return 5;

  let score = 100 + session.solutionMoves.length * 3;
  if (session.setupMoveSan && session.playFen !== session.rawFen) score += 20;

  const setupAlt = rawSolution.length > 1 ? tryLichessSetupSession(session.rawFen, rawSolution) : null;
  const isPreSetupFullLine =
    session.playFen === session.rawFen &&
    session.solutionMoves.length === rawSolution.length &&
    rawSolution.length >= 2 &&
    setupAlt != null &&
    setupAlt.playFen !== session.rawFen &&
    setupAlt.solutionMoves.length === rawSolution.length - 1;

  if (
    session.playFen === session.rawFen &&
    session.solutionMoves.length === rawSolution.length &&
    !isPreSetupFullLine
  ) {
    score += 120;
  }
  if (
    session.setupMoveSan &&
    session.playFen !== session.rawFen &&
    session.solutionMoves.length === rawSolution.length - 1
  ) {
    score += 200;
  }
  if (isPreSetupFullLine) {
    score -= 250;
  }
  return score;
}

/**
 * puzzle.fen + solution[] → öğrencinin oynayacağı pozisyon (Lichess ile aynı mantık).
 */
export function initCoachStyleSession(
  puzzle: Pick<Puzzle, 'fen' | 'solution' | 'hint' | 'source' | 'lichessId' | 'lichessThemes' | 'gamePgn' | 'lichessSetupMove'>,
): CoachStyleSession {
  const rawFen = puzzle.fen?.trim() || DEFAULT_FEN;
  const rawSolution = Array.isArray(puzzle.solution)
    ? puzzle.solution.map((m) => String(m).trim()).filter(Boolean)
    : [];

  if (rawSolution.length === 0) {
    return sessionFromPlayState(rawFen, rawFen, []);
  }

  if (isLichessStylePuzzle(puzzle)) {
    const state = lichessPlayStateFromStored(puzzle);
    if (state.solutionMoves.length > 0) {
      return sessionFromPlayState(rawFen, state.playFen, state.solutionMoves, state.setupMoveSan);
    }
  }

  const candidates = buildSessionCandidates(puzzle);
  if (candidates.length > 0) {
    return candidates.reduce((best, cur) =>
      scorePlaySession(cur, rawSolution) > scorePlaySession(best, rawSolution) ? cur : best,
    );
  }

  return sessionFromPlayState(rawFen, rawFen, rawSolution);
}

/** Bulmaca yönetimi (ChessBoard playPuzzle) ile aynı mantık. */
export function prepareCoachStylePuzzlePlay(
  puzzle: Pick<Puzzle, 'fen' | 'solution'>,
): {
  startFen: string;
  solutionMoves: string[];
  studentColor: 'w' | 'b';
  setupMoveSan?: string;
} {
  const session = initCoachStyleSession(puzzle);
  return {
    startFen: session.playFen,
    solutionMoves: session.solutionMoves,
    studentColor: session.studentColor,
    setupMoveSan: session.setupMoveSan,
  };
}

/** Öğrenci çift indeksli hamleleri oynar (0, 2, 4 …) — ChessBoard solution modu. */
export function isStudentSolutionPly(plyIndex: number): boolean {
  return plyIndex % 2 === 0;
}

/** Çözüm hattında bu indekste sıra öğrencide mi? */
export function isStudentMoveAtIndex(
  startFen: string,
  moves: string[],
  moveIndex: number,
  studentColor: 'w' | 'b',
): boolean {
  try {
    return new Chess(fenBeforeSolutionMove(startFen, moves, moveIndex)).turn() === studentColor;
  } catch {
    return isStudentSolutionPly(moveIndex);
  }
}

/** Sıradaki öğrenci hamlesi indeksi (tahtadaki sıra rengine göre). */
export function nextStudentSolutionIndex(
  startFen: string,
  moves: string[],
  fromPly: number,
  studentColor: 'w' | 'b',
): number | null {
  for (let i = fromPly; i < moves.length; i++) {
    if (isStudentMoveAtIndex(startFen, moves, i, studentColor)) return i;
  }
  return null;
}

/** Çözüm hamlesini uygula (UCI / SAN / kare). */
export function applySolutionMoveOnGame(
  game: Chess,
  moveStr: string,
): ReturnType<Chess['move']> {
  const applied = applyPuzzleMove(game, moveStr);
  if (applied) return applied;
  const sq = resolveExpectedMoveSquares(game.fen(), moveStr);
  if (!sq) return null;
  try {
    return game.move({ from: sq.from, to: sq.to, promotion: 'q' });
  } catch {
    return null;
  }
}

/** @deprecated initCoachStyleSession yeterli; geriye uyumluluk için no-op. */
export function finalizeCoachStyleSession(session: CoachStyleSession): CoachStyleSession {
  return session;
}

/** ChessBoard solution doğrulaması: SAN / UCI / from-to. */
export function dropMatchesSolutionMove(
  fen: string,
  from: string,
  to: string,
  expectedMove: string,
): { ok: boolean; san?: string } {
  try {
    const g = new Chess(fen);
    const res = g.move({ from, to, promotion: 'q' });
    if (!res) return { ok: false };

    const exp = expectedMove.trim();
    if (res.san === exp || res.lan === exp) return { ok: true, san: res.san };

    const uciFromTo = `${res.from}${res.to}`.toLowerCase();
    if (looksLikeUciMove(exp) && uciFromTo === exp.toLowerCase().slice(0, 4)) {
      return { ok: true, san: res.san };
    }

    const squares = resolveExpectedMoveSquares(fen, exp);
    if (squares && squares.from === from && squares.to === to) {
      return { ok: true, san: res.san };
    }

    const stripped = exp.replace(/[+#!?=]/g, '').toLowerCase();
    if (stripped.length >= 4 && uciFromTo === stripped.slice(0, 4)) {
      return { ok: true, san: res.san };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

/** Hamle sırasındaki taraf tahtanın altında görünür (bulmaca / ödev). */
export function puzzleBoardOrientationForFen(fen: string): 'white' | 'black' {
  try {
    return new Chess(fen).turn() === 'b' ? 'black' : 'white';
  } catch {
    return 'white';
  }
}

/** Öğrencinin oynadığı renk tahtanın altında görünür. */
export function puzzleBoardOrientationForStudent(studentColor: 'w' | 'b'): 'white' | 'black' {
  return studentColor === 'b' ? 'black' : 'white';
}

function canReplayMovesFrom(fen: string, moves: string[], startIndex = 0): boolean {
  try {
    const g = new Chess(fen);
    for (let i = startIndex; i < moves.length; i++) {
      if (!applyPuzzleMove(g, moves[i]!)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Lichess CSV: FEN kurulum sonrası pozisyon; çözümdeki ilk UCI (e1g1 vb.) zaten oynanmış sayılır.
 * Sıradaki taraf için geçersiz olan baştaki hamleleri at.
 */
function stripStaleLeadingSolutionMoves(fen: string, moves: string[]): string[] {
  let rest = [...moves];
  while (rest.length > 0 && !isMoveLegalForSideToMove(fen, rest[0]!)) {
    rest = rest.slice(1);
  }
  return rest;
}

/** Lichess: FEN kurulum sonrası; çözüm[0] rakip hamlesi. strip boş kalırsa bir sonraki dene. */
function resolveWorkingSolution(fen: string, moves: string[]): string[] {
  const direct = stripStaleLeadingSolutionMoves(fen, moves);
  if (direct.length > 0) return direct;
  if (moves.length > 1) {
    const afterSetup = stripStaleLeadingSolutionMoves(fen, moves.slice(1));
    if (afterSetup.length > 0) return afterSetup;
  }
  return direct;
}

/** Lichess: solution[0] rakip kurulumu, FEN kurulumdan önce. */
function isLichessPreSetupPattern(
  rawFen: string,
  rawSolution: string[],
  puzzle: Pick<Puzzle, 'source' | 'lichessThemes' | 'solution' | 'gamePgn' | 'lichessId'>,
): boolean {
  if (puzzle.source === 'custom') return false;
  if (!isLichessStylePuzzle(puzzle) || rawSolution.length < 2) return false;

  const turnAtStart = new Chess(rawFen).turn();
  const setupGame = new Chess(rawFen);
  const setup = applyPuzzleMove(setupGame, rawSolution[0]!);
  if (!setup || setup.color !== turnAtStart || setupGame.isGameOver()) return false;

  return applyPuzzleMove(new Chess(setupGame.fen()), rawSolution[1]!) != null;
}

/**
 * FEN zaten öğrenci pozisyonu (kurulum sonrası): çözümde sıradaki ilk geçerli hamle.
 * Öğretmen kütüphanesindeki puzzle.fen ile aynı pozisyonu korur.
 */
function tryDirectStudentLine(
  rawFen: string,
  rawSolution: string[],
  puzzle: Pick<Puzzle, 'source' | 'lichessThemes' | 'solution' | 'gamePgn' | 'lichessId'>,
): NormalizedPuzzlePlay | null {
  const turnAtStart = new Chess(rawFen).turn();

  if (isLichessPreSetupPattern(rawFen, rawSolution, puzzle)) {
    return null;
  }

  for (let i = 0; i < rawSolution.length; i++) {
    const probe = resolveExpectedMoveSquares(rawFen, rawSolution[i]!);
    if (!probe) continue;
    const piece = new Chess(rawFen).get(probe.from as `${string}${number}`);
    if (!piece || piece.color !== turnAtStart) continue;
    if (!canReplayMovesFrom(rawFen, rawSolution, i)) continue;

    return {
      startFen: rawFen,
      studentMoves: rawSolution.slice(i),
      studentColor: turnAtStart,
    };
  }

  return null;
}

function tryLichessOpponentSetup(
  rawFen: string,
  rawSolution: string[],
): NormalizedPuzzlePlay | null {
  const setupGame = new Chess(rawFen);
  const setup = applyPuzzleMove(setupGame, rawSolution[0]!);
  if (!setup) return null;

  if (setupGame.isGameOver()) {
    const turnAtStart = new Chess(rawFen).turn();
    if (setup.color === turnAtStart) {
      return {
        startFen: rawFen,
        studentMoves: rawSolution,
        studentColor: turnAtStart,
      };
    }
    return null;
  }

  const studentMoves = rawSolution.slice(1);
  if (studentMoves.length === 0) return null;
  if (!canReplayMovesFrom(setupGame.fen(), studentMoves)) return null;

  return {
    startFen: setupGame.fen(),
    studentMoves,
    studentColor: setupGame.turn(),
    setupMoveSan: setup.san,
  };
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

  if (puzzle.source === 'custom') {
    if (!canReplayMovesFrom(rawFen, rawSolution)) {
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

  const directLine = tryDirectStudentLine(rawFen, rawSolution, puzzle);
  if (directLine) return directLine;

  if (isLichessStylePuzzle(puzzle)) {
    const lichessLine = tryLichessOpponentSetup(rawFen, rawSolution);
    if (lichessLine) return lichessLine;
  }

  if (canReplayMovesFrom(rawFen, rawSolution)) {
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

/** Bozuk kayıtlar için ek onarım denemeleri. */
export function repairPuzzleForStudentPlay(puzzle: Puzzle): NormalizedPuzzlePlay {
  const direct = normalizePuzzleForStudentPlay(puzzle);
  if (!direct.dataError) return direct;

  const rawFen = puzzle.fen?.trim() || DEFAULT_FEN;
  const rawSolution = puzzle.solution?.filter(Boolean) ?? [];
  if (rawSolution.length === 0) return direct;

  const directLine = tryDirectStudentLine(rawFen, rawSolution, puzzle);
  if (directLine) return directLine;

  if (isLichessStylePuzzle(puzzle)) {
    const lichessLine = tryLichessOpponentSetup(rawFen, rawSolution);
    if (lichessLine) return lichessLine;
  }

  return { ...direct, relaxedMode: true };
}

/**
 * Lichess bulmacasını tek oynanış kaydına çevirir (kurulum uygulanmış FEN + öğrenci hattı).
 * Antrenör önizlemesi ve öğrenci modalı aynı pozisyonu gösterir.
 */
export function materializeLichessPuzzleRecord(puzzle: Puzzle): Puzzle {
  if (puzzle.source !== 'lichess' && !isLichessStylePuzzle(puzzle)) return puzzle;
  const state = lichessPlayStateFromStored(puzzle);
  if (state.solutionMoves.length === 0) return puzzle;

  const sameFen = state.playFen === puzzle.fen?.trim();
  const sameLine = state.solutionMoves.join(',') === (puzzle.solution ?? []).join(',');
  const sameSetup = (state.lichessSetupMove ?? '') === (puzzle.lichessSetupMove ?? '');
  if (sameFen && sameLine && sameSetup) return puzzle;

  return {
    ...puzzle,
    fen: state.playFen,
    solution: state.solutionMoves,
    hint: state.solutionMoves[0] || puzzle.hint,
    lichessSetupMove: state.lichessSetupMove ?? puzzle.lichessSetupMove,
  };
}

/** Öğretmen kütüphanesi / ödev önizlemesi — oynanış oturumu ile aynı pozisyon. */
export function puzzlePlayPreviewState(puzzle: Puzzle): {
  fen: string;
  orientation: 'white' | 'black';
} {
  const materialized = materializeLichessPuzzleRecord(puzzle);
  const session = initCoachStyleSession(materialized);
  return {
    fen: session.playFen,
    orientation: puzzleBoardOrientationForStudent(session.studentColor),
  };
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

/** Çözüm hattında moveIndex hamlesinden önceki FEN. */
export function fenBeforeSolutionMove(
  startFen: string,
  moves: string[],
  moveIndex: number,
): string {
  try {
    const g = new Chess(startFen);
    for (let j = 0; j < moveIndex && j < moves.length; j++) {
      if (!applyPuzzleMove(g, moves[j]!)) break;
    }
    return g.fen();
  } catch {
    return startFen;
  }
}

/** UI etiketi: yalnızca bu FEN'de oynanabilir hamleler. */
export function formatMoveLabel(currentFen: string, moveStr: string): string {
  const clean = moveStr?.trim();
  if (!clean) return '—';

  if (!isMoveLegalForSideToMove(currentFen, clean)) {
    return '—';
  }

  const san = expectedMoveSan(currentFen, clean);
  if (san) return san;

  if (looksLikeUciMove(clean)) {
    const from = clean.slice(0, 2).toLowerCase();
    const to = clean.slice(2, 4).toLowerCase();
    const promo = clean[4] ? `=${clean[4].toUpperCase()}` : '';
    return `${from}→${to}${promo}`;
  }

  return clean;
}

/** @deprecated formatMoveLabel kullanın */
export function formatMoveForDisplay(currentFen: string, moveStr: string): string | null {
  const label = formatMoveLabel(currentFen, moveStr);
  return label === '—' ? null : label;
}

/** UCI ipucunu SAN'a çevirir; geçersiz DB ipucu atlanır, çözüm hamlesi öncelikli. */
export function formatPuzzleHintText(
  puzzle: Pick<Puzzle, 'fen' | 'hint'>,
  currentFen?: string,
  fallbackMove?: string,
): string | null {
  const fen = currentFen?.trim() || puzzle.fen?.trim() || DEFAULT_FEN;

  if (fallbackMove?.trim()) {
    const label = formatMoveLabel(fen, fallbackMove);
    if (label !== '—') return label;
  }

  const h = puzzle.hint?.trim();
  if (!h) return null;
  if (!isMoveLegalForSideToMove(fen, h)) return null;
  const hintLabel = formatMoveLabel(fen, h);
  return hintLabel === '—' ? null : hintLabel;
}

/** İpucu / çözüm satırı metni. */
export function formatHintMove(currentFen: string, moveStr: string): string {
  return formatMoveLabel(currentFen, moveStr);
}

/** Ekranda gösterilecek hamle — yalnızca pozisyonda geçerli hamle. */
export function displayPuzzleMoveLabel(
  startFen: string,
  solutionMoves: string[],
  moveIndex: number,
): string {
  const raw = solutionMoves[moveIndex]?.trim();
  if (!raw) return '';
  const fen = fenBeforeSolutionMove(startFen, solutionMoves, moveIndex);
  const label = formatMoveLabel(fen, raw);
  return label === '—' ? '' : label;
}

/** Ödevde sıradaki bulmacayı döndürür. */
export function nextHomeworkPuzzle(
  homework: Pick<HomeworkAssignment, 'puzzles'>,
  currentPuzzleId: string,
  puzzles: Puzzle[],
): Puzzle | null {
  const idx = homework.puzzles.indexOf(currentPuzzleId);
  if (idx < 0 || idx >= homework.puzzles.length - 1) return null;
  const nextId = homework.puzzles[idx + 1];
  return puzzles.find((p) => p.id === nextId) ?? null;
}

/**
 * Lichess çalışma/study PGN: FEN rakip kurulumundan önce veya çözüm UCI formatında.
 * İlk hamle başlangıç sırasının karşı tarafına aitse Lichess bulmaca desenidir.
 */
export function looksLikeLichessStudyPuzzle(chapter: { fen?: string; moves?: string[] }): boolean {
  const rawSolution = chapter.moves?.filter(Boolean) ?? [];
  if (rawSolution.length === 0) return false;
  if (rawSolution.every(looksLikeUciMove)) return true;
  try {
    const rawFen = chapter.fen?.trim() || DEFAULT_FEN;
    const turn = new Chess(rawFen).turn();
    const first = applyPuzzleMove(new Chess(rawFen), rawSolution[0]!);
    if (first && first.color !== turn) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Öğrenci hamlesinden sonra çözümdeki rakip yanıtlarını otomatik uygula. */
export function applyPuzzleAutoReplies(
  fen: string,
  moves: string[],
  startIndex: number,
  studentColor: 'w' | 'b',
): { fen: string; nextIndex: number; playedSans: string[] } {
  const game = new Chess(fen);
  let idx = startIndex;
  const playedSans: string[] = [];
  let guard = 0;
  while (idx < moves.length && game.turn() !== studentColor && guard < 8) {
    const mv = applyPuzzleMove(game, moves[idx]!);
    if (!mv) break;
    playedSans.push(mv.san);
    idx += 1;
    guard += 1;
  }
  return { fen: game.fen(), nextIndex: idx, playedSans };
}

export type NormalizedStudyChapterPuzzle = {
  startFen: string;
  studentMoves: string[];
  studentColor: 'w' | 'b';
  setupMoveSan?: string;
};

function studentColorFromOrientation(orientation?: 'white' | 'black'): 'w' | 'b' | null {
  if (orientation === 'black') return 'b';
  if (orientation === 'white') return 'w';
  return null;
}

/** Lichess gamebook: rakip kurulum hamlelerini atlayıp öğrenci sırasına gel. */
export function stripLeadingOpponentSetup(
  fen: string,
  moves: string[],
  studentColor: 'w' | 'b',
): { startFen: string; remainingMoves: string[]; setupMoveSan?: string } {
  const game = new Chess(fen);
  let idx = 0;
  let setupMoveSan: string | undefined;
  while (idx < moves.length && game.turn() !== studentColor) {
    const mv = applyPuzzleMove(game, moves[idx]!);
    if (!mv) break;
    setupMoveSan = mv.san;
    idx += 1;
  }
  return {
    startFen: game.fen(),
    remainingMoves: moves.slice(idx),
    setupMoveSan,
  };
}

/** Çalışma bölümü — Bulmaca (Hamle Bul) için öğrenci sorusu pozisyonu. */
export function normalizeStudyChapterPuzzle(chapter: {
  fen?: string;
  moves?: string[];
  orientation?: 'white' | 'black';
}): NormalizedStudyChapterPuzzle {
  const rawFen = chapter.fen?.trim() || DEFAULT_FEN;
  const rawSolution = (chapter.moves ?? []).filter(Boolean);
  const fromOrientation = studentColorFromOrientation(chapter.orientation);

  if (fromOrientation && rawSolution.length > 0) {
    const stripped = stripLeadingOpponentSetup(rawFen, rawSolution, fromOrientation);
    return {
      startFen: stripped.startFen,
      studentMoves: stripped.remainingMoves,
      studentColor: fromOrientation,
      setupMoveSan: stripped.setupMoveSan,
    };
  }

  if (rawSolution.length === 0) {
    const turn = new Chess(rawFen).turn();
    return {
      startFen: rawFen,
      studentMoves: [],
      studentColor: fromOrientation ?? turn,
    };
  }

  const lichessStyle = looksLikeLichessStudyPuzzle(chapter);
  const puzzleLike = {
    fen: rawFen,
    solution: rawSolution,
    source: lichessStyle ? ('lichess' as const) : ('custom' as const),
  };
  const normalized = normalizePuzzleForStudentPlay(puzzleLike);
  const repaired = normalized.dataError
    ? repairPuzzleForStudentPlay({
        id: 'study',
        title: '',
        fen: rawFen,
        solution: rawSolution,
        source: puzzleLike.source,
        points: 0,
        difficulty: '',
        theme: '',
      } as Puzzle)
    : normalized;
  return {
    startFen: repaired.startFen,
    studentMoves: repaired.studentMoves,
    studentColor: fromOrientation ?? repaired.studentColor,
    setupMoveSan: repaired.setupMoveSan,
  };
}
