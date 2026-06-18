import { Chess } from 'chess.js';
import type { Puzzle } from '../types';

const LICHESS_API = 'https://lichess.org/api';

const BATCH_DIFFICULTIES = ['easiest', 'easier', 'normal', 'harder', 'hardest'] as const;
type BatchDifficulty = (typeof BATCH_DIFFICULTIES)[number];

const THEME_TR: Record<string, string> = {
  mate: 'Mat',
  mateIn1: '1 Hamlede Mat',
  mateIn2: '2 Hamlede Mat',
  mateIn3: '3 Hamlede Mat',
  mateIn4: '4 Hamlede Mat',
  mateIn5: '5+ Hamlede Mat',
  fork: 'Çatal',
  pin: 'Tutuş',
  skewer: 'Şiş',
  discoveredAttack: 'Açma',
  doubleCheck: 'Çift Şah',
  sacrifice: 'Fedâ',
  deflection: 'Saptırma',
  decoy: 'Tuzak',
  interference: 'Engelleme',
  clearance: 'Temizleme',
  backRankMate: 'Sırt Sıra Matı',
  smotheredMate: 'Boğma Mat',
  hookMate: 'Kanca Mat',
  anastasiaMate: 'Anastasia Matı',
  arabianMate: 'Arap Matı',
  doubleBishopMate: 'Çift Fil Matı',
  promotion: 'Terfi',
  underPromotion: 'Alt Terfi',
  castling: 'Rok',
  enPassant: 'Geçerken Alma',
  endgame: 'Oyun Sonu',
  middlegame: 'Orta Oyun',
  opening: 'Açılış',
  pawnEndgame: 'Piyon Finali',
  rookEndgame: 'Kale Finali',
  bishopEndgame: 'Fil Finali',
  knightEndgame: 'At Finali',
  queenEndgame: 'Vezir Finali',
  queenRookEndgame: 'Vezir-Kale Finali',
  crushing: 'Ezici',
  advantage: 'Avantaj',
  equality: 'Eşitlik',
  defensiveMove: 'Savunma Hamlesi',
  attackingMove: 'Atak Hamlesi',
  quietMove: 'Sessiz Hamle',
  zugzwang: 'Zugzwang',
  intermezzo: 'Ara Hamle',
  trappedPiece: 'Tuzağa Düşmüş Taş',
  hangingPiece: 'Asılı Taş',
  kingsideAttack: 'Şah Kanadı Atağı',
  queensideAttack: 'Vezir Kanadı Atağı',
  capturingDefender: 'Savunucuyu Yeme',
  exposedKing: 'Açık Şah',
  short: 'Kısa',
  long: 'Uzun',
  veryLong: 'Çok Uzun',
  oneMove: 'Tek Hamle',
  master: 'Usta',
  masterVsMaster: 'Usta vs Usta',
  superGM: 'Süper GM',
};

function ratingToDifficulty(rating: number): 'Kolay' | 'Orta' | 'Zor' {
  if (rating < 1200) return 'Kolay';
  if (rating < 1800) return 'Orta';
  return 'Zor';
}

function ratingToPoints(rating: number): number {
  if (rating < 1000) return 5;
  if (rating < 1200) return 10;
  if (rating < 1500) return 15;
  if (rating < 1800) return 20;
  if (rating < 2100) return 30;
  return 50;
}

function translateThemes(themes: string): { category: string; theme: string } {
  const parts = themes.split(' ').filter(Boolean);
  const translated = parts.map(t => THEME_TR[t] || t);

  const matTheme = parts.find(t => t.startsWith('mateIn'));
  if (matTheme) return { category: 'Mat', theme: translated.join(', ') };

  const tactical = ['fork', 'pin', 'skewer', 'discoveredAttack', 'sacrifice', 'deflection', 'decoy'];
  const found = parts.find(t => tactical.includes(t));
  if (found) return { category: THEME_TR[found] || 'Taktik', theme: translated.join(', ') };

  const phase = parts.find(t => ['endgame', 'middlegame', 'opening'].includes(t));
  if (phase) return { category: THEME_TR[phase] || 'Genel', theme: translated.join(', ') };

  return { category: 'Genel', theme: translated.join(', ') };
}

