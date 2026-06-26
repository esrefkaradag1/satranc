import React, { useCallback, useMemo, useState } from 'react';
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
import { TEACHERS } from '../constants';
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
import { mergeGroupLessonLogsFromStudents, isoDateToTr } from '../lib/lessonLogUtils';
import { findTrainingGroupByName, studentsInTrainingGroup } from '../lib/trainingGroupUtils';
import { StudentLessonLogInline } from './attendance/StudentLessonLogInline';
import { ResponsiveTable } from './ui/ResponsiveTable';

const BRANCHES = ['Satranç', 'Robotik', 'Kodlama', 'DENEME'];
const BRANCH_OFFICES = ['Merkez', 'Çayyolu', 'Ümitköy', 'AFYON SATRANÇ'];

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

/* ── Alt bileşenler ─────────────────────────────────────────── */

const SectionHeader: React.FC<{
 icon: React.ReactNode;
 title: string;
 subtitle?: string;
}> = ({ icon, title, subtitle }) => (
 <div className="premium-gradient rounded-lg px-6 py-4 flex items-center gap-3 shadow-lg shadow-indigo-500/10">
 <div className="text-white/90">{icon}</div>
 <div>
 <div className="text-white font-black tracking-tight">{title}</div>
 {subtitle && <div className="text-white/70 text-xs font-medium">{subtitle}</div>}
 </div>
 </div>
);

