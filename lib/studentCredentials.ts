const TR_CHAR_MAP: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u',
  Ç: 'c', Ğ: 'g', İ: 'i', I: 'i', Ö: 'o', Ş: 's', Ü: 'u',
};

/** Ad soyaddan öğrenci giriş kullanıcı adı tabanı üretir. */
export function nameToUsernameBase(name: string): string {
  let s = name.trim().toLowerCase();
  for (const [tr, en] of Object.entries(TR_CHAR_MAP)) {
    s = s.split(tr).join(en);
  }
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, 24);
}

/** Mevcut kullanıcı adlarıyla çakışmayan benzersiz kullanıcı adı. */
export function suggestStudentUsername(
  name: string,
  existingUsernames: Array<string | undefined | null>,
): string {
  const taken = new Set(
    existingUsernames
      .map((u) => String(u ?? '').trim().toLowerCase())
      .filter(Boolean),
  );
  let base = nameToUsernameBase(name);
  if (!base) base = 'ogrenci';
  let candidate = base;
  let n = 1;
  while (taken.has(candidate)) {
    const suffix = String(n);
    const maxBase = Math.max(3, 24 - suffix.length);
    candidate = `${base.slice(0, maxBase)}${suffix}`;
    n += 1;
  }
  return candidate;
}

/** Öğrenci girişi için karma otomatik şifre (harf + rakam). */
export function generateStudentPassword(length = 10): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
