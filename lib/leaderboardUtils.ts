import type { Student } from '../types';
import type { LichessActivity } from '../services/chessPlatformService';
import { studentInitials } from './homeworkPanelUtils';
import type { LeaderboardPlatformSnapshot, LeaderboardRankMode } from './leaderboardPlatformUtils';
import { leaderboardSortValue, type PlatformModeRating } from './leaderboardPlatformUtils';
import {
  type GameResultsByMode,
  type LeaderboardPointSettings,
  DEFAULT_LEADERBOARD_POINT_SETTINGS,
  computeLeaderboardScoreFromBreakdown,
  emptyGameResultsByMode,
  normalizeScoringMode,
} from './leaderboardPointSettings';

export type { LeaderboardPointSettings, GameResultsByMode } from './leaderboardPointSettings';
export {
  DEFAULT_LEADERBOARD_POINT_SETTINGS,
  formatLeaderboardPointsSummary,
  normalizeLeaderboardPointSettings,
  resolveClubLeaderboardPointSettings,
} from './leaderboardPointSettings';

export type { LeaderboardRankMode } from './leaderboardPlatformUtils';
export { LEADERBOARD_RANK_MODES, leaderboardModeLabel, leaderboardModeProg, leaderboardModeRating } from './leaderboardPlatformUtils';

export type LeaderboardPeriod = 'week' | 'month';

export interface PeriodBounds {
  startMs: number;
  endMs: number;
  label: string;
}

export function getPeriodBounds(period: LeaderboardPeriod, ref = new Date()): PeriodBounds {
  const end = new Date(ref);
  end.setHours(23, 59, 59, 999);
  const start = new Date(ref);

  if (period === 'week') {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return {
      startMs: start.getTime(),
      endMs: end.getTime(),
      label: 'Bu hafta',
    };
  }

  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    label: 'Bu ay',
  };
}

export function isTimestampInPeriod(iso: string | undefined, bounds: PeriodBounds): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= bounds.startMs && t <= bounds.endMs;
}

export function isEpochMsInPeriod(ms: number, bounds: PeriodBounds): boolean {
  return ms >= bounds.startMs && ms <= bounds.endMs;
}

/** Lichess aktivite satırından bulmaca istatistiği (güncel API: score.win/loss = adet). */
export function parseLichessActivityPuzzles(row: LichessActivity): {
  total: number;
  passed: number;
  failed: number;
} {
  const puzzles = row.puzzles;
  if (!puzzles) return { total: 0, passed: 0, failed: 0 };

  const passed = Math.max(0, puzzles.score?.win ?? 0);
  const failed = Math.max(0, puzzles.score?.loss ?? 0);

  if (passed > 0 || failed > 0) {
    return { total: passed + failed, passed, failed };
  }

  const legacyCount = typeof puzzles.count === 'number' ? puzzles.count : 0;
  if (legacyCount <= 0) return { total: 0, passed: 0, failed: 0 };

  return { total: legacyCount, passed: legacyCount, failed: 0 };
}

/** Çözülen bulmaca sayısı (doğru = 1 puan). */
export function lichessActivityPuzzleCount(row: LichessActivity): number {
  return parseLichessActivityPuzzles(row).passed;
}

export function lichessActivityGameResultsByMode(row: LichessActivity): GameResultsByMode {
  const out = emptyGameResultsByMode();
  if (!row.games) return out;
  for (const [mode, data] of Object.entries(row.games)) {
    if (!data) continue;
    const key = normalizeScoringMode(mode);
    out[key].wins += data.win || 0;
    out[key].draws += data.draw || 0;
    out[key].losses += data.loss || 0;
  }
  return out;
}

export function lichessActivityGameResults(row: LichessActivity): { wins: number; draws: number; losses: number } {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  if (!row.games) return { wins, draws, losses };
  for (const mode of Object.values(row.games)) {
    if (!mode) continue;
    wins += mode.win || 0;
    draws += mode.draw || 0;
    losses += mode.loss || 0;
  }
  return { wins, draws, losses };
}

export function lichessActivityGameCount(row: LichessActivity): number {
  if (!row.games) return 0;
  let total = 0;
  for (const mode of Object.values(row.games)) {
    if (!mode) continue;
    total += (mode.win || 0) + (mode.loss || 0) + (mode.draw || 0);
  }
  return total;
}

