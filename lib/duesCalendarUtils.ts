import type { DisciplineBranch, Student, TrainingGroup } from '../types';
import {
  getExpectedDueForMonth,
  getExpectedDuesForYear,
  isMonthBeforeRegistration,
  isMonthDuesWaived,
} from './trainingGroupUtils';

export const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
] as const;

function monthLabelTr(month: number): string {
  return MONTHS_TR[month - 1] ?? String(month);
}

export function formatPaidMonthsSummary(monthPayments: Record<number, number>): string {
  const paid = Object.entries(monthPayments)
    .filter(([, amount]) => amount > 0)
    .map(([m]) => Number(m))
    .sort((a, b) => a - b);
  if (paid.length === 0) return 'Henüz ödeme yok';

  const ranges: string[] = [];
  let start = paid[0];
  let end = paid[0];
  for (let i = 1; i < paid.length; i++) {
    if (paid[i] === end + 1) {
      end = paid[i];
    } else {
      ranges.push(start === end ? monthLabelTr(start) : `${monthLabelTr(start)}-${monthLabelTr(end)}`);
      start = end = paid[i];
    }
  }
  ranges.push(start === end ? monthLabelTr(start) : `${monthLabelTr(start)}-${monthLabelTr(end)}`);
  return `${ranges.join(', ')} ödendi`;
}

export type DuesMonthCell = {
  monthLabel: string;
  state: string;
  tone: string;
  stateColor: string;
  amountLabel: string;
  paidLabel: string | null;
  remainingLabel: string | null;
  inactive: boolean;
};

export function getDuesMonthCell(
  student: Student,
  calendarYear: number,
  monthNum: number,
  paid: number,
  trainingGroups: TrainingGroup[],
  disciplineBranches: DisciplineBranch[],
): DuesMonthCell {
  const beforeRegistration = isMonthBeforeRegistration(student, calendarYear, monthNum);
  const waivedMonth = isMonthDuesWaived(student, calendarYear, monthNum, trainingGroups, disciplineBranches);
  const inactiveMonth = beforeRegistration || waivedMonth;
  const dueInfo = getExpectedDueForMonth(student, calendarYear, monthNum, trainingGroups, disciplineBranches);
  const expected = inactiveMonth ? 0 : (student.registrationType === 'package' ? 0 : dueInfo.expected);
  const nowMonth = new Date().getMonth() + 1;
  const nowYear = new Date().getFullYear();
  const isFuture = calendarYear > nowYear || (calendarYear === nowYear && monthNum > nowMonth);

  const state =
    beforeRegistration
      ? 'Kayıt öncesi'
      : waivedMonth
        ? 'Muaf'
        : student.registrationType === 'package'
          ? (paid > 0 ? 'Ödendi' : 'Paket')
          : dueInfo.isScholarship
            ? 'Burslu'
            : isFuture && paid <= 0
              ? 'Bekliyor'
              : paid >= expected && expected > 0
                ? 'Ödendi'
                : paid > 0
                  ? 'Kısmi'
                  : 'Ödenmedi';

  const tone =
    inactiveMonth
      ? 'bg-slate-900/50 border-slate-700/40 opacity-60'
      : student.registrationType === 'package'
        ? paid > 0
          ? 'bg-emerald-500/30 border-emerald-400/55 shadow-sm shadow-emerald-500/15'
          : 'bg-slate-800/70 border-slate-600/70'
        : dueInfo.isScholarship
          ? 'bg-emerald-500/20 border-emerald-400/40'
          : isFuture && paid <= 0
            ? 'bg-slate-800/70 border-slate-600/70'
            : paid >= expected && expected > 0
              ? 'bg-emerald-500/30 border-emerald-400/55 shadow-sm shadow-emerald-500/15'
              : paid > 0
                ? 'bg-amber-500/30 border-amber-400/55 shadow-sm shadow-amber-500/15'
                : 'bg-rose-500/30 border-rose-400/55 shadow-sm shadow-rose-500/15';

  const stateColor =
    state === 'Kayıt öncesi' || state === 'Muaf' ? 'text-slate-500'
      : state === 'Ödendi' ? 'text-emerald-200'
        : state === 'Burslu' ? 'text-emerald-300'
          : state === 'Kısmi' ? 'text-amber-200'
            : state === 'Ödenmedi' ? 'text-rose-200'
              : state === 'Bekliyor' ? 'text-slate-400'
                : state === 'Paket' ? 'text-indigo-300' : 'text-slate-400';

  let amountLabel = '—';
  if (!inactiveMonth) {
    if (student.registrationType !== 'package' && dueInfo.isScholarship) {
      amountLabel = 'Burslu';
    } else if (student.registrationType === 'package') {
      amountLabel = paid > 0 ? `₺${Number(paid).toLocaleString('tr-TR')}` : '—';
    } else {
      amountLabel = `₺${Number(expected).toLocaleString('tr-TR')}`;
    }
  }

  const paidLabel =
    paid > 0 && student.registrationType !== 'package'
      ? `Tahsil: ₺${Number(paid).toLocaleString('tr-TR')}`
      : null;

  const remainingLabel =
    !inactiveMonth
    && student.registrationType !== 'package'
    && !dueInfo.isScholarship
    && expected > 0
    && paid < expected
    && !isFuture
      ? `Kalan: ₺${Number(expected - paid).toLocaleString('tr-TR')}`
      : null;

  return {
    monthLabel: MONTHS_TR[monthNum - 1] ?? String(monthNum),
    state,
    tone,
    stateColor,
    amountLabel,
    paidLabel,
    remainingLabel,
    inactive: inactiveMonth,
  };
}

export function computeDuesFinanceSummary(
  student: Student,
  calendarYear: number,
  duesByMonth: Record<number, number>,
  trainingGroups: TrainingGroup[],
  disciplineBranches: DisciplineBranch[],
) {
  const totalPaidThisYear = Object.values(duesByMonth).reduce((a, b) => a + b, 0);
  const expectedThisYear =
    student.registrationType === 'package'
      ? 0
      : getExpectedDuesForYear(student, calendarYear, trainingGroups, disciplineBranches);

  const currentMonth = new Date().getMonth() + 1;
  let activeDuesDebt = 0;
  let unpaidMonths = 0;
  let paidMonths = 0;
  let waitingMonths = 0;

  if (student.registrationType !== 'package' && !student.isScholarshipStudent) {
    for (let m = 1; m <= 12; m++) {
      const paidForMonth = duesByMonth[m] ?? 0;
      const cell = getDuesMonthCell(student, calendarYear, m, paidForMonth, trainingGroups, disciplineBranches);
      if (cell.state === 'Ödendi' || cell.state === 'Burslu') paidMonths += 1;
      else if (cell.state === 'Ödenmedi' || cell.state === 'Kısmi') unpaidMonths += 1;
      else if (cell.state === 'Bekliyor') waitingMonths += 1;

      if (m > currentMonth) continue;
      if (isMonthBeforeRegistration(student, calendarYear, m)) continue;
      const dueInfo = getExpectedDueForMonth(student, calendarYear, m, trainingGroups, disciplineBranches);
      if (paidForMonth < dueInfo.expected) {
        activeDuesDebt += dueInfo.expected - paidForMonth;
      }
    }
  }

  const duesDebt = expectedThisYear > 0 ? Math.max(0, expectedThisYear - totalPaidThisYear) : 0;

  return {
    totalPaidThisYear,
    expectedThisYear,
    duesDebt,
    activeDuesDebt,
    paidMonthsSummary: formatPaidMonthsSummary(duesByMonth),
    paidMonths,
    unpaidMonths,
    waitingMonths,
  };
}
