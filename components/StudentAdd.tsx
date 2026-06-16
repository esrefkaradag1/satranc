import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Building2,
  Calendar,
  CreditCard,
  GraduationCap,
  Heart,
  Phone,
  Save,
  Upload,
  User,
  UserPlus,
  Users,
  X,
  Zap,
  MessageCircle,
  Copy,
  Check,
  Plus,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { getServiceSupabase } from '../services/supabase';
import { DEFAULT_REMINDER_DAY, REMINDER_DAY_OPTIONS } from '../lib/reminderDays';
import { syncStudentRatingsFromExternal } from '../services/studentRatingsSync';
import { getOrCreateParentConsentInviteAsync } from '../services/applicationStorage';
import { openWhatsAppSend } from '../lib/whatsappUtils';
import type { GroupLessonSlot, Student } from '../types';
import {
  applyGroupDefaultsToStudent,
  applySiblingDiscount,
  findTrainingGroupByName,
  formatLessonSchedule,
} from '../lib/trainingGroupUtils';
import { isValidTrPhone, normalizeTrPhoneDigits } from '../lib/phoneUtils';

/* ─── Constants ──────────────────────────────────────────────────────────── */
const PLACEHOLDER_OFFICE = 'Şube Seçiniz';
const PLACEHOLDER_DISCIPLINE = 'Branş Seçiniz';
const PLACEHOLDER_GROUP = 'Grup Seçiniz';

type RegistrationType = 'monthly' | 'package';

type FormState = {
  branchOffice: string;
  registrationType: RegistrationType;
  tcNo: string;
  name: string;
  birthDate: string;
  registrationDate: string;
  lichessUsername: string;
  chessComUsername: string;
  school: string;
  teacher: string;
  hasSiblingDiscount: boolean;
  siblingDiscountType: 'percent' | 'amount';
  siblingDiscountPercent: string;
  siblingDiscountAmount: string;
  notes: string;
  healthInfo: string;
  branch: string;
  group: string;
  monthlyFee: string;
  paymentReminderDay: string;
  latePaymentReminderDay: string;
  isScholarshipStudent: boolean;
  fatherName: string;
  fatherPhone: string;
  fatherJob: string;
  motherName: string;
  motherPhone: string;
  motherJob: string;
  address: string;
  username: string;
  password: string;
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const onlyDigits = (v: string) => v.replace(/[^\d]/g, '');

function formatTrPhone(input: string) {
  const d = normalizeTrPhoneDigits(input);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean);
  return parts.join(' ');
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/* ─── Primitive UI pieces ────────────────────────────────────────────────── */

const inputCls = 'w-full px-4 py-2.5 rounded-lg text-[13px] font-bold outline-none transition-all duration-200 bg-slate-900/60 border border-slate-700/60 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50';

const selectCls = inputCls + ' appearance-none cursor-pointer';

const Field: React.FC<{
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, required, error, hint, className = '', children }) => (
  <div className={`space-y-1.5 ${className}`}>
    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
      {label}
      {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
    {error && (
      <p className="flex items-center gap-1.5 text-[10px] text-rose-500 font-bold animate-in fade-in slide-in-from-left-1">
        <AlertCircle className="w-3 h-3" strokeWidth={2.5} /> {error}
      </p>
    )}
    {hint && !error && (
      <p className="text-[10px] text-slate-500 font-medium">{hint}</p>
    )}
  </div>
);

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  noGrid?: boolean;
}> = ({ title, icon, children, noGrid }) => (
  <section className="rounded-2xl border border-slate-700/50 bg-[#1e293b]/90 overflow-hidden shadow-sm">
    <div className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white">
      {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-4 h-4 shrink-0' })}
      <h2 className="text-sm font-black uppercase tracking-wide">{title}</h2>
    </div>
    <div className={noGrid ? 'p-5' : 'p-5 grid grid-cols-1 md:grid-cols-2 gap-4'}>{children}</div>
  </section>
);

/* ─── Kompakt fotoğraf (Başvuru Formu ile aynı boyut) ───────────────────── */
const CompactPhotoField: React.FC<{
  preview: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
  error?: string;
}> = ({ preview, onPick, onRemove, error }) => (
  <Field label="Fotoğraf" error={error} className="md:col-span-2">
    <div className="flex flex-wrap items-center gap-4">
      {preview ? (
        <div className="relative">
          <img src={preview} alt="" className="w-24 h-24 rounded-xl object-cover border border-slate-600" />
          <button
            type="button"
            onClick={onRemove}
            className="absolute -top-2 -right-2 p-1 rounded-full bg-rose-500 text-white shadow"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center w-28 h-28 rounded-xl border-2 border-dashed border-slate-600 cursor-pointer hover:border-indigo-500/50 bg-slate-800/30 transition-colors">
          <Upload className="w-5 h-5 text-slate-400 mb-1" />
          <span className="text-[10px] text-slate-500 text-center px-2">JPG/PNG max 5MB</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPick(file);
            }}
          />
        </label>
      )}
    </div>
  </Field>
);

