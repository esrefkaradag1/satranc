import type { Puzzle } from '../types';

/** Ödev dışı Lichess serbest antrenman — homework_attempts ile karışmaz. */
export const PRACTICE_HOMEWORK_ID = '__lichess_practice__';
export const DEFAULT_PUZZLE_PRACTICE_RATING = 1500;
export const PRACTICE_ELO_K = 32;
const STORAGE_KEY = 'netchess_student_puzzle_practice';
const MAX_RECENT = 40;
const MAX_HISTORY = 100;

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
  recentPuzzleIds: string[];
  history: StudentPuzzlePracticeAttempt[];
};

function emptyState(seedRating = DEFAULT_PUZZLE_PRACTICE_RATING): StudentPuzzlePracticeState {
  return {
    rating: Math.round(seedRating),
    solved: 0,
    failed: 0,
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
  return {
    rating: Math.round(cur.rating),
    solved: Math.max(0, cur.solved ?? 0),
    failed: Math.max(0, cur.failed ?? 0),
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

export function applyPracticeResult(
  state: StudentPuzzlePracticeState,
  puzzle: Puzzle,
  correct: boolean,
): { state: StudentPuzzlePracticeState; delta: number; puzzleRating: number } {
  const puzzleRating = estimatePuzzleRating(puzzle);
  const delta = eloDelta(state.rating, puzzleRating, correct);
  const ratingAfter = Math.max(400, Math.min(3200, state.rating + delta));
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
    recentPuzzleIds: recent,
    history: [attempt, ...state.history].slice(0, MAX_HISTORY),
  };
  return { state: next, delta, puzzleRating };
}

/**
 * Öğrenci rating'ine yakın Lichess bankası bulmacası.
 * Son oynananlar ve mümkünse daha önce çözülenler elenir.
 */
export function pickNextPracticePuzzle(
  pool: Puzzle[],
  rating: number,
  recentPuzzleIds: string[] = [],
): Puzzle | null {
  const lichess = pool.filter((p) => p.source === 'lichess' || !!p.lichessId);
  if (lichess.length === 0) return null;

  const recent = new Set(recentPuzzleIds);
  const candidates = lichess.filter((p) => !recent.has(p.id));
  const list = candidates.length > 0 ? candidates : lichess;

  const scored = list.map((p) => {
    const pr = estimatePuzzleRating(p);
    const dist = Math.abs(pr - rating);
    // Hafif rastgelelik: aynı banttaki tekrarları kır
    const jitter = Math.random() * 80;
    return { p, score: dist + jitter, pr };
  });
  scored.sort((a, b) => a.score - b.score);

  // Rating ±250 bandını tercih et; yoksa en yakın
  const band = scored.filter((x) => Math.abs(x.pr - rating) <= 250);
  const pickFrom = band.length > 0 ? band : scored.slice(0, Math.min(12, scored.length));
  if (pickFrom.length === 0) return null;
  return pickFrom[Math.floor(Math.random() * Math.min(5, pickFrom.length))]!.p;
}

export function isPracticeHomeworkId(homeworkId: string | undefined | null): boolean {
  if (!homeworkId) return false;
  return homeworkId === PRACTICE_HOMEWORK_ID
    || homeworkId === 'lichess-practice'
    || homeworkId === 'lichess-daily';
}
