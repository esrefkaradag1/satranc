/**
 * Study storage — yalnızca Supabase (tek kaynak).
 *
 * localStorage cache kullanılmaz; canlı ve local aynı DB kaydını gösterir.
 */
import type { Study } from './lib/studyTypes';
import { getServiceSupabase, isSupabaseBackend, supabase } from './services/supabase';
import { migrateChapter, normalizeStudentPlaysColor } from './lib/studyUtils';

const TABLE = 'chess_studies';
const LEGACY_CACHE_KEYS = ['netchess_studies_cache_v1', 'netchess_studies_v2'];
const queuedStudySaves = new Map<string, Study>();
const inFlightStudySaves = new Set<string>();
let legacyCacheCleared = false;

function clearLegacyLocalCaches() {
  if (legacyCacheCleared || typeof window === 'undefined') return;
  legacyCacheCleared = true;
  for (const key of LEGACY_CACHE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

// ── Supabase row ↔ Study ──────────────────────────────────────────────────────
// biome-ignore lint/suspicious/noExplicitAny: raw DB row
function rowToStudy(row: any): Study {
  return {
    id:               row.id,
    title:            row.title ?? '',
    emoji:            row.emoji ?? '♟️',
    description:      row.description ?? '',
    chapters:         (Array.isArray(row.chapters) ? row.chapters : []).map(migrateChapter),
    memberIds:        Array.isArray(row.member_ids)    ? row.member_ids    : [],
    chatMessages:     Array.isArray(row.chat_messages) ? row.chat_messages : [],
    visibility:       row.visibility        ?? 'public',
    chat:             row.chat              ?? 'members',
    computerAnalysis: row.computer_analysis ?? 'none',
    openingExplorer:  row.opening_explorer  ?? 'everyone',
    clonePermission:  row.clone_permission  ?? 'everyone',
    shareExport:      row.share_export      ?? 'everyone',
    syncEnabled:      row.sync_enabled      ?? true,
    studyComments:    row.study_comments    ?? 'none',
    tags:             Array.isArray(row.tags) ? row.tags : [],
    topicTags:        Array.isArray(row.topic_tags) ? row.topic_tags : [],
    liked:            row.liked ?? false,
    likes:            row.likes ?? 0,
    studentPlaysColor:
      normalizeStudentPlaysColor(row.student_plays_color),
    studentCreated:   row.student_created ?? false,
    createdByStudentId: row.created_by_student_id ?? null,
    practiceLogs:     row.practice_logs && typeof row.practice_logs === 'object' ? row.practice_logs : {},
    createdAt:        row.created_at ?? new Date().toISOString(),
    updatedAt:        row.updated_at ?? row.created_at ?? undefined,
    categoryId:
      row.category_id != null && String(row.category_id).trim() !== ''
        ? String(row.category_id).trim()
        : null,
  };
}

let _hasCategoryIdColumn: boolean | null = null;
let _hasPracticeLogsColumn: boolean | null = null;

function isPgColumnError(err: unknown): boolean {
  const e = err as { status?: number; code?: string; message?: string };
  return (
    e.status === 400 ||
    e.code === 'PGRST204' ||
    (String(e.message || '').toLowerCase().includes('column') &&
      String(e.message || '').toLowerCase().includes('schema cache'))
  );
}

function missingColumnName(err: unknown): string | null {
  const msg = String((err as { message?: string })?.message ?? '');
  const m = msg.match(/'([^']+)'\s+column/i) ?? msg.match(/column\s+['"]?(\w+)['"]?/i);
  return m?.[1] ?? null;
}

function detectOptionalColumnsFromRow(row: Record<string, unknown>): void {
  if ('category_id' in row) _hasCategoryIdColumn = true;
  else if (_hasCategoryIdColumn === null) _hasCategoryIdColumn = false;
  if ('practice_logs' in row) _hasPracticeLogsColumn = true;
  else if (_hasPracticeLogsColumn === null) _hasPracticeLogsColumn = false;
}

