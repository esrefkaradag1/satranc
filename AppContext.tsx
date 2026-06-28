import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { resolveScopedStudents, resolveScopedTransactions, resolveScopedCoaches, resolveScopedTrainingGroups, resolveScopedDisciplineBranches, resolveScopedTournaments, resolveClubBranch } from './lib/orgScope';
import { Student, StudentLessonLogEntry, Transaction, Lesson, Puzzle, HomeworkAssignment, HomeworkPuzzleAttempt, HomeworkSubmission, InventoryItem, GalleryItem, ActivityLog, AttendanceRecord, AuthUser, ScheduleEntry, ScheduleEntryStatus, Coach, Club, PerformanceAnalysis, CoachAiReport, Tournament, StudentDailyTarget, DisciplineBranch, TrainingGroup, AppRole } from './types';
import { MOCK_STUDENTS } from './constants';
import { canWriteSupabase, getServiceSupabase, isSupabaseBackend, supabase } from './services/supabase';
import { homeworkAssigneesOverlap } from './lib/homeworkPanelUtils';
import { homeworkAssignmentCategory } from './lib/homeworkStatsBuilders';
import { looksLikeLichessPuzzleId } from './lib/puzzlePlayUtils';
import { insertHomeworkAttemptSupabase, detectHomeworkAttemptPayloadStyle, setCachedHomeworkAttemptPayloadStyle } from './lib/homeworkAttemptDb.mjs';
import { findStudentForLogin, verifyStudentLoginPin } from './lib/studentParentAuth.ts';
import { apiLocalAuthParentLogin } from './services/backendApi';
import { findClubForLogin } from './lib/clubLoginUtils';
import { createStudentLoginCredentials } from './lib/studentCredentials';
import {
  type BranchOfficeRecord,
  branchOfficeToDb,
  dbToBranchOffice,
  dbToDisciplineBranch,
  dbToTrainingGroup,
  disciplineBranchToDb,
  findRegisteredBranchOffice,
  resolveBranchOfficeNames,
  syncOrgStructureWithOffices,
  trainingGroupToDb,
  clubIdForOrgRecord,
  resolveClubIdFromAuth,
} from './lib/orgStructureDb';
import { normalizeClubKey } from './lib/clubScope';
import { normalizeLeaderboardPointSettings } from './lib/leaderboardPointSettings';
import {
  lessonsFromTrainingGroup,
  mergeTrainingGroupLessons,
  reconcileTrainingGroupLessons,
  removeTrainingGroupLessonsFromList,
} from './lib/syncGroupLessons';
import { getPermissionsForAuth, hasPermission as checkPermission, defaultPermissionsForRole, resolveCustomRoleIdForAuth } from './lib/rolePermissions';
import {
  loadRolesLocal,
  loadRolePermissionsLocal,
  saveRolesLocal,
  saveRolePermissionsLocal,
  fetchRolesFromSupabase,
  persistRoleToSupabase,
  deleteRoleFromSupabase,
  persistRolePermissionsToSupabase,
  seedSystemRolesIfEmpty,
  generateRoleId,
  slugifyRoleName,
  ROLES_UPDATED_EVENT,
} from './lib/roleStorage';
import { ToastStack } from './components/ui/ToastStack';
import { ConfirmDialog, type ConfirmDialogOptions, type AlertDialogOptions, type DialogRequest } from './components/ui/ConfirmDialog';

export type { ConfirmDialogOptions, AlertDialogOptions };

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface AppContextType {
  students: Student[];
  /** Giriş yapan role göre filtrelenmiş öğrenci listesi (admin: tümü, antrenör: kendi öğrencileri, kulüp: şube) */
  scopedStudents: Student[];
  /** Kulüp/antrenör şubesine göre filtrelenmiş kasa işlemleri */
  scopedTransactions: Transaction[];
  /** Kulüp şubesine göre filtrelenmiş antrenörler */
  scopedCoaches: Coach[];
  /** Kulüp şubesine göre filtrelenmiş eğitim grupları */
  scopedTrainingGroups: TrainingGroup[];
  /** Kulüp şubesine göre filtrelenmiş branşlar */
  scopedDisciplineBranches: DisciplineBranch[];
  /** Kulüp şubesine göre filtrelenmiş turnuvalar */
  scopedTournaments: Tournament[];
  /** Kulüp girişinde aktif şube adı */
  activeClubBranch?: string;
  addStudent: (student: Omit<Student, 'id'>) => Promise<Student>;
  updateStudent: (id: string, student: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  bulkDeleteStudents: (ids: string[]) => void;
  bulkUpdateStudentGroup: (ids: string[], newGroup: string) => void;
  bulkUpdateStudentCoach: (ids: string[], coachId: string) => void;
  
  transactions: Transaction[];
  addTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  updateTransaction: (id: string, transaction: Partial<Transaction>) => void;
  removeTransaction: (id: string) => void;

  attendanceRecords: AttendanceRecord[];
  addAttendanceRecord: (record: Omit<AttendanceRecord, 'id'>) => void;
  
  lessons: Lesson[];
  addLesson: (lesson: Omit<Lesson, 'id'>) => void;
  
  puzzles: Puzzle[];
  addPuzzle: (puzzle: Omit<Puzzle, 'id'>) => void;
  importPuzzles: (puzzles: Puzzle[]) => void;
  clearPuzzles: () => void;
  deletePuzzle: (id: string) => void;
  lichessPuzzlesLoaded: boolean;

  homeworks: HomeworkAssignment[];
  addHomework: (hw: Omit<HomeworkAssignment, 'id'>) => void;
  updateHomework: (id: string, hw: Partial<HomeworkAssignment>) => void;
  deleteHomework: (id: string) => void;

  homeworkAttempts: HomeworkPuzzleAttempt[];
  addHomeworkAttempt: (attempt: Omit<HomeworkPuzzleAttempt, 'id' | 'timestamp'>) => void;
  resetHomeworkAttemptsForStudent: (studentId: string, homeworkId?: string) => void;
  homeworkSubmissions: HomeworkSubmission[];
  addHomeworkSubmission: (submission: Omit<HomeworkSubmission, 'id' | 'submittedAt'>) => void;
  removeHomeworkSubmission: (studentId: string, homeworkId: string) => void;

  inventory: InventoryItem[];
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => void;
  updateInventoryItem: (id: string, item: Partial<InventoryItem>) => void;
  deleteInventoryItem: (id: string) => void;

  gallery: GalleryItem[];
  addGalleryItem: (item: Omit<GalleryItem, 'id'>) => void;
  removeGalleryItem: (id: string) => void;

  branchOffices: string[];
  /** Şube kayıtları (branch_offices tablosu) */
  branchOfficeRecords: BranchOfficeRecord[];
  addBranchOffice: (name: string, options?: { clubId?: string }) => void;
  removeBranchOffice: (name: string) => void;
  clubs: Club[];
  addClub: (club: Omit<Club, 'id'>) => void;
  updateClub: (id: string, club: Partial<Club>) => void;
  removeClub: (id: string) => void;
  disciplines: string[];
  addDiscipline: (name: string) => void;
  removeDiscipline: (name: string) => void;
  groups: string[];
  addGroup: (name: string) => void;
  removeGroup: (name: string) => void;
  disciplineBranches: DisciplineBranch[];
  addDisciplineBranch: (branch: Omit<DisciplineBranch, 'id'>) => void;
  updateDisciplineBranch: (id: string, branch: Partial<DisciplineBranch>) => void;
  removeDisciplineBranch: (id: string) => void;
  trainingGroups: TrainingGroup[];
  addTrainingGroup: (group: Omit<TrainingGroup, 'id'>) => void;
  updateTrainingGroup: (id: string, group: Partial<TrainingGroup>) => void;
  removeTrainingGroup: (id: string) => void;
  /** Grup bazlı ders konuları (yoklama ekranı) — grup adı → kayıtlar */
  groupLessonLogs: Record<string, StudentLessonLogEntry[]>;
  updateGroupLessonLog: (groupKey: string, entries: StudentLessonLogEntry[]) => void;

  activityLogs: ActivityLog[];
  addActivityLog: (entry: Omit<ActivityLog, 'id' | 'timestamp'>) => void;

  scheduleEntries: ScheduleEntry[];
  addScheduleEntry: (entry: Omit<ScheduleEntry, 'id'>) => void;
  updateScheduleEntry: (id: string, entry: Partial<ScheduleEntry>) => void;
  deleteScheduleEntry: (id: string) => void;

  coaches: Coach[];
  addCoach: (coach: Omit<Coach, 'id'>) => void;
  updateCoach: (id: string, coach: Partial<Coach>) => void;
  deleteCoach: (id: string) => void;

  performanceAnalyses: PerformanceAnalysis[];
  addPerformanceAnalysis: (analysis: Omit<PerformanceAnalysis, 'id'>) => void;
  updatePerformanceAnalysis: (id: string, patch: Partial<PerformanceAnalysis>) => void;
  deletePerformanceAnalysis: (id: string) => void;
  coachAiReports: CoachAiReport[];
  addCoachAiReport: (report: Omit<CoachAiReport, 'id'>) => void;
  deleteCoachAiReport: (id: string) => void;
  tournaments: Tournament[];
  addTournament: (tournament: Omit<Tournament, 'id'>) => void;
  updateTournament: (id: string, patch: Partial<Tournament>) => void;
  deleteTournament: (id: string) => void;

  appRoles: AppRole[];
  rolePermissionMap: Record<string, string[]>;
  rolesLoaded: boolean;
  createAppRole: (role: Omit<AppRole, 'id' | 'createdAt' | 'slug'> & { slug?: string }) => AppRole;
  updateAppRole: (id: string, patch: Partial<AppRole>) => void;
  deleteAppRole: (id: string) => void;
  setRolePermissions: (roleId: string, permKeys: string[]) => Promise<boolean>;
  refreshRoles: () => Promise<void>;
  getAuthPermissions: () => Set<string>;
  authPermissions: Set<string>;
  hasAuthPermission: (key: string) => boolean;

  auth: AuthUser | null;
  /** Sunucu modunda veli/öğrenci girişinde API'den dönen öğrenci (farklı cihazda öğrenci listesi yok). */
  apiStudent: Student | null;
  loginAdmin: (password: string) => boolean;
  loginCoach: (identifier: string, password: string) => boolean;
  loginClub: (username: string, password: string) => Promise<boolean>;
  loginParent: (studentIdOrPhone: string, pin: string) => Promise<boolean>;
  loginStudent: (studentIdOrPhone: string, pin: string) => Promise<boolean>;
  logout: () => void;
  /** Sunucu modunda API girişi sonrası auth + öğrenci bilgisini set eder. */
  setAuthWithStudent: (auth: AuthUser | null, student: Student | null) => void;
  /** Öğrenci paneli: localStorage'dan tekrar yükler (sadece yerel mod). */
  refreshFromStorage: () => void;
  /** Supabase'den öğrenci listesini tekrar çeker (canlı ders davet modalı vb.). */
  refreshStudentsFromSupabase: () => Promise<void>;
  /** İlk veri yüklemesi (Supabase veya storage) tamamlandı mı — öğrenci paneli "Öğrenci bulunamadı"yı sadece bundan sonra gösterir. */
  initialDataLoaded: boolean;
  stockfishReady: boolean;
  stockfishLoading: boolean;
  showToast: (message: string, type?: ToastType) => void;
  confirmDialog: (options: ConfirmDialogOptions) => Promise<boolean>;
  alertDialog: (options: AlertDialogOptions) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'netchess_auth';
const ADMIN_PASSWORD = 'admin';
const COACH_PASSWORD = 'antrenor';
const CLUB_PASSWORD = 'kulup';

const MOCK_DATA_VERSION = 2;

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* corrupt data — use fallback */ }
  return fallback;
}

function genId(): string {
  return Math.random().toString(36).substr(2, 9);
}

/** Kulüp/antrenör panelinden eklenen öğrenciler otomatik olarak ilgili şubeye/antrenöre bağlanır */
function applyStudentScopeFromAuth(
  student: Omit<Student, 'id'>,
  auth: AuthUser | null,
  coaches: Coach[],
): Omit<Student, 'id'> {
  if (!auth) return student;
  const next = { ...student };
  if (auth.role === 'club' && auth.branch?.trim()) {
    next.branchOffice = auth.branch.trim();
  }
  if (auth.role === 'coach') {
    if (auth.coachId?.trim()) next.coachId = auth.coachId.trim();
    const branch =
      auth.branch?.trim() ||
      coaches.find((c) => c.id === auth.coachId)?.branch?.trim();
    if (branch) next.branchOffice = branch;
  }
  return next;
}

/** Supabase students tablosu snake_case; uygulama camelCase. Tabloda olmayan alanlar gönderilmez (örn. group -> group_id yok). */
const STUDENT_DB_SKIP_KEYS = new Set<string>(['studentNo']);
const STUDENT_DB_SKIP_COLUMNS_KEY = 'netchess_student_db_skip_cols';

/** İlk insert'te gönderilir; tabloda yoksa PGRST204 üretir. */
const STUDENT_DB_CORE_SNAKE = new Set<string>([
  'id', 'name', 'level', 'elo', 'ukd', 'last_attendance', 'payment_status', 'group_name',
  'parent_name', 'parent_phone', 'birth_date', 'registration_date', 'branch', 'status',
  'tc_no', 'branch_office', 'username', 'password', 'parent_pin',
]);

/** İlk insert'ten sonra update ile eklenir (şemada yoksa atlanır). */
const STUDENT_DB_OPTIONAL_SNAKE = new Set<string>([
  'fide_id', 'photo_url', 'lichess_username', 'lichess_access_token', 'lichess_oauth_connected_at', 'chess_com_username',
  'contact_numbers', 'father_name', 'father_phone', 'father_job', 'mother_name', 'mother_phone', 'mother_job',
  'address', 'health_info', 'school', 'teacher', 'notes', 'branch_group',
  'has_sibling_discount', 'sibling_discount_type', 'sibling_discount_percent', 'sibling_discount_amount',
  'registration_type', 'monthly_fee',
  'payment_reminder_day', 'late_payment_reminder_day', 'is_scholarship_student', 'parent_job',
  'lesson_log', 'training_group_id', 'lesson_schedule', 'dues_overrides', 'dues_override_notes',
  'coach_id', 'branch_office',
]);

let _knownStudentColumns: Set<string> | null = null;

function loadSkippedStudentColumns(): Set<string> {
  try {
    const raw = localStorage.getItem(STUDENT_DB_SKIP_COLUMNS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch { /* ignore */ }
  return new Set();
}

function persistSkippedStudentColumn(col: string) {
  STUDENT_DB_OPTIONAL_SNAKE.add(col);
  STUDENT_DB_CORE_SNAKE.delete(col);
  const skip = loadSkippedStudentColumns();
  if (skip.has(col)) return;
  skip.add(col);
  try {
    localStorage.setItem(STUDENT_DB_SKIP_COLUMNS_KEY, JSON.stringify([...skip]));
  } catch { /* quota */ }
}

function learnStudentColumnsFromRows(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const keys = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) keys.add(k);
  }
  _knownStudentColumns = keys;
  for (const col of [...STUDENT_DB_OPTIONAL_SNAKE, ...STUDENT_DB_CORE_SNAKE]) {
    if (!keys.has(col) && !STUDENT_DB_OPTIONAL_NO_INFER_SKIP.has(col)) {
      persistSkippedStudentColumn(col);
    }
  }
}

// Önceki oturumlardan bilinen eksik kolonları yükle (lesson_log hariç — ders günlüğü desteklenir)
{
  const skip = loadSkippedStudentColumns();
  if (skip.delete('lesson_log')) {
    try {
      localStorage.setItem(STUDENT_DB_SKIP_COLUMNS_KEY, JSON.stringify([...skip]));
    } catch { /* ignore */ }
  }
  for (const col of skip) {
    persistSkippedStudentColumn(col);
  }
  restoreStudentLoginColumnsInSchema();
}

/** Satır şemasında yok diye otomatik atlanmayacak opsiyonel kolonlar */
const STUDENT_DB_OPTIONAL_NO_INFER_SKIP = new Set<string>([
  'lesson_log', 'training_group_id', 'lesson_schedule', 'dues_overrides', 'dues_override_notes',
  'coach_id',
  'username', 'password', 'parent_pin',
]);

function restoreStudentLoginColumnsInSchema() {
  const loginCols = ['username', 'password', 'parent_pin'];
  for (const col of loginCols) STUDENT_DB_OPTIONAL_SNAKE.add(col);
  const skip = loadSkippedStudentColumns();
  let changed = false;
  for (const col of loginCols) {
    if (skip.delete(col)) changed = true;
  }
  if (changed) {
    try {
      localStorage.setItem(STUDENT_DB_SKIP_COLUMNS_KEY, JSON.stringify([...skip]));
    } catch { /* ignore */ }
  }
}

const LESSON_LOG_STORAGE_KEY = 'netchess_lesson_logs';
const GROUP_LESSON_LOG_STORAGE_KEY = 'netchess_group_lesson_logs';

function loadGroupLessonLogsMap(): Record<string, StudentLessonLogEntry[]> {
  try {
    const raw = localStorage.getItem(GROUP_LESSON_LOG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, StudentLessonLogEntry[]> = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      out[key] = parseLessonLogFromDb(val);
    }
    return out;
  } catch {
    return {};
  }
}

function persistGroupLessonLogLocal(groupKey: string, entries: StudentLessonLogEntry[]) {
  const map = loadGroupLessonLogsMap();
  map[groupKey] = entries;
  try {
    localStorage.setItem(GROUP_LESSON_LOG_STORAGE_KEY, JSON.stringify(map));
  } catch { /* quota */ }
}

function mergeGroupLessonLogsMaps(
  a: Record<string, StudentLessonLogEntry[]>,
  b: Record<string, StudentLessonLogEntry[]>,
): Record<string, StudentLessonLogEntry[]> {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, StudentLessonLogEntry[]> = {};
  for (const key of keys) {
    out[key] = mergeLessonLogEntries(a[key] ?? [], b[key] ?? []);
  }
  return out;
}

function groupLessonLogsFromDbRows(rows: Record<string, unknown>[]): Record<string, StudentLessonLogEntry[]> {
  const out: Record<string, StudentLessonLogEntry[]> = {};
  for (const row of rows) {
    const name = String(row.group_name ?? '').trim();
    if (!name) continue;
    out[name] = parseLessonLogFromDb(row.entries);
  }
  return out;
}

function isMissingSupabaseTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = String(error.message ?? '').toLowerCase();
  return (
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache')
  );
}

async function loadGroupLessonLogsFromSupabase(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>> | typeof supabase,
): Promise<Record<string, StudentLessonLogEntry[]>> {
  try {
    const { data, error } = await sb.from('group_lesson_logs').select('group_name, entries');
    if (error) {
      if (!isMissingSupabaseTableError(error)) {
        console.warn('[Supabase] group_lesson_logs yükleme:', error.message);
      }
      return {};
    }
    return groupLessonLogsFromDbRows((data ?? []) as Record<string, unknown>[]);
  } catch (e) {
    console.warn('[Supabase] group_lesson_logs yükleme hatası:', e);
    return {};
  }
}

function applyGroupLessonLogsMerge(
  fromDb: Record<string, StudentLessonLogEntry[]>,
): Record<string, StudentLessonLogEntry[]> {
  return mergeGroupLessonLogsMaps(loadGroupLessonLogsMap(), fromDb);
}

async function migrateLocalGroupLessonLogsToSupabase(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  merged: Record<string, StudentLessonLogEntry[]>,
): Promise<void> {
  const local = loadGroupLessonLogsMap();
  const keys = Object.keys(local).filter((k) => (local[k]?.length ?? 0) > 0);
  if (keys.length === 0) return;
  for (const key of keys) {
    const entries = merged[key] ?? [];
    if (entries.length === 0) continue;
    const { error } = await sb.from('group_lesson_logs').upsert(
      {
        group_name: key,
        entries,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'group_name' },
    );
    if (error) {
      if (isMissingSupabaseTableError(error)) return;
      console.warn('[Supabase] group_lesson_logs migrate:', key, error.message);
    }
  }
}

