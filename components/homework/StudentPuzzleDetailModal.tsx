import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { X, Lightbulb, Clock, CheckCircle2, XCircle, CircleDashed } from 'lucide-react';
import { Chessboard } from 'react-chessboard';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION } from '../../lib/chessBoardUi';
import { ChessBoardFrame } from '../chess/ChessBoardFrame';
import type { HomeworkAssignment, HomeworkPuzzleAttempt, Puzzle, Student } from '../../types';
import type { StudentHwStat } from '../../lib/homeworkAnalysisUtils';
import type { PlatformDayStats } from '../../lib/homeworkPlatformUtils';
import { capDailyPuzzleDisplay } from '../../lib/homeworkPlatformUtils';
import {
  attemptThinkSeconds,
  formatHomeworkDuration,
  studentTotalThinkSeconds,
} from '../../lib/homeworkAnalysisUtils';
import { PlatformDailyPuzzlesSection } from './PlatformDailyPuzzlesSection';

type Props = {
  stat: StudentHwStat;
  homework: HomeworkAssignment;
  puzzles: Puzzle[];
  attempts: HomeworkPuzzleAttempt[];
  student?: Student;
  viewDate?: string;
  platformStats?: PlatformDayStats;
  onClose: () => void;
};

type DailyStatFields = {
  todayPuzzleCorrect?: number;
  todayPuzzleWrong?: number;
  todayGames?: number;
  dailyPuzzleTarget?: number;
  dailyGameTarget?: number;
};

const DIFFICULTY_CLASS: Record<string, string> = {
  Kolay: 'text-emerald-400',
  Orta: 'text-amber-400',
  Zor: 'text-orange-400',
};

const RESULT_META = {
  correct: {
    label: 'Doğru',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    border: 'border-emerald-500/35',
    ring: 'ring-emerald-500/10',
    icon: CheckCircle2,
  },
  wrong: {
    label: 'Yanlış',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    border: 'border-rose-500/35',
    ring: 'ring-rose-500/10',
    icon: XCircle,
  },
  skipped: {
    label: 'Çözülmedi',
    badge: 'bg-slate-600/30 text-slate-400 border-slate-500/30',
    border: 'border-slate-600/40',
    ring: 'ring-slate-500/10',
    icon: CircleDashed,
  },
} as const;

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-semibold text-slate-200 text-right">{children}</span>
    </div>
  );
}

