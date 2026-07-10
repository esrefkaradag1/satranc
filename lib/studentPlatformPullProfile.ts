import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type StudentPlatformPullProfile = {
  lichessUsername?: string;
  chessComUsername?: string;
  lichessOauthConnected: boolean;
};

function getSupabase(): SupabaseClient | null {
  const url = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const key = (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizeUsername(raw: unknown): string | undefined {
  const v = String(raw ?? '').trim();
  return v || undefined;
}

export async function getStudentPlatformPullProfile(
  studentId: string,
): Promise<StudentPlatformPullProfile | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('students')
    .select('lichess_username, chess_com_username, lichess_access_token, lichess_oauth_connected_at')
    .eq('id', studentId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    lichessUsername: normalizeUsername(row.lichess_username ?? row.lichessUsername),
    chessComUsername: normalizeUsername(row.chess_com_username ?? row.chessComUsername)?.toLowerCase(),
    lichessOauthConnected:
      !!String(row.lichess_access_token ?? '').trim()
      || !!String(row.lichess_oauth_connected_at ?? '').trim(),
  };
}
