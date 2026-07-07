import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, Building2, Calendar, CreditCard, GraduationCap, Loader2, UserPlus, X } from 'lucide-react';
import { useApp } from '../AppContext';
import type { StudentApplication } from '../lib/applicationTypes';
import { DEFAULT_REMINDER_DAY, REMINDER_DAY_OPTIONS } from '../lib/reminderDays';
import {
  applyGroupDefaultsToStudent,
  applySiblingDiscount,
  disciplineNamesForOffice,
  disciplineNamesForPackages,
  disciplineMatches,
  findLessonPackageByName,
  findTrainingGroupByName,
  formatLessonSchedule,
  lessonPackageNamesForSelection,
  mergeBranchOffices,
  trainingGroupNamesForSelection,
} from '../lib/trainingGroupUtils';
import { coachesForClub } from '../lib/orgScope';
import type { GroupLessonSlot } from '../types';

const PLACEHOLDER_OFFICE = 'Şube Seçiniz';
const PLACEHOLDER_DISCIPLINE = 'Branş Seçiniz';
const PLACEHOLDER_GROUP = 'Grup Seçiniz';
const PLACEHOLDER_PACKAGE = 'Paket Seçiniz';
const PLACEHOLDER_COACH = 'Antrenör Seçiniz';

type RegistrationType = 'monthly' | 'package';

const inputCls =
  'w-full px-3.5 py-2 rounded-lg text-[12px] font-bold outline-none transition-all duration-200 bg-slate-900/60 border border-slate-700/60 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50';
const selectCls = `${inputCls} appearance-none cursor-pointer`;

export type ApplicationApproveFormData = {
  registrationType: RegistrationType;
  branchOffice: string;
  branch: string;
  group: string;
  coachId?: string;
  trainingGroupId?: string;
  lessonSchedule?: GroupLessonSlot[];
  monthlyFee?: number;
  paymentReminderDay: string;
  latePaymentReminderDay: string;
  isScholarshipStudent: boolean;
  hasSiblingDiscount: boolean;
  siblingDiscountType?: 'percent' | 'amount';
  siblingDiscountPercent?: number;
  siblingDiscountAmount?: number;
};

type FormState = {
  registrationType: RegistrationType;
  branchOffice: string;
  branch: string;
  group: string;
  coachId: string;
  monthlyFee: string;
  paymentReminderDay: string;
  latePaymentReminderDay: string;
  isScholarshipStudent: boolean;
  hasSiblingDiscount: boolean;
  siblingDiscountType: 'percent' | 'amount';
  siblingDiscountPercent: string;
  siblingDiscountAmount: string;
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
    <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
      {label}
      {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
    {error && (
      <p className="flex items-center gap-1.5 text-[10px] text-rose-500 font-bold">
        <AlertCircle className="w-3 h-3" strokeWidth={2.5} /> {error}
      </p>
    )}
    {hint && !error && <p className="text-[10px] text-slate-500 font-medium">{hint}</p>}
  </div>
);

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  columns?: 2 | 3;
  noGrid?: boolean;
}> = ({ title, icon, children, columns = 2, noGrid = false }) => (
  <section className="rounded-xl border border-slate-700/50 bg-[#1e293b]/90 overflow-hidden shadow-sm">
    <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white">
      {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-4 h-4 shrink-0' })}
      <h2 className="text-xs font-black uppercase tracking-wide">{title}</h2>
    </div>
    <div className={noGrid ? 'p-4' : `p-4 grid grid-cols-1 ${columns === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-3`}>
      {children}
    </div>
  </section>
);

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
    className={`relative flex-1 flex flex-col items-start gap-2.5 p-4 rounded-xl border text-left transition-all duration-200 active:scale-[0.99] group ${
      selected
        ? 'border-indigo-500 bg-indigo-500/10 shadow-md shadow-indigo-500/10'
        : 'border-slate-700/80 bg-slate-800/40 hover:border-indigo-500/30'
    }`}
  >
    <div className="flex justify-between items-start w-full">
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
          selected ? 'bg-indigo-500 text-white' : 'bg-slate-700/80 text-slate-400'
        }`}
      >
        {React.cloneElement(icon as React.ReactElement<{ size?: number; strokeWidth?: number }>, { size: 18, strokeWidth: 2 })}
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
      <h3 className={`font-bold text-[13px] tracking-tight ${selected ? 'text-white' : 'text-slate-300'}`}>
        {title}
      </h3>
      <p className={`text-[11px] font-medium mt-0.5 ${selected ? 'text-indigo-300/90' : 'text-slate-500'}`}>
        {subtitle}
      </p>
      {badge ? (
        <span className={`inline-flex mt-2 px-2 py-0.5 rounded text-[9px] font-bold uppercase ${selected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-500'}`}>
          {badge}
        </span>
      ) : null}
    </div>
  </button>
);

