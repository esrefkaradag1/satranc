/**
 * Canlı turnuva maçları (gerçek zamanlı, iki öğrenci arası) — lichess Arena'daki
 * gibi, bir eşleşme bulununca öğrencilerin önüne gerçekten oynanabilir bir tahta
 * gelmesini sağlar. Bu depodaki diğer gerçek zamanlı özelliklerle (Çalışmalar:
 * `studyActions.ts`) aynı mimariyi izler: istemci doğrudan Supabase'e yazar
 * (service-role varsa onunla, yoksa anon ile), hamle meşruiyeti ve oyun sonu
 * tespiti istemci tarafında `chess.js` ile yapılır — ayrı bir sunucu taraflı
 * doğrulayıcı yoktur (bu projenin genelinde kurulu güven modeliyle aynı).
 *
 * Şema: `supabase_live_tournaments.sql` (Supabase SQL Editor'de çalıştırılmalı).
 */
import { getServiceSupabase, isSupabaseBackend, supabase } from '../services/supabase';

export type TournamentGameStatus = 'active' | 'finished' | 'cancelled';
export type TournamentGameResult = '1-0' | '0-1' | '1/2-1/2';

export interface TournamentGame {
  id: string;
  tournamentId: string;
  roundNo: number;
  whiteStudentId: string;
  blackStudentId: string;
  status: TournamentGameStatus;
  result?: TournamentGameResult;
  fen: string;
  moves: string[];
  whiteTimeMs: number;
  blackTimeMs: number;
  turnStartedAt: string | null;
  startedAt: string;
  finishedAt: string | null;
}

const TABLE = 'tournament_games';
export const TOURNAMENT_GAME_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// biome-ignore lint/suspicious/noExplicitAny: DB rows
function rowToGame(row: any): TournamentGame {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    roundNo: row.round_no ?? 1,
    whiteStudentId: row.white_student_id,
    blackStudentId: row.black_student_id,
    status: row.status ?? 'active',
    result: row.result ?? undefined,
    fen: row.fen ?? TOURNAMENT_GAME_START_FEN,
    moves: Array.isArray(row.moves) ? row.moves : [],
    whiteTimeMs: row.white_time_ms ?? 0,
    blackTimeMs: row.black_time_ms ?? 0,
    turnStartedAt: row.turn_started_at ?? null,
    startedAt: row.started_at ?? new Date().toISOString(),
    finishedAt: row.finished_at ?? null,
  };
}

function genId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** "3+2" (dakika+artış saniyesi) -> { baseMs, incrementMs }. Geçersiz/eksikse 10+0 varsayılır. */
export function parseTimeControl(timeControl: string): { baseMs: number; incrementMs: number } {
  const [baseStr, incStr] = (timeControl || '10+0').split('+');
  const baseMin = Number(baseStr);
  const incSec = Number(incStr);
  return {
    baseMs: Math.max(1, Number.isFinite(baseMin) ? baseMin : 10) * 60000,
    incrementMs: Math.max(0, Number.isFinite(incSec) ? incSec : 0) * 1000,
  };
}

export interface NewTournamentGame {
  tournamentId: string;
  roundNo: number;
  whiteStudentId: string;
  blackStudentId: string;
  timeControl: string;
}

/** Bir eşleştirme turunda üretilen tüm gerçek (bay olmayan) çiftler için canlı maç satırları açar. */
export async function createTournamentGames(games: NewTournamentGame[]): Promise<TournamentGame[]> {
  if (!isSupabaseBackend() || games.length === 0) return [];
  const client = getServiceSupabase() ?? supabase;
  const now = new Date().toISOString();
  const rows = games.map((g) => {
    const { baseMs } = parseTimeControl(g.timeControl);
    return {
      id: genId(),
      tournament_id: g.tournamentId,
      round_no: g.roundNo,
      white_student_id: g.whiteStudentId,
      black_student_id: g.blackStudentId,
      status: 'active',
      fen: TOURNAMENT_GAME_START_FEN,
      moves: [],
      white_time_ms: baseMs,
      black_time_ms: baseMs,
      turn_started_at: now,
      started_at: now,
    };
  });
  const { data, error } = await client.from(TABLE).insert(rows).select('*');
  if (error) {
    console.warn('[TournamentGames] createTournamentGames error:', error.message);
    return [];
  }
  return (data ?? []).map(rowToGame);
}

export async function fetchTournamentGame(gameId: string): Promise<TournamentGame | null> {
  if (!isSupabaseBackend()) return null;
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', gameId).maybeSingle();
  if (error || !data) return null;
  return rowToGame(data);
}

export async function fetchTournamentGames(tournamentId: string): Promise<TournamentGame[]> {
  if (!isSupabaseBackend()) return [];
  const { data, error } = await supabase.from(TABLE).select('*').eq('tournament_id', tournamentId).order('created_at', { ascending: true });
  if (error || !data) return [];
  return data.map(rowToGame);
}