function studyToRow(s: Study) {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    id:               s.id,
    title:            s.title,
    emoji:            s.emoji,
    description:      s.description ?? '',
    chapters:         s.chapters,
    member_ids:       s.memberIds,
    chat_messages:    s.chatMessages ?? [],
    visibility:       s.visibility,
    chat:             s.chat,
    computer_analysis: s.computerAnalysis,
    opening_explorer:  s.openingExplorer,
    clone_permission:  s.clonePermission,
    share_export:      s.shareExport,
    sync_enabled:      s.syncEnabled,
    study_comments:    s.studyComments,
    tags:              s.tags,
    topic_tags:        s.topicTags ?? [],
    liked:             s.liked ?? false,
    likes:             s.likes ?? 0,
    student_plays_color: normalizeStudentPlaysColor(s.studentPlaysColor),
    student_created:   s.studentCreated ?? false,
    created_by_student_id: s.createdByStudentId ?? null,
    created_at:        s.createdAt,
    updated_at:        s.updatedAt ?? now,
  };
  if (_hasCategoryIdColumn !== false) {
    row.category_id =
      s.categoryId && String(s.categoryId).trim() !== '' ? String(s.categoryId).trim() : null;
  }
  if (_hasPracticeLogsColumn === true) {
    row.practice_logs = s.practiceLogs ?? {};
  }
  return row;
}

async function upsertStudyRow(
  client: ReturnType<typeof getServiceSupabase>,
  study: Study
): Promise<{ error: unknown | null }> {
  if (!client) return { error: null };
  let row = studyToRow(study);
  let { error } = await client.from(TABLE).upsert(row, { onConflict: 'id' });
  let guard = 0;
  while (error && isPgColumnError(error) && guard < 6) {
    const col = missingColumnName(error);
    if (col === 'category_id') _hasCategoryIdColumn = false;
    else if (col === 'practice_logs') _hasPracticeLogsColumn = false;
    else break;
    row = studyToRow(study);
    ({ error } = await client.from(TABLE).upsert(row, { onConflict: 'id' }));
    guard += 1;
  }
  return { error };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Tüm çalışmaları Supabase'den yükle (localStorage birleştirmesi yok) */
export async function loadStudiesAsync(): Promise<Study[]> {
  clearLegacyLocalCaches();
  if (!isSupabaseBackend()) return [];
  try {
    const client = getServiceSupabase() ?? supabase;
    const { data, error } = await client
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('[StudyStorage] load error:', error.message);
      return [];
    }
    if (data?.[0] && typeof data[0] === 'object') {
      detectOptionalColumnsFromRow(data[0] as Record<string, unknown>);
    }
    return (data ?? []).filter(Boolean).map(rowToStudy);
  } catch (e) {
    console.warn('[StudyStorage] load failed:', e);
    return [];
  }
}

/** Tek çalışmayı upsert et (kaydet / güncelle) */
export async function saveStudyAsync(study: Study): Promise<void> {
  const stamped: Study = { ...study, updatedAt: new Date().toISOString() };
  if (!isSupabaseBackend()) return;
  queuedStudySaves.set(stamped.id, stamped);
  if (inFlightStudySaves.has(stamped.id)) return;

  inFlightStudySaves.add(stamped.id);
  try {
    const client = getServiceSupabase() ?? supabase;
    while (queuedStudySaves.has(stamped.id)) {
      const latest = queuedStudySaves.get(stamped.id);
      if (!latest) break;
      queuedStudySaves.delete(stamped.id);
      try {
        const { error } = await upsertStudyRow(client, latest);
        if (error) {
          console.warn('[StudyStorage] save error:', (error as { message?: string }).message ?? error);
        }
      } catch (e) {
        console.warn('[StudyStorage] save failed:', e);
      }
    }
  } finally {
    inFlightStudySaves.delete(stamped.id);
  }
}

/** Tek çalışmayı DB'den kalıcı olarak sil */
export async function deleteStudyAsync(studyId: string): Promise<void> {
  if (!isSupabaseBackend()) return;
  try {
    const client = getServiceSupabase() ?? supabase;
    const { error } = await client
      .from(TABLE)
      .delete()
      .eq('id', studyId);
    if (error) console.warn('[StudyStorage] delete error:', error.message);
    else console.log('[StudyStorage] deleted:', studyId);
  } catch (e) {
    console.warn('[StudyStorage] delete failed:', e);
  }
}

/** Supabase Realtime aboneliği — çalışmalar değiştiğinde callback çağrılır */
export function subscribeToStudies(callback: (studies: Study[]) => void): () => void {
  if (!isSupabaseBackend()) return () => {};
  const channel = supabase
    .channel('chess_studies_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, async () => {
      const fresh = await loadStudiesAsync();
      callback(fresh);
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// ── Backward-compat stubs (eski import'lar kırılmasın) ────────────────────────
export function loadStudiesFromStorage(): Study[] { return []; }
export const STUDY_STORAGE_KEY = 'netchess_studies_v2';
export async function saveStudiesAsync(studies: Study[]): Promise<void> {
  for (const s of studies) await saveStudyAsync(s);
}
