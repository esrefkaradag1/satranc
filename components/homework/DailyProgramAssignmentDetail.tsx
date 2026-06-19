import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Users, Percent, Trophy, Calendar, RefreshCw, ChevronDown, ChevronUp, Target,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { HomeworkAssignment, Student, StudentDailyTarget } from '../../types';
import type { PlatformStudentStat } from '../../lib/homeworkStatsBuilders';
import { platformSummaryFromStats } from '../../lib/homeworkStatsBuilders';
import {
  getHomeworkBranchLabel,
  getHomeworkGroupLabel,
  homeworkEndDateLabel,
  homeworkStatusLabel,
} from '../../lib/homeworkAnalysisUtils';
import { PlatformGroupResultsTable } from './PlatformGroupResultsTable';
import { WeeklyScheduleGrid } from './WeeklyScheduleGrid';
import { isToday, shiftDayKey, todayDayKey } from '../../lib/homeworkDayUtils';
import type { DayCompletionStatus } from '../../lib/homeworkDayUtils';

type Props = {
  homework: HomeworkAssignment;
  students: Student[];
  stats: PlatformStudentStat[];
  viewDate: string;
  onViewDateChange: (date: string) => void;
  onBack: () => void;
  onSelectStudent: (stat: PlatformStudentStat) => void;
  onRefreshPlatform: () => void;
  loadingPlatform: boolean;
  scheduleStudents: Student[];
  drafts: Record<string, StudentDailyTarget>;
  onDraftChange: (studentId: string, patch: Partial<StudentDailyTarget>) => void;
  onDayChange: (studentId: string, day: number, patch: Partial<NonNullable<StudentDailyTarget['weeklySchedule']>[number]>) => void;
  onBulkDraftChange?: (patch: Partial<StudentDailyTarget>) => void;
  onBulkDayChange?: (day: number, patch: Partial<NonNullable<StudentDailyTarget['weeklySchedule']>[number]>) => void;
  onCopyToAll?: (sourceStudentId: string) => void;
  onSaveSchedule: () => void;
  selectedStudentId?: string | null;
  onSelectScheduleStudent?: (id: string | null) => void;
  dayCompletion?: Record<number, DayCompletionStatus>;
  dayProgress?: Record<number, { games: number; gameTarget: number; puzzles: number; puzzleTarget: number; syncNote?: string | null }>;
};

