/**
 * Sunucu API'leri için kimlik doğrulama — Faz 2b.
 *
 * Sorun: /api/* uç noktaları tam yetkili Supabase anahtarıyla çalışıyor ama çağıranı
 * doğrulamıyordu. Giriş yapmamış biri tüm mesajları okuyabiliyor (/api/site-messages), kulübün
 * WhatsApp hesabından veliye mesaj gönderebiliyor (/api/whatsapp?action=send) ve başka öğrencilerin
 * adına kayıt açabiliyordu. Veritabanı yetkileri (RLS) bunları kapsamaz: sunucu RLS'i atlar.
 *
 * Çözüm: tek kural tablosu (ROUTE_POLICIES) + tek doğrulama fonksiyonu (authorizeApiRequest).
 * Docker (server/docker-api.mjs), geliştirme sunucusu (vite.config.ts) ve Vercel (api/*.ts →
 * lib/withApiAuth.ts) aynı tabloyu kullanır; bir uç nokta bir ortamda unutulamaz.
 *
 * Belirteç: /api/login'in verdiği, JWT_SECRET ile imzalı oturum belirteci (Authorization: Bearer).
 * Tarayıcı bunu /api isteklerine otomatik ekler (services/apiAuthFetch.ts).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * access:
 *   public  — giriş gerektirmez (giriş, başvuru, veli onayı, herkese açık Chess.com verisi)
 *   cron    — uç nokta kendi CRON_SECRET kontrolünü yapar; burada dokunulmaz
 *   session — geçerli oturum; öğrenci/veli yalnızca KENDİ öğrenci kimliğiyle
 *   staff   — yalnızca personel (admin/kulüp/antrenör)
 */
export const ROUTE_POLICIES = {
  health: { access: 'public' },
  login: { access: 'public' },
  'auth-parent': { access: 'public' },
  'submit-application': { access: 'public' },
  'load-parent-consent': { access: 'public' }, // tek kullanımlık bağlantı belirteciyle çalışır
  'submit-parent-signature': { access: 'public' },
  'mobile-auth': { access: 'public' }, // mobil uygulamanın kendi girişi
  'mobile-push': { access: 'public' }, // mobil cihaz kaydı (mobil oturumu ayrı)
  'chesscom-games': { access: 'public' }, // herkese açık Chess.com verisi (veritabanı yok)
  'chesscom-member-stats': { access: 'public' },
  'chesscom-puzzle': { access: 'public' },
  'chesscom-puzzle-latest': { access: 'public' },
  'chesscom-recent-puzzles': { access: 'public' },
  'chesscom-puzzle-chart': { access: 'public' },
  nightly: { access: 'cron' },
  // training-notify: GET zamanlayıcı (CRON_SECRET), POST oturum
  'training-notify': { access: 'session', getAccess: 'cron' },
  whatsapp: { access: 'staff', memberActions: ['parent-notifications'] },
  'site-messages': { access: 'session', special: 'site-messages' },
  // Öğrenci paneli kendi UKD'sini yeniler (TSF herkese açık sorgu sitesi) — giriş yeterli
  'fetch-ukd': { access: 'session' },
  'platform-day-sync': { access: 'session', getAccess: 'cron' },
  // Kulübün API anahtarı ve tüm üyeler — personel; öğrenci/veli yalnızca kendi özetini okur
  chessduello: { access: 'staff', special: 'chessduello' },
  // Diğerleri (ai, homework-attempt, live-lesson-*, study-*, lichess-*, external-game-snapshot,
  // platform-week-stats): varsayılan 'session'
};

const DEFAULT_POLICY = { access: 'session' };
const STUDENT_ID_FIELDS = ['studentId', 'student_id', 'studentid', 'p_student_id'];

function envValue(env, ...names) {
  for (const n of names) {
    const v = String(env?.[n] ?? '').trim();
    if (v) return v;
  }
  return '';
}

function header(headers, name) {
  if (!headers) return '';
  const raw = typeof headers.get === 'function' ? headers.get(name) : headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '');
}

