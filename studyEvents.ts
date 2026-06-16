import { getServiceSupabase, isSupabaseBackend, supabase } from './services/supabase';

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

  try {
    const client = getServiceSupabase() ?? supabase;
    await client.from(TABLE).insert({
      study_id: studyId,
      chapter_id: chapterId,
      student_id: String(studentId),
      move_index: args.moveIndex,
      expected_move: args.expectedMove,
      played_move: args.playedMove,
      result: args.result,
      think_ms: args.thinkMs,
    });
  } catch (e) {
    console.warn('[StudyEvents] log failed:', e);
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

