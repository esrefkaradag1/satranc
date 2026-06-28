import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  Phone,
  Mail,
  Building2,
  KeyRound,
  Save,
  Eye,
  EyeOff,
  ShieldCheck,
  Camera,
  Loader2,
  GraduationCap,
  FileText,
  Trophy,
  ExternalLink,
  Calendar,
  Check,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../AppContext';
import { getServiceSupabase, isSupabaseBackend } from '../../services/supabase';
import type { Coach } from '../../types';

const inputCls =
  'w-full px-3 py-2 rounded-xl text-sm bg-slate-950/50 border border-slate-700/50 text-white placeholder:text-slate-600 outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all';

const textareaCls = `${inputCls} resize-y min-h-[88px] leading-relaxed`;

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

const TITLE_OPTIONS = ['Antrenör', 'Kıdemli Antrenör', 'Baş Antrenör', 'FIDE Usta', 'Uluslararası Usta', 'Diğer'];

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
        <span className="text-amber-400">{icon}</span>
        <h2 className="text-sm font-bold text-slate-200">{title}</h2>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

const CoachProfilePage: React.FC = () => {
  const { auth, coaches, updateCoach, showToast, confirmDialog } = useApp();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const coach = useMemo(() => {
    if (auth?.role !== 'coach') return undefined;
    if (auth.coachId) return coaches.find((c) => c.id === auth.coachId);
    return coaches.find((c) => (c.branch || '').trim() === (auth.branch || '').trim());
  }, [auth, coaches]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [bio, setBio] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [fideId, setFideId] = useState('');
  const [lichessUsername, setLichessUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  useEffect(() => {
    if (!coach) return;
    setName(coach.name || '');
    setPhone(coach.phone || '');
    setEmail(coach.email || '');
    setTitle(coach.title || '');
    setSpecialization(coach.specialization || '');
    setBio(coach.bio || '');
    setBirthDate(coach.birthDate || '');
    setFideId(coach.fideId || '');
    setLichessUsername(coach.lichessUsername || '');
    setPassword('');
  }, [coach]);

  const buildPatch = (extra?: Partial<Coach>): Partial<Coach> => {
    const patch: Partial<Coach> = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      title: title.trim() || undefined,
      specialization: specialization.trim() || undefined,
      bio: bio.trim() || undefined,
      birthDate: birthDate || undefined,
      fideId: fideId.trim() || undefined,
      lichessUsername: lichessUsername.trim() || undefined,
      ...extra,
    };
    if (password.trim()) patch.password = password.trim();
    return patch;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!coach) return;
    updateCoach(coach.id, buildPatch());
    setPassword('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handlePhotoUpload = async (file: File) => {
    if (!coach) return;
    if (!isSupabaseBackend()) {
      showToast('Fotoğraf yükleme için Supabase bağlantısı gerekir.', 'warning');
      return;
    }
    const sb = getServiceSupabase();
    if (!sb) return;

    setPhotoUploading(true);
    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${coach.id}-${Date.now()}.${fileExt}`;
      const { error } = await sb.storage.from('coach-photos').upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data } = sb.storage.from('coach-photos').getPublicUrl(fileName);
      updateCoach(coach.id, { photoUrl: data.publicUrl });
    } catch {
      showToast('Fotoğraf yüklenemedi. coach-photos bucket kontrol edin.', 'error');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!coach) return;
    const ok = await confirmDialog({
      title: 'Fotoğrafı kaldır',
      message: 'Profil fotoğrafını kaldırmak istiyor musunuz?',
      confirmLabel: 'Kaldır',
      variant: 'danger',
    });
    if (!ok) return;
    updateCoach(coach.id, { photoUrl: undefined });
  };

  if (!coach) {
    return (
      <div className="max-w-lg mx-auto rounded-2xl bg-slate-900/60 border border-amber-500/25 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
          <User className="w-7 h-7 text-amber-400" />
        </div>
        <h2 className="text-lg font-black text-white mb-2">Profil bulunamadı</h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          Kulüp yöneticinizin sizi antrenör listesine eklemesi ve giriş şifresi tanımlaması gerekir.
        </p>
      </div>
    );
  }

  const effectiveLogin = email.trim() || name.trim();
  const displayTitle = title.trim() || 'Antrenör';
  const formattedPhone = formatPhone(phone);

  return (
    <div className="animate-in fade-in duration-300 max-w-6xl mx-auto w-full pb-24">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        {/* Sol: profil kartı */}
        <aside className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-20 space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-amber-500/[0.08] to-slate-900/60 overflow-hidden">
            <div className="relative group">
              <div className="aspect-square max-h-56 sm:max-h-none w-full bg-slate-950/40 flex items-center justify-center overflow-hidden">
                {coach.photoUrl ? (
                  <img
                    src={coach.photoUrl}
                    alt={coach.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-5xl font-black text-amber-500/30">{initials(coach.name)}</span>
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
                  {coach.photoUrl && (
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
                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">{displayTitle}</p>
                <h1 className="text-lg font-black text-white leading-tight mt-0.5">{name || coach.name}</h1>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                  <Building2 className="w-3 h-3 shrink-0" />
                  {coach.branch || '—'}
                </p>
              </div>

              {specialization.trim() && (
                <p className="text-xs text-slate-400 bg-slate-950/40 rounded-lg px-3 py-2 border border-white/[0.04] flex items-start gap-2">
                  <GraduationCap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  {specialization.trim()}
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

              <div className="flex flex-wrap gap-1.5 pt-1">
                {fideId.trim() && (
                  <a
                    href={`https://ratings.fide.com/profile/${encodeURIComponent(fideId.trim())}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-slate-950/50 border border-white/[0.06] text-amber-300/90 hover:border-amber-500/30"
                  >
                    <Trophy className="w-3 h-3" /> FIDE
                  </a>
                )}
                {lichessUsername.trim() && (
                  <a
                    href={`https://lichess.org/@/${encodeURIComponent(lichessUsername.trim())}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-slate-950/50 border border-white/[0.06] text-amber-300/90 hover:border-amber-500/30"
                  >
                    <ExternalLink className="w-3 h-3" /> Lichess
                  </a>
                )}
              </div>

              <button
                type="button"
                disabled={photoUploading}
                onClick={() => photoInputRef.current?.click()}
                className="w-full mt-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-slate-400 border border-dashed border-slate-700 hover:border-amber-500/40 hover:text-amber-300 transition-colors lg:hidden"
              >
                <Camera className="w-3.5 h-3.5" />
                {photoUploading ? 'Yükleniyor...' : 'Fotoğraf değiştir'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-slate-900/30 px-4 py-3 flex items-center gap-3">
            <ShieldCheck className={`w-4 h-4 shrink-0 ${coach.password ? 'text-emerald-400' : 'text-slate-500'}`} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Giriş durumu</p>
              <p className="text-xs text-slate-300 truncate">
                {coach.password ? 'Özel şifre aktif' : 'Varsayılan şifre (antrenor)'}
              </p>
            </div>
          </div>
        </aside>

        {/* Sağ: form */}
        <form id="coach-profile-form" onSubmit={handleSubmit} className="lg:col-span-8 xl:col-span-9 space-y-4">
          <SectionCard title="Temel bilgiler" icon={<User className="w-4 h-4" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Ad Soyad *" className="sm:col-span-2">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
              </Field>
              <Field label="Ünvan">
                <select value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls}>
                  <option value="">Seçiniz</option>
                  {TITLE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Doğum tarihi" icon={<Calendar className="w-3 h-3" />}>
                <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputCls} />
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
              <Field label="E-posta (giriş)" icon={<Mail className="w-3 h-3" />}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Şube / Kulüp" icon={<Building2 className="w-3 h-3" />} className="sm:col-span-2">
                <input type="text" value={coach.branch || ''} className={`${inputCls} opacity-50 cursor-not-allowed`} readOnly />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Mesleki bilgiler" icon={<GraduationCap className="w-4 h-4" />}>
            <div className="space-y-4">
              <Field label="Uzmanlık alanı">
                <input
                  type="text"
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  className={inputCls}
                  placeholder="Gençlik gelişimi, turnuva hazırlığı..."
                />
              </Field>
              <Field label="Hakkımda" icon={<FileText className="w-3 h-3" />}>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className={textareaCls}
                  placeholder="Deneyim, eğitim geçmişi, çalışma tarzı..."
                  rows={3}
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="FIDE ID" icon={<Trophy className="w-3 h-3" />}>
                  <input
                    type="text"
                    value={fideId}
                    onChange={(e) => setFideId(e.target.value)}
                    className={inputCls}
                    placeholder="FIDE oyuncu numarası"
                  />
                </Field>
                <Field label="Lichess" icon={<ExternalLink className="w-3 h-3" />}>
                  <input
                    type="text"
                    value={lichessUsername}
                    onChange={(e) => setLichessUsername(e.target.value)}
                    className={inputCls}
                    placeholder="kullanıcı adı"
                  />
                </Field>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Güvenlik" icon={<KeyRound className="w-4 h-4" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <Field label="Yeni şifre" hint={`Giriş: ${effectiveLogin}`}>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputCls} pr-10`}
                    placeholder={coach.password ? 'Değiştirmek için yazın' : 'Varsayılan: antrenor'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>
              <p className="text-xs text-slate-500 sm:pb-2 leading-relaxed">
                Boş bırakırsanız mevcut şifre korunur. Girişte e-posta veya adınızı kullanabilirsiniz.
              </p>
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
              form="coach-profile-form"
              className={`ml-auto flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                saved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-white shadow-lg shadow-amber-500/20'
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

export default CoachProfilePage;
