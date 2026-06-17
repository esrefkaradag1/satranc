import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, Loader2 } from 'lucide-react';
import { useChessWheelNavigation } from '../hooks/useChessWheelNavigation';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION } from '../lib/chessBoardUi';
import { ChessBoardFrame } from './chess/ChessBoardFrame';
import { MainlineMoveGrid } from './chess/MainlineMoveGrid';
import {
  chessComPuzzleAnalysisUrl,
  fetchChessComPuzzleDetail,
  type ChessComPuzzleAttempt,
} from '../services/chessPlatformService';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function sanitizePuzzlePgn(raw: string): string {
  return raw
    .replace(/\{\[%clk[^\]]*\]\}/gi, '')
    .replace(/\{\[%eval[^\]]*\]\}/gi, '')
    .replace(/\{\[%emt[^\]]*\]\}/gi, '')
    .trim();
}

function parseSetupFen(pgn: string): string | null {
  const m = pgn.match(/\[FEN\s+"([^"]+)"\]/i);
  return m?.[1]?.trim() ?? null;
}

function buildMoveList(pgn: string): string[] {
  try {
    const g = new Chess();
    g.loadPgn(pgn, { strict: false });
    return g.history();
  } catch {
    return [];
  }
}

function fenAfterMoves(pgn: string, moveIndex: number): string {
  try {
    const setup = parseSetupFen(pgn);
    const g = new Chess(setup ?? undefined);
    g.loadPgn(pgn, { strict: false });
    const verboseMoves = g.history({ verbose: true });
    if (verboseMoves.length === 0) return g.fen();
    const replay = new Chess();
    replay.load(verboseMoves[0].before);
    for (let i = 0; i < moveIndex && i < verboseMoves.length; i++) {
      replay.move(verboseMoves[i]);
    }
    return replay.fen();
  } catch {
    return parseSetupFen(pgn) ?? START_FEN;
  }
}

type ChessComPuzzleViewerModalProps = {
  attempt: ChessComPuzzleAttempt | null;
  onClose: () => void;
};

const ChessComPuzzleViewerModal: React.FC<ChessComPuzzleViewerModalProps> = ({ attempt, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [pgn, setPgn] = useState('');
  const [isHumanPlayerWhite, setIsHumanPlayerWhite] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moveIndex, setMoveIndex] = useState(0);
  const [hoverMoveIndex, setHoverMoveIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!attempt) {
      setPgn('');
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPgn('');
    setMoveIndex(0);
    setHoverMoveIndex(null);

    fetchChessComPuzzleDetail(attempt.id)
      .then((detail) => {
        if (cancelled) return;
        if (!detail?.pgn) {
          setLoadError('Bulmaca PGN yüklenemedi.');
          return;
        }
        setPgn(sanitizePuzzlePgn(detail.pgn));
        setIsHumanPlayerWhite(detail.isHumanPlayerWhite);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Bulmaca yüklenirken hata oluştu.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt?.id]);

  const moveList = useMemo(() => (pgn ? buildMoveList(pgn) : []), [pgn]);
  const effectiveMoveIndex = hoverMoveIndex !== null ? hoverMoveIndex : moveIndex;
  const fen = useMemo(
    () => (pgn ? fenAfterMoves(pgn, effectiveMoveIndex) : parseSetupFen(pgn) ?? START_FEN),
    [pgn, effectiveMoveIndex],
  );

  const orientation: 'white' | 'black' = isHumanPlayerWhite ? 'white' : 'black';

  const goStart = useCallback(() => {
    setHoverMoveIndex(null);
    setMoveIndex(0);
  }, []);
  const goEnd = useCallback(() => {
    setHoverMoveIndex(null);
    setMoveIndex(moveList.length);
  }, [moveList.length]);
  const goPrev = useCallback(() => {
    setHoverMoveIndex(null);
    setMoveIndex((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setHoverMoveIndex(null);
    setMoveIndex((i) => Math.min(moveList.length, i + 1));
  }, [moveList.length]);

  const viewerBoardWheelRef = useChessWheelNavigation(goPrev, goNext, moveList.length > 0);

  useEffect(() => {
    if (!attempt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (moveList.length > 0) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goPrev();
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          goNext();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attempt, onClose, goPrev, goNext, moveList.length]);

  if (!attempt) return null;

  const analysisUrl = chessComPuzzleAnalysisUrl(attempt.id);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[96vh] overflow-hidden rounded-2xl border border-slate-600/60 bg-slate-900 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-700/80 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-black text-white">Bulmaca #{attempt.id}</h2>
            <p className="text-xs text-slate-400 mt-1">
              Puan {attempt.puzzleRating} · {attempt.movesCorrect}/{attempt.movesTotal} hamle ·{' '}
              {attempt.passed ? (
                <span className="text-emerald-400">Doğru {attempt.ratingChange > 0 ? `+${attempt.ratingChange}` : attempt.ratingChange}</span>
              ) : (
                <span className="text-rose-400">Yanlış {attempt.ratingChange}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={analysisUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold"
            >
              <ExternalLink className="w-4 h-4" />
              Chess.com&apos;da aç
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
              aria-label="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {loading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              Bulmaca yükleniyor…
            </div>
          ) : null}

          {!loading && loadError ? (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-rose-200 text-sm">
              {loadError}{' '}
              <a href={analysisUrl} target="_blank" rel="noopener noreferrer" className="underline text-emerald-300">
                Chess.com analizinde açın
              </a>
            </div>
          ) : null}

          {!loading && !loadError && pgn ? (
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              <ChessBoardFrame boardOrientation={orientation} className="w-full max-w-[min(100%,420px)] mx-auto lg:mx-0 shrink-0">
                <div ref={viewerBoardWheelRef} className="absolute inset-0">
                  <Chessboard
                    options={{
                      position: fen,
                      boardOrientation: orientation,
                      allowDragging: false,
                      darkSquareStyle: { backgroundColor: '#779952' },
                      lightSquareStyle: { backgroundColor: '#edeed1' },
                      ...CHESSBOARD_ANIMATION,
                      ...CHESSBOARD_NO_NOTATION,
                    }}
                  />
                </div>
              </ChessBoardFrame>
              <div className="flex-1 min-w-0 space-y-4 w-full">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={goStart} className="p-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700">
                    <ChevronsLeft className="w-5 h-5" />
                  </button>
                  <button type="button" onClick={goPrev} className="p-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm font-mono text-slate-300 px-2">
                    {moveIndex} / {moveList.length}
                  </span>
                  <button type="button" onClick={goNext} className="p-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button type="button" onClick={goEnd} className="p-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700">
                    <ChevronsRight className="w-5 h-5" />
                  </button>
                </div>
                <div className="rounded-xl bg-slate-950/50 border border-slate-700/60 p-3 max-h-48 overflow-y-auto">
                  <MainlineMoveGrid
                    moves={moveList}
                    activeHalfMove={effectiveMoveIndex}
                    hoverHalfMove={hoverMoveIndex}
                    compact
                    onSelectHalfMove={(ply) => {
                      setHoverMoveIndex(null);
                      setMoveIndex(ply);
                    }}
                    onHoverHalfMove={setHoverMoveIndex}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ChessComPuzzleViewerModal;
