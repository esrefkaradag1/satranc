import type { HomeworkAssignment, HomeworkPuzzleAttempt, HomeworkSubmission, Puzzle, Student } from '../types';
import { resolveHomeworkAssignees } from '../homeworkUtils';
import { homeworkDayKey } from './homeworkDayUtils';
import { studentInitials } from './homeworkPanelUtils';

/** Tek bulmaca denemesi için makul üst sınır (2 saat). */
export const MAX_PLAUSIBLE_THINK_SECONDS = 7200;

/** Yanlış kayıt (Unix zaman damgası vb.) filtrelenir. */
export function sanitizeThinkSeconds(seconds?: number | null): number {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return 0;
  if (seconds > MAX_PLAUSIBLE_THINK_SECONDS) return 0;
  return Math.round(seconds);
}

export type HomeworkStudentStatus = 'Tamamlandı' | 'Kısmi yaptı' | 'Devam Ediyor' | 'Başlamadı' | 'Yapılmadı';

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
  status: HomeworkStudentStatus;
};

/** Ödevdeki her bulmaca için doğru / yanlış / çözülmedi sayar.
 * `wrong` = henüz doğrulanmamış (yalnızca yanlış denemesi olan) bulmaca sayısı —
 * deneme adedi değil. Böylece 3 bulmacada wrong ≤ 3 olur.
 */
export function countPerPuzzleResults(
  puzzleIds: string[],
  attempts: HomeworkPuzzleAttempt[],
  puzzles: Puzzle[] = [],
): { correct: number; wrong: number; skipped: number } {
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  for (const puzzleId of puzzleIds) {
    const forPuzzle = attemptsForAssignedPuzzle(attempts, puzzleId, puzzles);
    if (forPuzzle.length === 0) {
      skipped += 1;
    } else if (forPuzzle.some((a) => a.correct)) {
      correct += 1;
    } else {
      wrong += 1;
    }
  }
  return { correct, wrong, skipped };
}

/** Ödev listesindeki id + varsa lichessId eşlemeleri. */
export function homeworkAssignedPuzzleIdSet(
  hw: Pick<HomeworkAssignment, 'puzzles'>,
  puzzles: Puzzle[] = [],
): Set<string> {
  const ids = new Set<string>();
  for (const id of hw.puzzles) {
    if (!id) continue;
    ids.add(id);
    const p = puzzles.find((x) => x.id === id);
    if (p?.lichessId?.trim()) ids.add(p.lichessId.trim());
  }
  return ids;
}

export function isPuzzleAssignedToHomework(
  puzzleId: string,
  hw: Pick<HomeworkAssignment, 'puzzles'>,
  puzzles: Puzzle[] = [],
): boolean {
  if (!puzzleId) return false;
  return homeworkAssignedPuzzleIdSet(hw, puzzles).has(puzzleId);
}

/** Bu ödeve atanmış bulmacalara ait öğrenci denemeleri (ödev dışı kayıtlar elenir). */
export function filterAttemptsForHomeworkPuzzles(
  attempts: HomeworkPuzzleAttempt[],
  hw: Pick<HomeworkAssignment, 'id' | 'puzzles'>,
  studentId: string,
  puzzles: Puzzle[] = [],
): HomeworkPuzzleAttempt[] {
  const allowed = homeworkAssignedPuzzleIdSet(hw, puzzles);
  return attempts.filter(
    (a) => a.homeworkId === hw.id && a.studentId === studentId && allowed.has(a.puzzleId),
  );
}

function attemptsForAssignedPuzzle(
  attempts: HomeworkPuzzleAttempt[],
  puzzleId: string,
  puzzles: Puzzle[],
): HomeworkPuzzleAttempt[] {
  const p = puzzles.find((x) => x.id === puzzleId);
  const aliases = new Set<string>([puzzleId]);
  if (p?.lichessId?.trim()) aliases.add(p.lichessId.trim());
  return attempts.filter((a) => aliases.has(a.puzzleId));
}

