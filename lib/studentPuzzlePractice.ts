import type { Puzzle } from '../types';

/** Ödev dışı Lichess serbest antrenman — homework_attempts ile karışmaz. */
export const PRACTICE_HOMEWORK_ID = '__lichess_practice__';
export const DEFAULT_PUZZLE_PRACTICE_RATING = 700;
/** Serbest antrenman havuzunda tercih edilen Lichess rating aralığı. */
export const PRACTICE_LICHESS_RATING_MIN = 700;
export const PRACTICE_LICHESS_RATING_MAX = 1500;
export const PRACTICE_ELO_K = 32;
const STORAGE_KEY = 'netchess_student_puzzle_practice';
const MAX_RECENT = 40;
const MAX_HISTORY = 100;

export type PracticeRatingBandId = string;

export type PracticeRatingBand = {
  id: PracticeRatingBandId;
  label: string;
  min: number;
  max: number;
  title: string;
};

/** 100 puanlık seviye bantları — bankadaki bulmacalar rating'e göre eşleşir. */
export const PRACTICE_RATING_BANDS: PracticeRatingBand[] = [
  { id: '700-800', label: '700 – 800', min: 700, max: 800, title: 'Gelişen' },
  { id: '800-900', label: '800 – 900', min: 800, max: 900, title: 'Yetenekli' },
  { id: '900-1000', label: '900 – 1000', min: 900, max: 1000, title: 'Usta Adayı' },
  { id: '1000-1100', label: '1000 – 1100', min: 1000, max: 1100, title: 'Usta' },
  { id: '1100-1200', label: '1100 – 1200', min: 1100, max: 1200, title: 'İleri' },
  { id: '1200-1300', label: '1200 – 1300', min: 1200, max: 1300, title: 'Uzman' },
  { id: '1300-1400', label: '1300 – 1400', min: 1300, max: 1400, title: 'Profesyonel' },
  { id: '1400-1500', label: '1400 – 1500', min: 1400, max: 1500, title: 'Elit' },
  { id: '1500+', label: '1500+', min: 1500, max: 3200, title: 'Şampiyon' },
];

export type StudentPuzzlePracticeAttempt = {
  puzzleId: string;
  puzzleTitle?: string;
  correct: boolean;
  puzzleRating: number;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  at: string;
};

export type StudentPuzzlePracticeState = {
  rating: number;
  solved: number;
  failed: number;
  points: number;
  recentPuzzleIds: string[];
  history: StudentPuzzlePracticeAttempt[];
};

function emptyState(seedRating = DEFAULT_PUZZLE_PRACTICE_RATING): StudentPuzzlePracticeState {
  return {
    rating: Math.round(seedRating),
    solved: 0,
    failed: 0,
    points: 0,
    recentPuzzleIds: [],
    history: [],
  };
}

function readAll(): Record<string, StudentPuzzlePracticeState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StudentPuzzlePracticeState>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, StudentPuzzlePracticeState>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

export function loadPracticeState(
  studentId: string,
  seedRating = DEFAULT_PUZZLE_PRACTICE_RATING,
): StudentPuzzlePracticeState {
  if (!studentId.trim()) return emptyState(seedRating);
  const all = readAll();
  const cur = all[studentId];
  if (!cur || !Number.isFinite(cur.rating)) return emptyState(seedRating);
  const solved = Math.max(0, cur.solved ?? 0);
  const failed = Math.max(0, cur.failed ?? 0);
  const points = Number.isFinite(cur.points) && (cur.points ?? 0) > 0
    ? Math.max(0, cur.points ?? 0)
    : solved * 10 + Math.max(0, (cur.rating ?? seedRating) - DEFAULT_PUZZLE_PRACTICE_RATING);
  return {
    rating: Math.max(DEFAULT_PUZZLE_PRACTICE_RATING, Math.round(cur.rating)),
    solved,
    failed,
    points,
    recentPuzzleIds: Array.isArray(cur.recentPuzzleIds) ? cur.recentPuzzleIds.slice(0, MAX_RECENT) : [],
    history: Array.isArray(cur.history) ? cur.history.slice(0, MAX_HISTORY) : [],
  };
}

