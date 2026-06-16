import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, TrendingUp, Target, Brain, ChevronRight, ArrowLeft, X, Users, BookOpen, PieChart, Search, Sparkles, Loader2 } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useApp } from '../AppContext';
import type { Student, Puzzle, HomeworkPuzzleAttempt } from '../types';
import {
  analyzeStudentComprehensive,
  formatOpenRouterError,
  isOpenRouterConfigured,
} from '../services/geminiService';
import { GameMistakeReview } from './GameMistakeReview';
import { AiCoachInsightPanel, SkillSnapshot } from './analysis/AiInsightCards';
import { SendCoachReportBar } from './analysis/SendCoachReportBar';
import {
  fetchLichessUser,
  fetchLichessGamesPage,
  fetchChessComPlayer,
  fetchChessComStats,
  fetchChessComGamesPage,
  type LichessUserProfile,
  type LichessGame,
  type ChessComPlayer,
  type ChessComStats,
  type ChessComGame,
} from '../services/chessPlatformService';

const MONTH_NAMES = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

type SkillKey = 'endgame' | 'tactics' | 'opening' | 'strategy';

const SKILL_LABELS: Record<SkillKey, string> = {
  endgame: 'Oyun Sonu',
  tactics: 'Taktik',
  opening: 'Açılış',
  strategy: 'Strateji',
};

const SKILL_COLORS: Record<SkillKey, string> = {
  endgame: 'bg-rose-500',
  tactics: 'bg-emerald-500',
  opening: 'bg-indigo-500',
  strategy: 'bg-amber-500',
};

const PLATFORM_SAMPLE_LIMIT = 100;

function mapCategoryToSkill(cat: string, theme?: string): SkillKey | null {
  const c = (cat || '').toLowerCase();
  const t = (theme || '').toLowerCase();
  const combined = `${c} ${t}`;
  if (/final|oyun sonu|endgame|king.*pawn/.test(combined)) return 'endgame';
  if (/mat|çatal|fedâ|açma|taktik|tactic|fork|pin|skewer/.test(combined)) return 'tactics';
  if (/açılış|opening/.test(combined)) return 'opening';
  if (/orta|strateji|middlegame|strategy/.test(combined)) return 'strategy';
  return null;
}

function getEloChartDataAcademy(students: { elo: number }[]): { name: string; elo: number }[] {
  const now = new Date();
  const count = students.length;
  const avgNow = count > 0 ? Math.round(students.reduce((s, st) => s + st.elo, 0) / count) : 1200;
  const data: { name: string; elo: number }[] = [];
  const minElo = Math.max(800, avgNow - 350);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthName = MONTH_NAMES[d.getMonth()];
    const progress = 1 - (5 - i) / 6;
    const elo = Math.round(minElo + (avgNow - minElo) * progress * (0.7 + 0.3 * Math.random()));
    data.push({ name: monthName, elo: i === 0 ? avgNow : elo });
  }
  return data;
}

function getEloChartDataStudent(student: Student): { name: string; elo: number }[] {
  const now = new Date();
  const currentElo = student.elo ?? 1000;
  const regDate = student.registrationDate ? new Date(student.registrationDate) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const startElo = Math.max(600, Math.min(currentElo - 150, 1000));
  const data: { name: string; elo: number }[] = [];
  const monthsToShow = 6;
  for (let i = monthsToShow - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthName = MONTH_NAMES[d.getMonth()];
    if (d < regDate) {
      data.push({ name: monthName, elo: startElo });
    } else {
      const progress = i === 0 ? 1 : 1 - i / monthsToShow;
      const elo = Math.round(startElo + (currentElo - startElo) * progress);
      data.push({ name: monthName, elo });
    }
  }
  if (data.length > 0) data[data.length - 1].elo = currentElo;
  return data;
}

function getSkillDistributionAcademy(puzzles: { category: string; theme?: string }[], students: { level: string }[]): Record<SkillKey, number> {
  const counts: Record<SkillKey, number> = { endgame: 0, tactics: 0, opening: 0, strategy: 0 };
  for (const p of puzzles) {
    const key = mapCategoryToSkill(p.category, p.theme);
    if (key) counts[key]++;
  }
  const total = puzzles.length || 1;
  const pct = (key: SkillKey) => Math.round((counts[key] / total) * 100);
  const advancedCount = students.filter(s => s.level === 'İleri').length;
  const intermediateCount = students.filter(s => s.level === 'Orta').length;
  const levelBonus = total > 0 ? Math.min(15, advancedCount * 2 + intermediateCount) : 0;
  return {
    endgame: Math.min(95, Math.max(35, pct('endgame') + (levelBonus - 5))),
    tactics: Math.min(95, Math.max(40, pct('tactics') + levelBonus)),
    opening: Math.min(95, Math.max(40, pct('opening') + (levelBonus - 3))),
    strategy: Math.min(95, Math.max(40, pct('strategy') + (levelBonus - 5))),
  };
}

