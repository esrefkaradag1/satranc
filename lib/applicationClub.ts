import type { Club } from '../types';
import type { StudentApplication } from './applicationTypes';
import { normalizeClubKey } from './clubScope';
import { findClubForLogin, slugifyClubUsername } from './clubLoginUtils';

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

/**
 * Giriş yapmadan kulüp bilgisi — başvuru formu için.
 * Ziyaretçi `clubs.login_username` sütununu okuyamadığından (RLS) eşleme sunucuda yapılır.
 */
export async function fetchClubByApplicationSlug(slug: string): Promise<ClubPublicInfo | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  try {
    const res = await fetch('/api/submit-application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lookupClub: trimmed }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { club?: ClubPublicInfo };
    return body.club?.id ? body.club : null;
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
