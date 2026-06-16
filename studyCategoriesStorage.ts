/**
 * Antrenör çalışma kategorileri — yalnızca yerel tarayıcı (localStorage).
 * Çalışmaların hangi klasörde listelendiği `Study.categoryId` ile Supabase’e yazılabilir.
 */
export type StudyCategoryMeta = {
  id: string;
  name: string;
};

const KEY = 'netchess_study_categories_v1';

export function loadStudyCategories(): StudyCategoryMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
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

export function saveStudyCategories(list: StudyCategoryMeta[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
