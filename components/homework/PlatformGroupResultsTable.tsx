import React from 'react';
import { CheckCircle2, CircleDashed, Play, Clock, ChevronRight } from 'lucide-react';
import type { PlatformStudentStat } from '../../lib/homeworkStatsBuilders';
import { formatHomeworkDuration } from '../../lib/homeworkAnalysisUtils';

const STATUS_ICON = {
  Tamamlandı: CheckCircle2,
  'Devam Ediyor': Play,
  Başlamadı: CircleDashed,
} as const;

type Props = {
  stats: PlatformStudentStat[];
  homeworkTitle: string;
  viewDate: string;
  onSelect: (stat: PlatformStudentStat) => void;
};

export const PlatformGroupResultsTable: React.FC<Props> = ({
  stats,
  homeworkTitle,
  viewDate,
  onSelect,
}) => {
  const sorted = [...stats].sort((a, b) => {
    if (a.status === 'Başlamadı' && b.status !== 'Başlamadı') return 1;
    if (b.status === 'Başlamadı' && a.status !== 'Başlamadı') return -1;
    return b.correct - a.correct || a.name.localeCompare(b.name, 'tr');
  });
  const totalCorrect = stats.reduce((s, x) => s + x.correct, 0);
  const totalWrong = stats.reduce((s, x) => s + x.wrong, 0);
  const completed = stats.filter((s) => s.status === 'Tamamlandı').length;
  const dateLabel = new Date(`${viewDate}T12:00:00`).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] overflow-hidden">
      <div className="px-4 py-3 border-b border-violet-500/15 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold text-violet-300/80 uppercase tracking-wider">Platform sonuçları</p>
          <p className="text-sm font-bold text-white truncate">{homeworkTitle} · {dateLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold tabular-nums">
          <span className="text-emerald-400">{totalCorrect} doğru</span>
          <span className="text-rose-400">{totalWrong} yanlış</span>
          <span className="text-slate-500">{stats.length} öğrenci</span>
          <span className="text-violet-300">{completed}/{stats.length} tamamladı</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[720px]">
          <thead>
            <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/5">
              <th className="text-left py-2.5 px-4 font-bold">Öğrenci</th>
              <th className="text-center py-2.5 px-2 font-bold">Maç</th>
              <th className="text-center py-2.5 px-2 font-bold" title="Platform bulmaca doğru">Bulmaca doğru</th>
              <th className="text-center py-2.5 px-2 font-bold" title="Platform bulmaca yanlış">Bulmaca yanlış</th>
              <th className="text-center py-2.5 px-2 font-bold hidden sm:table-cell">Toplam süre</th>
              <th className="text-center py-2.5 px-2 font-bold">Durum</th>
              <th className="text-center py-2.5 px-3 font-bold w-10" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((stat) => {
              const Icon = STATUS_ICON[stat.status];
              const statusColor =
                stat.status === 'Tamamlandı'
                  ? 'text-emerald-400'
                  : stat.status === 'Devam Ediyor'
                    ? 'text-amber-400'
                    : 'text-slate-500';
              const gameTarget = stat.dailyGameTarget ?? 0;
              const games = stat.todayGames ?? 0;
              return (
                <tr
                  key={stat.studentId}
                  className="border-b border-white/[0.04] hover:bg-white/[0.04] cursor-pointer transition-colors group"
                  onClick={() => onSelect(stat)}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-violet-500/15 text-violet-300 flex items-center justify-center text-[10px] font-black shrink-0">
                        {stat.initials}
                      </div>
                      <span className="font-semibold text-white truncate">{stat.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center tabular-nums text-slate-300">
                    {gameTarget > 0 ? `${Math.min(games, gameTarget)}/${gameTarget}` : games > 0 ? games : '—'}
                  </td>
                  <td className="py-3 px-2 text-center font-bold text-emerald-400 tabular-nums">{stat.correct}</td>
                  <td className="py-3 px-2 text-center font-bold text-rose-400 tabular-nums">{stat.wrong}</td>
                  <td className="py-3 px-2 text-center text-slate-400 hidden sm:table-cell">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Clock className="w-3 h-3" />
                      {stat.timeSeconds > 0 ? formatHomeworkDuration(stat.timeSeconds) : '—'}
                    </span>
                  </td>
                  <td className={`py-3 px-2 text-center font-bold uppercase text-[10px] ${statusColor}`}>
                    <span className="inline-flex items-center gap-1 justify-center">
                      <Icon className="w-3.5 h-3.5" />
                      {stat.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-violet-400 mx-auto transition-colors" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
