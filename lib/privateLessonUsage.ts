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

export function buildPrivateLessonSessionRecord(transaction: Pick<Transaction, 'lessonPackageId' | 'lessonPackageName' | 'lessonDiscipline' | 'lessonBranchOffice'>) {
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

function isPresentOrLate(record: Pick<AttendanceRecord, 'status'>): boolean {
  const s = norm(record.status);
  return s === 'present' || s === 'late' || s === 'var' || s === 'geç' || s === 'gec';
}

/** Canlı ders / etiketsiz yoklama: paket oturumuna bağlanabilir. */
export function isUnscopedOrLiveAttendance(
  record: Pick<AttendanceRecord, 'attendanceType' | 'lessonId' | 'lessonSummary' | 'groupName' | 'branch' | 'branchOffice'>,
): boolean {
  const summary = norm(record.lessonSummary);
  if (summary.startsWith('canlı ders') || summary.startsWith('canli ders')) return true;
  if (record.attendanceType === 'group' || record.attendanceType === 'lesson') return false;
  const lessonId = String(record.lessonId ?? '').trim();
  const hasSessionHint = !!(
    lessonId
    || String(record.groupName ?? '').trim()
    || String(record.branch ?? '').trim()
    || String(record.branchOffice ?? '').trim()
  );
  return !hasSessionHint;
}

/** Yoklama kaydı bu özel ders satışının paket hakkından düşer mi? */
export function attendanceMatchesPrivateLessonPackage(
  record: Pick<AttendanceRecord, 'status' | 'lessonId' | 'attendanceType' | 'groupName' | 'branch' | 'branchOffice' | 'lessonSummary'>,
  sale: Pick<Transaction, 'lessonPackageId' | 'lessonPackageName' | 'lessonDiscipline' | 'lessonBranchOffice'>,
): boolean {
  return (
    hardAttendanceMatchesPrivateLessonPackage(record, sale)
    || softAttendanceMatchesPrivateLessonPackage(record, sale)
  );
}

/** Paket kimliğiyle birebir eşleşen yoklama (özel ders sekmesi / paket id). */
function hardAttendanceMatchesPrivateLessonPackage(
  record: Pick<AttendanceRecord, 'status' | 'lessonId' | 'attendanceType' | 'groupName' | 'branch' | 'branchOffice' | 'lessonSummary'>,
  sale: Pick<Transaction, 'lessonPackageId' | 'lessonPackageName' | 'lessonDiscipline' | 'lessonBranchOffice'>,
): boolean {
  if (!isPresentOrLate(record)) return false;

  const lessonPackageId = String(sale.lessonPackageId ?? '').trim();
  const sessionRecord = buildPrivateLessonSessionRecord(sale);
  if (lessonPackageId && String(record.lessonId ?? '').trim() === lessonPackageId) return true;
  if (attendanceRecordsShareSession(record, sessionRecord)) return true;

  // Paket adıyla kaydedilmiş grup/ders yoklaması
  const pkgName = norm(sale.lessonPackageName);
  const recGroup = norm(record.groupName);
  if (pkgName && recGroup && pkgName === recGroup) {
    const saleOffice = norm(sale.lessonBranchOffice);
    const saleBranch = norm(sale.lessonDiscipline);
    const recOffice = norm(record.branchOffice);
    const recBranch = norm(record.branch);
    if (saleOffice && recOffice && saleOffice !== recOffice) return false;
    if (saleBranch && recBranch && saleBranch !== recBranch) return false;
    return true;
  }
  return false;
}

/**
 * Paket kimliği taşımayan (veya başka oturuma yazılmış) var/geç yoklaması.
 * Öğrencinin aktif özel ders satışına soft bağlanır.
 */
function softAttendanceMatchesPrivateLessonPackage(
  record: Pick<AttendanceRecord, 'status' | 'lessonId' | 'attendanceType' | 'groupName' | 'branch' | 'branchOffice' | 'lessonSummary'>,
  sale: Pick<Transaction, 'lessonPackageId' | 'lessonPackageName' | 'lessonDiscipline' | 'lessonBranchOffice'>,
): boolean {
  if (!isPresentOrLate(record)) return false;
  if (hardAttendanceMatchesPrivateLessonPackage(record, sale)) return false;
  // Her var/geç kaydı hard eşleşmedikçe soft adaydır
  // (grup, canlı ders, yanlış paket id'li lesson, etiketsiz…).
  return true;
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
  if (!studentId || String(record.studentId ?? '').trim() !== studentId) return null;

  const hard = hardAttendanceMatchesPrivateLessonPackage(record, sale);
  const soft = softAttendanceMatchesPrivateLessonPackage(record, sale);
  if (!hard && !soft) return null;

  const recordDate = String(record.date ?? '').slice(0, 10);
  if (!recordDate) return null;

  const studentSales = allSalesNewestFirst.filter(
    (candidate) => String(candidate.studentId ?? '').trim() === studentId,
  );

  if (hard) {
    const candidates = studentSales
      .filter((candidate) => samePrivateLessonPackageIdentity(candidate, sale))
      .filter((candidate) => {
        const saleDay = String(candidate.date ?? '').slice(0, 10);
        return !saleDay || saleDay <= recordDate;
      });
    if (candidates.length > 0) return String(candidates[0]?.id ?? '') || null;
    // Paket sonradan kaydedildiyse bile hard eşleşen kaydı en güncel aynı pakete yaz
    const samePkg = studentSales.filter((candidate) => samePrivateLessonPackageIdentity(candidate, sale));
    if (samePkg.length === 0) return null;
    return String(samePkg[0]?.id ?? '') || null;
  }

  // Soft: başka bir satış hard sahipleniyorsa çalma
  const hardOwner = studentSales.find((candidate) => hardAttendanceMatchesPrivateLessonPackage(record, candidate));
  if (hardOwner) return null;

  // Önce satış tarihi ≤ yoklama günü olan en güncel; yoksa (paket sonradan işlendiyse) en güncel satış
  const onOrBefore = studentSales.filter((candidate) => {
    const saleDay = String(candidate.date ?? '').slice(0, 10);
    return !saleDay || saleDay <= recordDate;
  });
  const owner = onOrBefore[0] ?? studentSales[0];
  if (!owner) return null;
  return String(owner.id) === String(sale.id) ? String(sale.id) : null;
}

export type PrivateLessonBalance = {
  totalLessons: number;
  usedLessons: number;
  remainingLessons: number;
  attendanceUsedLessons: number;
  startingUsedLessons: number;
  /** Bu satışta satın alınan paket saati (katalog). */
  purchasedLessons?: number;
  /** Önceki paketten devreden kalan. */
  carriedInLessons?: number;
  /** Kalan ders sonraki pakete aktarıldı. */
  transferredOut?: boolean;
  /** Sonraki pakete aktarılan ders sayısı. */
  transferredOutLessons?: number;
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
        String(record.studentId ?? '').trim() === studentId &&
        attendanceMatchesPrivateLessonPackage(record, sale) &&
        String(record.date ?? '').slice(0, 10) === todayIso,
    );
    const savedTodayUsed = existingToday && isPresentOrLate(existingToday) ? 1 : 0;
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
  const saleWithStudent = { ...transaction, studentId };

  const matchedDates = new Set<string>();
  for (const record of attendanceRecords) {
    if (String(record.studentId ?? '').trim() !== studentId) continue;
    if (!attendanceMatchesPrivateLessonPackage(record, saleWithStudent)) continue;

    if (!allSalesNewestFirst || allSalesNewestFirst.length === 0) {
      // Soft eşleşmede satış tarihinden önceki devam da sayılır (paket sonradan kaydedilmiş olabilir).
      // Hard eşleşmede satış öncesi yoklamayı sayma.
      if (hardAttendanceMatchesPrivateLessonPackage(record, saleWithStudent)) {
        const fromDate = String(transaction.date ?? '').slice(0, 10);
        if (fromDate) {
          const recordDate = String(record.date ?? '').slice(0, 10);
          if (recordDate && recordDate < fromDate) continue;
        }
      }
    } else if (
      resolveAttendanceOwnerSaleId(record, saleWithStudent, allSalesNewestFirst) !== String(transaction.id)
    ) {
      continue;
    }

    const day = String(record.date ?? '').slice(0, 10);
    if (day) matchedDates.add(day);
  }
  return matchedDates.size;
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
  const includeUntil = options?.includeUntilDate === true;
  const includeBeforeSale = options?.includeBeforeSaleDate !== false; // default: satış öncesi de say

  const matchedDates = new Set<string>();
  for (const record of attendanceRecords) {
    if (String(record.studentId ?? '').trim() !== sid) continue;
    if (!attendanceMatchesPrivateLessonPackage(record, transaction)) continue;
    const recordDate = String(record.date ?? '').slice(0, 10);
    if (!recordDate) continue;
    if (includeUntil ? recordDate > until : recordDate >= until) continue;
    if (!includeBeforeSale && fromDate && recordDate < fromDate) continue;
    matchedDates.add(recordDate);
  }
  return matchedDates.size;
}

