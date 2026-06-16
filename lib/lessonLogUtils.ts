import type { StudentLessonLogEntry } from '../types';

export function newLessonLogEntryId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ll-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseLessonDateSortKey(dateStr: string): number {
  const s = dateStr.trim();
  const tr = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (tr) {
    const d = new Date(Number(tr[3]), Number(tr[2]) - 1, Number(tr[1]));
    return d.getTime();
  }
  const iso = Date.parse(s);
  return Number.isFinite(iso) ? iso : 0;
}

export function formatLessonDateForInput(isoOrDisplay?: string): string {
  if (!isoOrDisplay?.trim()) return '';
  const tr = isoOrDisplay.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (tr) return isoOrDisplay.trim();
  const d = new Date(isoOrDisplay);
  if (Number.isNaN(d.getTime())) return isoOrDisplay.trim();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function todayTrLessonDate(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/** ISO yyyy-mm-dd → DD.MM.YYYY */
export function isoDateToTr(iso: string): string {
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return todayTrLessonDate();
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

export function sortLessonLogEntries(entries: StudentLessonLogEntry[]): StudentLessonLogEntry[] {
  return [...entries].sort((a, b) => parseLessonDateSortKey(b.date) - parseLessonDateSortKey(a.date));
}

export function extractLessonLogUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"']+/gi;
  return (text.match(re) ?? []).map((u) => u.replace(/[.,;]+$/, ''));
}

export function emptyLessonLogDraft(): StudentLessonLogEntry {
  return {
    id: newLessonLogEntryId(),
    date: todayTrLessonDate(),
    topic: '',
    info: '',
  };
}

/** Grup kaydı yokken öğrenci bazlı ders günlüklerinden tek listeye birleştirir */
export function mergeGroupLessonLogsFromStudents(
  groupName: string,
  students: { group?: string; lessonLog?: StudentLessonLogEntry[] }[],
  existing: StudentLessonLogEntry[],
): StudentLessonLogEntry[] {
  if (existing.length > 0) return existing;
  const seen = new Set<string>();
  const merged: StudentLessonLogEntry[] = [];
  for (const s of students) {
    if ((s.group ?? '') !== groupName) continue;
    for (const e of s.lessonLog ?? []) {
      const key = `${e.date}|${e.topic}|${e.info}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(e);
    }
  }
  return sortLessonLogEntries(merged);
}
