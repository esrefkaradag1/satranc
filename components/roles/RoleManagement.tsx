import React, { useEffect, useMemo, useState } from 'react';
import {
  Shield,
  Plus,
  Trash2,
  Save,
  Check,
  Lock,
  Users,
  Copy,
  Search,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../../AppContext';
import type { AppRole, RolePanel } from '../../types';
import { permissionsForPanel, PERMISSION_CATALOG } from '../../lib/rolePermissions';

const PANEL_LABELS: Record<RolePanel, string> = {
  admin: 'Yönetim Paneli',
  coach: 'Antrenör Paneli',
  club: 'Kulüp Paneli',
  student: 'Öğrenci Paneli',
  parent: 'Veli Paneli',
};

const PANEL_COLORS: Record<RolePanel, string> = {
  admin: '#8b5cf6',
  coach: '#f59e0b',
  club: '#10b981',
  student: '#14b8a6',
  parent: '#6366f1',
};

const RoleManagement: React.FC = () => {
  const {
    appRoles,
    rolePermissionMap,
    createAppRole,
    updateAppRole,
    deleteAppRole,
    setRolePermissions,
    showToast,
  } = useApp();

  const [selectedId, setSelectedId] = useState<string>('role-admin');
  const [draftPerms, setDraftPerms] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPanel, setNewPanel] = useState<RolePanel>('coach');
  const [newDesc, setNewDesc] = useState('');

  const selected = useMemo(() => appRoles.find((r) => r.id === selectedId), [appRoles, selectedId]);

  useEffect(() => {
    if (selected) {
      setDraftPerms(rolePermissionMap[selected.id] ?? []);
    }
  }, [selected?.id, rolePermissionMap]);

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return appRoles;
    return appRoles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        PANEL_LABELS[r.panel].toLowerCase().includes(q),
    );
  }, [appRoles, search]);

  const groupedPerms = useMemo(() => {
    if (!selected) return [];
    const panelPerms = permissionsForPanel(selected.panel);
    const byCat = new Map<string, typeof panelPerms>();
    for (const p of panelPerms) {
      const list = byCat.get(p.category) ?? [];
      list.push(p);
      byCat.set(p.category, list);
    }
    return [...byCat.entries()];
  }, [selected]);

  const togglePerm = (key: string) => {
    setDraftPerms((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const selectAll = () => {
    if (!selected) return;
    setDraftPerms(permissionsForPanel(selected.panel).map((p) => p.key));
  };

  const clearAll = () => setDraftPerms([]);

  const handleSave = async () => {
    if (!selected) return;
    const ok = await setRolePermissions(selected.id, draftPerms);
    if (!ok) return;
    setSaved(true);
    showToast(`"${selected.name}" izinleri Supabase'e kaydedildi.`, 'success');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) {
      showToast('Rol adı gerekli', 'warning');
      return;
    }
    const role = createAppRole({
      name,
      slug: name,
      panel: newPanel,
      description: newDesc.trim() || undefined,
      color: PANEL_COLORS[newPanel],
      isSystem: false,
    });
    setSelectedId(role.id);
    setShowCreate(false);
    setNewName('');
    setNewDesc('');
    showToast(`"${name}" rolü oluşturuldu`, 'success');
  };

  const handleDelete = (role: AppRole) => {
    if (role.isSystem) {
      showToast('Sistem rolleri silinemez', 'warning');
      return;
    }
    if (!window.confirm(`"${role.name}" rolünü silmek istiyor musunuz?`)) return;
    deleteAppRole(role.id);
    setSelectedId('role-admin');
    showToast('Rol silindi', 'info');
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300 max-w-6xl mx-auto w-full pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
            <Shield className="w-7 h-7 text-violet-400" />
            Rol Yönetimi
          </h2>
            <p className="text-slate-400 text-sm mt-1 max-w-xl">
              Her rol için menü ve özellik erişimini tanımlayın. &quot;Antrenör&quot; sistem rolündeki değişiklikler özel rol atanmamış tüm antrenörlere uygulanır.
            </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm shadow-lg shadow-violet-500/20"
        >
          <Plus className="w-4 h-4" />
          Yeni Rol
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Sol: rol listesi */}
        <aside className="lg:col-span-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rol ara..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900/60 border border-white/[0.08] text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/40"
            />
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-slate-900/40 overflow-hidden divide-y divide-white/[0.04] max-h-[520px] overflow-y-auto">
            {filteredRoles.map((role) => {
              const active = role.id === selectedId;
              const permCount = (rolePermissionMap[role.id] ?? []).length;
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedId(role.id)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                    active ? 'bg-violet-500/10' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-white/[0.08]"
                    style={{ background: `${role.color ?? PANEL_COLORS[role.panel]}22` }}
                  >
                    {role.isSystem ? (
                      <Lock className="w-4 h-4" style={{ color: role.color ?? PANEL_COLORS[role.panel] }} />
                    ) : (
                      <Users className="w-4 h-4" style={{ color: role.color ?? PANEL_COLORS[role.panel] }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{role.name}</p>
                    <p className="text-[10px] text-slate-500 font-medium">{PANEL_LABELS[role.panel]} · {permCount} izin</p>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 ${active ? 'text-violet-400' : 'text-slate-600'}`} />
                </button>
              );
            })}
          </div>
        </aside>

        {/* Sağ: izin matrisi */}
        <div className="lg:col-span-8 space-y-4">
          {selected ? (
            <>
              <div className="rounded-2xl border border-white/[0.06] bg-slate-900/40 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-black text-white">{selected.name}</h3>
                      {selected.isSystem && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-white/[0.06]">
                          Sistem
                        </span>
                      )}
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-white/[0.06]"
                        style={{ color: selected.color ?? PANEL_COLORS[selected.panel] }}
                      >
                        {PANEL_LABELS[selected.panel]}
                      </span>
                    </div>
                    {selected.description && (
                      <p className="text-sm text-slate-400 mt-1">{selected.description}</p>
                    )}
                    <p className="text-[10px] text-slate-600 mt-2 font-mono">slug: {selected.slug}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const src = selected;
                        const copy = createAppRole({
                          name: `${src.name} (Kopya)`,
                          slug: `${src.slug}-copy`,
                          panel: src.panel,
                          description: src.description,
                          color: src.color,
                          isSystem: false,
                        });
                        setRolePermissions(copy.id, [...(rolePermissionMap[src.id] ?? draftPerms)]);
                        setSelectedId(copy.id);
                        showToast('Rol kopyalandı', 'success');
                      }}
                      className="p-2 rounded-lg border border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.04]"
                      title="Kopyala"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {!selected.isSystem && (
                      <button
                        type="button"
                        onClick={() => handleDelete(selected)}
                        className="p-2 rounded-lg border border-rose-500/20 text-rose-400 hover:bg-rose-500/10"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {!selected.isSystem && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/[0.05]">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Rol adı</label>
                      <input
                        type="text"
                        value={selected.name}
                        onChange={(e) => updateAppRole(selected.id, { name: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950/50 border border-slate-700/50 text-sm text-white outline-none focus:border-violet-500/40"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Açıklama</label>
                      <input
                        type="text"
                        value={selected.description ?? ''}
                        onChange={(e) => updateAppRole(selected.id, { description: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950/50 border border-slate-700/50 text-sm text-white outline-none focus:border-violet-500/40"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  {draftPerms.length} / {permissionsForPanel(selected.panel).length} izin seçili
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={selectAll} className="text-xs font-bold text-violet-400 hover:text-violet-300 px-2 py-1">
                    Tümünü seç
                  </button>
                  <button type="button" onClick={clearAll} className="text-xs font-bold text-slate-500 hover:text-slate-300 px-2 py-1">
                    Temizle
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {groupedPerms.map(([category, perms]) => (
                  <section key={category} className="rounded-2xl border border-white/[0.06] bg-slate-900/30 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-white/[0.04] bg-white/[0.02]">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">{category}</h4>
                    </div>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {perms.map((p) => {
                        const checked = draftPerms.includes(p.key);
                        const meta = PERMISSION_CATALOG.find((x) => x.key === p.key && x.panel === selected.panel);
                        return (
                          <label
                            key={`${selected.panel}-${p.key}`}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                              checked
                                ? 'border-violet-500/40 bg-violet-500/10'
                                : 'border-white/[0.05] bg-slate-950/30 hover:border-white/[0.1]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePerm(p.key)}
                              className="rounded border-slate-600 text-violet-500 focus:ring-violet-500/30"
                            />
                            <span className="text-sm text-slate-200 font-medium">{meta?.label ?? p.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>

              <div className="sticky bottom-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleSave}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${
                    saved
                      ? 'bg-emerald-600 text-white'
                      : 'bg-violet-600 hover:bg-violet-500 text-white shadow-violet-500/20'
                  }`}
                >
                  {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {saved ? 'Kaydedildi' : 'İzinleri Kaydet'}
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-white/[0.06] bg-slate-900/40 p-12 text-center text-slate-500">
              Sol listeden bir rol seçin
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-black text-white mb-4">Yeni Rol Oluştur</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Rol adı *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Örn: Asistan Antrenör"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950/50 border border-slate-700/50 text-sm text-white outline-none focus:border-violet-500/40"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Panel türü *</label>
                <select
                  value={newPanel}
                  onChange={(e) => setNewPanel(e.target.value as RolePanel)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950/50 border border-slate-700/50 text-sm text-white outline-none focus:border-violet-500/40"
                >
                  {(Object.keys(PANEL_LABELS) as RolePanel[]).map((p) => (
                    <option key={p} value={p} className="bg-slate-900">
                      {PANEL_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Açıklama</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950/50 border border-slate-700/50 text-sm text-white outline-none focus:border-violet-500/40"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-400 hover:text-white"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-500 text-white"
              >
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManagement;
