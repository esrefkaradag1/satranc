import type { AuthUser } from '../types';
import type { Study } from './studyTypes';

export type StudyPermissionLevel = 'everyone' | 'members' | 'onlyMe';

function isAdmin(auth: AuthUser | null | undefined): boolean {
  return auth?.role === 'admin';
}

function isMember(study: Study, auth: AuthUser | null | undefined): boolean {
  if (!auth) return false;
  if (auth.role === 'admin' || auth.role === 'coach') return true;
  const studentId = (auth as { studentId?: string }).studentId;
  if (studentId && study.memberIds?.includes(studentId)) return true;
  return false;
}

function checkPermission(
  level: StudyPermissionLevel | undefined,
  study: Study,
  auth: AuthUser | null | undefined
): boolean {
  if (isAdmin(auth)) return true;
  const perm = level ?? 'everyone';
  if (perm === 'onlyMe') return false;
  if (perm === 'members') return isMember(study, auth);
  return true;
}

export function canCloneStudy(study: Study, auth: AuthUser | null | undefined): boolean {
  return checkPermission(study.clonePermission, study, auth);
}

export function canExportStudy(study: Study, auth: AuthUser | null | undefined): boolean {
  return checkPermission(study.shareExport, study, auth);
}
