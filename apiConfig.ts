/**
 * Sunucu API adresi. Tanımlıysa uygulama öğrenci/veli verisini API'den çeker
 * (farklı cihaz/şehirdeki kullanıcılar güncel ödev ve ders programını görür).
 */
import { getRuntimeEnv } from './runtimeEnv';

function getEnv(name: string): string {
  return getRuntimeEnv(name);
}

export const API_BASE_URL = getEnv('VITE_API_URL');

export function isServerMode(): boolean {
  return API_BASE_URL.length > 0;
}
