import type {
  ChessComGame,
  ChessComMemberStats,
  ChessComStats,
  LichessActivity,
  LichessGame,
  LichessUserProfile,
} from '../services/chessPlatformService';

export type SkillKey = 'endgame' | 'tactics' | 'opening' | 'strategy';

export const SKILL_LABELS: Record<SkillKey, string> = {
  endgame: 'Oyun Sonu',
  tactics: 'Taktik',
  opening: 'Açılış',
  strategy: 'Strateji',
};

export interface PlatformSkillInput {
  lichessUsername?: string;
  chessComUsername?: string;
  lichessProfile: LichessUserProfile | null;
  lichessGames: LichessGame[];
  lichessActivity: LichessActivity[];
  chessComStats: ChessComStats | null;
  chessComGames: ChessComGame[];
  chessComMemberStats: ChessComMemberStats | null;
  homeworkSkills?: Record<SkillKey, number>;
}

export interface OpeningStat {
  name: string;
  played: number;
  winRate: number;
}

export interface TempoStat {
  speed: string;
  games: number;
  winRate: number;
}

export interface PlatformSkillResult {
  skills: Record<SkillKey, number>;
  hasPlatformData: boolean;
  totalGames: number;
  summaryFacts: string[];
  openingStats: OpeningStat[];
  tempoStats: TempoStat[];
  lichessPuzzleWinRate: number | null;
  avgChessComAccuracy: number | null;
  overallWinRate: number | null;
}

function normalizeRating(rating: number, floor = 500, ceil = 2800): number {
  const clamped = Math.max(floor, Math.min(ceil, rating));
  return Math.min(95, Math.max(20, Math.round(((clamped - floor) / (ceil - floor)) * 100)));
}

function lichessSide(game: LichessGame, username: string): 'white' | 'black' | null {
  const u = username.trim().toLowerCase();
  if (!u) return null;
  const w = (game.players?.white?.user?.id ?? game.players?.white?.user?.name ?? '').toLowerCase();
  const b = (game.players?.black?.user?.id ?? game.players?.black?.user?.name ?? '').toLowerCase();
  if (w === u) return 'white';
  if (b === u) return 'black';
  return null;
}

function lichessOutcome(game: LichessGame, side: 'white' | 'black'): 'win' | 'loss' | 'draw' {
  if (!game.winner) return 'draw';
  return game.winner === side ? 'win' : 'loss';
}

function chessComSide(game: ChessComGame, username: string): 'white' | 'black' | null {
  const u = username.trim().toLowerCase();
  const w = (game.white?.username ?? '').toLowerCase();
  const b = (game.black?.username ?? '').toLowerCase();
  if (w === u) return 'white';
  if (b === u) return 'black';
  return null;
}

function chessComOutcome(game: ChessComGame, side: 'white' | 'black'): 'win' | 'loss' | 'draw' {
  const result = side === 'white' ? (game.white?.result ?? '') : (game.black?.result ?? '');
  if (result === 'win') return 'win';
  if (['agreed', 'repetition', 'stalemate', 'timevsinsufficient', 'insufficient', '50move'].includes(result)) {
    return 'draw';
  }
  return 'loss';
}

function aggregateLichessPuzzles(activity: LichessActivity[]): { wins: number; total: number } {
  let wins = 0;
  let total = 0;
  for (const row of activity) {
    const score = row.puzzles?.score;
    if (!score) continue;
    wins += score.win ?? 0;
    total += (score.win ?? 0) + (score.loss ?? 0) + (score.draw ?? 0);
  }
  return { wins, total };
}

function computeOpeningSkill(lichessGames: LichessGame[], username: string): { score: number | null; stats: OpeningStat[] } {
  const byOpening: Record<string, { w: number; d: number; l: number }> = {};
  for (const g of lichessGames) {
    const name = g.opening?.name?.trim();
    if (!name) continue;
    const side = lichessSide(g, username);
    if (!side) continue;
    byOpening[name] ??= { w: 0, d: 0, l: 0 };
    const o = lichessOutcome(g, side);
    if (o === 'win') byOpening[name].w += 1;
    else if (o === 'draw') byOpening[name].d += 1;
    else byOpening[name].l += 1;
  }
  const stats: OpeningStat[] = Object.entries(byOpening)
    .map(([name, v]) => {
      const played = v.w + v.d + v.l;
      return { name, played, winRate: played > 0 ? Math.round((v.w / played) * 100) : 0 };
    })
    .filter((s) => s.played >= 1)
    .sort((a, b) => b.played - a.played);

  const tagged = stats.filter((s) => s.played >= 2);
  if (tagged.length === 0) return { score: null, stats };

  const weighted = tagged.reduce((sum, s) => sum + s.winRate * s.played, 0);
  const total = tagged.reduce((sum, s) => sum + s.played, 0);
  return { score: Math.round(weighted / total), stats };
}

