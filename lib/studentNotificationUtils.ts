import type { Student } from '../types';

/** Pasif öğrencilere otomatik/manuel mesaj ve bildirim gönderilmez. */
export function isStudentNotificationsEnabled(
  student: Pick<Student, 'status'> | null | undefined,
): boolean {
  return !!student && student.status !== 'inactive';
}

export function activeStudentsForNotifications<T extends Pick<Student, 'status'>>(
  students: T[],
): T[] {
  return students.filter(isStudentNotificationsEnabled);
}
