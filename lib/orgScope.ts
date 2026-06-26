import type { AuthUser, Coach, Student, TrainingGroup } from '../types';
import { filterStudentsByClub, normalizeClubKey } from './clubScope';
import { findTrainingGroupById, findTrainingGroupByName } from './trainingGroupUtils';

export function getStudentTrainingGroup(
  student: Student,
  trainingGroups: TrainingGroup[],
): TrainingGroup | undefined {
  if (student.trainingGroupId) {
    return findTrainingGroupById(trainingGroups, student.trainingGroupId);
  }
  const groupName = (student.group ?? '').trim();
  if (!groupName) return undefined;
  return findTrainingGroupByName(trainingGroups, groupName, {
    branchOffice: student.branchOffice,
    discipline: student.branch,
  });
}

/** Öğrencinin bağlı antrenör kimlikleri: doğrudan atama + eğitim grubu antrenörleri */
export function resolveStudentCoachIds(student: Student, trainingGroups: TrainingGroup[]): string[] {
  const ids = new Set<string>();
  if (student.coachId?.trim()) ids.add(student.coachId.trim());
  const tg = getStudentTrainingGroup(student, trainingGroups);
  for (const id of tg?.coachIds ?? []) {
    if (id?.trim()) ids.add(id.trim());
  }
  return [...ids];
}

export function studentBelongsToCoach(
  student: Student,
  coachId: string,
  trainingGroups: TrainingGroup[],
): boolean {
  if (!coachId) return false;
  return resolveStudentCoachIds(student, trainingGroups).includes(coachId);
}

export function filterStudentsByCoach(
  students: Student[],
  coachId: string,
  trainingGroups: TrainingGroup[],
): Student[] {
  if (!coachId) return [];
  return students.filter((s) => studentBelongsToCoach(s, coachId, trainingGroups));
}

export function getCoachNamesForStudent(
  student: Student,
  coaches: Coach[],
  trainingGroups: TrainingGroup[],
): string[] {
  return resolveStudentCoachIds(student, trainingGroups)
    .map((id) => coaches.find((c) => c.id === id)?.name)
    .filter((n): n is string => Boolean(n));
}

export function getPrimaryCoachId(
  student: Student,
  trainingGroups: TrainingGroup[],
): string | undefined {
  if (student.coachId?.trim()) return student.coachId.trim();
  const tg = getStudentTrainingGroup(student, trainingGroups);
  return tg?.coachIds?.[0]?.trim() || undefined;
}

export function getClubNameForStudent(student: Student): string {
  return normalizeClubKey(student.branchOffice);
}

export function resolveScopedStudents(
  auth: AuthUser | null,
  students: Student[],
  trainingGroups: TrainingGroup[],
): Student[] {
  if (!auth) return students;
  if (auth.role === 'admin') return students;
  if (auth.role === 'coach') {
    if (auth.coachId) return filterStudentsByCoach(students, auth.coachId, trainingGroups);
    if (auth.branch) return filterStudentsByClub(students, auth.branch);
    return [];
  }
  if (auth.role === 'club') return filterStudentsByClub(students, auth.branch);
  if (auth.role === 'student' || auth.role === 'parent') {
    return students.filter((s) => s.id === auth.studentId);
  }
  return students;
}

export function coachesForClub(coaches: Coach[], clubName: string): Coach[] {
  const key = normalizeClubKey(clubName);
  return coaches.filter((c) => normalizeClubKey(c.branch) === key);
}
