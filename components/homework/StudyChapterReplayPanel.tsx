import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { StudyChapter } from '../../lib/studyTypes';
import type { StudyEvent } from '../../studyEvents';
import { ChessBoardFrame } from '../chess/ChessBoardFrame';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION } from '../../lib/chessBoardUi';
import {
  buildChapterReplaySteps,
  buildReplayTableRows,
  chapterReplayStartFen,
} from '../../lib/studyReplayUtils';

type Props = {
  chapter: StudyChapter | undefined;
  events: StudyEvent[];
  studentId: string;
  studyId: string;
  vsMoveHistory?: string[];
};

const PLAY_INTERVAL_MS = 900;
const BOARD_PANEL_STORAGE_KEY = 'study_replay_board_panel_width_px';
const BOARD_PANEL_MIN = 300;
const BOARD_PANEL_MAX = 640;
const BOARD_PANEL_DEFAULT = 420;

function clampBoardPanelWidth(v: number): number {
  return Math.min(BOARD_PANEL_MAX, Math.max(BOARD_PANEL_MIN, Math.round(v)));
}

function readBoardPanelWidthPx(): number {
  if (typeof window === 'undefined') return BOARD_PANEL_DEFAULT;
  try {
    const raw = localStorage.getItem(BOARD_PANEL_STORAGE_KEY);
    if (!raw) return BOARD_PANEL_DEFAULT;
    const n = Number(raw);
    return Number.isFinite(n) ? clampBoardPanelWidth(n) : BOARD_PANEL_DEFAULT;
  } catch {
    return BOARD_PANEL_DEFAULT;
  }
}

function BoardPanelResizeHandle({
  onResizeStart,
}: {
  onResizeStart: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Tahta paneli genişliği"
      title="Sürükleyerek tahta alanını büyütün veya küçültün"
      onPointerDown={onResizeStart}
      className="hidden md:flex shrink-0 w-4 cursor-col-resize items-center justify-center group touch-none select-none self-stretch py-4"
    >
      <div className="flex h-14 w-2 flex-col items-center justify-center gap-0.5 rounded-full border border-white/10 bg-slate-800/90 shadow-md group-hover:border-violet-500/40 group-hover:bg-slate-700/90 group-active:border-violet-500/60 group-active:bg-violet-950/80 transition-colors">
        <span className="block h-1 w-1 rounded-full bg-slate-500 group-hover:bg-violet-300" aria-hidden />
        <span className="block h-1 w-1 rounded-full bg-slate-500 group-hover:bg-violet-300" aria-hidden />
        <span className="block h-1 w-1 rounded-full bg-slate-500 group-hover:bg-violet-300" aria-hidden />
      </div>
    </div>
  );
}

