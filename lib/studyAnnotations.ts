export const STUDY_ANNOTATION_SYMBOLS = [
  { sym: '!', label: 'Good move', color: 'text-emerald-500', key: '1' },
  { sym: '!!', label: 'Brilliant move', color: 'text-teal-400 font-extrabold', key: '2' },
  { sym: '?', label: 'Mistake', color: 'text-rose-500', key: '3' },
  { sym: '??', label: 'Blunder', color: 'text-rose-600 font-extrabold', key: '4' },
  { sym: '!?', label: 'Interesting move', color: 'text-blue-400', key: '5' },
  { sym: '?!', label: 'Dubious move', color: 'text-amber-500', key: '6' },
] as const;

export type StudyAnnotationSymbol = (typeof STUDY_ANNOTATION_SYMBOLS)[number]['sym'];

const KNOWN_GLYPH_ORDER: StudyAnnotationSymbol[] = ['!!', '??', '!?', '?!', '!', '?'];

/** Hamle başına kayıtlı sembol(ler) — string veya dizi */
export function parseMoveGlyphs(raw: string | string[] | undefined | null): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  const s = String(raw).trim();
  if (!s) return [];
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    let matched = false;
    for (const g of KNOWN_GLYPH_ORDER) {
      if (s.slice(i, i + g.length) === g) {
        out.push(g);
        i += g.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      if (/\s/.test(s[i])) {
        i += 1;
        continue;
      }
      out.push(s[i]);
      i += 1;
    }
  }
  return out.length > 0 ? [out[out.length - 1]] : [];
}

export function formatMoveGlyphs(glyphs: string[]): string {
  const one = glyphs.length > 0 ? glyphs[glyphs.length - 1] : '';
  return one;
}

/** Hamle başına en fazla bir sembol — aynı sembole tekrar basınca kaldırılır, farklı sembol eskisinin yerine geçer */
export function toggleMoveGlyph(glyphs: string[], sym: string): string[] {
  const current = glyphs.length > 0 ? glyphs[glyphs.length - 1] : null;
  if (current === sym) return [];
  return [sym];
}

export function moveHasGlyph(raw: string | string[] | undefined | null, sym: string): boolean {
  return parseMoveGlyphs(raw).includes(sym);
}

export function studyAnnotationFromKey(key: string): StudyAnnotationSymbol | null {
  const hit = STUDY_ANNOTATION_SYMBOLS.find((s) => s.key === key);
  return hit?.sym ?? null;
}

export function glyphSymbolColorClass(sym: string): string {
  const hit = STUDY_ANNOTATION_SYMBOLS.find((s) => s.sym === sym);
  return hit?.color ?? 'text-[#bf811d]';
}

/** Lichess tarzı dairesel rozet arka planı */
export function glyphBadgeClass(sym: string): string {
  switch (sym) {
    case '!':
      return 'bg-emerald-500';
    case '!!':
      return 'bg-teal-400';
    case '?':
      return 'bg-rose-500';
    case '??':
      return 'bg-rose-600';
    case '!?':
      return 'bg-blue-500';
    case '?!':
      return 'bg-amber-500';
    default:
      return 'bg-[#bf811d]';
  }
}

/** Karenin sağ-üst köşesi — rozetler taşın üstünde */
export function squareToGlyphBadgeAnchor(
  square: string,
  orientation: 'white' | 'black' = 'white',
): { left: string; top: string } {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1] ?? '1', 10) - 1;
  if (orientation === 'white') {
    return {
      left: `${((file + 1) / 8) * 100}%`,
      top: `${((7 - rank) / 8) * 100}%`,
    };
  }
  return {
    left: `${((7 - file) / 8) * 100}%`,
    top: `${(rank / 8) * 100}%`,
  };
}

export function groupGlyphEntriesBySquare(
  entries: GlyphSquareEntry[],
): Map<string, GlyphSquareEntry[]> {
  const map = new Map<string, GlyphSquareEntry[]>();
  for (const e of entries) {
    const sq = e.square.toLowerCase();
    const list = map.get(sq) ?? [];
    list.push(e);
    map.set(sq, list);
  }
  return map;
}

export type GlyphSquareEntry = { square: string; symbol: string; ply: number };

/** Hamle listesinden her sembolün gittiği kareyi hesaplar */
type ChessGameLike = {
  history: (opts?: { verbose: boolean }) => Array<{ to: string }>;
};

export function findPlyByDestinationSquare(
  startFen: string,
  moves: string[],
  square: string,
  makeGame: (fen: string) => ChessGameLike,
  applyMoveFn: (game: ChessGameLike, san: string) => boolean,
): number | null {
  const sq = square.toLowerCase();
  let game: ChessGameLike;
  try {
    game = makeGame(startFen);
  } catch {
    return null;
  }
  for (let ply = 0; ply < moves.length; ply++) {
    const san = moves[ply];
    if (!san?.trim()) break;
    if (!applyMoveFn(game, san)) break;
    const hist = game.history({ verbose: true });
    const last = hist[hist.length - 1];
    if (last?.to?.toLowerCase() === sq) return ply;
  }
  return null;
}

export function getDestinationSquareForPly(
  startFen: string,
  moves: string[],
  ply: number,
  makeGame: (fen: string) => ChessGameLike,
  applyMoveFn: (game: ChessGameLike, san: string) => boolean,
): string | null {
  if (ply < 0 || ply >= moves.length) return null;
  let game: ChessGameLike;
  try {
    game = makeGame(startFen);
  } catch {
    return null;
  }
  for (let i = 0; i <= ply; i++) {
    const san = moves[i];
    if (!san?.trim()) return null;
    if (!applyMoveFn(game, san)) return null;
    if (i === ply) {
      const hist = game.history({ verbose: true });
      const last = hist[hist.length - 1];
      return last?.to ? String(last.to).toLowerCase() : null;
    }
  }
  return null;
}

export function buildGlyphSquareEntries(
  startFen: string,
  moves: string[],
  moveAnnotations: Record<number, string | string[]>,
  maxPly: number,
  makeGame: (fen: string) => ChessGameLike,
  applyMoveFn: (game: ChessGameLike, san: string) => boolean,
): GlyphSquareEntry[] {
  const entries: GlyphSquareEntry[] = [];
  const limit = Math.max(0, Math.min(maxPly, moves.length));
  let game: ChessGameLike;
  try {
    game = makeGame(startFen);
  } catch {
    return entries;
  }
  for (let ply = 0; ply < limit; ply++) {
    const san = moves[ply];
    if (!san?.trim()) break;
    if (!applyMoveFn(game, san)) break;
    const symbols = parseMoveGlyphs(moveAnnotations[ply]);
    if (symbols.length > 0) {
      const hist = game.history({ verbose: true });
      const last = hist[hist.length - 1];
      if (last?.to) {
        const sq = String(last.to).toLowerCase();
        for (const symbol of symbols) {
          entries.push({ square: sq, symbol, ply });
        }
      }
    }
  }
  return entries;
}

/** Rozet yalnızca o anki tahtada taş bulunan karelerde gösterilir */
export function filterGlyphEntriesForCurrentBoard(
  entries: GlyphSquareEntry[],
  boardFen: string,
  makeGame: (fen: string) => { get: (sq: string) => unknown | null },
): GlyphSquareEntry[] {
  if (!entries.length) return entries;
  try {
    const game = makeGame(boardFen);
    return entries.filter((e) => Boolean(game.get(e.square)));
  } catch {
    return entries;
  }
}
