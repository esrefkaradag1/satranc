const SEARCH_CHAR_MAP: Record<string, string> = {
  c: 'c',
  ç: 'c',
  ç: 'c',
  g: 'g',
  ğ: 'g',
  ğ: 'g',
  i: 'i',
  ı: 'i',
  o: 'o',
  ö: 'o',
  ö: 'o',
  s: 's',
  ş: 's',
  ş: 's',
  u: 'u',
  ü: 'u',
  ü: 'u',
};

export function normalizeSearchText(value: string | undefined | null): string {
  const raw = String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD');

  let out = '';
  for (const ch of raw) {
    if (/[\u0300-\u036f]/.test(ch)) continue;
    out += SEARCH_CHAR_MAP[ch] ?? ch;
  }
  return out;
}

export function searchIncludesText(source: string | undefined | null, query: string | undefined | null): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return normalizeSearchText(source).includes(normalizedQuery);
}