export interface LichessPuzzleCSVRow {
  PuzzleId: string;
  FEN: string;
  Moves: string;
  Rating: number;
  RatingDeviation: number;
  Popularity: number;
  NbPlays: number;
  Themes: string;
  GameUrl: string;
  OpeningTags?: string;
}

export function csvRowToPuzzle(row: LichessPuzzleCSVRow): Puzzle {
  const { category, theme } = translateThemes(row.Themes);
  const difficulty = ratingToDifficulty(row.Rating);
  /** Lichess CSV: Moves = tüm çözüm hattı (UCI); ilk hamle rakibin kurulumu — oynatma sırasında uygulanır. */
  const uciMoves = row.Moves.trim().split(/\s+/).filter(Boolean);

  const themeLabels = row.Themes.split(' ').filter(Boolean);
  const matMatch = themeLabels.find(t => t.startsWith('mateIn'));
  let title = '';
  if (matMatch) {
    const n = matMatch.replace('mateIn', '');
    title = `${n} Hamlede Mat`;
  } else {
    const mainTheme = themeLabels[0];
    title = THEME_TR[mainTheme] || mainTheme || 'Bulmaca';
  }
  title += ` (${row.Rating})`;

  return {
    id: row.PuzzleId,
    lichessId: row.PuzzleId,
    fen: row.FEN,
    solution: uciMoves,
    title,
    difficulty,
    points: ratingToPoints(row.Rating),
    category,
    theme,
    hint: uciMoves[1] || uciMoves[0] || '',
    lichessThemes: row.Themes,
    source: 'lichess',
  };
}

/** Basit CSV satırı (tırnaklı alanlar); Lichess puzzle dump'ında FEN virgül içermez */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseCSVLine(line: string): LichessPuzzleCSVRow | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const parts = splitCsvLine(trimmed);
  if (parts.length < 8) return null;

  const rating = parseInt(parts[3], 10);
  if (isNaN(rating)) return null;

  return {
    PuzzleId: parts[0].trim(),
    FEN: parts[1].trim(),
    Moves: parts[2].trim(),
    Rating: rating,
    RatingDeviation: parseInt(parts[4], 10) || 0,
    Popularity: parseInt(parts[5], 10) || 0,
    NbPlays: parseInt(parts[6], 10) || 0,
    Themes: parts[7] || '',
    GameUrl: parts[8] || '',
    OpeningTags: parts[9] || '',
  };
}

async function decodeZstdToUtf8(bytes: Uint8Array): Promise<string> {
  // zstd-codec loads a WASM module; keep it lazy.
  const mod = await import('zstd-codec');
  const ZstdCodec = (mod as any).ZstdCodec as { run: (cb: (zstd: any) => void) => void };
  const zstd = await new Promise<any>((resolve) => ZstdCodec.run(resolve));
  const simple = new zstd.Simple();
  const decompressed = simple.decompress(bytes) as Uint8Array;
  return new TextDecoder('utf-8').decode(decompressed);
}

/**
 * Lichess puzzle dump dosyasını (CSV veya CSV.ZST) UTF-8 metne çevirir.
 * - `*.csv`, `*.txt`: doğrudan `file.text()`
 * - `*.zst`: tarayıcı içinde zstd açıp metin döndürür
 */
export async function lichessPuzzleFileToText(file: File): Promise<string> {
  const name = (file?.name ?? '').toLowerCase().trim();
  if (name.endsWith('.zst')) {
    const buf = await file.arrayBuffer();
    return decodeZstdToUtf8(new Uint8Array(buf));
  }
  return await file.text();
}

function fenFromPgnAndPly(pgn: string, initialPly: number): string | null {
  try {
    const temp = new Chess();
    temp.loadPgn(pgn, { strict: false });
    const history = temp.history({ verbose: true });
    const board = new Chess();
    const ply = Math.max(0, Math.min(initialPly, history.length));
    for (let i = 0; i < ply; i++) {
      board.move(history[i]);
    }
    return board.fen();
  } catch {
    return null;
  }
}