export const StudyChapterReplayPanel: React.FC<Props> = ({
  chapter,
  events,
  studentId,
  studyId,
  vsMoveHistory = [],
}) => {
  const startFen = chapterReplayStartFen(chapter);
  const orientation = chapter?.orientation ?? 'white';

  const tableRows = useMemo(
    () => buildReplayTableRows(chapter, events, vsMoveHistory),
    [events, chapter, vsMoveHistory],
  );

  const steps = useMemo(
    () => buildChapterReplaySteps(chapter, events, vsMoveHistory),
    [chapter, events, vsMoveHistory],
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [boardPanelWidthPx, setBoardPanelWidthPx] = useState(readBoardPanelWidthPx);
  const boardPanelWidthRef = useRef(boardPanelWidthPx);

  useEffect(() => {
    boardPanelWidthRef.current = boardPanelWidthPx;
  }, [boardPanelWidthPx]);

  useEffect(() => {
    setStepIndex(0);
    setPlaying(false);
  }, [steps.length, chapter?.id, studentId]);

  useEffect(() => {
    if (!playing) {
      if (playRef.current) {
        clearInterval(playRef.current);
        playRef.current = null;
      }
      return;
    }
    if (steps.length <= 1) {
      setPlaying(false);
      return;
    }
    playRef.current = setInterval(() => {
      setStepIndex((prev) => {
        if (prev >= steps.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, PLAY_INTERVAL_MS);
    return () => {
      if (playRef.current) clearInterval(playRef.current);
      playRef.current = null;
    };
  }, [playing, steps.length]);

  const handleBoardPanelResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handleEl = e.currentTarget;
    const startX = e.clientX;
    const startW = boardPanelWidthRef.current;

    const onMove = (ev: PointerEvent) => {
      const rowW = rowRef.current?.clientWidth ?? window.innerWidth;
      const maxW = Math.min(BOARD_PANEL_MAX, Math.floor(rowW * 0.62));
      const delta = ev.clientX - startX;
      setBoardPanelWidthPx(clampBoardPanelWidth(Math.min(maxW, startW + delta)));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        handleEl.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(BOARD_PANEL_STORAGE_KEY, String(boardPanelWidthRef.current));
      } catch {
        /* ignore */
      }
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  const current = steps[stepIndex] ?? steps[0];

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    setStepIndex(0);
    setPlaying(true);
  };

  const navBtn =
    'p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30';

  return (
    <div ref={rowRef} className="flex flex-col md:flex-row min-h-0 flex-1 h-full overflow-hidden">
      <aside
        className="study-replay-board-aside-mobile-reset shrink-0 border-b md:border-b-0 bg-black/25 flex items-center md:flex-col md:items-center gap-3 p-3 md:p-4 md:overflow-y-auto w-full"
        style={{
          width: boardPanelWidthPx,
          minWidth: boardPanelWidthPx,
          maxWidth: boardPanelWidthPx,
        }}
      >
        <ChessBoardFrame
          boardOrientation={orientation}
          hideCoordinates
          className="w-[150px] sm:w-[170px] md:w-full rounded-lg overflow-hidden border border-white/10 shadow-inner shrink-0"
        >
          <Chessboard
            options={{
              id: `study-replay-${studyId}-${chapter?.id ?? 'x'}-${studentId}`,
              position: current?.fen ?? startFen,
              allowDragging: false,
              boardOrientation: orientation,
              darkSquareStyle: { backgroundColor: '#779952' },
              lightSquareStyle: { backgroundColor: '#edeed1' },
              ...CHESSBOARD_ANIMATION,
              ...CHESSBOARD_NO_NOTATION,
            }}
          />
        </ChessBoardFrame>

        <div className="flex-1 md:flex-none md:w-full min-w-0 flex flex-col gap-2 md:items-center">
          <div className="md:text-center min-w-0 w-full">
            <p className="text-sm font-bold text-white truncate">{current?.label ?? 'Başlangıç'}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {stepIndex + 1} / {Math.max(1, steps.length)} pozisyon
            </p>
          </div>
          <div className="flex items-center gap-1 flex-wrap md:justify-center">
            <button type="button" onClick={() => { setPlaying(false); setStepIndex(0); }} disabled={stepIndex <= 0} className={navBtn} aria-label="Başa dön">
              <SkipBack className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => { setPlaying(false); setStepIndex((i) => Math.max(0, i - 1)); }} disabled={stepIndex <= 0} className={navBtn} aria-label="Önceki">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              disabled={steps.length <= 1}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-violet-500/40 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30 disabled:opacity-30"
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {playing ? 'Durdur' : 'Oynat'}
            </button>
            <button type="button" onClick={() => { setPlaying(false); setStepIndex((i) => Math.min(steps.length - 1, i + 1)); }} disabled={stepIndex >= steps.length - 1} className={navBtn} aria-label="Sonraki">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => { setPlaying(false); setStepIndex(steps.length - 1); }} disabled={stepIndex >= steps.length - 1} className={navBtn} aria-label="Sona git">
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <BoardPanelResizeHandle onResizeStart={handleBoardPanelResizeStart} />

      <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02] shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Tüm hamleler · {tableRows.length} ply
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="sticky top-0 z-10 bg-[#0b1220]">
              <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                <th className="text-left px-3 py-2.5">No</th>
                <th className="text-left px-3 py-2.5">Renk</th>
                <th className="text-left px-3 py-2.5">Kim</th>
                <th className="text-left px-3 py-2.5">Hamle</th>
                <th className="text-left px-3 py-2.5">Sonuç</th>
                <th className="text-left px-3 py-2.5">Düşünme</th>
                <th className="text-left px-3 py-2.5">Zaman</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Hamle kaydı yok
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => {
                  const isActive = row.stepIndex === stepIndex;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => { setPlaying(false); setStepIndex(row.stepIndex); }}
                      className={`border-b border-white/5 last:border-b-0 cursor-pointer transition-colors ${
                        isActive ? 'bg-violet-500/20' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <td className="px-3 py-2 text-slate-300 font-bold">{row.moveNo}</td>
                      <td className="px-3 py-2 text-slate-300">
                        {row.side === 'white' ? 'Beyaz' : 'Siyah'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold border ${
                          row.isStudent
                            ? 'border-sky-500/30 bg-sky-500/15 text-sky-300'
                            : 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                        }`}>
                          {row.isStudent ? 'Öğrenci' : 'Bilgisayar'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-white font-semibold">{row.playedMove}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold border ${
                          row.result === 'wrong'
                            ? 'border-rose-500/30 bg-rose-500/15 text-rose-300'
                            : row.result === 'solution'
                              ? 'border-sky-500/30 bg-sky-500/15 text-sky-300'
                              : row.result === 'engine'
                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                                : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                        }`}>
                          {row.result === 'wrong'
                            ? 'Yanlış'
                            : row.result === 'solution'
                              ? 'Çözüm'
                              : row.result === 'engine'
                                ? 'Motor'
                                : 'Doğru'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {row.isStudent ? `${Math.max(0, Math.round(row.thinkMs / 1000))} sn` : '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                        {row.createdAt
                          ? new Date(row.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
                          : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: don't lock aside to drag width */}
      <style>{`
        @media (max-width: 767px) {
          .study-replay-board-aside-mobile-reset {
            width: 100% !important;
            min-width: 0 !important;
            max-width: none !important;
          }
        }
      `}</style>
    </div>
  );
};
