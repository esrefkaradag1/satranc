import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION } from '../lib/chessBoardUi';
import { ChessBoardFrame } from './chess/ChessBoardFrame';
import { isBoardFlipShortcutKey, keyboardTargetAllowsBoardShortcut } from '../lib/boardFlipShortcut';
import { Chess } from 'chess.js';
import { X, CheckCircle2, XCircle, Lightbulb, ListChecks, ChevronRight, RotateCcw } from 'lucide-react';
import type { Puzzle } from '../types';
import { fetchPuzzleById } from '../services/lichessService';
import {
  applyPuzzleMove,
  applySolutionMoveOnGame,
  displayPuzzleMoveLabel,
  dropMatchesSolutionMove,
  formatMoveLabel,
  initCoachStyleSession,
  isStudentMoveAtIndex,
  isMoveLegalForSideToMove,
  nextStudentSolutionIndex,
  fenBeforeSolutionMove,
  puzzleBoardOrientationForStudent,
} from '../lib/puzzlePlayUtils';

export interface HomeworkAttemptRecord {
  studentId: string;
  homeworkId: string;
  puzzleId: string;
  puzzleTitle: string;
  correct: boolean;
  movesPlayed: string[];
  solutionMoves: string[];
  finalFen?: string;
  thinkSeconds?: number;
  hintUsed?: boolean;
}

interface StudentPuzzlePlayModalProps {
  puzzle: Puzzle;
  onClose: () => void;
  homeworkId?: string;
  studentId?: string;
  onAttemptRecord?: (record: HomeworkAttemptRecord) => void;
  nextPuzzle?: Puzzle | null;
  onPlayNext?: (puzzle: Puzzle) => void;
}

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function makeGameFromFen(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch {
    return new Chess(DEFAULT_FEN);
  }
}

