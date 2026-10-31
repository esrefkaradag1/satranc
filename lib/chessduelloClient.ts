export type ChessDuelloStatus = {
  configured: boolean;
  source: 'env' | 'club' | null;
  keyLast4: string;
  clanId: string;
  clanName: string;
  lastOkAt: string;
  lastError: string;
  baseUrl?: string;
};

export type ChessDuelloClan = {
  id: string;
  name: string;
  description: string | null;
  emblemUrl: string | null;
  createdAt: string | null;
  memberCount: number;
  coaches: Array<{ id: string; username: string }>;
};

export type ChessDuelloMember = {
  id: string;
  username: string;
  avatarUrl: string | null;
  eloRating: number;
  lastActiveAt: string | null;
  joinedAt: string | null;
  role: string;
  attemptsLast30Days?: number;
  accuracyLast30Days?: number | null;
};

export type ChessDuelloTraining = {
  profileId: string;
  username: string;
  avatarUrl: string | null;
  hasSynced: boolean;
  lastActiveAt: string | null;
  lastTrainedAt: string | null;
  totalLessons: number;
  completedLessons: number;
  completionPercent: number | null;
  curriculumVersion: string;
  categories: Array<{
    id: string;
    totalLessons: number;
    completedLessons: number;
    lessons: Array<{
      slug: string;
      title: Record<string, string>;
      totalSteps: number;
      completedSteps: number;
      status: string;
      lastPlayedAt: string | null;
    }>;
  }>;
};

export type ChessDuelloAnalytics = {
  windowDays: number;
  attempts: number;
  correct: number;
  accuracy: number | null;
  trainingAttempts: number;
  matchAttempts: number;
  firstTryAttempts: number;
  firstTryAccuracy: number | null;
  lastAnsweredAt: string | null;
  trend: Array<{ day: string; attempts: number; correct: number }>;
  weakThemes: Array<{
    id: number;
    slug: string;
    title: Record<string, string>;
    attempts: number;
    accuracy: number | null;
  }>;
  strongThemes: Array<{
    id: number;
    slug: string;
    title: Record<string, string>;
    attempts: number;
    accuracy: number | null;
  }>;
};

export type ChessDuelloActivities = {
  items: Array<{ id: string; kind: string; at: string | null; details: Record<string, unknown> }>;
  completeness: string;
  description: string;
};

export type ChessDuelloTournament = {
  id: string;
  title: string;
  titleTr: string | null;
  totalPuzzles: number;
  startDate: string | null;
  endDate: string | null;
  timeLimitSeconds: number;
  mode: string;
  status: string;
};

export type ChessDuelloResult = {
  id: string;
  score: number;
  isCompleted: boolean;
  timeSpentMs: number | null;
  rank: number;
  member: { id: string; username: string } | null;
  isFormerMember: boolean;
  answeredCount: number;
};

type Envelope<T> = {
  data: T;
  pagination?: { limit?: number; hasMore?: boolean; nextCursor?: string | null };
  meta?: { requestId?: string; generatedAt?: string };
};
type ErrorEnvelope = { error?: { code?: string; message?: string } };

export class ChessDuelloApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

async function request<T>(
  method: 'GET' | 'POST',
  params: Record<string, string | number | undefined | null>,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`/api/chessduello${qs(params)}`, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
  const text = await res.text();
  let json: T & ErrorEnvelope = {} as T & ErrorEnvelope;
  try {
    json = text ? (JSON.parse(text) as T & ErrorEnvelope) : ({} as T & ErrorEnvelope);
  } catch {
    throw new ChessDuelloApiError(text.slice(0, 180) || `HTTP ${res.status}`, res.status);
  }
  if (!res.ok) {
    const errField = json.error as { message?: string } | string | undefined;
    const msg =
      (typeof errField === 'object' && errField?.message) ||
      (typeof errField === 'string' ? errField : '') ||
      `ChessDuello HTTP ${res.status}`;
    if (res.status === 404 && /not found/i.test(msg)) {
      throw new ChessDuelloApiError(
        'Sunucu API yok (/api/chessduello). Docker/Node API çalışmalı; ChessDuello tarayıcıdan çağrılamaz.',
        res.status,
        json.error?.code || 'api_missing',
      );
    }
    throw new ChessDuelloApiError(msg, res.status, json.error?.code || 'error');
  }
  return json;
}

export function localizedTitle(title: Record<string, string> | string | null | undefined): string {
  if (!title) return '';
  if (typeof title === 'string') return title;
  return title.tr || title.en || Object.values(title)[0] || '';
}

