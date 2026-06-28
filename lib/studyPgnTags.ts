/** Lichess StudyPgnTags.scala — bölüm PGN başlık tipleri (sıralı). */
export const PGN_TAG_TYPES = [
  'White',
  'WhiteElo',
  'WhiteTitle',
  'WhiteTeam',
  'WhiteFideId',
  'Black',
  'BlackElo',
  'BlackTitle',
  'BlackTeam',
  'BlackFideId',
  'TimeControl',
  'Date',
  'Result',
  'Termination',
  'Site',
  'Event',
  'Round',
  'Board',
  'Annotator',
  'GameId',
] as const;

export type PgnTagType = (typeof PGN_TAG_TYPES)[number];
export type PgnTagPair = [string, string];

const TYPE_ORDER = new Map<string, number>(PGN_TAG_TYPES.map((t, i) => [t.toLowerCase(), i]));

/** PGN içe aktarımında ayrı tutulan başlıklar (pgnTags dizisine girmez). */
const HEADER_SKIP = new Set([
  'fen', 'setup', 'chaptername', 'studyname', 'chapterurl', 'utcdate', 'utctime',
]);

export function sortPgnTags(tags: PgnTagPair[]): PgnTagPair[] {
  return [...tags].sort((a, b) => {
    const ai = TYPE_ORDER.get(a[0].toLowerCase()) ?? 999;
    const bi = TYPE_ORDER.get(b[0].toLowerCase()) ?? 999;
    if (ai !== bi) return ai - bi;
    return a[0].localeCompare(b[0]);
  });
}

export function tagsToMap(tags: PgnTagPair[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const [k, v] of tags) map.set(k.toLowerCase(), v);
  return map;
}

export function getPgnTag(tags: PgnTagPair[] | undefined, name: string): string | undefined {
  if (!tags?.length) return undefined;
  const key = name.toLowerCase();
  return tags.find(([k]) => k.toLowerCase() === key)?.[1];
}

const UNKNOWN_TAG_VALUES = new Set(['', '?', 'unknown']);

/** Lichess StudyPgnTags — boş / bilinmeyen değerleri listeden çıkar. */
export function filterDisplayPgnTags(tags: PgnTagPair[]): PgnTagPair[] {
  return tags.filter(([, v]) => !UNKNOWN_TAG_VALUES.has(String(v ?? '').trim().toLowerCase()));
}

export function defaultChapterPgnTags(
  studyTitle: string,
  chapterTitle: string,
): PgnTagPair[] {
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  return sortPgnTags([
    ['Event', chapterTitle || studyTitle || 'Çalışma'],
    ['Site', 'netchess'],
    ['Date', date],
    ['Result', '*'],
  ]);
}

/** PGN [Header "value"] satırlarından Lichess uyumlu etiket dizisi. */
export function headersToPgnTags(headers: Record<string, string>): PgnTagPair[] {
  const pairs: PgnTagPair[] = [];
  for (const [rawKey, rawVal] of Object.entries(headers)) {
    const key = rawKey.trim();
    const val = (rawVal ?? '').trim();
    if (!key || !val) continue;
    if (HEADER_SKIP.has(key.toLowerCase())) continue;
    const canonical = PGN_TAG_TYPES.find((t) => t.toLowerCase() === key.toLowerCase()) ?? key;
    if (!pairs.some(([k]) => k.toLowerCase() === canonical.toLowerCase())) {
      pairs.push([canonical, val.slice(0, 140)]);
    }
  }
  if (!pairs.some(([k]) => k.toLowerCase() === 'date') && headers.UTCDate?.trim()) {
    const d = headers.UTCDate.trim();
    const t = headers.UTCTime?.trim().slice(0, 5) ?? '';
    pairs.push(['Date', t ? `${d.replace(/-/g, '.')} ${t}` : d.replace(/-/g, '.')]);
  }
  return sortPgnTags(pairs);
}

