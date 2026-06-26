import type { Club } from '../types';

export function slugifyClubUsername(name: string): string {
  return name
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'kulup';
}

export function suggestClubUsername(name: string, clubs: Club[], excludeId?: string): string {
  const base = slugifyClubUsername(name);
  let candidate = base;
  let n = 2;
  while (clubs.some((c) => c.id !== excludeId && (c.loginUsername || '').trim().toLowerCase() === candidate)) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

export function findClubForLogin(clubs: Club[], identifier: string): Club | undefined {
  const raw = identifier.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  const slugInput = slugifyClubUsername(raw);

  for (const c of clubs) {
    const loginUser = (c.loginUsername || '').trim();
    if (loginUser) {
      if (loginUser.toLowerCase() === lower) return c;
      if (slugifyClubUsername(loginUser) === slugInput) return c;
    }
  }

  for (const c of clubs) {
    if (slugifyClubUsername(c.name) === slugInput) return c;
    if ((c.name || '').trim().toLowerCase() === lower) return c;
  }

  return undefined;
}

export function isClubUsernameTaken(clubs: Club[], username: string, excludeId?: string): boolean {
  const lower = username.trim().toLowerCase();
  if (!lower) return false;
  return clubs.some((c) => c.id !== excludeId && (c.loginUsername || '').trim().toLowerCase() === lower);
}
