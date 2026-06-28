import React, { useEffect, useRef, useState } from 'react';
import {
  User,
  Phone,
  Mail,
  Shield,
  KeyRound,
  Save,
  Camera,
  Loader2,
  FileText,
  Building2,
  Briefcase,
  ExternalLink,
  Check,
  Trash2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { loadAdminProfile, saveAdminProfile } from '../../lib/adminProfile';
import { getServiceSupabase, isSupabaseBackend } from '../../services/supabase';
import { useApp } from '../../AppContext';

const inputCls =
  'w-full px-3 py-2 rounded-xl text-sm bg-slate-950/50 border border-slate-700/50 text-white placeholder:text-slate-600 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all';

const textareaCls = `${inputCls} resize-y min-h-[88px] leading-relaxed`;

const TITLE_OPTIONS = [
  'Genel Müdür',
  'Kurucu',
  'Operasyon Müdürü',
  'Teknik Sorumlu',
  'Koordinatör',
  'İdari Sorumlu',
  'Diğer',
];

const DEPARTMENT_OPTIONS = ['Yönetim', 'Operasyon', 'İdari', 'Teknik', 'Eğitim', 'Finans', 'Diğer'];

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatPhone(digits?: string) {
  if (!digits) return null;
  const v = digits.replace(/\D/g, '');
  if (v.length < 10) return digits;
  return `0${v.slice(0, 3)} ${v.slice(3, 6)} ${v.slice(6, 8)} ${v.slice(8, 10)}`;
}

function Field({
  label,
  icon,
  hint,
  children,
  className = '',
}: {
  label: string;
  icon?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 mb-1.5">
        {icon}
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-slate-900/40 overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-white/[0.05] bg-white/[0.02] flex items-center gap-2">
        <span className="text-violet-400">{icon}</span>
        <h2 className="text-sm font-bold text-slate-200">{title}</h2>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

const AdminProfilePage: React.FC = () => {
  const { showToast, confirmDialog } = useApp();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('Yönetici');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [linkedIn, setLinkedIn] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  useEffect(() => {
    const prof = loadAdminProfile();
    setDisplayName(prof.displayName);
    setTitle(prof.title || '');
    setDepartment(prof.department || '');
    setEmail(prof.email || '');
    setPhone(prof.phone || '');
    setBio(prof.bio || '');
    setLinkedIn(prof.linkedIn || '');
    setPhotoUrl(prof.photoUrl || '');
  }, []);

  const buildProfile = () => ({
    displayName,
    title: title.trim() || undefined,
    department: department.trim() || undefined,
    email: email.trim() || undefined,
    phone: phone.trim() || undefined,
    bio: bio.trim() || undefined,
    linkedIn: linkedIn.trim() || undefined,
    photoUrl: photoUrl.trim() || undefined,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveAdminProfile(buildProfile());
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      window.dispatchEvent(new Event('admin-profile-updated'));
    }, 2500);
  };

  const handlePhotoUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      showToast('Fotoğraf en fazla 2 MB olabilir.', 'warning');
      return;
    }

    setPhotoUploading(true);
    try {
      if (isSupabaseBackend()) {
        const sb = getServiceSupabase();
        if (sb) {
          const fileExt = file.name.split('.').pop() || 'jpg';
          const fileName = `admin-${Date.now()}.${fileExt}`;
          const { error } = await sb.storage.from('coach-photos').upload(fileName, file, { upsert: true });
          if (error) throw error;
          const { data } = sb.storage.from('coach-photos').getPublicUrl(fileName);
          setPhotoUrl(data.publicUrl);
          return;
        }
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') setPhotoUrl(reader.result);
      };
      reader.readAsDataURL(file);
    } catch {
      showToast('Fotoğraf yüklenemedi. Daha küçük bir dosya deneyin.', 'error');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    const ok = await confirmDialog({
      title: 'Fotoğrafı kaldır',
      message: 'Profil fotoğrafını kaldırmak istiyor musunuz?',
      confirmLabel: 'Kaldır',
      variant: 'danger',
    });
    if (!ok) return;
    setPhotoUrl('');
  };

  const displayTitle = title.trim() || 'Yönetici';
  const formattedPhone = formatPhone(phone);
  const profileCompletion = [
    displayName.trim(),
    email.trim(),
    phone.trim(),
    title.trim(),
    department.trim(),
    bio.trim(),
  ].filter(Boolean).length;

  return (
    <div className="animate-in fade-in duration-300 max-w-6xl mx-auto w-full pb-24">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        {/* Sol: profil kartı */}
        <aside className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-20 space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-violet-500/[0.08] to-slate-900/60 overflow-hidden">
            <div className="relative group">
              <div className="aspect-square max-h-56 sm:max-h-none w-full bg-slate-950/40 flex items-center justify-center overflow-hidden">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-5xl font-black text-violet-500/30">{initials(displayName)}</span>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={photoUploading}
                    onClick={() => photoInputRef.current?.click()}
                    className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white backdrop-blur-sm"
                    title="Fotoğraf yükle"
                  >
                    {photoUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                  </button>
                  {photoUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="p-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 backdrop-blur-sm"
                      title="Kaldır"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void handlePhotoUpload(file);
                }}
              />
            </div>

            <div className="p-4 sm:p-5 space-y-3">
              <div>
                <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">{displayTitle}</p>
                <h1 className="text-lg font-black text-white leading-tight mt-0.5">{displayName || 'Yönetici'}</h1>
                {department.trim() && (
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                    <Building2 className="w-3 h-3 shrink-0" />
                    {department.trim()}
                  </p>
                )}
              </div>

              {bio.trim() && (
                <p className="text-xs text-slate-400 bg-slate-950/40 rounded-lg px-3 py-2 border border-white/[0.04] flex items-start gap-2 line-clamp-4">
                  <FileText className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                  {bio.trim()}
                </p>
              )}

              <div className="space-y-1.5 pt-1">
                {email.trim() && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Mail className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className="truncate">{email.trim()}</span>
                  </div>
                )}
                {formattedPhone && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Phone className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span>{formattedPhone}</span>
                  </div>
                )}
              </div>

              {linkedIn.trim() && (
                <a
                  href={linkedIn.trim().startsWith('http') ? linkedIn.trim() : `https://${linkedIn.trim()}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-slate-950/50 border border-white/[0.06] text-violet-300/90 hover:border-violet-500/30"
                >
                  <ExternalLink className="w-3 h-3" /> LinkedIn
                </a>
              )}

              <button
                type="button"
                disabled={photoUploading}
                onClick={() => photoInputRef.current?.click()}
                className="w-full mt-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-slate-400 border border-dashed border-slate-700 hover:border-violet-500/40 hover:text-violet-300 transition-colors lg:hidden"
              >
                <Camera className="w-3.5 h-3.5" />
                {photoUploading ? 'Yükleniyor...' : 'Fotoğraf değiştir'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-slate-900/30 px-4 py-3 space-y-3">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Hesap türü</p>
                <p className="text-xs text-slate-300">Tam yetkili yönetim</p>
              </div>
            </div>
            <div className="h-px bg-white/[0.05]" />
            <div className="flex items-center gap-3">
              <Sparkles className="w-4 h-4 shrink-0 text-violet-400" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Profil doluluk</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400 transition-all duration-500"
                      style={{ width: `${Math.round((profileCompletion / 6) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-violet-400">{profileCompletion}/6</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Sağ: form */}
        <form id="admin-profile-form" onSubmit={handleSubmit} className="lg:col-span-8 xl:col-span-9 space-y-4">
          <SectionCard title="Temel bilgiler" icon={<User className="w-4 h-4" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Görünen ad *" hint="Anasayfa ve üst barda gösterilir" className="sm:col-span-2">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputCls}
                  placeholder="Adınız Soyadınız"
                  required
                />
              </Field>
              <Field label="Ünvan" icon={<Briefcase className="w-3 h-3" />}>
                <select value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls}>
                  <option value="">Seçiniz</option>
                  {TITLE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Departman" icon={<Building2 className="w-3 h-3" />}>
                <select value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls}>
                  <option value="">Seçiniz</option>
                  {DEPARTMENT_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="İletişim" icon={<Mail className="w-4 h-4" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="E-posta" icon={<Mail className="w-3 h-3" />} hint={formattedPhone ? undefined : 'İletişim ve bildirimler için'}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                  placeholder="ornek@email.com"
                />
              </Field>
              <Field label="Telefon" icon={<Phone className="w-3 h-3" />} hint={formattedPhone || undefined}>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputCls}
                  placeholder="5XX XXX XX XX"
                />
              </Field>
              <Field label="LinkedIn" icon={<ExternalLink className="w-3 h-3" />} className="sm:col-span-2">
                <input
                  type="url"
                  value={linkedIn}
                  onChange={(e) => setLinkedIn(e.target.value)}
                  className={inputCls}
                  placeholder="linkedin.com/in/kullanici"
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Hakkında" icon={<FileText className="w-4 h-4" />}>
            <Field label="Kısa biyografi" hint="Ekip içi iletişim ve raporlarda kullanılabilir">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className={textareaCls}
                placeholder="Görev tanımı, deneyim, sorumluluk alanları..."
                rows={4}
              />
            </Field>
          </SectionCard>

          <SectionCard title="Güvenlik" icon={<KeyRound className="w-4 h-4" />}>
            <div className="flex items-start gap-3 rounded-xl bg-slate-950/40 border border-white/[0.04] px-4 py-3">
              <Shield className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-300">Giriş parolası</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Yönetici giriş parolası sistem ayarlarından yönetilir. Parola değişikliği için teknik sorumlu ile
                  iletişime geçin.
                </p>
              </div>
            </div>
          </SectionCard>
        </form>
      </div>

      {/* Sabit kaydet çubuğu */}
      <div className="fixed bottom-0 left-0 right-0 z-40 lg:pl-64 pointer-events-none">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 pointer-events-auto">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-slate-950/90 backdrop-blur-xl px-4 py-3 shadow-2xl shadow-black/40">
            <p className="text-xs text-slate-500 hidden sm:block truncate">
              Değişiklikler kaydedilene kadar geçerli olmaz
            </p>
            <button
              type="submit"
              form="admin-profile-form"
              className={`ml-auto flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                saved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20'
              }`}
            >
              {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? 'Kaydedildi' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminProfilePage;