export function tournamentTitle(t: Pick<ChessDuelloTournament, 'title' | 'titleTr'>): string {
  return t.titleTr?.trim() || t.title?.trim() || 'Turnuva';
}

export async function chessduelloStatus(clubId?: string): Promise<ChessDuelloStatus> {
  return request<ChessDuelloStatus>('GET', { resource: 'status', clubId });
}

export async function chessduelloSaveKey(clubId: string, apiKey: string): Promise<ChessDuelloStatus & { clan?: ChessDuelloClan }> {
  return request('POST', {}, { action: 'save-key', clubId, apiKey });
}

export async function chessduelloClearKey(clubId: string): Promise<ChessDuelloStatus> {
  return request('POST', {}, { action: 'clear-key', clubId });
}

export async function chessduelloTest(clubId?: string): Promise<Envelope<ChessDuelloClan>> {
  return request('POST', {}, { action: 'test', clubId });
}

export async function chessduelloClan(clubId?: string): Promise<Envelope<ChessDuelloClan>> {
  return request('GET', { resource: 'clan', clubId });
}

export async function chessduelloMembers(
  clubId?: string,
  opts?: { limit?: number; after?: string },
): Promise<Envelope<ChessDuelloMember[]>> {
  return request('GET', { resource: 'members', clubId, limit: opts?.limit ?? 100, after: opts?.after });
}

export async function chessduelloAllMembers(clubId?: string): Promise<ChessDuelloMember[]> {
  const out: ChessDuelloMember[] = [];
  let after: string | undefined;
  for (let i = 0; i < 20; i += 1) {
    const page = await chessduelloMembers(clubId, { limit: 100, after });
    const raw = page.data as ChessDuelloMember[] | { items?: ChessDuelloMember[] } | undefined;
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    out.push(...rows);
    const next = page.pagination?.hasMore ? page.pagination.nextCursor : null;
    if (!next || rows.length === 0) break;
    after = next;
  }
  return out;
}

export async function chessduelloMember(memberId: string, clubId?: string): Promise<Envelope<ChessDuelloMember>> {
  return request('GET', { resource: 'member', id: memberId, clubId });
}

export async function chessduelloTraining(memberId: string, clubId?: string): Promise<Envelope<ChessDuelloTraining>> {
  return request('GET', { resource: 'training', memberId, clubId });
}

export async function chessduelloAnalytics(
  memberId: string,
  clubId?: string,
  days = 30,
): Promise<Envelope<ChessDuelloAnalytics>> {
  return request('GET', { resource: 'analytics', memberId, clubId, days });
}

export async function chessduelloActivities(memberId: string, clubId?: string): Promise<Envelope<ChessDuelloActivities>> {
  return request('GET', { resource: 'activities', memberId, clubId });
}

export async function chessduelloTournaments(
  clubId?: string,
  opts?: { limit?: number; after?: string },
): Promise<Envelope<ChessDuelloTournament[]>> {
  return request('GET', { resource: 'tournaments', clubId, limit: opts?.limit ?? 100, after: opts?.after });
}

export async function chessduelloResults(
  tournamentId: string,
  clubId?: string,
  opts?: { limit?: number; after?: string },
): Promise<Envelope<ChessDuelloResult[]>> {
  return request('GET', {
    resource: 'results',
    tournamentId,
    clubId,
    limit: opts?.limit ?? 100,
    after: opts?.after,
  });
}

export function matchChessDuelloMember<T extends {
  id: string;
  name: string;
  chessDuelloMemberId?: string;
  chessDuelloUsername?: string;
  lichessUsername?: string;
  chessComUsername?: string;
}>(member: Pick<ChessDuelloMember, 'id' | 'username'>, students: T[]): T | undefined {
  const un = member.username.trim().toLowerCase();
  const compact = un.replace(/[._\-\s]/g, '');
  const byId = students.find((s) => s.chessDuelloMemberId === member.id);
  if (byId) return byId;
  const byUser = students.find((s) => s.chessDuelloUsername?.trim().toLowerCase() === un);
  if (byUser) return byUser;
  const byLichess = students.find((s) => s.lichessUsername?.trim().toLowerCase() === un);
  if (byLichess) return byLichess;
  const byChessCom = students.find((s) => s.chessComUsername?.trim().toLowerCase() === un);
  if (byChessCom) return byChessCom;
  return students.find((s) => s.name.replace(/[._\-\s]/g, '').toLowerCase() === compact);
}
