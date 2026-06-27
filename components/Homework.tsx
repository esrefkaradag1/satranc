import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
import { resolveHomeworkAssignees } from '../homeworkUtils';
import type { HomeworkAssignment, Student, Puzzle, StudentDailyTarget } from '../types';
import { HomeworkTargetSelector } from './homework/HomeworkTargetSelector';
import { HomeworkAssignmentsList } from './homework/HomeworkAssignmentsList';
import { HomeworkAssignmentDetail } from './homework/HomeworkAssignmentDetail';
import { DailyProgramAssignmentDetail } from './homework/DailyProgramAssignmentDetail';
import { WeeklyScheduleGrid } from './homework/WeeklyScheduleGrid';
import { StudentPuzzleDetailModal } from './homework/StudentPuzzleDetailModal';
import { StudentPlatformDetailModal } from './homework/StudentPlatformDetailModal';
import { StudyControlSection } from './homework/StudyControlSection';
import { ClubLeaderboard } from './leaderboard/ClubLeaderboard';
import { ResponsiveTable } from './ui/ResponsiveTable';
import {
  EMPTY_TARGET,
  filterStudentsByTarget,
  PROGRAM_BULK_EDIT_ID,
  type HomeworkPanelTab,
  type TargetFilter,
} from '../lib/homeworkPanelUtils';
import {
  evaluatePlatformDayGoalsFromStats,
  fetchStudentPlatformActivityTimeSeconds,
  fetchStudentPlatformDayStats,
  mergePlatformDayStats,
  platformSyncSummary,
  resolveDayTargets,
  type PlatformDayStats,
} from '../lib/homeworkPlatformUtils';
import {
  buildInternalHomeworkStats,
  buildPlatformHomeworkStats,
  homeworkHasPlatformGoals,
  isDailyProgramAssignment,
  isPuzzleTrackingAssignment,
  resolveProgramDailyTarget,
  type PlatformStudentStat,
} from '../lib/homeworkStatsBuilders';
import { isToday, todayDayKey, weekdayKeyFromIso, mondayOfWeek, isoDateForWeekday, type DayCompletionStatus } from '../lib/homeworkDayUtils';

/** Platform API otomatik kontrol aralığı (manuel yenileme sonrası / sekme açıkken) */
const PLATFORM_AUTO_POLL_MS = 10 * 60 * 1000;
/** Çoklu öğrenci platform çekiminde istekler arası bekleme (Lichess 429 önleme) */
const STUDENT_PLATFORM_GAP_MS = 700;
import {
  countPerPuzzleResults,
  studentTotalThinkSeconds,
  type StudentHwStat,
} from '../lib/homeworkAnalysisUtils';

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

