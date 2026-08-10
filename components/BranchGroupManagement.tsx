import React, { useMemo, useState } from 'react';
import {
  Building2, BookOpen, Plus, Trash2, Pencil, ChevronDown, ChevronRight, Clock, UserCircle,
  UserPlus, Search, Check, X, Package, Briefcase, Calendar,
} from 'lucide-react';
import { useApp } from '../AppContext';
import type { DisciplineBranch, GroupLessonSlot, LessonPackage, TrainingGroup } from '../types';
import {
  WEEKDAY_OPTIONS, applyGroupDefaultsToStudent, emptyLessonSlot, formatLessonSchedule, getGroupMonthlyFee,
  studentsInTrainingGroup,
} from '../lib/trainingGroupUtils';
import { coachesForClub } from '../lib/orgScope';
import { normalizeClubKey } from '../lib/clubScope';
import { resolveClubIdFromAuth, resolveBranchOfficeNames, clubIdForOfficeRecord } from '../lib/orgStructureDb';
import { DEFAULT_APPLICATION_GROUPS, DEFAULT_APPLICATION_OFFICES } from '../lib/applicationFormOptions';
import { buildDefaultOrgStructure, buildClubDefaultOrgStructure } from '../lib/seedDefaultOrgStructure';
import { normalizeSearchText, searchIncludesText } from '../lib/searchText';
import { ResponsiveTable } from './ui/ResponsiveTable';

const LESSON_COUNT_OPTIONS = [1, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 48];