export const StudentPuzzleDetailModal: React.FC<Props> = ({
  stat,
  homework,
  puzzles,
  attempts,
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
  const hwPuzzles = useMemo(
    () => homework.puzzles
      .map((id, index) => {
        const puzzle = puzzles.find((p) => p.id === id);
        return puzzle ? { puzzle, index } : null;
      })
      .filter((x): x is { puzzle: Puzzle; index: number } => x != null),
    [homework.puzzles, puzzles],
  );

  const studentAttempts = useMemo(
    () => attempts
      .filter((a) => a.studentId === stat.studentId && a.homeworkId === homework.id)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [attempts, stat.studentId, homework.id],
  );

  const attemptsByPuzzleId = useMemo(() => {
    const map = new Map<string, HomeworkPuzzleAttempt[]>();
    for (const a of studentAttempts) {
      const list = map.get(a.puzzleId) ?? [];
      list.push(a);
      map.set(a.puzzleId, list);
    }
    return map;
  }, [studentAttempts]);

  const totalTime = studentTotalThinkSeconds(studentAttempts);
  const showPlatformSection = Boolean(
    student && (student.lichessUsername?.trim() || student.chessComUsername?.trim()),
  );
  const isDailyOnly = hwPuzzles.length === 0;
  const daily = stat as StudentHwStat & DailyStatFields;

  const displaySummary = useMemo(() => {
    if (!isDailyOnly) {
      return {
        correct: stat.correct,
        wrong: stat.wrong,
        skipped: stat.skipped,
        points: stat.points,
        time: formatHomeworkDuration(totalTime),
      };
    }
    const puzzleTarget = daily.dailyPuzzleTarget ?? 0;
    const rawCorrect = goalActivity?.puzzleCorrect ?? platformStats?.puzzlePassed ?? daily.todayPuzzleCorrect ?? stat.correct;
    const rawWrong = goalActivity?.puzzleWrong ?? platformStats?.puzzleFailed ?? daily.todayPuzzleWrong ?? stat.wrong;
    const capped = capDailyPuzzleDisplay(rawCorrect, rawWrong, puzzleTarget);
    const gameTarget = daily.dailyGameTarget ?? 0;
    const games = goalActivity?.games ?? platformStats?.games ?? daily.todayGames ?? 0;
    const platformTime = stat.timeSeconds > 0 ? stat.timeSeconds : totalTime;
    return {
      correct: capped.correct,
      wrong: capped.wrong,
      skipped: 0,
      points: 0,
      time: platformTime > 0
        ? formatHomeworkDuration(platformTime)
        : gameTarget > 0
          ? `Maç ${Math.min(games, gameTarget)}/${gameTarget}`
          : '—',
    };
  }, [isDailyOnly, stat, daily, platformStats, goalActivity, totalTime]);

  const cards = useMemo(() => hwPuzzles.map(({ puzzle, index }) => {
    const puzzleAttempts = attemptsByPuzzleId.get(puzzle.id) ?? [];
    const latestAttempt = puzzleAttempts[puzzleAttempts.length - 1];
    const bestAttempt = puzzleAttempts.find((a) => a.correct) ?? latestAttempt;
    const wrongCount = puzzleAttempts.filter((a) => !a.correct).length;

    let result: keyof typeof RESULT_META = 'skipped';
    if (puzzleAttempts.length > 0) {
      result = bestAttempt?.correct ? 'correct' : 'wrong';
    }

    const thinkSec = bestAttempt ? attemptThinkSeconds(bestAttempt, studentAttempts) : null;
    const meta = RESULT_META[result];

    return {
      puzzle,
      index,
      result,
      meta,
      attempt: bestAttempt,
      wrongCount,
      thinkSec,
      fen: bestAttempt?.finalFen || puzzle.fen,
    };
  }), [hwPuzzles, attemptsByPuzzleId, studentAttempts]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" aria-hidden />
      <div
        className="relative w-full max-w-6xl max-h-[94vh] bg-[#0f172a] border border-white/10 sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-[#1a2332]/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600/80 to-violet-700/80 text-white flex items-center justify-center text-sm font-black shrink-0">
              {stat.initials}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white truncate">{stat.name}</h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {homework.title} · {hwPuzzles.length > 0 ? `${hwPuzzles.length} bulmaca` : 'Günlük hedef'}
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

        {/* Özet */}
        <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06] bg-black/20 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
            {[
              { label: 'Doğru', value: displaySummary.correct, color: 'text-emerald-400' },
              { label: 'Yanlış', value: displaySummary.wrong, color: 'text-rose-400' },
              { label: 'Atlandı', value: displaySummary.skipped, color: displaySummary.skipped > 0 ? 'text-amber-400' : 'text-slate-500' },
              { label: 'Puan', value: displaySummary.points, color: 'text-indigo-300' },
              { label: isDailyOnly ? 'Maç / Süre' : 'Toplam Süre', value: displaySummary.time, color: 'text-slate-200', text: true },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2.5 text-center"
              >
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{item.label}</p>
                <p className={`text-lg font-black mt-0.5 tabular-nums ${item.color}`}>
                  {'text' in item && item.text ? item.value : item.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bulmaca kartları */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar space-y-6">
          {cards.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {cards.map(({ puzzle, index, result, meta, attempt, wrongCount, thinkSec, fen }) => {
              const StatusIcon = meta.icon;
              return (
                <div
                  key={puzzle.id}
                  className={`rounded-xl border bg-[#1a2332]/90 overflow-hidden shadow-lg ring-1 ${meta.border} ${meta.ring}`}
                >
                  {/* Kart başlığı */}
                  <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2 bg-white/[0.02]">
                    <p className="font-bold text-white text-sm">Bulmaca #{index + 1}</p>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase border ${meta.badge}`}>
                      <StatusIcon className="w-3 h-3" />
                      {meta.label}
                    </span>
                  </div>

                  {/* Tahta */}
                  <div className="p-3 bg-black/25">
                    <ChessBoardFrame
                      boardOrientation="white"
                      hideCoordinates
                      className="w-full max-w-[240px] mx-auto rounded-lg overflow-hidden border border-white/10 shadow-inner"
                    >
                      <Chessboard
                        options={{
                          id: `hw-puzzle-${puzzle.id}-${stat.studentId}`,
                          position: fen,
                          allowDragging: false,
                          boardOrientation: 'white',
                          darkSquareStyle: { backgroundColor: '#779952' },
                          lightSquareStyle: { backgroundColor: '#edeed1' },
                          ...CHESSBOARD_ANIMATION,
                          ...CHESSBOARD_NO_NOTATION,
                        }}
                      />
                    </ChessBoardFrame>
                    <p className="mt-2 text-center text-xs font-semibold text-slate-400 truncate px-1">
                      {puzzle.title}
                    </p>
                  </div>

                  {/* Detaylar */}
                  <div className="px-4 py-3 border-t border-white/[0.06] space-y-0.5 text-sm">
                    <DetailRow label="Zorluk">
                      <span className={`uppercase font-bold ${DIFFICULTY_CLASS[puzzle.difficulty] ?? 'text-slate-300'}`}>
                        {puzzle.difficulty}
                      </span>
                    </DetailRow>
                    <DetailRow label="Kategori">{puzzle.category || '—'}</DetailRow>
                    <DetailRow label="Hamle Sayısı">{puzzle.solution?.length ?? 1}</DetailRow>
                    <DetailRow label="Puan">
                      <span className="text-indigo-300 font-bold">
                        {result === 'correct' ? puzzle.points : 0}
                      </span>
                    </DetailRow>
                    <DetailRow label="Süre">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {thinkSec != null ? formatHomeworkDuration(thinkSec) : '—'}
                      </span>
                    </DetailRow>
                    <DetailRow label="Yanlış Deneme">
                      <span className={wrongCount > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                        {wrongCount}
                      </span>
                    </DetailRow>
                    <DetailRow label="İpucu">
                      {attempt?.hintUsed ? (
                        <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                          <Lightbulb className="w-3.5 h-3.5" />
                          Kullanıldı
                        </span>
                      ) : attempt ? (
                        <span className="text-slate-500">Kullanılmadı</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </DetailRow>
                    {attempt && (
                      <div className="pt-2 mt-2 border-t border-white/[0.06]">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Çözüm Tarihi
                        </p>
                        <p className="text-xs font-semibold text-slate-300">
                          {new Date(attempt.timestamp).toLocaleString('tr-TR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    )}
                    {attempt && attempt.movesPlayed.length > 0 && (
                      <div className="pt-2 border-t border-white/[0.06]">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Oynanan Hamleler
                        </p>
                        <p className="font-mono text-[11px] text-slate-400 break-all leading-relaxed">
                          {attempt.movesPlayed.join(' · ')}
                        </p>
                      </div>
                    )}
                    {attempt && !attempt.correct && attempt.solutionMoves.length > 0 && (
                      <div className="pt-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Doğru Çözüm
                        </p>
                        <p className="font-mono text-[11px] text-emerald-400/90 break-all leading-relaxed">
                          {attempt.solutionMoves.join(' · ')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          ) : null}

          {showPlatformSection && student && viewDate ? (
            <PlatformDailyPuzzlesSection
              student={student}
              viewDate={viewDate}
              platformStats={platformStats}
              dailyPuzzleTarget={
                ('dailyPuzzleTarget' in stat ? Number(stat.dailyPuzzleTarget) : 0)
                || homework.dailyPuzzleTarget
                || 0
              }
              dailyGameTarget={
                ('dailyGameTarget' in stat ? Number(stat.dailyGameTarget) : 0)
                || homework.dailyGameTarget
                || 0
              }
              onGoalActivityChange={handleGoalActivityChange}
            />
          ) : hwPuzzles.length === 0 ? (
            <p className="text-center text-slate-500 py-16">Bu ödeve bağlı bulmaca yok.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
};
