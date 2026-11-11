import type { Tournament } from '../types';

/** Supabase `tournaments` satırı ↔ uygulama nesnesi (AppContext ve arena yöneticisi ortak kullanır). */
export function tournamentToDb(t: Tournament): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    format: t.format,
    duration_minutes: t.durationMinutes,
    time_control: t.timeControl,
    start_at: t.startAt,
    description: t.description ?? null,
    is_rated: t.isRated,
    created_by_role: t.createdByRole,
    created_by: t.createdBy,
    branch: t.branch ?? null,
    participant_ids: t.participantIds ?? [],
    rounds: t.rounds ?? [],
    standings: t.standings ?? {},
    round_limit: t.roundLimit ?? null,
    streak_bonus: t.streakBonus ?? null,
    team_battle: t.teamBattle ?? null,
  };
}

/**
 * `tournamentToDb`'nin yalnızca `patch`'te VERİLEN alanları Supabase sütun adlarına
 * çevirip döndüren kısmi sürümü. `updateTournament`'ın Supabase yazması bunu kullanır
 * — eski (stale) bir `current` anlık görüntüsüyle tüm satırı yeniden yazmak yerine,
 * yalnızca gerçekten değişen alanları UPDATE eder; böylece yarışan iki güncelleme
 * birbirinin değişikliğini sessizce geri almaz (örn. biri katılımcı eklerken diğeri
 * turları güncelliyorsa, katılımcı listesi eski boş haliyle üzerine yazılmaz).
 */
export function tournamentPatchToDb(patch: Partial<Tournament>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('name' in patch) out.name = patch.name;
  if ('format' in patch) out.format = patch.format;
  if ('durationMinutes' in patch) out.duration_minutes = patch.durationMinutes;
  if ('timeControl' in patch) out.time_control = patch.timeControl;
  if ('startAt' in patch) out.start_at = patch.startAt;
  if ('description' in patch) out.description = patch.description ?? null;
  if ('isRated' in patch) out.is_rated = patch.isRated;
  if ('createdByRole' in patch) out.created_by_role = patch.createdByRole;
  if ('createdBy' in patch) out.created_by = patch.createdBy;
  if ('branch' in patch) out.branch = patch.branch ?? null;
  if ('participantIds' in patch) out.participant_ids = patch.participantIds ?? [];
  if ('rounds' in patch) out.rounds = patch.rounds ?? [];
  if ('standings' in patch) out.standings = patch.standings ?? {};
  if ('roundLimit' in patch) out.round_limit = patch.roundLimit ?? null;
  if ('streakBonus' in patch) out.streak_bonus = patch.streakBonus ?? null;
  if ('teamBattle' in patch) out.team_battle = patch.teamBattle ?? null;
  return out;
}

export function dbToTournament(row: Record<string, unknown>): Tournament {
  const r = row as any;
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    format: (r.format === 'swiss' ? 'swiss' : 'arena'),
    durationMinutes: Number(r.duration_minutes ?? r.durationMinutes ?? 45),
    timeControl: String(r.time_control ?? r.timeControl ?? '2+0'),
    startAt: String(r.start_at ?? r.startAt ?? new Date().toISOString()),
    description: r.description != null ? String(r.description) : undefined,
    isRated: Boolean(r.is_rated ?? r.isRated ?? true),
    createdByRole: (r.created_by_role === 'club' ? 'club' : 'admin'),
    createdBy: String(r.created_by ?? r.createdBy ?? 'Admin'),
    branch: r.branch != null ? String(r.branch) : undefined,
    participantIds: Array.isArray(r.participant_ids) ? r.participant_ids : Array.isArray(r.participantIds) ? r.participantIds : [],
    rounds: Array.isArray(r.rounds) ? r.rounds : [],
    standings: (r.standings && typeof r.standings === 'object') ? r.standings : {},
    roundLimit: r.round_limit != null ? Number(r.round_limit) : (r.roundLimit != null ? Number(r.roundLimit) : undefined),
    streakBonus: r.streak_bonus != null ? Boolean(r.streak_bonus) : undefined,
    teamBattle: (r.team_battle && typeof r.team_battle === 'object') ? r.team_battle : undefined,
  };
}
