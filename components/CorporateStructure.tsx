import React, { useState } from 'react';
import { Building2, MapPin, Users, Plus, Pencil, Trash2, X, KeyRound, Copy, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../AppContext';
import type { Club } from '../types';
import { isClubUsernameTaken, suggestClubUsername } from '../lib/clubLoginUtils';

const WEEKDAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DEFAULT_CLUB_PASSWORD = 'kulup'; // Giriş sayfasında kullanılan varsayılan parola (sadece bilgi için)

const MAX_CLUBS = 20;

const CorporateStructure: React.FC = () => {
  const { clubs, addClub, updateClub, removeClub, coaches, appRoles, showToast, confirmDialog } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formLoginPassword, setFormLoginPassword] = useState('');
  const [formLoginUsername, setFormLoginUsername] = useState('');
  const [formRoleId, setFormRoleId] = useState('');
  const [formActiveDays, setFormActiveDays] = useState<boolean[]>([true, true, true, true, false, false, false]);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  const openAdd = () => {
    setEditingId(null);
    setFormName('');
    setFormAddress('');
    setFormLoginPassword('');
    setFormLoginUsername('');
    setFormRoleId('');
    setFormActiveDays([true, true, true, true, false, false, false]);
    setModalOpen(true);
  };

  const openEdit = (club: Club) => {
    setEditingId(club.id);
    setFormName(club.name);
    setFormAddress(club.address ?? '');
    setFormLoginPassword(club.loginPassword ?? '');
    setFormLoginUsername(club.loginUsername ?? suggestClubUsername(club.name, clubs, club.id));
    setFormRoleId(club.roleId ?? '');
    setFormActiveDays(club.activeDays?.length === 7 ? club.activeDays : [true, true, true, true, false, false, false]);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const save = () => {
    const name = formName.trim();
    if (!name) return;
    const loginUsername = (formLoginUsername.trim() || suggestClubUsername(name, clubs, editingId ?? undefined)).toLowerCase();
    if (!loginUsername) {
      showToast('Kulüp kullanıcı adı gerekli.', 'warning');
      return;
    }
    if (isClubUsernameTaken(clubs, loginUsername, editingId ?? undefined)) {
      showToast('Bu kullanıcı adı başka bir kulüpte kullanılıyor.', 'warning');
      return;
    }
    const loginPassword = formLoginPassword.trim() || undefined;
    const roleId = formRoleId.trim() || undefined;
    if (editingId) {
      updateClub(editingId, {
        name,
        address: formAddress.trim() || undefined,
        activeDays: formActiveDays,
        loginUsername,
        loginPassword,
        roleId,
      });
    } else {
      if (clubs.length >= MAX_CLUBS) {
        showToast(`En fazla ${MAX_CLUBS} kulüp ekleyebilirsiniz.`, 'warning');
        return;
      }
      addClub({
        name,
        address: formAddress.trim() || undefined,
        activeDays: formActiveDays,
        loginUsername,
        loginPassword,
        roleId,
      });
    }
    closeModal();
  };

  const getClubLoginUsername = (club: Club) =>
    club.loginUsername?.trim() || suggestClubUsername(club.name, clubs, club.id);

  const getClubPassword = (club: Club) =>
    (club.loginPassword != null && club.loginPassword !== '') ? club.loginPassword : DEFAULT_CLUB_PASSWORD;

  const togglePasswordVisible = (clubId: string) => {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(clubId)) next.delete(clubId);
      else next.add(clubId);
      return next;
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Kısa süreli geri bildirim için class kullanılabilir; basit tutuyoruz
      if (typeof document !== 'undefined') {
        const el = document.createElement('span');
        el.textContent = `${label} kopyalandı`;
        el.className = 'text-xs text-emerald-400 font-medium';
        el.id = 'copy-toast';
        document.getElementById('copy-toast-root')?.appendChild(el);
        setTimeout(() => document.getElementById('copy-toast-root')?.removeChild(el), 1500);
      }
    });
  };

  const toggleDay = (index: number) => {
    setFormActiveDays(prev => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const personnelCount = (clubName: string) =>
    coaches.filter(c => (c.branch || '').trim() === clubName.trim()).length;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            Kurumsal Yapı
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Kulüp alanlarını ve yetkili kullanıcı yönetimini buradan yapabilirsiniz.
          </p>
        </div>
        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
          Ana Yönetici
        </div>
      </div>

      {/* Kulüp giriş bilgileri açıklaması */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
        <div className="flex items-start gap-3">
          <KeyRound className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-white mb-1">Kulüp girişi</h3>
            <p className="text-slate-400 text-sm">
              Giriş sayfasında &quot;Kulüp&quot; sekmesini seçin. Her kulübe özel kullanıcı adı ve parola ile giriş yapılır.
              Aşağıdaki kulüp kartlarında giriş bilgilerini görebilir ve yetkililerle paylaşabilirsiniz.
            </p>
          </div>
        </div>
      </div>
      <div id="copy-toast-root" className="fixed bottom-4 right-4 z-50 pointer-events-none" />

      {/* Kapasite */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 border border-white/5 rounded-lg p-4">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
            Kulüp kapasitesi
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (clubs.length / MAX_CLUBS) * 100)}%` }}
              />
            </div>
            <span className="text-sm font-bold text-slate-300 tabular-nums">
              {clubs.length}/{MAX_CLUBS}
            </span>
          </div>
        </div>
        <div className="bg-slate-900/60 border border-white/5 rounded-lg p-4">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
            Personel kapasitesi
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (coaches.length / 5) * 100)}%` }}
              />
            </div>
            <span className="text-sm font-bold text-slate-300 tabular-nums">
              {coaches.length}/5
            </span>
          </div>
        </div>
      </div>

      {/* Aktif Kulüpler */}
      <div className="bg-slate-900/60 border border-white/5 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-lg font-bold text-white">Aktif Kulüpler</h3>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" /> Yeni Kulüp
          </button>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clubs.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-500 text-sm">
              Henüz kulüp eklenmedi. &quot;Yeni Kulüp&quot; ile ekleyebilirsiniz.
            </div>
          ) : (
            clubs.map((club) => {
              const count = personnelCount(club.name);
              return (
                <div
                  key={club.id}
                  className="relative rounded-xl border border-white/10 bg-slate-800/50 p-5 hover:border-white/20 transition-colors"
                >
                  <div className="absolute top-4 right-4 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(club)}
                      className="p-2 rounded-lg text-slate-400 hover:bg-white/10 hover:text-indigo-400 transition-colors"
                      title="Düzenle"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirmDialog({
                          title: 'Kulübü sil',
                          message: `"${club.name}" kulübünü silmek istediğinize emin misiniz?`,
                          confirmLabel: 'Sil',
                          variant: 'danger',
                        });
                        if (ok) removeClub(club.id);
                      }}
                      className="p-2 rounded-lg text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                      title="Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mb-3 pr-20">
                    <Building2 className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                    <span className="text-base font-bold text-white truncate">{club.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{club.address || 'Adres girilmedi'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
                    <Users className="w-4 h-4 flex-shrink-0" />
                    <span>{count} Personel atandı</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {WEEKDAY_LABELS.map((label, i) => (
                      <span
                        key={label}
                        className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-1 rounded text-[10px] font-bold ${
                          club.activeDays?.[i]
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-700/50 text-slate-500 border border-slate-600/50'
                        }`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  {/* Kulüp giriş bilgileri */}
                  <div className="pt-3 border-t border-white/5 space-y-2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Giriş bilgileri
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">Kullanıcı adı:</span>
                      <span className="font-mono text-white truncate flex-1">{getClubLoginUsername(club)}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(getClubLoginUsername(club), 'Kullanıcı adı')}
                        className="p-1.5 rounded text-slate-400 hover:bg-white/10 hover:text-indigo-400"
                        title="Kopyala"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">Parola:</span>
                      <span className="font-mono text-white min-w-[4rem]">
                        {visiblePasswords.has(club.id) ? getClubPassword(club) : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => togglePasswordVisible(club.id)}
                        className="p-1.5 rounded text-slate-400 hover:bg-white/10 hover:text-indigo-400"
                        title={visiblePasswords.has(club.id) ? 'Gizle' : 'Göster'}
                      >
                        {visiblePasswords.has(club.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(getClubPassword(club), 'Parola')}
                        className="p-1.5 rounded text-slate-400 hover:bg-white/10 hover:text-indigo-400"
                        title="Kopyala"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {!club.loginPassword && (
                      <p className="text-[10px] text-slate-500">Varsayılan sistem parolası kullanılıyor (düzenleyerek özel parola atayabilirsiniz).</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal: Kulüp Ekle / Düzenle */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {editingId ? 'Kulüp Düzenle' : 'Yeni Kulüp'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="p-2 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Kulüp adı
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Örn: Sistem Satranç"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/50 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Adres (opsiyonel)
                </label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={e => setFormAddress(e.target.value)}
                  placeholder="Adres girilmedi"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/50 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Giriş kullanıcı adı
                </label>
                <input
                  type="text"
                  value={formLoginUsername}
                  onChange={(e) => setFormLoginUsername(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  onBlur={() => {
                    if (!formLoginUsername.trim() && formName.trim()) {
                      setFormLoginUsername(suggestClubUsername(formName, clubs, editingId ?? undefined));
                    }
                  }}
                  placeholder="ornek-kulup"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/50 outline-none font-mono text-sm"
                  autoComplete="off"
                />
                <p className="text-[10px] text-slate-500 mt-1">Kulüp girişinde kullanılacak benzersiz kullanıcı adı.</p>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Giriş parolası (opsiyonel)
                </label>
                <input
                  type="password"
                  value={formLoginPassword}
                  onChange={e => setFormLoginPassword(e.target.value)}
                  placeholder="Boş bırakılırsa sistem parolası kullanılır"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Kulüp rolü (opsiyonel)
                </label>
                <select
                  value={formRoleId}
                  onChange={(e) => setFormRoleId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                >
                  <option value="">Varsayılan (Kulüp)</option>
                  {appRoles.filter((r) => r.panel === 'club').map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">Kulüp paneli menü erişimini belirler</p>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Aktif günler
                </label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                        formActiveDays[i]
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                          : 'bg-slate-700/50 text-slate-500 border border-slate-600/50 hover:bg-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-white/5 flex gap-3 justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 font-bold text-sm"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!formName.trim()}
                className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:pointer-events-none text-white font-bold text-sm"
              >
                {editingId ? 'Kaydet' : 'Ekle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CorporateStructure;
