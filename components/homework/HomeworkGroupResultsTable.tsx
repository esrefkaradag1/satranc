import React from 'react';
import { CheckCircle2, CircleDashed, Play, Clock } from 'lucide-react';
import type { StudentProgressCardStat } from './StudentProgressCard';

function formatTime(seconds: number): string {
  if (seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}dk ${s}sn` : `${s}sn`;
}

const STATUS_ICON = {
  Tamamlandı: CheckCircle2,
  'Devam Ediyor': Play,
  Başlamadı: CircleDashed,
} as const;

type Props = {
  stats: StudentProgressCardStat[];
  totalPuzzles: number;
  homeworkTitle: string;
  onSelect: (stat: StudentProgressCardStat) => void;
};

export const HomeworkGroupResultsTable: React.FC<Props> = ({
  stats,
  totalPuzzles,
  homeworkTitle,
  onSelect,
}) => {
  const sorted = [...stats].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const totalCorrect = stats.reduce((s, x) => s + x.correct, 0);
  const totalWrong = stats.reduce((s, x) => s + x.wrong, 0);

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] overflow-hidden">
      <div className="px-4 py-3 border-b border-indigo-500/15 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold text-indigo-300/80 uppercase tracking-wider">Grup sonuçları</p>
          <p className="text-sm font-bold text-white truncate">{homeworkTitle}</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-bold tabular-nums">
          <span className="text-emerald-400">{totalCorrect} doğru</span>
          <span className="text-rose-400">{totalWrong} yanlış</span>
          <span className="text-slate-500">{stats.length} öğrenci</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[520px]">
          <thead>
            <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/5">
              <th className="text-left py-2.5 px-4 font-bold">Öğrenci</th>
              <th className="text-center py-2.5 px-2 font-bold">Doğru</th>
              <th className="text-center py-2.5 px-2 font-bold">Yanlış</th>
              <th className="text-center py-2.5 px-2 font-bold hidden sm:table-cell">Süre</th>
              <th className="text-center py-2.5 px-2 font-bold">Durum</th>
              {totalPuzzles > 0 ? (
                <th className="text-center py-2.5 px-3 font-bold hidden md:table-cell">İlerleme</th>
              ) : null}
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
              return (
                <tr
                  key={stat.studentId}
                  className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors"
                  onClick={() => onSelect(stat)}
                >
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px] font-black shrink-0">
                        {stat.initials}
                      </span>
                      <span className="font-semibold text-white truncate">{stat.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-center font-black text-emerald-400 tabular-nums">{stat.correct}</td>
                  <td className="py-2.5 px-2 text-center font-black text-rose-400 tabular-nums">{stat.wrong}</td>
                  <td className="py-2.5 px-2 text-center text-slate-400 hidden sm:table-cell">
                    <span className="inline-flex items-center gap-1 justify-center">
                      <Clock className="w-3 h-3 opacity-60" />
                      {formatTime(stat.timeSeconds)}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${statusColor}`}>
                      <Icon className="w-3 h-3" />
                      {stat.status}
                    </span>
                  </td>
                  {totalPuzzles > 0 ? (
                    <td className="py-2.5 px-3 text-center text-slate-400 tabular-nums hidden md:table-cell">
                      {stat.correct + stat.wrong}/{totalPuzzles}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[10px] text-slate-500 border-t border-white/5">
        Satıra tıklayın — soru bazlı düşünme süreleri ve hamle detayı açılır.
      </p>
    </div>
  );
};
