import type { Student } from '../types';
import { fetchFidePlayer, pickFideMatchForStudent, searchFidePlayer } from './fideService';
import { fetchUkdFromTsf } from './ukdService';

export type StudentRatingsSyncResult = {
  ukdSynced: boolean;
  fideSynced: boolean;
  patch: Partial<Student>;
};

/**
 * Öğrenci eklendikten sonra UKD (TSF) ve FIDE bilgilerini otomatik çeker.
 * FIDE numarasının asıl kaynağı TSF'dir: TC ile bulunan satırın "FIDE ID" sütunu kişiye özeldir.
 * TSF öğrenciyi bulduysa ve FIDE ID boşsa öğrencinin FIDE kaydı yoktur — isimle tahmin yapılmaz.
 * İsim araması yalnızca TC yoksa / TSF'de bulunamadıysa ve ad+soyad+doğum yılı tek kişiyle eşleşirse.
 */
export async function syncStudentRatingsFromExternal(
  student: Pick<Student, 'id' | 'name' | 'birthDate' | 'tcNo' | 'fideId' | 'elo' | 'ukd'>
): Promise<StudentRatingsSyncResult> {
  const patch: Partial<Student> = {};
  let ukdSynced = false;
  let fideSynced = false;
  let tsfFound = false;

  const tc = student.tcNo?.replace(/\D/g, '') || '';
  const soyad = (student.name || '').trim().split(/\s+/).slice(-1)[0] || undefined;

  if (tc) {
    try {
      const res = await fetchUkdFromTsf({ tc, soyad });
      if (res && 'ok' in res && res.ok) {
        tsfFound = true;
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

  if (!fideId && !tsfFound && student.name?.trim()) {
    try {
      const birthYear = student.birthDate ? Number(student.birthDate.slice(0, 4)) : null;
      const searchResults = await searchFidePlayer(student.name);
      const matched = pickFideMatchForStudent(searchResults, student.name, birthYear);
      if (matched?.id) fideId = String(matched.id);
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
