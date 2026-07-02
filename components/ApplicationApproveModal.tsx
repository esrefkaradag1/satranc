import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, CreditCard, Loader2, UserPlus, X } from 'lucide-react';
import { useApp } from '../AppContext';
import type { StudentApplication } from '../lib/applicationTypes';
import { DEFAULT_REMINDER_DAY, REMINDER_DAY_OPTIONS } from '../lib/reminderDays';
import {
  applyGroupDefaultsToStudent,
  applySiblingDiscount,
  disciplineNamesForOffice,
  findTrainingGroupByName,
  formatLessonSchedule,
  mergeBranchOffices,
} from '../lib/trainingGroupUtils';
import { coachesForClub } from '../lib/orgScope';
import type { GroupLessonSlot } from '../types';

const PLACEHOLDER_OFFICE = 'Şube Seçiniz';
const PLACEHOLDER_DISCIPLINE = 'Branş Seçiniz';
const PLACEHOLDER_GROUP = 'Grup Seçiniz';
const PLACEHOLDER_COACH = 'Antrenör Seçiniz';

const inputCls =
  'w-full px-4 py-2.5 rounded-lg text-[13px] font-bold outline-none transition-all duration-200 bg-slate-900/60 border border-slate-700/60 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50';
const selectCls = `${inputCls} appearance-none cursor-pointer`;

export type ApplicationApproveFormData = {
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
  <div className={`space-y-1.5 ${className}`}>
    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
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
}> = ({ title, icon, children, columns = 2 }) => (
  <section className="rounded-2xl border border-slate-700/50 bg-[#1e293b]/90 overflow-hidden shadow-sm">
    <div className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white">
      {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-4 h-4 shrink-0' })}
      <h2 className="text-sm font-black uppercase tracking-wide">{title}</h2>
    </div>
    <div className={`p-5 grid grid-cols-1 ${columns === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
      {children}
    </div>
  </section>
);

function buildInitialForm(app: StudentApplication, defaultOffice?: string): FormState {
  const office = defaultOffice?.trim() || app.branchOffice?.trim() || PLACEHOLDER_OFFICE;
  return {
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
  const { branchOffices, scopedTrainingGroups, scopedDisciplineBranches, scopedCoaches, auth } = useApp();
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
    const names = disciplineNamesForOffice(scopedDisciplineBranches, office || undefined);
    return [PLACEHOLDER_DISCIPLINE, ...names];
  }, [scopedDisciplineBranches, form.branchOffice]);

  const groupOptions = useMemo(() => {
    const office = form.branchOffice !== PLACEHOLDER_OFFICE ? form.branchOffice : '';
    const discipline = form.branch !== PLACEHOLDER_DISCIPLINE ? form.branch : '';
    const filtered = scopedTrainingGroups
      .filter((g) => (!office || g.branchOffice === office) && (!discipline || g.discipline === discipline))
      .map((g) => g.name);
    return [PLACEHOLDER_GROUP, ...filtered];
  }, [form.branchOffice, form.branch, scopedTrainingGroups]);

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
      if (prev.group !== PLACEHOLDER_GROUP && !groupOptions.includes(prev.group)) {
        next.group = app.group?.trim() && groupOptions.includes(app.group) ? app.group : PLACEHOLDER_GROUP;
      } else if (prev.group === PLACEHOLDER_GROUP && app.group && groupOptions.includes(app.group)) {
        next.group = app.group;
      }
      const disciplines = disciplineOptions.filter((x) => x !== PLACEHOLDER_DISCIPLINE);
      if (next.branch === PLACEHOLDER_DISCIPLINE && disciplines.length === 1) {
        next.branch = disciplines[0];
      }
      return next;
    });
  }, [app, clubName, branchOfficeOptions, groupOptions, disciplineOptions]);

  useEffect(() => {
    if (!app || form.group === PLACEHOLDER_GROUP) return;
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
  }, [app, form.group, form.branchOffice, form.branch, scopedTrainingGroups, scopedDisciplineBranches, auth?.coachId, auth?.role]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (form.branchOffice === PLACEHOLDER_OFFICE) e.branchOffice = 'Şube seçiniz.';
    if (form.branch === PLACEHOLDER_DISCIPLINE) e.branch = 'Branş seçiniz.';
    if (form.group === PLACEHOLDER_GROUP) e.group = 'Grup seçiniz.';
    if (!form.isScholarshipStudent && !form.monthlyFee.trim()) {
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
  }, [form]);

  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const handleGroupChange = (groupName: string) => {
    setForm((prev) => ({ ...prev, group: groupName }));
    if (groupName === PLACEHOLDER_GROUP) setLessonSchedule([]);
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || !app) return;

    const tg = findTrainingGroupByName(scopedTrainingGroups, form.group, {
      branchOffice: form.branchOffice !== PLACEHOLDER_OFFICE ? form.branchOffice : undefined,
      discipline: form.branch !== PLACEHOLDER_DISCIPLINE ? form.branch : undefined,
    });

    await onConfirm({
      branchOffice: form.branchOffice,
      branch: form.branch,
      group: form.group,
      coachId: form.coachId !== PLACEHOLDER_COACH ? form.coachId : undefined,
      trainingGroupId: tg?.id,
      lessonSchedule: lessonSchedule.length ? lessonSchedule : undefined,
      monthlyFee: form.isScholarshipStudent ? undefined : Number(form.monthlyFee),
      paymentReminderDay: form.paymentReminderDay,
      latePaymentReminderDay: form.latePaymentReminderDay,
      isScholarshipStudent: form.isScholarshipStudent,
      hasSiblingDiscount: form.hasSiblingDiscount && !form.isScholarshipStudent,
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
    });
  };

  if (!app) return null;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#0f172a] border border-slate-600/80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-700/80 bg-[#0f172a]">
          <div>
            <h2 className="text-lg font-black text-white">Başvuruyu Onayla</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {app.name} · <span className="font-mono text-indigo-400">{app.applicationNo}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-5">
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3 text-sm text-slate-300">
            <span className="text-slate-500">TC:</span> {app.tcNo}
            {app.birthDate ? (
              <>
                {' '}
                · <span className="text-slate-500">Doğum:</span> {app.birthDate}
              </>
            ) : null}
          </div>

          <Section title="Şube Bilgileri" icon={<Building2 />}>
            <Field label="Şube" required error={submitted ? errors.branchOffice : undefined}>
              <select
                value={form.branchOffice}
                onChange={(e) => set('branchOffice')(e.target.value)}
                className={selectCls}
                disabled={lockBranchOffice}
              >
                {branchOfficeOptions.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              {lockBranchOffice && clubName ? (
                <p className="text-[10px] text-slate-500 mt-1">Öğrenci yalnızca bu kulübe kaydedilir.</p>
              ) : null}
            </Field>
            <Field label="Branş" required error={submitted ? errors.branch : undefined}>
              <select value={form.branch} onChange={(e) => set('branch')(e.target.value)} className={selectCls}>
                {disciplineOptions.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Grup" required error={submitted ? errors.group : undefined} className="md:col-span-2">
              <select value={form.group} onChange={(e) => handleGroupChange(e.target.value)} className={selectCls}>
                {groupOptions.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
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
            {lessonSchedule.length > 0 ? (
              <Field label="Ders programı (gruptan)" className="md:col-span-2">
                <div className="px-4 py-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-sm font-medium">
                  {formatLessonSchedule(lessonSchedule)}
                </div>
              </Field>
            ) : null}
          </Section>

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
