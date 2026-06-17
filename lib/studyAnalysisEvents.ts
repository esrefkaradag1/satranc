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
  const resolved = resolveEventChapterId(event.chapterId, study, orphanMap);
  if (resolved === chapterId) return true;
  // practiceLogs kayıtlarında chapterId yoksa mevcut bölümde göster
  if (!event.chapterId) return true;
  return false;
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
      ? `${e.studentId}|${e.moveIndex}|${e.playedMove}|${e.thinkMs}`
      : e.id;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(e);
  }

  return merged.sort(
    (a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0),
  );
}
