/**
 * Antrenör çalışma kategorileri — Supabase (chess_study_categories).
 * Supabase yoksa geçici olarak localStorage yedeklenir.
 */
import { getServiceSupabase, isSupabaseBackend, supabase } from './services/supabase';

export type StudyCategoryMeta = {
  id: string;
  name: string;
};

const LOCAL_KEY = 'netchess_study_categories_v1';
const TABLE = 'chess_study_categories';

function readLocalCategories(): StudyCategoryMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p
      .map((x) => ({
        id: typeof (x as { id?: unknown })?.id === 'string' ? (x as { id: string }).id : '',
        name: typeof (x as { name?: unknown })?.name === 'string' ? String((x as { name: string }).name).trim() : '',
      }))
      .filter((c): c is StudyCategoryMeta => c.id.length > 0 && c.name.length > 0);
  } catch {
    return [];
  }
}

function writeLocalCategories(list: StudyCategoryMeta[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** @deprecated Yerel senkron yükleme — loadStudyCategoriesAsync kullanın */
export function loadStudyCategories(): StudyCategoryMeta[] {
  return readLocalCategories();
}

/** @deprecated Yerel senkron kayıt — saveStudyCategoriesAsync kullanın */
export function saveStudyCategories(list: StudyCategoryMeta[]): void {
  writeLocalCategories(list);
}

export async function loadStudyCategoriesAsync(): Promise<StudyCategoryMeta[]> {
  if (!isSupabaseBackend()) return readLocalCategories();
  try {
    const client = getServiceSupabase() ?? supabase;
    const { data, error } = await client
      .from(TABLE)
      .select('id,name')
      .order('name', { ascending: true });
    if (error) {
      console.warn('[StudyCategories] load error:', error.message);
      return readLocalCategories();
    }
    const remote = (data ?? [])
      .map((row) => ({
        id: String((row as { id?: unknown }).id ?? '').trim(),
        name: String((row as { name?: unknown }).name ?? '').trim(),
      }))
      .filter((c): c is StudyCategoryMeta => c.id.length > 0 && c.name.length > 0);
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* ignore */
    }
    return remote;
  } catch (e) {
    console.warn('[StudyCategories] load failed:', e);
    return readLocalCategories();
  }
}

export async function saveStudyCategoriesAsync(list: StudyCategoryMeta[]): Promise<void> {
  const cleaned = list
    .map((c) => ({ id: c.id.trim(), name: c.name.trim() }))
    .filter((c) => c.id && c.name);
  if (!isSupabaseBackend()) {
    writeLocalCategories(cleaned);
    return;
  }
  try {
    const client = getServiceSupabase() ?? supabase;
    if (!client) {
      writeLocalCategories(cleaned);
      return;
    }
    const { data: existing, error: readErr } = await client.from(TABLE).select('id');
    if (readErr) {
      console.warn('[StudyCategories] save read error:', readErr.message);
      writeLocalCategories(cleaned);
      return;
    }
    const nextIds = new Set(cleaned.map((c) => c.id));
    const toDelete = (existing ?? [])
      .map((r) => String((r as { id?: unknown }).id ?? ''))
      .filter((id) => id && !nextIds.has(id));
    if (toDelete.length > 0) {
      const { error: delErr } = await client.from(TABLE).delete().in('id', toDelete);
      if (delErr) console.warn('[StudyCategories] delete error:', delErr.message);
    }
    if (cleaned.length > 0) {
      const { error: upsertErr } = await client.from(TABLE).upsert(
        cleaned.map((c) => ({ id: c.id, name: c.name })),
        { onConflict: 'id' },
      );
      if (upsertErr) {
        console.warn('[StudyCategories] upsert error:', upsertErr.message);
        writeLocalCategories(cleaned);
        return;
      }
    }
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* ignore */
    }
  } catch (e) {
    console.warn('[StudyCategories] save failed:', e);
    writeLocalCategories(cleaned);
  }
}
