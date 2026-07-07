import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  CalendarDays,
  Camera,
  Clock,
  Globe,
  Instagram,
  Mail,
  MapPin,
  Phone,
  Save,
  User,
  Users,
  MessageCircle,
  Facebook,
  Loader2,
  Upload,
  Trash2,
  ImageIcon,
} from 'lucide-react';
import type { Club, ClubExtendedProfile } from '../../types';
import { useApp } from '../../AppContext';
import { canShowStudentCounts } from '../../lib/studentCountVisibility';
import { uploadClubLogo } from '../../lib/clubLogoUpload';

const WEEKDAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl text-sm font-medium outline-none bg-slate-950/50 border border-slate-700/60 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500/40 transition-colors';

const labelCls =
  'flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5';

const EMPTY_PROFILE: ClubExtendedProfile = {};

function SectionCard({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-white/[0.06] bg-slate-900/40 p-4 sm:p-5 space-y-4 ${className}`}>
      <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

interface ClubProfileProps {
  club: Club | undefined;
  branchName: string;
  coachCount: number;
  studentCount: number;
  onSave: (patch: Partial<Club>) => void;
}

const ClubProfile: React.FC<ClubProfileProps> = ({
  club,
  branchName,
  coachCount,
  studentCount,
  onSave,
}) => {
  const { auth, showToast } = useApp();
  const showStudentCounts = canShowStudentCounts(auth);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const logoFormInputRef = useRef<HTMLInputElement>(null);

  const [address, setAddress] = useState('');
  const [activeDays, setActiveDays] = useState<boolean[]>([true, true, true, true, false, false, false]);
  const [logoUrl, setLogoUrl] = useState('');
  const [profile, setProfile] = useState<ClubExtendedProfile>(EMPTY_PROFILE);
  const [saved, setSaved] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    setAddress(club?.address ?? '');
    setLogoUrl(club?.logoUrl ?? '');
    setActiveDays(
      club?.activeDays?.length === 7 ? club.activeDays : [true, true, true, true, false, false, false],
    );
    setProfile({ ...EMPTY_PROFILE, ...(club?.profile ?? {}) });
  }, [club]);

  const setProfileField = <K extends keyof ClubExtendedProfile>(key: K, value: string) => {
    setProfile((prev) => ({ ...prev, [key]: value.trim() || undefined }));
  };

  const handleLogoPick = async (file: File) => {
    if (!club) return;
    setLogoUploading(true);
    try {
      const url = await uploadClubLogo(club.id, file);
      setLogoUrl(url);
      onSave({ logoUrl: url });
      showToast('Logo yüklendi ve kaydedildi.', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Logo yüklenemedi.';
      showToast(msg.includes('bucket') ? 'Logo yüklenemedi. coach-photos bucket kontrol edin.' : msg, 'error');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoRemove = () => {
    if (!club || !logoUrl) return;
    setLogoUrl('');
    onSave({ logoUrl: undefined });
    showToast('Logo kaldırıldı.', 'info');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!club) return;
    const cleanProfile = Object.fromEntries(
      Object.entries(profile).filter(([, v]) => v != null && String(v).trim() !== ''),
    ) as ClubExtendedProfile;
    onSave({
      address: address.trim() || undefined,
      activeDays,
      logoUrl: logoUrl.trim() || undefined,
      profile: Object.keys(cleanProfile).length > 0 ? cleanProfile : undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (!club) {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6 space-y-3">
        <h2 className="text-lg font-black text-white flex items-center gap-2">
          <Building2 className="w-5 h-5 text-amber-400" />
          {branchName}
        </h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          Bu şube henüz yönetici panelinde kulüp kaydı olarak tanımlanmamış. Profil düzenleme için yöneticinin
          Kurumsal Yapı bölümünden kulüp oluşturması gerekir.
        </p>
        <div className="grid grid-cols-2 gap-3 pt-2 max-w-sm">
          {showStudentCounts ? (
            <div className="rounded-xl bg-slate-900/50 p-4 border border-white/5">
              <p className="text-[10px] text-slate-500 uppercase font-bold">Öğrenci</p>
              <p className="text-2xl font-black text-white mt-1">{studentCount}</p>
            </div>
          ) : null}
          <div className="rounded-xl bg-slate-900/50 p-4 border border-white/5">
            <p className="text-[10px] text-slate-500 uppercase font-bold">Antrenör</p>
            <p className="text-2xl font-black text-white mt-1">{coachCount}</p>
          </div>
        </div>
      </div>
    );
  }

  const cityLine = [profile.city, profile.district].filter(Boolean).join(' / ');

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-slate-900/80 to-slate-950/90 overflow-hidden">
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row gap-5 sm:items-center">
          <div className="relative shrink-0">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-2 border-white/10 bg-slate-900/80 overflow-hidden flex items-center justify-center shadow-lg shadow-black/30">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <Building2 className="w-10 h-10 text-emerald-500/50" />
              )}
              {logoUploading ? (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoUploading}
              className="absolute -bottom-1 -right-1 w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 border-2 border-slate-900 flex items-center justify-center text-white shadow-lg disabled:opacity-50"
              title="Logo yükle"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleLogoPick(f);
                e.target.value = '';
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">{club.name}</h2>
            <p className="text-xs text-slate-400 mt-1">Kulüp adı yönetici tarafından belirlenir</p>
            {cityLine ? <p className="text-sm text-emerald-300/90 mt-2 font-medium">{cityLine}</p> : null}
            {profile.description ? (
              <p className="text-sm text-slate-400 mt-2 line-clamp-2 leading-relaxed">{profile.description}</p>
            ) : null}
          </div>

          <div className="flex gap-2 sm:gap-3 shrink-0">
            {showStudentCounts ? (
              <div className="text-center px-4 py-3 rounded-xl bg-black/25 border border-white/10 min-w-[4.5rem]">
                <Users className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                <p className="text-[9px] font-bold text-slate-500 uppercase">Öğrenci</p>
                <p className="text-xl font-black text-white">{studentCount}</p>
              </div>
            ) : null}
            <div className="text-center px-4 py-3 rounded-xl bg-black/25 border border-white/10 min-w-[4.5rem]">
              <User className="w-4 h-4 text-teal-400 mx-auto mb-1" />
              <p className="text-[9px] font-bold text-slate-500 uppercase">Antrenör</p>
              <p className="text-xl font-black text-white">{coachCount}</p>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionCard title="Hakkında" icon={<Building2 className="w-4 h-4 text-emerald-400" />}>
            <div>
              <label className={labelCls}>Kulüp tanıtımı</label>
              <textarea
                value={profile.description ?? ''}
                onChange={(e) => setProfileField('description', e.target.value)}
                rows={4}
                className={inputCls + ' resize-none'}
                placeholder="Kulübünüzü velilere ve öğrencilere tanıtın…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Kuruluş yılı</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={profile.foundedYear ?? ''}
                  onChange={(e) => setProfileField('foundedYear', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className={inputCls}
                  placeholder="2010"
                />
              </div>
              <div>
                <label className={labelCls}>Yetkili kişi</label>
                <input
                  type="text"
                  value={profile.contactPerson ?? ''}
                  onChange={(e) => setProfileField('contactPerson', e.target.value)}
                  className={inputCls}
                  placeholder="Ad Soyad"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="İletişim" icon={<Phone className="w-4 h-4 text-sky-400" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}><Phone className="w-3 h-3" /> Telefon</label>
                <input
                  type="tel"
                  value={profile.phone ?? ''}
                  onChange={(e) => setProfileField('phone', e.target.value)}
                  className={inputCls}
                  placeholder="0 (___) ___ __ __"
                />
              </div>
              <div>
                <label className={labelCls}><MessageCircle className="w-3 h-3" /> WhatsApp</label>
                <input
                  type="tel"
                  value={profile.whatsapp ?? ''}
                  onChange={(e) => setProfileField('whatsapp', e.target.value)}
                  className={inputCls}
                  placeholder="905xxxxxxxxx"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}><Mail className="w-3 h-3" /> E-posta</label>
                <input
                  type="email"
                  value={profile.email ?? ''}
                  onChange={(e) => setProfileField('email', e.target.value)}
                  className={inputCls}
                  placeholder="info@kulup.com"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Konum" icon={<MapPin className="w-4 h-4 text-rose-400" />}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>İl</label>
                <input
                  type="text"
                  value={profile.city ?? ''}
                  onChange={(e) => setProfileField('city', e.target.value)}
                  className={inputCls}
                  placeholder="Afyonkarahisar"
                />
              </div>
              <div>
                <label className={labelCls}>İlçe</label>
                <input
                  type="text"
                  value={profile.district ?? ''}
                  onChange={(e) => setProfileField('district', e.target.value)}
                  className={inputCls}
                  placeholder="Merkez"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Açık adres</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                className={inputCls + ' resize-none'}
                placeholder="Mahalle, cadde, bina no…"
              />
            </div>
          </SectionCard>

          <SectionCard title="Web & Sosyal" icon={<Globe className="w-4 h-4 text-violet-400" />}>
            <div className="space-y-3">
              <div>
                <label className={labelCls}><Globe className="w-3 h-3" /> Web sitesi</label>
                <input
                  type="url"
                  value={profile.website ?? ''}
                  onChange={(e) => setProfileField('website', e.target.value)}
                  className={inputCls}
                  placeholder="https://…"
                />
              </div>
              <div>
                <label className={labelCls}><Instagram className="w-3 h-3" /> Instagram</label>
                <input
                  type="text"
                  value={profile.instagram ?? ''}
                  onChange={(e) => setProfileField('instagram', e.target.value)}
                  className={inputCls}
                  placeholder="@kulup veya tam URL"
                />
              </div>
              <div>
                <label className={labelCls}><Facebook className="w-3 h-3" /> Facebook</label>
                <input
                  type="text"
                  value={profile.facebook ?? ''}
                  onChange={(e) => setProfileField('facebook', e.target.value)}
                  className={inputCls}
                  placeholder="Sayfa adı veya URL"
                />
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionCard title="Çalışma saatleri" icon={<Clock className="w-4 h-4 text-amber-400" />}>
            <div>
              <label className={labelCls}>Ders / açık saatler</label>
              <input
                type="text"
                value={profile.openingHours ?? ''}
                onChange={(e) => setProfileField('openingHours', e.target.value)}
                className={inputCls}
                placeholder="Örn: Hafta içi 14:00 – 20:00, Cumartesi 10:00 – 18:00"
              />
            </div>
            <div>
              <label className={labelCls}><CalendarDays className="w-3 h-3" /> Aktif günler</label>
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
                    className={`min-w-[2.75rem] px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                      activeDays[i]
                        ? 'bg-emerald-600/25 border-emerald-500/40 text-emerald-200 shadow-sm shadow-emerald-900/20'
                        : 'bg-slate-950/40 border-slate-700/60 text-slate-500 hover:border-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Giriş bilgileri" icon={<User className="w-4 h-4 text-slate-400" />}>
            <div className="rounded-xl bg-slate-950/40 border border-slate-800 px-4 py-3 space-y-2">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Kullanıcı adı</p>
                <p className="font-mono text-sm text-emerald-300 mt-0.5">{club.loginUsername || '—'}</p>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Giriş kullanıcı adı ve parola yalnızca yönetici panelinden (Kurumsal Yapı) değiştirilir.
              </p>
            </div>
            <div>
              <label className={labelCls}><ImageIcon className="w-3 h-3" /> Kulüp logosu</label>
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') logoFormInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('border-emerald-500/50', 'bg-emerald-500/5');
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('border-emerald-500/50', 'bg-emerald-500/5');
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-emerald-500/50', 'bg-emerald-500/5');
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleLogoPick(file);
                }}
                onClick={() => !logoUploading && logoFormInputRef.current?.click()}
                className="relative rounded-xl border-2 border-dashed border-slate-700/70 bg-slate-950/30 p-4 cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-500/[0.03] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl border border-white/10 bg-slate-900/80 overflow-hidden flex items-center justify-center shrink-0">
                    {logoUrl ? (
                      <img src={logoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Building2 className="w-7 h-7 text-emerald-500/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    {logoUploading ? (
                      <p className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        Yükleniyor…
                      </p>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-white">Logo yükle</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Sürükleyip bırakın veya tıklayın · JPG, PNG, WebP · max 5 MB
                        </p>
                      </>
                    )}
                  </div>
                  {!logoUploading ? (
                    <Upload className="w-5 h-5 text-slate-500 shrink-0" />
                  ) : null}
                </div>
                <input
                  ref={logoFormInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void handleLogoPick(f);
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  disabled={logoUploading}
                  onClick={() => logoFormInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-600/20 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-600/30 disabled:opacity-50"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Dosya seç
                </button>
                {logoUrl ? (
                  <button
                    type="button"
                    disabled={logoUploading}
                    onClick={handleLogoRemove}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-rose-500/10 border border-rose-500/25 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Logoyu kaldır
                  </button>
                ) : null}
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/30 transition-all"
          >
            <Save className="w-4 h-4" />
            {saved ? 'Kaydedildi ✓' : 'Bilgileri Kaydet'}
          </button>
          {saved ? (
            <span className="text-xs text-emerald-400 font-semibold animate-in fade-in">Değişiklikler kaydedildi</span>
          ) : null}
        </div>
      </form>
    </div>
  );
};

export default ClubProfile;
