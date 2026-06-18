/**
 * Ödev atama mantığı — tek kaynak.
 * Bulmaca Yönetimi (PuzzleManagement), ChessBoard Ödev Ata ve Öğrenci Paneli bu mantığı kullanır.
 */
import type { HomeworkAssignment } from './types';

export interface StudentForAssignment {
  id: string;
  group?: string | null;
}

function normalizeGroup(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Ödev bu öğrenciye atanmış mı? (grup adı veya öğrenci id) */
export function isHomeworkAssignedToStudent(
  hw: HomeworkAssignment,
  studentId: string,
  studentGroup: string | null | undefined
): boolean {
  const to = hw.assignedTo || [];
  const studentIdStr = String(studentId).trim();
  const studentGroupNorm = normalizeGroup(studentGroup || '');

  for (const a of to) {
    if (a.startsWith('group:')) {
      const hwGroup = a.replace(/^group:\s*/i, '').trim();
      if (normalizeGroup(hwGroup) === studentGroupNorm) return true;
      if (hwGroup === (studentGroup || '').trim()) return true;
    } else {
      if (String(a).trim() === studentIdStr) return true;
    }
  }

  if (hw.groupName && normalizeGroup(hw.groupName) === studentGroupNorm) return true;
  return false;
}

/** Ödevin atandığı öğrenci kayıtlarını döndürür (grup + bireysel id, normalize eşleşme) */
export function resolveHomeworkAssignees<T extends StudentForAssignment>(
  hw: HomeworkAssignment,
  students: T[],
): T[] {
  const ids = new Set(getAssignedStudentIds(hw, students));
  return students.filter((s) => ids.has(s.id));
}

/** Ödevin atandığı öğrenci listesini döndürür (grup + bireysel id) */
export function getAssignedStudentIds(
  hw: HomeworkAssignment,
  students: StudentForAssignment[]
): string[] {
  const ids = new Set<string>();
  const to = hw.assignedTo || [];
  const groupNames = to.filter(a => a.startsWith('group:')).map(a => a.replace(/^group:\s*/i, '').trim());
  const directIds = to.filter(a => !a.startsWith('group:')).map(a => a.trim());

  for (const s of students) {
    if (directIds.includes(String(s.id).trim())) ids.add(s.id);
    else if (groupNames.length > 0 && s.group != null) {
      const sGroupNorm = normalizeGroup(s.group);
      if (groupNames.some(g => normalizeGroup(g) === sGroupNorm)) ids.add(s.id);
    }
  }
  if (hw.groupName && groupNames.length === 0) {
    const gNorm = normalizeGroup(hw.groupName);
    students.filter(s => s.group != null && normalizeGroup(s.group) === gNorm).forEach(s => ids.add(s.id));
  }
  return Array.from(ids);
}
