import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthUser, Coach } from '../types';
import { normalizeClubKey } from './clubScope';
import { resolveClubIdFromAuth } from './orgStructureDb';

/** Giriş yapan kullanıcı için Supabase RLS oturum bağlamındaki kulüp kimliği */
export function resolveAuthClubId(
  auth: AuthUser | null,
  coaches: Coach[],
  clubs: { id: string; name: string }[],
): string | null {
  if (!auth) return null;
  if (auth.role === 'admin') return null;
  if (auth.role === 'club') return resolveClubIdFromAuth(auth, clubs) ?? null;
  if (auth.role === 'coach') {
    const coach =
      (auth.coachId ? coaches.find((c) => c.id === auth.coachId) : undefined) ??
      (auth.branch ? coaches.find((c) => normalizeClubKey(c.branch) === normalizeClubKey(auth.branch!)) : undefined);
    const branch = coach?.branch?.trim() || auth.branch?.trim();
    if (branch && clubs.length) {
      const club = clubs.find((c) => normalizeClubKey(c.name) === normalizeClubKey(branch));
      if (club) return club.id;
    }
  }
  return null;
}

/** Kulüp paneli RLS için oturum bağlamını ayarlar (katı mod etkinleştirilince gerekli) */
export async function syncSupabaseClubContext(
  sb: SupabaseClient | null | undefined,
  clubId: string | null,
): Promise<void> {
  if (!sb) return;
  try {
    if (clubId) {
      await sb.rpc('netchess_set_club_context', { p_club_id: clubId });
    } else {
      await sb.rpc('netchess_clear_club_context');
    }
  } catch (err) {
    console.warn('[Supabase] club context sync atlandı (RPC henüz kurulmamış olabilir):', err);
  }
}
