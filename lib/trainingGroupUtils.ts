import type { DisciplineBranch, GroupLessonSlot, Student, TrainingGroup } from '../types';

export const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Pazartesi' },
  { value: 2, label: 'Salı' },
  { value: 3, label: 'Çarşamba' },
  { value: 4, label: 'Perşembe' },
  { value: 5, label: 'Cuma' },
  { value: 6, label: 'Cumartesi' },
  { value: 0, label: 'Pazar' },
];

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function findTrainingGroupByName(
  groups: TrainingGroup[],
  name: string,
  scope?: { branchOffice?: string; discipline?: string },
): TrainingGroup | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const matches = groups.filter((g) => g.name === trimmed);
  if (!matches.length) return undefined;
  if (scope?.branchOffice && scope.discipline) {
    return (
      matches.find(
        (g) => g.branchOffice === scope.branchOffice!.trim() && g.discipline === scope.discipline!.trim(),
      ) ?? matches[0]
    );
  }
  return matches[0];
}

export function findTrainingGroupById(groups: TrainingGroup[], id: string): TrainingGroup | undefined {
  if (!id) return undefined;
  return groups.find((g) => g.id === id);
}

export function findDisciplineBranch(
  branches: DisciplineBranch[],
  name: string,
  branchOffice?: string
): DisciplineBranch | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  if (branchOffice) {
    const match = branches.find((b) => b.name === trimmed && b.branchOffice === branchOffice);
    if (match) return match;
  }
  return branches.find((b) => b.name === trimmed);
}

export function getGroupMonthlyFee(group: TrainingGroup, branches: DisciplineBranch[]): number {
  if (group.monthlyFee != null && group.monthlyFee > 0) return group.monthlyFee;
  const branch = findDisciplineBranch(branches, group.discipline, group.branchOffice);
  return branch?.monthlyFee ?? 0;
}

export function applySiblingDiscount(
  baseFee: number,
  student: Pick<
    Student,
    | 'hasSiblingDiscount'
    | 'siblingDiscountPercent'
    | 'siblingDiscountType'
    | 'siblingDiscountAmount'
    | 'isScholarshipStudent'
  >
): {
  finalFee: number;
  discountAmount: number;
  discountPercent: number;
  isScholarship: boolean;
} {
  const fee = Math.max(0, baseFee);
  if (student.isScholarshipStudent) {
    return { finalFee: 0, discountAmount: fee, discountPercent: fee > 0 ? 100 : 0, isScholarship: true };
  }
  if (!student.hasSiblingDiscount) {
    return { finalFee: fee, discountAmount: 0, discountPercent: 0, isScholarship: false };
  }
  const type = student.siblingDiscountType ?? 'percent';
  if (type === 'amount') {
    const amt = Math.max(0, student.siblingDiscountAmount ?? 0);
    const discountAmount = Math.min(fee, Math.round(amt));
    const discountPercent = fee > 0 ? Math.round((discountAmount / fee) * 100) : 0;
    return {
      finalFee: Math.max(0, fee - discountAmount),
      discountAmount,
      discountPercent,
      isScholarship: false,
    };
  }
  const pct = Math.min(100, Math.max(0, student.siblingDiscountPercent ?? 0));
  const discountAmount = Math.round((fee * pct) / 100);
  return { finalFee: Math.max(0, fee - discountAmount), discountAmount, discountPercent: pct, isScholarship: false };
}

/** Öğrenci aidat etiketi: burslu, paket veya indirimli net tutar */
export function formatStudentFeeLabel(
  student: Student,
  trainingGroups: TrainingGroup[],
  disciplineBranches: DisciplineBranch[]
): string {
  if (student.isScholarshipStudent) return 'Burslu';
  if (student.registrationType === 'package') return 'Ders paketi';
  const baseFee = getBaseMonthlyFeeForStudent(student, trainingGroups, disciplineBranches);
  const { finalFee } = applySiblingDiscount(baseFee, student);
  return `₺${Number(finalFee).toLocaleString('tr-TR')}`;
}

export function getBaseMonthlyFeeForStudent(
  student: Student,
  trainingGroups: TrainingGroup[],
  disciplineBranches: DisciplineBranch[]
): number {
  if (student.monthlyFee != null && student.monthlyFee > 0) return student.monthlyFee;
  const group =
    findTrainingGroupById(trainingGroups, student.trainingGroupId ?? '') ??
    findTrainingGroupByName(trainingGroups, student.group);
  if (group) return getGroupMonthlyFee(group, disciplineBranches);
  const branch = findDisciplineBranch(disciplineBranches, student.branch ?? '', student.branchOffice);
  return branch?.monthlyFee ?? 0;
}

