import React, { useMemo } from 'react';
import { CalendarCheck, ChevronRight, GraduationCap, Wallet } from 'lucide-react';
import type { AttendanceRecord, Transaction } from '../../types';
import { attendanceRecordGroupName, attendanceRecordTime } from '../../lib/attendanceSession';

export type PrivateLessonSummary = {
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

type UsageInfo = {
  totalLessons?: number;
  usedLessons: number;
  attendanceUsedLessons: number;
  startingUsedLessons: number;
  remainingLessons?: number;
};

type Props = {
  studentName: string;
  summary: PrivateLessonSummary | null;
  transactions: Transaction[];
  usageById: Map<string, UsageInfo>;
  attendanceRecords: AttendanceRecord[];
  formatDateTR: (iso?: string) => string;
  onOpenPayments?: () => void;
};

function statusLabel(status: AttendanceRecord['status']): string {
  if (status === 'present') return 'Katıldı';
  if (status === 'late') return 'Geç';
  if (status === 'absent') return 'Yok';
  if (status === 'excused') return 'İzinli';
  return status;
}

export const StudentPrivateLessonPanel: React.FC<Props> = ({
  studentName,
  summary,
  transactions,
  usageById,
  attendanceRecords,
  formatDateTR,
  onOpenPayments,
}) => {
  const lessonAttendances = useMemo(
    () =>
      [...attendanceRecords]
        .filter((r) => r.attendanceType === 'lesson' || Boolean(r.lessonId))
        .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [attendanceRecords],
  );

  if (!summary && transactions.length === 0) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="rounded-2xl bg-gradient-to-br from-amber-600/10 via-slate-900/50 to-slate-900/50 border border-amber-600/20 p-6 sm:p-8">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-amber-400" />
            Özel Ders
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            {studentName} için tanımlı aktif özel ders paketi bulunmuyor.
          </p>
        </div>
        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/30 py-16 text-center">
          <GraduationCap className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Henüz özel ders kaydı yok</p>
          <p className="text-slate-500 text-sm mt-1 max-w-md mx-auto">
            Özel ders paketi satın alındığında kalan ders hakkı ve yoklama geçmişi burada görünecektir.
          </p>
        </div>
      </div>
    );
  }

  const remaining = summary?.remainingLessons;
  const lowBalance = remaining != null && remaining <= 1;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="rounded-2xl bg-gradient-to-br from-amber-600/15 via-orange-600/5 to-slate-900/50 border border-amber-600/25 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold text-amber-300/90 uppercase tracking-wider mb-1">Özel ders paketi</p>
            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-amber-400 shrink-0" />
              <span className="truncate">{summary?.packageName ?? 'Özel Ders'}</span>
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {[summary?.branchOffice, summary?.discipline].filter(Boolean).join(' · ') || '—'}
              {summary?.saleDate ? ` · Satış: ${formatDateTR(summary.saleDate)}` : ''}
            </p>
          </div>
          {onOpenPayments ? (
            <button
              type="button"
              onClick={onOpenPayments}
              className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-100 hover:bg-amber-500/15 transition-colors"
            >
              <Wallet className="w-4 h-4" />
              Ödeme kayıtları
            </button>
          ) : null}
        </div>

        {summary ? (
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Toplam ders</p>
              <p className="mt-1 text-2xl font-black text-white tabular-nums">{summary.totalLessons ?? '—'}</p>
            </div>
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-4">
              <p className="text-[10px] font-bold text-amber-200/80 uppercase tracking-wider">Kullanılan</p>
              <p className="mt-1 text-2xl font-black text-amber-200 tabular-nums">{summary.usedLessons}</p>
            </div>
            <div className={`rounded-xl p-4 border ${lowBalance ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/25'}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wider ${lowBalance ? 'text-rose-200/90' : 'text-emerald-200/80'}`}>
                Kalan ders
              </p>
              <p className={`mt-1 text-2xl font-black tabular-nums ${lowBalance ? 'text-rose-200' : 'text-emerald-200'}`}>
                {summary.remainingLessons ?? '—'}
              </p>
              {lowBalance ? (
                <p className="text-[10px] text-rose-300/90 mt-1 font-medium">Paket tükenmek üzere</p>
              ) : null}
            </div>
            <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kullanım detayı</p>
              <p className="mt-1 text-sm font-bold text-white">
                Yoklama {summary.attendanceUsedLessons}
                <span className="text-slate-500 font-medium"> · Elle {summary.startingUsedLessons}</span>
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {transactions.length > 1 ? (
        <div className="rounded-2xl bg-slate-800/40 border border-white/[0.06] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/60">
            <h3 className="text-sm font-black text-white">Tüm paketler</h3>
            <p className="text-xs text-slate-500 mt-0.5">Satın alınan özel ders paketleri</p>
          </div>
          <div className="divide-y divide-white/5">
            {transactions.map((t) => {
              const usage = usageById.get(t.id);
              const name = String(t.lessonPackageName ?? t.description ?? 'Özel Ders').trim();
              return (
                <div key={t.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatDateTR(t.date)}
                      {[t.lessonBranchOffice, t.lessonDiscipline].filter(Boolean).length > 0
                        ? ` · ${[t.lessonBranchOffice, t.lessonDiscipline].filter(Boolean).join(' · ')}`
                        : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-emerald-300 tabular-nums">
                      Kalan {usage?.remainingLessons ?? '—'}/{usage?.totalLessons ?? t.lessonCount ?? '—'}
                    </p>
                    <p className="text-[10px] text-slate-500">₺{(t.amount ?? 0).toLocaleString('tr-TR')}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl bg-slate-800/40 border border-white/[0.06] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/60 flex items-center gap-2">
          <CalendarCheck className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="text-sm font-black text-white">Özel ders yoklaması</h3>
            <p className="text-xs text-slate-500">Derse katılım kayıtları</p>
          </div>
        </div>
        {lessonAttendances.length === 0 ? (
          <div className="py-12 text-center px-4">
            <CalendarCheck className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">Henüz özel ders yoklaması yok.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5 max-h-[420px] overflow-y-auto custom-scrollbar">
            {lessonAttendances.slice(0, 40).map((record) => (
              <div key={record.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{formatDateTR(record.date)}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {attendanceRecordGroupName(record) || record.lessonSummary || 'Özel ders'}
                    {attendanceRecordTime(record) ? ` · ${attendanceRecordTime(record)}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${
                    record.status === 'present' || record.status === 'late'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : record.status === 'excused'
                        ? 'bg-sky-500/15 text-sky-300'
                        : 'bg-rose-500/15 text-rose-300'
                  }`}
                >
                  {statusLabel(record.status)}
                </span>
              </div>
            ))}
          </div>
        )}
        {lessonAttendances.length > 40 ? (
          <p className="px-5 py-3 text-[10px] text-slate-500 border-t border-white/5">
            Son 40 kayıt gösteriliyor.
          </p>
        ) : null}
      </div>

      {onOpenPayments ? (
        <button
          type="button"
          onClick={onOpenPayments}
          className="w-full flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-slate-800/40 hover:bg-slate-800/60 px-5 py-4 text-left transition-colors"
        >
          <div>
            <p className="text-sm font-bold text-white">Ödeme ve fatura geçmişi</p>
            <p className="text-xs text-slate-500 mt-0.5">Tüm özel ders ödemelerini görüntüle</p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-500 shrink-0" />
        </button>
      ) : null}
    </div>
  );
};
