import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getRuntimeEnv } from '../runtimeEnv';

const supabaseUrl = getRuntimeEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getRuntimeEnv('VITE_SUPABASE_ANON_KEY');
// Tam yetkili (service role) anahtar tarayıcıda OKUNMAZ (Faz 3). Herkese açıktı: sitenin JS'inden
// alınıp bütün veritabanı okunup silinebiliyordu. Yetkiyi artık oturum belirteci + RLS belirler;
// tam yetki yalnızca sunucu kodunda (process.env) kalır.

/** Veri kaynağı olarak Supabase kullanılsın mı (anon ile okuma). true ise veri kaynağı Supabase olur. */
export const isSupabaseBackend = (): boolean => !!(supabaseUrl && supabaseAnonKey);

/** Supabase'e yazılabilir mi: giriş yapılmış (oturum belirteci var) — yetkiyi RLS belirler. */
export const canWriteSupabase = (): boolean => isSupabaseBackend() && hasSessionToken();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL or Anon Key is missing from environment variables');
}

/** Sunucunun (/api/login) verdiği imzalı oturum belirteci — localStorage anahtarı. */
export const SESSION_TOKEN_KEY = 'netchess_session_token';

function tokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Geçerli (süresi dolmamış) oturum belirteci; yoksa null. */
export function readSessionToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) return null;
    const exp = tokenExpiryMs(token);
    if (exp !== null && exp <= Date.now() + 30_000) return null;
    return token;
  } catch {
    return null;
  }
}

/** Oturum belirteci var mı (giriş yapılmış ve süresi dolmamış). */
export const hasSessionToken = (): boolean => readSessionToken() !== null;

/**
 * Tek istemci. Giriş yapılmışsa her REST/realtime isteği oturum belirteciyle gider; veritabanı
 * yetkileri (RLS) rolü ve kulübü/öğrenciyi bu imzalı belirteçten okur. Belirteç yoksa anon anahtar.
 * Not: accessToken seçeneği açıkken supabase.auth kullanılamaz (uygulama kullanmıyor; giriş /api/login).
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: async () => readSessionToken(),
});

export const testConnection = async () => {
  try {
    const { data, error } = await supabase.from('students').select('count', { count: 'exact', head: true });
    if (error) throw error;
    console.log('Supabase connection successful!');
    return { success: true, message: 'Connected successfully' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Supabase connection error:', message);
    return { success: false, message };
  }
};

/** Canlı ders okuma istemcisi (giriş yapılmışsa belirteçli). */
export const getLiveLessonReadClient = (): SupabaseClient => supabase;

/**
 * Yazma/okuma istemcisi: giriş yapılmışsa oturum belirteçli istemci (yetkiyi RLS belirler);
 * giriş yoksa null (ziyaretçi yazamaz — eski adı geriye dönük uyum için korunur).
 */
export const getServiceSupabase = (): SupabaseClient | null => {
  if (!isSupabaseBackend()) return null;
  return hasSessionToken() ? supabase : null;
};
