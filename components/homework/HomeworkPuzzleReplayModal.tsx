import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { X, Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION } from '../../lib/chessBoardUi';
import { ChessBoardFrame } from '../chess/ChessBoardFrame';
import type { HomeworkPuzzleAttempt, Puzzle } from '../../types';
import {
  buildHomeworkPuzzleReplay,
  type HomeworkReplayFrame,
} from '../../lib/homeworkAttemptReplay';
import { puzzleMoveHighlightStyles } from '../../lib/puzzlePlayUtils';

type Props = {
  puzzle: Puzzle;
  puzzleIndex: number;
  studentName: string;
  attempts: HomeworkPuzzleAttempt[];
  onClose: () => void;
};

const TONE_BORDER: Record<HomeworkReplayFrame['tone'], string> = {
  neutral: 'border-white/10',
  student: 'border-indigo-500/40',
  setup: 'border-sky-500/40',
  reset: 'border-amber-500/30',
  wrong: 'border-rose-500/50',
  correct: 'border-emerald-500/50',
};

const TONE_CAPTION: Record<HomeworkReplayFrame['tone'], string> = {
  neutral: 'text-slate-300',
  student: 'text-indigo-300',
  setup: 'text-sky-300',
  reset: 'text-amber-300',
  wrong: 'text-rose-300',
  correct: 'text-emerald-300',
};

export const HomeworkPuzzleReplayModal: React.FC<Props> = ({
  puzzle,
  puzzleIndex,
  studentName,
  attempts,
  onClose,
}) => {
  const { frames, boardOrientation, hasPlayableContent } = useMemo(
    () => buildHomeworkPuzzleReplay(puzzle, attempts),
    [puzzle, attempts],
  );

  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(900);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const frame = frames[frameIdx] ?? frames[0];
  const squareStyles = useMemo(() => {
    if (!frame?.moveSan) return {};
    const prev = frames[Math.max(0, frameIdx - 1)];
    const fromFen = prev?.fen ?? frame.fen;
    return puzzleMoveHighlightStyles(fromFen, frame.moveSan);
  }, [frame, frameIdx, frames]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const goTo = useCallback((idx: number) => {
    setFrameIdx(Math.max(0, Math.min(frames.length - 1, idx)));
  }, [frames.length]);

  useEffect(() => {
    if (!playing) {
      clearTimer();
      return;
    }
    if (frameIdx >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      setFrameIdx((i) => Math.min(frames.length - 1, i + 1));
    }, speedMs);
    return clearTimer;
  }, [playing, frameIdx, frames.length, speedMs, clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return (
    <div className="modal-overlay z-[60]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" aria-hidden />
      <div
        className="modal-panel relative max-w-lg bg-[#0f172a] border border-white/10 sm:rounded-2xl rounded-t-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-white truncate">
              Oynat — Bulmaca #{puzzleIndex + 1}
            </h3>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              {studentName} · {puzzle.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!hasPlayableContent ? (
            <p className="text-sm text-slate-400 text-center py-8">
              Bu bulmaca için oynatılacak hamle kaydı yok.
            </p>
          ) : (
            <>
              <div className={`rounded-xl border-2 overflow-hidden ${TONE_BORDER[frame.tone]}`}>
                <ChessBoardFrame boardOrientation={boardOrientation} className="w-full max-w-sm mx-auto">
                  <Chessboard
                    options={{
                      id: `hw-replay-${puzzle.id}`,
                      position: frame.fen,
                      allowDragging: false,
                      boardOrientation,
                      squareStyles,
                      darkSquareStyle: { backgroundColor: '#779952' },
                      lightSquareStyle: { backgroundColor: '#edeed1' },
                      ...CHESSBOARD_ANIMATION,
                      ...CHESSBOARD_NO_NOTATION,
                    }}
                  />
                </ChessBoardFrame>
              </div>

              <div className="text-center min-h-[2.5rem] flex flex-col items-center justify-center gap-1">
                <p className={`text-sm font-bold ${TONE_CAPTION[frame.tone]}`}>{frame.caption}</p>
                <p className="text-[10px] text-slate-500 tabular-nums">
                  {frameIdx + 1} / {frames.length}
                </p>
              </div>

              <input
                type="range"
                min={0}
                max={Math.max(0, frames.length - 1)}
                value={frameIdx}
                onChange={(e) => {
                  setPlaying(false);
                  goTo(Number(e.target.value));
                }}
                className="w-full accent-indigo-500"
              />

              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => { setPlaying(false); goTo(0); }}
                  className="p-2.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                  title="Başa sar"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { setPlaying(false); goTo(frameIdx - 1); }}
                  disabled={frameIdx <= 0}
                  className="p-2.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                  title="Önceki"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm"
                >
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                  {playing ? 'Durdur' : 'Oynat'}
                </button>
                <button
                  type="button"
                  onClick={() => { setPlaying(false); goTo(frameIdx + 1); }}
                  disabled={frameIdx >= frames.length - 1}
                  className="p-2.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                  title="Sonraki"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
                <select
                  value={speedMs}
                  onChange={(e) => setSpeedMs(Number(e.target.value))}
                  className="text-xs bg-slate-800 border border-white/10 rounded-lg px-2 py-2 text-slate-300"
                  aria-label="Oynatma hızı"
                >
                  <option value={1400}>Yavaş</option>
                  <option value={900}>Normal</option>
                  <option value={500}>Hızlı</option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
