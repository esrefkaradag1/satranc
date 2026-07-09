/**
 * Lichess proxy yanıtları — tüm sunucu örnekleri arasında paylaşılan Supabase önbelleği.
 * Vercel serverless'ta bellek içi cache işe yaramaz; bu katman 429 sonrası stale servis sağlar.
 */

function supabaseConfig(env = process.env) {
  const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

let tableMissing = false;

/**
 * @returns {Promise<{ status: number, body: string, contentType: string, expiresAt: number, stale?: boolean } | null>}
 */
export async function readLichessApiCache(cacheKey, env = process.env) {
  if (tableMissing) return null;
  const cfg = supabaseConfig(env);
  if (!cfg) return null;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb
      .from('lichess_api_cache')
      .select('status, body, content_type, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (error) {
      if (error.code === '42P01' || /lichess_api_cache/i.test(error.message ?? '')) {
        tableMissing = true;
      }
      return null;
    }
    if (!data) return null;
    const expiresAt = new Date(data.expires_at).getTime();
    return {
      status: data.status ?? 200,
      body: data.body ?? '',
      contentType: data.content_type || 'application/json',
      expiresAt,
      stale: expiresAt <= Date.now(),
    };
  } catch {
    return null;
  }
}

export async function writeLichessApiCache(cacheKey, entry, ttlMs, env = process.env) {
  if (tableMissing || ttlMs <= 0) return;
  const cfg = supabaseConfig(env);
  if (!cfg) return;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await sb.from('lichess_api_cache').upsert(
      {
        cache_key: cacheKey,
        status: entry.status,
        body: entry.body,
        content_type: entry.contentType || 'application/json',
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'cache_key' },
    );
    if (error && (error.code === '42P01' || /lichess_api_cache/i.test(error.message ?? ''))) {
      tableMissing = true;
    }
  } catch {
    /* ignore */
  }
}
