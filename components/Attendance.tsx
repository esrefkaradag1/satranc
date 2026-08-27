import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CalendarCheck,
  Check,
  MessageCircle,
  Save,
  X,
  UserCheck,
  List,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { coachesForClub } from '../lib/orgScope';
import {
  fetchLichessUser,
  fetchLichessRecentGames,
  fetchChessComPlayer,
  fetchChessComStats,
  fetchChessComRecentGames,
  type ChessComGame,
  type ChessComPlayer,
  type ChessComStats,
  type LichessGame,
  type LichessUserProfile,
} from '../services/chessPlatformService';
import type { Student, StudentLessonLogEntry } from '../types';
import { GroupLessonLogPanel } from './attendance/GroupLessonLogPanel';
import { isoDateToTr } from '../lib/lessonLogUtils';
import { findTrainingGroupByName, studentsInTrainingGroup } from '../lib/trainingGroupUtils';
import { normalizeClubKey } from '../lib/clubScope';
import {
  attendanceRecordGroupName,
  attendanceRecordKind,
  attendanceRecordSessionScopeKey,
  attendanceRecordTime,
  attendanceRecordsShareSession,
  buildGroupAttendanceSessionId,
  buildLessonAttendanceSessionId,
  parseAttendanceSessionId,
} from '../lib/attendanceSession';
import { computePrivateLessonBalance, buildPrivateLessonUsageById } from '../lib/privateLessonUsage';
import { consumeAttendanceEditBridge } from '../lib/attendanceEditBridge';
import { StudentLessonLogInline } from './attendance/StudentLessonLogInline';
import { ResponsiveTable } from './ui/ResponsiveTable';

type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Excused' | null;
type AnalysisPlatform = 'lichess' | 'chesscom';

function lichessProfileUrl(username: string): string {
  const u = username.trim();
  return `https://lichess.org/@/${encodeURIComponent(u)}`;
}

function chessComProfileUrl(username: string): string {
  const u = username.trim();
  return `https://www.chess.com/member/${encodeURIComponent(u)}`;
}

function normalizePrivateLessonText(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');
}

function saleMatchesSelectedLessonPackage(
  sale: { lessonPackageId?: string; lessonPackageName?: string; description?: string; lessonDiscipline?: string; lessonBranchOffice?: string },
  opts: { packageId?: string; packageName: string; branchOffice: string; discipline: string },
): boolean {
  if (opts.packageId && sale.lessonPackageId === opts.packageId) return true;
  const normalizedPackageName = normalizePrivateLessonText(opts.packageName);
  if (!normalizedPackageName) return false;
  const normalizedSaleName = normalizePrivateLessonText(sale.lessonPackageName);
  const normalizedDescription = normalizePrivateLessonText(sale.description);
  const normalizedSaleBranch = normalizePrivateLessonText(sale.lessonDiscipline);
  const normalizedSaleOffice = normalizeClubKey(sale.lessonBranchOffice ?? '');
  const normalizedOffice = normalizeClubKey(opts.branchOffice);
  const normalizedBranch = normalizePrivateLessonText(opts.discipline);
  const sameOffice = !normalizedOffice || !normalizedSaleOffice || normalizedSaleOffice === normalizedOffice;
  const sameBranch = !normalizedBranch || !normalizedSaleBranch || normalizedSaleBranch === normalizedBranch;
  if (!sameOffice || !sameBranch) return false;
  return (
    normalizedSaleName === normalizedPackageName ||
    normalizedDescription === normalizedPackageName
  );
}

/* ── Alt bileşenler ─────────────────────────────────────────── */

const fieldInputCls =
  'w-full px-3 py-2.5 rounded-lg bg-slate-950/50 border border-white/[0.08] text-sm text-white font-medium focus:ring-2 focus:ring-indigo-500/35 outline-none transition-all';

const SectionHeader: React.FC<{
 icon: React.ReactNode;
 title: string;
 subtitle?: string;
}> = ({ icon, title, subtitle }) => (
 <div className="px-3.5 sm:px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2.5 bg-slate-950/30">
 <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-400/20 flex items-center justify-center text-indigo-300 shrink-0">
   {icon}
 </div>
 <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
   <div className="text-sm font-black text-white tracking-tight">{title}</div>
   {subtitle ? <div className="text-[11px] text-slate-500 font-medium">{subtitle}</div> : null}
 </div>
 </div>
);

const SelectField: React.FC<{
 label: string;
 icon?: React.ReactNode;
 children: React.ReactNode;
 className?: string;
}> = ({ label, icon, children, className = '' }) => (
 <div className={`space-y-1 ${className}`}>
 <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
 {icon && <span className="text-indigo-400">{icon}</span>}
 {label}
 </div>
 {children}
 </div>
);

const AttendanceStatusButtons: React.FC<{
 status: AttendanceStatus;
 onPresent: () => void;
 onAbsent: () => void;
 onExcused: () => void;
 layout?: 'row' | 'grid';
  disablePresent?: boolean;
}> = ({ status, onPresent, onAbsent, onExcused, layout = 'row', disablePresent = false }) => {
 const wrap = layout === 'grid'
   ? 'grid grid-cols-3 gap-1.5'
   : 'flex flex-wrap items-center justify-center gap-1.5';
 const btn = layout === 'grid'
   ? 'flex flex-col items-center justify-center min-h-[44px] py-2 px-1 rounded-lg border text-[10px] font-bold transition-all'
   : 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all';
 return (
   <div className={wrap}>
    <button
      type="button"
      onClick={onPresent}
      disabled={disablePresent}
      title={disablePresent ? 'Öğrencinin özel ders hakkı kalmadı.' : undefined}
      className={`${btn} ${disablePresent ? 'cursor-not-allowed border-amber-500/20 bg-amber-500/10 text-amber-200/60' : status === 'Present' ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300' : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-emerald-500/30'}`}
    >
       <Check className={layout === 'grid' ? 'w-4 h-4' : 'w-3 h-3'} />
       <span className={layout === 'grid' ? 'mt-0.5 leading-none' : ''}>Katıldı</span>
     </button>
     <button type="button" onClick={onAbsent} className={`${btn} ${status === 'Absent' ? 'border-rose-500/50 bg-rose-500/20 text-rose-300' : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-rose-500/30'}`}>
       <X className={layout === 'grid' ? 'w-4 h-4' : 'w-3 h-3'} />
       <span className={layout === 'grid' ? 'mt-0.5 leading-none' : ''}>Katılmadı</span>
     </button>
     <button type="button" onClick={onExcused} className={`${btn} ${status === 'Excused' ? 'border-amber-500/50 bg-amber-500/20 text-amber-300' : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-amber-500/30'}`}>
       <UserCheck className={layout === 'grid' ? 'w-4 h-4' : 'w-3 h-3'} />
       <span className={layout === 'grid' ? 'mt-0.5 leading-none' : ''}>İzinli</span>
     </button>
   </div>
 );
};

const AnalysisPlatformButtons: React.FC<{
 student: Student;
 onLichess: () => void;
 onChessCom: () => void;
 compact?: boolean;
}> = ({ student, onLichess, onChessCom, compact }) => {
 const lichess = student.lichessUsername?.trim();
 const chessCom = student.chessComUsername?.trim();
 const size = compact ? 'px-2 py-1.5 text-[9px]' : 'px-2.5 py-1.5 text-[10px]';
 return (
   <div className={`flex items-center gap-1.5 ${compact ? '' : 'flex-wrap justify-center'}`}>
     {lichess ? (
       <button type="button" onClick={onLichess} className={`rounded-lg bg-slate-800 border border-white/10 text-slate-200 font-bold hover:bg-slate-700 transition-colors ${size}`}>Lichess</button>
     ) : (
       <span className={`rounded-lg bg-white/[0.03] text-slate-600 font-bold cursor-not-allowed ${size}`}>Lichess</span>
     )}
     {chessCom ? (
       <button type="button" onClick={onChessCom} className={`rounded-lg bg-indigo-600/30 border border-indigo-500/30 text-indigo-200 font-bold hover:bg-indigo-600/50 transition-colors ${size}`}>Chess.com</button>
     ) : (
       <span className={`rounded-lg bg-white/[0.03] text-slate-600 font-bold cursor-not-allowed ${size}`}>Chess.com</span>
     )}
   </div>
 );
};