/**
 * Yeni satışta önceki paketten kalan dersi hesaplar.
 * Satış günündeki yoklama yeni pakete aittir; devir bakiyesine dahil edilmez
 * (ör. 3 kalan + 8 yeni = 11; bugün 1 yoklama → 1/11).
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
    // Satış günü yeni pakete yazılır; devir için satış gününden önceki yoklama.
    { includeUntilDate: false, includeBeforeSaleDate: true },
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
  const sid = String(studentId ?? '').trim();
  const scoped = salesNewestFirst.filter((sale) => String(sale.studentId ?? '').trim() === sid);
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
          sid,
          saleDate || '9999-99-99',
          previousBalance?.totalLessons,
          previousBalance?.startingUsedLessons,
        )
      : 0;

    const packageLessonCount = getPackageLessonCount?.(sale) ?? null;
    const startingUsed = Math.max(0, Number(sale.startingUsedLessons ?? 0) || 0);
    const storedTotal = Number(sale.lessonCount ?? 0) || 0;

    // 1) Gösterim için çıkarılan devir (henüz kayda yazılmamış eski satışlar)
    const inferredCarry = inferCarriedInLessons({
      sale,
      previousSale,
      previousRemaining,
      packageLessonCount,
    });

    // 2) Satın alınan paket saati
    const purchasedLessons =
      packageLessonCount != null && packageLessonCount > 0
        ? packageLessonCount
        : inferredCarry > 0
          ? Math.max(0, storedTotal - inferredCarry)
          : storedTotal;

    // 3) Kayıtta toplam zaten paket+devir (ör. 11) ise tekrar ekleme; devreden = 11-8
    let addCarryToTotal = inferredCarry;
    let displayCarried = inferredCarry;
    if (startingUsed === 0 && purchasedLessons > 0 && storedTotal > purchasedLessons) {
      displayCarried = storedTotal - purchasedLessons;
      addCarryToTotal = 0;
    }

    const balance = computePrivateLessonBalance(sale, attendanceRecords, {
      studentId: sid,
      allSalesNewestFirst: scoped,
      carriedInLessons: addCarryToTotal,
      fallbackTotalLessons: packageLessonCount ?? undefined,
    });
    if (!balance) continue;

    map.set(String(sale.id), {
      ...balance,
      purchasedLessons,
      carriedInLessons: displayCarried || balance.carriedInLessons || 0,
    });
  }

  // Devredilen eski paketlerde kalanı 0 göster; aktarılan miktarı etiketle.
  const seenLatest = new Set<string>();
  for (const sale of scoped) {
    const key = packageIdentityKey(sale);
    const balance = map.get(String(sale.id));
    if (!balance) continue;
    if (seenLatest.has(key)) {
      map.set(String(sale.id), {
        ...balance,
        transferredOutLessons: balance.remainingLessons,
        remainingLessons: 0,
        transferredOut: true,
      });
    } else {
      seenLatest.add(key);
    }
  }

  return map;
}
