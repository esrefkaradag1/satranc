import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  Calendar,
  CalendarCheck,
  Camera,
  CheckCircle,
  Copy,
  CreditCard,
  Download,
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Gift,
  GraduationCap,
  Heart,
  History,
  Lock,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Trophy,
  User,
  Users,
  X,
  XCircle,
  Save,
  Wallet,
  ZoomIn,
  Clock,
  RefreshCw,
  Loader2,
  Zap,
  Target,
  Mail,
  Gamepad2,
  Power,
  Star,
  Settings,
  Activity,
  Brain,
  ChevronDown,
  Sparkles,
  Plus,
} from 'lucide-react';
import { useApp, getDisplayStudentNo } from '../AppContext';
import { analyzeStudentHomework } from '../services/geminiService';
import {
  fetchLichessUser,
  fetchLichessGamesPage,
  fetchLichessActivity,
  fetchChessComPlayer,
  fetchChessComStats,
  fetchChessComMemberStats,
  fetchChessComPuzzlesBundle,
  fetchChessComAllUserGames,
  lichessPerfLabel,
  chessComStatusLabel,
  type LichessUserProfile,
  type LichessGame,
  type LichessActivity,
  type ChessComPlayer,
  type ChessComStats,
  type ChessComMemberStats,
  type ChessComGame,
} from '../services/chessPlatformService';
import LichessGameViewerModal from './LichessGameViewerModal';
import PlatformViewTabs, { type PlatformViewTab } from './PlatformViewTabs';
import ChessComGameViewerModal from './ChessComGameViewerModal';
import ChessComStatsSection from './ChessComStatsSection';
import ChessComGamesSection from './ChessComGamesSection';
import ChessComPuzzlesSection from './ChessComPuzzlesSection';
import LichessStatsSection from './LichessStatsSection';
import LichessPuzzlesSection from './LichessPuzzlesSection';
import { fetchLichessDailyPuzzle } from '../services/lichessService';
import type { Puzzle } from '../types';
import { ResponsiveTable } from './ui/ResponsiveTable';
import { fetchFidePlayer, searchFidePlayer, federationLabel, type FidePlayer } from '../services/fideService';
import { fetchUkdFromTsf } from '../services/ukdService';
import { getServiceSupabase } from '../services/supabase';
import { Student, type Transaction, type PerformanceAnalysis, type PerformanceAnalysisCategory } from '../types';
import {
  analysisFormMetaFromRecord,
  buildPerformanceAnalysisPayload,
  categoryBadgeClass,
  cloneDefaultCategories,
  emptyAnalysisFormMeta,
  getAnalysisCategories,
  newCategoryId,
  type AnalysisFormMeta,
} from '../lib/performanceAnalysisUtils';
import { DATE_INPUT_MAX, DATE_INPUT_MIN, normalizeDateInputYear } from '../lib/dateInputUtils';
import { isPackageSaleCategory } from '../lib/salePaymentUtils';
import SalePaymentCell from './SalePaymentCell';

import { REMINDER_DAY_OPTIONS, DEFAULT_REMINDER_DAY } from '../lib/reminderDays';
import {
  applyGroupDefaultsToStudent,
  applySiblingDiscount,
  findTrainingGroupByName,
  formatLessonSchedule,
  getBaseMonthlyFeeForStudent,
  getExpectedDueForMonth,
  getExpectedDuesForYear,
  isMonthBeforeRegistration,
  monthKey,
} from '../lib/trainingGroupUtils';
import type { GroupLessonSlot } from '../types';

const MONTHS_TR = [
 'OCAK',
 'ŞUBAT',
 'MART',
 'NİSAN',
 'MAYIS',
 'HAZİRAN',
 'TEMMUZ',
 'AĞUSTOS',
 'EYLÜL',
 'EKİM',
 'KASIM',
 'ARALIK',
];

function initials(name: string) {
 return name
 .split(' ')
 .filter(Boolean)
 .map((n) => n[0])
 .join('')
 .slice(0, 2)
 .toUpperCase();
}

function formatPhone(digits?: string) {
 if (!digits) return'—';
 const v = digits.replace(/[^\d]/g, '');
 if (v.length < 10) return digits;
 const p1 = v.slice(0, 3);
 const p2 = v.slice(3, 6);
 const p3 = v.slice(6, 8);
 const p4 = v.slice(8, 10);
 return`0${p1} ${p2} ${p3} ${p4}`;
}

function formatDateTR(iso?: string) {
 if (!iso) return'—';
 const d = new Date(iso);
 if (Number.isNaN(d.getTime())) return iso;
 return d.toLocaleDateString('tr-TR');
}

const KV: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-6 py-2.5 sm:py-3 group/kv">
    <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">{label}</div>
    <div className="text-sm font-semibold text-slate-200 sm:text-right break-words group-hover/kv:text-white transition-colors">{value ?? '—'}</div>
  </div>
);

const Badge: React.FC<{ color: 'emerald' | 'rose' | 'amber'; children: React.ReactNode }> = ({ color, children }) => {
  const cls =
    color === 'emerald'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-emerald-500/10'
      : color === 'amber'
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-amber-500/10'
        : 'bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-rose-500/10';
  return (
    <span className={`inline-flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:px-3.5 sm:py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-widest border backdrop-blur-sm shadow-lg ${cls}`}>
      <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-current animate-pulse shrink-0" />
      {children}
    </span>
  );
};

const StatTile: React.FC<{ icon: React.ReactNode; title: string; value: React.ReactNode; subtitle?: string; accent?: string }> = ({
  icon,
  title,
  value,
  subtitle,
  accent = 'indigo',
}) => {
  const accentMap: Record<string, string> = {
    indigo: 'from-indigo-500/20 to-indigo-600/5 border-indigo-500/20 group-hover:border-indigo-500/40',
    emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 group-hover:border-emerald-500/40',
    amber: 'from-amber-500/20 to-amber-600/5 border-amber-500/20 group-hover:border-amber-500/40',
    violet: 'from-violet-500/20 to-violet-600/5 border-violet-500/20 group-hover:border-violet-500/40',
  };
  const iconMap: Record<string, string> = {
    indigo: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    violet: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  };
  return (
    <div className={`group relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br ${accentMap[accent] || accentMap.indigo} border backdrop-blur-xl p-3 sm:p-5 transition-all duration-300 sm:hover:shadow-lg sm:hover:scale-[1.02]`}>
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-white/[0.03] blur-xl" />
      <div className="relative flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{title}</div>
          <div className="text-lg sm:text-2xl font-black tracking-tight text-white mt-1 sm:mt-1.5">{value}</div>
          {subtitle && <div className="text-[10px] sm:text-[11px] font-medium text-slate-400 mt-0.5 line-clamp-2">{subtitle}</div>}
        </div>
        <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl ${iconMap[accent] || iconMap.indigo} flex items-center justify-center border shrink-0 shadow-inner [&_svg]:w-4 [&_svg]:h-4 sm:[&_svg]:w-5 sm:[&_svg]:h-5`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

const ActionPill: React.FC<{
  tone: 'indigo' | 'amber' | 'sky' | 'emerald' | 'rose' | 'outline';
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}> = ({ tone, icon, label, onClick }) => {
  const cls: Record<string, string> = {
    outline: 'bg-white/90 hover:bg-white border border-slate-300 text-slate-700 shadow-sm hover:shadow',
    indigo: 'bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 text-white shadow-lg shadow-indigo-500/25',
    amber: 'bg-amber-500 hover:bg-amber-400 border border-amber-500 text-white shadow-lg shadow-amber-500/25',
    sky: 'bg-sky-500 hover:bg-sky-400 border border-sky-500 text-white shadow-lg shadow-sky-500/25',
    emerald: 'bg-emerald-500 hover:bg-emerald-400 border border-emerald-500 text-white shadow-lg shadow-emerald-500/25',
    rose: 'bg-rose-500 hover:bg-rose-400 border border-rose-500 text-white shadow-lg shadow-rose-500/25',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 px-2 py-2 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-[9px] sm:text-xs tracking-tight transition-all duration-200 active:scale-[0.97] min-h-[44px] sm:min-h-0 w-full sm:w-auto ${cls[tone]}`}
    >
      {tone === 'outline' ? <span className="text-slate-500 [&_svg]:w-4 [&_svg]:h-4">{icon}</span> : <span className="[&_svg]:w-4 [&_svg]:h-4">{icon}</span>}
      <span className="leading-none">{label}</span>
    </button>
  );
};

