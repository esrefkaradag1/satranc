import type { AuthUser, Coach, Student, TrainingGroup, Transaction, Tournament, DisciplineBranch, LessonPackage, HomeworkAssignment, AttendanceRecord, GalleryItem } from '../types';
import { filterCoachesByClub, filterStudentsByClub, filterTransactionsByClub, normalizeClubKey, studentBelongsToClub } from './clubScope';
import { clubOfficeNamesForAuth, orgRecordBelongsToClub, resolveClubIdFromAuth, type BranchOfficeRecord } from './orgStructureDb';
import { getAssignedStudentIds } from '../homeworkUtils';
import { findTrainingGroupById, findTrainingGroupByName, studentsInTrainingGroup } from './trainingGroupUtils';

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
  const cid = coachId.trim();
  const assignedGroups = trainingGroups.filter((g) => (g.coachIds ?? []).some((id) => id?.trim() === cid));
  const idSet = new Set<string>();
  for (const g of assignedGroups) {
    for (const s of studentsInTrainingGroup(students, g)) {
      idSet.add(s.id);
    }
  }
  for (const s of students) {
    if (s.coachId?.trim() === cid) idSet.add(s.id);
  }
  return students.filter((s) => idSet.has(s.id));
}

export function filterTrainingGroupsByCoach(
  trainingGroups: TrainingGroup[],
  coachId: string,
  branchOffice?: string,
): TrainingGroup[] {
  const cid = coachId.trim();
  if (!cid) return [];
  const officeKey = branchOffice ? normalizeClubKey(branchOffice) : '';
  return trainingGroups.filter((g) => {
    if (!(g.coachIds ?? []).some((id) => id?.trim() === cid)) return false;
    if (officeKey && normalizeClubKey(g.branchOffice ?? '') !== officeKey) return false;
    return true;
  });
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
    const clubId = resolveClubIdFromAuth(auth, clubs) ?? auth.clubId?.trim();
    const offices = clubOfficeNamesForAuth(auth, branchOfficeRecords, clubs);
    const clubBranch = auth.branch?.trim() || '';

    if (auth.coachId?.trim()) {
      const assigned = filterStudentsByCoach(students, auth.coachId, trainingGroups);
      // Doğrudan / grup ataması varsa onu kullan
      if (assigned.length > 0) return assigned;
      // Eski kayıtlar: izin var ama coachId öğrencilere işlenmemiş → kulüp kapsamına düş
      if (clubBranch || clubId) {
        return filterStudentsByClub(students, clubBranch || offices[0] || '', coaches, offices, clubId);
      }
      return [];
    }
    if (clubBranch) {
      return filterStudentsByClub(students, clubBranch, coaches, offices, clubId);
    }
    return [];
  }
  if (auth.role === 'club') {
    const clubId = resolveClubIdFromAuth(auth, clubs);
    const offices = clubOfficeNamesForAuth(auth, branchOfficeRecords, clubs);
    return filterStudentsByClub(students, auth.branch, coaches, offices, clubId);
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
  if (auth.role === 'coach') {
    const key = clubKeyForAuth(auth);
    let list = key
      ? trainingGroups.filter((g) => normalizeClubKey(g.branchOffice) === key)
      : trainingGroups;
    if (auth.coachId?.trim()) {
      const byCoach = filterTrainingGroupsByCoach(list, auth.coachId, key || undefined);
      // Atanmış grup yoksa kulüp gruplarını göster (eski antrenör kayıtları)
      if (byCoach.length > 0) return byCoach;
      return list;
    }
    return list;
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
  trainingGroups: TrainingGroup[] = [],
): DisciplineBranch[] {
  if (!auth || auth.role === 'admin') return branches;
  if (auth.role === 'club') {
    const offices = clubOfficeNamesForAuth(auth, branchOfficeRecords, clubs);
    return branches.filter((b) => orgRecordBelongsToClub(b, auth, offices, clubs));
  }
  if (auth.role === 'coach' && auth.coachId?.trim() && trainingGroups.length > 0) {
    const scopedGroups = resolveScopedTrainingGroups(auth, trainingGroups, branchOfficeRecords, clubs);
    if (scopedGroups.length > 0) {
      const keys = new Set(
        scopedGroups.map((g) => `${normalizeClubKey(g.branchOffice)}|${(g.discipline ?? '').trim()}`),
      );
      return branches.filter((b) =>
        keys.has(`${normalizeClubKey(b.branchOffice)}|${(b.name ?? '').trim()}`),
      );
    }
  }
  const key = clubKeyForAuth(auth);
  if (!key) return branches;
  return branches.filter((b) => normalizeClubKey(b.branchOffice) === key);
}

export function resolveScopedLessonPackages(
  auth: AuthUser | null,
  packages: LessonPackage[],
  branchOfficeRecords: BranchOfficeRecord[] = [],
  clubs: { id: string; name: string }[] = [],
): LessonPackage[] {
  if (!auth || auth.role === 'admin') return packages;
  if (auth.role === 'club') {
    const offices = clubOfficeNamesForAuth(auth, branchOfficeRecords, clubs);
    return packages.filter((p) => orgRecordBelongsToClub(p, auth, offices, clubs));
  }
  const key = clubKeyForAuth(auth);
  let list = key
    ? packages.filter((p) => normalizeClubKey(p.branchOffice) === key)
    : packages;
  if (auth.role === 'coach' && auth.coachId?.trim()) {
    const cid = auth.coachId.trim();
    list = list.filter((p) => (p.coachIds ?? []).some((id) => id?.trim() === cid));
  }
  return list;
}

export function resolveScopedTournaments(auth: AuthUser | null, tournaments: Tournament[]): Tournament[] {
  if (!auth || auth.role === 'admin') return tournaments;
  const key = clubKeyForAuth(auth);
  if (!key) return tournaments;
  return tournaments.filter((t) => normalizeClubKey(t.branch) === key || (!t.branch && key === 'Merkez'));
}

function scopedStudentIdSet(scopedStudents: Student[]): Set<string> {
  return new Set(scopedStudents.map((s) => s.id));
}

/** Ödevler: atanmış öğrenci veya grup kulüp kapsamındaysa görünür */
export function resolveScopedHomeworks(
  auth: AuthUser | null,
  homeworks: HomeworkAssignment[],
  scopedStudents: Student[],
  _scopedTrainingGroups: TrainingGroup[],
): HomeworkAssignment[] {
  if (!auth) return homeworks;
  // Admin kulüp seçmeden scoped boş → ödev gösterme; seçince kulüp gibi filtrele
  if (auth.role === 'admin' && scopedStudents.length === 0) return [];
  if (auth.role === 'admin') {
    const studentIds = scopedStudentIdSet(scopedStudents);
    return homeworks.filter((hw) => {
      const assigneeIds = getAssignedStudentIds(hw, scopedStudents);
      return assigneeIds.some((id) => studentIds.has(id));
    });
  }
  const studentIds = scopedStudentIdSet(scopedStudents);
  return homeworks.filter((hw) => {
    const assigneeIds = getAssignedStudentIds(hw, scopedStudents);
    return assigneeIds.some((id) => studentIds.has(id));
  });
}

/** Yoklama kayıtları: yalnızca kulüp öğrencileri */
export function resolveScopedAttendanceRecords(
  auth: AuthUser | null,
  records: AttendanceRecord[],
  scopedStudents: Student[],
): AttendanceRecord[] {
  if (!auth) return records;
  if (auth.role === 'admin' && scopedStudents.length === 0) return [];
  const studentIds = scopedStudentIdSet(scopedStudents);
  if (auth.role === 'admin') return records.filter((r) => studentIds.has(r.studentId));
  return records.filter((r) => studentIds.has(r.studentId));
}

/** Galeri: öğrenciye özel veya kulüp grubuna ait görseller */
export function resolveScopedGallery(
  auth: AuthUser | null,
  gallery: GalleryItem[],
  scopedStudents: Student[],
): GalleryItem[] {
  if (!auth) return gallery;
  if (auth.role === 'admin' && scopedStudents.length === 0) return [];
  const studentIds = scopedStudentIdSet(scopedStudents);
  const groupNames = new Set(scopedStudents.map((s) => (s.group ?? '').trim()).filter(Boolean));
  if (auth.role === 'admin') {
    return gallery.filter((item) => {
      if (item.studentId?.trim()) return studentIds.has(item.studentId.trim());
      const g = (item.group ?? '').trim();
      if (!g || g === 'Hepsi') return false;
      return groupNames.has(g);
    });
  }
  return gallery.filter((item) => {
    if (item.studentId?.trim()) return studentIds.has(item.studentId.trim());
    const g = (item.group ?? '').trim();
    if (!g || g === 'Hepsi') return false;
    return groupNames.has(g);
  });
}

/** Öğrenci ID'si mevcut oturum kapsamında mı? */
export function isStudentIdInScope(
  auth: AuthUser | null,
  studentId: string,
  scopedStudents: Student[],
): boolean {
  if (!auth) return false;
  return scopedStudentIdSet(scopedStudents).has(studentId);
}

/** Süper admin paneli: seçili kulüp için sahte kulüp oturumu (filtreleme). */
export function adminClubAuthProxy(
  club: { id: string; name: string } | null | undefined,
): AuthUser | null {
  if (!club?.id || !club.name?.trim()) return null;
  return { role: 'club', branch: club.name.trim(), clubId: club.id };
}

/** Admin kulüp seçimi: öğrencileri kulübe indirger. */
export function filterStudentsForAdminClub(
  students: Student[],
  club: { id: string; name: string },
  coaches: Coach[],
  branchOfficeRecords: BranchOfficeRecord[],
  clubs: { id: string; name: string }[],
): Student[] {
  const proxy = adminClubAuthProxy(club);
  if (!proxy) return students;
  const offices = clubOfficeNamesForAuth(proxy, branchOfficeRecords, clubs);
  return filterStudentsByClub(students, club.name, coaches, offices, club.id);
}

/** Admin kulüp seçimi: kasa işlemlerini kulübe indirger (şube adı + öğrenci bağı). */
export function filterTransactionsForAdminClub(
  transactions: Transaction[],
  club: { id: string; name: string },
  students: Student[],
  coaches: Coach[],
  branchOfficeRecords: BranchOfficeRecord[] = [],
  clubs: { id: string; name: string }[] = [],
): Transaction[] {
  const proxy = adminClubAuthProxy(club);
  if (!proxy) return transactions;
  const offices = clubOfficeNamesForAuth(proxy, branchOfficeRecords, clubs);
  const key = normalizeClubKey(club.name);
  const officeKeys = new Set([key, ...offices.map((o) => normalizeClubKey(o))]);
  return transactions.filter((tx) => {
    if (tx.branch && officeKeys.has(normalizeClubKey(tx.branch))) return true;
    if (filterTransactionsByClub([tx], club.name).length > 0) return true;
    if (tx.studentId) {
      const student = students.find((s) => s.id === tx.studentId);
      if (student && studentBelongsToClub(student, club.name, coaches, offices, club.id)) return true;
    }
    return false;
  });
}

export function filterCoachesForAdminClub(coaches: Coach[], club: { id: string; name: string }): Coach[] {
  const byId = coaches.filter((c) => c.clubId && c.clubId === club.id);
  if (byId.length > 0) return byId;
  return filterCoachesByClub(coaches, club.name);
}

export function filterOrgRecordsForAdminClub<T extends { clubId?: string; branchOffice?: string }>(
  records: T[],
  club: { id: string; name: string },
  branchOfficeRecords: BranchOfficeRecord[],
  clubs: { id: string; name: string }[],
): T[] {
  const proxy = adminClubAuthProxy(club);
  if (!proxy) return records;
  const offices = clubOfficeNamesForAuth(proxy, branchOfficeRecords, clubs);
  return records.filter((r) => orgRecordBelongsToClub(r, proxy, offices, clubs));
}
