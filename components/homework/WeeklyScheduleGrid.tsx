import React, { useMemo } from 'react';
import { Calendar, Copy, RefreshCw, Save, Users } from 'lucide-react';
import type { Student, StudentDailyTarget } from '../../types';
import { PROGRAM_BULK_EDIT_ID, WEEKDAY_LABELS } from '../../lib/homeworkPanelUtils';

import type { DayCompletionStatus } from '../../lib/homeworkDayUtils';

type DayPatch = Partial<NonNullable<StudentDailyTarget['weeklySchedule']>[number]>;

type Props = {
  students: Student[];
  drafts: Record<string, StudentDailyTarget>;
  onDraftChange: (studentId: string, patch: Partial<StudentDailyTarget>) => void;
  onDayChange: (studentId: string, day: number, patch: DayPatch) => void;
  onBulkDraftChange?: (patch: Partial<StudentDailyTarget>) => void;
  onBulkDayChange?: (day: number, patch: DayPatch) => void;
  onCopyToAll?: (sourceStudentId: string) => void;
  onSave: () => void;
  onRefreshPlatform?: () => void;
  loadingPlatform?: boolean;
  selectedStudentId?: string | null;
  onSelectStudent?: (id: string | null) => void;
  dayCompletion?: Record<number, DayCompletionStatus>;
  dayProgress?: Record<number, { games: number; gameTarget: number; puzzles: number; puzzleTarget: number; syncNote?: string | null }>;
  homeworkTitle?: string;
  autoSelectedHomework?: boolean;
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

function bulkTemplateDraft(
  students: Student[],
  drafts: Record<string, StudentDailyTarget>,
): StudentDailyTarget {
  const first = students[0];
  if (!first) return {};
  const base = drafts[first.id] ?? {};
  if (students.length <= 1) return base;

  const allSame = (getter: (d: StudentDailyTarget) => number | undefined) => {
    const values = students.map((s) => getter(drafts[s.id] ?? {}));
    const firstVal = values[0];
    return values.every((v) => v === firstVal) ? firstVal : undefined;
  };

  return {
    dailyGameTarget: allSame((d) => d.dailyGameTarget),
    dailyPuzzleTarget: allSame((d) => d.dailyPuzzleTarget),
    minPuzzleAccuracyPct: allSame((d) => d.minPuzzleAccuracyPct) ?? base.minPuzzleAccuracyPct ?? 60,
    weeklySchedule: base.weeklySchedule ? { ...base.weeklySchedule } : undefined,
  };
}

export const WeeklyScheduleGrid: React.FC<Props> = ({
  students,
  drafts,
  onDraftChange,
  onDayChange,
  onBulkDraftChange,
  onBulkDayChange,
  onCopyToAll,
  onSave,
  onRefreshPlatform,
  loadingPlatform = false,
  selectedStudentId,
  onSelectStudent,
  dayCompletion,
  dayProgress,
  homeworkTitle,
  autoSelectedHomework = false,
}) => {
  const showBulkTab = students.length > 1;
  const resolvedId = selectedStudentId ?? (showBulkTab ? PROGRAM_BULK_EDIT_ID : students[0]?.id ?? null);
  const isBulk = resolvedId === PROGRAM_BULK_EDIT_ID;
  const activeStudent = !isBulk ? students.find((s) => s.id === resolvedId) : undefined;
  const draft = useMemo(() => {
    if (isBulk) return bulkTemplateDraft(students, drafts);
    return resolvedId ? drafts[resolvedId] ?? {} : {};
  }, [isBulk, students, drafts, resolvedId]);

  const applyDraft = (patch: Partial<StudentDailyTarget>) => {
    if (isBulk && onBulkDraftChange) {
      onBulkDraftChange(patch);
      return;
    }
    if (activeStudent) onDraftChange(activeStudent.id, patch);
  };

  const applyDay = (day: number, patch: DayPatch) => {
    if (isBulk && onBulkDayChange) {
      onBulkDayChange(day, patch);
      return;
    }
    if (activeStudent) onDayChange(activeStudent.id, day, patch);
  };

  return (
    <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
      <div className="p-5 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-violet-400" />
          <div>
            <h3 className="text-sm font-black text-white">Günlük Program</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Pazartesi–Pazar · maç ve bulmaca hedefi
              {homeworkTitle ? (
                <>
                  <span className="text-slate-600"> · </span>
                  <span className="text-indigo-300/90">{homeworkTitle}</span>
                  {autoSelectedHomework ? <span className="text-amber-400/90"> (otomatik seçildi)</span> : null}
                </>
              ) : null}
              <span className="text-slate-600"> · </span>
              <span className="text-slate-500">Platform: butonla çekilir, 10 dk aralıkla güncellenir</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onRefreshPlatform ? (
            <button
              type="button"
              onClick={onRefreshPlatform}
              disabled={loadingPlatform}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-slate-300 text-xs font-bold hover:bg-slate-700 disabled:opacity-60"
              title="Lichess ve Chess.com verilerini çek (sonra 10 dk'da bir güncellenir)"
            >
              <RefreshCw className={`w-4 h-4 ${loadingPlatform ? 'animate-spin' : ''}`} />
              Platform
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            className="flex items-center gap-2 px-4 py-2 rounded-xl premium-gradient text-white text-xs font-bold shadow-lg shadow-indigo-500/20"
          >
            <Save className="w-4 h-4" /> Kaydet
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {showBulkTab ? (
            <button
              type="button"
              onClick={() => onSelectStudent?.(PROGRAM_BULK_EDIT_ID)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                isBulk
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Tüm Grup ({students.length})
            </button>
          ) : null}
          {students.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectStudent?.(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !isBulk && resolvedId === s.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {s.name.split(' ')[0]}
            </button>
          ))}
        </div>

        {isBulk || activeStudent ? (
          <>
            {isBulk ? (
              <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-3">
                <p className="text-sm font-bold text-violet-200">
                  Toplu düzenleme — {students.length} öğrenci
                </p>
                <p className="text-[10px] text-violet-300/80 mt-1">
                  Buradaki değişiklikler listedeki tüm öğrencilere uygulanır. Sol panelden şube / grup seçerek kapsamı daraltabilirsiniz.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm font-bold text-white">{activeStudent!.name}</p>
                <p className="text-[10px] text-slate-500">
                  İlerleme: Lichess {activeStudent!.lichessUsername ? `@${activeStudent!.lichessUsername}` : '—'}
                  {' · '}
                  Chess.com {activeStudent!.chessComUsername ? `@${activeStudent!.chessComUsername}` : '—'}
                </p>
                {onCopyToAll && showBulkTab ? (
                  <button
                    type="button"
                    onClick={() => onCopyToAll(activeStudent!.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-[10px] font-bold text-slate-300 hover:text-white"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Bu öğrencinin hedeflerini tüm gruba kopyala
                  </button>
                ) : null}
              </>
            )}

            {!isBulk && Object.values(dayProgress ?? {}).some((p) => p.syncNote) ? (
              <p className="text-[10px] text-amber-400/90">
                {Object.values(dayProgress ?? {}).find((p) => p.syncNote)?.syncNote}
              </p>
            ) : null}

            {!isBulk ? (
              <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Tamam</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Bekliyor</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Eksik</span>
              </div>
            ) : null}

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                const dayData = draft.weeklySchedule?.[day] ?? {};
                const isToday = (() => {
                  const d = new Date().getDay();
                  return (d === 0 ? 7 : d) === day;
                })();
                const completion = isBulk ? undefined : dayCompletion?.[day];
                const completionText = completionLabel(completion);
                const progress = isBulk ? undefined : dayProgress?.[day];
                return (
                  <div
                    key={day}
                    className={`rounded-xl p-3 space-y-2 border ${
                      isToday ? 'ring-1 ring-indigo-500/40' : ''
                    } ${isBulk ? 'border-violet-500/20 bg-violet-500/5' : completionStyles(completion)}`}
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
                        onChange={(e) => applyDay(day, {
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
                        onChange={(e) => applyDay(day, {
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
                        onChange={(e) => applyDay(day, {
                          minPuzzleAccuracyPct: e.target.value === '' ? undefined : Number(e.target.value),
                        })}
                        className="input-base w-full text-xs py-1.5"
                      />
                    </div>
                    {progress && (progress.gameTarget > 0 || progress.puzzleTarget > 0) ? (
                      <div className="pt-1 space-y-0.5 text-[9px] font-bold">
                        {progress.gameTarget > 0 ? (
                          <p className={progress.games >= progress.gameTarget ? 'text-emerald-400' : 'text-rose-400'}>
                            Maç {progress.games}/{progress.gameTarget}
                          </p>
                        ) : null}
                        {progress.puzzleTarget > 0 ? (
                          <p className={progress.puzzles >= progress.puzzleTarget ? 'text-emerald-400' : 'text-rose-400'}>
                            Bulmaca {progress.puzzles}/{progress.puzzleTarget}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl bg-black/20 border border-white/5">
              <p className="text-[10px] text-slate-500 font-bold uppercase w-full">
                {isBulk ? 'Grup varsayılanı (tüm günler)' : 'Varsayılan (tüm günler)'}
              </p>
              <div>
                <label className="text-[9px] text-slate-500 block mb-1">Günlük maç</label>
                <input
                  type="number"
                  min={0}
                  value={numVal(draft.dailyGameTarget)}
                  onChange={(e) => applyDraft({
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
                  onChange={(e) => applyDraft({
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
                  onChange={(e) => applyDraft({
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