/** HS256 oturum belirtecini doğrular; geçerliyse iddiaları, değilse null döner. */
export function verifySessionToken(token, env) {
  const secret = envValue(env, 'SUPABASE_JWT_SECRET', 'JWT_SECRET');
  if (!secret || !token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256') return null;
    const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    const given = Buffer.from(parts[2], 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null;
    if (!claims.app_role) return null; // yalnızca /api/login belirteçleri (anon/service anahtarı değil)
    return claims;
  } catch {
    return null;
  }
}

export function sessionFromHeaders(headers, env) {
  const auth = header(headers, 'authorization');
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? verifySessionToken(m[1], env) : null;
}

export function isStaffClaims(c) {
  return !!c && ['admin', 'club', 'coach'].includes(c.app_role);
}

function isMemberClaims(c) {
  return !!c && ['student', 'parent'].includes(c.app_role) && !!c.student_id;
}

/** İstekteki tüm öğrenci kimliği alanları (gövde, iç içe record/message, sorgu). */
function requestedStudentIds(body, query) {
  const found = [];
  const scan = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const f of STUDENT_ID_FIELDS) {
      const v = obj[f];
      if (v !== undefined && v !== null && String(v).trim()) found.push(String(v).trim());
    }
  };
  scan(body);
  scan(body?.record);
  scan(body?.message);
  scan(body?.attempt);
  scan(query);
  return found;
}

function deny(status, error) {
  return { status, body: { error } };
}

/**
 * @param {{ route: string, method?: string, headers: any, query?: Record<string,string>, body?: any, env: any }} req
 * @returns {null | { status: number, body: { error: string } }} null = izin verildi
 */
export function authorizeApiRequest({ route, method = 'GET', headers, query = {}, body = {}, env }) {
  const name = String(route ?? '').replace(/^\/?api\//, '').replace(/\/+$/, '');
  const policy = ROUTE_POLICIES[name] ?? DEFAULT_POLICY;
  const access = String(method).toUpperCase() === 'GET' && policy.getAccess ? policy.getAccess : policy.access;
  if (access === 'public' || access === 'cron') return null;

  const claims = sessionFromHeaders(headers, env);
  if (!claims) return deny(401, 'Oturum gerekli. Lütfen yeniden giriş yapın.');
  if (isStaffClaims(claims)) return null;
  if (!isMemberClaims(claims)) return deny(403, 'Bu işlem için yetkiniz yok.');

  // ── Öğrenci / veli ──
  const own = String(claims.student_id);
  if (policy.special === 'chessduello') {
    const resource = String(query?.resource ?? '').trim().toLowerCase();
    const sid = String(query?.studentId ?? '').trim();
    if (String(method).toUpperCase() !== 'GET' || resource !== 'student-summary' || sid !== own) {
      return deny(403, 'Bu işlem yalnızca personel içindir.');
    }
    return null;
  }
  if (access === 'staff') {
    const action = String(query?.action ?? body?.action ?? '');
    if (!policy.memberActions?.includes(action)) return deny(403, 'Bu işlem yalnızca personel içindir.');
  }
  if (requestedStudentIds(body, query).some((id) => id !== own)) {
    return deny(403, 'Yalnızca kendi kaydınız için işlem yapabilirsiniz.');
  }
  if (policy.special === 'site-messages') {
    const allowed = new Set([`parent:${own}`, `student:${own}`]);
    const ok = (cid) => allowed.has(cid) || String(cid).startsWith('group:');
    if (String(method).toUpperCase() === 'GET') {
      const cid = String(query?.conversationId ?? '');
      if (!cid || !ok(cid)) return deny(403, 'Yalnızca kendi konuşmalarınızı görebilirsiniz.');
    } else {
      const msg = body?.message ?? body;
      const cid = String(msg?.conversationId ?? msg?.conversation_id ?? '');
      if (!allowed.has(cid)) return deny(403, 'Yalnızca kendi konuşmanıza yazabilirsiniz.');
    }
  }
  return null;
}
