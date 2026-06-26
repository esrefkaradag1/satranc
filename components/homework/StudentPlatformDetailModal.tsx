import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { HomeworkAssignment, Student } from '../../types';
import type { PlatformStudentStat } from '../../lib/homeworkStatsBuilders';
import type { PlatformDayStats } from '../../lib/homeworkPlatformUtils';
import { formatHomeworkDuration } from '../../lib/homeworkAnalysisUtils';
import { PlatformDailyPuzzlesSection } from './PlatformDailyPuzzlesSection';

type Props = {
  stat: PlatformStudentStat;
  homework: HomeworkAssignment;
  student: Student;
  viewDate: string;
  platformStats?: PlatformDayStats;
  onClose: () => void;
};

export const StudentPlatformDetailModal: React.FC<Props> = ({
  stat,
  homework,
  student,
  viewDate,
  platformStats,
  onClose,
}) => {
  const [goalActivity, setGoalActivity] = useState<{ puzzleCorrect: number; puzzleWrong: number; games: number } | null>(null);
  const handleGoalActivityChange = useCallback((data: { puzzleCorrect: number; puzzleWrong: number; games: number }) => {
    setGoalActivity(data);
  }, []);

  useEffect(() => {
    setGoalActivity(null);
  }, [stat.studentId, viewDate]);

  const games = goalActivity?.games ?? platformStats?.games ?? stat.todayGames ?? 0;
  const gameTarget = Math.max(0, stat.dailyGameTarget ?? homework.dailyGameTarget ?? 0);
  const puzzleTarget = Math.max(0, stat.dailyPuzzleTarget ?? homework.dailyPuzzleTarget ?? 0);
  const puzzleCorrect = platformStats?.puzzlePassed ?? stat.correct;
  const puzzleWrong = platformStats?.puzzleFailed ?? stat.wrong;
  const dateLabel = new Date(`${viewDate}T12:00:00`).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" aria-hidden />
      <div
        className="relative w-full max-w-6xl max-h-[94vh] bg-[#0f172a] border border-white/10 sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-[#1a2332]/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600/80 to-indigo-700/80 text-white flex items-center justify-center text-sm font-black shrink-0">
              {stat.initials}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white truncate">{stat.name}</h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {homework.title} · Günlük program · {dateLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06] bg-black/20 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {[
              {
                label: 'Maç',
                value: gameTarget > 0 ? `${Math.min(games, gameTarget)}/${gameTarget}` : games || '—',
                color: 'text-sky-300',
              },
              { label: 'Bulmaca doğru', value: puzzleCorrect, color: 'text-emerald-400' },
              { label: 'Bulmaca yanlış', value: puzzleWrong, color: 'text-rose-400' },
              {
                label: 'Platform süresi',
                value: stat.timeSeconds > 0 ? formatHomeworkDuration(stat.timeSeconds) : '—',
                color: 'text-slate-200',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2.5 text-center"
              >
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{item.label}</p>
                <p className={`text-lg font-black mt-0.5 tabular-nums ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
          <PlatformDailyPuzzlesSection
            key={`${student.id}-${viewDate}`}
            student={student}
            viewDate={viewDate}
            platformStats={platformStats}
            dailyPuzzleTarget={puzzleTarget}
            dailyGameTarget={gameTarget}
            onGoalActivityChange={handleGoalActivityChange}
          />
        </div>
      </div>
    </div>
  );
};
