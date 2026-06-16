import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string)?.trim() ?? '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string)?.trim() ?? '';
const supabaseServiceRoleKey = (import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string)?.trim() ?? '';

/** Veri kaynağı olarak Supabase kullanılsın mı (anon ile okuma). true ise veri kaynağı Supabase olur. */
export const isSupabaseBackend = (): boolean => !!(supabaseUrl && supabaseAnonKey);

/** Supabase'e yazma yetkisi var mı (service role mevcut). */
export const canWriteSupabase = (): boolean => !!(supabaseUrl && supabaseServiceRoleKey);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL or Anon Key is missing from environment variables');
}

/** Tek anon client; aynı tarayıcı bağlamında birden fazla GoTrueClient oluşturulmasını önler */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

/** Service role client — tek instance (Multiple GoTrueClient uyarısını önler) */
let serviceSupabase: SupabaseClient | null = null;

/** Service role client; anahtar yoksa null (localStorage modunda yazma yapılmaz). */
export const getServiceSupabase = (): SupabaseClient | null => {
  if (serviceSupabase) return serviceSupabase;
  if (!supabaseServiceRoleKey) return null;
  // Farklı storage key: anon client ile aynı bağlamda "Multiple GoTrueClient" uyarısını önler
  serviceSupabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { storageKey: 'supabase-service-role-auth' },
  });
  return serviceSupabase;
};
