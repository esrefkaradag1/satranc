import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink } from 'lucide-react';
import type { ChessComGame } from '../services/chessPlatformService';
import { useChessWheelNavigation } from '../hooks/useChessWheelNavigation';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION } from '../lib/chessBoardUi';
import { ChessBoardFrame } from './chess/ChessBoardFrame';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Chess.com PGN’deki saat/eval notlarını kaldırır (chess.js uyumu) */
function sanitizeChessComPgn(raw: string): string {
  return raw
    .replace(/\{\[%clk[^\]]*\]\}/gi, '')
    .replace(/\{\[%eval[^\]]*\]\}/gi, '')
    .replace(/\{\[%emt[^\]]*\]\}/gi, '')
    .trim();
}

function parsePgnHeaders(pgn: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

function buildMoveList(pgn: string): string[] {
  try {
    const g = new Chess();
    /** chess.js loadPgn başarıda genelde undefined döner; dönüşe güvenme */
    g.loadPgn(pgn, { strict: false });
    return g.history();
  } catch {
    return [];
  }
}

function fenAfterMoves(pgn: string, moveIndex: number): string {
  try {
    const g = new Chess();
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
    return START_FEN;
  }
}

const ChessComGameViewerModal: React.FC<{
  game: ChessComGame | null;
  viewerUsername?: string;
  onClose: () => void;
}> = ({ game, viewerUsername, onClose }) => {
  const [moveIndex, setMoveIndex] = useState(0);
  const [hoverMoveIndex, setHoverMoveIndex] = useState<number | null>(null);

  const rawPgn = game?.pgn?.trim() ?? '';
  const is960 = (game?.rules ?? '').toLowerCase() === 'chess960';

  const { cleanPgn, parseError } = useMemo(() => {
    if (!rawPgn) return { cleanPgn: '', parseError: 'PGN yok.' as string | null };
    if (is960) return { cleanPgn: '', parseError: null };
    const cleaned = sanitizeChessComPgn(rawPgn);
    const moves = buildMoveList(cleaned);
    if (moves.length === 0) {
      return { cleanPgn: cleaned, parseError: 'Hamle listesi çıkarılamadı.' };
    }
    return { cleanPgn: cleaned, parseError: null };
  }, [rawPgn, is960]);

  const headers = useMemo(() => (cleanPgn ? parsePgnHeaders(cleanPgn) : {}), [cleanPgn]);
  const moveList = useMemo(() => (cleanPgn && !parseError && !is960 ? buildMoveList(cleanPgn) : []), [cleanPgn, parseError, is960]);

  useEffect(() => {
    setMoveIndex(0);
    setHoverMoveIndex(null);
  }, [game?.uuid, game?.url]);

  useEffect(() => {
    if (moveIndex > moveList.length) setMoveIndex(moveList.length);
  }, [moveList.length, moveIndex]);

  const effectiveMoveIndex = hoverMoveIndex !== null ? hoverMoveIndex : moveIndex;

  const fen = useMemo(() => {
    if (!cleanPgn || parseError || is960) return START_FEN;
    return fenAfterMoves(cleanPgn, effectiveMoveIndex);
  }, [cleanPgn, parseError, is960, effectiveMoveIndex]);

  const viewerLower = viewerUsername?.trim().toLowerCase() ?? '';
  const whiteName = (headers.White || '').toLowerCase();
  const blackName = (headers.Black || '').toLowerCase();
  const orientation: 'white' | 'black' =
    viewerLower && blackName === viewerLower && whiteName !== viewerLower ? 'black' : 'white';

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

  const viewerBoardWheelRef = useChessWheelNavigation(goPrev, goNext, moveList.length > 0 && !is960 && !parseError);

  useEffect(() => {
    if (!game) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (!is960 && !parseError && moveList.length > 0) {
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
  }, [game, onClose, goPrev, goNext, is960, parseError, moveList.length]);

  if (!game) return null;

  const white = game.white?.username ?? headers.White ?? 'Beyaz';
  const black = game.black?.username ?? headers.Black ?? 'Siyah';
  const title = `${white} — ${black}`;
  const gameUrl = game.url?.trim() || (headers.Link ? headers.Link : null);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chesscom-viewer-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[96vh] overflow-hidden rounded-2xl border border-slate-600/60 bg-slate-900 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-700/80 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 id="chesscom-viewer-title" className="text-base sm:text-lg font-black text-white truncate">
              {title}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {[game.time_class || game.time_control, game.rated ? 'rated' : 'casual'].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {gameUrl ? (
              <a
                href={gameUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Chess.com’da aç
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              aria-label="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {!rawPgn && <div className="py-12 text-center text-slate-400 text-sm">Bu kayıtta PGN bulunamadı.</div>}

          {is960 && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-amber-200 text-sm mb-4">
              Chess960 oyunları bu tahtada açılmaz. Tam görünüm için Chess.com’da açın.
            </div>
          )}

          {rawPgn && !is960 && parseError && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-rose-200 text-sm mb-4">{parseError}</div>
          )}

          {rawPgn && !is960 && !parseError && cleanPgn && (
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              <ChessBoardFrame
                boardOrientation={orientation}
                className={`w-full max-w-[min(100%,420px)] mx-auto lg:mx-0 shrink-0 ${moveList.length > 0 ? 'touch-none' : ''}`}
              >
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
                  <button
                    type="button"
                    onClick={goStart}
                    className="p-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700"
                    title="Başa"
                  >
                    <ChevronsLeft className="w-5 h-5" />
                  </button>
                  <button type="button" onClick={goPrev} className="p-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700" title="Önceki">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm font-mono text-slate-300 px-2">
                    {moveIndex} / {moveList.length}
                  </span>
                  <button type="button" onClick={goNext} className="p-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700" title="Sonraki">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button type="button" onClick={goEnd} className="p-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700" title="Sona">
                    <ChevronsRight className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">← → hamle; tahta üzerinde tekerlek; hamle üzerine gelince önizleme; Esc kapatır.</p>
                <div
                  className="rounded-xl bg-slate-950/50 border border-slate-700/60 p-3 max-h-48 overflow-y-auto"
                  onMouseLeave={() => setHoverMoveIndex(null)}
                >
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Hamle listesi</div>
                  <div className="text-sm text-slate-300 font-mono leading-relaxed flex flex-wrap gap-x-2 gap-y-1">
                    {moveList.map((m, i) => (
                      <span key={`${i}-${m}`}>
                        {i % 2 === 0 && <span className="text-slate-500 mr-1">{Math.floor(i / 2) + 1}.</span>}
                        <span
                          className={`cursor-default ${i < effectiveMoveIndex ? 'text-emerald-400' : 'text-slate-500'}`}
                          onMouseEnter={() => setHoverMoveIndex(i + 1)}
                        >
                          {m}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ChessComGameViewerModal;
