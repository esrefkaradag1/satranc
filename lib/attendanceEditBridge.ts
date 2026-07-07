import type { AttendanceRecord } from '../types';

const ATTENDANCE_EDIT_BRIDGE_KEY = 'netchess_attendance_edit_bridge';

export type AttendanceEditBridgePayload = {
  date: string;
  attendanceType: 'group' | 'lesson';
  branchOffice: string;
  branch: string;
  groupName: string;
  sessionTime?: string;
};

export function saveAttendanceEditBridge(payload: AttendanceEditBridgePayload) {
  try {
    sessionStorage.setItem(ATTENDANCE_EDIT_BRIDGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function consumeAttendanceEditBridge(): AttendanceEditBridgePayload | null {
  try {
    const raw = sessionStorage.getItem(ATTENDANCE_EDIT_BRIDGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(ATTENDANCE_EDIT_BRIDGE_KEY);
    const parsed = JSON.parse(raw) as AttendanceEditBridgePayload | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      date: String(parsed.date ?? '').slice(0, 10),
      attendanceType: parsed.attendanceType === 'lesson' ? 'lesson' : 'group',
      branchOffice: String(parsed.branchOffice ?? '').trim(),
      branch: String(parsed.branch ?? '').trim(),
      groupName: String(parsed.groupName ?? '').trim(),
      sessionTime: String(parsed.sessionTime ?? '').trim() || undefined,
    };
  } catch {
    return null;
  }
}

export function attendanceEditBridgePayloadFromRecord(
  record: Pick<AttendanceRecord, 'date' | 'attendanceType' | 'branchOffice' | 'branch' | 'groupName' | 'sessionTime'>,
  fallbackGroup?: string,
): AttendanceEditBridgePayload {
  return {
    date: String(record.date ?? '').slice(0, 10),
    attendanceType: record.attendanceType === 'lesson' ? 'lesson' : 'group',
    branchOffice: String(record.branchOffice ?? '').trim(),
    branch: String(record.branch ?? '').trim(),
    groupName: String(record.groupName ?? fallbackGroup ?? '').trim(),
    sessionTime: String(record.sessionTime ?? '').trim() || undefined,
  };
}