function computeTempoStats(
  lichessGames: LichessGame[],
  chessComGames: ChessComGame[],
  lichessUser: string,
  chessUser: string,
): TempoStat[] {
  const bySpeed: Record<string, { w: number; total: number }> = {};

  for (const g of lichessGames) {
    const side = lichessSide(g, lichessUser);
    if (!side) continue;
    const speed = (g.speed || g.perf || 'other').toLowerCase();
    bySpeed[speed] ??= { w: 0, total: 0 };
    bySpeed[speed].total += 1;
    if (lichessOutcome(g, side) === 'win') bySpeed[speed].w += 1;
  }
  for (const g of chessComGames) {
    const side = chessComSide(g, chessUser);
    if (!side) continue;
    const speed = (g.time_class || g.time_control || 'other').toLowerCase();
    bySpeed[speed] ??= { w: 0, total: 0 };
    bySpeed[speed].total += 1;
    if (chessComOutcome(g, side) === 'win') bySpeed[speed].w += 1;
  }

  return Object.entries(bySpeed)
    .map(([speed, v]) => ({
      speed,
      games: v.total,
      winRate: v.total > 0 ? Math.round((v.w / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.games - a.games);
}

function computeEndgameSkill(
  lichessGames: LichessGame[],
  chessComGames: ChessComGame[],
  lichessUser: string,
  chessUser: string,
): number | null {
  let wins = 0;
  let total = 0;

  for (const g of lichessGames) {
    const side = lichessSide(g, lichessUser);
    if (!side) continue;
    const start = g.createdAt ?? 0;
    const end = g.lastMoveAt ?? start;
    const durationMs = end - start;
    if (durationMs < 8 * 60 * 1000) continue;
    total += 1;
    if (lichessOutcome(g, side) === 'win') wins += 1;
  }

  for (const g of chessComGames) {
    const side = chessComSide(g, chessUser);
    if (!side) continue;
    const myResult = side === 'white' ? (g.white?.result ?? '') : (g.black?.result ?? '');
    const oppResult = side === 'white' ? (g.black?.result ?? '') : (g.white?.result ?? '');
    if (myResult === 'win' && oppResult === 'checkmated') {
      total += 1;
      wins += 1;
    } else if (myResult === 'timeout' || myResult === 'resigned' || myResult === 'checkmated') {
      total += 1;
    }
  }

  if (total < 5) return null;
  return Math.min(95, Math.max(20, Math.round((wins / total) * 100)));
}

function computeStrategySkill(
  lichessGames: LichessGame[],
  chessComGames: ChessComGame[],
  lichessUser: string,
  chessUser: string,
  chessComStats: ChessComStats | null,
): { score: number | null; avgAccuracy: number | null } {
  let wins = 0;
  let draws = 0;
  let total = 0;
  let ratingDelta = 0;
  let ratingDeltaCount = 0;
  let accuracy = 0;
  let accuracyCount = 0;

  for (const g of lichessGames) {
    const side = lichessSide(g, lichessUser);
    if (!side) continue;
    total += 1;
    const o = lichessOutcome(g, side);
    if (o === 'win') wins += 1;
    else if (o === 'draw') draws += 1;
    const diff = side === 'white' ? g.players?.white?.ratingDiff : g.players?.black?.ratingDiff;
    if (typeof diff === 'number') {
      ratingDelta += diff;
      ratingDeltaCount += 1;
    }
  }

  for (const g of chessComGames) {
    const side = chessComSide(g, chessUser);
    if (!side) continue;
    total += 1;
    const o = chessComOutcome(g, side);
    if (o === 'win') wins += 1;
    else if (o === 'draw') draws += 1;
    const acc = side === 'white' ? g.accuracies?.white : g.accuracies?.black;
    if (typeof acc === 'number' && Number.isFinite(acc)) {
      accuracy += acc;
      accuracyCount += 1;
    }
  }

  const avgAccuracy = accuracyCount > 0 ? Number((accuracy / accuracyCount).toFixed(1)) : null;

  if (total < 5 && !avgAccuracy) return { score: null, avgAccuracy };

  const winRate = total > 0 ? wins / total : 0;
  const drawRate = total > 0 ? draws / total : 0;
  const avgDiff = ratingDeltaCount > 0 ? ratingDelta / ratingDeltaCount : 0;
  const diffScore = Math.min(95, Math.max(25, 50 + avgDiff * 8));
  const winScore = Math.round(winRate * 100);
  const drawBonus = Math.round(drawRate * 40);
  const accuracyScore = avgAccuracy != null ? Math.min(95, Math.max(25, Math.round(avgAccuracy))) : null;

  const parts = [winScore, drawBonus, diffScore];
  if (accuracyScore != null) parts.push(accuracyScore);
  if (chessComStats?.chess_rapid?.last?.rating) {
    parts.push(normalizeRating(chessComStats.chess_rapid.last.rating));
  }

  return {
    score: Math.round(parts.reduce((a, b) => a + b, 0) / parts.length),
    avgAccuracy,
  };
}

function computeTacticsSkill(
  lichessProfile: LichessUserProfile | null,
  lichessActivity: LichessActivity[],
  chessComStats: ChessComStats | null,
  chessComMemberStats: ChessComMemberStats | null,
  homeworkTactics?: number,
): { score: number | null; puzzleWinRate: number | null } {
  const parts: number[] = [];
  const { wins, total } = aggregateLichessPuzzles(lichessActivity);
  const puzzleWinRate = total >= 5 ? Math.round((wins / total) * 100) : null;

  if (lichessProfile?.perfs?.puzzle?.rating) {
    parts.push(normalizeRating(lichessProfile.perfs.puzzle.rating, 400, 3000));
  }
  if (chessComStats?.tactics?.highest?.rating) {
    parts.push(normalizeRating(chessComStats.tactics.highest.rating, 400, 3500));
  }
  if (puzzleWinRate != null) parts.push(puzzleWinRate);
  if (chessComMemberStats?.tactics?.highestRating) {
    parts.push(normalizeRating(chessComMemberStats.tactics.highestRating, 400, 3500));
  }
  if (chessComMemberStats?.puzzleRush?.totalPuzzleAttempts && chessComMemberStats.puzzleRush.totalPuzzleAttempts > 20) {
    parts.push(normalizeRating(chessComMemberStats.puzzleRush.highestScore ?? 1200, 200, 120));
  }
  if (homeworkTactics != null && homeworkTactics > 0) parts.push(homeworkTactics);

  if (parts.length === 0) return { score: null, puzzleWinRate };
  return { score: Math.round(parts.reduce((a, b) => a + b, 0) / parts.length), puzzleWinRate };
}

export function mergeSkillScores(
  homework: Record<SkillKey, number>,
  platform: Record<SkillKey, number>,
  platformWeight: number,
): Record<SkillKey, number> {
  const w = Math.max(0, Math.min(1, platformWeight));
  const out = { ...homework };
  for (const k of Object.keys(out) as SkillKey[]) {
    out[k] = Math.round(platform[k] * w + homework[k] * (1 - w));
  }
  return out;
}

export function analyzePlatformSkills(input: PlatformSkillInput): PlatformSkillResult {
  const lichessUser = input.lichessUsername?.trim() ?? '';
  const chessUser = input.chessComUsername?.trim() ?? '';
  const homework = input.homeworkSkills;

  const opening = lichessUser
    ? computeOpeningSkill(input.lichessGames, lichessUser)
    : { score: null as number | null, stats: [] as OpeningStat[] };
  const tactics = computeTacticsSkill(
    input.lichessProfile,
    input.lichessActivity,
    input.chessComStats,
    input.chessComMemberStats,
    homework?.tactics,
  );
  const endgame = computeEndgameSkill(input.lichessGames, input.chessComGames, lichessUser, chessUser);
  const strategy = computeStrategySkill(
    input.lichessGames,
    input.chessComGames,
    lichessUser,
    chessUser,
    input.chessComStats,
  );
  const tempoStats = computeTempoStats(input.lichessGames, input.chessComGames, lichessUser, chessUser);

  const defaults: Record<SkillKey, number> = {
    endgame: homework?.endgame ?? 35,
    tactics: homework?.tactics ?? 40,
    opening: homework?.opening ?? 40,
    strategy: homework?.strategy ?? 45,
  };

  const skills: Record<SkillKey, number> = {
    opening: opening.score ?? defaults.opening,
    tactics: tactics.score ?? defaults.tactics,
    endgame: endgame ?? defaults.endgame,
    strategy: strategy.score ?? defaults.strategy,
  };

  let totalGames = 0;
  let totalWins = 0;
  if (lichessUser) {
    for (const g of input.lichessGames) {
      const side = lichessSide(g, lichessUser);
      if (!side) continue;
      totalGames += 1;
      if (lichessOutcome(g, side) === 'win') totalWins += 1;
    }
  }
  if (chessUser) {
    for (const g of input.chessComGames) {
      const side = chessComSide(g, chessUser);
      if (!side) continue;
      totalGames += 1;
      if (chessComOutcome(g, side) === 'win') totalWins += 1;
    }
  }

  const hasPlatformData =
  totalGames > 0 ||
  !!input.lichessProfile ||
  !!input.chessComStats ||
  (tactics.puzzleWinRate != null);

  const summaryFacts: string[] = [];
  if (input.lichessProfile) {
    const rapid = input.lichessProfile.perfs?.rapid?.rating;
    const blitz = input.lichessProfile.perfs?.blitz?.rating;
    const puzzle = input.lichessProfile.perfs?.puzzle?.rating;
    if (rapid) summaryFacts.push(`Lichess rapid: ${rapid}`);
    if (blitz) summaryFacts.push(`Lichess blitz: ${blitz}`);
    if (puzzle) summaryFacts.push(`Lichess puzzle rating: ${puzzle}`);
  }
  if (input.chessComStats?.chess_rapid?.last?.rating) {
    summaryFacts.push(`Chess.com rapid: ${input.chessComStats.chess_rapid.last.rating}`);
  }
  if (input.chessComStats?.tactics?.highest?.rating) {
    summaryFacts.push(`Chess.com taktik en yüksek: ${input.chessComStats.tactics.highest.rating}`);
  }
  if (totalGames > 0) {
    summaryFacts.push(`Son ${totalGames} oyun win rate: %${Math.round((totalWins / totalGames) * 100)}`);
  }
  if (tactics.puzzleWinRate != null) {
    summaryFacts.push(`Lichess bulmaca başarısı: %${tactics.puzzleWinRate}`);
  }
  if (strategy.avgAccuracy != null) {
    summaryFacts.push(`Chess.com ortalama doğruluk: %${strategy.avgAccuracy}`);
  }
  if (opening.stats[0]) {
    summaryFacts.push(
      `En çok oynanan açılış: ${opening.stats[0].name} (${opening.stats[0].played} maç, %${opening.stats[0].winRate} galibiyet)`,
    );
  }
  if (tempoStats[0]) {
    summaryFacts.push(
      `En çok tempo: ${tempoStats[0].speed} (${tempoStats[0].games} maç, %${tempoStats[0].winRate} galibiyet)`,
    );
  }

  return {
    skills,
    hasPlatformData,
    totalGames,
    summaryFacts,
    openingStats: opening.stats,
    tempoStats,
    lichessPuzzleWinRate: tactics.puzzleWinRate,
    avgChessComAccuracy: strategy.avgAccuracy,
    overallWinRate: totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : null,
  };
}

export function buildPlatformContextLines(result: PlatformSkillResult): {
  platformLine: string;
  detailedStatsLine: string;
  recentOpeningsLine: string;
  activityLine: string;
} {
  const platformLine = result.summaryFacts.length
    ? result.summaryFacts.join('. ') + '.'
    : 'Platform verisi yok.';

  const detailedStatsLine = (Object.entries(result.skills) as [SkillKey, number][])
    .map(([k, v]) => `${SKILL_LABELS[k]}: %${v} (platform analizi)`)
    .join('; ');

  const recentOpeningsLine =
    result.openingStats
      .slice(0, 10)
      .map((o) => `- ${o.name}: ${o.played} maç, galibiyet %${o.winRate}`)
      .join('\n') || 'Açılış verisi yok.';

  const activityLine =
    result.tempoStats
      .slice(0, 6)
      .map((t) => `- ${t.speed}: ${t.games} maç, galibiyet %${t.winRate}`)
      .join('\n') || 'Tempo dağılımı yok.';

  return { platformLine, detailedStatsLine, recentOpeningsLine, activityLine };
}
