import type { HomeworkAssignment, HomeworkPuzzleAttempt, Student, StudentDailyTarget } from '../types';
import type { HomeworkStudentStatus } from './homeworkAnalysisUtils';
import { countPerPuzzleResults } from './homeworkAnalysisUtils';
import {
  type ChessComPuzzleTab,
  type ChessComPuzzleAttempt,
} from '../lib/chesscomPuzzleParse';
import {
  fetchChessComDailyPuzzleStats,
  fetchChessComDaysStats,
  fetchChessComGamesForDay,
  fetchChessComGamesListForDay,
  fetchChessComPuzzlesBundle,
  fetchLichessDayStats,
  fetchLichessDaysStats,
  fetchLichessGamesCountForDay,
  fetchLichessGamesForDay,
  type ChessComGame,
  type LichessGame,
} from '../services/chessPlatformService';
import { fetchLichessOAuthDayPuzzleStats, isStudentLichessOAuthConnected } from '../services/lichessOAuthClient';
import { timestampMatchesDay, istanbulDayKey } from './homeworkDayUtils';
import { weekdayKeyFromIso } from './homeworkDayUtils';
import {
  chessComGameDurationSeconds,
  lichessGameDurationSeconds,
} from './chesscomGameDuration';
import { chessComPuzzleTimeEstimateForDay } from './platformActivityTime';

export type PlatformDayStats = {
  games: number;
  puzzleSolved: number;
  puzzlePassed: number;
  puzzleFailed: number;
  lichessGames: number;
  lichessPuzzles: number;
  lichessPuzzlePassed: number;
  lichessPuzzleFailed: number;
  chessComGames: number;
  chessComPuzzles: number;
  chessComPuzzlePassed: number;
  chessComPuzzleFailed: number;
  activityTimeSeconds?: number;
  lichessError?: boolean;
  chessComError?: boolean;
};

export async function fetchStudentPlatformDayStats(
  student: Student,
  dayIso: string,
): Promise<PlatformDayStats> {
  const lichessUsername = student.lichessUsername?.trim();
  const chessComUsername = student.chessComUsername?.trim();

  let lichessDay = { games: 0, puzzles: { count: 0, passed: 0, failed: 0 }, activityRateLimited: false };
  let lichessError = false;
  let chessComGames = 0;
  let chessComPuzzles = { count: 0, passed: 0, failed: 0 };
  let chessComError = false;

  if (lichessUsername) {
    try {
      let oauthUsed = false;
      if (student.id?.trim() && isStudentLichessOAuthConnected(student)) {
        const oauth = await fetchLichessOAuthDayPuzzleStats(student.id, dayIso);
        if (oauth.connected) {
          oauthUsed = true;
          lichessDay = {
            games: 0,
            puzzles: { count: oauth.count, passed: oauth.passed, failed: oauth.failed },
            activityRateLimited: false,
          };
          try {
            lichessDay.games = await fetchLichessGamesCountForDay(lichessUsername, dayIso);
          } catch {
            lichessError = true;
          }
        }
      }
      if (!oauthUsed) {
        lichessDay = await fetchLichessDayStats(lichessUsername, dayIso);
        if (lichessDay.activityRateLimited) lichessError = true;
      }
    } catch {
      lichessError = true;
    }
  }

  if (chessComUsername) {
    try {
      const [games, puzzles] = await Promise.all([
        fetchChessComGamesForDay(chessComUsername, dayIso),
        fetchChessComDailyPuzzleStats(chessComUsername, dayIso),
      ]);
      chessComGames = games;
      chessComPuzzles = puzzles;
    } catch {
      chessComError = true;
    }
  }

  return {
    games: lichessDay.games + chessComGames,
    puzzleSolved: (lichessDay.puzzles.count ?? 0) + (chessComPuzzles.count ?? 0),
    puzzlePassed: (lichessDay.puzzles.passed ?? 0) + (chessComPuzzles.passed ?? 0),
    puzzleFailed: (lichessDay.puzzles.failed ?? 0) + (chessComPuzzles.failed ?? 0),
    lichessGames: lichessDay.games,
    lichessPuzzles: lichessDay.puzzles.count ?? 0,
    lichessPuzzlePassed: lichessDay.puzzles.passed ?? 0,
    lichessPuzzleFailed: lichessDay.puzzles.failed ?? 0,
    chessComGames,
    chessComPuzzles: chessComPuzzles.count ?? 0,
    chessComPuzzlePassed: chessComPuzzles.passed ?? 0,
    chessComPuzzleFailed: chessComPuzzles.failed ?? 0,
    lichessError: lichessUsername ? lichessError : undefined,
    chessComError: chessComUsername ? chessComError : undefined,
  };
}

