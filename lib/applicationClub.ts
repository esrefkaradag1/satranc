import type { Club } from '../types';
import type { StudentApplication } from './applicationTypes';
import { normalizeClubKey } from './clubScope';
import { findClubForLogin, slugifyClubUsername } from './clubLoginUtils';
import { supabase, isSupabaseBackend } from '../services/supabase';

export type ClubPublicInfo = {
  id: string;
  name: string;
  slug: string;
};

/** Başvuru linki için kulüp uzantısı (login kullanıcı adı veya ad slug'ı) */
export function getClubApplicationSlug(club: Pick<Club, 'loginUsername' | 'name'>): string {
  const login = (club.loginUsername || '').trim().toLowerCase();
  if (login) return login;
  return slugifyClubUsername(club.name);
}

export function resolveClubFromApplicationSlug(slug: string, clubs: Club[]): ClubPublicInfo | null {
  const trimmed = slug.trim();
  if (!trimmed) return null;
  const club = findClubForLogin(clubs, trimmed);
  if (!club) return null;
  return { id: club.id, name: club.name, slug: getClubApplicationSlug(club) };
}

/** Giriş yapmadan kulüp bilgisi — başvuru formu için */
export async function fetchClubByApplicationSlug(slug: string): Promise<ClubPublicInfo | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  if (!isSupabaseBackend()) return null;

  try {
    const { data, error } = await supabase.from('clubs').select('id, name, login_username');
    if (error || !data?.length) return null;

    const clubs: Club[] = data.map((row) => ({
      id: String((row as { id: string }).id),
      name: String((row as { name?: string }).name ?? ''),
      loginUsername: (row as { login_username?: string }).login_username
        ? String((row as { login_username?: string }).login_username)
        : undefined,
    }));

    return resolveClubFromApplicationSlug(trimmed, clubs);
  } catch {
    return null;
  }
}

export function applicationBelongsToClub(
  app: StudentApplication,
  clubId: string,
  clubName: string,
): boolean {
  if (app.clubId?.trim()) return app.clubId === clubId;
  return normalizeClubKey(app.branchOffice) === normalizeClubKey(clubName);
}

export function filterApplicationsByClub(
  apps: StudentApplication[],
  clubId: string,
  clubName: string,
): StudentApplication[] {
  return apps.filter((a) => applicationBelongsToClub(a, clubId, clubName));
}
