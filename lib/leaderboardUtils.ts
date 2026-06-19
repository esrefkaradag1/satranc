import type { Student } from '../types';
import type { LichessActivity } from '../services/chessPlatformService';
import { studentInitials } from './homeworkPanelUtils';

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
  score: number;
  rank: number;
}

/** Bulmaca 1p, galibiyet 10p, beraberlik 5p, mağlubiyet 1p */
export function computeLeaderboardScore(puzzles: number, wins: number, draws: number, losses: number): number {
  return puzzles * 1 + wins * 10 + draws * 5 + losses * 1;
}

export function rankLeaderboardEntries(
  rows: Omit<LeaderboardEntry, 'rank' | 'score'>[],
): LeaderboardEntry[] {
  const withScore = rows.map((r) => ({
    ...r,
    score: computeLeaderboardScore(r.puzzles, r.wins, r.draws, r.losses),
    rank: 0,
  }));
  withScore.sort((a, b) => b.score - a.score || b.puzzles - a.puzzles || b.wins - a.wins || a.name.localeCompare(b.name, 'tr'));
  return withScore.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function entryForStudent(
  student: Student,
  puzzles: number,
  games: number,
  internalPuzzles: number,
  wins = 0,
  draws = 0,
  losses = 0,
): Omit<LeaderboardEntry, 'rank' | 'score'> {
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
  };
}
