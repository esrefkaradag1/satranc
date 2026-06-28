import React, { useMemo } from 'react';
import type { HomeworkAssignment, StudentDailyTarget } from '../../types';
import { WEEKDAY_LABELS } from '../../lib/homeworkPanelUtils';
import {
  isoDateForWeekday,
  mondayOfWeek,
  type DayCompletionStatus,
} from '../../lib/homeworkDayUtils';
import {
  evaluatePlatformDayGoalsFromStats,
  resolveDayTargets,
  type PlatformDayStats,
} from '../../lib/homeworkPlatformUtils';

type Props = {
  homework: HomeworkAssignment;
  studentTarget?: StudentDailyTarget;
  todayKey: string;
  weekStatsByDate: Record<string, PlatformDayStats | undefined>;
  loading?: boolean;
};

function completionStyles(status: DayCompletionStatus): string {
  switch (status) {
    case 'done':
      return 'border-emerald-500/45 bg-emerald-500/10';
    case 'missed':
      return 'border-rose-500/45 bg-rose-500/10';
    case 'pending':
      return 'border-amber-500/40 bg-amber-500/5';
    default:
      return 'border-white/5 bg-black/20';
  }
}

function completionLabel(status: DayCompletionStatus): string {
  switch (status) {
    case 'done':
      return 'Tamam';
    case 'missed':
      return 'Eksik';
    case 'pending':
      return 'Bekliyor';
    default:
      return '—';
  }
}

function formatDayDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
}

export function computeStudentWeeklySummary(
  homework: HomeworkAssignment,
  studentTarget: StudentDailyTarget | undefined,
  todayKey: string,
  weekStatsByDate: Record<string, PlatformDayStats | undefined>,
): { completedDays: number; dueDays: number; totalScheduledDays: number; progressPct: number } {
  const monday = mondayOfWeek(new Date(`${todayKey}T12:00:00`));
  let completedDays = 0;
  let dueDays = 0;
  let totalScheduledDays = 0;

  for (let day = 1; day <= 7; day++) {
    const iso = isoDateForWeekday(monday, day);
    const { gameTarget, puzzleTarget, minAccuracy } = resolveDayTargets(studentTarget, homework, day);
    if (gameTarget <= 0 && puzzleTarget <= 0) continue;
    totalScheduledDays++;
    if (iso > todayKey) continue;
    dueDays++;
    const evalResult = evaluatePlatformDayGoalsFromStats(
      gameTarget,
      puzzleTarget,
      minAccuracy,
      weekStatsByDate[iso],
    );
    if (evalResult.done) completedDays++;
  }

  const progressPct = dueDays > 0 ? Math.round((completedDays / dueDays) * 100) : 0;
  return { completedDays, dueDays, totalScheduledDays, progressPct };
}

export const StudentWeeklyHomeworkGrid: React.FC<Props> = ({
  homework,
  studentTarget,
  todayKey,
  weekStatsByDate,
  loading = false,
}) => {
  const monday = useMemo(() => mondayOfWeek(new Date(`${todayKey}T12:00:00`)), [todayKey]);

  const days = useMemo(() => {
    const rows: Array<{
      day: number;
      label: string;
      iso: string;
      dateLabel: string;
      gameTarget: number;
      puzzleTarget: number;
      games: number;
      puzzles: number;
      status: DayCompletionStatus;
      isToday: boolean;
    }> = [];

    for (let day = 1; day <= 7; day++) {
      const iso = isoDateForWeekday(monday, day);
      const { gameTarget, puzzleTarget, minAccuracy } = resolveDayTargets(studentTarget, homework, day);
      if (gameTarget <= 0 && puzzleTarget <= 0) continue;

      const platform = weekStatsByDate[iso];
      const evalResult = evaluatePlatformDayGoalsFromStats(gameTarget, puzzleTarget, minAccuracy, platform);
      const isFuture = iso > todayKey;
      let status: DayCompletionStatus = 'pending';
      if (isFuture) status = 'pending';
      else if (evalResult.done) status = 'done';
      else if (iso === todayKey) status = 'pending';
      else status = 'missed';

      rows.push({
        day,
        label: WEEKDAY_LABELS[day - 1],
        iso,
        dateLabel: formatDayDate(iso),
        gameTarget,
        puzzleTarget,
        games: evalResult.games,
        puzzles: evalResult.puzzleSolved,
        status,
        isToday: iso === todayKey,
      });
    }
    return rows;
  }, [homework, studentTarget, monday, todayKey, weekStatsByDate]);

  if (days.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Haftalık program</p>
        {loading ? <span className="text-[10px] text-indigo-300">Güncelleniyor…</span> : null}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {days.map((row) => (
          <div
            key={row.iso}
            className={`rounded-xl border p-2.5 min-h-[88px] flex flex-col gap-1.5 ${completionStyles(row.status)} ${
              row.isToday ? 'ring-2 ring-indigo-500/40' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-black text-white">{row.label}</span>
              <span className="text-[9px] text-slate-400 tabular-nums">{row.dateLabel}</span>
            </div>
            {row.gameTarget > 0 ? (
              <p className="text-[10px] text-slate-300">
                Maç <span className="font-bold text-white tabular-nums">{Math.min(row.games, row.gameTarget)}/{row.gameTarget}</span>
              </p>
            ) : null}
            {row.puzzleTarget > 0 ? (
              <p className="text-[10px] text-slate-300">
                Bulmaca <span className="font-bold text-white tabular-nums">{Math.min(row.puzzles, row.puzzleTarget)}/{row.puzzleTarget}</span>
              </p>
            ) : null}
            <span className={`mt-auto text-[9px] font-bold uppercase ${
              row.status === 'done' ? 'text-emerald-400'
                : row.status === 'missed' ? 'text-rose-400'
                  : 'text-amber-300'
            }`}>
              {row.isToday && row.status === 'pending' ? 'Bugün' : completionLabel(row.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
