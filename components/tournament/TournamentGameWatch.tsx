import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Chessboard } from 'react-chessboard';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Radio, Repeat, X } from 'lucide-react';
import { ChessBoardFrame } from '../chess/ChessBoardFrame';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION, chessboardDomId } from '../../lib/chessBoardUi';
import { subscribeToTournamentGame, type TournamentGame } from '../../lib/tournamentGames';
import { formatClock, lastMoveStyles, liveClocks, replayPositions } from './liveGameUtils';
import type { PlayerInfo } from './LiveGamesGrid';

interface TournamentGameWatchProps {
  game: TournamentGame;
  player: (studentId: string) => PlayerInfo;
  onClose: () => void;
}

function resultText(game: TournamentGame, whiteName: string, blackName: string): string | null {
  if (game.status === 'cancelled') return 'Maç iptal edildi';
  if (game.status !== 'finished' || !game.result) return null;
  if (game.result === '1/2-1/2') return 'Berabere · ½–½';
  return game.result === '1-0' ? `${whiteName} kazandı · 1–0` : `${blackName} kazandı · 0–1`;
}

/**
 * Antrenör için salt-izleme ekranı (lichess'te bir turnuva maçını açmak gibi): hamleler
 * gerçek zamanlı akar, saatler işler, hamle listesinde ileri/geri gezilebilir.
 * Hiçbir şey yazmaz — saat bitişi/sonuç oyuncu istemcilerinden gelir.
 */
