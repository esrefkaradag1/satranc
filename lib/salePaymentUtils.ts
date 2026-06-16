import type { Transaction } from '../types';

export type SalePaymentStatus = 'neutral' | 'complete' | 'partial';

export function getSalePaymentInfo(t: Transaction): {
  status: SalePaymentStatus;
  received: number;
  total: number | null;
  remaining: number;
} {
  const received = Number(t.amount) || 0;
  const total = t.totalAmount != null && t.totalAmount > 0 ? Number(t.totalAmount) : null;
  if (total == null) {
    return { status: 'neutral', received, total: null, remaining: 0 };
  }
  if (received >= total) {
    return { status: 'complete', received, total, remaining: 0 };
  }
  return { status: 'partial', received, total, remaining: total - received };
}

export function isPackageSaleCategory(category: string): boolean {
  return category === 'Paket' || category === 'Özel Ders';
}
