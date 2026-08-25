import React from 'react';
import { Building2 } from 'lucide-react';
import { useApp } from '../../AppContext';

/** Süper admin: tüm paneli tek kulüp kapsamına indirger. */
const AdminClubSwitcher: React.FC = () => {
  const { auth, clubs, adminViewClubId, setAdminViewClubId } = useApp();
  if (auth?.role !== 'admin' || clubs.length === 0) return null;

  return (
    <label className="flex items-center gap-2 min-w-0 max-w-[min(100%,18rem)]">
      <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 shrink-0">
        <Building2 className="w-3.5 h-3.5" />
        Kulüp
      </span>
      <select
        value={adminViewClubId ?? ''}
        onChange={(e) => setAdminViewClubId(e.target.value.trim() || null)}
        className="w-full min-w-0 rounded-lg border border-white/10 bg-slate-900/70 px-2.5 py-1.5 text-xs font-semibold text-slate-200 outline-none focus:border-indigo-500/50"
        title="Yönetim kapsamı — öğrenci ve kasa bu kulübe göre filtrelenir"
      >
        <option value="">Kulüp seçin…</option>
        {clubs
          .slice()
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'tr'))
          .map((club) => (
            <option key={club.id} value={club.id}>
              {club.name}
            </option>
          ))}
      </select>
    </label>
  );
};

export default AdminClubSwitcher;
