import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { timestampMatchesDay } from './homeworkDayUtils';

export type LichessPuzzleActivityRow = {
  id: string;
  puzzleId: string;
  date: number;
  win: boolean;
  rating?: number;
  fen?: string;
  themes?: string;
};

function getSupabase(): SupabaseClient | null {
  const url = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const key = (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function getLichessOAuthClientIdServer(): string {
  return (
    process.env.LICHESS_OAUTH_CLIENT_ID
    ?? process.env.VITE_LICHESS_OAUTH_CLIENT_ID
    ?? 'netchess-academy'
  ).trim();
}

export function getLichessOAuthRedirectUriServer(origin?: string): string {
  const fromEnv = (process.env.LICHESS_OAUTH_REDIRECT_URI ?? process.env.VITE_LICHESS_OAUTH_REDIRECT_URI ?? '').trim();
  if (fromEnv) return fromEnv;
  if (origin?.trim()) return `${origin.replace(/\/$/, '')}/lichess-oauth-callback.html`;
  return '/lichess-oauth-callback.html';
}

export async function getStudentLichessToken(studentId: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('students')
    .select('lichess_access_token')
    .eq('id', studentId)
    .maybeSingle();
  if (error || !data) return null;
  const token = String((data as { lichess_access_token?: string }).lichess_access_token ?? '').trim();
  return token || null;
}

export async function saveStudentLichessOAuth(params: {
  studentId: string;
  token: string;
  lichessUsername?: string;
}): Promise<{ ok: boolean; error?: string; missingColumn?: boolean }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase yapılandırması eksik' };
  const patch: Record<string, unknown> = {
    lichess_access_token: params.token,
    lichess_oauth_connected_at: new Date().toISOString(),
  };
  if (params.lichessUsername?.trim()) {
    patch.lichess_username = params.lichessUsername.trim().toLowerCase();
  }
  const { error } = await sb.from('students').update(patch).eq('id', params.studentId);
  if (error) {
    const msg = String(error.message ?? '').toLowerCase();
    if (error.code === '42703' || msg.includes('lichess_access_token')) {
      return {
        ok: false,
        missingColumn: true,
        error:
          "students tablosunda lichess_access_token sütunu yok. Supabase'de supabase_lichess_oauth.sql çalıştırın.",
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function clearStudentLichessOAuth(studentId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase yapılandırması eksik' };
  const { error } = await sb
    .from('students')
    .update({ lichess_access_token: null, lichess_oauth_connected_at: null })
    .eq('id', studentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getStudentLichessOAuthStatus(studentId: string): Promise<{
  connected: boolean;
  lichessUsername?: string;
}> {
  const sb = getSupabase();
  if (!sb) return { connected: false };
  const { data, error } = await sb
    .from('students')
    .select('lichess_access_token, lichess_username')
    .eq('id', studentId)
    .maybeSingle();
  if (error || !data) return { connected: false };
  const row = data as { lichess_access_token?: string | null; lichess_username?: string | null };
  const connected = !!String(row.lichess_access_token ?? '').trim();
  const lichessUsername = row.lichess_username?.trim() || undefined;
  return { connected, lichessUsername };
}

export async function exchangeLichessOAuthCode(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ ok: true; token: string; username?: string } | { ok: false; error: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.codeVerifier,
    client_id: getLichessOAuthClientIdServer(),
    redirect_uri: params.redirectUri,
  });
  try {
    const res = await fetch('https://lichess.org/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: text || `Token alınamadı (${res.status})` };
    }
    const json = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
    const token = String(json.access_token ?? '').trim();
    if (!token) {
      return { ok: false, error: json.error_description || json.error || 'access_token yok' };
    }
    let username: string | undefined;
    try {
      const accountRes = await fetch('https://lichess.org/api/account', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (accountRes.ok) {
        const account = (await accountRes.json()) as { username?: string; id?: string };
        username = account.username ?? account.id;
      }
    } catch {
      /* kullanıcı adı opsiyonel */
    }
    return { ok: true, token, username };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Lichess bağlantı hatası' };
  }
}

function parseNdjson(text: string): Record<string, unknown>[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((x): x is Record<string, unknown> => x != null);
}

export async function fetchLichessPuzzleActivityForDay(params: {
  token: string;
  dayIso: string;
  max?: number;
}): Promise<LichessPuzzleActivityRow[]> {
  const target = params.dayIso.slice(0, 10);
  const since = new Date(`${target}T00:00:00`).getTime();
  const before = new Date(`${target}T23:59:59.999`).getTime() + 1;
  const qs = new URLSearchParams();
  qs.set('max', String(Math.min(500, Math.max(20, params.max ?? 120))));
  qs.set('since', String(since));
  qs.set('before', String(before));

  const res = await fetch(`https://lichess.org/api/puzzle/activity?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: 'application/x-ndjson',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Lichess bulmaca geçmişi alınamadı (${res.status})`);
  }
  const text = await res.text();
  const rows = parseNdjson(text);
  const out: LichessPuzzleActivityRow[] = [];
  for (const row of rows) {
    const date = Number(row.date);
    if (!Number.isFinite(date) || !timestampMatchesDay(date, target)) continue;
    const puzzle = row.puzzle as Record<string, unknown> | undefined;
    const puzzleId = String(puzzle?.id ?? puzzle?.name ?? '').trim();
    if (!puzzleId) continue;
    out.push({
      id: `${puzzleId}-${date}`,
      puzzleId,
      date,
      win: row.win === true,
      rating: typeof puzzle?.rating === 'number' ? puzzle.rating : undefined,
      fen: typeof puzzle?.fen === 'string' ? puzzle.fen : undefined,
      themes: typeof puzzle?.themes === 'string' ? puzzle.themes : undefined,
    });
  }
  out.sort((a, b) => a.date - b.date);
  return out;
}

export type LichessPuzzleDashboardResults = {
  firstWins: number;
  nb: number;
  performance: number;
  puzzleRatingAvg: number;
  replayWins: number;
};

export type LichessPuzzleDashboard = {
  days: number;
  global: LichessPuzzleDashboardResults;
  themes: Record<string, { theme: string; results: LichessPuzzleDashboardResults }>;
};

export function puzzleStatsFromActivityRows(rows: LichessPuzzleActivityRow[]): {
  count: number;
  passed: number;
  failed: number;
} {
  const passed = rows.filter((r) => r.win).length;
  const failed = rows.filter((r) => !r.win).length;
  return { count: rows.length, passed, failed };
}

export async function fetchLichessPuzzleDashboard(params: {
  token: string;
  days?: number;
}): Promise<LichessPuzzleDashboard> {
  const days = Math.min(365, Math.max(1, Math.floor(params.days ?? 30)));
  const res = await fetch(`https://lichess.org/api/puzzle/dashboard/${days}`, {
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Lichess bulmaca özeti alınamadı (${res.status})`);
  }
  return (await res.json()) as LichessPuzzleDashboard;
}
