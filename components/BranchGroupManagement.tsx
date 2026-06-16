import React, { useMemo, useState } from 'react';
import {
  Building2, BookOpen, Users, Plus, Trash2, Pencil, ChevronDown, ChevronRight, Clock, UserCircle,
} from 'lucide-react';
import { useApp } from '../AppContext';
import type { DisciplineBranch, GroupLessonSlot, TrainingGroup } from '../types';
import {
  WEEKDAY_OPTIONS, emptyLessonSlot, formatLessonSchedule, getGroupMonthlyFee,
} from '../lib/trainingGroupUtils';
import { ResponsiveTable } from './ui/ResponsiveTable';

const BranchGroupManagement: React.FC = () => {
  const {
    branchOffices,
    disciplineBranches,
    addDisciplineBranch,
    updateDisciplineBranch,
    removeDisciplineBranch,
    trainingGroups,
    addTrainingGroup,
    updateTrainingGroup,
    removeTrainingGroup,
    students,
    coaches,
  } = useApp();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
  });

  const sortedBranches = useMemo(
    () => [...disciplineBranches].sort((a, b) => a.branchOffice.localeCompare(b.branchOffice) || a.name.localeCompare(b.name)),
    [disciplineBranches]
  );

  const countStudentsInGroup = (name: string) => students.filter((s) => s.group === name).length;

  const openAddBranch = () => {
    setEditingBranch(null);
    setBranchForm({
      name: '',
      branchOffice: branchOffices[0] || '',
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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            Branş & Grup
          </h2>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Branş ve grup tanımlarında aylık ücret ile ders günleri/saatleri belirlenir. Öğrenci gruba atanınca bu bilgiler otomatik gelir; profilde düzenlenebilir.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddBranch}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold"
        >
          <Plus className="w-4 h-4" /> Yeni Branş
        </button>
      </div>

      {sortedBranches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/40 p-10 text-center">
          <BookOpen className="w-10 h-10 mx-auto text-slate-500 mb-3" />
          <p className="text-slate-400 text-sm">Henüz branş tanımı yok. Şube, aylık ücret ve alt grupları ekleyerek başlayın.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedBranches.map((branch, idx) => {
            const branchGroups = trainingGroups.filter(
              (g) => g.discipline === branch.name && g.branchOffice === branch.branchOffice
            );
            const isOpen = expanded[branch.id] !== false;
            return (
              <div key={branch.id} className="rounded-xl border border-white/5 bg-slate-900/60 overflow-hidden">
                <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[48px_80px_1fr_120px_80px_auto] gap-3 items-center px-4 py-3 border-b border-white/5 bg-slate-800/30">
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
                  <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full bg-slate-500/15 text-slate-400 text-[10px] font-bold border border-slate-500/25">
                    Grup ücreti
                  </span>
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
                              const enrolled = countStudentsInGroup(group.name);
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
                                    <span className="px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 text-xs font-bold">
                                      {enrolled}/{group.capacity}
                                    </span>
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
                                      <button type="button" onClick={() => openEditGroup(group, branch)} className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25">
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const count = countStudentsInGroup(group.name);
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
              {branchOffices.map((o) => <option key={o} value={o}>{o}</option>)}
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
