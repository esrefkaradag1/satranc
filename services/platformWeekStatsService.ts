import type { Student } from '../types';
import type { PlatformDayStats } from '../lib/homeworkPlatformUtils';

const BATCH_TIMEOUT_MS = 55_000;
/** Sunucu maxDuration (60s) içinde kalması için öğrenci grubu boyutu */
const STUDENT_CHUNK_SIZE = 12;

async function fetchStudentsPlatformWeekStatsChunk(
  students: Student[],
  days: string[],
): Promise<Record<string, Record<string, PlatformDayStats>> | null> {
  if (students.length === 0 || days.length === 0) return {};

  const payload = {
    students: students.map((s) => ({
      id: s.id,
      lichessUsername: s.lichessUsername,
      chessComUsername: s.chessComUsername,
    })),
    days: [...new Set(days.map((d) => d.slice(0, 10)))],
  };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);
  try {
    const res = await fetch('/api/platform-week-stats', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { stats?: Record<string, Record<string, PlatformDayStats>> };
    return body.stats ?? {};
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchStudentsPlatformWeekStats(
  students: Student[],
  days: string[],
): Promise<Record<string, Record<string, PlatformDayStats>> | null> {
  if (students.length === 0 || days.length === 0) return {};

  if (students.length <= STUDENT_CHUNK_SIZE) {
    return fetchStudentsPlatformWeekStatsChunk(students, days);
  }

  const merged: Record<string, Record<string, PlatformDayStats>> = {};
  let anyOk = false;
  let anyFailed = false;

  for (let i = 0; i < students.length; i += STUDENT_CHUNK_SIZE) {
    const chunk = students.slice(i, i + STUDENT_CHUNK_SIZE);
    const chunkStats = await fetchStudentsPlatformWeekStatsChunk(chunk, days);
    if (chunkStats === null) {
      anyFailed = true;
      continue;
    }
    anyOk = true;
    for (const [sid, byDay] of Object.entries(chunkStats)) {
      merged[sid] = { ...(merged[sid] ?? {}), ...byDay };
    }
  }

  if (!anyOk && anyFailed) return null;
  return merged;
}
