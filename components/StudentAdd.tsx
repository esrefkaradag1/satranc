import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Building2,
  Calendar,
  CreditCard,
  GraduationCap,
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
import { triggerWhatsAppAuto, sendWhatsAppMessage } from '../services/whatsappClient';
import type { GroupLessonSlot, Student } from '../types';
import {
  applyGroupDefaultsToStudent,
  applySiblingDiscount,
  disciplineMatches,
  disciplineNamesForOffice,
  disciplineNamesForPackages,
  findLessonPackageByName,
  findTrainingGroupByName,
  formatLessonSchedule,
  lessonPackageNamesForSelection,
  mergeBranchOffices,
  trainingGroupNamesForSelection,
} from '../lib/trainingGroupUtils';
import { coachesForClub } from '../lib/orgScope';
import { isValidTrPhone, normalizeTrPhoneDigits } from '../lib/phoneUtils';
import { generateStudentPassword, suggestStudentUsername } from '../lib/studentCredentials';

/* ─── Constants ──────────────────────────────────────────────────────────── */
const PLACEHOLDER_OFFICE = 'Şube Seçiniz';
const PLACEHOLDER_DISCIPLINE = 'Branş Seçiniz';
const PLACEHOLDER_GROUP = 'Grup Seçiniz';
const PLACEHOLDER_PACKAGE = 'Paket Seçiniz';
const PLACEHOLDER_COACH = 'Antrenör Seçiniz';

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
  coachId: string;
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

const inputCls =
  'w-full px-3 py-2 rounded-lg text-sm font-semibold outline-none transition-all duration-200 bg-slate-900/50 border border-white/[0.08] text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500/40';

const selectCls = `${inputCls} appearance-none cursor-pointer`;

type SectionAccent = 'indigo' | 'violet' | 'sky' | 'rose' | 'amber' | 'emerald';

