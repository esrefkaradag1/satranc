import { normalizeClubKey } from './clubScope';
import type { DisciplineBranch, LessonPackage, TrainingGroup } from '../types';

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

export function dbToLessonPackage(row: Record<string, unknown>): LessonPackage {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    branchOffice: String(r.branch_office ?? r.branchOffice ?? ''),
    discipline: String(r.discipline ?? ''),
    lessonCount: Number(r.lesson_count ?? r.lessonCount ?? 0) || 0,
    validityDays: Number(r.validity_days ?? r.validityDays ?? 0) || 0,
    packageFee: Number(r.package_fee ?? r.packageFee ?? 0) || 0,
    capacity: Number(r.capacity ?? 0) || 0,
    coachIds: Array.isArray(r.coach_ids) ? (r.coach_ids as string[]) : Array.isArray(r.coachIds) ? (r.coachIds as string[]) : [],
    clubId: r.club_id != null ? String(r.club_id) : r.clubId != null ? String(r.clubId) : undefined,
  };
}

export function lessonPackageToDb(pkg: LessonPackage, clubId?: string | null): Record<string, unknown> {
  return {
    id: pkg.id,
    name: pkg.name,
    branch_office: pkg.branchOffice,
    discipline: pkg.discipline,
    lesson_count: pkg.lessonCount ?? 0,
    validity_days: pkg.validityDays ?? 0,
    package_fee: pkg.packageFee ?? 0,
    capacity: pkg.capacity ?? 0,
    coach_ids: pkg.coachIds ?? [],
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

/** Şube kaydının bağlı olduğu kulüp (club_id veya ad eşleşmesi) */
export function clubIdForOfficeRecord(
  record: BranchOfficeRecord,
  clubs: { id: string; name: string }[] = [],
): string | undefined {
  if (record.clubId) return record.clubId;
  const key = normalizeClubKey(record.name);
  if (!key) return undefined;
  const exact = clubs.find((c) => normalizeClubKey(c.name) === key);
  if (exact) return exact.id;
  const partial = clubs.find((c) => {
    const ck = normalizeClubKey(c.name);
    if (!ck || ck === key) return false;
    return ck.includes(key) || key.includes(ck);
  });
  return partial?.id;
}

function officeDisplayName(
  record: BranchOfficeRecord,
  clubs: { id: string; name: string }[] = [],
): string {
  const clubId = clubIdForOfficeRecord(record, clubs);
  if (clubId) {
    const club = clubs.find((c) => c.id === clubId);
    if (club?.name.trim()) return club.name.trim();
  }
  return canonicalBranchOfficeName(record.name, clubs, record.clubId);
}

function collectBranchOfficeNames(
  records: BranchOfficeRecord[],
  clubs: { id: string; name: string }[] = [],
): string[] {
  const seenClubIds = new Set<string>();
  const seenKeys = new Set<string>();
  const result: string[] = [];

  const sorted = [...records].sort((a, b) => {
    const aClub = Boolean(clubIdForOfficeRecord(a, clubs));
    const bClub = Boolean(clubIdForOfficeRecord(b, clubs));
    if (aClub !== bClub) return aClub ? -1 : 1;
    return b.name.length - a.name.length;
  });

  for (const record of sorted) {
    const name = officeDisplayName(record, clubs);
    if (!name) continue;
    const clubId = clubIdForOfficeRecord(record, clubs);
    const key = normalizeClubKey(name);

    if (clubId) {
      if (seenClubIds.has(clubId)) continue;
      seenClubIds.add(clubId);
      seenKeys.add(key);
      result.push(name);
      continue;
    }

    const coveredByClub = [...seenClubIds].some((id) => {
      const club = clubs.find((c) => c.id === id);
      if (!club) return false;
      const ck = normalizeClubKey(club.name);
      const rk = normalizeClubKey(record.name);
      return ck.includes(rk) || rk.includes(ck);
    });
    if (coveredByClub) continue;

    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    result.push(name);
  }

  return result.sort((a, b) => a.localeCompare(b, 'tr'));
}

export function resolveBranchOfficeNames(
  records: BranchOfficeRecord[],
  _clubNames: string[],
  auth?: { role: string; branch?: string; clubId?: string } | null,
  clubs: { id: string; name: string }[] = [],
): string[] {
  if (!auth || auth.role === 'admin') {
    return collectBranchOfficeNames(records, clubs);
  }

  if (auth.role === 'club') {
    const clubId = resolveClubIdFromAuth(auth, clubs);
    const filtered = records.filter((r) => {
      if (!r.name) return false;
      if (clubId && r.clubId === clubId) return true;
      if (!r.clubId && auth.branch && normalizeClubKey(r.name) === normalizeClubKey(auth.branch)) {
        return true;
      }
      const linked = clubIdForOfficeRecord(r, clubs);
      return clubId != null && linked === clubId;
    });
    const names = collectBranchOfficeNames(filtered, clubs);
    if (names.length === 0 && auth.branch?.trim()) {
      const club = clubs.find((c) => c.id === clubId);
      return [club?.name.trim() || auth.branch.trim()];
    }
    return names;
  }

  const withoutClub = records.filter((r) => r.name && !r.clubId);
  return collectBranchOfficeNames(withoutClub, clubs);
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

/** Branş/gruptaki şube adını kayıtlı branch_offices kaydına eşler; yeni şube oluşturmaz */
function resolveRegisteredOfficeName(
  rawName: string,
  registeredOffices: BranchOfficeRecord[],
  clubs: { id: string; name: string }[],
  clubId?: string,
): string {
  const trimmed = rawName.trim();
  if (!trimmed) return '';

  const resolvedClubId =
    clubId ?? clubIdForOfficeRecord({ id: '', name: trimmed }, clubs);

  if (resolvedClubId) {
    const byClub = registeredOffices.find((o) => o.clubId === resolvedClubId);
    if (byClub) return officeDisplayName(byClub, clubs);

    const club = clubs.find((c) => c.id === resolvedClubId);
    if (club) {
      const byClubName = registeredOffices.find(
        (o) =>
          o.clubId === resolvedClubId ||
          normalizeClubKey(o.name) === normalizeClubKey(club.name),
      );
      if (byClubName) return officeDisplayName(byClubName, clubs);
      return club.name.trim();
    }
  }

  const key = normalizeClubKey(trimmed);
  const exact = registeredOffices.find((o) => normalizeClubKey(o.name) === key);
  if (exact) return officeDisplayName(exact, clubs);

  for (const office of registeredOffices) {
    const linkedClubId = clubIdForOfficeRecord(office, clubs);
    if (!linkedClubId) continue;
    const club = clubs.find((c) => c.id === linkedClubId);
    if (!club) continue;
    const ck = normalizeClubKey(club.name);
    if (ck.includes(key) || key.includes(ck)) {
      return officeDisplayName(office, clubs);
    }
  }

  const partialClub = clubs.find((c) => {
    const ck = normalizeClubKey(c.name);
    return ck.includes(key) || key.includes(ck);
  });
  if (partialClub) {
    const office = registeredOffices.find(
      (o) =>
        o.clubId === partialClub.id ||
        normalizeClubKey(o.name) === normalizeClubKey(partialClub.name),
    );
    if (office) return officeDisplayName(office, clubs);
    return partialClub.name.trim();
  }

  if (registeredOffices.length === 1) {
    return officeDisplayName(registeredOffices[0], clubs);
  }

  return trimmed;
}

/** Branş/grupta geçen şubeleri branch_offices ile eşleştirir; yalnızca DB'deki şubeler korunur */
export function syncOrgStructureWithOffices(
  offices: BranchOfficeRecord[],
  branches: DisciplineBranch[],
  groups: TrainingGroup[],
  clubs: { id: string; name: string }[],
  _newId: () => string,
): OrgStructureSyncResult {
  const nextOffices = [...offices];

  const ensureOffice = (rawName: string, clubId?: string): string =>
    resolveRegisteredOfficeName(rawName, nextOffices, clubs, clubId);

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
    officesToUpsert: [],
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
