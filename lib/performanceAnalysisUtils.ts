import type { PerformanceAnalysis, PerformanceAnalysisCategory } from '../types';

export function newCategoryId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const DEFAULT_ANALYSIS_CATEGORIES: PerformanceAnalysisCategory[] = [
  { id: 'technical', label: 'Teknik Beceriler', value: 5, notes: '' },
  { id: 'physical', label: 'Fiziksel Durum', value: 5, notes: '' },
  { id: 'tactical', label: 'Taktik Anlayış', value: 5, notes: '' },
  { id: 'mental', label: 'Mental Durum', value: 5, notes: '' },
  { id: 'discipline', label: 'Disiplin ve Tutum', value: 5, notes: '' },
  { id: 'teamwork', label: 'Takım Çalışması', value: 5, notes: '' },
];

export function cloneDefaultCategories(): PerformanceAnalysisCategory[] {
  return DEFAULT_ANALYSIS_CATEGORIES.map((c) => ({ ...c, id: newCategoryId() }));
}

const LEGACY_LABELS = [
  'Teknik Beceriler',
  'Fiziksel Durum',
  'Taktik Anlayış',
  'Mental Durum',
  'Disiplin ve Tutum',
  'Takım Çalışması',
] as const;

export function getAnalysisCategories(analysis: PerformanceAnalysis): PerformanceAnalysisCategory[] {
  if (analysis.categories?.length) {
    return analysis.categories.map((c) => ({
      id: c.id || newCategoryId(),
      label: c.label || 'Madde',
      value: Number(c.value) || 5,
      notes: c.notes ?? '',
    }));
  }
  return [
    { id: 'technical', label: LEGACY_LABELS[0], value: analysis.technicalSkills, notes: analysis.technicalNotes },
    { id: 'physical', label: LEGACY_LABELS[1], value: analysis.physicalCondition, notes: analysis.physicalNotes },
    { id: 'tactical', label: LEGACY_LABELS[2], value: analysis.tacticalUnderstanding, notes: analysis.tacticalNotes },
    { id: 'mental', label: LEGACY_LABELS[3], value: analysis.mentalState, notes: analysis.mentalNotes },
    { id: 'discipline', label: LEGACY_LABELS[4], value: analysis.disciplineAttitude, notes: analysis.disciplineNotes },
    { id: 'teamwork', label: LEGACY_LABELS[5], value: analysis.teamwork, notes: analysis.teamworkNotes },
  ];
}

function pickCategory(categories: PerformanceAnalysisCategory[], index: number) {
  const c = categories[index];
  return {
    value: Math.min(10, Math.max(1, Number(c?.value) || 5)),
    notes: c?.notes ?? '',
  };
}

/** Eski şema ve öğrenci paneli uyumluluğu için ilk 6 maddeyi sabit alanlara yazar */
export function categoriesToLegacyFields(categories: PerformanceAnalysisCategory[]) {
  const t = pickCategory(categories, 0);
  const p = pickCategory(categories, 1);
  const ta = pickCategory(categories, 2);
  const m = pickCategory(categories, 3);
  const d = pickCategory(categories, 4);
  const tw = pickCategory(categories, 5);
  return {
    technicalSkills: t.value,
    technicalNotes: t.notes,
    physicalCondition: p.value,
    physicalNotes: p.notes,
    tacticalUnderstanding: ta.value,
    tacticalNotes: ta.notes,
    mentalState: m.value,
    mentalNotes: m.notes,
    disciplineAttitude: d.value,
    disciplineNotes: d.notes,
    teamwork: tw.value,
    teamworkNotes: tw.notes,
  };
}

export type AnalysisFormMeta = {
  branch: string;
  analysisDate: string;
  generalEvaluation: string;
  recommendations: string;
  shortTermGoal: string;
  longTermGoal: string;
};

export function emptyAnalysisFormMeta(): AnalysisFormMeta {
  return {
    branch: '',
    analysisDate: new Date().toISOString().slice(0, 10),
    generalEvaluation: '',
    recommendations: '',
    shortTermGoal: '',
    longTermGoal: '',
  };
}

export function analysisFormMetaFromRecord(analysis: PerformanceAnalysis): AnalysisFormMeta {
  return {
    branch: analysis.branch,
    analysisDate: analysis.analysisDate,
    generalEvaluation: analysis.generalEvaluation,
    recommendations: analysis.recommendations,
    shortTermGoal: analysis.shortTermGoal,
    longTermGoal: analysis.longTermGoal,
  };
}

export function buildPerformanceAnalysisPayload(
  studentId: string,
  meta: AnalysisFormMeta,
  categories: PerformanceAnalysisCategory[]
): Omit<PerformanceAnalysis, 'id'> {
  const normalized = categories
    .filter((c) => c.label.trim())
    .map((c) => ({
      id: c.id || newCategoryId(),
      label: c.label.trim(),
      value: Math.min(10, Math.max(1, Number(c.value) || 5)),
      notes: c.notes ?? '',
    }));

  return {
    studentId,
    branch: meta.branch.trim(),
    analysisDate: meta.analysisDate,
    categories: normalized.length ? normalized : cloneDefaultCategories(),
    ...categoriesToLegacyFields(normalized.length ? normalized : cloneDefaultCategories()),
    generalEvaluation: meta.generalEvaluation,
    recommendations: meta.recommendations,
    shortTermGoal: meta.shortTermGoal,
    longTermGoal: meta.longTermGoal,
  };
}

const BADGE_COLORS = [
  'bg-indigo-500/10 border-indigo-500/25 text-indigo-300',
  'bg-emerald-500/10 border-emerald-500/25 text-emerald-300',
  'bg-amber-500/10 border-amber-500/25 text-amber-300',
  'bg-violet-500/10 border-violet-500/25 text-violet-300',
  'bg-rose-500/10 border-rose-500/25 text-rose-300',
  'bg-sky-500/10 border-sky-500/25 text-sky-300',
];

export function categoryBadgeClass(index: number): string {
  return BADGE_COLORS[index % BADGE_COLORS.length];
}
