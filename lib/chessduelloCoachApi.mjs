/**
 * ChessDuello Coach API — yalnızca sunucu tarafı.
 * Anahtar tarayıcıya, git'e, URL'ye veya yanıtlara yazılmaz.
 * Doküman: GET-only, Bearer cdcoach_live, CORS yok, 60/dk, 10 analytics/dk, 2 eşzamanlı.
 */

const DEFAULT_BASE = 'https://dusoovaoziugdmowceoq.supabase.co/functions/v1/coach-api/v1';
const UUID_RE = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const ALLOWED_PATH = new RegExp(
  `^(?:clan|members(?:/${UUID_RE}(?:/(?:training|analytics|activities))?)?|tournaments(?:/${UUID_RE}(?:/results|/members/${UUID_RE}/attempt)?)?)$`,
);
const MAX_CONCURRENT = 2;
const MAX_PER_MIN = 60;
const MAX_ANALYTICS_PER_MIN = 10;
const UPSTREAM_TIMEOUT_MS = 14_000;
const MAX_RETRIES = 3;

let inFlight = 0;
const waiters = [];
const recentHits = [];
const recentAnalytics = [];

function trimSlash(url) {
  return String(url ?? '').trim().replace(/\/+$/, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function keyLast4(key) {
  const t = String(key ?? '').trim();
  if (!t) return '';
  return t.slice(-4);
}

function looksLikeJwt(key) {
  return /^eyJ[A-Za-z0-9_-]+\./.test(String(key ?? '').trim());
}

function resolveBase(env = {}) {
  return (
    trimSlash(env.CHESSDUELLO_COACH_API_URL) || DEFAULT_BASE
  );
}

function envKey(env = {}) {
  return String(env.CHESSDUELLO_COACH_API_KEY ?? '').trim();
}

function isAnalyticsPath(path) {
  return /\/analytics$/.test(path);
}

function pruneWindow(list, now) {
  const cut = now - 60_000;
  while (list.length && list[0] < cut) list.shift();
}

async function acquireSlot(isAnalytics) {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    const now = Date.now();
    pruneWindow(recentHits, now);
    pruneWindow(recentAnalytics, now);
    const overGeneral = recentHits.length >= MAX_PER_MIN;
    const overAnalytics = isAnalytics && recentAnalytics.length >= MAX_ANALYTICS_PER_MIN;
    if (!overGeneral && !overAnalytics && inFlight < MAX_CONCURRENT) {
      inFlight += 1;
      recentHits.push(now);
      if (isAnalytics) recentAnalytics.push(now);
      return;
    }
    const waitMs = overAnalytics || overGeneral ? 1_200 : 80;
    await new Promise((resolve) => {
      waiters.push(resolve);
      setTimeout(resolve, waitMs);
    });
  }
  throw new Error('ChessDuello istek limiti aşıldı, biraz sonra deneyin.');
}

function releaseSlot() {
  inFlight = Math.max(0, inFlight - 1);
  const next = waiters.shift();
  if (next) next();
}

async function makeSupabase(env = {}) {
  const url = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const key = String(env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function loadClubKey(env, clubId) {
  const id = String(clubId ?? '').trim();
  if (!id) return null;
  try {
    const sb = await makeSupabase(env);
    if (!sb) return null;
    const { data, error } = await sb
      .from('chessduello_coach_settings')
      .select('api_key, key_last4, clan_id, clan_name, last_ok_at, last_error, updated_at')
      .eq('club_id', id)
      .maybeSingle();
    if (error || !data) return null;
    const apiKey = String(data.api_key ?? '').trim();
    if (!apiKey) return null;
    return {
      apiKey,
      keyLast4: String(data.key_last4 ?? keyLast4(apiKey)),
      clanId: data.clan_id ? String(data.clan_id) : '',
      clanName: data.clan_name ? String(data.clan_name) : '',
      lastOkAt: data.last_ok_at ? String(data.last_ok_at) : '',
      lastError: data.last_error ? String(data.last_error) : '',
      updatedAt: data.updated_at ? String(data.updated_at) : '',
      source: 'club',
    };
  } catch {
    return null;
  }
}

async function persistClubMeta(env, clubId, patch) {
  const id = String(clubId ?? '').trim();
  if (!id) return;
  try {
    const sb = await makeSupabase(env);
    if (!sb) return;
    await sb
      .from('chessduello_coach_settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('club_id', id);
  } catch {
    /* tablo henüz yok olabilir */
  }
}

async function resolveAuth(env, clubId) {
  const club = await loadClubKey(env, clubId);
  if (club?.apiKey) return club;
  const apiKey = envKey(env);
  if (!apiKey) return null;
  return {
    apiKey,
    keyLast4: keyLast4(apiKey),
    clanId: '',
    clanName: '',
    lastOkAt: '',
    lastError: '',
    updatedAt: '',
    source: 'env',
  };
}

function publicStatus(auth, extra = {}) {
  return {
    configured: Boolean(auth?.apiKey),
    source: auth?.source || null,
    keyLast4: auth?.apiKey ? auth.keyLast4 : '',
    clanId: auth?.clanId || extra.clanId || '',
    clanName: auth?.clanName || extra.clanName || '',
    lastOkAt: auth?.lastOkAt || extra.lastOkAt || '',
    lastError: auth?.lastError || extra.lastError || '',
    baseUrl: extra.baseUrl || '',
  };
}

function sanitizePath(raw) {
  const path = String(raw ?? '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!path || !ALLOWED_PATH.test(path)) return '';
  return path;
}

function buildQuery(searchParams, path) {
  const qs = new URLSearchParams();
  const limitRaw = Number(searchParams.get('limit'));
  if (Number.isFinite(limitRaw) && limitRaw >= 1) {
    qs.set('limit', String(Math.min(100, Math.round(limitRaw))));
  }
  const after = String(searchParams.get('after') ?? '').trim();
  if (after && after.length <= 200) qs.set('after', after);
  if (isAnalyticsPath(path)) {
    const daysRaw = Number(searchParams.get('days'));
    const days = Number.isFinite(daysRaw) ? Math.round(daysRaw) : 30;
    qs.set('days', String(Math.min(90, Math.max(1, days))));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

function parseRetryAfterMs(headerValue) {
  if (headerValue == null || headerValue === '') return 2_000;
  const raw = String(headerValue).trim();
  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(60_000, Math.max(500, Math.round(asSeconds * 1000)));
  }
  return 2_000;
}

async function chessduelloFetch(env, apiKey, path, searchParams) {
  const base = resolveBase(env);
  const query = buildQuery(searchParams, path);
  const url = `${base}/${path}${query}`;
  let lastErr = 'ChessDuello yanıt vermedi';
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    await acquireSlot(isAnalyticsPath(path));
    try {
      const upstream = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      const text = await upstream.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { error: { code: 'invalid_json', message: text.slice(0, 200) } };
      }
      if (upstream.status === 429 || upstream.status === 503 || upstream.status === 504) {
        lastErr = json?.error?.message || `ChessDuello ${upstream.status}`;
        const wait = parseRetryAfterMs(upstream.headers.get('retry-after'));
        if (attempt < MAX_RETRIES - 1) {
          await sleep(wait);
          continue;
        }
      }
      return {
        status: upstream.status,
        body: json,
        requestId: upstream.headers.get('x-request-id') || json?.meta?.requestId || json?.error?.requestId || '',
      };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : 'ChessDuello bağlantı hatası';
      if (attempt < MAX_RETRIES - 1) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      return { status: 502, body: { error: { code: 'upstream_error', message: lastErr } } };
    } finally {
      releaseSlot();
    }
  }
  return { status: 502, body: { error: { code: 'upstream_error', message: lastErr } } };
}

function pathFromResource(searchParams) {
  const explicit = sanitizePath(searchParams.get('path'));
  if (explicit) return explicit;
  const resource = String(searchParams.get('resource') ?? '').trim().toLowerCase();
  const id = String(searchParams.get('id') ?? '').trim();
  const memberId = String(searchParams.get('memberId') ?? '').trim();
  const tournamentId = String(searchParams.get('tournamentId') ?? '').trim();
  switch (resource) {
    case 'clan':
      return 'clan';
    case 'members':
      return 'members';
    case 'member':
      return sanitizePath(`members/${id}`);
    case 'training':
      return sanitizePath(`members/${memberId}/training`);
    case 'analytics':
      return sanitizePath(`members/${memberId}/analytics`);
    case 'activities':
      return sanitizePath(`members/${memberId}/activities`);
    case 'tournaments':
      return 'tournaments';
    case 'tournament':
      return sanitizePath(`tournaments/${id}`);
    case 'results':
      return sanitizePath(`tournaments/${tournamentId}/results`);
    case 'attempt':
      return sanitizePath(`tournaments/${tournamentId}/members/${memberId}/attempt`);
    default:
      return '';
  }
}

function errorBody(status, message, code = 'error') {
  return {
    status,
    body: { error: { code, message } },
  };
}

export async function chessduelloApiHandler(method, fullUrl, body = {}, env = process.env) {
  const verb = String(method || 'GET').toUpperCase();
  const url = new URL(fullUrl || '/api/chessduello', 'http://local');
  const clubId = String(
    url.searchParams.get('clubId') ||
      (body && typeof body.clubId === 'string' ? body.clubId : '') ||
      '',
  ).trim();

  if (verb === 'GET') {
    const resource = String(url.searchParams.get('resource') ?? '').trim().toLowerCase();
    if (resource === 'status' || resource === '') {
      const auth = await resolveAuth(env, clubId);
      return {
        status: 200,
        body: publicStatus(auth, { baseUrl: resolveBase(env) }),
      };
    }
    const path = pathFromResource(url.searchParams);
    if (!path) return errorBody(400, 'Geçersiz ChessDuello yolu', 'invalid_path');
    const auth = await resolveAuth(env, clubId);
    if (!auth?.apiKey) {
      return errorBody(501, 'ChessDuello anahtarı yok. dash.chessduello.com üzerinden Coach API anahtarını alın ve kaydedin.', 'not_configured');
    }
    const upstream = await chessduelloFetch(env, auth.apiKey, path, url.searchParams);
    if (upstream.status >= 200 && upstream.status < 300 && clubId) {
      const clan = path === 'clan' ? upstream.body?.data : null;
      await persistClubMeta(env, clubId, {
        last_ok_at: new Date().toISOString(),
        last_error: null,
        ...(clan?.id ? { clan_id: clan.id, clan_name: clan.name ?? null } : {}),
      });
    } else if (upstream.status >= 400 && clubId) {
      await persistClubMeta(env, clubId, {
        last_error: upstream.body?.error?.message || `HTTP ${upstream.status}`,
      });
    }
    return { status: upstream.status, body: upstream.body };
  }

  if (verb !== 'POST') {
    return errorBody(405, 'Yalnızca GET ve POST', 'method_not_allowed');
  }

  const action = String(body?.action ?? '').trim().toLowerCase();

  if (action === 'save-key') {
    const apiKey = String(body?.apiKey ?? '').trim();
    if (!clubId) return errorBody(400, 'Kulüp seçilmedi', 'club_required');
    if (!apiKey || apiKey.length < 16) return errorBody(400, 'Geçersiz Coach API anahtarı', 'invalid_key');
    if (looksLikeJwt(apiKey)) {
      return errorBody(400, 'Bu bir Supabase/JWT anahtarı. ChessDuello Coach API anahtarı (cdcoach_live…) kullanın.', 'wrong_key_type');
    }
    const probe = await chessduelloFetch(env, apiKey, 'clan', new URLSearchParams());
    if (probe.status === 401 || probe.status === 403) {
      return errorBody(probe.status, probe.body?.error?.message || 'Anahtar geçersiz veya yetkisiz', 'unauthorized');
    }
    if (probe.status >= 400) {
      return errorBody(probe.status, probe.body?.error?.message || 'ChessDuello anahtar doğrulanamadı', 'upstream_error');
    }
    const clan = probe.body?.data || {};
    const sb = await makeSupabase(env);
    if (!sb) return errorBody(500, 'Supabase yapılandırması eksik; anahtar kaydedilemedi', 'no_db');
    const { error } = await sb.from('chessduello_coach_settings').upsert(
      {
        club_id: clubId,
        api_key: apiKey,
        key_last4: keyLast4(apiKey),
        clan_id: clan.id ?? null,
        clan_name: clan.name ?? null,
        last_ok_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'club_id' },
    );
    if (error) {
      return errorBody(500, `Anahtar kaydedilemedi: ${error.message}. supabase_chessduello.sql dosyasını çalıştırın.`, 'db_error');
    }
    return {
      status: 200,
      body: {
        ok: true,
        ...publicStatus(
          { apiKey, keyLast4: keyLast4(apiKey), source: 'club', clanId: clan.id, clanName: clan.name },
          { clanId: clan.id, clanName: clan.name, lastOkAt: new Date().toISOString() },
        ),
        clan,
      },
    };
  }

  if (action === 'clear-key') {
    if (!clubId) return errorBody(400, 'Kulüp seçilmedi', 'club_required');
    const sb = await makeSupabase(env);
    if (!sb) return errorBody(500, 'Supabase yapılandırması eksik', 'no_db');
    const { error } = await sb.from('chessduello_coach_settings').delete().eq('club_id', clubId);
    if (error) return errorBody(500, error.message, 'db_error');
    const auth = await resolveAuth(env, '');
    return { status: 200, body: { ok: true, ...publicStatus(auth, { baseUrl: resolveBase(env) }) } };
  }

  if (action === 'test') {
    const auth = await resolveAuth(env, clubId);
    if (!auth?.apiKey) {
      return errorBody(501, 'ChessDuello anahtarı yok', 'not_configured');
    }
    const probe = await chessduelloFetch(env, auth.apiKey, 'clan', new URLSearchParams());
    if (probe.status >= 200 && probe.status < 300 && clubId) {
      const clan = probe.body?.data || {};
      await persistClubMeta(env, clubId, {
        last_ok_at: new Date().toISOString(),
        last_error: null,
        clan_id: clan.id ?? null,
        clan_name: clan.name ?? null,
      });
    }
    return { status: probe.status, body: probe.body };
  }

  return errorBody(400, 'Bilinmeyen işlem', 'unknown_action');
}
