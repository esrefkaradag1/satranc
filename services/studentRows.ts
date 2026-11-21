import type { SupabaseClient } from '@supabase/supabase-js';
import { readSessionToken } from './supabase';

/**
 * Öğrenci satırlarını rol farkındalıklı okur.
 *
 * Veritabanı yetkileri (RLS) açıkken öğrenci/veli `students` tablosunda yalnızca KENDİ satırını
 * görür (diğer öğrencilerin TC, telefon, veli, şifre/PIN, Lichess belirteci gibi alanları gizli).
 * Lider tablosu, turnuva ve grup ekranları diğer öğrencilerin adını/reytingini gösterdiği için
 * onlar güvenli sütunlu `students_public` görünümünden okunup birleştirilir.
 *
 * Görünüm henüz yoksa (RLS SQL'i uygulanmadan önce) eski sorguya düşülür — kod iki durumda da çalışır.
 */

type Rows = { data: Record<string, unknown>[] | null; error: { message: string } | null };

/** Oturum belirtecindeki uygulama rolü (admin/club/coach/student/parent) — yoksa null. */
export function sessionAppRole(): string | null {
  const token = readSessionToken();
  if (!token) return null;
  try {
    const payload = token.split('.')[1] ?? '';
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { app_role?: string };
    return typeof json.app_role === 'string' ? json.app_role : null;
  } catch {
    return null;
  }
}

export function isMemberSession(): boolean {
  const role = sessionAppRole();
  return role === 'student' || role === 'parent';
}

export async function selectStudentRows(sb: SupabaseClient): Promise<Rows> {
  if (!isMemberSession()) {
    return (await sb.from('students').select('*')) as Rows;
  }
  const [own, others] = await Promise.all([
    sb.from('students').select('*'),
    sb.from('students_public').select('*'),
  ]);
  if (own.error) return own as Rows;
  const ownRows = (own.data ?? []) as Record<string, unknown>[];
  if (others.error) return { data: ownRows, error: null };
  const ownIds = new Set(ownRows.map((r) => String(r.id)));
  const rest = ((others.data ?? []) as Record<string, unknown>[]).filter((r) => !ownIds.has(String(r.id)));
  return { data: [...ownRows, ...rest], error: null };
}

/**
 * Eşleştirme/lider tablosu için başka öğrencilerin güvenli alanları (id, elo, grup, kulüp).
 * Önce görünüm denenir; yoksa (SQL öncesi) tabloya düşülür.
 */
export async function selectPublicStudentFields(
  sb: SupabaseClient,
  columns: string,
  ids: string[],
): Promise<Record<string, unknown>[]> {
  const fromView = await sb.from('students_public').select(columns).in('id', ids);
  if (!fromView.error) return (fromView.data ?? []) as unknown as Record<string, unknown>[];
  const fromTable = await sb.from('students').select(columns).in('id', ids);
  return (fromTable.data ?? []) as unknown as Record<string, unknown>[];
}