function puzzleTitleFromThemes(themes: string[], rating: number): string {
  const themeLabels = themes.filter(Boolean);
  const matMatch = themeLabels.find((t) => t.startsWith('mateIn'));
  if (matMatch) {
    const n = matMatch.replace('mateIn', '');
    return `${n} Hamlede Mat (${rating})`;
  }
  const mainTheme = themeLabels[0];
  const label = mainTheme ? (THEME_TR[mainTheme] || mainTheme) : 'Bulmaca';
  return `${label} (${rating})`;
}

/** Lichess /api/puzzle/daily ve /api/puzzle/{id} JSON → uygulama Puzzle */
function lichessApiResponseToPuzzle(
  data: { game?: { pgn?: string }; puzzle: Record<string, unknown> },
  titleOverride?: string
): Puzzle | null {
  const puzzle = data.puzzle;
  if (!puzzle || typeof puzzle !== 'object') return null;
  const id = String(puzzle.id ?? '');
  let fen = typeof puzzle.fen === 'string' ? puzzle.fen.trim() : '';
  if (!fen && typeof data.game?.pgn === 'string' && typeof puzzle.initialPly === 'number') {
    fen = fenFromPgnAndPly(data.game.pgn, puzzle.initialPly) || '';
  }
  if (!fen) return null;
  const rating = Number(puzzle.rating);
  const r = Number.isFinite(rating) ? rating : 1500;
  const sol = Array.isArray(puzzle.solution)
    ? puzzle.solution.map((m) => String(m).trim()).filter(Boolean)
    : [];
  const themeList = Array.isArray(puzzle.themes) ? puzzle.themes.map((t) => String(t)) : [];
  const themes = themeList.join(' ');
  const { category, theme } = translateThemes(themes);
  const title = titleOverride?.trim() || puzzleTitleFromThemes(themeList, r);
  return {
    id,
    lichessId: id,
    fen,
    solution: sol,
    title,
    difficulty: ratingToDifficulty(r),
    points: ratingToPoints(r),
    category,
    theme,
    hint: sol[0] || '',
    gamePgn: typeof data.game?.pgn === 'string' ? data.game.pgn : undefined,
    lichessThemes: themes,
    source: 'lichess',
  };
}

/** Lichess ham tema etiketiyle eşleşme (mateIn3 ≠ mateIn30). */
export function puzzleHasLichessTheme(puzzle: Puzzle, tag: string): boolean {
  const needle = tag.trim().toLowerCase();
  if (!needle) return true;
  const raw = puzzle.lichessThemes?.trim();
  if (raw) {
    return raw.split(/[\s,]+/).some((t) => t.toLowerCase() === needle);
  }
  return (puzzle.theme || '').split(/[\s,]+/).some((t) => t.toLowerCase() === needle);
}

