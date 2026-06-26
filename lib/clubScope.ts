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
): boolean {
  const key = normalizeClubKey(clubName);
  if (normalizeClubKey(student.branchOffice) === key) return true;
  if (student.coachId) {
    const coach = coaches.find((c) => c.id === student.coachId);
    if (coach && normalizeClubKey(coach.branch) === key) return true;
  }
  return false;
}

export function coachBelongsToClub(coach: Coach, clubName: string): boolean {
  return normalizeClubKey(coach.branch) === normalizeClubKey(clubName);
}

export function transactionBelongsToClub(tx: Transaction, clubName: string): boolean {
  const key = normalizeClubKey(clubName);
  const txBranch = normalizeClubKey(tx.branch);
  return txBranch === key || (!tx.branch && key === 'Merkez');
}

export function filterStudentsByClub(students: Student[], clubName: string, coaches: Coach[] = []): Student[] {
  return students.filter((s) => studentBelongsToClub(s, clubName, coaches));
}

export function filterCoachesByClub(coaches: Coach[], clubName: string): Coach[] {
  return coaches.filter((c) => coachBelongsToClub(c, clubName));
}

export function filterTransactionsByClub(transactions: Transaction[], clubName: string): Transaction[] {
  return transactions.filter((t) => transactionBelongsToClub(t, clubName));
}