const sectionAccentStyles: Record<SectionAccent, { icon: string; glow: string }> = {
  indigo: { icon: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', glow: 'from-indigo-500/10' },
  violet: { icon: 'bg-violet-500/20 text-violet-400 border-violet-500/30', glow: 'from-violet-500/10' },
  sky: { icon: 'bg-sky-500/20 text-sky-400 border-sky-500/30', glow: 'from-sky-500/10' },
  rose: { icon: 'bg-rose-500/20 text-rose-400 border-rose-500/30', glow: 'from-rose-500/10' },
  amber: { icon: 'bg-amber-500/20 text-amber-400 border-amber-500/30', glow: 'from-amber-500/10' },
  emerald: { icon: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', glow: 'from-emerald-500/10' },
};

const Field: React.FC<{
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, required, error, hint, className = '', children }) => (
  <div className={`space-y-1 ${className}`}>
    <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
      {label}
      {required && <span className="text-rose-400">*</span>}
    </label>
    {children}
    {error && (
      <p className="flex items-center gap-1 text-[11px] text-rose-400 font-semibold animate-in fade-in slide-in-from-left-1">
        <AlertCircle className="w-3 h-3 shrink-0" strokeWidth={2.5} /> {error}
      </p>
    )}
    {hint && !error && (
      <p className="text-[10px] text-slate-500 font-medium leading-snug">{hint}</p>
    )}
  </div>
);

const Section: React.FC<{
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  noGrid?: boolean;
  columns?: 2 | 3 | 4;
  accent?: SectionAccent;
}> = ({ title, subtitle, icon, children, noGrid, columns = 2, accent = 'indigo' }) => {
  const styles = sectionAccentStyles[accent];
  const gridCols =
    columns === 4
      ? 'md:grid-cols-2 xl:grid-cols-4'
      : columns === 3
        ? 'md:grid-cols-3'
        : 'md:grid-cols-2';
  return (
    <section className={`rounded-xl border border-white/[0.06] bg-slate-800/35 backdrop-blur-xl overflow-hidden bg-gradient-to-br ${styles.glow} to-transparent`}>
      <div className="px-3.5 sm:px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${styles.icon}`}>
          {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-4 h-4' })}
        </div>
        <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
          <h2 className="text-sm font-black text-white">{title}</h2>
          {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      <div
        className={
          noGrid
            ? 'p-3 sm:p-3.5'
            : `p-3 sm:p-3.5 grid grid-cols-1 ${gridCols} gap-x-3 gap-y-2.5`
        }
      >
        {children}
      </div>
    </section>
  );
};

/* ─── Kompakt fotoğraf ───────────────────────────────────────────────────── */
const CompactPhotoField: React.FC<{
  preview: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
  error?: string;
}> = ({ preview, onPick, onRemove, error }) => (
  <Field label="Fotoğraf" error={error}>
    <div className="flex items-center gap-3">
      {preview ? (
        <div className="relative">
          <img src={preview} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-600" />
          <button
            type="button"
            onClick={onRemove}
            className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-rose-500 text-white shadow"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center w-16 h-16 rounded-lg border border-dashed border-white/[0.14] cursor-pointer hover:border-indigo-500/40 bg-slate-900/40 transition-colors">
          <Upload className="w-4 h-4 text-slate-400" />
          <span className="text-[9px] text-slate-500 mt-0.5">Foto</span>
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

/* ─── Type Selector Card (yatay / kompakt) ───────────────────────────────── */
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
    className={`relative flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all duration-200 active:scale-[0.99] ${
      selected
        ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/20'
        : 'border-white/[0.06] bg-slate-900/35 hover:border-indigo-500/25 hover:bg-slate-900/50'
    }`}
  >
    <div
      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
        selected
          ? 'bg-indigo-500 text-white border-indigo-400/50'
          : 'bg-slate-800/80 text-slate-400 border-white/[0.06]'
      }`}
    >
      {React.cloneElement(icon as React.ReactElement<{ size?: number; strokeWidth?: number }>, { size: 16, strokeWidth: 2 })}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className={`font-bold text-sm tracking-tight ${selected ? 'text-white' : 'text-slate-300'}`}>
          {title}
        </h3>
        {badge && (
          <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
            selected ? 'bg-indigo-500/25 text-indigo-200' : 'bg-slate-800 text-slate-500'
          }`}>
            {badge}
          </span>
        )}
      </div>
      <p className={`text-[11px] font-medium mt-0.5 leading-snug truncate ${selected ? 'text-indigo-200/80' : 'text-slate-500'}`}>
        {subtitle}
      </p>
    </div>
    {selected ? (
      <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-white" />
      </div>
    ) : (
      <div className="w-4 h-4 rounded-full border-2 border-slate-600 bg-transparent shrink-0" />
    )}
  </button>
);

/* ─── Main Component ─────────────────────────────────────────────────────── */
const StudentAdd: React.FC<{
  onCancel?: () => void;
  onSaved?: () => void;
  defaultBranchOffice?: string;
  defaultCoachId?: string;
  lockBranchOffice?: boolean;
  lockCoachId?: boolean;
}> = ({
  onCancel,
  onSaved,
  defaultBranchOffice,
  defaultCoachId,
  lockBranchOffice = false,
  lockCoachId = false,
}) => {
  const {
    addStudent,
    updateStudent,
    branchOffices,
    students,
    scopedStudents,
    scopedTrainingGroups,
    scopedDisciplineBranches,
    scopedLessonPackages,
    scopedCoaches,
    auth,
    showToast,
  } = useApp();
  const tcUniquenessPool = auth?.role === 'admin' ? students : scopedStudents;
  const branchOfficeOptions = useMemo(() => {
    const base = mergeBranchOffices(branchOffices, scopedDisciplineBranches);
    const office = defaultBranchOffice?.trim();
    const merged = office && !base.includes(office) ? [office, ...base] : base;
    return [PLACEHOLDER_OFFICE, ...merged];
  }, [branchOffices, scopedDisciplineBranches, defaultBranchOffice]);

  const [lessonSchedule, setLessonSchedule] = useState<GroupLessonSlot[]>([]);

  const handleAddDemoStudent = async () => {
    const demoCount = students.filter((s) => s.name.startsWith('Demo Öğrenci')).length + 1;
    const name = demoCount === 1 ? 'Demo Öğrenci' : `Demo Öğrenci ${demoCount}`;
    const loginUsername = suggestStudentUsername(name, students.map((s) => s.username));
    const loginPassword = generateStudentPassword();
    const branch = branchOffices[0] || 'Merkez';
    const group = scopedTrainingGroups[0]?.name || 'A Grubu';
    const discipline = scopedDisciplineBranches[0]?.name || 'Satranç';
    const newStudent = await addStudent({
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
      username: loginUsername,
      password: loginPassword,
    });
    setSavedCredentials({ username: newStudent.username ?? loginUsername, password: newStudent.password ?? loginPassword });
    setSavedStudent(newStudent);
  };
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [extraContactPhone, setExtraContactPhone] = useState('');
  const [showExtraContact, setShowExtraContact] = useState(false);

  const [form, setForm] = useState<FormState>({
    branchOffice: defaultBranchOffice?.trim() || PLACEHOLDER_OFFICE,
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
    coachId: defaultCoachId?.trim() || PLACEHOLDER_COACH,
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
  });

  const disciplineOptions = useMemo(() => {
    const office = form.branchOffice !== PLACEHOLDER_OFFICE ? form.branchOffice : '';
    const currentBranch = form.branch !== PLACEHOLDER_DISCIPLINE ? form.branch : undefined;
    if (form.registrationType === 'package') {
      const names = disciplineNamesForPackages(scopedLessonPackages, office || undefined, currentBranch);
      return [PLACEHOLDER_DISCIPLINE, ...names];
    }
    const names = disciplineNamesForOffice(scopedDisciplineBranches, office || undefined);
    return [PLACEHOLDER_DISCIPLINE, ...names];
  }, [form.registrationType, form.branchOffice, form.branch, scopedDisciplineBranches, scopedLessonPackages]);

  const lessonPackageOptions = useMemo(() => {
    const office = form.branchOffice !== PLACEHOLDER_OFFICE ? form.branchOffice : '';
    const discipline = form.branch !== PLACEHOLDER_DISCIPLINE ? form.branch : '';
    return lessonPackageNamesForSelection(
      scopedLessonPackages,
      office,
      discipline,
      form.group !== PLACEHOLDER_PACKAGE ? form.group : undefined,
    );
  }, [form.branchOffice, form.branch, form.group, scopedLessonPackages]);

  const groupOptions = useMemo(() => {
    if (form.registrationType === 'package') return lessonPackageOptions;
    const office = form.branchOffice !== PLACEHOLDER_OFFICE ? form.branchOffice : '';
    const discipline = form.branch !== PLACEHOLDER_DISCIPLINE ? form.branch : '';
    return trainingGroupNamesForSelection(
      scopedTrainingGroups,
      office,
      discipline,
      form.group !== PLACEHOLDER_GROUP ? form.group : undefined,
    );
  }, [form.registrationType, form.branchOffice, form.branch, form.group, scopedTrainingGroups, lessonPackageOptions]);

  const groupPlaceholder =
    form.registrationType === 'package' ? PLACEHOLDER_PACKAGE : PLACEHOLDER_GROUP;

  useEffect(() => {
    if (form.group === groupPlaceholder) return;
    const tg = findTrainingGroupByName(scopedTrainingGroups, form.group);
    if (!tg) return;
    setForm((prev) => {
      if (prev.group !== form.group) return prev;
      let changed = false;
      const next = { ...prev };
      if (prev.branch === PLACEHOLDER_DISCIPLINE && tg.discipline) {
        next.branch = tg.discipline;
        changed = true;
      }
      if (prev.branchOffice === PLACEHOLDER_OFFICE && tg.branchOffice) {
        next.branchOffice = tg.branchOffice;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [form.group, groupPlaceholder, scopedTrainingGroups]);

  useEffect(() => {
    if (form.registrationType !== 'package') return;
    const office = form.branchOffice !== PLACEHOLDER_OFFICE ? form.branchOffice : '';
    if (!office) return;

    const packageDisciplines = disciplineNamesForPackages(scopedLessonPackages, office);
    setForm((prev) => {
      let next = { ...prev };
      let changed = false;

      if (
        prev.branch !== PLACEHOLDER_DISCIPLINE &&
        packageDisciplines.length > 0 &&
        !packageDisciplines.some((d) => disciplineMatches(d, prev.branch))
      ) {
        next.branch = PLACEHOLDER_DISCIPLINE;
        next.group = PLACEHOLDER_PACKAGE;
        changed = true;
      }

      if (next.branch === PLACEHOLDER_DISCIPLINE && packageDisciplines.length === 1) {
        next.branch = packageDisciplines[0];
        changed = true;
      }

      const discipline = next.branch !== PLACEHOLDER_DISCIPLINE ? next.branch : '';
      const packages = lessonPackageNamesForSelection(scopedLessonPackages, office, discipline);

      if (next.group === PLACEHOLDER_PACKAGE && packages.length === 1) {
        const pkg = findLessonPackageByName(scopedLessonPackages, packages[0], { branchOffice: office, discipline });
        next.group = packages[0];
        if (pkg) {
          if (pkg.discipline) next.branch = pkg.discipline;
          if (pkg.packageFee) next.monthlyFee = String(pkg.packageFee);
          if (pkg.coachIds?.length === 1) next.coachId = pkg.coachIds[0];
        }
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [form.registrationType, form.branchOffice, form.branch, form.group, scopedLessonPackages]);

  const coachOptions = useMemo(() => {
    const office = form.branchOffice !== PLACEHOLDER_OFFICE ? form.branchOffice : '';
    const list = office ? coachesForClub(scopedCoaches, office) : scopedCoaches;
    return [PLACEHOLDER_COACH, ...list.map((c) => ({ id: c.id, name: c.name }))];
  }, [scopedCoaches, form.branchOffice]);

  const handleGroupChange = (groupName: string) => {
    setForm((prev) => {
      const next = { ...prev, group: groupName };
      if (groupName === PLACEHOLDER_GROUP || groupName === PLACEHOLDER_PACKAGE) {
        setLessonSchedule([]);
        return next;
      }
      if (prev.registrationType === 'package') {
        const selectedPackage = findLessonPackageByName(scopedLessonPackages, groupName, {
          branchOffice: prev.branchOffice !== PLACEHOLDER_OFFICE ? prev.branchOffice : undefined,
          discipline: prev.branch !== PLACEHOLDER_DISCIPLINE ? prev.branch : undefined,
        });
        if (selectedPackage) {
          const autoCoach =
            selectedPackage.coachIds?.length === 1
              ? selectedPackage.coachIds[0]
              : prev.coachId !== PLACEHOLDER_COACH
                ? prev.coachId
                : PLACEHOLDER_COACH;
          setLessonSchedule([]);
          return {
            ...next,
            branch: selectedPackage.discipline || prev.branch,
            branchOffice: selectedPackage.branchOffice || prev.branchOffice,
            monthlyFee: selectedPackage.packageFee ? String(selectedPackage.packageFee) : prev.monthlyFee,
            coachId: autoCoach,
          };
        }
        setLessonSchedule([]);
        return next;
      }
      const tg = findTrainingGroupByName(scopedTrainingGroups, groupName, {
        branchOffice: prev.branchOffice !== PLACEHOLDER_OFFICE ? prev.branchOffice : undefined,
        discipline: prev.branch !== PLACEHOLDER_DISCIPLINE ? prev.branch : undefined,
      });
      if (tg) {
        const defaults = applyGroupDefaultsToStudent(tg, scopedDisciplineBranches);
        setLessonSchedule(defaults.lessonSchedule ?? []);
        const autoCoach =
          tg.coachIds?.length === 1
            ? tg.coachIds[0]
            : prev.coachId !== PLACEHOLDER_COACH
              ? prev.coachId
              : PLACEHOLDER_COACH;
        return {
          ...next,
          branch: defaults.branch || prev.branch,
          branchOffice: defaults.branchOffice || prev.branchOffice,
          monthlyFee: defaults.monthlyFee ? String(defaults.monthlyFee) : prev.monthlyFee,
          coachId: autoCoach,
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
    if (
      form.group === PLACEHOLDER_GROUP ||
      form.group === PLACEHOLDER_PACKAGE
    ) e.group = form.registrationType === 'package' ? 'Paket seçiniz.' : 'Grup seçiniz.';
    if (form.tcNo && onlyDigits(form.tcNo).length !== 11) e.tcNo = '11 haneli olmalıdır.';
    if (form.tcNo && tcUniquenessPool.some((s) => (s.tcNo ?? '') === onlyDigits(form.tcNo))) e.tcNo = 'Bu T.C. ile kayıtlı öğrenci var.';
    const fatherPhoneFilled = form.fatherPhone.trim().length > 0;
    const motherPhoneFilled = form.motherPhone.trim().length > 0;
    const fatherPhoneValid = isValidTrPhone(form.fatherPhone);
    const motherPhoneValid = isValidTrPhone(form.motherPhone);
    if (fatherPhoneFilled && !fatherPhoneValid) {
      e.fatherPhone = 'Geçerli cep telefonu girin (05XX veya 5XX).';
    }
    if (motherPhoneFilled && !motherPhoneValid) {
      e.motherPhone = 'Geçerli cep telefonu girin (05XX veya 5XX).';
    }
    if (!fatherPhoneValid && !motherPhoneValid && !fatherPhoneFilled && !motherPhoneFilled) {
      const parentPhoneMsg = 'Anne veya baba telefonundan en az biri zorunludur.';
      e.fatherPhone = parentPhoneMsg;
      e.motherPhone = parentPhoneMsg;
    }
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
  }, [form, students, tcUniquenessPool]);

  const isValid = Object.keys(errors).length === 0;

  const [isSaving, setIsSaving] = useState(false);
  const [savedStudent, setSavedStudent] = useState<Student | null>(null);
  const [parentFormUrl, setParentFormUrl] = useState('');
  const [ratingsSyncNote, setRatingsSyncNote] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [credsCopied, setCredsCopied] = useState(false);
  const [whatsAppSent, setWhatsAppSent] = useState(false);
  const [savedCredentials, setSavedCredentials] = useState<{ username: string; password: string } | null>(null);

  const generatedUsername = useMemo(
    () => suggestStudentUsername(form.name, students.map((s) => s.username)),
    [form.name, students],
  );

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

      const loginUsername = suggestStudentUsername(form.name.trim(), students.map((s) => s.username));
      const loginPassword = generateStudentPassword();

      const newStudent = await addStudent({
        name: form.name.trim(),
        level: 'Başlangıç',
        elo: 0,
        ukd: 0,
        lastAttendance: todayIso(),
        paymentStatus: 'Unpaid',
        group:
          form.group !== PLACEHOLDER_GROUP && form.group !== PLACEHOLDER_PACKAGE
            ? form.group
            : '',
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
        username: loginUsername,
        password: loginPassword,
        photoUrl: photoUrl,
        trainingGroupId: form.registrationType === 'monthly'
          ? findTrainingGroupByName(scopedTrainingGroups, form.group, {
              branchOffice: form.branchOffice !== PLACEHOLDER_OFFICE ? form.branchOffice : undefined,
              discipline: form.branch !== PLACEHOLDER_DISCIPLINE ? form.branch : undefined,
            })?.id
          : undefined,
        coachId: form.coachId !== PLACEHOLDER_COACH ? form.coachId : undefined,
        lessonSchedule: form.registrationType === 'monthly' && lessonSchedule.length ? lessonSchedule : undefined,
      });
      setSavedCredentials({
        username: newStudent.username ?? loginUsername,
        password: newStudent.password ?? loginPassword,
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
        if (phone) {
          const consentMsg = `Merhaba,\n\n${newStudent.name} için kulüp kayıt formunu onaylamanız ve dijital imzanızı eklemeniz gerekmektedir.\n\nForm linki:\n${signed.url}\n\nTeşekkürler.`;
          const consentCount = await triggerWhatsAppAuto('parent_consent', {
            student: newStudent,
            formUrl: signed.url,
            branchOffice: newStudent.branchOffice,
          });
          if (consentCount > 0) {
            setWhatsAppSent(true);
          } else {
            const r = await sendWhatsAppMessage({
              phone,
              message: consentMsg,
              studentId: newStudent.id,
              studentName: newStudent.name,
              branchOffice: newStudent.branchOffice,
              templateKey: 'parent_consent',
              openManualFallback: false,
            });
            setWhatsAppSent(r.ok && r.mode === 'api');
          }
        }
        void triggerWhatsAppAuto('parent_login', {
          student: { ...newStudent, username: newStudent.username ?? loginUsername, password: newStudent.password ?? loginPassword },
          branchOffice: newStudent.branchOffice,
        });
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
      <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-16">

        <div className="sticky top-0 z-40 -mx-1 sm:-mx-2 pt-1 px-1 sm:px-2 pb-1.5">
          <div className="rounded-xl border border-white/[0.08] bg-slate-900/92 backdrop-blur-xl px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-lg shadow-black/20">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30 text-indigo-400 shrink-0">
                <UserPlus className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white">Öğrenci Ekle</h1>
                <p className="text-[10px] text-slate-500 truncate">Zorunlu alanları doldurun</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 flex-wrap w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleAddDemoStudent}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-200 font-bold text-xs transition-all active:scale-95"
              >
                <Zap className="w-3.5 h-3.5" />
                Demo
              </button>
              <button type="button" onClick={onCancel} className="px-2.5 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 font-bold text-xs transition-all active:scale-95">
                İptal
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isValid || isSaving}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25"
              >
                {isSaving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Kaydet
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto space-y-3">

          <Section title="Kayıt türü" subtitle="Aidat veya paket" icon={<BookOpen />} accent="indigo" noGrid>
            <div className="flex flex-col sm:flex-row gap-2">
              <TypeCard
                selected={form.registrationType === 'monthly'}
                onClick={() => {
                  set('registrationType')('monthly');
                  set('group')(PLACEHOLDER_GROUP);
                  setLessonSchedule([]);
                }}
                icon={<Calendar />}
                title="Aylık Aidat"
                subtitle="Düzenli aylık ödeme"
                badge="Önerilen"
              />
              <TypeCard
                selected={form.registrationType === 'package'}
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    registrationType: 'package',
                    branch: PLACEHOLDER_DISCIPLINE,
                    group: PLACEHOLDER_PACKAGE,
                  }));
                  setLessonSchedule([]);
                }}
                icon={<GraduationCap />}
                title="Ders Paketi"
                subtitle="Belirli ders sayısı"
              />
            </div>
          </Section>

          <Section title="Şube bilgileri" subtitle="Şube · branş · grup · antrenör" icon={<Building2 />} accent="sky">
            <Field label="Şube" required error={errors.branchOffice}>
              <select
                value={form.branchOffice}
                onChange={(e) => {
                  const branchOffice = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    branchOffice,
                    branch: PLACEHOLDER_DISCIPLINE,
                    group: prev.registrationType === 'package' ? PLACEHOLDER_PACKAGE : PLACEHOLDER_GROUP,
                  }));
                  setLessonSchedule([]);
                }}
                className={selectCls}
                disabled={lockBranchOffice}
              >
                {branchOfficeOptions.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
              {lockBranchOffice && defaultBranchOffice ? (
                <p className="text-[10px] text-slate-500 mt-0.5">Yalnızca sizin kulübünüze kaydedilir.</p>
              ) : null}
            </Field>
            <Field label="Branş" required error={errors.branch}>
              <select
                value={form.branch}
                onChange={(e) => {
                  const branch = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    branch,
                    group: prev.registrationType === 'package' ? PLACEHOLDER_PACKAGE : PLACEHOLDER_GROUP,
                  }));
                  setLessonSchedule([]);
                }}
                className={selectCls}
              >
                {disciplineOptions.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
              {form.registrationType === 'package' &&
              form.branchOffice !== PLACEHOLDER_OFFICE &&
              disciplineOptions.filter((x) => x !== PLACEHOLDER_DISCIPLINE).length === 0 ? (
                <p className="text-[10px] text-amber-400/90 mt-0.5 font-medium">
                  Bu şubede ders paketi yok.
                </p>
              ) : null}
            </Field>
            <Field label={form.registrationType === 'package' ? 'Ders Paketi' : 'Grup'} required error={errors.group}>
              <select
                value={groupOptions.includes(form.group) ? form.group : groupPlaceholder}
                onChange={(e) => handleGroupChange(e.target.value)}
                className={selectCls}
              >
                <option value={groupPlaceholder}>{groupPlaceholder}</option>
                {groupOptions.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
              {form.registrationType === 'monthly' &&
              form.branch !== PLACEHOLDER_DISCIPLINE &&
              groupOptions.length === 0 ? (
                <p className="text-[10px] text-amber-400/90 mt-0.5 font-medium">
                  Bu branşta grup yok.
                </p>
              ) : null}
              {form.registrationType === 'package' &&
              form.branch !== PLACEHOLDER_DISCIPLINE &&
              groupOptions.length === 0 ? (
                <p className="text-[10px] text-amber-400/90 mt-0.5 font-medium">
                  Bu branşta ders paketi yok.
                </p>
              ) : null}
            </Field>
            <Field label="Antrenör">
              <select
                value={form.coachId}
                onChange={(e) => set('coachId')(e.target.value)}
                className={selectCls}
                disabled={lockCoachId}
              >
                {coachOptions.map((c) => (
                  <option key={typeof c === 'string' ? c : c.id} value={typeof c === 'string' ? c : c.id}>
                    {typeof c === 'string' ? c : c.name}
                  </option>
                ))}
              </select>
              {lockCoachId ? (
                <p className="text-[10px] text-slate-500 mt-0.5">Öğrenci size atanır.</p>
              ) : null}
            </Field>
            {lessonSchedule.length > 0 && (
              <Field label="Ders programı" className="md:col-span-2">
                <div className="px-3 py-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-100 text-xs font-medium">
                  {formatLessonSchedule(lessonSchedule)}
                </div>
              </Field>
            )}
          </Section>

          <Section title="Öğrenci bilgileri" subtitle="Kimlik · platform · okul · sağlık" icon={<User />} accent="violet">
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
            <Field label="Ad Soyad" required error={errors.name}>
              <input
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                placeholder="Öğrenci adı ve soyadı"
                className={inputCls}
              />
            </Field>
            <Field label="T.C. Kimlik No" error={errors.tcNo} hint={form.tcNo.length === 11 ? 'Kayıtta UKD otomatik sorgulanır' : 'UKD / FIDE için'}>
              <input
                value={form.tcNo}
                onChange={(e) => set('tcNo')(onlyDigits(e.target.value).slice(0, 11))}
                inputMode="numeric"
                placeholder="11 haneli"
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
            <Field label="Kullanıcı adı" hint="Otomatik">
              <div className={`${inputCls} text-slate-300 font-mono text-sm`}>
                {form.name.trim() ? generatedUsername : '—'}
              </div>
            </Field>
            <Field label="Giriş şifresi" hint="Kayıtta üretilir">
              <div className={`${inputCls} text-slate-500 text-sm italic`}>
                Otomatik
              </div>
            </Field>
            <Field label="Lichess">
              <input
                value={form.lichessUsername}
                onChange={(e) => set('lichessUsername')(e.target.value)}
                placeholder="Kullanıcı adı"
                className={inputCls}
              />
            </Field>
            <Field label="Chess.com">
              <input
                value={form.chessComUsername}
                onChange={(e) => set('chessComUsername')(e.target.value)}
                placeholder="Kullanıcı adı"
                className={inputCls}
              />
            </Field>
            <Field label="Okul">
              <input
                value={form.school}
                onChange={(e) => set('school')(e.target.value)}
                placeholder="Okul adı"
                className={inputCls}
              />
            </Field>
            <Field label="Öğretmen">
              <input
                value={form.teacher}
                onChange={(e) => set('teacher')(e.target.value)}
                placeholder="Öğretmen adı"
                className={inputCls}
              />
            </Field>
            <Field label="Açıklama">
              <textarea
                value={form.notes}
                onChange={(e) => set('notes')(e.target.value)}
                rows={2}
                placeholder="Ek notlar..."
                className={inputCls + ' resize-y min-h-[3rem]'}
              />
            </Field>
            <Field label="Sağlık" hint="Alerji, kronik hastalık vb.">
              <textarea
                value={form.healthInfo}
                onChange={(e) => set('healthInfo')(e.target.value)}
                rows={2}
                placeholder="Opsiyonel"
                className={inputCls + ' resize-y min-h-[3rem]'}
              />
            </Field>
          </Section>

          {form.registrationType === 'monthly' ? (
            <Section title="Aidat bilgileri" subtitle="Ücret · hatırlatma · indirim" icon={<CreditCard />} accent="amber">
              <Field label="Aidat ücreti (₺)" required={!form.isScholarshipStudent} error={errors.monthlyFee}>
                {form.isScholarshipStudent ? (
                  <div className={inputCls + ' flex items-center justify-center font-black text-emerald-400 bg-emerald-500/10 border-emerald-500/30'}>
                    Burslu
                  </div>
                ) : (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-black text-sm">₺</span>
                    <input
                      value={form.monthlyFee}
                      onChange={(e) => set('monthlyFee')(e.target.value.replace(/[^\d.]/g, ''))}
                      inputMode="decimal"
                      placeholder="0.00"
                      className={inputCls + ' pl-8'}
                    />
                  </div>
                )}
              </Field>
              <Field label="Hatırlatma günü" required>
                <select
                  value={form.paymentReminderDay}
                  onChange={(e) => set('paymentReminderDay')(e.target.value)}
                  className={selectCls}
                >
                  {REMINDER_DAY_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Gecikmiş hatırlatma" required>
                <select
                  value={form.latePaymentReminderDay}
                  onChange={(e) => set('latePaymentReminderDay')(e.target.value)}
                  className={selectCls}
                >
                  {REMINDER_DAY_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Seçenekler">
                <div className="flex flex-col gap-2 pt-0.5">
                  <label className="flex items-center gap-2.5 cursor-pointer w-fit">
                    <div
                      onClick={() => {
                        const next = !form.isScholarshipStudent;
                        setForm((prev) => ({
                          ...prev,
                          isScholarshipStudent: next,
                          hasSiblingDiscount: next ? false : prev.hasSiblingDiscount,
                        }));
                      }}
                      className={`w-10 h-5 rounded-full transition-all relative ${form.isScholarshipStudent ? 'bg-emerald-500' : 'bg-slate-700'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${form.isScholarshipStudent ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                    <span className="text-xs text-slate-300">Burslu öğrenci</span>
                  </label>
                  <label className={`flex items-center gap-2.5 w-fit ${form.isScholarshipStudent ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <div
                      onClick={() => {
                        if (form.isScholarshipStudent) return;
                        set('hasSiblingDiscount')(!form.hasSiblingDiscount);
                      }}
                      className={`w-10 h-5 rounded-full transition-all relative ${form.hasSiblingDiscount ? 'bg-indigo-500' : 'bg-slate-700'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${form.hasSiblingDiscount ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                    <span className="text-xs text-slate-300">Kardeş indirimi</span>
                  </label>
                </div>
              </Field>
              {form.hasSiblingDiscount && !form.isScholarshipStudent ? (
                <>
                  <Field label="İndirim türü">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => set('siblingDiscountType')('percent')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${form.siblingDiscountType === 'percent' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                      >
                        % İndirim
                      </button>
                      <button
                        type="button"
                        onClick={() => set('siblingDiscountType')('amount')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${form.siblingDiscountType === 'amount' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                      >
                        Tutar (₺)
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
                  {form.monthlyFee ? (
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
            </Section>
          ) : null}

          <Section title="Veli bilgileri" subtitle="En az bir telefon zorunlu" icon={<Users />} columns={3} accent="violet">
            <Field label="Baba ad soyad">
              <input
                value={form.fatherName}
                onChange={(e) => set('fatherName')(e.target.value)}
                placeholder="Adı ve soyadı"
                className={inputCls}
              />
            </Field>
            <Field label="Baba telefon" required error={errors.fatherPhone}>
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
            <Field label="Anne telefon" required error={errors.motherPhone}>
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

          <Section title="İletişim" subtitle="Adres · WhatsApp" icon={<Phone />} accent="emerald">
            <Field label="Adres" className="md:col-span-2">
              <textarea
                value={form.address}
                onChange={(e) => set('address')(e.target.value)}
                rows={2}
                placeholder="Ev adresi..."
                className={inputCls + ' resize-y min-h-[3rem]'}
              />
            </Field>
            <div className="md:col-span-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <MessageCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Kayıt sonrası veli form linki WhatsApp ile otomatik gönderilir. İmza bu formda değil, gönderilen linkte alınır.
                </p>
              </div>
              {showExtraContact ? (
                <Field label="Ek numara (isteğe bağlı)" hint="Bakıcı vb.">
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
                      className="shrink-0 px-2.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-300 border border-slate-700"
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-slate-600/60 text-slate-300 hover:text-white text-[10px] font-bold uppercase tracking-wide transition-all"
                >
                  <Plus className="w-3 h-3" /> Üçüncü numara
                </button>
              )}
            </div>
          </Section>

          <div className="sticky bottom-3 z-40 max-w-5xl mx-auto px-1 sm:px-2 w-full">
            <div className="rounded-xl border border-white/[0.08] bg-slate-900/95 backdrop-blur-xl px-3 py-2.5 flex items-center justify-between gap-3 shadow-xl shadow-black/25">
              <div className="flex items-center gap-2">
                {!isValid ? (
                  <>
                    <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400">
                      <AlertCircle className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-amber-400 uppercase">Eksik alanlar</div>
                      <div className="text-[9px] text-slate-500">{Object.keys(errors).length} alan</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                      <Save className="w-3.5 h-3.5" strokeWidth={2.5} />
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
              {savedCredentials ? (
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 space-y-2">
                  <p className="text-[10px] font-bold text-indigo-300 uppercase">Öğrenci giriş bilgileri</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Kullanıcı adı</span>
                      <p className="font-mono text-white mt-0.5">{savedCredentials.username}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Şifre</span>
                      <p className="font-mono text-white mt-0.5">{savedCredentials.password}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const text = `Kullanıcı adı: ${savedCredentials.username}\nŞifre: ${savedCredentials.password}`;
                      void navigator.clipboard?.writeText(text).then(() => {
                        setCredsCopied(true);
                        setTimeout(() => setCredsCopied(false), 2000);
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs font-bold"
                  >
                    {credsCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    Giriş bilgilerini kopyala
                  </button>
                  <p className="text-[10px] text-slate-500">Bu bilgileri öğrenci/veli ile paylaşın; şifre yalnızca burada gösterilir.</p>
                </div>
              ) : null}
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
                        void (async () => {
                          const phone =
                            savedStudent.fatherPhone ||
                            savedStudent.motherPhone ||
                            savedStudent.parentPhone ||
                            '';
                          if (!phone) return;
                          const msg = `Merhaba,\n\n${savedStudent.name} için kulüp kayıt formunu onaylamanız ve dijital imzanızı eklemeniz gerekmektedir.\n\nForm linki:\n${parentFormUrl}\n\nTeşekkürler.`;
                          const r = await sendWhatsAppMessage({
                            phone,
                            message: msg,
                            studentId: savedStudent.id,
                            studentName: savedStudent.name,
                            branchOffice: savedStudent.branchOffice,
                            templateKey: 'parent_consent',
                            openManualFallback: false,
                          });
                          if (r.ok && r.mode === 'api') {
                            showToast('Veli formu WhatsApp ile gönderildi.', 'success');
                          } else {
                            showToast(r.error || 'Gönderilemedi. API Ayarları → otomatik gönderim açık ve cihaz bağlı olmalı.', 'error');
                          }
                        })();
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
                  setSavedCredentials(null);
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
