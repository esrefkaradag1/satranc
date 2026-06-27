import type { Coach, Student, Transaction } from '../types';

export const DEFAULT_CLUB_PASSWORD = 'kulup';

export function normalizeClubKey(name: string | undefined | null): string {
  return (name || 'Merkez').trim().toLocaleLowerCase('tr-TR');
}

/** Öğrenci kulübe şube (branchOffice) veya atanmış antrenörün kulübü ile bağlı */
export function studentBelongsToClub(
  student: Student,
  clubName: string,
  coaches: Coach[] = [],
  clubOffices: string[] = [],
): boolean {
  const key = normalizeClubKey(clubName);
  const officeKeys = new Set([key, ...clubOffices.map((o) => normalizeClubKey(o))]);
  if (officeKeys.has(normalizeClubKey(student.branchOffice))) return true;
  if (student.coachId) {
    const coach = coaches.find((c) => c.id === student.coachId);
    if (coach && officeKeys.has(normalizeClubKey(coach.branch))) return true;
  }
  return false;
}

export function filterStudentsByClub(
  students: Student[],
  clubName: string,
  coaches: Coach[] = [],
  clubOffices: string[] = [],
): Student[] {
  return students.filter((s) => studentBelongsToClub(s, clubName, coaches, clubOffices));
}

export function coachBelongsToClub(coach: Coach, clubName: string): boolean {
  return normalizeClubKey(coach.branch) === normalizeClubKey(clubName);
}

export function transactionBelongsToClub(tx: Transaction, clubName: string): boolean {
  const key = normalizeClubKey(clubName);
  const txBranch = normalizeClubKey(tx.branch);
  return txBranch === key || (!tx.branch && key === 'Merkez');
}

export function filterCoachesByClub(coaches: Coach[], clubName: string): Coach[] {
  return coaches.filter((c) => coachBelongsToClub(c, clubName));
}

export function filterTransactionsByClub(transactions: Transaction[], clubName: string): Transaction[] {
  return transactions.filter((t) => transactionBelongsToClub(t, clubName));
}
