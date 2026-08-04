import { getServiceSupabase, isSupabaseBackend, supabase, canWriteSupabase } from './services/supabase';

export type StudyEventResult = 'correct' | 'wrong' | 'solution';

export interface StudyEvent {
  id: string;
  studyId: string;
  chapterId: string;
  studentId: string;
  moveIndex: number;
  expectedMove: string | null;
  playedMove: string | null;
  result: StudyEventResult;
  thinkMs: number;
  createdAt: string;
}

const TABLE = 'chess_study_events';

async function postStudyEventViaApi(args: {
  studyId: string;
  chapterId: string;
  studentId: string;
  moveIndex: number;
  expectedMove: string | null;
  playedMove: string | null;
  result: StudyEventResult;
  thinkMs: number;
}) {
  try {
    const res = await fetch('/api/study-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({})) as { error?: string };
      console.warn('[StudyEvents] API log failed:', payload.error ?? res.status);
    }
  } catch (e) {
    console.warn('[StudyEvents] API log failed:', e);
  }
}

export async function logStudyEvent(args: {
  studyId: string | null | undefined;
  chapterId: string | null | undefined;
  studentId: string | null | undefined;
  moveIndex: number;
  expectedMove: string | null;
  playedMove: string | null;
  result: StudyEventResult;
  thinkMs: number;
}) {
  if (!isSupabaseBackend()) return;
  const { studyId, chapterId, studentId } = args;
  if (!studyId || !chapterId || !studentId) return;

  const payload = {
    studyId,
    chapterId,
    studentId: String(studentId),
    moveIndex: args.moveIndex,
    expectedMove: args.expectedMove,
    playedMove: args.playedMove,
    result: args.result,
    thinkMs: args.thinkMs,
  };

  if (!canWriteSupabase()) {
    await postStudyEventViaApi(payload);
    return;
  }

  try {
    const client = getServiceSupabase() ?? supabase;
    await client.from(TABLE).insert({
      study_id: payload.studyId,
      chapter_id: payload.chapterId,
      student_id: payload.studentId,
      move_index: payload.moveIndex,
      expected_move: payload.expectedMove,
      played_move: payload.playedMove,
      result: payload.result,
      think_ms: payload.thinkMs,
    });
  } catch (e) {
    console.warn('[StudyEvents] direct log failed, trying API:', e);
    await postStudyEventViaApi(payload);
  }
}

export async function loadStudyEvents(studyId: string): Promise<StudyEvent[]> {
  if (!isSupabaseBackend()) return [];
  try {
    const client = getServiceSupabase() ?? supabase;
    const { data, error } = await client
      .from(TABLE)
      .select('*')
      .eq('study_id', studyId)
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('[StudyEvents] load error:', error.message);
      return [];
    }
    return (data ?? []).map((row: any) => ({
      id: row.id,
      studyId: row.study_id,
      chapterId: row.chapter_id,
      studentId: String(row.student_id),
      moveIndex: row.move_index ?? 0,
      expectedMove: row.expected_move ?? null,
      playedMove: row.played_move ?? null,
      result: row.result as StudyEventResult,
      thinkMs: row.think_ms ?? 0,
      createdAt: row.created_at ?? new Date().toISOString(),
    }));
  } catch (e) {
    console.warn('[StudyEvents] load failed:', e);
    return [];
  }
}
