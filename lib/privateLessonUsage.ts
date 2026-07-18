import type { AttendanceRecord, Transaction } from '../types';
import { attendanceRecordsShareSession } from './attendanceSession';

export type PrivateLessonSaleRef = Pick<
  Transaction,
  | 'id'
  | 'date'
  | 'studentId'
  | 'lessonCount'
  | 'startingUsedLessons'
  | 'lessonPackageId'
  | 'lessonPackageName'
  | 'lessonDiscipline'
  | 'lessonBranchOffice'
>;

function buildPrivateLessonSessionRecord(transaction: Pick<Transaction, 'lessonPackageId' | 'lessonPackageName' | 'lessonDiscipline' | 'lessonBranchOffice'>) {
  return {
    lessonId: String(transaction.lessonPackageId ?? '').trim() || undefined,
    attendanceType: 'lesson' as const,
    groupName: String(transaction.lessonPackageName ?? '').trim() || undefined,
    branch: String(transaction.lessonDiscipline ?? '').trim() || undefined,
    branchOffice: String(transaction.lessonBranchOffice ?? '').trim() || undefined,
  };
}

function norm(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
}

export function samePrivateLessonPackageIdentity(
  a: Pick<Transaction, 'lessonPackageId' | 'lessonPackageName' | 'lessonDiscipline' | 'lessonBranchOffice'>,
  b: Pick<Transaction, 'lessonPackageId' | 'lessonPackageName' | 'lessonDiscipline' | 'lessonBranchOffice'>,
): boolean {
  const aId = String(a.lessonPackageId ?? '').trim();
  const bId = String(b.lessonPackageId ?? '').trim();
  if (aId && bId) return aId === bId;
  return (
    norm(a.lessonPackageName) === norm(b.lessonPackageName)
    && norm(a.lessonDiscipline) === norm(b.lessonDiscipline)
    && norm(a.lessonBranchOffice) === norm(b.lessonBranchOffice)
    && !!norm(a.lessonPackageName)
  );
}

/** Aynı pakete ait satışlar arasında yoklamayı en güncel satışa bağlar. */
export function resolveAttendanceOwnerSaleId(
  record: AttendanceRecord,
  sale: PrivateLessonSaleRef,
  allSalesNewestFirst: PrivateLessonSaleRef[],
): string | null {
  const studentId = String(sale.studentId ?? '').trim();
  if (!studentId || record.studentId !== studentId) return null;
  if (record.status !== 'present' && record.status !== 'late') return null;

  const recordDate = String(record.date ?? '').slice(0, 10);
  if (!recordDate) return null;

  const sessionRecord = buildPrivateLessonSessionRecord(sale);
  const lessonPackageId = String(sale.lessonPackageId ?? '').trim();
  const matchesPackage =
    (lessonPackageId && String(record.lessonId ?? '').trim() === lessonPackageId)
    || attendanceRecordsShareSession(record, sessionRecord);
  if (!matchesPackage) return null;

  const candidates = allSalesNewestFirst
    .filter((candidate) => String(candidate.studentId ?? '').trim() === studentId)
    .filter((candidate) => samePrivateLessonPackageIdentity(candidate, sale))
    .filter((candidate) => String(candidate.date ?? '').slice(0, 10) <= recordDate);

  if (candidates.length === 0) return null;
  // Newest-first list: first match is the active owner for that attendance day.
  return String(candidates[0]?.id ?? '') || null;
}

export type PrivateLessonBalance = {
  totalLessons: number;
  usedLessons: number;
  remainingLessons: number;
  attendanceUsedLessons: number;
  startingUsedLessons: number;
  /** Önceki paketten devreden kalan (gösterim / satış için). */
  carriedInLessons?: number;
  /** Kalan ders sonraki pakete aktarıldı. */
  transferredOut?: boolean;
};

