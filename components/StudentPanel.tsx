import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CalendarCheck,
  CalendarDays,
  CheckSquare,
  CreditCard,
  ExternalLink,
  Grid,
  Image as ImageIcon,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Play,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  Video,
  Wallet,
  X,
  CheckCircle2,
  ZoomIn,
  ChevronRight,
  BarChart3,
  ChevronDown,
  Clock,
  Zap,
  Target,
  Mail,
  Star,
  Gamepad2,
  Trophy,
  Copy,
  Camera,
  KeyRound,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { analyzeStudentHomework } from '../services/geminiService';
import { Student } from '../types';
import type { PerformanceAnalysis } from '../types';
import type { Puzzle, GalleryItem } from '../types';
import type { ScheduleEntryStatus } from '../types';
import { isHomeworkAssignedToStudent } from '../homeworkUtils';
import StudentPuzzlePlayModal from './StudentPuzzlePlayModal';
import StudentStudyView from './StudentStudyView';
import LiveLesson, { type LiveLessonRoom } from './LiveLesson';
import ScheduleWeeklyView from './ScheduleWeeklyView';
import { filterLessonsToActiveGroups, isTrainingGroupLessonId, trainingGroupIdFromLessonId } from '../lib/syncGroupLessons';
import { findTrainingGroupForStudent, hasCustomLessonSchedule, WEEKDAY_OPTIONS } from '../lib/trainingGroupUtils';
import { ClubLeaderboard } from './leaderboard/ClubLeaderboard';
import { LeaderboardPreview } from './leaderboard/LeaderboardPreview';
import { StudentSummaryDashboard } from './student/StudentSummaryDashboard';
import { StudentAttendanceHistory } from './student/StudentAttendanceHistory';
import { StudentHomeworkPanel } from './student/StudentHomeworkPanel';
import { StudentAnalysesPanel } from './student/StudentAnalysesPanel';
import { StudentPrivateLessonPanel } from './student/StudentPrivateLessonPanel';
import { StudentDuesCalendar } from './student/StudentDuesCalendar';
import { UkdFideRatingsPanel } from './student/UkdFideRatingsPanel';
import { LichessOAuthConnect } from './student/LichessOAuthConnect';
import LichessGameViewerModal from './LichessGameViewerModal';
import ChessComGameViewerModal from './ChessComGameViewerModal';
import StudentMessagesPanel from './StudentMessagesPanel';
import PlatformViewTabs, { type PlatformViewTab } from './PlatformViewTabs';
import Sidebar from './Sidebar';
import AccountDropdown, { type AccountDropdownItem } from './ui/AccountDropdown';
import { filterDuesTransactions } from '../lib/transactionUtils';
import { ResponsiveTable } from './ui/ResponsiveTable';
import { STUDENT_NAV_CATEGORIES } from '../constants';
import { clubDisplayForStudent } from '../lib/clubDisplay';
import { filterNavByPermissions } from '../lib/rolePermissions';
import { isServerMode } from '../apiConfig';
import { apiHomeworksForStudent, apiScheduleForStudent } from '../services/backendApi';
import { getServiceSupabase, isSupabaseBackend } from '../services/supabase';
import {
  fetchLichessUser,
  fetchLichessActivity,
  fetchLichessGamesPage,
  fetchChessComDailyPuzzleStats,
  fetchChessComPlayer,
  fetchChessComStats,
  fetchChessComMemberStats,
  reconcileChessComMemberStats,
  fetchChessComPuzzlesBundle,
  fetchChessComGamesForDay,
  fetchChessComGamesPage,
  lichessPerfLabel,
  chessComStatusLabel,
  type LichessUserProfile,
  type LichessActivity,
  type LichessGame,
  type ChessComPlayer,
  type ChessComStats,
  type ChessComMemberStats,
  type ChessComGame,
} from '../services/chessPlatformService';
import ChessComStatsSection from './ChessComStatsSection';
import ChessComGamesSection from './ChessComGamesSection';
import ChessComPuzzlesSection from './ChessComPuzzlesSection';
import LichessStatsSection from './LichessStatsSection';
import LichessPuzzlesSection from './LichessPuzzlesSection';
import LichessOpeningsSection from './LichessOpeningsSection';
import { fetchFidePlayer, federationLabel, resolveFideProfileForStudent, type FidePlayer } from '../services/fideService';
import { fetchUkdFromTsf } from '../services/ukdService';
import { fetchLichessDailyPuzzle } from '../services/lichessService';
import { fetchLichessOAuthProfile, fetchLichessOAuthStatus } from '../services/lichessOAuthClient';
import { formatMidnightCountdown, homeworkDayKey } from '../lib/homeworkDayUtils';
import {
  mergePlatformDayStats,
  platformSyncSummary,
  type PlatformDayStats,
} from '../lib/homeworkPlatformUtils';
import { homeworkWeekDaysUpToToday, syncStudentPlatformDays } from '../lib/platformStatsClientSync';
import { nextHomeworkPuzzle } from '../lib/puzzlePlayUtils';
import { attendanceRecordGroupName, attendanceRecordSessionScopeKey, attendanceRecordTime } from '../lib/attendanceSession';
import { buildPrivateLessonUsageById } from '../lib/privateLessonUsage';
import { requestTrainingNotifyCheck } from '../services/trainingNotifyClient';

const PLATFORM_AUTO_POLL_MS = 10 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function initials(name: string) {
  return name.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

function formatPhone(digits?: string) {
  if (!digits) return 'Belirtilmemiş';
  let v = digits.replace(/\D/g, '');
  if (v.startsWith('90') && v.length >= 12) v = v.slice(2);
  if (v.startsWith('0') && v.length === 11) v = v.slice(1);
  v = v.slice(0, 10);
  if (v.length < 10) return digits;
  return `0${v.slice(0, 3)} ${v.slice(3, 6)} ${v.slice(6, 8)} ${v.slice(8, 10)}`;
}

function formatDateTR(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('tr-TR');
}

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

type PanelTab = 'summary' | 'leaderboard' | 'schedule' | 'puzzles' | 'study' | 'tournaments' | 'attendance' | 'profile' | 'live-lesson' | 'gallery' | 'payments' | 'dues' | 'analyses' | 'private-lesson' | 'ukd' | 'lichess' | 'chesscom' | 'messages';

const STUDENT_PANEL_REFRESH_TABS = new Set<PanelTab>(['summary', 'schedule', 'payments', 'dues', 'attendance', 'profile', 'analyses', 'private-lesson']);

/** Veli panelinde sidebar'dan gizlenecek öğrenci eğitim sekmeleri (izin verilse bile) */
const PARENT_HIDDEN_TAB_IDS = new Set<PanelTab>([
  'live-lesson',
  'study',
  'tournaments',
  'ukd',
  'lichess',
  'chesscom',
]);

const PANEL_TAB_TO_SLUG: Record<PanelTab, string> = {
  summary: 'ozet',
  leaderboard: 'lider-tablosu',
  schedule: 'program',
  puzzles: 'bulmaca',
  study: 'calisma',
  tournaments: 'turnuvalar',
  attendance: 'yoklama',
  profile: 'profil',
  'live-lesson': 'canli-ders',
  gallery: 'galeri',
  payments: 'odemeler',
  dues: 'aidat',
  analyses: 'analizler',
  'private-lesson': 'ozel-ders',
  ukd: 'ukd',
  lichess: 'lichess',
  chesscom: 'chesscom',
  messages: 'mesajlar',
};
const PANEL_SLUG_TO_TAB: Record<string, PanelTab> = Object.fromEntries(
  Object.entries(PANEL_TAB_TO_SLUG).map(([tab, slug]) => [slug, tab as PanelTab])
);

function parsePanelHash(): { tab: PanelTab; liveRoomId: string | null } {
  const full = window.location.hash.replace(/^#\/?/, '');
  const q = full.indexOf('?');
  const pathPart = q >= 0 ? full.slice(0, q) : full;
  const slug = pathPart.split('/')[0] || '';
  const tab = (PANEL_SLUG_TO_TAB[slug] ?? 'summary') as PanelTab;
  let liveRoomId: string | null = null;
  if (q >= 0) {
    const params = new URLSearchParams(full.slice(q + 1));
    const r = params.get('room');
    if (r && r.trim()) liveRoomId = r.trim();
  }
  return { tab, liveRoomId };
}

function writePanelHash(tab: PanelTab, opts?: { liveRoomId?: string | null }) {
  const slug = PANEL_TAB_TO_SLUG[tab];
  const next =
    tab === 'live-lesson' && opts?.liveRoomId
      ? `#/${slug}?room=${encodeURIComponent(opts.liveRoomId)}`
      : `#/${slug}`;
  if (window.location.hash !== next) window.location.hash = next;
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
const LICHESS_PAGE_SIZE = 20;
const CHESSCOM_PAGE_SIZE = 20;

const DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + start.getDay() + 1) / 7);
}
function getDatesForWeek(week: number, year: number): Date[] {
  const jan1 = new Date(year, 0, 1);
  const day = jan1.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() + diff + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(firstMonday);
    d.setDate(firstMonday.getDate() + i);
    return d;
  });
}
function formatDayNum(d: Date) {
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}
const SCHEDULE_STATUS: { status: ScheduleEntryStatus; label: string; bg: string }[] = [
  { status: 'yapildi', label: 'Yapıldı', bg: 'bg-emerald-500' },
  { status: 'yapilmadi', label: 'Yapılmadı', bg: 'bg-rose-500' },
  { status: 'deneme', label: 'Deneme', bg: 'bg-amber-500' },
  { status: 'iptal', label: 'İptal', bg: 'bg-slate-500' },
  { status: 'konu_calismasi', label: 'Konu Çalışması', bg: 'bg-violet-500' },
  { status: 'tatil', label: 'Tatil', bg: 'bg-sky-500' },
  { status: 'mola', label: 'Mola', bg: 'bg-violet-400' },
  { status: 'zayif', label: 'Zayıf', bg: 'bg-pink-500' },
  { status: 'ai_analiz', label: 'AI Analiz', bg: 'bg-indigo-500' },
];

interface StudentPanelProps {
  studentId: string;
  onLogout: () => void;
  /** 'parent' = veli girişi, 'student' = öğrenci girişi — başlık ve metin buna göre değişir */
  viewAs?: 'parent' | 'student';
}