export function setPgnTagValue(tags: PgnTagPair[], name: string, value: string): PgnTagPair[] {
  const trimmed = value.trim().slice(0, 140);
  const keyLower = name.toLowerCase();
  const canonical = PGN_TAG_TYPES.find((t) => t.toLowerCase() === keyLower) ?? name;
  const next = tags.filter(([k]) => k.toLowerCase() !== keyLower);
  if (trimmed) next.push([canonical, trimmed]);
  return sortPgnTags(next);
}

export function availableNewPgnTagTypes(existing: PgnTagPair[]): string[] {
  const have = new Set(existing.map(([k]) => k.toLowerCase()));
  return PGN_TAG_TYPES.filter((t) => !have.has(t.toLowerCase()));
}

export function formatPgnTagLines(tags: PgnTagPair[]): string[] {
  return tags.map(([k, v]) => `[${k} "${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
}

export type StudyBoardPgnDisplay = {
  /** Üst satır metni (Event veya bölüm başlığı). */
  topLine: string;
  /** Oyun sonucu (* hariç). */
  result: string | null;
  whiteTitle: string | null;
  white: string | null;
  blackTitle: string | null;
  black: string | null;
  /** Etiket sekmesi başlığı: WhiteTitle: bölüm adı */
  tagsTabTitle: string;
};

/** Lichess study — tahta üst/alt PGN etiket satırları. */
export function buildStudyBoardPgnDisplay(
  studyTitle: string,
  chapterTitle: string,
  chapterIndex: number,
  tags: PgnTagPair[] | undefined,
): StudyBoardPgnDisplay {
  const raw = tags?.length ? tags : defaultChapterPgnTags(studyTitle, chapterTitle);
  const filtered = filterDisplayPgnTags(raw);

  const white = getPgnTag(filtered, 'White') ?? null;
  const whiteTitle = getPgnTag(filtered, 'WhiteTitle') ?? null;
  const black = getPgnTag(filtered, 'Black') ?? null;
  const blackTitle = getPgnTag(filtered, 'BlackTitle') ?? null;
  const event = getPgnTag(filtered, 'Event') ?? null;
  const resultRaw = getPgnTag(filtered, 'Result') ?? null;
  const result =
    resultRaw && !UNKNOWN_TAG_VALUES.has(resultRaw.trim().toLowerCase()) && resultRaw.trim() !== '*'
      ? resultRaw.trim()
      : null;

  const chTitle = chapterTitle.trim() || 'Bölüm';
  const topLine = event || chTitle;

  const tagsTabTitle = whiteTitle ? `${whiteTitle}: ${chTitle}` : chTitle;

  return {
    topLine,
    result,
    whiteTitle,
    white,
    blackTitle,
    black,
    tagsTabTitle,
  };
}

export type PgnNotationFooter = {
  result: string;
  subtitle: string | null;
};

/** Hamle listesi altı — Lichess: 1-0 / Zafer Beyazın */
export function pgnResultNotationFooter(tags: PgnTagPair[] | undefined): PgnNotationFooter | null {
  if (!tags?.length) return null;
  const filtered = filterDisplayPgnTags(tags);
  const raw = getPgnTag(filtered, 'Result')?.trim();
  if (!raw || raw === '*' || raw === '?') return null;

  const norm = raw.replace(/\u2013/g, '-').replace(/\u2014/g, '-');
  let subtitle: string | null = null;
  if (norm === '1-0' || norm === '1–0') subtitle = 'Zafer Beyazın';
  else if (norm === '0-1' || norm === '0–1') subtitle = 'Zafer Siyahın';
  else if (norm === '1/2-1/2' || norm === '1/2' || norm === '½-½' || norm === '0.5-0.5') subtitle = 'Berabere';
  else {
    const term = getPgnTag(filtered, 'Termination')?.trim();
    if (term) subtitle = term;
  }

  return { result: raw, subtitle };
}
