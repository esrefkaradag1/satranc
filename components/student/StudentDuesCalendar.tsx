import React, { useMemo } from 'react';
import { Calendar, GraduationCap } from 'lucide-react';
import type { DisciplineBranch, Student, TrainingGroup } from '../../types';
import {
  MONTHS_TR,
  computeDuesFinanceSummary,
  getDuesMonthCell,
} from '../../lib/duesCalendarUtils';

type PrivateLessonSummary = {
  packageName: string;
  branchOffice: string;
  discipline: string;
  totalLessons?: number;
  usedLessons: number;
  remainingLessons?: number;
  attendanceUsedLessons: number;
  startingUsedLessons: number;
  saleDate: string;
};

type Props = {
  student: Student;
  calendarYear: number;
  duesByMonth: Record<number, number>;
  trainingGroups: TrainingGroup[];
  disciplineBranches: DisciplineBranch[];
  privateLessonSummary?: PrivateLessonSummary | null;
  formatDateTR?: (iso?: string) => string;
};

export const StudentDuesCalendar: React.FC<Props> = ({
  student,
  calendarYear,
  duesByMonth,
  trainingGroups,
  disciplineBranches,
  privateLessonSummary,
  formatDateTR,
}) => {
  const fmt = formatDateTR ?? ((iso?: string) => {
    if (!iso?.trim()) return '—';
    try {
      return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return iso;
    }
  });

  const finance = useMemo(
    () => computeDuesFinanceSummary(student, calendarYear, duesByMonth, trainingGroups, disciplineBranches),
    [student, calendarYear, duesByMonth, trainingGroups, disciplineBranches],
  );

  const isPackageRegistration = student.registrationType === 'package';
  const showAidatCalendar = !isPackageRegistration;

  return (
    <div className="rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] overflow-hidden shadow-xl">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white">
              {showAidatCalendar ? 'Aidat Takvimi' : 'Özel Ders Özeti'}
            </div>
            <div className="text-[10px] text-slate-500">
              {showAidatCalendar
                ? `${calendarYear} · ${student.isScholarshipStudent ? 'Burslu' : 'Aylık Aidat'}`
                : `${calendarYear} · Ders Paketi`}
            </div>
          </div>
        </div>
      </div>

      {showAidatCalendar && !student.isScholarshipStudent ? (
        <div className="px-4 sm:px-6 py-4 border-b border-white/[0.06] grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl bg-slate-900/50 border border-slate-700/50 p-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Bu yıl ödenen</p>
            <p className="mt-1 text-lg font-black text-emerald-400">₺{finance.totalPaidThisYear.toLocaleString('tr-TR')}</p>
          </div>
          <div className="rounded-xl bg-slate-900/50 border border-slate-700/50 p-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kalan borç</p>
            <p className={`mt-1 text-lg font-black ${finance.activeDuesDebt > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              ₺{finance.activeDuesDebt.toLocaleString('tr-TR')}
            </p>
          </div>
          <div className="rounded-xl bg-slate-900/50 border border-slate-700/50 p-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ödenen ay</p>
            <p className="mt-1 text-lg font-black text-white">{finance.paidMonths}</p>
          </div>
          <div className="rounded-xl bg-slate-900/50 border border-slate-700/50 p-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ödenmedi / Bekliyor</p>
            <p className="mt-1 text-lg font-black text-white">
              {finance.unpaidMonths} / {finance.waitingMonths}
            </p>
          </div>
        </div>
      ) : null}

      {showAidatCalendar ? (
        <div className="p-3 sm:p-6 grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
          {MONTHS_TR.map((_, idx) => {
            const monthNum = idx + 1;
            const paid = duesByMonth[monthNum] ?? 0;
            const cell = getDuesMonthCell(student, calendarYear, monthNum, paid, trainingGroups, disciplineBranches);
            return (
              <div key={cell.monthLabel} className={`rounded-lg border p-2.5 sm:p-4 ${cell.tone}`}>
                <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">{cell.monthLabel}</div>
                <div className="mt-1 sm:mt-2 text-center">
                  {cell.inactive ? (
                    <div className="text-sm sm:text-lg font-black text-slate-600">—</div>
                  ) : cell.amountLabel === 'Burslu' ? (
                    <div className="text-sm sm:text-lg font-black text-emerald-300">Burslu</div>
                  ) : (
                    <div className="text-sm sm:text-lg font-black text-white">{cell.amountLabel}</div>
                  )}
                </div>
                <div className={`mt-1 text-center text-xs font-black uppercase tracking-wide ${cell.stateColor}`}>{cell.state}</div>
                {cell.paidLabel ? (
                  <div className="mt-1 text-center text-[10px] text-slate-500">{cell.paidLabel}</div>
                ) : null}
                {cell.remainingLabel ? (
                  <div className="mt-1 text-center text-[10px] text-rose-300/90">{cell.remainingLabel}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-3 sm:p-6">
          {privateLessonSummary ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/5 px-4 py-3">
                <div className="text-sm font-bold text-white">{privateLessonSummary.packageName}</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {[privateLessonSummary.branchOffice, privateLessonSummary.discipline].filter(Boolean).join(' · ') || 'Özel ders paketi'}
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
                <div className="rounded-lg border border-white/[0.06] bg-slate-900/40 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Toplam Ders</div>
                  <div className="mt-2 text-xl font-black text-white">{privateLessonSummary.totalLessons ?? '—'}</div>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-amber-200/80">Kullanılan</div>
                  <div className="mt-2 text-xl font-black text-amber-200">{privateLessonSummary.usedLessons}</div>
                </div>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-200/80">Kalan</div>
                  <div className="mt-2 text-xl font-black text-emerald-200">{privateLessonSummary.remainingLessons ?? '—'}</div>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-slate-900/40 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Satış Tarihi</div>
                  <div className="mt-2 text-base font-black text-white">{fmt(privateLessonSummary.saleDate)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] py-12 text-center">
              <GraduationCap className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">Henüz özel ders satışı bulunamadı.</p>
            </div>
          )}
        </div>
      )}

      {showAidatCalendar ? (
        <div className="px-4 sm:px-6 py-3 border-t border-white/[0.06] bg-white/[0.02]">
          <p className="text-xs text-slate-400">{finance.paidMonthsSummary}</p>
        </div>
      ) : null}
    </div>
  );
};
