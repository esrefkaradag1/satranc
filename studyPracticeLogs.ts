import { canWriteSupabase, getServiceSupabase, isSupabaseBackend, supabase } from './services/supabase';
import type { MoveAnalysisLogEntry } from './lib/studyAnalysisEvents';

export type StudyPracticeLogEntry = {
  id: string;
  chapterId: string;
  moveNo: number;
  playedSan: string;
  expectedSan: string;
  isCorrect: boolean;
  thinkMs: number;
  atIso: string;
};

async function postPracticeLogsViaApi(args: {
  studyId: string;
  studentId: string;
  chapterId: string;
  entries: StudyPracticeLogEntry[];
}) {
  try {
    const res = await fetch('/api/study-practice-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({})) as { error?: string };
      console.warn('[StudyPracticeLogs] API save failed:', payload.error ?? res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[StudyPracticeLogs] API save failed:', e);
    return false;
  }
}

/** Öğrenci panelinden practice_logs güncelle — tarayıcıda service role yoksa API kullanır. */
export async function appendStudyPracticeLogs(args: {
  studyId: string;
  studentId: string;
  chapterId: string;
  entries: StudyPracticeLogEntry[];
}): Promise<boolean> {
  if (!isSupabaseBackend()) return false;
  if (!args.studyId || !args.studentId || !args.chapterId || args.entries.length === 0) return false;

  if (!canWriteSupabase()) {
    return postPracticeLogsViaApi(args);
  }

  try {
    const client = getServiceSupabase() ?? supabase;
    const { data: row, error: loadError } = await client
      .from('chess_studies')
      .select('id, practice_logs')
      .eq('id', args.studyId)
      .maybeSingle();
    if (loadError || !row) {
      return postPracticeLogsViaApi(args);
    }

    const practiceLogs =
      row.practice_logs && typeof row.practice_logs === 'object'
        ? { ...(row.practice_logs as Record<string, unknown>) }
        : {};
    const existing = practiceLogs[args.studentId];
    const prev = Array.isArray(existing) ? existing : [];
    const rest = prev.filter(
      (item) =>
        !item
        || typeof item !== 'object'
        || String((item as MoveAnalysisLogEntry).chapterId ?? '') !== args.chapterId,
    );
    practiceLogs[args.studentId] = [...rest, ...args.entries.map((e) => ({ ...e, chapterId: args.chapterId }))];

    const { error: saveError } = await client
      .from('chess_studies')
      .update({
        practice_logs: practiceLogs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', args.studyId);

    if (saveError) {
      return postPracticeLogsViaApi(args);
    }
    return true;
  } catch (e) {
    console.warn('[StudyPracticeLogs] direct save failed, trying API:', e);
    return postPracticeLogsViaApi(args);
  }
}
