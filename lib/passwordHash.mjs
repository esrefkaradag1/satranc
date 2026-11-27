/**
 * Personel şifreleri (kulüp, antrenör) için tek yönlü saklama — sunucu (Node) tarafı.
 * Biçim: pbkdf2$sha256$<iterasyon>$<tuz base64>$<özet base64>
 * Aynı biçim tarayıcıda lib/passwordHash.ts (WebCrypto) ile üretilir; ek paket gerekmez.
 *
 * Geçiş: eski kayıtlar düz metin. verifyPassword düz metni de kabul eder ve
 * needsRehash=true döndürür; giriş başarılıysa çağıran kaydı özete çevirir.
 */
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

export const HASH_PREFIX = 'pbkdf2$';
const ITERATIONS = 210_000;
const KEY_LEN = 32;

export function isPasswordHash(value) {
  return typeof value === 'string' && value.startsWith(HASH_PREFIX);
}

export function hashPassword(plain) {
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(String(plain), salt, ITERATIONS, KEY_LEN, 'sha256');
  return `pbkdf2$sha256$${ITERATIONS}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

function safeEqualStrings(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  if (x.length !== y.length) {
    timingSafeEqual(x, x); // süreyi eşitle
    return false;
  }
  return timingSafeEqual(x, y);
}

/**
 * @returns {{ ok: boolean, needsRehash: boolean }}
 */
export function verifyPassword(plain, stored) {
  const candidate = String(plain ?? '');
  const saved = String(stored ?? '');
  if (!candidate || !saved) return { ok: false, needsRehash: false };
  if (!isPasswordHash(saved)) {
    // Eski düz metin kayıt
    return { ok: safeEqualStrings(candidate, saved.trim()), needsRehash: true };
  }
  const parts = saved.split('$');
  if (parts.length !== 5 || parts[1] !== 'sha256') return { ok: false, needsRehash: false };
  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations < 1) return { ok: false, needsRehash: false };
  const salt = Buffer.from(parts[3], 'base64');
  const expected = Buffer.from(parts[4], 'base64');
  const derived = pbkdf2Sync(candidate, salt, iterations, expected.length, 'sha256');
  const ok = derived.length === expected.length && timingSafeEqual(derived, expected);
  return { ok, needsRehash: ok && iterations < ITERATIONS };
}