export function computePrivateLessonBalance(
  sale: PrivateLessonSaleRef,
  attendanceRecords: AttendanceRecord[],
  options?: {
    studentId?: string;
    fallbackTotalLessons?: number;
    pendingTodayStatus?: 'Present' | 'Late' | 'Absent' | 'Excused' | null;
    todayIso?: string;
    /** Öğrencinin özel ders satışları (yeniden eskiye). Verilirse yoklama satış aralığına bağlanır. */
    allSalesNewestFirst?: PrivateLessonSaleRef[];
    /** Önceki paketten eklenen kalan ders. */
    carriedInLessons?: number;
  },
): PrivateLessonBalance | null {
  const studentId = String(options?.studentId ?? sale.studentId ?? '').trim();
  if (!studentId) return null;
  const baseTotal = sale.lessonCount ?? options?.fallbackTotalLessons;
  if (baseTotal == null || baseTotal <= 0) return null;

  const carriedInLessons = Math.max(0, Math.round(Number(options?.carriedInLessons ?? 0) || 0));
  const totalLessons = baseTotal + carriedInLessons;

  let attendanceUsedLessons = countPrivateLessonAttendanceUsage(
    sale,
    attendanceRecords,
    studentId,
    options?.allSalesNewestFirst,
  );
  const todayIso = options?.todayIso?.slice(0, 10);
  const pending = options?.pendingTodayStatus ?? null;
  if (todayIso && pending) {
    const sessionRecord = buildPrivateLessonSessionRecord(sale);
    const existingToday = attendanceRecords.find(
      (record) =>
        record.studentId === studentId &&
        attendanceRecordsShareSession(record, sessionRecord) &&
        String(record.date ?? '').slice(0, 10) === todayIso,
    );
    const savedTodayUsed =
      existingToday && (existingToday.status === 'present' || existingToday.status === 'late') ? 1 : 0;
    const pendingTodayUsed =
      pending === 'Present' || pending === 'Late'
        ? 1
        : pending === 'Absent' || pending === 'Excused'
          ? 0
          : savedTodayUsed;

    // Pending today only applies if this sale owns today's attendance.
    const ownsToday =
      !options?.allSalesNewestFirst
      || resolveAttendanceOwnerSaleId(
        {
          id: 'pending-today',
          studentId,
          date: todayIso,
          status: 'present',
          lessonId: sessionRecord.lessonId,
          attendanceType: 'lesson',
          groupName: sessionRecord.groupName,
          branch: sessionRecord.branch,
          branchOffice: sessionRecord.branchOffice,
        } as AttendanceRecord,
        { ...sale, studentId },
        options.allSalesNewestFirst,
      ) === String(sale.id);

    if (ownsToday) {
      attendanceUsedLessons = attendanceUsedLessons - savedTodayUsed + pendingTodayUsed;
    }
  }

  const rawStartingUsed = Number(sale.startingUsedLessons ?? 0);
  const startingUsedLessons = Number.isFinite(rawStartingUsed)
    ? Math.max(0, Math.min(rawStartingUsed, totalLessons))
    : 0;
  const usedLessons = attendanceUsedLessons + startingUsedLessons;
  return {
    totalLessons,
    usedLessons,
    remainingLessons: Math.max(0, totalLessons - usedLessons),
    attendanceUsedLessons,
    startingUsedLessons,
    carriedInLessons,
  };
}

export function countPrivateLessonAttendanceUsage(
  transaction: PrivateLessonSaleRef,
  attendanceRecords: AttendanceRecord[],
  studentIdOverride?: string,
  allSalesNewestFirst?: PrivateLessonSaleRef[],
): number {
  const studentId = String(studentIdOverride ?? transaction.studentId ?? '').trim();
  if (!studentId) return 0;
  const lessonPackageId = String(transaction.lessonPackageId ?? '').trim();
  const sessionRecord = buildPrivateLessonSessionRecord(transaction);
  const saleWithStudent = { ...transaction, studentId };

  return attendanceRecords.filter((record) => {
    if (record.studentId !== studentId) return false;
    if (record.status !== 'present' && record.status !== 'late') return false;

    const matchesPackage =
      (lessonPackageId && String(record.lessonId ?? '').trim() === lessonPackageId)
      || attendanceRecordsShareSession(record, sessionRecord);
    if (!matchesPackage) return false;

    if (!allSalesNewestFirst || allSalesNewestFirst.length === 0) {
      // Geriye dönük: satış tarihinden önceki yoklamaları sayma.
      const fromDate = String(transaction.date ?? '').slice(0, 10);
      if (fromDate) {
        const recordDate = String(record.date ?? '').slice(0, 10);
        if (recordDate && recordDate < fromDate) return false;
      }
      return true;
    }

    return resolveAttendanceOwnerSaleId(record, saleWithStudent, allSalesNewestFirst) === String(transaction.id);
  }).length;
}