/* ─── Type Selector Card ─────────────────────────────────────────────────── */
const TypeCard: React.FC<{
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
}> = ({ selected, icon, title, subtitle, badge, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative flex-1 flex flex-col items-start gap-3 p-5 rounded-xl border text-left transition-all duration-200 active:scale-[0.99] group ${selected
      ? 'border-indigo-500 bg-indigo-500/10 shadow-md shadow-indigo-500/10'
      : 'border-slate-700/80 bg-slate-800/40 hover:border-indigo-500/30'
      }`}
  >
    <div className="flex justify-between items-start w-full">
      <div
        className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 transition-colors ${selected
          ? 'bg-indigo-500 text-white'
          : 'bg-slate-700/80 text-slate-400'
          }`}
      >
        {React.cloneElement(icon as React.ReactElement<any>, { size: 20, strokeWidth: 2 })}
      </div>
      {selected ? (
        <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-white" />
        </div>
      ) : (
        <div className="w-5 h-5 rounded-full border-2 border-slate-600 bg-transparent" />
      )}
    </div>
    <div className="min-w-0 w-full">
      <h3 className={`font-bold text-sm tracking-tight ${selected ? 'text-white' : 'text-slate-300'}`}>
        {title}
      </h3>
      <p className={`text-xs font-medium mt-0.5 ${selected ? 'text-indigo-300/90' : 'text-slate-500'}`}>
        {subtitle}
      </p>
      {badge && (
        <span className={`inline-flex mt-2 px-2 py-0.5 rounded text-[9px] font-bold uppercase ${selected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-500'}`}>
          {badge}
        </span>
      )}
    </div>
  </button>
);

