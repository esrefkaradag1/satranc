/** SAN → Lichess tarzı figür notasyonu (♘f3, ♖e1 …). */

const PIECE_FIGURINE: Record<string, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
};

const PIECE_LETTER: Record<string, string> = {
  '♔': 'K',
  '♕': 'Q',
  '♖': 'R',
  '♗': 'B',
  '♘': 'N',
};

export type PieceLetter = 'K' | 'Q' | 'R' | 'B' | 'N';

export type SanFigurineSegment =
  | { type: 'text'; value: string }
  | { type: 'piece'; letter: PieceLetter };

/** Lichess cburnett beyaz taş SVG (hamle listesi). */
export const FIGURINE_PIECE_IMG = (letter: string) =>
  `https://lichess1.org/assets/piece/cburnett/w${letter.toUpperCase()}.svg`;

function isPieceLetter(c: string): c is PieceLetter {
  return /^[NBRQK]$/i.test(c);
}

/** Taş harfini figür sembolüne çevirir. */
export function pieceLetterToFigurine(letter: string): string {
  return PIECE_FIGURINE[letter.toUpperCase()] ?? letter;
}

export function figurineToPieceLetter(symbol: string): string {
  return PIECE_LETTER[symbol] ?? symbol;
}

/**
 * Standart SAN'ı figür notasyonuna dönüştürür.
 * e4, O-O değişmez; Nf3 → ♘f3, exd5=N → exd5=♘
 */
export function sanToFigurine(san: string): string {
  if (!san) return san;
  const s = san.trim();
  if (s.startsWith('O-O')) return s;

  let out = s.replace(/=([NBRQK])/gi, (_, p: string) => `=${pieceLetterToFigurine(p)}`);
  out = out.replace(/^([NBRQK])(?=[a-h1-8xO=])/i, (_, p: string) => pieceLetterToFigurine(p));
  return out;
}

/** Figür notasyonunu standart SAN'a geri çevirir (karşılaştırma için). */
export function figurineToSan(text: string): string {
  if (!text) return text;
  let out = text;
  for (const [fig, letter] of Object.entries(PIECE_LETTER)) {
    out = out.split(fig).join(letter);
  }
  return out;
}

/** SAN'ı taş ikonu + metin parçalarına ayırır (görsel figür notasyonu). */
export function parseSanFigurineSegments(san: string): SanFigurineSegment[] {
  if (!san) return [{ type: 'text', value: san }];
  const s = san.trim();
  if (!s || s.startsWith('O-O')) return [{ type: 'text', value: s }];

  const segments: SanFigurineSegment[] = [];
  let rest = s;

  const lead = rest.match(/^([NBRQK])(?=[a-h1-8x])/i);
  if (lead && isPieceLetter(lead[1]!)) {
    segments.push({ type: 'piece', letter: lead[1]!.toUpperCase() as PieceLetter });
    rest = rest.slice(lead[0].length);
  }

  const promo = rest.match(/=([NBRQK])(?=[+#]|$)/i);
  if (promo && isPieceLetter(promo[1]!)) {
    const idx = rest.indexOf(promo[0]);
    if (idx >= 0) {
      if (idx > 0) segments.push({ type: 'text', value: rest.slice(0, idx + 1) });
      segments.push({ type: 'piece', letter: promo[1]!.toUpperCase() as PieceLetter });
      const tail = rest.slice(idx + promo[0].length);
      if (tail) segments.push({ type: 'text', value: tail });
      return segments;
    }
  }

  if (rest) segments.push({ type: 'text', value: rest });
  if (!segments.length) segments.push({ type: 'text', value: s });
  return segments;
}