function ageFromBirthDate(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

function formatPlayTime(seconds: number): string {
  if (!seconds || seconds < 0) return '0 saat';
  const h = Math.floor(seconds / 3600);
  return `${h.toLocaleString('tr-TR')} saat`;
}

function formatLichessDate(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('tr-TR');
}

function formatChessComDate(unix: number): string {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleDateString('tr-TR');
}

const LICHESS_PERF_ORDER = ['rapid', 'blitz', 'bullet', 'puzzle', 'correspondence'] as const;
const LICHESS_PERF_ICON: Record<string, React.ReactNode> = {
  rapid: <Clock className="w-4 h-4" />,
  blitz: <Zap className="w-4 h-4" />,
  bullet: <Target className="w-4 h-4" />,
  puzzle: <BarChart3 className="w-4 h-4" />,
  correspondence: <Mail className="w-4 h-4" />,
};

const LichessChessCard: React.FC<{
  activeTab: 'lichess' | 'chesscom';
  student: Student;
  lichessInput: string;
  setLichessInput: (v: string) => void;
  chessComInput: string;
  setChessComInput: (v: string) => void;
  updateStudent: (id: string, data: Partial<Student>) => void;
}> = ({ activeTab, student, lichessInput, setLichessInput, chessComInput, setChessComInput, updateStudent }) => {
  const { puzzles } = useApp();
  const LICHESS_PAGE_SIZE = 20;
  const [lichessProfile, setLichessProfile] = useState<LichessUserProfile | null>(null);
  const [lichessGames, setLichessGames] = useState<LichessGame[]>([]);
  const [lichessActivities, setLichessActivities] = useState<LichessActivity[]>([]);
  const [chessComProfile, setChessComProfile] = useState<ChessComPlayer | null>(null);
  const [chessComStats, setChessComStats] = useState<ChessComStats | null>(null);
  const [chessComMemberStats, setChessComMemberStats] = useState<ChessComMemberStats | null>(null);
  const [chessComGames, setChessComGames] = useState<ChessComGame[]>([]);
  const [loadingLichess, setLoadingLichess] = useState(false);
  const [loadingLichessGames, setLoadingLichessGames] = useState(false);
  const [lichessGamesProgress, setLichessGamesProgress] = useState(0);
  const [lichessNextUntil, setLichessNextUntil] = useState<number | null>(null);
  const [lichessHasMore, setLichessHasMore] = useState(false);
  const lichessNextUntilRef = useRef<number | null>(null);
  const lichessHasMoreRef = useRef(false);
  const [lichessViewerGame, setLichessViewerGame] = useState<LichessGame | null>(null);
  const [loadingChessCom, setLoadingChessCom] = useState(false);
  const [loadingChessComGames, setLoadingChessComGames] = useState(false);
  const [chessComGamesProgress, setChessComGamesProgress] = useState(0);
  const [chessComViewerGame, setChessComViewerGame] = useState<ChessComGame | null>(null);
  const [lichessPlatformTab, setLichessPlatformTab] = useState<PlatformViewTab>('stats');
  const [chessComPlatformTab, setChessComPlatformTab] = useState<PlatformViewTab>('stats');
  const [chessComPuzzlesCount, setChessComPuzzlesCount] = useState(0);
  const [dailyLichessPuzzle, setDailyLichessPuzzle] = useState<Puzzle | null>(null);
  const [loadingDailyLichessPuzzle, setLoadingDailyLichessPuzzle] = useState(false);
  const lichessPracticePuzzles = useMemo(
    () => puzzles.filter((p) => p.source === 'lichess').slice(0, 24),
    [puzzles],
  );
  const lichessPuzzlesCount = (dailyLichessPuzzle ? 1 : 0) + lichessPracticePuzzles.length;

  useEffect(() => {
    if (activeTab !== 'lichess' || lichessPlatformTab !== 'puzzles') return;
    let cancelled = false;
    setLoadingDailyLichessPuzzle(true);
    fetchLichessDailyPuzzle()
      .then((p) => { if (!cancelled) setDailyLichessPuzzle(p); })
      .catch(() => { if (!cancelled) setDailyLichessPuzzle(null); })
      .finally(() => { if (!cancelled) setLoadingDailyLichessPuzzle(false); });
    return () => { cancelled = true; };
  }, [activeTab, lichessPlatformTab]);

  useEffect(() => {
    lichessNextUntilRef.current = lichessNextUntil;
  }, [lichessNextUntil]);
  useEffect(() => {
    lichessHasMoreRef.current = lichessHasMore;
  }, [lichessHasMore]);

  const loadLichess = useCallback(async (reset = true) => {
    const un = student.lichessUsername?.trim();
    if (!un) {
      setLichessProfile(null);
      setLichessGames([]);
      setLichessGamesProgress(0);
      setLichessNextUntil(null);
      setLichessHasMore(false);
      return;
    }
    if (!reset && (!lichessHasMoreRef.current || lichessNextUntilRef.current == null)) return;
    if (reset) {
      setLoadingLichess(true);
      setLichessGames([]);
      setLichessGamesProgress(0);
      setLichessNextUntil(null);
      try {
        const [profile, activity] = await Promise.all([
          fetchLichessUser(un),
          fetchLichessActivity(un)
        ]);
        setLichessProfile(profile ?? null);
        setLichessActivities(activity ?? []);
      } finally {
        setLoadingLichess(false);
      }
    }
    setLoadingLichessGames(true);
    try {
      const page = await fetchLichessGamesPage(un, {
        max: LICHESS_PAGE_SIZE,
        until: reset ? undefined : lichessNextUntilRef.current ?? undefined,
      });
      setLichessGames((prev) => {
        const base = reset ? [] : prev;
        const seen = new Set(base.map((g) => g.id));
        const merged = [...base];
        for (const g of page.games) {
          if (!g.id || seen.has(g.id)) continue;
          seen.add(g.id);
          merged.push(g);
        }
        setLichessGamesProgress(merged.length);
        return merged;
      });
      setLichessNextUntil(page.nextUntil);
      setLichessHasMore(page.hasMore);
    } finally {
      setLoadingLichessGames(false);
    }
  }, [student.lichessUsername]);

  const loadChessCom = useCallback(async () => {
    const un = student.chessComUsername?.trim();
    if (!un) {
      setChessComProfile(null);
      setChessComStats(null);
      setChessComMemberStats(null);
      setChessComGames([]);
      setChessComGamesProgress(0);
      setChessComPuzzlesCount(0);
      return;
    }
    setLoadingChessCom(true);
    setChessComGames([]);
    setChessComGamesProgress(0);
    try {
      const [profile, stats, memberStats, puzzlesBundle] = await Promise.all([
        fetchChessComPlayer(un),
        fetchChessComStats(un),
        fetchChessComMemberStats(un),
        fetchChessComPuzzlesBundle(un),
      ]);
      setChessComProfile(profile ?? null);
      setChessComStats(stats ?? null);
      setChessComMemberStats(memberStats ?? null);
      setChessComPuzzlesCount(
        (puzzlesBundle?.rated.length ?? 0) +
          (puzzlesBundle?.learning.length ?? 0) +
          (puzzlesBundle?.rush.length ?? 0),
      );
    } finally {
      setLoadingChessCom(false);
    }
    setLoadingChessComGames(true);
    try {
      const games = await fetchChessComAllUserGames(un.toLowerCase(), {
        onProgress: (n) => setChessComGamesProgress(n),
      });
      setChessComGames(games);
    } finally {
      setLoadingChessComGames(false);
      setChessComGamesProgress(0);
    }
  }, [student.chessComUsername]);

  useEffect(() => {
    loadLichess(true);
  }, [loadLichess]);

  useEffect(() => {
    loadChessCom();
  }, [loadChessCom]);

  const isLichess = activeTab === 'lichess';

  return (
    <div className="rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] shadow-xl overflow-hidden">
      {isLichess ? (
        <>
          <div className="px-6 py-4 border-b border-slate-700/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-sky-500" />
              <span className="text-sm font-black text-white">Lichess</span>
            </div>
            <button type="button" onClick={() => loadLichess(true)} disabled={loadingLichess || loadingLichessGames} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 text-xs font-bold disabled:opacity-50">
              {loadingLichess || loadingLichessGames ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Yenile
            </button>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Lichess Kullanıcı Adı</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={lichessInput}
                  onChange={(e) => setLichessInput(e.target.value)}
                  onBlur={() => updateStudent(student.id, { lichessUsername: lichessInput.trim() || undefined })}
                  placeholder="Kullanıcı adı"
                  className="w-40 min-w-0 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500/40 outline-none"
                />
                {student.lichessUsername ? (
                  <a href={`https://lichess.org/@/${encodeURIComponent(student.lichessUsername)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 text-sm font-medium hover:bg-sky-500/20 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Profili Aç
                  </a>
                ) : null}
              </div>
            </div>
          {student.lichessUsername ? (
            <div className="space-y-4">
              {loadingLichess && !lichessProfile ? (
                <div className="flex items-center gap-2 py-8 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" /> Lichess verileri çekiliyor...
                </div>
              ) : lichessProfile ? (
                <>
                  <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-4 flex flex-wrap items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">
                      <User className="w-8 h-8" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-lg font-black text-white">{lichessProfile.username}</div>
                      {lichessProfile.playTime?.total != null && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                          <Clock className="w-3.5 h-3.5" /> Toplam {formatPlayTime(lichessProfile.playTime.total)} oyun
                        </div>
                      )}
                      {lichessProfile.count != null && (lichessProfile.count.win != null || lichessProfile.count.loss != null || lichessProfile.count.draw != null) && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          <span className="text-emerald-400">{lichessProfile.count.win ?? 0} galibiyet</span>
                          <span className="text-slate-500 mx-1">·</span>
                          <span className="text-rose-400">{lichessProfile.count.loss ?? 0} mağlubiyet</span>
                          <span className="text-slate-500 mx-1">·</span>
                          <span className="text-slate-400">{lichessProfile.count.draw ?? 0} beraberlik</span>
                          {lichessProfile.count.all != null && (
                            <span className="text-slate-500 ml-1">({lichessProfile.count.all.toLocaleString('tr-TR')} oyun)</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <Calendar className="w-3.5 h-3.5" /> Kayıt: {formatLichessDate(lichessProfile.createdAt)}
                      </div>
                    </div>
                    <a href={`https://lichess.org/@/${encodeURIComponent(lichessProfile.username)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500/20 text-sky-400 text-sm font-bold">
                      <ExternalLink className="w-4 h-4" /> Profili Aç
                    </a>
                  </div>
                  <PlatformViewTabs
                    active={lichessPlatformTab}
                    onChange={setLichessPlatformTab}
                    gamesCount={lichessGames.length}
                    puzzlesCount={lichessPuzzlesCount}
                    accent="sky"
                    statsContent={
                      <LichessStatsSection profile={lichessProfile} activities={lichessActivities} />
                    }
                    puzzlesContent={
                      <LichessPuzzlesSection
                        username={student.lichessUsername}
                        dailyPuzzle={dailyLichessPuzzle}
                        practicePuzzles={lichessPracticePuzzles}
                        loadingDaily={loadingDailyLichessPuzzle}
                        activityRows={lichessActivities}
                      />
                    }
                    gamesContent={
                      <>
                  {loadingLichessGames && (
                    <div className="rounded-lg bg-slate-800/50 border border-sky-500/20 px-4 py-3 text-sm text-sky-300 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>
                        @{student.lichessUsername?.trim() || '?'} hesabının Lichess maçları yükleniyor…
                        {lichessGamesProgress > 0 ? ` ${lichessGamesProgress.toLocaleString('tr-TR')} oyun` : ''}
                      </span>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Oyun geçmişi
                        {lichessGames.length > 0 ? (
                          <span className="text-slate-500 font-medium normal-case ml-1">({lichessGames.length.toLocaleString('tr-TR')})</span>
                        ) : null}
                      </div>
                      <button type="button" onClick={() => loadLichess(true)} disabled={loadingLichess || loadingLichessGames} className="text-[10px] text-sky-400 hover:text-sky-300 font-medium disabled:opacity-50">
                        Yenile
                      </button>
                    </div>
                    {!loadingLichessGames && lichessGames.length === 0 ? (
                      <p className="text-slate-500 text-sm">Kayıtlı oyun bulunamadı.</p>
                    ) : null}
                    {lichessGames.length > 0 ? (
                      <div className="space-y-2 max-h-[min(60vh,520px)] overflow-y-auto pr-1">
                        {lichessGames.map((g) => {
                          const me = (student.lichessUsername || lichessProfile.username || '').toLowerCase();
                          const wId = g.players?.white?.user?.id?.toLowerCase() ?? '';
                          const wName = g.players?.white?.user?.name?.toLowerCase() ?? '';
                          const bId = g.players?.black?.user?.id?.toLowerCase() ?? '';
                          const bName = g.players?.black?.user?.name?.toLowerCase() ?? '';
                          const isBlack = bId === me || bName === me;
                          const isWhite = wId === me || wName === me;
                          const opponent = isWhite ? g.players?.black : isBlack ? g.players?.white : g.players?.black;
                          const opponentName = opponent?.user?.name ?? 'Anonim';
                          const opponentRating = opponent?.rating;
                          const myRatingDiff = isWhite ? (g.players?.white?.ratingDiff ?? 0) : (g.players?.black?.ratingDiff ?? 0);
                          const hasDiff = typeof myRatingDiff === 'number';
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => setLichessViewerGame(g)}
                              className="w-full text-left flex items-center gap-3 rounded-lg bg-slate-800/40 border border-slate-700/50 px-3 py-2 text-sm flex-wrap hover:border-sky-500/40 hover:bg-slate-800/70 transition-colors cursor-pointer"
                            >
                              <Gamepad2 className="w-4 h-4 text-slate-500 shrink-0" />
                              <span className="text-slate-300">
                                vs {opponentName}
                                {opponentRating != null ? ` (${opponentRating})` : ' (?)'}
                              </span>
                              <span className="text-slate-500 text-xs">{g.speed || g.perf || 'classical'}</span>
                              <span className="text-slate-500 text-xs flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {g.createdAt ? formatLichessDate(g.createdAt) : ''}
                              </span>
                              {g.opening?.name && <span className="text-slate-400 text-xs truncate max-w-[140px]" title={g.opening.name}>{g.opening.name}</span>}
                              {hasDiff && (
                                <span className={`ml-auto shrink-0 px-2 py-0.5 rounded text-xs font-bold ${myRatingDiff > 0 ? 'bg-emerald-500/20 text-emerald-400' : myRatingDiff < 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-600/50 text-slate-400'}`}>
                                  {myRatingDiff > 0 ? `+${myRatingDiff}` : myRatingDiff}
                                </span>
                              )}
                            </button>
                          );
                        })}
                        <div className="pt-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-500">
                            {lichessGames.length.toLocaleString('tr-TR')} oyun yüklendi
                          </span>
                          {lichessHasMore ? (
                            <button
                              type="button"
                              onClick={() => loadLichess(false)}
                              disabled={loadingLichessGames}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-bold disabled:opacity-50"
                            >
                              {loadingLichessGames ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                              Devam (20)
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-400 font-medium">Tümü yüklendi</span>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                      </>
                    }
                  />
                </>
          ) : (
            <div className="rounded-xl bg-slate-800/40 border border-slate-700/60 p-4 text-sm text-slate-500">Profil bulunamadı veya kullanıcı adı yanlış.</div>
          )}
        </div>
          ) : (
            <div className="p-8 text-center">
              <ExternalLink className="w-12 h-12 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-400 text-sm font-medium">Lichess kullanıcı adı girip kaydettikten sonra veriler otomatik yüklenecektir.</p>
            </div>
          )}
          </div>
        </>
      ) : (
        <>
          <div className="px-6 py-4 border-b border-slate-700/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-emerald-500" />
              <span className="text-sm font-black text-white">Chess.com</span>
            </div>
            <button type="button" onClick={loadChessCom} disabled={loadingChessCom || loadingChessComGames} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold disabled:opacity-50">
              {loadingChessCom || loadingChessComGames ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Yenile
            </button>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Chess.com Kullanıcı Adı</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={chessComInput}
                  onChange={(e) => setChessComInput(e.target.value)}
                  onBlur={() => updateStudent(student.id, { chessComUsername: chessComInput.trim() || undefined })}
                  placeholder="Kullanıcı adı"
                  className="w-40 min-w-0 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500/40 outline-none"
                />
                {student.chessComUsername ? (
                  <a href={`https://www.chess.com/member/${encodeURIComponent(student.chessComUsername)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Profili Aç
                  </a>
                ) : null}
              </div>
            </div>
          {student.chessComUsername ? (
        <div className="space-y-4">
          {loadingChessCom && !chessComProfile ? (
            <div className="flex items-center gap-2 py-8 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Chess.com verileri çekiliyor...
            </div>
          ) : chessComProfile ? (
            <>
              <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-4 flex flex-wrap items-center gap-4">
                {chessComProfile.avatar ? (
                  <img src={chessComProfile.avatar} alt="" className="w-14 h-14 rounded-full bg-slate-700 object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">
                    <User className="w-8 h-8" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-black text-white">{chessComProfile.username}</div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-xs text-slate-400">
                    {chessComProfile.status != null && (
                      <span>Üyelik: <span className="text-emerald-400 font-medium">{chessComStatusLabel(chessComProfile.status)}</span></span>
                    )}
                    {chessComProfile.league != null && (
                      <span>Liga: <span className="text-amber-400 font-medium">{chessComProfile.league}</span></span>
                    )}
                    {chessComProfile.followers != null && (
                      <span>Takipçi: {chessComProfile.followers}</span>
                    )}
                  </div>
                  {chessComProfile.joined != null && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                      <Calendar className="w-3.5 h-3.5" /> Kayıt: {formatChessComDate(chessComProfile.joined)}
                    </div>
                  )}
                  {chessComProfile.last_online != null && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                      <Clock className="w-3.5 h-3.5" /> Son görülme: {formatChessComDate(chessComProfile.last_online)}
                    </div>
                  )}
                </div>
                <a href={chessComProfile.url || `https://www.chess.com/member/${encodeURIComponent(chessComProfile.username)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-bold">
                  <ExternalLink className="w-4 h-4" /> Profili Aç
                </a>
              </div>
              <PlatformViewTabs
                active={chessComPlatformTab}
                onChange={setChessComPlatformTab}
                gamesCount={chessComGames.length}
                puzzlesCount={chessComPuzzlesCount}
                accent="emerald"
                statsContent={
                  <ChessComStatsSection
                    memberStats={chessComMemberStats}
                    pubStats={chessComStats}
                    username={student.chessComUsername}
                  />
                }
                gamesContent={
                  <ChessComGamesSection
                    games={chessComGames}
                    username={student.chessComUsername ?? ''}
                    profileUsername={chessComProfile.username}
                    loading={loadingChessComGames}
                    progress={chessComGamesProgress}
                    onRefresh={loadChessCom}
                    refreshDisabled={loadingChessCom || loadingChessComGames}
                    onGameClick={setChessComViewerGame}
                  />
                }
                puzzlesContent={
                  student.chessComUsername ? (
                    <ChessComPuzzlesSection username={student.chessComUsername} />
                  ) : null
                }
              />
            </>
          ) : (
            <div className="rounded-xl bg-slate-800/40 border border-slate-700/60 p-4 text-sm text-slate-500">Profil bulunamadı veya kullanıcı adı yanlış.</div>
          )}
        </div>
          ) : (
            <div className="p-8 text-center">
              <ExternalLink className="w-12 h-12 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-400 text-sm font-medium">Chess.com kullanıcı adı girip kaydettikten sonra veriler otomatik yüklenecektir.</p>
            </div>
          )}
          </div>
        </>
      )}
      <LichessGameViewerModal game={lichessViewerGame} onClose={() => setLichessViewerGame(null)} />
      <ChessComGameViewerModal
        game={chessComViewerGame}
        viewerUsername={student.chessComUsername ?? undefined}
        onClose={() => setChessComViewerGame(null)}
      />
    </div>
  );
};

const StudentDetail: React.FC<{
  studentId: string | null;
  onBack: () => void;
  onNavigate?: (tab: string) => void;
}> = ({ studentId, onBack, onNavigate }) => {
  const { students, attendanceRecords, transactions, gallery, updateStudent, deleteStudent, addActivityLog, addTransaction, updateTransaction, removeTransaction, performanceAnalyses, addPerformanceAnalysis, updatePerformanceAnalysis, deletePerformanceAnalysis, disciplines, homeworks, homeworkAttempts, trainingGroups, disciplineBranches } = useApp();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDuesModal, setShowDuesModal] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusModalValue, setStatusModalValue] = useState<'active' | 'inactive'>('active');
  const [saleType, setSaleType] = useState<'aylik-paket' | 'ozel-ders'>('aylik-paket');
  const [saleDownPayment, setSaleDownPayment] = useState('');
  const [saleInstallmentCount, setSaleInstallmentCount] = useState(4);
  const [saleStartDate, setSaleStartDate] = useState('');
  const [saleEndDate, setSaleEndDate] = useState('');
  const [saleTotalHours, setSaleTotalHours] = useState('');
  const [saleValidityDays, setSaleValidityDays] = useState('');
  const [salePackageName, setSalePackageName] = useState('');
  const [saleTotalAmount, setSaleTotalAmount] = useState('');
  const [salePaymentMethod, setSalePaymentMethod] = useState<'pesin' | 'taksit'>('pesin');
  const [saleAmountReceived, setSaleAmountReceived] = useState('');
  const [duesAmount, setDuesAmount] = useState('');
  const [duesMonth, setDuesMonth] = useState('');
  const [duesPaymentType, setDuesPaymentType] = useState<'Nakit' | 'Havale/EFT' | 'Kredi Kartı'>('Nakit');
  const [duesProcessedBy, setDuesProcessedBy] = useState('');
  const [showDuesPlanModal, setShowDuesPlanModal] = useState(false);
  const [duesPlanMonth, setDuesPlanMonth] = useState('');
  const [duesPlanAmount, setDuesPlanAmount] = useState('');
  const [duesPlanNote, setDuesPlanNote] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState<GroupLessonSlot[]>([]);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editTxnAmount, setEditTxnAmount] = useState('');
  const [editTxnTotalAmount, setEditTxnTotalAmount] = useState('');
  const [editTxnDate, setEditTxnDate] = useState('');
  const [editTxnPaymentType, setEditTxnPaymentType] = useState<'Nakit' | 'Havale/EFT' | 'Kredi Kartı'>('Nakit');
  const [editTxnProcessedBy, setEditTxnProcessedBy] = useState('');
  const [editTxnDescription, setEditTxnDescription] = useState('');
  const [lichessInput, setLichessInput] = useState('');
  const [chessComInput, setChessComInput] = useState('');
  const [fideIdInput, setFideIdInput] = useState('');
  const [fideProfile, setFideProfile] = useState<FidePlayer | null>(null);
  const [loadingFide, setLoadingFide] = useState(false);
  const [showUkdImportModal, setShowUkdImportModal] = useState(false);
  const [ukdImportUkd, setUkdImportUkd] = useState('');
  const [ukdImportName, setUkdImportName] = useState('');
  const [ukdImportBirthYear, setUkdImportBirthYear] = useState('');
  const [ukdImportLastVisa, setUkdImportLastVisa] = useState('');
  const [loadingUkdFetch, setLoadingUkdFetch] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [editingAnalysisId, setEditingAnalysisId] = useState<string | null>(null);
  const [expandedAnalysisId, setExpandedAnalysisId] = useState<string | null>(null);
  const [aiReportHwId, setAiReportHwId] = useState<string | null>(null);
  const [aiReportLoading, setAiReportLoading] = useState(false);
  const [aiReportResult, setAiReportResult] = useState<{ eksiklikler: string; hamleler: string } | null>(null);
  const [analysisFormMeta, setAnalysisFormMeta] = useState<AnalysisFormMeta>(emptyAnalysisFormMeta);
  const [analysisCategories, setAnalysisCategories] = useState<PerformanceAnalysisCategory[]>(cloneDefaultCategories);

  const resetAnalysisModal = useCallback(() => {
    setEditingAnalysisId(null);
    setAnalysisFormMeta(emptyAnalysisFormMeta());
    setAnalysisCategories(cloneDefaultCategories());
  }, []);

  const openAddAnalysisModal = useCallback(() => {
    resetAnalysisModal();
    setShowAnalysisModal(true);
  }, [resetAnalysisModal]);

  const openEditAnalysisModal = useCallback((analysis: PerformanceAnalysis) => {
    setEditingAnalysisId(analysis.id);
    setAnalysisFormMeta(analysisFormMetaFromRecord(analysis));
    setAnalysisCategories(getAnalysisCategories(analysis).map((c) => ({ ...c })));
    setShowAnalysisModal(true);
  }, []);

  const closeAnalysisModal = useCallback(() => {
    setShowAnalysisModal(false);
    resetAnalysisModal();
  }, [resetAnalysisModal]);

  type DetailTab = 'finans' | 'ukd' | 'lichess' | 'chesscom' | 'analizler' | 'taksitler' | 'ozel-dersler' | 'gecmis' | 'bilgiler';
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('finans');

  const student = useMemo<Student | null>(() => {
    if (!studentId) return null;
    return students.find((s) => s.id === studentId) ?? null;
  }, [students, studentId]);

  const saveAnalysisModal = useCallback(() => {
    if (!studentId || !analysisFormMeta.branch.trim() || !analysisFormMeta.analysisDate) return;
    const payload = buildPerformanceAnalysisPayload(studentId, analysisFormMeta, analysisCategories);
    if (editingAnalysisId) {
      updatePerformanceAnalysis(editingAnalysisId, payload);
    } else {
      addPerformanceAnalysis(payload);
    }
    closeAnalysisModal();
  }, [studentId, analysisFormMeta, analysisCategories, editingAnalysisId, addPerformanceAnalysis, updatePerformanceAnalysis, closeAnalysisModal]);

  const openEditTransaction = useCallback((t: Transaction) => {
    setEditingTransactionId(t.id);
    setEditTxnAmount(String(t.amount));
    setEditTxnTotalAmount(t.totalAmount != null ? String(t.totalAmount) : '');
    setEditTxnDate(normalizeDateInputYear(t.date || ''));
    setEditTxnPaymentType(t.paymentType);
    setEditTxnProcessedBy(t.processedBy || '');
    setEditTxnDescription(t.description || '');
  }, []);

  const salePaymentPreview = useMemo(() => {
    const total = Number(String(saleTotalAmount).replace(/\s/g, '').replace(',', '.'));
    const received = Number(String(saleAmountReceived).replace(/\s/g, '').replace(',', '.'));
    if (!saleTotalAmount.trim() || Number.isNaN(total) || total <= 0 || Number.isNaN(received)) return null;
    if (received >= total) return { status: 'complete' as const, total, received, remaining: 0 };
    return { status: 'partial' as const, total, received, remaining: total - received };
  }, [saleTotalAmount, saleAmountReceived]);

  const studentAnalyses = useMemo(() => {
    if (!studentId) return [];
    return performanceAnalyses.filter((a) => a.studentId === studentId).sort((a, b) => b.analysisDate.localeCompare(a.analysisDate));
  }, [performanceAnalyses, studentId]);

  const studentHomeworksWithAttempts = useMemo(() => {
    if (!studentId) return [];
    return homeworks.filter((hw) =>
      homeworkAttempts.some((a) => a.studentId === studentId && a.homeworkId === hw.id)
    );
  }, [studentId, homeworks, homeworkAttempts]);

  React.useEffect(() => {
    if (student) {
      setLichessInput(student.lichessUsername ?? '');
      setChessComInput(student.chessComUsername ?? '');
      setFideIdInput(student.fideId ?? '');
    }
  }, [student?.id, student?.lichessUsername, student?.chessComUsername, student?.fideId]);

  const loadFide = React.useCallback(async () => {
    if (!student) return;
    
    let id = fideIdInput.trim().replace(/\D/g, '');
    setLoadingFide(true);

    try {
      // Eğer ID yoksa, isim ve doğum yılı ile ara
      if (!id) {
        const birthYear = student.birthDate ? Number(student.birthDate.slice(0, 4)) : null;
        const searchResults = await searchFidePlayer(student.name);
        
        if (searchResults.length > 0) {
          const matched = birthYear 
            ? searchResults.find(p => p.year === birthYear) 
            : searchResults[0];

          if (matched) {
            const newId = String(matched.id);
            if (newId !== fideIdInput) {
              id = newId;
              setFideIdInput(id);
            }
          }
        }
      }

      if (!id) {
        setFideProfile(null);
        return;
      }

      const profile = await fetchFidePlayer(id);
      setFideProfile(profile ?? null);
      
      if (profile) {
        const patch: Partial<Student> = {};
        let needsUpdate = false;

        if (id !== student.fideId) {
          patch.fideId = id;
          needsUpdate = true;
        }
        
        if (profile.standard != null && profile.standard > 0 && profile.standard !== student.elo) {
          patch.elo = profile.standard;
          patch.ukd = profile.standard;
          needsUpdate = true;
        }

        if (needsUpdate) {
          updateStudent(student.id, patch);
        }
      }
    } catch (err) {
      console.error('[FIDE] Load error:', err);
    } finally {
      setLoadingFide(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id, student.name, student.birthDate, student.fideId, student.elo, fideIdInput, updateStudent]);

  React.useEffect(() => {
    if (activeDetailTab === 'ukd' && student?.fideId) loadFide();
  }, [activeDetailTab, student?.fideId, loadFide]);

  const handleFetchUkd = useCallback(async () => {
    if (!student) return;
    const tc = student.tcNo?.replace(/\D/g, '') || '';
    const soyad = (student.name || '').trim().split(/\s+/).slice(-1)[0] || undefined;
    if (!tc) {
      setShowUkdImportModal(true);
      return;
    }
    setLoadingUkdFetch(true);
    try {
      const res = await fetchUkdFromTsf({ tc, soyad });
      if (res && 'ok' in res && res.ok && res.ukd != null) {
        const patch: Partial<Student> = { ukd: res.ukd };
        if (res.fideId) patch.fideId = res.fideId;
        if (res.name?.trim()) patch.name = res.name.trim();
        if (res.dogumYil?.trim().length === 4 && (!student.birthDate || student.birthDate.slice(0, 4) !== res.dogumYil.trim())) {
          patch.birthDate = `${res.dogumYil.trim()}-01-01`;
        }
        updateStudent(student.id, patch);
        if (student.fideId !== res.fideId && res.fideId) setFideIdInput(res.fideId);
      } else if (res && 'error' in res) {
        alert(`UKD otomatik çekilemedi.\n${res.error}\n\nTSF sorgu sonucu ekranda varsa "TSF verilerini elle aktar" ile kaydedebilirsiniz.`);
        setUkdImportUkd(String(student.ukd || ''));
        setUkdImportName(student.name || '');
        setUkdImportBirthYear(student.birthDate ? student.birthDate.slice(0, 4) : '');
        setUkdImportLastVisa('');
        setShowUkdImportModal(true);
      } else {
        alert('UKD servisi yanıt vermedi. Lütfen Edge Function (fetch-ukd) deploy durumunu kontrol edin veya verileri elle aktarın.');
        setUkdImportUkd(String(student.ukd || ''));
        setUkdImportName(student.name || '');
        setUkdImportBirthYear(student.birthDate ? student.birthDate.slice(0, 4) : '');
        setUkdImportLastVisa('');
        setShowUkdImportModal(true);
      }
    } finally {
      setLoadingUkdFetch(false);
    }
  }, [student, updateStudent]);

  const studentAttendances = useMemo(() => {
    if (!studentId) return [];
    return attendanceRecords
      .filter((r) => r.studentId === studentId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [studentId, attendanceRecords]);

  const studentTransactions = useMemo(() => {
    if (!studentId) return [];
    return transactions
      .filter((t) => t.studentId === studentId && t.type === 'income')
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [studentId, transactions]);

  /** Sadece Paket ve Özel Ders satışları (görüntüleme / düzenleme / silme için) */
  const packageTransactions = useMemo(() => {
    return studentTransactions.filter((t) => t.category === 'Paket' || t.category === 'Özel Ders');
  }, [studentTransactions]);

  /** Sadece Özel Ders satışları (Özel Ders sekmesi için) */
  const privateLessonTransactions = useMemo(() => {
    return packageTransactions.filter((t) => t.category === 'Özel Ders');
  }, [packageTransactions]);

  /** Grup galerisi: öğrencinin grubuna veya öğrenciye özel yüklenen görseller */
  const groupGalleryItems = useMemo(() => {
    if (!student) return [];
    return gallery.filter(
      (g) => g.group === student.group || g.studentId === student.id
    ).slice(0, 8);
  }, [gallery, student]);

  const calendarYearForDerived = new Date().getFullYear();

  const derived = useMemo(() => {
    if (!student) return null;
    const status = student.status === 'inactive' ? 'inactive' : 'active';
    const baseFee = getBaseMonthlyFeeForStudent(student, trainingGroups, disciplineBranches);
    const monthlyFee = student.isScholarshipStudent
      ? 0
      : applySiblingDiscount(baseFee, student).finalFee;
    const registrationYear = student.registrationDate ? new Date(student.registrationDate).getFullYear() : new Date().getFullYear();
    const year = Number.isFinite(registrationYear) ? registrationYear : new Date().getFullYear();
    const totalAttendance = studentAttendances.length;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const last30 = studentAttendances.filter((r) => r.date >= thirtyDaysAgo && r.status === 'present').length;
    const expected30 = 8;
    const attendanceRate = expected30 > 0 ? `${Math.round((last30 / expected30) * 100)}%` : (totalAttendance > 0 ? '100%' : '—');

    // Aidat durumu: bu yılki gerçek tahsilata göre (Aidat Takvimi ile aynı veri)
    const yearStr = String(calendarYearForDerived);
    let totalPaidThisYear = 0;
    studentTransactions.forEach((t) => {
      const d = t.date || '';
      if (d.slice(0, 4) === yearStr) totalPaidThisYear += t.amount || 0;
    });
    const expectedThisYear =
      student.registrationType === 'package'
        ? 0
        : getExpectedDuesForYear(student, calendarYearForDerived, trainingGroups, disciplineBranches);
    const duesState: 'package' | 'scholarship' | 'paid' | 'partial' | 'unpaid' =
      student.registrationType === 'package'
        ? 'package'
        : student.isScholarshipStudent
          ? 'scholarship'
          : expectedThisYear <= 0
            ? 'paid'
            : totalPaidThisYear >= expectedThisYear
              ? 'paid'
              : totalPaidThisYear > 0
                ? 'partial'
                : 'unpaid';
    const duesDebt = expectedThisYear > 0 ? Math.max(0, expectedThisYear - totalPaidThisYear) : 0;

    return { status, duesState, monthlyFee, year, totalAttendance, attendanceRate, totalPaidThisYear, expectedThisYear, duesDebt };
  }, [student, studentAttendances, studentTransactions, calendarYearForDerived, trainingGroups, disciplineBranches]);

  /** Takvimde gösterilen yıl (mevcut yıl); aidat takvimi bu yıla göre doldurulur */
  const calendarYear = new Date().getFullYear();

  /** Takvim yılı için aylık aidat toplamları: ay numarası (1-12) -> toplam tutar (gerçek işlemlerden) */
  const duesByMonth = useMemo(() => {
    const yearStr = String(calendarYear);
    const map: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) map[m] = 0;
    studentTransactions.forEach((t) => {
      const d = t.date;
      const y = d.length >= 4 ? d.slice(0, 4) : '';
      const monthStr = d.length >= 7 ? d.slice(5, 7) : '';
      const monthNum = monthStr ? parseInt(monthStr, 10) : 0;
      if (y === yearStr && monthNum >= 1 && monthNum <= 12) {
        map[monthNum] = (map[monthNum] || 0) + (t.amount || 0);
      }
    });
    return map;
  }, [calendarYear, studentTransactions]);

 if (!student || !derived) {
 return (
 <div className="space-y-6">
 <div className="flex items-center gap-3">
 <button
 type="button"
 onClick={onBack}
 className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e293b] hover:bg-[#1e293b] border border-slate-700/60/50 text-slate-200 font-bold transition-all"
 >
 <ArrowLeft className="w-4 h-4" /> Geri
 </button>
 </div>
 <div className="bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg border border-slate-700/60 p-10 text-center">
 <User className="w-14 h-14 mx-auto text-slate-400 mb-4" />
 <div className="text-lg font-black text-white">Öğrenci bulunamadı</div>
 <div className="text-sm text-slate-400 mt-1">Listeye dönüp tekrar deneyin.</div>
 </div>
 </div>
 );
 }

 const statusBadge =
 derived.status === 'active' ? <Badge color="emerald">Aktif Öğrenci</Badge> : <Badge color="rose">Pasif Öğrenci</Badge>;

 return (
 <div className="contents">
 <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 min-w-0">

 {/* ── Hero Profile Card ────────────────────────────────────── */}
 <div className="relative rounded-xl sm:rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl shadow-black/20">
   {/* Gradient banner */}
   <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/30 via-violet-600/20 to-slate-900/80 pointer-events-none" />
   <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMiI+PHBhdGggZD0iTTM2IDE4YzAtOS45NC04LjA2LTE4LTE4LTE4UzAgOC4wNiAwIDE4czguMDYgMTggMTggMTggMTgtOC4wNiAxOC0xOCIvPjwvZz48L2c+PC9zdmc+')] opacity-40 pointer-events-none" />

   {/* Top bar */}
   <div className="relative z-10 flex items-center justify-between px-4 sm:px-6 pt-3 sm:pt-5 pb-2 sm:pb-3">
     <button
       type="button"
       onClick={onBack}
       className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white/90 text-xs sm:text-sm font-semibold transition-all border border-white/10 min-h-[40px]"
     >
       <ArrowLeft className="w-4 h-4" /> Geri
     </button>
     <div className="flex items-center gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white/10 backdrop-blur-md border border-white/10 max-w-[55%]">
       <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/70 shrink-0" />
       <span className="text-[11px] sm:text-sm font-semibold text-white/80 truncate">{student.branchOffice || student.group || '—'}</span>
     </div>
   </div>

   {/* Profile content */}
   <div className="relative z-10 px-4 sm:px-8 pb-4 sm:pb-6 pt-1 sm:pt-2">
     <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:gap-6 items-start">
       {/* Avatar + Info */}
       <div className="flex items-center gap-3 sm:gap-5 flex-1 min-w-0 w-full">
         <div className="w-14 h-14 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-500/30 to-violet-500/30 border-2 border-white/20 flex items-center justify-center text-base sm:text-3xl font-black text-white shadow-xl sm:shadow-2xl shadow-indigo-500/20 overflow-hidden shrink-0 backdrop-blur-sm">
           {student.photoUrl ? (
             <img src={student.photoUrl} alt={student.name} className="w-full h-full object-cover" />
           ) : (
             <span className="bg-gradient-to-br from-indigo-400 to-violet-400 bg-clip-text text-transparent">{initials(student.name)}</span>
           )}
         </div>
         <div className="min-w-0 flex-1">
           <h1 className="text-base sm:text-2xl md:text-3xl font-black tracking-tight text-white drop-shadow-lg leading-tight line-clamp-2">{student.name}</h1>
           <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
             <span className="inline-flex items-center px-2 py-0.5 sm:px-3 sm:py-1 rounded-md sm:rounded-lg bg-white/10 backdrop-blur-sm text-white/80 text-[10px] sm:text-xs font-semibold border border-white/10">
               {student.branch || 'Branş yok'}
             </span>
             <span className="inline-flex items-center px-2 py-0.5 sm:px-3 sm:py-1 rounded-md sm:rounded-lg bg-white/10 backdrop-blur-sm text-white/80 text-[10px] sm:text-xs font-semibold border border-white/10">
               {student.group || 'Grup yok'}
             </span>
             <span className="sm:hidden">{statusBadge}</span>
           </div>
           <div className="hidden sm:block mt-2 sm:mt-3">{statusBadge}</div>
         </div>
       </div>

       {/* Quick info chips — mobilde yatay kaydırma */}
       <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 w-full lg:w-auto overflow-x-auto scrollbar-none snap-x snap-mandatory -mx-1 px-1 pb-0.5 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0">
         <div className="shrink-0 snap-start min-w-[7.25rem] sm:min-w-0 rounded-lg sm:rounded-xl bg-white/[0.08] backdrop-blur-lg border border-white/10 px-3 py-2 sm:px-4 sm:py-3 sm:hover:bg-white/[0.12] transition-colors">
           <div className="text-[8px] sm:text-[9px] font-bold text-white/50 uppercase tracking-widest">Öğrenci No</div>
           <div className="text-xs sm:text-sm font-bold text-indigo-300 mt-0.5 font-mono">#{getDisplayStudentNo(student, students)}</div>
           <button type="button" onClick={() => navigator.clipboard.writeText(String(getDisplayStudentNo(student, students)))} className="text-[8px] sm:text-[9px] text-white/40 mt-0.5 hover:text-indigo-300 transition-colors text-left">Kopyala</button>
         </div>
         <div className="shrink-0 snap-start min-w-[7.25rem] sm:min-w-0 rounded-lg sm:rounded-xl bg-white/[0.08] backdrop-blur-lg border border-white/10 px-3 py-2 sm:px-4 sm:py-3 sm:hover:bg-white/[0.12] transition-colors">
           <div className="text-[8px] sm:text-[9px] font-bold text-white/50 uppercase tracking-widest">TC</div>
           <div className="text-xs sm:text-sm font-bold text-white mt-0.5 truncate">{student.tcNo || '—'}</div>
         </div>
         <div className="shrink-0 snap-start min-w-[7.25rem] sm:min-w-0 rounded-lg sm:rounded-xl bg-white/[0.08] backdrop-blur-lg border border-white/10 px-3 py-2 sm:px-4 sm:py-3 sm:hover:bg-white/[0.12] transition-colors">
           <div className="text-[8px] sm:text-[9px] font-bold text-white/50 uppercase tracking-widest">Yaş</div>
           <div className="text-xs sm:text-sm font-bold text-white mt-0.5">{ageFromBirthDate(student.birthDate) ?? '—'}</div>
         </div>
         <div className="shrink-0 snap-start min-w-[7.25rem] sm:min-w-0 rounded-lg sm:rounded-xl bg-white/[0.08] backdrop-blur-lg border border-white/10 px-3 py-2 sm:px-4 sm:py-3 sm:hover:bg-white/[0.12] transition-colors">
           <div className="text-[8px] sm:text-[9px] font-bold text-white/50 uppercase tracking-widest">Şube</div>
           <div className="text-xs sm:text-sm font-bold text-white mt-0.5 truncate">{student.branchOffice || '—'}</div>
         </div>
       </div>
     </div>

     {/* Actions */}
     <div className="mt-3 sm:mt-6 grid grid-cols-4 sm:flex sm:flex-wrap gap-1.5 sm:gap-2.5">
       <ActionPill tone="outline" icon={<Edit2 className="w-4 h-4" />} label="Düzenle" onClick={() => setShowEditModal(true)} />
       <ActionPill tone="outline" icon={<Power className="w-4 h-4" />} label="Durum" onClick={() => { setStatusModalValue(student.status === 'inactive' ? 'inactive' : 'active'); setShowStatusModal(true); }} />
       <ActionPill tone="emerald" icon={<ShoppingCart className="w-4 h-4" />} label="Paket/Ders" onClick={() => { setSaleType('aylik-paket'); setSaleStartDate(''); setSaleEndDate(''); setSaleTotalHours(''); setSaleValidityDays(''); setSalePackageName(''); setSaleTotalAmount(''); setSaleAmountReceived(''); setSaleDownPayment(''); setShowSaleModal(true); }} />
       <ActionPill
         tone="rose"
         icon={<Trash2 className="w-4 h-4" />}
         label="Sil"
         onClick={() => {
           if (window.confirm(`${student.name} öğrencisini silmek istediğinize emin misiniz?`)) {
             deleteStudent(student.id);
             onBack();
           }
         }}
       />
     </div>
   </div>

   {/* Tabs — glassmorphic */}
   <div className="relative z-10 border-t border-white/[0.06] bg-black/20 backdrop-blur-xl px-2 sm:px-6">
     <div className="flex gap-0.5 overflow-x-auto scrollbar-none snap-x snap-mandatory">
       {[
         { id: 'finans' as const, label: 'Finans', icon: <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
         { id: 'ukd' as const, label: 'UKD/FIDE', icon: <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
         { id: 'lichess' as const, label: 'Lichess', icon: <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
         { id: 'chesscom' as const, label: 'Chess.com', icon: <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
         { id: 'analizler' as const, label: 'Analizler', icon: <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
         { id: 'taksitler' as const, label: 'Taksitler', icon: <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
         { id: 'ozel-dersler' as const, label: 'Özel Ders', icon: <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
         { id: 'gecmis' as const, label: 'Geçmiş', icon: <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
         { id: 'bilgiler' as const, label: 'Bilgiler', icon: <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
       ].map((t) => (
         <button
           key={t.id}
           type="button"
           onClick={() => setActiveDetailTab(t.id)}
           className={`relative shrink-0 snap-start flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3.5 text-[11px] sm:text-xs font-bold whitespace-nowrap transition-all duration-200 min-h-[44px] ${
             activeDetailTab === t.id
               ? 'text-white'
               : 'text-white/40 hover:text-white/70'
           }`}
         >
           {t.icon}
           {t.label}
           {activeDetailTab === t.id && (
             <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-gradient-to-r from-indigo-400 to-violet-400" />
           )}
         </button>
       ))}
     </div>
   </div>
 </div>

 {(activeDetailTab === 'ukd') && student && (
 <div className="rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] shadow-xl overflow-hidden">
 <div className="px-6 py-4 border-b border-slate-700/60 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Trophy className="w-5 h-5 text-amber-500" />
 <span className="text-sm font-black text-white">UKD & FIDE Bilgileri</span>
 </div>
 <div className="flex items-center gap-2">
 <button type="button" onClick={loadFide} disabled={loadingFide} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold disabled:opacity-50">
   {loadingFide ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Yenile
 </button>
 <a href="https://ukd.tsf.org.tr/ukdsorgulama.php" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">
 <ExternalLink className="w-4 h-4" /> TSF UKD Sorgula
 </a>
 </div>
 </div>
 <div className="p-6 space-y-6">
 {/* UKD — TSF TC sorgusu */}
 <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/20 p-4 space-y-3">
   <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest">UKD (TSF TC Sorgusu)</div>
   <p className="text-slate-400 text-sm">UKD puanı <a href="https://ukd.tsf.org.tr/ukdsorgulama.php" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">TSF UKD Bilgi Sistemi</a> üzerinden TC Kimlik No ile sorgulanır. Sorgu sonucuna göre kayıtlı UKD puanını düzenlemeden güncelleyebilirsiniz.</p>
   <div className="flex flex-wrap items-center gap-2">
     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TC Kimlik No:</span>
     {student.tcNo ? (
       <span className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-white font-mono text-sm">{student.tcNo}</span>
     ) : (
       <span className="text-slate-500 text-sm">Kayıtlı TC yok — düzenlemeden ekleyin</span>
     )}
     {student.tcNo && (
       <button type="button" onClick={() => navigator.clipboard.writeText(student.tcNo || '')} className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold">
         <Copy className="w-3.5 h-3.5" /> Kopyala
       </button>
     )}
     <a href="https://ukd.tsf.org.tr/ukdsorgulama.php" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">
       <ExternalLink className="w-3.5 h-3.5" /> TSF UKD Sorgula
     </a>
   </div>
   <div className="pt-2 border-t border-slate-700/60 flex flex-wrap items-center gap-3">
     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kayıtlı UKD puanı:</span>
     <span className="text-lg font-black text-white">{student.ukd != null && student.ukd > 0 ? student.ukd : '—'}</span>
     <button type="button" onClick={handleFetchUkd} disabled={loadingUkdFetch} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold disabled:opacity-50">
       {loadingUkdFetch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} UKD çek
     </button>
     <button type="button" onClick={() => { setUkdImportUkd(String(student.ukd || '')); setUkdImportName(student.name || ''); setUkdImportBirthYear(student.birthDate ? student.birthDate.slice(0, 4) : ''); setUkdImportLastVisa(''); setShowUkdImportModal(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 text-xs font-bold">
       <Download className="w-3.5 h-3.5" /> TSF verilerini elle aktar
     </button>
   </div>
 </div>

 {showUkdImportModal && student && (
   <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowUkdImportModal(false)}>
     <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
     <div className="relative w-full max-w-md bg-[#1e293b] border border-slate-700/60 rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
       <div className="p-5 border-b border-slate-700/60 flex items-center justify-between">
         <h3 className="text-lg font-bold text-white flex items-center gap-2">
           <Trophy className="w-5 h-5 text-indigo-500" /> TSF verilerini sisteme aktar
         </h3>
         <button type="button" onClick={() => setShowUkdImportModal(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"><X className="w-5 h-5" /></button>
       </div>
       <div className="p-5 space-y-4">
         <p className="text-slate-400 text-sm">TSF UKD sayfasında TC ile sorguladıktan sonra gördüğünüz verileri aşağıya girin; sisteme kaydedilsin.</p>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">UKD puanı *</label>
           <input type="number" min={0} value={ukdImportUkd} onChange={(e) => setUkdImportUkd(e.target.value)} placeholder="Örn: 1433" className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium" />
         </div>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Ad Soyad</label>
           <input type="text" value={ukdImportName} onChange={(e) => setUkdImportName(e.target.value)} placeholder="TSF sayfasındaki ad soyad" className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium" />
         </div>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Doğum yılı</label>
           <input type="text" value={ukdImportBirthYear} onChange={(e) => setUkdImportBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Örn: 1998" className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium" />
         </div>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Son vize tarihi</label>
           <input type="text" value={ukdImportLastVisa} onChange={(e) => setUkdImportLastVisa(e.target.value)} placeholder="Örn: 16.09.2021" className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium" />
         </div>
         <div className="flex gap-3 pt-2">
           <button type="button" onClick={() => setShowUkdImportModal(false)} className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 font-bold text-sm">İptal</button>
           <button
             type="button"
             onClick={() => {
               const ukdNum = Number(ukdImportUkd.replace(/\s/g, '').replace(',', '.'));
               if (Number.isNaN(ukdNum) || ukdNum < 0) return;
               const patch: Partial<Student> = { ukd: ukdNum };
               if (ukdImportName.trim()) patch.name = ukdImportName.trim();
               if (ukdImportBirthYear.trim().length === 4) {
                 const y = ukdImportBirthYear.trim();
                 if (!student.birthDate || student.birthDate.slice(0, 4) !== y) patch.birthDate = `${y}-01-01`;
               }
               if (ukdImportLastVisa.trim()) {
                 const note = `Son UKD vize: ${ukdImportLastVisa.trim()}`;
                 patch.notes = [student.notes, note].filter(Boolean).join('\n');
               }
               updateStudent(student.id, patch);
               setShowUkdImportModal(false);
             }}
             className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm"
           >
             Sisteme kaydet
           </button>
         </div>
       </div>
     </div>
   </div>
 )}

 {/* FIDE — ratings.fide.com */}
 <div>
   <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">FIDE (ratings.fide.com)</div>
   <div className="flex flex-wrap items-center gap-2">
     <input
       type="text"
       value={fideIdInput}
       onChange={(e) => setFideIdInput(e.target.value)}
       onBlur={() => {
         const id = fideIdInput.trim().replace(/\D/g, '');
         if (id) {
           updateStudent(student.id, { fideId: id });
           loadFide();
         }
       }}
       placeholder="FIDE ID veya otomatik ara..."
       className="w-52 min-w-0 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/40 outline-none"
     />
     <button 
       type="button" 
       onClick={loadFide} 
       disabled={loadingFide}
       className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
     >
       {loadingFide ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
       {!fideIdInput ? 'Otomatik Ara & Çek' : 'Verileri Yenile'}
     </button>
     {student.fideId ? (
       <a href={`https://ratings.fide.com/profile/${student.fideId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-colors">
         <ExternalLink className="w-3.5 h-3.5" /> ratings.fide.com Profil
       </a>
     ) : null}
   </div>
   {!fideIdInput && (
     <p className="text-[10px] text-slate-500 mt-1.5 italic">FIDE ID boşsa, öğrencinin adı ve doğum yılıyla arama yapılır.</p>
   )}
 </div>
 {fideIdInput.trim() ? (
   loadingFide && !fideProfile ? (
     <div className="flex items-center gap-2 py-8 text-slate-400">
       <Loader2 className="w-5 h-5 animate-spin" /> FIDE verileri çekiliyor...
     </div>
   ) : fideProfile ? (
     <div className="space-y-4">
       <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-4 flex flex-wrap items-center justify-between gap-4">
         <div>
           <div className="text-lg font-black text-white">{fideProfile.name}</div>
           <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-xs text-slate-400">
             <span>Federasyon: {federationLabel(fideProfile.federation)}</span>
             {fideProfile.year != null && <span>Doğum: {fideProfile.year}</span>}
             {fideProfile.inactive && <span className="text-amber-400">Pasif</span>}
           </div>
         </div>
         <a href={`https://ratings.fide.com/profile/${fideProfile.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/20 text-amber-400 text-sm font-bold">
           <ExternalLink className="w-4 h-4" /> ratings.fide.com Profil
         </a>
       </div>
       <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
         <div className="rounded-lg border border-l-4 border-l-indigo-500 border-slate-700/60 bg-slate-800/40 px-4 py-3">
           <div className="text-[10px] font-bold text-slate-400 uppercase">Standard</div>
           <div className="text-2xl font-black text-indigo-400 mt-1">{fideProfile.standard ?? '—'}</div>
           <div className="text-xs text-slate-500 mt-0.5">Klasik</div>
         </div>
         <div className="rounded-lg border border-l-4 border-l-sky-500 border-slate-700/60 bg-slate-800/40 px-4 py-3">
           <div className="text-[10px] font-bold text-slate-400 uppercase">Rapid</div>
           <div className="text-2xl font-black text-sky-400 mt-1">{fideProfile.rapid ?? '—'}</div>
         </div>
         <div className="rounded-lg border border-l-4 border-l-amber-500 border-slate-700/60 bg-slate-800/40 px-4 py-3">
           <div className="text-[10px] font-bold text-slate-400 uppercase">Blitz</div>
           <div className="text-2xl font-black text-amber-400 mt-1">{fideProfile.blitz ?? '—'}</div>
         </div>
       </div>
       <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-5 py-4">
         <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">UKD Puanı (senkron)</div>
         <div className="text-2xl font-black text-indigo-400 mt-1">{student.elo ?? fideProfile.standard ?? '—'}</div>
         <div className="text-xs text-slate-400 mt-1">FIDE Standard ile güncellenir</div>
       </div>
     </div>
   ) : (
     <div className="rounded-xl bg-slate-800/40 border border-slate-700/60 p-4 text-sm text-slate-500">FIDE ID bulunamadı veya geçersiz.</div>
   )
 ) : (
   <div className="p-8 text-center">
     <Trophy className="w-12 h-12 text-slate-500 mx-auto mb-3" />
     <p className="text-slate-400 text-sm font-medium">FIDE ID girip kaydettikten sonra bilgiler <a href="https://ratings.fide.com" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">ratings.fide.com</a> kaynağından çekilecektir (örn: 6334490).</p>
   </div>
 )}
 </div>
 </div>
 )}

 {(activeDetailTab === 'lichess' || activeDetailTab === 'chesscom') && student ? (
 <LichessChessCard
 activeTab={activeDetailTab === 'lichess' ? 'lichess' : 'chesscom'}
 student={student}
 lichessInput={lichessInput}
 setLichessInput={setLichessInput}
 chessComInput={chessComInput}
 setChessComInput={setChessComInput}
 updateStudent={updateStudent}
 />
 ) : null}


 {(activeDetailTab === 'finans') && (
 <div className="space-y-4 md:space-y-6">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
 <StatTile icon={<CalendarCheck className="w-5 h-5" />} title="Devam Oranı (30 Gün)" value={derived.attendanceRate} accent="indigo" />
<StatTile
 icon={<BadgeCheck className="w-5 h-5" />}
 title="Aidat Durumu"
 value={derived.duesState === 'scholarship' ? 'Burslu' : derived.duesState === 'paid' ? '₺0.00' : derived.duesState === 'partial' ? 'Kısmi' : derived.duesState === 'package' ? 'Paket' : (derived.duesDebt > 0 ? `₺${Number(derived.duesDebt).toLocaleString('tr-TR')}` : 'Borç')}
 subtitle={derived.duesState === 'scholarship' ? 'Aidat ödemesi yok' : derived.duesState === 'paid' ? 'Borç Yok' : derived.duesState === 'partial' && derived.duesDebt > 0 ? `Kalan ₺${Number(derived.duesDebt).toLocaleString('tr-TR')}` : derived.duesState === 'unpaid' && derived.expectedThisYear > 0 ? `Bu yıl ₺${Number(derived.expectedThisYear).toLocaleString('tr-TR')}` : undefined}
 accent="emerald"
/>
 <StatTile icon={<Users className="w-5 h-5" />} title="Toplam Devam" value={derived.totalAttendance} accent="violet" />
 <StatTile icon={<Calendar className="w-5 h-5" />} title="Kayıt Tarihi" value={formatDateTR(student.registrationDate)} accent="amber" />
 </div>

 {/* Dues calendar */}
 <div className="rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] overflow-hidden shadow-xl">
 <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/[0.06] bg-white/[0.02] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
 <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
   <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
 </div>
 <div className="min-w-0">
   <div className="text-sm font-bold text-white">Aidat Takvimi</div>
   <div className="text-[10px] text-slate-500">{calendarYear} · {student.registrationType === 'package' ? 'Ders Paketi' : student.isScholarshipStudent ? 'Burslu' : 'Aylık Aidat'}</div>
 </div>
 </div>
 {student.registrationType !== 'package' && !student.isScholarshipStudent && (
 <button
 type="button"
 onClick={() => {
 setShowDuesModal(true);
 setDuesAmount(String(derived.monthlyFee || ''));
 setDuesMonth(String(new Date().getMonth() + 1));
 setDuesPaymentType('Nakit');
 setDuesProcessedBy('');
 }}
 className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all min-h-[44px]"
 >
 <Wallet className="w-4 h-4" /> Aidat Al
 </button>
 )}
 </div>
<div className="p-3 sm:p-6 grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
{MONTHS_TR.map((m, idx) => {
 const monthNum = idx + 1;
 const paid = duesByMonth[monthNum] ?? 0;
 const beforeRegistration = isMonthBeforeRegistration(student, calendarYear, monthNum);
 const dueInfo = getExpectedDueForMonth(student, calendarYear, monthNum, trainingGroups, disciplineBranches);
 const expected = beforeRegistration ? 0 : (student.registrationType === 'package' ? 0 : dueInfo.expected);
 const nowMonth = new Date().getMonth() + 1;
 const nowYear = new Date().getFullYear();
 const isFuture = calendarYear > nowYear || (calendarYear === nowYear && monthNum > nowMonth);
 const state =
   beforeRegistration
     ? 'Kayıt öncesi'
     : student.registrationType === 'package'
     ? (paid > 0 ? 'Ödendi' : 'Paket')
     : dueInfo.isScholarship
       ? 'Burslu'
       : isFuture && paid <= 0
         ? 'Bekliyor'
         : paid >= expected && expected > 0
           ? 'Ödendi'
           : paid > 0
             ? 'Kısmi'
             : 'Ödenmedi';
 const tone =
   beforeRegistration
     ? 'bg-slate-900/50 border-slate-700/40 opacity-60'
     : student.registrationType === 'package'
     ? paid > 0
       ? 'bg-emerald-500/30 border-emerald-400/55 shadow-sm shadow-emerald-500/15'
       : 'bg-slate-800/70 border-slate-600/70'
     : dueInfo.isScholarship
       ? 'bg-emerald-500/20 border-emerald-400/40'
       : isFuture && paid <= 0
         ? 'bg-slate-800/70 border-slate-600/70'
         : paid >= expected && expected > 0
           ? 'bg-emerald-500/30 border-emerald-400/55 shadow-sm shadow-emerald-500/15'
           : paid > 0
             ? 'bg-amber-500/30 border-amber-400/55 shadow-sm shadow-amber-500/15'
             : 'bg-rose-500/30 border-rose-400/55 shadow-sm shadow-rose-500/15';
 const stateColor =
   state === 'Kayıt öncesi' ? 'text-slate-500' :
   state === 'Ödendi' ? 'text-emerald-200' :
   state === 'Burslu' ? 'text-emerald-300' :
   state === 'Kısmi' ? 'text-amber-200' :
   state === 'Ödenmedi' ? 'text-rose-200' :
   state === 'Bekliyor' ? 'text-slate-400' :
   state === 'Paket' ? 'text-indigo-300' : 'text-slate-400';
 return (
   <div key={m} className={`relative rounded-lg border p-2.5 sm:p-4 ${tone}`}>
     <button
       type="button"
       onClick={() => {
         setDuesPlanMonth(String(monthNum));
         setDuesPlanAmount(String(expected || ''));
         setDuesPlanNote(student.duesOverrideNotes?.[monthKey(calendarYear, monthNum)] || '');
         setShowDuesPlanModal(true);
       }}
       className="absolute top-2 right-2 p-1 rounded-md text-slate-500 hover:text-indigo-400 hover:bg-white/5"
       title="Ay aidatını düzenle"
     >
       <Settings className="w-3.5 h-3.5" />
     </button>
     <button
       type="button"
       onClick={() => {
         setDuesMonth(String(monthNum));
         setDuesAmount(student.registrationType === 'package' ? '' : String(expected || derived.monthlyFee || ''));
         setDuesPaymentType('Nakit');
         setDuesProcessedBy('');
         setShowDuesModal(true);
       }}
       className="w-full text-left hover:scale-[1.01] transition-transform cursor-pointer"
     >
       <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">{m}</div>
       <div className="mt-1 sm:mt-2 text-center">
         {beforeRegistration ? (
           <div className="text-sm sm:text-lg font-black text-slate-600">—</div>
         ) : student.registrationType !== 'package' && dueInfo.isScholarship ? (
           <div className="text-sm sm:text-lg font-black text-emerald-300">Burslu</div>
         ) : student.registrationType !== 'package' && dueInfo.discountAmount > 0 ? (
           <div className="space-y-0.5">
             <div className="text-[10px] sm:text-xs text-slate-500 line-through">₺{Number(dueInfo.baseFee).toLocaleString('tr-TR')}</div>
             <div className="text-sm sm:text-lg font-black text-white">₺{Number(expected).toLocaleString('tr-TR')}</div>
             <div className="text-[9px] sm:text-[10px] font-bold text-emerald-400">₺{Number(dueInfo.discountAmount).toLocaleString('tr-TR')} ind.</div>
           </div>
         ) : (
           <div className="text-sm sm:text-lg font-black text-white">
             {student.registrationType === 'package'
               ? (paid > 0 ? `₺${Number(paid).toLocaleString('tr-TR')}` : '—')
               : `₺${Number(expected).toLocaleString('tr-TR')}`}
           </div>
         )}
       </div>
       <div className={`mt-1 text-center text-xs font-black uppercase tracking-wide ${stateColor}`}>{state}</div>
       {paid > 0 && student.registrationType !== 'package' && (
         <div className="mt-1 text-center text-[10px] text-slate-500">Tahsil: ₺{Number(paid).toLocaleString('tr-TR')}</div>
       )}
     </button>
   </div>
 );
})}
</div>
{student.registrationType !== 'package' && (
<div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-700/60 bg-white/[0.02]">
<div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Aidat hatırlatma günleri</div>
<div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:gap-6 sm:items-end">
<div>
<label className="block text-xs font-bold text-slate-400 mb-1.5">Hatırlatma günü (ayın kaçı)</label>
<select
value={student.paymentReminderDay || DEFAULT_REMINDER_DAY}
onChange={(e) => updateStudent(student.id, { paymentReminderDay: e.target.value })}
className="min-w-[120px] px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium"
>
{REMINDER_DAY_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
</select>
</div>
<div>
<label className="block text-xs font-bold text-slate-400 mb-1.5">Gecikme hatırlatması (kaç gün gecikince)</label>
<select
value={student.latePaymentReminderDay || DEFAULT_REMINDER_DAY}
onChange={(e) => updateStudent(student.id, { latePaymentReminderDay: e.target.value })}
className="min-w-[120px] px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium"
>
{REMINDER_DAY_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
</select>
</div>
</div>
</div>
 )}
 </div>

 {/* Paketler & Özel Dersler — sadece Finans sekmesinde, listeleme + düzenle/sil */}
 {activeDetailTab === 'finans' && (
 <div className="rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] shadow-xl overflow-hidden">
 <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-700/60 bg-white/[0.02] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
 <div className="flex items-center gap-2">
 <ShoppingCart className="w-4 h-4 text-emerald-600" />
 <div className="text-sm font-black text-white">Paketler & Özel Dersler</div>
 </div>
 <button type="button" onClick={() => { setSaleType('aylik-paket'); setSaleStartDate(''); setSaleEndDate(''); setSaleTotalHours(''); setSaleValidityDays(''); setSalePackageName(''); setSaleTotalAmount(''); setSaleAmountReceived(''); setSaleDownPayment(''); setShowSaleModal(true); }} className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold transition-colors min-h-[40px]">
 <ShoppingCart className="w-3.5 h-3.5" /> Yeni satış
 </button>
 </div>
 <div className="p-4 sm:p-6">
 {packageTransactions.length === 0 ? (
 <div className="py-10 text-center rounded-xl bg-slate-900/30 border border-slate-700/50">
 <GraduationCap className="w-12 h-12 text-slate-500 mx-auto mb-3" />
 <p className="text-slate-400 text-sm font-medium">Henüz paket veya özel ders satışı yok.</p>
 <p className="text-slate-500 text-xs mt-1">Yukarıdaki &quot;Yeni satış&quot; veya öğrenci kartındaki &quot;Paket/Ders&quot; butonu ile ekleyebilirsiniz.</p>
 </div>
 ) : (
 <ResponsiveTable minWidth={640} className="rounded-xl border border-slate-700/50">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-700/60 bg-slate-900/40">
 <th className="py-3.5 pl-4 pr-3">Tarih</th>
 <th className="py-3.5 pr-3">Paket / Ders Adı</th>
 <th className="py-3.5 pr-3">Tür</th>
 <th className="py-3.5 pr-3">Ödeme Durumu</th>
 <th className="py-3.5 pr-3">Ödeme</th>
 <th className="py-3.5 pr-4 text-right">İşlem</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-700/50">
 {packageTransactions.map((t) => (
 <tr key={t.id} className="text-sm group hover:bg-slate-800/40 transition-colors">
 <td data-label="Tarih" className="py-3.5 pl-4 pr-3 font-bold text-white">{formatDateTR(t.date)}</td>
 <td data-label="Paket / Ders Adı" className="py-3.5 pr-3 text-slate-200">{t.description || '—'}</td>
 <td data-label="Tür" className="py-3.5 pr-3">
 <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${t.category === 'Paket' ? 'bg-indigo-500/30 text-indigo-200 border-indigo-400/50' : 'bg-amber-500/30 text-amber-200 border-amber-400/50'}`}>{t.category}</span>
 </td>
 <td data-label="Ödeme Durumu" className="py-3.5 pr-3"><SalePaymentCell transaction={t} /></td>
 <td data-label="Ödeme" className="py-3.5 pr-3">
 <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-violet-500/30 text-violet-200 border border-violet-400/50">{t.paymentType}</span>
 </td>
 <td data-label="İşlem" className="py-3.5 pr-4 text-right">
 <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 <button type="button" onClick={() => openEditTransaction(t)} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10" title="Düzenle"><Edit2 className="w-4 h-4" /></button>
 <button type="button" onClick={() => { if (window.confirm(`"${(t.description || t.category).slice(0, 40)}" satışını silmek istediğinize emin misiniz?`)) removeTransaction(t.id); }} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10" title="Sil"><Trash2 className="w-4 h-4" /></button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </ResponsiveTable>
 )}
 </div>
 </div>
 )}

 {/* Ödeme Geçmişi — sadece Finans sekmesinde */}
 {activeDetailTab === 'finans' && (
 <div className="rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] shadow-xl overflow-hidden">
 <div className="px-6 py-4 border-b border-slate-700/60 bg-white/[0.02] flex items-center justify-between flex-wrap gap-2">
 <div className="flex items-center gap-2">
 <CreditCard className="w-4 h-4 text-indigo-600" />
 <div className="text-sm font-black text-white">Ödeme Geçmişi (Tüm İşlemler)</div>
 </div>
 <button type="button" onClick={() => setShowDuesModal(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold transition-colors">
 <Wallet className="w-3.5 h-3.5" /> Ödeme ekle
 </button>
 </div>
 <div className="p-6">
 <ResponsiveTable minWidth={640}>
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-700/60/60">
 <th className="py-3 pr-4">Dönem</th>
 <th className="py-3 pr-4">Kategori</th>
 <th className="py-3 pr-4">Tutar</th>
 <th className="py-3 pr-4">Ödeme Tipi</th>
 <th className="py-3 pr-4">Tahsilat</th>
 <th className="py-3 pr-4 text-right">İşlem</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-200/60">
 {studentTransactions.length === 0 ? (
 <tr><td colSpan={6} className="py-6 text-center text-slate-400 text-sm">Henüz ödeme kaydı bulunmuyor.</td></tr>
 ) : (
 studentTransactions.slice(0, 12).map((t) => (
 <tr key={t.id} className="text-sm border-l-[3px] border-l-emerald-500 bg-emerald-500/[0.06] odd:bg-emerald-500/[0.09] hover:bg-emerald-500/[0.14] transition-colors">
 <td data-label="Dönem" className="py-3 pr-4 font-bold text-white">{formatDateTR(t.date)}</td>
 <td data-label="Kategori" className="py-3 pr-4">
 <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-indigo-500/30 text-indigo-200 border border-indigo-400/50">{t.category}</span>
 </td>
 <td data-label="Tutar" className="py-3 pr-4">
 <span className="inline-flex px-2 py-1 rounded-lg font-black text-emerald-200 bg-emerald-500/30 border border-emerald-400/50 tabular-nums">₺{Number(t.amount).toLocaleString('tr-TR')}</span>
 </td>
 <td data-label="Ödeme Tipi" className="py-3 pr-4">
 <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-violet-500/30 text-violet-200 border border-violet-400/50">{t.paymentType}</span>
 </td>
 <td data-label="Tahsilat" className="py-3 pr-4 text-slate-300 font-bold">{t.processedBy || '—'}</td>
 <td data-label="İşlem" className="py-3 pr-4 text-right">
 <div className="flex items-center justify-end gap-1">
<button type="button" onClick={() => openEditTransaction(t)} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10" title="Düzenle"><Edit2 className="w-4 h-4" /></button>
 <button type="button" onClick={() => { if (window.confirm('Bu ödemeyi silmek istediğinize emin misiniz?')) removeTransaction(t.id); }} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10" title="Sil"><Trash2 className="w-4 h-4" /></button>
</div>
</td>
</tr>
 ))
 )}
</tbody>
</table>
</ResponsiveTable>
</div>
</div>
)}

 </div>
 )}

 {(activeDetailTab === 'taksitler') && (
 <div className="rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] shadow-xl overflow-hidden">
 <div className="px-6 py-4 border-b border-slate-700/60 flex items-center justify-between flex-wrap gap-2">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center">
 <CreditCard className="w-5 h-5 text-indigo-400" />
 </div>
 <div>
 <div className="text-sm font-black text-white">Taksitli Satışlar & Ödemeler</div>
 <div className="text-[11px] text-slate-400 mt-0.5">Paket ve özel ders satışları</div>
 </div>
 </div>
 <button type="button" onClick={() => { setSaleType('aylik-paket'); setSaleStartDate(''); setSaleEndDate(''); setSaleTotalHours(''); setSaleValidityDays(''); setSalePackageName(''); setSaleTotalAmount(''); setSaleAmountReceived(''); setSaleDownPayment(''); setShowSaleModal(true); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors">
 <ShoppingCart className="w-4 h-4" /> Yeni satış
 </button>
 </div>
 <div className="p-6">
 {packageTransactions.length === 0 ? (
 <div className="py-12 text-center rounded-xl bg-slate-900/30 border border-slate-700/50">
 <CreditCard className="w-14 h-14 text-slate-500 mx-auto mb-4" />
 <p className="text-slate-400 text-sm font-medium">Henüz paket veya özel ders satışı yok.</p>
 <p className="text-slate-500 text-xs mt-2">Yeni satış ile paket veya özel ders ekleyebilirsiniz.</p>
 <button type="button" onClick={() => setShowSaleModal(true)} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold">
 <ShoppingCart className="w-4 h-4" /> Yeni satış
 </button>
 </div>
 ) : (
 <ResponsiveTable minWidth={640} className="rounded-xl border border-slate-700/50">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-700/60 bg-slate-900/40">
 <th className="py-3.5 pl-4 pr-3">Tarih</th>
 <th className="py-3.5 pr-3">Paket / Ders Adı</th>
 <th className="py-3.5 pr-3">Tür</th>
 <th className="py-3.5 pr-3">Ödeme Durumu</th>
 <th className="py-3.5 pr-3">Ödeme</th>
 <th className="py-3.5 pr-4 text-right">İşlem</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-700/50">
 {packageTransactions.map((t) => (
 <tr key={t.id} className="text-sm group hover:bg-slate-800/40 transition-colors">
 <td data-label="Tarih" className="py-3.5 pl-4 pr-3 font-bold text-white">{formatDateTR(t.date)}</td>
 <td data-label="Paket / Ders Adı" className="py-3.5 pr-3 text-slate-200">{t.description || '—'}</td>
 <td data-label="Tür" className="py-3.5 pr-3">
 <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${t.category === 'Paket' ? 'bg-indigo-500/30 text-indigo-200 border-indigo-400/50' : 'bg-amber-500/30 text-amber-200 border-amber-400/50'}`}>{t.category}</span>
 </td>
 <td data-label="Ödeme Durumu" className="py-3.5 pr-3"><SalePaymentCell transaction={t} /></td>
 <td data-label="Ödeme" className="py-3.5 pr-3">
 <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-violet-500/30 text-violet-200 border border-violet-400/50">{t.paymentType}</span>
 </td>
 <td data-label="İşlem" className="py-3.5 pr-4 text-right">
 <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 <button type="button" onClick={() => openEditTransaction(t)} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10" title="Düzenle"><Edit2 className="w-4 h-4" /></button>
 <button type="button" onClick={() => { if (window.confirm(`"${(t.description || t.category).slice(0, 40)}" satışını silmek istediğinize emin misiniz?`)) removeTransaction(t.id); }} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10" title="Sil"><Trash2 className="w-4 h-4" /></button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </ResponsiveTable>
 )}
 </div>
 </div>
 )}

 {(activeDetailTab === 'ozel-dersler') && (
 <div className="rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] shadow-xl overflow-hidden">
 <div className="px-6 py-4 border-b border-slate-700/60 flex items-center justify-between flex-wrap gap-2">
 <div className="flex items-center gap-2">
 <GraduationCap className="w-5 h-5 text-amber-500" />
 <span className="text-sm font-black text-white">Özel Ders Paketleri</span>
 </div>
 <button type="button" onClick={() => { setSaleType('ozel-ders'); setSalePackageName(''); setSaleTotalAmount(''); setSaleTotalHours(''); setSaleValidityDays(''); setSaleAmountReceived(''); setSaleDownPayment(''); setSaleInstallmentCount(4); setShowSaleModal(true); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors">
 <ShoppingCart className="w-4 h-4" /> Yeni özel ders
 </button>
 </div>
 <div className="p-6">
 {privateLessonTransactions.length === 0 ? (
 <div className="py-12 text-center rounded-xl bg-slate-900/30 border border-slate-700/50">
 <GraduationCap className="w-14 h-14 text-slate-500 mx-auto mb-4" />
 <p className="text-slate-400 text-sm font-medium">Henüz özel ders kaydı yok.</p>
 <p className="text-slate-500 text-xs mt-2">Yeni özel ders satışı eklediğinizde burada listelenecektir.</p>
 <button type="button" onClick={() => { setSaleType('ozel-ders'); setShowSaleModal(true); }} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 text-xs font-bold">
 <ShoppingCart className="w-4 h-4" /> Özel ders ekle
 </button>
 </div>
 ) : (
 <ResponsiveTable minWidth={560}>
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-700/60">
 <th className="py-3 pr-4">Tarih</th>
 <th className="py-3 pr-4">Açıklama</th>
 <th className="py-3 pr-4">Ödeme Durumu</th>
 <th className="py-3 pr-4">Ödeme</th>
 <th className="py-3 pr-4 text-right">İşlem</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-700/60">
 {privateLessonTransactions.map((t) => (
 <tr key={t.id} className="text-sm group hover:bg-slate-800/40 transition-colors">
 <td data-label="Tarih" className="py-3 pr-4 font-bold text-white">{formatDateTR(t.date)}</td>
 <td data-label="Açıklama" className="py-3 pr-4 text-slate-200">{t.description || '—'}</td>
 <td data-label="Ödeme Durumu" className="py-3 pr-4"><SalePaymentCell transaction={t} /></td>
 <td data-label="Ödeme" className="py-3 pr-4">
 <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-violet-500/30 text-violet-200 border border-violet-400/50">{t.paymentType}</span>
 </td>
 <td data-label="İşlem" className="py-3 pr-4 text-right">
 <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 <button type="button" onClick={() => openEditTransaction(t)} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10" title="Düzenle"><Edit2 className="w-4 h-4" /></button>
 <button type="button" onClick={() => { if (window.confirm(`"${(t.description || '').slice(0, 40)}" kaydını silmek istediğinize emin misiniz?`)) removeTransaction(t.id); }} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10" title="Sil"><Trash2 className="w-4 h-4" /></button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </ResponsiveTable>
 )}
 </div>
 </div>
 )}

{(activeDetailTab === 'analizler') && (
<div className="space-y-6">
<div className="rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] shadow-xl overflow-hidden">
<div className="px-6 py-4 border-b border-slate-700/60 flex items-center justify-between">
<div className="flex items-center gap-2">
<BarChart3 className="w-5 h-5 text-indigo-600" />
<span className="text-sm font-black text-white">Performans Analizleri</span>
</div>
<button type="button" onClick={openAddAnalysisModal} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">
+ Yeni Analiz
</button>
</div>
{studentAnalyses.length === 0 ? (
<div className="p-8 text-center text-slate-400 text-sm">Henüz performans analizi eklenmemiş.</div>
) : (
<div className="p-6 space-y-3">
{studentAnalyses.map((a) => {
const isExpanded = expandedAnalysisId === a.id;
const categories = getAnalysisCategories(a);
return (
<div key={a.id} className={`rounded-xl border transition-all duration-200 ${isExpanded ? 'bg-slate-800/60 border-indigo-500/20 shadow-lg shadow-indigo-500/5' : 'bg-slate-800/30 border-white/[0.06] hover:border-slate-600/50 hover:bg-slate-800/40'}`}>
<button type="button" onClick={() => setExpandedAnalysisId((id) => (id === a.id ? null : a.id))} className="w-full text-left p-4 sm:p-5">
<div className="flex items-center justify-between gap-4">
<div className="flex items-center gap-3 min-w-0">
<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
<BarChart3 className="w-5 h-5 text-indigo-400" />
</div>
<div className="min-w-0">
<h4 className="text-sm font-bold text-white truncate">{a.branch}</h4>
<p className="text-[11px] text-slate-400 font-medium mt-0.5">{formatDateTR(a.analysisDate)}</p>
</div>
</div>
<div className="flex items-center gap-1.5 shrink-0">
<div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold transition-colors group-hover:border-indigo-500/30">
<FileText className="w-3.5 h-3.5 text-indigo-400" />
<span>Detay</span>
<ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
</div>
<button type="button" onClick={(e) => { e.stopPropagation(); openEditAnalysisModal(a); }} className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10" title="Düzenle"><Edit2 className="w-4 h-4" /></button>
<button type="button" onClick={(e) => { e.stopPropagation(); if (window.confirm('Bu performans analizini silmek istediğinize emin misiniz?')) { deletePerformanceAnalysis(a.id); if (expandedAnalysisId === a.id) setExpandedAnalysisId(null); } }} className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10" title="Sil"><Trash2 className="w-4 h-4" /></button>
</div>
</div>
<div className="mt-4 flex flex-wrap gap-2">
{categories.map((c, idx) => (
<span key={c.id} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${categoryBadgeClass(idx)}`}>{c.label}: {c.value}</span>
))}
</div>
{a.generalEvaluation && <p className="mt-3 text-xs text-slate-400 line-clamp-2 leading-relaxed">{a.generalEvaluation}</p>}
</button>
{isExpanded && (
<div className="px-4 sm:px-5 pb-5 pt-0 border-t border-slate-700/50">
<div className="mt-4 rounded-xl bg-slate-900/50 border border-slate-700/50 p-4 space-y-4">
<div>
<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Performans Değerlendirmesi</p>
<div className="grid gap-3">
{categories.map(({ id, label, value, notes }, idx) => {
const ringCls = ['ring-indigo-500/30', 'ring-emerald-500/30', 'ring-amber-500/30', 'ring-violet-500/30', 'ring-rose-500/30', 'ring-sky-500/30'][idx % 6];
return (
<div key={id} className="flex gap-4 items-start p-3 rounded-lg bg-slate-800/40 border border-slate-700/50">
<div className="min-w-0 flex-1">
<p className="text-xs font-bold text-slate-200">{label}</p>
{notes ? <p className="text-xs text-slate-400 mt-1 leading-relaxed">{notes}</p> : <p className="text-xs text-slate-500 mt-1 italic">Not yok</p>}
</div>
<div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white ring-2 bg-slate-700 shrink-0 ${ringCls}`}>{value}</div>
</div>
);
})}
</div>
</div>
<div className="grid gap-4 sm:grid-cols-2">
{a.generalEvaluation && (
<div className="rounded-lg bg-slate-800/40 border border-slate-700/50 p-3">
<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Genel Değerlendirme</p>
<p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{a.generalEvaluation}</p>
</div>
)}
{a.recommendations && (
<div className="rounded-lg bg-slate-800/40 border border-slate-700/50 p-3">
<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Öneriler ve Gelişim Alanları</p>
<p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{a.recommendations}</p>
</div>
)}
{a.shortTermGoal && (
<div className="rounded-lg bg-slate-800/40 border border-slate-700/50 p-3">
<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Kısa Vadeli Hedef (1-3 Ay)</p>
<p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{a.shortTermGoal}</p>
</div>
)}
{a.longTermGoal && (
<div className="rounded-lg bg-slate-800/40 border border-slate-700/50 p-3 sm:col-span-2">
<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Uzun Vadeli Hedef (6-12 Ay)</p>
<p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{a.longTermGoal}</p>
</div>
)}
</div>
</div>
</div>
)}
</div>
);
})}
</div>
)}
</div>

<div className="rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] shadow-xl overflow-hidden">
<div className="px-6 py-4 border-b border-slate-700/60 flex items-center gap-2">
<Sparkles className="w-5 h-5 text-violet-500" />
<span className="text-sm font-black text-white">Ödev AI Raporu</span>
</div>
<div className="p-6 space-y-4">
<p className="text-xs text-slate-400">Öğrencinin ödev denemelerine göre AI ile eksiklik ve hamle analizi oluşturulur.</p>
{studentHomeworksWithAttempts.length === 0 ? (
<p className="text-slate-500 text-sm">Bu öğrenciye ait ödev denemesi bulunamadı. Ödev Takibi sayfasından ödev atayıp öğrenci deneme yaptıktan sonra rapor alabilirsiniz.</p>
) : (
<>
<div className="flex flex-wrap items-center gap-3">
<select value={aiReportHwId ?? ''} onChange={(e) => { setAiReportHwId(e.target.value || null); setAiReportResult(null); }} className="px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-800 text-white text-sm font-medium [color-scheme:dark] min-w-[200px]">
<option value="">Ödev seçin...</option>
{studentHomeworksWithAttempts.map((hw) => (
<option key={hw.id} value={hw.id}>{hw.title}</option>
))}
</select>
<button
type="button"
disabled={aiReportLoading || !aiReportHwId}
onClick={async () => {
if (!student || !aiReportHwId) return;
const hw = homeworks.find((h) => h.id === aiReportHwId);
if (!hw) return;
setAiReportResult(null);
setAiReportLoading(true);
try {
const attempts = homeworkAttempts.filter((a) => a.studentId === student.id && a.homeworkId === aiReportHwId).map((a) => ({ puzzleTitle: a.puzzleTitle, correct: a.correct, movesPlayed: a.movesPlayed, solutionMoves: a.solutionMoves }));
const res = await analyzeStudentHomework(student.name, hw.title, attempts);
setAiReportResult(res);
} catch {
setAiReportResult({ eksiklikler: 'Analiz alınamadı.', hamleler: '-' });
} finally {
setAiReportLoading(false);
}
}}
className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold"
>
{aiReportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
{aiReportLoading ? 'Rapor oluşturuluyor...' : 'AI Rapor Oluştur'}
</button>
</div>
{aiReportResult && (
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
<div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
<h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Eksiklikler & Gelişim Alanları</h4>
<div className="text-sm text-slate-300 whitespace-pre-wrap max-h-52 overflow-y-auto">{aiReportResult.eksiklikler}</div>
</div>
<div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
<h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Hamleler & Karşılaştırma</h4>
<div className="text-sm text-slate-300 whitespace-pre-wrap max-h-52 overflow-y-auto">{aiReportResult.hamleler}</div>
</div>
</div>
)}
</>
)}
</div>
</div>
</div>
)}

 {(activeDetailTab === 'gecmis') && (
 <div className="rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] shadow-xl overflow-hidden">
 <div className="px-6 py-4 border-b border-slate-700/60 bg-white/[0.02] flex items-center justify-between flex-wrap gap-2">
 <div className="flex items-center gap-2">
 <CalendarCheck className="w-4 h-4 text-indigo-600" />
 <div className="text-sm font-black text-white">Yoklama & Hareketler</div>
 </div>
 <a href="#/yoklama-al" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 text-xs font-bold transition-colors">
 Yoklama Al <ExternalLink className="w-3.5 h-3.5" />
 </a>
 </div>
 <div className="p-6">
 <ResponsiveTable minWidth={480}>
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-700/60/60">
 <th className="py-3 pr-4">Tarih</th>
 <th className="py-3 pr-4">Saat</th>
 <th className="py-3 pr-4">Grup</th>
 <th className="py-3 pr-4">Durum</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-200/60">
 {studentAttendances.length === 0 ? (
 <tr><td colSpan={4} className="py-6 text-center text-slate-400 text-sm">Yoklama kaydı yok.</td></tr>
 ) : (
 studentAttendances.slice(0, 20).map((r) => (
 <tr key={r.id} className="text-sm odd:bg-slate-900/50/60">
 <td data-label="Tarih" className="py-3 pr-4 font-bold text-white">{formatDateTR(r.date)}</td>
 <td data-label="Saat" className="py-3 pr-4 text-slate-300 font-bold">—</td>
 <td data-label="Grup" className="py-3 pr-4 text-slate-300 font-bold">{student.group}</td>
 <td data-label="Durum" className="py-3 pr-4">
 <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${r.status === 'present' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : r.status === 'late' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : r.status === 'excused' ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
   {r.status === 'present' ? 'Var' : r.status === 'late' ? 'Geç' : r.status === 'excused' ? 'İzinli' : 'Yok'}
 </span>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </ResponsiveTable>
 </div>
 </div>
 )}

 {/* Lower grid — sadece Bilgiler sekmesinde galeri; Finans'ta ödeme yukarıda */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
 <div className="lg:col-span-2 space-y-6">
 {activeDetailTab === 'bilgiler' && (
 <>
 {/* Group gallery — gerçek galeri verisi, tıklanınca büyütme */}
 <div className="bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg border border-slate-700/60 overflow-hidden">
 <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-700/60 bg-white/[0.02] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
 <div className="min-w-0">
 <div className="text-sm font-black text-white">Grup Galerisi</div>
 <div className="text-xs text-slate-400 truncate">{student.group || '—'} – Son yüklenen resimler</div>
 </div>
 <a href="#/galeri" className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 text-xs font-bold transition-colors">
 Galeriye git <ExternalLink className="w-3.5 h-3.5" />
 </a>
 </div>
 <div className="p-3 sm:p-6 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
 {groupGalleryItems.length === 0 ? (
 <div className="col-span-2 md:col-span-4 py-8 text-center text-slate-500 text-sm">
 Bu gruba ait henüz görsel yok. <a href="#/galeri" className="text-indigo-400 hover:underline font-medium">Galeri</a> sayfasından ekleyebilirsiniz.
 </div>
 ) : (
 groupGalleryItems.map((img) => (
 <button
 key={img.id}
 type="button"
 onClick={() => setZoomedImage({ url: img.url, title: img.title })}
 className="rounded-lg overflow-hidden border border-slate-700/60 bg-[#1e293b] hover:border-indigo-500/30 transition-all text-left group"
 >
 <div className="aspect-[4/3] bg-slate-800 relative">
 <img
 src={img.url}
 alt={img.title}
 referrerPolicy="no-referrer"
 className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
 onError={e => { (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/chess/600/450'; }}
 />
 <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
 <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
 </div>
 </div>
 <div className="p-3">
 <div className="text-xs font-bold text-white truncate">{img.title || 'Görsel'}</div>
 <div className="flex items-center gap-2 mt-1 text-[10px] font-bold text-slate-400">
 <Camera className="w-3.5 h-3.5" /> {img.date}
 </div>
 </div>
 </button>
 ))
 )}
 </div>
 </div>
 </> )}
 </div>

 {activeDetailTab === 'bilgiler' && (
 <div className="space-y-6">
 <div className="rounded-xl sm:rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] shadow-xl p-4 sm:p-6">
 <div className="flex items-center justify-between gap-2 mb-3">
 <div className="flex items-center gap-2 min-w-0">
 <User className="w-4 h-4 text-indigo-600 shrink-0" />
 <div className="text-sm font-black text-white">İletişim Bilgileri</div>
 </div>
 <button type="button" onClick={() => setShowEditModal(true)} className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
 <Edit2 className="w-3.5 h-3.5" /> Düzenle
 </button>
 </div>
 <div className="divide-y divide-slate-200/60">
 <KV label="Ad Soyad" value={student.name} />
 <KV label="Kullanıcı Adı" value={student.username || '—'} />
 <KV label="TC Kimlik" value={student.tcNo || '—'} />
 <KV label="Doğum Tarihi" value={formatDateTR(student.birthDate)} />
 <KV label="Okulu" value={student.school || '—'} />
 <KV label="Okul Öğretmeni" value={student.teacher || '—'} />
 <KV label="Şube" value={student.branchOffice || '—'} />
 <KV label="Branş" value={student.branch || '—'} />
 <KV label="Grup" value={student.group || '—'} />
 <KV label="Ders programı" value={formatLessonSchedule(student.lessonSchedule)} />
 </div>
 <button
   type="button"
   onClick={() => {
     setScheduleDraft(student.lessonSchedule?.length ? student.lessonSchedule.map((s) => ({ ...s })) : []);
     setShowScheduleModal(true);
   }}
   className="mt-3 text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
 >
   <Clock className="w-3.5 h-3.5" /> Ders programını düzenle
 </button>
 </div>

 <div className="rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] shadow-xl p-6">
 <div className="flex items-center justify-between gap-2 mb-3">
 <div className="flex items-center gap-2">
 <Users className="w-4 h-4 text-indigo-600" />
 <div className="text-sm font-black text-white">Veli Bilgileri</div>
 </div>
 <button type="button" onClick={() => setShowEditModal(true)} className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
 <Edit2 className="w-3.5 h-3.5" /> Düzenle
 </button>
 </div>
 <div className="divide-y divide-slate-200/60">
 <KV label="Baba Adı"value={student.fatherName || student.parentName || '—'} />
 <KV label="Baba Tel"value={formatPhone(student.fatherPhone || student.parentPhone)} />
 <KV label="Anne Adı"value={student.motherName || '—'} />
 <KV label="Anne Tel"value={formatPhone(student.motherPhone)} />
 </div>
 <div className="mt-6">
 <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Mesaj Telefonları</div>
 <div className="mt-3 space-y-2">
 {(student.contactNumbers?.length ? student.contactNumbers : [student.parentPhone].filter(Boolean)).slice(0, 3).map((p, i) => (
 <div key={i} className="flex items-center justify-between rounded-lg border border-slate-700/60/60 bg-[#1e293b] px-4 py-3">
 <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Telefon {i + 1}</div>
 <div className="text-sm font-black text-white">{formatPhone(p)}</div>
 </div>
 ))}
 {(!student.contactNumbers || student.contactNumbers.length === 0) && !student.parentPhone ? (
 <div className="text-sm text-slate-400">Telefon bulunamadı.</div>
 ) : null}
 </div>
 </div>

  </div>

  <div className="bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg border border-slate-700/60 p-6 space-y-6">
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Heart className="w-4 h-4 text-rose-500" />
        <div className="text-sm font-black text-white">Sağlık Bilgisi</div>
      </div>
      <div className="text-sm text-slate-300 leading-relaxed">
        {student.healthInfo?.trim() ? student.healthInfo : 'Belirtilmemiş'}
      </div>
    </div>
    
    <div className="pt-4 border-t border-slate-700/60">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-indigo-600" />
        <div className="text-sm font-black text-white">Özel Notlar</div>
      </div>
      <div className="text-sm text-slate-300 leading-relaxed">
        {student.notes?.trim() ? student.notes : '—'}
      </div>
    </div>
  </div>
  </div>
 )}
 </div>
 </div>

 {zoomedImage && (
 <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={() => setZoomedImage(null)}>
 <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
 <button type="button" onClick={() => setZoomedImage(null)} className="absolute -top-2 -right-2 z-10 p-2 rounded-full bg-slate-800 hover:bg-rose-500/80 text-white">
 <X className="w-6 h-6" />
 </button>
 <img src={zoomedImage.url} alt={zoomedImage.title} className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-lg shadow-2xl" referrerPolicy="no-referrer" />
 <p className="mt-2 text-center text-white font-medium">{zoomedImage.title}</p>
 </div>
 </div>
 )}

 {showEditModal && student
   ? createPortal(
       <EditStudentModal
         student={student}
         onSave={async (updated) => {
           await updateStudent(student.id, updated);
           addActivityLog({ user: 'Sistem', action: 'Öğrenci Güncellendi', target: student.name, type: 'info' });
         }}
         onClose={() => setShowEditModal(false)}
       />,
       document.body
     )
   : null}

 {showDuesModal && student && (
   <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowDuesModal(false)}>
     <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
     <div className="relative w-full max-w-md bg-[#1e293b] border border-slate-700/60 rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
       <div className="p-5 border-b border-slate-700/60 flex items-center justify-between">
         <h3 className="text-lg font-bold text-white flex items-center gap-2">
           <Wallet className="w-5 h-5 text-emerald-500" /> Aidat Al
         </h3>
         <button type="button" onClick={() => setShowDuesModal(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
           <X className="w-5 h-5" />
         </button>
       </div>
       <div className="p-5 space-y-4">
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Dönem (Ay)</label>
           <select
             value={duesMonth}
             onChange={(e) => setDuesMonth(e.target.value)}
             className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium"
           >
             {MONTHS_TR.map((m, i) => (
               <option key={m} value={i + 1}>{m}</option>
             ))}
           </select>
         </div>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tutar (₺)</label>
           <input
             type="number"
             min="0"
             step="1"
             value={duesAmount}
             onChange={(e) => setDuesAmount(e.target.value)}
             className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium"
             placeholder="0"
           />
         </div>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Ödeme tipi</label>
           <select
             value={duesPaymentType}
             onChange={(e) => setDuesPaymentType(e.target.value as 'Nakit' | 'Havale/EFT' | 'Kredi Kartı')}
             className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium"
           >
             <option value="Nakit">Nakit</option>
             <option value="Havale/EFT">Havale/EFT</option>
             <option value="Kredi Kartı">Kredi Kartı</option>
           </select>
         </div>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tahsil eden (opsiyonel)</label>
           <input
             type="text"
             value={duesProcessedBy}
             onChange={(e) => setDuesProcessedBy(e.target.value)}
             className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium"
             placeholder="Ad soyad"
           />
         </div>
         <div className="flex gap-3 pt-2">
           <button type="button" onClick={() => setShowDuesModal(false)} className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 font-bold text-sm">
             İptal
           </button>
           <button
             type="button"
             onClick={() => {
               const amount = Number(duesAmount?.replace(/\s/g, '').replace(',', '.'));
               if (Number.isNaN(amount) || amount <= 0) return;
               const monthIndex = Number(duesMonth) || new Date().getMonth() + 1;
               const monthName = MONTHS_TR[monthIndex - 1] || '';
               const year = calendarYear;
               const monthPadded = String(monthIndex).padStart(2, '0');
               const isPackage = student.registrationType === 'package';
               addTransaction({
                 type: 'income',
                 category: isPackage ? 'Paket' : 'Aidat',
                 description: isPackage ? `${monthName} ${year} paket ödemesi` : `${monthName} ${year} aidat`,
                 paymentType: duesPaymentType,
                 amount,
                 studentId: student.id,
                 date: `${year}-${monthPadded}-01`,
                 processedBy: duesProcessedBy.trim() || undefined,
               });
               if (student.registrationType !== 'package' && derived.expectedThisYear > 0) {
                 const newTotalThisYear = derived.totalPaidThisYear + amount;
                 const newStatus: 'Paid' | 'Partial' | 'Unpaid' =
                   newTotalThisYear >= derived.expectedThisYear ? 'Paid' : newTotalThisYear > 0 ? 'Partial' : 'Unpaid';
                 updateStudent(student.id, { paymentStatus: newStatus });
               }
               setShowDuesModal(false);
             }}
             className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm"
           >
             Kaydet
           </button>
         </div>
       </div>
     </div>
   </div>
 )}

 {showDuesPlanModal && student && (
   <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowDuesPlanModal(false)}>
     <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
     <div className="relative w-full max-w-md bg-[#1e293b] border border-slate-700/60 rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
       <div className="p-5 border-b border-slate-700/60 flex items-center justify-between">
         <h3 className="text-lg font-bold text-white flex items-center gap-2">
           <Settings className="w-5 h-5 text-indigo-500" /> Ay Aidatı Düzenle
         </h3>
         <button type="button" onClick={() => setShowDuesPlanModal(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
           <X className="w-5 h-5" />
         </button>
       </div>
       <div className="p-5 space-y-4">
         <p className="text-xs text-slate-400">Bu ay için beklenen aidat tutarını özelleştirin (eksik/fazla hafta, kardeş indirimi vb.). Boş bırakırsanız grup ücreti uygulanır.</p>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Ay</label>
           <select
             value={duesPlanMonth}
             onChange={(e) => {
               const monthIndex = Number(e.target.value) || 1;
               setDuesPlanMonth(e.target.value);
               const info = getExpectedDueForMonth(student, calendarYear, monthIndex, trainingGroups, disciplineBranches);
               setDuesPlanAmount(String(info.expected || ''));
               setDuesPlanNote(student.duesOverrideNotes?.[monthKey(calendarYear, monthIndex)] || '');
             }}
             className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium"
           >
             {MONTHS_TR.map((m, i) => (
               <option key={m} value={i + 1}>{m}</option>
             ))}
           </select>
         </div>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Beklenen tutar (₺)</label>
           <input
             type="number"
             min="0"
             value={duesPlanAmount}
             onChange={(e) => setDuesPlanAmount(e.target.value)}
             className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium"
           />
         </div>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Not (opsiyonel)</label>
           <input
             type="text"
             value={duesPlanNote}
             onChange={(e) => setDuesPlanNote(e.target.value)}
             placeholder="Eksik hafta, özel indirim..."
             className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium"
           />
         </div>
         <div className="flex gap-3 pt-2">
           <button
             type="button"
             onClick={() => {
               const monthIndex = Number(duesPlanMonth) || 1;
               const key = monthKey(calendarYear, monthIndex);
               const overrides = { ...(student.duesOverrides ?? {}) };
               const notes = { ...(student.duesOverrideNotes ?? {}) };
               delete overrides[key];
               delete notes[key];
               updateStudent(student.id, {
                 duesOverrides: Object.keys(overrides).length ? overrides : undefined,
                 duesOverrideNotes: Object.keys(notes).length ? notes : undefined,
               });
               setShowDuesPlanModal(false);
             }}
             className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 font-bold text-sm"
           >
             Varsayılana dön
           </button>
           <button
             type="button"
             onClick={() => {
               const monthIndex = Number(duesPlanMonth) || 1;
               const amount = Number(duesPlanAmount?.replace(/\s/g, '').replace(',', '.'));
               if (Number.isNaN(amount) || amount < 0) return;
               const key = monthKey(calendarYear, monthIndex);
               const overrides = { ...(student.duesOverrides ?? {}), [key]: amount };
               const notes = { ...(student.duesOverrideNotes ?? {}) };
               if (duesPlanNote.trim()) notes[key] = duesPlanNote.trim();
               else delete notes[key];
               updateStudent(student.id, {
                 duesOverrides: overrides,
                 duesOverrideNotes: Object.keys(notes).length ? notes : undefined,
               });
               setShowDuesPlanModal(false);
             }}
             className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm"
           >
             Kaydet
           </button>
         </div>
       </div>
     </div>
   </div>
 )}

 {showScheduleModal && student && (
   <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowScheduleModal(false)}>
     <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
     <div className="relative w-full max-w-lg bg-[#1e293b] border border-slate-700/60 rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
       <div className="p-5 border-b border-slate-700/60 flex items-center justify-between">
         <h3 className="text-lg font-bold text-white flex items-center gap-2">
           <Clock className="w-5 h-5 text-indigo-500" /> Ders Programı
         </h3>
         <button type="button" onClick={() => setShowScheduleModal(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
           <X className="w-5 h-5" />
         </button>
       </div>
       <div className="p-5 space-y-3">
         <p className="text-xs text-slate-400">Gruptan gelen programı öğrenciye özel yükleyebilirsiniz. Farklı saatler için öğrenci düzenleme formundan kayıt sonrası profil güncellenir.</p>
         <div className="px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm min-h-[80px]">
           {scheduleDraft.length ? formatLessonSchedule(scheduleDraft) : 'Henüz program yok.'}
         </div>
         <div className="flex gap-3 pt-2">
           <button
             type="button"
             onClick={() => {
               const tg = findTrainingGroupByName(trainingGroups, student.group);
               if (tg) setScheduleDraft(tg.lessonSlots.map((s) => ({ ...s })));
             }}
             className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 font-bold text-sm"
           >
             Gruptan yükle
           </button>
           <button
             type="button"
             onClick={() => {
               updateStudent(student.id, { lessonSchedule: scheduleDraft.length ? scheduleDraft : undefined });
               setShowScheduleModal(false);
             }}
             className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm"
           >
             Kaydet
           </button>
         </div>
       </div>
     </div>
   </div>
 )}

 {showSaleModal && student && (
   <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowSaleModal(false)}>
     <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
     <div className="relative w-full max-w-lg bg-[#1e293b] border border-slate-700/60 rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
       <div className="p-5 border-b border-slate-700/60 flex items-center justify-between">
         <h3 className="text-lg font-bold text-white flex items-center gap-2">
           <ShoppingCart className="w-5 h-5 text-emerald-500" /> Paket & Ders Satışı
         </h3>
         <button type="button" onClick={() => setShowSaleModal(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
           <X className="w-5 h-5" />
         </button>
       </div>
       <div className="p-5 space-y-4">
         <div className="grid grid-cols-2 gap-3">
           <button
             type="button"
             onClick={() => setSaleType('aylik-paket')}
             className={`flex flex-col items-center gap-1.5 py-4 rounded-xl border-2 transition-all ${saleType === 'aylik-paket' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800/60 border-slate-600 text-slate-400 hover:border-slate-500'}`}
           >
             <Calendar className="w-6 h-6" />
             <span className="text-sm font-bold">Aylık Paket</span>
           </button>
           <button
             type="button"
             onClick={() => setSaleType('ozel-ders')}
             className={`flex flex-col items-center gap-1.5 py-4 rounded-xl border-2 transition-all ${saleType === 'ozel-ders' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800/60 border-slate-600 text-slate-400 hover:border-slate-500'}`}
           >
             <GraduationCap className="w-6 h-6" />
             <span className="text-sm font-bold">Özel Ders</span>
           </button>
         </div>

         {saleType === 'aylik-paket' && (
           <>
             <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 border border-sky-500/20 px-3 py-2 text-sm text-sky-300">
               <span className="text-sky-400">ℹ</span>
               Tarih aralığı seçin, aylar otomatik hesaplanacak.
             </div>
             <div className="grid grid-cols-2 gap-3">
               <div>
                 <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Başlangıç Tarihi</label>
                 <input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={saleStartDate} onChange={(e) => setSaleStartDate(normalizeDateInputYear(e.target.value))} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium [color-scheme:dark]" />
               </div>
               <div>
                 <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Bitiş Tarihi</label>
                 <input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={saleEndDate} onChange={(e) => setSaleEndDate(normalizeDateInputYear(e.target.value))} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium [color-scheme:dark]" />
               </div>
             </div>
           </>
         )}

         {saleType === 'ozel-ders' && (
           <>
             <div className="grid grid-cols-2 gap-3">
               <div>
                 <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Toplam Saat</label>
                 <input type="number" min="0" placeholder="Örn: 8" value={saleTotalHours} onChange={(e) => setSaleTotalHours(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium placeholder:text-slate-500" />
               </div>
               <div>
                 <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Geçerlilik (Gün)</label>
                 <input type="number" min="0" placeholder="Örn: 45" value={saleValidityDays} onChange={(e) => setSaleValidityDays(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium placeholder:text-slate-500" />
               </div>
             </div>
             <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-sm text-amber-200">
               <Clock className="w-4 h-4 text-amber-400 shrink-0" />
               Süre dolduğunda veya saatler bittiğinde paket kapanır.
             </div>
           </>
         )}

         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Paket/Ders Adı</label>
           <input type="text" value={salePackageName} onChange={(e) => setSalePackageName(e.target.value)} placeholder="Örn: 6 Aylık Yaz Kampı" className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium placeholder:text-slate-500" />
         </div>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Toplam Tutar (₺)</label>
           <input type="number" min="0" step="0.01" value={saleTotalAmount} onChange={(e) => setSaleTotalAmount(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium" placeholder="0.00" />
         </div>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Ödeme Şekli</label>
           <div className="grid grid-cols-2 gap-3">
             <button type="button" onClick={() => setSalePaymentMethod('pesin')} className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all ${salePaymentMethod === 'pesin' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800/60 border-slate-600 text-slate-400 hover:border-slate-500'}`}>
               <Wallet className="w-5 h-5" /> Peşin
             </button>
             <button type="button" onClick={() => setSalePaymentMethod('taksit')} className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all ${salePaymentMethod === 'taksit' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800/60 border-slate-600 text-slate-400 hover:border-slate-500'}`}>
               <CreditCard className="w-5 h-5" /> Taksit
             </button>
           </div>
         </div>
         {salePaymentMethod === 'taksit' && (
           <>
             <div>
               <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Peşinat (₺)</label>
               <input type="number" min="0" step="0.01" value={saleDownPayment} onChange={(e) => setSaleDownPayment(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium" placeholder="0.00" />
             </div>
             <div>
               <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Taksit Sayısı</label>
               <select value={saleInstallmentCount} onChange={(e) => setSaleInstallmentCount(Number(e.target.value))} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium">
                 {[2, 3, 4, 6, 12].map((n) => (
                   <option key={n} value={n}>{n} Taksit</option>
                 ))}
               </select>
             </div>
           </>
         )}
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Alınan Tutar (₺) *</label>
           <input type="number" min="0" step="0.01" value={saleAmountReceived} onChange={(e) => setSaleAmountReceived(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium" placeholder="0.00" />
         </div>
         {salePaymentPreview ? (
           <div className={`rounded-lg px-3 py-2.5 border text-xs font-bold ${salePaymentPreview.status === 'complete' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' : 'bg-rose-500/15 text-rose-300 border-rose-500/25'}`}>
             {salePaymentPreview.status === 'complete' ? (
               <span>Ödeme tamamlandı — ₺{salePaymentPreview.received.toLocaleString('tr-TR')} / ₺{salePaymentPreview.total.toLocaleString('tr-TR')}</span>
             ) : (
               <span>Eksik ödeme — Alınan: ₺{salePaymentPreview.received.toLocaleString('tr-TR')} · Toplam: ₺{salePaymentPreview.total.toLocaleString('tr-TR')} · Kalan: ₺{salePaymentPreview.remaining.toLocaleString('tr-TR')}</span>
             )}
           </div>
         ) : null}
         <div className="flex gap-3 pt-2">
           <button type="button" onClick={() => setShowSaleModal(false)} className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 font-bold text-sm">
             İptal
           </button>
           <button
             type="button"
             onClick={() => {
               const amount = Number(String(saleAmountReceived).replace(/\s/g, '').replace(',', '.'));
               if (Number.isNaN(amount) || amount < 0) return;
               const totalRaw = saleTotalAmount.trim() ? Number(String(saleTotalAmount).replace(/\s/g, '').replace(',', '.')) : NaN;
               const totalAmount = !Number.isNaN(totalRaw) && totalRaw > 0 ? totalRaw : undefined;
               const today = new Date().toISOString().slice(0, 10);
               const category = saleType === 'aylik-paket' ? 'Paket' : 'Özel Ders';
               let desc = salePackageName.trim() || (saleType === 'aylik-paket' ? `${saleStartDate || '—'} - ${saleEndDate || '—'} paket` : `${saleTotalHours || '—'} saat özel ders`);
               if (salePaymentMethod === 'taksit') {
                 const pesinat = saleDownPayment.trim() ? `Peşinat: ${saleDownPayment}₺` : '';
                 desc = [desc, `${saleInstallmentCount} Taksit`, pesinat].filter(Boolean).join(' | ');
               }
               addTransaction({
                 type: 'income',
                 category,
                 description: desc,
                 paymentType: salePaymentMethod === 'taksit' ? 'Kredi Kartı' : 'Nakit',
                 amount,
                 totalAmount,
                 studentId: student.id,
                 date: today,
               });
               if (saleType === 'aylik-paket') updateStudent(student.id, { registrationType: 'package' });
               addActivityLog({ user: 'Sistem', action: category + ' satışı', target: student.name, type: 'success' });
               setShowSaleModal(false);
               if (salePaymentMethod === 'taksit') setActiveDetailTab('taksitler');
             }}
             className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm inline-flex items-center justify-center gap-2"
           >
             <CheckCircle className="w-4 h-4" /> Satışı Tamamla
           </button>
         </div>
       </div>
     </div>
   </div>
 )}

 {showStatusModal && student && (
   <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowStatusModal(false)}>
     <div className="bg-[#1e293b] border border-slate-700/60 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
       <div className="p-5 border-b border-slate-700/60 flex items-center justify-between">
         <h3 className="text-lg font-bold text-white">Durum Değiştir</h3>
         <button type="button" onClick={() => setShowStatusModal(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
           <X className="w-5 h-5" />
         </button>
       </div>
       <div className="p-5 space-y-4">
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Durum</label>
           <select
             value={statusModalValue}
             onChange={(e) => setStatusModalValue(e.target.value as 'active' | 'inactive')}
             className="w-full px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-800 text-white font-medium [color-scheme:dark]"
           >
             <option value="active">Aktif</option>
             <option value="inactive">Pasif</option>
           </select>
         </div>
         <button
           type="button"
           onClick={() => {
             updateStudent(student.id, { status: statusModalValue });
             setShowStatusModal(false);
           }}
           className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm"
         >
           Güncelle
         </button>
       </div>
     </div>
   </div>
 )}

 {showAnalysisModal && student && createPortal(
   <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm" onClick={closeAnalysisModal}>
     <div
       className="bg-[#1e293b] border border-slate-700/60 rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden min-h-0"
       style={{ height: 'min(82dvh, 640px)' }}
       onClick={(e) => e.stopPropagation()}
     >
       <div className="px-3 py-2.5 border-b border-slate-700/60 flex items-center justify-between shrink-0">
         <h3 className="text-sm font-bold text-white flex items-center gap-2">
           <BarChart3 className="w-4 h-4 text-indigo-500" />
           {editingAnalysisId ? 'Analiz Düzenle' : 'Analiz Ekle'}
         </h3>
         <button type="button" onClick={closeAnalysisModal} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
       </div>

       <div className="shrink-0 px-3 py-2.5 border-b border-slate-700/40 bg-slate-900/30">
         <div className="grid grid-cols-2 gap-2">
           <div>
             <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Branş *</label>
             <select value={analysisFormMeta.branch} onChange={(e) => setAnalysisFormMeta((f) => ({ ...f, branch: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-600 bg-slate-800 text-white text-xs font-medium [color-scheme:dark]">
               <option value="">Seçin...</option>
               {disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
             </select>
           </div>
           <div>
             <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Tarih *</label>
             <input type="date" value={analysisFormMeta.analysisDate} onChange={(e) => setAnalysisFormMeta((f) => ({ ...f, analysisDate: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-600 bg-slate-800 text-white text-xs font-medium [color-scheme:dark]" />
           </div>
         </div>
       </div>

       <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2.5 space-y-2.5">
         <div>
           <div className="flex items-center justify-between gap-2 mb-2 sticky top-0 z-10 bg-[#1e293b] py-1">
             <div className="flex items-center gap-1.5">
               <Star className="w-3 h-3 text-amber-500" />
               <span className="text-[11px] font-black text-white">Değerlendirme Maddeleri</span>
             </div>
             <button
               type="button"
               onClick={() => setAnalysisCategories((prev) => [...prev, { id: newCategoryId(), label: 'Yeni Madde', value: 5, notes: '' }])}
               className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-[9px] font-bold"
             >
               <Plus className="w-3 h-3" /> Ekle
             </button>
           </div>
           <div className="space-y-2">
             {analysisCategories.map((cat) => (
               <div key={cat.id} className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-2">
                 <div className="flex items-center gap-1.5 mb-1">
                   <input
                     type="text"
                     value={cat.label}
                     onChange={(e) => setAnalysisCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, label: e.target.value } : c)))}
                     placeholder="Madde adı"
                     className="flex-1 min-w-0 px-2 py-1 rounded-md border border-slate-600 bg-slate-800 text-white text-[11px] font-bold"
                   />
                   <span className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-black text-white shrink-0">{cat.value}</span>
                   {analysisCategories.length > 1 ? (
                     <button
                       type="button"
                       onClick={() => setAnalysisCategories((prev) => prev.filter((c) => c.id !== cat.id))}
                       className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 shrink-0"
                       title="Maddeyi sil"
                     >
                       <Trash2 className="w-3 h-3" />
                     </button>
                   ) : null}
                 </div>
                 <input
                   type="range"
                   min={1}
                   max={10}
                   value={cat.value}
                   onChange={(e) => setAnalysisCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, value: Number(e.target.value) } : c)))}
                   className="w-full h-1 rounded-lg appearance-none bg-slate-700 accent-indigo-500"
                 />
                 <input
                   type="text"
                   value={cat.notes}
                   onChange={(e) => setAnalysisCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, notes: e.target.value } : c)))}
                   placeholder="Not (isteğe bağlı)"
                   className="mt-1.5 w-full px-2 py-1 rounded-md bg-slate-800 border border-slate-600 text-white text-[11px] placeholder:text-slate-500"
                 />
               </div>
             ))}
           </div>
         </div>

         <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-700/40">
           <div className="sm:col-span-2">
             <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Genel Değerlendirme</label>
             <textarea value={analysisFormMeta.generalEvaluation} onChange={(e) => setAnalysisFormMeta((f) => ({ ...f, generalEvaluation: e.target.value }))} placeholder="Genel performans..." rows={1} className="w-full px-2 py-1 rounded-md bg-slate-800 border border-slate-600 text-white text-[11px] placeholder:text-slate-500 resize-none" />
           </div>
           <div className="sm:col-span-2">
             <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Öneriler</label>
             <textarea value={analysisFormMeta.recommendations} onChange={(e) => setAnalysisFormMeta((f) => ({ ...f, recommendations: e.target.value }))} placeholder="Gelişim önerileri..." rows={1} className="w-full px-2 py-1 rounded-md bg-slate-800 border border-slate-600 text-white text-[11px] placeholder:text-slate-500 resize-none" />
           </div>
           <div>
             <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Kısa Vadeli Hedef</label>
             <textarea value={analysisFormMeta.shortTermGoal} onChange={(e) => setAnalysisFormMeta((f) => ({ ...f, shortTermGoal: e.target.value }))} placeholder="1-3 ay" rows={1} className="w-full px-2 py-1 rounded-md bg-slate-800 border border-slate-600 text-white text-[11px] placeholder:text-slate-500 resize-none" />
           </div>
           <div>
             <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Uzun Vadeli Hedef</label>
             <textarea value={analysisFormMeta.longTermGoal} onChange={(e) => setAnalysisFormMeta((f) => ({ ...f, longTermGoal: e.target.value }))} placeholder="6-12 ay" rows={1} className="w-full px-2 py-1 rounded-md bg-slate-800 border border-slate-600 text-white text-[11px] placeholder:text-slate-500 resize-none" />
           </div>
         </div>
       </div>

       <div className="px-3 py-2.5 border-t border-slate-700/60 flex gap-2 shrink-0 bg-[#1e293b]">
         <button type="button" onClick={closeAnalysisModal} className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs">
           İptal
         </button>
         <button
           type="button"
           onClick={saveAnalysisModal}
           disabled={!analysisFormMeta.branch.trim() || !analysisFormMeta.analysisDate}
           className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
         >
           <CheckCircle className="w-3.5 h-3.5" />
           {editingAnalysisId ? 'Güncelle' : 'Kaydet'}
         </button>
       </div>
     </div>
   </div>,
   document.body
 )}

 {editingTransactionId && (() => {
   const editingTxn = transactions.find((t) => t.id === editingTransactionId);
   const showSaleTotal = editingTxn ? isPackageSaleCategory(editingTxn.category) : false;
   return (
   <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setEditingTransactionId(null)}>
     <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
     <div className="relative w-full max-w-md bg-[#1e293b] border border-slate-700/60 rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
       <div className="p-5 border-b border-slate-700/60 flex items-center justify-between">
         <h3 className="text-lg font-bold text-white flex items-center gap-2"><Edit2 className="w-5 h-5 text-amber-500" /> Ödeme Düzenle</h3>
         <button type="button" onClick={() => setEditingTransactionId(null)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"><X className="w-5 h-5" /></button>
       </div>
       <div className="p-5 space-y-4">
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Açıklama / Paket adı</label>
           <input type="text" value={editTxnDescription} onChange={(e) => setEditTxnDescription(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium" placeholder="Örn: 6 Aylık Yaz Kampı" />
         </div>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tarih</label>
           <input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={editTxnDate} onChange={(e) => setEditTxnDate(normalizeDateInputYear(e.target.value))} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium [color-scheme:dark]" />
         </div>
         {showSaleTotal ? (
           <div>
             <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Toplam Tutar (₺)</label>
             <input type="number" min="0" step="0.01" value={editTxnTotalAmount} onChange={(e) => setEditTxnTotalAmount(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium" placeholder="0.00" />
           </div>
         ) : null}
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{showSaleTotal ? 'Alınan Tutar (₺)' : 'Tutar (₺)'}</label>
           <input type="number" min="0" step="0.01" value={editTxnAmount} onChange={(e) => setEditTxnAmount(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium" />
         </div>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Ödeme tipi</label>
           <select value={editTxnPaymentType} onChange={(e) => setEditTxnPaymentType(e.target.value as 'Nakit' | 'Havale/EFT' | 'Kredi Kartı')} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium">
             <option value="Nakit">Nakit</option><option value="Havale/EFT">Havale/EFT</option><option value="Kredi Kartı">Kredi Kartı</option>
           </select>
         </div>
         <div>
           <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tahsil eden</label>
           <input type="text" value={editTxnProcessedBy} onChange={(e) => setEditTxnProcessedBy(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium" placeholder="Ad soyad" />
         </div>
         <div className="flex gap-3 pt-2">
           <button type="button" onClick={() => setEditingTransactionId(null)} className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 font-bold text-sm">İptal</button>
           <button
             type="button"
             onClick={() => {
               const amount = Number(editTxnAmount?.replace(/\s/g, '').replace(',', '.'));
               if (Number.isNaN(amount) || amount < 0) return;
               const totalRaw = editTxnTotalAmount.trim() ? Number(editTxnTotalAmount.replace(/\s/g, '').replace(',', '.')) : NaN;
               const totalAmount = showSaleTotal && !Number.isNaN(totalRaw) && totalRaw > 0 ? totalRaw : undefined;
               updateTransaction(editingTransactionId, {
                 description: editTxnDescription.trim() || undefined,
                 date: editTxnDate ? normalizeDateInputYear(editTxnDate) : undefined,
                 amount,
                 totalAmount: showSaleTotal ? totalAmount : undefined,
                 paymentType: editTxnPaymentType,
                 processedBy: editTxnProcessedBy.trim() || undefined,
               });
               setEditingTransactionId(null);
             }}
             className="flex-1 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm"
           >
             Kaydet
           </button>
         </div>
       </div>
     </div>
   </div>
   );
 })()}

 </div>
 );
};

const selectCls = 'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm focus:ring-2 focus:ring-indigo-500/40 outline-none';

const EditStudentModal: React.FC<{
  student: Student;
  onSave: (updated: Partial<Student>) => void | Promise<void>;
  onClose: () => void;
}> = ({ student, onSave, onClose }) => {
  const { groups, branchOffices, disciplines, trainingGroups, disciplineBranches } = useApp();
  // Use a single state object for all fields, initialized with student data
  const [fields, setFields] = useState<Partial<Student>>({ ...student });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(student.photoUrl || null);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const groupOptions = useMemo(() => {
    const set = new Set([...groups, fields.group || ''].filter(Boolean));
    return Array.from(set).sort();
  }, [groups, fields.group]);

  const branchOptions = useMemo(() => {
    const set = new Set([...disciplines, fields.branch || ''].filter(Boolean));
    return Array.from(set).sort();
  }, [disciplines, fields.branch]);

  const branchOfficeOptions = useMemo(() => {
    const set = new Set([...branchOffices, fields.branchOffice || ''].filter(Boolean));
    return Array.from(set).sort();
  }, [branchOffices, fields.branchOffice]);

  const financeBaseFee = useMemo(() => {
    return getBaseMonthlyFeeForStudent({ ...student, ...fields } as Student, trainingGroups, disciplineBranches);
  }, [student, fields, trainingGroups, disciplineBranches]);

  const financePreview = useMemo(() => {
    const previewStudent = { ...student, ...fields } as Student;
    if (previewStudent.isScholarshipStudent) {
      return { isScholarship: true as const, baseFee: financeBaseFee, netFee: 0, discountAmount: financeBaseFee };
    }
    const { finalFee, discountAmount } = applySiblingDiscount(financeBaseFee, previewStudent);
    return { isScholarship: false as const, baseFee: financeBaseFee, netFee: finalFee, discountAmount };
  }, [student, fields, financeBaseFee]);

  const handlePickPhoto = (file: File) => {
    setPhoto(file);
    if (photoPreview && photoPreview !== student.photoUrl) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleFullSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setToast(null);
    try {
      let finalPhotoUrl = fields.photoUrl;
      if (photo) {
        const sb = getServiceSupabase();
        if (sb) {
          const fileExt = photo.name.split('.').pop();
          const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
          const filePath = `${fileName}`;
          const { error } = await sb.storage.from('student-photos').upload(filePath, photo);
          if (!error) {
            const { data } = sb.storage.from('student-photos').getPublicUrl(filePath);
            finalPhotoUrl = data.publicUrl;
          }
        }
      }
      await onSave({ ...fields, photoUrl: finalPhotoUrl });
      setToast({ type: 'success', message: 'Değişiklikler başarıyla kaydedildi!' });
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      console.error(err);
      setToast({ type: 'error', message: 'Kaydederken bir hata oluştu. Lütfen tekrar deneyin.' });
    } finally {
      setIsSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all';
  const labelCls = 'block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#1e293b] border border-slate-700/60 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-700/60 bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30 text-indigo-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-black text-white">Öğrenci Düzenle</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest">{student.name}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Photos & Primary */}
            <div className="lg:col-span-4 space-y-6">
              <div className="space-y-3">
                <label className={labelCls}>Öğrenci Fotoğrafı</label>
                <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-800 border-2 border-dashed border-slate-700 group cursor-pointer hover:border-indigo-500/50 transition-colors">
                  {photoPreview ? (
                    <>
                      <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="w-8 h-8 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
                      <Camera className="w-10 h-10" />
                      <span className="text-[10px] font-bold">FOTOĞRAF YÜKLE</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePickPhoto(file);
                  }} />
                </div>
                {photoPreview && (
                  <button type="button" onClick={() => { setPhoto(null); setPhotoPreview(null); setFields(f => ({ ...f, photoUrl: undefined })); }} className="w-full py-2 text-rose-400 text-[10px] font-bold uppercase hover:text-rose-300 transition-colors">Fotoğrafı Kaldır</button>
                )}
              </div>

              <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 space-y-4">
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-indigo-500/10 pb-2">Kayıt Türü</div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setFields(f => ({ ...f, registrationType: 'monthly' }))} className={`py-2 rounded-lg text-xs font-bold transition-all ${fields.registrationType === 'monthly' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Aylık</button>
                  <button type="button" onClick={() => setFields(f => ({ ...f, registrationType: 'package' }))} className={`py-2 rounded-lg text-xs font-bold transition-all ${fields.registrationType === 'package' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Paket</button>
                </div>
              </div>
            </div>

            {/* Right: All Fields */}
            <div className="lg:col-span-8 space-y-8">
              {/* Section 1: Personal */}
              <div className="space-y-4">
                <div className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Temel Bilgiler
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Ad Soyad</label>
                    <input type="text" value={fields.name || ''} onChange={e => setFields(f => ({ ...f, name: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Kullanıcı Adı</label>
                    <input type="text" value={fields.username || ''} onChange={e => setFields(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))} placeholder="kullanici_adi" className={inputCls} />
                    <div className="text-[9px] text-slate-500 mt-1">Giriş için kullanılacak</div>
                  </div>
                  <div>
                    <label className={labelCls}>Giriş Şifresi</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} value={fields.password || ''} onChange={e => setFields(f => ({ ...f, password: e.target.value }))} placeholder="••••••" className={inputCls + ' pr-10'} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="text-[9px] text-slate-500 mt-1">Öğrenci girişinde kullanılacak</div>
                  </div>
                  <div>
                    <label className={labelCls}>TC Kimlik</label>
                    <input type="text" value={fields.tcNo || ''} onChange={e => setFields(f => ({ ...f, tcNo: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Doğum Tarihi</label>
                    <input type="date" value={fields.birthDate || ''} onChange={e => setFields(f => ({ ...f, birthDate: e.target.value }))} className={inputCls + ' [color-scheme:dark]'} />
                  </div>
                  <div>
                    <label className={labelCls}>Kayıt Tarihi</label>
                    <input type="date" value={fields.registrationDate || ''} onChange={e => setFields(f => ({ ...f, registrationDate: e.target.value }))} className={inputCls + ' [color-scheme:dark]'} />
                  </div>
                </div>
              </div>

              {/* Section 2: Education */}
              <div className="space-y-4">
                <div className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Eğitim & Branş
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Şube</label>
                    <select value={fields.branchOffice || ''} onChange={e => setFields(f => ({ ...f, branchOffice: e.target.value }))} className={inputCls}>
                      <option value="">Seçiniz</option>
                      {branchOffices.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Branş</label>
                    <select value={fields.branch || ''} onChange={e => setFields(f => ({ ...f, branch: e.target.value }))} className={inputCls}>
                      <option value="">Seçiniz</option>
                      {disciplines.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Grup</label>
                    <select
                      value={fields.group || ''}
                      onChange={e => {
                        const groupName = e.target.value;
                        const tg = findTrainingGroupByName(trainingGroups, groupName);
                        if (tg) {
                          const defaults = applyGroupDefaultsToStudent(tg, disciplineBranches);
                          setFields(f => ({
                            ...f,
                            group: groupName,
                            trainingGroupId: defaults.trainingGroupId,
                            branch: defaults.branch || f.branch,
                            branchOffice: defaults.branchOffice || f.branchOffice,
                            monthlyFee: defaults.monthlyFee ?? f.monthlyFee,
                            lessonSchedule: defaults.lessonSchedule,
                          }));
                        } else {
                          setFields(f => ({ ...f, group: groupName }));
                        }
                      }}
                      className={inputCls}
                    >
                      <option value="">Seçiniz</option>
                      {groups.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  {fields.lessonSchedule?.length ? (
                    <div className="md:col-span-2">
                      <label className={labelCls}>Ders programı</label>
                      <div className="px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs">
                        {formatLessonSchedule(fields.lessonSchedule)}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <label className={labelCls}>Seviye</label>
                    <select value={fields.level || 'Başlangıç'} onChange={e => setFields(f => ({ ...f, level: e.target.value as any }))} className={inputCls}>
                      <option value="Başlangıç">Başlangıç</option>
                      <option value="Orta">Orta</option>
                      <option value="İleri">İleri</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3: Parent Info */}
              <div className="space-y-4">
                <div className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Veli Bilgileri
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Baba Adı</label>
                    <input type="text" value={fields.fatherName || ''} onChange={e => setFields(f => ({ ...f, fatherName: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Baba Telefon</label>
                    <input type="text" value={fields.fatherPhone || ''} onChange={e => setFields(f => ({ ...f, fatherPhone: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Anne Adı</label>
                    <input type="text" value={fields.motherName || ''} onChange={e => setFields(f => ({ ...f, motherName: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Anne Telefon</label>
                    <input type="text" value={fields.motherPhone || ''} onChange={e => setFields(f => ({ ...f, motherPhone: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Veli giriş telefonu</label>
                    <input type="text" value={fields.parentPhone || ''} onChange={e => setFields(f => ({ ...f, parentPhone: e.target.value }))} placeholder="5XX XXX XX XX" className={inputCls} />
                    <div className="text-[9px] text-slate-500 mt-1">Veli paneli girişinde kullanılır</div>
                  </div>
                  <div>
                    <label className={labelCls}>Veli PIN / Şifre</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} value={fields.parentPin || ''} onChange={e => setFields(f => ({ ...f, parentPin: e.target.value }))} placeholder="Opsiyonel" className={inputCls + ' pr-10'} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="text-[9px] text-slate-500 mt-1">Boş bırakılırsa telefon son 4 hane ile giriş yapılabilir</div>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Adres</label>
                  <textarea value={fields.address || ''} onChange={e => setFields(f => ({ ...f, address: e.target.value }))} rows={2} className={inputCls + ' resize-none'} />
                </div>
              </div>

              {/* Section 4: Finance (if monthly) */}
              {fields.registrationType === 'monthly' && (
                <div className="space-y-4">
                  <div className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Aidat Ayarları
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className={labelCls}>Aylık Aidat (₺)</label>
                      {fields.isScholarshipStudent ? (
                        <div className={`${inputCls} flex items-center justify-center font-black text-emerald-400 bg-emerald-500/10 border-emerald-500/30`}>
                          Burslu
                        </div>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          value={fields.monthlyFee ?? ''}
                          onChange={e => setFields(f => ({ ...f, monthlyFee: e.target.value === '' ? undefined : Number(e.target.value) }))}
                          className={inputCls}
                        />
                      )}
                      <div className="text-[9px] text-slate-500 mt-1">
                        {fields.isScholarshipStudent
                          ? 'Burslu öğrencide aidat tahsil edilmez'
                          : financePreview.discountAmount > 0
                            ? `Net aidat: ₺${Number(financePreview.netFee).toLocaleString('tr-TR')}`
                            : 'Grup/branş ücreti veya özel tutar'}
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Hatırlatma Günü</label>
                      <select value={fields.paymentReminderDay || '1. Gün'} onChange={e => setFields(f => ({ ...f, paymentReminderDay: e.target.value }))} className={inputCls} disabled={!!fields.isScholarshipStudent}>
                        {REMINDER_DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Gecikme Hatırlatması</label>
                      <select value={fields.latePaymentReminderDay || '1. Gün'} onChange={e => setFields(f => ({ ...f, latePaymentReminderDay: e.target.value }))} className={inputCls} disabled={!!fields.isScholarshipStudent}>
                        {REMINDER_DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <label className={`flex items-center gap-2 ${fields.isScholarshipStudent ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={!!fields.hasSiblingDiscount}
                        disabled={!!fields.isScholarshipStudent}
                        onChange={e => setFields(f => ({
                          ...f,
                          hasSiblingDiscount: e.target.checked,
                          siblingDiscountType: e.target.checked ? (f.siblingDiscountType ?? 'percent') : undefined,
                        }))}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500/20"
                      />
                      <span className="text-xs font-bold text-slate-300">Kardeş İndirimi</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!fields.isScholarshipStudent}
                        onChange={e => setFields(f => ({
                          ...f,
                          isScholarshipStudent: e.target.checked,
                          hasSiblingDiscount: e.target.checked ? false : f.hasSiblingDiscount,
                        }))}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500/20"
                      />
                      <span className="text-xs font-bold text-slate-300">Burslu Öğrenci</span>
                    </label>
                  </div>

                  {fields.hasSiblingDiscount && !fields.isScholarshipStudent ? (
                    <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/15 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setFields(f => ({ ...f, siblingDiscountType: 'percent' }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${(fields.siblingDiscountType ?? 'percent') === 'percent' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                        >
                          % İndirim
                        </button>
                        <button
                          type="button"
                          onClick={() => setFields(f => ({ ...f, siblingDiscountType: 'amount' }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${fields.siblingDiscountType === 'amount' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                        >
                          Tutar İndirim (₺)
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(fields.siblingDiscountType ?? 'percent') === 'percent' ? (
                          <div>
                            <label className={labelCls}>İndirim Oranı (%)</label>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={fields.siblingDiscountPercent ?? ''}
                              onChange={e => setFields(f => ({ ...f, siblingDiscountPercent: e.target.value === '' ? undefined : Number(e.target.value) }))}
                              className={inputCls}
                            />
                          </div>
                        ) : (
                          <div>
                            <label className={labelCls}>İndirim Tutarı (₺)</label>
                            <input
                              type="number"
                              min={1}
                              value={fields.siblingDiscountAmount ?? ''}
                              onChange={e => setFields(f => ({ ...f, siblingDiscountAmount: e.target.value === '' ? undefined : Number(e.target.value) }))}
                              className={inputCls}
                            />
                          </div>
                        )}
                        <div>
                          <label className={labelCls}>Net Aidat (önizleme)</label>
                          <div className={`${inputCls} flex items-center justify-between bg-emerald-500/10 border-emerald-500/20`}>
                            <span className="text-slate-400 text-xs line-through">₺{Number(financePreview.baseFee).toLocaleString('tr-TR')}</span>
                            <span className="text-emerald-400 font-black">₺{Number(financePreview.netFee).toLocaleString('tr-TR')}</span>
                          </div>
                          {financePreview.discountAmount > 0 ? (
                            <div className="text-[9px] text-emerald-400 mt-1 font-bold">
                              ₺{Number(financePreview.discountAmount).toLocaleString('tr-TR')} indirim uygulanır
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Section 5: Platforms & UKD/FIDE */}
              <div className="space-y-4">
                <div className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500" /> Platformlar
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Lichess Kullanıcı Adı</label>
                    <input type="text" value={fields.lichessUsername || ''} onChange={e => setFields(f => ({ ...f, lichessUsername: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Chess.com Kullanıcı Adı</label>
                    <input type="text" value={fields.chessComUsername || ''} onChange={e => setFields(f => ({ ...f, chessComUsername: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>UKD (Puan)</label>
                    <input type="number" min={0} step={1} value={fields.ukd ?? ''} onChange={e => setFields(f => ({ ...f, ukd: e.target.value === '' ? undefined : Number(e.target.value) }))} placeholder="Örn: 1200" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>FIDE ID</label>
                    <input type="text" value={fields.fideId || ''} onChange={e => setFields(f => ({ ...f, fideId: e.target.value }))} placeholder="ratings.fide.com profil numarası" className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Section 6: Notes */}
              <div className="space-y-4">
                <div className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> Notlar & Sağlık
                </div>
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>Sağlık Bilgisi</label>
                    <textarea value={fields.healthInfo || ''} onChange={e => setFields(f => ({ ...f, healthInfo: e.target.value }))} rows={2} className={inputCls + ' resize-none'} />
                  </div>
                  <div>
                    <label className={labelCls}>Özel Notlar</label>
                    <textarea value={fields.notes || ''} onChange={e => setFields(f => ({ ...f, notes: e.target.value }))} rows={3} className={inputCls + ' resize-none'} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-slate-700/60 bg-slate-800/40 flex items-center justify-between gap-3">
          {/* Toast notification */}
          <div className="flex-1 min-w-0">
            {toast && (
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold animate-in fade-in slide-in-from-left-2 duration-300 ${
                toast.type === 'success'
                  ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/20 border border-rose-500/30 text-rose-400'
              }`}>
                {toast.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                {toast.message}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-lg border border-slate-700 text-slate-400 font-bold text-sm hover:bg-slate-700 transition-all">İptal</button>
            <button type="button" onClick={handleFullSave} disabled={isSaving} className="px-8 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 flex items-center gap-2">
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Değişiklikleri Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDetail;

