export const COACH_MEMBER_PREFIX = 'coach:';

export function toCoachMemberId(coachId: string): string {
  return `${COACH_MEMBER_PREFIX}${coachId}`;
}

export function isCoachMemberId(id: string): boolean {
  return String(id).startsWith(COACH_MEMBER_PREFIX);
}

export function coachIdFromMemberId(id: string): string | null {
  if (!isCoachMemberId(id)) return null;
  return String(id).slice(COACH_MEMBER_PREFIX.length);
}

export type StudyMemberRow = {
  id: string;
  name: string;
  kind: 'student' | 'coach' | 'unknown';
};

export function resolveStudyMembers(
  memberIds: string[],
  students: { id: string; name: string }[],
  coaches: { id: string; name: string }[] = [],
): StudyMemberRow[] {
  const studentMap = new Map(students.map((s) => [String(s.id), s.name]));
  const coachMap = new Map(coaches.map((c) => [String(c.id), c.name]));
  return memberIds.map((id) => {
    const sid = String(id);
    if (isCoachMemberId(sid)) {
      const cid = coachIdFromMemberId(sid)!;
      return { id: sid, name: coachMap.get(cid) ?? 'Antrenör', kind: 'coach' as const };
    }
    const name = studentMap.get(sid);
    if (name) return { id: sid, name, kind: 'student' as const };
    return { id: sid, name: `Üye #${sid.slice(0, 6)}`, kind: 'unknown' as const };
  });
}