export function studentTotalThinkSeconds(attempts: HomeworkPuzzleAttempt[]): number {
  const sorted = [...attempts].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const recorded = sorted.reduce((sum, a) => sum + sanitizeThinkSeconds(a.thinkSeconds), 0);
  if (recorded > 0) return recorded;
  if (sorted.length >= 2) {
    const span = Math.round(
      (new Date(sorted[sorted.length - 1]!.timestamp).getTime()
        - new Date(sorted[0]!.timestamp).getTime()) / 1000,
    );
    if (span > 0 && span <= MAX_PLAUSIBLE_THINK_SECONDS * Math.max(sorted.length, 1)) {
      return span;
    }
  }
  const single = sorted.length === 1 ? sanitizeThinkSeconds(sorted[0]!.thinkSeconds) : 0;
  return single;
}

export function attemptThinkSeconds(
  attempt: HomeworkPuzzleAttempt,
  sortedAsc: HomeworkPuzzleAttempt[],
): number | null {
  const stored = sanitizeThinkSeconds(attempt.thinkSeconds);
  if (stored > 0) return stored;
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
  const raw = hw.endDate?.trim() || hw.dueDate?.trim();
  if (!raw) return 'Aktif';
  const end = new Date(raw.includes('T') ? raw : `${raw}T23:59:59`);
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
  opts?: {
    /** @deprecated Yerine hasPlatformActivityInRange kullanın — tüm programlara bugünü yazar. */
    isStudentActive?: (studentId: string) => boolean;
    /** Platform aktivitesi bu ödevin tarih aralığında mı? (oluşturma günü hariç tutulabilir) */
    hasPlatformActivityInRange?: (
      studentId: string,
      range: { startDay: string | null; endDay: string | null; createdDay: string | null },
    ) => boolean;
  },
): { started: number; total: number } {
  const assignees = getHomeworkAssignees(hw, students);
  const startDay = (hw.startDate || '').trim().slice(0, 10) || null;
  const endDay = (hw.endDate || hw.dueDate || '').trim().slice(0, 10) || null;
  const createdDay = hw.createdAt?.trim().slice(0, 10) || null;
  const range = { startDay, endDay, createdDay };

  const started = assignees.filter((s) => {
    if (attempts.some((a) => a.homeworkId === hw.id && a.studentId === s.id)) return true;
    if (submissions.some((sub) => sub.homeworkId === hw.id && sub.studentId === s.id)) return true;
    if (opts?.hasPlatformActivityInRange) {
      return opts.hasPlatformActivityInRange(s.id, range);
    }
    if (opts?.isStudentActive?.(s.id)) return true;
    return false;
  }).length;
  return { started, total: assignees.length };
}

/** Platform katılımı: ödev tarih aralığındaki aktivite; oluşturma / başlangıç günü sayılmaz (yeni programda sahte katılım olmasın). */
export function studentHasPlatformActivityInHomeworkRange(
  byDay: Record<string, { games?: number; puzzleSolved?: number } | undefined> | undefined,
  range: { startDay: string | null; endDay: string | null; createdDay: string | null },
  today = homeworkDayKey(),
): boolean {
  if (!byDay) return false;
  const { startDay, endDay, createdDay } = range;
  // Başlangıç tarihi yoksa platform aktivitesini bu ödeve yazma (global "bugün aktif" sahte katılım üretir)
  if (!startDay) return false;

  // Oluşturma günü veya (createdAt yoksa) bugün başlayan programın ilk günü listede sayılmaz
  const skipDay = createdDay || (startDay === today ? startDay : null);

  for (const [day, stats] of Object.entries(byDay)) {
    if (!stats) continue;
    if (day < startDay) continue;
    if (endDay && day > endDay) continue;
    if (skipDay && day === skipDay) continue;
    if ((stats.games ?? 0) > 0 || (stats.puzzleSolved ?? 0) > 0) return true;
  }
  return false;
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
    const studentAttempts = filterAttemptsForHomeworkPuzzles(attempts, hw, student.id, puzzles);
    const { correct, wrong, skipped } = countPerPuzzleResults(hw.puzzles, studentAttempts, puzzles);
    const points = hw.puzzles.reduce((sum, puzzleId) => {
      const solved = attemptsForAssignedPuzzle(studentAttempts, puzzleId, puzzles).some((a) => a.correct);
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
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const sec = Math.round(seconds);
  // Unix zaman damgası veya bozuk toplam (ör. 29M dk)
  if (sec > 86400) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}sa ${m}dk`;
  if (m > 0) return `${m}dk ${s}sn`;
  return `${s}sn`;
}
