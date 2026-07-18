/**
 * Platform istatistikleri: DB önce → API → merge → DB kaydet.
 * Öğrenci ve antrenör ekranları aynı kaynağı kullanır.
 */
import type { Student } from '../types';
import { homeworkDayKey, isoDateForWeekday, mondayOfWeek } from './homeworkDayUtils';
import {
  fetchStudentPlatformDayStats,
  mergePlatformDayStats,
  type PlatformDayStats,
} from './homeworkPlatformUtils';
import {
  loadPlatformDayStatsFromDb,
  savePlatformDayStatsToDb,
  type PlatformDayCacheRow,
} from '../services/platformStatsCacheService';
import { fetchStudentsPlatformWeekStats } from '../services/platformWeekStatsService';

function normalizeDays(days: string[]): string[] {
  return [...new Set(days.map((d) => d.slice(0, 10)).filter(Boolean))];
}

export function homeworkWeekDaysUpToToday(today = homeworkDayKey()): string[] {
  const monday = mondayOfWeek();
  const out: string[] = [];
  for (let d = 1; d <= 7; d++) {
    const iso = isoDateForWeekday(monday, d);
    if (iso <= today) out.push(iso);
  }
  return out;
}

function statsToCacheRow(studentId: string, day: string, stats: PlatformDayStats): PlatformDayCacheRow {
  return {
    studentId,
    day,
    stats,
    timeSeconds: Math.max(0, Math.round(Number(stats.activityTimeSeconds) || 0)),
  };
}

/** Tek öğrenci: DB + API birleştir, DB'ye yaz. */
export async function syncStudentPlatformDays(
  student: Student,
  allDays: string[],
  apiDays?: string[],
): Promise<Record<string, PlatformDayStats>> {
  const days = normalizeDays(allDays);
  if (days.length === 0) return {};

  const refreshDays = normalizeDays(apiDays ?? days);
  const sid = String(student.id ?? '').trim();
  if (!sid) return {};

  const db = await loadPlatformDayStatsFromDb([sid], days);
  const out: Record<string, PlatformDayStats> = {};
  for (const day of days) {
    const fromDb = db?.stats[sid]?.[day];
    if (fromDb) out[day] = fromDb;
  }

  let batchStats: Record<string, Record<string, PlatformDayStats>> | null = null;
  if (refreshDays.length > 0) {
    batchStats = await fetchStudentsPlatformWeekStats([student], refreshDays);
  }

  const rowsToSave: PlatformDayCacheRow[] = [];
  for (const day of days) {
    let merged = out[day];
    const fresh = batchStats?.[sid]?.[day];
    if (fresh) {
      merged = mergePlatformDayStats(merged, fresh);
    } else if (refreshDays.includes(day)) {
      try {
        const clientFresh = await fetchStudentPlatformDayStats(student, day);
        merged = mergePlatformDayStats(merged, clientFresh);
      } catch {
        /* DB değeri korunur */
      }
    }
    if (merged) {
      out[day] = merged;
      rowsToSave.push(statsToCacheRow(sid, day, merged));
    }
  }

  if (rowsToSave.length > 0) {
    await savePlatformDayStatsToDb(rowsToSave);
  }
  return out;
}

/** Çoklu öğrenci: DB + batch API → merge → DB. */
export async function syncStudentsPlatformDays(
  students: Student[],
  allDays: string[],
  apiDays?: string[],
): Promise<Record<string, Record<string, PlatformDayStats>>> {
  const days = normalizeDays(allDays);
  const refreshDays = normalizeDays(apiDays ?? days);
  if (students.length === 0 || days.length === 0) return {};

  const ids = students.map((s) => String(s.id)).filter(Boolean);
  const db = await loadPlatformDayStatsFromDb(ids, days);
  const out: Record<string, Record<string, PlatformDayStats>> = {};

  for (const sid of ids) {
    out[sid] = {};
    for (const day of days) {
      const fromDb = db?.stats[sid]?.[day];
      if (fromDb) out[sid][day] = fromDb;
    }
  }

  let batchStats: Record<string, Record<string, PlatformDayStats>> | null = null;
  if (refreshDays.length > 0 && students.length > 0) {
    batchStats = await fetchStudentsPlatformWeekStats(students, refreshDays);
  }

  const rowsToSave: PlatformDayCacheRow[] = [];
  for (const student of students) {
    const sid = String(student.id ?? '').trim();
    if (!sid) continue;
    for (const day of days) {
      let merged = out[sid]?.[day];
      const fresh = batchStats?.[sid]?.[day];
      if (fresh) {
        merged = mergePlatformDayStats(merged, fresh);
      } else if (refreshDays.includes(day)) {
        try {
          const clientFresh = await fetchStudentPlatformDayStats(student, day);
          merged = mergePlatformDayStats(merged, clientFresh);
        } catch {
          /* DB korunur */
        }
      }
      if (merged) {
        if (!out[sid]) out[sid] = {};
        out[sid][day] = merged;
        rowsToSave.push(statsToCacheRow(sid, day, merged));
      }
    }
  }

  if (rowsToSave.length > 0) {
    await savePlatformDayStatsToDb(rowsToSave);
  }
  return out;
}