const StudentPhoto: React.FC<{
  name: string;
  photoUrl?: string;
  sizeClass?: string;
  textClass?: string;
  onZoom?: (photo: { url: string; name: string }) => void;
}> = ({ name, photoUrl, sizeClass = 'w-9 h-9', textClass = 'text-[10px]', onZoom }) => {
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  if (photoUrl) {
    return (
      <button
        type="button"
        onClick={() => onZoom?.({ url: photoUrl, name })}
        className={`${sizeClass} rounded-lg border border-white/10 cursor-zoom-in hover:ring-2 hover:ring-indigo-500/40 transition-all overflow-hidden shrink-0 p-0`}
        title={`${name} — büyütmek için tıklayın`}
      >
        <img src={photoUrl} alt={name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      </button>
    );
  }
  return (
    <div className={`${sizeClass} rounded-lg premium-gradient flex items-center justify-center text-white font-bold ${textClass} shadow-md shadow-indigo-900/30 shrink-0`}>
      {initials}
    </div>
  );
};

function attendanceCardAccent(status: AttendanceStatus): string {
 if (status === 'Present') return 'border-emerald-500/35 bg-emerald-500/[0.05]';
 if (status === 'Absent') return 'border-rose-500/35 bg-rose-500/[0.05]';
 if (status === 'Excused') return 'border-amber-500/35 bg-amber-500/[0.05]';
 return 'border-white/[0.06] bg-[#1e293b]/50';
}

/* ── Ana sayfa ─────────────────────────────────────────────── */

type ViewMode = 'take' | 'list';

function formatUnixDate(sec?: number): string {
  if (!sec) return '—';
  return new Date(sec * 1000).toLocaleDateString('tr-TR');
}

function formatMsDate(ms?: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('tr-TR');
}

function formatNowTimeTR(): string {
  return new Date().toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function statusToUi(status: string): AttendanceStatus {
  if (status === 'present') return 'Present';
  if (status === 'late') return 'Late';
  if (status === 'excused') return 'Excused';
  if (status === 'absent') return 'Absent';
  return null;
}

const Attendance: React.FC = () => {
  const {
    scopedStudents: students,
    scopedCoaches: coaches,
    auth,
    scopedTransactions: transactions,
    addAttendanceRecord,
    scopedAttendanceRecords: attendanceRecords,
    scopedTrainingGroups: trainingGroups,
    scopedLessonPackages: lessonPackages,
    branchOffices,
    activeClubBranch,
    refreshFromStorage,
    groupLessonLogs,
    updateGroupLessonLog,
    updateStudent,
  } = useApp();

  const [viewMode, setViewMode] = useState<ViewMode>('take');
  const [attendanceType, setAttendanceType] = useState<'group' | 'lesson'>('group');
  const [branchOffice, setBranchOffice] = useState('');
  const [branch, setBranch] = useState('');
  const [group, setGroup] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [teacherName, setTeacherName] = useState('');
  const [sessionTime, setSessionTime] = useState('');
  const [showStudents, setShowStudents] = useState(false);
  const [isEditingSession, setIsEditingSession] = useState(false);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [lessonSummary, setLessonSummary] = useState('');
  const [listDate, setListDate] = useState(new Date().toISOString().slice(0, 10));
  const [listGroup, setListGroup] = useState('');
  const [listFetched, setListFetched] = useState(false);
  const [analysisModal, setAnalysisModal] = useState<{ student: Student; platform: AnalysisPlatform } | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [lichessProfile, setLichessProfile] = useState<LichessUserProfile | null>(null);
  const [lichessGames, setLichessGames] = useState<LichessGame[]>([]);
  const [chessComProfile, setChessComProfile] = useState<ChessComPlayer | null>(null);
  const [chessComStats, setChessComStats] = useState<ChessComStats | null>(null);
  const [chessComGames, setChessComGames] = useState<ChessComGame[]>([]);
  const [expandedNoteStudentId, setExpandedNoteStudentId] = useState<string | null>(null);
  const [zoomedPhoto, setZoomedPhoto] = useState<{ url: string; name: string } | null>(null);
  const [pendingEditBridge, setPendingEditBridge] = useState(() => consumeAttendanceEditBridge());
  const prevAttendanceType = useRef(attendanceType);

  /** Tanımlı eğitim grubu veya ders paketi olan şubeler */
  const attendanceBranchOffices = useMemo(() => {
    const withGroups = new Set(
      trainingGroups.map((g) => g.branchOffice?.trim()).filter(Boolean) as string[],
    );
    const withPackages = new Set(
      lessonPackages.map((p) => p.branchOffice?.trim()).filter(Boolean) as string[],
    );
    const combined = new Set([...withGroups, ...withPackages]);
    const registered = branchOffices.filter((o) => combined.has(o));
    if (registered.length > 0) return registered;
    return [...combined].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [branchOffices, trainingGroups, lessonPackages]);

  /** Grup bazlı yoklama: eğitim grubu tanımlı branşlar */
  const groupAttendanceDisciplines = useMemo(() => {
    const office = branchOffice.trim();
    const names = new Set<string>();
    for (const g of trainingGroups) {
      if (office && normalizeClubKey(g.branchOffice ?? '') !== normalizeClubKey(office)) continue;
      if (g.discipline?.trim()) names.add(g.discipline.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [trainingGroups, branchOffice]);

  /** Ders bazlı yoklama: ders paketi tanımlı branşlar (özel ders vb.) */
  const lessonAttendanceDisciplines = useMemo(() => {
    const office = branchOffice.trim();
    const names = new Set<string>();
    for (const p of lessonPackages) {
      if (office && normalizeClubKey(p.branchOffice ?? '') !== normalizeClubKey(office)) continue;
      if (p.discipline?.trim()) names.add(p.discipline.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [lessonPackages, branchOffice]);

  const attendanceDisciplines = useMemo(
    () => (attendanceType === 'lesson' ? lessonAttendanceDisciplines : groupAttendanceDisciplines),
    [attendanceType, lessonAttendanceDisciplines, groupAttendanceDisciplines],
  );

  useEffect(() => {
    if (attendanceBranchOffices.length === 0) {
      if (branchOffice) setBranchOffice('');
      return;
    }
    if (branchOffice && attendanceBranchOffices.includes(branchOffice)) return;
    const preferred =
      activeClubBranch && attendanceBranchOffices.includes(activeClubBranch)
        ? activeClubBranch
        : attendanceBranchOffices[0];
    setBranchOffice(preferred ?? '');
  }, [attendanceBranchOffices, activeClubBranch, branchOffice]);

  useEffect(() => {
    if (attendanceDisciplines.length === 0) {
      if (branch) setBranch('');
      return;
    }
    if (branch && attendanceDisciplines.includes(branch)) return;
    setBranch(attendanceDisciplines[0] ?? '');
  }, [attendanceDisciplines, branch]);

  useEffect(() => {
    if (prevAttendanceType.current === attendanceType) return;
    prevAttendanceType.current = attendanceType;
    setBranch('');
    setGroup('');
    setSessionTime('');
    setShowStudents(false);
    setAttendance({});
  }, [attendanceType]);

  /** Tüm tanımlı gruplar (yoklama listesi) */
  const allGroupNames = useMemo(() => {
    const names = new Set<string>();
    for (const g of trainingGroups) {
      if (g.name?.trim()) names.add(g.name.trim());
    }
    for (const p of lessonPackages) {
      if (p.name?.trim()) names.add(p.name.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [trainingGroups, lessonPackages]);

  /** Seçili şube + branşa göre gruplar (grup bazlı yoklama) */
  const groups = useMemo(() => {
    const office = branchOffice.trim();
    const discipline = branch.trim();
    const names = new Set<string>();
    for (const g of trainingGroups) {
      if (office && normalizeClubKey(g.branchOffice ?? '') !== normalizeClubKey(office)) continue;
      if (discipline && g.discipline?.trim() !== discipline) continue;
      if (g.name?.trim()) names.add(g.name.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [trainingGroups, branchOffice, branch]);

  /** Seçili şube + branşa göre ders paketleri (ders bazlı yoklama) */
  const lessonPackageOptions = useMemo(() => {
    const office = branchOffice.trim();
    const discipline = branch.trim();
    return lessonPackages
      .filter((p) => {
        if (office && normalizeClubKey(p.branchOffice ?? '') !== normalizeClubKey(office)) return false;
        if (discipline && p.discipline?.trim() !== discipline) return false;
        return Boolean(p.name?.trim());
      })
      .map((p) => p.name.trim())
      .sort((a, b) => a.localeCompare(b, 'tr'));
  }, [lessonPackages, branchOffice, branch]);

  const secondaryOptions = attendanceType === 'lesson' ? lessonPackageOptions : groups;

  /** Seçili şubeye (kulüp) bağlı antrenörler */
  const attendanceCoaches = useMemo(() => {
    const office = branchOffice.trim();
    if (!office) return [];
    return coachesForClub(coaches, office).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [coaches, branchOffice]);

  useEffect(() => {
    if (auth?.role === 'coach' && auth.coachId) {
      const me = coaches.find((c) => c.id === auth.coachId);
      if (me?.name) setTeacherName(me.name);
    }
  }, [auth, coaches]);

  useEffect(() => {
    if (!teacherName) return;
    if (!attendanceCoaches.some((c) => c.name === teacherName)) setTeacherName('');
  }, [attendanceCoaches, teacherName]);

  useEffect(() => {
    if (group && !secondaryOptions.includes(group)) setGroup('');
  }, [secondaryOptions, group]);

  const selectedTrainingGroup = useMemo(
    () => findTrainingGroupByName(trainingGroups, group, { branchOffice, discipline: branch }),
    [trainingGroups, group, branchOffice, branch],
  );

  const selectedLessonPackage = useMemo(
    () => lessonPackages.find(
      (p) =>
        p.name.trim() === group.trim() &&
        p.discipline.trim() === branch.trim() &&
        normalizeClubKey(p.branchOffice) === normalizeClubKey(branchOffice),
    ),
    [lessonPackages, group, branch, branchOffice],
  );

  const sessionDayOfWeek = useMemo(() => {
    const value = new Date(`${date}T00:00:00`);
    const dayOfWeek = value.getDay();
    return dayOfWeek === 0 ? 7 : dayOfWeek;
  }, [date]);

  const derivedSessionTime = useMemo(() => {
    if (attendanceType === 'group' && selectedTrainingGroup?.lessonSlots?.length) {
      const slot =
        selectedTrainingGroup.lessonSlots.find((item) => item.dayOfWeek === sessionDayOfWeek) ??
        selectedTrainingGroup.lessonSlots[0];
      if (slot?.startTime?.trim()) return slot.startTime.trim();
    }
    return formatNowTimeTR();
  }, [attendanceType, selectedTrainingGroup, sessionDayOfWeek]);

  const currentSessionId = useMemo(() => {
    if (!group.trim()) return '';
    return attendanceType === 'lesson'
      ? buildLessonAttendanceSessionId(selectedLessonPackage?.id, branchOffice, branch, group)
      : buildGroupAttendanceSessionId(branchOffice, branch, group);
  }, [attendanceType, selectedLessonPackage?.id, branchOffice, branch, group]);

  const lessonSessionRecord = useMemo(
    () => ({
      lessonId: currentSessionId || undefined,
      attendanceType: 'lesson' as const,
      groupName: group.trim() || undefined,
      branch: branch.trim() || undefined,
      branchOffice: branchOffice.trim() || undefined,
    }),
    [currentSessionId, group, branch, branchOffice],
  );

  const selectedLessonPackageSalesByStudentId = useMemo(() => {
    const map = new Map<string, (typeof transactions)[number]>();
    const packageName = (selectedLessonPackage?.name ?? group).trim();
    if (!packageName) return map;
    const matchOpts = {
      packageId: selectedLessonPackage?.id,
      packageName,
      branchOffice: selectedLessonPackage?.branchOffice ?? branchOffice,
      discipline: selectedLessonPackage?.discipline ?? branch,
    };
    transactions
      .filter((t) => t.category === 'Özel Ders' && t.studentId)
      .filter((t) => saleMatchesSelectedLessonPackage(t, matchOpts))
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((sale) => {
        if (!sale.studentId || map.has(sale.studentId)) return;
        map.set(sale.studentId, sale);
      });
    return map;
  }, [transactions, selectedLessonPackage, group, branch, branchOffice]);

  const filteredStudents = useMemo(() => {
    const byName = (list: typeof students) =>
      [...list].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'tr'));
    const activeOnly = students.filter((s) => s.status !== 'inactive');
    const groupName = group.trim();
    if (!groupName) return [];
    if (attendanceType === 'lesson') {
      return byName(
        activeOnly.filter((s) => {
          if (selectedLessonPackageSalesByStudentId.has(s.id)) return true;
          return (s.group ?? '').trim() === groupName;
        }),
      );
    }
    if (selectedTrainingGroup) return byName(studentsInTrainingGroup(activeOnly, selectedTrainingGroup));
    return byName(activeOnly.filter((s) => (s.group ?? '').trim() === groupName));
  }, [students, group, attendanceType, selectedTrainingGroup, selectedLessonPackageSalesByStudentId]);

  const privateLessonBalanceByStudentId = useMemo(() => {
    const map = new Map<string, { totalLessons: number; usedLessons: number; remainingLessons: number }>();
    if (attendanceType !== 'lesson') return map;
    const currentDay = date.slice(0, 10);
    filteredStudents.forEach((student) => {
      const sale = selectedLessonPackageSalesByStudentId.get(student.id);
      if (!sale) return;
      const studentSales = transactions
        .filter((t) => t.category === 'Özel Ders' && t.studentId === student.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      const usageMap = buildPrivateLessonUsageById(
        studentSales,
        attendanceRecords,
        student.id,
        () => selectedLessonPackage?.lessonCount ?? null,
      );
      const usage = usageMap.get(String(sale.id));
      if (usage) {
        // Recompute with pending today status on top of scoped usage.
        const balance = computePrivateLessonBalance(sale, attendanceRecords, {
          studentId: student.id,
          fallbackTotalLessons: selectedLessonPackage?.lessonCount,
          pendingTodayStatus: attendance[student.id] ?? null,
          todayIso: currentDay,
          allSalesNewestFirst: studentSales,
          carriedInLessons: usage.carriedInLessons ?? 0,
        });
        if (balance) map.set(student.id, balance);
        return;
      }
      const balance = computePrivateLessonBalance(sale, attendanceRecords, {
        studentId: student.id,
        fallbackTotalLessons: selectedLessonPackage?.lessonCount,
        pendingTodayStatus: attendance[student.id] ?? null,
        todayIso: currentDay,
        allSalesNewestFirst: studentSales,
      });
      if (balance) map.set(student.id, balance);
    });
    return map;
  }, [attendanceType, selectedLessonPackage, date, filteredStudents, selectedLessonPackageSalesByStudentId, attendanceRecords, attendance, transactions]);

  const sessionDraftRecord = useMemo(
    () => ({
      lessonId: currentSessionId || undefined,
      attendanceType,
      groupName: group.trim() || undefined,
      branch: branch.trim() || undefined,
      branchOffice: branchOffice.trim() || undefined,
      status: 'absent' as const,
    }),
    [currentSessionId, attendanceType, group, branch, branchOffice],
  );

  const existingSessionRecords = useMemo(() => {
    const dateNorm = date.slice(0, 10);
    return attendanceRecords.filter((record) => {
      if (String(record.date ?? '').slice(0, 10) !== dateNorm) return false;
      return attendanceRecordsShareSession(record, sessionDraftRecord);
    });
  }, [attendanceRecords, date, sessionDraftRecord]);

  const hasExistingSession = existingSessionRecords.length > 0;

  const groupLogEntries = useCallback(
    (groupKey: string) => groupLessonLogs[groupKey] ?? [],
    [groupLessonLogs],
  );

  /** Yoklama listesi: seçilen tarih (ve isteğe bağlı grup) için kayıtlar */
  const listRows = useMemo(() => {
    if (!listFetched) return [];
    const dateNorm = listDate.slice(0, 10);
    const byDate = attendanceRecords.filter((r) => r.date && r.date.slice(0, 10) === dateNorm);
    const studentMap = new Map<string, { id: string; name: string; group?: string }>(students.map((s) => [s.id, s]));
    const rows = new Map<string, {
      key: string;
      date: string;
      time: string;
      group: string;
      attendanceType: 'group' | 'lesson';
      branch: string;
      branchOffice: string;
      teacherName?: string;
      lessonSummary?: string;
      totalCount: number;
      presentCount: number;
      absentCount: number;
      lateCount: number;
      excusedCount: number;
      statuses: Record<string, AttendanceStatus>;
    }>();
    byDate.forEach((r) => {
      const student = studentMap.get(r.studentId);
      const parsed = parseAttendanceSessionId(r.lessonId);
      const groupName = attendanceRecordGroupName(r, student?.group);
      if (listGroup && groupName !== listGroup) return;
      const scopeKey = attendanceRecordSessionScopeKey(r, student?.group);
      const key = `${dateNorm}::${scopeKey || `legacy::${groupName}`}`;
      const existing = rows.get(key) ?? {
        key,
        date: dateNorm,
        time: attendanceRecordTime(r),
        group: groupName,
        attendanceType: attendanceRecordKind(r),
        branch: String(r.branch ?? parsed.branch ?? student?.branch ?? '').trim(),
        branchOffice: String(r.branchOffice ?? parsed.branchOffice ?? student?.branchOffice ?? '').trim(),
        teacherName: r.teacherName,
        lessonSummary: r.lessonSummary,
        totalCount: 0,
        presentCount: 0,
        absentCount: 0,
        lateCount: 0,
        excusedCount: 0,
        statuses: {},
      };
      existing.totalCount += 1;
      const uiStatus = statusToUi(r.status);
      if (uiStatus) existing.statuses[r.studentId] = uiStatus;
      if (r.status === 'present') existing.presentCount += 1;
      else if (r.status === 'late') existing.lateCount += 1;
      else if (r.status === 'excused') existing.excusedCount += 1;
      else existing.absentCount += 1;
      if (!existing.lessonSummary && r.lessonSummary) existing.lessonSummary = r.lessonSummary;
      if (!existing.teacherName && r.teacherName) existing.teacherName = r.teacherName;
      if (existing.time === '—') existing.time = attendanceRecordTime(r);
      rows.set(key, existing);
    });
    return [...rows.values()].sort((a, b) => {
      if (a.time !== b.time) return a.time.localeCompare(b.time, 'tr');
      return a.group.localeCompare(b.group, 'tr');
    });
  }, [attendanceRecords, students, listDate, listGroup, listFetched]);

  const handleListeyiGetir = () => setListFetched(true);

  const closeAnalysisModal = useCallback(() => {
    setAnalysisModal(null);
    setAnalysisError('');
    setAnalysisLoading(false);
    setLichessProfile(null);
    setLichessGames([]);
    setChessComProfile(null);
    setChessComStats(null);
    setChessComGames([]);
  }, []);

  const openAnalysisModal = useCallback(async (student: Student, platform: AnalysisPlatform) => {
    setAnalysisModal({ student, platform });
    setAnalysisLoading(true);
    setAnalysisError('');
    setLichessProfile(null);
    setLichessGames([]);
    setChessComProfile(null);
    setChessComStats(null);
    setChessComGames([]);
    try {
      if (platform === 'lichess') {
        const username = student.lichessUsername?.trim();
        if (!username) {
          setAnalysisError('Öğrenci kartında Lichess kullanıcı adı yok.');
          return;
        }
        const profile = await fetchLichessUser(username);
        if (!profile) {
          setAnalysisError('Lichess profili bulunamadı.');
          return;
        }
        const games = await fetchLichessRecentGames(username, 10);
        setLichessProfile(profile);
        setLichessGames(games ?? []);
      } else {
        const username = student.chessComUsername?.trim();
        if (!username) {
          setAnalysisError('Öğrenci kartında Chess.com kullanıcı adı yok.');
          return;
        }
        const [profile, stats, games] = await Promise.all([
          fetchChessComPlayer(username),
          fetchChessComStats(username),
          fetchChessComRecentGames(username, 10),
        ]);
        if (!profile) {
          setAnalysisError('Chess.com profili bulunamadı.');
          return;
        }
        setChessComProfile(profile);
        setChessComStats(stats);
        setChessComGames(games ?? []);
      }
    } catch {
      setAnalysisError('Analiz verileri alınırken hata oluştu.');
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

 /** Tek seçim (görseldeki gibi radyo benzeri) */
const handleStatus = (id: string, status: AttendanceStatus) => {
   if (!status) return;
   if (status === 'Present' && attendanceType === 'lesson') {
     const balance = privateLessonBalanceByStudentId.get(id);
     const currentStatus = attendance[id] ?? null;
     if (balance && balance.remainingLessons <= 0 && currentStatus !== 'Present') return;
   }
   setAttendance((prev) => ({ ...prev, [id]: status }));
 };

  const blockedPresentStudentIds = useMemo(() => {
    const blocked = new Set<string>();
    if (attendanceType !== 'lesson') return blocked;
    filteredStudents.forEach((student) => {
      const balance = privateLessonBalanceByStudentId.get(student.id);
      const currentStatus = attendance[student.id] ?? null;
      if (balance && balance.remainingLessons <= 0 && currentStatus !== 'Present') {
        blocked.add(student.id);
      }
    });
    return blocked;
  }, [attendanceType, filteredStudents, privateLessonBalanceByStudentId, attendance]);

  const handleStart = () => {
    if (!group || !currentSessionId) return;
    const dateNorm = date.slice(0, 10);
    const existing: Record<string, AttendanceStatus> = {};
    const inGroup = filteredStudents;
    let existingSessionTime = '';
    let editing = false;
    inGroup.forEach((s) => {
      const rec = attendanceRecords.find(
        (r) =>
          r.studentId === s.id &&
          r.date &&
          r.date.slice(0, 10) === dateNorm &&
          attendanceRecordsShareSession(r, sessionDraftRecord)
      );
      if (rec) {
        editing = true;
        if (!existingSessionTime) existingSessionTime = String(rec.sessionTime ?? '').trim();
        if (rec.status === 'present') existing[s.id] = 'Present';
        else if (rec.status === 'absent') existing[s.id] = 'Absent';
        else if (rec.status === 'late') existing[s.id] = 'Late';
        else if (rec.status === 'excused') existing[s.id] = 'Excused';
      }
    });
    setSessionTime(existingSessionTime || sessionTime.trim() || derivedSessionTime);
    setAttendance(existing);
    setIsEditingSession(editing);
    setShowStudents(true);
  };

  useEffect(() => {
    if (!pendingEditBridge) return;
    setViewMode('take');

    if (attendanceType !== pendingEditBridge.attendanceType) {
      setAttendanceType(pendingEditBridge.attendanceType);
      return;
    }
    if (branchOffice !== pendingEditBridge.branchOffice) {
      setBranchOffice(pendingEditBridge.branchOffice);
      return;
    }
    if (branch !== pendingEditBridge.branch) {
      setBranch(pendingEditBridge.branch);
      return;
    }
    if (!secondaryOptions.includes(pendingEditBridge.groupName)) return;
    if (group !== pendingEditBridge.groupName) {
      setGroup(pendingEditBridge.groupName);
      return;
    }
    if (date !== pendingEditBridge.date) {
      setDate(pendingEditBridge.date);
      return;
    }
    if (pendingEditBridge.sessionTime && sessionTime !== pendingEditBridge.sessionTime) {
      setSessionTime(pendingEditBridge.sessionTime);
      return;
    }
    if (!currentSessionId) return;
    handleStart();
    setPendingEditBridge(null);
  }, [
    pendingEditBridge,
    attendanceType,
    branchOffice,
    branch,
    secondaryOptions,
    group,
    date,
    sessionTime,
    currentSessionId,
  ]);

  const handleSetAll = (status: AttendanceStatus) => {
    if (!status) return;
    const next: Record<string, AttendanceStatus> = {};
    filteredStudents.forEach((s) => {
      if (status === 'Present' && blockedPresentStudentIds.has(s.id)) return;
      next[s.id] = status;
    });
    setAttendance(next);
  };

  const handleSave = () => {
    const statusMap = { Present: 'present' as const, Absent: 'absent' as const, Late: 'late' as const, Excused: 'excused' as const };
    const resolvedTime = sessionTime.trim() || derivedSessionTime;
    filteredStudents.forEach((s) => {
      const st = attendance[s.id];
      addAttendanceRecord({
        date,
        studentId: s.id,
        lessonId: currentSessionId || undefined,
        attendanceType,
        groupName: group.trim() || undefined,
        branch: branch.trim() || undefined,
        branchOffice: branchOffice.trim() || undefined,
        sessionTime: resolvedTime,
        status: st ? statusMap[st] : 'absent',
        teacherName: teacherName || undefined,
        lessonSummary: lessonSummary.trim() || undefined,
      });
    });
    setShowStudents(false);
    setIsEditingSession(false);
    setAttendance({});
    setGroup('');
    setExpandedNoteStudentId(null);
    setLessonSummary('');
    setSessionTime('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const presentCount = Object.values(attendance).filter((v) => v === 'Present').length;
  const absentCount = Object.values(attendance).filter((v) => v === 'Absent').length;
  const excusedCount = Object.values(attendance).filter((v) => v === 'Excused').length;

  const openSessionForEdit = useCallback((row: typeof listRows[number]) => {
    setAttendanceType(row.attendanceType);
    setBranchOffice(row.branchOffice);
    setBranch(row.branch);
    setGroup(row.group);
    setDate(row.date);
    setSessionTime(row.time === '—' ? '' : row.time);
    setTeacherName(row.teacherName ?? '');
    setLessonSummary(row.lessonSummary ?? '');
    setAttendance(row.statuses);
    setIsEditingSession(true);
    setShowStudents(true);
    setViewMode('take');
    setListFetched(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

 return (
 <div className="space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-4 md:pb-0">
 {/* Sayfa başlığı + sekmeler */}
 <div className="rounded-2xl border border-white/[0.06] bg-[#1e293b]/80 backdrop-blur-xl px-4 sm:px-5 py-3 sm:py-3.5">
 <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
 <div className="flex items-center gap-2.5 min-w-0">
 <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-400/20 flex items-center justify-center shrink-0">
 <CalendarCheck className="w-4 h-4 text-indigo-300" />
 </div>
 <div className="min-w-0">
 <h1 className="text-base sm:text-xl font-black tracking-tight text-white">Yoklama</h1>
 <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
 Yoklama al veya geçmiş oturumları incele
 </p>
 </div>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <div className="inline-flex flex-1 sm:flex-none rounded-xl bg-slate-950/50 border border-white/[0.06] p-1">
 <button
 type="button"
 onClick={() => { setViewMode('take'); setListFetched(false); }}
 className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'take' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30' : 'text-slate-400 hover:text-slate-200'}`}
 >
 <CalendarCheck className="w-3.5 h-3.5" /> Yoklama Al
 </button>
 <button
 type="button"
 onClick={() => setViewMode('list')}
 className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30' : 'text-slate-400 hover:text-slate-200'}`}
 >
 <List className="w-3.5 h-3.5" /> Liste
 </button>
 </div>
 {showStudents && viewMode === 'take' && (
 <button
 type="button"
 onClick={handleSave}
 className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all active:scale-95 shadow-lg shadow-emerald-900/30"
 >
 <Save className="w-3.5 h-3.5" />
 Kaydet
 </button>
 )}
 </div>
 </div>
 </div>

 {/* Yoklama Listesi görünümü */}
 {viewMode === 'list' && (
 <div className="rounded-2xl border border-white/[0.06] bg-[#1e293b]/75 overflow-hidden">
 <SectionHeader icon={<List className="w-4 h-4" />} title="Yoklama listesi" subtitle="Tarih · grup · ders konuları" />
 <div className="p-3 sm:p-4 space-y-3">
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 items-end">
 <SelectField label="Tarih">
 <input
 type="date"
 value={listDate}
 onChange={(e) => { setListDate(e.target.value); setListFetched(false); }}
 className={fieldInputCls}
 />
 </SelectField>
 <SelectField label="Grup (opsiyonel)">
 <select
 value={listGroup}
 onChange={(e) => { setListGroup(e.target.value); setListFetched(false); }}
 className={fieldInputCls}
 >
 <option value="">Tüm gruplar</option>
 {allGroupNames.map((g) => (
 <option key={g} value={g}>{g}</option>
 ))}
 </select>
 </SelectField>
 <button
 type="button"
 onClick={handleListeyiGetir}
 className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all active:scale-95 shadow-lg shadow-indigo-900/25"
 >
 <RefreshCw className="w-3.5 h-3.5" /> Listeyi Getir
 </button>
 <button
 type="button"
 onClick={() => refreshFromStorage()}
 className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-slate-200 text-xs font-bold transition-all"
 >
 <RefreshCw className="w-3.5 h-3.5" /> Veriyi Yenile
 </button>
 </div>

 {listGroup ? (
   <GroupLessonLogPanel
     groupName={listGroup}
     entries={groupLogEntries(listGroup)}
     onSave={(entries: StudentLessonLogEntry[]) => updateGroupLessonLog(listGroup, entries)}
   />
 ) : (
   <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-2.5 text-[11px] text-slate-500">
     Ders konularını görmek için bir grup seçin.
   </div>
 )}

 {listFetched && (
 <>
 <div className="rounded-lg px-3 py-2 bg-emerald-500/10 text-emerald-300 text-xs font-bold border border-emerald-500/25">
{listDate} {listGroup ? `· ${listGroup}` : ''} — {listRows.length} oturum
 </div>
 {listRows.length === 0 ? (
 <div className="py-10 text-center text-slate-400 rounded-xl border border-dashed border-white/10 text-sm">
 Bu tarih{listGroup ? ` ve grupta` : ''} yoklama kaydı bulunamadı.
 </div>
 ) : (
 <div className="space-y-1.5">
 {listRows.map((row) => (
 <div
 key={row.key}
 className="flex flex-col gap-2.5 px-3.5 py-3 rounded-xl border border-white/[0.06] bg-slate-950/35 hover:bg-white/[0.02] transition-colors md:flex-row md:items-center"
 >
 <div className="min-w-0 flex-1">
 <div className="flex flex-wrap items-center gap-2">
 <span className="font-bold text-white text-sm">{row.group}</span>
 <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
   row.attendanceType === 'lesson'
     ? 'bg-indigo-500/15 text-indigo-300'
     : 'bg-emerald-500/15 text-emerald-300'
 }`}>
   {row.attendanceType === 'lesson' ? 'Ders' : 'Grup'}
 </span>
 </div>
 <div className="mt-0.5 text-[11px] text-slate-500">
   {isoDateToTr(row.date)} · {row.time}
   {row.branch ? ` · ${row.branch}` : ''}
 </div>
 {row.lessonSummary ? (
   <div className="mt-0.5 text-[11px] text-slate-500 line-clamp-1">{row.lessonSummary}</div>
 ) : null}
 </div>
 <div className="flex flex-wrap items-center gap-1.5">
   <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-300">{row.presentCount} Var</span>
   <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-300">{row.absentCount} Yok</span>
   {row.lateCount > 0 ? (
     <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300">{row.lateCount} Geç</span>
   ) : null}
   {row.excusedCount > 0 ? (
     <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/15 text-sky-300">{row.excusedCount} İzinli</span>
   ) : null}
 </div>
 <button
   type="button"
   onClick={() => openSessionForEdit(row)}
   className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-xs font-bold text-indigo-200 hover:bg-indigo-500/20 transition-all"
 >
   <ClipboardList className="w-3.5 h-3.5" />
   Düzenle
 </button>
 </div>
 ))}
 </div>
 )}
 </>
 )}
 </div>
 </div>
 )}

 {viewMode !== 'list' && (
 <>
 {/* Filtre kartı */}
 <div className="rounded-2xl border border-white/[0.06] bg-[#1e293b]/75 overflow-hidden">
 <SectionHeader
 icon={<CalendarCheck className="w-4 h-4" />}
 title="Yoklama seçimi"
 subtitle="Tip · şube · grup · tarih"
 />

 <div className="p-3 sm:p-4 space-y-3">
 {/* Yoklama Tipi */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
 <button
 type="button"
 onClick={() => setAttendanceType('group')}
 className={`inline-flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left font-bold text-sm transition-all active:scale-[0.99] ${
 attendanceType === 'group'
 ? 'border border-indigo-500/40 bg-indigo-500/15 text-white ring-1 ring-indigo-500/20'
 : 'border border-white/[0.06] bg-slate-950/40 text-slate-300 hover:border-indigo-500/25'
 }`}
 >
 <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${attendanceType === 'group' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
   <Check className="w-4 h-4" />
 </span>
 <span className="min-w-0">
   <span className="block">Grup Bazlı</span>
   <span className={`block text-[11px] font-medium ${attendanceType === 'group' ? 'text-indigo-200/80' : 'text-slate-500'}`}>Eğitim grubu yoklaması</span>
 </span>
 </button>
 <button
 type="button"
 onClick={() => setAttendanceType('lesson')}
 className={`inline-flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left font-bold text-sm transition-all active:scale-[0.99] ${
 attendanceType === 'lesson'
 ? 'border border-indigo-500/40 bg-indigo-500/15 text-white ring-1 ring-indigo-500/20'
 : 'border border-white/[0.06] bg-slate-950/40 text-slate-300 hover:border-indigo-500/25'
 }`}
 >
 <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${attendanceType === 'lesson' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
   <CalendarCheck className="w-4 h-4" />
 </span>
 <span className="min-w-0">
   <span className="block">Ders Bazlı</span>
   <span className={`block text-[11px] font-medium ${attendanceType === 'lesson' ? 'text-indigo-200/80' : 'text-slate-500'}`}>Özel ders / paket (hak düşer)</span>
 </span>
 </button>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
 {/* Şube */}
 <SelectField label="Şube">
 <select
 value={branchOffice}
 onChange={(e) => { setBranchOffice(e.target.value); setSessionTime(''); }}
 className={fieldInputCls}
 >
 <option value="">Şube Seçiniz</option>
 {attendanceBranchOffices.map((b) => (
 <option key={b} value={b}>{b}</option>
 ))}
 </select>
 {attendanceBranchOffices.length === 0 && (
 <p className="mt-1 text-[10px] text-amber-400/90">
 Tanımlı şube yok. Branş & Grup’tan ekleyin.
 </p>
 )}
 </SelectField>

 {/* Branş */}
 <SelectField label="Branş">
 <select
 value={branch}
 onChange={(e) => { setBranch(e.target.value); setSessionTime(''); }}
 className={fieldInputCls}
 >
 <option value="">Branş Seçiniz</option>
 {attendanceDisciplines.map((b) => (
 <option key={b} value={b}>{b}</option>
 ))}
 </select>
 {branchOffice && attendanceDisciplines.length === 0 && (
 <p className="mt-1 text-[10px] text-amber-400/90">
 {attendanceType === 'lesson'
   ? 'Bu şubede ders paketi yok.'
   : 'Bu şubede grup branşı yok.'}
 </p>
 )}
 </SelectField>

 {/* Grup / Paket */}
 <SelectField label={attendanceType === 'lesson' ? 'Paket' : 'Grup'}>
 <select
 value={group}
 onChange={(e) => { setGroup(e.target.value); setSessionTime(''); }}
 className={fieldInputCls}
 >
 <option value="">{attendanceType === 'lesson' ? 'Paket Seçiniz' : 'Grup Seçiniz'}</option>
 {secondaryOptions.map((g) => (
 <option key={g} value={g}>{g}</option>
 ))}
 </select>
 {secondaryOptions.length === 0 && branch && (
 <p className="mt-1 text-[10px] text-amber-400/90">
 {attendanceType === 'lesson'
   ? 'Bu branşta ders paketi yok.'
   : 'Bu branşta grup yok.'}
 </p>
 )}
 </SelectField>

 {/* Tarih */}
 <SelectField label="Tarih">
 <input
 type="date"
 value={date}
 onChange={(e) => { setDate(e.target.value); setSessionTime(''); }}
 className={fieldInputCls}
 />
 </SelectField>

 {/* Öğretmen */}
 <SelectField label="Öğretmen / Antrenör" icon={<UserCheck className="w-3.5 h-3.5" />} className="sm:col-span-2 xl:col-span-2">
 <select
 value={teacherName}
 onChange={(e) => setTeacherName(e.target.value)}
 className={fieldInputCls}
 >
 <option value="">Antrenör Seçiniz</option>
 {attendanceCoaches.map((c) => (
 <option key={c.id} value={c.name}>{c.name}{c.title ? ` · ${c.title}` : ''}</option>
 ))}
 </select>
 {attendanceCoaches.length === 0 && branchOffice && (
 <p className="mt-1 text-[10px] text-amber-400/90">
 Bu kulüpte antrenör yok.
 </p>
 )}
 </SelectField>
 </div>

 {group && attendanceType === 'group' ? (
   <GroupLessonLogPanel
     groupName={group}
     entries={groupLogEntries(group)}
     onSave={(entries: StudentLessonLogEntry[]) => updateGroupLessonLog(group, entries)}
     compact
   />
 ) : null}

 {/* Devam butonu */}
 {!showStudents && (
<div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-1">
{hasExistingSession ? (
  <div className="flex-1 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-200">
    Bu tarih için yoklama var — başlatınca düzenleme açılır.
  </div>
) : null}
 <button
 type="button"
 onClick={handleStart}
disabled={!currentSessionId}
 className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-all active:scale-95 shadow-lg shadow-indigo-900/25 shrink-0"
 >
 <CalendarCheck className="w-4 h-4" />
 {hasExistingSession ? 'Yoklamayı Düzenle' : 'Yoklamayı Başlat'}
 </button>
 </div>
 )}
 </div>
 </div>

 {/* Öğrenci yoklama listesi */}
 {showStudents && (
 <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
 <div className="rounded-2xl border border-indigo-400/25 bg-gradient-to-r from-indigo-600/25 via-indigo-500/10 to-transparent px-3.5 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2.5">
 <div className="font-bold tracking-tight text-sm text-white min-w-0">
   <span className="text-slate-300 font-medium">{attendanceType === 'lesson' ? 'Paket' : 'Grup'}</span>
   {' · '}
   {group}
   {attendanceType === 'lesson' && selectedLessonPackage ? (
     <span className="text-indigo-200/80 font-medium"> · {selectedLessonPackage.lessonCount} ders</span>
   ) : null}
   <div className="text-[11px] text-slate-400 font-medium mt-0.5 truncate">
     {branchOffice}{branch ? ` · ${branch}` : ''}
   </div>
  {isEditingSession ? (
    <span className="mt-1 inline-flex items-center rounded-md bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
      Düzenleme
    </span>
  ) : null}
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <div className="inline-flex items-center gap-2 rounded-lg bg-slate-950/40 border border-white/10 px-2.5 py-1.5">
   <Calendar className="w-3.5 h-3.5 text-indigo-300 shrink-0" aria-hidden />
   <input
     type="date"
     value={date}
     onChange={(e) => { setDate(e.target.value); setSessionTime(''); }}
     className="bg-transparent border-none outline-none text-xs font-semibold text-white min-w-0 max-w-[10rem] [color-scheme:dark]"
     aria-label="Yoklama tarihi"
   />
 </div>
 <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950/40 border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-slate-200">
  {sessionTime.trim() || derivedSessionTime || '—'}
 </div>
 </div>
 </div>

 <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-0.5 px-0.5 pb-0.5">
 <button type="button" onClick={() => handleSetAll('Present')} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all">
   <Check className="w-3.5 h-3.5" /> Tümü Katıldı
 </button>
 <button type="button" onClick={() => handleSetAll('Absent')} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all">
   <X className="w-3.5 h-3.5" /> Tümü Katılmadı
 </button>
 <button type="button" onClick={() => handleSetAll('Excused')} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all">
   <UserCheck className="w-3.5 h-3.5" /> Tümü İzinli
 </button>
 </div>

 <div className="rounded-xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm px-3 sm:px-4 py-3 space-y-3">
 <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
 <span className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20 text-center sm:text-left">{presentCount} Katıldı</span>
 <span className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-[10px] font-bold border border-rose-500/20 text-center sm:text-left">{absentCount} Katılmadı</span>
 <span className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-[10px] font-bold border border-amber-500/20 text-center sm:text-left">{excusedCount} İzinli</span>
 <span className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] text-slate-400 text-[10px] font-bold border border-white/[0.06] text-center sm:text-left col-span-2 sm:col-span-1">{Math.max(0, filteredStudents.length - presentCount - absentCount - excusedCount)} seçilmedi</span>
{attendanceType === 'lesson' && blockedPresentStudentIds.size > 0 ? (
  <span className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 text-[10px] font-bold border border-amber-500/20 text-center sm:text-left col-span-2 sm:col-span-1">
    {blockedPresentStudentIds.size} öğrencinin hakkı bitti
  </span>
) : null}
 </div>
 <button type="button" className="w-full sm:w-auto sm:ml-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-wide transition-all min-h-[44px]">
 <MessageCircle className="w-3.5 h-3.5" /> Velilere Bildir
 </button>
 </div>

 {filteredStudents.length === 0 ? (
 <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center">
 <CalendarCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
 <p className="text-slate-400 font-medium">Bu grupta öğrenci bulunamadı.</p>
 </div>
 ) : (
 <>
 <div className="space-y-2">
 {/* Mobil: kompakt öğrenci kartları */}
 <div className="md:hidden space-y-2">
 {filteredStudents.map((student, idx) => {
 const s = attendance[student.id] ?? null;
const isPresentBlocked = blockedPresentStudentIds.has(student.id);
 const noteOpen = expandedNoteStudentId === student.id;
 const noteCount = student.lessonLog?.length ?? 0;
 return (
 <div
 key={student.id}
className={`rounded-xl border p-3 space-y-2.5 transition-colors ${attendanceCardAccent(s)} ${isPresentBlocked ? 'ring-1 ring-amber-500/20' : ''}`}
 >
 <div className="flex items-start gap-2.5">
 <span className="text-[10px] font-bold text-slate-500 w-4 pt-2 tabular-nums shrink-0">{idx + 1}</span>
 <StudentPhoto name={student.name} photoUrl={student.photoUrl} sizeClass="w-10 h-10" onZoom={setZoomedPhoto} />
 <div className="flex-1 min-w-0">
 <div className="font-semibold text-white text-sm leading-tight">{student.name}</div>
{student.group ? <div className="text-[10px] text-slate-500 mt-0.5">{student.group}</div> : null}
{attendanceType === 'lesson' && privateLessonBalanceByStudentId.get(student.id) ? (
  <div className={`mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${isPresentBlocked ? 'border border-amber-500/25 bg-amber-500/10 text-amber-200' : 'border border-indigo-500/20 bg-indigo-500/10 text-indigo-200'}`}>
    Kalan {privateLessonBalanceByStudentId.get(student.id)?.remainingLessons}/{privateLessonBalanceByStudentId.get(student.id)?.totalLessons} ders
  </div>
) : null}
{isPresentBlocked ? (
  <div className="mt-1 text-[10px] font-bold text-amber-300">Paket hakkı bitti</div>
) : null}
 <div className="mt-2">
 <AnalysisPlatformButtons
 student={student}
 onLichess={() => openAnalysisModal(student, 'lichess')}
 onChessCom={() => openAnalysisModal(student, 'chesscom')}
 compact
 />
 </div>
 </div>
 <button
 type="button"
 onClick={() => setExpandedNoteStudentId(noteOpen ? null : student.id)}
 className={`shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-bold transition-all min-h-[36px] ${noteOpen ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300' : 'border-white/10 bg-white/[0.02] text-slate-400'}`}
 title="Öğrenciye özel ders notu"
 >
 <ClipboardList className="w-3.5 h-3.5" />
 <span>{noteCount || '—'}</span>
 {noteOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
 </button>
 </div>
 <AttendanceStatusButtons
 status={s}
 onPresent={() => handleStatus(student.id, 'Present')}
 onAbsent={() => handleStatus(student.id, 'Absent')}
 onExcused={() => handleStatus(student.id, 'Excused')}
 layout="grid"
disablePresent={isPresentBlocked}
 />
 {noteOpen ? (
 <div className="pt-1 border-t border-white/[0.06]">
 <StudentLessonLogInline
 student={student}
 defaultDate={isoDateToTr(date)}
 onSave={(entries) => updateStudent(student.id, { lessonLog: entries })}
 />
 </div>
 ) : null}
 </div>
 );
 })}
 </div>

 {/* Masaüstü: tablo */}
 <div className="hidden md:block rounded-xl border border-white/[0.06] bg-[#1e293b]/50 overflow-hidden ring-1 ring-indigo-500/5">
 <ResponsiveTable minWidth={860} className="custom-scrollbar">
 <table className="w-full text-left text-sm">
 <thead>
 <tr className="bg-slate-900/80 border-b border-white/[0.06] text-slate-400 text-[10px] uppercase tracking-wider">
 <th className="px-3 py-3 font-bold text-center w-10">No</th>
 <th className="px-3 py-3 font-bold text-center w-14">Foto</th>
 <th className="px-3 py-3 font-bold min-w-[160px]">Öğrenci</th>
 <th className="px-3 py-3 font-bold text-center min-w-[160px]">Analiz</th>
 <th className="px-3 py-3 font-bold text-center min-w-[240px]">Yoklama</th>
 <th className="px-3 py-3 font-bold text-center w-24">Not</th>
 </tr>
 </thead>
 <tbody>
 {filteredStudents.map((student, idx) => {
 const s = attendance[student.id] ?? null;
const isPresentBlocked = blockedPresentStudentIds.has(student.id);
 const noteOpen = expandedNoteStudentId === student.id;
 const noteCount = student.lessonLog?.length ?? 0;
 return (
 <React.Fragment key={student.id}>
<tr className={`border-b border-white/[0.04] hover:bg-indigo-500/[0.04] transition-colors ${isPresentBlocked ? 'bg-amber-500/[0.03]' : ''}`}>
 <td data-label="No" className="px-3 py-3 text-center text-slate-500 font-semibold tabular-nums text-xs">{idx + 1}</td>
 <td data-label="Foto" className="px-3 py-3">
 <div className="flex justify-center">
 <StudentPhoto name={student.name} photoUrl={student.photoUrl} onZoom={setZoomedPhoto} />
 </div>
 </td>
 <td data-label="Öğrenci" className="px-3 py-3">
<div className="font-semibold text-white text-sm">{student.name}</div>
{student.group ? <div className="text-[10px] text-slate-500 mt-0.5">{student.group}</div> : null}
{attendanceType === 'lesson' && privateLessonBalanceByStudentId.get(student.id) ? (
  <div className={`mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${isPresentBlocked ? 'border border-amber-500/25 bg-amber-500/10 text-amber-200' : 'border border-indigo-500/20 bg-indigo-500/10 text-indigo-200'}`}>
    Kalan {privateLessonBalanceByStudentId.get(student.id)?.remainingLessons}/{privateLessonBalanceByStudentId.get(student.id)?.totalLessons} ders
  </div>
) : null}
{isPresentBlocked ? <div className="mt-1 text-[10px] font-bold text-amber-300">Paket hakkı bitti</div> : null}
 </td>
 <td data-label="Analiz" className="px-3 py-3">
 <AnalysisPlatformButtons
 student={student}
 onLichess={() => openAnalysisModal(student, 'lichess')}
 onChessCom={() => openAnalysisModal(student, 'chesscom')}
 />
 </td>
 <td data-label="Yoklama" className="px-3 py-3">
 <AttendanceStatusButtons
 status={s}
 onPresent={() => handleStatus(student.id, 'Present')}
 onAbsent={() => handleStatus(student.id, 'Absent')}
 onExcused={() => handleStatus(student.id, 'Excused')}
disablePresent={isPresentBlocked}
 />
 </td>
 <td data-label="Not" className="px-3 py-3 text-center">
 <button
 type="button"
 onClick={() => setExpandedNoteStudentId(noteOpen ? null : student.id)}
 className={`inline-flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${noteOpen ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300' : 'border-white/10 bg-white/[0.02] text-slate-400 hover:text-indigo-300 hover:border-indigo-500/30'}`}
 title="Öğrenciye özel ders notu"
 >
 <ClipboardList className="w-3.5 h-3.5" />
 <span>{noteCount || '—'}</span>
 {noteOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
 </button>
 </td>
 </tr>
 {noteOpen ? (
 <tr className="border-b border-white/[0.04] bg-[#0f172a]/40">
 <td colSpan={6} className="px-4 py-3">
 <StudentLessonLogInline
 student={student}
 defaultDate={isoDateToTr(date)}
 onSave={(entries) => updateStudent(student.id, { lessonLog: entries })}
 />
 </td>
 </tr>
 ) : null}
 </React.Fragment>
 );
 })}
 </tbody>
 </table>
 </ResponsiveTable>
 </div>
 </div>
 </>
 )}

 {filteredStudents.length > 0 && (
 <div className="rounded-xl border border-white/[0.06] bg-[#0f172a]/50 overflow-hidden">
 <div className="px-5 py-3 border-b border-white/[0.06] bg-indigo-500/[0.06]">
 <div className="text-sm font-bold text-white">Günlük ders özeti</div>
 <p className="text-[11px] text-slate-500 mt-0.5">Tüm gruba ortak kısa not (yoklama kaydına eklenir)</p>
 </div>
 <div className="p-4">
 <textarea
 value={lessonSummary}
 onChange={(e) => setLessonSummary(e.target.value)}
 placeholder="Bu derste işlenen konular, yapılan aktiviteler..."
 rows={3}
 className="input-base w-full rounded-xl resize-none text-sm"
 />
 </div>
 </div>
 )}

 {/* Alt kaydet butonu */}
 {filteredStudents.length > 0 && (
 <div className="flex justify-stretch md:justify-end">
 <button
 type="button"
 onClick={handleSave}
 className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 md:py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm transition-all active:scale-95 shadow-xl shadow-indigo-500/20 min-h-[48px]"
 >
 <Save className="w-4 h-4" />
 {isEditingSession ? 'Yoklamayı Güncelle' : 'Yoklamayı Kaydet'}
 </button>
 </div>
 )}
 </div>
 )}
 </>
 )}
  {zoomedPhoto && (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
      onClick={() => setZoomedPhoto(null)}
    >
      <div className="relative max-w-3xl max-h-[90vh] w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setZoomedPhoto(null)}
          className="absolute -top-2 -right-2 z-10 p-2 rounded-full bg-slate-800 hover:bg-indigo-600/80 text-white transition-colors shadow-xl"
          aria-label="Kapat"
        >
          <X className="w-6 h-6" />
        </button>
        <img
          src={zoomedPhoto.url}
          alt={zoomedPhoto.name}
          className="max-w-full max-h-[80vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
          referrerPolicy="no-referrer"
        />
        <p className="mt-4 text-lg font-bold text-white">{zoomedPhoto.name}</p>
      </div>
    </div>
  )}
  {analysisModal && (
    <div className="modal-overlay z-[70]">
      <div className="modal-panel w-full max-w-5xl overflow-hidden rounded-t-2xl sm:rounded-xl border border-slate-700 bg-white shadow-2xl">
        <div className={`px-4 py-3 flex items-center justify-between text-white ${analysisModal.platform === 'lichess' ? 'bg-black' : 'bg-[#5f8f3f]'}`}>
          <div className="font-bold text-sm">
            {analysisModal.student.name} - {analysisModal.platform === 'lichess' ? 'Lichess Analizi' : 'Chess.com Analizi'}
          </div>
          <button type="button" onClick={closeAnalysisModal} className="p-1 rounded hover:bg-white/20">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="modal-scroll-body p-4 md:p-6 text-slate-900">
          {analysisLoading ? (
            <div className="py-16 text-center text-slate-600">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
              Analiz verileri yükleniyor...
            </div>
          ) : analysisError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">{analysisError}</div>
          ) : analysisModal.platform === 'lichess' && lichessProfile ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-black">{lichessProfile.username.slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="font-black text-lg">{analysisModal.student.name}</div>
                  <div className="text-xs text-slate-600">@{lichessProfile.username}</div>
                </div>
                <a href={lichessProfileUrl(lichessProfile.username)} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-indigo-600 underline">Lichess Profili</a>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="rounded-lg border border-slate-200 p-3 text-center"><div className="text-xs text-slate-500">Bullet</div><div className="font-black text-xl">{lichessProfile.perfs?.bullet?.rating ?? '-'}</div></div>
                <div className="rounded-lg border border-slate-200 p-3 text-center"><div className="text-xs text-slate-500">Blitz</div><div className="font-black text-xl">{lichessProfile.perfs?.blitz?.rating ?? '-'}</div></div>
                <div className="rounded-lg border border-slate-200 p-3 text-center"><div className="text-xs text-slate-500">Rapid</div><div className="font-black text-xl">{lichessProfile.perfs?.rapid?.rating ?? '-'}</div></div>
                <div className="rounded-lg border border-slate-200 p-3 text-center"><div className="text-xs text-slate-500">Bulmaca</div><div className="font-black text-xl">{lichessProfile.perfs?.puzzle?.rating ?? '-'}</div></div>
                <div className="rounded-lg border border-slate-200 p-3 text-center"><div className="text-xs text-slate-500">Toplam Oyun</div><div className="font-black text-xl">{lichessProfile.count?.all ?? '-'}</div></div>
                <div className="rounded-lg border border-slate-200 p-3 text-center"><div className="text-xs text-slate-500">Kazanma Oranı</div><div className="font-black text-xl">{(lichessProfile.count?.all && lichessProfile.count?.win != null) ? `%${Math.round((lichessProfile.count.win / Math.max(1, lichessProfile.count.all)) * 100)}` : '-'}</div></div>
              </div>
              <div className="rounded-xl border border-slate-200">
                <div className="px-4 py-3 border-b border-slate-200 text-sm font-bold">Son Oyunlar</div>
                <div className="p-4 space-y-2">
                  {lichessGames.length === 0 ? <div className="text-sm text-slate-500">Henüz oyun bulunamadı.</div> : lichessGames.map((g) => (
                    <div key={g.id} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm flex flex-wrap gap-2 items-center">
                      <span className="font-semibold">{g.perf || g.speed || 'oyun'}</span>
                      <span className="text-slate-500">{g.opening?.name || 'Acilis bilgisi yok'}</span>
                      <span className="ml-auto text-xs text-slate-500">{formatMsDate(g.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : analysisModal.platform === 'chesscom' && chessComProfile ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-4 bg-[#5f8f3f]/10">
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center font-black">{chessComProfile.username.slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="font-black text-lg">{analysisModal.student.name}</div>
                  <div className="text-xs text-slate-700">@{chessComProfile.username}</div>
                </div>
                <a href={chessComProfileUrl(chessComProfile.username)} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-indigo-700 underline">Chess.com Profili</a>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-slate-200 p-3 text-center"><div className="text-xs text-slate-500">Rapid</div><div className="font-black text-xl">{chessComStats?.chess_rapid?.last?.rating ?? '-'}</div></div>
                <div className="rounded-lg border border-slate-200 p-3 text-center"><div className="text-xs text-slate-500">Blitz</div><div className="font-black text-xl">{chessComStats?.chess_blitz?.last?.rating ?? '-'}</div></div>
                <div className="rounded-lg border border-slate-200 p-3 text-center"><div className="text-xs text-slate-500">Bullet</div><div className="font-black text-xl">{chessComStats?.chess_bullet?.last?.rating ?? '-'}</div></div>
                <div className="rounded-lg border border-slate-200 p-3 text-center"><div className="text-xs text-slate-500">Taktik</div><div className="font-black text-xl">{chessComStats?.tactics?.highest?.rating ?? '-'}</div></div>
              </div>
              <div className="rounded-xl border border-slate-200">
                <div className="px-4 py-3 border-b border-slate-200 text-sm font-bold">Son Oyunlar</div>
                <div className="p-4 space-y-2">
                  {chessComGames.length === 0 ? <div className="text-sm text-slate-500">Henüz oyun bulunamadı.</div> : chessComGames.map((g, i) => (
                    <div key={g.uuid || g.url || i} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm flex flex-wrap gap-2 items-center">
                      <span className="font-semibold">{g.time_class || g.time_control || 'oyun'}</span>
                      <span className="text-slate-500">vs {g.white?.username || '?'} - {g.black?.username || '?'}</span>
                      <span className="ml-auto text-xs text-slate-500">{formatUnixDate(g.end_time)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Veri bulunamadı.</div>
          )}
        </div>
      </div>
    </div>
  )}
 </div>
 );
};

export default Attendance;
