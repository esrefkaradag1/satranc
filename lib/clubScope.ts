import type { Coach, Student, Transaction } from '../types';

export const DEFAULT_CLUB_PASSWORD = 'kulup';

export function normalizeClubKey(name: string | undefined | null): string {
  return (name || 'Merkez').trim();
}

/** Öğrenci kulübe şube (branchOffice) veya eski kayıtlarda branch alanı ile bağlı olabilir */
export function studentBelongsToClub(student: Student, clubName: string): boolean {
  const key = normalizeClubKey(clubName);
  const office = normalizeClubKey(student.branchOffice);
  const branch = normalizeClubKey(student.branch);
  return office === key || branch === key;
}

export function coachBelongsToClub(coach: Coach, clubName: string): boolean {
  return normalizeClubKey(coach.branch) === normalizeClubKey(clubName);
}

export function transactionBelongsToClub(tx: Transaction, clubName: string): boolean {
  const key = normalizeClubKey(clubName);
  const txBranch = normalizeClubKey(tx.branch);
  return txBranch === key || (!tx.branch && key === 'Merkez');
}

export function filterStudentsByClub(students: Student[], clubName: string): Student[] {
  return students.filter((s) => studentBelongsToClub(s, clubName));
}

export function filterCoachesByClub(coaches: Coach[], clubName: string): Coach[] {
  return coaches.filter((c) => coachBelongsToClub(c, clubName));
}

export function filterTransactionsByClub(transactions: Transaction[], clubName: string): Transaction[] {
  return transactions.filter((t) => transactionBelongsToClub(t, clubName));
}
