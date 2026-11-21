/**
 * Personel şifreleri — tarayıcı tarafı (WebCrypto). Biçim sunucudaki lib/passwordHash.mjs ile
 * aynıdır: pbkdf2$sha256$<iterasyon>$<tuz base64>$<özet base64>. Yeni şifre kaydedilirken
 * düz metin veritabanına hiç yazılmaz.
 */

export const HASH_PREFIX = 'pbkdf2$';
const ITERATIONS = 210_000;

export function isPasswordHash(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(HASH_PREFIX);
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(plain), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    key,
    256,
  );
  return `pbkdf2$sha256$${ITERATIONS}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

/** Düz metinse özete çevirir; zaten özetse ya da boşsa olduğu gibi döner. */
export async function ensurePasswordHash(value: string | undefined): Promise<string | undefined> {
  const v = value?.trim();
  if (!v || isPasswordHash(v)) return value;
  return hashPassword(v);
}
