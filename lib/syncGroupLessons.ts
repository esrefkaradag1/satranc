import type { Lesson, TrainingGroup } from '../types';
import { WEEKDAY_OPTIONS } from './trainingGroupUtils';

export function trainingGroupLessonId(groupId: string, slotIndex: number): string {
  return `tg-${groupId}-${slotIndex}`;
}

export function isTrainingGroupLessonId(id: string): boolean {
  return id.startsWith('tg-');
}

/** `tg-{groupId}-{slotIndex}` — groupId UUID içerebilir */
export function trainingGroupIdFromLessonId(id: string): string | null {
  if (!isTrainingGroupLessonId(id)) return null;
  const body = id.slice(3);
  const lastDash = body.lastIndexOf('-');
  if (lastDash <= 0) return null;
  const slotPart = body.slice(lastDash + 1);
  if (!/^\d+$/.test(slotPart)) return null;
  return body.slice(0, lastDash);
}

function dayLabelForSlot(dayOfWeek: number, dayLabel?: string): string {
  const trimmed = (dayLabel || '').trim();
  if (trimmed) return trimmed;
  const found = WEEKDAY_OPTIONS.find((d) => d.value === dayOfWeek);
  return found?.label ?? 'Pazartesi';
}

/** Eğitim grubu ders slotlarını haftalık ders programı (lessons) kayıtlarına çevirir */
export function lessonsFromTrainingGroup(group: TrainingGroup): Lesson[] {
  const groupName = group.name.trim();
  const discipline = group.discipline?.trim() || 'Satranç';
  return (group.lessonSlots ?? [])
    .filter((slot) => slot.startTime?.trim())
    .map((slot, idx) => ({
      id: trainingGroupLessonId(group.id, idx),
      day: dayLabelForSlot(slot.dayOfWeek, slot.dayLabel),
      startTime: slot.startTime.trim(),
      endTime: (slot.endTime || '').trim() || '18:30',
      group: groupName,
      topic: groupName || discipline,
      branch: group.branchOffice?.trim() || undefined,
    }));
}

/** Mevcut listeden bu gruba ait otomatik dersleri çıkarıp yenilerini ekler */
export function mergeTrainingGroupLessons(group: TrainingGroup, lessons: Lesson[]): Lesson[] {
  const prefix = `tg-${group.id}-`;
  const rest = lessons.filter((l) => !l.id.startsWith(prefix));
  return [...rest, ...lessonsFromTrainingGroup(group)];
}

export function removeTrainingGroupLessonsFromList(groupId: string, lessons: Lesson[]): Lesson[] {
  const prefix = `tg-${groupId}-`;
  return lessons.filter((l) => !l.id.startsWith(prefix));
}

/** Silinmiş gruplara ait tg-* derslerini çıkarır; mevcut grupları yeniden senkronize eder */
export function reconcileTrainingGroupLessons(
  trainingGroups: TrainingGroup[],
  lessons: Lesson[],
): { lessons: Lesson[]; removedIds: string[] } {
  const activeGroupIds = new Set(trainingGroups.map((g) => g.id));
  const removedIds: string[] = [];

  let rest = lessons.filter((l) => {
    if (!isTrainingGroupLessonId(l.id)) return true;
    const groupId = trainingGroupIdFromLessonId(l.id);
    if (groupId && activeGroupIds.has(groupId)) return true;
    removedIds.push(l.id);
    return false;
  });

  let result = rest;
  for (const group of trainingGroups) {
    result = mergeTrainingGroupLessons(group, result);
  }

  return { lessons: result, removedIds };
}

/** Yalnızca tanımlı eğitim gruplarına ait dersleri gösterir (eski grup adları elenir) */
export function filterLessonsToActiveGroups(
  lessons: Lesson[],
  trainingGroups: TrainingGroup[],
): Lesson[] {
  const activeIds = new Set(trainingGroups.map((g) => g.id));
  const activeNames = new Set(
    trainingGroups.map((g) => g.name.trim().toLowerCase()).filter(Boolean),
  );

  return lessons.filter((l) => {
    if (l.studentId) return true;
    if (isTrainingGroupLessonId(l.id)) {
      const groupId = trainingGroupIdFromLessonId(l.id);
      return groupId != null && activeIds.has(groupId);
    }
    const groupName = (l.group || '').trim().toLowerCase();
    return groupName.length > 0 && activeNames.has(groupName);
  });
}

/** Kulüp/şube kapsamındaki grupların derslerini filtreler */
export function filterLessonsForTrainingGroups(
  lessons: Lesson[],
  trainingGroups: TrainingGroup[],
): Lesson[] {
  const scopedIds = new Set(trainingGroups.map((g) => g.id));
  const scopedNames = new Set(
    trainingGroups.map((g) => g.name.trim().toLowerCase()).filter(Boolean),
  );
  const scopedBranches = new Set(
    trainingGroups.map((g) => (g.branchOffice || '').trim().toLowerCase()).filter(Boolean),
  );

  return filterLessonsToActiveGroups(lessons, trainingGroups).filter((l) => {
    if (l.studentId) return true;
    if (isTrainingGroupLessonId(l.id)) {
      const groupId = trainingGroupIdFromLessonId(l.id);
      return groupId != null && scopedIds.has(groupId);
    }
    const groupName = (l.group || '').trim().toLowerCase();
    if (groupName && scopedNames.has(groupName)) return true;
    const branch = (l.branch || '').trim().toLowerCase();
    return branch.length > 0 && scopedBranches.has(branch) && groupName.length > 0 && scopedNames.has(groupName);
  });
}

export function activeTrainingGroupNames(trainingGroups: TrainingGroup[]): string[] {
  return [...new Set(trainingGroups.map((g) => g.name.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'tr'),
  );
}
