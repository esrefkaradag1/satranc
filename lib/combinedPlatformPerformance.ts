import type { ChessComGame, LichessGame } from '../services/chessPlatformService';
import type { Student } from '../types';

export type CombinedPerformance = {
  totalGames: number;
  totalWin: number;
  totalDraw: number;
  totalLoss: number;
  winRate: number;
  drawRate: number;
  topSpeed: string;
  topOpening: string;
  avgLichessRatingDiff: number | null;
  avgChessComAccuracy: number | null;
  last14DaysActivity: Array<{ day: string; games: number }>;
};

export function computeLichessWinRate(lichessUsername: string | undefined, lichessGames: LichessGame[]): number | null {
  if (!lichessUsername?.trim() || lichessGames.length === 0) return null;
  const uname = lichessUsername.toLowerCase();
  let wins = 0;
  for (const g of lichessGames) {
    const isWhite = g.players?.white?.user?.name?.toLowerCase() === uname || g.players?.white?.user?.id?.toLowerCase() === uname;
    const isBlack = g.players?.black?.user?.name?.toLowerCase() === uname || g.players?.black?.user?.id?.toLowerCase() === uname;
    if ((isWhite && g.winner === 'white') || (isBlack && g.winner === 'black')) wins++;
  }
  return Math.round((wins / lichessGames.length) * 100);
}

export function computeChessComWinRate(chessComUsername: string | undefined, chessComGames: ChessComGame[]): number | null {
  if (!chessComUsername?.trim() || chessComGames.length === 0) return null;
  const uname = chessComUsername.toLowerCase();
  let wins = 0;
  for (const g of chessComGames) {
    if (g.white?.username?.toLowerCase() === uname && g.black?.result === 'checkmated') wins++;
    if (g.black?.username?.toLowerCase() === uname && g.white?.result === 'checkmated') wins++;
    if (g.white?.username?.toLowerCase() === uname && g.white?.result === 'win') wins++;
    if (g.black?.username?.toLowerCase() === uname && g.black?.result === 'win') wins++;
  }
  return Math.round((wins / chessComGames.length) * 100);
}

export function computeCombinedPerformance(
  student: Student,
  lichessGames: LichessGame[],
  chessComGames: ChessComGame[],
): CombinedPerformance {
  const lichessUser = student.lichessUsername?.toLowerCase() ?? '';
  const chessUser = student.chessComUsername?.toLowerCase() ?? '';

  let lWin = 0; let lDraw = 0; let lLoss = 0;
  const lBySpeed: Record<string, number> = {};
  let lRatingDelta = 0; let lRatingDeltaCount = 0;
  lichessGames.forEach((g) => {
    const whiteId = g.players?.white?.user?.id?.toLowerCase() ?? g.players?.white?.user?.name?.toLowerCase() ?? '';
    const blackId = g.players?.black?.user?.id?.toLowerCase() ?? g.players?.black?.user?.name?.toLowerCase() ?? '';
    const isWhite = whiteId === lichessUser;
    const isBlack = blackId === lichessUser;
    if (!isWhite && !isBlack) return;
    const speed = (g.speed || g.perf || 'other').toLowerCase();
    lBySpeed[speed] = (lBySpeed[speed] || 0) + 1;
    const diff = isWhite ? g.players?.white?.ratingDiff : g.players?.black?.ratingDiff;
    if (typeof diff === 'number') {
      lRatingDelta += diff;
      lRatingDeltaCount += 1;
    }
    if (!g.winner) lDraw += 1;
    else if ((isWhite && g.winner === 'white') || (isBlack && g.winner === 'black')) lWin += 1;
    else lLoss += 1;
  });

  let cWin = 0; let cDraw = 0; let cLoss = 0;
  const cBySpeed: Record<string, number> = {};
  let cAccuracy = 0; let cAccuracyCount = 0;
  chessComGames.forEach((g) => {
    const white = (g.white?.username ?? '').toLowerCase();
    const black = (g.black?.username ?? '').toLowerCase();
    const isWhite = white === chessUser;
    const isBlack = black === chessUser;
    if (!isWhite && !isBlack) return;
    const speed = (g.time_class || g.time_control || 'other').toLowerCase();
    cBySpeed[speed] = (cBySpeed[speed] || 0) + 1;
    const myResult = isWhite ? (g.white?.result ?? '') : (g.black?.result ?? '');
    if (myResult === 'win') cWin += 1;
    else if (['agreed', 'repetition', 'stalemate', 'timevsinsufficient', 'insufficient', '50move'].includes(myResult)) cDraw += 1;
    else cLoss += 1;
    const acc = isWhite ? g.accuracies?.white : g.accuracies?.black;
    if (typeof acc === 'number' && Number.isFinite(acc)) {
      cAccuracy += acc;
      cAccuracyCount += 1;
    }
  });

  const totalWin = lWin + cWin;
  const totalDraw = lDraw + cDraw;
  const totalLoss = lLoss + cLoss;
  const total = totalWin + totalDraw + totalLoss;
  const winRate = total > 0 ? Math.round((totalWin / total) * 100) : 0;
  const drawRate = total > 0 ? Math.round((totalDraw / total) * 100) : 0;

  const mergedBySpeed: Record<string, number> = { ...lBySpeed };
  Object.entries(cBySpeed).forEach(([k, v]) => { mergedBySpeed[k] = (mergedBySpeed[k] || 0) + v; });
  const topSpeed = Object.entries(mergedBySpeed).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  const topOpenings = lichessGames
    .map((g) => g.opening?.name?.trim())
    .filter((x): x is string => !!x)
    .reduce<Record<string, number>>((acc, o) => {
      acc[o] = (acc[o] || 0) + 1;
      return acc;
    }, {});
  const topOpening = Object.entries(topOpenings).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  const externalByDay: Record<string, number> = {};
  lichessGames.forEach((g) => {
    if (!g.createdAt) return;
    const day = new Date(g.createdAt).toISOString().slice(0, 10);
    externalByDay[day] = (externalByDay[day] || 0) + 1;
  });
  chessComGames.forEach((g) => {
    if (!g.end_time) return;
    const day = new Date(g.end_time * 1000).toISOString().slice(0, 10);
    externalByDay[day] = (externalByDay[day] || 0) + 1;
  });
  const last14DaysActivity = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    return { day: key.slice(5), games: externalByDay[key] || 0 };
  });

  return {
    totalGames: total,
    totalWin,
    totalDraw,
    totalLoss,
    winRate,
    drawRate,
    topSpeed,
    topOpening,
    avgLichessRatingDiff: lRatingDeltaCount > 0 ? Number((lRatingDelta / lRatingDeltaCount).toFixed(2)) : null,
    avgChessComAccuracy: cAccuracyCount > 0 ? Number((cAccuracy / cAccuracyCount).toFixed(1)) : null,
    last14DaysActivity,
  };
}