export async function fetchLichessDailyPuzzle(): Promise<Puzzle | null> {
  try {
    const res = await fetch(`${LICHESS_API}/puzzle/daily`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { game?: { pgn?: string }; puzzle: Record<string, unknown> };
    const r = Number(data.puzzle?.rating);
    const title = `Günün Bulmacası (${Number.isFinite(r) ? r : '?'})`;
    return lichessApiResponseToPuzzle(data, title);
  } catch {
    return null;
  }
}

export interface FetchBatchOptions {
  count: number;
  minRating?: number;
  maxRating?: number;
  themes?: string[];
  onProgress?: (loaded: number, total: number, message?: string) => void;
}

function difficultiesForRatingRange(minRating: number, maxRating: number): BatchDifficulty[] {
  const mid = (minRating + maxRating) / 2;
  if (maxRating - minRating > 900) return [...BATCH_DIFFICULTIES];
  if (mid < 1150) return ['easiest', 'easier'];
  if (mid < 1400) return ['easier', 'normal'];
  if (mid < 1700) return ['normal', 'harder'];
  if (mid < 2000) return ['harder', 'hardest'];
  return ['hardest'];
}

const THEME_ALIASES: Record<string, string> = {
  mat: 'mate',
  çatal: 'fork',
  catal: 'fork',
  açılış: 'opening',
  acilis: 'opening',
  şah: 'mate',
  sah: 'mate',
};

function normalizeLichessTheme(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (!t) return '';
  return THEME_ALIASES[t] ?? t;
}

function puzzleMatchesThemes(themeList: string[], required: string[]): boolean {
  if (!required.length) return true;
  return required.every((t) => themeList.includes(t));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Lichess API ile filtreli toplu bulmaca çekme (CSV gerekmez, max 50/istek). */
export async function fetchLichessPuzzlesFiltered(options: FetchBatchOptions): Promise<Puzzle[]> {
  const {
    count,
    minRating = 0,
    maxRating = 9999,
    themes,
    onProgress,
  } = options;

  const target = Math.min(Math.max(1, Math.floor(count)), 500);
  const themeFilters = (themes ?? []).map((t) => normalizeLichessTheme(t)).filter(Boolean);
  const angles = themeFilters.length ? themeFilters : ['mix'];
  const difficulties = difficultiesForRatingRange(minRating, maxRating);
  const seen = new Set<string>();
  const result: Puzzle[] = [];

  const maxAttempts = Math.min(40, Math.max(12, Math.ceil(target / 5) * angles.length));
  let attempts = 0;
  let consecutiveEmpty = 0;

  onProgress?.(0, target, 'Lichess API bağlantısı kuruluyor...');

  while (result.length < target && attempts < maxAttempts) {
    const angle = angles[attempts % angles.length];
    const difficulty = difficulties[attempts % difficulties.length];
    attempts += 1;

    onProgress?.(result.length, target, `${angle} / ${difficulty} çekiliyor (${attempts}/${maxAttempts})...`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      const url = `${LICHESS_API}/puzzle/batch/${encodeURIComponent(angle)}?nb=50&difficulty=${difficulty}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        consecutiveEmpty += 1;
        await delay(250);
        continue;
      }
      const data = (await res.json()) as {
        puzzles?: Array<{ game?: { pgn?: string }; puzzle: Record<string, unknown> }>;
      };
      let addedThisRound = 0;
      for (const item of data.puzzles ?? []) {
        if (result.length >= target) break;
        const puzzle = lichessApiResponseToPuzzle(item);
        if (!puzzle || seen.has(puzzle.id)) continue;
        const rating = Number(item.puzzle?.rating);
        if (!Number.isFinite(rating) || rating < minRating || rating > maxRating) continue;
        const itemThemes = Array.isArray(item.puzzle?.themes)
          ? item.puzzle.themes.map((t) => String(t))
          : [];
        if (themeFilters.length && angle === 'mix' && !puzzleMatchesThemes(itemThemes, themeFilters)) {
          continue;
        }
        seen.add(puzzle.id);
        result.push(puzzle);
        addedThisRound += 1;
        onProgress?.(result.length, target, `${result.length} / ${target} bulmaca hazır`);
      }
      consecutiveEmpty = addedThisRound === 0 ? consecutiveEmpty + 1 : 0;
      if (consecutiveEmpty >= 8) break;
    } catch {
      consecutiveEmpty += 1;
    }

    await delay(180);
  }

  return result;
}

export async function fetchPuzzlesFromCSV(
  options: FetchBatchOptions
): Promise<Puzzle[]> {
  const { count, minRating = 0, maxRating = 9999, themes, onProgress } = options;
  const puzzles: Puzzle[] = [];

  const url = 'https://database.lichess.org/lichess_db_puzzle.csv.bz2';

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error('Lichess puzzle veritabanına bağlanılamadı.');
  }

  throw new Error('CSV download requires server-side processing. Use the import script instead.');
}

export async function fetchPuzzleById(id: string): Promise<Puzzle | null> {
  const clean = String(id ?? '')
    .trim()
    .replace(/^https?:\/\/lichess\.org\/training\//i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '');
  if (!clean) return null;
  try {
    const res = await fetch(`${LICHESS_API}/puzzle/${encodeURIComponent(clean)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { game?: { pgn?: string }; puzzle: Record<string, unknown> };
    return lichessApiResponseToPuzzle(data);
  } catch {
    return null;
  }
}

export { THEME_TR };