/** Satış günü ve öncesi yoklama (devir bakiyesi için). */
export function countPrivateLessonAttendanceBeforeDate(
  transaction: PrivateLessonSaleRef,
  attendanceRecords: AttendanceRecord[],
  studentId: string,
  untilDate: string,
  options?: {
    /** true: satış günü de eski paketten düşülür (aynı gün ders + yenileme → 2 kalan doğru kalsın). */
    includeUntilDate?: boolean;
    /** true: paket satış tarihinden önceki yoklamaları da say (kayıt öncesi kullanım). */
    includeBeforeSaleDate?: boolean;
  },
): number {
  const sid = String(studentId ?? '').trim();
  const until = String(untilDate ?? '').slice(0, 10);
  if (!sid || !until) return 0;
  const fromDate = String(transaction.date ?? '').slice(0, 10);
  const lessonPackageId = String(transaction.lessonPackageId ?? '').trim();
  const sessionRecord = buildPrivateLessonSessionRecord(transaction);
  const includeUntil = options?.includeUntilDate !== false; // default: satış günü dahil
  const includeBeforeSale = options?.includeBeforeSaleDate !== false; // default: satış öncesi de say

  return attendanceRecords.filter((record) => {
    if (record.studentId !== sid) return false;
    if (record.status !== 'present' && record.status !== 'late') return false;
    const recordDate = String(record.date ?? '').slice(0, 10);
    if (!recordDate) return false;
    if (includeUntil ? recordDate > until : recordDate >= until) return false;
    if (!includeBeforeSale && fromDate && recordDate < fromDate) return false;
    if (lessonPackageId && String(record.lessonId ?? '').trim() === lessonPackageId) return true;
    return attendanceRecordsShareSession(record, sessionRecord);
  }).length;
}

/**
 * Yeni satışta önceki paketten kalan dersi hesaplar.
 * Aynı gün hem ders hem paket yenilemede: satış günü yoklaması eski bakiyeden düşülür
 * (yoksa 2 kalan → 3 görünüp 3+8=11 olur); yeni paketteki kullanım ayrıca sayılır.
 */
export function getPreviousPrivateLessonRemaining(
  previousSale: PrivateLessonSaleRef | null | undefined,
  attendanceRecords: AttendanceRecord[],
  _allSalesNewestFirst: PrivateLessonSaleRef[],
  studentId: string,
  nextSaleDate: string,
  previousTotalLessons?: number,
  previousStartingUsed?: number,
): number {
  if (!previousSale) return 0;
  const total = previousTotalLessons ?? previousSale.lessonCount ?? 0;
  if (total <= 0) return 0;
  const starting = Math.max(0, Number(previousStartingUsed ?? previousSale.startingUsedLessons ?? 0) || 0);
  const usedBefore = countPrivateLessonAttendanceBeforeDate(
    previousSale,
    attendanceRecords,
    studentId,
    nextSaleDate,
    { includeUntilDate: true, includeBeforeSaleDate: true },
  );
  return Math.max(0, total - starting - usedBefore);
}

function packageIdentityKey(sale: PrivateLessonSaleRef): string {
  const id = String(sale.lessonPackageId ?? '').trim();
  if (id) return `id:${id}`;
  return `name:${norm(sale.lessonPackageName)}|${norm(sale.lessonDiscipline)}|${norm(sale.lessonBranchOffice)}`;
}

/** Yeniden eskiye sıralı satış listesinde, verilen satıştan hemen önceki aynı paket satışı. */
export function findPreviousPrivateLessonSale(
  sale: PrivateLessonSaleRef,
  allSalesNewestFirst: PrivateLessonSaleRef[],
): PrivateLessonSaleRef | null {
  const studentId = String(sale.studentId ?? '').trim();
  const matching = allSalesNewestFirst.filter(
    (candidate) =>
      String(candidate.studentId ?? '').trim() === studentId
      && samePrivateLessonPackageIdentity(candidate, sale),
  );
  const idx = matching.findIndex((candidate) => String(candidate.id) === String(sale.id));
  if (idx >= 0) return matching[idx + 1] ?? null;
  // Yeni (henüz listede olmayan) satış: en güncel mevcut satış önceki kabul edilir.
  return matching[0] ?? null;
}

/**
 * Kayıtlı lessonCount'a önceki kalan henüz eklenmemişse (startingUsed=0),
 * gösterim için carry-in uygular. lessonCount zaten büyütülmüşse tekrar eklemez.
 */