/** Öğrenci başına tek Lichess aktivite + tek Chess.com bundle ile çoklu gün özeti (istemci yedeği). */
export async function fetchStudentPlatformDaysStats(
  student: Student,
  dayIsos: string[],
): Promise<Record<string, PlatformDayStats>> {
  const days = [...new Set(dayIsos.map((d) => d.slice(0, 10)))];
  const lichessUsername = student.lichessUsername?.trim();
  const chessComUsername = student.chessComUsername?.trim();

  let lichessByDay: Record<string, Awaited<ReturnType<typeof fetchLichessDaysStats>>[string]> = {};
  let chessByDay: Record<string, Awaited<ReturnType<typeof fetchChessComDaysStats>>[string]> = {};
  let lichessError = false;
  let chessComError = false;

  if (lichessUsername) {
    try {
      let oauthUsed = false;
      if (student.id?.trim() && isStudentLichessOAuthConnected(student)) {
        lichessByDay = {};
        for (const day of days) {
          const oauth = await fetchLichessOAuthDayPuzzleStats(student.id, day);
          if (oauth.connected) {
            oauthUsed = true;
            lichessByDay[day] = {
              games: 0,
              puzzles: { count: oauth.count, passed: oauth.passed, failed: oauth.failed },
              activityRateLimited: false,
            };
          }
        }
      }
      if (!oauthUsed) {
        lichessByDay = await fetchLichessDaysStats(lichessUsername, days);
        if (Object.values(lichessByDay).some((d) => d.activityRateLimited)) lichessError = true;
      }
    } catch {
      lichessError = true;
    }
  }

  if (chessComUsername) {
    try {
      chessByDay = await fetchChessComDaysStats(chessComUsername, days);
    } catch {
      chessComError = true;
    }
  }

  const out: Record<string, PlatformDayStats> = {};
  for (const day of days) {
    const lichessDay = lichessByDay[day] ?? {
      games: 0,
      puzzles: { count: 0, passed: 0, failed: 0 },
      activityRateLimited: false,
    };
    const chessDay = chessByDay[day] ?? { games: 0, puzzles: { count: 0, passed: 0, failed: 0 } };
    out[day] = {
      games: lichessDay.games + chessDay.games,
      puzzleSolved: (lichessDay.puzzles.count ?? 0) + (chessDay.puzzles.count ?? 0),
      puzzlePassed: (lichessDay.puzzles.passed ?? 0) + (chessDay.puzzles.passed ?? 0),
      puzzleFailed: (lichessDay.puzzles.failed ?? 0) + (chessDay.puzzles.failed ?? 0),
      lichessGames: lichessDay.games,
      lichessPuzzles: lichessDay.puzzles.count ?? 0,
      lichessPuzzlePassed: lichessDay.puzzles.passed ?? 0,
      lichessPuzzleFailed: lichessDay.puzzles.failed ?? 0,
      chessComGames: chessDay.games,
      chessComPuzzles: chessDay.puzzles.count ?? 0,
      chessComPuzzlePassed: chessDay.puzzles.passed ?? 0,
      chessComPuzzleFailed: chessDay.puzzles.failed ?? 0,
      lichessError: lichessUsername ? lichessError : undefined,
      chessComError: chessComUsername ? chessComError : undefined,
    };
  }
  return out;
}

export function homeworkAttemptsForDay(
  attempts: HomeworkPuzzleAttempt[],
  homeworkId: string,
  studentId: string,
  dayIso: string,
): HomeworkPuzzleAttempt[] {
  return attempts.filter(
    (a) =>
      a.homeworkId === homeworkId &&
      a.studentId === studentId &&
      puzzleAttemptMatchesDay(a.timestamp, dayIso),
  );
}

export function internalPuzzleCountsForDay(
  puzzleIds: string[],
  attempts: HomeworkPuzzleAttempt[],
): { passed: number; failed: number; solved: number } {
  const { correct, wrong } = countPerPuzzleResults(puzzleIds, attempts);
  return { passed: correct, failed: wrong, solved: correct + wrong };
}