const StudentPanel: React.FC<StudentPanelProps> = ({ studentId, onLogout, viewAs = 'parent' }) => {
  const { students, attendanceRecords, transactions, scheduleEntries, lessons, homeworks, puzzles, gallery, tournaments, logout, updateStudent, addActivityLog, addHomeworkAttempt, homeworkSubmissions, addHomeworkSubmission, refreshFromStorage, apiStudent, updateScheduleEntry, performanceAnalyses, coachAiReports, homeworkAttempts, initialDataLoaded, authPermissions, rolesLoaded, trainingGroups, scopedDisciplineBranches, clubs } = useApp();
  const initialPanel = typeof window !== 'undefined' ? parsePanelHash() : { tab: 'summary' as PanelTab, liveRoomId: null as string | null };
  const [activeTab, setActiveTabState] = useState<PanelTab>(initialPanel.tab);
  const [joinedRoomId, setJoinedRoomId] = useState<string | null>(() =>
    initialPanel.tab === 'live-lesson' && initialPanel.liveRoomId ? initialPanel.liveRoomId : null
  );
  const setActiveTab = useCallback((id: PanelTab) => {
    setActiveTabState(id);
    if (id !== 'live-lesson') {
      setJoinedRoomId(null);
      writePanelHash(id);
    } else {
      setJoinedRoomId(null);
      writePanelHash('live-lesson');
    }
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarDesktopExpanded, setSidebarDesktopExpanded] = useState(true);
  const sidebarIconOnlyDefault = activeTab === 'live-lesson';
  const [showLoginInfoModal, setShowLoginInfoModal] = useState(false);
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const todayDate = new Date();
  const [scheduleWeek, setScheduleWeek] = useState(() => getWeekNumber(todayDate));
  const [scheduleYear, setScheduleYear] = useState(todayDate.getFullYear());
  const [playingPuzzle, setPlayingPuzzle] = useState<{
    puzzle: Puzzle;
    homeworkId: string;
    openKey: string;
    nextPuzzle?: Puzzle | null;
  } | null>(null);
  const [selectedScheduleEntryId, setSelectedScheduleEntryId] = useState<string | null>(null);
  const [scheduleEntryModalStatus, setScheduleEntryModalStatus] = useState<ScheduleEntryStatus>('yapilmadi');
  const [scheduleEntryModalNote, setScheduleEntryModalNote] = useState('');
  const [zoomedGalleryItem, setZoomedGalleryItem] = useState<GalleryItem | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [liveLessonRooms, setLiveLessonRooms] = useState<LiveLessonRoom[]>([]);
  const [lichessProfile, setLichessProfile] = useState<LichessUserProfile | null>(null);
  const [lichessActivities, setLichessActivities] = useState<LichessActivity[]>([]);
  const [lichessGames, setLichessGames] = useState<LichessGame[]>([]);
  const [chessComProfile, setChessComProfile] = useState<ChessComPlayer | null>(null);
  const [chessComStats, setChessComStats] = useState<ChessComStats | null>(null);
  const [chessComMemberStats, setChessComMemberStats] = useState<ChessComMemberStats | null>(null);
  const [chessComGames, setChessComGames] = useState<ChessComGame[]>([]);
  const [loadingLichess, setLoadingLichess] = useState(false);
  const [loadingLichessGames, setLoadingLichessGames] = useState(false);
  const [lichessGamesProgress, setLichessGamesProgress] = useState(0);
  const [lichessNextUntil, setLichessNextUntil] = useState<number | null>(null);
  const [lichessHasMore, setLichessHasMore] = useState(false);
  const [lichessViewerGame, setLichessViewerGame] = useState<LichessGame | null>(null);
  const lichessNextUntilRef = useRef<number | null>(null);
  const lichessHasMoreRef = useRef(false);
  const [loadingChessCom, setLoadingChessCom] = useState(false);
  const [loadingChessComGames, setLoadingChessComGames] = useState(false);
  const [chessComGamesProgress, setChessComGamesProgress] = useState(0);
  const [chessComNextBeforeEndTime, setChessComNextBeforeEndTime] = useState<number | null>(null);
  const [chessComHasMore, setChessComHasMore] = useState(false);
  const [chessComViewerGame, setChessComViewerGame] = useState<ChessComGame | null>(null);
  const [lichessPlatformTab, setLichessPlatformTab] = useState<PlatformViewTab>('stats');
  const [chessComPlatformTab, setChessComPlatformTab] = useState<PlatformViewTab>('stats');
  const [chessComPuzzlesCount, setChessComPuzzlesCount] = useState(0);
  const chessComNextBeforeEndTimeRef = useRef<number | null>(null);
  const chessComHasMoreRef = useRef(false);
  const [fideProfile, setFideProfile] = useState<FidePlayer | null>(null);
  const [resolvedFideId, setResolvedFideId] = useState<string | null>(null);
  const [loadingFide, setLoadingFide] = useState(false);
  const [tsfUkdLive, setTsfUkdLive] = useState<number | null>(null);
  const [loadingTsfUkd, setLoadingTsfUkd] = useState(false);
  const [tsfUkdError, setTsfUkdError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const lichessLastLoadRef = useRef<{ username: string; at: number } | null>(null);
  const [lichessResolvedUsername, setLichessResolvedUsername] = useState('');
  const [todayExternalGameCount, setTodayExternalGameCount] = useState(0);
  const [todayExternalPuzzleCount, setTodayExternalPuzzleCount] = useState(0);
  const [todayExternalPuzzlePassed, setTodayExternalPuzzlePassed] = useState(0);
  const [weekPlatformStatsByDate, setWeekPlatformStatsByDate] = useState<Record<string, PlatformDayStats>>({});
  const weekPlatformStatsRef = useRef<Record<string, PlatformDayStats>>({});
  const [loadingExternalGameCount, setLoadingExternalGameCount] = useState(false);
  const [externalStatsNote, setExternalStatsNote] = useState<string | null>(null);
  const [platformStatsFetched, setPlatformStatsFetched] = useState(false);
  const platformPollEnabledRef = useRef(false);
  const platformInitialSyncDoneRef = useRef(false);
  const [midnightCountdown, setMidnightCountdown] = useState(() => formatMidnightCountdown());
  const [homeworkDayKeyState, setHomeworkDayKeyState] = useState(() => homeworkDayKey());

  useEffect(() => {
    const tick = () => {
      setMidnightCountdown(formatMidnightCountdown());
      setHomeworkDayKeyState(homeworkDayKey());
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const student = useMemo<Student | null>(() => {
    const fromList = students.find((s) => s.id === studentId) ?? null;
    if (fromList) return fromList;
    if (isServerMode() && apiStudent?.id === studentId) return apiStudent;
    return null;
  }, [students, studentId, apiStudent]);

  const studentClubDisplay = useMemo(
    () => clubDisplayForStudent(student, clubs),
    [student, clubs],
  );

  const studentWeeklyLessons = useMemo(() => {
    if (!student) return [];

    const privateLessons = lessons.filter((l) => String(l.studentId ?? '') === String(student.id));
    const trainingGroup = findTrainingGroupForStudent(student, trainingGroups);
    const useCustomSchedule = hasCustomLessonSchedule(student, trainingGroups);

    if (useCustomSchedule && student.lessonSchedule?.length) {
      const customLessons = student.lessonSchedule.map((slot, idx) => ({
        id: `custom-slot-${student.id}-${idx}`,
        day:
          slot.dayLabel?.trim() ||
          WEEKDAY_OPTIONS.find((d) => d.value === slot.dayOfWeek)?.label ||
          'Pazartesi',
        startTime: slot.startTime || '13:00',
        endTime: slot.endTime || '18:30',
        group: student.group || '',
        topic: student.group || 'Ders',
      }));
      return [...customLessons, ...privateLessons];
    }

    const groupLessons = filterLessonsToActiveGroups(lessons, trainingGroups).filter((l) => {
      if (l.studentId) return false;
      if (trainingGroup && isTrainingGroupLessonId(l.id)) {
        return trainingGroupIdFromLessonId(l.id) === trainingGroup.id;
      }
      return (l.group || '').trim().toLowerCase() === (student.group || '').trim().toLowerCase();
    });

    return [...groupLessons, ...privateLessons];
  }, [student, lessons, trainingGroups]);

  const refreshTodayExternalStats = useCallback(async (opts?: { todayOnly?: boolean }) => {
    if (!student) {
      setTodayExternalGameCount(0);
      setTodayExternalPuzzleCount(0);
      setTodayExternalPuzzlePassed(0);
      setWeekPlatformStatsByDate({});
      weekPlatformStatsRef.current = {};
      setExternalStatsNote(null);
      return;
    }
    const lichessUsername = student.lichessUsername?.trim();
    const chessComUsername = student.chessComUsername?.trim();
    if (!lichessUsername && !chessComUsername) {
      setTodayExternalGameCount(0);
      setTodayExternalPuzzleCount(0);
      setTodayExternalPuzzlePassed(0);
      setWeekPlatformStatsByDate({});
      weekPlatformStatsRef.current = {};
      setExternalStatsNote('Lichess veya Chess.com kullanıcı adı profilde tanımlı değil.');
      setPlatformStatsFetched(true);
      return;
    }
    setLoadingExternalGameCount(true);
    platformPollEnabledRef.current = true;
    const todayKey = homeworkDayKey();
    const weekDays = homeworkWeekDaysUpToToday(todayKey);
    const todayOnly = opts?.todayOnly === true || platformInitialSyncDoneRef.current;
    const apiDays = todayOnly ? [todayKey] : weekDays;
    platformInitialSyncDoneRef.current = true;
    try {
      const nextWeek = await withTimeout(
        syncStudentPlatformDays(student, weekDays, apiDays),
        55_000,
        { ...weekPlatformStatsRef.current },
      );
      weekPlatformStatsRef.current = nextWeek;
      setWeekPlatformStatsByDate(nextWeek);
      const stats = nextWeek[todayKey] ?? mergePlatformDayStats(undefined, {
        games: 0,
        puzzleSolved: 0,
        puzzlePassed: 0,
        puzzleFailed: 0,
        lichessGames: 0,
        lichessPuzzles: 0,
        lichessPuzzlePassed: 0,
        lichessPuzzleFailed: 0,
        chessComGames: 0,
        chessComPuzzles: 0,
        chessComPuzzlePassed: 0,
        chessComPuzzleFailed: 0,
      });
      setTodayExternalGameCount(stats.games);
      setTodayExternalPuzzleCount(stats.puzzleSolved);
      setTodayExternalPuzzlePassed(stats.puzzlePassed);
      const syncNote = platformSyncSummary(stats, student);
      if (stats.lichessError && student.lichessUsername) {
        setExternalStatsNote('Lichess şu an erişilemiyor (ağ engeli veya zaman aşımı). Chess.com verisi kullanılıyor.');
      } else if (stats.games === 0 && stats.puzzleSolved === 0) {
        setExternalStatsNote(`Bugün (${todayKey}) platform aktivitesi bulunamadı.${syncNote ? ` ${syncNote}` : ''}`);
      } else {
        setExternalStatsNote(syncNote);
      }
    } catch {
      const kept = weekPlatformStatsRef.current[todayKey];
      if (kept) {
        setTodayExternalGameCount(kept.games);
        setTodayExternalPuzzleCount(kept.puzzleSolved);
        setTodayExternalPuzzlePassed(kept.puzzlePassed);
        setWeekPlatformStatsByDate({ ...weekPlatformStatsRef.current });
      }
      setExternalStatsNote('Platform verisi alınamadı; önceki kayıtlar korundu. Biraz sonra yeniden deneyin.');
    } finally {
      setLoadingExternalGameCount(false);
      setPlatformStatsFetched(true);
    }
  }, [student]);

  useEffect(() => {
    setPlatformStatsFetched(false);
    platformPollEnabledRef.current = false;
    platformInitialSyncDoneRef.current = false;
    weekPlatformStatsRef.current = {};
    setWeekPlatformStatsByDate({});
  }, [homeworkDayKeyState, student?.id]);

  const handleDailyGoalsComplete = useCallback((homeworkId: string) => {
    if (!student) return;
    const already = homeworkSubmissions.some((s) => s.studentId === student.id && s.homeworkId === homeworkId);
    if (already) return;
    addHomeworkSubmission({ studentId: student.id, homeworkId });
  }, [student, homeworkSubmissions, addHomeworkSubmission]);

  const studentAttendances = useMemo(() => {
    const sorted = attendanceRecords
      .filter((r) => r.studentId === studentId)
      .sort((a, b) => b.date.localeCompare(a.date));
    const deduped = new Map<string, typeof sorted[number]>();
    sorted.forEach((record) => {
      const key = `${String(record.date ?? '').slice(0, 10)}::${attendanceRecordSessionScopeKey(record, student?.group) || record.id}`;
      if (!deduped.has(key)) deduped.set(key, record);
    });
    return [...deduped.values()];
  }, [studentId, attendanceRecords, student?.group]);

  const visibleGallery = useMemo(() => {
    return gallery.filter((item) => !item.studentId || item.studentId === studentId);
  }, [gallery, studentId]);

  const studentTransactions = useMemo(() => {
    return transactions
      .filter((t) => t.studentId === studentId && t.type === 'income')
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [studentId, transactions]);

  const privateLessonTransactions = useMemo(() => {
    return studentTransactions.filter((t) => t.category === 'Özel Ders');
  }, [studentTransactions]);

  const privateLessonUsageById = useMemo(() => {
    return buildPrivateLessonUsageById(privateLessonTransactions, studentAttendances, studentId);
  }, [privateLessonTransactions, studentAttendances, studentId]);

  const studentPrivateLessonSummary = useMemo(() => {
    const latest = privateLessonTransactions[0];
    if (!latest) return null;
    const usage = privateLessonUsageById.get(latest.id);
    const totalLessons = usage?.totalLessons ?? latest.lessonCount;
    const usedLessons = usage?.usedLessons ?? Math.max(0, Number(latest.startingUsedLessons ?? 0));
    const remainingLessons =
      usage?.remainingLessons ??
      (totalLessons != null ? Math.max(0, totalLessons - usedLessons) : undefined);
    return {
      packageName: String(latest.lessonPackageName ?? latest.description ?? 'Özel Ders Paketi').trim() || 'Özel Ders Paketi',
      branchOffice: String(latest.lessonBranchOffice ?? '').trim(),
      discipline: String(latest.lessonDiscipline ?? '').trim(),
      totalLessons,
      usedLessons,
      remainingLessons,
      attendanceUsedLessons: usage?.attendanceUsedLessons ?? 0,
      startingUsedLessons: usage?.startingUsedLessons ?? 0,
      saleDate: String(latest.date ?? ''),
    };
  }, [privateLessonTransactions, privateLessonUsageById]);

  const derived = useMemo(() => {
    if (!student) return null;
    const registrationYear = student.registrationDate
      ? new Date(student.registrationDate).getFullYear()
      : new Date().getFullYear();
    const year = Number.isFinite(registrationYear) ? registrationYear : new Date().getFullYear();
    const totalAttendance = studentAttendances.length;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const last30 = studentAttendances.filter((r) => r.date >= thirtyDaysAgo && r.status === 'present').length;
    const expected30 = 8;
    const attendanceRate = expected30 > 0 ? `${Math.round((last30 / expected30) * 100)}%` : totalAttendance > 0 ? '100%' : '—';
    const isPackageRegistration = student.registrationType === 'package';
    const duesLabel =
      student.isScholarshipStudent
        ? 'Burslu'
        : isPackageRegistration
          ? 'Özel Ders Paketi'
        : student.paymentStatus === 'Paid'
          ? 'Ödendi'
          : student.paymentStatus === 'Partial'
            ? 'Kısmi'
            : 'Borç';
    const duesSubtitle =
      student.isScholarshipStudent
        ? 'Aidat Ödemesi Yok'
        : isPackageRegistration
          ? 'Ders kullanımına göre takip edilir'
        : undefined;
    return { year, totalAttendance, attendanceRate, duesLabel, duesSubtitle, isPackageRegistration };
  }, [student, studentAttendances, studentPrivateLessonSummary]);

  const paidMonthsSet = useMemo(() => {
    const set = new Set<string>();
    filterDuesTransactions(studentTransactions).forEach((t) => {
      if (t.date) {
        const d = t.date.slice(0, 7);
        if (d.length === 7) set.add(d);
      }
    });
    return set;
  }, [studentTransactions]);

  const calendarYear = new Date().getFullYear();
  const duesByMonth = useMemo(() => {
    const yearStr = String(calendarYear);
    const map: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) map[m] = 0;
    filterDuesTransactions(studentTransactions).forEach((t) => {
      const d = t.date ?? '';
      const y = d.length >= 4 ? d.slice(0, 4) : '';
      const monthStr = d.length >= 7 ? d.slice(5, 7) : '';
      const monthNum = monthStr ? parseInt(monthStr, 10) : 0;
      if (y === yearStr && monthNum >= 1 && monthNum <= 12) {
        map[monthNum] = (map[monthNum] || 0) + (t.amount || 0);
      }
    });
    return map;
  }, [calendarYear, studentTransactions]);

  /** Bu öğrenciye atanmış bulmaca ödevleri — sunucu modunda API'den, yoksa context + homeworkUtils */
  const [apiHomeworks, setApiHomeworks] = useState<typeof homeworks>([]);
  const [homeworksLoading, setHomeworksLoading] = useState(false);
  const assignedHomeworksFromContext = useMemo(() => {
    if (!student) return [];
    return homeworks.filter((hw) =>
      isHomeworkAssignedToStudent(hw, studentId, student.group)
    );
  }, [student, studentId, homeworks]);
  const assignedHomeworks = isServerMode() ? apiHomeworks : assignedHomeworksFromContext;

  const studentAnalyses = useMemo(() => {
    return performanceAnalyses.filter((a) => a.studentId === studentId).sort((a, b) => b.analysisDate.localeCompare(a.analysisDate));
  }, [performanceAnalyses, studentId]);

  const studentCoachAiReports = useMemo(() => {
    return coachAiReports
      .filter((r) => r.studentId === studentId)
      .filter((r) => (viewAs === 'parent' ? !!r.publishedToParent : !!r.publishedToStudent))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [coachAiReports, studentId, viewAs]);

  const studentHomeworksWithAttempts = useMemo(() => {
    return homeworks.filter((hw) => homeworkAttempts.some((a) => a.studentId === studentId && a.homeworkId === hw.id));
  }, [studentId, homeworks, homeworkAttempts]);

  const joinedTournaments = useMemo(() => {
    if (!student) return [];
    return tournaments
      .filter((t) => (t.participantIds ?? []).includes(studentId))
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }, [tournaments, student, studentId]);

  const selectedTournament = useMemo(
    () => joinedTournaments.find((t) => t.id === selectedTournamentId) ?? null,
    [joinedTournaments, selectedTournamentId]
  );

  const getTournamentStatus = useCallback((startAt: string, durationMinutes: number) => {
    const start = new Date(startAt).getTime();
    const end = start + Math.max(0, durationMinutes || 0) * 60000;
    const now = Date.now();
    if (!Number.isFinite(start)) return 'unknown' as const;
    if (now < start) return 'upcoming' as const;
    if (now < end) return 'ongoing' as const;
    return 'finished' as const;
  }, []);

  const selectedTournamentRanking = useMemo(() => {
    if (!selectedTournament) return [];
    const standings = selectedTournament.standings ?? {};
    return (selectedTournament.participantIds ?? [])
      .map((id) => ({
        id,
        points: standings[id]?.points ?? 0,
        wins: standings[id]?.wins ?? 0,
        played: standings[id]?.played ?? 0,
      }))
      .sort((a, b) => b.points - a.points || b.wins - a.wins || a.id.localeCompare(b.id));
  }, [selectedTournament]);

  const panelPermissions = authPermissions;

  const navCategoriesForView = useMemo(() => {
    const allowedForNav = viewAs === 'parent' && panelPermissions.has('dues') && !panelPermissions.has('payments')
      ? new Set([...panelPermissions, 'payments'])
      : panelPermissions;
    let filtered = filterNavByPermissions(STUDENT_NAV_CATEGORIES, allowedForNav);
    if (viewAs === 'student') {
      filtered = filtered
        .map((cat) => ({
          ...cat,
          items: cat.items.filter((i) => i.id !== 'payments' && i.id !== 'dues' && i.id !== 'private-lesson'),
        }))
        .filter((cat) => cat.items.length > 0);
    }
    if (viewAs === 'parent') {
      filtered = filtered
        .map((cat) => ({
          ...cat,
          items: cat.items
            .filter((i) => {
              if (PARENT_HIDDEN_TAB_IDS.has(i.id as PanelTab)) return false;
              if (i.id === 'dues') return false;
              if (cat.title === 'Eğitim' && i.id === 'analyses') return false;
              if (i.id === 'private-lesson' && !studentPrivateLessonSummary && privateLessonTransactions.length === 0) {
                return false;
              }
              return true;
            })
            .map((i) => {
              if (i.id === 'attendance') return { ...i, label: 'Yoklama' };
              if (i.id === 'payments') return { ...i, label: 'Aidat ve Ödemeler' };
              return i;
            }),
        }))
        .filter((cat) => cat.items.length > 0);
    }
    return filtered;
  }, [viewAs, panelPermissions, studentPrivateLessonSummary, privateLessonTransactions.length]);

  const lichessPracticePuzzles = useMemo(
    () => puzzles.filter((p) => p.source === 'lichess').slice(0, 24),
    [puzzles]
  );

  const [dailyLichessPuzzle, setDailyLichessPuzzle] = useState<Puzzle | null>(null);
  const [loadingDailyLichessPuzzle, setLoadingDailyLichessPuzzle] = useState(false);

  const lichessPuzzlesCount = (dailyLichessPuzzle ? 1 : 0) + lichessPracticePuzzles.length;

  const effectiveLichessUsername = (
    lichessResolvedUsername
    || student?.lichessUsername
    || lichessProfile?.username
    || ''
  ).trim();

  useEffect(() => {
    if (activeTab !== 'tournaments') return;
    if (joinedTournaments.length === 0) {
      setSelectedTournamentId(null);
      return;
    }
    if (!selectedTournamentId || !joinedTournaments.some((t) => t.id === selectedTournamentId)) {
      setSelectedTournamentId(joinedTournaments[0].id);
    }
  }, [activeTab, joinedTournaments, selectedTournamentId]);

  useEffect(() => {
    if (!isServerMode() && activeTab === 'puzzles') refreshFromStorage();
  }, [refreshFromStorage, activeTab, isServerMode]);

  useEffect(() => {
    if (!STUDENT_PANEL_REFRESH_TABS.has(activeTab)) return;
    refreshFromStorage();
  }, [activeTab, refreshFromStorage]);

  useEffect(() => {
    if (!window.location.hash.replace(/^#\/?/, '')) writePanelHash('summary');
    const onHash = () => {
      const p = parsePanelHash();
      setActiveTabState(p.tab);
      setJoinedRoomId(p.tab === 'live-lesson' ? p.liveRoomId : null);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!rolesLoaded) return;
    if (!panelPermissions.has(activeTab)) setActiveTab('summary');
  }, [viewAs, activeTab, panelPermissions, rolesLoaded, setActiveTab]);

  useEffect(() => {
    if (viewAs !== 'parent') return;
    if (activeTab === 'dues') setActiveTab('payments');
  }, [viewAs, activeTab, setActiveTab]);

  useEffect(() => {
    if (activeTab !== 'lichess') return;
    let cancelled = false;
    setLoadingDailyLichessPuzzle(true);
    const un = (lichessResolvedUsername || student?.lichessUsername || '').trim();
    Promise.all([
      fetchLichessDailyPuzzle(),
      un ? fetchLichessActivity(un).catch(() => [] as LichessActivity[]) : Promise.resolve([] as LichessActivity[]),
    ])
      .then(([daily, activity]) => {
        if (cancelled) return;
        setDailyLichessPuzzle(daily);
        setLichessActivities(activity ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setDailyLichessPuzzle(null);
          setLichessActivities([]);
        }
      })
      .finally(() => { if (!cancelled) setLoadingDailyLichessPuzzle(false); });
    return () => { cancelled = true; };
  }, [activeTab, student?.lichessUsername, lichessResolvedUsername]);

  useEffect(() => {
    lichessNextUntilRef.current = lichessNextUntil;
  }, [lichessNextUntil]);

  useEffect(() => {
    lichessHasMoreRef.current = lichessHasMore;
  }, [lichessHasMore]);

  useEffect(() => {
    chessComNextBeforeEndTimeRef.current = chessComNextBeforeEndTime;
  }, [chessComNextBeforeEndTime]);

  useEffect(() => {
    chessComHasMoreRef.current = chessComHasMore;
  }, [chessComHasMore]);

  const loadLichess = useCallback(async (force = false, append = false, options?: { includeGames?: boolean }) => {
    const includeGames = options?.includeGames !== false;
    const sid = student?.id?.trim() ?? '';
    let un = student?.lichessUsername?.trim() || '';

    if (sid) {
      try {
        const oauthStatus = await fetchLichessOAuthStatus(sid);
        if (oauthStatus.lichessUsername?.trim()) {
          un = oauthStatus.lichessUsername.trim();
        }
      } catch {
        /* OAuth durumu opsiyonel */
      }
    }

    if (!un && !sid) {
      setLichessResolvedUsername('');
      setLichessProfile(null);
      setLichessGames([]);
      setLichessGamesProgress(0);
      setLichessNextUntil(null);
      setLichessHasMore(false);
      return;
    }

    if (append && (!lichessHasMoreRef.current || lichessNextUntilRef.current == null)) return;
    const now = Date.now();
    if (!append && !force && un && lichessLastLoadRef.current && lichessLastLoadRef.current.username === un && now - lichessLastLoadRef.current.at < 30_000) {
      return;
    }
    if (!append) {
      if (un) lichessLastLoadRef.current = { username: un, at: now };
      setLoadingLichess(true);
      if (includeGames) {
        setLichessGames([]);
        setLichessGamesProgress(0);
        setLichessNextUntil(null);
        setLichessHasMore(false);
      }
      try {
        let profile: LichessUserProfile | null = null;
        if (sid) {
          profile = await fetchLichessOAuthProfile(sid);
          if (profile?.username?.trim()) {
            un = profile.username.trim();
          }
        }
        if (!profile && un) {
          profile = await fetchLichessUser(un);
        }
        setLichessProfile(profile ?? null);
        if (profile?.username?.trim()) {
          un = profile.username.trim();
        }
        setLichessResolvedUsername(un);
      } finally {
        setLoadingLichess(false);
      }
    }

    const gamesUsername = un || lichessProfile?.username?.trim() || '';
    if (!gamesUsername || !includeGames) return;

    setLoadingLichessGames(true);
    try {
      const page = await fetchLichessGamesPage(gamesUsername, {
        max: LICHESS_PAGE_SIZE,
        until: append ? lichessNextUntilRef.current ?? undefined : undefined,
      });
      setLichessGames((prev) => {
        const base = append ? prev : [];
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
  }, [student?.lichessUsername, student?.id, lichessProfile?.username]);

  const loadChessCom = useCallback(async (append = false, options?: { includeGames?: boolean }) => {
    const includeGames = options?.includeGames !== false;
    const un = student?.chessComUsername?.trim();
    if (!un) {
      setChessComProfile(null);
      setChessComStats(null);
      setChessComMemberStats(null);
      setChessComGames([]);
      setChessComGamesProgress(0);
      setChessComNextBeforeEndTime(null);
      setChessComHasMore(false);
      setChessComPuzzlesCount(0);
      return;
    }
    if (append && (!chessComHasMoreRef.current || chessComNextBeforeEndTimeRef.current == null)) return;
    if (!append) {
      setLoadingChessCom(true);
      if (includeGames) {
        setChessComGames([]);
        setChessComGamesProgress(0);
        setChessComNextBeforeEndTime(null);
        setChessComHasMore(false);
      }
      try {
        const [profile, stats, memberStats, puzzlesBundle] = await Promise.all([
          fetchChessComPlayer(un),
          fetchChessComStats(un),
          fetchChessComMemberStats(un),
          fetchChessComPuzzlesBundle(un),
        ]);
        setChessComProfile(profile ?? null);
        setChessComStats(stats ?? null);
        setChessComMemberStats(reconcileChessComMemberStats(memberStats, stats, profile));
        setChessComPuzzlesCount(
          (puzzlesBundle?.rated.length ?? 0) +
            (puzzlesBundle?.learning.length ?? 0) +
            (puzzlesBundle?.rush.length ?? 0),
        );
      } finally {
        setLoadingChessCom(false);
      }
    }
    if (!includeGames) return;
    setLoadingChessComGames(true);
    try {
      const page = await fetchChessComGamesPage(un, {
        max: CHESSCOM_PAGE_SIZE,
        beforeEndTime: append ? chessComNextBeforeEndTimeRef.current ?? undefined : undefined,
      });
      setChessComGames((prev) => {
        const base = append ? prev : [];
        const seen = new Set(base.map((g) => g.uuid || g.url || `${g.end_time}-${g.time_class}`));
        const merged = [...base];
        for (const g of page.games) {
          const key = g.uuid || g.url || `${g.end_time}-${g.time_class}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(g);
        }
        setChessComGamesProgress(merged.length);
        return merged;
      });
      setChessComNextBeforeEndTime(page.nextBeforeEndTime);
      setChessComHasMore(page.hasMore);
    } finally {
      setLoadingChessComGames(false);
    }
  }, [student?.chessComUsername]);

  useEffect(() => {
    if (!student?.id && !student?.lichessUsername) return;
    if (activeTab === 'lichess') loadLichess(false, false, { includeGames: true });
    else if (activeTab === 'analyses') loadLichess(false, false, { includeGames: true });
  }, [activeTab, student?.lichessUsername, student?.id, loadLichess]);

  useEffect(() => {
    if (!student?.chessComUsername) return;
    if (activeTab === 'chesscom') loadChessCom(false, { includeGames: true });
    else if (activeTab === 'analyses') loadChessCom(false, { includeGames: true });
  }, [activeTab, student?.chessComUsername, loadChessCom]);

  const loadFide = useCallback(async () => {
    if (!student) {
      setFideProfile(null);
      setResolvedFideId(null);
      return;
    }
    setLoadingFide(true);
    try {
      const { profile, resolvedId } = await resolveFideProfileForStudent(student);
      setFideProfile(profile ?? null);
      setResolvedFideId(resolvedId ?? student.fideId?.trim().replace(/\D/g, '') ?? null);
    } finally {
      setLoadingFide(false);
    }
  }, [student]);

  const loadTsfUkdSnapshot = useCallback(async () => {
    if (!student?.tcNo?.trim()) {
      setTsfUkdLive(null);
      setTsfUkdError(null);
      return;
    }
    setLoadingTsfUkd(true);
    try {
      const tc = student.tcNo.replace(/\D/g, '');
      const soyad = (student.name || '').trim().split(/\s+/).slice(-1)[0] || undefined;
      const res = await fetchUkdFromTsf({ tc, soyad });
      if (res && 'ok' in res && res.ok && res.ukd != null && res.ukd > 0) {
        setTsfUkdLive(res.ukd);
        setTsfUkdError(null);
      } else {
        setTsfUkdLive(null);
        setTsfUkdError(res && 'error' in res ? res.error : 'TSF sorgusu başarısız');
      }
    } catch {
      setTsfUkdLive(null);
      setTsfUkdError('TSF sorgusu yapılamadı');
    } finally {
      setLoadingTsfUkd(false);
    }
  }, [student?.tcNo, student?.name]);

  useEffect(() => {
    if (activeTab === 'ukd' && student) {
      void loadFide();
      void loadTsfUkdSnapshot();
    }
  }, [activeTab, student?.id, student?.fideId, student?.tcNo, loadFide, loadTsfUkdSnapshot]);

  useEffect(() => {
    if (isServerMode() && studentId && student?.group != null) {
      setHomeworksLoading(true);
      apiHomeworksForStudent(studentId, student.group)
        .then(setApiHomeworks)
        .catch(() => setApiHomeworks([]))
        .finally(() => setHomeworksLoading(false));
    }
  }, [isServerMode(), studentId, student?.group]);

  const refreshStudentHomeworks = useCallback(() => {
    if (isServerMode() && studentId && student?.group != null) {
      setHomeworksLoading(true);
      apiHomeworksForStudent(studentId, student.group)
        .then(setApiHomeworks)
        .catch(() => setApiHomeworks([]))
        .finally(() => setHomeworksLoading(false));
    } else {
      refreshFromStorage();
    }
  }, [studentId, student?.group, refreshFromStorage]);

  const refreshHomeworkTab = useCallback(() => {
    refreshStudentHomeworks();
  }, [refreshStudentHomeworks]);

  useEffect(() => {
    if (activeTab !== 'puzzles') return;
    refreshStudentHomeworks();
  }, [activeTab, refreshStudentHomeworks]);

  useEffect(() => {
    if ((activeTab !== 'puzzles' && activeTab !== 'analyses') || !student) return;
    if (viewAs === 'parent' && activeTab === 'analyses') return;
    void refreshTodayExternalStats();
  }, [activeTab, student?.id, homeworkDayKeyState, refreshTodayExternalStats, viewAs]);

  useEffect(() => {
    if ((activeTab !== 'puzzles' && activeTab !== 'analyses') || !student) return;
    if (viewAs === 'parent' && activeTab === 'analyses') return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshTodayExternalStats({ todayOnly: true });
    }, PLATFORM_AUTO_POLL_MS);
    return () => window.clearInterval(id);
  }, [activeTab, student?.id, homeworkDayKeyState, refreshTodayExternalStats, viewAs]);

  useEffect(() => {
    if (!student?.id || !platformStatsFetched || loadingExternalGameCount) return;
    if (activeTab !== 'puzzles' && activeTab !== 'summary') return;
    void requestTrainingNotifyCheck(student.id, homeworkDayKeyState);
  }, [
    student?.id,
    platformStatsFetched,
    loadingExternalGameCount,
    homeworkDayKeyState,
    activeTab,
    weekPlatformStatsByDate,
  ]);

  const [apiSchedule, setApiSchedule] = useState<typeof scheduleEntries>([]);
  useEffect(() => {
    if (isServerMode() && studentId && student?.group != null) {
      apiScheduleForStudent(studentId, student.group, scheduleWeek, scheduleYear)
        .then(setApiSchedule)
        .catch(() => setApiSchedule([]));
    }
  }, [isServerMode(), studentId, student?.group, scheduleWeek, scheduleYear]);

  useEffect(() => {
    if (activeTab !== 'live-lesson' || joinedRoomId != null) return;
    if (!isSupabaseBackend()) {
      setLiveLessonRooms([{ id: 'default', room_name: 'Canlı ders' }]);
      return;
    }
    const sb = getServiceSupabase();
    if (!sb) return;
    void Promise.resolve(
      sb.from('live_lesson_state').select('*').order('updated_at', { ascending: false })
    ).then(({ data }) => setLiveLessonRooms((data as LiveLessonRoom[]) ?? [])).catch(() => setLiveLessonRooms([{ id: 'default', room_name: 'Canlı ders' }]));
  }, [activeTab, joinedRoomId]);

  const handleLogout = () => {
    logout();
    onLogout();
  };

  if (!student || !derived) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-[#0c1222]">
        <div className="text-center">
          {!initialDataLoaded ? (
            <>
              <Loader2 className="w-14 h-14 mx-auto text-indigo-400 mb-4 animate-spin" />
              <p className="text-slate-400 font-medium">Yükleniyor...</p>
            </>
          ) : (
            <>
              <User className="w-14 h-14 mx-auto text-slate-500 mb-4" />
              <p className="text-white font-bold">Öğrenci bulunamadı.</p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-600 text-white text-sm font-bold transition-colors"
              >
                Çıkış Yap
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const statusBadge =
    student.status === 'inactive' ? (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Pasif
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Aktif
      </span>
    );

  const studentAccountMenuItems: AccountDropdownItem[] = [
    {
      id: 'summary',
      label: 'Panelim',
      icon: <LayoutDashboard className="w-5 h-5" />,
      onClick: () => setActiveTab('summary'),
    },
    {
      id: 'profile',
      label: 'Profilim',
      icon: <User className="w-5 h-5" />,
      onClick: () => setActiveTab('profile'),
    },
    {
      id: 'account',
      label: 'Hesap bilgileri',
      icon: <KeyRound className="w-5 h-5" />,
      onClick: () => {
        setLoginPhone(student.parentPhone || '');
        setLoginPin(student.parentPin || '');
        setShowLoginInfoModal(true);
      },
    },
  ];

  return (
    <div className="flex min-h-screen bg-[#020617] text-slate-100 min-w-0">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(id) => setActiveTab(id as PanelTab)}
        navCategories={navCategoriesForView}
        labelOverrides={{ puzzles: 'Antreman' }}
        onLogout={handleLogout}
        footerProfile={{
          name: student.name,
          subtitle: viewAs === 'student' ? 'Öğrenci hesabı' : `${student?.name ?? 'Öğrenci'} velisi`,
          photoUrl: student.photoUrl,
          initials: initials(student.name),
          menuItems: studentAccountMenuItems,
        }}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        defaultIconOnly={sidebarIconOnlyDefault}
        onDesktopExpandedChange={setSidebarDesktopExpanded}
      />

      <main className={`flex-1 min-w-0 ml-0 min-h-screen flex flex-col relative overflow-x-hidden transition-[margin] duration-300 ${sidebarDesktopExpanded ? 'lg:ml-64' : 'lg:ml-[4.5rem]'}`}>
        <div className="absolute inset-0 atmospheric-bg pointer-events-none" />
        <header className="relative z-10 h-14 sm:h-16 lg:h-20 px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30 bg-[#020617]/60 backdrop-blur-2xl border-b border-white/[0.06] shrink-0 shadow-lg shadow-black/5">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button type="button" onClick={() => setSidebarOpen(true)} className="p-2.5 rounded-xl lg:hidden hover:bg-white/5 text-slate-400 hover:text-white shrink-0 transition-colors" aria-label="Menüyü aç">
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-indigo-600/40 via-violet-600/20 to-slate-800 border border-indigo-600/30 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-600/10">
              <Users className="w-5 h-5 text-indigo-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-white truncate tracking-tight">
                {viewAs === 'student' ? `Merhaba, ${student.name}` : 'Veli Paneli'}
              </h1>
              <p className="text-xs font-semibold text-indigo-400/95 truncate mt-0.5">
                {viewAs === 'student' ? 'Öğrenci Paneli' : `Çocuğunuz: ${student.name}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <AccountDropdown
              name={viewAs === 'student' ? student.name : student.parentName || 'Veli'}
              subtitle={viewAs === 'student' ? 'Öğrenci hesabı' : `Çocuğunuz: ${student.name}`}
              photoUrl={student.photoUrl}
              initials={initials(student.name)}
              items={studentAccountMenuItems}
              onLogout={handleLogout}
              accent="indigo"
              showIdentity={false}
              avatarClassName="w-10 h-10 sm:w-11 sm:h-11 rounded-xl"
            />
          </div>
        </header>

        <div
          className={
            activeTab === 'study' || activeTab === 'live-lesson'
              ? 'relative z-10 flex-1 min-h-0 flex flex-col p-0 mx-auto w-full overflow-hidden'
              : 'relative z-10 flex-1 p-4 sm:p-6 lg:p-8 mx-auto w-full min-w-0 overflow-y-auto overflow-x-hidden'
          }
        >
        {activeTab === 'summary' && derived && (
          <StudentSummaryDashboard
            student={student}
            students={students}
            studentId={studentId}
            viewAs={viewAs}
            derived={{ attendanceRate: derived.attendanceRate, totalAttendance: derived.totalAttendance }}
            privateLessonSummary={studentPrivateLessonSummary}
            homeworkAttempts={homeworkAttempts}
            studentTransactions={studentTransactions}
            statusBadge={statusBadge}
            onTabChange={(tab) => setActiveTab(tab as PanelTab)}
            onOpenLoginInfo={() => {
              setLoginPhone(student.parentPhone || '');
              setLoginPin(student.parentPin || '');
              setShowLoginInfoModal(true);
            }}
            formatDateTR={formatDateTR}
            ageFromBirthDate={ageFromBirthDate}
            initials={initials}
            clubDisplay={studentClubDisplay}
          />
        )}

        {activeTab === 'leaderboard' && (
          <ClubLeaderboard
            allStudents={students}
            anchorStudent={student}
            homeworkAttempts={homeworkAttempts}
            highlightStudentId={studentId}
            compact
          />
        )}

        {/* Ders Programı sekmesi — admin ile aynı tasarım: 7 gün, saat + ders adı */}
        {activeTab === 'schedule' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <ScheduleWeeklyView
              lessons={studentWeeklyLessons}
              readOnly
              title="Ders Programı"
              subtitle="Haftalık antrenman çizelgesi"
              getStudentLabel={(id) => students.find((s) => String(s.id) === String(id))?.name}
            />
          </div>
        )}

        {/* Canlı Derse Katıl — önce ders listesi, Katıl'a tıklayınca tahtaya gir */}
        {activeTab === 'live-lesson' && (
          <div className="flex flex-1 min-h-0 flex-col bg-[#020617]">
            {joinedRoomId == null ? (
              <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                <div className="max-w-7xl mx-auto">
                  <div className="rounded-2xl bg-gradient-to-br from-indigo-600/10 via-violet-500/5 to-transparent border border-indigo-600/20 p-6 sm:p-8 mb-8">
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-600/30 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-600/10 shrink-0">
                        <Video className="w-7 h-7" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Canlı derse katıl</h2>
                        <p className="text-slate-400 text-sm mt-1.5 max-w-lg">Açık olan derslerden birini seçip <span className="text-indigo-400 font-semibold">Katıl</span> ile tahtaya bağlanın. Antrenör ile aynı tahtayı paylaşırsınız.</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {liveLessonRooms.length === 0 && (
                      <div className="rounded-2xl bg-slate-800/40 border border-slate-700/50 border-dashed p-12 text-center">
                        <Video className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-500 font-medium">Yükleniyor veya henüz açık ders yok.</p>
                        <p className="text-slate-600 text-sm mt-1">Antrenör bir ders başlattığında burada görünecektir.</p>
                      </div>
                    )}
                    {liveLessonRooms.map((r) => (
                      <div
                        key={r.id}
                        className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-800/60 border border-slate-700/50 hover:border-indigo-600/40 hover:bg-slate-800/80 transition-all duration-300 shadow-lg shadow-black/10"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-12 h-12 rounded-xl bg-slate-700/80 group-hover:bg-indigo-600/20 border border-slate-600/50 group-hover:border-indigo-600/30 flex items-center justify-center text-slate-400 group-hover:text-indigo-400 transition-colors shrink-0">
                            <Video className="w-6 h-6" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-bold truncate">{r.room_name || `Oda ${r.id}`}</p>
                            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mt-0.5">Canlı ders</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end sm:justify-start">
                          <button
                            type="button"
                            onClick={() => {
                              setJoinedRoomId(r.id);
                              writePanelHash('live-lesson', { liveRoomId: r.id });
                            }}
                            className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-600 hover:to-emerald-500 text-white font-bold text-sm transition-all duration-200 flex items-center gap-2 shadow-lg shadow-indigo-600/25 hover:shadow-indigo-600/40 hover:scale-[1.02] active:scale-[0.98]"
                          >
                            Katıl
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="shrink-0 flex flex-col gap-2 px-4 py-2 border-b border-white/5 bg-slate-900/50">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setJoinedRoomId(null);
                        writePanelHash('live-lesson');
                      }}
                      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 text-sm font-medium flex items-center gap-1"
                    >
                      ← Ders listesine dön
                    </button>
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <LiveLesson
                    roomId={joinedRoomId}
                    studentId={studentId}
                    onBack={() => {
                      setJoinedRoomId(null);
                      writePanelHash('live-lesson');
                    }}
                    isStudentView
                  />
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'puzzles' && student && (
          <div className="animate-in fade-in duration-300">
            <StudentHomeworkPanel
              student={student}
              viewAs={viewAs}
              assignedHomeworks={assignedHomeworks}
              puzzles={puzzles}
              homeworkAttempts={homeworkAttempts}
              homeworkSubmissions={homeworkSubmissions}
              homeworksLoading={homeworksLoading}
              homeworkDayKey={homeworkDayKeyState}
              todayExternalGameCount={todayExternalGameCount}
              todayExternalPuzzleCount={todayExternalPuzzleCount}
              todayExternalPuzzlePassed={todayExternalPuzzlePassed}
              weekPlatformStatsByDate={weekPlatformStatsByDate}
              loadingExternalGameCount={loadingExternalGameCount}
              externalStatsNote={externalStatsNote}
              midnightCountdown={midnightCountdown}
              onRefresh={refreshHomeworkTab}
              onRefreshPlatform={() => void refreshTodayExternalStats()}
              platformStatsFetched={platformStatsFetched}
              onPlayPuzzle={viewAs === 'parent' ? () => {} : setPlayingPuzzle}
              onDailyGoalsComplete={viewAs === 'parent' ? undefined : handleDailyGoalsComplete}
            />
          </div>
        )}

        {activeTab === 'puzzles' && !student && (
          <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-10 text-center text-slate-400 text-sm">
            Öğrenci bilgisi yükleniyor...
          </div>
        )}

        {/* Çalışma sekmesi — Öğrenci Study görünümü */}
        {activeTab === 'study' && (
          <div className="animate-in fade-in duration-300 flex-1 min-h-0 flex flex-col">
            <StudentStudyView
              studentId={studentId}
              studentName={student?.name ?? 'Öğrenci'}
            />
          </div>
        )}

        {activeTab === 'tournaments' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                Katıldığım turnuvalar
              </h2>
              <p className="text-sm text-slate-400 mt-1">Admin veya kulüp tarafından eklendiğiniz turnuvalar burada görünür.</p>
            </div>
            <div className="rounded-2xl bg-slate-800/40 border border-slate-700/50 overflow-hidden">
              {joinedTournaments.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">Henüz katıldığınız turnuva yok.</p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {joinedTournaments.map((t) => {
                    const mine = t.standings?.[studentId];
                    const status = getTournamentStatus(t.startAt, t.durationMinutes);
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedTournamentId(t.id)}
                          className={`w-full px-4 py-3 text-left transition-colors ${
                            selectedTournamentId === t.id
                              ? 'bg-amber-500/10 border-l-2 border-l-amber-400'
                              : 'hover:bg-slate-700/30'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-white truncate">{t.name}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {new Date(t.startAt).toLocaleString('tr-TR')} · {t.timeControl} · {t.durationMinutes} dk
                              </p>
                              <div className="mt-1">
                                {status === 'ongoing' ? (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">Canlı</span>
                                ) : status === 'upcoming' ? (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">Yakında</span>
                                ) : (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-600/40 text-slate-300 font-bold">Tamamlandı</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-slate-500">Puan</p>
                              <p className="text-sm font-black text-indigo-300">{(mine?.points ?? 0).toFixed(1)}</p>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {selectedTournament && (
              <div className="rounded-2xl bg-slate-800/40 border border-slate-700/50 p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-white">{selectedTournament.name}</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {selectedTournament.format.toUpperCase()} · {selectedTournament.timeControl} · {selectedTournament.durationMinutes} dk
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Katılımcı</p>
                    <p className="text-sm font-bold text-slate-200">{selectedTournament.participantIds?.length ?? 0}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-slate-900/50 border border-slate-700/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-700/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sıralama</div>
                    {selectedTournamentRanking.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500">Henüz eşleşme/puan yok.</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto divide-y divide-slate-700/40">
                        {selectedTournamentRanking.map((row, idx) => {
                          const st = students.find((s) => s.id === row.id);
                          const isMe = row.id === studentId;
                          return (
                            <div key={row.id} className={`px-4 py-2.5 text-sm flex items-center justify-between ${isMe ? 'bg-indigo-600/10' : ''}`}>
                              <div className="min-w-0">
                                <p className={`font-semibold truncate ${isMe ? 'text-indigo-300' : 'text-slate-200'}`}>
                                  #{idx + 1} {st?.name ?? row.id}
                                </p>
                                <p className="text-[11px] text-slate-500 mt-0.5">{row.played} maç · {row.wins} galibiyet</p>
                              </div>
                              <span className="font-black text-amber-300">{row.points.toFixed(1)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl bg-slate-900/50 border border-slate-700/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-700/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tur Maçları</div>
                    {(selectedTournament.rounds ?? []).length === 0 ? (
                      <p className="p-4 text-xs text-slate-500">Henüz tur oluşturulmamış.</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto divide-y divide-slate-700/40">
                        {(selectedTournament.rounds ?? []).slice().reverse().map((r) => (
                          <div key={r.id} className="p-4">
                            <p className="text-xs font-bold text-slate-300 mb-2">Tur {r.roundNo}</p>
                            <div className="space-y-1.5">
                              {r.pairings.map((p, i) => {
                                const w = students.find((s) => s.id === p.whiteId)?.name ?? p.whiteId;
                                const b = students.find((s) => s.id === p.blackId)?.name ?? p.blackId;
                                const mine = p.whiteId === studentId || p.blackId === studentId;
                                return (
                                  <div key={`${r.id}-${i}`} className={`text-xs px-2.5 py-2 rounded-lg border ${mine ? 'bg-indigo-600/10 border-indigo-600/30 text-indigo-200' : 'bg-slate-800/50 border-slate-700/50 text-slate-300'}`}>
                                    {w} vs {b} · <span className="font-bold">{p.result}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Devam sekmesi — Yoklama geçmişi tablosu */}
        {activeTab === 'attendance' && (
          <StudentAttendanceHistory
            records={studentAttendances}
            fallbackGroup={student?.group}
            formatDateTR={formatDateTR}
          />
        )}

        {activeTab === 'gallery' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
              <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-400" /> Medya & Galeri
              </h3>
              <p className="text-xs text-slate-400 mb-4">Akademi etkinliklerinden kareler ve eğitim materyalleri.</p>
              {visibleGallery.length === 0 ? (
                <div className="py-16 text-center rounded-xl bg-slate-900/50 border border-slate-700/50">
                  <ImageIcon className="w-14 h-14 text-slate-500 mx-auto mb-3 opacity-50" />
                  <p className="text-slate-400 text-sm font-medium">Henüz fotoğraf yok.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleGallery.map((img) => (
                    <div key={img.id} className="rounded-xl border border-slate-700/50 overflow-hidden bg-slate-900/50">
                      <div
                        className="relative aspect-[4/3] overflow-hidden cursor-zoom-in group"
                        role="button"
                        tabIndex={0}
                        onClick={() => setZoomedGalleryItem(img)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZoomedGalleryItem(img); } }}
                      >
                        <img
                          src={img.url}
                          alt={img.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                          onError={e => { (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/chess/800/600'; }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full bg-white/20 text-white">
                            <ZoomIn className="w-8 h-8" />
                          </span>
                        </div>
                      </div>
                      <div className="p-3">
                        <h4 className="text-sm font-bold text-white truncate">{img.title}</h4>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{img.date} · {img.group}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Büyütme (lightbox) */}
              {zoomedGalleryItem && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={() => setZoomedGalleryItem(null)}>
                  <div className="relative max-w-5xl max-h-[90vh] w-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
                    <button type="button" onClick={() => setZoomedGalleryItem(null)} className="absolute -top-2 -right-2 z-10 p-2 rounded-full bg-slate-800 hover:bg-indigo-600/80 text-white transition-colors shadow-xl">
                      <X className="w-6 h-6" />
                    </button>
                    <img
                      src={zoomedGalleryItem.url}
                      alt={zoomedGalleryItem.title}
                      className="max-w-full max-h-[80vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
                      referrerPolicy="no-referrer"
                      onError={e => { (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/chess/800/600'; }}
                    />
                    <div className="mt-4 text-center">
                      <h4 className="text-lg font-bold text-white">{zoomedGalleryItem.title}</h4>
                      <p className="text-sm text-slate-400 mt-1">{zoomedGalleryItem.date} · {zoomedGalleryItem.group}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'messages' && student && (
          <div className="animate-in fade-in duration-300">
            <StudentMessagesPanel
              studentId={student.id}
              studentName={student.name}
              parentName={student.parentName}
              groupName={student.group}
              viewAs={viewAs}
            />
          </div>
        )}

        {activeTab === 'analyses' && student && (
          <div className="animate-in fade-in duration-300">
            <StudentAnalysesPanel
              student={student}
              viewAs={viewAs}
              studentAnalyses={studentAnalyses}
              studentCoachAiReports={studentCoachAiReports}
              studentHomeworksWithAttempts={studentHomeworksWithAttempts}
              homeworks={homeworks}
              homeworkAttempts={homeworkAttempts}
              weekPlatformStatsByDate={weekPlatformStatsByDate}
              platformStatsFetched={platformStatsFetched}
              externalStatsNote={externalStatsNote}
              loadingPlatformOverview={loadingExternalGameCount}
              loadingPlatformProfiles={loadingLichess || loadingChessCom}
              platformLoading={loadingLichess || loadingChessCom || loadingLichessGames || loadingChessComGames}
              lichessGames={lichessGames}
              chessComGames={chessComGames}
              lichessProfile={lichessProfile}
              chessComProfile={chessComProfile}
              chessComStats={chessComStats}
              formatDateTR={formatDateTR}
              onGenerateHomeworkReport={async (homeworkId) => {
                const hw = homeworks.find((h) => h.id === homeworkId);
                if (!hw) return null;
                try {
                  const attempts = homeworkAttempts
                    .filter((a) => a.studentId === student.id && a.homeworkId === homeworkId)
                    .map((a) => ({
                      puzzleTitle: a.puzzleTitle,
                      correct: a.correct,
                      movesPlayed: a.movesPlayed,
                      solutionMoves: a.solutionMoves,
                    }));
                  return await analyzeStudentHomework(student.name, hw.title, attempts);
                } catch {
                  return { eksiklikler: 'Analiz alınamadı.', hamleler: '-' };
                }
              }}
            />
          </div>
        )}

        {activeTab === 'private-lesson' && student && (
          <StudentPrivateLessonPanel
            studentName={student.name}
            summary={studentPrivateLessonSummary}
            transactions={privateLessonTransactions}
            usageById={privateLessonUsageById}
            attendanceRecords={studentAttendances}
            formatDateTR={formatDateTR}
            onOpenPayments={() => setActiveTab('payments')}
          />
        )}

        {activeTab === 'ukd' && student && (
          <div className="animate-in fade-in duration-300">
            <UkdFideRatingsPanel
              mode="viewer"
              student={student}
              fideProfile={fideProfile}
              resolvedFideId={resolvedFideId}
              loadingFide={loadingFide}
              tsfUkdLive={tsfUkdLive}
              loadingTsfUkd={loadingTsfUkd}
              tsfUkdError={tsfUkdError}
              onRefresh={() => { void loadFide(); void loadTsfUkdSnapshot(); }}
              refreshing={loadingFide || loadingTsfUkd}
            />
          </div>
        )}

        {/* Lichess sekmesi — öğrenci/veli: sadece okuma, kullanıcı adı düzenlenemez */}
        {activeTab === 'lichess' && student && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-5 h-5 text-sky-500" />
                  <span className="text-sm font-black text-white">Lichess</span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={student.lichessUsername ? `https://lichess.org/@/${encodeURIComponent(student.lichessUsername)}` : 'https://lichess.org/login'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-bold"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Lichess&apos;te Aç
                  </a>
                  <button type="button" onClick={() => loadLichess(true)} disabled={loadingLichess || loadingLichessGames} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 text-xs font-bold disabled:opacity-50">
                    {loadingLichess || loadingLichessGames ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Yenile
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Lichess Kullanıcı Adı</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium">
                      {effectiveLichessUsername || student.lichessUsername || '—'}
                    </span>
                    {effectiveLichessUsername ? (
                      <a href={`https://lichess.org/@/${encodeURIComponent(effectiveLichessUsername)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 text-sm font-medium hover:bg-sky-500/20 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" /> Profili Aç
                      </a>
                    ) : null}
                    <LichessOAuthConnect
                      student={student}
                      variant="inline"
                      onConnected={() => { void loadLichess(true); }}
                      onDisconnected={() => {
                        setLichessResolvedUsername('');
                        void loadLichess(true);
                      }}
                    />
                  </div>
                </div>
                {student.id || effectiveLichessUsername ? (
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
                          statsContent={<LichessStatsSection profile={lichessProfile} activities={lichessActivities} />}
                          puzzlesContent={
                            <LichessPuzzlesSection
                              username={effectiveLichessUsername}
                              studentId={student.id}
                              student={student}
                              dailyPuzzle={dailyLichessPuzzle}
                              practicePuzzles={lichessPracticePuzzles}
                              loadingDaily={loadingDailyLichessPuzzle}
                              activityRows={lichessActivities}
                            />
                          }
                          gamesContent={
                            <>
                        {lichessGames.length > 0 && effectiveLichessUsername ? (
                          <LichessOpeningsSection games={lichessGames} username={effectiveLichessUsername} />
                        ) : null}
                        {loadingLichessGames && (
                          <div className="rounded-lg bg-slate-800/50 border border-sky-500/20 px-4 py-3 text-sm text-sky-300 flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            <span>
                              @{effectiveLichessUsername || '?'} hesabının Lichess maçları yükleniyor...
                              {lichessGamesProgress > 0 ? ` ${lichessGamesProgress.toLocaleString('tr-TR')} oyun` : ''}
                            </span>
                          </div>
                        )}
                        {lichessGames.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Oyun geçmişi</div>
                              <button type="button" onClick={() => loadLichess(true)} disabled={loadingLichess || loadingLichessGames} className="text-[10px] text-sky-400 hover:text-sky-300 font-medium disabled:opacity-50">Yenile</button>
                            </div>
                            <div className="space-y-2 max-h-[min(60vh,520px)] overflow-y-auto pr-1">
                              {lichessGames.map((g) => {
                                const me = (effectiveLichessUsername || lichessProfile.username || '').toLowerCase();
                                const whiteName = g.players?.white?.user?.name?.toLowerCase() ?? '';
                                const blackName = g.players?.black?.user?.name?.toLowerCase() ?? '';
                                const whiteId = g.players?.white?.user?.id?.toLowerCase() ?? '';
                                const blackId = g.players?.black?.user?.id?.toLowerCase() ?? '';
                                const isWhite = whiteName === me || whiteId === me;
                                const isBlack = blackName === me || blackId === me;
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
                                    onClick={() => loadLichess(true, true)}
                                    disabled={loadingLichessGames}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-bold disabled:opacity-50"
                                  >
                                    {loadingLichessGames ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                    Devam (20)
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-emerald-400 font-medium">Tumu yuklendi</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                            </>
                          }
                        />
                      </>
                    ) : (
                      <div className="rounded-xl bg-slate-800/40 border border-slate-700/60 p-4 text-sm text-slate-500">
                        Profil bulunamadı. Lichess hesabınız bağlıysa <strong className="text-slate-300">Yenile</strong> butonuna basın;
                        sorun sürerse bağlantıyı kaldırıp yeniden bağlayın.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <ExternalLink className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm font-medium">
                      Lichess hesabınızı yukarıdan bağlayın veya antrenör kullanıcı adınızı tanımlasın.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Chess.com sekmesi — öğrenci/veli: sadece okuma */}
        {activeTab === 'chesscom' && student && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="rounded-2xl bg-slate-800/40 backdrop-blur-xl border border-white/[0.06] shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-5 h-5 text-emerald-500" />
                  <span className="text-sm font-black text-white">Chess.com</span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={student.chessComUsername ? `https://www.chess.com/member/${encodeURIComponent(student.chessComUsername)}` : 'https://www.chess.com/login'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Chess.com&apos;da Aç
                  </a>
                  <button type="button" onClick={() => loadChessCom(false)} disabled={loadingChessCom || loadingChessComGames} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold disabled:opacity-50">
                    {loadingChessCom || loadingChessComGames ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Yenile
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Chess.com Kullanıcı Adı</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium">
                      {student.chessComUsername || '—'}
                    </span>
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
                              loading={loadingChessComGames && chessComGames.length === 0}
                              progress={chessComGamesProgress}
                              onRefresh={() => loadChessCom(false)}
                              onLoadMore={() => loadChessCom(true)}
                              hasMore={chessComHasMore}
                              loadingMore={loadingChessComGames}
                              onGameClick={setChessComViewerGame}
                              refreshDisabled={loadingChessCom || loadingChessComGames}
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
                    <p className="text-slate-400 text-sm font-medium">Chess.com kullanıcı adı antrenör tarafından tanımlandığında veriler burada görünecektir.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Aidat ve ödemeler (veli: tek sayfa) */}
        {(activeTab === 'payments' || activeTab === 'dues') && student && derived && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {derived.isPackageRegistration ? (
              <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
                <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-400" /> Ödeme durumu
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
                  <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Genel durum</p>
                    <p className="mt-1 text-lg font-bold text-indigo-300">{derived.duesLabel}</p>
                    {derived.duesSubtitle && <p className="text-xs text-slate-500 mt-0.5">{derived.duesSubtitle}</p>}
                  </div>
                  {studentPrivateLessonSummary ? (
                    <>
                      <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kalan ders</p>
                        <p className="mt-1 text-lg font-bold text-emerald-400">{studentPrivateLessonSummary.remainingLessons ?? '—'}</p>
                      </div>
                      <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kullanılan / Toplam</p>
                        <p className="mt-1 text-lg font-bold text-white">
                          {studentPrivateLessonSummary.usedLessons}/{studentPrivateLessonSummary.totalLessons ?? '—'}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Aktif paket</p>
                        <p className="mt-1 text-sm font-bold text-white line-clamp-2">{studentPrivateLessonSummary.packageName}</p>
                      </div>
                    </>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500">
                  Paket detayları için <button type="button" onClick={() => setActiveTab('private-lesson')} className="text-indigo-400 hover:text-indigo-300 font-medium underline">Özel Ders</button> sekmesine gidin.
                </p>
              </div>
            ) : null}

            <StudentDuesCalendar
              student={student}
              calendarYear={calendarYear}
              duesByMonth={duesByMonth}
              trainingGroups={trainingGroups}
              disciplineBranches={scopedDisciplineBranches}
              privateLessonSummary={derived.isPackageRegistration ? studentPrivateLessonSummary : null}
              formatDateTR={formatDateTR}
            />

            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
              <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-400" /> {student.registrationType === 'package' ? 'Ödeme geçmişi' : 'Aidat geçmişi'}
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                {student.registrationType === 'package'
                  ? 'Öğrencinize ait özel ders paketi ve ödeme kayıtları (en yeniden eskiye).'
                  : 'Öğrencinize ait aidat ve ödeme kayıtları (en yeniden eskiye).'}
              </p>
              {studentTransactions.length === 0 ? (
                <div className="py-12 text-center rounded-xl bg-slate-900/50 border border-slate-700/50">
                  <Wallet className="w-12 h-12 text-slate-500 mx-auto mb-3 opacity-50" />
                  <p className="text-slate-400 text-sm font-medium">Henüz ödeme kaydı yok.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
                  {studentTransactions.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl bg-slate-900/50 border border-slate-700/50">
                      <div>
                        <p className="text-sm font-medium text-white">{t.category || 'Aidat'}</p>
                        <p className="text-xs text-slate-500">{t.date} {t.paymentType ? ` · ${t.paymentType}` : ''}</p>
                      </div>
                      <span className="text-sm font-bold text-emerald-400">+₺{(t.amount ?? 0).toLocaleString('tr-TR')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Profil sekmesi — öğrenci/veli bilgileri, giriş ayarları */}
        {activeTab === 'profile' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {viewAs === 'parent' && (
              <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/30 px-4 py-3 text-sm text-indigo-200">
                <strong className="font-bold">Veli profili</strong> — Öğrencinize ait bilgileri görüntüleyebilir ve giriş bilgilerini güncelleyebilirsiniz.
              </div>
            )}
            {/* Profil fotoğrafı */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
              <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-400" /> Profil fotoğrafı
              </h3>
              <div className="flex flex-wrap items-center gap-6">
                <div className="w-24 h-24 rounded-2xl bg-slate-700/80 border-2 border-slate-600 overflow-hidden flex items-center justify-center shrink-0">
                  {student.photoUrl ? (
                    <img src={student.photoUrl} alt={student.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-black text-slate-500">{initials(student.name)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 mb-2">Veli paneli girişinde kullanılan öğrenci fotoğrafı. JPG veya PNG yükleyebilirsiniz.</p>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !student) return;
                      e.target.value = '';
                      if (!isSupabaseBackend()) {
                        addActivityLog({ user: 'Veli (Panel)', action: 'Profil foto yükleme (Supabase gerekli)', target: student.name, type: 'info' });
                        return;
                      }
                      const sb = getServiceSupabase();
                      if (!sb) return;
                      setPhotoUploading(true);
                      try {
                        const fileExt = file.name.split('.').pop() || 'jpg';
                        const fileName = `${student.id}-${Date.now()}.${fileExt}`;
                        const { error } = await sb.storage.from('student-photos').upload(fileName, file, { upsert: true });
                        if (!error) {
                          const { data } = sb.storage.from('student-photos').getPublicUrl(fileName);
                          updateStudent(student.id, { photoUrl: data.publicUrl });
                          addActivityLog({ user: 'Veli (Panel)', action: 'Profil fotoğrafı güncellendi', target: student.name, type: 'info' });
                        }
                      } finally {
                        setPhotoUploading(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={photoUploading}
                    onClick={() => photoInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-bold transition-colors"
                  >
                    {photoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    {photoUploading ? 'Yükleniyor...' : 'Profil fotoğrafı yükle'}
                  </button>
                  {!isSupabaseBackend() && (
                    <p className="text-xs text-amber-400/90 mt-2">Fotoğraf yükleme için Supabase kullanılmaktadır.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
              <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-indigo-400" /> Öğrenci bilgileri
              </h3>
              <dl className="space-y-2 text-sm">
                {[
                  ['Ad Soyad', student.name],
                  ['TC', student.tcNo || '—'],
                  ['Doğum', student.birthDate ? `${formatDateTR(student.birthDate)} (${ageFromBirthDate(student.birthDate) ?? '?'} yaş)` : '—'],
                  ['Şube', student.branchOffice || '—'],
                  ['Branş', student.branch || '—'],
                  ['Grup', student.group || '—'],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-4 py-2 border-b border-slate-700/30 last:border-0">
                    <dt className="text-slate-500 font-medium">{k}</dt>
                    <dd className="text-white font-medium text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
              <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" /> Veli bilgileri
              </h3>
              <dl className="space-y-2 text-sm">
                {[
                  ['Baba', student.fatherName || student.parentName || '—'],
                  ['Baba tel', formatPhone(student.fatherPhone || student.parentPhone)],
                  ['Anne', student.motherName || '—'],
                  ['Anne tel', formatPhone(student.motherPhone)],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-4 py-2 border-b border-slate-700/30 last:border-0">
                    <dt className="text-slate-500 font-medium">{k}</dt>
                    <dd className="text-white font-medium text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">İletişim</p>
                <div className="space-y-2">
                  {(student.contactNumbers?.length ? student.contactNumbers : [student.parentPhone].filter(Boolean)).slice(0, 2).map((p, i) => (
                    <div key={i} className="flex justify-between rounded-lg bg-slate-900/50 px-3 py-2 text-sm font-medium text-white">
                      <span className="text-slate-400">Telefon {i + 1}</span> {formatPhone(p)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Giriş bilgileri — gerçek veriler + güncelle butonu */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
              <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" /> Giriş bilgileri
              </h3>
              <dl className="space-y-2 text-sm mb-4">
                <div className="flex justify-between gap-4 py-2 border-b border-slate-700/30 items-center">
                  <dt className="text-slate-500 font-medium">Veli telefonu</dt>
                  <dd className="text-white font-medium font-mono">{student.parentPhone ? formatPhone(student.parentPhone) : '—'}</dd>
                </div>
                <div className="flex justify-between gap-4 py-2 border-b border-slate-700/30 items-center">
                  <dt className="text-slate-500 font-medium">PIN (opsiyonel)</dt>
                  <dd className="text-white font-medium">{student.parentPin ? '•••• Tanımlı' : 'Tanımlı değil'}</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => { setLoginPhone(student.parentPhone || ''); setLoginPin(student.parentPin || ''); setShowLoginInfoModal(true); }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-600 text-white font-bold text-sm transition-colors"
              >
                <User className="w-4 h-4" /> Giriş bilgilerini güncelle
              </button>
            </div>
            {/* Öğrenci şifresi — öğrenci kendi şifresini değiştirebilir */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
              <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-400" /> Öğrenci şifresi
              </h3>
              <p className="text-xs text-slate-400 mb-3">Öğrenci no veya kullanıcı adı ile girişte kullanılan şifre. Kendi şifrenizi buradan değiştirebilirsiniz.</p>
              <dl className="space-y-2 text-sm mb-4">
                <div className="flex justify-between gap-4 py-2 border-b border-slate-700/30 items-center">
                  <dt className="text-slate-500 font-medium">Durum</dt>
                  <dd className="text-white font-medium">{student.password ? '•••• Tanımlı' : 'Tanımlı değil'}</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => {
                  setCurrentPassword('');
                  setNewPassword('');
                  setNewPasswordConfirm('');
                  setPasswordError('');
                  setShowPasswordModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white font-bold text-sm transition-colors"
              >
                <KeyRound className="w-4 h-4" /> Şifre değiştir
              </button>
            </div>
            {viewAs !== 'parent' && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Faydalı linkler</p>
              <div className="flex flex-wrap gap-2">
                <a href={student.lichessUsername ? `https://lichess.org/@/${encodeURIComponent(student.lichessUsername)}` : 'https://lichess.org/'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/50 hover:border-sky-500/40 text-slate-300 text-sm font-medium transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" /> Lichess{student.lichessUsername ? ` (@${student.lichessUsername})` : ''}
                </a>
                <a href="https://lichess.org/analysis" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/50 hover:border-sky-500/30 text-slate-400 text-sm font-medium transition-colors">
                  Lichess Analiz
                </a>
                <a href={student.chessComUsername ? `https://www.chess.com/member/${encodeURIComponent(student.chessComUsername)}` : 'https://www.chess.com/'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/50 hover:border-emerald-500/40 text-slate-300 text-sm font-medium transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" /> Chess.com{student.chessComUsername ? ` (@${student.chessComUsername})` : ''}
                </a>
                <a href="https://www.chess.com/analysis" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/50 hover:border-emerald-500/30 text-slate-400 text-sm font-medium transition-colors">
                  Chess.com Analiz
                </a>
                <a href="https://ukd.tsf.org.tr/ukdsorgulama.php" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/50 hover:border-amber-500/40 text-slate-300 text-sm font-medium transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" /> UKD/FIDE
                </a>
              </div>
            </div>
            )}
          </div>
        )}
        </div>
      </main>

      {/* Giriş Bilgilerini Güncelle modal */}
      {showLoginInfoModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowLoginInfoModal(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
          <div className="relative w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <User className="w-5 h-5 text-indigo-400" /> Giriş bilgilerini güncelle
              </h3>
              <button type="button" onClick={() => setShowLoginInfoModal(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Veli telefonu</label>
                <input type="text" value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-sm" placeholder="5XX XXX XX XX" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">PIN (opsiyonel)</label>
                <input type="password" value={loginPin} onChange={(e) => setLoginPin(e.target.value)} className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-sm" placeholder="••••" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowLoginInfoModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700 font-bold text-sm">İptal</button>
                <button
                  type="button"
                  onClick={() => {
                    updateStudent(student.id, { parentPhone: loginPhone.trim() || student.parentPhone, parentPin: loginPin.trim() || undefined });
                    addActivityLog({ user: 'Veli (Panel)', action: 'Giriş bilgileri güncellendi', target: student.name, type: 'info' });
                    setShowLoginInfoModal(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-600 text-white font-bold text-sm"
                >
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Şifre değiştir modal — öğrenci kendi şifresini günceller */}
      {showPasswordModal && student && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowPasswordModal(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
          <div className="relative w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-indigo-400" /> Şifre değiştir
              </h3>
              <button type="button" onClick={() => setShowPasswordModal(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {viewAs === 'student' && student.password && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">Mevcut şifre</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(''); }}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-sm"
                    placeholder="••••••"
                    autoComplete="current-password"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Yeni şifre</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); }}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-sm"
                  placeholder="••••••"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Yeni şifre (tekrar)</label>
                <input
                  type="password"
                  value={newPasswordConfirm}
                  onChange={(e) => { setNewPasswordConfirm(e.target.value); setPasswordError(''); }}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-sm"
                  placeholder="••••••"
                  autoComplete="new-password"
                />
              </div>
              {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowPasswordModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700 font-bold text-sm">İptal</button>
                <button
                  type="button"
                  onClick={() => {
                    if (viewAs === 'student' && student.password && currentPassword !== student.password) {
                      setPasswordError('Mevcut şifre hatalı.');
                      return;
                    }
                    if (!newPassword.trim()) {
                      setPasswordError('Yeni şifre boş olamaz.');
                      return;
                    }
                    if (newPassword !== newPasswordConfirm) {
                      setPasswordError('Yeni şifreler eşleşmiyor.');
                      return;
                    }
                    updateStudent(student.id, { password: newPassword.trim() });
                    addActivityLog({ user: viewAs === 'student' ? 'Öğrenci (Panel)' : 'Veli (Panel)', action: 'Öğrenci şifresi güncellendi', target: student.name, type: 'info' });
                    setShowPasswordModal(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setNewPasswordConfirm('');
                    setPasswordError('');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-600 text-white font-bold text-sm"
                >
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {playingPuzzle && (
        <StudentPuzzlePlayModal
          key={playingPuzzle.openKey}
          puzzle={playingPuzzle.puzzle}
          homeworkId={playingPuzzle.homeworkId}
          studentId={studentId}
          nextPuzzle={playingPuzzle.nextPuzzle}
          onPlayNext={(next) => {
            const hw = assignedHomeworks.find((h) => h.id === playingPuzzle.homeworkId);
            setPlayingPuzzle({
              puzzle: next,
              homeworkId: playingPuzzle.homeworkId,
              openKey: `${playingPuzzle.homeworkId}:${next.id}:${Date.now()}`,
              nextPuzzle: hw ? nextHomeworkPuzzle(hw, next.id, puzzles) : null,
            });
          }}
          onClose={() => setPlayingPuzzle(null)}
          onAttemptRecord={(record) => addHomeworkAttempt(record)}
        />
      )}
      {lichessViewerGame && student?.lichessUsername && (
        <LichessGameViewerModal
          game={lichessViewerGame}
          onClose={() => setLichessViewerGame(null)}
        />
      )}
      {chessComViewerGame && (
        <ChessComGameViewerModal
          game={chessComViewerGame}
          onClose={() => setChessComViewerGame(null)}
        />
      )}
    </div>
  );
};

export default StudentPanel;