const BranchGroupManagement: React.FC = () => {
  const {
    branchOffices,
    branchOfficeRecords,
    addBranchOffice,
    removeBranchOffice,
    disciplineBranches: allDisciplineBranches,
    addDisciplineBranch,
    updateDisciplineBranch,
    removeDisciplineBranch,
    trainingGroups: allTrainingGroups,
    addTrainingGroup,
    updateTrainingGroup,
    removeTrainingGroup,
    scopedStudents: students,
    scopedDisciplineBranches: disciplineBranches,
    scopedTrainingGroups: trainingGroups,
    scopedLessonPackages: lessonPackages,
    addLessonPackage,
    updateLessonPackage,
    removeLessonPackage,
    scopedCoaches: coaches,
    updateStudent,
    auth,
    activeClubBranch,
    clubs,
    showToast,
    confirmDialog,
  } = useApp();

  const isClubUser = auth?.role === 'club';
  const clubBranch = activeClubBranch ?? auth?.branch ?? '';

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newOfficeName, setNewOfficeName] = useState('');
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<DisciplineBranch | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TrainingGroup | null>(null);
  const [groupParentBranch, setGroupParentBranch] = useState<DisciplineBranch | null>(null);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<LessonPackage | null>(null);
  const [packageParentBranch, setPackageParentBranch] = useState<DisciplineBranch | null>(null);
  const [showGroupBranchPicker, setShowGroupBranchPicker] = useState(false);

  const [branchForm, setBranchForm] = useState({ name: '', branchOffice: '', monthlyFee: '' });
  const [groupForm, setGroupForm] = useState({
    name: '',
    monthlyFee: '',
    capacity: '14',
    lessonSlots: [emptyLessonSlot()] as GroupLessonSlot[],
    coachIds: [] as string[],
  });
  const [packageForm, setPackageForm] = useState({
    disciplineBranchId: '',
    name: '',
    lessonCount: '4',
    validityDays: '30',
    packageFee: '',
    capacity: '1',
    coachIds: [] as string[],
    createBranchIfMissing: false,
  });
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [studentModalGroup, setStudentModalGroup] = useState<TrainingGroup | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [listSearch, setListSearch] = useState('');

  const sortedBranches = useMemo(
    () => [...disciplineBranches].sort((a, b) => a.branchOffice.localeCompare(b.branchOffice) || a.name.localeCompare(b.name)),
    [disciplineBranches]
  );

  const filteredBranches = useMemo(() => {
    const q = listSearch.trim();
    if (!q) return sortedBranches;
    return sortedBranches.filter((branch) => {
      if (searchIncludesText(branch.name, q) || searchIncludesText(branch.branchOffice, q)) return true;
      return trainingGroups.some(
        (g) =>
          g.discipline === branch.name &&
          normalizeClubKey(g.branchOffice) === normalizeClubKey(branch.branchOffice) &&
          searchIncludesText(g.name, q),
      ) || lessonPackages.some(
        (p) =>
          p.discipline === branch.name &&
          normalizeClubKey(p.branchOffice) === normalizeClubKey(branch.branchOffice) &&
          searchIncludesText(p.name, q),
      );
    });
  }, [sortedBranches, listSearch, trainingGroups, lessonPackages]);

  const officeOptions = useMemo(() => {
    const filtered = isClubUser
      ? branchOfficeRecords.filter((r) => {
          const clubId = resolveClubIdFromAuth(auth, clubs);
          if (!clubId) return true;
          return !r.clubId || r.clubId === clubId || clubIdForOfficeRecord(r, clubs) === clubId;
        })
      : branchOfficeRecords;
    return resolveBranchOfficeNames(filtered, [], auth, clubs);
  }, [branchOfficeRecords, isClubUser, auth, clubs]);

  const pageStats = useMemo(
    () => ({
      offices: officeOptions.length,
      branches: sortedBranches.length,
      groups: trainingGroups.length,
      packages: lessonPackages.length,
    }),
    [officeOptions.length, sortedBranches.length, trainingGroups.length, lessonPackages.length],
  );

  /** Kurumsal Yapı'daki kulüpler — henüz branch_offices tablosunda şube olarak tanımlı değil */
  const clubsPendingAsOffice = useMemo(() => {
    if (isClubUser) return [];
    return clubs.filter((c) => {
      const name = c.name.trim();
      if (!name) return false;
      return !branchOfficeRecords.some(
        (r) => clubIdForOfficeRecord(r, clubs) === c.id || normalizeClubKey(r.name) === normalizeClubKey(name),
      );
    });
  }, [clubs, branchOfficeRecords, isClubUser]);

  const countStudentsInGroup = (group: TrainingGroup) => studentsInTrainingGroup(students, group).length;

  const enrolledInModalGroup = useMemo(() => {
    if (!studentModalGroup) return new Set<string>();
    return new Set(studentsInTrainingGroup(students, studentModalGroup).map((s) => s.id));
  }, [students, studentModalGroup]);

  const modalStudentOptions = useMemo(() => {
    const q = normalizeSearchText(studentSearch);
    return [...students]
      .filter((s) => s.status !== 'inactive')
      .filter((s) => !q || searchIncludesText(s.name, q) || searchIncludesText(s.group, q))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [students, studentSearch]);

  const openAddStudents = (group: TrainingGroup) => {
    setStudentModalGroup(group);
    setStudentSearch('');
    setSelectedStudentIds([]);
    setShowStudentModal(true);
  };

  const toggleStudentSelection = (id: string) => {
    if (enrolledInModalGroup.has(id)) return;
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const assignStudentsToGroup = () => {
    if (!studentModalGroup || selectedStudentIds.length === 0) return;
    const enrolled = countStudentsInGroup(studentModalGroup);
    const capacity = studentModalGroup.capacity || 0;
    if (capacity > 0 && enrolled + selectedStudentIds.length > capacity) {
      showToast(`Kontenjan aşılıyor. Boş yer: ${Math.max(0, capacity - enrolled)}`, 'warning');
      return;
    }
    const defaults = applyGroupDefaultsToStudent(studentModalGroup, disciplineBranches);
    const coachId =
      studentModalGroup.coachIds?.length === 1 ? studentModalGroup.coachIds[0] : undefined;
    selectedStudentIds.forEach((id) => updateStudent(id, { ...defaults, ...(coachId ? { coachId } : {}) }));
    setShowStudentModal(false);
    setStudentModalGroup(null);
    setSelectedStudentIds([]);
  };

  const openAddBranch = () => {
    if (officeOptions.length === 0) {
      showToast(isClubUser
        ? 'Ana şube kaydı oluşturuluyor. Sayfayı yenileyip tekrar deneyin.'
        : 'Önce şube ekleyin veya kulübü + ile şube olarak tanımlayın.', 'warning');
      return;
    }
    setEditingBranch(null);
    setBranchForm({
      name: '',
      branchOffice: officeOptions[0] || '',
      monthlyFee: '',
    });
    setShowBranchModal(true);
  };

  const openEditBranch = (branch: DisciplineBranch) => {
    setEditingBranch(branch);
    setBranchForm({
      name: branch.name,
      branchOffice: branch.branchOffice,
      monthlyFee: String(branch.monthlyFee || ''),
    });
    setShowBranchModal(true);
  };

  const saveBranch = () => {
    const name = branchForm.name.trim();
    const branchOffice = branchForm.branchOffice.trim();
    const monthlyFee = Number(branchForm.monthlyFee) || 0;
    if (!name || !branchOffice) return;
    if (editingBranch) {
      updateDisciplineBranch(editingBranch.id, { name, branchOffice, monthlyFee });
    } else {
      addDisciplineBranch({ name, branchOffice, monthlyFee });
    }
    setShowBranchModal(false);
  };

  const openAddGroup = (parent: DisciplineBranch) => {
    setEditingGroup(null);
    setGroupParentBranch(parent);
    setGroupForm({
      name: '',
      monthlyFee: '',
      capacity: '14',
      lessonSlots: [emptyLessonSlot()],
      coachIds: [],
    });
    setShowGroupModal(true);
  };

  const openAddGroupFromTop = () => {
    if (sortedBranches.length === 0) {
      showToast('Önce en az bir branş tanımlayın.', 'warning');
      return;
    }
    if (sortedBranches.length === 1) {
      openAddGroup(sortedBranches[0]);
      return;
    }
    setShowGroupBranchPicker(true);
  };

  const emptyPackageForm = (branch?: DisciplineBranch) => ({
    disciplineBranchId: branch?.id ?? sortedBranches[0]?.id ?? '',
    name: '',
    lessonCount: '4',
    validityDays: '30',
    packageFee: '',
    capacity: '1',
    coachIds: [] as string[],
    createBranchIfMissing: false,
  });

  const openAddPackage = (parent?: DisciplineBranch) => {
    if (sortedBranches.length === 0) {
      showToast('Önce en az bir branş tanımlayın.', 'warning');
      return;
    }
    setEditingPackage(null);
    setPackageParentBranch(parent ?? null);
    setPackageForm(emptyPackageForm(parent));
    setShowPackageModal(true);
  };

  const openEditPackage = (pkg: LessonPackage, parent: DisciplineBranch) => {
    setEditingPackage(pkg);
    setPackageParentBranch(parent);
    setPackageForm({
      disciplineBranchId: parent.id,
      name: pkg.name,
      lessonCount: String(pkg.lessonCount || 4),
      validityDays: String(pkg.validityDays || 30),
      packageFee: String(pkg.packageFee || ''),
      capacity: String(pkg.capacity || 1),
      coachIds: pkg.coachIds ? [...pkg.coachIds] : [],
      createBranchIfMissing: false,
    });
    setShowPackageModal(true);
  };

  const savePackage = () => {
    const branch = disciplineBranches.find((b) => b.id === packageForm.disciplineBranchId);
    if (!branch) {
      showToast('Branş seçiniz.', 'warning');
      return;
    }
    const name = packageForm.name.trim();
    const lessonCount = Number(packageForm.lessonCount) || 0;
    const validityDays = Number(packageForm.validityDays) || 0;
    const packageFee = Number(packageForm.packageFee) || 0;
    const capacity = Number(packageForm.capacity) || 0;
    if (!name) {
      showToast('Ders paketi adı zorunludur.', 'warning');
      return;
    }
    if (lessonCount <= 0) {
      showToast('Ders sayısı seçiniz.', 'warning');
      return;
    }
    if (validityDays <= 0) {
      showToast('Geçerlilik süresi giriniz.', 'warning');
      return;
    }

    if (packageForm.createBranchIfMissing && !editingPackage) {
      const exists = disciplineBranches.some(
        (b) => b.name === name && normalizeClubKey(b.branchOffice) === normalizeClubKey(branch.branchOffice),
      );
      if (!exists) {
        addDisciplineBranch({ name, branchOffice: branch.branchOffice, monthlyFee: packageFee });
      }
    }

    const disciplineName =
      packageForm.createBranchIfMissing && !editingPackage ? name : branch.name;

    const payload = {
      name,
      branchOffice: branch.branchOffice,
      discipline: disciplineName,
      lessonCount,
      validityDays,
      packageFee,
      capacity,
      coachIds: packageForm.coachIds.length ? packageForm.coachIds : undefined,
    };

    if (editingPackage) {
      updateLessonPackage(editingPackage.id, payload);
    } else {
      addLessonPackage(payload);
    }
    setShowPackageModal(false);
  };

  const openEditGroup = (group: TrainingGroup, parent: DisciplineBranch) => {
    setEditingGroup(group);
    setGroupParentBranch(parent);
    setGroupForm({
      name: group.name,
      monthlyFee: group.monthlyFee != null ? String(group.monthlyFee) : '',
      capacity: String(group.capacity || 0),
      lessonSlots: group.lessonSlots.length ? group.lessonSlots.map((s) => ({ ...s })) : [emptyLessonSlot()],
      coachIds: group.coachIds ? [...group.coachIds] : [],
    });
    setShowGroupModal(true);
  };

  const saveGroup = () => {
    if (!groupParentBranch) return;
    const name = groupForm.name.trim();
    if (!name) return;
    const payload = {
      name,
      branchOffice: groupParentBranch.branchOffice,
      discipline: groupParentBranch.name,
      monthlyFee: groupForm.monthlyFee.trim() ? Number(groupForm.monthlyFee) : undefined,
      capacity: Number(groupForm.capacity) || 0,
      lessonSlots: groupForm.lessonSlots.filter((s) => s.dayLabel && s.startTime),
      coachIds: groupForm.coachIds.length ? groupForm.coachIds : undefined,
    };
    if (editingGroup) {
      updateTrainingGroup(editingGroup.id, payload);
    } else {
      addTrainingGroup(payload);
    }
    setShowGroupModal(false);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const updateSlot = (idx: number, patch: Partial<GroupLessonSlot>) => {
    setGroupForm((prev) => {
      const slots = [...prev.lessonSlots];
      const current = { ...slots[idx], ...patch };
      if (patch.dayOfWeek != null) {
        const label = WEEKDAY_OPTIONS.find((d) => d.value === patch.dayOfWeek)?.label ?? current.dayLabel;
        current.dayLabel = label;
      }
      slots[idx] = current;
      return { ...prev, lessonSlots: slots };
    });
  };

  const addSlot = () => setGroupForm((prev) => ({ ...prev, lessonSlots: [...prev.lessonSlots, emptyLessonSlot()] }));
  const removeSlot = (idx: number) =>
    setGroupForm((prev) => ({ ...prev, lessonSlots: prev.lessonSlots.filter((_, i) => i !== idx) }));

  const coachName = (id: string) => coaches.find((c) => c.id === id)?.name ?? 'Atanmamış';

  const groupCoachOptions = useMemo(() => {
    if (!groupParentBranch) return coaches;
    return coachesForClub(coaches, groupParentBranch.branchOffice);
  }, [coaches, groupParentBranch]);

  const toggleGroupCoach = (coachId: string) => {
    setGroupForm((prev) => {
      const has = prev.coachIds.includes(coachId);
      return {
        ...prev,
        coachIds: has ? prev.coachIds.filter((id) => id !== coachId) : [...prev.coachIds, coachId],
      };
    });
  };

  const packageBranchForForm = useMemo(
    () => disciplineBranches.find((b) => b.id === packageForm.disciplineBranchId) ?? packageParentBranch,
    [disciplineBranches, packageForm.disciplineBranchId, packageParentBranch],
  );

  const packageCoachOptions = useMemo(() => {
    if (!packageBranchForForm) return coaches;
    return coachesForClub(coaches, packageBranchForForm.branchOffice);
  }, [coaches, packageBranchForForm]);

  const togglePackageCoach = (coachId: string) => {
    setPackageForm((prev) => {
      const has = prev.coachIds.includes(coachId);
      return {
        ...prev,
        coachIds: has ? prev.coachIds.filter((id) => id !== coachId) : [...prev.coachIds, coachId],
      };
    });
  };

  const importApplicationDefaults = async () => {
    if (isClubUser) {
      if (!clubBranch.trim()) return;
      const ok = await confirmDialog({
        title: 'Varsayılan yapı',
        message: `"${clubBranch}" kulübü için Satranç branşı ve varsayılan eğitim grupları oluşturulsun mu?`,
        confirmLabel: 'Oluştur',
      });
      if (!ok) return;
      const clubId = resolveClubIdFromAuth(auth, clubs);
      const seeded = buildClubDefaultOrgStructure(clubBranch, clubId);
      if (!branchOffices.some((o) => normalizeClubKey(o) === normalizeClubKey(clubBranch))) {
        addBranchOffice(clubBranch);
      }
      if (!disciplineBranches.some((b) => b.name === 'Satranç' && b.branchOffice === clubBranch)) {
        addDisciplineBranch({ name: 'Satranç', branchOffice: clubBranch, monthlyFee: 0 });
      }
      for (const group of seeded.groups) {
        if (!trainingGroups.some((g) => g.name === group.name)) {
          addTrainingGroup({
            name: group.name,
            branchOffice: clubBranch,
            discipline: 'Satranç',
            capacity: group.capacity,
            lessonSlots: group.lessonSlots,
          });
        }
      }
      return;
    }

    const ok = await confirmDialog({
      title: 'Varsayılan yapı',
      message: 'Merkez, Çayyolu ve Ümitköy şubeleri ile Satranç branşı ve başvuru formundaki varsayılan gruplar oluşturulsun mu?',
      confirmLabel: 'Oluştur',
    });
    if (!ok) return;
    const primaryOffice = officeOptions[0] || DEFAULT_APPLICATION_OFFICES[0];
    const seeded = buildDefaultOrgStructure(primaryOffice);
    for (const office of DEFAULT_APPLICATION_OFFICES) {
      if (!branchOffices.includes(office)) addBranchOffice(office);
    }
    if (!allDisciplineBranches.some((b) => b.name === 'Satranç' && b.branchOffice === primaryOffice)) {
      addDisciplineBranch({ name: 'Satranç', branchOffice: primaryOffice, monthlyFee: 0 });
    }
    for (const group of seeded.groups) {
      if (!allTrainingGroups.some((g) => g.name === group.name)) {
        addTrainingGroup({
          name: group.name,
          branchOffice: group.branchOffice,
          discipline: group.discipline,
          capacity: group.capacity,
          lessonSlots: group.lessonSlots,
        });
      }
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-4">
      {/* Header */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#1e293b]/80 backdrop-blur-xl px-4 sm:px-5 py-3 sm:py-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-400/20 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-violet-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-black tracking-tight text-white">Branş & Grup</h2>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
                {isClubUser
                  ? 'Şube → branş → grup / paket tanımları'
                  : 'Şube, branş, grup ve ders paketlerini yönetin'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {officeOptions.length === 0 && sortedBranches.length === 0 && trainingGroups.length === 0 ? (
              <button
                type="button"
                onClick={importApplicationDefaults}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" /> {isClubUser ? 'Hızlı başlangıç' : 'Varsayılanları yükle'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={openAddBranch}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" /> Branş
            </button>
            <button
              type="button"
              onClick={openAddGroupFromTop}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" /> Grup
            </button>
            <button
              type="button"
              onClick={() => openAddPackage()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" /> Paket
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Şube', value: pageStats.offices, icon: <Building2 className="w-3.5 h-3.5" />, tone: 'text-violet-300 bg-violet-500/10 border-violet-500/20' },
          { label: 'Branş', value: pageStats.branches, icon: <BookOpen className="w-3.5 h-3.5" />, tone: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20' },
          { label: 'Grup', value: pageStats.groups, icon: <UserPlus className="w-3.5 h-3.5" />, tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' },
          { label: 'Paket', value: pageStats.packages, icon: <Package className="w-3.5 h-3.5" />, tone: 'text-amber-300 bg-amber-500/10 border-amber-500/20' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/[0.06] bg-[#1e293b]/70 px-3 py-2.5 flex items-center justify-between gap-2">
            <div>
              <p className="text-lg font-black text-white tabular-nums leading-none">{s.value}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">{s.label}</p>
            </div>
            <span className={`w-8 h-8 rounded-lg border flex items-center justify-center ${s.tone}`}>{s.icon}</span>
          </div>
        ))}
      </div>

      {/* Offices */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#1e293b]/75 overflow-hidden">
        <div className="px-3.5 sm:px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2.5 bg-slate-950/30">
          <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-400/20 flex items-center justify-center text-violet-300 shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
            <h3 className="text-sm font-black text-white">Şubeler</h3>
            <p className="text-[11px] text-slate-500">
              {isClubUser ? 'Ana şube otomatik; alt şube ekleyebilirsiniz' : 'Kulübü + ile şube yapın veya yeni ad yazın'}
            </p>
          </div>
        </div>
        <div className="p-3 sm:p-3.5 space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {officeOptions.map((office) => {
              const inUse =
                disciplineBranches.some(
                  (b) => normalizeClubKey(b.branchOffice) === normalizeClubKey(office),
                ) ||
                trainingGroups.some(
                  (g) => normalizeClubKey(g.branchOffice) === normalizeClubKey(office),
                );
              const isMainClubOffice = isClubUser && normalizeClubKey(office) === normalizeClubKey(clubBranch);
              return (
                <span
                  key={office}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-200 text-xs font-semibold"
                >
                  {office}
                  <button
                    type="button"
                    title={
                      isMainClubOffice
                        ? 'Ana kulüp şubesi silinemez'
                        : inUse
                          ? 'Bu şubede branş veya grup var'
                          : 'Şubeyi sil'
                    }
                    disabled={isMainClubOffice}
                    onClick={async () => {
                      if (isMainClubOffice) return;
                      const ok = await confirmDialog({
                        title: 'Şubeyi sil',
                        message: `"${office}" şubesini silmek istiyor musunuz?`,
                        confirmLabel: 'Sil',
                        variant: 'danger',
                      });
                      if (ok) removeBranchOffice(office);
                    }}
                    className="p-1 rounded-md hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
            {clubsPendingAsOffice.map((club) => (
              <span
                key={`club-${club.id}`}
                title="Kulüp kaydı — + ile şube olarak ekleyin"
                className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-slate-950/50 border border-dashed border-slate-500/40 text-slate-400 text-xs font-semibold"
              >
                {club.name}
                <button
                  type="button"
                  title="Bu kulübü şube olarak ekle"
                  onClick={() => addBranchOffice(club.name, { clubId: club.id })}
                  className="p-1 rounded-md hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          {clubsPendingAsOffice.length > 0 ? (
            <p className="text-[10px] text-slate-500">
              Kesik çerçeve = Kurumsal Yapı kulübü (henüz şube değil). + ile ekleyin.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={newOfficeName}
              onChange={(e) => setNewOfficeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = newOfficeName.trim();
                  if (v) {
                    addBranchOffice(v);
                    setNewOfficeName('');
                  }
                }
              }}
              placeholder="Yeni şube adı..."
              className="flex-1 min-w-[12rem] px-3 py-2 rounded-lg bg-slate-950/50 border border-white/[0.08] text-sm text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <button
              type="button"
              disabled={!newOfficeName.trim()}
              onClick={() => {
                addBranchOffice(newOfficeName.trim());
                setNewOfficeName('');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" /> Ekle
            </button>
          </div>
        </div>
      </div>

      {sortedBranches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#1e293b]/40 px-4 py-10 text-center space-y-3">
          <BookOpen className="w-9 h-9 mx-auto text-slate-500" />
          <p className="text-slate-300 text-sm font-semibold">Henüz branş yok</p>
          <ol className="text-[11px] text-slate-500 max-w-sm mx-auto text-left space-y-1 list-decimal list-inside">
            <li>Şube ekleyin</li>
            <li>Branş oluşturun</li>
            <li>Branş altına grup / paket ekleyin</li>
          </ol>
          <button
            type="button"
            onClick={openAddBranch}
            disabled={officeOptions.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" /> İlk branşı oluştur
          </button>
          {officeOptions.length === 0 ? (
            <p className="text-[11px] text-amber-400/90">Önce bir şube ekleyin.</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/[0.06] bg-[#1e293b]/70 px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-black text-white">Branşlar ve gruplar</h3>
              <p className="text-[11px] text-slate-500">
                {filteredBranches.length}/{sortedBranches.length} branş
                {listSearch.trim() ? ' · filtreli' : ''}
              </p>
            </div>
            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Branş, şube veya grup ara..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950/50 border border-white/[0.08] text-sm text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
          </div>

          {filteredBranches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-slate-500">
              Aramayla eşleşen branş yok.
            </div>
          ) : null}

          {filteredBranches.map((branch, idx) => {
            const branchGroups = trainingGroups.filter(
              (g) =>
                g.discipline === branch.name &&
                normalizeClubKey(g.branchOffice) === normalizeClubKey(branch.branchOffice),
            );
            const branchPackages = lessonPackages.filter(
              (p) =>
                p.discipline === branch.name &&
                normalizeClubKey(p.branchOffice) === normalizeClubKey(branch.branchOffice),
            );
            const isOpen = expanded[branch.id] !== false;
            return (
              <div key={branch.id} className="rounded-2xl border border-white/[0.06] bg-[#1e293b]/75 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 px-3 sm:px-3.5 py-2.5 border-b border-white/[0.06] bg-slate-950/25">
                  <button
                    type="button"
                    onClick={() => toggleExpand(branch.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  >
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <span className="text-[10px] font-bold text-slate-500 tabular-nums w-5">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-white truncate">{branch.name}</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-300 text-[10px] font-bold">
                        <Building2 className="w-3 h-3" /> {branch.branchOffice}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">{branchGroups.length} grup · {branchPackages.length} paket</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <button type="button" onClick={() => openAddGroup(branch)} className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" title="Grup ekle">
                      <UserPlus className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => openAddPackage(branch)} className="p-2 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20" title="Ders paketi ekle">
                      <Package className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => openEditBranch(branch)} className="p-2 rounded-lg bg-white/[0.04] text-slate-300 hover:bg-amber-500/15 hover:text-amber-300" title="Düzenle">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (branchGroups.length > 0 || branchPackages.length > 0) {
                          showToast('Önce bu branştaki grupları ve paketleri silin.', 'warning');
                          return;
                        }
                        const ok = await confirmDialog({
                          title: 'Branşı sil',
                          message: `"${branch.name}" branşını silmek istediğinize emin misiniz?`,
                          confirmLabel: 'Sil',
                          variant: 'danger',
                        });
                        if (ok) removeDisciplineBranch(branch.id);
                      }}
                      className="p-2 rounded-lg bg-white/[0.04] text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"
                      title="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="p-3 sm:p-3.5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Gruplar
                      </div>
                      <button
                        type="button"
                        onClick={() => openAddGroup(branch)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold"
                      >
                        <Plus className="w-3 h-3" /> Grup
                      </button>
                    </div>

                    {branchGroups.length === 0 ? (
                      <p className="text-slate-500 text-xs py-3 text-center rounded-lg border border-dashed border-white/10">Bu branşta grup yok.</p>
                    ) : (
                      <ResponsiveTable minWidth={720}>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/[0.06]">
                              <th className="text-left py-2 pr-2">#</th>
                              <th className="text-left py-2 pr-2">Grup</th>
                              <th className="text-left py-2 pr-2">Ücret</th>
                              <th className="text-left py-2 pr-2">Program</th>
                              <th className="text-left py-2 pr-2">Kont.</th>
                              <th className="text-left py-2 pr-2">Öğr.</th>
                              <th className="text-left py-2 pr-2">Antrenör</th>
                              <th className="text-right py-2">İşlem</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.04]">
                            {branchGroups.map((group, gIdx) => {
                              const enrolled = countStudentsInGroup(group);
                              const fee = getGroupMonthlyFee(group, disciplineBranches);
                              return (
                                <tr key={group.id} className="hover:bg-white/[0.02]">
                                  <td data-label="#" className="py-2.5 pr-2 text-slate-500 text-xs tabular-nums">{gIdx + 1}</td>
                                  <td data-label="Grup" className="py-2.5 pr-2 font-semibold text-white text-sm">{group.name}</td>
                                  <td data-label="Ücret" className="py-2.5 pr-2">
                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 text-[11px] font-bold tabular-nums">
                                      ₺{Number(fee).toLocaleString('tr-TR')}
                                    </span>
                                  </td>
                                  <td data-label="Program" className="py-2.5 pr-2 text-slate-400 text-[11px] max-w-[180px]">
                                    <span className="inline-flex items-center gap-1 truncate" title={formatLessonSchedule(group.lessonSlots)}>
                                      <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                                      <span className="truncate">{formatLessonSchedule(group.lessonSlots)}</span>
                                    </span>
                                  </td>
                                  <td data-label="Kont." className="py-2.5 pr-2 text-[11px] font-bold text-slate-300 tabular-nums">{group.capacity}</td>
                                  <td data-label="Öğr." className="py-2.5 pr-2">
                                    <button
                                      type="button"
                                      onClick={() => openAddStudents(group)}
                                      title="Gruba öğrenci ekle"
                                      className="px-1.5 py-0.5 rounded-md bg-teal-500/10 text-teal-300 text-[11px] font-bold hover:bg-teal-500/20 tabular-nums"
                                    >
                                      {enrolled}/{group.capacity}
                                    </button>
                                  </td>
                                  <td data-label="Antrenör" className="py-2.5 pr-2 text-slate-400 text-[11px] max-w-[120px] truncate">
                                    {group.coachIds?.length
                                      ? group.coachIds.map((id) => coachName(id)).join(', ')
                                      : (
                                        <span className="inline-flex items-center gap-1 text-slate-500">
                                          <UserCircle className="w-3.5 h-3.5" /> —
                                        </span>
                                      )}
                                  </td>
                                  <td data-label="İşlem" className="py-2.5 text-right">
                                    <div className="inline-flex gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => openAddStudents(group)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:bg-emerald-500/15 hover:text-emerald-300"
                                        title="Öğrenci ekle"
                                      >
                                        <UserPlus className="w-3.5 h-3.5" />
                                      </button>
                                      <button type="button" onClick={() => openEditGroup(group, branch)} className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-500/15 hover:text-amber-300" title="Düzenle">
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const count = countStudentsInGroup(group);
                                          if (count > 0) {
                                            showToast(`${group.name} grubunda ${count} öğrenci var. Önce öğrencileri taşıyın.`, 'warning');
                                            return;
                                          }
                                          const ok = await confirmDialog({
                                            title: 'Grubu sil',
                                            message: `"${group.name}" grubunu silmek istediğinize emin misiniz?`,
                                            confirmLabel: 'Sil',
                                            variant: 'danger',
                                          });
                                          if (ok) removeTrainingGroup(group.id);
                                        }}
                                        className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"
                                        title="Sil"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </ResponsiveTable>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.04]">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Ders paketleri
                      </div>
                      <button
                        type="button"
                        onClick={() => openAddPackage(branch)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-[11px] font-bold"
                      >
                        <Plus className="w-3 h-3" /> Paket
                      </button>
                    </div>

                    {branchPackages.length === 0 ? (
                      <p className="text-slate-500 text-xs py-3 text-center border border-dashed border-white/10 rounded-lg">
                        Ders paketi yok — özel ders için paket ekleyin.
                      </p>
                    ) : (
                      <ResponsiveTable minWidth={640}>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/[0.06]">
                              <th className="text-left py-2 pr-2">#</th>
                              <th className="text-left py-2 pr-2">Paket</th>
                              <th className="text-left py-2 pr-2">Ders</th>
                              <th className="text-left py-2 pr-2">Süre</th>
                              <th className="text-left py-2 pr-2">Ücret</th>
                              <th className="text-left py-2 pr-2">Kont.</th>
                              <th className="text-left py-2 pr-2">Antrenör</th>
                              <th className="text-right py-2">İşlem</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.04]">
                            {branchPackages.map((pkg, pIdx) => (
                              <tr key={pkg.id} className="hover:bg-white/[0.02]">
                                <td data-label="#" className="py-2.5 pr-2 text-slate-500 text-xs tabular-nums">{pIdx + 1}</td>
                                <td data-label="Paket" className="py-2.5 pr-2 font-semibold text-white text-sm">{pkg.name}</td>
                                <td data-label="Ders" className="py-2.5 pr-2 text-slate-300 text-[11px] tabular-nums">{pkg.lessonCount}</td>
                                <td data-label="Süre" className="py-2.5 pr-2 text-slate-300 text-[11px] tabular-nums">{pkg.validityDays}g</td>
                                <td data-label="Ücret" className="py-2.5 pr-2">
                                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 text-[11px] font-bold tabular-nums">
                                    ₺{Number(pkg.packageFee).toLocaleString('tr-TR')}
                                  </span>
                                </td>
                                <td data-label="Kont." className="py-2.5 pr-2 text-slate-300 text-[11px] tabular-nums">{pkg.capacity}</td>
                                <td data-label="Antrenör" className="py-2.5 pr-2 text-slate-400 text-[11px] max-w-[120px] truncate">
                                  {pkg.coachIds?.length
                                    ? pkg.coachIds.map((id) => coachName(id)).join(', ')
                                    : '—'}
                                </td>
                                <td data-label="İşlem" className="py-2.5 text-right">
                                  <div className="inline-flex gap-0.5">
                                    <button type="button" onClick={() => openEditPackage(pkg, branch)} className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-500/15 hover:text-amber-300" title="Düzenle">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const ok = await confirmDialog({
                                          title: 'Paketi sil',
                                          message: `"${pkg.name}" paketini silmek istediğinize emin misiniz?`,
                                          confirmLabel: 'Sil',
                                          variant: 'danger',
                                        });
                                        if (ok) removeLessonPackage(pkg.id);
                                      }}
                                      className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"
                                      title="Sil"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </ResponsiveTable>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showBranchModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowBranchModal(false)}>
          <div className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white">{editingBranch ? 'Branş Düzenle' : 'Yeni Branş'}</h3>
            <label className="block text-xs font-bold text-slate-400 uppercase">Şube</label>
            <select
              value={branchForm.branchOffice}
              onChange={(e) => setBranchForm((f) => ({ ...f, branchOffice: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
            >
              {officeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <label className="block text-xs font-bold text-slate-400 uppercase">Branş Adı</label>
            <input
              value={branchForm.name}
              onChange={(e) => setBranchForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
              placeholder="ÖZEL DERS 4 SAAT"
            />
            <label className="block text-xs font-bold text-slate-400 uppercase">Aylık Ücret (₺)</label>
            <input
              type="number"
              min={0}
              value={branchForm.monthlyFee}
              onChange={(e) => setBranchForm((f) => ({ ...f, monthlyFee: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
              placeholder="4000"
            />
            <p className="text-xs text-slate-500 rounded-lg bg-slate-800/60 border border-slate-700/60 px-3 py-2">
              Özel ders branşları için aylık ücreti burada tanımlayın. Grup ücreti ayrıca grup eklerken belirlenebilir.
            </p>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowBranchModal(false)} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm">İptal</button>
              <button type="button" onClick={saveBranch} className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white font-bold text-sm">Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {showStudentModal && studentModalGroup && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowStudentModal(false)}
        >
          <div
            className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-white/5 space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-white">Gruba Öğrenci Ekle</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {studentModalGroup.branchOffice} / {studentModalGroup.discipline} / {studentModalGroup.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStudentModal(false)}
                  className="p-2 rounded-lg text-slate-400 hover:bg-white/5"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Seçilen öğrencilerin şube, branş, grup, ücret ve ders programı profilde güncellenir.
              </p>
            </div>
            <div className="px-6 py-3 border-b border-white/5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Öğrenci veya mevcut grup ara..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 outline-none focus:border-indigo-500/50"
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                <span>
                  {countStudentsInGroup(studentModalGroup)}/{studentModalGroup.capacity || '∞'} kayıtlı
                </span>
                <span>{selectedStudentIds.length} seçili</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1 min-h-[200px] max-h-[340px]">
              {modalStudentOptions.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">Öğrenci bulunamadı.</p>
              ) : (
                modalStudentOptions.map((student) => {
                  const alreadyIn = enrolledInModalGroup.has(student.id);
                  const selected = selectedStudentIds.includes(student.id);
                  return (
                    <button
                      key={student.id}
                      type="button"
                      disabled={alreadyIn}
                      onClick={() => toggleStudentSelection(student.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        alreadyIn
                          ? 'bg-teal-500/10 border border-teal-500/20 opacity-70 cursor-default'
                          : selected
                            ? 'bg-indigo-500/15 border border-indigo-500/30'
                            : 'bg-slate-800/40 border border-transparent hover:bg-slate-800 hover:border-white/5'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                          alreadyIn
                            ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                            : selected
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'border-slate-600'
                        }`}
                      >
                        {(alreadyIn || selected) && <Check className="w-3 h-3" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-white truncate">{student.name}</span>
                        <span className="block text-[11px] text-slate-500 truncate">
                          {alreadyIn
                            ? 'Bu grupta'
                            : [student.branchOffice, student.branch, student.group].filter(Boolean).join(' · ') || 'Grup atanmamış'}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="p-6 border-t border-white/5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowStudentModal(false)}
                className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={selectedStudentIds.length === 0}
                onClick={assignStudentsToGroup}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm"
              >
                {selectedStudentIds.length > 0 ? `${selectedStudentIds.length} öğrenciyi ekle` : 'Öğrenci seçin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGroupBranchPicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowGroupBranchPicker(false)}>
          <div className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white">Hangi branşa grup eklenecek?</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {sortedBranches.map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  onClick={() => {
                    setShowGroupBranchPicker(false);
                    openAddGroup(branch);
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/5"
                >
                  <span className="text-[10px] text-violet-300 font-bold">{branch.branchOffice}</span>
                  <div className="text-sm font-semibold text-white">{branch.name}</div>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setShowGroupBranchPicker(false)} className="w-full py-2.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm">İptal</button>
          </div>
        </div>
      )}

      {showPackageModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowPackageModal(false)}>
          <div className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-white/5 bg-gradient-to-r from-amber-500/20 to-orange-500/10">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                {editingPackage ? 'Ders Paketi Düzenle' : 'Yeni Ders Paketi Ekle'}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Branş *</label>
                <div className="relative">
                  <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <select
                    value={packageForm.disciplineBranchId}
                    onChange={(e) => setPackageForm((f) => ({ ...f, disciplineBranchId: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
                  >
                    <option value="">Branş Seçiniz</option>
                    {sortedBranches.map((b) => (
                      <option key={b.id} value={b.id}>{b.branchOffice} — {b.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Ders Paketi Adı *</label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    value={packageForm.name}
                    onChange={(e) => setPackageForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
                    placeholder="Örn: ÖZEL DERS 4 SAAT"
                  />
                </div>
              </div>
              {!editingPackage ? (
                <label className="flex items-start gap-2 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={packageForm.createBranchIfMissing}
                    onChange={(e) => setPackageForm((f) => ({ ...f, createBranchIfMissing: e.target.checked }))}
                    className="mt-0.5"
                  />
                  <span>
                    Aynı isimle özel ders branşı oluştur (yoksa). Örn. &quot;ÖZEL DERS 4 SAAT&quot; branşı otomatik eklenir.
                  </span>
                </label>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Ders Sayısı *</label>
                  <select
                    value={packageForm.lessonCount}
                    onChange={(e) => setPackageForm((f) => ({ ...f, lessonCount: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
                  >
                    <option value="">Seçiniz</option>
                    {LESSON_COUNT_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n} ders</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Geçerlilik Süresi *</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="number"
                      min={1}
                      value={packageForm.validityDays}
                      onChange={(e) => setPackageForm((f) => ({ ...f, validityDays: e.target.value }))}
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
                      placeholder="Gün"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Paket Ücreti (₺) *</label>
                  <input
                    type="number"
                    min={0}
                    value={packageForm.packageFee}
                    onChange={(e) => setPackageForm((f) => ({ ...f, packageFee: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Kontenjan *</label>
                  <input
                    type="number"
                    min={1}
                    value={packageForm.capacity}
                    onChange={(e) => setPackageForm((f) => ({ ...f, capacity: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
                    placeholder="Maksimum öğrenci sayısı"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Antrenör(ler)</label>
                {!packageBranchForForm ? (
                  <p className="text-xs text-slate-500">Önce branş seçiniz.</p>
                ) : packageCoachOptions.length === 0 ? (
                  <p className="text-xs text-slate-500">Bu şubede antrenör yok.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {packageCoachOptions.map((c) => {
                      const selected = packageForm.coachIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => togglePackageCoach(c.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                            selected
                              ? 'bg-teal-600/20 border-teal-500/40 text-teal-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                          }`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-slate-500 mt-1">Birden fazla antrenör seçmek için tıklayın.</p>
              </div>
            </div>
            <div className="p-6 border-t border-white/5 flex gap-2">
              <button type="button" onClick={() => setShowPackageModal(false)} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm inline-flex items-center justify-center gap-1">
                <X className="w-4 h-4" /> İptal
              </button>
              <button type="button" onClick={savePackage} className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm">
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {showGroupModal && groupParentBranch && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowGroupModal(false)}>
          <div className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white">{editingGroup ? 'Grup Düzenle' : 'Yeni Grup'}</h3>
            <p className="text-xs text-slate-500">{groupParentBranch.branchOffice} / {groupParentBranch.name}</p>
            <label className="block text-xs font-bold text-slate-400 uppercase">Grup Adı</label>
            <input
              value={groupForm.name}
              onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Grup Ücreti (₺)</label>
                <input
                  type="number"
                  min={0}
                  value={groupForm.monthlyFee}
                  onChange={(e) => setGroupForm((f) => ({ ...f, monthlyFee: e.target.value }))}
                  placeholder={`Branş: ₺${groupParentBranch.monthlyFee}`}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
                />
                <p className="text-[10px] text-slate-500 mt-1">Boş bırakılırsa branş ücreti kullanılır.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Kontenjan</label>
                <input
                  type="number"
                  min={0}
                  value={groupForm.capacity}
                  onChange={(e) => setGroupForm((f) => ({ ...f, capacity: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Antrenörler</label>
              {groupCoachOptions.length === 0 ? (
                <p className="text-xs text-slate-500">Bu şubede antrenör yok. Önce kulüp panelinden antrenör ekleyin.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {groupCoachOptions.map((c) => {
                    const selected = groupForm.coachIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleGroupCoach(c.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          selected
                            ? 'bg-teal-600/20 border-teal-500/40 text-teal-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Ders Günleri & Saatleri</label>
                <button type="button" onClick={addSlot} className="text-xs font-bold text-emerald-400 hover:text-emerald-300">+ Gün Ekle</button>
              </div>
              <div className="space-y-2">
                {groupForm.lessonSlots.map((slot, idx) => (
                  <div key={idx} className="flex flex-wrap gap-2 items-center">
                    <select
                      value={slot.dayOfWeek}
                      onChange={(e) => updateSlot(idx, { dayOfWeek: Number(e.target.value) })}
                      className="flex-1 min-w-[120px] px-2 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
                    >
                      {WEEKDAY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                    <input
                      type="time"
                      value={slot.startTime}
                      onChange={(e) => updateSlot(idx, { startTime: e.target.value })}
                      className="w-28 px-2 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
                    />
                    <span className="text-slate-500 text-xs">–</span>
                    <input
                      type="time"
                      value={slot.endTime || ''}
                      onChange={(e) => updateSlot(idx, { endTime: e.target.value })}
                      className="w-28 px-2 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
                    />
                    {groupForm.lessonSlots.length > 1 && (
                      <button type="button" onClick={() => removeSlot(idx)} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowGroupModal(false)} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm">İptal</button>
              <button type="button" onClick={saveGroup} className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white font-bold text-sm">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchGroupManagement;
