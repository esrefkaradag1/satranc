import type { AttendanceRecord, Transaction } from '../types';
import { attendanceRecordsShareSession } from './attendanceSession';

function buildPrivateLessonSessionRecord(transaction: Pick<Transaction, 'lessonPackageId' | 'lessonPackageName' | 'lessonDiscipline' | 'lessonBranchOffice'>) {
  return {
    lessonId: String(transaction.lessonPackageId ?? '').trim() || undefined,
    attendanceType: 'lesson' as const,
    groupName: String(transaction.lessonPackageName ?? '').trim() || undefined,
    branch: String(transaction.lessonDiscipline ?? '').trim() || undefined,
    branchOffice: String(transaction.lessonBranchOffice ?? '').trim() || undefined,
  };
}

export type PrivateLessonBalance = {
  totalLessons: number;
  usedLessons: number;
  remainingLessons: number;
  attendanceUsedLessons: number;
  startingUsedLessons: number;
};

export function computePrivateLessonBalance(
  sale: Pick<
    Transaction,
    | 'studentId'
    | 'lessonCount'
    | 'startingUsedLessons'
    | 'lessonPackageId'
    | 'lessonPackageName'
    | 'lessonDiscipline'
    | 'lessonBranchOffice'
  >,
  attendanceRecords: AttendanceRecord[],
  options?: {
    studentId?: string;
    fallbackTotalLessons?: number;
    pendingTodayStatus?: 'Present' | 'Late' | 'Absent' | 'Excused' | null;
    todayIso?: string;
  },
): PrivateLessonBalance | null {
  const studentId = String(options?.studentId ?? sale.studentId ?? '').trim();
  if (!studentId) return null;
  const totalLessons = sale.lessonCount ?? options?.fallbackTotalLessons;
  if (totalLessons == null || totalLessons <= 0) return null;

  let attendanceUsedLessons = countPrivateLessonAttendanceUsage(sale, attendanceRecords, studentId);
  const todayIso = options?.todayIso?.slice(0, 10);
  const pending = options?.pendingTodayStatus ?? null;
  if (todayIso && pending) {
    const sessionRecord = buildPrivateLessonSessionRecord(sale);
    const existingToday = attendanceRecords.find(
      (record) =>
        record.studentId === studentId &&
        attendanceRecordsShareSession(record, sessionRecord) &&
        String(record.date ?? '').slice(0, 10) === todayIso,
    );
    const savedTodayUsed =
      existingToday && (existingToday.status === 'present' || existingToday.status === 'late') ? 1 : 0;
    const pendingTodayUsed =
      pending === 'Present' || pending === 'Late'
        ? 1
        : pending === 'Absent' || pending === 'Excused'
          ? 0
          : savedTodayUsed;
    attendanceUsedLessons = attendanceUsedLessons - savedTodayUsed + pendingTodayUsed;
  }

  const rawStartingUsed = Number(sale.startingUsedLessons ?? 0);
  const startingUsedLessons = Number.isFinite(rawStartingUsed)
    ? Math.max(0, Math.min(rawStartingUsed, totalLessons))
    : 0;
  const usedLessons = attendanceUsedLessons + startingUsedLessons;
  return {
    totalLessons,
    usedLessons,
    remainingLessons: Math.max(0, totalLessons - usedLessons),
    attendanceUsedLessons,
    startingUsedLessons,
  };
}

export function countPrivateLessonAttendanceUsage(
  transaction: Pick<Transaction, 'studentId' | 'lessonPackageId' | 'lessonPackageName' | 'lessonDiscipline' | 'lessonBranchOffice'>,
  attendanceRecords: AttendanceRecord[],
  studentIdOverride?: string,
): number {
  const studentId = String(studentIdOverride ?? transaction.studentId ?? '').trim();
  if (!studentId) return 0;
  const lessonPackageId = String(transaction.lessonPackageId ?? '').trim();
  const sessionRecord = buildPrivateLessonSessionRecord(transaction);

  return attendanceRecords.filter((record) => {
    if (record.studentId !== studentId) return false;
    if (record.status !== 'present' && record.status !== 'late') return false;
    if (lessonPackageId && String(record.lessonId ?? '').trim() === lessonPackageId) return true;
    return attendanceRecordsShareSession(record, sessionRecord);
  }).length;
}
