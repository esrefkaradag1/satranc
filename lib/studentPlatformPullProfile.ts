import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type StudentPlatformPullProfile = {
  lichessUsername?: string;
  chessComUsername?: string;
  lichessOauthConnected: boolean;
};

export type StudentPlatformPullHints = {
  lichessUsername?: string;
  chessComUsername?: string;
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

function mergeProfile(
  row: Record<string, unknown> | null,
  hints?: StudentPlatformPullHints,
): StudentPlatformPullProfile | null {
  const hintLichess = normalizeUsername(hints?.lichessUsername)?.toLowerCase();
  const hintChess = normalizeUsername(hints?.chessComUsername)?.toLowerCase();

  if (!row) {
    if (!hintLichess && !hintChess) return null;
    return {
      lichessUsername: hintLichess,
      chessComUsername: hintChess,
      lichessOauthConnected: false,
    };
  }

  const lichessUsername =
    normalizeUsername(row.lichess_username ?? row.lichessUsername)?.toLowerCase()
    || hintLichess;
  const chessComUsername =
    normalizeUsername(row.chess_com_username ?? row.chessComUsername)?.toLowerCase()
    || hintChess;

  if (!lichessUsername && !chessComUsername
    && !String(row.lichess_access_token ?? '').trim()
    && !String(row.lichess_oauth_connected_at ?? '').trim()
    && !hintLichess && !hintChess) {
    return null;
  }

  return {
    lichessUsername,
    chessComUsername,
    lichessOauthConnected:
      !!String(row.lichess_access_token ?? '').trim()
      || !!String(row.lichess_oauth_connected_at ?? '').trim(),
  };
}

export async function getStudentPlatformPullProfile(
  studentId: string,
  hints?: StudentPlatformPullHints,
): Promise<StudentPlatformPullProfile | null> {
  const sb = getSupabase();
  if (!sb) return mergeProfile(null, hints);

  const { data, error } = await sb
    .from('students')
    .select('lichess_username, chess_com_username, lichess_access_token, lichess_oauth_connected_at')
    .eq('id', studentId)
    .maybeSingle();
  if (error) return mergeProfile(null, hints);
  return mergeProfile(data as Record<string, unknown> | null, hints);
}