function buildInitialForm(app: StudentApplication, defaultOffice?: string): FormState {
  const office = defaultOffice?.trim() || app.branchOffice?.trim() || PLACEHOLDER_OFFICE;
  return {
    registrationType: 'monthly',
    branchOffice: office,
    branch: PLACEHOLDER_DISCIPLINE,
    group: app.group?.trim() || PLACEHOLDER_GROUP,
    coachId: PLACEHOLDER_COACH,
    monthlyFee: '',
    paymentReminderDay: DEFAULT_REMINDER_DAY,
    latePaymentReminderDay: DEFAULT_REMINDER_DAY,
    isScholarshipStudent: false,
    hasSiblingDiscount: false,
    siblingDiscountType: 'percent',
    siblingDiscountPercent: '10',
    siblingDiscountAmount: '500',
  };
}

type Props = {
  app: StudentApplication | null;
  clubName?: string;
  lockBranchOffice?: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (data: ApplicationApproveFormData) => void | Promise<void>;
};

const ApplicationApproveModal: React.FC<Props> = ({
  app,
  clubName,
  lockBranchOffice = false,
  loading = false,
  onClose,
  onConfirm,
}) => {
  const { branchOffices, scopedTrainingGroups, scopedDisciplineBranches, scopedLessonPackages, scopedCoaches, auth } = useApp();
  const [form, setForm] = useState<FormState>(() =>
    app ? buildInitialForm(app, clubName) : buildInitialForm({} as StudentApplication, clubName),
  );
  const [lessonSchedule, setLessonSchedule] = useState<GroupLessonSlot[]>([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!app) return;
    setForm(buildInitialForm(app, clubName));
    setLessonSchedule([]);
    setSubmitted(false);
  }, [app, clubName]);

  const branchOfficeOptions = useMemo(() => {
    const base = mergeBranchOffices(branchOffices, scopedDisciplineBranches);
    const office = clubName?.trim() || app?.branchOffice?.trim();
    const merged = office && !base.includes(office) ? [office, ...base] : base;
    return [PLACEHOLDER_OFFICE, ...merged];
  }, [branchOffices, scopedDisciplineBranches, clubName, app?.branchOffice]);

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

  const coachOptions = useMemo(() => {
    const office = form.branchOffice !== PLACEHOLDER_OFFICE ? form.branchOffice : '';
    const list = office ? coachesForClub(scopedCoaches, office) : scopedCoaches;
    return [PLACEHOLDER_COACH, ...list.map((c) => ({ id: c.id, name: c.name }))];
  }, [scopedCoaches, form.branchOffice]);

  useEffect(() => {
    if (!app) return;
    setForm((prev) => {
      let next = { ...prev };
      if (clubName && branchOfficeOptions.includes(clubName)) {
        next.branchOffice = clubName;
      }
      const placeholder = prev.registrationType === 'package' ? PLACEHOLDER_PACKAGE : PLACEHOLDER_GROUP;
      if (prev.group !== placeholder && !groupOptions.includes(prev.group)) {
        const tg = findTrainingGroupByName(scopedTrainingGroups, prev.group);
        if (tg) {
          if (next.branch === PLACEHOLDER_DISCIPLINE && tg.discipline) next.branch = tg.discipline;
          if (next.branchOffice === PLACEHOLDER_OFFICE && tg.branchOffice) next.branchOffice = tg.branchOffice;
        } else {
          next.group =
            app.group?.trim() && groupOptions.includes(app.group) ? app.group : placeholder;
        }
      } else if (prev.group === placeholder && app.group && groupOptions.includes(app.group)) {
        next.group = app.group;
      }
      const disciplines = disciplineOptions.filter((x) => x !== PLACEHOLDER_DISCIPLINE);
      if (next.branch === PLACEHOLDER_DISCIPLINE && disciplines.length === 1) {
        next.branch = disciplines[0];
      }
      if (prev.registrationType === 'package' && next.branch !== PLACEHOLDER_DISCIPLINE) {
        const office = next.branchOffice !== PLACEHOLDER_OFFICE ? next.branchOffice : '';
        const packages = lessonPackageNamesForSelection(
          scopedLessonPackages,
          office,
          next.branch,
        );
        if (next.group === PLACEHOLDER_PACKAGE && packages.length === 1) {
          next.group = packages[0];
        }
      }
      return next;
    });
  }, [app, clubName, branchOfficeOptions, groupOptions, disciplineOptions, scopedTrainingGroups, scopedLessonPackages, form.registrationType]);

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

  useEffect(() => {
    const placeholder = form.registrationType === 'package' ? PLACEHOLDER_PACKAGE : PLACEHOLDER_GROUP;
    if (!app || form.group === placeholder) return;
    if (form.registrationType === 'package') {
      const selectedPackage = findLessonPackageByName(scopedLessonPackages, form.group, {
        branchOffice: form.branchOffice !== PLACEHOLDER_OFFICE ? form.branchOffice : undefined,
        discipline: form.branch !== PLACEHOLDER_DISCIPLINE ? form.branch : undefined,
      });
      if (!selectedPackage) return;
      setLessonSchedule([]);
      setForm((prev) => ({
        ...prev,
        branch: selectedPackage.discipline || prev.branch,
        branchOffice: selectedPackage.branchOffice || prev.branchOffice,
        coachId:
          selectedPackage.coachIds?.length === 1
            ? selectedPackage.coachIds[0]
            : prev.coachId !== PLACEHOLDER_COACH
              ? prev.coachId
              : auth?.role === 'coach' && auth.coachId
                ? auth.coachId
                : PLACEHOLDER_COACH,
      }));
      return;
    }
    const tg = findTrainingGroupByName(scopedTrainingGroups, form.group, {
      branchOffice: form.branchOffice !== PLACEHOLDER_OFFICE ? form.branchOffice : undefined,
      discipline: form.branch !== PLACEHOLDER_DISCIPLINE ? form.branch : undefined,
    });
    if (!tg) return;
    const defaults = applyGroupDefaultsToStudent(tg, scopedDisciplineBranches);
    setLessonSchedule(defaults.lessonSchedule ?? []);
    setForm((prev) => ({
      ...prev,
      branch: defaults.branch || prev.branch,
      branchOffice: defaults.branchOffice || prev.branchOffice,
      monthlyFee: defaults.monthlyFee ? String(defaults.monthlyFee) : prev.monthlyFee,
      coachId:
        tg.coachIds?.length === 1
          ? tg.coachIds[0]
          : prev.coachId !== PLACEHOLDER_COACH
            ? prev.coachId
            : auth?.role === 'coach' && auth.coachId
              ? auth.coachId
              : PLACEHOLDER_COACH,
    }));
  }, [app, form.registrationType, form.group, form.branchOffice, form.branch, scopedLessonPackages, scopedTrainingGroups, scopedDisciplineBranches, auth?.coachId, auth?.role]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (form.branchOffice === PLACEHOLDER_OFFICE) e.branchOffice = 'Şube seçiniz.';
    if (form.branch === PLACEHOLDER_DISCIPLINE) e.branch = 'Branş seçiniz.';
    if (form.group === PLACEHOLDER_GROUP || form.group === PLACEHOLDER_PACKAGE) {
      e.group = form.registrationType === 'package' ? 'Paket seçiniz.' : 'Grup seçiniz.';
    }
    if (form.registrationType === 'monthly' && !form.isScholarshipStudent && !form.monthlyFee.trim()) {
      e.monthlyFee = 'Aylık aidat zorunludur.';
    }
    if (form.registrationType === 'monthly' && form.hasSiblingDiscount && !form.isScholarshipStudent) {
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
  }, [form]);

  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

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
                : auth?.role === 'coach' && auth.coachId
                  ? auth.coachId
                  : PLACEHOLDER_COACH;
          setLessonSchedule([]);
          return {
            ...next,
            branch: selectedPackage.discipline || prev.branch,
            branchOffice: selectedPackage.branchOffice || prev.branchOffice,
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
        return {
          ...next,
          branch: defaults.branch || prev.branch,
          branchOffice: defaults.branchOffice || prev.branchOffice,
          monthlyFee: defaults.monthlyFee ? String(defaults.monthlyFee) : prev.monthlyFee,
          coachId:
            tg.coachIds?.length === 1
              ? tg.coachIds[0]
              : prev.coachId !== PLACEHOLDER_COACH
                ? prev.coachId
                : auth?.role === 'coach' && auth.coachId
                  ? auth.coachId
                  : PLACEHOLDER_COACH,
        };
      }
      setLessonSchedule([]);
      return next;
    });
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || !app) return;

    const tg = form.registrationType === 'monthly'
      ? findTrainingGroupByName(scopedTrainingGroups, form.group, {
          branchOffice: form.branchOffice !== PLACEHOLDER_OFFICE ? form.branchOffice : undefined,
          discipline: form.branch !== PLACEHOLDER_DISCIPLINE ? form.branch : undefined,
        })
      : undefined;

    await onConfirm({
      registrationType: form.registrationType,
      branchOffice: form.branchOffice,
      branch: form.branch,
      group: form.group,
      coachId: form.coachId !== PLACEHOLDER_COACH ? form.coachId : undefined,
      trainingGroupId: form.registrationType === 'monthly' ? tg?.id : undefined,
      lessonSchedule: form.registrationType === 'monthly' && lessonSchedule.length ? lessonSchedule : undefined,
      monthlyFee: form.registrationType === 'monthly' && !form.isScholarshipStudent ? Number(form.monthlyFee) : undefined,
      paymentReminderDay: form.paymentReminderDay,
      latePaymentReminderDay: form.latePaymentReminderDay,
      isScholarshipStudent: form.registrationType === 'monthly' ? form.isScholarshipStudent : false,
      hasSiblingDiscount: form.registrationType === 'monthly' && form.hasSiblingDiscount && !form.isScholarshipStudent,
      siblingDiscountType:
        form.registrationType === 'monthly' && form.hasSiblingDiscount && !form.isScholarshipStudent ? form.siblingDiscountType : undefined,
      siblingDiscountPercent:
        form.registrationType === 'monthly' && form.hasSiblingDiscount && !form.isScholarshipStudent && form.siblingDiscountType === 'percent'
          ? Number(form.siblingDiscountPercent || 0)
          : undefined,
      siblingDiscountAmount:
        form.registrationType === 'monthly' && form.hasSiblingDiscount && !form.isScholarshipStudent && form.siblingDiscountType === 'amount'
          ? Number(form.siblingDiscountAmount || 0)
          : undefined,
    });
  };

  if (!app) return null;

  return (
    <div
      className="modal-overlay z-[55] !items-start pt-16 sm:pt-24"
      onClick={onClose}
    >
      <div
        className="modal-panel max-w-[720px] max-h-[calc(100dvh-5rem)] sm:max-h-[calc(100dvh-7rem)] rounded-t-2xl sm:rounded-2xl bg-[#0f172a] border border-slate-600/80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-slate-700/80 bg-[#0f172a]">
          <div>
            <h2 className="text-base font-black text-white">Başvuruyu Onayla</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {app.name} · <span className="font-mono text-indigo-400">{app.applicationNo}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="modal-scroll-body p-4 space-y-4">
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 px-3.5 py-2.5 text-xs text-slate-300">
            <span className="text-slate-500">TC:</span> {app.tcNo}
            {app.birthDate ? (
              <>
                {' '}
                · <span className="text-slate-500">Doğum:</span> {app.birthDate}
              </>
            ) : null}
          </div>

          <Section title="Kayıt Türü" icon={<BookOpen />} noGrid>
            <div className="flex flex-col sm:flex-row gap-3">
              <TypeCard
                selected={form.registrationType === 'monthly'}
                onClick={() => {
                  set('registrationType')('monthly');
                  set('group')(PLACEHOLDER_GROUP);
                  setLessonSchedule([]);
                }}
                icon={<Calendar />}
                title="Aylık Aidat"
                subtitle="Düzenli aylık ödeme sistemi"
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
                subtitle="Belirli sayıda ders için ödeme"
              />
            </div>
          </Section>

          <Section title="Şube Bilgileri" icon={<Building2 />}>
            <Field label="Şube" required error={submitted ? errors.branchOffice : undefined}>
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
              {lockBranchOffice && clubName ? (
                <p className="text-[10px] text-slate-500 mt-1">Öğrenci yalnızca bu kulübe kaydedilir.</p>
              ) : null}
            </Field>
            <Field label="Branş" required error={submitted ? errors.branch : undefined}>
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
                <p className="text-[10px] text-amber-400/90 mt-1 font-medium">
                  Bu şubede tanımlı ders paketi yok. Branş & Grup bölümünden özel ders paketi ekleyin.
                </p>
              ) : null}
            </Field>
            <Field label={form.registrationType === 'package' ? 'Ders Paketi' : 'Grup'} required error={submitted ? errors.group : undefined} className="md:col-span-2">
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
                <p className="text-[10px] text-amber-400/90 mt-1 font-medium">
                  Bu branşta tanımlı grup yok. Branş & Grup bölümünden eğitim grubu ekleyin.
                </p>
              ) : null}
              {form.registrationType === 'package' &&
              form.branch !== PLACEHOLDER_DISCIPLINE &&
              groupOptions.length === 0 ? (
                <p className="text-[10px] text-amber-400/90 mt-1 font-medium">
                  Bu branşta tanımlı ders paketi yok.
                </p>
              ) : null}
            </Field>
            <Field label="Antrenör" className="md:col-span-2">
              <select value={form.coachId} onChange={(e) => set('coachId')(e.target.value)} className={selectCls}>
                {coachOptions.map((c) => (
                  <option key={typeof c === 'string' ? c : c.id} value={typeof c === 'string' ? c : c.id}>
                    {typeof c === 'string' ? c : c.name}
                  </option>
                ))}
              </select>
            </Field>
            {form.registrationType === 'monthly' && lessonSchedule.length > 0 ? (
              <Field label="Ders programı (gruptan)" className="md:col-span-2">
                <div className="px-4 py-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-sm font-medium">
                  {formatLessonSchedule(lessonSchedule)}
                </div>
              </Field>
            ) : null}
          </Section>

          {form.registrationType === 'monthly' ? (
          <Section title="Aidat Bilgileri" icon={<CreditCard />} columns={3}>
            <Field
              label="Aidat ücreti (₺)"
              required={!form.isScholarshipStudent}
              error={submitted ? errors.monthlyFee : undefined}
            >
              {form.isScholarshipStudent ? (
                <div
                  className={`${inputCls} flex items-center justify-center font-black text-emerald-400 bg-emerald-500/10 border-emerald-500/30`}
                >
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
                    className={`${inputCls} pl-9`}
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
                {REMINDER_DAY_OPTIONS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Gecikmiş hatırlatma günü" required>
              <select
                value={form.latePaymentReminderDay}
                onChange={(e) => set('latePaymentReminderDay')(e.target.value)}
                className={selectCls}
              >
                {REMINDER_DAY_OPTIONS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Burslu öğrenci" className="md:col-span-3">
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
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.isScholarshipStudent ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </div>
                <span className="text-sm text-slate-300">Burs kapsamında kayıt — aidat tahsil edilmez</span>
              </label>
            </Field>
            <Field label="Kardeş indirimi" className="md:col-span-3">
              <label
                className={`flex items-center gap-3 w-fit ${form.isScholarshipStudent ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div
                  onClick={() => {
                    if (form.isScholarshipStudent) return;
                    set('hasSiblingDiscount')(!form.hasSiblingDiscount);
                  }}
                  className={`w-11 h-6 rounded-full transition-all relative ${form.hasSiblingDiscount ? 'bg-indigo-500' : 'bg-slate-700'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.hasSiblingDiscount ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </div>
                <span className="text-sm text-slate-300">Kardeş indirimi uygula</span>
              </label>
            </Field>
            {form.hasSiblingDiscount && !form.isScholarshipStudent ? (
              <>
                <Field label="İndirim türü" className="md:col-span-3">
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
                  <Field label="Kardeş indirimi (%)" required error={submitted ? errors.siblingDiscountPercent : undefined}>
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={form.siblingDiscountPercent}
                        onChange={(e) => set('siblingDiscountPercent')(e.target.value.replace(/[^\d]/g, ''))}
                        className={`${inputCls} pr-8`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">%</span>
                    </div>
                  </Field>
                ) : (
                  <Field label="Kardeş indirimi (₺)" required error={submitted ? errors.siblingDiscountAmount : undefined}>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-sm">₺</span>
                      <input
                        type="number"
                        min={1}
                        value={form.siblingDiscountAmount}
                        onChange={(e) => set('siblingDiscountAmount')(e.target.value.replace(/[^\d]/g, ''))}
                        className={`${inputCls} pl-9`}
                      />
                    </div>
                  </Field>
                )}
                {form.monthlyFee ? (
                  <Field label="İndirimli aidat (önizleme)" className="md:col-span-2">
                    <div className={`${inputCls} flex items-center justify-between`}>
                      <span className="text-slate-400 text-xs line-through">
                        ₺{Number(form.monthlyFee || 0).toLocaleString('tr-TR')}
                      </span>
                      <span className="text-emerald-400 font-black">
                        ₺
                        {applySiblingDiscount(Number(form.monthlyFee || 0), {
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

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 font-bold text-sm hover:bg-slate-800 disabled:opacity-50"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Onayla ve öğrenci ekle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ApplicationApproveModal;
