import React, { useCallback, useEffect, useMemo, useState } from'react';
import { useApp } from'../AppContext';
import {
 Search,
 Plus,
 Edit2,
 Trash2,
 X,
 ChevronDown,
 ChevronUp,
 Users,
 UserCheck,
 UserX,
 UserCog,
 GraduationCap,
 FileText,
 QrCode,
 Eye,
 RotateCcw,
 PenLine,
} from'lucide-react';
import { Student } from'../types';
import {
 applyGroupDefaultsToStudent,
 applySiblingDiscount,
 disciplineNamesForOffice,
 findTrainingGroupByName,
 mergeBranchOffices,
} from '../lib/trainingGroupUtils';
import type { StudentApplication } from'../lib/applicationTypes';
import { APPLICATIONS_UPDATED_EVENT, loadApplicationsAsync } from'../services/applicationStorage';
import StudentSignedFormsModal from'./StudentSignedFormsModal';
import { ResponsiveTable } from './ui/ResponsiveTable';
import { getCoachNamesForStudent, coachesForClub } from '../lib/orgScope';
import { normalizeClubKey } from '../lib/clubScope';

const PLACEHOLDER_OFFICE = 'Şube Seçiniz';
const PLACEHOLDER_DISCIPLINE = 'Branş Seçiniz';
const PLACEHOLDER_GROUP = 'Grup Seçiniz';
const PLACEHOLDER_COACH = 'Antrenör Seçiniz';

const BRANCH_OFFICES = ['Tüm Şubeler', 'Merkez', 'Çayyolu', 'Ümitköy'];
const BRANCHES = ['Tüm Branşlar', 'Satranç', 'Robotik', 'Kodlama'];
const GROUPS = ['Tüm Gruplar', 'Alt Yapı A', 'Alt Yapı B', 'Gelişim A', 'Gelişim B'];

interface StudentListProps {
 onAddNew?: () => void;
 onViewDetail?: (studentId: string) => void;
}

