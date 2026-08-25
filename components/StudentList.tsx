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
 disciplineNamesForOffice,
 findTrainingGroupByName,
 mergeBranchOffices,
 getExpectedDuesForYear,
 isMonthBeforeRegistration,
 getExpectedDueForMonth,
} from '../lib/trainingGroupUtils';
import { filterDuesTransactions } from '../lib/transactionUtils';
import { parseDuesPeriodFromTransaction } from '../lib/duesCalendarUtils';
import { APPLICATIONS_UPDATED_EVENT, loadApplicationListMetaAsync, loadApplicationPhotoMapAsync } from'../services/applicationStorage';
import StudentSignedFormsModal from'./StudentSignedFormsModal';
import { StudentLoginQuickInfo, StudentLoginQuickInfoInline } from './student/StudentLoginQuickInfo';
import StudentAvatar from './student/StudentAvatar';
import { uploadStudentPhotoDataUrl, isDisplayablePhotoUrl } from '../lib/studentPhotoUpload';
import { ResponsiveTable } from './ui/ResponsiveTable';
import { getCoachNamesForStudent, coachesForClub } from '../lib/orgScope';
import { normalizeClubKey } from '../lib/clubScope';
import { searchIncludesText } from '../lib/searchText';

const PLACEHOLDER_OFFICE = 'Şube Seçiniz';
const PLACEHOLDER_DISCIPLINE = 'Branş Seçiniz';
const PLACEHOLDER_GROUP = 'Grup Seçiniz';
const PLACEHOLDER_COACH = 'Antrenör Seçiniz';

const FILTER_ALL_OFFICES = 'Tüm Şubeler';
const FILTER_ALL_BRANCHES = 'Tüm Branşlar';
const FILTER_ALL_GROUPS = 'Tüm Gruplar';

interface StudentListProps {
 onAddNew?: () => void;
 onViewDetail?: (studentId: string) => void;
}