const Homework: React.FC = () => {
  const {
    scopedStudents: students, homeworks, puzzles, homeworkAttempts, homeworkSubmissions,
    addHomework, updateHomework, deleteHomework, refreshFromStorage,
    resetHomeworkAttemptsForStudent, removeHomeworkSubmission,
    branchOffices, disciplineBranches, trainingGroups, showToast,
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
  const [studentPlatformDayStats, setStudentPlatformDayStats] = useState<Record<string, PlatformDayStats>>({});
  const [studentPlatformDayTimeSeconds, setStudentPlatformDayTimeSeconds] = useState<Record<string, number>>({});
  const [studentPlatformWeekStats, setStudentPlatformWeekStats] = useState<Record<string, Record<string, PlatformDayStats>>>({});
  const [loadingProgramPlatformStats, setLoadingProgramPlatformStats] = useState(false);
  const [loadingDailyPlatformStats, setLoadingDailyPlatformStats] = useState(false);
  const dailyPlatformPollEnabledRef = useRef(false);
  const dailyPlatformRefreshInFlightRef = useRef(false);
  const studentPlatformDayStatsRef = useRef<Record<string, PlatformDayStats>>({});
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
  const [assignWeeklyEditId, setAssignWeeklyEditId] = useState<string | null>(null);
  const [assignGoalTab, setAssignGoalTab] = useState<'daily' | 'weekly'>('weekly');
  const [assignFieldErrors, setAssignFieldErrors] = useState<{ title?: string; targets?: string; goals?: string; puzzles?: string }>({});
  const [assignFormPurpose, setAssignFormPurpose] = useState<'puzzle' | 'program'>('puzzle');
  const [editingWeeklyStudentId, setEditingWeeklyStudentId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<HomeworkPanelTab>('odev');
  const [targetFilter, setTargetFilter] = useState<TargetFilter>(EMPTY_TARGET);
  const [programStudentId, setProgramStudentId] = useState<string | null>(null);
  const [programAnalysisView, setProgramAnalysisView] = useState<'list' | 'detail'>('list');
  const [programSelectedHwId, setProgramSelectedHwId] = useState<string | null>(null);
  const [programDetailStat, setProgramDetailStat] = useState<PlatformStudentStat | null>(null);
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

  const openProgramDetail = useCallback((homeworkId: string) => {
    setProgramSelectedHwId(homeworkId);
    setProgramAnalysisView('detail');
    setProgramDetailStat(null);
  }, []);

  const backToProgramList = useCallback(() => {
    setProgramAnalysisView('list');
    setProgramDetailStat(null);
  }, []);

  const handleDeleteHomework = useCallback((homeworkId: string) => {
    const hw = homeworks.find((h) => h.id === homeworkId);
    const label = hw?.title?.trim() || 'Bu ödev';
    if (!window.confirm(`"${label}" ödevi kalıcı olarak silinecek. Öğrenci panelinden de kalkar. Emin misiniz?`)) {
      return;
    }
    deleteHomework(homeworkId);
    if (selectedHwId === homeworkId) {
      setSelectedHwId(ALL_HOMEWORKS_ID);
      setAnalysisView('list');
      setDetailStat(null);
    }
    showToast('Ödev silindi.', 'success');
  }, [homeworks, deleteHomework, selectedHwId, showToast]);

  /** Ödev Takibi sayfası açıldığında localStorage'dan güncel denemeleri ve teslimleri çek (öğrenci aynı/başka sekmede hamle yaptıysa admin görsün) */
  useEffect(() => {
    refreshFromStorage();
  }, [refreshFromStorage]);

  /** Supabase modunda teslim/deneme verileri açık ekranda da güncel kalsın. */
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshFromStorage();
    }, 60000);
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
    const hw = homeworks.find(h => h.id === selectedHwId) || null;
    if (hw && !isPuzzleTrackingAssignment(hw)) return null;
    return hw;
  }, [selectedHwId, homeworks]);

  const studentGroups = useMemo(
    () => [...new Set(students.map((s) => s.group).filter(Boolean))].sort(),
    [students]
  );

  const getAssignees = useCallback((hw: HomeworkAssignment): Student[] => {
    return resolveHomeworkAssignees(hw, students);
  }, [students]);

  const filteredHomeworks = useMemo(() => {
    if (targetStudents.length === 0) return homeworks;
    return homeworks.filter((hw) => getAssignees(hw).some((s) => targetStudentIds.has(s.id)));
  }, [homeworks, targetStudents.length, targetStudentIds, getAssignees]);

  const trackingHomeworks = useMemo(
    () => filteredHomeworks.filter(isPuzzleTrackingAssignment),
    [filteredHomeworks],
  );

  const programHomeworks = useMemo(
    () => filteredHomeworks.filter(isDailyProgramAssignment),
    [filteredHomeworks],
  );

  const hwPuzzles = useMemo(() => {
    if (!selectedHw) return [];
    return puzzles.filter(p => selectedHw.puzzles.includes(p.id));
  }, [selectedHw, puzzles]);

  const totalPoints = useMemo(() => hwPuzzles.reduce((s, p) => s + p.points, 0), [hwPuzzles]);

  const assignees = useMemo(() => selectedHw ? getAssignees(selectedHw) : [], [selectedHw, getAssignees]);

  const programSelectedHw = useMemo(() => {
    if (!programSelectedHwId) return null;
    const hw = homeworks.find((h) => h.id === programSelectedHwId) ?? null;
    if (hw && !homeworkHasPlatformGoals(hw)) return null;
    return hw;
  }, [programSelectedHwId, homeworks]);

  const programHomework = useMemo(() => {
    if (programSelectedHw) return programSelectedHw;
    if (panelTab !== 'program') return null;
    return programHomeworks[0] ?? null;
  }, [programSelectedHw, panelTab, programHomeworks]);

  const programAssignees = useMemo(
    () => (programHomework ? getAssignees(programHomework) : []),
    [programHomework, getAssignees],
  );

  const programAssigneeIdsKey = useMemo(
    () => programAssignees.map((s) => s.id).sort().join(','),
    [programAssignees],
  );

  useEffect(() => {
    if (!programHomework) {
      setDailyTargetDrafts({});
      return;
    }
    const next: Record<string, StudentDailyTarget> = {};
    programAssignees.forEach((student) => {
      next[student.id] = resolveProgramDailyTarget(student.id, programHomework, homeworks, getAssignees);
    });
    setDailyTargetDrafts(next);
  }, [programHomework?.id, programAssigneeIdsKey, homeworks, getAssignees]);

  const refreshDailyPlatformStats = useCallback(async (opts?: { silent?: boolean }) => {
    const hw = programSelectedHw ?? programHomework;
    if (!hw || !homeworkHasPlatformGoals(hw)) {
      setStudentDailyGameCounts({});
      setStudentDailyExternalPuzzleCounts({});
      setStudentDailyExternalPuzzlePassed({});
      setStudentDailyExternalPuzzleFailed({});
      setStudentPlatformDayStats({});
      setStudentPlatformDayTimeSeconds({});
      studentPlatformDayStatsRef.current = {};
      return;
    }
    const scopeAssignees = getAssignees(hw).filter((s) => targetStudentIds.has(s.id));
    if (scopeAssignees.length === 0) {
      setStudentDailyGameCounts({});
      setStudentDailyExternalPuzzleCounts({});
      setStudentDailyExternalPuzzlePassed({});
      setStudentDailyExternalPuzzleFailed({});
      setStudentPlatformDayStats({});
      setStudentPlatformDayTimeSeconds({});
      studentPlatformDayStatsRef.current = {};
      return;
    }
    if (dailyPlatformRefreshInFlightRef.current) return;
    dailyPlatformRefreshInFlightRef.current = true;
    setLoadingDailyPlatformStats(true);
    dailyPlatformPollEnabledRef.current = true;
    const todayKey = viewDate;
    const pause = (ms: number) => new Promise((resolve) => { window.setTimeout(resolve, ms); });
    try {
      const platformByStudent: Record<string, PlatformDayStats> = {};
      let requestIndex = 0;

      for (const s of scopeAssignees) {
        if (requestIndex++ > 0) await pause(STUDENT_PLATFORM_GAP_MS);
        try {
          const fresh = await fetchStudentPlatformDayStats(s, todayKey);
          platformByStudent[s.id] = mergePlatformDayStats(
            studentPlatformDayStatsRef.current[s.id],
            fresh,
          );
        } catch {
          const prev = studentPlatformDayStatsRef.current[s.id];
          if (prev) platformByStudent[s.id] = prev;
        }
      }

      studentPlatformDayStatsRef.current = {
        ...studentPlatformDayStatsRef.current,
        ...platformByStudent,
      };

      const rows = scopeAssignees.map((s) => {
        const platformStats = platformByStudent[s.id] ?? studentPlatformDayStatsRef.current[s.id] ?? {
          games: 0,
          puzzleSolved: 0,
          puzzlePassed: 0,
          puzzleFailed: 0,
          lichessGames: 0,
          lichessPuzzles: 0,
          lichessPuzzlePassed: 0,
          lichessPuzzleFailed: 0,
          chessComGames: 0,
          chessComPuzzles: 0,
          chessComPuzzlePassed: 0,
          chessComPuzzleFailed: 0,
        };
        return [
          s.id,
          platformStats.games,
          platformStats.puzzleSolved,
          platformStats.puzzlePassed,
          platformStats.puzzleFailed,
          platformStats,
        ] as const;
      });

      setStudentDailyGameCounts(Object.fromEntries(rows.map(([sid, gc]) => [sid, gc])));
      setStudentDailyExternalPuzzleCounts(Object.fromEntries(rows.map(([sid, _gc, pc]) => [sid, pc])));
      setStudentDailyExternalPuzzlePassed(Object.fromEntries(rows.map(([sid, _gc, _pc, pp]) => [sid, pp])));
      setStudentDailyExternalPuzzleFailed(Object.fromEntries(rows.map(([sid, _gc, _pc, _pp, pf]) => [sid, pf])));
      setStudentPlatformDayStats((prev) => ({
        ...prev,
        ...Object.fromEntries(rows.map(([sid, _gc, _pc, _pp, _pf, platformStats]) => [sid, platformStats])),
      }));
      setStudentPlatformWeekStats((prev) => {
        const next = { ...prev };
        for (const [sid, _gc, _pc, _pp, _pf, platformStats] of rows) {
          next[sid] = { ...(next[sid] ?? {}), [todayKey]: platformStats };
        }
        return next;
      });

      const timeEntries: [string, number][] = [];
      for (const s of scopeAssignees) {
        const target = hw.studentDailyTargets?.[s.id];
        const currentDayKey = weekdayKeyFromIso(todayKey);
        const dayTarget = target?.weeklySchedule?.[currentDayKey];
        const dailyGameTarget = Math.max(0, dayTarget?.dailyGameTarget ?? target?.dailyGameTarget ?? hw.dailyGameTarget ?? 0);
        const dailyPuzzleTarget = Math.max(0, dayTarget?.dailyPuzzleTarget ?? target?.dailyPuzzleTarget ?? hw.dailyPuzzleTarget ?? 0);
        if (dailyGameTarget <= 0 && dailyPuzzleTarget <= 0) {
          timeEntries.push([s.id, 0]);
          continue;
        }
        try {
          const sec = await fetchStudentPlatformActivityTimeSeconds(s, todayKey, {
            puzzleTarget: dailyPuzzleTarget,
            gameTarget: dailyGameTarget,
          });
          timeEntries.push([s.id, sec]);
        } catch {
          timeEntries.push([s.id, 0]);
        }
        await pause(300);
      }
      setStudentPlatformDayTimeSeconds((prev) => ({
        ...prev,
        ...Object.fromEntries(timeEntries),
      }));
      if (!opts?.silent) showToast('Platform verileri güncellendi.', 'success');
    } catch {
      if (!opts?.silent) showToast('Platform verisi alınamadı.', 'warning');
    } finally {
      setLoadingDailyPlatformStats(false);
      dailyPlatformRefreshInFlightRef.current = false;
    }
  }, [programSelectedHw, programHomework, getAssignees, targetStudentIds, viewDate, showToast]);

  const isStudentDailyActive = useCallback((studentId: string) => {
    return (studentDailyGameCounts[studentId] ?? 0) > 0
      || (studentDailyExternalPuzzleCounts[studentId] ?? 0) > 0;
  }, [studentDailyGameCounts, studentDailyExternalPuzzleCounts]);

  useEffect(() => {
    if (panelTab !== 'program' || programAnalysisView !== 'detail' || !programSelectedHw) return;
    void refreshDailyPlatformStats({ silent: true });
  }, [panelTab, programAnalysisView, programSelectedHw?.id, viewDate, refreshDailyPlatformStats]);

  useEffect(() => {
    studentPlatformDayStatsRef.current = studentPlatformDayStats;
  }, [studentPlatformDayStats]);

  const stats: StudentHwStat[] = useMemo(() => {
    if (!selectedHw) return [];
    const scoped = assignees.filter((s) => targetStudentIds.has(s.id));
    return buildInternalHomeworkStats(
      selectedHw,
      scoped,
      homeworkAttempts,
      homeworkSubmissions,
      puzzles,
    );
  }, [selectedHw, assignees, targetStudentIds, homeworkAttempts, homeworkSubmissions, puzzles]);

  const programAssigneesForStats = useMemo(() => {
    if (!programSelectedHw) return [];
    return getAssignees(programSelectedHw).filter((s) => targetStudentIds.has(s.id));
  }, [programSelectedHw, getAssignees, targetStudentIds]);

  const programHwForStats = useMemo(() => {
    if (!programSelectedHw) return null;
    const mergedTargets: Record<string, StudentDailyTarget> = {
      ...(programSelectedHw.studentDailyTargets ?? {}),
    };
    for (const s of programAssigneesForStats) {
      const draft = dailyTargetDrafts[s.id];
      if (draft) mergedTargets[s.id] = draft;
    }
    return { ...programSelectedHw, studentDailyTargets: mergedTargets };
  }, [programSelectedHw, programAssigneesForStats, dailyTargetDrafts]);

  const programStats: PlatformStudentStat[] = useMemo(() => {
    if (!programHwForStats) return [];
    return buildPlatformHomeworkStats(
      programHwForStats,
      programAssigneesForStats,
      viewDate,
      studentPlatformDayStats,
      studentPlatformDayTimeSeconds,
    );
  }, [
    programHwForStats,
    programAssigneesForStats,
    viewDate,
    studentPlatformDayStats,
    studentPlatformDayTimeSeconds,
  ]);

  const liveProgramDetailStat = useMemo(() => {
    if (!programDetailStat || !programSelectedHw) return programDetailStat;
    return programStats.find((s) => s.studentId === programDetailStat.studentId) ?? programDetailStat;
  }, [programDetailStat, programStats, programSelectedHw]);

  const liveDetailStat = useMemo(() => {
    if (!detailStat || !selectedHw) return detailStat;
    return stats.find((s) => s.studentId === detailStat.studentId) ?? detailStat;
  }, [detailStat, stats, selectedHw]);

  const allModeStats: StudentHwStat[] = useMemo(() => {
    if (selectedHw != null) return [];
    const puzzleHomeworks = homeworks.filter(isPuzzleTrackingAssignment);
    if (puzzleHomeworks.length === 0) return [];
    const byStudent = new Map<string, { student: Student; hwStats: StudentHwStat[] }>();
    for (const hw of puzzleHomeworks) {
      const perHw = buildInternalHomeworkStats(
        hw,
        getAssignees(hw),
        homeworkAttempts,
        homeworkSubmissions,
        puzzles,
      );
      for (const s of perHw) {
        const existing = byStudent.get(s.studentId);
        if (existing) existing.hwStats.push(s);
        else {
          const st = students.find((x) => x.id === s.studentId);
          if (st) byStudent.set(s.studentId, { student: st, hwStats: [s] });
        }
      }
    }

    const out: StudentHwStat[] = [];
    for (const { student, hwStats } of byStudent.values()) {
      const total = hwStats.length;
      const completed = hwStats.filter((h) => h.status === 'Tamamlandı').length;
      const started = hwStats.some((h) => h.status !== 'Başlamadı');
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
      });
    }
    return out;
  }, [selectedHw, homeworks, getAssignees, homeworkAttempts, homeworkSubmissions, puzzles, students]);

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
    if (!programHomework) return targetStudents;
    return targetStudents.filter((s) => programAssignees.some((a) => a.id === s.id));
  }, [programHomework, targetStudents, programAssignees]);

  const programPlatformPollEnabledRef = useRef(false);

  const refreshProgramPlatformStats = useCallback(async () => {
    if (programStudents.length === 0) return;
    setLoadingProgramPlatformStats(true);
    programPlatformPollEnabledRef.current = true;
    const today = todayDayKey();
    const monday = mondayOfWeek();
    const daysToFetch: string[] = [];
    for (let d = 1; d <= 7; d++) {
      const iso = isoDateForWeekday(monday, d);
      if (iso <= today) daysToFetch.push(iso);
    }
    const next: Record<string, Record<string, PlatformDayStats>> = {};
    const pause = (ms: number) => new Promise((resolve) => { window.setTimeout(resolve, ms); });
    let requestIndex = 0;
    try {
      for (const student of programStudents) {
        next[student.id] = {};
        for (const iso of daysToFetch) {
          if (requestIndex++ > 0) await pause(STUDENT_PLATFORM_GAP_MS);
          const fresh = await fetchStudentPlatformDayStats(student, iso);
          next[student.id][iso] = mergePlatformDayStats(
            studentPlatformWeekStats[student.id]?.[iso],
            fresh,
          );
        }
      }
      setStudentPlatformWeekStats(next);
      showToast('Lichess ve Chess.com verileri güncellendi.', 'success');
    } catch {
      showToast('Platform verisi alınamadı.', 'warning');
    } finally {
      setLoadingProgramPlatformStats(false);
    }
  }, [programStudents, showToast]);

  const programPlatformForDay = useCallback((studentId: string, iso: string): PlatformDayStats | undefined => {
    return studentPlatformWeekStats[studentId]?.[iso]
      ?? (iso === viewDate ? studentPlatformDayStats[studentId] : undefined);
  }, [studentPlatformWeekStats, studentPlatformDayStats, viewDate]);

  const programDayCompletion = useMemo((): Record<number, DayCompletionStatus> => {
    if (!programHomework) return {};
    if (programStudentId === PROGRAM_BULK_EDIT_ID) return {};
    const studentId = programStudentId ?? programStudents[0]?.id;
    if (!studentId) return {};
    const draft = dailyTargetDrafts[studentId] ?? {};
    const today = todayDayKey();
    const monday = mondayOfWeek();
    const out: Record<number, DayCompletionStatus> = {};
    for (let day = 1; day <= 7; day++) {
      const { gameTarget, puzzleTarget, minAccuracy } = resolveDayTargets(draft, programHomework, day);
      if (gameTarget <= 0 && puzzleTarget <= 0) {
        out[day] = 'none';
        continue;
      }
      const iso = isoDateForWeekday(monday, day);
      const isFuture = iso > today;
      const platform = programPlatformForDay(studentId, iso);
      const goalEval = evaluatePlatformDayGoalsFromStats(gameTarget, puzzleTarget, minAccuracy, platform);
      const { done } = goalEval;
      if (isFuture) out[day] = 'pending';
      else if (done) out[day] = 'done';
      else if (iso === today) out[day] = 'pending';
      else out[day] = 'missed';
    }
    return out;
  }, [programHomework, programStudentId, programStudents, dailyTargetDrafts, programPlatformForDay]);

  const programDayProgress = useMemo(() => {
    if (!programHomework) return {};
    if (programStudentId === PROGRAM_BULK_EDIT_ID) return {};
    const studentId = programStudentId ?? programStudents[0]?.id;
    const student = programStudents.find((s) => s.id === studentId);
    if (!studentId || !student) return {};
    const draft = dailyTargetDrafts[studentId] ?? {};
    const monday = mondayOfWeek();
    const today = todayDayKey();
    const out: Record<number, {
      games: number;
      gameTarget: number;
      puzzles: number;
      puzzleTarget: number;
      syncNote?: string | null;
    }> = {};
    for (let day = 1; day <= 7; day++) {
      const { gameTarget, puzzleTarget, minAccuracy } = resolveDayTargets(draft, programHomework, day);
      if (gameTarget <= 0 && puzzleTarget <= 0) continue;
      const iso = isoDateForWeekday(monday, day);
      const platform = programPlatformForDay(studentId, iso);
      const evalResult = evaluatePlatformDayGoalsFromStats(gameTarget, puzzleTarget, minAccuracy, platform);
      out[day] = {
        games: evalResult.games,
        gameTarget,
        puzzles: evalResult.puzzleSolved,
        puzzleTarget,
        syncNote: iso === today ? platformSyncSummary(platform, student) : null,
      };
    }
    return out;
  }, [programHomework, programStudentId, programStudents, dailyTargetDrafts, programPlatformForDay]);

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

  const handleProgramBulkDraftChange = useCallback((patch: Partial<StudentDailyTarget>) => {
    setDailyTargetDrafts((prev) => {
      const next = { ...prev };
      for (const s of programStudents) {
        next[s.id] = { ...next[s.id], ...patch };
      }
      return next;
    });
  }, [programStudents]);

  const handleProgramBulkDayChange = useCallback((
    day: number,
    patch: Partial<NonNullable<StudentDailyTarget['weeklySchedule']>[number]>,
  ) => {
    setDailyTargetDrafts((prev) => {
      const next = { ...prev };
      for (const s of programStudents) {
        const cur = next[s.id] ?? {};
        const schedule = {
          ...(cur.weeklySchedule ?? {}),
          [day]: { ...(cur.weeklySchedule?.[day] ?? {}), ...patch },
        };
        next[s.id] = { ...cur, weeklySchedule: schedule };
      }
      return next;
    });
  }, [programStudents]);

  const copyProgramDraftToAll = useCallback((sourceStudentId: string) => {
    const source = dailyTargetDrafts[sourceStudentId];
    if (!source) {
      showToast('Kopyalanacak hedef bulunamadı.', 'warning');
      return;
    }
    setDailyTargetDrafts((prev) => {
      const next = { ...prev };
      const clonedSchedule = source.weeklySchedule
        ? Object.fromEntries(
          Object.entries(source.weeklySchedule).map(([k, v]) => [k, { ...v }]),
        )
        : undefined;
      for (const s of programStudents) {
        next[s.id] = {
          dailyGameTarget: source.dailyGameTarget,
          dailyPuzzleTarget: source.dailyPuzzleTarget,
          minPuzzleAccuracyPct: source.minPuzzleAccuracyPct,
          weeklySchedule: clonedSchedule,
        };
      }
      return next;
    });
    showToast(`Hedefler ${programStudents.length} öğrenciye kopyalandı. Kaydetmeyi unutmayın.`, 'success');
  }, [dailyTargetDrafts, programStudents, showToast]);

  const summary = useMemo(() => {
    const completed = effectiveStats.filter(s => s.status === 'Tamamlandı').length;
    const inProgress = effectiveStats.filter(s => s.status === 'Devam Ediyor').length;
    const notStarted = effectiveStats.filter(s => s.status === 'Başlamadı').length;
    const avgPoints = effectiveStats.length > 0 ? Math.round(effectiveStats.reduce((s, st) => s + st.points, 0) / effectiveStats.length) : 0;
    const avgProgress = effectiveStats.length > 0 ? Math.round(effectiveStats.reduce((s, st) => s + st.progress, 0) / effectiveStats.length) : 0;
    return { completed, inProgress, notStarted, avgPoints, avgProgress };
  }, [effectiveStats]);

  useEffect(() => {
    if (!dailyPlatformPollEnabledRef.current) return;
    if (!programSelectedHw || panelTab !== 'program' || programAnalysisView !== 'detail') return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshDailyPlatformStats({ silent: true });
    }, PLATFORM_AUTO_POLL_MS);
    return () => window.clearInterval(id);
  }, [panelTab, programAnalysisView, programSelectedHw, refreshDailyPlatformStats]);

  useEffect(() => {
    if (!programPlatformPollEnabledRef.current) return;
    if (panelTab !== 'program' || !programHomework) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshProgramPlatformStats();
    }, PLATFORM_AUTO_POLL_MS);
    return () => window.clearInterval(id);
  }, [panelTab, programHomework, refreshProgramPlatformStats]);

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
    setAssignFieldErrors((p) => (p.targets ? { ...p, targets: undefined } : p));
  }, []);

  const toggleAssignStudent = useCallback((studentId: string) => {
    setAssignSelectedStudents((prev) => (prev.includes(studentId) ? prev.filter((x) => x !== studentId) : [...prev, studentId]));
    setAssignFieldErrors((p) => (p.targets ? { ...p, targets: undefined } : p));
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
    setAssignWeeklyEditId(null);
    setAssignGoalTab('weekly');
    setAssignFieldErrors({});
    setAssignFormPurpose('puzzle');
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

  const applyAssignDefaultsToWeek = useCallback(() => {
    const dailyGameTarget = assignDefaultTargets.dailyGameTarget ?? 0;
    const dailyPuzzleTarget = assignDefaultTargets.dailyPuzzleTarget ?? 0;
    const minPuzzleAccuracyPct = assignDefaultTargets.minPuzzleAccuracyPct ?? 60;
    const dayPatch = {
      dailyGameTarget: dailyGameTarget > 0 ? dailyGameTarget : undefined,
      dailyPuzzleTarget: dailyPuzzleTarget > 0 ? dailyPuzzleTarget : undefined,
      minPuzzleAccuracyPct,
    };
    const weeklySchedule = Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7].map((day) => [day, { ...dayPatch }]),
    ) as NonNullable<StudentDailyTarget['weeklySchedule']>;
    setAssignDailyTargetDrafts((prev) => {
      const next = { ...prev };
      for (const s of assignFormStudents) {
        next[s.id] = {
          ...next[s.id],
          dailyGameTarget,
          dailyPuzzleTarget,
          minPuzzleAccuracyPct,
          weeklySchedule,
        };
      }
      return next;
    });
  }, [assignFormStudents, assignDefaultTargets]);

  const handleAssignDraftChange = useCallback((studentId: string, patch: Partial<StudentDailyTarget>) => {
    setAssignDailyTargetDrafts((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  }, []);

  const handleAssignDayChange = useCallback((
    studentId: string,
    day: number,
    patch: Partial<NonNullable<StudentDailyTarget['weeklySchedule']>[number]>,
  ) => {
    setAssignDailyTargetDrafts((prev) => {
      const cur = prev[studentId] ?? {};
      const schedule = { ...(cur.weeklySchedule ?? {}), [day]: { ...(cur.weeklySchedule?.[day] ?? {}), ...patch } };
      return { ...prev, [studentId]: { ...cur, weeklySchedule: schedule } };
    });
  }, []);

  const handleAssignBulkDraftChange = useCallback((patch: Partial<StudentDailyTarget>) => {
    setAssignDailyTargetDrafts((prev) => {
      const next = { ...prev };
      for (const s of assignFormStudents) {
        next[s.id] = { ...next[s.id], ...patch };
      }
      return next;
    });
  }, [assignFormStudents]);

  const handleAssignBulkDayChange = useCallback((
    day: number,
    patch: Partial<NonNullable<StudentDailyTarget['weeklySchedule']>[number]>,
  ) => {
    setAssignDailyTargetDrafts((prev) => {
      const next = { ...prev };
      for (const s of assignFormStudents) {
        const cur = next[s.id] ?? {};
        const schedule = { ...(cur.weeklySchedule ?? {}), [day]: { ...(cur.weeklySchedule?.[day] ?? {}), ...patch } };
        next[s.id] = { ...cur, weeklySchedule: schedule };
      }
      return next;
    });
  }, [assignFormStudents]);

  const copyAssignWeeklyToAll = useCallback((sourceStudentId: string) => {
    const source = assignDailyTargetDrafts[sourceStudentId];
    if (!source) return;
    const clonedSchedule = source.weeklySchedule
      ? Object.fromEntries(
          Object.entries(source.weeklySchedule).map(([k, v]) => [k, { ...v }]),
        ) as NonNullable<StudentDailyTarget['weeklySchedule']>
      : undefined;
    setAssignDailyTargetDrafts((prev) => {
      const next = { ...prev };
      for (const s of assignFormStudents) {
        next[s.id] = {
          ...next[s.id],
          dailyGameTarget: source.dailyGameTarget,
          dailyPuzzleTarget: source.dailyPuzzleTarget,
          minPuzzleAccuracyPct: source.minPuzzleAccuracyPct,
          weeklySchedule: clonedSchedule ? { ...clonedSchedule } : undefined,
        };
      }
      return next;
    });
  }, [assignDailyTargetDrafts, assignFormStudents]);

  const assignFormHasPlatformGoals = useCallback((): boolean => {
    return assignFormStudents.some((s) => {
      const t = assignDailyTargetDrafts[s.id];
      if (!t) return false;
      if ((t.dailyGameTarget ?? 0) > 0 || (t.dailyPuzzleTarget ?? 0) > 0) return true;
      return Object.values(t.weeklySchedule ?? {}).some(
        (day) => (day.dailyGameTarget ?? 0) > 0 || (day.dailyPuzzleTarget ?? 0) > 0,
      );
    });
  }, [assignFormStudents, assignDailyTargetDrafts]);

  const handleCreateAssignment = useCallback(() => {
    const errors: { title?: string; targets?: string; goals?: string; puzzles?: string } = {};
    if (!assignTitle.trim()) errors.title = 'Başlık zorunludur.';
    const selectedTargets =
      assignMode === 'groups'
        ? assignSelectedGroups.map((g) => `group:${g}`)
        : assignSelectedStudents;
    if (selectedTargets.length === 0) {
      errors.targets = assignMode === 'groups'
        ? 'En az bir grup seçin.'
        : 'En az bir öğrenci seçin.';
    }

    const isProgramForm = assignFormPurpose === 'program';
    if (isProgramForm && !assignFormHasPlatformGoals()) {
      errors.goals = 'Günlük program için en az bir maç veya bulmaca hedefi girin.';
    }
    if (!isProgramForm && assignSelectedPuzzles.length === 0) {
      errors.puzzles = 'Ödev takibi için en az bir bulmaca seçin.';
    }

    if (Object.keys(errors).length > 0) {
      setAssignFieldErrors(errors);
      const parts = [errors.title, errors.targets, errors.goals, errors.puzzles].filter(Boolean);
      showToast(`Kaydedilemedi: ${parts.join(' ')}`, 'warning');
      return;
    }

    setAssignFieldErrors({});

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
      puzzles: isProgramForm ? [] : assignSelectedPuzzles,
      dueDate: assignDueDate.trim(),
      assignedTo: selectedTargets,
      studentDailyTargets: isProgramForm && Object.keys(studentDailyTargets).length > 0
        ? studentDailyTargets
        : undefined,
    });
    resetAssignForm();
    setShowAssignForm(false);
    if (isProgramForm) {
      setPanelTab('program');
      setProgramAnalysisView('list');
    }
    showToast(isProgramForm ? 'Günlük program oluşturuldu.' : 'Ödev ataması oluşturuldu.', 'success');
  }, [
    addHomework,
    assignDailyTargetDrafts,
    assignDueDate,
    assignFormHasPlatformGoals,
    assignFormPurpose,
    assignFormStudents,
    assignMode,
    assignSelectedGroups,
    assignSelectedPuzzles,
    assignSelectedStudents,
    assignTitle,
    resetAssignForm,
    showToast,
  ]);

  const saveStudentDailyTargets = useCallback(() => {
    if (!programSelectedHw) {
      showToast('Kaydetmek için günlük program ataması seçin.', 'warning');
      return;
    }
    const merged: Record<string, StudentDailyTarget> = {
      ...(programSelectedHw.studentDailyTargets ?? {}),
    };
    let touched = 0;
    for (const student of programStudents) {
      const t = dailyTargetDrafts[student.id];
      if (!t) continue;
      merged[student.id] = {
        dailyGameTarget: Math.max(0, Number(t.dailyGameTarget) || 0),
        dailyPuzzleTarget: Math.max(0, Number(t.dailyPuzzleTarget) || 0),
        minPuzzleAccuracyPct: Math.max(0, Math.min(100, Number(t.minPuzzleAccuracyPct) || 60)),
        weeklySchedule: t.weeklySchedule,
      };
      touched += 1;
    }
    if (touched === 0) {
      showToast('Kaydedilecek öğrenci hedefi bulunamadı.', 'warning');
      return;
    }
    updateHomework(programSelectedHw.id, { studentDailyTargets: merged });
    showToast(`Günlük program kaydedildi (${programSelectedHw.title}).`, 'success');
  }, [programSelectedHw, programStudents, dailyTargetDrafts, updateHomework, showToast]);

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
                {trackingHomeworks.length > 0 ? (
                  <>
                    <span className="text-slate-300">{trackingHomeworks.length} bulmaca ödevi</span>
                    <span className="text-slate-600 mx-1.5">·</span>
                    <span>{programHomeworks.length} günlük program</span>
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
            onClick={() => {
              if (!showAssignForm) {
                setAssignFormPurpose(panelTab === 'program' ? 'program' : 'puzzle');
              }
              setShowAssignForm((v) => !v);
            }}
            className="flex items-center gap-2 px-4 py-2.5 premium-gradient rounded-xl text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40"
          >
            <Plus className="w-4 h-4" />
            {showAssignForm
              ? 'Formu Kapat'
              : panelTab === 'program'
                ? 'Yeni Günlük Program'
                : 'Yeni Ödev Ata'}
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
          {trackingHomeworks.length > 0 && panelTab === 'odev' && (
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
                        <p className="text-[10px] text-slate-500 mt-0.5">{trackingHomeworks.length} bulmaca ödevi</p>
                      </div>
                      {selectedHwId === ALL_HOMEWORKS_ID && <CheckSquare className="w-4 h-4 text-indigo-400 flex-shrink-0" />}
                    </div>
                  </button>
                  {trackingHomeworks.map(hw => {
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
        <div
          className="fixed inset-0 z-50 flex justify-center items-start sm:items-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
          onClick={() => setShowAssignForm(false)}
        >
        <div
          className="bg-[#1e293b] border border-white/10 rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[calc(100dvh-0.5rem)] sm:max-h-[min(90dvh,860px)] my-1 sm:my-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-white/10 shrink-0">
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white tracking-wide">
                {assignFormPurpose === 'program' ? 'Yeni Günlük Program' : 'Yeni Ödev Ataması'}
              </h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 truncate">
                {assignFormPurpose === 'program'
                  ? `${assignMode === 'groups' ? assignSelectedGroups.length : assignSelectedStudents.length} Hedef · Platform`
                  : `${assignSelectedPuzzles.length} Bulmaca · ${assignMode === 'groups' ? assignSelectedGroups.length : assignSelectedStudents.length} Hedef`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAssignForm(false)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 shrink-0"
              aria-label="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 space-y-4 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Ödev Başlığı</p>
              <input
                value={assignTitle}
                onChange={(e) => {
                  setAssignTitle(e.target.value);
                  if (assignFieldErrors.title) setAssignFieldErrors((p) => ({ ...p, title: undefined }));
                }}
                placeholder="Örn: Haftalık Taktik Ödevi"
                className={`input-base w-full ${assignFieldErrors.title ? 'border-rose-500/60 ring-1 ring-rose-500/30' : ''}`}
              />
              {assignFieldErrors.title ? (
                <p className="text-[11px] text-rose-400 mt-1">{assignFieldErrors.title}</p>
              ) : null}
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

          <div className={`grid grid-cols-1 ${assignFormPurpose === 'program' ? '' : 'lg:grid-cols-2'} gap-4`}>
            <div className={`bg-black/20 border rounded-lg p-4 space-y-2 ${assignFieldErrors.targets ? 'border-rose-500/40' : 'border-white/10'}`}>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Atanacaklar</p>
              {assignFieldErrors.targets ? (
                <p className="text-[11px] text-rose-400">{assignFieldErrors.targets}</p>
              ) : null}
              <div className="max-h-40 sm:max-h-44 overflow-y-auto space-y-1 pr-1">
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

            {assignFormPurpose !== 'program' ? (
            <div className={`bg-black/20 border rounded-lg p-4 space-y-2 ${assignFieldErrors.puzzles ? 'border-rose-500/40' : 'border-white/10'}`}>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                Bulmacalar
              </p>
              {assignFieldErrors.puzzles ? (
                <p className="text-[11px] text-rose-400">{assignFieldErrors.puzzles}</p>
              ) : null}
              <input
                value={assignPuzzleSearch}
                onChange={(e) => setAssignPuzzleSearch(e.target.value)}
                placeholder="Bulmaca ara..."
                className="input-base w-full"
              />
              <div className="max-h-40 sm:max-h-44 overflow-y-auto space-y-1 pr-1">
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
            ) : null}
          </div>

          {assignFormPurpose === 'program' && assignFieldErrors.goals ? (
            <p className="text-[11px] text-rose-400">{assignFieldErrors.goals}</p>
          ) : null}

          {assignFormStudents.length > 0 && assignFormPurpose === 'program' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-white">Haftalık / Günlük Hedefler</h4>
                <div className="flex bg-black/30 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setAssignGoalTab('weekly')}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${assignGoalTab === 'weekly' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Haftalık hedef
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignGoalTab('daily')}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${assignGoalTab === 'daily' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Günlük varsayılan
                  </button>
                </div>
              </div>

              {assignGoalTab === 'weekly' ? (
                <WeeklyScheduleGrid
                  variant="assign"
                  students={assignFormStudents}
                  drafts={assignDailyTargetDrafts}
                  onDraftChange={handleAssignDraftChange}
                  onDayChange={handleAssignDayChange}
                  onBulkDraftChange={handleAssignBulkDraftChange}
                  onBulkDayChange={handleAssignBulkDayChange}
                  onCopyToAll={copyAssignWeeklyToAll}
                  onSave={() => {}}
                  selectedStudentId={assignWeeklyEditId}
                  onSelectStudent={setAssignWeeklyEditId}
                />
              ) : (
            <div className="bg-black/20 border border-indigo-500/20 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] text-slate-500">
                  Maç ve bulmaca: sistem + Lichess + Chess.com · Tüm günler için aynı varsayılan
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
                <button
                  type="button"
                  onClick={applyAssignDefaultsToWeek}
                  className="px-3 py-2 rounded-lg bg-violet-600/30 text-violet-300 text-xs font-bold hover:bg-violet-600/50"
                >
                  Haftaya uygula
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
              )}
            </div>
          ) : null}
          </div>

          <div className="shrink-0 border-t border-white/10 px-4 sm:px-5 py-3 sm:py-4 space-y-3 bg-[#1e293b] rounded-b-2xl">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
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

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => setShowAssignForm(false)} className="px-4 py-2.5 rounded-lg text-xs bg-slate-800 text-slate-300 font-bold hover:bg-slate-700">
              İptal
            </button>
            <button type="button" onClick={resetAssignForm} className="px-4 py-2.5 rounded-lg text-xs bg-slate-800 text-slate-300 font-bold hover:bg-slate-700">
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
                  homeworks={trackingHomeworks}
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
                  onDelete={() => handleDeleteHomework(selectedHw.id)}
                />
              ) : (
                <HomeworkAssignmentsList
                  homeworks={trackingHomeworks}
                  students={students}
                  attempts={homeworkAttempts}
                  submissions={homeworkSubmissions}
                  onOpenDetail={openHomeworkDetail}
                />
              )}
            </>
          )}

          {panelTab === 'program' && (
            <>
              {programAnalysisView === 'list' ? (
                programHomeworks.length > 0 ? (
                  <HomeworkAssignmentsList
                    homeworks={programHomeworks}
                    students={students}
                    attempts={homeworkAttempts}
                    submissions={homeworkSubmissions}
                    onOpenDetail={openProgramDetail}
                    isStudentActive={isStudentDailyActive}
                    variant="platform"
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
                    <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">Günlük program ataması bulunamadı</p>
                    <p className="text-xs text-slate-500 mt-2">Yeni Günlük Program ile Lichess/Chess.com hedeflerini tanımlayın</p>
                  </div>
                )
              ) : programSelectedHw && programAssigneesForStats.length > 0 ? (
                <DailyProgramAssignmentDetail
                  homework={programSelectedHw}
                  students={students}
                  stats={programStats}
                  viewDate={viewDate}
                  onViewDateChange={setViewDate}
                  onBack={backToProgramList}
                  onSelectStudent={setProgramDetailStat}
                  onRefreshPlatform={() => void refreshDailyPlatformStats()}
                  loadingPlatform={loadingDailyPlatformStats}
                  scheduleStudents={programStudents}
                  drafts={dailyTargetDrafts}
                  onDraftChange={handleProgramDraftChange}
                  onDayChange={handleProgramDayChange}
                  onBulkDraftChange={handleProgramBulkDraftChange}
                  onBulkDayChange={handleProgramBulkDayChange}
                  onCopyToAll={copyProgramDraftToAll}
                  onSaveSchedule={saveStudentDailyTargets}
                  selectedStudentId={programStudentId}
                  onSelectScheduleStudent={setProgramStudentId}
                  dayCompletion={programDayCompletion}
                  dayProgress={programDayProgress}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
                  <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">
                    {programSelectedHw ? 'Hedef seçiminde öğrenci bulunamadı' : 'Günlük program için ödev seçin'}
                  </p>
                  <button
                    type="button"
                    onClick={backToProgramList}
                    className="mt-4 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold"
                  >
                    Listeye dön
                  </button>
                </div>
              )}
            </>
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

      {/* Öğrenci bulmaca detayı — 3. seviye modal */}
      {liveDetailStat && selectedHw && (
        <StudentPuzzleDetailModal
          stat={liveDetailStat}
          homework={selectedHw}
          puzzles={puzzles}
          attempts={homeworkAttempts}
          onClose={() => setDetailStat(null)}
        />
      )}

      {liveProgramDetailStat && programSelectedHw && (() => {
        const student = students.find((s) => s.id === liveProgramDetailStat.studentId);
        if (!student) return null;
        return (
          <StudentPlatformDetailModal
            key={liveProgramDetailStat.studentId}
            stat={liveProgramDetailStat}
            homework={programSelectedHw}
            student={student}
            viewDate={viewDate}
            platformStats={studentPlatformDayStats[liveProgramDetailStat.studentId]}
            onClose={() => setProgramDetailStat(null)}
          />
        );
      })()}

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
