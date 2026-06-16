/**
 * Sunucu API adresi. Tanımlıysa uygulama öğrenci/veli verisini API'den çeker
 * (farklı cihaz/şehirdeki kullanıcılar güncel ödev ve ders programını görür).
 */
function getEnv(name: string): string {
  try {
    const v = (import.meta.env && (import.meta.env as Record<string, string>)[name]) ?? '';
    return typeof v === 'string' ? v.trim() : '';
  } catch {
    return '';
  }
}

export const API_BASE_URL = getEnv('VITE_API_URL');

export function isServerMode(): boolean {
  return API_BASE_URL.length > 0;
}
