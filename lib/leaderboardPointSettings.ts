export type LeaderboardScoringMode = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'other';

export interface ModePointValues {
  win: number;
  draw: number;
  loss: number;
}

export interface LeaderboardPointSettings {
  puzzle: number;
  bullet: ModePointValues;
  blitz: ModePointValues;
  rapid: ModePointValues;
  classical: ModePointValues;
  other: ModePointValues;
}

export const LEADERBOARD_SCORING_MODES: { id: LeaderboardScoringMode; label: string }[] = [
  { id: 'bullet', label: 'Bullet' },
  { id: 'blitz', label: 'Blitz' },
  { id: 'rapid', label: 'Rapid' },
  { id: 'classical', label: 'Klasik' },
  { id: 'other', label: 'Diğer' },
];

const DEFAULT_MODE_POINTS: ModePointValues = { win: 10, draw: 5, loss: 1 };

export const DEFAULT_LEADERBOARD_POINT_SETTINGS: LeaderboardPointSettings = {
  puzzle: 1,
  bullet: { ...DEFAULT_MODE_POINTS },
  blitz: { ...DEFAULT_MODE_POINTS },
  rapid: { ...DEFAULT_MODE_POINTS },
  classical: { ...DEFAULT_MODE_POINTS },
  other: { ...DEFAULT_MODE_POINTS },
};

export type GameResultsByMode = Record<LeaderboardScoringMode, { wins: number; draws: number; losses: number }>;

function clampPoint(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return fallback;
  return Math.round(v);
}

function normalizeModePoints(raw: unknown, fallback: ModePointValues): ModePointValues {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    win: clampPoint(r.win, fallback.win),
    draw: clampPoint(r.draw, fallback.draw),
    loss: clampPoint(r.loss, fallback.loss),
  };
}

export function normalizeLeaderboardPointSettings(raw?: Partial<LeaderboardPointSettings> | null): LeaderboardPointSettings {
  if (!raw) return { ...DEFAULT_LEADERBOARD_POINT_SETTINGS };
  return {
    puzzle: clampPoint(raw.puzzle, DEFAULT_LEADERBOARD_POINT_SETTINGS.puzzle),
    bullet: normalizeModePoints(raw.bullet, DEFAULT_LEADERBOARD_POINT_SETTINGS.bullet),
    blitz: normalizeModePoints(raw.blitz, DEFAULT_LEADERBOARD_POINT_SETTINGS.blitz),
    rapid: normalizeModePoints(raw.rapid, DEFAULT_LEADERBOARD_POINT_SETTINGS.rapid),
    classical: normalizeModePoints(raw.classical, DEFAULT_LEADERBOARD_POINT_SETTINGS.classical),
    other: normalizeModePoints(raw.other, DEFAULT_LEADERBOARD_POINT_SETTINGS.other),
  };
}

export function normalizeScoringMode(raw: string): LeaderboardScoringMode {
  const s = raw.toLowerCase().trim();
  if (s === 'bullet' || s === 'ultrabullet') return 'bullet';
  if (s === 'blitz') return 'blitz';
  if (s === 'rapid') return 'rapid';
  if (s === 'classical' || s === 'daily' || s === 'correspondence') return 'classical';
  return 'other';
}

export function emptyGameResultsByMode(): GameResultsByMode {
  return {
    bullet: { wins: 0, draws: 0, losses: 0 },
    blitz: { wins: 0, draws: 0, losses: 0 },
    rapid: { wins: 0, draws: 0, losses: 0 },
    classical: { wins: 0, draws: 0, losses: 0 },
    other: { wins: 0, draws: 0, losses: 0 },
  };
}

export function mergeGameResultsByMode(a: GameResultsByMode, b: GameResultsByMode): GameResultsByMode {
  const out = emptyGameResultsByMode();
  for (const mode of LEADERBOARD_SCORING_MODES) {
    out[mode.id].wins = a[mode.id].wins + b[mode.id].wins;
    out[mode.id].draws = a[mode.id].draws + b[mode.id].draws;
    out[mode.id].losses = a[mode.id].losses + b[mode.id].losses;
  }
  return out;
}

export function sumGameResultsByMode(byMode: GameResultsByMode): { wins: number; draws: number; losses: number; games: number } {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const mode of LEADERBOARD_SCORING_MODES) {
    wins += byMode[mode.id].wins;
    draws += byMode[mode.id].draws;
    losses += byMode[mode.id].losses;
  }
  return { wins, draws, losses, games: wins + draws + losses };
}

export function computeLeaderboardScoreFromBreakdown(
  puzzles: number,
  byMode: GameResultsByMode,
  settings: LeaderboardPointSettings = DEFAULT_LEADERBOARD_POINT_SETTINGS,
): number {
  let score = puzzles * settings.puzzle;
  for (const { id } of LEADERBOARD_SCORING_MODES) {
    const r = byMode[id];
    const p = settings[id];
    score += r.wins * p.win + r.draws * p.draw + r.losses * p.loss;
  }
  return score;
}

export function formatLeaderboardPointsSummary(settings: LeaderboardPointSettings): string {
  const parts = [`bulmaca ${settings.puzzle}p`];
  for (const { id, label } of LEADERBOARD_SCORING_MODES) {
    const p = settings[id];
    parts.push(`${label} G${p.win}/B${p.draw}/M${p.loss}`);
  }
  return parts.join(' · ');
}

export function resolveClubLeaderboardPointSettings(
  clubId: string | null | undefined,
  clubs: { id: string; leaderboardPoints?: LeaderboardPointSettings }[],
): LeaderboardPointSettings {
  if (!clubId) return DEFAULT_LEADERBOARD_POINT_SETTINGS;
  const club = clubs.find((c) => c.id === clubId);
  return normalizeLeaderboardPointSettings(club?.leaderboardPoints);
}