export function resolveDayTargets(
  draft: StudentDailyTarget | undefined,
  hw: HomeworkAssignment,
  weekday: number,
): { gameTarget: number; puzzleTarget: number; minAccuracy: number } {
  const dayData = draft?.weeklySchedule?.[weekday];
  return {
    gameTarget: Math.max(0, dayData?.dailyGameTarget ?? draft?.dailyGameTarget ?? hw.dailyGameTarget ?? 0),
    puzzleTarget: Math.max(0, dayData?.dailyPuzzleTarget ?? draft?.dailyPuzzleTarget ?? hw.dailyPuzzleTarget ?? 0),
    minAccuracy: Math.max(
      0,
      Math.min(100, dayData?.minPuzzleAccuracyPct ?? draft?.minPuzzleAccuracyPct ?? hw.minPuzzleAccuracyPct ?? 60),
    ),
  };
}

export function resolvePlatformHomeworkStatus(opts: {
  hasTargets: boolean;
  done: boolean;
  hasActivity: boolean;
  dayClosed: boolean;
}): HomeworkStudentStatus {
  if (!opts.hasTargets) return 'Başlamadı';
  if (opts.done) return 'Tamamlandı';
  if (opts.dayClosed) return opts.hasActivity ? 'Kısmi yaptı' : 'Yapılmadı';
  if (opts.hasActivity) return 'Devam Ediyor';
  return 'Başlamadı';
}

/** Min doğruluk % yalnızca bulmaca hedefinde geçerlidir; maç hedefi yalnızca adet sayılır. */
export function minCorrectRequiredForPuzzleGoal(puzzleTarget: number, minAccuracy: number): number {
  if (puzzleTarget <= 0) return 0;
  if (minAccuracy <= 0) return 0;
  return Math.ceil(puzzleTarget * minAccuracy / 100);
}

/**
 * Bulmaca hedefi: en az puzzleTarget deneme + min doğruluk oranına göre yeterli doğru.
 * Örn. 20 bulmaca / %40 → 20 deneme ve en az 8 doğru.
 */
export function evaluatePuzzleGoalMet(
  puzzleTarget: number,
  minAccuracy: number,
  puzzleSolved: number,
  puzzlePassed: number,
): boolean {
  if (puzzleTarget <= 0) return true;
  if (puzzleSolved < puzzleTarget) return false;
  const minCorrect = minCorrectRequiredForPuzzleGoal(puzzleTarget, minAccuracy);
  if (minCorrect <= 0) return true;
  return puzzlePassed >= minCorrect;
}

export function evaluateDayGoals(
  gameTarget: number,
  puzzleTarget: number,
  minAccuracy: number,
  platform: PlatformDayStats | undefined,
  internalAttempts: HomeworkPuzzleAttempt[],
  homeworkPuzzleIds: string[] = [],
): { gamesMet: boolean; puzzlesMet: boolean; done: boolean; puzzleSolved: number; puzzleAccuracy: number; puzzlePassed: number; puzzleFailed: number } {
  const internal = homeworkPuzzleIds.length > 0
    ? internalPuzzleCountsForDay(homeworkPuzzleIds, internalAttempts)
    : {
        passed: internalAttempts.filter((a) => a.correct).length,
        failed: internalAttempts.filter((a) => !a.correct).length,
        solved: internalAttempts.length,
      };
  const puzzlePassed = internal.passed + (platform?.puzzlePassed ?? 0);
  const puzzleFailed = internal.failed + (platform?.puzzleFailed ?? 0);
  const puzzleSolved = internal.solved + (platform?.puzzleSolved ?? 0);
  const puzzleAccuracy = puzzleSolved > 0 ? (puzzlePassed / puzzleSolved) * 100 : 0;
  const gamesMet = gameTarget <= 0 || (platform?.games ?? 0) >= gameTarget;
  const puzzlesMet = evaluatePuzzleGoalMet(puzzleTarget, minAccuracy, puzzleSolved, puzzlePassed);
  return {
    gamesMet,
    puzzlesMet,
    done: gamesMet && puzzlesMet,
    puzzleSolved,
    puzzleAccuracy,
    puzzlePassed,
    puzzleFailed,
  };
}

