import React from 'react';
import { CheckCircle2, CircleDashed, Play, Clock, ChevronRight } from 'lucide-react';
import type { StudyStudentStat } from '../../lib/studyHomeworkStats';
import { StudentCountText, useCanShowStudentCounts } from '../ui/StudentCountText';
import { formatStudyThinkDuration } from '../../lib/studyHomeworkStats';

const STATUS_ICON = {
  Tamamlandı: CheckCircle2,
  'Devam Ediyor': Play,
  Başlamadı: CircleDashed,
} as const;

type Props = {
  stats: StudyStudentStat[];
  studyTitle: string;
  onSelect: (stat: StudyStudentStat) => void;
};

export const StudyGroupResultsTable: React.FC<Props> = ({ stats, studyTitle, onSelect }) => {
  const showStudentCounts = useCanShowStudentCounts();
  const completed = stats.filter((s) => s.status === 'Tamamlandı').length;
  const started = stats.filter((s) => s.status !== 'Başlamadı').length;
  const totalCorrect = stats.reduce((s, x) => s + x.correctMoves, 0);
  const totalWrong = stats.reduce((s, x) => s + x.wrongMoves, 0);

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] overflow-hidden">
      <div className="px-4 py-3 border-b border-violet-500/15 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold text-violet-300/80 uppercase tracking-wider">Çalışma sonuçları</p>
          <p className="text-sm font-bold text-white truncate">{studyTitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold tabular-nums">
          <span className="text-emerald-400">{totalCorrect} doğru hamle</span>
          <span className="text-rose-400">{totalWrong} yanlış</span>
          <StudentCountText count={stats.length} className="text-slate-500" />
          {showStudentCounts ? (
            <span className="text-violet-300">{started}/{stats.length} başladı · {completed} tamamladı</span>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[720px]">
          <thead>
            <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/5">
              <th className="text-left py-2.5 px-4 font-bold">Öğrenci</th>
              <th className="text-center py-2.5 px-2 font-bold">Doğru</th>
              <th className="text-center py-2.5 px-2 font-bold">Yanlış</th>
              <th className="text-center py-2.5 px-2 font-bold">Toplam hamle</th>
              <th className="text-center py-2.5 px-2 font-bold hidden sm:table-cell">Düşünme</th>
              <th className="text-center py-2.5 px-2 font-bold">Bölüm</th>
              <th className="text-center py-2.5 px-2 font-bold">Durum</th>
              <th className="text-center py-2.5 px-3 font-bold w-10" />
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => {
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
                  className="border-b border-white/[0.04] hover:bg-white/[0.04] cursor-pointer transition-colors group"
                  onClick={() => onSelect(stat)}
                >
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-lg bg-violet-500/20 text-violet-300 flex items-center justify-center text-[10px] font-black shrink-0">
                        {stat.initials}
                      </span>
                      <span className="font-semibold text-white truncate">{stat.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-center font-black text-emerald-400 tabular-nums">{stat.correctMoves}</td>
                  <td className="py-2.5 px-2 text-center font-black text-rose-400 tabular-nums">{stat.wrongMoves}</td>
                  <td className="py-2.5 px-2 text-center font-black text-white tabular-nums">{stat.totalMoves}</td>
                  <td className="py-2.5 px-2 text-center text-slate-300 hidden sm:table-cell">
                    <span className="inline-flex items-center gap-1 justify-center font-medium">
                      <Clock className="w-3 h-3 opacity-60" />
                      {formatStudyThinkDuration(stat.thinkSeconds)}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-center text-slate-300 tabular-nums">
                    {stat.chaptersTracked > 0 ? `${stat.chaptersDone}/${stat.chaptersTracked}` : '—'}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${statusColor}`}>
                      <Icon className="w-3 h-3" />
                      <span className="hidden sm:inline">{stat.status}</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-violet-400 transition-colors mx-auto" />
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
