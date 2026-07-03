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