/** Platform günlük hedefi — yalnızca Lichess/Chess.com sayıları (atanan ödev bulmacaları dahil değil). */
export function evaluatePlatformDayGoalsFromStats(
  gameTarget: number,
  puzzleTarget: number,
  minAccuracy: number,
  platform: PlatformDayStats | undefined,
): {
  gamesMet: boolean;
  puzzlesMet: boolean;
  done: boolean;
  puzzleAccuracy: number;
  puzzleSolved: number;
  puzzlePassed: number;
  puzzleFailed: number;
  games: number;
} {
  const games = platform?.games ?? 0;
  const puzzleSolved = platform?.puzzleSolved ?? 0;
  const puzzlePassed = platform?.puzzlePassed ?? 0;
  const puzzleFailed = platform?.puzzleFailed ?? 0;
  const base = evaluatePlatformDailyGoals(
    gameTarget,
    puzzleTarget,
    minAccuracy,
    games,
    puzzleSolved,
    puzzlePassed,
  );
  return {
    ...base,
    puzzleSolved,
    puzzlePassed,
    puzzleFailed,
    games,
  };
}

/** Yalnızca Lichess/Chess.com — öğretmen Günlük Program ve öğrenci paneli aynı mantık. */
export function evaluatePlatformDailyGoals(
  gameTarget: number,
  puzzleTarget: number,
  minAccuracy: number,
  games: number,
  puzzleSolved: number,
  puzzlePassed: number,
): { gamesMet: boolean; puzzlesMet: boolean; done: boolean; puzzleAccuracy: number } {
  const puzzleAccuracy = puzzleSolved > 0 ? (puzzlePassed / puzzleSolved) * 100 : 0;
  const gamesMet = gameTarget <= 0 || games >= gameTarget;
  const puzzlesMet = evaluatePuzzleGoalMet(puzzleTarget, minAccuracy, puzzleSolved, puzzlePassed);
  const hasTargets = gameTarget > 0 || puzzleTarget > 0;
  return {
    gamesMet,
    puzzlesMet,
    done: hasTargets && gamesMet && puzzlesMet,
    puzzleAccuracy,
  };
}

export function weekdayFromIso(iso: string): number {
  return weekdayKeyFromIso(iso);
}

export function puzzleAttemptMatchesDay(isoDate: string | undefined, dayIso: string): boolean {
  if (!isoDate?.trim()) return false;
  try {
    const ms = new Date(isoDate).getTime();
    if (!Number.isFinite(ms)) return false;
    const target = dayIso.slice(0, 10);
    return timestampMatchesDay(ms, target) || istanbulDayKey(new Date(ms)) === target;
  } catch {
    return false;
  }
}

export type PlatformChessComPuzzleRow = {
  source: 'chesscom';
  tab: ChessComPuzzleTab;
  attempt: ChessComPuzzleAttempt;
};

/** Günlük ödev hedefi: yalnızca Chess.com puanlı bulmacalar sayılır. */
export const HOMEWORK_CHESSCOM_PUZZLE_TABS: ChessComPuzzleTab[] = ['rated'];

