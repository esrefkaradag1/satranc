import React, { useMemo, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { ChevronDown } from 'lucide-react';
import type { Student } from '../../types';
import type { LiveStudentBoardSnapshot } from '../LiveLesson';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const LIST_PREVIEW = 8;

function normalizeStudentId(id: string | null | undefined): string {
  return String(id ?? '').trim();
}

function studentPlatformLabel(student: Student): string {
  if (student.chessComUsername?.trim()) return 'Chess.com';
  if (student.lichessUsername?.trim()) return 'Lichess.org';
  return 'SatrancEdu';
}

function studentRating(student: Student): string {
  if (student.elo > 0) return String(student.elo);
  if (student.ukd > 0) return String(student.ukd);
  return '—';
}

type Props = {
  students: Student[];
  studentBoards: Record<string, LiveStudentBoardSnapshot>;
  coachBoardFen: string;
  focusedStudentId: string | null;
  onlineStudentIds?: Set<string>;
  onSelectStudent: (studentId: string) => void;
  onFollowStudent: (studentId: string) => void;
};

export function LiveLessonStudentBoardsPanel({
  students,
  studentBoards,
  coachBoardFen,
  focusedStudentId,
  onlineStudentIds,
  onSelectStudent,
  onFollowStudent,
}: Props) {
  const [showAll, setShowAll] = useState(false);

  const list = useMemo(
    () => students.filter((s) => normalizeStudentId(s.id).length > 0),
    [students],
  );

  const visibleList = showAll ? list : list.slice(0, LIST_PREVIEW);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0f172a]/50">
      <div className="shrink-0 px-3 py-2 border-b border-white/[0.06]">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          Canlı oyunlar ({list.length})
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {list.length === 0 ? (
          <p className="text-[11px] text-slate-600 text-center py-10 px-3">Derse alınan öğrenci yok.</p>
        ) : (
          visibleList.map((student) => {
            const sid = normalizeStudentId(student.id);
            const snap = studentBoards[sid];
            const fen = snap?.fen?.trim() || coachBoardFen || START_FEN;
            const isFocused = focusedStudentId === sid;
            const isOnline = onlineStudentIds?.has(sid) ?? false;
            return (
              <button
                key={student.id}
                type="button"
                onClick={() => onSelectStudent(sid)}
                onDoubleClick={() => onFollowStudent(sid)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.04] text-left transition-colors ${
                  isFocused ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-slate-700 border border-white/10 flex items-center justify-center text-[11px] font-bold text-white">
                    {student.name.charAt(0).toUpperCase()}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                      isOnline ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-white truncate">{student.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">
                    <span className="tabular-nums font-medium text-slate-400">{studentRating(student)}</span>
                    {' · '}
                    {studentPlatformLabel(student)}
                    {snap?.moves?.length ? ` · ${snap.moves.length} hamle` : ''}
                  </p>
                </div>
                <div className="w-12 h-12 shrink-0 rounded-md overflow-hidden border border-white/10 bg-slate-950 shadow-inner">
                  <Chessboard
                    options={{
                      id: `live-thumb-${sid}`,
                      position: fen,
                      allowDragging: false,
                      showNotation: false,
                      boardOrientation: 'white',
                    }}
                  />
                </div>
              </button>
            );
          })
        )}
        {list.length > LIST_PREVIEW && !showAll ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full py-2.5 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center justify-center gap-1"
          >
            Daha fazla göster
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
