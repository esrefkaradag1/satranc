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
