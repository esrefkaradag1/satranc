/**
 * Lichess OAuth API — Vite dev / docker-api için (api/lichess-oauth-*.ts ile aynı mantık).
 */

function getSupabase(env) {
  const url = (env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '').trim();
  const key = (env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return null;
  return { url, key };
}

async function createSb(env) {
  const cfg = getSupabase(env);
  if (!cfg) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getClientId(env) {
  return (env.LICHESS_OAUTH_CLIENT_ID ?? env.VITE_LICHESS_OAUTH_CLIENT_ID ?? 'netchess-academy').trim();
}

function getRedirectUri(env, origin) {
  const fromEnv = (env.LICHESS_OAUTH_REDIRECT_URI ?? env.VITE_LICHESS_OAUTH_REDIRECT_URI ?? '').trim();
  if (fromEnv) return fromEnv;
  if (origin?.trim()) return `${origin.replace(/\/$/, '')}/lichess-oauth-callback.html`;
  return '/lichess-oauth-callback.html';
}

function localDayKeyFromMs(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function utcDayKeyFromMs(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function timestampMatchesDay(ms, target) {
  const day = target.slice(0, 10);
  return localDayKeyFromMs(ms) === day || utcDayKeyFromMs(ms) === day;
}

export async function exchangeLichessOAuthCode(params, env) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.codeVerifier,
    client_id: getClientId(env),
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
    const json = await res.json();
    const token = String(json.access_token ?? '').trim();
    if (!token) {
      return { ok: false, error: json.error_description || json.error || 'access_token yok' };
    }
    let username;
    try {
      const accountRes = await fetch('https://lichess.org/api/account', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (accountRes.ok) {
        const account = await accountRes.json();
        username = account.username ?? account.id;
      }
    } catch {
      /* opsiyonel */
    }
    return { ok: true, token, username };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Lichess bağlantı hatası' };
  }
}

function isMissingLichessColumnError(error) {
  const msg = String(error?.message ?? '').toLowerCase();
  const code = String(error?.code ?? '');
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    msg.includes('lichess_access_token') ||
    msg.includes('lichess_oauth_connected_at')
  );
}

async function saveStudentLichessOAuth(env, params) {
  const sb = await createSb(env);
  if (!sb) return { ok: false, error: 'Supabase yapılandırması eksik (VITE_SUPABASE_SERVICE_ROLE_KEY)' };
  const patch = {
    lichess_access_token: params.token,
    lichess_oauth_connected_at: new Date().toISOString(),
  };
  if (params.lichessUsername?.trim()) {
    patch.lichess_username = params.lichessUsername.trim().toLowerCase();
  }
  const { error } = await sb.from('students').update(patch).eq('id', params.studentId);
  if (error) {
    if (isMissingLichessColumnError(error)) {
      return {
        ok: false,
        error:
          'students tablosunda lichess_access_token sütunu yok. Supabase SQL Editor\'de supabase_lichess_oauth.sql dosyasını çalıştırın.',
        missingColumn: true,
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function clearStudentLichessOAuth(env, studentId) {
  const sb = await createSb(env);
  if (!sb) return { ok: false, error: 'Supabase yapılandırması eksik' };
  const { error } = await sb
    .from('students')
    .update({ lichess_access_token: null, lichess_oauth_connected_at: null })
    .eq('id', studentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function getStudentLichessOAuthStatus(env, studentId) {
  const sb = await createSb(env);
  if (!sb) return { connected: false };
  const { data, error } = await sb
    .from('students')
    .select('lichess_access_token, lichess_username')
    .eq('id', studentId)
    .maybeSingle();
  if (error) {
    if (isMissingLichessColumnError(error)) return { connected: false, setupRequired: true };
    return { connected: false };
  }
  if (!data) return { connected: false };
  const connected = !!String(data.lichess_access_token ?? '').trim();
  const lichessUsername = data.lichess_username?.trim() || undefined;
  return { connected, lichessUsername };
}

async function getStudentLichessToken(env, studentId) {
  const sb = await createSb(env);
  if (!sb) return null;
  const { data, error } = await sb.from('students').select('lichess_access_token').eq('id', studentId).maybeSingle();
  if (error || !data) return null;
  const token = String(data.lichess_access_token ?? '').trim();
  return token || null;
}

function parseNdjson(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function fetchLichessPuzzleActivityForDay(token, dayIso, max) {
  const target = dayIso.slice(0, 10);
  const since = new Date(`${target}T00:00:00`).getTime();
  const before = new Date(`${target}T23:59:59.999`).getTime() + 1;
  const qs = new URLSearchParams();
  qs.set('max', String(Math.min(500, Math.max(20, max ?? 120))));
  qs.set('since', String(since));
  qs.set('before', String(before));

  const res = await fetch(`https://lichess.org/api/puzzle/activity?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/x-ndjson',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Lichess bulmaca geçmişi alınamadı (${res.status})`);
  const text = await res.text();
  const rows = parseNdjson(text);
  const out = [];
  for (const row of rows) {
    const date = Number(row.date);
    if (!Number.isFinite(date) || !timestampMatchesDay(date, target)) continue;
    const puzzle = row.puzzle;
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

export function puzzleStatsFromActivityRows(rows) {
  const passed = rows.filter((r) => r.win).length;
  const failed = rows.filter((r) => !r.win).length;
  return { count: rows.length, passed, failed };
}

async function fetchLichessPuzzleDashboard(token, days = 30) {
  const d = Math.min(365, Math.max(1, Math.floor(days)));
  const res = await fetch(`https://lichess.org/api/puzzle/dashboard/${d}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Lichess bulmaca özeti alınamadı (${res.status})`);
  return res.json();
}

export async function lichessPuzzleDashboardViaEnv(searchParams, env) {
  const studentId = String(searchParams.get('studentId') ?? '').trim();
  const daysRaw = searchParams.get('days');
  const days = daysRaw ? Number(daysRaw) : 30;

  if (!studentId) return { status: 400, body: { error: 'studentId gerekli' } };

  const token = await getStudentLichessToken(env, studentId);
  if (!token) {
    return { status: 200, body: { error: 'Lichess hesabı bağlı değil', connected: false } };
  }

  try {
    const dashboard = await fetchLichessPuzzleDashboard(token, days);
    return { status: 200, body: { connected: true, dashboard } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bulmaca özeti alınamadı';
    return { status: 502, body: { error: msg, connected: true } };
  }
}

function requestOrigin(headers) {
  const raw = headers?.origin ?? headers?.referer;
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (!val) return undefined;
  try {
    return new URL(val).origin;
  } catch {
    return undefined;
  }
}

export async function lichessOAuthTokenViaEnv(body, env, headers = {}) {
  const code = String(body.code ?? '').trim();
  const codeVerifier = String(body.codeVerifier ?? '').trim();
  const studentId = String(body.studentId ?? '').trim();
  const redirectUri =
    String(body.redirectUri ?? '').trim() || getRedirectUri(env, requestOrigin(headers));

  if (!code || !codeVerifier || !studentId) {
    return { status: 400, body: { error: 'code, codeVerifier ve studentId gerekli' } };
  }

  const exchanged = await exchangeLichessOAuthCode({ code, codeVerifier, redirectUri }, env);
  if (!exchanged.ok) {
    return { status: 400, body: { error: exchanged.error } };
  }

  const saved = await saveStudentLichessOAuth(env, {
    studentId,
    token: exchanged.token,
    lichessUsername: exchanged.username,
  });
  if (!saved.ok) {
    return {
      status: saved.missingColumn ? 503 : 500,
      body: { error: saved.error || 'Token kaydedilemedi', missingColumn: !!saved.missingColumn },
    };
  }

  return { status: 200, body: { ok: true, lichessUsername: exchanged.username ?? null } };
}

export async function lichessOAuthStatusViaEnv(studentId, env) {
  const id = String(studentId ?? '').trim();
  if (!id) return { status: 400, body: { error: 'studentId gerekli' } };
  const status = await getStudentLichessOAuthStatus(env, id);
  return { status: 200, body: status };
}

export async function lichessOAuthDisconnectViaEnv(body, env) {
  const studentId = String(body.studentId ?? '').trim();
  if (!studentId) return { status: 400, body: { error: 'studentId gerekli' } };
  const result = await clearStudentLichessOAuth(env, studentId);
  if (!result.ok) return { status: 500, body: { error: result.error || 'Bağlantı kaldırılamadı' } };
  return { status: 200, body: { ok: true } };
}

export async function lichessPuzzleActivityViaEnv(searchParams, env) {
  const studentId = String(searchParams.get('studentId') ?? '').trim();
  const day = String(searchParams.get('day') ?? '').trim() || new Date().toISOString().slice(0, 10);
  const maxRaw = searchParams.get('max');
  const max = maxRaw ? Number(maxRaw) : undefined;

  if (!studentId) return { status: 400, body: { error: 'studentId gerekli' } };

  const token = await getStudentLichessToken(env, studentId);
  if (!token) {
    return { status: 200, body: { error: 'Lichess hesabı bağlı değil', connected: false, puzzles: [] } };
  }

  try {
    const puzzles = await fetchLichessPuzzleActivityForDay(token, day, max);
    return { status: 200, body: { connected: true, puzzles } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bulmaca geçmişi alınamadı';
    return { status: 502, body: { error: msg, connected: true, puzzles: [] } };
  }
}