function getSkillDistributionStudent(
  attempts: HomeworkPuzzleAttempt[],
  puzzlesById: Map<string, Puzzle>
): Record<SkillKey, number> {
  const correctBySkill: Record<SkillKey, number> = { endgame: 0, tactics: 0, opening: 0, strategy: 0 };
  const totalBySkill: Record<SkillKey, number> = { endgame: 0, tactics: 0, opening: 0, strategy: 0 };
  for (const a of attempts) {
    const puzzle = puzzlesById.get(a.puzzleId);
    const key = puzzle ? mapCategoryToSkill(puzzle.category, puzzle.theme) : null;
    if (key) {
      totalBySkill[key]++;
      if (a.correct) correctBySkill[key]++;
    }
  }
  const result: Record<SkillKey, number> = { endgame: 35, tactics: 40, opening: 40, strategy: 45 };
  for (const k of Object.keys(result) as SkillKey[]) {
    const tot = totalBySkill[k];
    if (tot > 0) result[k] = Math.min(95, Math.round((correctBySkill[k] / tot) * 100));
  }
  return result;
}

function getAiSuggestion(skills: Record<SkillKey, number>, studentName?: string): { text: string; focus: string } {
  const entries = (Object.entries(skills) as [SkillKey, number][]).sort((a, b) => a[1] - b[1]);
  const [weakestKey, value] = entries[0];
  const label = SKILL_LABELS[weakestKey];
  const focus =
    weakestKey === 'endgame'
      ? 'kale ve piyon finalleri'
      : weakestKey === 'tactics'
        ? 'mat ve çatal taktikleri'
        : weakestKey === 'opening'
          ? 'açılış prensipleri'
          : 'orta oyun ve strateji';
  const prefix = studentName
    ? `${studentName} için "${label}" başarısı %${value}. `
    : `Akademi genelinde "${label}" başarısı %${value} seviyesinde. `;
  return {
    text: `${prefix}Bu hafta ${focus} üzerine yoğunlaşılması önerilir.`,
    focus: label,
  };
}

const SkillBar = ({ label, value, color }: { label: string; value: number; color: string; key?: React.Key }) => (
  <div className="space-y-2.5">
    <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
      <span>{label}</span>
      <span className="text-slate-300">%{value}</span>
    </div>
    <div className="h-2 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
      <div
        className={`h-full ${color} rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] transition-all duration-1000 ease-out`}
        style={{ width: `${value}%` }}
      />
    </div>
  </div>
);

interface AnalysisProps {
  isEmbedded?: boolean;
  studentId?: string | null;
}

