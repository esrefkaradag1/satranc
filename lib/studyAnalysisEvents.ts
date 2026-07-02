import type { Study } from './studyTypes';
import type { StudyEvent } from '../studyEvents';

/** Eski chapter_id değerlerini güncel bölüm kimliklerine eşle (bölüm yeniden oluşturulduysa). */
export function buildOrphanChapterMap(events: StudyEvent[], study: Study): Map<string, string> {
  const knownIds = new Set(study.chapters.map((c) => c.id));
  const orphanFirstAt = new Map<string, number>();

  for (const e of events) {
    if (!e.chapterId || knownIds.has(e.chapterId)) continue;
    const t = Date.parse(e.createdAt) || 0;
    const prev = orphanFirstAt.get(e.chapterId);
    if (prev === undefined || t < prev) orphanFirstAt.set(e.chapterId, t);
  }

  const sortedOrphans = [...orphanFirstAt.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id);

  const map = new Map<string, string>();
  sortedOrphans.forEach((orphanId, i) => {
    const ch = study.chapters[i];
    if (ch) map.set(orphanId, ch.id);
  });
  return map;
}

export function resolveEventChapterId(
  eventChapterId: string,
  study: Study,
  orphanMap: Map<string, string>,
): string {
  if (!eventChapterId) return '';
  if (study.chapters.some((c) => c.id === eventChapterId)) return eventChapterId;
  return orphanMap.get(eventChapterId) ?? eventChapterId;
}

export function eventMatchesChapter(
  event: StudyEvent,
  chapterId: string | null | undefined,
  study: Study,
  orphanMap: Map<string, string>,
): boolean {
  if (!chapterId) return true;
  if (!event.chapterId?.trim()) return false;
  const resolved = resolveEventChapterId(event.chapterId, study, orphanMap);
  return resolved === chapterId;
}

export type MoveAnalysisLogEntry = {
  id: string;
  chapterId?: string;
  moveNo: number;
  playedSan: string;
  expectedSan: string;
  isCorrect: boolean;
  thinkMs: number;
  atIso: string;
  userName?: string;
};

function normalizePracticeLogEntry(raw: unknown): MoveAnalysisLogEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  return {
    id: String(e.id ?? e.atIso ?? Date.now()),
    chapterId: e.chapterId != null ? String(e.chapterId) : undefined,
    moveNo: Number(e.moveNo) || 1,
    playedSan: String(e.playedSan ?? e.played ?? ''),
    expectedSan: String(e.expectedSan ?? e.expected ?? ''),
    isCorrect: e.isCorrect !== false,
    thinkMs: Number(e.thinkMs) || 0,
    atIso: String(e.atIso ?? e.createdAt ?? new Date().toISOString()),
    userName: e.userName != null ? String(e.userName) : undefined,
  };
}

/** Öğrenci + bölüm bazında practiceLogs birleştirir (son bölümün diğerlerinin üzerine yazılmasını önler). */
export function mergePracticeLogEntries(
  existing: unknown[] | undefined,
  chapterId: string,
  chapterEntries: MoveAnalysisLogEntry[],
): MoveAnalysisLogEntry[] {
  const prev = Array.isArray(existing) ? existing : [];
  const rest = prev
    .map(normalizePracticeLogEntry)
    .filter((item): item is MoveAnalysisLogEntry => !!item)
    .filter((item) => (item.chapterId ?? '') !== chapterId);
  const tagged = chapterEntries.map((entry) => ({ ...entry, chapterId }));
  return [...rest, ...tagged];
}

export function practiceLogsForChapter(
  logs: unknown[] | undefined,
  chapterId: string,
): MoveAnalysisLogEntry[] {
  if (!Array.isArray(logs) || !chapterId) return [];
  return logs
    .map(normalizePracticeLogEntry)
    .filter((item): item is MoveAnalysisLogEntry => !!item)
    .filter((item) => item.chapterId === chapterId);
}

export function studyEventsToMoveAnalysis(events: StudyEvent[]): MoveAnalysisLogEntry[] {
  return events.map((event) => ({
    id: event.id,
    chapterId: event.chapterId,
    moveNo: Math.floor(event.moveIndex / 2) + 1,
    playedSan: event.playedMove ?? '',
    expectedSan: event.expectedMove ?? '',
    isCorrect: event.result !== 'wrong',
    thinkMs: event.thinkMs ?? 0,
    atIso: event.createdAt,
  }));
}

/** study.practiceLogs → StudyEvent (Supabase yedeği / eski kayıtlar). */
export function practiceLogsToEvents(study: Study): StudyEvent[] {
  const logs = study.practiceLogs ?? {};
  const events: StudyEvent[] = [];

  for (const [studentId, entries] of Object.entries(logs)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      events.push({
        id: `practice-${studentId}-${String(e.id ?? events.length)}`,
        studyId: study.id,
        chapterId: String(e.chapterId ?? ''),
        studentId: String(studentId),
        moveIndex: typeof e.moveIndex === 'number'
          ? e.moveIndex
          : Math.max(0, ((Number(e.moveNo) || 1) - 1) * 2),
        expectedMove: (e.expectedSan ?? e.expected ?? null) as string | null,
        playedMove: (e.playedSan ?? e.played ?? null) as string | null,
        result: e.isCorrect === false ? 'wrong' : (e.result === 'solution' ? 'solution' : 'correct'),
        thinkMs: Number(e.thinkMs) || 0,
        createdAt: String(e.atIso ?? e.createdAt ?? new Date().toISOString()),
      });
    }
  }
  return events;
}

export function mergeStudyAnalysisEvents(
  studyEvents: StudyEvent[] | undefined,
  study: Study,
): StudyEvent[] {
  const fromDb = studyEvents ?? [];
  const fromLogs = practiceLogsToEvents(study);
  const seen = new Set<string>();
  const merged: StudyEvent[] = [];

  for (const e of [...fromDb, ...fromLogs]) {
    const key = e.id.startsWith('practice-')
      ? `${e.studentId}|${e.chapterId}|${e.moveIndex}|${e.playedMove}|${e.thinkMs}`
      : e.id;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(e);
  }

  return merged.sort(
    (a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0),
  );
}
