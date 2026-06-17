import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION } from '../lib/chessBoardUi';
import { ChessBoardFrame } from './chess/ChessBoardFrame';
import { isBoardFlipShortcutKey, keyboardTargetAllowsBoardShortcut } from '../lib/boardFlipShortcut';
import { Chess } from 'chess.js';
import { X, CheckCircle2, XCircle, Lightbulb, ListChecks } from 'lucide-react';
import type { Puzzle } from '../types';

export interface HomeworkAttemptRecord {
  studentId: string;
  homeworkId: string;
  puzzleId: string;
  puzzleTitle: string;
  correct: boolean;
  movesPlayed: string[];
  solutionMoves: string[];
  /** Tahtanın son pozisyonu (FEN); admin detayda gösterilir */
  finalFen?: string;
  thinkSeconds?: number;
  hintUsed?: boolean;
}

interface StudentPuzzlePlayModalProps {
  puzzle: Puzzle;
  onClose: () => void;
  /** Ödevden açıldıysa denemeyi kaydetmek için */
  homeworkId?: string;
  studentId?: string;
  onAttemptRecord?: (record: HomeworkAttemptRecord) => void;
}

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function getTurnFromFen(fen: string): 'w' | 'b' {
  try {
    return new Chess(fen).turn();
  } catch {
    return 'w';
  }
}

