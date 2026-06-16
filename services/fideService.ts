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
