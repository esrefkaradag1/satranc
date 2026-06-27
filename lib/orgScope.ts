import type { AuthUser, Coach, Student, TrainingGroup, Transaction, Tournament, DisciplineBranch } from '../types';
import { filterCoachesByClub, filterStudentsByClub, filterTransactionsByClub, normalizeClubKey, studentBelongsToClub } from './clubScope';
import { clubOfficeNamesForAuth, orgRecordBelongsToClub, type BranchOfficeRecord } from './orgStructureDb';
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
  coaches: Coach[] = [],
  branchOfficeRecords: BranchOfficeRecord[] = [],
  clubs: { id: string; name: string }[] = [],
): Student[] {
  if (!auth) return students;
  if (auth.role === 'admin') return students;
  if (auth.role === 'coach') {
    if (auth.coachId) return filterStudentsByCoach(students, auth.coachId, trainingGroups);
    if (auth.branch) return filterStudentsByClub(students, auth.branch, coaches);
    return [];
  }
  if (auth.role === 'club') {
    const offices = clubOfficeNamesForAuth(auth, branchOfficeRecords, clubs);
    return filterStudentsByClub(students, auth.branch, coaches, offices);
  }
  if (auth.role === 'student' || auth.role === 'parent') {
    return students.filter((s) => s.id === auth.studentId);
  }
  return students;
}

export function coachesForClub(coaches: Coach[], clubName: string): Coach[] {
  const key = normalizeClubKey(clubName);
  return coaches.filter((c) => normalizeClubKey(c.branch) === key);
}

export function resolveClubBranch(auth: AuthUser | null): string | undefined {
  if (!auth) return undefined;
  if (auth.role === 'club') return normalizeClubKey(auth.branch);
  return undefined;
}

function clubKeyForAuth(auth: AuthUser | null): string | undefined {
  if (!auth) return undefined;
  if (auth.role === 'club') return normalizeClubKey(auth.branch);
  if (auth.role === 'coach' && auth.branch) return normalizeClubKey(auth.branch);
  return undefined;
}

export function resolveScopedTransactions(
  auth: AuthUser | null,
  transactions: Transaction[],
  students: Student[] = [],
  coaches: Coach[] = [],
): Transaction[] {
  if (!auth || auth.role === 'admin') return transactions;
  const key = clubKeyForAuth(auth);
  if (!key) return transactions;
  return transactions.filter((tx) => {
    if (filterTransactionsByClub([tx], key).length > 0) return true;
    if (tx.studentId) {
      const student = students.find((s) => s.id === tx.studentId);
      if (student && studentBelongsToClub(student, key, coaches)) return true;
    }
    return false;
  });
}

export function resolveScopedCoaches(auth: AuthUser | null, coaches: Coach[]): Coach[] {
  if (!auth || auth.role === 'admin') return coaches;
  const key = clubKeyForAuth(auth);
  if (key) return filterCoachesByClub(coaches, key);
  if (auth.role === 'coach' && auth.coachId) {
    const coach = coaches.find((c) => c.id === auth.coachId);
    if (coach?.branch) return filterCoachesByClub(coaches, coach.branch);
  }
  return coaches;
}

export function resolveScopedTrainingGroups(
  auth: AuthUser | null,
  trainingGroups: TrainingGroup[],
  branchOfficeRecords: BranchOfficeRecord[] = [],
  clubs: { id: string; name: string }[] = [],
): TrainingGroup[] {
  if (!auth || auth.role === 'admin') return trainingGroups;
  if (auth.role === 'club') {
    const offices = clubOfficeNamesForAuth(auth, branchOfficeRecords, clubs);
    return trainingGroups.filter((g) => orgRecordBelongsToClub(g, auth, offices, clubs));
  }
  const key = clubKeyForAuth(auth);
  if (!key) return trainingGroups;
  return trainingGroups.filter((g) => normalizeClubKey(g.branchOffice) === key);
}

export function resolveScopedDisciplineBranches(
  auth: AuthUser | null,
  branches: DisciplineBranch[],
  branchOfficeRecords: BranchOfficeRecord[] = [],
  clubs: { id: string; name: string }[] = [],
): DisciplineBranch[] {
  if (!auth || auth.role === 'admin') return branches;
  if (auth.role === 'club') {
    const offices = clubOfficeNamesForAuth(auth, branchOfficeRecords, clubs);
    return branches.filter((b) => orgRecordBelongsToClub(b, auth, offices, clubs));
  }
  const key = clubKeyForAuth(auth);
  if (!key) return branches;
  return branches.filter((b) => normalizeClubKey(b.branchOffice) === key);
}

export function resolveScopedTournaments(auth: AuthUser | null, tournaments: Tournament[]): Tournament[] {
  if (!auth || auth.role === 'admin') return tournaments;
  const key = clubKeyForAuth(auth);
  if (!key) return tournaments;
  return tournaments.filter((t) => normalizeClubKey(t.branch) === key || (!t.branch && key === 'Merkez'));
}