/* ─── Main Component ─────────────────────────────────────────────────────── */
const StudentAdd: React.FC<{ onCancel?: () => void; onSaved?: () => void }> = ({
  onCancel,
  onSaved,
}) => {
  const { addStudent, updateStudent, branchOffices, disciplines, groups, students, trainingGroups, disciplineBranches } = useApp();
  const branchOfficeOptions = [PLACEHOLDER_OFFICE, ...branchOffices];
  const disciplineOptions = [PLACEHOLDER_DISCIPLINE, ...disciplines];
  const [lessonSchedule, setLessonSchedule] = useState<GroupLessonSlot[]>([]);

  const handleAddDemoStudent = () => {
    const demoCount = students.filter((s) => s.name.startsWith('Demo Öğrenci')).length + 1;
    const name = demoCount === 1 ? 'Demo Öğrenci' : `Demo Öğrenci ${demoCount}`;
    const branch = branchOffices[0] || 'Merkez';
    const group = groups[0] || 'A Grubu';
    const discipline = disciplines[0] || 'Satranç';
    addStudent({
      name,
      level: 'Başlangıç',
      elo: 1200,
      ukd: 0,
      lastAttendance: todayIso(),
      paymentStatus: 'Paid',
      group,
      parentName: 'Demo Veli',
      parentPhone: '5551234567',
      birthDate: '2015-06-15',
      registrationDate: todayIso(),
      branch: discipline,
      branchOffice: branch,
      fatherName: 'Demo Baba',
      fatherPhone: '5551234567',
      motherName: 'Demo Anne',
      motherPhone: '5559876543',
      status: 'active',
    });
    onSaved?.();
  };
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [extraContactPhone, setExtraContactPhone] = useState('');
  const [showExtraContact, setShowExtraContact] = useState(false);

  const [form, setForm] = useState<FormState>({
    branchOffice: PLACEHOLDER_OFFICE,
    registrationType: 'monthly',
    tcNo: '',
    name: '',
    birthDate: '',
    registrationDate: todayIso(),
    lichessUsername: '',
    chessComUsername: '',
    school: '',
    teacher: '',
    hasSiblingDiscount: false,
    siblingDiscountType: 'percent',
    siblingDiscountPercent: '10',
    siblingDiscountAmount: '500',
    notes: '',
    healthInfo: '',
    branch: PLACEHOLDER_DISCIPLINE,
    group: PLACEHOLDER_GROUP,
    monthlyFee: '',
    paymentReminderDay: DEFAULT_REMINDER_DAY,
    latePaymentReminderDay: DEFAULT_REMINDER_DAY,
    isScholarshipStudent: false,
    fatherName: '',
    fatherPhone: '',
    fatherJob: '',
    motherName: '',
    motherPhone: '',
    motherJob: '',
    address: '',
    username: '',
    password: '',
  });

  const groupOptions = useMemo(() => {
    const office = form.branchOffice !== PLACEHOLDER_OFFICE ? form.branchOffice : '';
    const discipline = form.branch !== PLACEHOLDER_DISCIPLINE ? form.branch : '';
    if (trainingGroups.length) {
      const filtered = trainingGroups
        .filter((g) => (!office || g.branchOffice === office) && (!discipline || g.discipline === discipline))
        .map((g) => g.name);
      if (filtered.length) return [PLACEHOLDER_GROUP, ...filtered];
    }
    return [PLACEHOLDER_GROUP, ...groups];
  }, [form.branchOffice, form.branch, trainingGroups, groups]);

  const handleGroupChange = (groupName: string) => {
    setForm((prev) => {
      const next = { ...prev, group: groupName };
      if (groupName === PLACEHOLDER_GROUP) {
        setLessonSchedule([]);
        return next;
      }
      const tg = findTrainingGroupByName(trainingGroups, groupName);
      if (tg) {
        const defaults = applyGroupDefaultsToStudent(tg, disciplineBranches);
        setLessonSchedule(defaults.lessonSchedule ?? []);
        return {
          ...next,
          branch: defaults.branch || prev.branch,
          branchOffice: defaults.branchOffice || prev.branchOffice,
          monthlyFee: defaults.monthlyFee ? String(defaults.monthlyFee) : prev.monthlyFee,
        };
      }
      setLessonSchedule([]);
      return next;
    });
  };

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Ad soyad zorunludur.';
    if (!form.birthDate) e.birthDate = 'Doğum tarihi zorunludur.';
    if (!form.registrationDate) e.registrationDate = 'Kayıt tarihi zorunludur.';
    if (form.branchOffice === PLACEHOLDER_OFFICE) e.branchOffice = 'Şube seçiniz.';
    if (form.branch === PLACEHOLDER_DISCIPLINE) e.branch = 'Branş seçiniz.';
    if (form.group === PLACEHOLDER_GROUP) e.group = 'Grup seçiniz.';
    if (form.tcNo && onlyDigits(form.tcNo).length !== 11) e.tcNo = '11 haneli olmalıdır.';
    if (form.tcNo && students.some((s) => (s.tcNo ?? '') === onlyDigits(form.tcNo))) e.tcNo = 'Bu T.C. ile kayıtlı öğrenci var.';
    if (form.username.trim() && students.some((s) => (s.username ?? '').toLowerCase() === form.username.trim().toLowerCase())) e.username = 'Bu kullanıcı adı zaten kullanılıyor.';
    if (!isValidTrPhone(form.fatherPhone)) e.fatherPhone = 'Geçerli cep telefonu girin (05XX veya 5XX).';
    if (form.registrationType === 'monthly' && !form.isScholarshipStudent && !form.monthlyFee.trim()) {
      e.monthlyFee = 'Aylık aidat zorunludur.';
    }
    if (form.hasSiblingDiscount && !form.isScholarshipStudent) {
      if (form.siblingDiscountType === 'amount') {
        const amt = Number(form.siblingDiscountAmount);
        const base = Number(form.monthlyFee || 0);
        if (!Number.isFinite(amt) || amt <= 0) e.siblingDiscountAmount = 'Geçerli bir tutar girin.';
        else if (base > 0 && amt >= base) e.siblingDiscountAmount = 'İndirim, aidattan küçük olmalıdır.';
      } else {
        const pct = Number(form.siblingDiscountPercent);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) e.siblingDiscountPercent = '1-100 arası olmalıdır.';
      }
    }
    return e;
  }, [form, students]);

  const isValid = Object.keys(errors).length === 0;

  const [isSaving, setIsSaving] = useState(false);
  const [savedStudent, setSavedStudent] = useState<Student | null>(null);
  const [parentFormUrl, setParentFormUrl] = useState('');
  const [ratingsSyncNote, setRatingsSyncNote] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [whatsAppSent, setWhatsAppSent] = useState(false);

  const handlePickPhoto = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Dosya boyutu 5MB\'dan büyük olamaz');
      return;
    }
    setPhotoError('');
    setPhoto(file);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!isValid || isSaving) return;
    setIsSaving(true);
    
    try {
      let photoUrl: string | undefined = undefined;
      
      // Handle photo upload if exists
      if (photo) {
        const sb = getServiceSupabase();
        if (sb) {
          const fileExt = photo.name.split('.').pop();
          const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
          const filePath = `${fileName}`;
          
          const { error: uploadError } = await sb.storage
            .from('student-photos')
            .upload(filePath, photo);
            
          if (!uploadError) {
            const { data: publicUrlData } = sb.storage
              .from('student-photos')
              .getPublicUrl(filePath);
            photoUrl = publicUrlData.publicUrl;
          } else {
            console.error('Photo upload error:', uploadError);
          }
        } else {
          // Fallback to local preview URL if no Supabase (for mock data usage)
          photoUrl = photoPreviewUrl || undefined;
        }
      }

      const contactPhones = [
        normalizeTrPhoneDigits(form.fatherPhone),
        normalizeTrPhoneDigits(form.motherPhone),
        normalizeTrPhoneDigits(extraContactPhone),
      ].filter(Boolean);
      const contacts = [...new Set(contactPhones)];

      const newStudent = await addStudent({
        name: form.name.trim(),
        level: 'Başlangıç',
        elo: 0,
        ukd: 0,
        lastAttendance: todayIso(),
        paymentStatus: 'Unpaid',
        group: form.group !== PLACEHOLDER_GROUP ? form.group : (groups[0] || ''),
        parentName: form.fatherName?.trim() || form.motherName?.trim() || 'Veli',
        parentPhone: normalizeTrPhoneDigits(form.fatherPhone) || normalizeTrPhoneDigits(form.motherPhone) || '',
        birthDate: form.birthDate,
        registrationDate: form.registrationDate,
        tcNo: onlyDigits(form.tcNo) || undefined,
        lichessUsername: form.lichessUsername.trim() || undefined,
        chessComUsername: form.chessComUsername.trim() || undefined,
        school: form.school.trim() || undefined,
        teacher: form.teacher.trim() || undefined,
        hasSiblingDiscount: form.hasSiblingDiscount && !form.isScholarshipStudent ? true : undefined,
        siblingDiscountType:
          form.hasSiblingDiscount && !form.isScholarshipStudent ? form.siblingDiscountType : undefined,
        siblingDiscountPercent:
          form.hasSiblingDiscount && !form.isScholarshipStudent && form.siblingDiscountType === 'percent'
            ? Number(form.siblingDiscountPercent || 0)
            : undefined,
        siblingDiscountAmount:
          form.hasSiblingDiscount && !form.isScholarshipStudent && form.siblingDiscountType === 'amount'
            ? Number(form.siblingDiscountAmount || 0)
            : undefined,
        notes: form.notes.trim() || undefined,
        healthInfo: form.healthInfo.trim() || undefined,
        branch: form.branch !== PLACEHOLDER_DISCIPLINE ? form.branch : undefined,
        branchOffice: form.branchOffice !== PLACEHOLDER_OFFICE ? form.branchOffice : undefined,
        registrationType: form.registrationType,
        monthlyFee: form.registrationType === 'monthly' && form.monthlyFee ? Number(form.monthlyFee) : undefined,
        paymentReminderDay: form.registrationType === 'monthly' ? form.paymentReminderDay : undefined,
        latePaymentReminderDay: form.registrationType === 'monthly' ? form.latePaymentReminderDay : undefined,
        isScholarshipStudent: form.isScholarshipStudent || undefined,
        fatherName: form.fatherName.trim() || undefined,
        fatherPhone: normalizeTrPhoneDigits(form.fatherPhone) || undefined,
        fatherJob: form.fatherJob.trim() || undefined,
        motherName: form.motherName.trim() || undefined,
        motherPhone: normalizeTrPhoneDigits(form.motherPhone) || undefined,
        motherJob: form.motherJob.trim() || undefined,
        address: form.address.trim() || undefined,
        contactNumbers: contacts.length ? contacts : undefined,
        status: 'active',
        username: form.username.trim() || undefined,
        password: form.password.trim() || undefined,
        photoUrl: photoUrl,
        trainingGroupId: findTrainingGroupByName(trainingGroups, form.group)?.id,
        lessonSchedule: lessonSchedule.length ? lessonSchedule : undefined,
      });

      try {
        const sync = await syncStudentRatingsFromExternal(newStudent);
        if (Object.keys(sync.patch).length > 0) {
          await updateStudent(newStudent.id, sync.patch);
        }
        const parts: string[] = [];
        if (sync.ukdSynced) parts.push('UKD');
        if (sync.fideSynced) parts.push('FIDE');
        setRatingsSyncNote(
          parts.length > 0
            ? `${parts.join(' ve ')} bilgileri otomatik çekildi.`
            : 'UKD/FIDE otomatik çekilemedi; profilden tekrar deneyebilirsiniz.'
        );
      } catch {
        setRatingsSyncNote('UKD/FIDE otomatik çekilemedi.');
      }

      try {
        const signed = await getOrCreateParentConsentInviteAsync(newStudent);
        setParentFormUrl(signed.url);
        setSavedStudent(newStudent);

        const phone =
          newStudent.fatherPhone ||
          newStudent.motherPhone ||
          newStudent.parentPhone ||
          contacts[0] ||
          '';
        const msg = `Merhaba,\n\n${newStudent.name} için kulüp kayıt formunu onaylamanız ve dijital imzanızı eklemeniz gerekmektedir.\n\nForm linki:\n${signed.url}\n\nTeşekkürler.`;
        if (phone) {
          openWhatsAppSend(phone, msg);
          setWhatsAppSent(true);
        }
      } catch {
        setSavedStudent(newStudent);
        setParentFormUrl('');
        setWhatsAppSent(false);
      }
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  return (
    <>
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">

        {/* Sticky header — kompakt */}
        <div className="sticky top-0 z-40 -mx-2 mb-4 pt-2 px-2 pb-2">
          <div className="bg-[#1e293b]/95 backdrop-blur-xl rounded-xl px-5 py-3.5 border border-slate-700/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30 text-indigo-400">
                <UserPlus className="w-5 h-5" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white">Öğrenci Ekle</h1>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Başvuru formu düzeni</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <button
                type="button"
                onClick={handleAddDemoStudent}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600/90 hover:bg-amber-500 text-white font-bold text-xs transition-all active:scale-95"
              >
                <Zap className="w-4 h-4" />
                Hızlı Demo Ekle
              </button>
              <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all active:scale-95">
                İptal
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isValid || isSaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Öğrenci Ekle
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto space-y-5">

          <Section title="Kayıt Türü" icon={<BookOpen />} noGrid>
            <div className="flex flex-col sm:flex-row gap-4">
              <TypeCard
                selected={form.registrationType === 'monthly'}
                onClick={() => set('registrationType')('monthly')}
                icon={<Calendar />}
                title="Aylık Aidat"
                subtitle="Düzenli aylık ödeme sistemi"
                badge="Önerilen"
              />
              <TypeCard
                selected={form.registrationType === 'package'}
                onClick={() => set('registrationType')('package')}
                icon={<GraduationCap />}
                title="Ders Paketi"
                subtitle="Belirli sayıda ders için ödeme"
              />
            </div>
          </Section>

          <Section title="Şube Bilgileri" icon={<Building2 />}>
            <Field label="Şube" required error={errors.branchOffice}>
              <select
                value={form.branchOffice}
                onChange={(e) => set('branchOffice')(e.target.value)}
                className={selectCls}
              >
                {branchOfficeOptions.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Branş" required error={errors.branch}>
              <select
                value={form.branch}
                onChange={(e) => set('branch')(e.target.value)}
                className={selectCls}
              >
                {disciplineOptions.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Grup" required error={errors.group} className="md:col-span-2">
              <select
                value={form.group}
                onChange={(e) => handleGroupChange(e.target.value)}
                className={selectCls}
              >
                {groupOptions.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            {lessonSchedule.length > 0 && (
              <Field label="Ders programı (gruptan)" className="md:col-span-2">
                <div className="px-4 py-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-sm font-medium">
                  {formatLessonSchedule(lessonSchedule)}
                </div>
              </Field>
            )}
          </Section>

          <Section title="Öğrenci Bilgileri" icon={<User />}>
            <CompactPhotoField
              preview={photoPreviewUrl}
              onPick={handlePickPhoto}
              onRemove={() => {
                setPhoto(null);
                setPhotoError('');
                if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
                setPhotoPreviewUrl(null);
              }}
              error={photoError}
            />
            <Field label="T.C. Kimlik No" error={errors.tcNo} hint="UKD ve FIDE işlemleri için">
              <input
                value={form.tcNo}
                onChange={(e) => set('tcNo')(onlyDigits(e.target.value).slice(0, 11))}
                inputMode="numeric"
                placeholder="11 haneli kimlik numarası"
                className={inputCls}
              />
            </Field>
            <Field label="Ad Soyad" required error={errors.name}>
              <input
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                placeholder="Öğrenci adı ve soyadı"
                className={inputCls}
              />
            </Field>
            <Field label="Doğum Tarihi" required error={errors.birthDate}>
              <input
                type="date"
                value={form.birthDate}
                onChange={(e) => set('birthDate')(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Kayıt Tarihi" required error={errors.registrationDate}>
              <input
                type="date"
                value={form.registrationDate}
                onChange={(e) => set('registrationDate')(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Kullanıcı Adı" hint="Öğrenci girişi için" error={errors.username}>
              <input
                value={form.username}
                onChange={(e) => set('username')(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                placeholder="kullanici_adi"
                className={inputCls}
              />
            </Field>
            <Field label="Giriş Şifresi" hint="Öğrenci girişinde kullanılacak">
              <input
                type="password"
                value={form.password}
                onChange={(e) => set('password')(e.target.value)}
                placeholder="••••••"
                className={inputCls}
              />
            </Field>
            <Field label="Lichess kullanıcı adı" hint="Opsiyonel, küçük harf">
              <input
                value={form.lichessUsername}
                onChange={(e) => set('lichessUsername')(e.target.value)}
                placeholder="Kullanıcı adı"
                className={inputCls}
              />
            </Field>
            <Field label="Chess.com kullanıcı adı" hint="Opsiyonel, küçük harf">
              <input
                value={form.chessComUsername}
                onChange={(e) => set('chessComUsername')(e.target.value)}
                placeholder="Kullanıcı adı"
                className={inputCls}
              />
            </Field>
            <Field label="Devam ettiği okul">
              <input
                value={form.school}
                onChange={(e) => set('school')(e.target.value)}
                placeholder="Okul adı"
                className={inputCls}
              />
            </Field>
            <Field label="Öğretmeni">
              <input
                value={form.teacher}
                onChange={(e) => set('teacher')(e.target.value)}
                placeholder="Öğretmen adı"
                className={inputCls}
              />
            </Field>
            <Field label="Kardeş indirimi" className="md:col-span-2">
              <label className={`flex items-center gap-3 w-fit ${form.isScholarshipStudent ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <div
                  onClick={() => {
                    if (form.isScholarshipStudent) return;
                    set('hasSiblingDiscount')(!form.hasSiblingDiscount);
                  }}
                  className={`w-11 h-6 rounded-full transition-all relative ${form.hasSiblingDiscount ? 'bg-indigo-500' : 'bg-slate-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.hasSiblingDiscount ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
                <span className="text-sm text-slate-300">Kardeş indirimi uygula</span>
              </label>
            </Field>
            {form.hasSiblingDiscount && !form.isScholarshipStudent ? (
              <>
                <Field label="İndirim türü" className="md:col-span-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => set('siblingDiscountType')('percent')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${form.siblingDiscountType === 'percent' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                      % İndirim
                    </button>
                    <button
                      type="button"
                      onClick={() => set('siblingDiscountType')('amount')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${form.siblingDiscountType === 'amount' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                      Tutar İndirim (₺)
                    </button>
                  </div>
                </Field>
                {form.siblingDiscountType === 'percent' ? (
                  <Field label="Kardeş indirimi (%)" required error={errors.siblingDiscountPercent}>
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={form.siblingDiscountPercent}
                        onChange={(e) => set('siblingDiscountPercent')(e.target.value.replace(/[^\d]/g, ''))}
                        placeholder="10"
                        className={inputCls + ' pr-8'}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">%</span>
                    </div>
                  </Field>
                ) : (
                  <Field label="Kardeş indirimi (₺)" required error={errors.siblingDiscountAmount}>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-sm">₺</span>
                      <input
                        type="number"
                        min={1}
                        value={form.siblingDiscountAmount}
                        onChange={(e) => set('siblingDiscountAmount')(e.target.value.replace(/[^\d]/g, ''))}
                        placeholder="500"
                        className={inputCls + ' pl-9'}
                      />
                    </div>
                  </Field>
                )}
                {form.registrationType === 'monthly' && form.monthlyFee ? (
                  <Field label="İndirimli aidat (önizleme)">
                    <div className={inputCls + ' flex items-center justify-between'}>
                      <span className="text-slate-400 text-xs line-through">
                        ₺{Number(form.monthlyFee || 0).toLocaleString('tr-TR')}
                      </span>
                      <span className="text-emerald-400 font-black">
                        ₺{applySiblingDiscount(Number(form.monthlyFee || 0), {
                          hasSiblingDiscount: true,
                          siblingDiscountType: form.siblingDiscountType,
                          siblingDiscountPercent: Number(form.siblingDiscountPercent || 0),
                          siblingDiscountAmount: Number(form.siblingDiscountAmount || 0),
                        }).finalFee.toLocaleString('tr-TR')}
                      </span>
                    </div>
                  </Field>
                ) : null}
              </>
            ) : null}
            <Field label="Açıklama" className="md:col-span-2">
              <textarea
                value={form.notes}
                onChange={(e) => set('notes')(e.target.value)}
                rows={2}
                placeholder="Öğrenci hakkında ek bilgiler..."
                className={inputCls + ' resize-y min-h-[4rem]'}
              />
            </Field>
          </Section>

          <Section title="Sağlık Bilgileri" icon={<Heart />}>
            <Field label="Sağlık durumu" className="md:col-span-2">
              <textarea
                value={form.healthInfo}
                onChange={(e) => set('healthInfo')(e.target.value)}
                rows={3}
                placeholder="Alerji, kronik hastalık vb."
                className={inputCls + ' resize-y min-h-[5rem]'}
              />
            </Field>
          </Section>

          {form.registrationType === 'monthly' ? (
            <Section title="Aidat Bilgileri" icon={<CreditCard />}>
              <Field label="Aidat ücreti (₺)" required={!form.isScholarshipStudent} error={errors.monthlyFee}>
                {form.isScholarshipStudent ? (
                  <div className={inputCls + ' flex items-center justify-center font-black text-emerald-400 bg-emerald-500/10 border-emerald-500/30'}>
                    Burslu
                  </div>
                ) : (
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-sm">₺</span>
                    <input
                      value={form.monthlyFee}
                      onChange={(e) => set('monthlyFee')(e.target.value.replace(/[^\d.]/g, ''))}
                      inputMode="decimal"
                      placeholder="0.00"
                      className={inputCls + ' pl-9'}
                    />
                  </div>
                )}
              </Field>
              <Field label="Aidat hatırlatma günü" required>
                <select
                  value={form.paymentReminderDay}
                  onChange={(e) => set('paymentReminderDay')(e.target.value)}
                  className={selectCls}
                >
                  {REMINDER_DAY_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Gecikmiş hatırlatma günü" required>
                <select
                  value={form.latePaymentReminderDay}
                  onChange={(e) => set('latePaymentReminderDay')(e.target.value)}
                  className={selectCls}
                >
                  {REMINDER_DAY_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Burslu öğrenci" className="md:col-span-2">
                <label className="flex items-center gap-3 cursor-pointer w-fit">
                  <div
                    onClick={() => {
                      const next = !form.isScholarshipStudent;
                      setForm((prev) => ({
                        ...prev,
                        isScholarshipStudent: next,
                        hasSiblingDiscount: next ? false : prev.hasSiblingDiscount,
                      }));
                    }}
                    className={`w-11 h-6 rounded-full transition-all relative ${form.isScholarshipStudent ? 'bg-emerald-500' : 'bg-slate-700'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.isScholarshipStudent ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                  <span className="text-sm text-slate-300">Burs kapsamında kayıt — aidat tahsil edilmez</span>
                </label>
              </Field>
            </Section>
          ) : null}

          <Section title="Veli Bilgileri" icon={<Users />}>
            <Field label="Baba ad soyad">
              <input
                value={form.fatherName}
                onChange={(e) => set('fatherName')(e.target.value)}
                placeholder="Adı ve soyadı"
                className={inputCls}
              />
            </Field>
            <Field label="Baba telefon" required error={errors.fatherPhone} hint="05XX veya 5XX ile başlayın">
              <input
                value={form.fatherPhone}
                onChange={(e) => set('fatherPhone')(formatTrPhone(e.target.value))}
                inputMode="tel"
                placeholder="5xx xxx xx xx"
                className={inputCls}
              />
            </Field>
            <Field label="Baba meslek">
              <input
                value={form.fatherJob}
                onChange={(e) => set('fatherJob')(e.target.value)}
                placeholder="Meslek"
                className={inputCls}
              />
            </Field>
            <Field label="Anne ad soyad">
              <input
                value={form.motherName}
                onChange={(e) => set('motherName')(e.target.value)}
                placeholder="Adı ve soyadı"
                className={inputCls}
              />
            </Field>
            <Field label="Anne telefon" hint="0 ile başlamalı">
              <input
                value={form.motherPhone}
                onChange={(e) => set('motherPhone')(formatTrPhone(e.target.value))}
                inputMode="tel"
                placeholder="5xx xxx xx xx"
                className={inputCls}
              />
            </Field>
            <Field label="Anne meslek">
              <input
                value={form.motherJob}
                onChange={(e) => set('motherJob')(e.target.value)}
                placeholder="Meslek"
                className={inputCls}
              />
            </Field>
          </Section>

          <Section title="İletişim" icon={<Phone />}>
            <Field label="Adres" className="md:col-span-2">
              <textarea
                value={form.address}
                onChange={(e) => set('address')(e.target.value)}
                rows={2}
                placeholder="Ev adresi..."
                className={inputCls + ' resize-y min-h-[4rem]'}
              />
            </Field>
            <div className="md:col-span-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Kayıt sonrası veli form linki <span className="text-emerald-300 font-semibold">baba ve anne telefonlarına</span> otomatik WhatsApp ile gönderilir. Ayrı numara seçimi gerekmez.
                </p>
              </div>
              {showExtraContact ? (
                <Field label="Ek iletişim numarası (isteğe bağlı)" hint="Bakıcı vb.">
                  <div className="flex gap-2">
                    <input
                      value={extraContactPhone}
                      onChange={(e) => setExtraContactPhone(formatTrPhone(e.target.value))}
                      inputMode="tel"
                      placeholder="5xx xxx xx xx"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => { setShowExtraContact(false); setExtraContactPhone(''); }}
                      className="shrink-0 px-3 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-300 border border-slate-700"
                      title="Kaldır"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </Field>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowExtraContact(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-600/60 text-slate-300 hover:text-white text-[10px] font-bold uppercase tracking-wide transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Üçüncü numara ekle
                </button>
              )}
            </div>
          </Section>

          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 text-[11px] text-slate-400">
            Veli dijital imzası kayıt sonrası gönderilen başvuru linkinde alınır; antrenör bu formda imza atmaz.
          </div>

          {/* Sticky bottom bar — kompakt */}
          <div className="sticky bottom-4 z-40 max-w-3xl mx-auto px-2 w-full">
            <div className="bg-[#1e293b]/95 backdrop-blur-xl rounded-xl px-4 py-2.5 border border-slate-700/50 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                {!isValid ? (
                  <>
                    <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400">
                      <AlertCircle className="w-4 h-4" strokeWidth={2.5} />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-amber-400 uppercase">Eksik alanlar</div>
                      <div className="text-[9px] text-slate-500">{Object.keys(errors).length} alan</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                      <Save className="w-4 h-4" strokeWidth={2.5} />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-emerald-400 uppercase">Hazır</div>
                      <div className="text-[9px] text-slate-500">Kayıt edilebilir</div>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold text-[10px] uppercase tracking-wider transition-all">
                  Geri
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!isValid || isSaving}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-3.5 h-3.5" />
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {savedStudent ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-700/60 bg-[#1e293b] shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-700/60 bg-gradient-to-r from-emerald-600/20 to-indigo-600/20">
              <h3 className="text-lg font-black text-white">Öğrenci kaydedildi</h3>
              <p className="text-sm text-slate-400 mt-1">{savedStudent.name}</p>
              {ratingsSyncNote ? (
                <p className="text-xs text-indigo-300 mt-2">{ratingsSyncNote}</p>
              ) : null}
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-300">
                Öğrenci kaydı oluşturuldu. Veli imzası için link hazırlandı.
                {whatsAppSent
                  ? ' Veliye WhatsApp ile otomatik gönderildi.'
                  : ' Veli telefonu bulunamadı; linki aşağıdan manuel paylaşabilirsiniz.'}
                {' '}Veli imzaladıktan sonra form öğrenci listesinde &quot;İmzalı&quot; görünür.
              </p>
              {parentFormUrl ? (
                <div className="rounded-xl border border-slate-600/60 bg-black/30 p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Veli form linki</p>
                  <code className="block text-[11px] text-slate-300 break-all font-mono">{parentFormUrl}</code>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(parentFormUrl).then(() => {
                          setLinkCopied(true);
                          setTimeout(() => setLinkCopied(false), 2000);
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold"
                    >
                      {linkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      Kopyala
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const phone =
                          savedStudent.fatherPhone ||
                          savedStudent.motherPhone ||
                          savedStudent.parentPhone ||
                          '';
                        const msg = `Merhaba,\n\n${savedStudent.name} için kulüp kayıt formunu onaylamanız ve dijital imzanızı eklemeniz gerekmektedir.\n\nForm linki:\n${parentFormUrl}\n\nTeşekkürler.`;
                        openWhatsAppSend(phone, msg);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      WhatsApp ile tekrar gönder
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-amber-400">Form linki oluşturulamadı; öğrenci listesinden formu görüntüleyebilirsiniz.</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setSavedStudent(null);
                  setParentFormUrl('');
                  setRatingsSyncNote('');
                  setWhatsAppSent(false);
                  onSaved?.();
                }}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default StudentAdd;