export function savePracticeState(studentId: string, state: StudentPuzzlePracticeState) {
  if (!studentId.trim()) return;
  const all = readAll();
  all[studentId] = state;
  writeAll(all);
}

export function practiceBandForRating(rating: number): PracticeRatingBand {
  const r = Math.max(DEFAULT_PUZZLE_PRACTICE_RATING, rating);
  const hit = PRACTICE_RATING_BANDS.find((b) => r >= b.min && r <= b.max);
  return hit ?? PRACTICE_RATING_BANDS[PRACTICE_RATING_BANDS.length - 1]!;
}

export function practiceLevelProgress(rating: number): {
  band: PracticeRatingBand;
  nextBand: PracticeRatingBand | null;
  progressPct: number;
} {
  const band = practiceBandForRating(rating);
  const idx = PRACTICE_RATING_BANDS.findIndex((b) => b.id === band.id);
  const nextBand = idx >= 0 && idx < PRACTICE_RATING_BANDS.length - 1
    ? PRACTICE_RATING_BANDS[idx + 1]!
    : null;
  if (!nextBand || band.max >= 3200) {
    return { band, nextBand: null, progressPct: 100 };
  }
  const span = Math.max(1, band.max - band.min);
  const progressPct = Math.round(((rating - band.min) / span) * 100);
  return { band, nextBand, progressPct: Math.max(0, Math.min(100, progressPct)) };
}

export function practiceEligiblePuzzles(pool: Puzzle[]): Puzzle[] {
  return pool.filter((p) => !!p.fen?.trim() && (p.solution?.length ?? 0) > 0);
}

function practiceRatingInPreferredBand(puzzleRating: number): boolean {
  return puzzleRating >= PRACTICE_LICHESS_RATING_MIN && puzzleRating <= PRACTICE_LICHESS_RATING_MAX;
}

export function puzzlesInRatingBand(pool: Puzzle[], band: PracticeRatingBand): Puzzle[] {
  return practiceEligiblePuzzles(pool).filter((p) => {
    const pr = estimatePuzzleRating(p);
    return pr >= band.min && pr <= band.max;
  });
}

/** Öğrenci seviyesine uygun bulmacalar — band boşsa yakın rating'lere genişler. */
export function listPuzzlesForPractice(pool: Puzzle[], rating: number, limit = 48): Puzzle[] {
  const band = practiceBandForRating(rating);
  const inBand = puzzlesInRatingBand(pool, band);
  const eligible = practiceEligiblePuzzles(pool);
  const preferred = eligible.filter((p) => practiceRatingInPreferredBand(estimatePuzzleRating(p)));
  const source = inBand.length > 0
    ? inBand
    : (preferred.length > 0
      ? preferred
      : eligible.filter((p) => Math.abs(estimatePuzzleRating(p) - rating) <= 150));
  const list = (source.length > 0 ? source : eligible)
    .map((p) => ({ p, pr: estimatePuzzleRating(p), dist: Math.abs(estimatePuzzleRating(p) - rating) }))
    .sort((a, b) => a.dist - b.dist || a.pr - b.pr);
  return list.slice(0, limit).map((x) => x.p);
}

export function countPuzzlesInBand(pool: Puzzle[], band: PracticeRatingBand): number {
  return puzzlesInRatingBand(pool, band).length;
}

/** Başlık "(1095)" veya zorluk/puan kovalarından yaklaşık Lichess rating. */
export function estimatePuzzleRating(puzzle: Puzzle): number {
  const title = puzzle.title || '';
  const m = title.match(/\((\d{3,4})\)/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 400 && n <= 3500) return n;
  }
  const pts = puzzle.points ?? 0;
  if (pts >= 50) return 2200;
  if (pts >= 30) return 1950;
  if (pts >= 20) return 1650;
  if (pts >= 15) return 1350;
  if (pts >= 10) return 1100;
  if (pts >= 5) return 900;
  if (puzzle.difficulty === 'Zor') return 1900;
  if (puzzle.difficulty === 'Orta') return 1500;
  if (puzzle.difficulty === 'Kolay') return 1100;
  return DEFAULT_PUZZLE_PRACTICE_RATING;
}