function loadLessonLogsMap(): Record<string, StudentLessonLogEntry[]> {
  try {
    const raw = localStorage.getItem(LESSON_LOG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, StudentLessonLogEntry[]> = {};
    for (const [id, val] of Object.entries(parsed as Record<string, unknown>)) {
      out[id] = parseLessonLogFromDb(val);
    }
    return out;
  } catch {
    return {};
  }
}

function saveLessonLogsMap(map: Record<string, StudentLessonLogEntry[]>) {
  try {
    localStorage.setItem(LESSON_LOG_STORAGE_KEY, JSON.stringify(map));
  } catch { /* quota */ }
}

function persistLessonLogLocal(studentId: string, entries: StudentLessonLogEntry[]) {
  const map = loadLessonLogsMap();
  map[studentId] = entries;
  saveLessonLogsMap(map);
}

function mergeLessonLogEntries(
  a: StudentLessonLogEntry[],
  b: StudentLessonLogEntry[]
): StudentLessonLogEntry[] {
  const byId = new Map<string, StudentLessonLogEntry>();
  for (const e of a) byId.set(e.id, e);
  for (const e of b) {
    const prev = byId.get(e.id);
    if (!prev) byId.set(e.id, e);
    else {
      const prevTs = Date.parse(prev.updatedAt ?? prev.createdAt ?? '') || 0;
      const nextTs = Date.parse(e.updatedAt ?? e.createdAt ?? '') || 0;
      byId.set(e.id, nextTs >= prevTs ? e : prev);
    }
  }
  return [...byId.values()];
}

/** Supabase + yerel yedek: ders günlüğü kaybolmasın */
function applyLessonLogsToStudents(list: Student[]): Student[] {
  const local = loadLessonLogsMap();
  return list.map((s) => {
    const fromDb = s.lessonLog ?? [];
    const fromLocal = local[s.id] ?? [];
    if (fromDb.length === 0 && fromLocal.length === 0) return s;
    return { ...s, lessonLog: mergeLessonLogEntries(fromDb, fromLocal) };
  });
}

function isStudentPgColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST204' ||
    (String(error.message || '').toLowerCase().includes('column') &&
      String(error.message || '').toLowerCase().includes('schema cache'))
  );
}

function missingStudentColumn(error: { message?: string } | null): string | null {
  const msg = String(error?.message ?? '');
  const m = msg.match(/'([^']+)'\s+column/i) ?? msg.match(/column\s+['"]?(\w+)['"]?/i);
  return m?.[1] ?? null;
}

async function studentInsertWithRetry(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  student: Record<string, unknown>
): Promise<{ ok: boolean; error?: string; synced?: boolean }> {
  const skip = loadSkippedStudentColumns();
  let payload = studentToDb(student, 'core', skip);
  for (let attempt = 0; attempt < 15; attempt++) {
    const { error } = await sb.from('students').insert(payload);
    if (!error) {
      const patch = studentToDb(student, 'optional', skip);
      if (Object.keys(patch).length > 0) {
        const id = String(student.id ?? '');
        if (id) {
          const patchResult = await studentUpdateWithRetry(sb, id, patch);
          if (!patchResult.ok) {
            console.warn('[Students] Supabase optional alanlar yazılamadı:', patchResult.error);
            return { ok: true, synced: false };
          }
        }
      }
      return { ok: true, synced: true };
    }
    if (isStudentPgColumnError(error)) {
      const col = missingStudentColumn(error);
      if (col && Object.prototype.hasOwnProperty.call(payload, col)) {
        delete payload[col];
        persistSkippedStudentColumn(col);
        continue;
      }
    }
    return { ok: false, error: error.message };
  }
  return { ok: false, error: 'Çok fazla şema uyumsuzluğu' };
}

async function studentUpdateWithRetry(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  id: string,
  fields: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const skip = loadSkippedStudentColumns();
  const isSnakePayload = Object.keys(fields).some((k) => k.includes('_'));
  const payload = isSnakePayload ? { ...fields } : studentToDb(fields, 'all', skip);
  if (Object.keys(payload).length === 0) return { ok: true };
  for (let attempt = 0; attempt < 15; attempt++) {
    const { error } = await sb.from('students').update(payload).eq('id', id);
    if (!error) return { ok: true };
    if (isStudentPgColumnError(error)) {
      const col = missingStudentColumn(error);
      if (col && Object.prototype.hasOwnProperty.call(payload, col)) {
        delete payload[col];
        persistSkippedStudentColumn(col);
        if (Object.keys(payload).length === 0) return { ok: true };
        continue;
      }
    }
    return { ok: false, error: error.message };
  }
  return { ok: false, error: 'Çok fazla şema uyumsuzluğu' };
}

type StudentDbMode = 'all' | 'core' | 'optional';

function studentToDb(
  s: Record<string, unknown>,
  mode: StudentDbMode = 'all',
  skipColumns: Set<string> = loadSkippedStudentColumns()
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || STUDENT_DB_SKIP_KEYS.has(k)) continue;
    const snake =
      k === 'group' ? 'group_name' : k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
    if (skipColumns.has(snake) && !STUDENT_DB_OPTIONAL_NO_INFER_SKIP.has(snake)) continue;
    if (
      _knownStudentColumns &&
      !_knownStudentColumns.has(snake) &&
      snake !== 'id' &&
      !STUDENT_DB_OPTIONAL_NO_INFER_SKIP.has(snake)
    ) {
      continue;
    }
    if (k === 'lessonLog') {
      out.lesson_log = Array.isArray(v) ? v : [];
      continue;
    }
    if (k === 'lessonSchedule') {
      out.lesson_schedule = Array.isArray(v) ? v : [];
      continue;
    }
    if (k === 'duesOverrides') {
      out.dues_overrides = v && typeof v === 'object' ? v : {};
      continue;
    }
    if (k === 'duesOverrideNotes') {
      out.dues_override_notes = v && typeof v === 'object' ? v : {};
      continue;
    }
    if (k === 'trainingGroupId') {
      out.training_group_id = v;
      continue;
    }
    if (mode === 'core' && !STUDENT_DB_CORE_SNAKE.has(snake)) continue;
    if (mode === 'optional' && !STUDENT_DB_OPTIONAL_SNAKE.has(snake)) continue;
    if (k === 'group') {
      out.group_name = v;
    } else {
      out[snake] = v;
    }
  }
  return out;
}
function parseLessonLogFromDb(raw: unknown): StudentLessonLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: StudentLessonLogEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? '').trim() || genId();
    const date = String(o.date ?? '').trim();
    const topic = String(o.topic ?? '').trim();
    const info = String(o.info ?? '').trim();
    if (!date && !topic && !info) continue;
    out.push({
      id,
      date,
      topic,
      info,
      createdAt: o.createdAt != null ? String(o.createdAt) : undefined,
      updatedAt: o.updatedAt != null ? String(o.updatedAt) : undefined,
    });
  }
  return out;
}

function dbToStudent(row: Record<string, unknown>): Student {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (k === 'group_name') {
      out.group = v;
      continue;
    }
    if (k === 'lesson_log') {
      out.lessonLog = parseLessonLogFromDb(v);
      continue;
    }
    if (k === 'lesson_schedule') {
      out.lessonSchedule = Array.isArray(v) ? v : [];
      continue;
    }
    if (k === 'dues_overrides') {
      out.duesOverrides = v && typeof v === 'object' ? (v as Record<string, number>) : {};
      continue;
    }
    if (k === 'dues_override_notes') {
      out.duesOverrideNotes = v && typeof v === 'object' ? (v as Record<string, string>) : {};
      continue;
    }
    if (k === 'training_group_id') {
      out.trainingGroupId = v;
      continue;
    }
    if (k === 'lichess_access_token') continue;
    const camel = k.replace(/_([a-z])/g, (_, c) => (c as string).toUpperCase());
    out[camel] = v;
  }
  if (!('group' in out) && 'groupId' in out) out.group = out.groupId ?? '';
  else if (!('group' in out)) out.group = '';
  return out as unknown as Student;
}

/** Öğrenci no gösterimi: studentNo varsa onu, yoksa kayıt tarihi/sıraya göre 1 tabanlı sıra numarası döner. */
export function getDisplayStudentNo(student: Student, allStudents: Student[]): number {
  if (student.studentNo != null && student.studentNo > 0) return student.studentNo;
  const sorted = [...allStudents].sort(
    (a, b) =>
      (a.registrationDate || '').localeCompare(b.registrationDate || '') ||
      (a.name || '').localeCompare(b.name || '') ||
      a.id.localeCompare(b.id)
  );
  const idx = sorted.findIndex((s) => s.id === student.id);
  return idx >= 0 ? idx + 1 : 1;
}

/** Supabase homeworks tablosu: supabase_tables.sql'de id, title, puzzles, dueDate, assignedTo kolonları var.
 * Postgres tarafında bunlar sırasıyla id, title, puzzles, duedate, assignedto olarak tutulur.
 * O yüzden sadece bu alanları, doğru isimlerle gönderiyoruz. */
function homeworkToDb(h: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (h.id != null) out.id = h.id;
  if (h.title != null) out.title = h.title;
  if (h.puzzles != null) out.puzzles = h.puzzles;
  if ((h as any).dueDate != null) out.duedate = (h as any).dueDate;
  if ((h as any).assignedTo != null) out.assignedto = (h as any).assignedTo;
  if ((h as any).dailyGameTarget != null) out.daily_game_target = (h as any).dailyGameTarget;
  if ((h as any).dailyPuzzleTarget != null) out.daily_puzzle_target = (h as any).dailyPuzzleTarget;
  if ((h as any).minPuzzleAccuracyPct != null) out.min_puzzle_accuracy_pct = (h as any).minPuzzleAccuracyPct;
  if ((h as any).studentDailyTargets != null) out.student_daily_targets = (h as any).studentDailyTargets;
  return out;
}
function dbToHomework(row: Record<string, unknown>): HomeworkAssignment {
  const id = String(row.id ?? '');
  const title = String(row.title ?? '');
  const puzzles = Array.isArray(row.puzzles) ? (row.puzzles as string[]) : [];
  const dueDate = String((row as any).dueDate ?? (row as any).duedate ?? '');
  const rawAssigned = (row as any).assignedTo ?? (row as any).assignedto;
  const assignedTo = Array.isArray(rawAssigned) ? (rawAssigned as string[]) : [];
  const dailyGameTargetRaw = (row as any).dailyGameTarget ?? (row as any).daily_game_target;
  const dailyPuzzleTargetRaw = (row as any).dailyPuzzleTarget ?? (row as any).daily_puzzle_target;
  const minPuzzleAccuracyPctRaw = (row as any).minPuzzleAccuracyPct ?? (row as any).min_puzzle_accuracy_pct;
  const studentDailyTargetsRaw = (row as any).studentDailyTargets ?? (row as any).student_daily_targets;
  const studentDailyTargets =
    studentDailyTargetsRaw && typeof studentDailyTargetsRaw === 'object'
      ? (studentDailyTargetsRaw as Record<string, StudentDailyTarget>)
      : undefined;
  return {
    id,
    title,
    puzzles,
    dueDate,
    assignedTo,
    dailyGameTarget: dailyGameTargetRaw != null ? Number(dailyGameTargetRaw) : undefined,
    dailyPuzzleTarget: dailyPuzzleTargetRaw != null ? Number(dailyPuzzleTargetRaw) : undefined,
    minPuzzleAccuracyPct: minPuzzleAccuracyPctRaw != null ? Number(minPuzzleAccuracyPctRaw) : undefined,
    studentDailyTargets,
  };
}

const DEFAULT_PUZZLE_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function dbToPuzzle(row: Record<string, unknown>): Puzzle {
  const lichessRaw = row.lichess_themes ?? row.lichessThemes;
  return {
    id: String(row.id ?? ''),
    fen: String(row.fen ?? ''),
    solution: Array.isArray(row.solution) ? (row.solution as string[]) : [],
    title: String(row.title ?? ''),
    difficulty: (row.difficulty as Puzzle['difficulty']) ?? 'Orta',
    points: Number(row.points ?? 0),
    category: String(row.category ?? ''),
    theme: row.theme != null ? String(row.theme) : undefined,
    hint: row.hint != null ? String(row.hint) : undefined,
    imageData:
      row.image_data != null
        ? String(row.image_data)
        : row.imageData != null
          ? String(row.imageData)
          : undefined,
    gamePgn:
      row.game_pgn != null
        ? String(row.game_pgn)
        : row.gamePgn != null
          ? String(row.gamePgn)
          : undefined,
    lichessThemes: lichessRaw != null ? String(lichessRaw) : undefined,
    lichessId: row.lichess_id != null
      ? String(row.lichess_id)
      : row.lichessId != null
        ? String(row.lichessId)
        : undefined,
    source: (row.source as Puzzle['source'])
      ?? (lichessRaw != null ? 'lichess' : 'custom'),
  };
}

function puzzleToDb(p: Puzzle): Record<string, unknown> {
  const rawFen = p.fen != null ? String(p.fen).trim() : '';
  const fen = rawFen !== '' ? rawFen : DEFAULT_PUZZLE_FEN;
  const row: Record<string, unknown> = {
    id: p.id,
    fen,
    solution: Array.isArray(p.solution) ? p.solution : [],
    title: p.title ?? '',
    difficulty: p.difficulty ?? 'Orta',
    points: p.points ?? 0,
    category: p.category ?? '',
    theme: p.theme ?? null,
    hint: p.hint ?? null,
    source: p.source ?? 'lichess',
  };
  if (p.imageData) row.image_data = p.imageData;
  if (p.gamePgn) row.game_pgn = p.gamePgn;
  if (p.lichessThemes) row.lichess_themes = p.lichessThemes;
  if (p.lichessId) row.lichess_id = p.lichessId;
  return row;
}

/** Supabase schedule_entries tablosu: id, week, year, day_of_week, slot_index, group_name, topic, status, student_id. */
function scheduleEntryToDb(e: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (e.id != null) out.id = e.id;
  if (e.week != null) out.week = e.week;
  if (e.year != null) out.year = e.year;
  if ((e as any).dayOfWeek != null) out.day_of_week = (e as any).dayOfWeek;
  if ((e as any).slotIndex != null) out.slot_index = (e as any).slotIndex;
  if ((e as any).group != null) out.group_name = (e as any).group;
  if (e.topic != null) out.topic = e.topic;
  if (e.status != null) out.status = e.status;
  if ((e as any).studentId != null) out.student_id = (e as any).studentId;
  if ((e as any).note != null) out.note = (e as any).note;
  return out;
}

function dbToScheduleEntry(row: Record<string, unknown>): ScheduleEntry {
  const id = String(row.id ?? '');
  const week = Number(row.week ?? 0);
  const year = Number(row.year ?? new Date().getFullYear());
  const dayOfWeek = Number((row as any).day_of_week ?? (row as any).dayOfWeek ?? 1);
  const slotIndex = Number((row as any).slot_index ?? (row as any).slotIndex ?? 1);
  const group = String((row as any).group_name ?? (row as any).group ?? '');
  const topic = String(row.topic ?? 'Ders');
  const status = String(row.status ?? 'yapilmadi') as ScheduleEntryStatus;
  const studentIdVal = (row as any).student_id ?? (row as any).studentId;
  const studentId = studentIdVal != null ? String(studentIdVal) : undefined;
  const noteVal = (row as any).note;
  const note = noteVal != null ? String(noteVal) : undefined;
  return { id, week, year, dayOfWeek, slotIndex, group, topic, status, studentId, note };
}

/** lessons: Supabase snake_case; group rezerve kelime olduğu için tabloda group_name kullanılıyor */
function lessonToDb(l: Lesson): Record<string, unknown> {
  return {
    id: l.id,
    day: l.day,
    start_time: l.startTime,
    end_time: l.endTime,
    group_name: l.group,
    topic: l.topic,
    branch: l.branch ?? null,
    student_id: l.studentId ?? null,
  };
}

/** Eski Supabase şeması (camelCase sütun adları) */
function lessonToDbLegacy(l: Lesson): Record<string, unknown> {
  return {
    id: l.id,
    day: l.day,
    startTime: l.startTime,
    endTime: l.endTime,
    group: l.group,
    topic: l.topic,
    branch: l.branch ?? null,
    studentId: l.studentId ?? null,
  };
}

function isLessonPgColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST204' ||
    (String(error.message || '').toLowerCase().includes('column') &&
      String(error.message || '').toLowerCase().includes('schema'))
  );
}

async function lessonsUpsertWithRetry(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  items: Lesson[],
): Promise<{ ok: boolean; error?: string }> {
  if (items.length === 0) return { ok: true };
  const modern = items.map((l) => lessonToDb(l));
  const { error } = await sb.from('lessons').upsert(modern);
  if (!error) return { ok: true };
  if (isLessonPgColumnError(error)) {
    const legacy = items.map((l) => lessonToDbLegacy(l));
    const retry = await sb.from('lessons').upsert(legacy);
    if (!retry.error) return { ok: true };
    return { ok: false, error: retry.error.message };
  }
  return { ok: false, error: error.message };
}

async function lessonInsertWithRetry(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  lesson: Lesson,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from('lessons').insert(lessonToDb(lesson));
  if (!error) return { ok: true };
  if (isLessonPgColumnError(error)) {
    const retry = await sb.from('lessons').insert(lessonToDbLegacy(lesson));
    if (!retry.error) return { ok: true };
    return { ok: false, error: retry.error.message };
  }
  return { ok: false, error: error.message };
}
function dbToLesson(row: Record<string, unknown>): Lesson {
  const r = row as Record<string, unknown> & { start_time?: string; end_time?: string };
  return {
    id: String(row.id ?? ''),
    day: String(row.day ?? 'Pazartesi'),
    startTime: String(r.start_time ?? (row as any).startTime ?? ''),
    endTime: String(r.end_time ?? (row as any).endTime ?? ''),
    group: String((row as any).group_name ?? (row as any).group ?? ''),
    topic: String(row.topic ?? 'Ders'),
    branch: (row as any).branch != null ? String((row as any).branch) : undefined,
    studentId: (row as any).student_id != null && (row as any).student_id !== '' ? String((row as any).student_id) : undefined,
  };
}

/** attendance_records: Sadece tabloda kesin olan kolonlar gönderilir (id, date, student_id, status). Opsiyonel kolonlar yoksa insert hata verir diye eklenmiyor. */
function attendanceRecordToDb(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (r.id != null) out.id = r.id;
  if (r.date != null) out.date = r.date;
  if ((r as any).studentId != null) out.student_id = (r as any).studentId;
  if (r.status != null) out.status = r.status;
  return out;
}

function dbToAttendanceRecord(row: Record<string, unknown>): AttendanceRecord {
  const id = String(row.id ?? '');
  const date = String(row.date ?? '');
  const studentId = String((row as any).student_id ?? (row as any).studentId ?? '');
  const lessonIdVal = (row as any).lesson_id ?? (row as any).lessonId;
  const lessonId = lessonIdVal != null ? String(lessonIdVal) : undefined;
  const status = String((row as any).status ?? 'absent') as AttendanceRecord['status'];
  const notifiedParent = (row as any).notified_parent ?? (row as any).notifiedParent;
  const teacherNameVal = (row as any).teacher_name ?? (row as any).teacherName;
  const teacherName = teacherNameVal != null ? String(teacherNameVal) : undefined;
  const lessonSummaryVal = (row as any).lesson_summary ?? (row as any).lessonSummary;
  const lessonSummary = lessonSummaryVal != null ? String(lessonSummaryVal) : undefined;
  return { id, date, studentId, lessonId, status, notifiedParent: Boolean(notifiedParent), teacherName, lessonSummary };
}

function coachAiReportToDb(r: CoachAiReport): Record<string, unknown> {
  return {
    id: r.id,
    student_id: r.studentId,
    created_at: r.createdAt,
    title: r.title,
    summary: r.summary,
    eksiklikler: r.eksiklikler,
    hamleler: r.hamleler,
    skill_snapshot: r.skillSnapshot ?? null,
    published_to_student: r.publishedToStudent ?? false,
    published_to_parent: r.publishedToParent ?? false,
  };
}

