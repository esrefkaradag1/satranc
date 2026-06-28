import React, { useEffect, useMemo, useState } from 'react';
import {
  Grid, RefreshCw, Play, Clock, Search, CheckCircle2, CircleDashed,
  ChevronDown, ChevronUp, Target, ExternalLink, AlertCircle,
} from 'lucide-react';
import type { HomeworkAssignment, HomeworkPuzzleAttempt, HomeworkSubmission, Puzzle, Student } from '../../types';
import { evaluatePlatformDailyGoals } from '../../lib/homeworkPlatformUtils';
import { homeworkHasPlatformGoals } from '../../lib/homeworkStatsBuilders';
import { nextHomeworkPuzzle } from '../../lib/puzzlePlayUtils';
import { LichessOAuthConnect } from './LichessOAuthConnect';
import {
  StudentWeeklyHomeworkGrid,
  computeStudentWeeklySummary,
} from './StudentWeeklyHomeworkGrid';
import type { PlatformDayStats } from '../../lib/homeworkPlatformUtils';

type FilterKey = 'all' | 'todo' | 'progress' | 'done';

export type HomeworkPlayPayload = {
  puzzle: Puzzle;
  homeworkId: string;
  openKey: string;
  nextPuzzle?: Puzzle | null;
};

type Props = {
  student: Student;
  assignedHomeworks: HomeworkAssignment[];
  puzzles: Puzzle[];
  homeworkAttempts: HomeworkPuzzleAttempt[];
  homeworkSubmissions: HomeworkSubmission[];
  homeworksLoading: boolean;
  homeworkDayKey: string;
  todayExternalGameCount: number;
  todayExternalPuzzleCount: number;
  todayExternalPuzzlePassed: number;
  weekPlatformStatsByDate?: Record<string, PlatformDayStats | undefined>;
  loadingExternalGameCount: boolean;
  externalStatsNote?: string | null;
  midnightCountdown: string;
  onRefresh: () => void;
  onRefreshPlatform?: () => void;
  platformStatsFetched?: boolean;
  onPlayPuzzle: (payload: HomeworkPlayPayload) => void;
  onDailyGoalsComplete?: (homeworkId: string) => void;
};