/** Bulmaca yönetimi solution modu: history.length ile çözüm indeksi, çift ply öğrenci. */
const StudentPuzzlePlayModal: React.FC<StudentPuzzlePlayModalProps> = ({
  puzzle, onClose, homeworkId, studentId, onAttemptRecord, nextPuzzle, onPlayNext,
}) => {
  const puzzleResetKey = useMemo(
    () => `${puzzle.id}|${puzzle.fen ?? ''}|${(puzzle.solution ?? []).join(',')}`,
    [puzzle.id, puzzle.fen, puzzle.solution],
  );
  const [playPuzzle, setPlayPuzzle] = useState(puzzle);
  const [lichessRepairing, setLichessRepairing] = useState(false);

  useEffect(() => {
    setPlayPuzzle(puzzle);
  }, [puzzleResetKey, puzzle]);

  const session = useMemo(
    () => initCoachStyleSession(playPuzzle),
    [playPuzzle],
  );
  const { playFen, solutionMoves, studentColor, setupMoveSan } = session;
  const fullSolution = Array.isArray(playPuzzle.solution) ? playPuzzle.solution.filter(Boolean) : [];

  const lichessRepairAttemptedRef = useRef(false);

  useEffect(() => {
    lichessRepairAttemptedRef.current = false;
  }, [puzzleResetKey]);

  // Bozuk kayıt: çözüm tahtayla uyuşmuyorsa Lichess API'den taze veri çek
  useEffect(() => {
    if (lichessRepairAttemptedRef.current) return;
    const lichessId = playPuzzle.lichessId?.trim() || playPuzzle.id?.trim();
    if (!lichessId || playPuzzle.source === 'custom') return;

    const firstIdx = nextStudentSolutionIndex(playFen, solutionMoves, 0, studentColor);
    const firstOk = firstIdx != null && isMoveLegalForSideToMove(
      fenBeforeSolutionMove(playFen, solutionMoves, firstIdx),
      solutionMoves[firstIdx]!,
    );
    if (solutionMoves.length > 0 && firstOk) return;

    lichessRepairAttemptedRef.current = true;
    let cancelled = false;
    setLichessRepairing(true);
    fetchPuzzleById(lichessId)
      .then((fresh) => {
        if (cancelled || !fresh) return;
        setPlayPuzzle((prev) => ({
          ...prev,
          fen: fresh.fen,
          solution: fresh.solution,
          hint: fresh.hint,
          lichessSetupMove: fresh.lichessSetupMove ?? prev.lichessSetupMove,
          lichessId: fresh.lichessId ?? prev.lichessId,
          source: 'lichess',
        }));
      })
      .finally(() => {
        if (!cancelled) setLichessRepairing(false);
      });
    return () => { cancelled = true; };
  }, [playPuzzle.id, playPuzzle.lichessId, playPuzzle.source, playFen, solutionMoves, studentColor]);

  const movesPlayedRef = useRef<string[]>([]);
  const reportedRef = useRef(false);
  const puzzleStartRef = useRef<number>(Date.now());
  const sessionHintUsedRef = useRef(false);
  const playFenRef = useRef(playFen);
  /** Çözüm hattındaki ply — FEN'den kurulan game'de history boş kalır, indeks ayrı tutulur. */
  const [solutionPly, setSolutionPly] = useState(0);

  const [movesPlayed, setMovesPlayed] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [game, setGame] = useState(() => makeGameFromFen(playFen));
  const [status, setStatus] = useState<'playing' | 'wrong' | 'solved'>('playing');
  const [hintRevealed, setHintRevealed] = useState(false);
  const [solutionRevealed, setSolutionRevealed] = useState(false);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [autoPlayError, setAutoPlayError] = useState<string | null>(null);
  const [puzzleModalBoardOrientation, setPuzzleModalBoardOrientation] = useState<'white' | 'black'>(() =>
    puzzleBoardOrientationForStudent(studentColor),
  );

  const markHintUsed = useCallback(() => {
    sessionHintUsedRef.current = true;
  }, []);

  const resetPlay = useCallback((opts?: { keepHint?: boolean }) => {
    playFenRef.current = playFen;
    movesPlayedRef.current = [];
    const keepHint = opts?.keepHint ?? sessionHintUsedRef.current;
    if (!keepHint) {
      reportedRef.current = false;
      sessionHintUsedRef.current = false;
      setHintRevealed(false);
      setSolutionRevealed(false);
    } else {
      sessionHintUsedRef.current = true;
    }
    puzzleStartRef.current = Date.now();
    setMovesPlayed([]);
    setSubmitted(false);
    setAutoPlaying(false);
    setStatus('playing');
    setAutoPlayError(null);
    setPuzzleModalBoardOrientation(puzzleBoardOrientationForStudent(studentColor));
    setSolutionPly(0);
    setGame(makeGameFromFen(playFen));
  }, [playFen, studentColor]);

  // Yeni bulmaca → oturumu sıfırla
  useEffect(() => {
    sessionHintUsedRef.current = false;
    reportedRef.current = false;
    resetPlay();
  }, [playPuzzle.id]); // eslint-disable-line react-hooks/exhaustive-deps -- playFen değişiminde ipucu korunur

  // Lichess onarımı / FEN güncellemesi → tahtayı sıfırla, ipucu kullanımını koru
  useEffect(() => {
    resetPlay({ keepHint: sessionHintUsedRef.current });
  }, [playFen, studentColor, resetPlay]);

  const currentPly = solutionPly;

  const reportAttempt = useCallback(
    (correct: boolean, finalFen?: string) => {
      if (reportedRef.current || !homeworkId || !studentId || !onAttemptRecord) return;
      reportedRef.current = true;
      onAttemptRecord({
        studentId,
        homeworkId,
        puzzleId: playPuzzle.id,
        puzzleTitle: playPuzzle.title,
        correct,
        movesPlayed: [...movesPlayedRef.current],
        solutionMoves: [...fullSolution],
        finalFen: finalFen || undefined,
        thinkSeconds: Math.max(1, Math.round((Date.now() - puzzleStartRef.current) / 1000)),
        hintUsed: sessionHintUsedRef.current,
      });
      setSubmitted(true);
    },
    [homeworkId, studentId, onAttemptRecord, playPuzzle.id, playPuzzle.title, fullSolution]
  );

  /** Yanlış cevaptan sonra ipucu tıklanabilsin diye denemeyi kapatınca / tekrar dene / sonraki soruda kaydet. */
  const flushAttemptIfNeeded = useCallback(
    (correct: boolean, finalFen?: string) => {
      if (reportedRef.current || !homeworkId || !studentId || !onAttemptRecord) return;
      const hasActivity =
        movesPlayedRef.current.length > 0
        || status === 'wrong'
        || sessionHintUsedRef.current;
      if (!correct && !hasActivity) return;
      reportAttempt(correct, finalFen);
    },
    [homeworkId, studentId, onAttemptRecord, reportAttempt, status],
  );

  const revealHint = useCallback(() => {
    markHintUsed();
    setHintRevealed(true);
  }, [markHintUsed]);

  const revealSolution = useCallback(() => {
    markHintUsed();
    setSolutionRevealed(true);
  }, [markHintUsed]);

  // Rakip hamlesi: tahtada sıra öğrencide değilken çözümdeki hamleyi otomatik oyna.
  useEffect(() => {
    if (status !== 'playing' || solutionMoves.length === 0) return;
    const ply = solutionPly;
    if (ply >= solutionMoves.length) {
      if (!game.isGameOver() && ply > 0) {
        setStatus('solved');
        reportAttempt(true, game.fen());
      }
      return;
    }
    if (game.turn() === studentColor) {
      setAutoPlaying(false);
      return;
    }
    setAutoPlaying(true);
    setAutoPlayError(null);
    const timer = setTimeout(() => {
      const g = makeGameFromFen(game.fen());
      const mv = applySolutionMoveOnGame(g, solutionMoves[ply]!);
      if (!mv) {
        setAutoPlaying(false);
        setAutoPlayError('Rakip hamlesi uygulanamadı. Bulmaca verisi hatalı olabilir; sayfayı yenileyin veya antrenöre bildirin.');
        return;
      }
      const nextPly = ply + 1;
      setSolutionPly(nextPly);
      setGame(makeGameFromFen(g.fen()));
      setAutoPlaying(false);
      if (nextPly >= solutionMoves.length || g.isGameOver()) {
        setStatus('solved');
        reportAttempt(true, g.fen());
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [game, solutionPly, solutionMoves, status, reportAttempt, studentColor]);

  useEffect(() => {
    if (!showSuccessToast) return;
    const t = setTimeout(() => setShowSuccessToast(false), 3000);
    return () => clearTimeout(t);
  }, [showSuccessToast]);

  const handleClose = useCallback(() => {
    flushAttemptIfNeeded(status === 'solved', game.fen());
    onClose();
  }, [status, game, flushAttemptIfNeeded, onClose]);

  const tryAgain = useCallback(() => {
    reportedRef.current = false;
    resetPlay({ keepHint: true });
  }, [resetPlay]);

  const handlePlayNext = useCallback(() => {
    if (!nextPuzzle || !onPlayNext) return;
    flushAttemptIfNeeded(status === 'solved', game.fen());
    onPlayNext(nextPuzzle);
  }, [nextPuzzle, onPlayNext, status, game, flushAttemptIfNeeded]);

  const canDragStudentPiece = useCallback(
    ({ piece }: { piece?: { pieceType?: string } | string }) => {
      if (status === 'solved' || autoPlaying) return false;
      if (game.turn() !== studentColor) return false;
      if (solutionPly >= solutionMoves.length) return false;
      const pieceType = typeof piece === 'string' ? piece : piece?.pieceType ?? '';
      const colorChar = typeof pieceType === 'string' ? pieceType.charAt(0) : '';
      if (colorChar !== 'w' && colorChar !== 'b') return false;
      return colorChar === game.turn() && colorChar === studentColor;
    },
    [game, status, autoPlaying, studentColor, solutionPly, solutionMoves],
  );

  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string) => {
      if (status === 'solved' || autoPlaying) return false;
      if (game.isGameOver()) return false;
      if (status === 'wrong') setStatus('playing');
      setHintRevealed(false);
      setSolutionRevealed(false);

      const ply = solutionPly;
      if (game.turn() !== studentColor) return false;

      const copy = makeGameFromFen(game.fen());
      const piece = copy.get(sourceSquare as `${string}${number}`);
      if (!piece || piece.color !== copy.turn() || piece.color !== studentColor) return false;

      if (ply >= solutionMoves.length) {
        setStatus('wrong');
        reportAttempt(false, game.fen());
        return false;
      }

      const expectedMove = solutionMoves[ply] ?? '';
      const match = dropMatchesSolutionMove(game.fen(), sourceSquare, targetSquare, expectedMove);

      if (!match.ok) {
        const wrongCopy = makeGameFromFen(game.fen());
        const wrongMove = wrongCopy.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
        if (wrongMove) {
          movesPlayedRef.current = [...movesPlayedRef.current, wrongMove.san];
          setMovesPlayed([...movesPlayedRef.current]);
        }
        setStatus('wrong');
        reportAttempt(false, game.fen());
        return false;
      }

      const played = applyPuzzleMove(copy, expectedMove)
        ?? copy.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      if (!played) {
        setStatus('wrong');
        reportAttempt(false, game.fen());
        return false;
      }

      movesPlayedRef.current = [...movesPlayedRef.current, played.san];
      setMovesPlayed([...movesPlayedRef.current]);
      setSolutionPly(ply + 1);
      setGame(makeGameFromFen(copy.fen()));
      return true;
    },
    [game, solutionMoves, solutionPly, status, autoPlaying, studentColor, reportAttempt]
  );

  const handleDrop = useCallback(
    (args: { sourceSquare: string; targetSquare: string }) => {
      try {
        return onPieceDrop(args.sourceSquare, args.targetSquare);
      } catch {
        setStatus('wrong');
        reportAttempt(false, game.fen());
        return false;
      }
    },
    [onPieceDrop, reportAttempt]
  );

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (!isBoardFlipShortcutKey(e) || !keyboardTargetAllowsBoardShortcut(e)) return;
      e.preventDefault();
      setPuzzleModalBoardOrientation((o) => (o === 'white' ? 'black' : 'white'));
    };
    window.addEventListener('keydown', onDown);
    return () => window.removeEventListener('keydown', onDown);
  }, []);

  const lastMoveSquares: Record<string, React.CSSProperties> = {};
  // FEN tabanlı tahta history tutmaz; son hamle vurgusu movesPlayed üzerinden yapılmaz

  const sideToMove = game.turn();
  const turnLabel = sideToMove === 'w' ? 'Beyaz' : 'Siyah';
  const studentLabel = studentColor === 'w' ? 'Beyaz' : 'Siyah';
  const isStudentTurn = status === 'playing'
    && sideToMove === studentColor
    && !autoPlaying;

  const studentMoveIndex = nextStudentSolutionIndex(
    playFenRef.current,
    solutionMoves,
    currentPly,
    studentColor,
  );
  const expectedStudentMove = studentMoveIndex != null ? solutionMoves[studentMoveIndex] : undefined;
  const expectedMoveFen = studentMoveIndex != null
    ? fenBeforeSolutionMove(playFenRef.current, solutionMoves, studentMoveIndex)
    : game.fen();

  const hintText = expectedStudentMove
    ? formatMoveLabel(expectedMoveFen, expectedStudentMove)
    : null;
  const showHintText = hintRevealed && hintText && hintText !== '—';
  const remainingStudentMoves = useMemo(() => {
    const out: string[] = [];
    for (let i = currentPly; i < solutionMoves.length; i++) {
      if (!isStudentMoveAtIndex(playFenRef.current, solutionMoves, i, studentColor)) continue;
      out.push(displayPuzzleMoveLabel(playFenRef.current, solutionMoves, i));
    }
    return out;
  }, [currentPly, solutionMoves, game.fen(), studentColor]);

  const hintDisplayLabel = useMemo(() => {
    if (studentMoveIndex != null) {
      const label = displayPuzzleMoveLabel(playFenRef.current, solutionMoves, studentMoveIndex);
      if (label) return label;
    }
    return '';
  }, [currentPly, solutionMoves, game.fen(), studentColor, studentMoveIndex]);

  const boardOptions = {
    position: game.fen(),
    boardOrientation: puzzleModalBoardOrientation,
    squareStyles: lastMoveSquares,
    darkSquareStyle: { backgroundColor: '#779952' },
    lightSquareStyle: { backgroundColor: '#edeed1' },
    ...CHESSBOARD_ANIMATION,
    allowDragging: isStudentTurn,
    canDragPiece: canDragStudentPiece,
    onPieceDrop: handleDrop,
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={handleClose}>
      {showSuccessToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[101] flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm shadow-lg border border-emerald-500/50 animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          Başarıyla gönderildi! Antrenör Ödev Takibinde görecektir.
        </div>
      )}
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-white truncate max-w-[240px]">{playPuzzle.title}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{playPuzzle.points} puan · {playPuzzle.difficulty}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          {lichessRepairing ? (
            <p className="text-xs text-sky-300/90 text-center mb-2 px-2">Bulmaca Lichess&apos;ten yükleniyor…</p>
          ) : solutionMoves.length === 0 ? (
            <p className="text-xs text-rose-300/90 text-center mb-2 px-2">
              Bu bulmacanın çözüm kaydı tahtayla uyuşmuyor. Antrenörden bulmacayı Lichess&apos;ten yeniden çekmesini isteyin veya sonraki soruya geçin.
            </p>
          ) : (
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">
              Tahta öğretmenin belirlediği pozisyonda. Sadece doğru hamleleri yapın; farklı hamle hata verir.
            </p>
          )}
          {setupMoveSan ? (
            <p className="text-xs text-sky-300/90 text-center mb-2">
              Rakip kurulum hamlesi uygulandı: <span className="font-mono font-bold">{setupMoveSan}</span>
            </p>
          ) : null}
          {autoPlaying ? (
            <p className="text-xs text-slate-400 text-center mb-2">Rakip hamle oynanıyor…</p>
          ) : null}
          {autoPlayError ? (
            <p className="text-xs text-rose-300/90 text-center mb-2 px-2">{autoPlayError}</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
            <span
              className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                isStudentTurn
                  ? 'text-indigo-200 border-indigo-500/40 bg-indigo-500/15'
                  : 'text-slate-400 border-white/10 bg-slate-800/60'
              }`}
            >
              Sırada: {turnLabel}
              {isStudentTurn ? ' · Sizin hamleniz' : status === 'playing' ? ' · Rakip' : ''}
            </span>
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Siz: {studentLabel}
            </span>
          </div>
          {status === 'playing' && isStudentTurn && !hintRevealed ? (
            <div className="flex justify-center mb-2">
              <button
                type="button"
                onClick={revealHint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/25 transition-colors"
              >
                <Lightbulb className="w-3.5 h-3.5" /> İpucu
              </button>
            </div>
          ) : null}
          {showHintText ? (
            <p className="text-xs text-amber-200/90 text-center mb-2 px-2 flex items-center justify-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 shrink-0" />
              <span>Beklenen hamle: {hintText}</span>
            </p>
          ) : null}
          <ChessBoardFrame boardOrientation={puzzleModalBoardOrientation} className="max-w-full mx-auto">
            <Chessboard options={{ ...boardOptions, ...CHESSBOARD_NO_NOTATION }} />
          </ChessBoardFrame>
          {movesPlayed.length > 0 && (
            <div className="mt-4 p-3 rounded-xl bg-slate-800/80 border border-slate-700/50">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Yaptığınız hamleler</p>
              <p className="text-sm text-slate-300 font-mono">
                {movesPlayed.map((m, i) => (
                  <span key={i}>
                    {i % 2 === 0 && <span className="text-slate-500 mr-1">{Math.floor(i / 2) + 1}.</span>}
                    {m}{i < movesPlayed.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </p>
            </div>
          )}
          {status === 'wrong' && (
            <div className="mt-4 p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
              <div className="flex items-start gap-3">
                <XCircle className="w-8 h-8 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-black text-lg">Olmadı!</p>
                  <p className="text-sm opacity-90 mt-1">Başka bir şey dene.</p>
                  {homeworkId && studentId && (
                    <p className="text-xs text-rose-400/80 mt-2">
                      {submitted
                        ? 'Deneme kaydedildi; antrenör Ödev Takibinde görecektir.'
                        : 'Kapatınca deneme kaydedilir (ipucu dahil).'}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  type="button"
                  onClick={tryAgain}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 font-bold text-sm hover:bg-indigo-600/50 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Tekrar dene
                </button>
                <button
                  type="button"
                  onClick={revealHint}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-sm hover:bg-amber-500/30 transition-colors"
                >
                  <Lightbulb className="w-4 h-4" /> İpucu
                </button>
                <button
                  type="button"
                  onClick={revealSolution}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-600/80 border border-slate-500/50 text-slate-200 font-bold text-sm hover:bg-slate-500/50 transition-colors"
                >
                  <ListChecks className="w-4 h-4" /> Çözümü Göster
                </button>
              </div>
              {hintRevealed && (
                <p className="mt-3 pt-3 border-t border-rose-500/20 text-sm">
                  {hintDisplayLabel ? (
                    <>
                      <span className="text-slate-400">Beklenen hamle: </span>
                      <span className="font-mono font-bold text-amber-300">{hintDisplayLabel}</span>
                    </>
                  ) : (
                    <span className="text-slate-500">Bu pozisyonda geçerli ipucu yok. Antrenörden bulmacayı Lichess&apos;ten yeniden çekmesini isteyin.</span>
                  )}
                </p>
              )}
              {solutionRevealed && (
                <div className="mt-3 pt-3 border-t border-rose-500/20">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Çözüm (kalan hamleleriniz)</p>
                  {remainingStudentMoves.length > 0 ? (
                    <p className="text-sm font-mono text-slate-300 break-all">
                      {remainingStudentMoves.map((label, i) => (
                        <span key={i}>
                          {i > 0 && ' → '}
                          <span className="text-amber-300">{label}</span>
                        </span>
                      ))}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500">Bu bulmaca için kayıtlı çözüm hamlesi yok.</p>
                  )}
                </div>
              )}
            </div>
          )}
          {status === 'solved' && (
            <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <div className="flex-1">
                <p className="font-bold">Tebrikler!</p>
                <p className="text-sm opacity-90">+{playPuzzle.points} puan</p>
                {homeworkId && studentId && (
                  <p className="text-xs text-emerald-400/80 mt-2">Deneme kaydedildi; antrenör Ödev Takibinde görecektir.</p>
                )}
              </div>
              {nextPuzzle && onPlayNext ? (
                <button
                  type="button"
                  onClick={handlePlayNext}
                  className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm"
                >
                  Sonraki soru
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-700 flex flex-wrap justify-end gap-2">
          {nextPuzzle && onPlayNext && (status === 'wrong' || submitted) ? (
            <button
              type="button"
              onClick={handlePlayNext}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all"
            >
              Sonraki soru
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleClose}
            className="px-5 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm transition-all"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentPuzzlePlayModal;
