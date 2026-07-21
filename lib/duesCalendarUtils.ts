import type { DisciplineBranch, Student, TrainingGroup, Transaction } from '../types';
import {
  getExpectedDueForMonth,
  getExpectedDuesForYear,
  isMonthBeforeRegistration,
  isMonthDuesWaived,
} from './trainingGroupUtils';
import { filterDuesTransactions } from './transactionUtils';

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
  const studentPassive = student.status === 'inactive';
  const dueInfo = getExpectedDueForMonth(student, calendarYear, monthNum, trainingGroups, disciplineBranches);
  const nowMonth = new Date().getMonth() + 1;
  const nowYear = new Date().getFullYear();
  const isFuture = calendarYear > nowYear || (calendarYear === nowYear && monthNum > nowMonth);

  // Pasif öğrencide ödenmemiş aylar donar (borç / bekleyen tahakkuk yok)
  const frozenUnpaid =
    studentPassive
    && !beforeRegistration
    && student.registrationType !== 'package'
    && !dueInfo.isScholarship
    && !waivedMonth
    && paid < dueInfo.expected;

  const inactiveMonth = beforeRegistration || waivedMonth || frozenUnpaid;
  const expected = inactiveMonth && !frozenUnpaid
    ? 0
    : (student.registrationType === 'package' ? 0 : dueInfo.expected);

  const state =
    beforeRegistration
      ? 'Kayıt öncesi'
      : waivedMonth
        ? 'Muaf'
        : frozenUnpaid
          ? 'Dondu'
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
    beforeRegistration || waivedMonth
      ? 'bg-slate-900/50 border-slate-700/40 opacity-60'
      : frozenUnpaid
        ? 'bg-slate-800/60 border-slate-500/50 opacity-80'
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
    state === 'Kayıt öncesi' || state === 'Muaf' || state === 'Dondu' ? 'text-slate-500'
      : state === 'Ödendi' ? 'text-emerald-200'
        : state === 'Burslu' ? 'text-emerald-300'
          : state === 'Kısmi' ? 'text-amber-200'
            : state === 'Ödenmedi' ? 'text-rose-200'
              : state === 'Bekliyor' ? 'text-slate-400'
                : state === 'Paket' ? 'text-indigo-300' : 'text-slate-400';

  let amountLabel = '—';
  if (frozenUnpaid) {
    amountLabel = `₺${Number(dueInfo.expected).toLocaleString('tr-TR')}`;
  } else if (!inactiveMonth) {
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
      : frozenUnpaid
        ? 'Pasif — donduruldu'
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

      if (student.status === 'inactive') continue;
      if (m > currentMonth) continue;
      if (isMonthBeforeRegistration(student, calendarYear, m)) continue;
      const dueInfo = getExpectedDueForMonth(student, calendarYear, m, trainingGroups, disciplineBranches);
      if (paidForMonth < dueInfo.expected) {
        activeDuesDebt += dueInfo.expected - paidForMonth;
      }
    }
  }

  const duesDebt =
    student.status === 'inactive'
      ? 0
      : expectedThisYear > 0
        ? Math.max(0, expectedThisYear - totalPaidThisYear)
        : 0;

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

/** Belirli yıl için öğrenci aidat tahsilatlarını aya göre toplar (Aidat kategorisi). */
export function duesPaidByMonthForYear(
  transactions: Transaction[],
  studentId: string,
  calendarYear: number,
): Record<number, number> {
  const yearStr = String(calendarYear);
  const map: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) map[m] = 0;
  filterDuesTransactions(transactions, studentId).forEach((t) => {
    const d = t.date || '';
    if (d.slice(0, 4) !== yearStr) return;
    const monthNum = parseInt(d.slice(5, 7), 10);
    if (monthNum >= 1 && monthNum <= 12) {
      map[monthNum] = (map[monthNum] || 0) + (t.amount || 0);
    }
  });
  return map;
}

export type ClubMonthDuesSummary = {
  /** Bu ay aidatı tam ödenen (+ burslu) aktif öğrenci */
  paid: number;
  /** Bu ay borçlu veya kısmi ödemiş aktif öğrenci */
  unpaid: number;
  /** Kısmi ödeme yapanlar (unpaid içinde de sayılır) */
  partial: number;
  /** Paket / kayıt öncesi / muaf / gelecek ay — aylık aidat sayılmayan */
  excluded: number;
  /** Bu ay aidat tahsilatı (₺) */
  collectedDues: number;
  /** Bu ay beklenen aidat (₺) — aidatı olan öğrenciler */
  expectedDues: number;
};

/**
 * Kulüp dashboard "Ödedi / Ödemedi" sayıları.
 * Öğrenci.paymentStatus güncel olmayabildiği için gerçek aidat işlemleri +
 * beklenen ücret üzerinden (aidat takvimiyle aynı mantık) hesaplanır.
 */
export function summarizeClubMonthDues(
  students: Student[],
  transactions: Transaction[],
  trainingGroups: TrainingGroup[],
  disciplineBranches: DisciplineBranch[],
  ref = new Date(),
): ClubMonthDuesSummary {
  const year = ref.getFullYear();
  const month = ref.getMonth() + 1;

  let paid = 0;
  let unpaid = 0;
  let partial = 0;
  let excluded = 0;
  let collectedDues = 0;
  let expectedDues = 0;

  for (const student of students) {
    if (student.status === 'inactive') continue;

    const paidAmt = duesPaidByMonthForYear(transactions, student.id, year)[month] ?? 0;
    const cell = getDuesMonthCell(
      student,
      year,
      month,
      paidAmt,
      trainingGroups,
      disciplineBranches,
    );

    if (cell.inactive || cell.state === 'Paket' || cell.state === 'Bekliyor') {
      excluded += 1;
      continue;
    }

    const dueInfo = getExpectedDueForMonth(student, year, month, trainingGroups, disciplineBranches);
    if (cell.state === 'Burslu') {
      paid += 1;
      continue;
    }
    if (cell.state === 'Ödendi') {
      paid += 1;
      collectedDues += paidAmt;
      expectedDues += dueInfo.expected;
      continue;
    }
    if (cell.state === 'Kısmi') {
      partial += 1;
      unpaid += 1;
      collectedDues += paidAmt;
      expectedDues += dueInfo.expected;
      continue;
    }
    // Ödenmedi
    unpaid += 1;
    expectedDues += dueInfo.expected;
  }

  return { paid, unpaid, partial, excluded, collectedDues, expectedDues };
}
