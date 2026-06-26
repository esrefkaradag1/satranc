import type { Student } from '../types';
import { fetchFidePlayer, searchFidePlayer } from './fideService';
import { fetchUkdFromTsf } from './ukdService';

export type StudentRatingsSyncResult = {
  ukdSynced: boolean;
  fideSynced: boolean;
  patch: Partial<Student>;
};

/**
 * Öğrenci eklendikten sonra UKD (TSF) ve FIDE bilgilerini otomatik çeker.
 * TC yoksa FIDE ad araması ile devam eder.
 */
export async function syncStudentRatingsFromExternal(
  student: Pick<Student, 'id' | 'name' | 'birthDate' | 'tcNo' | 'fideId' | 'elo' | 'ukd'>
): Promise<StudentRatingsSyncResult> {
  const patch: Partial<Student> = {};
  let ukdSynced = false;
  let fideSynced = false;

  const tc = student.tcNo?.replace(/\D/g, '') || '';
  const soyad = (student.name || '').trim().split(/\s+/).slice(-1)[0] || undefined;

  if (tc) {
    try {
      const res = await fetchUkdFromTsf({ tc, soyad });
      if (res && 'ok' in res && res.ok) {
        if (res.ukd != null && res.ukd > 0) {
          patch.ukd = res.ukd;
          ukdSynced = true;
        }
        if (res.fideId?.trim()) {
          patch.fideId = res.fideId.trim();
        }
        if (res.name?.trim()) patch.name = res.name.trim();
        if (
          res.dogumYil?.trim().length === 4 &&
          (!student.birthDate || student.birthDate.slice(0, 4) !== res.dogumYil.trim())
        ) {
          patch.birthDate = `${res.dogumYil.trim()}-01-01`;
        }
      }
    } catch (e) {
      console.warn('[RatingsSync] UKD failed:', e);
    }
  }

  let fideId = (patch.fideId ?? student.fideId)?.trim().replace(/\D/g, '') || '';

  if (!fideId && student.name?.trim()) {
    try {
      const birthYear = student.birthDate ? Number(student.birthDate.slice(0, 4)) : null;
      const searchResults = await searchFidePlayer(student.name);
      if (searchResults.length > 0) {
        const matched = birthYear
          ? searchResults.find((p) => p.year === birthYear)
          : searchResults[0];
        if (matched?.id) fideId = String(matched.id);
      }
    } catch (e) {
      console.warn('[RatingsSync] FIDE search failed:', e);
    }
  }

  if (fideId) {
    try {
      const profile = await fetchFidePlayer(fideId);
      if (profile) {
        if (fideId !== student.fideId) patch.fideId = fideId;
        if (profile.standard != null && profile.standard > 0) {
          patch.elo = profile.standard;
        }
        fideSynced = true;
      }
    } catch (e) {
      console.warn('[RatingsSync] FIDE fetch failed:', e);
    }
  }

  return { ukdSynced, fideSynced, patch };
}