const Analysis: React.FC<AnalysisProps> = ({ isEmbedded = false, studentId = null }) => {
  const { students, puzzles, homeworkAttempts } = useApp();
  const [showDetailReport, setShowDetailReport] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(studentId ?? null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<{ eksiklikler: string; hamleler: string } | null>(null);
  const openRouterReady = useMemo(() => isOpenRouterConfigured(), []);
  const [platformLoading, setPlatformLoading] = useState(false);
  const [lichessProfile, setLichessProfile] = useState<LichessUserProfile | null>(null);
  const [lichessGames, setLichessGames] = useState<LichessGame[]>([]);
  const [chessComProfile, setChessComProfile] = useState<ChessComPlayer | null>(null);
  const [chessComStats, setChessComStats] = useState<ChessComStats | null>(null);
  const [chessComGames, setChessComGames] = useState<ChessComGame[]>([]);

  const selectedStudent = useMemo(
    () => (selectedStudentId ? students.find((s) => s.id === selectedStudentId) ?? null : null),
    [students, selectedStudentId]
  );

  const puzzlesById = useMemo(() => {
    const m = new Map<string, Puzzle>();
    puzzles.forEach((p) => m.set(p.id, p));
    return m;
  }, [puzzles]);

  const eloData = useMemo(() => {
    if (selectedStudent) return getEloChartDataStudent(selectedStudent);
    return getEloChartDataAcademy(students);
  }, [students, selectedStudent]);

  const skillDistribution = useMemo(() => {
    if (selectedStudentId) {
      const attempts = homeworkAttempts.filter((a) => a.studentId === selectedStudentId);
      return getSkillDistributionStudent(attempts, puzzlesById);
    }
    return getSkillDistributionAcademy(puzzles, students);
  }, [puzzles, students, selectedStudentId, homeworkAttempts, puzzlesById]);

  const suggestion = useMemo(
    () => getAiSuggestion(skillDistribution, selectedStudent?.name),
    [skillDistribution, selectedStudent?.name]
  );

  const academyAvgElo = useMemo(() => {
    if (students.length === 0) return 0;
    return Math.round(students.reduce((s, st) => s + st.elo, 0) / students.length);
  }, [students]);

  const currentLabel = selectedStudent
    ? `${selectedStudent.name} · Son: ${selectedStudent.elo} ELO`
    : students.length > 0
      ? `${students.length} öğrenci · Son: ${academyAvgElo} ELO`
      : null;

  const levelBreakdown = useMemo(() => {
    const b: Record<string, number> = {};
    students.forEach(s => {
      b[s.level] = (b[s.level] || 0) + 1;
    });
    return Object.entries(b).sort((a, b) => b[1] - a[1]);
  }, [students]);

  const categoryBreakdown = useMemo(() => {
    const b: Record<string, number> = {};
    puzzles.forEach(p => {
      const c = p.category || 'Genel';
      b[c] = (b[c] || 0) + 1;
    });
    return Object.entries(b).sort((a, b) => b[1] - a[1]);
  }, [puzzles]);

  const selectedStudentAttempts = useMemo(
    () => (selectedStudentId ? homeworkAttempts.filter((a) => a.studentId === selectedStudentId) : []),
    [selectedStudentId, homeworkAttempts]
  );

  const homeworkSummary = useMemo(() => {
    if (!selectedStudent) return null;
    const attempts = selectedStudentAttempts;
    const total = attempts.length;
    const correct = attempts.filter((a) => a.correct).length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const byDay: Record<string, { total: number; correct: number }> = {};
    attempts.forEach((a) => {
      const day = String(a.timestamp || '').slice(0, 10);
      if (!day) return;
      byDay[day] ??= { total: 0, correct: 0 };
      byDay[day].total += 1;
      if (a.correct) byDay[day].correct += 1;
    });
    const trend = Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-7)
      .map(([day, v]) => ({
        day,
        acc: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
      }));
    return { total, correct, accuracy, trend };
  }, [selectedStudent, selectedStudentAttempts]);

  const loadPlatforms = useCallback(async () => {
    if (!selectedStudent) {
      setLichessProfile(null);
      setLichessGames([]);
      setChessComProfile(null);
      setChessComStats(null);
      setChessComGames([]);
      return;
    }
    setPlatformLoading(true);
    try {
      const lUser = selectedStudent.lichessUsername?.trim();
      const cUser = selectedStudent.chessComUsername?.trim();
      const [lp, cp, cs] = await Promise.all([
        lUser ? fetchLichessUser(lUser) : Promise.resolve(null),
        cUser ? fetchChessComPlayer(cUser) : Promise.resolve(null),
        cUser ? fetchChessComStats(cUser) : Promise.resolve(null),
      ]);
      let lg: LichessGame[] = [];
      if (lUser) {
        let until: number | null = null;
        while (lg.length < PLATFORM_SAMPLE_LIMIT) {
          const page = await fetchLichessGamesPage(lUser, { max: 20, until: until ?? undefined });
          if (!page.games.length) break;
          lg = [...lg, ...page.games];
          if (!page.hasMore || page.nextUntil == null) break;
          until = page.nextUntil;
        }
      }
      let cg: ChessComGame[] = [];
      if (cUser) {
        let beforeEndTime: number | null = null;
        while (cg.length < PLATFORM_SAMPLE_LIMIT) {
          const page = await fetchChessComGamesPage(cUser, { max: 20, beforeEndTime: beforeEndTime ?? undefined });
          if (!page.games.length) break;
          cg = [...cg, ...page.games];
          if (!page.hasMore || page.nextBeforeEndTime == null) break;
          beforeEndTime = page.nextBeforeEndTime;
        }
      }
      setLichessProfile(lp);
      setLichessGames(lg.slice(0, PLATFORM_SAMPLE_LIMIT));
      setChessComProfile(cp);
      setChessComStats(cs);
      setChessComGames(cg.slice(0, PLATFORM_SAMPLE_LIMIT));
    } finally {
      setPlatformLoading(false);
    }
  }, [selectedStudent]);

  useEffect(() => {
    loadPlatforms();
    setAiInsight(null);
    setAiError(null);
  }, [loadPlatforms]);

  const lichessWinRate = useMemo(() => {
    if (!selectedStudent?.lichessUsername || lichessGames.length === 0) return null;
    const uname = selectedStudent.lichessUsername.toLowerCase();
    let wins = 0;
    for (const g of lichessGames) {
      const isWhite = g.players?.white?.user?.name?.toLowerCase() === uname || g.players?.white?.user?.id?.toLowerCase() === uname;
      const isBlack = g.players?.black?.user?.name?.toLowerCase() === uname || g.players?.black?.user?.id?.toLowerCase() === uname;
      if ((isWhite && g.winner === 'white') || (isBlack && g.winner === 'black')) wins++;
    }
    return Math.round((wins / lichessGames.length) * 100);
  }, [selectedStudent?.lichessUsername, lichessGames]);

  const chessComWinRate = useMemo(() => {
    if (!selectedStudent?.chessComUsername || chessComGames.length === 0) return null;
    const uname = selectedStudent.chessComUsername.toLowerCase();
    let wins = 0;
    for (const g of chessComGames) {
      if (g.white?.username?.toLowerCase() === uname && g.black?.result === 'checkmated') wins++;
      if (g.black?.username?.toLowerCase() === uname && g.white?.result === 'checkmated') wins++;
      if (g.white?.username?.toLowerCase() === uname && g.white?.result === 'win') wins++;
      if (g.black?.username?.toLowerCase() === uname && g.black?.result === 'win') wins++;
    }
    return Math.round((wins / chessComGames.length) * 100);
  }, [selectedStudent?.chessComUsername, chessComGames]);

  const recentGameSnapshot = useMemo(() => {
    if (!selectedStudent) return null;
    const lichessRecent = lichessGames.slice(0, 10);
    const chessRecent = chessComGames.slice(0, 10);
    const lichessCount = lichessRecent.length;
    const chessCount = chessRecent.length;
    return {
      lichessCount,
      chessCount,
      totalRecent: lichessCount + chessCount,
    };
  }, [selectedStudent, lichessGames, chessComGames]);

  const combinedPerformance = useMemo(() => {
    if (!selectedStudent) return null;
    const lichessUser = selectedStudent.lichessUsername?.toLowerCase() ?? '';
    const chessUser = selectedStudent.chessComUsername?.toLowerCase() ?? '';

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
  }, [selectedStudent, lichessGames, chessComGames]);

  const generateAiInsight = useCallback(async () => {
    if (!selectedStudent) return;
    if (!openRouterReady) {
      setAiError('OpenRouter API anahtarı tanımlı değil. .env dosyasına VITE_OPENROUTER_API_KEY ekleyin.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const attemptsPayload = selectedStudentAttempts.slice(0, 30).map((a) => ({
        puzzleTitle: puzzlesById.get(a.puzzleId)?.title || a.puzzleTitle || 'Bulmaca',
        correct: a.correct,
        movesPlayed: a.movesPlayed ?? [],
        solutionMoves: a.solutionMoves ?? [],
      }));

      const skillLines = (Object.entries(skillDistribution) as [SkillKey, number][])
        .map(([k, v]) => `- ${SKILL_LABELS[k]}: %${v}`)
        .join('\n');

      const homeworkLine = homeworkSummary
        ? `Toplam ${homeworkSummary.total} deneme, doğruluk %${homeworkSummary.accuracy}. Son 7 gün trendi: ${homeworkSummary.trend.map((t) => `${t.day} %${t.acc}`).join(', ') || 'veri yok'}.`
        : 'Ödev denemesi kaydı yok.';

      const platformParts: string[] = [];
      if (lichessProfile) {
        platformParts.push(
          `Lichess rapid ${lichessProfile.perfs?.rapid?.rating ?? '—'}, son ${lichessGames.length} oyun, win rate %${lichessWinRate ?? '—'}.`
        );
      }
      if (chessComStats) {
        platformParts.push(
          `Chess.com rapid ${chessComStats.chess_rapid?.last?.rating ?? '—'}, son ${chessComGames.length} oyun, win rate %${chessComWinRate ?? '—'}.`
        );
      }
      if (combinedPerformance) {
        platformParts.push(
          `Birleşik: ${combinedPerformance.totalGames} oyun, win %${combinedPerformance.winRate}, draw %${combinedPerformance.drawRate}, en çok tempo: ${combinedPerformance.topSpeed}.`
        );
      }
      const platformLine = platformParts.length
        ? platformParts.join(' ')
        : 'Lichess/Chess.com kullanıcı adı yok veya veri çekilemedi.';

      const openingCounts: Record<string, number> = {};
      lichessGames.forEach((g) => {
        const name = g.opening?.name?.trim();
        if (name) openingCounts[name] = (openingCounts[name] || 0) + 1;
      });
      const recentOpeningsLine = Object.entries(openingCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => `- ${name} (${count}x)`)
        .join('\n') || 'Açılış verisi yok.';

      const res = await analyzeStudentComprehensive(selectedStudent.name, attemptsPayload, {
        skillLines,
        homeworkLine,
        platformLine,
        recentOpeningsLine,
      });
      setAiInsight(res);
    } catch (e) {
      setAiInsight(null);
      setAiError(formatOpenRouterError(e));
    } finally {
      setAiLoading(false);
    }
  }, [
    selectedStudent,
    selectedStudentAttempts,
    puzzlesById,
    openRouterReady,
    skillDistribution,
    homeworkSummary,
    lichessProfile,
    lichessGames,
    lichessWinRate,
    chessComStats,
    chessComGames,
    chessComWinRate,
    combinedPerformance,
  ]);

  useEffect(() => {
    if (studentId !== undefined) {
      setSelectedStudentId(studentId);
      if (studentId) setMobileAnalysisPanel('detail');
    }
  }, [studentId]);

  const [studentSearch, setStudentSearch] = useState('');
  const [mobileAnalysisPanel, setMobileAnalysisPanel] = useState<'list' | 'detail'>('list');

  const selectStudentForAnalysis = useCallback((id: string | null) => {
    setSelectedStudentId(id);
    setMobileAnalysisPanel('detail');
  }, []);

  const filteredStudents = useMemo(() => {
    if (!studentSearch) return students;
    return students.filter(s => s.name.toLowerCase().includes(studentSearch.toLowerCase()));
  }, [students, studentSearch]);

  return (
    <div className={`flex flex-col min-w-0 w-full animate-in fade-in slide-in-from-bottom-4 duration-700 ${isEmbedded ? 'h-full' : 'min-h-0 flex-1'}`}>
      {!isEmbedded && (
        <div className="mb-3 sm:mb-4 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-4 py-3 text-xs text-indigo-100/90 leading-relaxed">
          <span className="font-bold text-indigo-200">Platform analizi:</span>{' '}
          Lichess / Chess.com oyun verisi ve AI koç içgörüleri burada gösterilir.
          Ödev bulmaca sonuçları ve günlük hedefler için{' '}
          <a href="#/odev-yonetimi" className="font-bold text-white underline underline-offset-2 hover:text-indigo-200">
            Ödev Takibi
          </a>{' '}
          sekmesini kullanın.
        </div>
      )}
    <div className={`flex flex-col lg:flex-row min-w-0 w-full ${isEmbedded ? 'h-full flex-1' : 'min-h-0 flex-1 gap-0 lg:gap-6'}`}>
      {/* ── SIDEBAR: Student Selection ────────────────────────────────────────── */}
      {!isEmbedded && (
        <aside className={`${mobileAnalysisPanel === 'list' ? 'flex' : 'hidden'} lg:flex w-full lg:w-80 shrink-0 flex-col flex-1 lg:flex-none min-h-0 bg-[#1e293b]/50 backdrop-blur-2xl rounded-none sm:rounded-2xl lg:rounded-3xl border-0 sm:border border-white/10 overflow-hidden shadow-2xl`}>
          <div className="p-4 sm:p-6 border-b border-white/5 space-y-3 sm:space-y-4 shrink-0">
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tighter uppercase">Öğrenci Analizi</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Performans Takibi</p>
            </div>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Öğrenci ara..."
                className="w-full bg-black/20 border border-white/5 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
            <button
              onClick={() => selectStudentForAnalysis(null)}
              className={`w-full text-left p-4 rounded-2xl transition-all border flex items-center gap-4 group ${
                selectedStudentId === null
                  ? 'bg-indigo-600 border-indigo-500 shadow-xl shadow-indigo-600/20 text-white'
                  : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10 hover:text-slate-200'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-inner transition-colors ${
                selectedStudentId === null ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'
              }`}>
                AK
              </div>
              <div>
                <p className="text-sm font-black tracking-tight">Akademi Ortalaması</p>
                <p className={`text-[10px] font-black uppercase tracking-widest ${selectedStudentId === null ? 'text-indigo-200' : 'text-slate-600 group-hover:text-slate-500'}`}>Genel Veri</p>
              </div>
            </button>

            <div className="pt-2">
              <p className="px-4 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-3">Öğrenci Listesi</p>
              <div className="space-y-2">
                {filteredStudents.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => selectStudentForAnalysis(s.id)}
                    className={`w-full text-left p-4 rounded-2xl transition-all border flex items-center gap-4 group ${
                      selectedStudentId === s.id
                        ? 'bg-indigo-600 border-indigo-500 shadow-xl shadow-indigo-600/20 text-white'
                        : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10 hover:text-slate-200'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-inner transition-colors ${
                      selectedStudentId === s.id ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'
                    }`}>
                      {s.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black tracking-tight truncate">{s.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${selectedStudentId === s.id ? 'text-indigo-200' : 'text-slate-600 group-hover:text-slate-500'}`}>
                          {s.elo} ELO
                        </span>
                        {s.level && <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter ${selectedStudentId === s.id ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-500'}`}>{s.level}</span>}
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform ${selectedStudentId === s.id ? 'translate-x-1 opacity-100' : 'opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5'}`} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* ── MAIN CONTENT: Metrics Overview ────────────────────────────────────── */}
      <main className={`${mobileAnalysisPanel === 'detail' || isEmbedded ? 'flex' : 'hidden'} lg:flex flex-1 min-w-0 min-h-0 flex-col overflow-y-auto overflow-x-hidden custom-scrollbar pb-8 lg:pb-12 lg:pr-2`}>
        <div className="space-y-5 sm:space-y-8 min-w-0">
          <header className="shrink-0">
             <div className="flex items-start gap-3 mb-2">
               {!isEmbedded && (
                 <button
                   type="button"
                   onClick={() => setMobileAnalysisPanel('list')}
                   className="lg:hidden shrink-0 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors mt-0.5"
                   aria-label="Öğrenci listesine dön"
                 >
                   <ArrowLeft className="w-5 h-5" />
                 </button>
               )}
               <h3 className="text-xl sm:text-3xl font-black text-white tracking-tighter uppercase leading-none min-w-0 truncate">
                 {selectedStudent ? selectedStudent.name : 'Akademi Geneli'}
               </h3>
             </div>
             <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-2 min-w-0">
                   <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">
                     {selectedStudent ? `${selectedStudent.group} GRUBU · ${selectedStudent.elo} ELO` : 'AKADEMİ ORTALAMA PERFORMANSI'}
                   </span>
                </div>
                {selectedStudent && (
                  <div className="flex flex-wrap gap-2">
                    {selectedStudent.lichessUsername && <span className="px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-400 text-[8px] font-black tracking-widest uppercase border border-sky-500/20">LICHESS</span>}
                    {selectedStudent.chessComUsername && <span className="px-2 py-0.5 rounded-lg bg-[#81b64c]/10 text-[#81b64c] text-[8px] font-black tracking-widest uppercase border border-[#81b64c]/20">CHESS.COM</span>}
                  </div>
                )}
             </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 min-w-0">
            {/* ELO Gelişim Grafiği */}
            <div className="bg-[#1e293b]/50 backdrop-blur-2xl p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2.5rem] border border-white/10 shadow-2xl space-y-4 sm:space-y-6 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-white text-xs uppercase tracking-[0.2em] flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-indigo-400" />
                  ELO Gelişim Grafiği
                </h3>
              </div>
              <div className="h-[220px] sm:h-[280px] lg:h-[300px] w-full min-w-0 bg-black/20 rounded-2xl sm:rounded-3xl p-2 sm:p-4 border border-white/5 shadow-inner">
                {eloData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={eloData}>
                      <defs>
                        <linearGradient id="colorElo" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }}
                        dy={10}
                      />
                      <YAxis
                        hide
                        domain={['dataMin - 50', 'dataMax + 50']}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderRadius: '24px',
                          border: '2px solid rgba(255,255,255,0.1)',
                          boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.5)',
                          padding: '16px',
                        }}
                        itemStyle={{ color: '#fff', fontWeight: 900, fontSize: '12px' }}
                        labelStyle={{ color: '#64748b', marginBottom: '8px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="elo"
                        stroke="#6366f1"
                        strokeWidth={6}
                        fillOpacity={1}
                        fill="url(#colorElo)"
                        animationDuration={2500}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-600 opacity-50">
                    <div className="text-center">
                      <TrendingUp className="w-12 h-12 mx-auto mb-3" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Veri Bekleniyor</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Yetenek Dağılımı */}
            <div className="bg-[#1e293b]/50 backdrop-blur-2xl p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2.5rem] border border-white/10 shadow-2xl space-y-5 sm:space-y-8 min-w-0">
              <h3 className="font-black text-white text-xs uppercase tracking-[0.2em] flex items-center gap-3">
                <Target className="w-5 h-5 text-rose-400 shrink-0" />
                Yetenek Dağılımı
              </h3>
              <div className="space-y-6">
                {(Object.entries(SKILL_LABELS) as [SkillKey, string][]).map(([skillKey, label], idx) => (
                  <div key={skillKey} className="space-y-2">
                    <div className="flex justify-between items-end">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
                       <span className="text-xs font-black text-white">%{skillDistribution[skillKey]}</span>
                    </div>
                    <div className="h-2 w-full bg-black/30 rounded-full overflow-hidden border border-white/5 shadow-inner">
                       <div 
                         className={`h-full ${SKILL_COLORS[skillKey]} transition-all duration-1000 shadow-[0_0_15px_rgba(0,0,0,0.3)] shadow-inner`}
                         style={{ width: `${skillDistribution[skillKey]}%`, transitionDelay: `${idx * 150}ms` }}
                       />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Platform Analizleri (Chess.com & Lichess) */}
            {selectedStudent && (
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="bg-sky-500/5 backdrop-blur-xl p-8 rounded-[2.5rem] border border-sky-500/10 shadow-2xl space-y-6 group hover:bg-sky-500/10 transition-all">
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center text-sky-400 border border-sky-500/20"><Users className="w-5 h-5" /></div>
                          <div>
                             <h4 className="text-xs font-black text-white uppercase tracking-widest">Lichess Analizi</h4>
                             <p className="text-[10px] text-sky-500 font-bold tracking-tighter uppercase">{selectedStudent.lichessUsername || 'Tanımsız'}</p>
                          </div>
                       </div>
                    </div>
                    {platformLoading ? (
                       <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-sky-400 animate-spin" /></div>
                    ) : lichessProfile ? (
                       <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
                             <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Rapid Rating</p>
                             <p className="text-2xl font-black text-white tracking-tighter">{lichessProfile.perfs?.rapid?.rating ?? '—'}</p>
                          </div>
                          <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
                             <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Galibiyet Oranı</p>
                             <p className="text-2xl font-black text-sky-400 tracking-tighter">%{lichessWinRate ?? '—'}</p>
                          </div>
                          <div className="p-4 rounded-2xl bg-black/20 border border-white/5 col-span-2 flex items-center justify-between">
                             <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Son Maçlar ({lichessGames.length})</p>
                             <div className="flex gap-1">
                                {lichessGames.slice(0, 5).map((g, i) => {
                                   const isWhite = (g.players?.white?.user?.id || '').toLowerCase().includes((selectedStudent.lichessUsername || '').toLowerCase());
                                   const won = (isWhite && g.winner === 'white') || (!isWhite && g.winner === 'black');
                                   const draw = !g.winner;
                                   return <div key={i} className={`w-3 h-3 rounded-md shadow-sm ${won ? 'bg-emerald-500' : draw ? 'bg-slate-500' : 'bg-rose-500'}`} />;
                                })}
                             </div>
                          </div>
                       </div>
                    ) : <p className="text-[10px] text-slate-600 font-bold uppercase py-10 text-center tracking-widest">Kayıtlı Profil Bulunamadı</p>}
                 </div>

                 <div className="bg-[#81b64c]/5 backdrop-blur-xl p-8 rounded-[2.5rem] border border-[#81b64c]/10 shadow-2xl space-y-6 group hover:bg-[#81b64c]/10 transition-all">
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#81b64c]/20 flex items-center justify-center text-[#81b64c] border border-[#81b64c]/20"><Target className="w-5 h-5" /></div>
                          <div>
                             <h4 className="text-xs font-black text-white uppercase tracking-widest">Chess.com Analizi</h4>
                             <p className="text-[10px] text-[#81b64c] font-bold tracking-tighter uppercase">{selectedStudent.chessComUsername || 'Tanımsız'}</p>
                          </div>
                       </div>
                    </div>
                    {platformLoading ? (
                       <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-[#81b64c] animate-spin" /></div>
                    ) : chessComStats ? (
                       <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
                             <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Rapid Rating</p>
                             <p className="text-2xl font-black text-white tracking-tighter">{chessComStats.chess_rapid?.last?.rating ?? '—'}</p>
                          </div>
                          <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
                             <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Galibiyet Oranı</p>
                             <p className="text-2xl font-black text-[#81b64c] tracking-tighter">%{chessComWinRate ?? '—'}</p>
                          </div>
                          <div className="p-4 rounded-2xl bg-black/20 border border-white/5 col-span-2 flex items-center justify-between">
                             <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Son Maçlar ({chessComGames.length})</p>
                             <div className="flex gap-1">
                                {chessComGames.slice(0, 5).map((g, i) => {
                                   const isWhite = (g.white?.username || '').toLowerCase().includes((selectedStudent.chessComUsername || '').toLowerCase());
                                   const won = (isWhite && g.white?.result === 'win') || (!isWhite && g.black?.result === 'win');
                                   const draw = g.white?.result === 'draw' || g.black?.result === 'draw';
                                   return <div key={i} className={`w-3 h-3 rounded-md shadow-sm ${won ? 'bg-emerald-500' : draw ? 'bg-slate-500' : 'bg-rose-500'}`} />;
                                })}
                             </div>
                          </div>
                       </div>
                    ) : <p className="text-[10px] text-slate-600 font-bold uppercase py-10 text-center tracking-widest">Kayıtlı Profil Bulunamadı</p>}
                 </div>
              </div>
            )}

            {selectedStudent && combinedPerformance && (
              <div className="lg:col-span-2 bg-[#1e293b]/50 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/10 shadow-2xl space-y-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="font-black text-white text-xs uppercase tracking-[0.2em] flex items-center gap-3">
                    <PieChart className="w-5 h-5 text-violet-400" />
                    Kapsamlı Platform + Ödev Analizi
                  </h3>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Lichess + Chess.com + Ödev verisi
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Toplam Oyun</p>
                    <p className="text-2xl font-black text-white">{combinedPerformance.totalGames}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-[9px] font-black text-emerald-300/80 uppercase tracking-widest">Win Rate</p>
                    <p className="text-2xl font-black text-emerald-300">%{combinedPerformance.winRate}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-500/10 border border-slate-400/20">
                    <p className="text-[9px] font-black text-slate-300/80 uppercase tracking-widest">Draw Rate</p>
                    <p className="text-2xl font-black text-slate-200">%{combinedPerformance.drawRate}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                    <p className="text-[9px] font-black text-indigo-300/80 uppercase tracking-widest">Ödev Doğruluk</p>
                    <p className="text-2xl font-black text-indigo-300">%{homeworkSummary?.accuracy ?? 0}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">En Çok Oynanan Tempo</p>
                    <p className="text-sm mt-1 font-black text-white uppercase">{combinedPerformance.topSpeed}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Favori Açılış (Lichess)</p>
                    <p className="text-sm mt-1 font-black text-white truncate">{combinedPerformance.topOpening}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Kalite Göstergesi</p>
                    <p className="text-sm mt-1 font-black text-white">
                      Lichess Δ {combinedPerformance.avgLichessRatingDiff != null ? combinedPerformance.avgLichessRatingDiff : '—'} ·
                      Chess.com Acc {combinedPerformance.avgChessComAccuracy != null ? `%${combinedPerformance.avgChessComAccuracy}` : '—'}
                    </p>
                  </div>
                </div>
                <div className="h-[220px] w-full bg-black/20 rounded-3xl p-4 border border-white/5 shadow-inner">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={combinedPerformance.last14DaysActivity}>
                      <defs>
                        <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }} dy={8} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}
                        itemStyle={{ color: '#fff', fontWeight: 700, fontSize: '12px' }}
                        labelStyle={{ color: '#94a3b8', marginBottom: '6px', fontSize: '10px' }}
                      />
                      <Area type="monotone" dataKey="games" stroke="#a78bfa" strokeWidth={3} fillOpacity={1} fill="url(#colorActivity)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {selectedStudent ? (
              <div className="lg:col-span-2 rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-[#1e293b]/80 to-[#0f172a]/60 shadow-2xl overflow-hidden">
                <div className="px-6 md:px-8 py-5 border-b border-white/5 flex items-center justify-between gap-3 flex-wrap bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-300">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-white text-xs uppercase tracking-[0.15em]">
                        Hatalardan ders al
                      </h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                        Son oyunlarda Stockfish hata taraması
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-6 md:p-8">
                <GameMistakeReview
                  studentName={selectedStudent.name}
                  lichessUsername={selectedStudent.lichessUsername}
                  chessComUsername={selectedStudent.chessComUsername}
                  lichessGames={lichessGames}
                  chessComGames={chessComGames}
                />
                </div>
              </div>
            ) : null}

            {/* Yapay Zeka Antrenör */}
            <div className="lg:col-span-2 relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-[#1e293b]/95 via-[#1a2234]/90 to-[#0f172a]/95 shadow-2xl">
              <div className="absolute -top-24 -right-24 w-72 h-72 bg-indigo-500/15 blur-[100px] pointer-events-none" />
              <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-violet-500/10 blur-[80px] pointer-events-none" />
              <div className="relative z-10 p-6 md:p-8 space-y-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 flex items-center justify-center text-indigo-300 border border-indigo-500/25 shadow-lg shadow-indigo-500/10">
                      <Brain className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="text-base md:text-lg font-black text-white uppercase tracking-tight">
                        Yapay Zeka Antrenör Önerisi
                      </h4>
                      <p className="text-[10px] text-indigo-300/90 font-bold uppercase tracking-[0.2em] mt-1">
                        Kişiselleştirilmiş gelişim planı
                      </p>
                    </div>
                  </div>
                  {selectedStudent ? (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void generateAiInsight()}
                        disabled={aiLoading || !openRouterReady}
                        className={`px-5 py-3 rounded-2xl premium-gradient text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${aiLoading || !openRouterReady ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-110'}`}
                      >
                        {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {aiLoading ? 'Analiz hazırlanıyor…' : 'Kapsamlı analiz üret'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDetailReport(true)}
                        className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        Tüm rapor
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-5">
                  <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.07] px-5 py-4 text-left">
                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-2">
                      Hızlı özet
                    </p>
                    <p className="text-sm md:text-[15px] text-slate-100 leading-relaxed">
                      {suggestion.text}
                    </p>
                  </div>

                  {selectedStudent ? (
                    <SkillSnapshot
                      skills={skillDistribution}
                      labels={SKILL_LABELS}
                      focusLabel={suggestion.focus}
                      focusPercent={
                        (Object.entries(skillDistribution) as [SkillKey, number][]).sort(
                          (a, b) => a[1] - b[1]
                        )[0]?.[1] ?? 0
                      }
                    />
                  ) : null}

                  {!openRouterReady ? (
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 text-left">
                      AI için .env dosyasına <span className="font-mono text-xs">VITE_OPENROUTER_API_KEY</span> ekleyin.
                    </div>
                  ) : null}
                  {aiError ? (
                    <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 text-left">
                      {aiError}
                    </div>
                  ) : null}

                  {aiLoading ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 py-14 flex flex-col items-center gap-3">
                      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        Platform + ödev verisi işleniyor…
                      </p>
                    </div>
                  ) : aiInsight && selectedStudent ? (
                    <div className="space-y-4">
                      <SendCoachReportBar
                        student={selectedStudent}
                        summary={suggestion.text}
                        eksiklikler={aiInsight.eksiklikler}
                        hamleler={aiInsight.hamleler}
                        skillSnapshot={skillDistribution}
                      />
                      <AiCoachInsightPanel
                        eksiklikler={aiInsight.eksiklikler}
                        hamleler={aiInsight.hamleler}
                      />
                    </div>
                  ) : selectedStudent ? (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-black/15 py-12 px-6 text-center">
                      <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-300">Kapsamlı analiz henüz üretilmedi</p>
                      <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
                        Lichess, Chess.com ve ödev verilerinden kişisel rapor için üstteki butona tıklayın.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-black/15 py-10 text-center text-sm text-slate-500">
                      Sol panelden bir öğrenci seçin.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Detaylı Rapor Modal - Improved */}
      {showDetailReport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-in fade-in" onClick={() => setShowDetailReport(false)}>
          <div className="bg-[#0f172a] border border-white/10 rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.8)] w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-500" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-black/20">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-[1.25rem] bg-indigo-500/20 flex items-center justify-center text-indigo-400 border border-indigo-500/20"><BarChart3 className="w-6 h-6" /></div>
                <div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">Detaylı Performans Raporu</h3>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-2">{selectedStudent ? selectedStudent.name : 'AKADEMİ GENELİ'}</p>
                </div>
              </div>
              <button
                onClick={() => setShowDetailReport(false)}
                className="w-12 h-12 rounded-2xl hover:bg-white/5 text-slate-500 hover:text-white transition-all flex items-center justify-center"
              >
                <X className="w-7 h-7" />
              </button>
            </div>
            <div className="p-10 overflow-y-auto custom-scrollbar space-y-12">
               {/* Metrics grid and other content ... */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <section className="space-y-6">
                     <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                        <div className="w-1 h-3 bg-indigo-500 rounded-full" /> Seviye ve Kategori Dağılımı
                     </h4>
                     <div className="space-y-4">
                        {levelBreakdown.map(([level, count]) => (
                          <div key={level} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all">
                             <span className="text-sm font-bold text-slate-300">{level}</span>
                             <span className="text-sm font-black text-indigo-400 uppercase">{count} ÖĞRENCİ</span>
                          </div>
                        ))}
                     </div>
                  </section>
                  
                  <section className="space-y-6">
                     <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                        <div className="w-1 h-3 bg-emerald-500 rounded-full" /> Bulmaca Performansı
                     </h4>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
                           <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Toplam Deneme</p>
                           <p className="text-2xl font-black text-white">{homeworkSummary?.total ?? 0}</p>
                        </div>
                        <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                           <p className="text-[9px] font-black text-emerald-500/60 uppercase tracking-widest mb-1.5">Doğruluk</p>
                           <p className="text-2xl font-black text-emerald-400">%{homeworkSummary?.accuracy ?? 0}</p>
                        </div>
                     </div>
                  </section>
               </div>

               <section className="space-y-6">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                     <div className="w-1 h-3 bg-amber-500 rounded-full" /> Gelişim Yol Haritası
                  </h4>
                  <div className="p-8 rounded-[2rem] bg-indigo-600/5 border border-indigo-500/10 text-sm italic leading-relaxed text-indigo-200">
                     "{suggestion.text}"
                  </div>
               </section>
            </div>
            <div className="p-8 border-t border-white/5 bg-black/40 text-center">
               <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Veriler her 24 saatte bir senkronize edilmektedir.</p>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default Analysis;
