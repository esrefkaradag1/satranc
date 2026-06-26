import React, { useEffect, useState } from 'react';
import { Building2, MapPin, KeyRound, Save, Eye, EyeOff, CalendarDays } from 'lucide-react';
import type { Club } from '../types';
import { DEFAULT_CLUB_PASSWORD } from '../../lib/clubScope';

const WEEKDAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const inputCls =
  'w-full px-4 py-2.5 rounded-lg text-sm font-medium outline-none bg-slate-900/60 border border-slate-700/60 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50';

interface ClubProfileProps {
  club: Club | undefined;
  branchName: string;
  coachCount: number;
  studentCount: number;
  onSave: (patch: { address?: string; activeDays: boolean[]; loginPassword?: string }) => void;
}

const ClubProfile: React.FC<ClubProfileProps> = ({
  club,
  branchName,
  coachCount,
  studentCount,
  onSave,
}) => {
  const [address, setAddress] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [activeDays, setActiveDays] = useState<boolean[]>([true, true, true, true, false, false, false]);
  const [showPassword, setShowPassword] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAddress(club?.address ?? '');
    setLoginPassword(club?.loginPassword ?? '');
    setActiveDays(
      club?.activeDays?.length === 7 ? club.activeDays : [true, true, true, true, false, false, false],
    );
  }, [club]);

  const effectivePassword = loginPassword.trim() || DEFAULT_CLUB_PASSWORD;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!club) return;
    onSave({
      address: address.trim() || undefined,
      activeDays,
      loginPassword: loginPassword.trim() || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (!club) {
    return (
      <div className="bg-slate-800/30 border border-amber-500/30 rounded-xl p-6 space-y-3">
        <h2 className="text-lg font-black text-white flex items-center gap-2">
          <Building2 className="w-5 h-5 text-amber-400" />
          {branchName}
        </h2>
        <p className="text-sm text-slate-400">
          Bu şube henüz yönetici panelinde kulüp kaydı olarak tanımlanmamış. Temel işlemler (öğrenci, antrenör)
          yapılabilir; profil düzenleme için yöneticinin Kurumsal Yapı bölümünden kulüp oluşturması gerekir.
        </p>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="bg-slate-900/50 rounded-lg p-4 border border-white/5">
            <p className="text-xs text-slate-500 uppercase font-bold">Öğrenci</p>
            <p className="text-xl font-black text-white">{studentCount}</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-4 border border-white/5">
            <p className="text-xs text-slate-500 uppercase font-bold">Antrenör</p>
            <p className="text-xl font-black text-white">{coachCount}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/30 border border-white/5 rounded-xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-400" />
              {club.name}
            </h2>
            <p className="text-xs text-slate-500 mt-1">Kulüp adı yönetici tarafından belirlenir</p>
          </div>
          <div className="flex gap-3">
            <div className="text-center px-4 py-2 rounded-lg bg-slate-900/50 border border-white/5">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Öğrenci</p>
              <p className="text-lg font-black text-emerald-400">{studentCount}</p>
            </div>
            <div className="text-center px-4 py-2 rounded-lg bg-slate-900/50 border border-white/5">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Antrenör</p>
              <p className="text-lg font-black text-teal-400">{coachCount}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              <MapPin className="w-3.5 h-3.5" /> Adres
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder="Kulüp adresi"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              <CalendarDays className="w-3.5 h-3.5" /> Aktif günler
            </label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() =>
                    setActiveDays((prev) => {
                      const next = [...prev];
                      next[i] = !next[i];
                      return next;
                    })
                  }
                  className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                    activeDays[i]
                      ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-900/50 border-slate-700 text-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              <KeyRound className="w-3.5 h-3.5" /> Giriş parolası
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className={`${inputCls} pr-10`}
                placeholder={`Boş bırakılırsa varsayılan: ${DEFAULT_CLUB_PASSWORD}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Giriş: Kulüp sekmesi → Şube: <strong className="text-slate-400">{club.name}</strong> → Parola:{' '}
              <strong className="text-slate-400">{effectivePassword}</strong>
            </p>
          </div>

          <button
            type="submit"
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all"
          >
            <Save className="w-4 h-4" />
            {saved ? 'Kaydedildi' : 'Bilgileri Kaydet'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ClubProfile;