function dbToCoachAiReport(row: Record<string, unknown>): CoachAiReport {
  const r = row as Record<string, unknown> & {
    student_id?: string;
    created_at?: string;
    skill_snapshot?: unknown;
    published_to_student?: boolean;
    published_to_parent?: boolean;
  };
  const snap = r.skill_snapshot ?? (row as { skillSnapshot?: unknown }).skillSnapshot;
  return {
    id: String(row.id ?? ''),
    studentId: String(r.student_id ?? (row as { studentId?: string }).studentId ?? ''),
    createdAt: String(r.created_at ?? (row as { createdAt?: string }).createdAt ?? ''),
    title: String(row.title ?? ''),
    summary: String(row.summary ?? ''),
    eksiklikler: String(r.eksiklikler ?? (row as { eksiklikler?: string }).eksiklikler ?? ''),
    hamleler: String(r.hamleler ?? (row as { hamleler?: string }).hamleler ?? ''),
    skillSnapshot:
      snap && typeof snap === 'object' && !Array.isArray(snap)
        ? (snap as CoachAiReport['skillSnapshot'])
        : undefined,
    publishedToStudent: Boolean(
      r.published_to_student ?? (row as { publishedToStudent?: boolean }).publishedToStudent
    ),
    publishedToParent: Boolean(
      r.published_to_parent ?? (row as { publishedToParent?: boolean }).publishedToParent
    ),
  };
}

function performanceAnalysisToDb(r: Record<string, unknown>): Record<string, unknown> {
  const a = r as unknown as PerformanceAnalysis;
  return {
    id: a.id,
    student_id: a.studentId,
    branch: a.branch,
    analysis_date: a.analysisDate,
    technical_skills: a.technicalSkills,
    technical_notes: a.technicalNotes ?? '',
    physical_condition: a.physicalCondition,
    physical_notes: a.physicalNotes ?? '',
    tactical_understanding: a.tacticalUnderstanding,
    tactical_notes: a.tacticalNotes ?? '',
    mental_state: a.mentalState,
    mental_notes: a.mentalNotes ?? '',
    discipline_attitude: a.disciplineAttitude,
    discipline_notes: a.disciplineNotes ?? '',
    teamwork: a.teamwork,
    teamwork_notes: a.teamworkNotes ?? '',
    general_evaluation: a.generalEvaluation ?? '',
    recommendations: a.recommendations ?? '',
    short_term_goal: a.shortTermGoal ?? '',
    long_term_goal: a.longTermGoal ?? '',
    categories: a.categories ?? [],
  };
}
function dbToPerformanceAnalysis(row: Record<string, unknown>): PerformanceAnalysis {
  const r = row as Record<string, unknown> & { student_id?: string; analysis_date?: string; technical_skills?: number; technical_notes?: string; physical_condition?: number; physical_notes?: string; tactical_understanding?: number; tactical_notes?: string; mental_state?: number; mental_notes?: string; discipline_attitude?: number; discipline_notes?: string; teamwork_notes?: string; general_evaluation?: string; short_term_goal?: string; long_term_goal?: string; categories?: unknown };
  const rawCategories = r.categories ?? (row as any).categories;
  const categories = Array.isArray(rawCategories)
    ? (rawCategories as PerformanceAnalysis['categories'])
    : undefined;
  return {
    id: String(row.id ?? ''),
    studentId: String(r.student_id ?? (row as any).studentId ?? ''),
    branch: String(r.branch ?? ''),
    analysisDate: String(r.analysis_date ?? (row as any).analysisDate ?? ''),
    technicalSkills: Number(r.technical_skills ?? (row as any).technicalSkills ?? 5),
    technicalNotes: String(r.technical_notes ?? (row as any).technicalNotes ?? ''),
    physicalCondition: Number(r.physical_condition ?? (row as any).physicalCondition ?? 5),
    physicalNotes: String(r.physical_notes ?? (row as any).physicalNotes ?? ''),
    tacticalUnderstanding: Number(r.tactical_understanding ?? (row as any).tacticalUnderstanding ?? 5),
    tacticalNotes: String(r.tactical_notes ?? (row as any).tacticalNotes ?? ''),
    mentalState: Number(r.mental_state ?? (row as any).mentalState ?? 5),
    mentalNotes: String(r.mental_notes ?? (row as any).mentalNotes ?? ''),
    disciplineAttitude: Number(r.discipline_attitude ?? (row as any).disciplineAttitude ?? 5),
    disciplineNotes: String(r.discipline_notes ?? (row as any).disciplineNotes ?? ''),
    teamwork: Number(r.teamwork ?? 5),
    teamworkNotes: String(r.teamwork_notes ?? (row as any).teamworkNotes ?? ''),
    generalEvaluation: String(r.general_evaluation ?? (row as any).generalEvaluation ?? ''),
    recommendations: String((row as any).recommendations ?? ''),
    shortTermGoal: String(r.short_term_goal ?? (row as any).shortTermGoal ?? ''),
    longTermGoal: String(r.long_term_goal ?? (row as any).longTermGoal ?? ''),
    categories,
  };
}

/** homework_submissions: camelCase -> snake_case */
function submissionToDb(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r.id,
    student_id: (r as any).studentId,
    homework_id: (r as any).homeworkId,
    submitted_at: (r as any).submittedAt,
  };
}
function dbToSubmission(row: Record<string, unknown>): HomeworkSubmission {
  return {
    id: String(row.id ?? ''),
    studentId: String((row as any).student_id ?? (row as any).studentId ?? ''),
    homeworkId: String((row as any).homework_id ?? (row as any).homeworkId ?? ''),
    submittedAt: String((row as any).submitted_at ?? (row as any).submittedAt ?? ''),
  };
}

function dbToHomeworkAttempt(row: Record<string, unknown>): HomeworkPuzzleAttempt {
  const r = row as any;
  return {
    id: String(row.id ?? ''),
    studentId: String(r.student_id ?? r.studentId ?? r.studentid ?? ''),
    homeworkId: String(r.homework_id ?? r.homeworkId ?? r.homeworkid ?? ''),
    puzzleId: String(r.puzzle_id ?? r.puzzleId ?? r.puzzleid ?? ''),
    puzzleTitle: String(r.puzzle_title ?? r.puzzleTitle ?? r.puzzletitle ?? ''),
    correct: Boolean(r.correct),
    movesPlayed: Array.isArray(r.moves_played) ? r.moves_played : Array.isArray(r.movesPlayed) ? r.movesPlayed : Array.isArray(r.movesplayed) ? r.movesplayed : [],
    solutionMoves: Array.isArray(r.solution_moves) ? r.solution_moves : Array.isArray(r.solutionMoves) ? r.solutionMoves : Array.isArray(r.solutionmoves) ? r.solutionmoves : [],
    finalFen: r.final_fen != null ? String(r.final_fen) : r.finalFen != null ? String(r.finalFen) : r.finalfen != null ? String(r.finalfen) : undefined,
    thinkSeconds: r.think_seconds != null ? Number(r.think_seconds) : r.thinkSeconds != null ? Number(r.thinkSeconds) : r.thinkseconds != null ? Number(r.thinkseconds) : undefined,
    hintUsed: Boolean(r.hint_used ?? r.hintUsed ?? r.hintused ?? false),
    timestamp: String(r.timestamp ?? ''),
  };
}

function mergeHomeworkAttemptsFromStorage(fromDb: HomeworkPuzzleAttempt[]): HomeworkPuzzleAttempt[] {
  let localAttempts: HomeworkPuzzleAttempt[] = [];
  try {
    const raw = localStorage.getItem('netchess_homework_attempts');
    if (raw) localAttempts = JSON.parse(raw) as HomeworkPuzzleAttempt[];
  } catch {
    /* ignore */
  }
  const byId = new Map(fromDb.map((a) => [a.id, a]));
  for (const a of localAttempts) {
    if (!byId.has(a.id)) byId.set(a.id, a);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

function dbToGalleryItem(row: Record<string, unknown>): GalleryItem {
  const r = row as any;
  return {
    id: String(row.id ?? ''),
    url: String(row.url ?? ''),
    title: String(row.title ?? ''),
    group: String(r.group_name ?? row.group ?? ''),
    date: String(row.date ?? ''),
    studentId: r.student_id != null && r.student_id !== '' ? String(r.student_id) : undefined,
  };
}
function galleryToDb(item: GalleryItem): Record<string, unknown> {
  return {
    id: item.id,
    url: item.url,
    title: item.title,
    group_name: item.group,
    date: item.date,
    student_id: item.studentId ?? null,
  };
}

function dbToTransaction(row: Record<string, unknown>): Transaction {
  const r = row as any;
  return {
    id: String(row.id ?? ''),
    date: String(row.date ?? ''),
    type: (row.type === 'income' || row.type === 'expense' ? row.type : 'income') as Transaction['type'],
    category: String(row.category ?? ''),
    description: String(row.description ?? ''),
    paymentType: (r.payment_type ?? row.paymentType ?? 'Nakit') as Transaction['paymentType'],
    amount: Number(row.amount ?? 0),
    totalAmount: r.total_amount != null ? Number(r.total_amount) : r.totalAmount != null ? Number(r.totalAmount) : undefined,
    branch: row.branch != null ? String(row.branch) : undefined,
    processedBy: r.processed_by != null ? String(r.processed_by) : r.processedBy != null ? String(r.processedBy) : undefined,
    studentId: r.student_id != null && r.student_id !== '' ? String(r.student_id) : undefined,
  };
}
function transactionToDb(t: Transaction): Record<string, unknown> {
  return {
    id: t.id,
    date: t.date,
    type: t.type,
    category: t.category ?? '',
    description: t.description ?? '',
    payment_type: t.paymentType ?? 'Nakit',
    amount: t.amount,
    total_amount: t.totalAmount ?? null,
    processed_by: t.processedBy ?? null,
    student_id: t.studentId ?? null,
    branch: t.branch ?? null,
  };
}

function tournamentToDb(t: Tournament): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    format: t.format,
    duration_minutes: t.durationMinutes,
    time_control: t.timeControl,
    start_at: t.startAt,
    description: t.description ?? null,
    is_rated: t.isRated,
    created_by_role: t.createdByRole,
    created_by: t.createdBy,
    branch: t.branch ?? null,
    participant_ids: t.participantIds ?? [],
    rounds: t.rounds ?? [],
    standings: t.standings ?? {},
  };
}
function dbToTournament(row: Record<string, unknown>): Tournament {
  const r = row as any;
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    format: (r.format === 'swiss' ? 'swiss' : 'arena'),
    durationMinutes: Number(r.duration_minutes ?? r.durationMinutes ?? 45),
    timeControl: String(r.time_control ?? r.timeControl ?? '2+0'),
    startAt: String(r.start_at ?? r.startAt ?? new Date().toISOString()),
    description: r.description != null ? String(r.description) : undefined,
    isRated: Boolean(r.is_rated ?? r.isRated ?? true),
    createdByRole: (r.created_by_role === 'club' ? 'club' : 'admin'),
    createdBy: String(r.created_by ?? r.createdBy ?? 'Admin'),
    branch: r.branch != null ? String(r.branch) : undefined,
    participantIds: Array.isArray(r.participant_ids) ? r.participant_ids : Array.isArray(r.participantIds) ? r.participantIds : [],
    rounds: Array.isArray(r.rounds) ? r.rounds : [],
    standings: (r.standings && typeof r.standings === 'object') ? r.standings : {},
  };
}

function clubToDb(club: Club): Record<string, unknown> {
  return {
    id: club.id,
    name: club.name,
    address: club.address ?? null,
    active_days: Array.isArray(club.activeDays) && club.activeDays.length === 7
      ? club.activeDays
      : [true, true, true, true, false, false, false],
    login_password: club.loginPassword ?? null,
    login_username: club.loginUsername ?? null,
    role_id: club.roleId ?? null,
    leaderboard_points: club.leaderboardPoints ?? null,
  };
}

function coachToDb(coach: Coach): Record<string, unknown> {
  return {
    id: coach.id,
    name: coach.name,
    branch: coach.branch,
    phone: coach.phone ?? null,
    email: coach.email ?? null,
    password: coach.password ?? null,
    photo_url: coach.photoUrl ?? null,
    title: coach.title ?? null,
    specialization: coach.specialization ?? null,
    bio: coach.bio ?? null,
    birth_date: coach.birthDate ?? null,
    fide_id: coach.fideId ?? null,
    lichess_username: coach.lichessUsername ?? null,
    role_id: coach.roleId ?? null,
  };
}

function dbToCoach(row: Record<string, unknown>): Coach {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    branch: String(r.branch ?? ''),
    phone: r.phone != null ? String(r.phone) : undefined,
    email: r.email != null ? String(r.email) : undefined,
    password: r.password != null ? String(r.password) : undefined,
    photoUrl: r.photo_url != null ? String(r.photo_url) : r.photoUrl != null ? String(r.photoUrl) : undefined,
    title: r.title != null ? String(r.title) : undefined,
    specialization: r.specialization != null ? String(r.specialization) : undefined,
    bio: r.bio != null ? String(r.bio) : undefined,
    birthDate: r.birth_date != null ? String(r.birth_date) : r.birthDate != null ? String(r.birthDate) : undefined,
    fideId: r.fide_id != null ? String(r.fide_id) : r.fideId != null ? String(r.fideId) : undefined,
    lichessUsername:
      r.lichess_username != null
        ? String(r.lichess_username)
        : r.lichessUsername != null
          ? String(r.lichessUsername)
          : undefined,
    roleId: r.role_id != null ? String(r.role_id) : r.roleId != null ? String(r.roleId) : undefined,
  };
}

function dbToClub(row: Record<string, unknown>): Club {
  const r = row as any;
  const activeDaysRaw = r.active_days ?? r.activeDays;
  const activeDays = Array.isArray(activeDaysRaw) && activeDaysRaw.length === 7
    ? activeDaysRaw.map((v: unknown) => !!v)
    : [true, true, true, true, false, false, false];
  const leaderboardRaw = r.leaderboard_points ?? r.leaderboardPoints;
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    address: r.address != null ? String(r.address) : undefined,
    activeDays,
    loginPassword: r.login_password != null ? String(r.login_password) : r.loginPassword != null ? String(r.loginPassword) : undefined,
    loginUsername:
      r.login_username != null
        ? String(r.login_username)
        : r.loginUsername != null
          ? String(r.loginUsername)
          : undefined,
    roleId: r.role_id != null ? String(r.role_id) : r.roleId != null ? String(r.roleId) : undefined,
    leaderboardPoints:
      leaderboardRaw && typeof leaderboardRaw === 'object'
        ? normalizeLeaderboardPointSettings(leaderboardRaw as Club['leaderboardPoints'])
        : undefined,
  };
}

const DEFAULT_INVENTORY: InventoryItem[] = [
  { id: 'inv1', name: 'Satranç Takımı (Profesyonel)', category: 'Malzeme', stock: 45, unit: 'Adet', status: 'Yeterli', minStock: 10 },
  { id: 'inv2', name: 'Satranç Saati (DGT 2010)', category: 'Elektronik', stock: 12, unit: 'Adet', status: 'Kritik', minStock: 15 },
  { id: 'inv3', name: 'Eğitim Kitabı - Seviye 1', category: 'Kitap', stock: 120, unit: 'Adet', status: 'Yeterli', minStock: 20 },
  { id: 'inv4', name: 'Madalya (Altın)', category: 'Ödül', stock: 5, unit: 'Adet', status: 'Azalıyor', minStock: 5 },
];

const DEFAULT_GALLERY: GalleryItem[] = [
  { id: 'gal1', url: 'https://picsum.photos/seed/chess1/800/600', title: 'Turnuva Hazırlığı', group: 'Alt Yapı A', date: '20.09.2025' },
  { id: 'gal2', url: 'https://picsum.photos/seed/chess2/800/600', title: 'Grup Çalışması', group: 'Gelişim A', date: '21.09.2025' },
  { id: 'gal3', url: 'https://picsum.photos/seed/chess3/800/600', title: 'Madalya Töreni', group: 'Alt Yapı A', date: '22.09.2025' },
  { id: 'gal4', url: 'https://picsum.photos/seed/chess4/800/600', title: 'Analiz Saati', group: 'Gelişim B', date: '23.09.2025' },
  { id: 'gal5', url: 'https://picsum.photos/seed/chess5/800/600', title: 'Hafta Sonu Kampı', group: 'Alt Yapı B', date: '24.09.2025' },
  { id: 'gal6', url: 'https://picsum.photos/seed/chess6/800/600', title: 'Simültane Gösteri', group: 'Hepsi', date: '25.09.2025' },
];

