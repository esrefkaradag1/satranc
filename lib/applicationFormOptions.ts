import { supabase, isSupabaseBackend } from '../services/supabase';

export const DEFAULT_APPLICATION_GROUPS = [
  'Alt Yapı A',
  'Alt Yapı B',
  'Gelişim A',
  'Gelişim B',
  'Turnuva',
  'Yetişkin',
] as const;

export const DEFAULT_APPLICATION_OFFICES = ['Merkez', 'Çayyolu', 'Ümitköy'] as const;

export type ApplicationFormOptions = {
  branchOffices: string[];
  groups: string[];
};

function uniqueSorted(names: string[]): string[] {
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'tr'),
  );
}

/** Başvuru formu şube/grup listeleri — Supabase'den okunur (giriş gerekmez). */
export async function fetchApplicationFormOptions(clubId?: string): Promise<ApplicationFormOptions> {
  if (!isSupabaseBackend()) {
    return {
      branchOffices: [...DEFAULT_APPLICATION_OFFICES],
      groups: [...DEFAULT_APPLICATION_GROUPS],
    };
  }

  try {
    let officesQuery = supabase.from('branch_offices').select('name, club_id');
    let groupsQuery = supabase.from('training_groups').select('name, club_id');
    const clubsQuery = supabase.from('clubs').select('id, name');

    if (clubId) {
      officesQuery = officesQuery.eq('club_id', clubId);
      groupsQuery = groupsQuery.eq('club_id', clubId);
    }

    const [officesRes, groupsRes, clubsRes] = await Promise.all([
      officesQuery,
      groupsQuery,
      clubsQuery,
    ]);

    const clubRows = (clubsRes.data as { id?: string; name?: string }[] | null) ?? [];
    const clubName = clubId ? clubRows.find((c) => String(c.id) === clubId)?.name?.trim() : undefined;

    const offices = uniqueSorted([
      ...(clubName ? [clubName] : []),
      ...((officesRes.data as { name?: string }[] | null) ?? []).map((r) => String(r.name ?? '')),
      ...(clubId ? [] : clubRows.map((r) => String(r.name ?? ''))),
    ]);

    const groups = uniqueSorted(
      ((groupsRes.data as { name?: string }[] | null) ?? []).map((r) => String(r.name ?? '')),
    );

    return {
      branchOffices: offices.length > 0 ? offices : clubName ? [clubName] : [...DEFAULT_APPLICATION_OFFICES],
      groups,
    };
  } catch {
    return {
      branchOffices: [...DEFAULT_APPLICATION_OFFICES],
      groups: [],
    };
  }
}
