import type { HomeworkAssignment, HomeworkPuzzleAttempt, HomeworkSubmission, Puzzle, Student } from '../types';
import { resolveHomeworkAssignees } from '../homeworkUtils';
import { studentInitials } from './homeworkPanelUtils';

export type StudentHwStat = {
  studentId: string;
  name: string;
  initials: string;
  correct: number;
  wrong: number;
  skipped: number;
  points: number;
  timeSeconds: number;
  progress: number;
  status: 'Tamamlandı' | 'Devam Ediyor' | 'Başlamadı';
};

/** Ödevdeki her bulmaca için doğru / yanlış / çözülmedi sayar */
export function countPerPuzzleResults(
  puzzleIds: string[],
  attempts: HomeworkPuzzleAttempt[],
): { correct: number; wrong: number; skipped: number } {
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  for (const puzzleId of puzzleIds) {
    const forPuzzle = attempts.filter((a) => a.puzzleId === puzzleId);
    if (forPuzzle.length === 0) {
      skipped += 1;
    } else {
      if (forPuzzle.some((a) => a.correct)) {
        correct += 1;
      }
      wrong += forPuzzle.filter((a) => !a.correct).length;
    }
  }
  return { correct, wrong, skipped };
}

export function studentTotalThinkSeconds(attempts: HomeworkPuzzleAttempt[]): number {
  const sorted = [...attempts].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const recorded = sorted.reduce((sum, a) => sum + (a.thinkSeconds ?? 0), 0);
  if (recorded > 0) return recorded;
  if (sorted.length >= 2) {
    return Math.round(
      (new Date(sorted[sorted.length - 1]!.timestamp).getTime()
        - new Date(sorted[0]!.timestamp).getTime()) / 1000,
    );
  }
  if (sorted.length === 1 && sorted[0]!.thinkSeconds) return sorted[0]!.thinkSeconds;
  return 0;
}

export function attemptThinkSeconds(
  attempt: HomeworkPuzzleAttempt,
  sortedAsc: HomeworkPuzzleAttempt[],
): number | null {
  if (attempt.thinkSeconds != null && attempt.thinkSeconds > 0) return attempt.thinkSeconds;
  return thinkSecondsBetweenAttempts(sortedAsc, attempt.id);
}

export function getHomeworkAssignees(hw: HomeworkAssignment, students: Student[]): Student[] {
  return resolveHomeworkAssignees(hw, students);
}

export function getHomeworkGroupLabel(hw: HomeworkAssignment, students: Student[]): string {
  if (hw.groupName?.trim()) return hw.groupName.trim();
  const groups = hw.assignedTo
    .filter((a) => a.startsWith('group:'))
    .map((a) => a.replace('group:', ''));
  if (groups.length > 0) return groups.join(' · ');
  const assignees = getHomeworkAssignees(hw, students);
  const unique = [...new Set(assignees.map((s) => s.group).filter(Boolean))];
  return unique.length > 0 ? unique.join(' · ') : '—';
}

export function getHomeworkBranchLabel(hw: HomeworkAssignment, students: Student[]): string {
  if (hw.branchName?.trim()) return hw.branchName.trim();
  if (hw.branch?.trim()) return hw.branch.trim();
  const assignees = getHomeworkAssignees(hw, students);
  const office = assignees.find((s) => s.branchOffice?.trim())?.branchOffice?.trim();
  if (office) return office;
  const branch = assignees.find((s) => s.branch?.trim())?.branch?.trim();
  return branch || '—';
}

export function homeworkStatusLabel(hw: HomeworkAssignment): 'Aktif' | 'Süresi Doldu' {
  if (!hw.dueDate?.trim()) return 'Aktif';
  const end = hw.endDate?.trim() ? new Date(hw.endDate) : new Date(hw.dueDate);
  return end < new Date() ? 'Süresi Doldu' : 'Aktif';
}

export function homeworkEndDateLabel(hw: HomeworkAssignment): string {
  const raw = hw.endDate?.trim() || hw.dueDate?.trim();
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return raw;
  }
}

export function homeworkParticipation(
  hw: HomeworkAssignment,
  students: Student[],
  attempts: HomeworkPuzzleAttempt[],
  submissions: HomeworkSubmission[],
  opts?: { isStudentActive?: (studentId: string) => boolean },
): { started: number; total: number } {
  const assignees = getHomeworkAssignees(hw, students);
  const started = assignees.filter(
    (s) =>
      attempts.some((a) => a.homeworkId === hw.id && a.studentId === s.id)
      || submissions.some((sub) => sub.homeworkId === hw.id && sub.studentId === s.id)
      || opts?.isStudentActive?.(s.id),
  ).length;
  return { started, total: assignees.length };
}

export function homeworkStatusFromAttempts(
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

export function buildStudentStatsForHomework(
  hw: HomeworkAssignment,
  students: Student[],
  puzzles: Puzzle[],
  attempts: HomeworkPuzzleAttempt[],
  submissions: HomeworkSubmission[],
): StudentHwStat[] {
  const assignees = getHomeworkAssignees(hw, students);
  const totalPuzzles = hw.puzzles.length;

  return assignees.map((student) => {
    const submitted = submissions.some((s) => s.studentId === student.id && s.homeworkId === hw.id);
    const studentAttempts = attempts.filter((a) => a.homeworkId === hw.id && a.studentId === student.id);
    const { correct, wrong, skipped } = countPerPuzzleResults(hw.puzzles, studentAttempts);
    const points = hw.puzzles.reduce((sum, puzzleId) => {
      const solved = studentAttempts.some((a) => a.puzzleId === puzzleId && a.correct);
      if (!solved) return sum;
      return sum + (puzzles.find((p) => p.id === puzzleId)?.points ?? 0);
    }, 0);
    const progress = totalPuzzles > 0 ? Math.round((correct / totalPuzzles) * 100) : 0;
    const status = homeworkStatusFromAttempts(submitted, totalPuzzles, studentAttempts.length, correct);
    const timeSeconds = studentTotalThinkSeconds(studentAttempts);

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

export function homeworkSummaryFromStats(stats: StudentHwStat[], totalPuzzles: number) {
  const completed = stats.filter((s) => s.status === 'Tamamlandı').length;
  const avgCompletion = stats.length > 0
    ? Math.round(stats.reduce((sum, s) => sum + s.progress, 0) / stats.length)
    : 0;
  const avgPoints = stats.length > 0
    ? Math.round(stats.reduce((sum, s) => sum + s.points, 0) / stats.length)
    : 0;
  return {
    totalPuzzles,
    participation: { started: stats.filter((s) => s.status !== 'Başlamadı').length, total: stats.length },
    avgCompletion,
    avgPoints,
    completed,
  };
}

export function puzzleDifficultyDistribution(puzzles: Puzzle[]): Array<{ label: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const p of puzzles) {
    counts[p.difficulty] = (counts[p.difficulty] ?? 0) + 1;
  }
  return Object.entries(counts).map(([label, count]) => ({ label, count }));
}

export function thinkSecondsBetweenAttempts(
  sortedAsc: { id: string; timestamp: string }[],
  attemptId: string,
): number | null {
  const idx = sortedAsc.findIndex((a) => a.id === attemptId);
  if (idx <= 0) return null;
  const prev = sortedAsc[idx - 1]!;
  const cur = sortedAsc[idx]!;
  const sec = Math.round(
    (new Date(cur.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000,
  );
  if (sec <= 0 || sec > 7200) return null;
  return sec;
}

export function formatHomeworkDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}dk ${s}sn` : `${s}sn`;
}