const StudentList: React.FC<StudentListProps> = ({ onAddNew, onViewDetail }) => {
 const { scopedStudents, students, updateStudent, deleteStudent, bulkDeleteStudents, bulkUpdateStudentGroup, bulkUpdateStudentCoach, branchOffices, disciplines, groups, trainingGroups, disciplineBranches, coaches, auth } = useApp();
 const isAdmin = auth?.role === 'admin';
 const isCoach = auth?.role === 'coach';
 const baseStudents = scopedStudents;
 const [searchTerm, setSearchTerm] = useState('');
 const [filterBranchOffice, setFilterBranchOffice] = useState(BRANCH_OFFICES[0]);
 const [filterBranch, setFilterBranch] = useState(BRANCHES[0]);
 const [filterGroup, setFilterGroup] = useState(GROUPS[0]);
 const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
 const [filterScholarship, setFilterScholarship] = useState<'all' | 'yes' | 'no'>('all');
 const [filterCoach, setFilterCoach] = useState('Tüm Antrenörler');
 const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(true);

 const [isModalOpen, setIsModalOpen] = useState(false);
 const [editingStudent, setEditingStudent] = useState<Student | null>(null);
 const [selectedIds, setSelectedIds] = useState<string[]>([]);
 const [isBulkGroupModalOpen, setIsBulkGroupModalOpen] = useState(false);
 const [isBulkCoachModalOpen, setIsBulkCoachModalOpen] = useState(false);
 const [newBulkGroup, setNewBulkGroup] = useState('');
 const [newBulkCoachId, setNewBulkCoachId] = useState('');
 const [signedFormsStudent, setSignedFormsStudent] = useState<Student | null>(null);
 const [applications, setApplications] = useState<StudentApplication[]>([]);

 const refreshApplications = useCallback(() => {
  void loadApplicationsAsync().then(setApplications);
 }, []);

 useEffect(() => {
  refreshApplications();
  const interval = window.setInterval(refreshApplications, 45_000);
  const onFocus = () => refreshApplications();
  const onAppsUpdated = () => refreshApplications();
  window.addEventListener('focus', onFocus);
  window.addEventListener(APPLICATIONS_UPDATED_EVENT, onAppsUpdated);
  return () => {
   window.clearInterval(interval);
   window.removeEventListener('focus', onFocus);
   window.removeEventListener(APPLICATIONS_UPDATED_EVENT, onAppsUpdated);
  };
 }, [refreshApplications]);

 const formCountByStudentId = useMemo(() => {
  const total = new Map<string, number>();
  const signed = new Map<string, number>();
  for (const app of applications) {
   if (!app.studentId) continue;
   total.set(app.studentId, (total.get(app.studentId) ?? 0) + 1);
   if (app.signatureDataUrl?.trim()) {
    signed.set(app.studentId, (signed.get(app.studentId) ?? 0) + 1);
   }
  }
  return { total, signed };
 }, [applications]);

 const [formData, setFormData] = useState({
 name: '',
 branchOffice: PLACEHOLDER_OFFICE,
 branch: PLACEHOLDER_DISCIPLINE,
 group: PLACEHOLDER_GROUP,
 level: 'Başlangıç'as'Başlangıç' | 'Orta' | 'İleri',
 elo: 0,
 ukd: 0,
 paymentStatus: 'Unpaid'as'Paid' | 'Unpaid' | 'Partial',
 coachId: PLACEHOLDER_COACH,
 });

 const mergedOffices = useMemo(
  () => mergeBranchOffices(branchOffices, disciplineBranches),
  [branchOffices, disciplineBranches],
 );

 const editOfficeOptions = useMemo(
  () => [PLACEHOLDER_OFFICE, ...mergedOffices],
  [mergedOffices],
 );

 const editDisciplineOptions = useMemo(() => {
  const office = formData.branchOffice !== PLACEHOLDER_OFFICE ? formData.branchOffice : '';
  const fromDefs = disciplineNamesForOffice(disciplineBranches, office || undefined);
  const names = fromDefs.length > 0 ? fromDefs : disciplines;
  return [PLACEHOLDER_DISCIPLINE, ...names];
 }, [disciplineBranches, disciplines, formData.branchOffice]);

 const editGroupOptions = useMemo(() => {
  const office = formData.branchOffice !== PLACEHOLDER_OFFICE ? formData.branchOffice : '';
  const discipline = formData.branch !== PLACEHOLDER_DISCIPLINE ? formData.branch : '';
  if (trainingGroups.length) {
   const filtered = trainingGroups
    .filter((g) => (!office || g.branchOffice === office) && (!discipline || g.discipline === discipline))
    .map((g) => g.name);
   if (filtered.length) return [PLACEHOLDER_GROUP, ...filtered];
  }
  return [PLACEHOLDER_GROUP, ...groups.filter((g) => g !== 'Tüm Gruplar')];
 }, [formData.branchOffice, formData.branch, trainingGroups, groups]);

 const editCoachOptions = useMemo(() => {
  const office = formData.branchOffice !== PLACEHOLDER_OFFICE ? formData.branchOffice : '';
  const clubCoaches = office ? coachesForClub(coaches, office) : coaches;
  const names = clubCoaches.map((c) => ({ id: c.id, name: c.name }));
  return [PLACEHOLDER_COACH, ...names];
 }, [coaches, formData.branchOffice]);

 const coachFilterOptions = useMemo(() => {
  const names = coaches.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'tr'));
  return ['Tüm Antrenörler', ...names];
 }, [coaches]);

 const filteredStudents = useMemo(() => {
 return baseStudents.filter((s) => {
 const matchSearch =
 !searchTerm ||
 s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
 s.group.toLowerCase().includes(searchTerm.toLowerCase()) ||
 (s.tcNo && s.tcNo.includes(searchTerm)) ||
 (s.parentPhone && s.parentPhone.includes(searchTerm));
 const matchBranchOffice =
 filterBranchOffice === BRANCH_OFFICES[0] || s.branchOffice === filterBranchOffice;
 const matchBranch =
 filterBranch === BRANCHES[0] || s.branch === filterBranch || s.group === filterBranch;
 const matchGroup = filterGroup === GROUPS[0] || s.group === filterGroup;
 const matchStatus =
 filterStatus === 'all' ||
 (filterStatus === 'active' && s.status !== 'inactive') ||
 (filterStatus === 'inactive' && s.status === 'inactive');
 const matchScholarship =
 filterScholarship === 'all' ||
 (filterScholarship === 'yes' && s.isScholarshipStudent) ||
 (filterScholarship === 'no' && !s.isScholarshipStudent);
 const matchCoach =
 filterCoach === 'Tüm Antrenörler' ||
 getCoachNamesForStudent(s, coaches, trainingGroups).includes(filterCoach);
 return matchSearch && matchBranchOffice && matchBranch && matchGroup && matchStatus && matchScholarship && matchCoach;
 });
 }, [
 baseStudents,
 coaches,
 trainingGroups,
 searchTerm,
 filterBranchOffice,
 filterBranch,
 filterGroup,
 filterStatus,
 filterScholarship,
 filterCoach,
 ]);

 const stats = useMemo(() => {
 const total = baseStudents.length;
 const active = baseStudents.filter((s) => s.status !== 'inactive').length;
 const inactive = baseStudents.filter((s) => s.status === 'inactive').length;
 const scholarship = baseStudents.filter((s) => s.isScholarshipStudent).length;
 const privateLesson = baseStudents.filter((s) => s.group?.toLowerCase().includes('özel') || s.registrationType === 'package').length;
 return { total, active, inactive, scholarship, privateLesson };
 }, [baseStudents]);

 const clearFilters = () => {
 setSearchTerm('');
 setFilterBranchOffice(BRANCH_OFFICES[0]);
 setFilterBranch(BRANCHES[0]);
 setFilterGroup(GROUPS[0]);
 setFilterStatus('all');
 setFilterScholarship('all');
 setFilterCoach('Tüm Antrenörler');
 };

 const toggleSelectAll = () => {
 if (selectedIds.length === filteredStudents.length) {
 setSelectedIds([]);
 } else {
 setSelectedIds(filteredStudents.map((s) => s.id));
 }
 };

 const toggleSelect = (id: string) => {
 if (selectedIds.includes(id)) {
 setSelectedIds(selectedIds.filter((i) => i !== id));
 } else {
 setSelectedIds([...selectedIds, id]);
 }
 };

 const handleBulkDelete = () => {
 if (window.confirm(`${selectedIds.length} öğrenciyi silmek istediğinize emin misiniz?`)) {
 bulkDeleteStudents(selectedIds);
 setSelectedIds([]);
 }
 };

 const handleBulkUpdateGroup = () => {
 bulkUpdateStudentGroup(selectedIds, newBulkGroup);
 setIsBulkGroupModalOpen(false);
 setNewBulkGroup('');
 setSelectedIds([]);
 };

 const bulkCoachOptions = useMemo(() => {
  const selected = students.filter((s) => selectedIds.includes(s.id));
  const offices = new Set(selected.map((s) => normalizeClubKey(s.branchOffice)));
  const matched = coaches.filter((c) => offices.has(normalizeClubKey(c.branch)));
  const list = matched.length > 0 ? matched : coaches;
  return [...list].sort(
    (a, b) => a.branch.localeCompare(b.branch, 'tr') || a.name.localeCompare(b.name, 'tr'),
  );
 }, [students, selectedIds, coaches]);

 const handleBulkUpdateCoach = () => {
  if (!newBulkCoachId) return;
  bulkUpdateStudentCoach(selectedIds, newBulkCoachId);
  setIsBulkCoachModalOpen(false);
  setNewBulkCoachId('');
  setSelectedIds([]);
 };

 const openBulkCoachModal = () => {
  setNewBulkCoachId(bulkCoachOptions[0]?.id ?? '');
  setIsBulkCoachModalOpen(true);
 };

 const handleOpenModal = (student?: Student) => {
 if (student) {
 setEditingStudent(student);
 setFormData({
 name: student.name,
 branchOffice: student.branchOffice || PLACEHOLDER_OFFICE,
 branch: student.branch || PLACEHOLDER_DISCIPLINE,
 group: student.group || PLACEHOLDER_GROUP,
 level: student.level,
 elo: student.elo,
 ukd: student.ukd,
 paymentStatus: student.paymentStatus,
 coachId: student.coachId || (isCoach && auth?.coachId ? auth.coachId : PLACEHOLDER_COACH),
 });
 } else {
 setEditingStudent(null);
 setFormData({
 name: '',
 branchOffice: PLACEHOLDER_OFFICE,
 branch: PLACEHOLDER_DISCIPLINE,
 group: PLACEHOLDER_GROUP,
 level: 'Başlangıç',
 elo: 0,
 ukd: 0,
 paymentStatus: 'Unpaid',
 coachId: PLACEHOLDER_COACH,
 });
 }
 setIsModalOpen(true);
 };

 const handleEditGroupChange = (groupName: string) => {
  setFormData((prev) => {
   const next = { ...prev, group: groupName };
   if (groupName === PLACEHOLDER_GROUP) return next;
   const office = prev.branchOffice !== PLACEHOLDER_OFFICE ? prev.branchOffice : undefined;
   const discipline = prev.branch !== PLACEHOLDER_DISCIPLINE ? prev.branch : undefined;
   const tg = findTrainingGroupByName(trainingGroups, groupName, { branchOffice: office, discipline });
   if (!tg) return next;
   const defaults = applyGroupDefaultsToStudent(tg, disciplineBranches);
   const autoCoachId =
    tg.coachIds?.length === 1 ? tg.coachIds[0] : prev.coachId !== PLACEHOLDER_COACH ? prev.coachId : PLACEHOLDER_COACH;
   return {
    ...next,
    branch: defaults.branch || prev.branch,
    branchOffice: defaults.branchOffice || prev.branchOffice,
    coachId: autoCoachId || PLACEHOLDER_COACH,
   };
  });
 };

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 if (editingStudent) {
  const office = formData.branchOffice !== PLACEHOLDER_OFFICE ? formData.branchOffice : undefined;
  const discipline = formData.branch !== PLACEHOLDER_DISCIPLINE ? formData.branch : undefined;
  const groupName = formData.group !== PLACEHOLDER_GROUP ? formData.group : undefined;
  const tg = groupName
   ? findTrainingGroupByName(trainingGroups, groupName, { branchOffice: office, discipline })
   : undefined;
  const groupDefaults = tg ? applyGroupDefaultsToStudent(tg, disciplineBranches) : null;
  const coachId = formData.coachId !== PLACEHOLDER_COACH ? formData.coachId : undefined;
  updateStudent(editingStudent.id, {
   name: formData.name,
   level: formData.level,
   elo: formData.elo,
   ukd: formData.ukd,
   paymentStatus: formData.paymentStatus,
   branchOffice: office,
   branch: discipline,
   group: groupName ?? '',
   trainingGroupId: tg?.id,
   coachId,
   ...(groupDefaults
    ? {
       monthlyFee: groupDefaults.monthlyFee,
       lessonSchedule: groupDefaults.lessonSchedule,
      }
    : {}),
  });
 } else {
 setIsModalOpen(false);
 onAddNew?.();
 return;
 }
 setIsModalOpen(false);
 };

 const formatDues = (s: Student) => {
 if (s.registrationType === 'package') return 'Ders paketi';
 if (s.isScholarshipStudent) return <span className="text-emerald-400 font-semibold">Burslu</span>;
 let fee = '—';
 if (s.monthlyFee != null) {
   const net = applySiblingDiscount(Number(s.monthlyFee), s).finalFee;
   fee = `₺${Number(net).toLocaleString('tr-TR')}`;
 }
 if (s.paymentStatus === 'Unpaid') return <span>{fee} <span className="text-rose-400 font-semibold">Borç</span></span>;
 if (s.paymentStatus === 'Partial') return <span className="text-amber-400">{fee} Kısmi</span>;
 return <span className="text-emerald-400">{fee} Ödendi</span>;
 };

 return (
 <div className="space-y-4 sm:space-y-6 min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 lg:pb-0">
 {/* Header */}
 <div className="premium-gradient rounded-lg px-4 sm:px-6 lg:px-8 py-4 sm:py-6 shadow-xl shadow-indigo-500/10">
 <div className="flex items-center gap-3 sm:gap-4 min-w-0">
 <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
 <Users className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
 </div>
 <div className="min-w-0">
 <h1 className="text-lg sm:text-2xl font-black tracking-tight text-white">Öğrenci Listesi</h1>
 <p className="text-white/80 text-xs sm:text-sm mt-0.5">
  {isCoach ? 'Size atanmış öğrenciler' : isAdmin ? 'Tüm kurumlar — şube ve antrenör bilgisiyle' : 'Öğrencileri görüntüleyin ve yönetin'}
 </p>
 </div>
 </div>
 </div>

 {/* Stat cards */}
 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
 <div className="bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg p-3 sm:p-5 border border-slate-700/60 hover:border-indigo-500/20 transition-colors">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-xl sm:text-3xl font-black text-white tracking-tight">{stats.total}</p>
 <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">Toplam Öğrenci</p>
 </div>
 <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
 <Users className="w-5 h-5 text-indigo-600" />
 </div>
 </div>
 </div>
 <div className="bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg p-3 sm:p-5 border border-slate-700/60 hover:border-emerald-500/20 transition-colors">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-xl sm:text-3xl font-black text-white tracking-tight">{stats.active}</p>
 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">Aktif Öğrenci</p>
 </div>
 <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
 <UserCheck className="w-5 h-5 text-emerald-600" />
 </div>
 </div>
 </div>
 <div className="bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg p-3 sm:p-5 border border-slate-700/60 hover:border-sky-500/20 transition-colors col-span-2 sm:col-span-1">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-3xl font-black text-white tracking-tight">{stats.privateLesson}</p>
 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">Özel / Paket</p>
 </div>
 <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
 <FileText className="w-5 h-5 text-sky-600" />
 </div>
 </div>
 </div>
 <div className="bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg p-3 sm:p-5 border border-slate-700/60 hover:border-amber-500/20 transition-colors">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-3xl font-black text-white tracking-tight">{stats.scholarship}</p>
 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">Burslu Öğrenci</p>
 </div>
 <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
 <GraduationCap className="w-5 h-5 text-amber-600" />
 </div>
 </div>
 </div>
 <div className="bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg p-3 sm:p-5 border border-slate-700/60 hover:border-rose-500/20 transition-colors">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-3xl font-black text-white tracking-tight">{stats.inactive}</p>
 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">Pasif Öğrenci</p>
 </div>
 <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
 <UserX className="w-5 h-5 text-rose-600" />
 </div>
 </div>
 </div>
 </div>

 {/* Filters + Actions */}
 <div className="bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg border border-slate-700/60 overflow-hidden">
 <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-b border-slate-700/60 bg-slate-900/50 flex items-center justify-between gap-3">
 <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Filtrele ve Ara</h3>
 <button
   type="button"
   onClick={() => setIsFiltersCollapsed((v) => !v)}
   className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-300/90 hover:text-slate-200 transition-colors"
   aria-expanded={!isFiltersCollapsed}
 >
   {isFiltersCollapsed ? (
     <>
       <ChevronDown className="w-4 h-4" /> Detaylı Aramayı Aç
     </>
   ) : (
     <>
       <ChevronUp className="w-4 h-4" /> Kapat
     </>
   )}
 </button>
 </div>
 <div className="p-3 sm:p-4 space-y-2.5 sm:space-y-3">
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end gap-2 sm:gap-2.5 lg:gap-3">
 <div className="relative sm:col-span-2 lg:flex-1 lg:min-w-[200px] lg:max-w-md">
 <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
 <input
 type="text"
 placeholder="Ad, TC, Tel..."
 className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/60 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all"
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 />
 </div>
 {!isFiltersCollapsed && (
   <>
 <select
 value={filterBranchOffice}
 onChange={(e) => setFilterBranchOffice(e.target.value)}
 className="w-full lg:w-auto lg:flex-1 lg:min-w-[120px] px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/60 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/40 outline-none truncate"
 >
 {BRANCH_OFFICES.map((o) => (
 <option key={o} value={o}>{o}</option>
 ))}
 </select>
 <select
 value={filterBranch}
 onChange={(e) => setFilterBranch(e.target.value)}
 className="w-full lg:w-auto lg:flex-1 lg:min-w-[110px] px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/60 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/40 outline-none truncate"
 >
 {BRANCHES.map((b) => (
 <option key={b} value={b}>{b}</option>
 ))}
 </select>
 <select
 value={filterGroup}
 onChange={(e) => setFilterGroup(e.target.value)}
 className="w-full lg:w-auto lg:flex-1 lg:min-w-[110px] px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/60 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/40 outline-none truncate"
 >
 {GROUPS.map((g) => (
 <option key={g} value={g}>{g}</option>
 ))}
 </select>
 <select
 value={filterStatus}
 onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
 className="w-full lg:w-auto lg:flex-1 lg:min-w-[90px] px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/60 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/40 outline-none truncate"
 >
 <option value="all">Tümü</option>
 <option value="active">Aktif</option>
 <option value="inactive">Pasif</option>
 </select>
 <select
 value={filterScholarship}
 onChange={(e) => setFilterScholarship(e.target.value as typeof filterScholarship)}
 className="w-full lg:w-auto lg:flex-1 lg:min-w-[100px] px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/60 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/40 outline-none truncate"
 >
 <option value="all">Tümü</option>
 <option value="yes">Burslu</option>
 <option value="no">Burslu Değil</option>
 </select>
 {isAdmin && (
 <select
 value={filterCoach}
 onChange={(e) => setFilterCoach(e.target.value)}
 className="w-full lg:w-auto lg:flex-1 lg:min-w-[130px] px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/60 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/40 outline-none truncate"
 >
 {coachFilterOptions.map((c) => (
 <option key={c} value={c}>{c}</option>
 ))}
 </select>
 )}
   </>
 )}
 <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
 <button
 type="button"
 onClick={clearFilters}
 className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-bold transition-all"
 >
 <RotateCcw className="w-3.5 h-3.5" /> Temizle
 </button>
 </div>
 </div>
 </div>
 </div>

 {/* Action buttons + Table header */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
 <div className="flex flex-wrap items-center gap-2">
 <button
 type="button"
 className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
 >
 <FileText className="w-4 h-4" /> Aidat Takip
 </button>
 <button
 type="button"
 className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg bg-amber-500/90 hover:bg-amber-500 text-white text-xs sm:text-sm font-bold transition-all"
 >
 <QrCode className="w-4 h-4" /> <span className="hidden sm:inline">QR Code'lar</span><span className="sm:hidden">QR</span>
 </button>
 {onAddNew && (
 <button
 type="button"
 onClick={onAddNew}
 className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold transition-all shadow-lg shadow-emerald-500/20"
 >
 <Plus className="w-4 h-4" /> Yeni Öğrenci Ekle
 </button>
 )}
 </div>
 <p className="text-sm font-medium text-slate-400">
 Toplam <span className="font-bold text-slate-200">{filteredStudents.length}</span> kayıt
 </p>
 </div>

 {/* Bulk bar */}
 {selectedIds.length > 0 && !isCoach && (
 <div className="fixed bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-lg shadow-2xl flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-6 animate-in slide-in-from-bottom-4 duration-300 max-w-lg sm:max-w-none mx-auto sm:mx-0">
 <div className="flex items-center gap-3 sm:pr-6 sm:border-r border-white/10">
 <span className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-black text-white">
 {selectedIds.length}
 </span>
 <span className="text-sm font-bold text-slate-200">Seçili</span>
 </div>
 <div className="flex flex-wrap gap-2">
 <button
 onClick={() => setIsBulkGroupModalOpen(true)}
 className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs font-bold transition-all"
 >
 <Edit2 className="w-3.5 h-3.5" /> Grup Güncelle
 </button>
 <button
 onClick={openBulkCoachModal}
 className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 rounded-lg text-xs font-bold transition-all"
 >
 <UserCog className="w-3.5 h-3.5" /> Antrenör Ata
 </button>
 <button
 onClick={handleBulkDelete}
 className="flex items-center gap-2 px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-bold transition-all"
 >
 <Trash2 className="w-3.5 h-3.5" /> Seçilenleri Sil
 </button>
 <button onClick={() => setSelectedIds([])} className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors">
 <X className="w-4 h-4" />
 </button>
 </div>
 </div>
 )}

 {/* Mobil: kart listesi */}
 <div className="lg:hidden space-y-3">
 {filteredStudents.map((student, index) => (
 <div
 key={student.id}
 className={`rounded-xl border border-slate-700/60 bg-[#1e293b]/90 p-4 transition-colors ${selectedIds.includes(student.id) ? 'border-indigo-500/40 bg-indigo-500/5' : ''}`}
 >
 <div className="flex items-start gap-3">
 <input
 type="checkbox"
 className="mt-1 w-4 h-4 rounded border-slate-600 bg-[#1e293b] text-indigo-600 focus:ring-indigo-500/50 cursor-pointer shrink-0"
 checked={selectedIds.includes(student.id)}
 onChange={() => toggleSelect(student.id)}
 />
 <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm shrink-0">
 {student.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="font-bold text-white text-sm truncate">{student.name}</p>
 <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{student.tcNo || `ID: ${student.id.slice(0, 8)}`}</p>
 </div>
 <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${
 student.status === 'inactive' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
 }`}>
 {student.status === 'inactive' ? 'Pasif' : 'Aktif'}
 </span>
 </div>
 <div className="mt-2 space-y-1 text-xs text-slate-400">
 <p><span className="text-slate-500">Grup:</span> {student.group}</p>
 <p><span className="text-slate-500">Şube:</span> {student.branchOffice || '—'}{student.branch ? ` / ${student.branch}` : ''}</p>
 <p><span className="text-slate-500">Aidat:</span> {formatDues(student)}</p>
 </div>
 </div>
 </div>
 <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-white/5">
 <button type="button" title="Detay" onClick={() => onViewDetail?.(student.id)} className="p-2.5 rounded-lg text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-400"><Eye className="w-4 h-4" /></button>
 <button type="button" onClick={() => { void loadApplicationsAsync().then(setApplications); setSignedFormsStudent(student); }} title="Başvuru formu" className="p-2.5 rounded-lg text-slate-400 hover:bg-violet-500/10 hover:text-violet-400"><PenLine className="w-4 h-4" /></button>
 <button type="button" onClick={() => handleOpenModal(student)} title="Düzenle" className="p-2.5 rounded-lg text-slate-400 hover:bg-amber-500/10 hover:text-amber-400"><Edit2 className="w-4 h-4" /></button>
 {!isCoach && (
 <button type="button" onClick={() => deleteStudent(student.id)} title="Sil" className="p-2.5 rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
 )}
 </div>
 </div>
 ))}
 {filteredStudents.length === 0 && (
 <div className="py-12 text-center rounded-xl border border-dashed border-slate-700/60 bg-[#1e293b]/50">
 <Users className="w-10 h-10 text-slate-500 mx-auto mb-3 opacity-50" />
 <p className="text-slate-400 text-sm font-medium">Kayıt bulunamadı</p>
 </div>
 )}
 </div>

 {/* Masaüstü: tablo */}
 <div className="hidden lg:block bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg border border-slate-700/60 overflow-hidden">
 <ResponsiveTable minWidth={900} className="table-scroll">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="border-b border-slate-700/60 bg-slate-900/50">
 <th className="px-6 py-4 w-10">
 <input
 type="checkbox"
 className="w-4 h-4 rounded border-slate-600 bg-[#1e293b] text-indigo-600 focus:ring-indigo-500/50 cursor-pointer"
 checked={selectedIds.length === filteredStudents.length && filteredStudents.length > 0}
 onChange={toggleSelectAll}
 />
 </th>
 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">#</th>
 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Öğrenci</th>
 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Şube / Branş</th>
 {isAdmin && (
 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Kurum / Antrenör</th>
 )}
 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Grup / Paket</th>
 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Aidat / Ders</th>
 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Kayıt Tarihi</th>
 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Durum</th>
 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">İşlemler</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-white/5">
 {filteredStudents.map((student, index) => (
 <tr
 key={student.id}
 className={`group hover:bg-white/[0.02] transition-colors ${selectedIds.includes(student.id) ? 'bg-indigo-500/5' : ''}`}
 >
 <td data-label="" className="px-6 py-4">
 <input
 type="checkbox"
 className="w-4 h-4 rounded border-slate-600 bg-[#1e293b] text-indigo-600 focus:ring-indigo-500/50 cursor-pointer"
 checked={selectedIds.includes(student.id)}
 onChange={() => toggleSelect(student.id)}
 />
 </td>
 <td data-label="#" className="px-6 py-4 text-sm font-medium text-slate-400">{index + 1}</td>
 <td data-label="Öğrenci" className="px-6 py-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center text-indigo-600 font-bold text-sm shrink-0">
 {student.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
 </div>
 <div>
 <p className="font-bold text-white text-sm tracking-tight">{student.name}</p>
 <p className="text-[10px] text-slate-400 font-mono mt-0.5">
 {student.tcNo || `ID: ${student.id.slice(0, 8)}`}
 </p>
 </div>
 </div>
 </td>
 <td data-label="Şube / Branş" className="px-6 py-4">
 <p className="text-sm text-slate-300">
 {student.branchOffice || '—'} {student.branch ? ` / ${student.branch}` : ''}
 </p>
 </td>
 {isAdmin && (
 <td data-label="Kurum / Antrenör" className="px-6 py-4">
 <p className="text-sm text-slate-300">{student.branchOffice || '—'}</p>
 <p className="text-[11px] text-teal-400/90 font-medium mt-0.5">
 {getCoachNamesForStudent(student, coaches, trainingGroups).join(', ') || 'Atanmamış'}
 </p>
 </td>
 )}
 <td data-label="Grup / Paket" className="px-6 py-4">
 <p className="text-sm font-medium text-slate-200">{student.group}</p>
 {student.registrationType && (
 <p className="text-[10px] text-slate-400">
 {student.registrationType === 'monthly' ? 'Aylık' : 'Ders paketi'}
 </p>
 )}
 </td>
 <td data-label="Aidat / Ders" className="px-6 py-4 text-sm">{formatDues(student)}</td>
 <td data-label="Kayıt Tarihi" className="px-6 py-4 text-sm text-slate-300">
 {student.registrationDate ? new Date(student.registrationDate).toLocaleDateString('tr-TR') : '—'}
 </td>
 <td data-label="Durum" className="px-6 py-4">
 <span
 className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
 student.status === 'inactive'
 ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
 : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
 }`}
 >
 {student.status === 'inactive' ? 'Pasif' : 'Aktif'}
 </span>
 </td>
 <td data-label="İşlemler" className="px-6 py-4">
 <div className="flex justify-end gap-1.5">
 <button
 type="button"
 title="Detay"
 onClick={() => onViewDetail?.(student.id)}
 className="p-2 rounded-lg text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-600 transition-all"
 >
 <Eye className="w-4 h-4" />
 </button>
 <button
 type="button"
 onClick={() => { void loadApplicationsAsync().then(setApplications); setSignedFormsStudent(student); }}
 title={
  (formCountByStudentId.signed.get(student.id) ?? 0) > 0
   ? `Başvuru formu — imzalı (${formCountByStudentId.signed.get(student.id)})`
   : 'Başvuru formu'
 }
 className={`relative p-2 rounded-lg transition-all ${
  (formCountByStudentId.signed.get(student.id) ?? 0) > 0
   ? 'text-violet-400 hover:bg-violet-500/10 hover:text-violet-300'
   : 'text-slate-400 hover:bg-violet-500/10 hover:text-violet-300'
 }`}
 >
 <PenLine className="w-4 h-4" />
 {(formCountByStudentId.signed.get(student.id) ?? 0) > 0 ? (
  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-violet-400" />
 ) : null}
 </button>
 <button
 type="button"
 onClick={() => handleOpenModal(student)}
 title="Düzenle"
 className="p-2 rounded-lg text-slate-400 hover:bg-amber-500/10 hover:text-amber-600 transition-all"
 >
 <Edit2 className="w-4 h-4" />
 </button>
 {!isCoach && (
 <button
 type="button"
 onClick={() => deleteStudent(student.id)}
 title="Sil"
 className="p-2 rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-600 transition-all"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 )}
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 {filteredStudents.length === 0 && (
 <div className="py-16 text-center">
 <Users className="w-12 h-12 text-slate-300 mx-auto mb-4 opacity-50" />
 <p className="text-slate-400 font-medium">Kayıt bulunamadı</p>
 <p className="text-sm text-slate-400 mt-1">Filtreleri değiştirin veya yeni öğrenci ekleyin</p>
 </div>
 )}
 </ResponsiveTable>
 </div>

 {/* Bulk group modal */}
 {isBulkGroupModalOpen && (
 <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
 <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"onClick={() => setIsBulkGroupModalOpen(false)} />
 <div className="relative w-full max-w-md bg-[#1e293b]/90 backdrop-blur-2xl border border-slate-700/60 rounded-lg shadow-2xl overflow-hidden">
 <div className="p-6">
 <div className="flex justify-between items-center mb-6">
 <div>
 <h3 className="text-lg font-bold text-white">Grup Güncelle</h3>
 <p className="text-slate-400 text-sm mt-1">{selectedIds.length} öğrenci için yeni grup</p>
 </div>
 <button onClick={() => setIsBulkGroupModalOpen(false)} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-slate-200 transition-colors">
 <X className="w-5 h-5" />
 </button>
 </div>
 <div className="space-y-4">
 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Yeni Grup</label>
 <input
 type="text"
 className="w-full px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-700/60 text-white focus:ring-2 focus:ring-indigo-500/40 outline-none"
 placeholder="Örn: B2 Grubu"
 value={newBulkGroup}
 onChange={(e) => setNewBulkGroup(e.target.value)}
 />
 <div className="flex gap-3 pt-2">
 <button type="button"onClick={() => setIsBulkGroupModalOpen(false)} className="flex-1 py-3 rounded-lg bg-slate-800 text-slate-200 font-bold text-sm transition-all">
 İptal
 </button>
 <button
 type="button"
 onClick={handleBulkUpdateGroup}
 disabled={!newBulkGroup.trim()}
 className="flex-1 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-all"
 >
 Güncelle
 </button>
 </div>
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Bulk coach modal */}
 {isBulkCoachModalOpen && (
 <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
 <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsBulkCoachModalOpen(false)} />
 <div className="relative w-full max-w-md bg-[#1e293b]/90 backdrop-blur-2xl border border-slate-700/60 rounded-lg shadow-2xl overflow-hidden">
 <div className="p-6">
 <div className="flex justify-between items-center mb-6">
 <div>
 <h3 className="text-lg font-bold text-white">Antrenör Ata</h3>
 <p className="text-slate-400 text-sm mt-1">{selectedIds.length} öğrenciye antrenör atanacak</p>
 </div>
 <button onClick={() => setIsBulkCoachModalOpen(false)} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-slate-200 transition-colors">
 <X className="w-5 h-5" />
 </button>
 </div>
 <div className="space-y-4">
 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Antrenör</label>
 {bulkCoachOptions.length === 0 ? (
 <p className="text-sm text-amber-400">Henüz antrenör tanımlı değil. Önce kulüp panelinden antrenör ekleyin.</p>
 ) : (
 <select
 className="w-full px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-700/60 text-white focus:ring-2 focus:ring-teal-500/40 outline-none"
 value={newBulkCoachId}
 onChange={(e) => setNewBulkCoachId(e.target.value)}
 >
 {bulkCoachOptions.map((c) => (
 <option key={c.id} value={c.id}>
 {c.name} ({c.branch})
 </option>
 ))}
 </select>
 )}
 <div className="flex gap-3 pt-2">
 <button type="button" onClick={() => setIsBulkCoachModalOpen(false)} className="flex-1 py-3 rounded-lg bg-slate-800 text-slate-200 font-bold text-sm transition-all">
 İptal
 </button>
 <button
 type="button"
 onClick={handleBulkUpdateCoach}
 disabled={!newBulkCoachId || bulkCoachOptions.length === 0}
 className="flex-1 py-3 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-all"
 >
 Ata
 </button>
 </div>
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Edit modal (quick edit) */}
 {isModalOpen && (
 <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
 <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"onClick={() => setIsModalOpen(false)} />
 <div className="relative w-full max-w-lg bg-[#1e293b]/90 backdrop-blur-2xl border border-slate-700/60 rounded-lg shadow-2xl overflow-hidden">
 <div className="p-6">
 <div className="flex justify-between items-center mb-6">
 <div>
 <h3 className="text-xl font-bold text-white">{editingStudent ? 'Öğrenci Düzenle' : 'Yeni Öğrenci'}</h3>
 <p className="text-slate-400 text-sm mt-1">Temel bilgileri güncelleyin</p>
 </div>
 <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/10 rounded-lg text-slate-400">
 <X className="w-5 h-5" />
 </button>
 </div>
 <form onSubmit={handleSubmit} className="space-y-5">
 <div>
 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ad Soyad</label>
 <input
 required
 type="text"
 className="w-full px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-700/60 text-white focus:ring-2 focus:ring-indigo-500/40 outline-none"
 placeholder="Ad Soyad"
 value={formData.name}
 onChange={(e) => setFormData({ ...formData, name: e.target.value })}
 />
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Şube</label>
 <select
 required
 className="w-full px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-700/60 text-white focus:ring-2 focus:ring-indigo-500/40 outline-none"
 value={formData.branchOffice}
 onChange={(e) =>
  setFormData({
   ...formData,
   branchOffice: e.target.value,
   branch: PLACEHOLDER_DISCIPLINE,
   group: PLACEHOLDER_GROUP,
  })
 }
 >
 {editOfficeOptions.map((x) => (
  <option key={x} value={x}>{x}</option>
 ))}
 </select>
 </div>
 <div>
 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Branş</label>
 <select
 required
 className="w-full px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-700/60 text-white focus:ring-2 focus:ring-indigo-500/40 outline-none"
 value={formData.branch}
 onChange={(e) =>
  setFormData({
   ...formData,
   branch: e.target.value,
   group: PLACEHOLDER_GROUP,
  })
 }
 >
 {editDisciplineOptions.map((x) => (
  <option key={x} value={x}>{x}</option>
 ))}
 </select>
 </div>
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Grup</label>
 <select
 required
 className="w-full px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-700/60 text-white focus:ring-2 focus:ring-indigo-500/40 outline-none"
 value={formData.group}
 onChange={(e) => handleEditGroupChange(e.target.value)}
 >
 {editGroupOptions.map((x) => (
  <option key={x} value={x}>{x}</option>
 ))}
 </select>
 </div>
 <div>
 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Seviye</label>
 <select
 className="w-full px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-700/60 text-white focus:ring-2 focus:ring-indigo-500/40 outline-none"
 value={formData.level}
 onChange={(e) => setFormData({ ...formData, level: e.target.value as Student['level'] })}
 >
 <option value="Başlangıç">Başlangıç</option>
 <option value="Orta">Orta</option>
 <option value="İleri">İleri</option>
 </select>
 </div>
 </div>
 <div>
 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Antrenör</label>
 <select
 className="w-full px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-700/60 text-white focus:ring-2 focus:ring-indigo-500/40 outline-none"
 value={formData.coachId}
 onChange={(e) => setFormData({ ...formData, coachId: e.target.value })}
 >
 {editCoachOptions.map((c) => (
  <option key={typeof c === 'string' ? c : c.id} value={typeof c === 'string' ? c : c.id}>
   {typeof c === 'string' ? c : c.name}
  </option>
 ))}
 </select>
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">ELO</label>
 <input
 type="number"
 className="w-full px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-700/60 text-white focus:ring-2 focus:ring-indigo-500/40 outline-none"
 value={formData.elo}
 onChange={(e) => setFormData({ ...formData, elo: parseInt(e.target.value, 10) || 0 })}
 />
 </div>
 <div>
 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">UKD</label>
 <input
 type="number"
 className="w-full px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-700/60 text-white focus:ring-2 focus:ring-indigo-500/40 outline-none"
 value={formData.ukd}
 onChange={(e) => setFormData({ ...formData, ukd: parseInt(e.target.value, 10) || 0 })}
 />
 </div>
 </div>
 <div>
 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Ödeme Durumu</label>
 <div className="flex gap-2">
 {(['Paid', 'Partial', 'Unpaid'] as const).map((status) => (
 <button
 key={status}
 type="button"
 onClick={() => setFormData({ ...formData, paymentStatus: status })}
 className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${
 formData.paymentStatus === status
 ? 'bg-indigo-600 border-indigo-500 text-white'
 : 'bg-slate-900/50 border-slate-700/60 text-slate-400 hover:bg-slate-800'
 }`}
 >
 {status === 'Paid' ? 'Ödendi' : status === 'Partial' ? 'Kısmi' : 'Ödenmedi'}
 </button>
 ))}
 </div>
 </div>
 <div className="flex gap-3 pt-4">
 <button type="button"onClick={() => setIsModalOpen(false)} className="flex-1 py-3 rounded-lg bg-slate-800 text-slate-200 font-bold text-sm">
 İptal
 </button>
 <button type="submit"className="flex-1 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm">
 {editingStudent ? 'Güncelle' : 'Kaydet'}
 </button>
 </div>
 </form>
 </div>
 </div>
 </div>
 )}

 {signedFormsStudent ? (
 <StudentSignedFormsModal
 student={students.find((s) => s.id === signedFormsStudent.id) ?? signedFormsStudent}
 onClose={() => {
  setSignedFormsStudent(null);
  loadApplicationsAsync().then(setApplications);
 }}
 />
 ) : null}
 </div>
 );
};

export default StudentList;
