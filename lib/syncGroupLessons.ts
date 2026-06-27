import type { Lesson, TrainingGroup } from '../types';
import { WEEKDAY_OPTIONS } from './trainingGroupUtils';

export function trainingGroupLessonId(groupId: string, slotIndex: number): string {
  return `tg-${groupId}-${slotIndex}`;
}

export function isTrainingGroupLessonId(id: string): boolean {
  return id.startsWith('tg-');
}

function dayLabelForSlot(dayOfWeek: number, dayLabel?: string): string {
  const trimmed = (dayLabel || '').trim();
  if (trimmed) return trimmed;
  const found = WEEKDAY_OPTIONS.find((d) => d.value === dayOfWeek);
  return found?.label ?? 'Pazartesi';
}

/** Eğitim grubu ders slotlarını haftalık ders programı (lessons) kayıtlarına çevirir */
export function lessonsFromTrainingGroup(group: TrainingGroup): Lesson[] {
  return (group.lessonSlots ?? [])
    .filter((slot) => slot.startTime?.trim())
    .map((slot, idx) => ({
      id: trainingGroupLessonId(group.id, idx),
      day: dayLabelForSlot(slot.dayOfWeek, slot.dayLabel),
      startTime: slot.startTime.trim(),
      endTime: (slot.endTime || '').trim() || '18:30',
      group: group.name,
      topic: group.discipline?.trim() || 'Satranç',
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