export const DailyProgramAssignmentDetail: React.FC<Props> = ({
  homework,
  students,
  stats,
  viewDate,
  onViewDateChange,
  onBack,
  onSelectStudent,
  onRefreshPlatform,
  loadingPlatform,
  scheduleStudents,
  drafts,
  onDraftChange,
  onDayChange,
  onBulkDraftChange,
  onBulkDayChange,
  onCopyToAll,
  onSaveSchedule,
  selectedStudentId,
  onSelectScheduleStudent,
  dayCompletion,
  dayProgress,
}) => {
  const [showSchedule, setShowSchedule] = useState(false);
  const scheduleSectionRef = useRef<HTMLDivElement>(null);

  const openWeeklySchedule = () => {
    setShowSchedule(true);
    window.setTimeout(() => {
      scheduleSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };
  const summary = useMemo(() => platformSummaryFromStats(stats), [stats]);
  const sortedStats = useMemo(
    () => [...stats].sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name, 'tr')),
    [stats],
  );
  const status = homeworkStatusLabel(homework);
  const groupLabel = getHomeworkGroupLabel(homework, students);
  const dateLabel = new Date(`${viewDate}T12:00:00`).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const today = todayDayKey();
  const minDate = homework.startDate?.slice(0, 10) || undefined;
  const canGoPrev = !minDate || viewDate > minDate;
  const canGoNext = viewDate < today;

  const goPrevDay = () => {
    if (!canGoPrev) return;
    const next = shiftDayKey(viewDate, -1);
    if (minDate && next < minDate) {
      onViewDateChange(minDate);
      return;
    }
    onViewDateChange(next);
  };

  const goNextDay = () => {
    if (!canGoNext) return;
    onViewDateChange(shiftDayKey(viewDate, 1));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Program Listesine Dön
        </button>
        <button
          type="button"
          onClick={onRefreshPlatform}
          disabled={loadingPlatform}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-white/10 text-slate-200 hover:bg-slate-700 text-sm font-bold transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loadingPlatform ? 'animate-spin' : ''}`} />
          Platform Çek
        </button>
        <button
          type="button"
          onClick={openWeeklySchedule}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600/25 border border-indigo-500/35 text-indigo-200 hover:bg-indigo-600/40 text-sm font-bold transition-colors"
        >
          <Target className="w-4 h-4" />
          Haftalık Hedef Düzenle
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#1a2332]/80 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Calendar className="w-4 h-4 text-violet-400 shrink-0" />
          <span className="font-bold text-slate-300">Gün seçimi</span>
          {!isToday(viewDate) ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-bold uppercase">
              Geçmiş
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold uppercase">
              Bugün
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={goPrevDay}
            disabled={!canGoPrev}
            className="p-2 rounded-lg bg-slate-800 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Önceki gün"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            value={viewDate}
            min={minDate}
            max={today}
            onChange={(e) => onViewDateChange(e.target.value || today)}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm font-semibold [color-scheme:dark]"
          />
          <button
            type="button"
            onClick={goNextDay}
            disabled={!canGoNext}
            className="p-2 rounded-lg bg-slate-800 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Sonraki gün"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isToday(viewDate) ? (
            <button
              type="button"
              onClick={() => onViewDateChange(today)}
              className="px-3 py-2 rounded-lg text-xs font-bold text-violet-300 hover:text-violet-200 hover:bg-violet-500/10"
            >
              Bugüne dön
            </button>
          ) : null}
        </div>
        <p className="text-[10px] text-slate-500 w-full sm:w-auto sm:ml-auto">
          Geçmiş günler için tarih seçin; tablo o güne göre güncellenir. Gerekirse Platform Çek ile veriyi yenileyin.
        </p>
      </div>

      <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-600/20 via-indigo-600/10 to-transparent p-5 sm:p-6">
        <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
          <Calendar className="w-6 h-6 text-violet-300" />
          {homework.title}
        </h3>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-xs text-slate-300">
          <p><span className="text-slate-500">Şube:</span> {getHomeworkBranchLabel(homework, students)}</p>
          <p><span className="text-slate-500">Grup:</span> {groupLabel}</p>
          <p><span className="text-slate-500">Öğrenci:</span> {stats.length} kişi</p>
          <p><span className="text-slate-500">Gün:</span> {dateLabel}</p>
          <p><span className="text-slate-500">Bitiş:</span> {homeworkEndDateLabel(homework)}</p>
          <p>
            <span className="text-slate-500">Durum:</span>{' '}
            <span className={`font-bold ${status === 'Aktif' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {status}
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Katılım', value: `${summary.activeCount}/${summary.studentCount}`, icon: Users, color: 'text-sky-300' },
          { label: 'Ort. Tamamlanma', value: `%${summary.avgCompletion}`, icon: Percent, color: 'text-amber-300' },
          { label: 'Tamamlayan', value: `${summary.completed}/${summary.studentCount}`, icon: Trophy, color: 'text-violet-300' },
          { label: 'Hedefli Öğrenci', value: summary.studentCount, icon: Target, color: 'text-indigo-300' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-xl border border-white/[0.08] bg-[#1a2332]/80 p-4 text-center">
              <Icon className={`w-5 h-5 mx-auto mb-2 ${item.color}`} />
              <p className={`text-2xl font-black ${item.color}`}>{item.value}</p>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{item.label}</p>
            </div>
          );
        })}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-400" />
            Öğrenci Sonuçları
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {groupLabel} · Lichess & Chess.com
            </span>
          </h4>
        </div>
        <PlatformGroupResultsTable
          stats={sortedStats}
          homeworkTitle={homework.title}
          viewDate={viewDate}
          onSelect={onSelectStudent}
        />
      </div>

      <div
        ref={scheduleSectionRef}
        className="rounded-xl border border-white/[0.08] bg-[#1a2332]/60 overflow-hidden scroll-mt-4"
      >
        <button
          type="button"
          onClick={() => setShowSchedule((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
        >
          <span className="text-sm font-bold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-violet-400" />
            Haftalık Hedef Düzenle
          </span>
          {showSchedule ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showSchedule ? (
          <div className="border-t border-white/[0.06] p-1">
            <WeeklyScheduleGrid
              students={scheduleStudents}
              drafts={drafts}
              onDraftChange={onDraftChange}
              onDayChange={onDayChange}
              onBulkDraftChange={onBulkDraftChange}
              onBulkDayChange={onBulkDayChange}
              onCopyToAll={onCopyToAll}
              onSave={onSaveSchedule}
              onRefreshPlatform={onRefreshPlatform}
              loadingPlatform={loadingPlatform}
              selectedStudentId={selectedStudentId}
              onSelectStudent={onSelectScheduleStudent}
              dayCompletion={dayCompletion}
              dayProgress={dayProgress}
              homeworkTitle={homework.title}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};
