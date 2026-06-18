import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION } from '../lib/chessBoardUi';
import { ChessBoardFrame } from './chess/ChessBoardFrame';
import { MainlineMoveGrid } from './chess/MainlineMoveGrid';
import {
  CheckSquare, Clock, Target, ChevronRight, MoreHorizontal, RotateCcw,
  Plus, Award, BookOpen, Calendar, Users, Grid, Filter, ChevronDown,
  AlertCircle, Eye, Play, Trash2, X, User, Sparkles, Loader2, RefreshCw, LayoutGrid,
  Search, CheckCircle2, CircleDashed,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { analyzeStudentHomework } from '../services/geminiService';
import type { HomeworkAssignment, Student, Puzzle, StudentDailyTarget } from '../types';
import { HomeworkTargetSelector } from './homework/HomeworkTargetSelector';
import { HomeworkAssignmentsList } from './homework/HomeworkAssignmentsList';
import { HomeworkAssignmentDetail } from './homework/HomeworkAssignmentDetail';
import { StudentPuzzleDetailModal } from './homework/StudentPuzzleDetailModal';
import { WeeklyScheduleGrid } from './homework/WeeklyScheduleGrid';
import { StudyControlSection } from './homework/StudyControlSection';
import { ClubLeaderboard } from './leaderboard/ClubLeaderboard';
import { ResponsiveTable } from './ui/ResponsiveTable';
import {
  EMPTY_TARGET,
  filterStudentsByTarget,
  type HomeworkPanelTab,
  type TargetFilter,
} from '../lib/homeworkPanelUtils';
import {
  fetchChessComDailyPuzzleStats,
  fetchChessComGamesForDay,
  fetchLichessDailyPuzzleStats,
  fetchLichessGamesForDay,
} from '../services/chessPlatformService';
import { isToday, todayDayKey, weekdayKeyFromIso, mondayOfWeek, isoDateForWeekday, type DayCompletionStatus } from '../lib/homeworkDayUtils';
import {
  countPerPuzzleResults,
  studentTotalThinkSeconds,
  type StudentHwStat,
} from '../lib/homeworkAnalysisUtils';

interface StudentHwStatWithDaily extends StudentHwStat {
  dailyGoalDone?: boolean;
  todayGames?: number;
  todayPuzzleSolved?: number;
  todayPuzzleAccuracy?: number;
  dailyGameTarget?: number;
  dailyPuzzleTarget?: number;
  minPuzzleAccuracyPct?: number;
  todayPuzzleCorrect?: number;
  todayPuzzleWrong?: number;
}

function numericTargetDisplay(v: number | undefined): number | '' {
  if (v === undefined) return '';
  return v;
}

function parseNumericTargetInput(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function clearZeroOnFocus(v: number | undefined): number | undefined {
  return (v ?? 0) === 0 ? undefined : v;
}

function homeworkStatusFromPuzzles(
  submitted: boolean,
  totalPuzzles: number,
  attemptCount: number,
  solvedCount: number,
): StudentHwStat['status'] {
  if (submitted) return 'Tamamlandı';
  if (totalPuzzles === 0) return attemptCount === 0 ? 'Başlamadı' : 'Devam Ediyor';
  if (attemptCount === 0) return 'Başlamadı';
  if (solvedCount >= totalPuzzles) return 'Tamamlandı';
  return 'Devam Ediyor';
}

/** Günlük hedef varsa kart üstündeki doğru/yanlış/ilerleme/durum günlük veriden türetilir.
 *  Bulmaca ödevinde kayıtlı deneme varsa puzzle istatistikleri korunur (BAŞLAMADI hatası önlenir). */
function applyDailyDisplayToStat(
  stat: StudentHwStat,
  opts?: { hasPuzzleHomework?: boolean; attemptCount?: number },
): StudentHwStat {
  const hasPuzzleHomework = opts?.hasPuzzleHomework ?? false;
  const attemptCount = opts?.attemptCount ?? (stat.correct + stat.wrong);
  const dailyGameTarget = stat.dailyGameTarget ?? 0;
  const dailyPuzzleTarget = stat.dailyPuzzleTarget ?? 0;
  const hasDailyTargets = dailyGameTarget > 0 || dailyPuzzleTarget > 0;
  if (!hasDailyTargets) return stat;

  const todayGames = stat.todayGames ?? 0;
  const todayPuzzleSolved = stat.todayPuzzleSolved ?? 0;
  const todayPuzzleCorrect = stat.todayPuzzleCorrect ?? 0;
  const todayPuzzleWrong = stat.todayPuzzleWrong ?? 0;
  const hasDailyActivity = todayGames > 0 || todayPuzzleSolved > 0;
  const hasHwActivity = attemptCount > 0;

  const progressParts: number[] = [];
  if (dailyGameTarget > 0) progressParts.push(Math.min(100, (todayGames / dailyGameTarget) * 100));
  if (dailyPuzzleTarget > 0) progressParts.push(Math.min(100, (todayPuzzleSolved / dailyPuzzleTarget) * 100));
  const dailyProgress = progressParts.length
    ? Math.round(progressParts.reduce((a, b) => a + b, 0) / progressParts.length)
    : stat.progress;

  if (hasPuzzleHomework && hasHwActivity) {
    return stat;
  }

  if (hasPuzzleHomework && hasDailyActivity) {
    return {
      ...stat,
      status: stat.dailyGoalDone ? 'Tamamlandı' : 'Devam Ediyor',
      progress: stat.dailyGoalDone ? 100 : Math.max(stat.progress, dailyProgress),
    };
  }

  let status = stat.status;
  if (stat.dailyGoalDone) {
    status = 'Tamamlandı';
  } else if (hasDailyActivity || hasHwActivity) {
    status = 'Devam Ediyor';
  } else {
    status = 'Başlamadı';
  }

  return {
    ...stat,
    correct: todayPuzzleCorrect,
    wrong: todayPuzzleWrong,
    progress: stat.dailyGoalDone ? 100 : dailyProgress,
    status,
  };
}

function formatTime(seconds: number): string {
  if (seconds === 0) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} dk ${s} sn`;
}

function thinkSecondsBetweenAttempts(
  sortedAsc: { id: string; timestamp: string }[],
  attemptId: string,
): number | null {
  const idx = sortedAsc.findIndex((a) => a.id === attemptId);
  if (idx <= 0) return null;
  const prev = sortedAsc[idx - 1];
  const cur = sortedAsc[idx];
  const sec = Math.round(
    (new Date(cur.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000,
  );
  if (sec <= 0 || sec > 7200) return null;
  return sec;
}

function computeDailyPuzzleProgress(
  internalSolved: number,
  internalCorrect: number,
  externalSolved: number,
  externalPassed: number,
  externalFailed: number,
) {
  const todayPuzzleSolved = internalSolved + externalSolved;
  const totalCorrect = internalCorrect + externalPassed;
  const todayPuzzleWrong = Math.max(0, internalSolved - internalCorrect) + externalFailed;
  const todayPuzzleAccuracy =
    todayPuzzleSolved > 0 ? (totalCorrect / todayPuzzleSolved) * 100 : 0;
  return { todayPuzzleSolved, todayPuzzleAccuracy, todayPuzzleCorrect: totalCorrect, todayPuzzleWrong };
}

const Homework: React.FC = () => {
  const {
    students, homeworks, puzzles, homeworkAttempts, homeworkSubmissions,
    addHomework, updateHomework, deleteHomework, refreshFromStorage,
    resetHomeworkAttemptsForStudent, removeHomeworkSubmission,
    branchOffices, disciplineBranches, trainingGroups,
  } = useApp();
  const ALL_HOMEWORKS_ID = '__all__';
  const [selectedHwId, setSelectedHwId] = useState<string>(ALL_HOMEWORKS_ID);
  const [showHwPicker, setShowHwPicker] = useState(false);
  const [detailStat, setDetailStat] = useState<StudentHwStat | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ eksiklikler: string; hamleler: string } | null>(null);
  const [studentDailyGameCounts, setStudentDailyGameCounts] = useState<Record<string, number>>({});
  const [studentDailyExternalPuzzleCounts, setStudentDailyExternalPuzzleCounts] = useState<Record<string, number>>({});
  const [studentDailyExternalPuzzlePassed, setStudentDailyExternalPuzzlePassed] = useState<Record<string, number>>({});
  const [studentDailyExternalPuzzleFailed, setStudentDailyExternalPuzzleFailed] = useState<Record<string, number>>({});
  const [dailyTargetDrafts, setDailyTargetDrafts] = useState<Record<string, StudentDailyTarget>>({});
  const [assignDailyTargetDrafts, setAssignDailyTargetDrafts] = useState<Record<string, StudentDailyTarget>>({});
  const [assignDefaultTargets, setAssignDefaultTargets] = useState<StudentDailyTarget>({
    dailyGameTarget: 0,
    dailyPuzzleTarget: 0,
    minPuzzleAccuracyPct: 60,
  });
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | StudentHwStat['status']>('all');
  const [assignTitle, setAssignTitle] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('');
  const [assignMode, setAssignMode] = useState<'groups' | 'students'>('groups');
  const [assignSelectedGroups, setAssignSelectedGroups] = useState<string[]>([]);
  const [assignSelectedStudents, setAssignSelectedStudents] = useState<string[]>([]);
  const [assignSelectedPuzzles, setAssignSelectedPuzzles] = useState<string[]>([]);
  const [assignPuzzleSearch, setAssignPuzzleSearch] = useState('');
  const [editingWeeklyStudentId, setEditingWeeklyStudentId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<HomeworkPanelTab>('odev');
  const [targetFilter, setTargetFilter] = useState<TargetFilter>(EMPTY_TARGET);
  const [programStudentId, setProgramStudentId] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(() => todayDayKey());
  const [analysisView, setAnalysisView] = useState<'list' | 'detail'>('list');

  useEffect(() => {
    const tick = () => {
      const today = todayDayKey();
      setViewDate((prev) => (isToday(prev) ? today : prev));
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const handleTargetChange = useCallback((patch: Partial<TargetFilter>) => {
    setTargetFilter((prev) => ({ ...prev, ...patch }));
  }, []);

  const targetStudents = useMemo(
    () => filterStudentsByTarget(students, targetFilter, trainingGroups),
    [students, targetFilter, trainingGroups],
  );

  const targetStudentIds = useMemo(() => new Set(targetStudents.map((s) => s.id)), [targetStudents]);

  const openHomeworkDetail = useCallback((homeworkId: string) => {
    setSelectedHwId(homeworkId);
    setAnalysisView('detail');
    setDetailStat(null);
    setStudentSearch('');
    setStatusFilter('all');
  }, []);

  const backToHomeworkList = useCallback(() => {
    setAnalysisView('list');
    setDetailStat(null);
  }, []);

  /** Ödev Takibi sayfası açıldığında localStorage'dan güncel denemeleri ve teslimleri çek (öğrenci aynı/başka sekmede hamle yaptıysa admin görsün) */
  useEffect(() => {
    refreshFromStorage();
  }, [refreshFromStorage]);

  /** Supabase modunda teslim/deneme verileri acik ekranda da guncel kalsin. */
  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshFromStorage();
    }, 12000);
    const onFocus = () => {
      refreshFromStorage();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshFromStorage]);

  useEffect(() => {
    setAiResult(null);
  }, [detailStat?.studentId]);

  const selectedHw = useMemo(() => {
    if (!selectedHwId || selectedHwId === ALL_HOMEWORKS_ID) return null;
    return homeworks.find(h => h.id === selectedHwId) || null;
  }, [selectedHwId, homeworks]);

  const studentGroups = useMemo(
    () => [...new Set(students.map((s) => s.group).filter(Boolean))].sort(),
    [students]
  );

  const getAssignees = useCallback((hw: HomeworkAssignment): Student[] => {
    const groups = hw.assignedTo.filter(a => a.startsWith('group:')).map(a => a.replace('group:', ''));
    const studentIds = hw.assignedTo.filter(a => !a.startsWith('group:'));
    const fromGroups = groups.length > 0 ? students.filter(s => groups.includes(s.group)) : [];
    const fromIds = studentIds.length > 0 ? students.filter(s => studentIds.includes(s.id)) : [];
    const all = [...fromGroups, ...fromIds];
    return Array.from(new Map(all.map(s => [s.id, s])).values());
  }, [students]);

  const filteredHomeworks = useMemo(() => {
    if (targetStudents.length === 0) return homeworks;
    return homeworks.filter((hw) => getAssignees(hw).some((s) => targetStudentIds.has(s.id)));
  }, [homeworks, targetStudents.length, targetStudentIds, getAssignees]);

  const hwPuzzles = useMemo(() => {
    if (!selectedHw) return [];
    return puzzles.filter(p => selectedHw.puzzles.includes(p.id));
  }, [selectedHw, puzzles]);

  const totalPoints = useMemo(() => hwPuzzles.reduce((s, p) => s + p.points, 0), [hwPuzzles]);

  const assignees = useMemo(() => selectedHw ? getAssignees(selectedHw) : [], [selectedHw, getAssignees]);

  const allAssignees = useMemo(() => {
    if (homeworks.length === 0) return [];
    const byId = new Map<string, Student>();
    for (const hw of homeworks) {
      for (const s of getAssignees(hw)) byId.set(s.id, s);
    }
    return Array.from(byId.values());
  }, [homeworks, getAssignees]);

  useEffect(() => {
    if (!selectedHw) {
      setDailyTargetDrafts({});
      return;
    }
    const next: Record<string, StudentDailyTarget> = {};
    assignees.forEach((student) => {
      const target = selectedHw.studentDailyTargets?.[student.id];
      next[student.id] = {
        dailyGameTarget: target?.dailyGameTarget ?? selectedHw.dailyGameTarget ?? 0,
        dailyPuzzleTarget: target?.dailyPuzzleTarget ?? selectedHw.dailyPuzzleTarget ?? 0,
        minPuzzleAccuracyPct: target?.minPuzzleAccuracyPct ?? selectedHw.minPuzzleAccuracyPct ?? 60,
        weeklySchedule: target?.weeklySchedule ?? undefined,
      };
    });
    setDailyTargetDrafts(next);
  }, [selectedHw?.id, assignees]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const scopeAssignees = selectedHw ? assignees : allAssignees;
      if (scopeAssignees.length === 0) {
        setStudentDailyGameCounts({});
        return;
      }
      const todayKey = viewDate;
      const rows = await Promise.all(scopeAssignees.map(async (s) => {
        const lichessUsername = s.lichessUsername?.trim();
        const chessComUsername = s.chessComUsername?.trim();
        try {
          const [lichessToday, chessComToday, lichessPuzzles, chessComPuzzles] = await Promise.all([
            lichessUsername ? fetchLichessGamesForDay(lichessUsername, todayKey) : Promise.resolve(0),
            chessComUsername ? fetchChessComGamesForDay(chessComUsername, todayKey) : Promise.resolve(0),
            lichessUsername ? fetchLichessDailyPuzzleStats(lichessUsername, todayKey) : Promise.resolve({ count: 0, passed: 0, failed: 0 }),
            chessComUsername ? fetchChessComDailyPuzzleStats(chessComUsername, todayKey) : Promise.resolve({ count: 0, passed: 0, failed: 0 }),
          ]);
          const puzzleSolved = (lichessPuzzles?.count ?? 0) + (chessComPuzzles?.count ?? 0);
          const puzzlePassed = (lichessPuzzles?.passed ?? 0) + (chessComPuzzles?.passed ?? 0);
          const puzzleFailed = (lichessPuzzles?.failed ?? 0) + (chessComPuzzles?.failed ?? 0);
          return [s.id, lichessToday + chessComToday, puzzleSolved, puzzlePassed, puzzleFailed] as const;
        } catch {
          return [s.id, 0, 0, 0, 0] as const;
        }
      }));
      if (cancelled) return;
      setStudentDailyGameCounts(Object.fromEntries(rows.map(([sid, gc]) => [sid, gc])));
      setStudentDailyExternalPuzzleCounts(Object.fromEntries(rows.map(([sid, _gc, pc]) => [sid, pc])));
      setStudentDailyExternalPuzzlePassed(Object.fromEntries(rows.map(([sid, _gc, _pc, pp]) => [sid, pp])));
      setStudentDailyExternalPuzzleFailed(Object.fromEntries(rows.map(([sid, _gc, _pc, _pp, pf]) => [sid, pf])));
    };
    void run();
    return () => { cancelled = true; };
  }, [selectedHw?.id, assignees, allAssignees, viewDate]);

  const buildStatsForHomework = useCallback((hw: HomeworkAssignment): StudentHwStat[] => {
    const hwAssignees = getAssignees(hw);
    return hwAssignees.map(student => {
      const submitted = homeworkSubmissions.some(
        s => s.studentId === student.id && s.homeworkId === hw.id
      );
      const attempts = homeworkAttempts.filter(
        a => a.homeworkId === hw.id && a.studentId === student.id
      );
      const { correct, wrong, skipped } = countPerPuzzleResults(hw.puzzles, attempts);
      const answered = correct + wrong;
      const points = hw.puzzles.reduce((sum, puzzleId) => {
        if (!attempts.some((a) => a.puzzleId === puzzleId && a.correct)) return sum;
        return sum + (puzzles.find((p) => p.id === puzzleId)?.points ?? 0);
      }, 0);
      const totalPuzzles = hw.puzzles.length;
      const progress = totalPuzzles > 0 ? Math.round((answered / totalPuzzles) * 100) : 0;
      const status = homeworkStatusFromPuzzles(submitted, totalPuzzles, attempts.length, answered);
      const timeSeconds = studentTotalThinkSeconds(attempts);
      const names = student.name.split(' ');
      const initials = names.length >= 2 ? (names[0][0] + names[names.length - 1][0]).toUpperCase() : student.name.substring(0, 2).toUpperCase();
      const todayKey = viewDate;
      const todayAttempts = attempts.filter(a => a.timestamp?.slice(0, 10) === todayKey);
      const internalTodayPuzzleSolved = todayAttempts.length;
      const todayPuzzleCorrect = todayAttempts.filter(a => a.correct).length;
      const { todayPuzzleSolved, todayPuzzleAccuracy, todayPuzzleCorrect: dailyCorrect, todayPuzzleWrong: dailyWrong } = computeDailyPuzzleProgress(
        internalTodayPuzzleSolved,
        todayPuzzleCorrect,
        studentDailyExternalPuzzleCounts[student.id] ?? 0,
        studentDailyExternalPuzzlePassed[student.id] ?? 0,
        studentDailyExternalPuzzleFailed[student.id] ?? 0,
      );
      const target = hw.studentDailyTargets?.[student.id];
      const currentDayKey = weekdayKeyFromIso(viewDate);
      const dayTarget = target?.weeklySchedule?.[currentDayKey];

      const dailyGameTarget = Math.max(0, dayTarget?.dailyGameTarget ?? target?.dailyGameTarget ?? hw.dailyGameTarget ?? 0);
      const dailyPuzzleTarget = Math.max(0, dayTarget?.dailyPuzzleTarget ?? target?.dailyPuzzleTarget ?? hw.dailyPuzzleTarget ?? 0);
      const minPuzzleAccuracy = Math.max(0, Math.min(100, dayTarget?.minPuzzleAccuracyPct ?? target?.minPuzzleAccuracyPct ?? hw.minPuzzleAccuracyPct ?? 60));

      const gameGoalMet = dailyGameTarget <= 0 ? true : (studentDailyGameCounts[student.id] ?? 0) >= dailyGameTarget;
      const puzzleGoalMet = dailyPuzzleTarget <= 0 ? true : (todayPuzzleSolved >= dailyPuzzleTarget && todayPuzzleAccuracy >= minPuzzleAccuracy);
      const dailyGoalDone = gameGoalMet && puzzleGoalMet;

      return applyDailyDisplayToStat({
        studentId: student.id,
        name: student.name,
        initials,
        correct,
        wrong,
        skipped,
        points,
        timeSeconds,
        progress: submitted ? Math.max(progress, 100) : (status === 'Başlamadı' ? 0 : progress),
        status,
        dailyGoalDone,
        todayGames: studentDailyGameCounts[student.id] ?? 0,
        todayPuzzleSolved,
        todayPuzzleAccuracy,
        todayPuzzleCorrect: dailyCorrect,
        todayPuzzleWrong: dailyWrong,
        dailyGameTarget,
        dailyPuzzleTarget,
        minPuzzleAccuracyPct: minPuzzleAccuracy,
      }, { hasPuzzleHomework: hw.puzzles.length > 0, attemptCount: attempts.length });
    });
  }, [getAssignees, homeworkAttempts, homeworkSubmissions, puzzles, studentDailyExternalPuzzleCounts, studentDailyExternalPuzzlePassed, studentDailyExternalPuzzleFailed, studentDailyGameCounts, viewDate]);

  const stats: StudentHwStat[] = useMemo(() => {
    if (!selectedHw) return [];
    return assignees.map(student => {
      const submitted = homeworkSubmissions.some(
        s => s.studentId === student.id && s.homeworkId === selectedHw.id
      );
      const attempts = homeworkAttempts.filter(
        a => a.homeworkId === selectedHw.id && a.studentId === student.id
      );
      const { correct, wrong, skipped } = countPerPuzzleResults(selectedHw.puzzles, attempts);
      const answered = correct + wrong;
      const points = selectedHw.puzzles.reduce((sum, puzzleId) => {
        if (!attempts.some((a) => a.puzzleId === puzzleId && a.correct)) return sum;
        return sum + (puzzles.find((p) => p.id === puzzleId)?.points ?? 0);
      }, 0);
      const totalPuzzles = selectedHw.puzzles.length;
      const progress = totalPuzzles > 0 ? Math.round((answered / totalPuzzles) * 100) : 0;
      const status = homeworkStatusFromPuzzles(submitted, totalPuzzles, attempts.length, answered);
      const timeSeconds = studentTotalThinkSeconds(attempts);
      const names = student.name.split(' ');
      const initials = names.length >= 2 ? (names[0][0] + names[names.length - 1][0]).toUpperCase() : student.name.substring(0, 2).toUpperCase();
      const todayKey = viewDate;
      const todayAttempts = attempts.filter(a => a.timestamp?.slice(0, 10) === todayKey);
      const internalTodayPuzzleSolved = todayAttempts.length;
      const todayPuzzleCorrect = todayAttempts.filter(a => a.correct).length;
      const { todayPuzzleSolved, todayPuzzleAccuracy, todayPuzzleCorrect: dailyCorrect, todayPuzzleWrong: dailyWrong } = computeDailyPuzzleProgress(
        internalTodayPuzzleSolved,
        todayPuzzleCorrect,
        studentDailyExternalPuzzleCounts[student.id] ?? 0,
        studentDailyExternalPuzzlePassed[student.id] ?? 0,
        studentDailyExternalPuzzleFailed[student.id] ?? 0,
      );
      const target = selectedHw.studentDailyTargets?.[student.id];
      const currentDayKey = weekdayKeyFromIso(viewDate);
      const dayTarget = target?.weeklySchedule?.[currentDayKey];

      const dailyGameTarget = Math.max(0, dayTarget?.dailyGameTarget ?? target?.dailyGameTarget ?? selectedHw.dailyGameTarget ?? 0);
      const dailyPuzzleTarget = Math.max(0, dayTarget?.dailyPuzzleTarget ?? target?.dailyPuzzleTarget ?? selectedHw.dailyPuzzleTarget ?? 0);
      const minPuzzleAccuracy = Math.max(0, Math.min(100, dayTarget?.minPuzzleAccuracyPct ?? target?.minPuzzleAccuracyPct ?? selectedHw.minPuzzleAccuracyPct ?? 60));
      
      const gameGoalMet = dailyGameTarget <= 0 ? true : (studentDailyGameCounts[student.id] ?? 0) >= dailyGameTarget;
      const puzzleGoalMet = dailyPuzzleTarget <= 0 ? true : (todayPuzzleSolved >= dailyPuzzleTarget && todayPuzzleAccuracy >= minPuzzleAccuracy);
      const dailyGoalDone = gameGoalMet && puzzleGoalMet;
      return applyDailyDisplayToStat({
        studentId: student.id,
        name: student.name,
        initials,
        correct,
        wrong,
        skipped,
        points,
        timeSeconds,
        progress: submitted ? Math.max(progress, 100) : (status === 'Başlamadı' ? 0 : progress),
        status,
        dailyGoalDone,
        todayGames: studentDailyGameCounts[student.id] ?? 0,
        todayPuzzleSolved,
        todayPuzzleAccuracy,
        todayPuzzleCorrect: dailyCorrect,
        todayPuzzleWrong: dailyWrong,
        dailyGameTarget,
        dailyPuzzleTarget,
        minPuzzleAccuracyPct: minPuzzleAccuracy,
      }, { hasPuzzleHomework: selectedHw.puzzles.length > 0, attemptCount: attempts.length });
    });
  }, [assignees, selectedHw, homeworkAttempts, homeworkSubmissions, puzzles, studentDailyGameCounts, studentDailyExternalPuzzleCounts, studentDailyExternalPuzzlePassed, studentDailyExternalPuzzleFailed, viewDate]);

  const allModeStats: StudentHwStat[] = useMemo(() => {
    if (selectedHw != null) return [];
    if (homeworks.length === 0) return [];
    const byStudent = new Map<string, { student: Student; hwStats: StudentHwStat[] }>();
    for (const hw of homeworks) {
      const perHw = buildStatsForHomework(hw);
      for (const s of perHw) {
        const existing = byStudent.get(s.studentId);
        if (existing) existing.hwStats.push(s);
        else {
          const st = students.find(x => x.id === s.studentId);
          if (st) byStudent.set(s.studentId, { student: st, hwStats: [s] });
        }
      }
    }

    const out: StudentHwStat[] = [];
    for (const { student, hwStats } of byStudent.values()) {
      const total = hwStats.length;
      const completed = hwStats.filter(h => h.status === 'Tamamlandı').length;
      const started = hwStats.some(h => h.status !== 'Başlamadı');
      const status: StudentHwStat['status'] =
        total > 0 && completed === total ? 'Tamamlandı'
          : started ? 'Devam Ediyor'
          : 'Başlamadı';
      const correct = hwStats.reduce((s, h) => s + h.correct, 0);
      const wrong = hwStats.reduce((s, h) => s + h.wrong, 0);
      const skipped = hwStats.reduce((s, h) => s + (h.skipped ?? 0), 0);
      const points = hwStats.reduce((s, h) => s + h.points, 0);
      const timeSeconds = hwStats.reduce((s, h) => s + h.timeSeconds, 0);
      const progress = total > 0 ? Math.round(hwStats.reduce((s, h) => s + (h.progress ?? 0), 0) / total) : 0;
      const names = student.name.split(' ');
      const initials = names.length >= 2 ? (names[0][0] + names[names.length - 1][0]).toUpperCase() : student.name.substring(0, 2).toUpperCase();
      const dailyGoalDone = hwStats.some((h) => h.dailyGoalDone);
      const dailyGameTarget = Math.max(...hwStats.map((h) => h.dailyGameTarget ?? 0), 0);
      const dailyPuzzleTarget = Math.max(...hwStats.map((h) => h.dailyPuzzleTarget ?? 0), 0);
      const todayGames = Math.max(...hwStats.map((h) => h.todayGames ?? 0), 0);
      const todayPuzzleSolved = Math.max(...hwStats.map((h) => h.todayPuzzleSolved ?? 0), 0);
      out.push({
        studentId: student.id,
        name: student.name,
        initials,
        correct,
        wrong,
        skipped,
        points,
        timeSeconds,
        progress,
        status,
        dailyGoalDone,
        todayGames,
        todayPuzzleSolved,
        dailyGameTarget,
        dailyPuzzleTarget,
      });
    }
    return out;
  }, [selectedHw, homeworks, buildStatsForHomework, students]);

  const effectiveStats = selectedHw ? stats : allModeStats;
  const sortedStats = useMemo(() => [...effectiveStats].sort((a, b) => b.points - a.points), [effectiveStats]);

  const filteredStats = useMemo(() => {
    if (targetStudents.length === 0) return sortedStats;
    return sortedStats.filter((s) => targetStudentIds.has(s.studentId));
  }, [sortedStats, targetStudents.length, targetStudentIds]);

  const displayStats = useMemo(() => {
    let list = filteredStats;
    if (statusFilter !== 'all') list = list.filter((s) => s.status === statusFilter);
    const q = studentSearch.trim().toLowerCase();
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q));
    return list;
  }, [filteredStats, statusFilter, studentSearch]);

  const summaryCounts = useMemo(() => ({
    total: filteredStats.length,
    completed: filteredStats.filter((s) => s.status === 'Tamamlandı').length,
    inProgress: filteredStats.filter((s) => s.status === 'Devam Ediyor').length,
    notStarted: filteredStats.filter((s) => s.status === 'Başlamadı').length,
    avgProgress: filteredStats.length
      ? Math.round(filteredStats.reduce((sum, st) => sum + st.progress, 0) / filteredStats.length)
      : 0,
  }), [filteredStats]);

  const programStudents = useMemo(() => {
    if (!selectedHw) return targetStudents;
    return targetStudents.filter((s) => assignees.some((a) => a.id === s.id));
  }, [selectedHw, targetStudents, assignees]);

  const programDayCompletion = useMemo((): Record<number, DayCompletionStatus> => {
    if (!selectedHw) return {};
    const studentId = programStudentId ?? programStudents[0]?.id;
    if (!studentId) return {};
    const draft = dailyTargetDrafts[studentId] ?? {};
    const today = todayDayKey();
    const monday = mondayOfWeek();
    const out: Record<number, DayCompletionStatus> = {};
    for (let day = 1; day <= 7; day++) {
      const dayData = draft.weeklySchedule?.[day] ?? {};
      const gameTarget = Math.max(0, dayData.dailyGameTarget ?? draft.dailyGameTarget ?? selectedHw.dailyGameTarget ?? 0);
      const puzzleTarget = Math.max(0, dayData.dailyPuzzleTarget ?? draft.dailyPuzzleTarget ?? selectedHw.dailyPuzzleTarget ?? 0);
      if (gameTarget <= 0 && puzzleTarget <= 0) {
        out[day] = 'none';
        continue;
      }
      const iso = isoDateForWeekday(monday, day);
      const isFuture = iso > today;
      const dayAttempts = homeworkAttempts.filter(
        (a) => a.homeworkId === selectedHw.id && a.studentId === studentId && a.timestamp?.slice(0, 10) === iso,
      );
      const puzzleSolved = dayAttempts.length;
      const puzzleCorrect = dayAttempts.filter((a) => a.correct).length;
      const puzzleAcc = puzzleSolved > 0 ? (puzzleCorrect / puzzleSolved) * 100 : 0;
      const minAcc = Math.max(0, Math.min(100, dayData.minPuzzleAccuracyPct ?? draft.minPuzzleAccuracyPct ?? selectedHw.minPuzzleAccuracyPct ?? 60));
      const puzzleMet = puzzleTarget <= 0 || (puzzleSolved >= puzzleTarget && puzzleAcc >= minAcc);
      const gamesMet = gameTarget <= 0
        ? true
        : iso === today
          ? (studentDailyGameCounts[studentId] ?? 0) >= gameTarget
          : true;
      const done = puzzleMet && gamesMet;
      if (isFuture) out[day] = 'pending';
      else if (done) out[day] = 'done';
      else if (iso === today) out[day] = 'pending';
      else out[day] = 'missed';
    }
    return out;
  }, [selectedHw, programStudentId, programStudents, dailyTargetDrafts, homeworkAttempts, studentDailyGameCounts]);

  const handleResetStudent = useCallback((studentId: string) => {
    if (!window.confirm('Bu öğrencinin ödev denemeleri sıfırlanacak. Emin misiniz?')) return;
    if (selectedHw) {
      void resetHomeworkAttemptsForStudent(studentId, selectedHw.id);
      void removeHomeworkSubmission(studentId, selectedHw.id);
    } else {
      for (const hw of homeworks) {
        if (getAssignees(hw).some((s) => s.id === studentId)) {
          void resetHomeworkAttemptsForStudent(studentId, hw.id);
          void removeHomeworkSubmission(studentId, hw.id);
        }
      }
    }
  }, [selectedHw, homeworks, getAssignees, resetHomeworkAttemptsForStudent, removeHomeworkSubmission]);

  const handleProgramDayChange = useCallback((studentId: string, day: number, patch: Partial<NonNullable<StudentDailyTarget['weeklySchedule']>[number]>) => {
    setDailyTargetDrafts((prev) => {
      const cur = prev[studentId] ?? {};
      const schedule = { ...(cur.weeklySchedule ?? {}), [day]: { ...(cur.weeklySchedule?.[day] ?? {}), ...patch } };
      return { ...prev, [studentId]: { ...cur, weeklySchedule: schedule } };
    });
  }, []);

  const handleProgramDraftChange = useCallback((studentId: string, patch: Partial<StudentDailyTarget>) => {
    setDailyTargetDrafts((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  }, []);

  const summary = useMemo(() => {
    const completed = effectiveStats.filter(s => s.status === 'Tamamlandı').length;
    const inProgress = effectiveStats.filter(s => s.status === 'Devam Ediyor').length;
    const notStarted = effectiveStats.filter(s => s.status === 'Başlamadı').length;
    const avgPoints = effectiveStats.length > 0 ? Math.round(effectiveStats.reduce((s, st) => s + st.points, 0) / effectiveStats.length) : 0;
    const avgProgress = effectiveStats.length > 0 ? Math.round(effectiveStats.reduce((s, st) => s + st.progress, 0) / effectiveStats.length) : 0;
    return { completed, inProgress, notStarted, avgPoints, avgProgress };
  }, [effectiveStats]);

  const showDailyTracking = useMemo(() => {
    if (selectedHw) {
      return stats.some((s) => (s.dailyGameTarget ?? 0) > 0 || (s.dailyPuzzleTarget ?? 0) > 0);
    }
    return homeworks.some(
      (hw) =>
        (hw.dailyGameTarget ?? 0) > 0
        || (hw.dailyPuzzleTarget ?? 0) > 0
        || Object.values(hw.studentDailyTargets ?? {}).some(
          (t) => (t.dailyGameTarget ?? 0) > 0 || (t.dailyPuzzleTarget ?? 0) > 0,
        ),
    );
  }, [selectedHw, stats, homeworks]);

  const loadedAttemptCount = homeworkAttempts.length;

  const isOverdue = selectedHw?.dueDate
    ? new Date(selectedHw.dueDate) < new Date()
    : false;

  const assignFormStudents = useMemo(() => {
    if (assignMode === 'groups') {
      if (assignSelectedGroups.length === 0) return [];
      return students.filter((s) => assignSelectedGroups.includes(s.group));
    }
    return students.filter((s) => assignSelectedStudents.includes(s.id));
  }, [students, assignMode, assignSelectedGroups, assignSelectedStudents]);

  useEffect(() => {
    setAssignDailyTargetDrafts((prev) => {
      const next = { ...prev };
      const ids = new Set(assignFormStudents.map((s) => s.id));
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) delete next[id];
      }
      for (const s of assignFormStudents) {
        if (!next[s.id]) {
          next[s.id] = { dailyGameTarget: 0, dailyPuzzleTarget: 0, minPuzzleAccuracyPct: 60 };
        }
      }
      return next;
    });
  }, [assignFormStudents]);

  const assignFilteredPuzzles = useMemo(() => {
    const q = assignPuzzleSearch.trim().toLowerCase();
    if (!q) return puzzles;
    return puzzles.filter((p) =>
      p.title.toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.theme || '').toLowerCase().includes(q)
    );
  }, [puzzles, assignPuzzleSearch]);

  const toggleAssignPuzzle = useCallback((id: string) => {
    setAssignSelectedPuzzles((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const toggleAssignGroup = useCallback((group: string) => {
    setAssignSelectedGroups((prev) => (prev.includes(group) ? prev.filter((x) => x !== group) : [...prev, group]));
  }, []);

  const toggleAssignStudent = useCallback((studentId: string) => {
    setAssignSelectedStudents((prev) => (prev.includes(studentId) ? prev.filter((x) => x !== studentId) : [...prev, studentId]));
  }, []);

  const resetAssignForm = useCallback(() => {
    setAssignTitle('');
    setAssignDueDate('');
    setAssignSelectedPuzzles([]);
    setAssignSelectedGroups([]);
    setAssignSelectedStudents([]);
    setAssignPuzzleSearch('');
    setAssignMode('groups');
    setAssignDailyTargetDrafts({});
    setAssignDefaultTargets({ dailyGameTarget: 0, dailyPuzzleTarget: 0, minPuzzleAccuracyPct: 60 });
  }, []);

  const applyAssignDefaultsToAll = useCallback(() => {
    setAssignDailyTargetDrafts((prev) => {
      const next = { ...prev };
      for (const s of assignFormStudents) {
        next[s.id] = {
          dailyGameTarget: assignDefaultTargets.dailyGameTarget ?? 0,
          dailyPuzzleTarget: assignDefaultTargets.dailyPuzzleTarget ?? 0,
          minPuzzleAccuracyPct: assignDefaultTargets.minPuzzleAccuracyPct ?? 60,
        };
      }
      return next;
    });
  }, [assignFormStudents, assignDefaultTargets]);

  const handleCreateAssignment = useCallback(() => {
    if (!assignTitle.trim()) return;
    const selectedTargets =
      assignMode === 'groups'
        ? assignSelectedGroups.map((g) => `group:${g}`)
        : assignSelectedStudents;
    if (selectedTargets.length === 0) return;

    const studentDailyTargets: Record<string, StudentDailyTarget> = {};
    for (const s of assignFormStudents) {
      const t = assignDailyTargetDrafts[s.id];
      if (!t) continue;
      const dailyGameTarget = Math.max(0, Number(t.dailyGameTarget) || 0);
      const dailyPuzzleTarget = Math.max(0, Number(t.dailyPuzzleTarget) || 0);
      const minPuzzleAccuracyPct = Math.max(0, Math.min(100, Number(t.minPuzzleAccuracyPct) || 60));
      if (dailyGameTarget > 0 || dailyPuzzleTarget > 0 || t.weeklySchedule) {
        studentDailyTargets[s.id] = {
          dailyGameTarget,
          dailyPuzzleTarget,
          minPuzzleAccuracyPct,
          weeklySchedule: t.weeklySchedule,
        };
      }
    }

    addHomework({
      title: assignTitle.trim(),
      puzzles: assignSelectedPuzzles,
      dueDate: assignDueDate.trim(),
      assignedTo: selectedTargets,
      studentDailyTargets: Object.keys(studentDailyTargets).length > 0 ? studentDailyTargets : undefined,
    });
    resetAssignForm();
    setShowAssignForm(false);
  }, [
    addHomework,
    assignDailyTargetDrafts,
    assignDueDate,
    assignFormStudents,
    assignMode,
    assignSelectedGroups,
    assignSelectedPuzzles,
    assignSelectedStudents,
    assignTitle,
    resetAssignForm,
  ]);

  const saveStudentDailyTargets = useCallback(() => {
    if (!selectedHw) return;
    const payload: Record<string, StudentDailyTarget> = {};
    Object.entries(dailyTargetDrafts).forEach(([studentId, t]) => {
      payload[studentId] = {
        dailyGameTarget: Math.max(0, Number(t.dailyGameTarget) || 0),
        dailyPuzzleTarget: Math.max(0, Number(t.dailyPuzzleTarget) || 0),
        minPuzzleAccuracyPct: Math.max(0, Math.min(100, Number(t.minPuzzleAccuracyPct) || 60)),
        weeklySchedule: t.weeklySchedule,
      };
    });
    updateHomework(selectedHw.id, { studentDailyTargets: payload });
  }, [selectedHw, dailyTargetDrafts, updateHomework]);

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="relative z-30 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 rounded-2xl border border-white/[0.06] bg-[#0f172a]/50 backdrop-blur-sm px-5 py-4">
        <div className="flex items-start gap-4">
          <div className="hidden sm:flex w-11 h-11 rounded-xl premium-gradient items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
            <CheckSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Ödev Yönetimi
            </h2>
            {analysisView === 'detail' && selectedHw ? (
              <p className="text-slate-400 text-sm mt-0.5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={backToHomeworkList} className="text-indigo-400 hover:text-indigo-300 font-semibold">
                  ← Atama listesi
                </button>
                <span className="text-slate-600">·</span>
                <span>{selectedHw.title}</span>
                <span className="text-slate-600">·</span>
                <span className="text-indigo-300/80">{selectedHw.puzzles.length} bulmaca</span>
              </p>
            ) : selectedHw ? (
              <p className="text-slate-400 text-sm mt-0.5 flex flex-wrap items-center gap-2">
                <span>{selectedHw.title}</span>
                <span className="text-slate-600">·</span>
                <span className="text-indigo-300/80">{selectedHw.puzzles.length} soru</span>
                {isOverdue && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[10px] font-bold uppercase">
                    Süresi doldu
                  </span>
                )}
              </p>
            ) : (
              <p className="text-slate-400 text-sm mt-0.5">
                {homeworks.length > 0 ? (
                  <>
                    <span className="text-slate-300">{homeworks.length} atama</span>
                    <span className="text-slate-600 mx-1.5">·</span>
                    <span>aktif atama listesi</span>
                    <span className="text-slate-600 mx-1.5">·</span>
                    <span className="text-slate-500">{loadedAttemptCount} deneme kaydı</span>
                  </>
                ) : (
                  'Henüz ödev yok — yeni atama oluşturun'
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <button
            type="button"
            onClick={() => setShowAssignForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2.5 premium-gradient rounded-xl text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40"
          >
            <Plus className="w-4 h-4" />
            {showAssignForm ? 'Formu Kapat' : 'Yeni Ödev Ata'}
          </button>
          <button
            type="button"
            onClick={() => refreshFromStorage()}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.08] transition-all"
            title="Öğrenci denemelerini ve teslimleri yeniden yükle"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Yenile</span>
          </button>
          {homeworks.length > 0 && (
          <div className="relative z-40 flex-1 sm:flex-none">
            <button onClick={() => setShowHwPicker(!showHwPicker)} className="flex items-center gap-2 w-full sm:w-auto px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm font-semibold text-white hover:bg-white/[0.08] transition-all">
              <Filter className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="truncate max-w-[140px]">{selectedHw?.title || 'Tüm Ödevler'}</span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${showHwPicker ? 'rotate-180' : ''}`} />
            </button>
            {showHwPicker && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-[#0f172a] border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden">
                <div className="max-h-[min(70vh,480px)] overflow-y-auto custom-scrollbar">
                  <button
                    onClick={() => { setSelectedHwId(ALL_HOMEWORKS_ID); setAnalysisView('list'); setShowHwPicker(false); }}
                    className={`w-full text-left p-4 border-b border-white/5 hover:bg-white/5 transition-colors ${selectedHwId === ALL_HOMEWORKS_ID && analysisView === 'list' ? 'bg-indigo-600/10' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full flex-shrink-0 bg-indigo-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">Tüm Ödevler</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{homeworks.length} atama · genel durum</p>
                      </div>
                      {selectedHwId === ALL_HOMEWORKS_ID && <CheckSquare className="w-4 h-4 text-indigo-400 flex-shrink-0" />}
                    </div>
                  </button>
                  {homeworks.map(hw => {
                    const active = selectedHwId === hw.id;
                    const hwAssignees = getAssignees(hw);
                    const overdue = !!hw.dueDate && new Date(hw.dueDate) < new Date();
                    return (
                      <button key={hw.id} onClick={() => { openHomeworkDetail(hw.id); setShowHwPicker(false); }} className={`w-full text-left p-4 border-b border-white/5 hover:bg-white/5 transition-colors ${active && analysisView === 'detail' ? 'bg-indigo-600/10' : ''}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${overdue ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{hw.title}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {hw.puzzles.length} bulmaca · {hwAssignees.length} öğrenci
                              {hw.dueDate
                                ? ` · ${new Date(hw.dueDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`
                                : ' · Kalıcı ödev'}
                            </p>
                          </div>
                          {active && <CheckSquare className="w-4 h-4 text-indigo-400 flex-shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {showAssignForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowAssignForm(false)}>
        <div className="bg-[#1e293b] border border-white/10 rounded-2xl p-6 space-y-5 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-white tracking-wide">Yeni Ödev Ataması</h3>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
              {assignSelectedPuzzles.length} Bulmaca · {assignMode === 'groups' ? assignSelectedGroups.length : assignSelectedStudents.length} Hedef
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Ödev Başlığı</p>
              <input
                value={assignTitle}
                onChange={(e) => setAssignTitle(e.target.value)}
                placeholder="Örn: Haftalık Taktik Ödevi"
                className="input-base w-full"
              />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                Son Teslim Tarihi <span className="text-slate-600 font-bold normal-case">(isteğe bağlı)</span>
              </p>
              <input
                type="date"
                value={assignDueDate}
                onChange={(e) => setAssignDueDate(e.target.value)}
                className="input-base w-full [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="flex bg-black/30 p-1 rounded-lg w-full sm:w-fit">
            <button
              type="button"
              onClick={() => setAssignMode('groups')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${assignMode === 'groups' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Gruplara Ata
            </button>
            <button
              type="button"
              onClick={() => setAssignMode('students')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${assignMode === 'students' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Öğrencilere Ata
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-black/20 border border-white/10 rounded-lg p-4 space-y-2">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Atanacaklar</p>
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                {assignMode === 'groups'
                  ? studentGroups.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleAssignGroup(g)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                          assignSelectedGroups.includes(g) ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30' : 'bg-slate-800/60 text-slate-300 border border-transparent hover:border-white/10'
                        }`}
                      >
                        {g}
                      </button>
                    ))
                  : students.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleAssignStudent(s.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                          assignSelectedStudents.includes(s.id) ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30' : 'bg-slate-800/60 text-slate-300 border border-transparent hover:border-white/10'
                        }`}
                      >
                        <span className="block truncate">{s.name}</span>
                        <span className="text-[10px] text-slate-500">{s.group}</span>
                      </button>
                    ))}
              </div>
            </div>

            <div className="bg-black/20 border border-white/10 rounded-lg p-4 space-y-2">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                Bulmacalar <span className="text-slate-600 font-bold normal-case">(isteğe bağlı)</span>
              </p>
              <input
                value={assignPuzzleSearch}
                onChange={(e) => setAssignPuzzleSearch(e.target.value)}
                placeholder="Bulmaca ara..."
                className="input-base w-full"
              />
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                {assignFilteredPuzzles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleAssignPuzzle(p.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                      assignSelectedPuzzles.includes(p.id) ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800/60 text-slate-300 border border-transparent hover:border-white/10'
                    }`}
                  >
                    <span className="block truncate">{p.title}</span>
                    <span className="text-[10px] text-slate-500">{p.difficulty} · {p.points}p</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {assignFormStudents.length > 0 ? (
            <div className="bg-black/20 border border-indigo-500/20 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-white">Günlük Hedefler (isteğe bağlı)</h4>
                <p className="text-[10px] text-slate-500">
                  Maç ve bulmaca: sistem + Lichess + Chess.com
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2 p-3 rounded-lg bg-slate-900/60 border border-white/5">
                <div>
                  <p className="text-[9px] text-slate-500 uppercase mb-1">Varsayılan maç</p>
                  <input
                    type="number"
                    min={0}
                    value={numericTargetDisplay(assignDefaultTargets.dailyGameTarget)}
                    onChange={(e) => setAssignDefaultTargets((p) => ({ ...p, dailyGameTarget: parseNumericTargetInput(e.target.value) }))}
                    onFocus={() => setAssignDefaultTargets((p) => ({ ...p, dailyGameTarget: clearZeroOnFocus(p.dailyGameTarget) }))}
                    onBlur={(e) => { if (e.target.value === '') setAssignDefaultTargets((p) => ({ ...p, dailyGameTarget: 0 })); }}
                    className="input-base w-20"
                  />
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase mb-1">Varsayılan bulmaca</p>
                  <input
                    type="number"
                    min={0}
                    value={numericTargetDisplay(assignDefaultTargets.dailyPuzzleTarget)}
                    onChange={(e) => setAssignDefaultTargets((p) => ({ ...p, dailyPuzzleTarget: parseNumericTargetInput(e.target.value) }))}
                    onFocus={() => setAssignDefaultTargets((p) => ({ ...p, dailyPuzzleTarget: clearZeroOnFocus(p.dailyPuzzleTarget) }))}
                    onBlur={(e) => { if (e.target.value === '') setAssignDefaultTargets((p) => ({ ...p, dailyPuzzleTarget: 0 })); }}
                    className="input-base w-20"
                  />
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase mb-1">Min %</p>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={numericTargetDisplay(assignDefaultTargets.minPuzzleAccuracyPct)}
                    onChange={(e) => setAssignDefaultTargets((p) => ({ ...p, minPuzzleAccuracyPct: parseNumericTargetInput(e.target.value) }))}
                    onFocus={() => setAssignDefaultTargets((p) => ({ ...p, minPuzzleAccuracyPct: clearZeroOnFocus(p.minPuzzleAccuracyPct ?? 60) }))}
                    onBlur={(e) => { if (e.target.value === '') setAssignDefaultTargets((p) => ({ ...p, minPuzzleAccuracyPct: 60 })); }}
                    className="input-base w-20"
                  />
                </div>
                <button
                  type="button"
                  onClick={applyAssignDefaultsToAll}
                  className="px-3 py-2 rounded-lg bg-indigo-600/30 text-indigo-300 text-xs font-bold hover:bg-indigo-600/50"
                >
                  Tüm öğrencilere uygula
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <ResponsiveTable minWidth={480}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 uppercase tracking-wider">
                      <th className="text-left py-2 pr-2">Öğrenci</th>
                      <th className="text-left py-2 px-2">Günlük maç</th>
                      <th className="text-left py-2 px-2">Günlük bulmaca</th>
                      <th className="text-left py-2 pl-2">Min. doğruluk %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignFormStudents.map((student) => {
                      const draft = assignDailyTargetDrafts[student.id] ?? {};
                      return (
                        <tr key={student.id} className="border-t border-white/5">
                          <td data-label="Öğrenci" className="py-2 pr-2 text-slate-200 font-medium">{student.name}</td>
                          <td data-label="Günlük maç" className="py-2 px-2">
                            <input
                              type="number"
                              min={0}
                              value={numericTargetDisplay(draft.dailyGameTarget)}
                              onChange={(e) => setAssignDailyTargetDrafts((prev) => ({
                                ...prev,
                                [student.id]: { ...prev[student.id], dailyGameTarget: parseNumericTargetInput(e.target.value) },
                              }))}
                              onFocus={() => setAssignDailyTargetDrafts((prev) => ({
                                ...prev,
                                [student.id]: { ...prev[student.id], dailyGameTarget: clearZeroOnFocus(prev[student.id]?.dailyGameTarget) },
                              }))}
                              onBlur={(e) => {
                                if (e.target.value === '') setAssignDailyTargetDrafts((prev) => ({
                                  ...prev,
                                  [student.id]: { ...prev[student.id], dailyGameTarget: 0 },
                                }));
                              }}
                              className="input-base w-24"
                            />
                          </td>
                          <td data-label="Günlük bulmaca" className="py-2 px-2">
                            <input
                              type="number"
                              min={0}
                              value={numericTargetDisplay(draft.dailyPuzzleTarget)}
                              onChange={(e) => setAssignDailyTargetDrafts((prev) => ({
                                ...prev,
                                [student.id]: { ...prev[student.id], dailyPuzzleTarget: parseNumericTargetInput(e.target.value) },
                              }))}
                              onFocus={() => setAssignDailyTargetDrafts((prev) => ({
                                ...prev,
                                [student.id]: { ...prev[student.id], dailyPuzzleTarget: clearZeroOnFocus(prev[student.id]?.dailyPuzzleTarget) },
                              }))}
                              onBlur={(e) => {
                                if (e.target.value === '') setAssignDailyTargetDrafts((prev) => ({
                                  ...prev,
                                  [student.id]: { ...prev[student.id], dailyPuzzleTarget: 0 },
                                }));
                              }}
                              className="input-base w-24"
                            />
                          </td>
                          <td data-label="Min. doğruluk %" className="py-2 pl-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={numericTargetDisplay(draft.minPuzzleAccuracyPct)}
                              onChange={(e) => setAssignDailyTargetDrafts((prev) => ({
                                ...prev,
                                [student.id]: { ...prev[student.id], minPuzzleAccuracyPct: parseNumericTargetInput(e.target.value) },
                              }))}
                              onFocus={() => setAssignDailyTargetDrafts((prev) => ({
                                ...prev,
                                [student.id]: { ...prev[student.id], minPuzzleAccuracyPct: clearZeroOnFocus(prev[student.id]?.minPuzzleAccuracyPct ?? 60) },
                              }))}
                              onBlur={(e) => {
                                if (e.target.value === '') setAssignDailyTargetDrafts((prev) => ({
                                  ...prev,
                                  [student.id]: { ...prev[student.id], minPuzzleAccuracyPct: 60 },
                                }));
                              }}
                              className="input-base w-24"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </ResponsiveTable>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-black/30 rounded-lg p-3 text-center border border-white/5">
              <p className="text-lg font-black text-indigo-400">{assignSelectedPuzzles.length}</p>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Bulmaca</p>
            </div>
            <div className="bg-black/30 rounded-lg p-3 text-center border border-white/5">
              <p className="text-lg font-black text-emerald-400">
                {assignMode === 'groups'
                  ? students.filter((s) => assignSelectedGroups.includes(s.group)).length
                  : assignSelectedStudents.length}
              </p>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Öğrenci</p>
            </div>
            <div className="bg-black/30 rounded-lg p-3 text-center border border-white/5">
              <p className="text-lg font-black text-amber-400">
                {puzzles
                  .filter((p) => assignSelectedPuzzles.includes(p.id))
                  .reduce((sum, p) => sum + p.points, 0)}
              </p>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Toplam Puan</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={resetAssignForm} className="px-4 py-2.5 rounded-lg text-xs bg-slate-800 text-slate-300 font-bold">
              Temizle
            </button>
            <button
              type="button"
              onClick={handleCreateAssignment}
              className="px-5 py-2.5 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider"
            >
              Ödevi Kaydet ve Ata
            </button>
          </div>
        </div>
        </div>
      )}

      <div className="relative z-0 grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-5">
        <HomeworkTargetSelector
          target={targetFilter}
          onChange={handleTargetChange}
          branchOffices={branchOffices}
          disciplineBranches={disciplineBranches}
          trainingGroups={trainingGroups}
          filteredStudents={targetStudents}
        />

        <div className="min-w-0 rounded-2xl border border-white/[0.06] bg-[#0f172a]/40 backdrop-blur-sm overflow-y-auto max-h-[calc(100vh-12rem)]">
          <div className="flex overflow-x-auto border-b border-white/[0.05] bg-black/20 scrollbar-none">
            {([
              ['odev', 'Ödev Takibi', LayoutGrid],
              ['program', 'Günlük Program', Calendar],
              ['calisma', 'Çalışmalar', BookOpen],
              ['lider', 'Lider Tablosu', Award],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPanelTab(key)}
                className={`relative flex items-center gap-2 px-5 py-3.5 text-xs font-bold whitespace-nowrap transition-colors ${
                  panelTab === key
                    ? 'text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${panelTab === key ? 'text-indigo-400' : ''}`} />
                {label}
                {panelTab === key && (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
                )}
              </button>
            ))}
          </div>

          <div className="p-4 sm:p-5 space-y-4">
          {panelTab === 'odev' && (
            <>
              {analysisView === 'list' ? (
                <HomeworkAssignmentsList
                  homeworks={filteredHomeworks}
                  students={students}
                  attempts={homeworkAttempts}
                  submissions={homeworkSubmissions}
                  onOpenDetail={openHomeworkDetail}
                />
              ) : selectedHw ? (
                <HomeworkAssignmentDetail
                  homework={selectedHw}
                  students={students}
                  puzzles={puzzles}
                  stats={stats}
                  onBack={backToHomeworkList}
                  onSelectStudent={setDetailStat}
                  onResetStudent={handleResetStudent}
                />
              ) : (
                <HomeworkAssignmentsList
                  homeworks={filteredHomeworks}
                  students={students}
                  attempts={homeworkAttempts}
                  submissions={homeworkSubmissions}
                  onOpenDetail={openHomeworkDetail}
                />
              )}
            </>
          )}

          {panelTab === 'program' && (
            selectedHw && programStudents.length > 0 ? (
              <WeeklyScheduleGrid
                students={programStudents}
                drafts={dailyTargetDrafts}
                onDraftChange={handleProgramDraftChange}
                onDayChange={handleProgramDayChange}
                onSave={saveStudentDailyTargets}
                selectedStudentId={programStudentId}
                onSelectStudent={setProgramStudentId}
                dayCompletion={programDayCompletion}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
                <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-400">
                  {selectedHw ? 'Hedef seçiminde öğrenci bulunamadı' : 'Günlük program için tek bir ödev seçin'}
                </p>
              </div>
            )
          )}

          {panelTab === 'calisma' && (
            <StudyControlSection students={targetStudents} />
          )}

          {panelTab === 'lider' && (
            <ClubLeaderboard
              allStudents={students}
              anchorStudent={targetStudents[0] ?? null}
              homeworkAttempts={homeworkAttempts}
              peerStudentsOverride={targetStudents}
            />
          )}
          </div>
        </div>
      </div>

      {selectedHw && showDailyTracking ? (
        <div className="flex flex-wrap items-center gap-3 px-1">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <Calendar className="w-3.5 h-3.5" />
            Gün:
            <input
              type="date"
              value={viewDate}
              max={todayDayKey()}
              onChange={(e) => setViewDate(e.target.value || todayDayKey())}
              className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-600 text-white text-xs [color-scheme:dark]"
            />
          </label>
          {!isToday(viewDate) ? (
            <button
              type="button"
              onClick={() => setViewDate(todayDayKey())}
              className="text-xs font-bold text-indigo-400 hover:text-indigo-300"
            >
              Bugüne dön
            </button>
          ) : null}
          <p className="text-xs text-slate-500">
            Günlük hedef: sistem + Lichess + Chess.com
          </p>
        </div>
      ) : null}

      {/* Öğrenci bulmaca detayı — 3. seviye modal */}
      {detailStat && selectedHw && (
        <StudentPuzzleDetailModal
          stat={detailStat}
          homework={selectedHw}
          puzzles={puzzles}
          attempts={homeworkAttempts}
          onClose={() => setDetailStat(null)}
        />
      )}

      {/* Genel öğrenci özeti (ödev seçilmeden — eski akış yedek) */}
      {detailStat && !selectedHw && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setDetailStat(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
          <div
            className="relative w-full max-w-[100vw] sm:max-w-4xl lg:max-w-5xl max-h-[92vh] sm:max-h-[90vh] bg-[#1e293b] border border-white/10 sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-slate-800/50 shrink-0">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-lg font-black shrink-0">
                  {detailStat.initials}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-white truncate">{detailStat.name}</h3>
                  <span className={`inline-block mt-1 px-3 py-1 rounded-lg text-xs font-bold uppercase ${detailStat.status === 'Tamamlandı' ? 'bg-emerald-500/20 text-emerald-400' : detailStat.status === 'Devam Ediyor' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-600/50 text-slate-400'}`}>
                    {detailStat.status}
                  </span>
                </div>
              </div>
              <button type="button" onClick={() => setDetailStat(null)} className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0" aria-label="Kapat">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="p-4 sm:p-6 lg:p-8">
                {/* Özet kartları + İlerleme — üst kısım */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
                  <div className="bg-slate-800/60 rounded-xl p-4 sm:p-5 border border-white/5 text-center">
                    <p className="text-2xl sm:text-3xl font-black text-emerald-400">{detailStat.correct}</p>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Doğru</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-4 sm:p-5 border border-white/5 text-center">
                    <p className="text-2xl sm:text-3xl font-black text-rose-400">{detailStat.wrong}</p>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Yanlış</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-4 sm:p-5 border border-white/5 text-center">
                    <p className="text-2xl sm:text-3xl font-black text-indigo-400">{detailStat.points}</p>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Puan</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-4 sm:p-5 border border-white/5 text-center">
                    <p className="text-xl sm:text-2xl font-black text-white">{formatTime(detailStat.timeSeconds)}</p>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Süre</p>
                  </div>
                </div>
                <div className="mb-6 sm:mb-8">
                  <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    <span>İlerleme</span>
                    <span className="text-white">%{detailStat.progress}</span>
                  </div>
                  <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div className={`h-full rounded-full transition-all ${detailStat.status === 'Tamamlandı' ? 'bg-emerald-500' : detailStat.status === 'Devam Ediyor' ? 'bg-amber-500' : 'bg-slate-600'}`} style={{ width: `${Math.min(detailStat.progress, 100)}%` }} />
                  </div>
                </div>

                {/* İşlem geçmişi — iki sütun: sol hamleler, sağ tahta */}
                {selectedHw && (() => {
                  const studentAttempts = homeworkAttempts
                    .filter(a => a.studentId === detailStat.studentId && a.homeworkId === selectedHw.id)
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                  const submission = homeworkSubmissions.find(
                    s => s.studentId === detailStat.studentId && s.homeworkId === selectedHw.id
                  );
                  if (studentAttempts.length > 0) {
                    const sortedAsc = studentAttempts;
                    return (
                      <div className="space-y-6">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
                          <Eye className="w-4 h-4 text-indigo-400" />
                          Soru bazlı sonuçlar ({studentAttempts.length} deneme)
                        </h4>
                        <div className="rounded-xl border border-white/10 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-black/30 text-[10px] text-slate-500 uppercase tracking-wider">
                                <th className="text-left py-2 px-3">Soru</th>
                                <th className="text-center py-2 px-2">Sonuç</th>
                                <th className="text-center py-2 px-2">Düşünme</th>
                                <th className="text-right py-2 px-3 hidden sm:table-cell">Zaman</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedAsc.map((a) => {
                                const think = thinkSecondsBetweenAttempts(sortedAsc, a.id);
                                return (
                                  <tr key={a.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                                    <td className="py-2 px-3 font-medium text-white truncate max-w-[12rem]">{a.puzzleTitle}</td>
                                    <td className="py-2 px-2 text-center">
                                      <span className={`px-2 py-0.5 rounded font-bold ${a.correct ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                        {a.correct ? 'Doğru' : 'Yanlış'}
                                      </span>
                                    </td>
                                    <td className="py-2 px-2 text-center text-slate-300 tabular-nums">
                                      {think != null ? formatTime(think) : '—'}
                                    </td>
                                    <td className="py-2 px-3 text-right text-slate-500 hidden sm:table-cell">
                                      {new Date(a.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="space-y-6">
                          {studentAttempts.slice().reverse().map((a) => (
                            <div key={a.id} className="bg-slate-800/40 rounded-2xl border border-white/10 overflow-hidden">
                              <div className="p-4 sm:p-5 border-b border-white/5 flex flex-wrap items-center justify-between gap-2">
                                <span className="text-base font-bold text-white">{a.puzzleTitle}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500">
                                    {new Date(a.timestamp).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}
                                  </span>
                                  <span className={`px-3 py-1 rounded-lg text-xs font-bold ${a.correct ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                    {a.correct ? 'Doğru' : 'Yanlış'}
                                  </span>
                                </div>
                              </div>
                              <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-[1fr,280px] gap-6">
                                <div className="space-y-4 min-w-0">
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Öğrencinin oynadığı hamleler</p>
                                    <MainlineMoveGrid moves={a.movesPlayed} compact showHeader />
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Doğru çözüm</p>
                                    <MainlineMoveGrid moves={a.solutionMoves} compact showHeader />
                                  </div>
                                </div>
                                {a.finalFen && (
                                  <div className="lg:place-self-center">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tahtanın son hali</p>
                                    <ChessBoardFrame boardOrientation="white" hideCoordinates className="w-full max-w-[260px] sm:max-w-[280px] mx-auto lg:mx-0 rounded-xl overflow-hidden border border-white/10 shadow-lg">
                                      <Chessboard
                                        options={{
                                          id: `hw-attempt-${a.id}`,
                                          position: a.finalFen,
                                          allowDragging: false,
                                          boardOrientation: 'white',
                                          darkSquareStyle: { backgroundColor: '#779952' },
                                          lightSquareStyle: { backgroundColor: '#edeed1' },
                                          ...CHESSBOARD_ANIMATION,
                                          ...CHESSBOARD_NO_NOTATION,
                                        }}
                                      />
                                    </ChessBoardFrame>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  if (submission) {
                    return (
                      <div className="rounded-2xl border border-white/10 bg-slate-800/40 p-5 sm:p-6">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-3">
                          <Eye className="w-4 h-4" /> Teslim bilgisi
                        </h4>
                        <p className="text-slate-300">Ödev <strong className="text-white">Ödevi bitir</strong> ile teslim edildi.</p>
                        <p className="text-sm text-slate-500 mt-1">Teslim: {new Date(submission.submittedAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                        <p className="text-sm text-amber-400/90 mt-3">Hamle kaydı yok — öğrenci bulmacaları oynayıp Kaydet ve Gönder yaptığında burada görünecek.</p>
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-2xl border border-white/10 bg-slate-800/40 p-5 sm:p-6">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-3">
                        <Eye className="w-4 h-4" /> İşlem geçmişi
                      </h4>
                      <p className="text-slate-400">Henüz deneme yok. Öğrenci bulmacaya tıklayıp <strong className="text-slate-300">Kaydet ve Gönder</strong> yaptığında hamleler ve tahta burada görünecek.</p>
                    </div>
                  );
                })()}
                {!selectedHw && (
                  <div className="rounded-2xl border border-white/10 bg-slate-800/40 p-5 sm:p-6">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-3">
                      <Eye className="w-4 h-4" /> Ödev özeti (tümü)
                    </h4>
                    <div className="space-y-2">
                      {homeworks.map((hw) => {
                        const perHw = buildStatsForHomework(hw).find(s => s.studentId === detailStat.studentId);
                        if (!perHw) return null;
                        const color = perHw.status === 'Tamamlandı' ? 'text-emerald-400' : perHw.status === 'Devam Ediyor' ? 'text-amber-400' : 'text-slate-400';
                        return (
                          <div key={hw.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-black/20">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-white truncate">{hw.title}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {hw.puzzles.length} soru
                                {hw.dueDate
                                  ? ` · son tarih ${new Date(hw.dueDate).toLocaleDateString('tr-TR')}`
                                  : ' · son tarih yok'}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className={`text-xs font-black ${color}`}>{perHw.status}</div>
                              <div className="text-[10px] text-slate-500">%{perHw.progress}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-3">
                      Not: Bu ekran ödev seçmeden genel durumu gösterir. Tek bir ödevin hamle/tahta detayını görmek için üstten ilgili ödevi seçip öğrenciye tıklayın.
                    </p>
                  </div>
                )}

                {/* AI analiz + Öğrenci sayfası */}
                <div className="mt-6 sm:mt-8 space-y-4">
                  {selectedHw && (
                    <button
                      type="button"
                      disabled={aiLoading || homeworkAttempts.filter(a => a.studentId === detailStat.studentId && a.homeworkId === selectedHw.id).length === 0}
                      onClick={async () => {
                        if (!selectedHw) return;
                        setAiResult(null);
                        setAiLoading(true);
                        try {
                          const attempts = homeworkAttempts
                            .filter(a => a.studentId === detailStat.studentId && a.homeworkId === selectedHw.id)
                            .map(a => ({ puzzleTitle: a.puzzleTitle, correct: a.correct, movesPlayed: a.movesPlayed, solutionMoves: a.solutionMoves }));
                          const res = await analyzeStudentHomework(detailStat.name, selectedHw.title, attempts);
                          setAiResult(res);
                        } catch {
                          setAiResult({ eksiklikler: 'Analiz alınamadı.', hamleler: '-' });
                        } finally {
                          setAiLoading(false);
                        }
                      }}
                      className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors"
                    >
                      {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {aiLoading ? 'AI analiz ediyor...' : 'AI ile ödev analizi'}
                    </button>
                  )}

                  {aiResult && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-white/10 bg-slate-800/40 p-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Eksiklikler (antrenöre özet)</h4>
                        <div className="text-sm text-slate-300 whitespace-pre-wrap max-h-44 overflow-y-auto">{aiResult.eksiklikler}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-800/40 p-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Hamleler & karşılaştırma</h4>
                        <div className="text-sm text-slate-300 whitespace-pre-wrap max-h-44 overflow-y-auto">{aiResult.hamleler}</div>
                      </div>
                    </div>
                  )}

                  <a
                    href={`#/ogrenci-detay/${detailStat.studentId}`}
                    className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors"
                  >
                    <User className="w-4 h-4" />
                    Öğrenci sayfasına git
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Homework;
