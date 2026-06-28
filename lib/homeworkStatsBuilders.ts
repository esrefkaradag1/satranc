import type { HomeworkAssignment, HomeworkPuzzleAttempt, HomeworkSubmission, Puzzle, Student, StudentDailyTarget } from '../types';
import { weekdayKeyFromIso } from './homeworkDayUtils';
import {
  countPerPuzzleResults,
  studentTotalThinkSeconds,
  type StudentHwStat,
} from './homeworkAnalysisUtils';
import { studentInitials } from './homeworkPanelUtils';
import {
  capDailyPuzzleDisplay,
  evaluatePlatformDayGoalsFromStats,
  type PlatformDayStats,
} from './homeworkPlatformUtils';

export function studentDailyTargetHasGoals(
  target?: StudentDailyTarget,
  hwDefaults?: Pick<HomeworkAssignment, 'dailyGameTarget' | 'dailyPuzzleTarget'>,
): boolean {
  if ((hwDefaults?.dailyGameTarget ?? 0) > 0 || (hwDefaults?.dailyPuzzleTarget ?? 0) > 0) return true;
  if (!target) return false;
  if ((target.dailyGameTarget ?? 0) > 0 || (target.dailyPuzzleTarget ?? 0) > 0) return true;
  return Object.values(target.weeklySchedule ?? {}).some(
    (day) => (day.dailyGameTarget ?? 0) > 0 || (day.dailyPuzzleTarget ?? 0) > 0,
  );
}

export function homeworkHasPlatformGoals(hw: HomeworkAssignment): boolean {
  if (studentDailyTargetHasGoals(undefined, hw)) return true;
  return Object.values(hw.studentDailyTargets ?? {}).some((t) => studentDailyTargetHasGoals(t));
}

/** Atanmış sistem bulmacası var — Ödev Takibi kapsamı. */
export function homeworkHasAssignedPuzzles(hw: HomeworkAssignment): boolean {
  return hw.puzzles.length > 0;
}

/** Lichess/Chess.com günlük/heftalık hedef tanımlı — Günlük Program kapsamı (bulmaca ödevi olsa bile). */
export function isDailyProgramAssignment(hw: HomeworkAssignment): boolean {
  return homeworkHasPlatformGoals(hw);
}

/** Bulmaca ödevi — Ödev Takibi listesinde gösterilir. */
export function isPuzzleTrackingAssignment(hw: HomeworkAssignment): boolean {
  return homeworkHasAssignedPuzzles(hw);
}

/** Ödev türü — aynı gruba atamada yalnızca aynı tür birbirinin yerine geçer. */
export type HomeworkAssignmentCategory = 'puzzle' | 'program' | 'other';

export function homeworkAssignmentCategory(hw: HomeworkAssignment): HomeworkAssignmentCategory {
  if (homeworkHasAssignedPuzzles(hw)) return 'puzzle';
  if (homeworkHasPlatformGoals(hw)) return 'program';
  return 'other';
}

function targetFromHwDefaults(hw: HomeworkAssignment): StudentDailyTarget {
  return {
    dailyGameTarget: hw.dailyGameTarget ?? 0,
    dailyPuzzleTarget: hw.dailyPuzzleTarget ?? 0,
    minPuzzleAccuracyPct: hw.minPuzzleAccuracyPct ?? 60,
  };
}

