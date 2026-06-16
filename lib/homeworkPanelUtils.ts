import type { Student, TrainingGroup, DisciplineBranch } from '../types';

export type HomeworkPanelTab = 'odev' | 'calisma' | 'program' | 'lider';

export type TargetFilter = {
  branchOffice: string;
  discipline: string;
  groupId: string;
  mode: 'group' | 'student';
  studentId: string;
};

export const EMPTY_TARGET: TargetFilter = {
  branchOffice: '',
  discipline: '',
  groupId: '',
  mode: 'group',
  studentId: '',
};

export function studentInitials(name: string): string {
  const names = name.split(' ').filter(Boolean);
  if (names.length >= 2) return (names[0]![0] + names[names.length - 1]![0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export function filterStudentsByTarget(
  students: Student[],
  target: TargetFilter,
  trainingGroups: TrainingGroup[],
): Student[] {
  let list = [...students];

  if (target.branchOffice) {
    list = list.filter((s) => (s.branchOffice || '').trim() === target.branchOffice);
  }
  if (target.discipline) {
    list = list.filter((s) => (s.branch || '').trim() === target.discipline);
  }
  if (target.groupId) {
    const group = trainingGroups.find((g) => g.id === target.groupId);
    if (group) {
      list = list.filter(
        (s) =>
          s.trainingGroupId === group.id ||
          (s.group || '').trim() === group.name.trim(),
      );
    }
  }
  if (target.mode === 'student' && target.studentId) {
    list = list.filter((s) => s.id === target.studentId);
  }

  return list;
}

export function disciplinesForOffice(
  disciplineBranches: DisciplineBranch[],
  office: string,
): DisciplineBranch[] {
  if (!office) return disciplineBranches;
  return disciplineBranches.filter((b) => b.branchOffice === office);
}

export function groupsForDiscipline(
  trainingGroups: TrainingGroup[],
  office: string,
  discipline: string,
): TrainingGroup[] {
  return trainingGroups.filter((g) => {
    if (office && g.branchOffice !== office) return false;
    if (discipline && g.discipline !== discipline) return false;
    return true;
  });
}

export const WEEKDAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

/** Ödev assignedTo (grup:… veya öğrenci id) → öğrenci kimlikleri */
export function expandHomeworkAssigneeIds(assignedTo: string[], students: Student[]): Set<string> {
  const ids = new Set<string>();
  for (const raw of assignedTo) {
    const t = (raw || '').trim();
    if (!t) continue;
    if (t.startsWith('group:')) {
      const group = t.slice(6).trim();
      students
        .filter((s) => (s.group || '').trim() === group)
        .forEach((s) => ids.add(s.id));
    } else {
      ids.add(t);
    }
  }
  return ids;
}

export function homeworkAssigneesOverlap(
  a: string[],
  b: string[],
  students: Student[],
): boolean {
  const setA = expandHomeworkAssigneeIds(a, students);
  for (const id of expandHomeworkAssigneeIds(b, students)) {
    if (setA.has(id)) return true;
  }
  return false;
}