/** Hamle string'ini chess.js ile uygular: SAN ("e4") veya uzun notasyon ("e7f7", "e2e4q") destekler */
function applyMove(game: Chess, moveStr: string): ReturnType<Chess['move']> {
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

/** Mevcut pozisyonda beklenen (çözümdeki sıradaki) hamleyi SAN olarak döndürür. */
function getExpectedMoveSan(currentFen: string, solutionMoveStr: string): string | null {
  try {
    const c = new Chess(currentFen);
    const move = applyMove(c, solutionMoveStr);
    return move ? move.san : null;
  } catch {
    return null;
  }
}

/** Öğrenci panelinde tek bulmaca oynatma: çözüm hamlelerine göre doğrulama, doğru/yanlış/solved durumu */
const StudentPuzzlePlayModal: React.FC<StudentPuzzlePlayModalProps> = ({ puzzle, onClose, homeworkId, studentId, onAttemptRecord }) => {
  const fen = puzzle.fen?.trim() || DEFAULT_FEN;
  const solution = Array.isArray(puzzle.solution) ? puzzle.solution : [];
  const movesPlayedRef = useRef<string[]>([]);
  const reportedRef = useRef(false);
  const puzzleStartRef = useRef<number>(Date.now());
  const hintUsedRef = useRef(false);
  const [movesPlayed, setMovesPlayed] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [game, setGame] = useState(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess(DEFAULT_FEN);
    }
  });
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [status, setStatus] = useState<'playing' | 'wrong' | 'solved'>('playing');
  const [hintRevealed, setHintRevealed] = useState(false);
  const [solutionRevealed, setSolutionRevealed] = useState(false);
  const [puzzleModalBoardOrientation, setPuzzleModalBoardOrientation] = useState<'white' | 'black'>('white');
  const studentColorRef = useRef<'w' | 'b'>(getTurnFromFen(fen));

  // Öğrencinin hamlesinden sonra çözümdeki rakip hamle(ler)i otomatik uygula.
  const applyAutoReplies = useCallback((base: Chess, startIndex: number) => {
    const next = new Chess(base.fen());
    let idx = startIndex;
    let guard = 0;
    while (idx < solution.length && next.turn() !== studentColorRef.current && guard < 8) {
      const mv = applyMove(next, solution[idx]);
      if (!mv) break;
      idx += 1;
      guard += 1;
    }
    return { game: next, nextIndex: idx };
  }, [solution]);

  useEffect(() => {
    if (!showSuccessToast) return;
    const t = setTimeout(() => setShowSuccessToast(false), 3000);
    return () => clearTimeout(t);
  }, [showSuccessToast]);

  // Modal farklı ödev/bulmaca ile açıldığında her şeyi ilk konuma sıfırla.
  useEffect(() => {
    const startFen = puzzle.fen?.trim() || DEFAULT_FEN;
    studentColorRef.current = getTurnFromFen(startFen);
    movesPlayedRef.current = [];
    reportedRef.current = false;
    puzzleStartRef.current = Date.now();
    hintUsedRef.current = false;
    setMovesPlayed([]);
    setSubmitted(false);
    setShowSuccessToast(false);
    setSolutionIndex(0);
    setStatus('playing');
    setHintRevealed(false);
    setSolutionRevealed(false);
    setPuzzleModalBoardOrientation('white');
    try {
      setGame(new Chess(startFen));
    } catch {
      setGame(new Chess(DEFAULT_FEN));
    }
  }, [puzzle.id, puzzle.fen]);

  const reportAttempt = useCallback(
    (correct: boolean, finalFen?: string) => {
      if (reportedRef.current || !homeworkId || !studentId || !onAttemptRecord) return;
      reportedRef.current = true;
      onAttemptRecord({
        studentId,
        homeworkId,
        puzzleId: puzzle.id,
        puzzleTitle: puzzle.title,
        correct,
        movesPlayed: [...movesPlayedRef.current],
        solutionMoves: [...solution],
        finalFen: finalFen || undefined,
        thinkSeconds: Math.max(1, Math.round((Date.now() - puzzleStartRef.current) / 1000)),
        hintUsed: hintUsedRef.current,
      });
      setSubmitted(true);
    },
    [homeworkId, studentId, onAttemptRecord, puzzle.id, puzzle.title, solution]
  );

  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string) => {
      if (status === 'solved') return false;
      if (status === 'wrong') setStatus('playing'); // Yanlıştan sonra tekrar doğru hamleyi deneyebilir
      setHintRevealed(false);
      setSolutionRevealed(false);
      const copy = new Chess(game.fen());
      if (solutionIndex >= solution.length) {
        const anyMove = copy.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
        if (anyMove) {
          setGame(copy);
          if (solution.length === 0) {
            setStatus('solved');
            reportAttempt(true, copy.fen());
          }
          return true;
        }
        setStatus('wrong');
        reportAttempt(false, game.fen());
        return false;
      }
      const expected = applyMove(copy, solution[solutionIndex]);
      if (!expected) {
        const anyMove = copy.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
        if (anyMove) {
          setGame(copy);
          return true;
        }
        setStatus('wrong');
        reportAttempt(false, game.fen());
        return false;
      }
      if (sourceSquare !== expected.from || targetSquare !== expected.to) {
        const wrongCopy = new Chess(game.fen());
        const wrongMove = wrongCopy.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
        if (wrongMove) {
          movesPlayedRef.current = [...movesPlayedRef.current, wrongMove.san];
          setMovesPlayed([...movesPlayedRef.current]);
        }
        setStatus('wrong');
        reportAttempt(false, wrongCopy.fen());
        return false;
      }
      movesPlayedRef.current = [...movesPlayedRef.current, expected.san];
      setMovesPlayed([...movesPlayedRef.current]);
      let finalFen = copy.fen();
      let nextIndex = solutionIndex + 1;
      const auto = applyAutoReplies(copy, nextIndex);
      nextIndex = auto.nextIndex;
      finalFen = auto.game.fen();
      setGame(auto.game);
      setSolutionIndex(nextIndex);
      if (nextIndex >= solution.length) {
        setStatus('solved');
        reportAttempt(true, finalFen);
      }
      return true;
    },
    [game, solution, solutionIndex, status, reportAttempt, applyAutoReplies]
  );

  const handleDrop = useCallback(
    (args: { sourceSquare: string; targetSquare: string }) => {
      try {
        return onPieceDrop(args.sourceSquare, args.targetSquare);
      } catch {
        setStatus('wrong');
        return false;
      }
    },
    [onPieceDrop]
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
  const history = game.history();
  if (history.length > 0) {
    const last = game.history({ verbose: true }).slice(-1)[0];
    if (last) {
      lastMoveSquares[last.from] = { background: 'rgba(255, 255, 50, 0.35)' };
      lastMoveSquares[last.to] = { background: 'rgba(255, 255, 50, 0.35)' };
    }
  }

  const boardOptions = {
    position: game.fen(),
    boardOrientation: puzzleModalBoardOrientation,
    squareStyles: lastMoveSquares,
    darkSquareStyle: { backgroundColor: '#779952' },
    lightSquareStyle: { backgroundColor: '#edeed1' },
    ...CHESSBOARD_ANIMATION,
    onPieceDrop: handleDrop,
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
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
            <h3 className="text-lg font-black text-white truncate max-w-[240px]">{puzzle.title}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{puzzle.points} puan · {puzzle.difficulty}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">Tahta öğretmenin belirlediği pozisyonda. Sadece doğru hamleleri yapın; farklı hamle hata verir.</p>
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
                    <p className="text-xs text-rose-400/80 mt-2">Deneme kaydedildi; antrenör Ödev Takibinde görecektir.</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => { hintUsedRef.current = true; setHintRevealed(true); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-sm hover:bg-amber-500/30 transition-colors"
                >
                  <Lightbulb className="w-4 h-4" /> İpucu
                </button>
                <button
                  type="button"
                  onClick={() => setSolutionRevealed(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-600/80 border border-slate-500/50 text-slate-200 font-bold text-sm hover:bg-slate-500/50 transition-colors"
                >
                  <ListChecks className="w-4 h-4" /> Çözümü Göster
                </button>
              </div>
              {hintRevealed && solutionIndex < solution.length && (
                <p className="mt-3 pt-3 border-t border-rose-500/20 text-sm">
                  <span className="text-slate-400">Beklenen hamle: </span>
                  <span className="font-mono font-bold text-amber-300">
                    {getExpectedMoveSan(game.fen(), solution[solutionIndex]) ?? solution[solutionIndex]}
                  </span>
                </p>
              )}
              {solutionRevealed && solution.length > solutionIndex && (
                <div className="mt-3 pt-3 border-t border-rose-500/20">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Çözüm (kalan hamleler)</p>
                  <p className="text-sm font-mono text-slate-300 break-all">
                    {solution.slice(solutionIndex).map((m, i) => (
                      <span key={i}>
                        {i > 0 && ' → '}
                        <span className="text-amber-300">{getExpectedMoveSan(
                          (() => {
                            const c = new Chess(game.fen());
                            for (let j = 0; j < i; j++) applyMove(c, solution[solutionIndex + j]);
                            return c.fen();
                          })(),
                          m
                        ) ?? m}</span>
                      </span>
                    ))}
                  </p>
                </div>
              )}
            </div>
          )}
          {status === 'solved' && (
            <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <div>
                <p className="font-bold">Tebrikler!</p>
                <p className="text-sm opacity-90">+{puzzle.points} puan</p>
                {homeworkId && studentId && (
                  <p className="text-xs text-emerald-400/80 mt-2">Deneme kaydedildi; antrenör Ödev Takibinde görecektir.</p>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-700 flex justify-end gap-2">
          {homeworkId && studentId && onAttemptRecord && (
            <button
              type="button"
              disabled={submitted}
              onClick={() => {
                if (submitted) return;
                reportAttempt(status === 'solved', game.fen());
                setShowSuccessToast(true);
              }}
              className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${submitted ? 'bg-slate-700 text-slate-500 cursor-default' : 'bg-teal-600 hover:bg-teal-500 text-white'}`}
            >
              {submitted ? 'Gönderildi' : 'Kaydet ve Gönder'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
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
