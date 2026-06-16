/**
 * Sunucu API çağrıları. VITE_API_URL tanımlıysa öğrenci/veli paneli verisi buradan gelir.
 */
import type { HomeworkAssignment, ScheduleEntry, Student, StudentDailyTarget } from '../types';

const getBase = () => {
  const base = (import.meta.env?.VITE_API_URL as string)?.trim() ?? '';
  return base.replace(/\/$/, '');
};

function getHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('netchess_token') : null;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/** Veli/öğrenci girişi: telefon veya öğrenci no + PIN */
export async function apiParentLogin(
  phoneOrStudentId: string,
  pin: string
): Promise<{ studentId: string; student: Student } | null> {
  const base = getBase();
  if (!base) return null;
  const res = await fetch(`${base}/api/auth/parent`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ phoneOrStudentId: phoneOrStudentId.trim(), pin: pin.trim() }),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.studentId || !data?.student) return null;
  if (data.token) {
    try {
      localStorage.setItem('netchess_token', data.token);
    } catch { /* ignore */ }
  }
  return { studentId: data.studentId, student: data.student };
}

/** Öğrenciye atanmış ödevleri getir */
export async function apiHomeworksForStudent(
  studentId: string,
  studentGroup: string | null | undefined
): Promise<HomeworkAssignment[]> {
  const base = getBase();
  if (!base) return [];
  const q = new URLSearchParams({ studentId, group: (studentGroup ?? '').trim() });
  const res = await fetch(`${base}/api/students/${encodeURIComponent(studentId)}/homeworks?${q}`, {
    headers: getHeaders(),
  }).catch(() => null);
  if (!res?.ok) return [];
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) return [];
  return data.map((h: Record<string, unknown>) => normalizeHomework(h));
}

function normalizeHomework(h: Record<string, unknown>): HomeworkAssignment {
  const parseTargetNumber = (v: unknown): number | undefined => {
    if (v == null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const parseStudentDailyTargets = (raw: unknown): Record<string, StudentDailyTarget> | undefined => {
    if (raw == null) return undefined;
    let source: unknown = raw;
    if (typeof source === 'string') {
      try {
        source = JSON.parse(source);
      } catch {
        return undefined;
      }
    }
    if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
    const out: Record<string, StudentDailyTarget> = {};
    Object.entries(source as Record<string, unknown>).forEach(([studentId, targetRaw]) => {
      if (!targetRaw || typeof targetRaw !== 'object' || Array.isArray(targetRaw)) return;
      const t = targetRaw as Record<string, unknown>;
      const dailyGameTarget = parseTargetNumber(t.dailyGameTarget ?? t.daily_game_target);
      const dailyPuzzleTarget = parseTargetNumber(t.dailyPuzzleTarget ?? t.daily_puzzle_target);
      const minPuzzleAccuracyPct = parseTargetNumber(t.minPuzzleAccuracyPct ?? t.min_puzzle_accuracy_pct);
      out[String(studentId)] = {
        dailyGameTarget,
        dailyPuzzleTarget,
        minPuzzleAccuracyPct,
      };
    });
    return Object.keys(out).length > 0 ? out : undefined;
  };

  return {
    id: String(h.id ?? ''),
    title: String(h.title ?? ''),
    puzzles: Array.isArray(h.puzzles) ? h.puzzles.map(String) : [],
    dueDate: String((h.dueDate ?? h.due_date) ?? ''),
    assignedTo: Array.isArray(h.assignedTo) ? h.assignedTo.map(String) : (Array.isArray((h as { assigned_to?: string[] }).assigned_to) ? (h as { assigned_to: string[] }).assigned_to.map(String) : []),
    branch: h.branch != null ? String(h.branch) : undefined,
    branchName: h.branchName != null ? String(h.branchName) : (h.branch_name != null ? String(h.branch_name) : undefined),
    groupName: h.groupName != null ? String(h.groupName) : (h.group_name != null ? String(h.group_name) : undefined),
    startDate: h.startDate != null ? String(h.startDate) : (h.start_date != null ? String(h.start_date) : undefined),
    endDate: h.endDate != null ? String(h.endDate) : (h.end_date != null ? String(h.end_date) : undefined),
    timeLimitMinutes: typeof h.timeLimitMinutes === 'number' ? h.timeLimitMinutes : (typeof (h as { time_limit_minutes?: number }).time_limit_minutes === 'number' ? (h as { time_limit_minutes: number }).time_limit_minutes : undefined),
    hintCount: typeof h.hintCount === 'number' ? h.hintCount : undefined,
    description: h.description != null ? String(h.description) : undefined,
    assignmentType: (h.assignmentType ?? h.assignment_type) as HomeworkAssignment['assignmentType'] | undefined,
    dailyGameTarget: parseTargetNumber(h.dailyGameTarget ?? h.daily_game_target),
    dailyPuzzleTarget: parseTargetNumber(h.dailyPuzzleTarget ?? h.daily_puzzle_target),
    minPuzzleAccuracyPct: parseTargetNumber(h.minPuzzleAccuracyPct ?? h.min_puzzle_accuracy_pct),
    studentDailyTargets: parseStudentDailyTargets(h.studentDailyTargets ?? h.student_daily_targets),
  };
}

/** Öğrencinin ders programı (haftalık) */
export async function apiScheduleForStudent(
  studentId: string,
  studentGroup: string | null | undefined,
  week: number,
  year: number
): Promise<ScheduleEntry[]> {
  const base = getBase();
  if (!base) return [];
  const q = new URLSearchParams({ week: String(week), year: String(year), group: (studentGroup ?? '').trim() });
  const res = await fetch(`${base}/api/students/${encodeURIComponent(studentId)}/schedule?${q}`, {
    headers: getHeaders(),
  }).catch(() => null);
  if (!res?.ok) return [];
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) return [];
  return data.map((e: Record<string, unknown>) => ({
    id: String(e.id ?? ''),
    week: Number(e.week),
    year: Number(e.year),
    dayOfWeek: Number(e.dayOfWeek ?? (e as { day_of_week?: number }).day_of_week ?? 1),
    slotIndex: Number(e.slotIndex ?? (e as { slot_index?: number }).slot_index ?? 1),
    group: String(e.group ?? ''),
    topic: String(e.topic ?? ''),
    status: String((e.status ?? 'yapildi')) as ScheduleEntry['status'],
    studentId: e.studentId != null ? String(e.studentId) : ((e as { student_id?: string }).student_id != null ? String((e as { student_id: string }).student_id) : undefined),
  }));
}
