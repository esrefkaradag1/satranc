import { readSessionToken } from './supabase';

/**
 * Kendi sunucumuzdaki /api/* isteklerine oturum belirtecini otomatik ekler (Faz 2b).
 * Sunucu her uç noktada çağıranı bu belirteçle doğrular (lib/apiAuth.mjs). Uygulamadaki onlarca
 * fetch('/api/...') çağrısını tek tek değiştirmemek için global fetch bir kez sarılır.
 *
 * Güvenlik: belirteç YALNIZCA aynı kökene (bizim siteye) giden /api/ isteklerine eklenir —
 * Lichess, Chess.com vb. dış adreslere asla gönderilmez. İstek zaten Authorization taşıyorsa
 * (ör. zamanlayıcı) dokunulmaz.
 */
let installed = false;

function isOwnApiRequest(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    return u.origin === window.location.origin && u.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export function installApiAuthFetch(): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!isOwnApiRequest(url)) return original(input, init);
    const token = readSessionToken();
    if (!token) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (headers.has('Authorization')) return original(input, init);
    headers.set('Authorization', `Bearer ${token}`);
    return original(input, { ...init, headers });
  };
}
