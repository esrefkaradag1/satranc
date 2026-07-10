import React, { useEffect, useMemo, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react';
import type { StudyChapter } from '../../lib/studyTypes';
import type { StudyEvent } from '../../studyEvents';
import { ChessBoardFrame } from '../chess/ChessBoardFrame';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION } from '../../lib/chessBoardUi';
import {
  buildChapterReplaySteps,
  chapterReplayStartFen,
  dedupeStudyEvents,
  displayStudyEventMoveNo,
  studentOnlyStudyEvents,
} from '../../lib/studyReplayUtils';

type Props = {
  chapter: StudyChapter | undefined;
  events: StudyEvent[];
  studentId: string;
  studyId: string;
  vsMoveHistory?: string[];
};

export const StudyChapterReplayPanel: React.FC<Props> = ({
  chapter,
  events,
  studentId,
  studyId,
  vsMoveHistory = [],
}) => {
  const startFen = chapterReplayStartFen(chapter);
  const orientation = chapter?.orientation ?? 'white';

  const tableEvents = useMemo(
    () => studentOnlyStudyEvents(events, chapter, vsMoveHistory),
    [events, chapter, vsMoveHistory],
  );

  const steps = useMemo(
    () => buildChapterReplaySteps(chapter, events, vsMoveHistory),
    [chapter, events, vsMoveHistory],
  );
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setStepIndex(Math.max(0, steps.length - 1));
  }, [steps.length, events, vsMoveHistory]);

  const current = steps[stepIndex] ?? steps[0];

  const jumpToEvent = (event: StudyEvent, replayIdx: number) => {
    if (vsMoveHistory.length > 0 && event.playedMove) {
      const ply = vsMoveHistory.findIndex((move) => move === event.playedMove);
      if (ply >= 0) {
        setStepIndex(ply + 1);
        return;
      }
    }
    const target = steps.findIndex((step) => step.eventIndex === replayIdx);
    if (target >= 0) setStepIndex(target);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,280px)_1fr] gap-4 border-b border-white/10 bg-black/15">
      <div className="p-4 flex flex-col items-center gap-3 border-b lg:border-b-0 lg:border-r border-white/10">
        <ChessBoardFrame
          boardOrientation={orientation}
          hideCoordinates
          className="w-full max-w-[280px] rounded-lg overflow-hidden border border-white/10 shadow-inner"
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

        <div className="w-full max-w-[280px] text-center">
          <p className="text-xs font-bold text-white truncate">
            {current?.label ?? 'Başlangıç'}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {stepIndex + 1} / {steps.length} pozisyon
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStepIndex(0)}
            disabled={stepIndex <= 0}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30"
            title="Başa dön"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex <= 0}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30"
            title="Önceki hamle"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
            disabled={stepIndex >= steps.length - 1}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30"
            title="Sonraki hamle"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setStepIndex(steps.length - 1)}
            disabled={stepIndex >= steps.length - 1}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30"
            title="Sona git"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[520px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5 bg-black/20">
              <th className="text-left px-4 py-2.5">Hamle No</th>
              <th className="text-left px-4 py-2.5">Oynanan</th>
              <th className="text-left px-4 py-2.5">Beklenen</th>
              <th className="text-left px-4 py-2.5">Sonuç</th>
              <th className="text-left px-4 py-2.5">Düşünme</th>
              <th className="text-left px-4 py-2.5">Zaman</th>
            </tr>
          </thead>
          <tbody>
            {tableEvents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Hamle kaydı yok
                </td>
              </tr>
            ) : (
              tableEvents.map((event, eventIdx) => {
                const orderedSource = dedupeStudyEvents(events);
                const sourceIdx = orderedSource.findIndex((e) => e.id === event.id);
                const replayIdx = sourceIdx >= 0 ? sourceIdx : eventIdx;
                const stepForEvent = steps.findIndex((step) => step.eventIndex === replayIdx);
                const isActive = stepForEvent === stepIndex;
                return (
                  <tr
                    key={event.id}
                    onClick={() => jumpToEvent(event, replayIdx)}
                    className={`border-b border-white/5 last:border-b-0 cursor-pointer transition-colors ${
                      isActive ? 'bg-violet-500/15' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <td className="px-4 py-2.5 text-slate-300 font-bold">
                      {displayStudyEventMoveNo(event, eventIdx, chapter)}
                    </td>
                    <td className="px-4 py-2.5 text-white font-medium">{event.playedMove || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-300">{event.expectedMove || 'Serbest oyun'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold border ${
                        event.result === 'wrong'
                          ? 'border-rose-500/30 bg-rose-500/15 text-rose-300'
                          : event.result === 'solution'
                            ? 'border-sky-500/30 bg-sky-500/15 text-sky-300'
                            : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                      }`}>
                        {event.result === 'wrong' ? 'Yanlış' : event.result === 'solution' ? 'Çözüm' : 'Doğru'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{Math.max(0, Math.round((event.thinkMs ?? 0) / 1000))} sn</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {new Date(event.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
