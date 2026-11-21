declare global {
  interface Window {
    __RUNTIME_ENV__?: Record<string, string | undefined>;
  }
}

/**
 * Tarayıcıya açık derleme değişkenleri — YALNIZCA bu liste.
 *
 * Eski hata: `import.meta.env[name]` (dinamik erişim) yüzünden Vite, derleme ortamındaki TÜM
 * `VITE_*` değişkenlerini pakete gömüyordu; tam yetkili Supabase anahtarı ve OpenRouter anahtarı
 * kod onları okumasa bile sitenin JS dosyasında açıktı. Statik erişimde yalnızca burada adı geçenler
 * pakete girer. Yeni bir tarayıcı değişkeni gerekirse buraya eklenmeli — asla gizli anahtar değil.
 */
const BUILD_ENV: Record<string, string | undefined> = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_AGORA_APP_ID: import.meta.env.VITE_AGORA_APP_ID,
  VITE_AGORA_CHANNEL_PREFIX: import.meta.env.VITE_AGORA_CHANNEL_PREFIX,
  VITE_API_URL: import.meta.env.VITE_API_URL,
};

export function getRuntimeEnv(name: string): string {
  try {
    const fromWindow =
      typeof window !== 'undefined' ? window.__RUNTIME_ENV__?.[name] : undefined;
    if (typeof fromWindow === 'string' && fromWindow.trim()) {
      return fromWindow.trim();
    }

    const fromBuild = BUILD_ENV[name];
    if (typeof fromBuild === 'string' && fromBuild.trim()) {
      return fromBuild.trim();
    }
  } catch {
    // ignore
  }
  return '';
}
