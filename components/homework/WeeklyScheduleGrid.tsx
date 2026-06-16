import React from 'react';
import { Calendar, Save } from 'lucide-react';
import type { Student, StudentDailyTarget } from '../../types';
import { WEEKDAY_LABELS } from '../../lib/homeworkPanelUtils';

import type { DayCompletionStatus } from '../../lib/homeworkDayUtils';

type Props = {
  students: Student[];
  drafts: Record<string, StudentDailyTarget>;
  onDraftChange: (studentId: string, patch: Partial<StudentDailyTarget>) => void;
  onDayChange: (studentId: string, day: number, patch: Partial<NonNullable<StudentDailyTarget['weeklySchedule']>[number]>) => void;
  onSave: () => void;
  selectedStudentId?: string | null;
  onSelectStudent?: (id: string | null) => void;
  dayCompletion?: Record<number, DayCompletionStatus>;
};

function completionStyles(status: DayCompletionStatus | undefined): string {
  switch (status) {
    case 'done':
      return 'border-emerald-500/50 bg-emerald-500/10';
    case 'missed':
      return 'border-rose-500/50 bg-rose-500/10';
    case 'pending':
      return 'border-amber-500/40 bg-amber-500/5';
    default:
      return 'border-white/5 bg-black/20';
  }
}

function completionLabel(status: DayCompletionStatus | undefined): string | null {
  switch (status) {
    case 'done':
      return 'Tamam';
    case 'missed':
      return 'Eksik';
    case 'pending':
      return 'Bekliyor';
    default:
      return null;
  }
}

function numVal(v: number | undefined): string {
  return v === undefined || v === 0 ? '' : String(v);
}

export const WeeklyScheduleGrid: React.FC<Props> = ({
  students,
  drafts,
  onDraftChange,
  onDayChange,
  onSave,
  selectedStudentId,
  onSelectStudent,
  dayCompletion,
}) => {
  const activeId = selectedStudentId ?? students[0]?.id ?? null;
  const activeStudent = students.find((s) => s.id === activeId);
  const draft = activeId ? drafts[activeId] ?? {} : {};

  return (
    <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
      <div className="p-5 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-violet-400" />
          <div>
            <h3 className="text-sm font-black text-white">Günlük Program</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Pazartesi–Pazar · öğrenci bazlı maç ve bulmaca hedefi</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          className="flex items-center gap-2 px-4 py-2 rounded-xl premium-gradient text-white text-xs font-bold shadow-lg shadow-indigo-500/20"
        >
          <Save className="w-4 h-4" /> Kaydet
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {students.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectStudent?.(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeId === s.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {s.name.split(' ')[0]}
            </button>
          ))}
        </div>

        {activeStudent ? (
          <>
            <p className="text-sm font-bold text-white">{activeStudent.name}</p>
            <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Tamam</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Bekliyor</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Eksik</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                const dayData = draft.weeklySchedule?.[day] ?? {};
                const isToday = (() => {
                  const d = new Date().getDay();
                  return (d === 0 ? 7 : d) === day;
                })();
                const completion = dayCompletion?.[day];
                const completionText = completionLabel(completion);
                return (
                  <div
                    key={day}
                    className={`rounded-xl p-3 space-y-2 border ${
                      isToday ? 'ring-1 ring-indigo-500/40' : ''
                    } ${completionStyles(completion)}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p className={`text-[10px] font-black uppercase ${isToday ? 'text-indigo-400' : 'text-slate-500'}`}>
                        {WEEKDAY_LABELS[day - 1]}
                      </p>
                      {completionText ? (
                        <span className={`text-[8px] font-black uppercase ${
                          completion === 'done' ? 'text-emerald-400' : completion === 'missed' ? 'text-rose-400' : 'text-amber-400'
                        }`}>
                          {completionText}
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-0.5">Maç</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={numVal(dayData.dailyGameTarget)}
                        onChange={(e) => onDayChange(activeStudent.id, day, {
                          dailyGameTarget: e.target.value === '' ? undefined : Number(e.target.value),
                        })}
                        className="input-base w-full text-xs py-1.5"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-0.5">Bulmaca</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={numVal(dayData.dailyPuzzleTarget)}
                        onChange={(e) => onDayChange(activeStudent.id, day, {
                          dailyPuzzleTarget: e.target.value === '' ? undefined : Number(e.target.value),
                        })}
                        className="input-base w-full text-xs py-1.5"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-0.5">Min %</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="60"
                        value={numVal(dayData.minPuzzleAccuracyPct)}
                        onChange={(e) => onDayChange(activeStudent.id, day, {
                          minPuzzleAccuracyPct: e.target.value === '' ? undefined : Number(e.target.value),
                        })}
                        className="input-base w-full text-xs py-1.5"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl bg-black/20 border border-white/5">
              <p className="text-[10px] text-slate-500 font-bold uppercase w-full">Varsayılan (tüm günler)</p>
              <div>
                <label className="text-[9px] text-slate-500 block mb-1">Günlük maç</label>
                <input
                  type="number"
                  min={0}
                  value={numVal(draft.dailyGameTarget)}
                  onChange={(e) => onDraftChange(activeStudent.id, {
                    dailyGameTarget: e.target.value === '' ? 0 : Number(e.target.value),
                  })}
                  className="input-base w-24"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500 block mb-1">Günlük bulmaca</label>
                <input
                  type="number"
                  min={0}
                  value={numVal(draft.dailyPuzzleTarget)}
                  onChange={(e) => onDraftChange(activeStudent.id, {
                    dailyPuzzleTarget: e.target.value === '' ? 0 : Number(e.target.value),
                  })}
                  className="input-base w-24"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500 block mb-1">Min doğruluk %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.minPuzzleAccuracyPct ?? 60}
                  onChange={(e) => onDraftChange(activeStudent.id, {
                    minPuzzleAccuracyPct: Number(e.target.value) || 60,
                  })}
                  className="input-base w-24"
                />
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500 text-center py-8">Hedef seçerek öğrenci listesi oluşturun</p>
        )}
      </div>
    </div>
  );
};
