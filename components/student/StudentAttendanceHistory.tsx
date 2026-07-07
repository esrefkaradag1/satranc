import React, { useMemo } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Users,
  TrendingUp,
  XCircle,
  ShieldCheck,
  CalendarDays,
} from 'lucide-react';
import type { AttendanceRecord } from '../../types';
import { attendanceRecordGroupName, attendanceRecordTime } from '../../lib/attendanceSession';
import { ResponsiveTable } from '../ui/ResponsiveTable';

type Props = {
  records: AttendanceRecord[];
  fallbackGroup?: string;
  formatDateTR: (iso: string) => string;
};

const STATUS_META = {
  present: {
    label: 'Var',
    icon: CheckCircle2,
    pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35 shadow-[0_0_12px_rgba(16,185,129,0.15)]',
    dot: 'bg-emerald-400',
    row: 'hover:bg-emerald-500/[0.04]',
  },
  late: {
    label: 'Geç',
    icon: Clock,
    pill: 'bg-amber-500/15 text-amber-300 border-amber-500/35 shadow-[0_0_12px_rgba(245,158,11,0.12)]',
    dot: 'bg-amber-400',
    row: 'hover:bg-amber-500/[0.04]',
  },
  excused: {
    label: 'İzinli',
    icon: ShieldCheck,
    pill: 'bg-sky-500/15 text-sky-300 border-sky-500/35 shadow-[0_0_12px_rgba(14,165,233,0.12)]',
    dot: 'bg-sky-400',
    row: 'hover:bg-sky-500/[0.04]',
  },
  absent: {
    label: 'Yok',
    icon: XCircle,
    pill: 'bg-rose-500/10 text-rose-300/90 border-rose-500/25',
    dot: 'bg-rose-400/70',
    row: 'hover:bg-rose-500/[0.03]',
  },
} as const;

function resolveStatus(status?: string): keyof typeof STATUS_META {
  if (status === 'present' || status === 'late' || status === 'excused') return status;
  return 'absent';
}

function dateParts(iso: string, formatDateTR: (s: string) => string) {
  try {
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return { label: formatDateTR(iso), weekday: '', day: '', month: '' };
    return {
      label: formatDateTR(iso),
      weekday: d.toLocaleDateString('tr-TR', { weekday: 'long' }),
      day: d.toLocaleDateString('tr-TR', { day: '2-digit' }),
      month: d.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' }),
    };
  } catch {
    return { label: formatDateTR(iso), weekday: '', day: '', month: '' };
  }
}

