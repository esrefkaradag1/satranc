import { normalizeClubKey } from './clubScope';
import type { Club, Student } from '../types';

export type ClubDisplayInfo = {
  id?: string;
  name: string;
  logoUrl?: string;
};

export function resolveClubForStudent(
  student: Pick<Student, 'clubId' | 'branchOffice'> | null | undefined,
  clubs: Club[],
): Club | undefined {
  if (!student) return undefined;
  const clubId = String(student.clubId ?? '').trim();
  if (clubId) {
    const byId = clubs.find((club) => club.id === clubId);
    if (byId) return byId;
  }
  const office = String(student.branchOffice ?? '').trim();
  if (!office) return undefined;
  const officeKey = normalizeClubKey(office);
  return clubs.find((club) => normalizeClubKey(club.name) === officeKey);
}

export function clubDisplayForStudent(
  student: Pick<Student, 'clubId' | 'branchOffice'> | null | undefined,
  clubs: Club[],
): ClubDisplayInfo | null {
  const club = resolveClubForStudent(student, clubs);
  const fallbackName = String(student?.branchOffice ?? '').trim();
  const name = club?.name?.trim() || fallbackName;
  if (!name) return null;
  return {
    id: club?.id,
    name,
    logoUrl: club?.logoUrl?.trim() || undefined,
  };
}

export function clubNameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return 'K';
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}
