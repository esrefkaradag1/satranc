import type { LichessGame, LichessUserProfile } from '../services/chessPlatformService';
import { lichessGameInvolvesUser } from '../services/chessPlatformService';

export type LichessRatingTrend = {
  perf: string;
  label: string;
  rating: number;
  prog: number | null;
  games: number;
};

export type LichessOpeningSummary = {
  name: string;
  count: number;
  wins: number;
  losses: number;
  draws: number;
};

const PERF_LABELS: Record<string, string> = {
  rapid: 'Rapid',
  blitz: 'Blitz',
  bullet: 'Bullet',
  classical: 'Klasik',
  correspondence: 'Yazışma',
  puzzle: 'Bulmaca',
};

export function lichessRatingTrends(profile: LichessUserProfile): LichessRatingTrend[] {
  const perfs = profile.perfs ?? {};
  const order = ['rapid', 'blitz', 'bullet', 'classical', 'correspondence', 'puzzle'];
  const rows: LichessRatingTrend[] = [];
  for (const key of order) {
    const perf = perfs[key];
    if (!perf || perf.rating <= 0) continue;
    rows.push({
      perf: key,
      label: PERF_LABELS[key] ?? key,
      rating: perf.rating,
      prog: typeof perf.prog === 'number' ? perf.prog : null,
      games: perf.games ?? 0,
    });
  }
  return rows;
}

function matchResultForUser(game: LichessGame, username: string): 'win' | 'loss' | 'draw' | null {
  const u = username.trim().toLowerCase();
  const w = game.players?.white?.user?.name?.toLowerCase() ?? game.players?.white?.user?.id?.toLowerCase() ?? '';
  const b = game.players?.black?.user?.name?.toLowerCase() ?? game.players?.black?.user?.id?.toLowerCase() ?? '';
  const isWhite = w === u;
  const isBlack = b === u;
  if (!isWhite && !isBlack) return null;
  if (!game.winner) return 'draw';
  if (game.winner === 'white') return isWhite ? 'win' : 'loss';
  return isBlack ? 'win' : 'loss';
}

/** Son oyunlardan açılış dağılımı (Lichess opening.name). */
export function summarizeLichessOpenings(games: LichessGame[], username: string): LichessOpeningSummary[] {
  const map = new Map<string, LichessOpeningSummary>();
  for (const game of games) {
    if (!lichessGameInvolvesUser(game, username)) continue;
    const name = game.opening?.name?.trim() || 'Bilinmeyen açılış';
    const row = map.get(name) ?? { name, count: 0, wins: 0, losses: 0, draws: 0 };
    row.count += 1;
    const result = matchResultForUser(game, username);
    if (result === 'win') row.wins += 1;
    else if (result === 'loss') row.losses += 1;
    else row.draws += 1;
    map.set(name, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function themeWinRate(results: { firstWins: number; nb: number }): number {
  if (!results.nb) return 0;
  return Math.round((results.firstWins / results.nb) * 100);
}
