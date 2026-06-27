import type { DisciplineBranch, TrainingGroup } from '../types';
import { emptyLessonSlot } from './trainingGroupUtils';
import {
  DEFAULT_APPLICATION_GROUPS,
  DEFAULT_APPLICATION_OFFICES,
} from './applicationFormOptions';
import type { BranchOfficeRecord } from './orgStructureDb';
import {
  branchOfficeToDb,
  disciplineBranchToDb,
  trainingGroupToDb,
} from './orgStructureDb';

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type DefaultOrgStructure = {
  offices: BranchOfficeRecord[];
  branches: DisciplineBranch[];
  groups: TrainingGroup[];
};

/** Kulüp için varsayılan şube / branş / grup (yalnızca o kulübe ait) */
export function buildClubDefaultOrgStructure(
  clubName: string,
  clubId?: string,
): DefaultOrgStructure {
  const office: BranchOfficeRecord = { id: newId(), name: clubName.trim() || 'Kulüp', clubId };
  const branch: DisciplineBranch = {
    id: newId(),
    name: 'Satranç',
    branchOffice: office.name,
    monthlyFee: 0,
    clubId,
  };
  const groups: TrainingGroup[] = DEFAULT_APPLICATION_GROUPS.map((name) => ({
    id: newId(),
    name,
    branchOffice: office.name,
    discipline: 'Satranç',
    capacity: 14,
    lessonSlots: [emptyLessonSlot()],
    coachIds: [],
    clubId,
  }));
  return { offices: [office], branches: [branch], groups };
}

/** Başvuru formu ve öğrenci kaydı için varsayılan şube / branş / grup seti (merkez/admin) */
export function buildDefaultOrgStructure(primaryOffice = DEFAULT_APPLICATION_OFFICES[0]): DefaultOrgStructure {
  const offices: BranchOfficeRecord[] = DEFAULT_APPLICATION_OFFICES.map((name) => ({
    id: newId(),
    name,
  }));
  const branch: DisciplineBranch = {
    id: newId(),
    name: 'Satranç',
    branchOffice: primaryOffice,
    monthlyFee: 0,
  };
  const groups: TrainingGroup[] = DEFAULT_APPLICATION_GROUPS.map((name) => ({
    id: newId(),
    name,
    branchOffice: primaryOffice,
    discipline: 'Satranç',
    capacity: 14,
    lessonSlots: [emptyLessonSlot()],
    coachIds: [],
  }));
  return { offices, branches: [branch], groups };
}

export async function persistDefaultOrgStructure(
  sb: { from: (table: string) => { upsert: (rows: unknown) => PromiseLike<{ error: unknown }> } },
  data: DefaultOrgStructure,
  clubId?: string | null,
): Promise<void> {
  const { error: oErr } = await sb.from('branch_offices').upsert(data.offices.map(branchOfficeToDb));
  if (oErr) console.error('[seed] branch_offices:', oErr);
  const { error: bErr } = await sb
    .from('discipline_branches')
    .upsert(data.branches.map((b) => disciplineBranchToDb(b, b.clubId ?? clubId ?? null)));
  if (bErr) console.error('[seed] discipline_branches:', bErr);
  const { error: gErr } = await sb
    .from('training_groups')
    .upsert(data.groups.map((g) => trainingGroupToDb(g, g.clubId ?? clubId ?? null)));
  if (gErr) console.error('[seed] training_groups:', gErr);
}
