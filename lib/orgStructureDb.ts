import { normalizeClubKey } from './clubScope';
import type { DisciplineBranch, TrainingGroup } from '../types';

export type BranchOfficeRecord = {
  id: string;
  name: string;
  clubId?: string;
};

export function dbToBranchOffice(row: Record<string, unknown>): BranchOfficeRecord {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? '').trim(),
    clubId: r.club_id != null ? String(r.club_id) : r.clubId != null ? String(r.clubId) : undefined,
  };
}

export function branchOfficeToDb(row: BranchOfficeRecord): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    club_id: row.clubId ?? null,
  };
}

export function dbToDisciplineBranch(row: Record<string, unknown>): DisciplineBranch {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    branchOffice: String(r.branch_office ?? r.branchOffice ?? ''),
    monthlyFee: Number(r.monthly_fee ?? r.monthlyFee ?? 0) || 0,
    clubId: r.club_id != null ? String(r.club_id) : r.clubId != null ? String(r.clubId) : undefined,
  };
}

export function disciplineBranchToDb(
  branch: DisciplineBranch,
  clubId?: string | null,
): Record<string, unknown> {
  return {
    id: branch.id,
    name: branch.name,
    branch_office: branch.branchOffice,
    monthly_fee: branch.monthlyFee ?? 0,
    club_id: clubId ?? null,
  };
}

export function dbToTrainingGroup(row: Record<string, unknown>): TrainingGroup {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    branchOffice: String(r.branch_office ?? r.branchOffice ?? ''),
    discipline: String(r.discipline ?? ''),
    monthlyFee: r.monthly_fee != null ? Number(r.monthly_fee) : r.monthlyFee != null ? Number(r.monthlyFee) : undefined,
    capacity: Number(r.capacity ?? 0) || 0,
    lessonSlots: Array.isArray(r.lesson_slots) ? (r.lesson_slots as TrainingGroup['lessonSlots']) : Array.isArray(r.lessonSlots) ? (r.lessonSlots as TrainingGroup['lessonSlots']) : [],
    coachIds: Array.isArray(r.coach_ids) ? (r.coach_ids as string[]) : Array.isArray(r.coachIds) ? (r.coachIds as string[]) : [],
    clubId: r.club_id != null ? String(r.club_id) : r.clubId != null ? String(r.clubId) : undefined,
  };
}

export function trainingGroupToDb(group: TrainingGroup, clubId?: string | null): Record<string, unknown> {
  return {
    id: group.id,
    name: group.name,
    branch_office: group.branchOffice,
    discipline: group.discipline,
    monthly_fee: group.monthlyFee ?? null,
    capacity: group.capacity ?? 0,
    lesson_slots: group.lessonSlots ?? [],
    coach_ids: group.coachIds ?? [],
    club_id: clubId ?? null,
  };
}

export function resolveClubIdFromAuth(
  auth?: { role: string; branch?: string; clubId?: string } | null,
  clubs?: { id: string; name: string }[],
): string | undefined {
  if (!auth || auth.role !== 'club') return undefined;
  if (auth.clubId) return auth.clubId;
  if (auth.branch && clubs?.length) {
    return clubs.find((c) => normalizeClubKey(c.name) === normalizeClubKey(auth.branch))?.id;
  }
  return undefined;
}

export function resolveBranchOfficeNames(
  records: BranchOfficeRecord[],
  _clubNames: string[],
  auth?: { role: string; branch?: string; clubId?: string } | null,
  clubs?: { id: string; name: string }[],
): string[] {
  const names = new Set<string>();

  if (!auth || auth.role === 'admin') {
    for (const r of records) if (r.name) names.add(r.name);
    return [...names].sort((a, b) => a.localeCompare(b, 'tr'));
  }

  if (auth.role === 'club') {
    const clubId = resolveClubIdFromAuth(auth, clubs);
    for (const r of records) {
      if (!r.name) continue;
      if (clubId && r.clubId === clubId) names.add(r.name);
      else if (!r.clubId && auth.branch && normalizeClubKey(r.name) === normalizeClubKey(auth.branch)) {
        names.add(r.name);
      }
    }
    if (names.size === 0 && auth.branch?.trim()) names.add(auth.branch.trim());
    return [...names].sort((a, b) => a.localeCompare(b, 'tr'));
  }

  for (const r of records) {
    if (r.name && !r.clubId) names.add(r.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'tr'));
}

/** Kulüp adından veya club_id'den kayıtlı şube adını döndürür */
export function canonicalBranchOfficeName(
  officeName: string,
  clubs: { id: string; name: string }[],
  clubId?: string,
): string {
  const trimmed = officeName.trim();
  if (!trimmed) return '';
  if (clubId) {
    const byId = clubs.find((c) => c.id === clubId);
    if (byId?.name.trim()) return byId.name.trim();
  }
  const byName = clubs.find((c) => normalizeClubKey(c.name) === normalizeClubKey(trimmed));
  return byName?.name.trim() || trimmed;
}