export const StudentAttendanceHistory: React.FC<Props> = ({
  records,
  fallbackGroup,
  formatDateTR,
}) => {
  const stats = useMemo(() => {
    const total = records.length;
    const present = records.filter((r) => r.status === 'present').length;
    const late = records.filter((r) => r.status === 'late').length;
    const excused = records.filter((r) => r.status === 'excused').length;
    const attended = present + late;
    const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
    return { total, present, late, excused, attended, rate };
  }, [records]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-teal-500/20 bg-gradient-to-br from-teal-600/15 via-emerald-600/8 to-transparent p-6 sm:p-8">
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-6 bottom-0 w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-300 shadow-lg shadow-teal-900/20 shrink-0">
            <CalendarCheck className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-black text-white tracking-tight">Yoklama geçmişi</h2>
            <p className="text-slate-400 text-sm mt-1">Ders katılım kayıtlarınız ve devam özeti</p>
          </div>
          {stats.total > 0 && (
            <div className="shrink-0 rounded-2xl bg-black/25 border border-white/10 px-5 py-3 text-center backdrop-blur-sm">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Katılım</p>
              <p className="text-3xl font-black text-teal-300 tabular-nums">%{stats.rate}</p>
            </div>
          )}
        </div>
      </div>

      {/* Özet kartlar */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Toplam kayıt', value: stats.total, icon: CalendarDays, color: 'text-indigo-300', bg: 'from-indigo-500/10' },
            { label: 'Var', value: stats.present, icon: CheckCircle2, color: 'text-emerald-300', bg: 'from-emerald-500/10' },
            { label: 'Geç', value: stats.late, icon: Clock, color: 'text-amber-300', bg: 'from-amber-500/10' },
            { label: 'İzinli', value: stats.excused, icon: ShieldCheck, color: 'text-sky-300', bg: 'from-sky-500/10' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={`rounded-xl border border-white/[0.06] bg-gradient-to-br ${item.bg} to-transparent p-4 backdrop-blur-sm`}
              >
                <Icon className={`w-4 h-4 mb-2 ${item.color}`} />
                <p className={`text-2xl font-black tabular-nums ${item.color}`}>{item.value}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">{item.label}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Liste */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-xl shadow-xl overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-white/[0.06] flex items-center justify-between gap-3 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-400" />
            <h3 className="text-sm font-bold text-white">Son katılımlar</h3>
          </div>
          {stats.total > 0 && (
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider tabular-nums">
              {Math.min(records.length, 50)} kayıt
            </span>
          )}
        </div>

        {records.length === 0 ? (
          <div className="py-20 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center mx-auto mb-4">
              <CalendarCheck className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-300 font-semibold">Henüz yoklama kaydı yok</p>
            <p className="text-xs text-slate-500 mt-2 max-w-xs mx-auto">
              Katıldığınız dersler burada listelenecek.
            </p>
          </div>
        ) : (
          <>
            {/* Mobil: kart timeline */}
            <div className="sm:hidden divide-y divide-white/[0.04]">
              {records.slice(0, 50).map((r) => {
                const statusKey = resolveStatus(r.status);
                const meta = STATUS_META[statusKey];
                const StatusIcon = meta.icon;
                const parts = dateParts(r.date, formatDateTR);
                const time = attendanceRecordTime(r);
                const group = attendanceRecordGroupName(r, fallbackGroup);
                return (
                  <div key={r.id} className={`p-4 ${meta.row} transition-colors`}>
                    <div className="flex gap-4">
                      <div className="shrink-0 w-12 text-center">
                        <p className="text-xl font-black text-white leading-none">{parts.day}</p>
                        <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">{parts.month}</p>
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-slate-400 capitalize">{parts.weekday}</p>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${meta.pill}`}>
                            <StatusIcon className="w-3 h-3" />
                            {meta.label}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          {group}
                        </p>
                        {time !== '—' && (
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {time}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Masaüstü: tablo */}
            <div className="hidden sm:block">
              <ResponsiveTable minWidth={560}>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/[0.06] bg-black/20">
                      <th className="py-3.5 px-5 w-36">Tarih</th>
                      <th className="py-3.5 px-5 w-24">Saat</th>
                      <th className="py-3.5 px-5">Grup / Ders</th>
                      <th className="py-3.5 px-5 w-28 text-right">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {records.slice(0, 50).map((r) => {
                      const statusKey = resolveStatus(r.status);
                      const meta = STATUS_META[statusKey];
                      const StatusIcon = meta.icon;
                      const parts = dateParts(r.date, formatDateTR);
                      const time = attendanceRecordTime(r);
                      const group = attendanceRecordGroupName(r, fallbackGroup);
                      return (
                        <tr key={r.id} className={`group transition-colors ${meta.row}`}>
                          <td data-label="Tarih" className="py-4 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.06] flex flex-col items-center justify-center shrink-0 group-hover:border-teal-500/25 transition-colors">
                                <span className="text-sm font-black text-white leading-none">{parts.day}</span>
                                <span className="text-[8px] font-bold text-slate-500 uppercase mt-0.5">
                                  {parts.month.split(' ')[0]}
                                </span>
                              </div>
                              <div>
                                <p className="font-semibold text-white text-sm capitalize">{parts.weekday}</p>
                                <p className="text-[11px] text-slate-500">{parts.label}</p>
                              </div>
                            </div>
                          </td>
                          <td data-label="Saat" className="py-4 px-5">
                            {time !== '—' ? (
                              <span className="inline-flex items-center gap-1.5 text-sm text-slate-300 tabular-nums">
                                <Clock className="w-3.5 h-3.5 text-slate-500" />
                                {time}
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td data-label="Grup" className="py-4 px-5">
                            <span className="inline-flex items-center gap-2 text-sm text-slate-200 font-medium max-w-md">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                              <span className="truncate">{group}</span>
                            </span>
                          </td>
                          <td data-label="Durum" className="py-4 px-5 text-right">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${meta.pill}`}>
                              <StatusIcon className="w-3.5 h-3.5" />
                              {meta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ResponsiveTable>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