export function expectedScore(playerRating: number, puzzleRating: number): number {
  return 1 / (1 + 10 ** ((puzzleRating - playerRating) / 400));
}

/** Klasik Elo: doğru = 1, yanlış = 0. */
export function eloDelta(
  playerRating: number,
  puzzleRating: number,
  correct: boolean,
  k = PRACTICE_ELO_K,
): number {
  const exp = expectedScore(playerRating, puzzleRating);
  const score = correct ? 1 : 0;
  return Math.round(k * (score - exp));
}

export function pointsForAttempt(correct: boolean, puzzleRating: number, delta: number): number {
  if (!correct) return 2;
  const base = Math.max(5, Math.round(puzzleRating / 40));
  return base + Math.max(0, delta);
}

export function applyPracticeResult(
  state: StudentPuzzlePracticeState,
  puzzle: Puzzle,
  correct: boolean,
): { state: StudentPuzzlePracticeState; delta: number; puzzleRating: number; pointsEarned: number } {
  const puzzleRating = estimatePuzzleRating(puzzle);
  const delta = eloDelta(state.rating, puzzleRating, correct);
  const ratingAfter = Math.max(DEFAULT_PUZZLE_PRACTICE_RATING, Math.min(3200, state.rating + delta));
  const pointsEarned = pointsForAttempt(correct, puzzleRating, delta);
  const attempt: StudentPuzzlePracticeAttempt = {
    puzzleId: puzzle.id,
    puzzleTitle: puzzle.title,
    correct,
    puzzleRating,
    ratingBefore: state.rating,
    ratingAfter,
    delta,
    at: new Date().toISOString(),
  };
  const recent = [puzzle.id, ...state.recentPuzzleIds.filter((id) => id !== puzzle.id)].slice(0, MAX_RECENT);
  const next: StudentPuzzlePracticeState = {
    rating: ratingAfter,
    solved: state.solved + (correct ? 1 : 0),
    failed: state.failed + (correct ? 0 : 1),
    points: state.points + pointsEarned,
    recentPuzzleIds: recent,
    history: [attempt, ...state.history].slice(0, MAX_HISTORY),
  };
  return { state: next, delta, puzzleRating, pointsEarned };
}

/**
 * Öğrenci rating'ine yakın Lichess bankası bulmacası.
 * Seviye bandı otomatik; son oynananlar elenir.
 */
export function pickNextPracticePuzzle(
  pool: Puzzle[],
  rating: number,
  recentPuzzleIds: string[] = [],
): Puzzle | null {
  const eligible = practiceEligiblePuzzles(pool);
  if (eligible.length === 0) return null;

  const band = practiceBandForRating(rating);
  const recent = new Set(recentPuzzleIds);
  const inBand = puzzlesInRatingBand(pool, band);
  const preferred = practiceEligiblePuzzles(pool).filter((p) => practiceRatingInPreferredBand(estimatePuzzleRating(p)));
  const nearBand = eligible.filter((p) => Math.abs(estimatePuzzleRating(p) - rating) <= 120);
  const candidates = inBand.filter((p) => !recent.has(p.id));
  const list = candidates.length > 0
    ? candidates
    : (inBand.length > 0
      ? inBand
      : (preferred.length > 0
        ? preferred.filter((p) => !recent.has(p.id))
        : (nearBand.length > 0 ? nearBand : eligible)));

  const scored = list.map((p) => {
    const pr = estimatePuzzleRating(p);
    const dist = Math.abs(pr - rating);
    const jitter = Math.random() * 60;
    return { p, score: dist + jitter, pr };
  });
  scored.sort((a, b) => a.score - b.score);

  const nearRating = scored.filter((x) => Math.abs(x.pr - rating) <= 150);
  const pickFrom = nearRating.length > 0 ? nearRating : scored.slice(0, Math.min(12, scored.length));
  if (pickFrom.length === 0) return null;
  return pickFrom[Math.floor(Math.random() * Math.min(5, pickFrom.length))]!.p;
}

export function isPracticeHomeworkId(homeworkId: string | undefined | null): boolean {
  if (!homeworkId) return false;
  return homeworkId === PRACTICE_HOMEWORK_ID
    || homeworkId === 'lichess-practice'
    || homeworkId === 'lichess-daily';
}