function formatDateTR(iso?: string) {
  if (!iso?.trim()) return '—';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

type HwProgress = {
  hw: HomeworkAssignment;
  hwPuzzles: Puzzle[];
  totalPoints: number;
  solvedCount: number;
  wrongCount: number;
  progressPct: number;
  status: 'Başlamadı' | 'Devam Ediyor' | 'Tamamlandı';
  isOverdue: boolean;
  daysLeft: number | null;
  isUrgent: boolean;
  nextPuzzle: Puzzle | null;
  puzzleStates: Array<{ puzzle: Puzzle; state: 'done' | 'wrong' | 'pending' }>;
  dailyPuzzleTarget: number;
  dailyGameTarget: number;
  todayPuzzleSolved: number;
  todayPuzzleAccuracy: number;
  puzzleGoalMet: boolean;
  gameGoalMet: boolean;
  dailyGoalsMet: boolean;
};

export function buildHomeworkProgress(
  hw: HomeworkAssignment,
  student: Student,
  puzzles: Puzzle[],
  attempts: HomeworkPuzzleAttempt[],
  submissions: HomeworkSubmission[],
  todayKey: string,
  todayExternalGameCount: number,
  todayExternalPuzzleCount: number,
  todayExternalPuzzlePassed: number,
): HwProgress {
  const hwPuzzles = hw.puzzles
    .map((id) => puzzles.find((p) => p.id === id))
    .filter((p): p is Puzzle => p != null);
  const totalPoints = hwPuzzles.reduce((s, p) => s + p.points, 0);
  const studentAttempts = attempts.filter((a) => a.studentId === student.id && a.homeworkId === hw.id);
  const submitted = submissions.some((s) => s.studentId === student.id && s.homeworkId === hw.id);

  const solvedIds = new Set(studentAttempts.filter((a) => a.correct).map((a) => a.puzzleId));
  const wrongIds = new Set(studentAttempts.filter((a) => !a.correct).map((a) => a.puzzleId));
  const solvedCount = hwPuzzles.filter((p) => solvedIds.has(p.id)).length;
  const wrongCount = hwPuzzles.filter((p) => wrongIds.has(p.id) && !solvedIds.has(p.id)).length;

  const puzzleStates = hwPuzzles.map((puzzle) => {
    if (solvedIds.has(puzzle.id)) return { puzzle, state: 'done' as const };
    if (wrongIds.has(puzzle.id)) return { puzzle, state: 'wrong' as const };
    return { puzzle, state: 'pending' as const };
  });

  const studentTarget = hw.studentDailyTargets?.[student.id];
  const currentDayKey = (() => {
    const d = new Date(`${todayKey}T12:00:00`);
    const day = d.getDay();
    return day === 0 ? 7 : day;
  })();
  const dayTarget = studentTarget?.weeklySchedule?.[currentDayKey];
  const dailyPuzzleTarget = Math.max(0, dayTarget?.dailyPuzzleTarget ?? studentTarget?.dailyPuzzleTarget ?? hw.dailyPuzzleTarget ?? 0);
  const dailyGameTarget = Math.max(0, dayTarget?.dailyGameTarget ?? studentTarget?.dailyGameTarget ?? hw.dailyGameTarget ?? 0);
  const minPuzzleAccuracy = Math.max(0, Math.min(100, dayTarget?.minPuzzleAccuracyPct ?? studentTarget?.minPuzzleAccuracyPct ?? hw.minPuzzleAccuracyPct ?? 60));
  const todayPlatformPuzzleSolved = todayExternalPuzzleCount;
  const todayPlatformPuzzlePassed = todayExternalPuzzlePassed;
  const platformGoals = evaluatePlatformDailyGoals(
    dailyGameTarget,
    dailyPuzzleTarget,
    minPuzzleAccuracy,
    todayExternalGameCount,
    todayPlatformPuzzleSolved,
    todayPlatformPuzzlePassed,
  );
  const puzzleGoalMet = platformGoals.puzzlesMet;
  const gameGoalMet = platformGoals.gamesMet;
  const todayPuzzleAccuracy = platformGoals.puzzleAccuracy;

  const nextPuzzle = puzzleStates.find((x) => x.state !== 'done')?.puzzle ?? null;
  const total = hwPuzzles.length;
  const hasDailyTargets = dailyPuzzleTarget > 0 || dailyGameTarget > 0;
  const dailyGoalsMet = platformGoals.done;
  const dailyStarted = hasDailyTargets && (todayPlatformPuzzleSolved > 0 || todayExternalGameCount > 0);
  const dailyGoalCount = (dailyGameTarget > 0 ? 1 : 0) + (dailyPuzzleTarget > 0 ? 1 : 0);
  const dailyGoalDoneCount = (dailyGameTarget > 0 && gameGoalMet ? 1 : 0) + (dailyPuzzleTarget > 0 && puzzleGoalMet ? 1 : 0);
  const puzzlesDone = total === 0 || solvedCount >= total;
  let progressPct = total > 0
    ? Math.round((solvedCount / total) * 100)
    : hasDailyTargets
      ? (dailyGoalCount > 0 ? Math.round((dailyGoalDoneCount / dailyGoalCount) * 100) : 0)
      : (submitted ? 100 : 0);
  if (hasDailyTargets && dailyGoalsMet) {
    const dailyPct = dailyGoalCount > 0 ? Math.round((dailyGoalDoneCount / dailyGoalCount) * 100) : 100;
    progressPct = total > 0 ? Math.max(progressPct, dailyPct) : dailyPct;
  }

  let status: HwProgress['status'] = 'Başlamadı';
  if (submitted || (hasDailyTargets && dailyGoalsMet) || (puzzlesDone && !hasDailyTargets)) {
    status = 'Tamamlandı';
  } else if (studentAttempts.length > 0 || dailyStarted) {
    status = 'Devam Ediyor';
  }

  const dueDate = hw.dueDate ? new Date(hw.dueDate) : null;
  const now = new Date();
  const isOverdue = !!(dueDate && dueDate < now && status !== 'Tamamlandı');
  const daysLeft = dueDate && dueDate >= now
    ? Math.ceil((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const isUrgent = isOverdue || (daysLeft != null && daysLeft <= 3 && status !== 'Tamamlandı');

  return {
    hw,
    hwPuzzles,
    totalPoints,
    solvedCount,
    wrongCount,
    progressPct,
    status,
    isOverdue,
    daysLeft,
    isUrgent,
    nextPuzzle,
    puzzleStates,
    dailyPuzzleTarget,
    dailyGameTarget,
    todayPuzzleSolved: todayPlatformPuzzleSolved,
    todayPuzzleAccuracy,
    puzzleGoalMet,
    gameGoalMet,
    dailyGoalsMet,
  };
}

const STATUS_META = {
  Tamamlandı: { pill: 'bg-emerald-500/15 text-emerald-400', icon: CheckCircle2 },
  'Devam Ediyor': { pill: 'bg-amber-500/15 text-amber-400', icon: Play },
  Başlamadı: { pill: 'bg-slate-500/15 text-slate-400', icon: CircleDashed },
} as const;

export const StudentHomeworkPanel: React.FC<Props> = ({
  student,
  assignedHomeworks,
  puzzles,
  homeworkAttempts,
  homeworkSubmissions,
  homeworksLoading,
  homeworkDayKey,
  todayExternalGameCount,
  todayExternalPuzzleCount,
  todayExternalPuzzlePassed,
  weekPlatformStatsByDate = {},
  loadingExternalGameCount,
  externalStatsNote,
  midnightCountdown,
  onRefresh,
  onRefreshPlatform,
  platformStatsFetched = false,
  onPlayPuzzle,
  onDailyGoalsComplete,
}) => {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const lichessUsername = student.lichessUsername?.trim() || '';
  const chessComUsername = student.chessComUsername?.trim() || '';
  const hasPlatformAccount = !!(lichessUsername || chessComUsername);

  const progressList = useMemo(
    () => assignedHomeworks.map((hw) =>
      buildHomeworkProgress(
        hw, student, puzzles, homeworkAttempts, homeworkSubmissions,
        homeworkDayKey, todayExternalGameCount, todayExternalPuzzleCount, todayExternalPuzzlePassed,
      ),
    ),
    [
      assignedHomeworks, student, puzzles, homeworkAttempts, homeworkSubmissions,
      homeworkDayKey, todayExternalGameCount, todayExternalPuzzleCount, todayExternalPuzzlePassed,
    ],
  );

  useEffect(() => {
    if (!onDailyGoalsComplete) return;
    for (const item of progressList) {
      const isDailyOnly = item.hwPuzzles.length === 0 && (item.dailyPuzzleTarget > 0 || item.dailyGameTarget > 0);
      if (!isDailyOnly || item.status !== 'Tamamlandı') continue;
      const submitted = homeworkSubmissions.some(
        (s) => s.studentId === student.id && s.homeworkId === item.hw.id,
      );
      if (!submitted) onDailyGoalsComplete(item.hw.id);
    }
  }, [progressList, homeworkSubmissions, student.id, onDailyGoalsComplete]);

  const summary = useMemo(() => {
    const todo = progressList.filter((p) => p.status === 'Başlamadı').length;
    const progress = progressList.filter((p) => p.status === 'Devam Ediyor').length;
    const done = progressList.filter((p) => p.status === 'Tamamlandı').length;
    const urgent = progressList.filter((p) => p.isUrgent && p.status !== 'Tamamlandı').length;
    const remainingPuzzles = progressList.reduce(
      (s, p) => s + Math.max(0, p.hwPuzzles.length - p.solvedCount),
      0,
    );
    const earnedPoints = progressList.reduce((s, p) => {
      return s + p.puzzleStates
        .filter((x) => x.state === 'done')
        .reduce((sum, x) => sum + x.puzzle.points, 0);
    }, 0);
    return { todo, progress, done, urgent, remainingPuzzles, earnedPoints, total: progressList.length };
  }, [progressList]);

  const filtered = useMemo(() => {
    let list = progressList;
    if (filter === 'todo') list = list.filter((p) => p.status === 'Başlamadı');
    else if (filter === 'progress') list = list.filter((p) => p.status === 'Devam Ediyor');
    else if (filter === 'done') list = list.filter((p) => p.status === 'Tamamlandı');

    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => p.hw.title.toLowerCase().includes(q));

    return [...list].sort((a, b) => {
      if (a.status === 'Tamamlandı' && b.status !== 'Tamamlandı') return 1;
      if (b.status === 'Tamamlandı' && a.status !== 'Tamamlandı') return -1;
      if (a.isOverdue && !b.isOverdue) return -1;
      if (b.isOverdue && !a.isOverdue) return 1;
      if (a.isUrgent && !b.isUrgent) return -1;
      if (b.isUrgent && !a.isUrgent) return 1;
      const da = a.hw.dueDate || a.hw.endDate || '';
      const db = b.hw.dueDate || b.hw.endDate || '';
      if (da && db) return da.localeCompare(db);
      return b.hw.title.localeCompare(a.hw.title, 'tr');
    });
  }, [progressList, filter, search]);

  const activeList = filtered.filter((p) => p.status !== 'Tamamlandı');
  const completedList = filtered.filter((p) => p.status === 'Tamamlandı');

  const makePlayPayload = (puzzle: Puzzle, hw: HomeworkAssignment): HomeworkPlayPayload => ({
    puzzle,
    homeworkId: hw.id,
    openKey: `${hw.id}:${puzzle.id}:${Date.now()}`,
    nextPuzzle: nextHomeworkPuzzle(hw, puzzle.id, puzzles),
  });

  const renderCard = (item: HwProgress) => {
    const meta = STATUS_META[item.status];
    const StatusIcon = meta.icon;
    const isExpanded = expandedId === item.hw.id || item.hwPuzzles.length <= 4;
    const hasDaily = item.dailyPuzzleTarget > 0 || item.dailyGameTarget > 0;
    const isDailyOnly = item.hwPuzzles.length === 0 && hasDaily;
    const isPlatformProgram = isDailyOnly || (item.hwPuzzles.length === 0 && homeworkHasPlatformGoals(item.hw));
    const studentTarget = item.hw.studentDailyTargets?.[student.id];
    const weeklySummary = isPlatformProgram
      ? computeStudentWeeklySummary(item.hw, studentTarget, homeworkDayKey, weekPlatformStatsByDate)
      : null;

    return (
      <div
        key={item.hw.id}
        className={`rounded-2xl border overflow-hidden transition-colors ${
          item.isUrgent && item.status !== 'Tamamlandı'
            ? 'bg-rose-500/[0.04] border-rose-500/25'
            : 'bg-slate-800/60 border-slate-700/50 hover:border-indigo-600/30'
        }`}
      >
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-white truncate">{item.hw.title}</h3>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${meta.pill}`}>
                  <StatusIcon className="w-3 h-3" />
                  {item.status}
                </span>
                {item.isOverdue && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold">Süresi geçti</span>
                )}
                {!item.isOverdue && item.daysLeft != null && item.daysLeft <= 3 && item.status !== 'Tamamlandı' && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">{item.daysLeft} gün kaldı</span>
                )}
              </div>
              {item.hw.description && (
                <p className="text-slate-400 text-sm mt-1 line-clamp-2">{item.hw.description}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              {isPlatformProgram && weeklySummary && weeklySummary.totalScheduledDays > 0 ? (
                <>
                  <p className="text-2xl font-black text-white tabular-nums">
                    {weeklySummary.completedDays}/{weeklySummary.dueDays}
                  </p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">haftalık gün</p>
                </>
              ) : isDailyOnly || (hasDaily && item.dailyGoalsMet) ? (
                <>
                  <p className="text-2xl font-black text-white tabular-nums">{item.progressPct}%</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">
                    {isDailyOnly ? 'bugünkü hedef' : 'bugün tamam'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black text-white tabular-nums">{item.solvedCount}/{item.hwPuzzles.length}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">bulmaca</p>
                </>
              )}
            </div>
          </div>

          <div className="mt-3 h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                item.status === 'Tamamlandı' ? 'bg-emerald-500' : item.status === 'Devam Ediyor' ? 'bg-indigo-500' : 'bg-slate-600'
              }`}
              style={{
                width: `${isPlatformProgram && weeklySummary && weeklySummary.dueDays > 0
                  ? weeklySummary.progressPct
                  : item.progressPct}%`,
              }}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>Son tarih: <strong className="text-slate-200">{formatDateTR(item.hw.dueDate)}</strong></span>
            <span>Puan: <strong className="text-amber-400">{item.totalPoints}</strong></span>
            {item.wrongCount > 0 && (
              <span className="text-rose-400">{item.wrongCount} yanlış deneme</span>
            )}
          </div>

          {hasDaily && !isPlatformProgram && (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {item.dailyGameTarget > 0 && (
                <span className={`px-2 py-1 rounded-lg border ${item.gameGoalMet ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                  Maç {Math.min(todayExternalGameCount, item.dailyGameTarget)}/{item.dailyGameTarget}
                  {loadingExternalGameCount ? ' …' : ''}
                </span>
              )}
              {item.dailyPuzzleTarget > 0 && (
                <span className={`px-2 py-1 rounded-lg border ${item.puzzleGoalMet ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                  Bugün bulmaca {Math.min(item.todayPuzzleSolved, item.dailyPuzzleTarget)}/{item.dailyPuzzleTarget}
                  {item.todayPuzzleSolved > 0 ? ` · %${Math.round(item.todayPuzzleAccuracy)} doğru` : ''}
                </span>
              )}
            </div>
          )}

          {isPlatformProgram ? (
            <StudentWeeklyHomeworkGrid
              homework={item.hw}
              studentTarget={studentTarget}
              todayKey={homeworkDayKey}
              weekStatsByDate={weekPlatformStatsByDate}
              loading={loadingExternalGameCount}
            />
          ) : null}

          {isPlatformProgram && item.status !== 'Tamamlandı' && !hasPlatformAccount && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Günlük hedefler Lichess veya Chess.com hesabınızdan otomatik sayılır.
                Lichess&apos;te tek tek bulmaca listesi için yukarıdan hesabınızı OAuth ile bağlayın.
                Profilinizde kullanıcı adınız tanımlı olmalı.
              </span>
            </div>
          )}

          {isPlatformProgram && item.status !== 'Tamamlandı' && (
            <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-2">
              <p className="text-xs text-slate-300">
                Haftalık hedeflerinizi Lichess veya Chess.com üzerinde tamamlayın; her günün ilerlemesi otomatik güncellenir.
                Chess.com&apos;da yalnızca <strong className="text-slate-200">Puanlı</strong> bulmacalar sayılır.
              </p>
              <div className="flex flex-wrap gap-2">
                {lichessUsername ? (
                  <a
                    href="https://lichess.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-bold hover:bg-sky-500/25"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Lichess (@{lichessUsername})
                  </a>
                ) : null}
                {chessComUsername ? (
                  <a
                    href={`https://www.chess.com/member/${encodeURIComponent(chessComUsername)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/25"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Chess.com (@{chessComUsername})
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={onRefreshPlatform ?? onRefresh}
                  disabled={homeworksLoading || loadingExternalGameCount}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600/80 text-white text-xs font-bold hover:bg-indigo-500 disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingExternalGameCount ? 'animate-spin' : ''}`} />
                  Platform verisini çek
                </button>
              </div>
            </div>
          )}

          {item.nextPuzzle && item.status !== 'Tamamlandı' && (
            <button
              type="button"
              onClick={() => onPlayPuzzle(makePlayPayload(item.nextPuzzle!, item.hw))}
              className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-900/30 transition-colors"
            >
              <Play className="w-4 h-4" />
              Devam et — {item.nextPuzzle.title}
            </button>
          )}
        </div>

        {item.hwPuzzles.length > 0 && (
          <div className="border-t border-slate-700/50">
            {item.hwPuzzles.length > 4 && (
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded && expandedId === item.hw.id ? null : item.hw.id)}
                className="w-full px-4 py-2.5 flex items-center justify-center gap-2 text-xs font-bold text-indigo-400 hover:bg-white/[0.03]"
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {isExpanded ? 'Bulmacaları gizle' : `${item.hwPuzzles.length} bulmacayı göster`}
              </button>
            )}
            {isExpanded && (
              <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {item.puzzleStates.map(({ puzzle, state }, idx) => (
                  <button
                    key={puzzle.id}
                    type="button"
                    onClick={() => onPlayPuzzle(makePlayPayload(puzzle, item.hw))}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left text-sm transition-all ${
                      state === 'done'
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                        : state === 'wrong'
                          ? 'bg-rose-500/10 border-rose-500/25 text-rose-200 hover:bg-rose-500/15'
                          : 'bg-indigo-600/10 border-indigo-600/30 text-indigo-100 hover:bg-indigo-600/20'
                    }`}
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                      state === 'done' ? 'bg-emerald-500/30' : state === 'wrong' ? 'bg-rose-500/30' : 'bg-indigo-500/30'
                    }`}>
                      {state === 'done' ? '✓' : state === 'wrong' ? '✗' : idx + 1}
                    </span>
                    <span className="flex-1 min-w-0 truncate font-medium">{puzzle.title}</span>
                    <span className="text-[10px] font-bold opacity-70 shrink-0">{puzzle.points}p</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {item.hwPuzzles.length === 0 && item.hw.puzzles.length > 0 && (
          <div className="px-4 pb-4 text-xs text-slate-500">
            Bulmaca listesi yüklenemedi. Yenile butonunu deneyin.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600/15 via-violet-600/10 to-transparent border border-indigo-600/20 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Grid className="w-5 h-5 text-indigo-400" />
            Ödevlerim
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            {summary.total > 0
              ? `${summary.remainingPuzzles} bulmaca kaldı · ${summary.earnedPoints} puan · haftalık programlar aşağıda`
              : 'Öğretmeninizin atadığı bulmaca ve haftalık programlar burada listelenir.'}
          </p>
        </div>
        <button
          type="button"
          disabled={homeworksLoading}
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors disabled:opacity-70"
        >
          <RefreshCw className={`w-4 h-4 ${homeworksLoading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      <LichessOAuthConnect
        student={student}
        onDisconnected={onRefreshPlatform ?? onRefresh}
      />

      {homeworksLoading && (
        <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-8 text-center">
          <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin mx-auto mb-2" />
          <p className="text-slate-400 text-sm">Ödevler yükleniyor...</p>
        </div>
      )}

      {!homeworksLoading && summary.total > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Yapılacak', value: summary.todo, color: 'text-slate-300' },
              { label: 'Devam eden', value: summary.progress, color: 'text-amber-400' },
              { label: 'Tamamlanan', value: summary.done, color: 'text-emerald-400' },
              { label: 'Acil', value: summary.urgent, color: 'text-rose-400' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-3 sm:p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{item.label}</p>
                <p className={`text-xl font-black mt-0.5 tabular-nums ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ödev ara..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['all', 'Tümü'],
                ['todo', 'Yapılacak'],
                ['progress', 'Devam'],
                ['done', 'Bitti'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                    filter === key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {activeList.length > 0 ? (
              activeList.map(renderCard)
            ) : filter !== 'done' && completedList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-slate-500 text-sm">
                Bu filtreye uygun ödev yok.
              </div>
            ) : null}

            {completedList.length > 0 && filter !== 'todo' && filter !== 'progress' && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowCompleted((v) => !v)}
                  className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white mb-3"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Tamamlanan ödevler ({completedList.length})
                  {showCompleted ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showCompleted && (
                  <div className="space-y-3 opacity-90">
                    {completedList.map(renderCard)}
                  </div>
                )}
              </div>
            )}

            {filter === 'done' && completedList.map(renderCard)}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 px-1">
            <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Günlük hedefler gece yarısı sıfırlanır.</span>
            <span className="text-indigo-400/80">· Gün sonu: {midnightCountdown}</span>
          </div>
          {externalStatsNote && (
            <div className="flex items-start gap-2 rounded-xl border border-slate-600/40 bg-slate-800/60 px-3 py-2 text-xs text-slate-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>{externalStatsNote}</span>
            </div>
          )}
          {!platformStatsFetched && !loadingExternalGameCount && (
            <div className="flex items-start gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-xs text-indigo-200/90">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Lichess ve Chess.com verisi yükleniyor; tamamlanma durumu birkaç saniye içinde güncellenir.</span>
            </div>
          )}
        </>
      )}

      {!homeworksLoading && summary.total === 0 && (
        <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-10 text-center">
          <Target className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <h3 className="text-white font-bold mb-1">Henüz atanmış bulmaca yok</h3>
          <p className="text-slate-400 text-sm">Yeni ödevler geldiğinde burada görünecek.</p>
          <button
            type="button"
            onClick={onRefresh}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Veriyi yenile
          </button>
        </div>
      )}
    </div>
  );
};