export function findRegisteredBranchOffice(
  records: BranchOfficeRecord[],
  officeName: string,
  clubId?: string,
): BranchOfficeRecord | undefined {
  const key = normalizeClubKey(officeName);
  return records.find((r) => {
    if (normalizeClubKey(r.name) !== key) return false;
    if (clubId && r.clubId && r.clubId !== clubId) return false;
    return true;
  });
}

export type OrgStructureSyncResult = {
  offices: BranchOfficeRecord[];
  branches: DisciplineBranch[];
  groups: TrainingGroup[];
  officesToUpsert: BranchOfficeRecord[];
  branchesToUpsert: DisciplineBranch[];
  groupsToUpsert: TrainingGroup[];
};

/** Branş/grupta geçen şubeleri branch_offices ile eşleştirir; eksik kayıtları oluşturur */
export function syncOrgStructureWithOffices(
  offices: BranchOfficeRecord[],
  branches: DisciplineBranch[],
  groups: TrainingGroup[],
  clubs: { id: string; name: string }[],
  newId: () => string,
): OrgStructureSyncResult {
  const officeKeys = new Set(offices.map((o) => normalizeClubKey(o.name)));
  const nextOffices = [...offices];
  const officesToUpsert: BranchOfficeRecord[] = [];

  const ensureOffice = (rawName: string, clubId?: string): string => {
    const canonical = canonicalBranchOfficeName(rawName, clubs, clubId);
    if (!canonical) return rawName.trim();
    const key = normalizeClubKey(canonical);
    if (!officeKeys.has(key)) {
      const record: BranchOfficeRecord = {
        id: newId(),
        name: canonical,
        clubId: clubId ?? clubs.find((c) => normalizeClubKey(c.name) === key)?.id,
      };
      nextOffices.push(record);
      officesToUpsert.push(record);
      officeKeys.add(key);
    }
    return nextOffices.find((o) => normalizeClubKey(o.name) === key)!.name;
  };

  const nextBranches: DisciplineBranch[] = [];
  const branchesToUpsert: DisciplineBranch[] = [];
  for (const b of branches) {
    const registered = ensureOffice(b.branchOffice, b.clubId);
    const updated =
      registered !== b.branchOffice.trim() ? { ...b, branchOffice: registered } : b;
    nextBranches.push(updated);
    if (updated !== b) branchesToUpsert.push(updated);
  }

  const nextGroups: TrainingGroup[] = [];
  const groupsToUpsert: TrainingGroup[] = [];
  for (const g of groups) {
    const registered = ensureOffice(g.branchOffice, g.clubId);
    const updated =
      registered !== g.branchOffice.trim() ? { ...g, branchOffice: registered } : g;
    nextGroups.push(updated);
    if (updated !== g) groupsToUpsert.push(updated);
  }

  return {
    offices: nextOffices,
    branches: nextBranches,
    groups: nextGroups,
    officesToUpsert,
    branchesToUpsert,
    groupsToUpsert,
  };
}

/** Kulübe bağlı şube adları (ana kulüp adı + club_id kayıtları) */
export function clubOfficeNamesForAuth(
  auth: { role: string; branch?: string; clubId?: string } | null | undefined,
  records: BranchOfficeRecord[],
  clubs?: { id: string; name: string }[],
): string[] {
  if (!auth || auth.role !== 'club') return [];
  return resolveBranchOfficeNames(records, [], auth, clubs);
}

export function orgRecordBelongsToClub(
  record: { clubId?: string; branchOffice?: string },
  auth: { role: string; branch?: string; clubId?: string },
  clubOffices: string[] = [],
  clubs?: { id: string; name: string }[],
): boolean {
  if (auth.role !== 'club') return true;
  const clubId = resolveClubIdFromAuth(auth, clubs);
  if (clubId && record.clubId) return record.clubId === clubId;
  const office = (record.branchOffice || '').trim();
  if (!office) return false;
  const officeKeys = new Set(clubOffices.map((o) => normalizeClubKey(o)));
  officeKeys.add(normalizeClubKey(auth.branch));
  return officeKeys.has(normalizeClubKey(office));
}

export function clubIdForBranchOffice(
  branchOffice: string,
  auth?: { role: string; branch?: string; clubId?: string } | null,
): string | null {
  if (auth?.role === 'club' && auth.clubId) return auth.clubId;
  return null;
}

export function clubIdForOrgRecord(
  branchOffice: string,
  auth?: { role: string; branch?: string; clubId?: string } | null,
  clubs?: { id: string; name: string }[],
): string | null {
  const resolved = resolveClubIdFromAuth(auth ?? undefined, clubs);
  if (resolved) return resolved;
  const club = clubs?.find((c) => normalizeClubKey(c.name) === normalizeClubKey(branchOffice));
  return club?.id ?? null;
}