export const TournamentGameWatch: React.FC<TournamentGameWatchProps> = ({ game: initialGame, player, onClose }) => {
  const [game, setGame] = useState(initialGame);
  const [now, setNow] = useState(() => Date.now());
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  /** null = canlıyı takip et (son hamle); sayı = kullanıcının seçtiği ply */
  const [viewPly, setViewPly] = useState<number | null>(null);
  const moveListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => subscribeToTournamentGame(initialGame.id, setGame), [initialGame.id]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const positions = useMemo(() => replayPositions(game.moves), [game.moves]);
  const lastPly = positions.length - 1;
  const ply = viewPly == null ? lastPly : Math.min(viewPly, lastPly);
  const following = viewPly == null || viewPly >= lastPly;
  // Takipteyken DB'deki FEN esas (replay bozuksa bile doğru konum görünür).
  const boardFen = following ? game.fen : positions[ply]?.fen ?? game.fen;

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(lastPly, next));
    setViewPly(clamped >= lastPly ? null : clamped);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(ply - 1);
      else if (e.key === 'ArrowRight') go(ply + 1);
      else if (e.key === 'ArrowUp' || e.key === 'Home') go(0);
      else if (e.key === 'ArrowDown' || e.key === 'End') go(lastPly);
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Seçili hamle listede görünür kalsın.
  useEffect(() => {
    const box = moveListRef.current;
    const el = box?.querySelector<HTMLElement>('[data-current="true"]');
    if (!box || !el) return;
    box.scrollTop = Math.max(0, el.offsetTop - box.clientHeight / 2);
  }, [ply, lastPly]);

  const white = player(game.whiteStudentId);
  const black = player(game.blackStudentId);
  const { whiteMs, blackMs, turn } = liveClocks(game, now);
  const active = game.status === 'active';
  const result = resultText(game, white.name, black.name);

  const top = orientation === 'white'
    ? { info: black, ms: blackMs, onMove: active && turn === 'b', color: 'Siyah' }
    : { info: white, ms: whiteMs, onMove: active && turn === 'w', color: 'Beyaz' };
  const bottom = orientation === 'white'
    ? { info: white, ms: whiteMs, onMove: active && turn === 'w', color: 'Beyaz' }
    : { info: black, ms: blackMs, onMove: active && turn === 'b', color: 'Siyah' };

  const movePairs: Array<{ no: number; w?: string; b?: string }> = [];
  game.moves.forEach((san, i) => {
    if (i % 2 === 0) movePairs.push({ no: i / 2 + 1, w: san });
    else movePairs[movePairs.length - 1]!.b = san;
  });

  const renderClock = (side: typeof top) => (
    <div className="flex items-stretch justify-between gap-3">
      <div className="min-w-0 flex items-center gap-2">
        <span className={`w-3 h-3 shrink-0 rounded-full border border-slate-500 ${side.color === 'Beyaz' ? 'bg-white' : 'bg-slate-900'}`} />
        <span className="truncate text-sm font-bold text-white">{side.info.name}</span>
        {side.info.rank != null && <span className="shrink-0 text-xs font-bold text-slate-500 tabular-nums">#{side.info.rank}</span>}
      </div>
      <span
        className={`shrink-0 rounded-lg px-3 py-1 font-mono text-2xl font-black tabular-nums ${
          side.onMove
            ? side.ms < 30_000 ? 'bg-rose-500/20 text-rose-200' : 'bg-emerald-500/20 text-white'
            : 'bg-slate-800 text-slate-400'
        }`}
      >
        {formatClock(side.ms)}
      </span>
    </div>
  );

  const navBtn = (onClick: () => void, label: string, disabled: boolean, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex-1 flex items-center justify-center py-2 text-slate-300 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
    >
      {icon}
    </button>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-2 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`${white.name} – ${black.name} canlı izle`}
    >
      <div className="w-full max-w-5xl max-h-full overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-700/60">
          <div className="min-w-0 flex items-center gap-2">
            {active ? (
              <span className="shrink-0 flex items-center gap-1.5 rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-300">
                <Radio className="w-3 h-3" /> Canlı
              </span>
            ) : (
              <span className="shrink-0 rounded-md bg-slate-700/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">Bitti</span>
            )}
            <h3 className="truncate text-sm font-bold text-white">{white.name} – {black.name}</h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
              title="Tahtayı çevir (F)"
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <Repeat className="w-4 h-4" />
            </button>
            <button type="button" onClick={onClose} title="Kapat (Esc)" className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="space-y-2 min-w-0">
            {renderClock(top)}
            <ChessBoardFrame boardOrientation={orientation} className="relative mx-auto w-full max-w-[min(100%,calc(100vh-14rem))]">
              <Chessboard
                options={{
                  id: chessboardDomId('tournament-watch', game.id),
                  position: boardFen,
                  boardOrientation: orientation,
                  allowDragging: false,
                  darkSquareStyle: { backgroundColor: '#b58863' },
                  lightSquareStyle: { backgroundColor: '#f0d9b5' },
                  squareStyles: lastMoveStyles(positions[ply]),
                  ...CHESSBOARD_ANIMATION,
                  ...CHESSBOARD_NO_NOTATION,
                }}
              />
            </ChessBoardFrame>
            {renderClock(bottom)}
          </div>

          <div className="flex min-h-0 flex-col rounded-xl border border-slate-700/50 bg-slate-950/40 overflow-hidden md:max-h-[calc(100vh-10rem)]">
            <div className="flex border-b border-slate-700/50">
              {navBtn(() => go(0), "Başa (↑)", ply === 0, <ChevronFirst className="w-4 h-4" />)}
              {navBtn(() => go(ply - 1), "Geri (←)", ply === 0, <ChevronLeft className="w-4 h-4" />)}
              {navBtn(() => go(ply + 1), "İleri (→)", ply >= lastPly, <ChevronRight className="w-4 h-4" />)}
              {navBtn(() => go(lastPly), "Son hamle (↓)", ply >= lastPly, <ChevronLast className="w-4 h-4" />)}
            </div>
            <div ref={moveListRef} className="relative min-h-[8rem] flex-1 overflow-y-auto text-sm">
              {movePairs.length === 0 ? (
                <p className="p-4 text-xs text-slate-500">Henüz hamle yapılmadı.</p>
              ) : (
                movePairs.map((pair) => {
                  const wPly = pair.no * 2 - 1;
                  const bPly = pair.no * 2;
                  const cell = (san: string | undefined, p: number) =>
                    san ? (
                      <button
                        type="button"
                        data-current={ply === p ? 'true' : undefined}
                        onClick={() => go(p)}
                        className={`px-2 py-1 text-left font-semibold tabular-nums transition-colors ${
                          ply === p ? 'bg-indigo-600 text-white' : 'text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        {san}
                      </button>
                    ) : <span />;
                  return (
                    <div key={pair.no} className="grid grid-cols-[2.5rem_1fr_1fr] border-b border-slate-800/80">
                      <span className="bg-slate-900/80 py-1 text-center text-xs text-slate-500 tabular-nums">{pair.no}</span>
                      {cell(pair.w, wPly)}
                      {cell(pair.b, bPly)}
                    </div>
                  );
                })
              )}
            </div>
            {result ? (
              <div className="border-t border-slate-700/50 px-3 py-3 text-center text-sm font-black text-amber-300">{result}</div>
            ) : !following ? (
              <button
                type="button"
                onClick={() => go(lastPly)}
                className="border-t border-slate-700/50 px-3 py-2 text-xs font-bold text-indigo-300 hover:bg-indigo-500/10 transition-colors"
              >
                Canlı konuma dön
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TournamentGameWatch;
