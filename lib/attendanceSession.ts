import type { AttendanceRecord } from '../types';

export type AttendanceSessionKind = 'group' | 'lesson';

const SESSION_SEP = '::';

function encodePart(value: string): string {
  return encodeURIComponent(value.trim());
}

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function buildGroupAttendanceSessionId(branchOffice: string, branch: string, groupName: string): string {
  const group = groupName.trim();
  if (!group) return '';
  return ['group', encodePart(branchOffice), encodePart(branch), encodePart(group)].join(SESSION_SEP);
}

export function buildLessonAttendanceSessionId(
  packageId: string | undefined,
  branchOffice: string,
  branch: string,
  groupName: string,
): string {
  const trimmedPackageId = String(packageId ?? '').trim();
  if (trimmedPackageId) return trimmedPackageId;
  const group = groupName.trim();
  if (!group) return '';
  return ['lesson', encodePart(branchOffice), encodePart(branch), encodePart(group)].join(SESSION_SEP);
}

export function parseAttendanceSessionId(
  lessonId?: string | null,
): { kind?: AttendanceSessionKind; branchOffice?: string; branch?: string; groupName?: string } {
  const raw = String(lessonId ?? '').trim();
  if (!raw) return {};
  const parts = raw.split(SESSION_SEP);
  if (parts.length !== 4) return {};
  const [kind, office, branch, group] = parts;
  if (kind !== 'group' && kind !== 'lesson') return {};
  return {
    kind,
    branchOffice: decodePart(office),
    branch: decodePart(branch),
    groupName: decodePart(group),
  };
}

export function attendanceRecordGroupName(
  record: Pick<AttendanceRecord, 'groupName' | 'lessonId'>,
  fallbackGroup?: string,
): string {
  const explicit = String(record.groupName ?? '').trim();
  if (explicit) return explicit;
  const parsed = parseAttendanceSessionId(record.lessonId);
  if (parsed.groupName?.trim()) return parsed.groupName.trim();
  return String(fallbackGroup ?? '').trim() || '—';
}

export function attendanceRecordTime(record: Pick<AttendanceRecord, 'sessionTime' | 'date'>): string {
  const explicit = String(record.sessionTime ?? '').trim();
  if (explicit) return explicit;
  const rawDate = String(record.date ?? '');
  return rawDate.length > 10 ? rawDate.slice(11, 16) : '—';
}

export function attendanceRecordKind(record: Pick<AttendanceRecord, 'attendanceType' | 'lessonId'>): AttendanceSessionKind {
  if (record.attendanceType === 'lesson' || record.attendanceType === 'group') return record.attendanceType;
  return parseAttendanceSessionId(record.lessonId).kind ?? 'group';
}

function normalizeSessionValue(value: string | undefined | null): string {
  return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
}

export function attendanceRecordSessionScopeKey(
  record: Pick<AttendanceRecord, 'lessonId' | 'attendanceType' | 'groupName' | 'branch' | 'branchOffice'>,
  fallbackGroup?: string,
): string {
  const parsed = parseAttendanceSessionId(record.lessonId);
  const lessonId = String(record.lessonId ?? '').trim();
  const kind = attendanceRecordKind(record);
  const branchOffice = normalizeSessionValue(String(record.branchOffice ?? parsed.branchOffice ?? ''));
  const branch = normalizeSessionValue(String(record.branch ?? parsed.branch ?? ''));
  const groupName = normalizeSessionValue(attendanceRecordGroupName(record, fallbackGroup));
  if (branchOffice || branch || groupName) {
    return [kind, branchOffice, branch, groupName].join(SESSION_SEP);
  }
  return lessonId;
}

export function attendanceRecordsShareSession(
  a: Pick<AttendanceRecord, 'lessonId' | 'attendanceType' | 'groupName' | 'branch' | 'branchOffice'>,
  b: Pick<AttendanceRecord, 'lessonId' | 'attendanceType' | 'groupName' | 'branch' | 'branchOffice'>,
  fallbackGroupA?: string,
  fallbackGroupB?: string,
): boolean {
  const aLessonId = String(a.lessonId ?? '').trim();
  const bLessonId = String(b.lessonId ?? '').trim();
  if (aLessonId && bLessonId && aLessonId === bLessonId) return true;
  const aKey = attendanceRecordSessionScopeKey(a, fallbackGroupA);
  const bKey = attendanceRecordSessionScopeKey(b, fallbackGroupB);
  return !!aKey && aKey === bKey;
}