export function inferCarriedInLessons(args: {
  sale: PrivateLessonSaleRef;
  previousSale: PrivateLessonSaleRef | null;
  previousRemaining: number;
  packageLessonCount?: number | null;
}): number {
  const { sale, previousSale, previousRemaining, packageLessonCount } = args;
  if (previousRemaining <= 0) return 0;
  const startingUsed = Math.max(0, Number(sale.startingUsedLessons ?? 0) || 0);
  if (startingUsed > 0) return 0;
  const storedTotal = Number(sale.lessonCount ?? 0) || 0;
  if (storedTotal <= 0) return 0;
  if (packageLessonCount != null && packageLessonCount > 0 && storedTotal > packageLessonCount) return 0;
  if (previousSale?.lessonCount != null && storedTotal > Number(previousSale.lessonCount)) return 0;
  if (packageLessonCount != null && packageLessonCount > 0 && storedTotal === packageLessonCount) {
    return previousRemaining;
  }
  if (previousSale?.lessonCount != null && storedTotal === Number(previousSale.lessonCount)) {
    return previousRemaining;
  }
  return 0;
}

/** Öğrencinin özel ders satışları için kullanım/kalan haritası (devir dahil). */
export function buildPrivateLessonUsageById(
  salesNewestFirst: PrivateLessonSaleRef[],
  attendanceRecords: AttendanceRecord[],
  studentId: string,
  getPackageLessonCount?: (sale: PrivateLessonSaleRef) => number | null | undefined,
): Map<string, PrivateLessonBalance> {
  const map = new Map<string, PrivateLessonBalance>();
  const scoped = salesNewestFirst.filter((sale) => String(sale.studentId ?? '').trim() === String(studentId));
  const oldestFirst = [...scoped].reverse();

  for (const sale of oldestFirst) {
    const previousSale = findPreviousPrivateLessonSale(sale, scoped);
    const saleDate = String(sale.date ?? '').slice(0, 10);
    const previousBalance = previousSale ? map.get(String(previousSale.id)) : undefined;
    const previousRemaining = previousSale
      ? getPreviousPrivateLessonRemaining(
          previousSale,
          attendanceRecords,
          scoped,
          studentId,
          saleDate || '9999-99-99',
          previousBalance?.totalLessons,
          previousBalance?.startingUsedLessons,
        )
      : 0;
    const packageLessonCount = getPackageLessonCount?.(sale) ?? null;
    const startingUsed = Math.max(0, Number(sale.startingUsedLessons ?? 0) || 0);
    const storedTotal = Number(sale.lessonCount ?? 0) || 0;

    let saleForCompute: PrivateLessonSaleRef = sale;
    let carriedInLessons = inferCarriedInLessons({
      sale,
      previousSale,
      previousRemaining,
      packageLessonCount,
    });

    // Yanlış devirle kaydedilmiş toplamı düzelt (ör. 3+8=11 → 2+8=10).
    const catalogOrPrevious =
      (packageLessonCount != null && packageLessonCount > 0 ? packageLessonCount : null)
      ?? (previousSale?.lessonCount != null && Number(previousSale.lessonCount) > 0
        ? Number(previousSale.lessonCount)
        : null);
    if (startingUsed === 0 && catalogOrPrevious != null && storedTotal > catalogOrPrevious) {
      const correctTotal = catalogOrPrevious + previousRemaining;
      if (correctTotal > 0 && correctTotal !== storedTotal) {
        saleForCompute = { ...sale, lessonCount: correctTotal };
        carriedInLessons = 0;
      }
    }

    const balance = computePrivateLessonBalance(saleForCompute, attendanceRecords, {
      studentId,
      allSalesNewestFirst: scoped,
      carriedInLessons,
    });
    if (balance) map.set(String(sale.id), balance);
  }

  // Devredilen eski paketlerde kalanı 0 göster (çift sayım olmasın: 10 + 3 gibi).
  const seenLatest = new Set<string>();
  for (const sale of scoped) {
    const key = packageIdentityKey(sale);
    const balance = map.get(String(sale.id));
    if (!balance) continue;
    if (seenLatest.has(key)) {
      map.set(String(sale.id), {
        ...balance,
        remainingLessons: 0,
        transferredOut: true,
      });
    } else {
      seenLatest.add(key);
    }
  }

  return map;
}