/** Bir maçın canlı güncellemelerine abone olur (tahta ekranı için). */
export function subscribeToTournamentGame(gameId: string, callback: (game: TournamentGame) => void): () => void {
  if (!isSupabaseBackend()) return () => {};
  const channel = supabase
    .channel(`tournament_game_${gameId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: TABLE, filter: `id=eq.${gameId}` }, (payload) => {
      callback(rowToGame(payload.new as Record<string, unknown>));
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/** Bir turnuvanın tüm maçlarına abone olur (admin ekranının sonuçları otomatik senkronlaması için). */
export function subscribeToTournamentGames(tournamentId: string, callback: (games: TournamentGame[]) => void): () => void {
  if (!isSupabaseBackend()) return () => {};
  let cache: TournamentGame[] = [];
  void fetchTournamentGames(tournamentId).then((games) => {
    cache = games;
    callback(cache);
  });
  const channel = supabase
    .channel(`tournament_games_${tournamentId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `tournament_id=eq.${tournamentId}` }, (payload) => {
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (!oldId) return;
        cache = cache.filter((g) => g.id !== oldId);
      } else {
        const updated = rowToGame(payload.new as Record<string, unknown>);
        const idx = cache.findIndex((g) => g.id === updated.id);
        cache = idx === -1 ? [...cache, updated] : cache.map((g, i) => (i === idx ? updated : g));
      }
      callback(cache);
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/** Bir öğrencinin o an aktif (oynanan) maçlarına abone olur — eşleşince önüne otomatik getirmek için. */
export function subscribeToStudentActiveGames(studentId: string, callback: (games: TournamentGame[]) => void): () => void {
  if (!isSupabaseBackend()) return () => {};
  const reload = async () => {
    const { data } = await supabase
      .from(TABLE)
      .select('*')
      .eq('status', 'active')
      .or(`white_student_id.eq.${studentId},black_student_id.eq.${studentId}`);
    callback((data ?? []).map(rowToGame));
  };
  void reload();
  const channel = supabase
    .channel(`tournament_student_games_${studentId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
      if (!row) return;
      if (row.white_student_id !== studentId && row.black_student_id !== studentId) return;
      void reload();
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/** Hamle sonrası tahtayı günceller. Yalnızca maç hâlâ aktifse uygulanır (bitmiş maça yazılmaz). */
export async function pushTournamentGameMove(args: {
  gameId: string;
  fen: string;
  moves: string[];
  whiteTimeMs: number;
  blackTimeMs: number;
  turnStartedAt: string;
}): Promise<void> {
  if (!isSupabaseBackend()) return;
  const client = getServiceSupabase() ?? supabase;
  const { error } = await client
    .from(TABLE)
    .update({
      fen: args.fen,
      moves: args.moves,
      white_time_ms: args.whiteTimeMs,
      black_time_ms: args.blackTimeMs,
      turn_started_at: args.turnStartedAt,
    })
    .eq('id', args.gameId)
    .eq('status', 'active');
  if (error) console.warn('[TournamentGames] pushTournamentGameMove error:', error.message);
}

/**
 * Maçı bitirir (mat/berabere/zaman aşımı/pes). `.eq('status','active')` koruması
 * sayesinde iki taraf aynı anda (örn. biri mat görürken diğeri zaman aşımı
 * tespit ederse) yarışsa bile yalnızca ilk yazan kazanır, ikincisi sessizce
 * hiçbir satırı etkilemez.
 */
export async function finishTournamentGame(args: {
  gameId: string;
  result: TournamentGameResult;
  fen?: string;
  moves?: string[];
}): Promise<void> {
  if (!isSupabaseBackend()) return;
  const client = getServiceSupabase() ?? supabase;
  const { error } = await client
    .from(TABLE)
    .update({
      status: 'finished',
      result: args.result,
      finished_at: new Date().toISOString(),
      ...(args.fen ? { fen: args.fen } : {}),
      ...(args.moves ? { moves: args.moves } : {}),
    })
    .eq('id', args.gameId)
    .eq('status', 'active');
  if (error) console.warn('[TournamentGames] finishTournamentGame error:', error.message);
}

export async function resignTournamentGame(gameId: string, resigningColor: 'white' | 'black'): Promise<void> {
  await finishTournamentGame({ gameId, result: resigningColor === 'white' ? '0-1' : '1-0' });
}

/** Öğrencinin kendi kendine turnuvaya katılması (atomik RPC — bkz. supabase_live_tournaments.sql). */
export async function joinTournamentSelf(tournamentId: string, studentId: string): Promise<boolean> {
  if (!isSupabaseBackend()) return false;
  const client = getServiceSupabase() ?? supabase;
  const { error } = await client.rpc('tournament_self_join', { p_tournament_id: tournamentId, p_student_id: studentId });
  if (error) {
    console.warn('[TournamentGames] joinTournamentSelf error:', error.message);
    return false;
  }
  return true;
}
