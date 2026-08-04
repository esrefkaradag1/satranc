import type { Student } from '../types';
import type { Study, StudyChapter } from './studyTypes';
import type { StudyEvent } from '../studyEvents';
import { mergeStudyAnalysisEvents, type MoveAnalysisLogEntry } from './studyAnalysisEvents';
import { studentInitials } from './homeworkPanelUtils';

export type StudyStudentStatus = 'Başlamadı' | 'Devam Ediyor' | 'Tamamlandı';

export type StudyStudentStat = {
  studentId: string;
  name: string;
  initials: string;
  status: StudyStudentStatus;
  correctMoves: number;
  wrongMoves: number;
  totalMoves: number;
  thinkSeconds: number;
  chaptersDone: number;
  chaptersTracked: number;
  lastActivityAt?: string;
};

function isTrackedChapter(ch: StudyChapter): boolean {
  if (ch.lessonMode !== 'interactive') return false;
  const t = ch.interactiveType ?? 'puzzle';
  return t === 'puzzle' || t === 'vsComputer' || t === 'liveAnalysis';
}

function normalizeLogEntry(raw: unknown): MoveAnalysisLogEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  return {
    id: String(e.id ?? e.atIso ?? Date.now()),
    chapterId: e.chapterId != null ? String(e.chapterId) : undefined,
    moveNo: Number(e.moveNo) || 1,
    playedSan: String(e.playedSan ?? e.played ?? ''),
    expectedSan: String(e.expectedSan ?? e.expected ?? ''),
    isCorrect: e.isCorrect !== false && e.result !== 'wrong',
    thinkMs: Number(e.thinkMs) || 0,
    atIso: String(e.atIso ?? e.createdAt ?? new Date().toISOString()),
  };
}

function eventsForStudent(events: StudyEvent[], studentId: string): StudyEvent[] {
  return events.filter((e) => String(e.studentId) === String(studentId));
}

function chapterCompleted(
  chapter: StudyChapter,
  studentEvents: StudyEvent[],
  logEntries: MoveAnalysisLogEntry[],
): boolean {
  const chapterEvents = studentEvents.filter((e) => e.chapterId === chapter.id);
  const chapterLogs = logEntries.filter((e) => e.chapterId === chapter.id);
  if (chapterEvents.length === 0 && chapterLogs.length === 0) return false;

  const type = chapter.interactiveType ?? 'puzzle';
  if (type === 'puzzle') {
    if (chapterEvents.some((e) => e.result === 'solution')) return true;
    if (chapterLogs.some((e) => e.isCorrect)) return true;
    if (chapterEvents.some((e) => e.result === 'correct')) return true;
    const mainlineMoves = chapter.moves?.length ?? 0;
    if (mainlineMoves <= 0) return chapterEvents.length > 0 || chapterLogs.length > 0;
    const studentMoves = chapterEvents.filter((e) => e.result !== 'wrong').length
      + chapterLogs.filter((e) => e.isCorrect).length;
    return studentMoves >= Math.ceil(mainlineMoves / 2);
  }
  if (type === 'liveAnalysis') {
    return chapterEvents.some((e) => e.chapterId === chapter.id)
      || logEntries.some((e) => e.chapterId === chapter.id);
  }
  if (type === 'vsComputer') {
    return studentEvents.some((e) => e.chapterId === chapter.id)
      || logEntries.some((e) => e.chapterId === chapter.id);
  }
  return chapterEvents.length > 0 || chapterLogs.length > 0;
}

export function buildStudyStudentStats(
  study: Study,
  students: Student[],
  dbEvents: StudyEvent[] = [],
): StudyStudentStat[] {
  const mergedEvents = mergeStudyAnalysisEvents(dbEvents, study);
  const trackedChapters = study.chapters.filter(isTrackedChapter);
  const memberSet = new Set(study.memberIds.map(String));
  const roster = students.filter((s) => memberSet.has(String(s.id)));

  return roster.map((student) => {
    const studentEvents = eventsForStudent(mergedEvents, student.id);
    const rawLogs = study.practiceLogs?.[student.id];
    const logEntries = Array.isArray(rawLogs)
      ? rawLogs.map(normalizeLogEntry).filter((x): x is MoveAnalysisLogEntry => !!x)
      : [];

    let correctMoves = 0;
    let wrongMoves = 0;
    let thinkMs = 0;
    let lastActivityAt = '';

    for (const e of studentEvents) {
      if (e.result === 'wrong') wrongMoves += 1;
      else correctMoves += 1;
      thinkMs += e.thinkMs ?? 0;
      if (e.createdAt && e.createdAt > lastActivityAt) lastActivityAt = e.createdAt;
    }

    const chaptersDone = trackedChapters.filter((ch) =>
      chapterCompleted(ch, studentEvents, logEntries),
    ).length;
    const chaptersTracked = trackedChapters.length;
    const totalMoves = correctMoves + wrongMoves;

    let status: StudyStudentStatus = 'Başlamadı';
    if (chaptersTracked > 0 && chaptersDone >= chaptersTracked) {
      status = 'Tamamlandı';
    } else if (totalMoves > 0 || chaptersDone > 0) {
      status = 'Devam Ediyor';
    }

    return {
      studentId: student.id,
      name: student.name,
      initials: studentInitials(student.name),
      status,
      correctMoves,
      wrongMoves,
      totalMoves,
      thinkSeconds: Math.round(thinkMs / 1000),
      chaptersDone,
      chaptersTracked,
      lastActivityAt: lastActivityAt || undefined,
    };
  }).sort((a, b) => {
    const order = { 'Devam Ediyor': 0, Tamamlandı: 1, 'Başlamadı': 2 };
    const diff = order[a.status] - order[b.status];
    if (diff !== 0) return diff;
    return b.totalMoves - a.totalMoves || a.name.localeCompare(b.name, 'tr');
  });
}

export function formatStudyThinkDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  if (seconds < 60) return `${seconds} sn`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m} dk ${s} sn` : `${m} dk`;
}
