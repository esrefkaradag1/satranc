import React, { useMemo, useState } from 'react';
import {
  Building2, BookOpen, Plus, Trash2, Pencil, ChevronDown, ChevronRight, Clock, UserCircle,
  UserPlus, Search, Check, X,
} from 'lucide-react';
import { useApp } from '../AppContext';
import type { DisciplineBranch, GroupLessonSlot, TrainingGroup } from '../types';
import {
  WEEKDAY_OPTIONS, applyGroupDefaultsToStudent, emptyLessonSlot, formatLessonSchedule, getGroupMonthlyFee,
  studentsInTrainingGroup,
} from '../lib/trainingGroupUtils';
import { coachesForClub } from '../lib/orgScope';
import { normalizeClubKey } from '../lib/clubScope';
import { resolveClubIdFromAuth } from '../lib/orgStructureDb';
import { DEFAULT_APPLICATION_GROUPS, DEFAULT_APPLICATION_OFFICES } from '../lib/applicationFormOptions';
import { buildDefaultOrgStructure, buildClubDefaultOrgStructure } from '../lib/seedDefaultOrgStructure';
import { ResponsiveTable } from './ui/ResponsiveTable';

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
    scopedCoaches: coaches,
    updateStudent,
    auth,
    activeClubBranch,
    clubs,
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

  const [branchForm, setBranchForm] = useState({ name: '', branchOffice: '', monthlyFee: '' });
  const [groupForm, setGroupForm] = useState({
    name: '',
    monthlyFee: '',
    capacity: '14',
    lessonSlots: [emptyLessonSlot()] as GroupLessonSlot[],
    coachIds: [] as string[],
  });
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [studentModalGroup, setStudentModalGroup] = useState<TrainingGroup | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  const sortedBranches = useMemo(
    () => [...disciplineBranches].sort((a, b) => a.branchOffice.localeCompare(b.branchOffice) || a.name.localeCompare(b.name)),
    [disciplineBranches]
  );

  const officeOptions = useMemo(() => {
    const clubId = isClubUser ? resolveClubIdFromAuth(auth, clubs) : undefined;
    return branchOfficeRecords
      .filter((r) => {
        if (!isClubUser) return true;
        return !r.clubId || r.clubId === clubId;
      })
      .map((r) => r.name.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'tr'));
  }, [branchOfficeRecords, isClubUser, auth, clubs]);

  /** Kurumsal Yapı'daki kulüpler — henüz branch_offices tablosunda şube olarak tanımlı değil */
  const clubsPendingAsOffice = useMemo(() => {
    if (isClubUser) return [];
    return clubs.filter((c) => {
      const name = c.name.trim();
      if (!name) return false;
      return !branchOfficeRecords.some((r) => normalizeClubKey(r.name) === normalizeClubKey(name));
    });
  }, [clubs, branchOfficeRecords, isClubUser]);

  const countStudentsInGroup = (group: TrainingGroup) => studentsInTrainingGroup(students, group).length;

  const enrolledInModalGroup = useMemo(() => {
    if (!studentModalGroup) return new Set<string>();
    return new Set(studentsInTrainingGroup(students, studentModalGroup).map((s) => s.id));
  }, [students, studentModalGroup]);

  const modalStudentOptions = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return [...students]
      .filter((s) => s.status !== 'inactive')
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.group || '').toLowerCase().includes(q))
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
      alert(`Kontenjan aşılıyor. Boş yer: ${Math.max(0, capacity - enrolled)}`);
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
      alert(isClubUser
        ? 'Ana şube kaydı oluşturuluyor. Sayfayı yenileyip tekrar deneyin.'
        : 'Önce şube ekleyin veya kulübü + ile şube olarak tanımlayın.');
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
    if (!name || !branchOffice) return;
    if (editingBranch) {
      updateDisciplineBranch(editingBranch.id, { name, branchOffice, monthlyFee: 0 });
    } else {
      addDisciplineBranch({ name, branchOffice, monthlyFee: 0 });
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

  const importApplicationDefaults = () => {
    if (isClubUser) {
      if (!clubBranch.trim()) return;
      if (
        !confirm(
          `"${clubBranch}" kulübü için Satranç branşı ve varsayılan eğitim grupları oluşturulsun mu?`,
        )
      ) {
        return;
      }
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

    if (
      !confirm(
        'Merkez, Çayyolu ve Ümitköy şubeleri ile Satranç branşı ve başvuru formundaki varsayılan gruplar oluşturulsun mu?',
      )
    ) {
      return;
    }
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            Branş & Grup
          </h2>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Önce şube ekleyin, sonra branş tanımlayın, ardından branşın altına grup oluşturun. Başvuru formu ve öğrenci kaydı bu tanımlardan beslenir.
            <span className="block mt-1 text-indigo-300/90">
              {isClubUser
                ? 'Bu kulübe ait şube, branş ve gruplar yalnızca sizin panelinizde görünür.'
                : 'Veriler Supabase tablolarında saklanır: branch_offices, discipline_branches, training_groups.'}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {officeOptions.length === 0 && sortedBranches.length === 0 && trainingGroups.length === 0 ? (
            <button
              type="button"
              onClick={importApplicationDefaults}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-sm font-bold"
            >
              <Plus className="w-4 h-4" /> {isClubUser ? 'Hızlı başlangıç (isteğe bağlı)' : 'Varsayılanları yükle (isteğe bağlı)'}
            </button>
          ) : null}
          <button
          type="button"
          onClick={openAddBranch}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold"
        >
          <Plus className="w-4 h-4" /> Yeni Branş
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-violet-400" /> Şubeler
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isClubUser
                ? 'Kulübünüze bağlı şubeler. Ana şube otomatik oluşturulur; alt şubeler ekleyebilirsiniz.'
                : 'Branş tanımında kullanılacak şubeler. Kulübü + ile şube olarak ekleyin veya yeni şube adı yazın.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-200 text-xs font-semibold"
              >
                {office}
                <button
                  type="button"
                  title={
                    isMainClubOffice
                      ? 'Ana kulüp şubesi silinemez'
                      : inUse
                        ? 'Bu şubede branş veya grup tanımı var — önce silin'
                        : 'Şubeyi sil'
                  }
                  disabled={isMainClubOffice}
                  onClick={() => {
                    if (isMainClubOffice) return;
                    if (confirm(`"${office}" şubesini silmek istiyor musunuz?`)) removeBranchOffice(office);
                  }}
                  className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          {clubsPendingAsOffice.map((club) => (
            <span
              key={`club-${club.id}`}
              title="Kulüp kaydı — şube olarak ekleyince branş/grup tanımında kullanılabilir"
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-slate-800/80 border border-dashed border-slate-500/50 text-slate-400 text-xs font-semibold"
            >
              {club.name}
              <button
                type="button"
                title="Bu kulübü şube olarak ekle"
                onClick={() => addBranchOffice(club.name, { clubId: club.id })}
                className="p-1 rounded hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300"
              >
                <Plus className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        {clubsPendingAsOffice.length > 0 ? (
          <p className="text-[10px] text-slate-500">
            Kesik çerçeveli kutular <strong className="text-slate-400">Kurumsal Yapı</strong> kulüpleridir; henüz şube değiller.
            Yanındaki + ile şube olarak ekleyin veya alttan yeni şube adı yazın.
            Kulübü silmek için Kurumsal Yapı sayfasını kullanın.
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
            placeholder="Yeni şube adı (ör. Bahçelievler)"
            className="flex-1 min-w-[12rem] px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-500/50"
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
            <Plus className="w-3.5 h-3.5" /> Şube ekle
          </button>
        </div>
      </div>

      {sortedBranches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/40 p-10 text-center space-y-4">
          <BookOpen className="w-10 h-10 mx-auto text-slate-500 mb-3" />
          <p className="text-slate-300 text-sm font-semibold">Henüz branş tanımı yok</p>
          <ol className="text-xs text-slate-500 max-w-md mx-auto text-left space-y-1.5 list-decimal list-inside">
            <li>Üstte <strong className="text-slate-400">Şube ekle</strong> ile en az bir şube tanımlayın</li>
            <li><strong className="text-slate-400">Yeni Branş</strong> ile branş oluşturun (ör. Satranç)</li>
            <li>Branş kartını açıp <strong className="text-slate-400">Yeni Grup Ekle</strong> ile eğitim gruplarını tanımlayın</li>
          </ol>
          <button
            type="button"
            onClick={openAddBranch}
            disabled={officeOptions.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-bold"
          >
            <Plus className="w-4 h-4" /> İlk branşı oluştur
          </button>
          {officeOptions.length === 0 ? (
            <p className="text-[11px] text-amber-400/90">Branş eklemek için önce yukarıdan bir şube ekleyin.</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white">Branşlar ve Gruplar</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Her branş kartının içinde o branşa ait eğitim gruplarını tanımlayın (ücret, ders günleri, kontenjan).
            </p>
          </div>
          {sortedBranches.map((branch, idx) => {
            const branchGroups = trainingGroups.filter(
              (g) =>
                g.discipline === branch.name &&
                normalizeClubKey(g.branchOffice) === normalizeClubKey(branch.branchOffice),
            );
            const isOpen = expanded[branch.id] !== false;
            return (
              <div key={branch.id} className="rounded-xl border border-white/5 bg-slate-900/60 overflow-hidden">
                <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[48px_80px_1fr_80px_auto] gap-3 items-center px-4 py-3 border-b border-white/5 bg-slate-800/30">
                  <button
                    type="button"
                    onClick={() => toggleExpand(branch.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-white/5"
                  >
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <span className="text-xs font-bold text-slate-500">{idx + 1}</span>
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 text-[10px] font-bold border border-violet-500/25">
                      <Building2 className="w-3 h-3" /> {branch.branchOffice}
                    </span>
                    <div className="mt-1 text-sm font-black text-white truncate">{branch.name}</div>
                  </div>
                  <span className="hidden sm:inline-flex w-8 h-8 rounded-full bg-sky-500/20 text-sky-300 text-xs font-black items-center justify-center border border-sky-500/30">
                    {branchGroups.length}
                  </span>
                  <div className="flex items-center gap-1.5 justify-end">
                    <button type="button" onClick={() => openEditBranch(branch)} className="p-2 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25" title="Düzenle">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (branchGroups.length > 0) {
                          alert('Önce bu branştaki grupları silin.');
                          return;
                        }
                        if (confirm(`"${branch.name}" branşını silmek istediğinize emin misiniz?`)) {
                          removeDisciplineBranch(branch.id);
                        }
                      }}
                      className="p-2 rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25"
                      title="Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {branch.name} — Gruplar
                      </div>
                      <button
                        type="button"
                        onClick={() => openAddGroup(branch)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                      >
                        <Plus className="w-3.5 h-3.5" /> Yeni Grup Ekle
                      </button>
                    </div>

                    {branchGroups.length === 0 ? (
                      <p className="text-slate-500 text-sm py-4 text-center">Bu branşta henüz grup yok.</p>
                    ) : (
                      <ResponsiveTable minWidth={720}>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-white/5">
                              <th className="text-left py-2 pr-3">No</th>
                              <th className="text-left py-2 pr-3">Grup Adı</th>
                              <th className="text-left py-2 pr-3">Ücret</th>
                              <th className="text-left py-2 pr-3">Ders Günleri</th>
                              <th className="text-left py-2 pr-3">Kontenjan</th>
                              <th className="text-left py-2 pr-3">Öğrenci</th>
                              <th className="text-left py-2 pr-3">Antrenör</th>
                              <th className="text-right py-2">İşlemler</th>
                            </tr>
                          </thead>
                          <tbody>
                            {branchGroups.map((group, gIdx) => {
                              const enrolled = countStudentsInGroup(group);
                              const fee = getGroupMonthlyFee(group, disciplineBranches);
                              return (
                                <tr key={group.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                  <td data-label="No" className="py-3 pr-3 text-slate-500 font-bold">{gIdx + 1}</td>
                                  <td data-label="Grup Adı" className="py-3 pr-3 font-semibold text-white">{group.name}</td>
                                  <td data-label="Ücret" className="py-3 pr-3">
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold">
                                      ₺{Number(fee).toLocaleString('tr-TR')}
                                    </span>
                                  </td>
                                  <td data-label="Ders Günleri" className="py-3 pr-3 text-slate-300 text-xs max-w-[200px]">
                                    <span className="inline-flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                                      {formatLessonSchedule(group.lessonSlots)}
                                    </span>
                                  </td>
                                  <td data-label="Kontenjan" className="py-3 pr-3">
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold">
                                      {group.capacity} Kişi
                                    </span>
                                  </td>
                                  <td data-label="Öğrenci" className="py-3 pr-3">
                                    <button
                                      type="button"
                                      onClick={() => openAddStudents(group)}
                                      title="Gruba öğrenci ekle"
                                      className="px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 text-xs font-bold hover:bg-teal-500/25 transition-colors"
                                    >
                                      {enrolled}/{group.capacity}
                                    </button>
                                  </td>
                                  <td data-label="Antrenör" className="py-3 pr-3 text-slate-400 text-xs">
                                    {group.coachIds?.length
                                      ? group.coachIds.map((id) => coachName(id)).join(', ')
                                      : (
                                        <span className="inline-flex items-center gap-1">
                                          <UserCircle className="w-3.5 h-3.5" /> Atanmamış
                                        </span>
                                      )}
                                  </td>
                                  <td data-label="İşlemler" className="py-3 text-right">
                                    <div className="inline-flex gap-1">
                                      <button
                                        type="button"
                                        onClick={() => openAddStudents(group)}
                                        className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                                        title="Öğrenci ekle"
                                      >
                                        <UserPlus className="w-4 h-4" />
                                      </button>
                                      <button type="button" onClick={() => openEditGroup(group, branch)} className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25">
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const count = countStudentsInGroup(group);
                                          if (count > 0) {
                                            alert(`${group.name} grubunda ${count} öğrenci var. Önce öğrencileri taşıyın.`);
                                            return;
                                          }
                                          if (confirm(`"${group.name}" grubunu silmek istediğinize emin misiniz?`)) {
                                            removeTrainingGroup(group.id);
                                          }
                                        }}
                                        className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25"
                                      >
                                        <Trash2 className="w-4 h-4" />
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
              placeholder="ALT YAPI GRUPLARI"
            />
            <p className="text-xs text-slate-500 rounded-lg bg-slate-800/60 border border-slate-700/60 px-3 py-2">
              Branş ücreti kaldırıldı. Aylık ücreti grup eklerken belirleyin.
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