/** Günlük program hedefi — önce bu ödev, yoksa aynı öğrencinin diğer ödevlerinden devralır. */
export function resolveProgramDailyTarget(
  studentId: string,
  hw: HomeworkAssignment,
  allHomeworks: HomeworkAssignment[],
  getAssignees: (h: HomeworkAssignment) => Student[],
): StudentDailyTarget {
  const own = hw.studentDailyTargets?.[studentId];
  if (studentDailyTargetHasGoals(own)) {
    return {
      dailyGameTarget: own!.dailyGameTarget ?? hw.dailyGameTarget ?? 0,
      dailyPuzzleTarget: own!.dailyPuzzleTarget ?? hw.dailyPuzzleTarget ?? 0,
      minPuzzleAccuracyPct: own!.minPuzzleAccuracyPct ?? hw.minPuzzleAccuracyPct ?? 60,
      weeklySchedule: own!.weeklySchedule ? { ...own!.weeklySchedule } : undefined,
    };
  }
  if (studentDailyTargetHasGoals(undefined, hw)) {
    return {
      ...targetFromHwDefaults(hw),
      weeklySchedule: own?.weeklySchedule ? { ...own.weeklySchedule } : undefined,
    };
  }
  for (const other of allHomeworks) {
    if (other.id === hw.id) continue;
    if (!homeworkHasPlatformGoals(other)) continue;
    if (!getAssignees(other).some((s) => s.id === studentId)) continue;
    const otherOwn = other.studentDailyTargets?.[studentId];
    if (studentDailyTargetHasGoals(otherOwn)) {
      return {
        dailyGameTarget: otherOwn!.dailyGameTarget ?? other.dailyGameTarget ?? 0,
        dailyPuzzleTarget: otherOwn!.dailyPuzzleTarget ?? other.dailyPuzzleTarget ?? 0,
        minPuzzleAccuracyPct: otherOwn!.minPuzzleAccuracyPct ?? other.minPuzzleAccuracyPct ?? 60,
        weeklySchedule: otherOwn!.weeklySchedule ? { ...otherOwn!.weeklySchedule } : undefined,
      };
    }
    if (studentDailyTargetHasGoals(undefined, other)) {
      return {
        ...targetFromHwDefaults(other),
        weeklySchedule: otherOwn?.weeklySchedule ? { ...otherOwn.weeklySchedule } : undefined,
      };
    }
  }
  return {
    dailyGameTarget: own?.dailyGameTarget ?? hw.dailyGameTarget ?? 0,
    dailyPuzzleTarget: own?.dailyPuzzleTarget ?? hw.dailyPuzzleTarget ?? 0,
    minPuzzleAccuracyPct: own?.minPuzzleAccuracyPct ?? hw.minPuzzleAccuracyPct ?? 60,
    weeklySchedule: own?.weeklySchedule ? { ...own.weeklySchedule } : undefined,
  };
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

/** Sistem içi atanan bulmaca denemeleri — platform verisi yok. */
export function buildInternalHomeworkStats(
  hw: HomeworkAssignment,
  assignees: Student[],
  homeworkAttempts: HomeworkPuzzleAttempt[],
  homeworkSubmissions: HomeworkSubmission[],
  puzzles: Puzzle[],
): StudentHwStat[] {
  return assignees.map((student) => {
    const submitted = homeworkSubmissions.some(
      (s) => s.studentId === student.id && s.homeworkId === hw.id,
    );
    const attempts = homeworkAttempts.filter(
      (a) => a.homeworkId === hw.id && a.studentId === student.id,
    );
    const { correct, wrong, skipped } = countPerPuzzleResults(hw.puzzles, attempts);
    const points = hw.puzzles.reduce((sum, puzzleId) => {
      if (!attempts.some((a) => a.puzzleId === puzzleId && a.correct)) return sum;
      return sum + (puzzles.find((p) => p.id === puzzleId)?.points ?? 0);
    }, 0);
    const totalPuzzles = hw.puzzles.length;
    const progress = totalPuzzles > 0 ? Math.round((correct / totalPuzzles) * 100) : 0;
    const status = homeworkStatusFromPuzzles(submitted, totalPuzzles, attempts.length, correct);
    const timeSeconds = studentTotalThinkSeconds(attempts);

    return {
      studentId: student.id,
      name: student.name,
      initials: studentInitials(student.name),
      correct,
      wrong,
      skipped,
      points,
      timeSeconds,
      progress: submitted ? Math.max(progress, 100) : status === 'Başlamadı' ? 0 : progress,
      status,
    };
  });
}

export type PlatformStudentStat = StudentHwStat & {
  todayGames?: number;
  dailyGameTarget?: number;
  dailyPuzzleTarget?: number;
  minPuzzleAccuracyPct?: number;
  dailyGoalDone?: boolean;
  todayPuzzleSolved?: number;
};

function resolveStudentDayTargets(
  hw: HomeworkAssignment,
  student: Student,
  viewDate: string,
): { dailyGameTarget: number; dailyPuzzleTarget: number; minPuzzleAccuracy: number } {
  const target = hw.studentDailyTargets?.[student.id];
  const dayTarget = target?.weeklySchedule?.[weekdayKeyFromIso(viewDate)];
  return {
    dailyGameTarget: Math.max(0, dayTarget?.dailyGameTarget ?? target?.dailyGameTarget ?? hw.dailyGameTarget ?? 0),
    dailyPuzzleTarget: Math.max(0, dayTarget?.dailyPuzzleTarget ?? target?.dailyPuzzleTarget ?? hw.dailyPuzzleTarget ?? 0),
    minPuzzleAccuracy: Math.max(
      0,
      Math.min(100, dayTarget?.minPuzzleAccuracyPct ?? target?.minPuzzleAccuracyPct ?? hw.minPuzzleAccuracyPct ?? 60),
    ),
  };
}

/** Lichess + Chess.com günlük hedef takibi; atanan ödev bulmacaları viewDate günü dahil edilir. */
export function buildPlatformHomeworkStats(
  hw: HomeworkAssignment,
  assignees: Student[],
  viewDate: string,
  platformByStudent: Record<string, PlatformDayStats | undefined>,
  platformTimeByStudent: Record<string, number>,
): PlatformStudentStat[] {
  return assignees.map((student) => {
    const platform = platformByStudent[student.id];
    const { dailyGameTarget, dailyPuzzleTarget, minPuzzleAccuracy } = resolveStudentDayTargets(hw, student, viewDate);
    const goalEval = evaluatePlatformDayGoalsFromStats(
      dailyGameTarget,
      dailyPuzzleTarget,
      minPuzzleAccuracy,
      platform,
    );

    const todayGames = goalEval.games;
    const todayPuzzleSolved = goalEval.puzzleSolved;
    const hasTargets = dailyGameTarget > 0 || dailyPuzzleTarget > 0;
    const dailyGoalDone = goalEval.done;

    const capped = capDailyPuzzleDisplay(
      goalEval.puzzlePassed,
      goalEval.puzzleFailed,
      dailyPuzzleTarget,
    );
    const displayCorrect = capped.correct;
    const displayWrong = capped.wrong;

    const hasActivity = todayGames > 0 || todayPuzzleSolved > 0;
    let status: StudentHwStat['status'] = 'Başlamadı';
    if (hasTargets && dailyGoalDone) status = 'Tamamlandı';
    else if (hasActivity) status = 'Devam Ediyor';

    const progressParts: number[] = [];
    if (dailyGameTarget > 0) progressParts.push(Math.min(100, (todayGames / dailyGameTarget) * 100));
    if (dailyPuzzleTarget > 0) progressParts.push(Math.min(100, (todayPuzzleSolved / dailyPuzzleTarget) * 100));
    const progress = progressParts.length
      ? Math.round(progressParts.reduce((a, b) => a + b, 0) / progressParts.length)
      : dailyGoalDone ? 100 : 0;

    return {
      studentId: student.id,
      name: student.name,
      initials: studentInitials(student.name),
      correct: displayCorrect,
      wrong: displayWrong,
      skipped: 0,
      points: 0,
      timeSeconds: platformTimeByStudent[student.id] ?? 0,
      progress: dailyGoalDone ? 100 : progress,
      status,
      todayGames,
      dailyGameTarget,
      dailyPuzzleTarget,
      minPuzzleAccuracyPct: minPuzzleAccuracy,
      dailyGoalDone,
      todayPuzzleSolved,
    };
  });
}

export function platformSummaryFromStats(stats: PlatformStudentStat[]) {
  const withTargets = stats.filter(
    (s) => (s.dailyGameTarget ?? 0) > 0 || (s.dailyPuzzleTarget ?? 0) > 0,
  );
  const active = withTargets.filter(
    (s) => (s.todayGames ?? 0) > 0 || (s.todayPuzzleSolved ?? 0) > 0,
  );
  const completed = withTargets.filter((s) => s.dailyGoalDone).length;
  const avgCompletion = withTargets.length
    ? Math.round(withTargets.reduce((sum, s) => sum + s.progress, 0) / withTargets.length)
    : 0;
  const gameTargetSum = withTargets.reduce((sum, s) => sum + (s.dailyGameTarget ?? 0), 0);
  const puzzleTargetSum = withTargets.reduce((sum, s) => sum + (s.dailyPuzzleTarget ?? 0), 0);

  return {
    studentCount: stats.length,
    activeCount: active.length,
    completed,
    avgCompletion,
    gameTargetSum,
    puzzleTargetSum,
  };
}
