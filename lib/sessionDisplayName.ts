import type { AuthUser, Club, Coach, Student } from '../types';
import { loadAdminProfile } from './adminProfile';

export type SessionDisplay = {
  firstName: string;
  fullName: string;
  roleLabel: string;
};

function firstNameFrom(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return 'Kullanıcı';
  return trimmed.split(/\s+/)[0] || trimmed;
}

export function getSessionDisplay(
  auth: AuthUser | null,
  ctx: { students: Student[]; coaches: Coach[]; clubs: Club[] },
): SessionDisplay {
  if (!auth) {
    return { firstName: 'Kullanıcı', fullName: 'Kullanıcı', roleLabel: '' };
  }

  switch (auth.role) {
    case 'coach': {
      const coach =
        (auth.coachId ? ctx.coaches.find((c) => c.id === auth.coachId) : undefined) ??
        ctx.coaches.find((c) => (c.branch || '').trim() === (auth.branch || '').trim());
      const fullName = coach?.name?.trim() || 'Antrenör';
      return { firstName: firstNameFrom(fullName), fullName, roleLabel: 'Antrenör' };
    }
    case 'club': {
      const club =
        (auth.clubId ? ctx.clubs.find((c) => c.id === auth.clubId) : undefined) ??
        ctx.clubs.find((c) => (c.name || '').trim() === (auth.branch || '').trim());
      const fullName = club?.name?.trim() || auth.branch?.trim() || 'Kulüp';
      return { firstName: firstNameFrom(fullName), fullName, roleLabel: 'Kulüp' };
    }
    case 'admin': {
      const prof = loadAdminProfile();
      const fullName = prof.displayName?.trim() || 'Yönetici';
      const roleLabel = prof.title?.trim() || 'Yönetim';
      return { firstName: firstNameFrom(fullName), fullName, roleLabel };
    }
    case 'parent': {
      const student = ctx.students.find((s) => s.id === auth.studentId);
      const fullName = student?.parentName?.trim() || 'Veli';
      return { firstName: firstNameFrom(fullName), fullName, roleLabel: 'Veli' };
    }
    case 'student': {
      const student = ctx.students.find((s) => s.id === auth.studentId);
      const fullName = student?.name?.trim() || 'Öğrenci';
      return { firstName: firstNameFrom(fullName), fullName, roleLabel: 'Öğrenci' };
    }
    default:
      return { firstName: 'Kullanıcı', fullName: 'Kullanıcı', roleLabel: '' };
  }
}