const StudentList: React.FC<StudentListProps> = ({ onAddNew, onViewDetail }) => {
 const { scopedStudents, students, updateStudent, deleteStudent, bulkDeleteStudents, bulkUpdateStudentGroup, bulkUpdateStudentCoach, branchOffices, scopedTrainingGroups, scopedDisciplineBranches, scopedCoaches, auth, confirmDialog, showToast, scopedTransactions: transactions, adminViewClub, setAdminViewClubId, clubs } = useApp();
 const isAdmin = auth?.role === 'admin';
 const isCoach = auth?.role === 'coach';
 const baseStudents = scopedStudents;
 const [searchTerm, setSearchTerm] = useState('');
 const [filterBranchOffice, setFilterBranchOffice] = useState(FILTER_ALL_OFFICES);
 const [filterBranch, setFilterBranch] = useState(FILTER_ALL_BRANCHES);
 const [filterGroup, setFilterGroup] = useState(FILTER_ALL_GROUPS);
 const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
 const [filterScholarship, setFilterScholarship] = useState<'all' | 'yes' | 'no'>('all');
 const [filterPackage, setFilterPackage] = useState<'all' | 'yes'>('all');
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
 const [applicationMeta, setApplicationMeta] = useState<{ studentId: string; signed: boolean }[]>([]);
 const [applicationPhotos, setApplicationPhotos] = useState<Record<string, string>>({});
 const syncedPhotoIdsRef = React.useRef<Set<string>>(new Set());

 const refreshApplications = useCallback(() => {
  const clubId = auth?.role === 'club' && auth.clubId ? auth.clubId : undefined;
  void loadApplicationListMetaAsync({ clubId }).then(setApplicationMeta);
  void loadApplicationPhotoMapAsync({ clubId }).then(setApplicationPhotos);
 }, [auth]);

 useEffect(() => {
  const t = window.setTimeout(() => refreshApplications(), 0);
  const interval = window.setInterval(refreshApplications, 45_000);
  const onFocus = () => refreshApplications();
  const onAppsUpdated = () => refreshApplications();
  window.addEventListener('focus', onFocus);
  window.addEventListener(APPLICATIONS_UPDATED_EVENT, onAppsUpdated);
  return () => {
   window.clearTimeout(t);
   window.clearInterval(interval);
   window.removeEventListener('focus', onFocus);
   window.removeEventListener(APPLICATIONS_UPDATED_EVENT, onAppsUpdated);
  };
 }, [refreshApplications]);

 /** Mevcut öğrenciler: başvuru fotoğrafını kalıcı kayda yaz */
 useEffect(() => {
  for (const student of baseStudents) {
   if (student.photoUrl || syncedPhotoIdsRef.current.has(student.id)) continue;
   const fromApp = applicationPhotos[student.id];
   if (!isDisplayablePhotoUrl(fromApp)) continue;
   syncedPhotoIdsRef.current.add(student.id);
   void (async () => {
    const url = await uploadStudentPhotoDataUrl(fromApp!, student.id);
    if (url) updateStudent(student.id, { photoUrl: url });
   })();
  }
 }, [baseStudents, applicationPhotos, updateStudent]);

 const formCountByStudentId = useMemo(() => {
  const total = new Map<string, number>();
  const signed = new Map<string, number>();
  for (const app of applicationMeta) {
   total.set(app.studentId, (total.get(app.studentId) ?? 0) + 1);
   if (app.signed) {
    signed.set(app.studentId, (signed.get(app.studentId) ?? 0) + 1);
   }
  }
  return { total, signed };
 }, [applicationMeta]);

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
  () => mergeBranchOffices(branchOffices, scopedDisciplineBranches),
  [branchOffices, scopedDisciplineBranches],
 );

 const filterOfficeOptions = useMemo(
  () => [FILTER_ALL_OFFICES, ...mergedOffices],
  [mergedOffices],
 );

 const filterBranchOptions = useMemo(() => {
  const office = filterBranchOffice !== FILTER_ALL_OFFICES ? filterBranchOffice : undefined;
  const names = disciplineNamesForOffice(scopedDisciplineBranches, office);
  return [FILTER_ALL_BRANCHES, ...names];
 }, [scopedDisciplineBranches, filterBranchOffice]);

 const filterGroupOptions = useMemo(() => {
  const office = filterBranchOffice !== FILTER_ALL_OFFICES ? filterBranchOffice : '';
  const discipline = filterBranch !== FILTER_ALL_BRANCHES ? filterBranch : '';
  const names = scopedTrainingGroups
   .filter((g) => (!office || g.branchOffice === office) && (!discipline || g.discipline === discipline))
   .map((g) => g.name.trim())
   .filter(Boolean);
  return [FILTER_ALL_GROUPS, ...[...new Set(names)].sort((a, b) => a.localeCompare(b, 'tr'))];
 }, [scopedTrainingGroups, filterBranchOffice, filterBranch]);

 useEffect(() => {
  if (filterBranchOffice !== FILTER_ALL_OFFICES && !mergedOffices.includes(filterBranchOffice)) {
   setFilterBranchOffice(FILTER_ALL_OFFICES);
  }
 }, [filterBranchOffice, mergedOffices]);

 useEffect(() => {
  if (filterBranch !== FILTER_ALL_BRANCHES && !filterBranchOptions.includes(filterBranch)) {
   setFilterBranch(FILTER_ALL_BRANCHES);
  }
 }, [filterBranch, filterBranchOptions]);

 useEffect(() => {
  if (filterGroup !== FILTER_ALL_GROUPS && !filterGroupOptions.includes(filterGroup)) {
   setFilterGroup(FILTER_ALL_GROUPS);
  }
 }, [filterGroup, filterGroupOptions]);

 const editOfficeOptions = useMemo(
  () => [PLACEHOLDER_OFFICE, ...mergedOffices],
  [mergedOffices],
 );

 const editDisciplineOptions = useMemo(() => {
  const office = formData.branchOffice !== PLACEHOLDER_OFFICE ? formData.branchOffice : '';
  const names = disciplineNamesForOffice(scopedDisciplineBranches, office || undefined);
  return [PLACEHOLDER_DISCIPLINE, ...names];
 }, [scopedDisciplineBranches, formData.branchOffice]);

 const editGroupOptions = useMemo(() => {
  const office = formData.branchOffice !== PLACEHOLDER_OFFICE ? formData.branchOffice : '';
  const discipline = formData.branch !== PLACEHOLDER_DISCIPLINE ? formData.branch : '';
  const filtered = scopedTrainingGroups
   .filter((g) => (!office || g.branchOffice === office) && (!discipline || g.discipline === discipline))
   .map((g) => g.name);
  return [PLACEHOLDER_GROUP, ...filtered];
 }, [formData.branchOffice, formData.branch, scopedTrainingGroups]);

 const editCoachOptions = useMemo(() => {
  const office = formData.branchOffice !== PLACEHOLDER_OFFICE ? formData.branchOffice : '';
  const clubCoaches = office ? coachesForClub(scopedCoaches, office) : scopedCoaches;
  const names = clubCoaches.map((c) => ({ id: c.id, name: c.name }));
  return [PLACEHOLDER_COACH, ...names];
 }, [scopedCoaches, formData.branchOffice]);

 const coachFilterOptions = useMemo(() => {
  const names = scopedCoaches.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'tr'));
  return ['Tüm Antrenörler', ...names];
 }, [scopedCoaches]);

 const filteredStudents = useMemo(() => {
 return baseStudents
  .filter((s) => {
 const matchSearch =
 !searchTerm ||
 searchIncludesText(s.name, searchTerm) ||
 searchIncludesText(s.group, searchTerm) ||
 (s.tcNo && s.tcNo.includes(searchTerm)) ||
 (s.parentPhone && s.parentPhone.includes(searchTerm));
 const matchBranchOffice =
 filterBranchOffice === FILTER_ALL_OFFICES || s.branchOffice === filterBranchOffice;
 const matchBranch =
 filterBranch === FILTER_ALL_BRANCHES || s.branch === filterBranch || s.group === filterBranch;
 const matchGroup = filterGroup === FILTER_ALL_GROUPS || s.group === filterGroup;
 const matchStatus =
 filterStatus === 'all' ||
 (filterStatus === 'active' && s.status !== 'inactive') ||
 (filterStatus === 'inactive' && s.status === 'inactive');
 const matchScholarship =
 filterScholarship === 'all' ||
 (filterScholarship === 'yes' && s.isScholarshipStudent) ||
 (filterScholarship === 'no' && !s.isScholarshipStudent);
 const isPrivateOrPackage =
  s.registrationType === 'package' || (s.group?.toLowerCase().includes('özel') ?? false);
 const matchPackage = filterPackage === 'all' || (filterPackage === 'yes' && isPrivateOrPackage);
 const matchCoach =
 filterCoach === 'Tüm Antrenörler' ||
 getCoachNamesForStudent(s, scopedCoaches, scopedTrainingGroups).includes(filterCoach);
 return matchSearch && matchBranchOffice && matchBranch && matchGroup && matchStatus && matchScholarship && matchPackage && matchCoach;
 })
  .sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }));
 }, [
 baseStudents,
 scopedCoaches,
 scopedTrainingGroups,
 searchTerm,
 filterBranchOffice,
 filterBranch,
 filterGroup,
 filterStatus,
 filterScholarship,
 filterPackage,
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
 setFilterBranchOffice(FILTER_ALL_OFFICES);
 setFilterBranch(FILTER_ALL_BRANCHES);
 setFilterGroup(FILTER_ALL_GROUPS);
 setFilterStatus('all');
 setFilterScholarship('all');
 setFilterPackage('all');
 setFilterCoach('Tüm Antrenörler');
 };

 const hasActiveFilters =
  Boolean(searchTerm.trim()) ||
  filterBranchOffice !== FILTER_ALL_OFFICES ||
  filterBranch !== FILTER_ALL_BRANCHES ||
  filterGroup !== FILTER_ALL_GROUPS ||
  filterStatus !== 'all' ||
  filterScholarship !== 'all' ||
  filterPackage !== 'all' ||
  filterCoach !== 'Tüm Antrenörler';

 const applyStatFilter = (key: 'total' | 'active' | 'inactive' | 'scholarship' | 'private') => {
  if (key === 'total') {
   setFilterStatus('all');
   setFilterScholarship('all');
   setFilterPackage('all');
   return;
  }
  if (key === 'active') {
   setFilterStatus((v) => (v === 'active' ? 'all' : 'active'));
   setFilterPackage('all');
   return;
  }
  if (key === 'inactive') {
   setFilterStatus((v) => (v === 'inactive' ? 'all' : 'inactive'));
   setFilterPackage('all');
   return;
  }
  if (key === 'scholarship') {
   setFilterScholarship((v) => (v === 'yes' ? 'all' : 'yes'));
   setFilterPackage('all');
   return;
  }
  setFilterPackage((v) => (v === 'yes' ? 'all' : 'yes'));
  setFilterScholarship('all');
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

 const handleBulkDelete = async () => {
 const ok = await confirmDialog({
 title: 'Öğrencileri sil',
 message: `${selectedIds.length} öğrenciyi silmek istediğinize emin misiniz?`,
 confirmLabel: 'Sil',
 variant: 'danger',
 });
 if (!ok) return;
 bulkDeleteStudents(selectedIds);
 setSelectedIds([]);
 };

 const handleDeleteStudent = async (student: { id: string; name?: string }) => {
 const ok = await confirmDialog({
 title: 'Öğrenciyi sil',
 message: `${student.name || 'Bu öğrenciyi'} silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
 confirmLabel: 'Sil',
 variant: 'danger',
 });
 if (!ok) return;
 deleteStudent(student.id);
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
  const matched = scopedCoaches.filter((c) => offices.has(normalizeClubKey(c.branch)));
  const list = matched.length > 0 ? matched : scopedCoaches;
  return [...list].sort(
    (a, b) => a.branch.localeCompare(b.branch, 'tr') || a.name.localeCompare(b.name, 'tr'),
  );
 }, [students, selectedIds, scopedCoaches]);

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
   const tg = findTrainingGroupByName(scopedTrainingGroups, groupName, { branchOffice: office, discipline });
   if (!tg) return next;
   const defaults = applyGroupDefaultsToStudent(tg, scopedDisciplineBranches);
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
   ? findTrainingGroupByName(scopedTrainingGroups, groupName, { branchOffice: office, discipline })
   : undefined;
  const groupDefaults = tg ? applyGroupDefaultsToStudent(tg, scopedDisciplineBranches) : null;
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
    const pill = (amount: string, label: string, tone: 'debt' | 'paid' | 'muted' | 'ok') => {
      const tones = {
        debt: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
        paid: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
        muted: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
        ok: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
      } as const;
      return (
        <div className="flex flex-col gap-1 min-w-0">
          {amount ? <span className="text-sm font-semibold text-slate-100 tabular-nums">{amount}</span> : null}
          <span className={`inline-flex w-fit px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${tones[tone]}`}>
            {label}
          </span>
        </div>
      );
    };

    if (s.registrationType === 'package') return pill('', 'Ders paketi', 'ok');
    if (s.isScholarshipStudent) return pill('', 'Burslu', 'paid');
    if (s.status === 'inactive') return pill('', 'Dondu', 'muted');

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const studentTransactions = filterDuesTransactions(
      transactions.filter((t) => t.studentId === s.id),
    );
    let totalPaidThisYear = 0;
    studentTransactions.forEach((t) => {
      const period = parseDuesPeriodFromTransaction(t);
      if (period && period.year === currentYear) {
        totalPaidThisYear += t.amount || 0;
      }
    });

    let expectedUpToNow = 0;
    for (let m = 1; m <= 12; m++) {
      if (m > currentMonth) continue;
      if (isMonthBeforeRegistration(s, currentYear, m)) continue;
      const dueInfo = getExpectedDueForMonth(s, currentYear, m, scopedTrainingGroups, scopedDisciplineBranches);
      expectedUpToNow += dueInfo.expected;
    }

    const duesDebt = expectedUpToNow > 0 ? Math.max(0, expectedUpToNow - totalPaidThisYear) : 0;

    if (duesDebt > 0) {
      return pill(`₺${Number(duesDebt).toLocaleString('tr-TR')}`, 'Borç', 'debt');
    }
    if (totalPaidThisYear > 0) {
      return pill(`₺${Number(totalPaidThisYear).toLocaleString('tr-TR')}`, 'Ödendi', 'paid');
    }
    return <span className="text-slate-500">—</span>;
  };

 const selectClass =
  'w-full lg:w-auto lg:min-w-[8.5rem] px-3 py-2.5 rounded-xl bg-slate-950/50 border border-white/[0.08] text-xs sm:text-sm font-medium text-slate-200 focus:ring-2 focus:ring-indigo-500/35 outline-none truncate';

 const statCards: {
  key: 'total' | 'active' | 'inactive' | 'scholarship' | 'private';
  value: number;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  accent: string;
 }[] = [
  {
   key: 'total',
   value: stats.total,
   label: 'Toplam',
   icon: <Users className="w-4 h-4" />,
   active: filterStatus === 'all' && filterScholarship === 'all' && filterPackage === 'all',
   accent: 'hover:border-indigo-400/30 data-[on=true]:border-indigo-400/40 data-[on=true]:bg-indigo-500/10 data-[on=true]:text-indigo-200',
  },
  {
   key: 'active',
   value: stats.active,
   label: 'Aktif',
   icon: <UserCheck className="w-4 h-4" />,
   active: filterStatus === 'active',
   accent: 'hover:border-emerald-400/30 data-[on=true]:border-emerald-400/40 data-[on=true]:bg-emerald-500/10 data-[on=true]:text-emerald-200',
  },
  {
   key: 'private',
   value: stats.privateLesson,
   label: 'Özel / Paket',
   icon: <FileText className="w-4 h-4" />,
   active: filterPackage === 'yes',
   accent: 'hover:border-sky-400/30 data-[on=true]:border-sky-400/40 data-[on=true]:bg-sky-500/10 data-[on=true]:text-sky-200',
  },
  {
   key: 'scholarship',
   value: stats.scholarship,
   label: 'Burslu',
   icon: <GraduationCap className="w-4 h-4" />,
   active: filterScholarship === 'yes',
   accent: 'hover:border-amber-400/30 data-[on=true]:border-amber-400/40 data-[on=true]:bg-amber-500/10 data-[on=true]:text-amber-200',
  },
  {
   key: 'inactive',
   value: stats.inactive,
   label: 'Pasif',
   icon: <UserX className="w-4 h-4" />,
   active: filterStatus === 'inactive',
   accent: 'hover:border-rose-400/30 data-[on=true]:border-rose-400/40 data-[on=true]:bg-rose-500/10 data-[on=true]:text-rose-200',
  },
 ];

 if (isAdmin && !adminViewClub) {
  return (
   <div className="max-w-xl mx-auto mt-10 sm:mt-16 rounded-2xl border border-white/[0.06] bg-[#1e293b]/80 p-6 sm:p-8 text-center space-y-4">
    <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
     <Users className="w-5 h-5 text-indigo-300" />
    </div>
    <h2 className="text-lg font-bold text-white">Kulüp seçin</h2>
    <p className="text-sm text-slate-400 leading-relaxed">
     Süper yönetici öğrenci listesinde tüm kulüpler bir arada gösterilmez. Üst menüden veya aşağıdaki kartlardan bir kulüp seçin.
    </p>
    <div className="flex flex-wrap justify-center gap-2 pt-1">
     {clubs.slice(0, 12).map((club) => (
      <button
       key={club.id}
       type="button"
       onClick={() => setAdminViewClubId(club.id)}
       className="px-3 py-1.5 rounded-lg border border-white/10 bg-slate-900/60 text-xs font-bold text-slate-200 hover:border-indigo-500/40 hover:text-white transition-colors"
      >
       {club.name}
      </button>
     ))}
    </div>
   </div>
  );
 }

 return (
 <div className="space-y-3 sm:space-y-4 min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20 lg:pb-0">
 {/* Compact header + actions */}
 <div className="rounded-2xl border border-white/[0.06] bg-[#1e293b]/80 backdrop-blur-xl px-4 sm:px-5 py-3.5 sm:py-4">
  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
   <div className="min-w-0">
    <div className="flex items-center gap-2.5">
     <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-400/20 flex items-center justify-center shrink-0">
      <Users className="w-4 h-4 text-indigo-300" />
     </div>
     <div className="min-w-0">
      <h1 className="text-base sm:text-xl font-black tracking-tight text-white">Öğrenci Listesi</h1>
      <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
       {isCoach
        ? 'Size atanmış öğrenciler'
        : isAdmin
          ? (adminViewClub ? `${adminViewClub.name} öğrencileri` : 'Kulüp seçin — öğrenciler birleştirilmez')
          : 'Ara, filtrele ve yönet'}
       {' · '}
       <span className="text-slate-300 font-semibold">{filteredStudents.length}</span> kayıt
      </p>
     </div>
    </div>
   </div>
   <div className="flex flex-wrap items-center gap-2">
    <button
     type="button"
     className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-slate-200 text-xs sm:text-sm font-bold transition-colors"
    >
     <FileText className="w-4 h-4 text-indigo-300" /> Aidat Takip
    </button>
    <button
     type="button"
     className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-slate-200 text-xs sm:text-sm font-bold transition-colors"
    >
     <QrCode className="w-4 h-4 text-amber-300" />
     <span className="hidden sm:inline">QR Kodlar</span>
     <span className="sm:hidden">QR</span>
    </button>
    {onAddNew && (
     <button
      type="button"
      onClick={onAddNew}
      className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold transition-colors shadow-lg shadow-emerald-900/30"
     >
      <Plus className="w-4 h-4" /> Yeni Öğrenci
     </button>
    )}
   </div>
  </div>
 </div>

 {/* Clickable stats */}
 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
  {statCards.map((card) => (
   <button
    key={card.key}
    type="button"
    data-on={card.active}
    onClick={() => applyStatFilter(card.key)}
    className={`group text-left rounded-2xl border border-white/[0.06] bg-[#1e293b]/70 px-3.5 py-3 transition-all ${card.accent}`}
    title={`${card.label} filtresini uygula`}
   >
    <div className="flex items-start justify-between gap-2">
     <div className="min-w-0">
      <p className="text-xl sm:text-2xl font-black text-white tracking-tight tabular-nums">{card.value}</p>
      <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">{card.label}</p>
     </div>
     <span className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-slate-400 group-hover:text-inherit shrink-0">
      {card.icon}
     </span>
    </div>
   </button>
  ))}
 </div>

 {/* Search + filters */}
 <div className="rounded-2xl border border-white/[0.06] bg-[#1e293b]/70 overflow-hidden">
  <div className="p-3 sm:p-4 space-y-3">
   <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
    <div className="relative flex-1 min-w-0">
     <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
     <input
      type="text"
      placeholder="Ad, TC, telefon veya grup ara..."
      className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-950/50 border border-white/[0.08] text-sm text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/35 outline-none transition-all"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
     />
    </div>
    <div className="flex items-center gap-2 shrink-0">
     <button
      type="button"
      onClick={() => setIsFiltersCollapsed((v) => !v)}
      className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-xs font-bold text-slate-300 transition-colors"
      aria-expanded={!isFiltersCollapsed}
     >
      {isFiltersCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      {isFiltersCollapsed ? 'Detaylı filtre' : 'Filtreleri gizle'}
     </button>
     {hasActiveFilters && (
      <button
       type="button"
       onClick={clearFilters}
       className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-rose-500/10 hover:border-rose-400/30 text-xs font-bold text-slate-300 hover:text-rose-200 transition-colors"
      >
       <RotateCcw className="w-3.5 h-3.5" /> Temizle
      </button>
     )}
    </div>
   </div>

   {!isFiltersCollapsed && (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:flex 2xl:flex-wrap gap-2 pt-1 border-t border-white/[0.05]">
     <select
      value={filterBranchOffice}
      onChange={(e) => {
       setFilterBranchOffice(e.target.value);
       setFilterBranch(FILTER_ALL_BRANCHES);
       setFilterGroup(FILTER_ALL_GROUPS);
      }}
      className={selectClass}
     >
      {filterOfficeOptions.map((o) => (
       <option key={o} value={o}>{o}</option>
      ))}
     </select>
     <select
      value={filterBranch}
      onChange={(e) => {
       setFilterBranch(e.target.value);
       setFilterGroup(FILTER_ALL_GROUPS);
      }}
      className={selectClass}
     >
      {filterBranchOptions.map((b) => (
       <option key={b} value={b}>{b}</option>
      ))}
     </select>
     <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} className={selectClass}>
      {filterGroupOptions.map((g) => (
       <option key={g} value={g}>{g}</option>
      ))}
     </select>
     <select
      value={filterStatus}
      onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
      className={selectClass}
     >
      <option value="all">Durum: Tümü</option>
      <option value="active">Aktif</option>
      <option value="inactive">Pasif</option>
     </select>
     <select
      value={filterScholarship}
      onChange={(e) => setFilterScholarship(e.target.value as typeof filterScholarship)}
      className={selectClass}
     >
      <option value="all">Burs: Tümü</option>
      <option value="yes">Burslu</option>
      <option value="no">Burslu değil</option>
     </select>
     {isAdmin && (
      <select value={filterCoach} onChange={(e) => setFilterCoach(e.target.value)} className={selectClass}>
       {coachFilterOptions.map((c) => (
        <option key={c} value={c}>{c}</option>
       ))}
      </select>
     )}
    </div>
   )}
  </div>
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
 <div className="lg:hidden space-y-2.5">
 {filteredStudents.map((student) => (
 <div
 key={student.id}
 className={`rounded-2xl border bg-[#1e293b]/80 p-3.5 transition-colors ${
  selectedIds.includes(student.id)
   ? 'border-indigo-400/40 bg-indigo-500/[0.07]'
   : 'border-white/[0.06]'
 }`}
 >
 <div className="flex items-start gap-3">
 <input
 type="checkbox"
 className="mt-1.5 w-4 h-4 rounded border-slate-600 bg-[#1e293b] text-indigo-600 focus:ring-indigo-500/50 cursor-pointer shrink-0"
 checked={selectedIds.includes(student.id)}
 onChange={() => toggleSelect(student.id)}
 />
 <button type="button" onClick={() => onViewDetail?.(student.id)} className="shrink-0">
  <StudentAvatar student={student} applicationPhotos={applicationPhotos} />
 </button>
 <div className="flex-1 min-w-0">
 <div className="flex items-start justify-between gap-2">
 <button type="button" onClick={() => onViewDetail?.(student.id)} className="min-w-0 text-left">
 <p className="font-bold text-white text-sm truncate">{student.name}</p>
 <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{student.tcNo || `ID: ${student.id.slice(0, 8)}`}</p>
 </button>
 <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
 student.status === 'inactive' ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'
 }`}>
 <span className={`w-1.5 h-1.5 rounded-full ${student.status === 'inactive' ? 'bg-rose-400' : 'bg-emerald-400'}`} />
 {student.status === 'inactive' ? 'Pasif' : 'Aktif'}
 </span>
 </div>
 <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-slate-400">
 <p className="truncate"><span className="text-slate-500">Grup</span><br /><span className="text-slate-200 font-medium">{student.group || '—'}</span></p>
 <div><span className="text-slate-500">Aidat</span><div className="mt-0.5">{formatDues(student)}</div></div>
 <p className="col-span-2 truncate text-[11px]">{student.branchOffice || '—'}{student.branch ? ` · ${student.branch}` : ''}</p>
 </div>
 <div className="mt-2.5">
 <StudentLoginQuickInfoInline
   student={student}
   onCopied={() => showToast('Giriş bilgileri kopyalandı.', 'success')}
 />
 </div>
 </div>
 </div>
 <div className="flex items-center justify-end gap-1 mt-3 pt-2.5 border-t border-white/[0.05]">
 <button type="button" title="Detay" onClick={() => onViewDetail?.(student.id)} className="p-2.5 rounded-xl text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-300"><Eye className="w-4 h-4" /></button>
 <button type="button" onClick={() => setSignedFormsStudent(student)} title="Başvuru formu" className="p-2.5 rounded-xl text-slate-400 hover:bg-violet-500/10 hover:text-violet-300"><PenLine className="w-4 h-4" /></button>
 <button type="button" onClick={() => handleOpenModal(student)} title="Düzenle" className="p-2.5 rounded-xl text-slate-400 hover:bg-amber-500/10 hover:text-amber-300"><Edit2 className="w-4 h-4" /></button>
 {!isCoach && (
 <button type="button" onClick={() => handleDeleteStudent(student)} title="Sil" className="p-2.5 rounded-xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="w-4 h-4" /></button>
 )}
 </div>
 </div>
 ))}
 {filteredStudents.length === 0 && (
 <div className="py-12 text-center rounded-2xl border border-dashed border-white/10 bg-[#1e293b]/40">
 <Users className="w-10 h-10 text-slate-500 mx-auto mb-3 opacity-50" />
 <p className="text-slate-400 text-sm font-medium">Kayıt bulunamadı</p>
 {hasActiveFilters && (
  <button type="button" onClick={clearFilters} className="mt-3 text-xs font-bold text-indigo-300 hover:text-indigo-200">
   Filtreleri temizle
  </button>
 )}
 </div>
 )}
 </div>

 {/* Masaüstü: tablo */}
 <div className="hidden lg:block rounded-2xl border border-white/[0.06] bg-[#1e293b]/75 overflow-hidden">
 <ResponsiveTable minWidth={980} className="table-scroll">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="border-b border-white/[0.06] bg-slate-950/40">
 <th className="px-4 py-3 w-10">
 <input
 type="checkbox"
 className="w-4 h-4 rounded border-slate-600 bg-[#1e293b] text-indigo-600 focus:ring-indigo-500/50 cursor-pointer"
 checked={selectedIds.length === filteredStudents.length && filteredStudents.length > 0}
 onChange={toggleSelectAll}
 />
 </th>
 <th className="px-2 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest w-10">#</th>
 <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Öğrenci</th>
 <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Şube / Branş</th>
 {isAdmin && (
 <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Antrenör</th>
 )}
 <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Grup</th>
 <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Aidat</th>
 <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Kayıt</th>
 <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Giriş</th>
 <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Durum</th>
 <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">İşlem</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-white/[0.04]">
 {filteredStudents.map((student, index) => (
 <tr
 key={student.id}
 className={`group hover:bg-white/[0.025] transition-colors ${selectedIds.includes(student.id) ? 'bg-indigo-500/[0.06]' : ''}`}
 >
 <td data-label="" className="px-4 py-3">
 <input
 type="checkbox"
 className="w-4 h-4 rounded border-slate-600 bg-[#1e293b] text-indigo-600 focus:ring-indigo-500/50 cursor-pointer"
 checked={selectedIds.includes(student.id)}
 onChange={() => toggleSelect(student.id)}
 />
 </td>
 <td data-label="#" className="px-2 py-3 text-xs font-medium text-slate-500 tabular-nums">{index + 1}</td>
 <td data-label="Öğrenci" className="px-3 py-3">
 <button
  type="button"
  onClick={() => onViewDetail?.(student.id)}
  className="flex items-center gap-3 text-left min-w-0 group/name"
 >
 <StudentAvatar student={student} applicationPhotos={applicationPhotos} className="w-9 h-9" />
 <div className="min-w-0">
 <p className="font-bold text-white text-sm tracking-tight truncate group-hover/name:text-indigo-200 transition-colors">{student.name}</p>
 <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
 {student.tcNo || `ID: ${student.id.slice(0, 8)}`}
 </p>
 </div>
 </button>
 </td>
 <td data-label="Şube / Branş" className="px-3 py-3">
 <p className="text-sm text-slate-300 max-w-[12rem] truncate" title={[student.branchOffice, student.branch].filter(Boolean).join(' / ')}>
 {student.branchOffice || '—'}
 </p>
 {student.branch ? <p className="text-[11px] text-slate-500 mt-0.5 truncate">{student.branch}</p> : null}
 </td>
 {isAdmin && (
 <td data-label="Antrenör" className="px-3 py-3">
 <p className="text-[11px] text-teal-300/90 font-medium max-w-[9rem] truncate" title={getCoachNamesForStudent(student, scopedCoaches, scopedTrainingGroups).join(', ')}>
 {getCoachNamesForStudent(student, scopedCoaches, scopedTrainingGroups).join(', ') || 'Atanmamış'}
 </p>
 </td>
 )}
 <td data-label="Grup" className="px-3 py-3">
 <p className="text-sm font-medium text-slate-200 max-w-[10rem] truncate" title={student.group}>{student.group || '—'}</p>
 {student.registrationType && (
 <p className="text-[10px] text-slate-500 mt-0.5">
 {student.registrationType === 'monthly' ? 'Aylık' : 'Paket'}
 </p>
 )}
 </td>
 <td data-label="Aidat" className="px-3 py-3">{formatDues(student)}</td>
 <td data-label="Kayıt" className="px-3 py-3 text-xs text-slate-400 tabular-nums whitespace-nowrap">
 {student.registrationDate ? new Date(student.registrationDate).toLocaleDateString('tr-TR') : '—'}
 </td>
 <td data-label="Giriş" className="px-3 py-3">
 <StudentLoginQuickInfo
   student={student}
   compact
   onCopied={() => showToast('Giriş bilgileri kopyalandı.', 'success')}
 />
 </td>
 <td data-label="Durum" className="px-3 py-3">
 <span
 className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold ${
 student.status === 'inactive'
 ? 'bg-rose-500/10 text-rose-300'
 : 'bg-emerald-500/10 text-emerald-300'
 }`}
 >
 <span className={`w-1.5 h-1.5 rounded-full ${student.status === 'inactive' ? 'bg-rose-400' : 'bg-emerald-400'}`} />
 {student.status === 'inactive' ? 'Pasif' : 'Aktif'}
 </span>
 </td>
 <td data-label="İşlem" className="px-3 py-3">
 <div className="flex justify-end items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
 <button
 type="button"
 title="Detay"
 onClick={() => onViewDetail?.(student.id)}
 className="p-2 rounded-lg text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors"
 >
 <Eye className="w-4 h-4" />
 </button>
 <button
 type="button"
 onClick={() => setSignedFormsStudent(student)}
 title={
  (formCountByStudentId.signed.get(student.id) ?? 0) > 0
   ? `Başvuru formu — imzalı (${formCountByStudentId.signed.get(student.id)})`
   : 'Başvuru formu'
 }
 className={`relative p-2 rounded-lg transition-colors ${
  (formCountByStudentId.signed.get(student.id) ?? 0) > 0
   ? 'text-violet-400 hover:bg-violet-500/10'
   : 'text-slate-400 hover:bg-violet-500/10 hover:text-violet-300'
 }`}
 >
 <PenLine className="w-4 h-4" />
 {(formCountByStudentId.signed.get(student.id) ?? 0) > 0 ? (
  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-violet-400" />
 ) : null}
 </button>
 <button
 type="button"
 onClick={() => handleOpenModal(student)}
 title="Düzenle"
 className="p-2 rounded-lg text-slate-400 hover:bg-amber-500/10 hover:text-amber-300 transition-colors"
 >
 <Edit2 className="w-4 h-4" />
 </button>
 {!isCoach && (
 <button
 type="button"
 onClick={() => handleDeleteStudent(student)}
 title="Sil"
 className="p-2 rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
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
 <Users className="w-12 h-12 text-slate-500 mx-auto mb-4 opacity-40" />
 <p className="text-slate-300 font-medium">Kayıt bulunamadı</p>
 <p className="text-sm text-slate-500 mt-1">Filtreleri değiştirin veya yeni öğrenci ekleyin</p>
 {hasActiveFilters && (
  <button type="button" onClick={clearFilters} className="mt-4 text-xs font-bold text-indigo-300 hover:text-indigo-200">
   Filtreleri temizle
  </button>
 )}
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
  refreshApplications();
 }}
 />
 ) : null}
 </div>
 );
};

export default StudentList;
