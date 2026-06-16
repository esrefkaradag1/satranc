import { getServiceSupabase, isSupabaseBackend, supabase } from './supabase';
import type { StudyActionEnvelope } from '../lib/studySync/types';

const ACTIONS_TABLE = 'chess_study_actions';
const SNAP_TABLE = 'chess_study_snapshots';
const PRESENCE_TABLE = 'chess_study_presence';

// biome-ignore lint/suspicious/noExplicitAny: DB rows
function rowToAction(row: any): StudyActionEnvelope {
  return {
    id: row.id,
    studyId: row.study_id,
    chapterId: row.chapter_id,
    seq: row.seq ?? 0,
    actorId: row.actor_id ?? null,
    actorRole: row.actor_role ?? null,
    type: row.type,
    payload: row.payload ?? {},
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

export async function appendStudyAction(args: {
  studyId: string;
  chapterId: string;
  actorId?: string | null;
  actorRole?: string | null;
  type: string;
  payload: any;
}): Promise<StudyActionEnvelope | null> {
  if (!isSupabaseBackend()) return null;
  const client = getServiceSupabase() ?? supabase;
  const { data, error } = await client
    .from(ACTIONS_TABLE)
    .insert({
      study_id: args.studyId,
      chapter_id: args.chapterId,
      // seq assigned by trigger
      actor_id: args.actorId ?? null,
      actor_role: args.actorRole ?? null,
      type: args.type,
      payload: args.payload ?? {},
    })
    .select('*')
    .single();
  if (error) {
    console.warn('[StudyActions] append error:', error.message);
    return null;
  }
  return rowToAction(data);
}

export async function loadStudyActions(studyId: string, chapterId: string, afterSeq: number = 0): Promise<StudyActionEnvelope[]> {
  if (!isSupabaseBackend()) return [];
  const client = getServiceSupabase() ?? supabase;
  const { data, error } = await client
    .from(ACTIONS_TABLE)
    .select('*')
    .eq('study_id', studyId)
    .eq('chapter_id', chapterId)
    .gt('seq', afterSeq)
    .order('seq', { ascending: true });
  if (error) {
    console.warn('[StudyActions] load error:', error.message);
    return [];
  }
  return (data ?? []).map(rowToAction);
}

export async function loadStudySnapshot(studyId: string, chapterId: string): Promise<{ lastSeq: number; tree: any } | null> {
  if (!isSupabaseBackend()) return null;
  const client = getServiceSupabase() ?? supabase;
  const { data, error } = await client
    .from(SNAP_TABLE)
    .select('*')
    .eq('study_id', studyId)
    .eq('chapter_id', chapterId)
    .maybeSingle();
  if (error) {
    console.warn('[StudyActions] snapshot load error:', error.message);
    return null;
  }
  if (!data) return null;
  return {
    lastSeq: data.last_seq ?? 0,
    tree: data.tree ?? {},
  };
}

export async function upsertStudySnapshot(args: { studyId: string; chapterId: string; lastSeq: number; tree: any }) {
  if (!isSupabaseBackend()) return;
  const client = getServiceSupabase() ?? supabase;
  const { error } = await client
    .from(SNAP_TABLE)
    .upsert(
      {
        study_id: args.studyId,
        chapter_id: args.chapterId,
        last_seq: args.lastSeq ?? 0,
        tree: args.tree ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'study_id,chapter_id' },
    );
  if (error) console.warn('[StudyActions] snapshot upsert error:', error.message);
}

export function subscribeStudyActions(params: {
  studyId: string;
  chapterId: string;
  onAction: (a: StudyActionEnvelope) => void;
}): () => void {
  if (!isSupabaseBackend()) return () => {};
  const channel = supabase
    .channel(`study_actions:${params.studyId}:${params.chapterId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: ACTIONS_TABLE, filter: `study_id=eq.${params.studyId}` },
      (payload) => {
        const row: any = payload.new;
        if (!row) return;
        if (String(row.chapter_id) !== String(params.chapterId)) return;
        params.onAction(rowToAction(row));
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function upsertPresence(args: {
  studyId: string;
  userId: string;
  chapterId: string | null;
  path: string | null;
  sticky: boolean;
  payload?: any;
}) {
  if (!isSupabaseBackend()) return;
  const client = getServiceSupabase() ?? supabase;
  const { error } = await client.from(PRESENCE_TABLE).upsert(
    {
      study_id: args.studyId,
      user_id: args.userId,
      chapter_id: args.chapterId,
      path: args.path,
      sticky: args.sticky,
      payload: args.payload || {},
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'study_id,user_id' },
  );
  if (error) console.warn('[StudyActions] presence upsert error:', error.message);
}

export async function loadStudyPresence(studyId: string): Promise<any[]> {
  if (!isSupabaseBackend()) return [];
  const client = getServiceSupabase() ?? supabase;
  const { data, error } = await client
    .from(PRESENCE_TABLE)
    .select('*')
    .eq('study_id', studyId)
    .order('last_seen', { ascending: false });
  if (error) {
    console.warn('[StudyActions] presence load error:', error.message);
    return [];
  }
  return data ?? [];
}

export function subscribeStudyPresence(params: {
  studyId: string;
  onRow: (row: any) => void;
}): () => void {
  if (!isSupabaseBackend()) return () => {};
  const channel = supabase
    .channel(`study_presence:${params.studyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: PRESENCE_TABLE, filter: `study_id=eq.${params.studyId}` },
      (payload) => {
        const row: any = (payload as any).new ?? (payload as any).old;
        if (!row) return;
        params.onRow(row);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

