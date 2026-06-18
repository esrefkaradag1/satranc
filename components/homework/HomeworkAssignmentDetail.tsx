import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, Grid, Users, Percent, Trophy, Clock, RotateCcw, LayoutGrid, Table2, Trash2,
} from 'lucide-react';
import type { HomeworkAssignment, Puzzle, Student } from '../../types';
import type { StudentHwStat } from '../../lib/homeworkAnalysisUtils';
import {
  getHomeworkBranchLabel,
  getHomeworkGroupLabel,
  homeworkEndDateLabel,
  homeworkStatusLabel,
  homeworkSummaryFromStats,
  puzzleDifficultyDistribution,
} from '../../lib/homeworkAnalysisUtils';
import { HomeworkGroupResultsTable } from './HomeworkGroupResultsTable';
import { StudentProgressCard } from './StudentProgressCard';

type Props = {
  homework: HomeworkAssignment;
  students: Student[];
  puzzles: Puzzle[];
  stats: StudentHwStat[];
  onBack: () => void;
  onSelectStudent: (stat: StudentHwStat) => void;
  onResetStudent: (studentId: string) => void;
  onDelete?: () => void;
};

function formatDateTime(iso?: string): string {
  if (!iso?.trim()) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const HomeworkAssignmentDetail: React.FC<Props> = ({
  homework,
  students,
  puzzles,
  stats,
  onBack,
  onSelectStudent,
  onResetStudent,
  onDelete,
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const hwPuzzles = useMemo(
    () => puzzles.filter((p) => homework.puzzles.includes(p.id)),
    [puzzles, homework.puzzles],
  );
  const summary = useMemo(
    () => homeworkSummaryFromStats(stats, hwPuzzles.length),
    [stats, hwPuzzles.length],
  );
  const difficultyDist = useMemo(() => puzzleDifficultyDistribution(hwPuzzles), [hwPuzzles]);
  const sortedStats = useMemo(
    () => [...stats].sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name, 'tr')),
    [stats],
  );
  const status = homeworkStatusLabel(homework);
  const groupLabel = getHomeworkGroupLabel(homework, students);
  const assigneeCount = stats.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Atama Listesine Dön
        </button>
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 text-sm font-bold transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Ödevi Sil
          </button>
        ) : null}
      </div>

      <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-600/20 via-indigo-600/10 to-transparent p-5 sm:p-6">
        <div>
          <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="text-2xl">♞</span>
            {homework.title}
          </h3>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-xs text-slate-300">
            <p><span className="text-slate-500">Şube:</span> {getHomeworkBranchLabel(homework, students)}</p>
            <p><span className="text-slate-500">Grup:</span> {groupLabel}</p>
            <p><span className="text-slate-500">Öğrenci:</span> {assigneeCount} kişi</p>
            <p><span className="text-slate-500">Bulmaca:</span> {hwPuzzles.length} soru</p>
            <p><span className="text-slate-500">Başlangıç:</span> {formatDateTime(homework.startDate)}</p>
            <p><span className="text-slate-500">Bitiş:</span> {homeworkEndDateLabel(homework)}</p>
            <p>
              <span className="text-slate-500">Süre Limiti:</span>{' '}
              {homework.timeLimitMinutes ? `${homework.timeLimitMinutes} dakika` : '—'}
            </p>
            <p>
              <span className="text-slate-500">Durum:</span>{' '}
              <span className={`font-bold ${status === 'Aktif' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {status}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Toplam Bulmaca', value: summary.totalPuzzles, icon: Grid, color: 'text-indigo-300' },
          { label: 'Katılım', value: `${summary.participation.started}/${summary.participation.total}`, icon: Users, color: 'text-sky-300' },
          { label: 'Ort. Tamamlanma', value: `%${summary.avgCompletion}`, icon: Percent, color: 'text-amber-300' },
          { label: 'Tamamlayan', value: `${summary.completed}/${assigneeCount}`, icon: Trophy, color: 'text-violet-300' },
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

      {difficultyDist.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#1a2332]/60 p-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Bulmaca Dağılımı</h4>
          <div className="flex flex-wrap gap-2">
            {difficultyDist.map((d) => (
              <span
                key={d.label}
                className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm font-bold text-white"
              >
                {d.count} {d.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" />
            Öğrenci Sonuçları
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {groupLabel}
            </span>
          </h4>
          <div className="flex bg-black/30 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${
                viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              Tablo
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${
                viewMode === 'cards' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Kartlar
            </button>
          </div>
        </div>

        {viewMode === 'table' ? (
          <HomeworkGroupResultsTable
            stats={sortedStats}
            totalPuzzles={hwPuzzles.length}
            homeworkTitle={homework.title}
            onSelect={onSelectStudent}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {sortedStats.map((stat) => (
              stat.status === 'Başlamadı' ? (
                <div
                  key={stat.studentId}
                  className="rounded-2xl border border-white/[0.06] bg-[#1a2332]/50 p-5 text-center"
                >
                  <div className="w-12 h-12 rounded-full bg-slate-700/50 text-slate-400 flex items-center justify-center text-sm font-black mx-auto mb-3">
                    {stat.initials}
                  </div>
                  <p className="text-sm font-semibold text-white truncate">{stat.name}</p>
                  <p className="mt-3 text-xs text-slate-500 flex items-center justify-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Henüz başlamadı
                  </p>
                </div>
              ) : (
                <div key={stat.studentId} className="space-y-2">
                  <StudentProgressCard
                    stat={stat}
                    onClick={() => onSelectStudent(stat)}
                  />
                  <button
                    type="button"
                    onClick={() => onResetStudent(stat.studentId)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white text-[10px] font-bold uppercase tracking-wide transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Bulmacayı Sıfırla
                  </button>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