/** Kayıt tarihinden önceki takvim ayı mı? (aidat takviminde gösterilmez) */
export function isMonthBeforeRegistration(student: Student, year: number, month: number): boolean {
  const rd = student.registrationDate?.trim();
  if (!rd || rd.length < 7) return false;
  const regYear = parseInt(rd.slice(0, 4), 10);
  const regMonth = parseInt(rd.slice(5, 7), 10);
  if (!Number.isFinite(regYear) || !Number.isFinite(regMonth) || regMonth < 1 || regMonth > 12) {
    return false;
  }
  if (year < regYear) return true;
  if (year === regYear && month < regMonth) return true;
  return false;
}

export function getExpectedDueForMonth(
  student: Student,
  year: number,
  month: number,
  trainingGroups: TrainingGroup[],
  disciplineBranches: DisciplineBranch[]
): {
  expected: number;
  baseFee: number;
  discountAmount: number;
  discountPercent: number;
  isOverride: boolean;
  isScholarship: boolean;
} {
  if (student.isScholarshipStudent) {
    return { expected: 0, baseFee: 0, discountAmount: 0, discountPercent: 0, isOverride: false, isScholarship: true };
  }
  const key = monthKey(year, month);
  const override = student.duesOverrides?.[key];
  if (override != null && override >= 0) {
    return { expected: override, baseFee: override, discountAmount: 0, discountPercent: 0, isOverride: true, isScholarship: false };
  }
  const baseFee = getBaseMonthlyFeeForStudent(student, trainingGroups, disciplineBranches);
  const { finalFee, discountAmount, discountPercent, isScholarship } = applySiblingDiscount(baseFee, student);
  return { expected: finalFee, baseFee, discountAmount, discountPercent, isOverride: false, isScholarship };
}

export function getExpectedDuesForYear(
  student: Student,
  year: number,
  trainingGroups: TrainingGroup[],
  disciplineBranches: DisciplineBranch[]
): number {
  if (student.registrationType === 'package') return 0;
  let total = 0;
  for (let m = 1; m <= 12; m++) {
    if (isMonthBeforeRegistration(student, year, m)) continue;
    total += getExpectedDueForMonth(student, year, m, trainingGroups, disciplineBranches).expected;
  }
  return total;
}

export function applyGroupDefaultsToStudent(
  group: TrainingGroup,
  disciplineBranches: DisciplineBranch[]
): Pick<Student, 'group' | 'trainingGroupId' | 'branch' | 'branchOffice' | 'monthlyFee' | 'lessonSchedule'> {
  return {
    group: group.name,
    trainingGroupId: group.id,
    branch: group.discipline,
    branchOffice: group.branchOffice,
    monthlyFee: getGroupMonthlyFee(group, disciplineBranches),
    lessonSchedule: group.lessonSlots.map((s) => ({ ...s })),
  };
}

export function formatLessonSlot(slot: GroupLessonSlot): string {
  const time = slot.endTime ? `${slot.startTime}–${slot.endTime}` : slot.startTime;
  return `${slot.dayLabel} ${time}`;
}

export function formatLessonSchedule(slots: GroupLessonSlot[] | undefined): string {
  if (!slots?.length) return '—';
  return slots.map(formatLessonSlot).join(', ');
}

export function studentsInTrainingGroup(students: Student[], group: TrainingGroup): Student[] {
  const name = group.name.trim();
  return students.filter(
    (s) => s.trainingGroupId === group.id || (s.group || '').trim() === name,
  );
}

/** Branş–grup tanımlarından şube listesi (eski şube listesiyle birleşik) */
export function mergeBranchOffices(
  legacyOffices: string[],
  disciplineBranches: DisciplineBranch[],
): string[] {
  const fromDefs = disciplineBranches.map((b) => b.branchOffice.trim()).filter(Boolean);
  return [...new Set([...legacyOffices, ...fromDefs])].sort((a, b) => a.localeCompare(b, 'tr'));
}

/** Seçili şubedeki branş adları (brans-grup tanımlarından) */
export function disciplineNamesForOffice(
  disciplineBranches: DisciplineBranch[],
  branchOffice?: string,
): string[] {
  const office = branchOffice?.trim();
  const filtered = office
    ? disciplineBranches.filter((b) => b.branchOffice === office)
    : disciplineBranches;
  return [...new Set(filtered.map((b) => b.name.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'tr'),
  );
}

export function emptyLessonSlot(): GroupLessonSlot {
  return { dayOfWeek: 1, dayLabel: 'Pazartesi', startTime: '17:00', endTime: '18:30' };
}