export function chessComAttemptsForHomeworkDay(
  bundle: { rated: ChessComPuzzleAttempt[]; learning: ChessComPuzzleAttempt[]; rush: ChessComPuzzleAttempt[] },
  dayIso: string,
  tabs: ChessComPuzzleTab[] = HOMEWORK_CHESSCOM_PUZZLE_TABS,
): ChessComPuzzleAttempt[] {
  const lists: Record<ChessComPuzzleTab, ChessComPuzzleAttempt[]> = {
    rated: bundle.rated,
    learning: bundle.learning,
    rush: bundle.rush,
  };
  const merged: ChessComPuzzleAttempt[] = [];
  for (const tab of tabs) {
    for (const attempt of lists[tab]) {
      if (puzzleAttemptMatchesDay(attempt.date, dayIso)) merged.push(attempt);
    }
  }
  return merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function fetchChessComPuzzlesForDay(
  username: string,
  dayIso: string,
  opts?: { tabs?: ChessComPuzzleTab[]; force?: boolean },
): Promise<PlatformChessComPuzzleRow[]> {
  const bundle = await fetchChessComPuzzlesBundle(username, { force: opts?.force });
  if (!bundle) return [];
  const tabs = opts?.tabs ?? HOMEWORK_CHESSCOM_PUZZLE_TABS;
  const unique = chessComAttemptsForHomeworkDay(bundle, dayIso, tabs);
  const tabById = new Map<number, ChessComPuzzleTab>();
  const lists: Record<ChessComPuzzleTab, ChessComPuzzleAttempt[]> = {
    rated: bundle.rated,
    learning: bundle.learning,
    rush: bundle.rush,
  };
  for (const tab of tabs) {
    for (const attempt of lists[tab]) {
      if (!puzzleAttemptMatchesDay(attempt.date, dayIso)) continue;
      if (!tabById.has(attempt.id)) tabById.set(attempt.id, tab);
    }
  }
  return unique.map((attempt) => ({
    source: 'chesscom' as const,
    tab: tabById.get(attempt.id) ?? 'rated',
    attempt,
  }));
}

/** Gün boyu tüm platform aktivitesinin toplam süresi (sn). */
export async function fetchStudentPlatformActivityTimeSeconds(
  student: Student,
  dayIso: string,
): Promise<number> {
  let total = 0;

  const chessComUsername = student.chessComUsername?.trim().toLowerCase();
  if (chessComUsername) {
    try {
      const rows = await fetchChessComPuzzlesForDay(chessComUsername, dayIso, {
        tabs: ['rated', 'learning', 'rush'],
      });
      const listTime = rows.reduce((sum, row) => sum + Math.max(0, row.attempt.myTimeSec ?? 0), 0);
      total += listTime;
      if (listTime <= 0 && rows.length > 0) {
        total += chessComPuzzleTimeEstimateForDay(
          rows.map((r) => r.attempt),
          dayIso,
          rows.length,
        );
      }
    } catch {
      /* platform süresi atlanır */
    }

    try {
      const games = await fetchChessComGamesListForDay(chessComUsername, dayIso);
      total += games.reduce((sum, game) => sum + chessComGameDurationSeconds(game), 0);
    } catch {
      /* platform süresi atlanır */
    }
  }

  const lichessUsername = student.lichessUsername?.trim();
  if (lichessUsername) {
    try {
      const games = await fetchLichessGamesForDay(lichessUsername, dayIso);
      total += games.reduce((sum, g) => sum + lichessGameDurationSeconds(g), 0);
    } catch {
      /* platform süresi atlanır */
    }
  }

  return total;
}

export function capDailyPuzzleDisplay(
  correct: number,
  wrong: number,
  puzzleTarget: number,
): { correct: number; wrong: number } {
  if (puzzleTarget <= 0) return { correct, wrong };
  return {
    correct: Math.min(correct, puzzleTarget),
    wrong,
  };
}

// Tek günde gerçek dışı büyüklükler → bozuk lifetime bazından kaynaklı "tüm-zamanlar"
// kirlenmesi. Bu değerler "güvenilmez" sayılıp Math.max'ta iyi verinin üstüne KİLİTLENMESİ
// engellenir (aksi halde bir kez yazılan 1757 bulmaca/22 saat kalıcı kalıyordu).
const MAX_DAILY_PLATFORM_PUZZLES = 500;
const MAX_DAILY_TOTAL_PUZZLES = 1000;
const MAX_DAILY_ACTIVITY_SECONDS = 10 * 3600;

function isImplausibleDayStats(s: PlatformDayStats): boolean {
  return (
    s.chessComPuzzles > MAX_DAILY_PLATFORM_PUZZLES
    || s.lichessPuzzles > MAX_DAILY_PLATFORM_PUZZLES
    || s.puzzleSolved > MAX_DAILY_TOTAL_PUZZLES
    || (s.activityTimeSeconds ?? 0) > MAX_DAILY_ACTIVITY_SECONDS
  );
}

/** Şişik/gerçek dışı bulmaca+süre katkısını sıfırlar (maçlar korunur). */
function dropPuzzleContribution(s: PlatformDayStats): PlatformDayStats {
  return {
    ...s,
    puzzleSolved: 0,
    puzzlePassed: 0,
    puzzleFailed: 0,
    lichessPuzzles: 0,
    lichessPuzzlePassed: 0,
    lichessPuzzleFailed: 0,
    chessComPuzzles: 0,
    chessComPuzzlePassed: 0,
    chessComPuzzleFailed: 0,
    activityTimeSeconds: 0,
  };
}

/** Rate limit veya geçici hata sonrası daha düşük sayıların iyi verinin üzerine yazılmasını önler. */
export function mergePlatformDayStats(
  prevRaw: PlatformDayStats | undefined,
  nextRaw: PlatformDayStats,
): PlatformDayStats {
  // Gerçek dışı (all-time kirlenmesi) tarafların bulmaca katkısını at ki Math.max'a kilitlenmesin.
  const prev = prevRaw && isImplausibleDayStats(prevRaw) ? dropPuzzleContribution(prevRaw) : prevRaw;
  const next = isImplausibleDayStats(nextRaw) ? dropPuzzleContribution(nextRaw) : nextRaw;

  if (!prev) return { ...next };

  // "Sadece o gün" politikası: taze (next) tarafta gerçek veri varsa (hata yok ve sayı>0)
  // onu KULLAN — böylece eski şişik (all-time kirlenmesi) değer AŞAĞI düzeltilebilir.
  // Taze taraf hatalı/boşsa eskiyi koru (geçmiş günün kaydı API'den yeniden çekilemez).
  const chessFresh = !next.chessComError && (next.chessComPuzzles > 0 || next.chessComGames > 0);
  const lichessFresh = !next.lichessError && (next.lichessPuzzles > 0 || next.lichessGames > 0);

  const pick = (fresh: boolean, n: number, p: number) => (fresh ? n : Math.max(p, n));

  const lichessGames = pick(lichessFresh, next.lichessGames, prev.lichessGames);
  const chessComGames = pick(chessFresh, next.chessComGames, prev.chessComGames);
  const lichessPuzzles = pick(lichessFresh, next.lichessPuzzles, prev.lichessPuzzles);
  const chessComPuzzles = pick(chessFresh, next.chessComPuzzles, prev.chessComPuzzles);
  const lichessPuzzlePassed = pick(lichessFresh, next.lichessPuzzlePassed, prev.lichessPuzzlePassed);
  const chessComPuzzlePassed = pick(chessFresh, next.chessComPuzzlePassed, prev.chessComPuzzlePassed);
  const lichessPuzzleFailed = pick(lichessFresh, next.lichessPuzzleFailed, prev.lichessPuzzleFailed);
  const chessComPuzzleFailed = pick(chessFresh, next.chessComPuzzleFailed, prev.chessComPuzzleFailed);

  // Toplamlar platform değerlerinden türetilir (eski birleşik değere kilitlenmez).
  const games = lichessGames + chessComGames;
  const puzzleSolved = lichessPuzzles + chessComPuzzles;
  const puzzlePassed = lichessPuzzlePassed + chessComPuzzlePassed;
  const puzzleFailed = lichessPuzzleFailed + chessComPuzzleFailed;

  const lichessKept = lichessGames > 0 || lichessPuzzles > 0;
  const chessKept = chessComGames > 0 || chessComPuzzles > 0;
  // Süre: her iki platform da taze/hatasızsa taze süreyi kullan (22 saat gibi eski
  // kirlenmeleri düzeltir); aksi halde en yüksek bilineni koru.
  const bothTrusted = !next.chessComError && !next.lichessError && (chessFresh || lichessFresh);
  const activityTimeSeconds = bothTrusted
    ? (next.activityTimeSeconds ?? 0)
    : Math.max(prev.activityTimeSeconds ?? 0, next.activityTimeSeconds ?? 0);

  return {
    games,
    puzzleSolved,
    puzzlePassed,
    puzzleFailed,
    lichessGames,
    lichessPuzzles,
    lichessPuzzlePassed,
    lichessPuzzleFailed,
    chessComGames,
    chessComPuzzles,
    chessComPuzzlePassed,
    chessComPuzzleFailed,
    ...(activityTimeSeconds > 0 ? { activityTimeSeconds } : {}),
    lichessError: next.lichessError && !lichessKept ? true : (prev.lichessError && !lichessKept ? true : undefined),
    chessComError: next.chessComError && !chessKept ? true : (prev.chessComError && !chessKept ? true : undefined),
  };
}

export function platformSyncSummary(stats: PlatformDayStats | undefined, student: Student): string | null {
  if (!stats) return null;
  const parts: string[] = [];
  if (student.lichessUsername?.trim()) {
    parts.push(stats.lichessError
      ? 'Lichess: erişilemiyor'
      : `Lichess: ${stats.lichessGames} maç, ${stats.lichessPuzzles} bulmaca`);
  }
  if (student.chessComUsername?.trim()) {
    parts.push(stats.chessComError
      ? 'Chess.com: erişilemiyor'
      : `Chess.com: ${stats.chessComGames} maç, ${stats.chessComPuzzles} puanlı bulmaca`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