function loadStudents(): Student[] {
  const savedVersion = parseInt(localStorage.getItem('netchess_data_version') || '0', 10);
  if (savedVersion < MOCK_DATA_VERSION) {
    localStorage.removeItem('netchess_students');
    localStorage.setItem('netchess_data_version', String(MOCK_DATA_VERSION));
    return MOCK_STUDENTS as Student[];
  }
  return loadJSON<Student[]>('netchess_students', MOCK_STUDENTS as Student[]);
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const useSupabase = isSupabaseBackend();
  const [students, setStudents] = useState<Student[]>(() =>
    useSupabase ? [] : applyLessonLogsToStudents(loadStudents())
  );
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    useSupabase ? [] : loadJSON<Transaction[]>('netchess_transactions', [])
  );
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() =>
    useSupabase ? [] : loadJSON<AttendanceRecord[]>('netchess_attendance', [])
  );
  const DEFAULT_LESSONS: Lesson[] = [
    { id: 'les1', day: 'Pazartesi', startTime: '14:00', endTime: '15:00', group: 'Alt Yapı A', topic: 'Merkez Kontrolü' },
    { id: 'les2', day: 'Pazartesi', startTime: '16:00', endTime: '17:00', group: 'Gelişim B', topic: 'Kale Finalleri' },
    { id: 'les3', day: 'Çarşamba', startTime: '14:00', endTime: '15:00', group: 'Alt Yapı B', topic: 'Taş Gelişimi' },
    { id: 'les4', day: 'Cuma', startTime: '15:30', endTime: '16:30', group: 'Gelişim A', topic: 'Açılış Taktikleri' },
  ];
  const [lessons, setLessons] = useState<Lesson[]>(() =>
    useSupabase ? [] : loadJSON<Lesson[]>('netchess_lessons', DEFAULT_LESSONS)
  );
  const [puzzles, setPuzzles] = useState<Puzzle[]>(() => loadJSON<Puzzle[]>('netchess_puzzles', []));
  const [homeworks, setHomeworks] = useState<HomeworkAssignment[]>(() =>
    useSupabase ? [] : loadJSON<HomeworkAssignment[]>('netchess_homeworks', [])
  );
  const [homeworkAttempts, setHomeworkAttempts] = useState<HomeworkPuzzleAttempt[]>(() =>
    useSupabase ? [] : loadJSON<HomeworkPuzzleAttempt[]>('netchess_homework_attempts', [])
  );
  const [homeworkSubmissions, setHomeworkSubmissions] = useState<HomeworkSubmission[]>(() =>
    useSupabase ? [] : loadJSON<HomeworkSubmission[]>('netchess_homework_submissions', [])
  );
  const [inventory, setInventory] = useState<InventoryItem[]>(() =>
    useSupabase ? [] : loadJSON<InventoryItem[]>('netchess_inventory', DEFAULT_INVENTORY)
  );
  const [gallery, setGallery] = useState<GalleryItem[]>(() =>
    useSupabase ? [] : loadJSON<GalleryItem[]>('netchess_gallery', DEFAULT_GALLERY)
  );

  const DEFAULT_BRANCH_OFFICES = ['Merkez', 'Çayyolu', 'Ümitköy'];
  const DEFAULT_DISCIPLINES = ['Satranç', 'Robotik', 'Kodlama'];
  const DEFAULT_GROUPS = ['Alt Yapı A', 'Alt Yapı B', 'Gelişim A', 'Gelişim B', 'Turnuva', 'Yetişkin'];

  const loadBranchOfficeRecordsFromLocal = (): BranchOfficeRecord[] => {
    try {
      const raw = localStorage.getItem('netchess_branch_offices');
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (typeof parsed[0] === 'string') {
            return (parsed as string[]).map((name) => ({ id: genId(), name }));
          }
          if (typeof parsed[0] === 'object' && parsed[0] && 'name' in (parsed[0] as object)) {
            return parsed as BranchOfficeRecord[];
          }
        }
      }
    } catch { /* yerel yedek */ }
    return DEFAULT_BRANCH_OFFICES.map((name) => ({ id: genId(), name }));
  };

  const [branchOfficeRecords, setBranchOfficeRecords] = useState<BranchOfficeRecord[]>(() =>
    useSupabase ? [] : loadBranchOfficeRecordsFromLocal(),
  );
  const [disciplines, setDisciplines] = useState<string[]>(() =>
    useSupabase ? DEFAULT_DISCIPLINES : loadJSON<string[]>('netchess_disciplines', DEFAULT_DISCIPLINES)
  );
  const [groups, setGroups] = useState<string[]>(() =>
    useSupabase ? [] : loadJSON<string[]>('netchess_groups', DEFAULT_GROUPS),
  );

  const [disciplineBranches, setDisciplineBranches] = useState<DisciplineBranch[]>(() =>
    useSupabase ? [] : loadJSON<DisciplineBranch[]>('netchess_discipline_branches', []),
  );
  const [trainingGroups, setTrainingGroups] = useState<TrainingGroup[]>(() =>
    useSupabase ? [] : loadJSON<TrainingGroup[]>('netchess_training_groups', []),
  );
  const [groupLessonLogs, setGroupLessonLogs] = useState<Record<string, StudentLessonLogEntry[]>>(() =>
    loadGroupLessonLogsMap()
  );

  const DEFAULT_CLUBS: Club[] = [
    {
      id: 'club1',
      name: 'Sistem Satranç',
      address: '',
      activeDays: [true, true, true, true, false, false, false],
      loginUsername: 'sistem-satranc',
    },
  ];
  const [clubs, setClubs] = useState<Club[]>(() =>
    useSupabase ? DEFAULT_CLUBS : loadJSON<Club[]>('netchess_clubs', DEFAULT_CLUBS)
  );

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(() =>
    useSupabase ? [] : loadJSON<ActivityLog[]>('netchess_activity_logs', [])
  );

  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>(() =>
    useSupabase ? [] : loadJSON<ScheduleEntry[]>('netchess_schedule_entries', [])
  );

  const [coaches, setCoaches] = useState<Coach[]>(() =>
    useSupabase ? [] : loadJSON<Coach[]>('netchess_coaches', [])
  );

  const [performanceAnalyses, setPerformanceAnalyses] = useState<PerformanceAnalysis[]>(() =>
    useSupabase ? [] : loadJSON<PerformanceAnalysis[]>('netchess_performance_analyses', [])
  );
  const [coachAiReports, setCoachAiReports] = useState<CoachAiReport[]>(() =>
    loadJSON<CoachAiReport[]>('netchess_coach_ai_reports', [])
  );
  const [tournaments, setTournaments] = useState<Tournament[]>(() =>
    loadJSON<Tournament[]>('netchess_tournaments', [])
  );

  const [appRoles, setAppRoles] = useState<AppRole[]>(() => loadRolesLocal());
  const [rolePermissionMap, setRolePermissionMap] = useState<Record<string, string[]>>(() =>
    loadRolePermissionsLocal(),
  );
  const [rolesLoaded, setRolesLoaded] = useState(() => !useSupabase);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialogRequest, setDialogRequest] = useState<DialogRequest | null>(null);
  const dialogQueueRef = useRef<DialogRequest[]>([]);
  const dialogActiveRef = useRef(false);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = genId();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const pumpDialogQueue = useCallback(() => {
    if (dialogActiveRef.current) return;
    const next = dialogQueueRef.current.shift();
    if (!next) return;
    dialogActiveRef.current = true;
    setDialogRequest(next);
  }, []);

  const closeDialog = useCallback(() => {
    dialogActiveRef.current = false;
    setDialogRequest(null);
    window.setTimeout(() => pumpDialogQueue(), 0);
  }, [pumpDialogQueue]);

  const enqueueDialog = useCallback((req: DialogRequest) => {
    dialogQueueRef.current.push(req);
    pumpDialogQueue();
  }, [pumpDialogQueue]);

  const confirmDialog = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      enqueueDialog({ kind: 'confirm', ...options, resolve });
    });
  }, [enqueueDialog]);

  const alertDialog = useCallback((options: AlertDialogOptions): Promise<void> => {
    return new Promise((resolve) => {
      enqueueDialog({ kind: 'alert', ...options, resolve });
    });
  }, [enqueueDialog]);

  const [auth, setAuth] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as AuthUser;
      if (data.role === 'admin') return data;
      if (data.role === 'coach') return data;
      if (data.role === 'club' && typeof (data as { branch?: string }).branch === 'string') return data;
      if ((data.role === 'parent' || data.role === 'student') && typeof data.studentId === 'string') return data;
      return null;
    } catch {
      return null;
    }
  });

  const scopedStudents = useMemo(
    () => resolveScopedStudents(auth, students, trainingGroups, coaches, branchOfficeRecords, clubs),
    [auth, students, trainingGroups, coaches, branchOfficeRecords, clubs],
  );

  const scopedTransactions = useMemo(
    () => resolveScopedTransactions(auth, transactions, students, coaches),
    [auth, transactions, students, coaches],
  );

  const scopedCoaches = useMemo(
    () => resolveScopedCoaches(auth, coaches),
    [auth, coaches],
  );

  const scopedTrainingGroups = useMemo(
    () => resolveScopedTrainingGroups(auth, trainingGroups, branchOfficeRecords, clubs),
    [auth, trainingGroups, branchOfficeRecords, clubs],
  );

  const scopedDisciplineBranches = useMemo(
    () => resolveScopedDisciplineBranches(auth, disciplineBranches, branchOfficeRecords, clubs),
    [auth, disciplineBranches, branchOfficeRecords, clubs],
  );

  const scopedTournaments = useMemo(
    () => resolveScopedTournaments(auth, tournaments),
    [auth, tournaments],
  );

  const activeClubBranch = useMemo(() => resolveClubBranch(auth), [auth]);

  const branchOffices = useMemo(
    () => resolveBranchOfficeNames(branchOfficeRecords, [], auth, clubs),
    [branchOfficeRecords, auth, clubs],
  );

  const [stockfishReady, setStockfishReady] = useState(false);
  const [stockfishLoading, setStockfishLoading] = useState(false);

  useEffect(() => {
    const checkEngine = async () => {
      const { isStockfishReady, isStockfishLoading, initStockfish } = await import('./services/stockfishService');
      if (isStockfishReady()) {
        setStockfishReady(true);
        setStockfishLoading(false);
        return;
      }
      if (isStockfishLoading()) {
        setStockfishLoading(true);
        return;
      }
      setStockfishLoading(true);
      const ok = await initStockfish();
      setStockfishReady(ok);
      setStockfishLoading(false);
    };
    checkEngine();
    const interval = setInterval(() => {
      import('./services/stockfishService').then(m => {
        setStockfishReady(m.isStockfishReady());
        setStockfishLoading(m.isStockfishLoading());
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (auth) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  }, [auth]);

  const loginAdmin = useCallback((password: string): boolean => {
    if (password !== ADMIN_PASSWORD) return false;
    setAuth({ role: 'admin' });
    return true;
  }, []);

  const loginCoach = useCallback((identifier: string, password: string): boolean => {
    const idRaw = identifier.trim();
    const idLower = idRaw.toLowerCase();
    const idDigits = idRaw.replace(/\D/g, '');
    const pwd = password.trim();
    if (!pwd) return false;

    const coach = coaches.find((c) => {
      const email = (c.email || '').trim().toLowerCase();
      const phone = (c.phone || '').replace(/\D/g, '');
      const name = (c.name || '').trim().toLowerCase();
      const matchesId =
        (idLower && email === idLower) ||
        (idLower && name === idLower) ||
        (idDigits.length >= 4 && phone === idDigits) ||
        (idDigits.length >= 4 && phone.endsWith(idDigits));
      if (!matchesId) return false;
      const expected = (c.password && c.password.trim()) ? c.password.trim() : COACH_PASSWORD;
      return pwd === expected;
    });

    if (coach) {
      setAuth({
        role: 'coach',
        coachId: coach.id,
        branch: coach.branch || 'Merkez',
        roleId: coach.roleId,
      });
      return true;
    }

    // Geriye dönük: tanımlayıcı boş veya eşleşme yoksa eski ortak parola
    if (!idRaw && pwd === COACH_PASSWORD) {
      setAuth({ role: 'coach', branch: 'Merkez' });
      return true;
    }
    if (pwd === COACH_PASSWORD && coaches.length === 0) {
      setAuth({ role: 'coach', branch: 'Merkez' });
      return true;
    }

    return false;
  }, [coaches]);

  const loginClub = useCallback(async (username: string, password: string): Promise<boolean> => {
    const idRaw = username.trim();
    const pwd = password.trim();
    if (!idRaw || !pwd) return false;

    const attempt = (list: Club[]): boolean => {
      const club = findClubForLogin(list, idRaw);
      if (!club) return false;
      const expectedPassword =
        club.loginPassword != null && club.loginPassword !== '' ? club.loginPassword : CLUB_PASSWORD;
      if (pwd !== expectedPassword) return false;
      setAuth({ role: 'club', branch: (club.name || 'Merkez').trim(), clubId: club.id, roleId: club.roleId });
      return true;
    };

    if (attempt(clubs)) return true;

    if (useSupabase && supabase) {
      try {
        const { data, error } = await supabase.from('clubs').select('*');
        if (!error && data?.length) {
          const loaded = (data as Record<string, unknown>[]).map(dbToClub);
          setClubs(loaded);
          if (attempt(loaded)) return true;
        }
      } catch {
        /* yedek: yerel liste ile devam */
      }
    }

    return false;
  }, [clubs, useSupabase]);

  const loginParent = useCallback(async (studentIdOrPhone: string, pin: string): Promise<boolean> => {
    const trimmedPin = pin.trim();
    if (!studentIdOrPhone.trim() || !trimmedPin) return false;

    const attempt = (list: Student[]): boolean => {
      const student = findStudentForLogin(list, studentIdOrPhone);
      if (!student) return false;
      if (student.parentPin && student.parentPin === trimmedPin) {
        setAuth({ role: 'parent', studentId: student.id });
        return true;
      }
      const last4 = trimmedPin.replace(/\D/g, '').slice(-4);
      if (last4.length < 4) return false;
      const phones = [
        student.parentPhone,
        student.fatherPhone,
        student.motherPhone,
        ...(student.contactNumbers ?? []),
      ].filter(Boolean) as string[];
      const hasMatch = phones.some((tel) => {
        const digits = tel.replace(/\D/g, '');
        return digits.length >= 4 && digits.slice(-4) === last4;
      });
      if (!hasMatch) return false;
      setAuth({ role: 'parent', studentId: student.id });
      return true;
    };

    const applyApiLogin = (apiResult: { studentId: string; student: Student }) => {
      setAuth({ role: 'parent', studentId: apiResult.studentId });
      setStudents((prev) => {
        const idx = prev.findIndex((s) => s.id === apiResult.studentId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...apiResult.student };
          return next;
        }
        return [...prev, apiResult.student];
      });
      return true;
    };

    if (attempt(students)) return true;

    if (useSupabase) {
      const apiResult = await apiLocalAuthParentLogin(studentIdOrPhone, trimmedPin);
      if (apiResult) return applyApiLogin(apiResult);
    }

    const sb = getServiceSupabase();
    if (useSupabase && sb) {
      try {
        const { data, error } = await sb.from('students').select('*').neq('status', 'inactive');
        if (!error && data?.length) {
          learnStudentColumnsFromRows(data as Record<string, unknown>[]);
          const loaded = applyLessonLogsToStudents((data as Record<string, unknown>[]).map(dbToStudent));
          setStudents(loaded);
          if (attempt(loaded)) return true;
        }
      } catch {
        /* anon ile devam */
      }
    }

    if (useSupabase && supabase) {
      try {
        const { data, error } = await supabase.from('students').select('*');
        if (!error && data?.length) {
          learnStudentColumnsFromRows(data as Record<string, unknown>[]);
          const loaded = applyLessonLogsToStudents((data as Record<string, unknown>[]).map(dbToStudent));
          setStudents(loaded);
          if (attempt(loaded)) return true;
        }
      } catch {
        /* yerel liste ile devam */
      }
    }

    return false;
  }, [students, useSupabase]);

  /** Öğrenci girişi: öğrenci no, kullanıcı adı veya veli telefonu + şifre/PIN */
  const loginStudent = useCallback(async (studentIdOrPhone: string, pin: string): Promise<boolean> => {
    const idRaw = studentIdOrPhone.trim();
    const trimmedPin = pin.trim();
    if (!idRaw || !trimmedPin) return false;

    const attempt = (list: Student[]): boolean => {
      const student = findStudentForLogin(list, idRaw);
      if (!student || !verifyStudentLoginPin(student, trimmedPin)) return false;
      setAuth({ role: 'student', studentId: student.id });
      return true;
    };

    const applyApiLogin = (apiResult: { studentId: string; student: Student }) => {
      setAuth({ role: 'student', studentId: apiResult.studentId });
      setStudents((prev) => {
        const idx = prev.findIndex((s) => s.id === apiResult.studentId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...apiResult.student };
          return next;
        }
        return [...prev, apiResult.student];
      });
      return true;
    };

    if (attempt(students)) return true;

    if (useSupabase) {
      const apiResult = await apiLocalAuthParentLogin(idRaw, trimmedPin);
      if (apiResult) return applyApiLogin(apiResult);
    }

    const sb = getServiceSupabase();
    if (useSupabase && sb) {
      try {
        const { data, error } = await sb.from('students').select('*').neq('status', 'inactive');
        if (!error && data?.length) {
          learnStudentColumnsFromRows(data as Record<string, unknown>[]);
          const loaded = applyLessonLogsToStudents((data as Record<string, unknown>[]).map(dbToStudent));
          setStudents(loaded);
          if (attempt(loaded)) return true;
        }
      } catch {
        /* anon ile devam */
      }
    }

    if (useSupabase && supabase) {
      try {
        const { data, error } = await supabase.from('students').select('*');
        if (!error && data?.length) {
          learnStudentColumnsFromRows(data as Record<string, unknown>[]);
          const loaded = applyLessonLogsToStudents((data as Record<string, unknown>[]).map(dbToStudent));
          setStudents(loaded);
          if (attempt(loaded)) return true;
        }
      } catch {
        /* yerel liste ile devam */
      }
    }

    return false;
  }, [students, useSupabase]);

  const [apiStudent, setApiStudent] = useState<Student | null>(() => {
    try {
      const raw = localStorage.getItem('netchess_api_student');
      return raw ? (JSON.parse(raw) as Student) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (apiStudent) localStorage.setItem('netchess_api_student', JSON.stringify(apiStudent));
    else try { localStorage.removeItem('netchess_api_student'); } catch { /* ignore */ }
  }, [apiStudent]);

  const setAuthWithStudent = useCallback((newAuth: AuthUser | null, student: Student | null) => {
    setAuth(newAuth);
    setApiStudent(student);
  }, []);

  const logout = useCallback(() => {
    setAuth(null);
    setApiStudent(null);
  }, []);

  const hydrated = useRef(false);

  const refreshRoles = useCallback(async () => {
    if (useSupabase) {
      await seedSystemRolesIfEmpty();
      const remote = await fetchRolesFromSupabase();
      if (remote) {
        setAppRoles(remote.roles);
        setRolePermissionMap(remote.permissions);
        saveRolesLocal(remote.roles);
        saveRolePermissionsLocal(remote.permissions);
        setRolesLoaded(true);
        return;
      }
      console.error('[roles] Supabase yükleme başarısız');
      setRolesLoaded(true);
      return;
    }
    setAppRoles(loadRolesLocal());
    setRolePermissionMap(loadRolePermissionsLocal());
    setRolesLoaded(true);
  }, [useSupabase]);

  useEffect(() => {
    void refreshRoles();
    const onRoles = () => void refreshRoles();
    window.addEventListener(ROLES_UPDATED_EVENT, onRoles);
    return () => window.removeEventListener(ROLES_UPDATED_EVENT, onRoles);
  }, [refreshRoles]);

  useEffect(() => {
    if (auth) void refreshRoles();
  }, [auth?.role, auth?.coachId, auth?.clubId, refreshRoles]);

  useEffect(() => {
    if (!hydrated.current || useSupabase) return;
    saveRolesLocal(appRoles);
    saveRolePermissionsLocal(rolePermissionMap);
  }, [appRoles, rolePermissionMap, useSupabase]);

  const createAppRole = useCallback(
    (input: Omit<AppRole, 'id' | 'createdAt' | 'slug'> & { slug?: string }): AppRole => {
      const baseSlug = slugifyRoleName(input.slug ?? input.name) || 'rol';
      let slug = baseSlug;
      let n = 1;
      while (appRoles.some((r) => r.slug === slug)) {
        slug = `${baseSlug}-${n++}`;
      }
      const role: AppRole = {
        id: generateRoleId(),
        slug,
        name: input.name.trim(),
        panel: input.panel,
        description: input.description?.trim() || undefined,
        color: input.color,
        isSystem: false,
        createdAt: new Date().toISOString(),
      };
      setAppRoles((prev) => [...prev, role]);
      const defaultPerms = defaultPermissionsForRole(input.panel === 'parent' ? 'parent' : input.panel);
      setRolePermissionMap((prev) => ({ ...prev, [role.id]: defaultPerms }));
      if (useSupabase) {
        void persistRoleToSupabase(role);
        void persistRolePermissionsToSupabase(role.id, defaultPerms);
      }
      return role;
    },
    [appRoles, useSupabase],
  );

  const updateAppRole = useCallback(
    (id: string, patch: Partial<AppRole>) => {
      setAppRoles((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
        const updated = next.find((r) => r.id === id);
        if (updated && useSupabase) void persistRoleToSupabase(updated);
        return next;
      });
    },
    [useSupabase],
  );

  const deleteAppRole = useCallback(
    (id: string) => {
      const role = appRoles.find((r) => r.id === id);
      if (!role || role.isSystem) return;
      setAppRoles((prev) => prev.filter((r) => r.id !== id));
      setRolePermissionMap((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setCoaches((prev) => prev.map((c) => (c.roleId === id ? { ...c, roleId: undefined } : c)));
      setClubs((prev) => prev.map((c) => (c.roleId === id ? { ...c, roleId: undefined } : c)));
      if (useSupabase) void deleteRoleFromSupabase(id);
    },
    [appRoles, useSupabase],
  );

  const setRolePermissions = useCallback(
    async (roleId: string, permKeys: string[]) => {
      const unique = [...new Set(permKeys)];

      if (useSupabase) {
        const result = await persistRolePermissionsToSupabase(roleId, unique);
        if (!result.ok) {
          showToast(
            result.error
              ? `İzinler kaydedilemedi: ${result.error}`
              : 'İzinler kaydedilemedi. Supabase yazma izni kontrol edin.',
            'error',
          );
          return false;
        }
      } else {
        saveRolePermissionsLocal({ ...rolePermissionMap, [roleId]: unique });
      }

      setRolePermissionMap((prev) => ({ ...prev, [roleId]: unique }));
      window.dispatchEvent(new Event(ROLES_UPDATED_EVENT));
      return true;
    },
    [useSupabase, rolePermissionMap, showToast],
  );

  const getAuthPermissions = useCallback((): Set<string> => {
    if (!auth) return new Set();
    const customRoleId = resolveCustomRoleIdForAuth(auth, { coaches, clubs });
    return getPermissionsForAuth(auth, rolePermissionMap, customRoleId, rolesLoaded);
  }, [auth, coaches, clubs, rolePermissionMap, rolesLoaded]);

  const authPermissions = useMemo(() => getAuthPermissions(), [getAuthPermissions]);

  const hasAuthPermission = useCallback(
    (key: string) => {
      if (!auth) return false;
      const customRoleId = resolveCustomRoleIdForAuth(auth, { coaches, clubs });
      return checkPermission(auth, rolePermissionMap, key, customRoleId, rolesLoaded);
    },
    [auth, coaches, clubs, rolePermissionMap, rolesLoaded],
  );

  const [initialDataLoaded, setInitialDataLoaded] = useState(() => !isSupabaseBackend());

  useEffect(() => {
    hydrated.current = true;
    if (!useSupabase) {
      setInitialDataLoaded(true);
      return;
    }
    const loadFromSupabase = async () => {
      // Reads should work with anon client; service role is only required for unrestricted writes.
      const sb = supabase;
      try {

        const [
          hwRes, attRes, subRes, puzRes,
          stuRes, transRes, lessRes, attenRes,
          invRes, galRes, actRes, schedRes, coachRes,
          perfRes, tourRes, clubsRes,
          officesRes, discBranchesRes, trainGroupsRes,
        ] = await Promise.all([
          sb.from('homeworks').select('*'),
          sb.from('homework_attempts').select('*'),
          sb.from('homework_submissions').select('*'),
          sb.from('puzzles').select('*'),
          sb.from('students').select('*'),
          sb.from('transactions').select('*'),
          sb.from('lessons').select('*'),
          sb.from('attendance_records').select('*'),
          sb.from('inventory').select('*'),
          sb.from('gallery').select('*'),
          sb.from('activity_logs').select('*'),
          sb.from('schedule_entries').select('*'),
          sb.from('coaches').select('*'),
          sb.from('performance_analyses').select('*'),
          sb.from('tournaments').select('*'),
          sb.from('clubs').select('*'),
          sb.from('branch_offices').select('*'),
          sb.from('discipline_branches').select('*'),
          sb.from('training_groups').select('*'),
        ]);

        if (hwRes.data) setHomeworks((hwRes.data as Record<string, unknown>[]).map(dbToHomework));
        if (attRes.data) {
          const rawRows = attRes.data as Record<string, unknown>[];
          if (rawRows[0]) {
            setCachedHomeworkAttemptPayloadStyle(detectHomeworkAttemptPayloadStyle(rawRows[0]));
          }
          setHomeworkAttempts(
            mergeHomeworkAttemptsFromStorage(rawRows.map(dbToHomeworkAttempt)),
          );
        }
        if (subRes.data) setHomeworkSubmissions((subRes.data as Record<string, unknown>[]).map(dbToSubmission));
        if (puzRes.error) {
          console.error('[Supabase] loadFromSupabase puzzles HATA:', puzRes.error.message, puzRes.error.code, puzRes.error.details);
        }
        if (puzRes.data) {
          const fromSupabase = (puzRes.data as Record<string, unknown>[]).map(dbToPuzzle);
          // If Supabase returns an empty list, don't wipe the local fallback list.
          if (fromSupabase.length > 0) {
            setPuzzles(fromSupabase);
          }
          console.log('[Supabase] loadFromSupabase puzzles yüklendi:', fromSupabase.length);
        } else if (!puzRes.error) {
          console.log('[Supabase] loadFromSupabase puzzles boş.');
        }
        if (stuRes.data) {
          const stuRows = stuRes.data as Record<string, unknown>[];
          learnStudentColumnsFromRows(stuRows);
          setStudents(applyLessonLogsToStudents(stuRows.map(dbToStudent)));
        }
        if (transRes.data) setTransactions((transRes.data as Record<string, unknown>[]).map(dbToTransaction));
        if (lessRes.data) setLessons((lessRes.data as Record<string, unknown>[]).map(dbToLesson));
        if (attenRes.data) setAttendanceRecords((attenRes.data as Record<string, unknown>[]).map(dbToAttendanceRecord));
        if (invRes.data) setInventory(invRes.data as InventoryItem[]);
        if (galRes.data) setGallery((galRes.data as Record<string, unknown>[]).map(dbToGalleryItem));
        if (actRes.data) setActivityLogs(actRes.data as ActivityLog[]);
        if (schedRes.data) setScheduleEntries((schedRes.data as Record<string, unknown>[]).map(dbToScheduleEntry));
        if (coachRes.data) setCoaches((coachRes.data as Record<string, unknown>[]).map(dbToCoach));
        if (perfRes.data) setPerformanceAnalyses((perfRes.data as Record<string, unknown>[]).map(dbToPerformanceAnalysis));
        if (tourRes.data) setTournaments((tourRes.data as Record<string, unknown>[]).map(dbToTournament));
        const loadedClubs = clubsRes.data
          ? (clubsRes.data as Record<string, unknown>[]).map(dbToClub)
          : [];
        if (clubsRes.data) setClubs(loadedClubs);

        const officeRows = officesRes.error
          ? []
          : ((officesRes.data as Record<string, unknown>[] | null) ?? []).map(dbToBranchOffice);

        const rawBranches = !discBranchesRes.error && discBranchesRes.data
          ? (discBranchesRes.data as Record<string, unknown>[]).map(dbToDisciplineBranch)
          : [];

        const rawGroups = !trainGroupsRes.error && trainGroupsRes.data
          ? (trainGroupsRes.data as Record<string, unknown>[]).map(dbToTrainingGroup)
          : [];

        const synced = syncOrgStructureWithOffices(
          officeRows,
          rawBranches,
          rawGroups,
          loadedClubs,
          genId,
        );

        setBranchOfficeRecords(synced.offices);
        setDisciplineBranches(synced.branches);
        setTrainingGroups(synced.groups);

        const sbWrite = getServiceSupabase();
        if (sbWrite && (
          synced.officesToUpsert.length > 0 ||
          synced.branchesToUpsert.length > 0 ||
          synced.groupsToUpsert.length > 0
        )) {
          for (const o of synced.officesToUpsert) {
            void sbWrite.from('branch_offices').upsert(branchOfficeToDb(o));
          }
          for (const b of synced.branchesToUpsert) {
            void sbWrite.from('discipline_branches').upsert(
              disciplineBranchToDb(b, b.clubId ?? clubIdForOrgRecord(b.branchOffice, null, loadedClubs)),
            );
          }
          for (const g of synced.groupsToUpsert) {
            void sbWrite.from('training_groups').upsert(
              trainingGroupToDb(g, g.clubId ?? clubIdForOrgRecord(g.branchOffice, null, loadedClubs)),
            );
          }
        }

        try {
          const { data: coachReportData } = await sb.from('coach_ai_reports').select('*');
          if (coachReportData?.length) {
            setCoachAiReports((coachReportData as Record<string, unknown>[]).map(dbToCoachAiReport));
          }
        } catch {
          /* tablo yoksa yerel liste kullanılır */
        }

        try {
          const gllClient = getServiceSupabase() ?? sb;
          const fromDb = await loadGroupLessonLogsFromSupabase(gllClient);
          const merged = applyGroupLessonLogsMerge(fromDb);
          setGroupLessonLogs(merged);
          const gllWrite = getServiceSupabase();
          if (gllWrite) void migrateLocalGroupLessonLogsToSupabase(gllWrite, merged);
        } catch {
          /* yerel yedek */
        }

      } catch (e) {
        console.error('[Supabase] loadFromSupabase exception:', e);
      } finally {
        setInitialDataLoaded(true);
      }
    };
    loadFromSupabase();
  }, [useSupabase]);

  /** Eski kulüp oturumlarında clubId / roleId eksikse tamamla */
  useEffect(() => {
    if (auth?.role !== 'club' || !auth.branch || clubs.length === 0) return;
    const club =
      (auth.clubId ? clubs.find((c) => c.id === auth.clubId) : undefined) ??
      clubs.find((c) => normalizeClubKey(c.name) === normalizeClubKey(auth.branch));
    if (!club) return;
    const needsClubId = !auth.clubId;
    const needsRoleId = club.roleId && auth.roleId !== club.roleId;
    if (needsClubId || needsRoleId) {
      setAuth({
        ...auth,
        clubId: auth.clubId ?? club.id,
        roleId: club.roleId ?? auth.roleId,
      });
    }
  }, [auth, clubs]);

  /** Antrenör oturumunda roleId eksikse tamamla */
  useEffect(() => {
    if (auth?.role !== 'coach' || coaches.length === 0) return;
    const coach =
      (auth.coachId ? coaches.find((c) => c.id === auth.coachId) : undefined) ??
      (auth.branch ? coaches.find((c) => (c.branch || '').trim() === auth.branch.trim()) : undefined);
    if (!coach?.roleId || auth.roleId === coach.roleId) return;
    setAuth({ ...auth, coachId: auth.coachId ?? coach.id, roleId: coach.roleId });
  }, [auth, coaches]);

  /** Branş–grup tanımları değişince eski disciplines/groups listelerini güncelle */
  useEffect(() => {
    if (disciplineBranches.length > 0) {
      const names = [...new Set(disciplineBranches.map((b) => b.name.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'tr'),
      );
      setDisciplines(names);
    }
  }, [disciplineBranches]);

  useEffect(() => {
    const names = [...new Set(trainingGroups.map((g) => g.name.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'tr'),
    );
    setGroups(names);
  }, [trainingGroups]);

  const refreshStudentsFromSupabase = useCallback(async () => {
    if (!useSupabase) return;
    const sb = getServiceSupabase();
    if (!sb) return;
    try {
      const { data, error } = await sb.from('students').select('*');
      if (error) {
        console.warn('[App] refreshStudentsFromSupabase:', error.message);
        return;
      }
      if (data && Array.isArray(data)) {
        const stuRows = data as Record<string, unknown>[];
        learnStudentColumnsFromRows(stuRows);
        setStudents(applyLessonLogsToStudents(stuRows.map(dbToStudent)));
      }
    } catch (e) {
      console.warn('[App] refreshStudentsFromSupabase failed', e);
    }
  }, [useSupabase]);

  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_students', JSON.stringify(students));
  }, [students, useSupabase]);

  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_transactions', JSON.stringify(transactions));
  }, [transactions, useSupabase]);
  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_attendance', JSON.stringify(attendanceRecords));
  }, [attendanceRecords, useSupabase]);

  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_lessons', JSON.stringify(lessons));
  }, [lessons, useSupabase]);

  useEffect(() => {
    // Always persist puzzles locally as a fallback. Supabase inserts can fail silently
    // in some setups (RLS / missing service key), and we don't want imports to disappear on refresh.
    if (!hydrated.current) return;
    try {
      localStorage.setItem('netchess_puzzles', JSON.stringify(puzzles));
    } catch (e) {
      console.warn('[App] Failed to persist netchess_puzzles to localStorage:', e);
    }
  }, [puzzles, useSupabase]);

  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_homeworks', JSON.stringify(homeworks));
  }, [homeworks, useSupabase]);
  useEffect(() => {
    if (hydrated.current) {
      try {
        localStorage.setItem('netchess_homework_attempts', JSON.stringify(homeworkAttempts));
      } catch { /* ignore */ }
    }
  }, [homeworkAttempts]);
  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_homework_submissions', JSON.stringify(homeworkSubmissions));
  }, [homeworkSubmissions, useSupabase]);
  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_inventory', JSON.stringify(inventory));
  }, [inventory, useSupabase]);
  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_gallery', JSON.stringify(gallery));
  }, [gallery, useSupabase]);
  useEffect(() => {
    if (hydrated.current && !useSupabase) {
      localStorage.setItem('netchess_branch_offices', JSON.stringify(branchOfficeRecords));
    }
  }, [branchOfficeRecords, useSupabase]);
  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_clubs', JSON.stringify(clubs));
  }, [clubs, useSupabase]);
  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_disciplines', JSON.stringify(disciplines));
  }, [disciplines, useSupabase]);
  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_groups', JSON.stringify(groups));
  }, [groups, useSupabase]);
  useEffect(() => {
    if (hydrated.current && !useSupabase) {
      localStorage.setItem('netchess_discipline_branches', JSON.stringify(disciplineBranches));
    }
  }, [disciplineBranches, useSupabase]);
  useEffect(() => {
    if (hydrated.current && !useSupabase) {
      localStorage.setItem('netchess_training_groups', JSON.stringify(trainingGroups));
    }
  }, [trainingGroups, useSupabase]);
  useEffect(() => {
    if (hydrated.current) {
      try {
        localStorage.setItem(GROUP_LESSON_LOG_STORAGE_KEY, JSON.stringify(groupLessonLogs));
      } catch { /* quota */ }
    }
  }, [groupLessonLogs]);
  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_activity_logs', JSON.stringify(activityLogs));
  }, [activityLogs, useSupabase]);
  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_schedule_entries', JSON.stringify(scheduleEntries));
  }, [scheduleEntries, useSupabase]);

  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_coaches', JSON.stringify(coaches));
  }, [coaches, useSupabase]);
  useEffect(() => {
    if (hydrated.current && !useSupabase) localStorage.setItem('netchess_performance_analyses', JSON.stringify(performanceAnalyses));
  }, [performanceAnalyses, useSupabase]);
  useEffect(() => {
    if (hydrated.current) localStorage.setItem('netchess_coach_ai_reports', JSON.stringify(coachAiReports));
  }, [coachAiReports]);
  useEffect(() => {
    if (hydrated.current) localStorage.setItem('netchess_tournaments', JSON.stringify(tournaments));
  }, [tournaments]);

  useEffect(() => {
    if (useSupabase) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'netchess_schedule_entries' && e.newValue) {
        try {
          const next = JSON.parse(e.newValue) as ScheduleEntry[];
          if (Array.isArray(next)) setScheduleEntries(next);
        } catch { /* ignore */ }
      }
      if (e.key === 'netchess_homeworks' && e.newValue) {
        try {
          const next = JSON.parse(e.newValue) as HomeworkAssignment[];
          if (Array.isArray(next)) setHomeworks(next);
        } catch { /* ignore */ }
      }
      if (e.key === 'netchess_puzzles' && e.newValue) {
        try {
          const next = JSON.parse(e.newValue) as Puzzle[];
          if (Array.isArray(next)) setPuzzles(next);
        } catch { /* ignore */ }
      }
      if (e.key === 'netchess_homework_attempts' && e.newValue) {
        try {
          const next = JSON.parse(e.newValue) as HomeworkPuzzleAttempt[];
          if (Array.isArray(next)) setHomeworkAttempts(next);
        } catch { /* ignore */ }
      }
      if (e.key === 'netchess_homework_submissions' && e.newValue) {
        try {
          const next = JSON.parse(e.newValue) as HomeworkSubmission[];
          if (Array.isArray(next)) setHomeworkSubmissions(next);
        } catch { /* ignore */ }
      }
      if (e.key === 'netchess_coach_ai_reports' && e.newValue) {
        try {
          const next = JSON.parse(e.newValue) as CoachAiReport[];
          if (Array.isArray(next)) setCoachAiReports(next);
        } catch { /* ignore */ }
      }
    };
    const reloadFromStorage = () => {
      try {
        const rawSchedule = localStorage.getItem('netchess_schedule_entries');
        if (rawSchedule) {
          const next = JSON.parse(rawSchedule) as ScheduleEntry[];
          if (Array.isArray(next)) setScheduleEntries(next);
        }
        const rawHw = localStorage.getItem('netchess_homeworks');
        if (rawHw) {
          const next = JSON.parse(rawHw) as HomeworkAssignment[];
          if (Array.isArray(next)) setHomeworks(next);
        }
        const rawPuzzles = localStorage.getItem('netchess_puzzles');
        if (rawPuzzles) {
          const next = JSON.parse(rawPuzzles) as Puzzle[];
          if (Array.isArray(next)) setPuzzles(next);
        }
        const rawAttempts = localStorage.getItem('netchess_homework_attempts');
        if (rawAttempts) {
          const next = JSON.parse(rawAttempts) as HomeworkPuzzleAttempt[];
          if (Array.isArray(next)) setHomeworkAttempts(next);
        }
        const rawSubs = localStorage.getItem('netchess_homework_submissions');
        if (rawSubs) {
          const next = JSON.parse(rawSubs) as HomeworkSubmission[];
          if (Array.isArray(next)) setHomeworkSubmissions(next);
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', reloadFromStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', reloadFromStorage);
    };
  }, [useSupabase]);

  const refreshFromStorage = useCallback(async () => {
    try {
      if (useSupabase) {
        const sb = getServiceSupabase();
        if (!sb) return;
        const [
          hwRes, attRes, subRes, puzRes,
          stuRes, transRes, lessRes, attenRes,
          invRes, galRes, actRes, schedRes, coachRes,
          perfRes, tourRes, clubsRes,
          officesRes, discBranchesRes, trainGroupsRes,
        ] = await Promise.all([
          sb.from('homeworks').select('*'),
          sb.from('homework_attempts').select('*'),
          sb.from('homework_submissions').select('*'),
          sb.from('puzzles').select('*'),
          sb.from('students').select('*'),
          sb.from('transactions').select('*'),
          sb.from('lessons').select('*'),
          sb.from('attendance_records').select('*'),
          sb.from('inventory').select('*'),
          sb.from('gallery').select('*'),
          sb.from('activity_logs').select('*'),
          sb.from('schedule_entries').select('*'),
          sb.from('coaches').select('*'),
          sb.from('performance_analyses').select('*'),
          sb.from('tournaments').select('*'),
          sb.from('clubs').select('*'),
          sb.from('branch_offices').select('*'),
          sb.from('discipline_branches').select('*'),
          sb.from('training_groups').select('*'),
        ]);
        if (hwRes.data) setHomeworks((hwRes.data as Record<string, unknown>[]).map(dbToHomework));
        if (attRes.data) {
          const rawRows = attRes.data as Record<string, unknown>[];
          if (rawRows[0]) {
            setCachedHomeworkAttemptPayloadStyle(detectHomeworkAttemptPayloadStyle(rawRows[0]));
          }
          setHomeworkAttempts(
            mergeHomeworkAttemptsFromStorage(rawRows.map(dbToHomeworkAttempt)),
          );
        }
        if (subRes.data) setHomeworkSubmissions((subRes.data as Record<string, unknown>[]).map(dbToSubmission));
        if (puzRes.error) {
          console.error('[Supabase] refreshFromStorage puzzles HATA:', puzRes.error.message, puzRes.error.code, puzRes.error.details);
        }
        if (puzRes.data) {
          setPuzzles((puzRes.data as Record<string, unknown>[]).map(dbToPuzzle));
        }
        if (stuRes.data) {
          const stuRows = stuRes.data as Record<string, unknown>[];
          learnStudentColumnsFromRows(stuRows);
          setStudents(applyLessonLogsToStudents(stuRows.map(dbToStudent)));
        }
        if (transRes.data) setTransactions((transRes.data as Record<string, unknown>[]).map(dbToTransaction));
        if (lessRes.data) setLessons((lessRes.data as Record<string, unknown>[]).map(dbToLesson));
        if (attenRes.data) setAttendanceRecords((attenRes.data as Record<string, unknown>[]).map(dbToAttendanceRecord));
        if (invRes.data) setInventory(invRes.data as InventoryItem[]);
        if (galRes.data) setGallery((galRes.data as Record<string, unknown>[]).map(dbToGalleryItem));
        if (actRes.data) setActivityLogs(actRes.data as ActivityLog[]);
        if (schedRes.data) setScheduleEntries((schedRes.data as Record<string, unknown>[]).map(dbToScheduleEntry));
        if (coachRes.data) setCoaches((coachRes.data as Record<string, unknown>[]).map(dbToCoach));
        if (perfRes.data) setPerformanceAnalyses((perfRes.data as Record<string, unknown>[]).map(dbToPerformanceAnalysis));
        if (tourRes.data) setTournaments((tourRes.data as Record<string, unknown>[]).map(dbToTournament));
        if (clubsRes.data) setClubs((clubsRes.data as Record<string, unknown>[]).map(dbToClub));
        if (!officesRes.error && officesRes.data) {
          setBranchOfficeRecords((officesRes.data as Record<string, unknown>[]).map(dbToBranchOffice));
        }
        if (!discBranchesRes.error && discBranchesRes.data) {
          setDisciplineBranches((discBranchesRes.data as Record<string, unknown>[]).map(dbToDisciplineBranch));
        }
        if (!trainGroupsRes.error && trainGroupsRes.data) {
          setTrainingGroups((trainGroupsRes.data as Record<string, unknown>[]).map(dbToTrainingGroup));
        }
        try {
          const fromDb = await loadGroupLessonLogsFromSupabase(sb);
          setGroupLessonLogs(applyGroupLessonLogsMerge(fromDb));
        } catch {
          /* yerel yedek */
        }
        return;
      }
      const rawSchedule = localStorage.getItem('netchess_schedule_entries');
      if (rawSchedule) {
        const next = JSON.parse(rawSchedule) as ScheduleEntry[];
        if (Array.isArray(next)) setScheduleEntries(next);
      }
      const rawHw = localStorage.getItem('netchess_homeworks');
      if (rawHw) {
        const next = JSON.parse(rawHw) as HomeworkAssignment[];
        if (Array.isArray(next)) setHomeworks(next);
      }
      const rawPuzzles = localStorage.getItem('netchess_puzzles');
      if (rawPuzzles) {
        const next = JSON.parse(rawPuzzles) as Puzzle[];
        if (Array.isArray(next)) setPuzzles(next);
      }
      const rawAttempts = localStorage.getItem('netchess_homework_attempts');
      if (rawAttempts) {
        const next = JSON.parse(rawAttempts) as HomeworkPuzzleAttempt[];
        if (Array.isArray(next)) setHomeworkAttempts(next);
      }
      const rawSubs = localStorage.getItem('netchess_homework_submissions');
      if (rawSubs) {
        const next = JSON.parse(rawSubs) as HomeworkSubmission[];
        if (Array.isArray(next)) setHomeworkSubmissions(next);
      }
      const rawStudents = localStorage.getItem('netchess_students');
      if (rawStudents) {
        const next = JSON.parse(rawStudents) as Student[];
        if (Array.isArray(next)) setStudents(next);
      }
      const rawTransactions = localStorage.getItem('netchess_transactions');
      if (rawTransactions) {
        const next = JSON.parse(rawTransactions) as Transaction[];
        if (Array.isArray(next)) setTransactions(next);
      }
      const rawLessons = localStorage.getItem('netchess_lessons');
      if (rawLessons) {
        const next = JSON.parse(rawLessons) as Lesson[];
        if (Array.isArray(next)) setLessons(next);
      }
      const rawAttendance = localStorage.getItem('netchess_attendance');
      if (rawAttendance) {
        const next = JSON.parse(rawAttendance) as AttendanceRecord[];
        if (Array.isArray(next)) setAttendanceRecords(next);
      }
      const rawInventory = localStorage.getItem('netchess_inventory');
      if (rawInventory) {
        const next = JSON.parse(rawInventory) as InventoryItem[];
        if (Array.isArray(next)) setInventory(next);
      }
      const rawGallery = localStorage.getItem('netchess_gallery');
      if (rawGallery) {
        const next = JSON.parse(rawGallery) as GalleryItem[];
        if (Array.isArray(next)) setGallery(next);
      }
      const rawActivity = localStorage.getItem('netchess_activity_logs');
      if (rawActivity) {
        const next = JSON.parse(rawActivity) as ActivityLog[];
        if (Array.isArray(next)) setActivityLogs(next);
      }
      const rawCoaches = localStorage.getItem('netchess_coaches');
      if (rawCoaches) {
        const next = JSON.parse(rawCoaches) as Coach[];
        if (Array.isArray(next)) setCoaches(next);
      }
      const rawPerf = localStorage.getItem('netchess_performance_analyses');
      if (rawPerf) {
        const next = JSON.parse(rawPerf) as PerformanceAnalysis[];
        if (Array.isArray(next)) setPerformanceAnalyses(next);
      }
      const rawCoachReports = localStorage.getItem('netchess_coach_ai_reports');
      if (rawCoachReports) {
        const next = JSON.parse(rawCoachReports) as CoachAiReport[];
        if (Array.isArray(next)) setCoachAiReports(next);
      }
      const rawTours = localStorage.getItem('netchess_tournaments');
      if (rawTours) {
        const next = JSON.parse(rawTours) as Tournament[];
        if (Array.isArray(next)) setTournaments(next);
      }
    } catch { /* ignore */ }
  }, [useSupabase]);

  const CURRENT_USER = 'Çağrı Çankaya';
  const addScheduleEntry = useCallback(async (entry: Omit<ScheduleEntry, 'id'>) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : genId();
    const newEntry = { ...entry, id } as ScheduleEntry;
    setScheduleEntries(prev => [newEntry, ...prev]);
    const sb = getServiceSupabase();
    if (sb) try {
      const payload = scheduleEntryToDb(newEntry as unknown as Record<string, unknown>);
      const { error } = await sb.from('schedule_entries').insert(payload);
      if (error) console.error('Supabase schedule_entries insert error:', error);
    } catch (err) { console.error('Supabase schedule_entries throw error:', err); }
  }, []);
  const updateScheduleEntry = useCallback(async (id: string, entry: Partial<ScheduleEntry>) => {
    setScheduleEntries(prev => prev.map(e => e.id === id ? { ...e, ...entry } : e));
    const sb = getServiceSupabase();
    if (sb) try {
      const payload = scheduleEntryToDb({ ...entry, id } as Record<string, unknown>);
      const { error } = await sb.from('schedule_entries').update(payload).eq('id', id);
      if (error) console.error('Supabase schedule_entries update error:', error);
    } catch (err) { console.error('Supabase schedule_entries throw error:', err); }
  }, []);
  const deleteScheduleEntry = useCallback(async (id: string) => {
    setScheduleEntries(prev => prev.filter(e => e.id !== id));
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('schedule_entries').delete().eq('id', id);
      if (error) console.error('Supabase schedule_entries delete error:', error);
    } catch (err) { console.error('Supabase schedule_entries throw error:', err); }
  }, []);

  const addActivityLog = useCallback(async (entry: Omit<ActivityLog, 'id' | 'timestamp'>) => {
    const log: ActivityLog = { ...entry, id: genId(), timestamp: new Date().toISOString() };
    setActivityLogs(prev => [log, ...prev].slice(0, 500));
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('activity_logs').insert(log);
      if (error) console.error('Supabase activity_logs insert error:', error);
    } catch (err) { console.error('Supabase activity_logs throw error:', err); }
  }, []);

  const addCoach = useCallback(async (coach: Omit<Coach, 'id'>) => {
    const newCoach: Coach = { ...coach, id: genId() };
    setCoaches(prev => [...prev, newCoach]);
    addActivityLog({ user: CURRENT_USER, action: 'Antrenör Eklendi', target: coach.name, type: 'success' });
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('coaches').insert(coachToDb(newCoach));
      if (error) console.error('Supabase coaches insert error:', error);
    } catch (err) { console.error('Supabase coaches throw error:', err); }
  }, [addActivityLog]);
  const updateCoach = useCallback(async (id: string, fields: Partial<Coach>) => {
    const patch = { ...fields };
    if (patch.password === '') delete patch.password;
    setCoaches(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    const sb = getServiceSupabase();
    if (sb) try {
      const current = coaches.find((c) => c.id === id);
      const merged = current ? { ...current, ...patch } : ({ id, ...patch } as Coach);
      const { error } = await sb.from('coaches').update(coachToDb(merged)).eq('id', id);
      if (error) console.error('Supabase coaches update error:', error);
    } catch (err) { console.error('Supabase coaches throw error:', err); }
  }, [coaches]);
  const deleteCoach = useCallback(async (id: string) => {
    setCoaches(prev => {
      const found = prev.find(c => c.id === id);
      if (found) addActivityLog({ user: CURRENT_USER, action: 'Antrenör Silindi', target: found.name, type: 'warning' });
      return prev.filter(c => c.id !== id);
    });
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('coaches').delete().eq('id', id);
      if (error) console.error('Supabase coaches delete error:', error);
    } catch (err) { console.error('Supabase coaches throw error:', err); }
  }, [addActivityLog]);

  const addPerformanceAnalysis = useCallback(async (analysis: Omit<PerformanceAnalysis, 'id'>) => {
    const newAnalysis: PerformanceAnalysis = { ...analysis, id: genId() };
    setPerformanceAnalyses(prev => [newAnalysis, ...prev]);
    const sb = getServiceSupabase();
    if (sb) try {
      const payload = performanceAnalysisToDb(newAnalysis as unknown as Record<string, unknown>);
      const { error } = await sb.from('performance_analyses').insert(payload);
      if (error) console.error('Supabase performance_analyses insert error:', error);
    } catch (err) { console.error('Supabase performance_analyses insert error:', err); }
  }, []);

  const updatePerformanceAnalysis = useCallback(async (id: string, patch: Partial<PerformanceAnalysis>) => {
    setPerformanceAnalyses((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, ...patch } : a));
      const updated = next.find((a) => a.id === id);
      const sb = getServiceSupabase();
      if (sb && updated) {
        const payload = performanceAnalysisToDb(updated as unknown as Record<string, unknown>);
        sb.from('performance_analyses').update(payload).eq('id', id).then(({ error }) => {
          if (error) console.error('Supabase performance_analyses update error:', error);
        }).catch((err) => console.error('Supabase performance_analyses update error:', err));
      }
      return next;
    });
  }, []);

  const deletePerformanceAnalysis = useCallback(async (id: string) => {
    setPerformanceAnalyses((prev) => prev.filter((a) => a.id !== id));
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('performance_analyses').delete().eq('id', id);
      if (error) console.error('Supabase performance_analyses delete error:', error);
    } catch (err) { console.error('Supabase performance_analyses delete error:', err); }
  }, []);

  const addCoachAiReport = useCallback(
    (report: Omit<CoachAiReport, 'id'>) => {
      const full: CoachAiReport = { ...report, id: genId() };
      setCoachAiReports((prev) => [full, ...prev]);
      const student = students.find((s) => s.id === report.studentId);
      addActivityLog({
        user: CURRENT_USER,
        action: 'AI analiz raporu paylaşıldı',
        target: student?.name ?? report.studentId,
        type: 'success',
      });
      const sb = getServiceSupabase();
      if (sb) {
        sb.from('coach_ai_reports')
          .insert(coachAiReportToDb(full))
          .then(({ error }) => {
            if (error) console.warn('[Supabase] coach_ai_reports insert:', error.message);
          })
          .catch(() => {});
      }
    },
    [students, addActivityLog]
  );

  const deleteCoachAiReport = useCallback((id: string) => {
    setCoachAiReports((prev) => prev.filter((r) => r.id !== id));
    const sb = getServiceSupabase();
    if (sb) {
      sb.from('coach_ai_reports')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.warn('[Supabase] coach_ai_reports delete:', error.message);
        })
        .catch(() => {});
    }
  }, []);

  const addTournament = useCallback((tournament: Omit<Tournament, 'id'>) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : genId();
    const full: Tournament = { ...tournament, id };
    setTournaments((prev) => [full, ...prev]);
    addActivityLog({ user: CURRENT_USER, action: 'Turnuva Oluşturuldu', target: full.name, type: 'success' });
    const sb = getServiceSupabase();
    if (sb) {
      sb.from('tournaments').insert(tournamentToDb(full)).then(({ error }) => {
        if (error) console.error('Supabase tournaments insert error:', error);
      }).catch((err) => console.error('Supabase tournaments insert throw:', err));
    }
  }, [addActivityLog]);

  const updateTournament = useCallback((id: string, patch: Partial<Tournament>) => {
    setTournaments((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const sb = getServiceSupabase();
    if (sb) {
      const current = tournaments.find((t) => t.id === id);
      if (current) {
        const merged = { ...current, ...patch };
        sb.from('tournaments').update(tournamentToDb(merged)).eq('id', id).then(({ error }) => {
          if (error) console.error('Supabase tournaments update error:', error);
        }).catch((err) => console.error('Supabase tournaments update throw:', err));
      }
    }
  }, [tournaments]);

  const deleteTournament = useCallback((id: string) => {
    setTournaments((prev) => {
      const found = prev.find((t) => t.id === id);
      if (found) addActivityLog({ user: CURRENT_USER, action: 'Turnuva Silindi', target: found.name, type: 'warning' });
      return prev.filter((t) => t.id !== id);
    });
    const sb = getServiceSupabase();
    if (sb) {
      sb.from('tournaments').delete().eq('id', id).then(({ error }) => {
        if (error) console.error('Supabase tournaments delete error:', error);
      }).catch((err) => console.error('Supabase tournaments delete throw:', err));
    }
  }, [addActivityLog]);

  const addStudent = useCallback(async (student: Omit<Student, 'id'>): Promise<Student> => {
    const scoped = applyStudentScopeFromAuth(student, auth, coaches);
    const existingUsernames = students.map((s) => s.username);
    const generated = createStudentLoginCredentials(scoped.name, existingUsernames);
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : genId();
    const nextNo = 1 + Math.max(0, ...students.map((s) => s.studentNo).filter((n): n is number => typeof n === 'number'));
    const newStudent = {
      ...scoped,
      id,
      studentNo: nextNo,
      username: scoped.username?.trim() ? scoped.username.trim().toLowerCase() : generated.username,
      password: scoped.password?.trim() ? scoped.password.trim() : generated.password,
    } as Student;
    setStudents(prev => [...prev, newStudent]);
    addActivityLog({ user: CURRENT_USER, action: 'Öğrenci Eklendi', target: student.name, type: 'success' });
    const sb = getServiceSupabase();
    if (sb) {
      const result = await studentInsertWithRetry(sb, newStudent as unknown as Record<string, unknown>);
      if (!result.ok) {
        console.warn('[Students] Supabase insert (yerel kayıt korundu):', result.error);
        showToast('Öğrenci kaydedildi ancak sunucuya yazılamadı. Giriş bilgileri bu cihazda geçerli olabilir.', 'warning');
      } else if (result.synced === false && (student.username || student.password)) {
        showToast('Öğrenci kaydedildi; giriş bilgileri sunucuya yazılamadı. Supabase migration dosyasını çalıştırın.', 'warning');
      }
    }
    return newStudent;
  }, [addActivityLog, students, showToast, auth, coaches]);

  const updateStudent = useCallback(async (id: string, updatedFields: Partial<Student>) => {
    if (updatedFields.lessonLog !== undefined) {
      persistLessonLogLocal(id, updatedFields.lessonLog);
    }
    setStudents(prev => prev.map(s => s.id === id ? { ...s, ...updatedFields } : s));
    const sb = getServiceSupabase();
    if (sb) {
      const result = await studentUpdateWithRetry(sb, id, updatedFields as Record<string, unknown>);
      if (updatedFields.lessonLog !== undefined) {
        if (result.ok) {
          showToast('Ders günlüğü kaydedildi.', 'success');
        } else {
          showToast(
            'Ders günlüğü bu cihazda saklandı; sunucuya yazılamadı. Supabase\'de lesson_log kolonunu ve service role anahtarını kontrol edin.',
            'warning'
          );
        }
      } else if (!result.ok) {
        console.warn('[Students] Supabase update (yerel kayıt korundu):', result.error);
      }
    } else if (updatedFields.lessonLog !== undefined) {
      showToast('Ders günlüğü kaydedildi.', 'success');
    }
  }, [showToast]);

  const deleteStudent = useCallback(async (id: string) => {
    setStudents(prev => {
      const found = prev.find(s => s.id === id);
      if (found) addActivityLog({ user: CURRENT_USER, action: 'Öğrenci Silindi', target: found.name, type: 'warning' });
      return prev.filter(s => s.id !== id);
    });
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('students').delete().eq('id', id);
      if (error) console.error('Supabase students delete error:', error);
    } catch (err) { console.error('Supabase students throw error:', err); }
  }, [addActivityLog]);

  const bulkDeleteStudents = useCallback(async (ids: string[]) => {
    setStudents(prev => {
      const names = prev.filter(s => ids.includes(s.id)).map(s => s.name).join(', ');
      if (names) addActivityLog({ user: CURRENT_USER, action: 'Toplu Öğrenci Silindi', target: `${ids.length} kişi · ${names.slice(0, 50)}${names.length > 50 ? '…' : ''}`, type: 'warning' });
      return prev.filter(s => !ids.includes(s.id));
    });
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('students').delete().in('id', ids);
      if (error) console.error('Supabase students bulk delete error:', error);
    } catch (err) { console.error('Supabase students bulk throw error:', err); }
  }, [addActivityLog]);

  const bulkUpdateStudentGroup = useCallback(async (ids: string[], newGroup: string) => {
    setStudents(prev => prev.map(s => ids.includes(s.id) ? { ...s, group: newGroup } : s));
    addActivityLog({ user: CURRENT_USER, action: 'Grup Güncellendi', target: `${ids.length} öğrenci → ${newGroup}`, type: 'info' });
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('students').update({ group_name: newGroup }).in('id', ids);
      if (error) console.error('Supabase students bulk update error:', error);
    } catch (err) { console.error('Supabase students bulk throw error:', err); }
  }, [addActivityLog]);

  const bulkUpdateStudentCoach = useCallback(async (ids: string[], coachId: string) => {
    const coach = coaches.find((c) => c.id === coachId);
    const coachLabel = coach?.name ?? coachId;
    setStudents((prev) => prev.map((s) => (ids.includes(s.id) ? { ...s, coachId } : s)));
    addActivityLog({
      user: CURRENT_USER,
      action: 'Antrenör Atandı',
      target: `${ids.length} öğrenci → ${coachLabel}`,
      type: 'info',
    });
    const sb = getServiceSupabase();
    if (sb) {
      try {
        const { error } = await sb.from('students').update({ coach_id: coachId }).in('id', ids);
        if (error) console.error('Supabase students bulk coach update error:', error);
      } catch (err) {
        console.error('Supabase students bulk coach throw error:', err);
      }
    }
  }, [addActivityLog, coaches]);

  const addTransaction = useCallback(async (transaction: Omit<Transaction, 'id'>) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : genId();
    const branch =
      transaction.branch ??
      (auth?.role === 'club' ? auth.branch : auth?.role === 'coach' && auth.branch ? auth.branch : undefined);
    const newTransaction = { ...transaction, id, branch } as Transaction;
    setTransactions(prev => [newTransaction, ...prev]);
    addActivityLog({
      user: transaction.processedBy || CURRENT_USER,
      action: transaction.type === 'income' ? 'Gelir Girişi' : 'Gider Girişi',
      target: `${transaction.category} · ₺${transaction.amount.toLocaleString('tr-TR')}`,
      type: transaction.type === 'income' ? 'success' : 'info',
    });
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('transactions').insert(transactionToDb(newTransaction));
      if (error) console.error('Supabase transactions insert error:', error);
    } catch (err) { console.error('Supabase transactions throw error:', err); }
  }, [addActivityLog, auth]);

  const updateTransaction = useCallback(async (id: string, transaction: Partial<Transaction>) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...transaction } : t));
    const sb = getServiceSupabase();
    if (sb) try {
      const payload: Record<string, unknown> = {};
      if (transaction.date != null) payload.date = transaction.date;
      if (transaction.category != null) payload.category = transaction.category;
      if (transaction.description != null) payload.description = transaction.description;
      if (transaction.paymentType != null) payload.payment_type = transaction.paymentType;
      if (transaction.amount != null) payload.amount = transaction.amount;
      if (transaction.processedBy !== undefined) payload.processed_by = transaction.processedBy ?? null;
      if (transaction.branch !== undefined) payload.branch = transaction.branch ?? null;
      if (transaction.studentId !== undefined) payload.student_id = transaction.studentId ?? null;
      if (Object.keys(payload).length === 0) return;
      const { error } = await sb.from('transactions').update(payload).eq('id', id);
      if (error) console.error('Supabase transactions update error:', error);
    } catch (err) { console.error('Supabase transactions update throw:', err); }
  }, []);

  const removeTransaction = useCallback(async (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('transactions').delete().eq('id', id);
      if (error) console.error('Supabase transactions delete error:', error);
    } catch (err) { console.error('Supabase transactions delete throw:', err); }
  }, []);

  const addAttendanceRecord = useCallback(async (record: Omit<AttendanceRecord, 'id'>) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : genId();
    const newRecord = { ...record, id } as AttendanceRecord;
    const day = String(record.date ?? '').slice(0, 10);
    setAttendanceRecords(prev => {
      const idx = prev.findIndex(r => r.studentId === record.studentId && String(r.date ?? '').slice(0, 10) === day);
      if (idx === -1) return [newRecord, ...prev];
      const next = prev.slice();
      next[idx] = { ...next[idx], ...record };
      return next;
    });
    const sb = getServiceSupabase();
    if (sb) try {
      const payload = attendanceRecordToDb(newRecord as unknown as Record<string, unknown>);
      const { data: existing, error: qErr } = await sb
        .from('attendance_records')
        .select('id')
        .eq('student_id', record.studentId)
        .eq('date', day)
        .limit(1)
        .maybeSingle();
      if (qErr) {
        console.error('Supabase attendance_records select error:', qErr);
      } else if (existing?.id) {
        const { error } = await sb.from('attendance_records').update(payload).eq('id', existing.id);
        if (error) console.error('Supabase attendance_records update error:', error);
      } else {
        const { error } = await sb.from('attendance_records').insert(payload);
        if (error) console.error('Supabase attendance_records insert error:', error);
      }
    } catch (err) { console.error('Supabase attendance_records throw error:', err); }
  }, []);

  const addLesson = useCallback(async (lesson: Omit<Lesson, 'id'>) => {
    const sb = getServiceSupabase();
    const id = sb && typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : genId();
    const newLesson = { ...lesson, id } as Lesson;
    setLessons(prev => [...prev, newLesson]);
    if (sb) try {
      const result = await lessonInsertWithRetry(sb, newLesson);
      if (!result.ok) console.error('Supabase lessons insert error:', result.error);
    } catch (err) { console.error('Supabase lessons throw error:', err); }
  }, []);

  const persistTrainingGroupLessons = useCallback(async (group: TrainingGroup) => {
    const prefix = `tg-${group.id}-`;
    const synced = lessonsFromTrainingGroup(group);

    setLessons((prev) => mergeTrainingGroupLessons(group, prev));

    const sb = getServiceSupabase();
    if (!sb) return;
    try {
      const { data: existing } = await sb.from('lessons').select('id');
      const oldIds = ((existing as { id?: string }[] | null) ?? [])
        .map((r) => String(r.id ?? ''))
        .filter((id) => id.startsWith(prefix));
      if (oldIds.length > 0) {
        const { error } = await sb.from('lessons').delete().in('id', oldIds);
        if (error) console.error('Supabase lessons delete (group sync) error:', error);
      }
      if (synced.length > 0) {
        const result = await lessonsUpsertWithRetry(sb, synced);
        if (!result.ok) {
          console.error('Supabase lessons upsert (group sync) error:', result.error);
        }
      }
    } catch (err) {
      console.error('persistTrainingGroupLessons failed:', err);
    }
  }, []);

  const removeTrainingGroupLessons = useCallback(async (groupId: string) => {
    const prefix = `tg-${groupId}-`;
    let idsToDelete: string[] = [];
    setLessons((prev) => {
      idsToDelete = prev.filter((l) => l.id.startsWith(prefix)).map((l) => l.id);
      return removeTrainingGroupLessonsFromList(groupId, prev);
    });
    const sb = getServiceSupabase();
    if (sb && idsToDelete.length > 0) {
      try {
        const { error } = await sb.from('lessons').delete().in('id', idsToDelete);
        if (error) console.error('Supabase lessons delete (group remove) error:', error);
      } catch (err) {
        console.error('removeTrainingGroupLessons failed:', err);
      }
    }
  }, []);

  /** Mevcut grupların ders slotlarını yansıt; silinmiş gruplara ait dersleri temizle */
  useEffect(() => {
    if (!initialDataLoaded) return;

    let removedIds: string[] = [];
    setLessons((prev) => {
      const result = reconcileTrainingGroupLessons(trainingGroups, prev);
      removedIds = result.removedIds;
      if (
        result.removedIds.length === 0 &&
        result.lessons.length === prev.length &&
        result.lessons.every((l, i) => {
          const p = prev[i];
          return p && p.id === l.id && p.topic === l.topic && p.group === l.group && p.day === l.day;
        })
      ) {
        return prev;
      }
      return result.lessons;
    });

    const sb = getServiceSupabase();
    if (!sb) return;

    void (async () => {
      try {
        const activeIds = new Set(trainingGroups.map((g) => g.id));
        const { data: existing } = await sb.from('lessons').select('id');
        const orphanIds = ((existing as { id?: string }[] | null) ?? [])
          .map((r) => String(r.id ?? ''))
          .filter((id) => {
            if (!id.startsWith('tg-')) return false;
            const body = id.slice(3);
            const lastDash = body.lastIndexOf('-');
            if (lastDash <= 0) return false;
            const groupId = body.slice(0, lastDash);
            return !activeIds.has(groupId);
          });
        const idsToDelete = [...new Set([...removedIds, ...orphanIds])];
        if (idsToDelete.length > 0) {
          const { error } = await sb.from('lessons').delete().in('id', idsToDelete);
          if (error) console.error('Supabase lessons delete (reconcile orphans) error:', error);
        }
        const autoLessons = trainingGroups.flatMap((g) => lessonsFromTrainingGroup(g));
        if (autoLessons.length > 0) {
          const result = await lessonsUpsertWithRetry(sb, autoLessons);
          if (!result.ok) console.error('Supabase lessons upsert (reconcile) error:', result.error);
        }
      } catch (err) {
        console.error('reconcileTrainingGroupLessons persist failed:', err);
      }
    })();
  }, [initialDataLoaded, trainingGroups]);

  const addPuzzle = useCallback(async (puzzle: Omit<Puzzle, 'id'>) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : genId();
    const newPuzzle = { ...puzzle, id, source: puzzle.source ?? 'custom' } as Puzzle;
    setPuzzles(prev => [...prev, newPuzzle]);
    const sb = canWriteSupabase() ? getServiceSupabase() : supabase;
    try {
      const fen = (newPuzzle.fen ?? DEFAULT_PUZZLE_FEN).trim();
      if (!fen) return;
      let payload = puzzleToDb(newPuzzle);
      let { data, error } = await sb.from('puzzles').insert(payload).select('id').single();
      if (error && (error.code === 'PGRST204' || String(error.message || '').toLowerCase().includes('column'))) {
        const minimal = { ...payload };
        for (const col of ['image_data', 'game_pgn', 'lichess_themes']) {
          if (col in minimal) delete minimal[col];
        }
        const retry = await sb.from('puzzles').insert(minimal).select('id').single();
        error = retry.error;
        data = retry.data;
        if (!error) {
          console.warn('[Supabase] addPuzzle: opsiyonel kolonlar atlandı (image_data/game_pgn/lichess_themes). supabase_migration_complete.sql çalıştırın.');
        }
      }
      if (error) {
        console.error('[Supabase] addPuzzle HATA:', error.message, error.code, error.details, 'payload:', payload);
        showToast('Bulmaca DB’ye kaydedilemedi. Supabase izin/RLS ayarlarını kontrol edin.', 'warning');
        return;
      }
      console.log('[Supabase] addPuzzle OK, id:', data?.id ?? id);
    } catch (err) {
      console.error('[Supabase] addPuzzle exception:', err);
      showToast('Bulmaca DB’ye kaydedilirken hata oluştu.', 'warning');
    }
  }, [showToast]);

  const importPuzzles = useCallback(async (incoming: Puzzle[]) => {
    const freshWithIds: Puzzle[] = [];
    setPuzzles(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const filtered = incoming.filter(p => !existingIds.has(p.id));
      for (const p of filtered) {
        const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : genId();
        const lichessId = p.lichessId
          ?? (looksLikeLichessPuzzleId(p.id) ? p.id : undefined);
        freshWithIds.push({ ...p, id, lichessId });
      }
      return [...prev, ...freshWithIds];
    });
    if (freshWithIds.length === 0) return;
    const sb = canWriteSupabase() ? getServiceSupabase() : supabase;
    try {
      const rows = freshWithIds.map((p) => puzzleToDb(p));
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        let chunkPayload = chunk;
        let { error } = await sb.from('puzzles').insert(chunkPayload).select('id');
        if (error && (error.code === 'PGRST204' || String(error.message || '').toLowerCase().includes('column'))) {
          chunkPayload = chunk.map((row) => {
            const minimal = { ...row };
            for (const col of ['image_data', 'game_pgn', 'lichess_themes']) {
              if (col in minimal) delete minimal[col];
            }
            return minimal;
          });
          const retry = await sb.from('puzzles').insert(chunkPayload).select('id');
          error = retry.error;
        }
        if (error) {
          console.error('[Supabase] importPuzzles HATA (batch', Math.floor(i / 100) + 1, '):', error.message, error.code, error.details, 'örnek satır:', chunk[0]);
          showToast('Toplu bulmaca import DB’ye kaydedilemedi. Supabase izin/RLS ayarlarını kontrol edin.', 'warning');
          return;
        }
        inserted += chunk.length;
      }
      console.log('[Supabase] importPuzzles OK, toplam kayıt:', inserted);
      showToast(`Toplu bulmaca import tamamlandı: ${inserted} kayıt.`, 'success');
    } catch (err) {
      console.error('[Supabase] importPuzzles exception:', err);
      showToast('Toplu bulmaca import sırasında hata oluştu.', 'warning');
    }
  }, [showToast]);

  const clearPuzzles = useCallback(() => {
    setPuzzles([]);
  }, []);

  const deletePuzzle = useCallback(async (id: string) => {
    setPuzzles(prev => prev.filter(p => p.id !== id));
    const sb = getServiceSupabase();
    if (!sb) return;
    try {
      const { error } = await sb.from('puzzles').delete().eq('id', id);
      if (error) console.error('[Supabase] deletePuzzle HATA:', error.message);
    } catch (err) {
      console.error('[Supabase] deletePuzzle exception:', err);
    }
  }, []);

  const addHomework = useCallback(async (hw: Omit<HomeworkAssignment, 'id'>) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : genId();
    const newHw = { ...hw, id } as HomeworkAssignment;
    const incomingCategory = homeworkAssignmentCategory(newHw);
    const supersededIds: string[] = [];
    setHomeworks((prev) => {
      const kept = prev.filter((old) => {
        const overlap = homeworkAssigneesOverlap(old.assignedTo, hw.assignedTo, students);
        if (!overlap) return true;
        const oldCategory = homeworkAssignmentCategory(old);
        if (oldCategory !== incomingCategory || incomingCategory === 'other') return true;
        supersededIds.push(old.id);
        return false;
      });
      return [newHw, ...kept];
    });
    for (const oldId of supersededIds) {
      const label = incomingCategory === 'program' ? 'günlük program' : 'bulmaca ödevi';
      addActivityLog({
        user: CURRENT_USER,
        action: `Önceki ${label} iptal edildi (yeni atama)`,
        target: oldId,
        type: 'warning',
      });
    }
    addActivityLog({ user: CURRENT_USER, action: 'Ödev Ataması Oluşturuldu', target: hw.title, type: 'success' });
    const sb = getServiceSupabase();
    if (sb) try {
      for (const oldId of supersededIds) {
        const { error: delErr } = await sb.from('homeworks').delete().eq('id', oldId);
        if (delErr) console.error('Supabase homeworks supersede delete error:', delErr);
      }
      const payload = homeworkToDb(newHw as unknown as Record<string, unknown>);
      const { error } = await sb.from('homeworks').insert(payload);
      if (error) console.error('Supabase homeworks insert error:', error);
    } catch (err) {
      console.error('Supabase homeworks throw error:', err);
    }
  }, [addActivityLog, students]);

  const updateHomework = useCallback(async (id: string, fields: Partial<HomeworkAssignment>) => {
    setHomeworks(prev => prev.map(h => h.id === id ? { ...h, ...fields } : h));
    const sb = getServiceSupabase();
    if (sb) try {
      const payload = homeworkToDb(fields as Record<string, unknown>);
      if (Object.keys(payload).length > 0) {
        const { error } = await sb.from('homeworks').update(payload).eq('id', id);
        if (error) console.error('Supabase homeworks update error:', error);
      }
    } catch (err) {
      console.error('Supabase homeworks throw error:', err);
    }
  }, []);

  const deleteHomework = useCallback(async (id: string) => {
    setHomeworks(prev => {
      const found = prev.find(h => h.id === id);
      if (found) addActivityLog({ user: CURRENT_USER, action: 'Ödev Ataması Silindi', target: found.title, type: 'warning' });
      return prev.filter(h => h.id !== id);
    });
    setHomeworkAttempts(prev => prev.filter(a => a.homeworkId !== id));
    setHomeworkSubmissions(prev => prev.filter(s => s.homeworkId !== id));
    const sb = getServiceSupabase();
    if (sb) try {
      await sb.from('homework_attempts').delete().eq('homeworkId', id);
      await sb.from('homework_submissions').delete().eq('homeworkId', id);
      const { error } = await sb.from('homeworks').delete().eq('id', id);
      if (error) console.error('Supabase homeworks delete error:', error);
    } catch (err) {
      console.error('Supabase homeworks throw error:', err);
    }
  }, [addActivityLog]);

  const addHomeworkAttempt = useCallback(async (attempt: Omit<HomeworkPuzzleAttempt, 'id' | 'timestamp'>) => {
    const record: HomeworkPuzzleAttempt = {
      ...attempt,
      id: genId(),
      timestamp: new Date().toISOString(),
    };
    setHomeworkAttempts((prev) => [record, ...prev]);

    const persistLocal = () => {
      try {
        const raw = localStorage.getItem('netchess_homework_attempts');
        const existing = raw ? (JSON.parse(raw) as HomeworkPuzzleAttempt[]) : [];
        localStorage.setItem(
          'netchess_homework_attempts',
          JSON.stringify([record, ...existing.filter((a) => a.id !== record.id)]),
        );
      } catch {
        /* ignore */
      }
    };
    persistLocal();

    const sb = getServiceSupabase();
    if (sb) {
      try {
        const result = await insertHomeworkAttemptSupabase(sb, record);
        if (result.ok) return;
        console.error('Supabase homework_attempts insert error:', result.error);
      } catch (err) {
        console.error('Supabase homework_attempts throw error:', err);
      }
    }

    try {
      const res = await fetch('/api/homework-attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('API homework-attempt failed:', res.status, errText);
      }
    } catch (err) {
      console.error('API homework-attempt throw error:', err);
    }
  }, []);

  const addHomeworkSubmission = useCallback(async (submission: Omit<HomeworkSubmission, 'id' | 'submittedAt'>) => {
    const record: HomeworkSubmission = {
      ...submission,
      id: genId(),
      submittedAt: new Date().toISOString(),
    };
    let alreadyExists = false;
    setHomeworkSubmissions(prev => {
      if (prev.some(s => s.studentId === submission.studentId && s.homeworkId === submission.homeworkId)) {
        alreadyExists = true;
        return prev;
      }
      return [record, ...prev];
    });
    if (!alreadyExists) {
      const sb = getServiceSupabase();
      if (sb) try {
        const snakePayload = submissionToDb(record as unknown as Record<string, unknown>);
        const camelPayload = {
          id: record.id,
          studentId: record.studentId,
          homeworkId: record.homeworkId,
          submittedAt: record.submittedAt,
        };
        let { error } = await sb.from('homework_submissions').insert(snakePayload);
        // Bazi kurulumlarda kolonlar camelCase oldugu icin (submittedAt) snake_case insert PGRST204 verebilir.
        if (error && String((error as any).code ?? '') === 'PGRST204') {
          const retry = await sb.from('homework_submissions').insert(camelPayload);
          error = retry.error;
        }
        if (error) console.error('Supabase homework_submissions insert error:', error);
      } catch (err) {
        console.error('Supabase homework_submissions throw error:', err);
      }
    }
  }, []);

  const resetHomeworkAttemptsForStudent = useCallback(async (studentId: string, homeworkId?: string) => {
    const toRemove = homeworkAttempts.filter((a) => {
      if (a.studentId !== studentId) return false;
      if (homeworkId) return a.homeworkId === homeworkId;
      return true;
    });
    if (toRemove.length === 0) return;
    setHomeworkAttempts((prev) => prev.filter((a) => !toRemove.some((r) => r.id === a.id)));
    const sb = getServiceSupabase();
    if (sb) {
      for (const att of toRemove) {
        try {
          await sb.from('homework_attempts').delete().eq('id', att.id);
        } catch (err) {
          console.error('Supabase homework_attempts delete error:', err);
        }
      }
    }
  }, [homeworkAttempts]);

  const removeHomeworkSubmission = useCallback(async (studentId: string, homeworkId: string) => {
    setHomeworkSubmissions((prev) => prev.filter((s) => !(s.studentId === studentId && s.homeworkId === homeworkId)));
    const sb = getServiceSupabase();
    if (sb) try {
      await sb.from('homework_submissions').delete().eq('studentId', studentId).eq('homeworkId', homeworkId);
    } catch (err) {
      console.error('Supabase homework_submissions delete error:', err);
    }
  }, []);

  const addInventoryItem = useCallback(async (item: Omit<InventoryItem, 'id'>) => {
    const newItem = { ...item, id: genId() } as InventoryItem;
    setInventory(prev => [...prev, newItem]);
    addActivityLog({ user: CURRENT_USER, action: 'Envanter Eklendi', target: `${item.name} · ${item.stock} ${item.unit}`, type: 'info' });
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('inventory').insert(newItem);
      if (error) console.error('Supabase inventory insert error:', error);
    } catch (err) { console.error('Supabase inventory throw error:', err); }
  }, [addActivityLog]);
  const updateInventoryItem = useCallback(async (id: string, fields: Partial<InventoryItem>) => {
    setInventory(prev => prev.map(i => i.id === id ? { ...i, ...fields } : i));
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('inventory').update(fields).eq('id', id);
      if (error) console.error('Supabase inventory update error:', error);
    } catch (err) { console.error('Supabase inventory throw error:', err); }
  }, []);
  const deleteInventoryItem = useCallback(async (id: string) => {
    setInventory(prev => {
      const found = prev.find(i => i.id === id);
      if (found) addActivityLog({ user: CURRENT_USER, action: 'Envanter Silindi', target: found.name, type: 'warning' });
      return prev.filter(i => i.id !== id);
    });
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('inventory').delete().eq('id', id);
      if (error) console.error('Supabase inventory delete error:', error);
    } catch (err) { console.error('Supabase inventory throw error:', err); }
  }, [addActivityLog]);

  const addGalleryItem = useCallback(async (item: Omit<GalleryItem, 'id'>) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : genId();
    const newItem = { ...item, id } as GalleryItem;
    setGallery(prev => [...prev, newItem]);
    addActivityLog({ user: CURRENT_USER, action: 'Galeri Fotoğrafı Eklendi', target: item.title, type: 'success' });
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('gallery').insert(galleryToDb(newItem));
      if (error) console.error('Supabase gallery insert error:', error);
    } catch (err) { console.error('Supabase gallery throw error:', err); }
  }, [addActivityLog]);
  const removeGalleryItem = useCallback(async (id: string) => {
    setGallery(prev => {
      const found = prev.find(g => g.id === id);
      if (found) addActivityLog({ user: CURRENT_USER, action: 'Galeri Fotoğrafı Silindi', target: found.title, type: 'warning' });
      return prev.filter(g => g.id !== id);
    });
    const sb = getServiceSupabase();
    if (sb) try {
      const { error } = await sb.from('gallery').delete().eq('id', id);
      if (error) console.error('Supabase gallery delete error:', error);
    } catch (err) { console.error('Supabase gallery throw error:', err); }
  }, [addActivityLog]);

  const addBranchOffice = useCallback((name: string, options?: { clubId?: string }) => {
    const trimmed = name.trim();
    if (!trimmed || branchOfficeRecords.some((o) => normalizeClubKey(o.name) === normalizeClubKey(trimmed))) return;
    const clubId =
      options?.clubId ??
      (auth?.role === 'club' ? resolveClubIdFromAuth(auth, clubs) : undefined);
    const record: BranchOfficeRecord = {
      id: genId(),
      name: trimmed,
      clubId,
    };
    setBranchOfficeRecords((prev) => [...prev, record]);
    addActivityLog({ user: CURRENT_USER, action: 'Şube Eklendi', target: trimmed, type: 'info' });
    const sb = getServiceSupabase();
    if (sb) {
      void sb.from('branch_offices').upsert(branchOfficeToDb(record)).then(({ error }) => {
        if (error) console.error('Supabase branch_offices insert error:', error);
      });
    }
  }, [branchOfficeRecords, auth, clubs, addActivityLog]);

  /** Kulüp girişinde ana şube kaydı yoksa branch_offices'e ekle (branş/grup seed etmez) */
  useEffect(() => {
    if (!initialDataLoaded || auth?.role !== 'club') return;
    const clubId = resolveClubIdFromAuth(auth, clubs);
    const club = clubs.find((c) => c.id === clubId);
    const clubName = (club?.name || auth.branch || '').trim();
    if (!clubId || !clubName) return;
    const hasOffice = branchOfficeRecords.some(
      (r) => r.clubId === clubId || normalizeClubKey(r.name) === normalizeClubKey(clubName),
    );
    if (hasOffice) return;
    addBranchOffice(clubName, { clubId });
  }, [initialDataLoaded, auth, clubs, branchOfficeRecords, addBranchOffice]);

  const removeBranchOffice = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const clubId = auth?.role === 'club' ? resolveClubIdFromAuth(auth, clubs) : undefined;
    const target = branchOfficeRecords.find((r) => {
      if (normalizeClubKey(r.name) !== normalizeClubKey(trimmed)) return false;
      if (auth?.role === 'club') return r.clubId === clubId;
      return true;
    });

    if (!target) {
      const isClub = clubs.some((c) => normalizeClubKey(c.name) === normalizeClubKey(trimmed));
      if (isClub) {
        showToast(`"${trimmed}" bir kulüptür. Silmek için Kurumsal Yapı sayfasını kullanın.`, 'warning');
      } else {
        showToast(`"${trimmed}" şube kaydı bulunamadı.`, 'warning');
      }
      return;
    }

    if (auth?.role === 'club' && normalizeClubKey(trimmed) === normalizeClubKey(auth.branch ?? '')) {
      showToast('Ana kulüp şubesi silinemez.', 'warning');
      return;
    }

    const inUse =
      disciplineBranches.some((b) => normalizeClubKey(b.branchOffice) === normalizeClubKey(trimmed)) ||
      trainingGroups.some((g) => normalizeClubKey(g.branchOffice) === normalizeClubKey(trimmed));
    if (inUse) {
      showToast(`"${trimmed}" şubesinde branş veya grup tanımı var. Önce onları silin.`, 'warning');
      return;
    }

    setBranchOfficeRecords((prev) => prev.filter((r) => r.id !== target.id));
    addActivityLog({ user: CURRENT_USER, action: 'Şube Silindi', target: trimmed, type: 'warning' });
    const sb = getServiceSupabase();
    if (sb) {
      void sb.from('branch_offices').delete().eq('id', target.id).then(({ error }) => {
        if (error) {
          console.error('Supabase branch_offices delete error:', error);
          showToast('Şube veritabanından silinemedi.', 'warning');
        }
      });
    } else {
      showToast('Şube yalnızca bu cihazdan silindi. Supabase yazma anahtarı tanımlı değil.', 'warning');
    }
  }, [auth, clubs, branchOfficeRecords, disciplineBranches, trainingGroups, addActivityLog, showToast]);

  const addClub = useCallback((club: Omit<Club, 'id'>) => {
    const id = crypto.randomUUID?.() ?? `club-${Date.now()}`;
    const full: Club = {
      id,
      name: club.name.trim() || 'Yeni Kulüp',
      address: club.address?.trim(),
      activeDays: Array.isArray(club.activeDays) && club.activeDays.length === 7 ? club.activeDays : [true, true, true, true, false, false, false],
      loginUsername: club.loginUsername?.trim() || undefined,
      loginPassword: club.loginPassword?.trim() || undefined,
      roleId: club.roleId,
    };
    setClubs(prev => [...prev, full].sort((a, b) => a.name.localeCompare(b.name)));
    addActivityLog({ user: CURRENT_USER, action: 'Kulüp Eklendi', target: full.name, type: 'info' });
    const sb = getServiceSupabase();
    if (sb) {
      sb.from('clubs').insert(clubToDb(full)).then(({ error }) => {
        if (error) console.error('Supabase clubs insert error:', error);
      }).catch((err) => console.error('Supabase clubs insert throw:', err));
    }
  }, [addActivityLog]);
  const updateClub = useCallback((id: string, patch: Partial<Club>) => {
    setClubs(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    if (patch.name) addActivityLog({ user: CURRENT_USER, action: 'Kulüp Güncellendi', target: patch.name, type: 'info' });
    const sb = getServiceSupabase();
    if (sb) {
      const payload: Record<string, unknown> = {};
      if (patch.name !== undefined) payload.name = patch.name;
      if (patch.address !== undefined) payload.address = patch.address ?? null;
      if (patch.activeDays !== undefined) payload.active_days = patch.activeDays;
      if (patch.loginPassword !== undefined) payload.login_password = patch.loginPassword ?? null;
      if (patch.loginUsername !== undefined) payload.login_username = patch.loginUsername ?? null;
      if (patch.roleId !== undefined) payload.role_id = patch.roleId ?? null;
      if (patch.leaderboardPoints !== undefined) payload.leaderboard_points = patch.leaderboardPoints ?? null;
      if (Object.keys(payload).length > 0) {
        sb.from('clubs').update(payload).eq('id', id).then(({ error }) => {
          if (error) console.error('Supabase clubs update error:', error);
        }).catch((err) => console.error('Supabase clubs update throw:', err));
      }
    }
  }, [addActivityLog]);
  const removeClub = useCallback((id: string) => {
    const name = clubs.find(c => c.id === id)?.name;
    setClubs(prev => prev.filter(c => c.id !== id));
    if (name) addActivityLog({ user: CURRENT_USER, action: 'Kulüp Silindi', target: name, type: 'warning' });
    const sb = getServiceSupabase();
    if (sb) {
      sb.from('clubs').delete().eq('id', id).then(({ error }) => {
        if (error) console.error('Supabase clubs delete error:', error);
      }).catch((err) => console.error('Supabase clubs delete throw:', err));
    }
  }, [clubs, addActivityLog]);

  const addDiscipline = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed || disciplines.includes(trimmed)) return;
    setDisciplines(prev => [...prev, trimmed].sort());
    addActivityLog({ user: CURRENT_USER, action: 'Branş Eklendi', target: trimmed, type: 'info' });
  }, [disciplines, addActivityLog]);
  const removeDiscipline = useCallback((name: string) => {
    setDisciplines(prev => prev.filter(d => d !== name));
    addActivityLog({ user: CURRENT_USER, action: 'Branş Silindi', target: name, type: 'warning' });
  }, [addActivityLog]);

  const addGroup = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed || groups.includes(trimmed)) return;
    setGroups(prev => [...prev, trimmed].sort());
    addActivityLog({ user: CURRENT_USER, action: 'Grup Eklendi', target: trimmed, type: 'info' });
  }, [groups, addActivityLog]);
  const removeGroup = useCallback((name: string) => {
    setGroups(prev => prev.filter(g => g !== name));
    addActivityLog({ user: CURRENT_USER, action: 'Grup Silindi', target: name, type: 'warning' });
  }, [addActivityLog]);

  const syncDisciplineNames = useCallback((branches: DisciplineBranch[]) => {
    const names = [...new Set(branches.map((b) => b.name.trim()).filter(Boolean))].sort();
    setDisciplines(names);
  }, []);

  const syncGroupNames = useCallback((tGroups: TrainingGroup[]) => {
    const names = [...new Set(tGroups.map((g) => g.name.trim()).filter(Boolean))].sort();
    setGroups(names);
  }, []);

  const addDisciplineBranch = useCallback((branch: Omit<DisciplineBranch, 'id'>) => {
    const name = branch.name.trim();
    const officeInput = branch.branchOffice.trim();
    if (!name || !officeInput) return;
    const clubId = clubIdForOrgRecord(officeInput, auth, clubs) ?? undefined;
    const registered = findRegisteredBranchOffice(branchOfficeRecords, officeInput, clubId);
    if (!registered) {
      showToast('Önce şubeyi tanımlayın. Kulüpler için + ile şube olarak ekleyin.', 'warning');
      return;
    }
    const office = registered.name;
    const full: DisciplineBranch = {
      ...branch,
      id: genId(),
      name,
      branchOffice: office,
      monthlyFee: Math.max(0, branch.monthlyFee || 0),
      clubId: registered.clubId ?? clubId,
    };
    setDisciplineBranches((prev) => {
      if (prev.some((b) => b.name === name && normalizeClubKey(b.branchOffice) === normalizeClubKey(office))) {
        return prev;
      }
      const next = [...prev, full];
      syncDisciplineNames(next);
      return next;
    });
    addActivityLog({ user: CURRENT_USER, action: 'Branş Tanımı Eklendi', target: `${name} (${office})`, type: 'info' });
    const sb = getServiceSupabase();
    if (sb) {
      void sb.from('discipline_branches').upsert(disciplineBranchToDb(full, full.clubId ?? clubId)).then(({ error }) => {
        if (error) console.error('Supabase discipline_branches insert error:', error);
      });
    }
  }, [addActivityLog, syncDisciplineNames, auth, clubs, branchOfficeRecords, showToast]);

  const updateDisciplineBranch = useCallback((id: string, branch: Partial<DisciplineBranch>) => {
    let cascade = false;
    let oldName = '';
    let oldOffice = '';
    let newName = '';
    let newOffice = '';

    const existing = disciplineBranches.find((b) => b.id === id);
    if (!existing) return;

    const officeInput = (branch.branchOffice ?? existing.branchOffice).trim();
    const clubId = clubIdForOrgRecord(officeInput, auth, clubs) ?? existing.clubId;
    const registered = findRegisteredBranchOffice(branchOfficeRecords, officeInput, clubId ?? undefined);
    if (!registered) {
      showToast('Seçilen şube kayıtlı değil. Önce şubeyi tanımlayın.', 'warning');
      return;
    }

    setDisciplineBranches((prev) => {
      const row = prev.find((b) => b.id === id);
      if (!row) return prev;
      oldName = row.name;
      oldOffice = row.branchOffice;
      newName = (branch.name ?? row.name).trim();
      newOffice = registered.name;
      cascade =
        newName !== oldName ||
        normalizeClubKey(newOffice) !== normalizeClubKey(oldOffice);
      const next = prev.map((b) =>
        b.id === id
          ? { ...b, ...branch, name: newName, branchOffice: newOffice, clubId: registered.clubId ?? clubId ?? b.clubId }
          : b,
      );
      syncDisciplineNames(next);
      const updated = next.find((b) => b.id === id);
      const sb = getServiceSupabase();
      if (sb && updated) {
        void sb.from('discipline_branches').upsert(disciplineBranchToDb(updated, updated.clubId ?? clubId)).then(({ error }) => {
          if (error) console.error('Supabase discipline_branches update error:', error);
        });
      }
      return next;
    });

    if (!cascade) return;

    setTrainingGroups((prev) => {
      const updatedGroups: TrainingGroup[] = [];
      const next = prev.map((g) => {
        if (
          g.discipline !== oldName ||
          normalizeClubKey(g.branchOffice) !== normalizeClubKey(oldOffice)
        ) {
          return g;
        }
        const ng = { ...g, discipline: newName, branchOffice: newOffice };
        updatedGroups.push(ng);
        return ng;
      });
      if (updatedGroups.length === 0) return prev;
      syncGroupNames(next);
      const sb = getServiceSupabase();
      if (sb) {
        for (const g of updatedGroups) {
          void sb.from('training_groups').upsert(trainingGroupToDb(g, g.clubId ?? clubId)).then(({ error }) => {
            if (error) console.error('Supabase training_groups cascade update error:', error);
          });
        }
      }
      return next;
    });

    setStudents((prev) => {
      const toUpdate: { id: string; branch: string; branchOffice: string }[] = [];
      const next = prev.map((s) => {
        const office = (s.branchOffice ?? '').trim();
        if (
          s.branch !== oldName ||
          normalizeClubKey(office) !== normalizeClubKey(oldOffice)
        ) {
          return s;
        }
        toUpdate.push({ id: s.id, branch: newName, branchOffice: newOffice });
        return { ...s, branch: newName, branchOffice: newOffice };
      });
      if (toUpdate.length === 0) return prev;
      const sb = getServiceSupabase();
      if (sb) {
        for (const u of toUpdate) {
          void studentUpdateWithRetry(sb, u.id, { branch: u.branch, branchOffice: u.branchOffice });
        }
      }
      return next;
    });
  }, [disciplineBranches, branchOfficeRecords, syncDisciplineNames, syncGroupNames, auth, clubs, showToast]);

  const removeDisciplineBranch = useCallback((id: string) => {
    setDisciplineBranches((prev) => {
      const found = prev.find((b) => b.id === id);
      const next = prev.filter((b) => b.id !== id);
      if (found) {
        addActivityLog({ user: CURRENT_USER, action: 'Branş Tanımı Silindi', target: found.name, type: 'warning' });
        syncDisciplineNames(next);
        const sb = getServiceSupabase();
        if (sb) {
          void sb.from('discipline_branches').delete().eq('id', id).then(({ error }) => {
            if (error) console.error('Supabase discipline_branches delete error:', error);
          });
        }
      }
      return next;
    });
  }, [addActivityLog, syncDisciplineNames]);

  const addTrainingGroup = useCallback((group: Omit<TrainingGroup, 'id'>) => {
    const name = group.name.trim();
    const office = group.branchOffice.trim();
    const discipline = group.discipline.trim();
    if (!name) return;
    const clubId = clubIdForOrgRecord(office, auth, clubs) ?? undefined;
    const full: TrainingGroup = {
      ...group,
      id: genId(),
      name,
      branchOffice: office,
      discipline,
      capacity: Math.max(0, group.capacity || 0),
      lessonSlots: group.lessonSlots ?? [],
      clubId,
    };
    setTrainingGroups((prev) => {
      if (prev.some((g) => g.name === name && g.branchOffice === office && g.discipline === discipline)) {
        return prev;
      }
      const next = [...prev, full];
      syncGroupNames(next);
      return next;
    });
    addActivityLog({ user: CURRENT_USER, action: 'Grup Tanımı Eklendi', target: name, type: 'info' });
    const sb = getServiceSupabase();
    if (sb) {
      const clubId = clubIdForOrgRecord(office, auth, clubs);
      void sb.from('training_groups').upsert(trainingGroupToDb(full, full.clubId ?? clubId)).then(({ error }) => {
        if (error) console.error('Supabase training_groups insert error:', error);
      });
    }
    if (full.lessonSlots?.length) {
      void persistTrainingGroupLessons(full);
    }
  }, [addActivityLog, syncGroupNames, auth, clubs, persistTrainingGroupLessons]);

  const updateTrainingGroup = useCallback((id: string, group: Partial<TrainingGroup>) => {
    setTrainingGroups((prev) => {
      const next = prev.map((g) => (g.id === id ? { ...g, ...group } : g));
      syncGroupNames(next);
      const updated = next.find((g) => g.id === id);
      const sb = getServiceSupabase();
      if (sb && updated) {
        const clubId = clubIdForOrgRecord(updated.branchOffice, auth, clubs);
        void sb.from('training_groups').upsert(trainingGroupToDb(updated, updated.clubId ?? clubId)).then(({ error }) => {
          if (error) console.error('Supabase training_groups update error:', error);
        });
        void persistTrainingGroupLessons(updated);
      }
      return next;
    });
  }, [syncGroupNames, auth, clubs, persistTrainingGroupLessons]);

  const removeTrainingGroup = useCallback((id: string) => {
    setTrainingGroups((prev) => {
      const found = prev.find((g) => g.id === id);
      const next = prev.filter((g) => g.id !== id);
      if (found) {
        addActivityLog({ user: CURRENT_USER, action: 'Grup Tanımı Silindi', target: found.name, type: 'warning' });
        syncGroupNames(next);
        void removeTrainingGroupLessons(id);
        const sb = getServiceSupabase();
        if (sb) {
          void sb.from('training_groups').delete().eq('id', id).then(({ error }) => {
            if (error) {
              console.error('Supabase training_groups delete error:', error);
              showToast('Grup veritabanından silinemedi. training_groups tablosunu kontrol edin.', 'warning');
            }
          });
        } else {
          showToast('Grup yalnızca bu cihazdan silindi. Supabase yazma anahtarı tanımlı değil.', 'warning');
        }
      }
      return next;
    });
  }, [addActivityLog, syncGroupNames, removeTrainingGroupLessons, showToast]);

  const updateGroupLessonLog = useCallback(async (groupKey: string, entries: StudentLessonLogEntry[]) => {
    const key = groupKey.trim();
    if (!key) return;
    setGroupLessonLogs((prev) => ({ ...prev, [key]: entries }));
    persistGroupLessonLogLocal(key, entries);

    const sb = getServiceSupabase();
    if (sb) {
      const { error } = await sb.from('group_lesson_logs').upsert(
        {
          group_name: key,
          entries,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'group_name' },
      );
      if (error) {
        if (isMissingSupabaseTableError(error)) {
          showToast(
            'Grup konuları bu cihazda saklandı. Supabase\'de group_lesson_logs tablosunu oluşturun (supabase_group_lesson_logs.sql).',
            'warning',
          );
        } else {
          console.error('[Supabase] group_lesson_logs upsert:', error.message);
          showToast('Grup konuları cihazda saklandı; sunucuya yazılamadı.', 'warning');
        }
        return;
      }
    }
    showToast('Grup ders konuları kaydedildi', 'success');
  }, [showToast]);

  const [lichessPuzzlesLoaded, setLichessPuzzlesLoaded] = useState(false);

  useEffect(() => {
    if (lichessPuzzlesLoaded) return;
    fetch('/lichess-puzzles.json')
      .then(res => {
        if (!res.ok) throw new Error('no file');
        return res.json();
      })
      .then((data: Puzzle[]) => {
        if (Array.isArray(data) && data.length > 0) {
          importPuzzles(data);
        }
        setLichessPuzzlesLoaded(true);
      })
      .catch(() => setLichessPuzzlesLoaded(true));
  }, [lichessPuzzlesLoaded, importPuzzles]);

  return (
    <AppContext.Provider value={{ 
      students, scopedStudents, scopedTransactions, scopedCoaches, scopedTrainingGroups, scopedDisciplineBranches, scopedTournaments, activeClubBranch,
      addStudent, updateStudent, deleteStudent,
      bulkDeleteStudents, bulkUpdateStudentGroup, bulkUpdateStudentCoach,
      transactions, addTransaction, updateTransaction, removeTransaction,
      attendanceRecords, addAttendanceRecord,
      lessons, addLesson,
      puzzles, addPuzzle, importPuzzles, clearPuzzles, deletePuzzle, lichessPuzzlesLoaded,
      homeworks, addHomework, updateHomework, deleteHomework,
      homeworkAttempts, addHomeworkAttempt, resetHomeworkAttemptsForStudent,
      homeworkSubmissions, addHomeworkSubmission, removeHomeworkSubmission,
      inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem,
      gallery, addGalleryItem, removeGalleryItem,
      branchOffices, branchOfficeRecords, addBranchOffice, removeBranchOffice,
      clubs, addClub, updateClub, removeClub,
      disciplines, addDiscipline, removeDiscipline,
      groups, addGroup, removeGroup,
      disciplineBranches, addDisciplineBranch, updateDisciplineBranch, removeDisciplineBranch,
      trainingGroups, addTrainingGroup, updateTrainingGroup, removeTrainingGroup,
      groupLessonLogs, updateGroupLessonLog,
      activityLogs, addActivityLog,
      scheduleEntries, addScheduleEntry, updateScheduleEntry, deleteScheduleEntry,
      coaches, addCoach, updateCoach, deleteCoach,
      performanceAnalyses, addPerformanceAnalysis, updatePerformanceAnalysis, deletePerformanceAnalysis,
      coachAiReports, addCoachAiReport, deleteCoachAiReport,
      tournaments, addTournament, updateTournament, deleteTournament,
      appRoles, rolePermissionMap, rolesLoaded, createAppRole, updateAppRole, deleteAppRole, setRolePermissions, refreshRoles,
      getAuthPermissions, authPermissions, hasAuthPermission,
      auth, apiStudent, loginAdmin, loginCoach, loginClub, loginParent, loginStudent, logout, setAuthWithStudent, refreshFromStorage,
      refreshStudentsFromSupabase,
      initialDataLoaded,
      stockfishReady,
      stockfishLoading,
      showToast,
      confirmDialog,
      alertDialog
    }}>
      {children}

      <ToastStack toasts={toasts} onDismiss={removeToast} />
      <ConfirmDialog request={dialogRequest} onClose={closeDialog} />
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
