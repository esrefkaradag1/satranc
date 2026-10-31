import type { AuthUser } from '../types';

const STAFF_BACKUP_KEY = 'netchess_staff_auth_backup';

export function isStaffAuth(auth: AuthUser | null | undefined): auth is Extract<AuthUser, { role: 'admin' | 'coach' | 'club' }> {
  return auth?.role === 'admin' || auth?.role === 'coach' || auth?.role === 'club';
}

export function saveStaffAuthBackup(auth: AuthUser): void {
  try {
    sessionStorage.setItem(STAFF_BACKUP_KEY, JSON.stringify(auth));
  } catch {
    /* ignore */
  }
}

export function readStaffAuthBackup(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(STAFF_BACKUP_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as AuthUser;
    return isStaffAuth(data) ? data : null;
  } catch {
    return null;
  }
}

export function clearStaffAuthBackup(): void {
  try {
    sessionStorage.removeItem(STAFF_BACKUP_KEY);
  } catch {
    /* ignore */
  }
}

export function hasStaffAuthBackup(): boolean {
  return readStaffAuthBackup() != null;
}
