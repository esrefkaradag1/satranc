import type { Transaction } from '../types';
import { isPackageSaleCategory } from './salePaymentUtils';

/** Aidat takvimine / borç hesabına dahil gelir işlemi (Paket & Özel Ders hariç) */
export function isDuesPaymentTransaction(t: Transaction): boolean {
  if (t.type !== 'income') return false;
  if (isPackageSaleCategory(t.category)) return false;
  const cat = (t.category || '').trim().toLowerCase();
  return cat.includes('aidat');
}

export function filterDuesTransactions(
  transactions: Transaction[],
  studentId?: string,
): Transaction[] {
  return transactions.filter((t) => {
    if (studentId != null && String(t.studentId) !== String(studentId)) return false;
    return isDuesPaymentTransaction(t);
  });
}

export function isPersonalCashTransaction(t: Pick<Transaction, 'personalCash'>): boolean {
  return !!t.personalCash;
}

/** Genel kasa (toplam gelir/gider/bakiye) kartlarına dahil mi? */
export function countsTowardGeneralCash(t: Pick<Transaction, 'personalCash' | 'includeInGeneralCash'>): boolean {
  if (!t.personalCash) return true;
  return !!t.includeInGeneralCash;
}
