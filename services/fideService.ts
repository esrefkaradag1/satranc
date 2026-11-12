/**
 * FIDE oyuncu bilgisi: Lichess API üzerinden FIDE verisi çekilir.
 * Kaynak: https://lichess.org/api#tag/FIDE
 */

const LICHESS_FIDE_API = 'https://lichess.org/api/fide';

export interface FidePlayer {
  id: number;
  name: string;
  federation: string;
  year?: number;
  inactive?: boolean;
  /** Standart (klasik) FIDE rating */
  standard?: number;
  rapid?: number;
  blitz?: number;
}

/**
 * FIDE ID ile oyuncu bilgisini çeker (Lichess, FIDE veritabanından sağlar).
 */
export async function fetchFidePlayer(fideId: string): Promise<FidePlayer | null> {
  const id = String(fideId).trim().replace(/\D/g, '');
  if (!id) return null;
  try {
    const res = await fetch(`${LICHESS_FIDE_API}/player/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return {
      id: Number(data.id) || 0,
      name: String(data.name ?? ''),
      federation: String(data.federation ?? ''),
      year: data.year != null ? Number(data.year) : undefined,
      inactive: Boolean(data.inactive),
      standard: data.standard != null ? Number(data.standard) : undefined,
      rapid: data.rapid != null ? Number(data.rapid) : undefined,
      blitz: data.blitz != null ? Number(data.blitz) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Oyuncu adı ile FIDE veritabanında arama yapar.
 */
export async function searchFidePlayer(query: string): Promise<FidePlayer[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(`${LICHESS_FIDE_API}/player?q=${encodeURIComponent(q)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as any[];
    if (!Array.isArray(data)) return [];

    return data.map((p) => ({
      id: Number(p.id) || 0,
      name: String(p.name ?? ''),
      federation: String(p.federation ?? ''),
      year: p.year != null ? Number(p.year) : undefined,
      inactive: Boolean(p.inactive),
      standard: p.standard != null ? Number(p.standard) : undefined,
      rapid: p.rapid != null ? Number(p.rapid) : undefined,
      blitz: p.blitz != null ? Number(p.blitz) : undefined,
    }));
  } catch {
    return [];
  }
}

/** Türkçe harfleri sadeleştirip küçük harfe çevirir: "GÖGER" -> "goger" */
function foldName(value: string): string {
  return value
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s,]/g, ' ');
}

function nameTokens(value: string): string[] {
  return foldName(value).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
}

/**
 * İsim aramasının sonuçlarından öğrenciye ait FIDE kaydını seçer.
 * FIDE adı "Soyad, Ad" biçimindedir. Ad VE soyad eşleşmeli, doğum yılı biliniyorsa o da tutmalı;
 * birden fazla aday kalırsa (ya da hiç yoksa) otomatik atama yapılmaz — yanlış kişiyi bağlamaktansa boş bırak.
 * Eski hata: yalnızca doğum yılına bakılıyordu; "Defne Göger" araması "Karaman, Defne"yi bağlıyordu.
 */
export function pickFideMatchForStudent(
  results: FidePlayer[],
  studentName: string,
  birthYear: number | null,
): FidePlayer | null {
  const studentTokens = new Set(nameTokens(studentName));
  if (studentTokens.size < 2) return null;
  const candidates = results.filter((p) => {
    if (!p.id) return false;
    if (birthYear && p.year && p.year !== birthYear) return false;
    const [surnamePart = '', givenPart = ''] = foldName(p.name).split(',');
    const surnames = surnamePart.split(/\s+/).filter(Boolean);
    const givens = givenPart.split(/\s+/).filter(Boolean);
    if (surnames.length === 0 || givens.length === 0) return false;
    return surnames.every((t) => studentTokens.has(t)) && givens.some((t) => studentTokens.has(t));
  });
  return candidates.length === 1 ? candidates[0]! : null;
}

/**
 * Öğrenci kaydından FIDE profilini çözer (ID yoksa ad + soyad + doğum yılı ile arar).
 */
export async function resolveFideProfileForStudent(
  student: { fideId?: string; name?: string; birthDate?: string },
): Promise<{ profile: FidePlayer | null; resolvedId?: string }> {
  let id = student.fideId?.trim().replace(/\D/g, '') || '';
  if (!id && student.name?.trim()) {
    const birthYear = student.birthDate ? Number(student.birthDate.slice(0, 4)) : null;
    const searchResults = await searchFidePlayer(student.name);
    const matched = pickFideMatchForStudent(searchResults, student.name, birthYear);
    if (matched?.id) id = String(matched.id);
  }
  if (!id) return { profile: null };
  const profile = await fetchFidePlayer(id);
  return { profile, resolvedId: id };
}

/** Federasyon kodu için tam ad (ör. TUR → Türkiye) */
export function federationLabel(code: string): string {
  const labels: Record<string, string> = {
    TUR: 'Türkiye',
    USA: 'ABD',
    RUS: 'Rusya',
    GER: 'Almanya',
    FRA: 'Fransa',
    ENG: 'İngiltere',
    IND: 'Hindistan',
    CHN: 'Çin',
    ESP: 'İspanya',
    ITA: 'İtalya',
    GRE: 'Yunanistan',
    AZE: 'Azerbaycan',
    ARM: 'Ermenistan',
    GEO: 'Gürcistan',
    UKR: 'Ukrayna',
    HUN: 'Macaristan',
    POL: 'Polonya',
    NED: 'Hollanda',
    CUB: 'Küba',
    BRA: 'Brezilya',
    ARG: 'Arjantin',
    EGY: 'Mısır',
    IRAN: 'İran',
    KAZ: 'Kazakistan',
    UZB: 'Özbekistan',
  };
  return labels[code?.toUpperCase() ?? ''] ?? code ?? '—';
}