/** Aynı kulüp/şube içindeki öğrenciler (yoksa grup, o da yoksa tüm liste) */
export function getClubPeerStudents(allStudents: Student[], anchor: Student | null): Student[] {
  if (!anchor) return allStudents;
  const office = (anchor.branchOffice || '').trim();
  if (office) {
    const peers = allStudents.filter((s) => (s.branchOffice || '').trim() === office);
    if (peers.length > 0) return peers;
  }
  const group = (anchor.group || '').trim();
  if (group) {
    const peers = allStudents.filter((s) => (s.group || '').trim() === group);
    if (peers.length > 0) return peers;
  }
  return allStudents;
}

export function clubDisplayName(anchor: Student | null): string {
  if (!anchor) return 'Kulüp';
  return (anchor.branchOffice || anchor.group || 'Kulüp').trim();
}

export interface LeaderboardEntry {
  studentId: string;
  name: string;
  initials: string;
  group: string;
  puzzles: number;
  games: number;
  internalPuzzles: number;
  wins: number;
  draws: number;
  losses: number;
  gameResultsByMode: GameResultsByMode;
  score: number;
  rank: number;
  platform: LeaderboardPlatformSnapshot;
  rankMetric: number;
}

/** Mod bazlı puan ayarlarıyla aktivite puanı */
export function computeLeaderboardScore(
  puzzles: number,
  byMode: GameResultsByMode,
  settings: LeaderboardPointSettings = DEFAULT_LEADERBOARD_POINT_SETTINGS,
): number {
  return computeLeaderboardScoreFromBreakdown(puzzles, byMode, settings);
}

/** @deprecated Toplam G/B/M ile hesap — geriye dönük; mod bilgisi yoksa tüm maçlar rapid sayılır */
export function computeLeaderboardScoreLegacy(
  puzzles: number,
  wins: number,
  draws: number,
  losses: number,
  settings: LeaderboardPointSettings = DEFAULT_LEADERBOARD_POINT_SETTINGS,
): number {
  const byMode = emptyGameResultsByMode();
  byMode.rapid = { wins, draws, losses };
  return computeLeaderboardScoreFromBreakdown(puzzles, byMode, settings);
}

export function rankLeaderboardEntries(
  rows: Omit<LeaderboardEntry, 'rank' | 'score' | 'rankMetric'>[],
  mode: LeaderboardRankMode = 'activity',
  pointSettings: LeaderboardPointSettings = DEFAULT_LEADERBOARD_POINT_SETTINGS,
): LeaderboardEntry[] {
  const activityScores = rows.map((r) =>
    computeLeaderboardScore(r.puzzles, r.gameResultsByMode, pointSettings),
  );
  const withScore = rows.map((r, i) => {
    const score = activityScores[i]!;
    const draft = { ...r, score, rank: 0, rankMetric: 0 };
    return {
      ...draft,
      rankMetric: leaderboardSortValue(draft, mode),
    };
  });
  withScore.sort((a, b) => {
    const diff = b.rankMetric - a.rankMetric;
    if (diff !== 0) return diff;
    if (mode !== 'activity' && mode !== 'ukd' && mode !== 'fide') {
      const modeKey = mode === 'classical' ? 'classical' : mode;
      const pA = a.platform[modeKey as keyof LeaderboardPlatformSnapshot] as PlatformModeRating | undefined;
      const pB = b.platform[modeKey as keyof LeaderboardPlatformSnapshot] as PlatformModeRating | undefined;
      const progDiff = (pB?.prog ?? 0) - (pA?.prog ?? 0);
      if (progDiff !== 0) return progDiff;
      const gamesDiff = (pB?.games ?? 0) - (pA?.games ?? 0);
      if (gamesDiff !== 0) return gamesDiff;
    }
    return b.puzzles - a.puzzles || b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name, 'tr');
  });
  return withScore.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function entryForStudent(
  student: Student,
  puzzles: number,
  games: number,
  internalPuzzles: number,
  platform: LeaderboardPlatformSnapshot,
  gameResultsByMode: GameResultsByMode,
  wins = 0,
  draws = 0,
  losses = 0,
): Omit<LeaderboardEntry, 'rank' | 'score' | 'rankMetric'> {
  return {
    studentId: student.id,
    name: student.name,
    initials: studentInitials(student.name),
    group: student.group || '—',
    puzzles,
    games,
    internalPuzzles,
    wins,
    draws,
    losses,
    gameResultsByMode,
    platform,
  };
}