const SelectField: React.FC<{
 label: string;
 icon?: React.ReactNode;
 children: React.ReactNode;
}> = ({ label, icon, children }) => (
 <div className="space-y-2">
 <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
 {icon && <span className="text-indigo-600">{icon}</span>}
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
}> = ({ status, onPresent, onAbsent, onExcused, layout = 'row' }) => {
 const wrap = layout === 'grid'
   ? 'grid grid-cols-3 gap-1.5'
   : 'flex flex-wrap items-center justify-center gap-1.5';
 const btn = layout === 'grid'
   ? 'flex flex-col items-center justify-center min-h-[44px] py-2 px-1 rounded-lg border text-[10px] font-bold transition-all'
   : 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all';
 return (
   <div className={wrap}>
     <button type="button" onClick={onPresent} className={`${btn} ${status === 'Present' ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300' : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-emerald-500/30'}`}>
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

function attendanceCardAccent(status: AttendanceStatus): string {
 if (status === 'Present') return 'border-emerald-500/35 bg-emerald-500/[0.05]';
 if (status === 'Absent') return 'border-rose-500/35 bg-rose-500/[0.05]';
 if (status === 'Excused') return 'border-amber-500/35 bg-amber-500/[0.05]';
 return 'border-white/[0.06] bg-[#1e293b]/50';
}

/* ── Ana sayfa ─────────────────────────────────────────────── */

type ViewMode = 'take' | 'list';

const STATUS_LABELS: Record<string, string> = {
  present: 'Geldi',
  absent: 'Gelmedi',
  late: 'Geç',
  excused: 'İzinli',
};

function formatUnixDate(sec?: number): string {
  if (!sec) return '—';
  return new Date(sec * 1000).toLocaleDateString('tr-TR');
}

function formatMsDate(ms?: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('tr-TR');
}

const Attendance: React.FC = () => {
  const {
    scopedStudents: students,
    addAttendanceRecord,
    attendanceRecords,
    trainingGroups,
    refreshFromStorage,
    groupLessonLogs,
    updateGroupLessonLog,
    updateStudent,
  } = useApp();

  const [viewMode, setViewMode] = useState<ViewMode>('take');
  const [attendanceType, setAttendanceType] = useState<'group' | 'lesson'>('group');
  const [branchOffice, setBranchOffice] = useState(BRANCH_OFFICES[0]);
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [group, setGroup] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [teacherName, setTeacherName] = useState('');
  const [showStudents, setShowStudents] = useState(false);
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

  /** Yalnızca Branş & Grup'ta tanımlı aktif gruplar (silinen gruplar listelenmez) */
  const groups = useMemo(() => {
    const names = [...new Set(trainingGroups.map((g) => g.name.trim()).filter(Boolean))];
    return names.sort((a, b) => a.localeCompare(b, 'tr'));
  }, [trainingGroups]);

  const selectedTrainingGroup = useMemo(
    () => findTrainingGroupByName(trainingGroups, group, { branchOffice, discipline: branch }),
    [trainingGroups, group, branchOffice, branch],
  );

  const filteredStudents = useMemo(() => {
    if (!group.trim()) return [];
    if (selectedTrainingGroup) return studentsInTrainingGroup(students, selectedTrainingGroup);
    return students.filter((s) => (s.group ?? '').trim() === group.trim());
  }, [students, group, selectedTrainingGroup]);

  const groupLogEntries = useCallback(
    (groupKey: string) =>
      mergeGroupLessonLogsFromStudents(groupKey, students, groupLessonLogs[groupKey] ?? []),
    [students, groupLessonLogs],
  );

  /** Yoklama listesi: seçilen tarih (ve isteğe bağlı grup) için kayıtlar */
  const listRows = useMemo(() => {
    if (!listFetched) return [];
    const dateNorm = listDate.slice(0, 10);
    const byDate = attendanceRecords.filter((r) => r.date && r.date.slice(0, 10) === dateNorm);
    const studentMap = new Map<string, { id: string; name: string; group?: string }>(students.map((s) => [s.id, s]));
    const rows: { studentId: string; name: string; group: string; status: string }[] = [];
    byDate.forEach((r) => {
      const student = studentMap.get(r.studentId);
      if (listGroup && student && (student.group ?? '') !== listGroup) return;
      rows.push({
        studentId: r.studentId,
        name: student ? student.name : r.studentId,
        group: student ? (student.group || '—') : '—',
        status: r.status || 'absent',
      });
    });
    return rows.sort((a, b) => a.name.localeCompare(b.name));
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
        const [profile, games] = await Promise.all([fetchLichessUser(username), fetchLichessRecentGames(username, 10)]);
        if (!profile) {
          setAnalysisError('Lichess profili bulunamadı.');
          return;
        }
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
   setAttendance((prev) => ({ ...prev, [id]: status }));
  const statusMap = { Present: 'present' as const, Absent: 'absent' as const, Late: 'late' as const, Excused: 'excused' as const };
  void addAttendanceRecord({
    date,
    studentId: id,
    status: statusMap[status],
    teacherName: teacherName || undefined,
    lessonSummary: lessonSummary.trim() || undefined,
  });
 };

  const handleStart = () => {
    if (!group) return;
    const dateNorm = date.slice(0, 10);
    const existing: Record<string, AttendanceStatus> = {};
    const inGroup = selectedTrainingGroup
      ? studentsInTrainingGroup(students, selectedTrainingGroup)
      : students.filter((s) => (s.group ?? '').trim() === group.trim());
    inGroup.forEach((s) => {
      const rec = attendanceRecords.find(
        (r) => r.studentId === s.id && r.date && r.date.slice(0, 10) === dateNorm
      );
      if (rec) {
        if (rec.status === 'present') existing[s.id] = 'Present';
        else if (rec.status === 'absent') existing[s.id] = 'Absent';
        else if (rec.status === 'late') existing[s.id] = 'Present';
        else if (rec.status === 'excused') existing[s.id] = 'Excused';
      }
    });
    setAttendance(existing);
    setShowStudents(true);
  };

  const handleSetAll = (status: AttendanceStatus) => {
    if (!status) return;
    const next: Record<string, AttendanceStatus> = {};
    filteredStudents.forEach((s) => { next[s.id] = status; });
    setAttendance(next);
  };

  const handleSave = () => {
    const statusMap = { Present: 'present' as const, Absent: 'absent' as const, Late: 'late' as const, Excused: 'excused' as const };
    filteredStudents.forEach((s) => {
      const st = attendance[s.id];
      addAttendanceRecord({
        date,
        studentId: s.id,
        status: st ? statusMap[st] : 'absent',
        teacherName: teacherName || undefined,
        lessonSummary: lessonSummary.trim() || undefined,
      });
    });
    setShowStudents(false);
    setAttendance({});
    setLessonSummary('');
  };

  const presentCount = Object.values(attendance).filter((v) => v === 'Present').length;
  const absentCount = Object.values(attendance).filter((v) => v === 'Absent').length;
  const excusedCount = Object.values(attendance).filter((v) => v === 'Excused').length;

 return (
 <div className="space-y-4 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-4 md:pb-0">
 {/* Sayfa başlığı + sekmeler */}
 <div className="premium-gradient rounded-lg px-4 sm:px-8 py-4 sm:py-6 shadow-xl shadow-indigo-500/10">
 <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-4">
 <div className="flex items-center gap-4">
 <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
 <CalendarCheck className="w-6 h-6 text-white" />
 </div>
 <div>
 <h1 className="text-2xl font-black tracking-tight text-white">Yoklama</h1>
 <p className="text-white/80 text-sm mt-0.5">
 Yoklama alın veya geçmiş yoklama listesini görüntüleyin
 </p>
 </div>
 </div>
 <div className="inline-flex w-full sm:w-auto rounded-lg bg-white/10 p-1">
 <button
 type="button"
 onClick={() => { setViewMode('take'); setListFetched(false); }}
 className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-bold transition-all ${viewMode === 'take' ? 'bg-white text-indigo-700' : 'text-white/80 hover:text-white'}`}
 >
 <CalendarCheck className="w-4 h-4" /> Yoklama Al
 </button>
 <button
 type="button"
 onClick={() => setViewMode('list')}
 className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-bold transition-all ${viewMode === 'list' ? 'bg-white text-indigo-700' : 'text-white/80 hover:text-white'}`}
 >
 <List className="w-4 h-4" /> Yoklama Listesi
 </button>
 </div>
 {showStudents && viewMode === 'take' && (
 <button
 type="button"
 onClick={handleSave}
 className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1e293b] text-indigo-700 font-black text-sm transition-all hover:bg-white/90 active:scale-95 shadow-lg"
 >
 <Save className="w-4 h-4" />
 Yoklamayı Kaydet
 </button>
 )}
 </div>
 </div>

 {/* Yoklama Listesi görünümü */}
 {viewMode === 'list' && (
 <div className="bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg border border-slate-700/60 overflow-hidden">
 <SectionHeader icon={<List className="w-5 h-5" />} title="Yoklama Yapılan Listesi" subtitle="Tarih ile yoklama; grup seçince ders konuları aşağıda görünür" />
 <div className="p-6 space-y-4">
 <div className="flex flex-wrap items-end gap-4">
 <SelectField label="Tarih">
 <input
 type="date"
 value={listDate}
 onChange={(e) => { setListDate(e.target.value); setListFetched(false); }}
 className="w-full px-5 py-4 rounded-lg bg-[#1e293b] border border-slate-700/60 text-white font-medium focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all"
 />
 </SelectField>
 <SelectField label="Grup (opsiyonel)">
 <select
 value={listGroup}
 onChange={(e) => { setListGroup(e.target.value); setListFetched(false); }}
 className="w-full min-w-[180px] px-5 py-4 rounded-lg bg-[#1e293b] border border-slate-700/60 text-white font-medium focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all"
 >
 <option value="">Tüm gruplar</option>
 {groups.map((g) => (
 <option key={g} value={g}>{g}</option>
 ))}
 </select>
 </SelectField>
 <button
 type="button"
 onClick={handleListeyiGetir}
 className="inline-flex items-center gap-2 px-6 py-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm transition-all active:scale-95 shadow-lg"
 >
 <RefreshCw className="w-4 h-4" /> Listeyi Getir
 </button>
 <button
 type="button"
 onClick={() => refreshFromStorage()}
 className="inline-flex items-center gap-2 px-4 py-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold transition-all"
 >
 <RefreshCw className="w-4 h-4" /> Veriyi Yenile
 </button>
 </div>

 {listGroup ? (
   <GroupLessonLogPanel
     groupName={listGroup}
     entries={groupLogEntries(listGroup)}
     onSave={(entries: StudentLessonLogEntry[]) => updateGroupLessonLog(listGroup, entries)}
   />
 ) : (
   <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-slate-500">
     Grup ders konularını görmek veya eklemek için yukarıdan bir grup seçin.
   </div>
 )}

 {listFetched && (
 <>
 <div className="rounded-lg px-4 py-3 bg-emerald-600/20 text-emerald-300 text-sm font-bold border border-emerald-500/30">
 {listDate} {listGroup ? `· ${listGroup}` : ''} — {listRows.length} kayıt
 </div>
 {listRows.length === 0 ? (
 <div className="py-12 text-center text-slate-400 rounded-lg border border-dashed border-slate-600">
 Bu tarih{listGroup ? ` ve grupta` : ''} yoklama kaydı bulunamadı.
 </div>
 ) : (
 <div className="space-y-2">
 {listRows.map((row) => (
 <div
 key={row.studentId}
 className={`flex items-center gap-4 px-4 py-3 rounded-xl border-2 ${
 row.status === 'present' ? 'bg-emerald-500/10 border-emerald-500/30' :
 row.status === 'absent' ? 'bg-rose-500/10 border-rose-500/30' :
 row.status === 'late' ? 'bg-amber-500/10 border-amber-500/30' :
 'bg-orange-500/10 border-orange-500/30'
 }`}
 >
 <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-black text-sm shrink-0">
 {row.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
 </div>
 <div className="min-w-0 flex-1">
 <div className="font-bold text-white truncate">{row.name}</div>
 <div className="text-xs text-slate-400">{row.group}</div>
 </div>
 <span className={`shrink-0 px-3 py-1 rounded-lg text-xs font-black uppercase ${
 row.status === 'present' ? 'bg-emerald-500/20 text-emerald-400' :
 row.status === 'absent' ? 'bg-rose-500/20 text-rose-400' :
 row.status === 'late' ? 'bg-amber-500/20 text-amber-400' :
 'bg-orange-500/20 text-orange-400'
 }`}>
 {STATUS_LABELS[row.status] || row.status}
 </span>
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
 <div className="bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg border border-slate-700/60 overflow-hidden">
 <SectionHeader
 icon={<CalendarCheck className="w-5 h-5" />}
 title="Yoklama Tip ve Grup Seçimi"
 />

 <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
 {/* Yoklama Tipi */}
 <SelectField label="Yoklama Tipi">
 <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
 <button
 type="button"
 onClick={() => setAttendanceType('group')}
 className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-black text-sm transition-all active:scale-[0.99] ${
 attendanceType === 'group'
 ? 'premium-gradient text-white shadow-lg shadow-indigo-500/20'
 : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
 }`}
 >
 <Check className="w-4 h-4" />
 Grup Bazlı Yoklama
 </button>
 <button
 type="button"
 onClick={() => setAttendanceType('lesson')}
 className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-black text-sm transition-all active:scale-[0.99] ${
 attendanceType === 'lesson'
 ? 'premium-gradient text-white shadow-lg shadow-indigo-500/20'
 : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
 }`}
 >
 <CalendarCheck className="w-4 h-4" />
 Ders Bazlı Yoklama
 </button>
 </div>
 </SelectField>

 {/* Şube */}
 <SelectField label="Şube">
 <select
 value={branchOffice}
 onChange={(e) => setBranchOffice(e.target.value)}
 className="w-full px-5 py-4 rounded-lg bg-[#1e293b] border border-slate-700/60 text-white font-medium focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all"
 >
 <option value="">Şube Seçiniz</option>
 {BRANCH_OFFICES.map((b) => (
 <option key={b} value={b}>{b}</option>
 ))}
 </select>
 </SelectField>

 {/* Branş */}
 <SelectField label="Branş">
 <select
 value={branch}
 onChange={(e) => setBranch(e.target.value)}
 className="w-full px-5 py-4 rounded-lg bg-[#1e293b] border border-slate-700/60 text-white font-medium focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all"
 >
 <option value="">Branş Seçiniz</option>
 {BRANCHES.map((b) => (
 <option key={b} value={b}>{b}</option>
 ))}
 </select>
 </SelectField>

 {/* Grup */}
 <SelectField label="Grup">
 <select
 value={group}
 onChange={(e) => setGroup(e.target.value)}
 className="w-full px-5 py-4 rounded-lg bg-[#1e293b] border border-slate-700/60 text-white font-medium focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all"
 >
 <option value="">Grup Seçiniz</option>
 {groups.map((g) => (
 <option key={g} value={g}>{g}</option>
 ))}
 </select>
 {groups.length === 0 && (
 <p className="mt-2 text-xs text-amber-400/90">
 Grup görünmüyor. Öğrenci eklerken grup atayın veya Branş & Grup sayfasından grup ekleyin.
 </p>
 )}
 </SelectField>

 {/* Tarih */}
 <SelectField label="Tarih">
 <input
 type="date"
 value={date}
 onChange={(e) => setDate(e.target.value)}
 className="w-full px-5 py-4 rounded-lg bg-[#1e293b] border border-slate-700/60 text-white font-medium focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all"
 />
 </SelectField>

 {/* Öğretmen */}
 <SelectField label="Öğretmen / Antrenör" icon={<UserCheck className="w-4 h-4" />}>
 <select
 value={teacherName}
 onChange={(e) => setTeacherName(e.target.value)}
 className="w-full px-5 py-4 rounded-lg bg-[#1e293b] border border-slate-700/60 text-white font-medium focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all"
 >
 <option value="">Öğretmen Seçiniz</option>
 {TEACHERS.map((t) => (
 <option key={t} value={t}>{t}</option>
 ))}
 </select>
 </SelectField>

 {group ? (
   <GroupLessonLogPanel
     groupName={group}
     entries={groupLogEntries(group)}
     onSave={(entries: StudentLessonLogEntry[]) => updateGroupLessonLog(group, entries)}
     compact
   />
 ) : null}

 {/* Devam butonu */}
 {!showStudents && (
 <div className="flex gap-3 pt-2">
 <button
 type="button"
 onClick={handleStart}
 disabled={!group}
 className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
 >
 <CalendarCheck className="w-4 h-4" />
 Yoklamayı Başlat
 </button>
 
 </div>
 )}
 </div>
 </div>

 {/* Öğrenci yoklama listesi */}
 {showStudents && (
 <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
 <div className="rounded-xl px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 premium-gradient shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-500/20">
 <div className="font-bold tracking-tight text-sm sm:text-base text-white min-w-0">
   {branchOffice} · {branch} · {group}
 </div>
 <div className="inline-flex items-center gap-2 rounded-lg bg-white/10 border border-white/20 px-3 py-2">
   <Calendar className="w-4 h-4 text-indigo-200 shrink-0" aria-hidden />
   <input
     type="date"
     value={date}
     onChange={(e) => setDate(e.target.value)}
     className="bg-transparent border-none outline-none text-sm font-semibold text-white min-w-0 max-w-[11rem] [color-scheme:dark]"
     aria-label="Yoklama tarihi"
   />
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
 <div className="flex gap-4 items-start">
 <aside className="hidden xl:flex flex-col gap-2 w-[4.75rem] shrink-0 sticky top-20 py-1 max-h-[calc(100vh-10rem)] overflow-y-auto custom-scrollbar rounded-xl border border-white/[0.06] bg-[#0f172a]/60 p-2">
 <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider text-center px-0.5">Görseller</p>
 {filteredStudents.map((student) => {
 const initials = student.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
 const firstName = student.name.split(' ')[0] ?? student.name;
 return (
 <div key={student.id} className="flex flex-col items-center gap-1" title={student.name}>
 {student.photoUrl ? (
 <img src={student.photoUrl} alt="" className="w-11 h-11 rounded-lg object-cover border border-white/10" referrerPolicy="no-referrer" />
 ) : (
 <div className="w-11 h-11 rounded-lg premium-gradient flex items-center justify-center text-white font-bold text-[9px] shadow-md">{initials}</div>
 )}
 <span className="text-[8px] text-slate-400 font-medium truncate w-full text-center">{firstName}</span>
 </div>
 );
 })}
 </aside>
 <div className="flex-1 min-w-0 space-y-2">
 {/* Mobil: kompakt öğrenci kartları */}
 <div className="md:hidden space-y-2">
 {filteredStudents.map((student, idx) => {
 const s = attendance[student.id] ?? null;
 const initials = student.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
 const noteOpen = expandedNoteStudentId === student.id;
 const noteCount = student.lessonLog?.length ?? 0;
 return (
 <div
 key={student.id}
 className={`rounded-xl border p-3 space-y-2.5 transition-colors ${attendanceCardAccent(s)}`}
 >
 <div className="flex items-start gap-2.5">
 <span className="text-[10px] font-bold text-slate-500 w-4 pt-2 tabular-nums shrink-0">{idx + 1}</span>
 {student.photoUrl ? (
 <img src={student.photoUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0" referrerPolicy="no-referrer" />
 ) : (
 <div className="w-10 h-10 rounded-lg premium-gradient flex items-center justify-center text-white font-bold text-[10px] shadow-md shadow-indigo-900/30 shrink-0">{initials}</div>
 )}
 <div className="flex-1 min-w-0">
 <div className="font-semibold text-white text-sm leading-tight">{student.name}</div>
 {student.group ? <div className="text-[10px] text-slate-500 mt-0.5">{student.group}</div> : null}
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
 const initials = student.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
 const noteOpen = expandedNoteStudentId === student.id;
 const noteCount = student.lessonLog?.length ?? 0;
 return (
 <React.Fragment key={student.id}>
 <tr className="border-b border-white/[0.04] hover:bg-indigo-500/[0.04] transition-colors">
 <td data-label="No" className="px-3 py-3 text-center text-slate-500 font-semibold tabular-nums text-xs">{idx + 1}</td>
 <td data-label="Foto" className="px-3 py-3">
 <div className="flex justify-center">
 {student.photoUrl ? (
 <img src={student.photoUrl} alt="" className="w-9 h-9 rounded-lg object-cover border border-white/10" referrerPolicy="no-referrer" />
 ) : (
 <div className="w-9 h-9 rounded-lg premium-gradient flex items-center justify-center text-white font-bold text-[10px] shadow-md shadow-indigo-900/30">{initials}</div>
 )}
 </div>
 </td>
 <td data-label="Öğrenci" className="px-3 py-3">
 <div className="font-semibold text-white text-sm">{student.name}</div>
 {student.group ? <div className="text-[10px] text-slate-500 mt-0.5">{student.group}</div> : null}
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
 Yoklamayı Kaydet
 </button>
 </div>
 )}
 </div>
 )}
 </>
 )}
  {analysisModal && (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
      <div className="w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-xl border border-slate-700 bg-white shadow-2xl">
        <div className={`px-4 py-3 flex items-center justify-between text-white ${analysisModal.platform === 'lichess' ? 'bg-black' : 'bg-[#5f8f3f]'}`}>
          <div className="font-bold text-sm">
            {analysisModal.student.name} - {analysisModal.platform === 'lichess' ? 'Lichess Analizi' : 'Chess.com Analizi'}
          </div>
          <button type="button" onClick={closeAnalysisModal} className="p-1 rounded hover:bg-white/20">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 md:p-6 overflow-y-auto max-h-[calc(88vh-48px)] text-slate-900">
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
