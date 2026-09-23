import { getServiceSupabase } from '../services/supabase';
import { getRuntimeEnv } from '../runtimeEnv';

export function isDisplayablePhotoUrl(url?: string | null): boolean {
  const u = url?.trim();
  if (!u || u === '__HAS_PHOTO__') return false;
  return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:image/');
}

/**
 * Eski *.supabase.co storage URL'lerini güncel VITE_SUPABASE_URL (ör. db.satrancedu.com)
 * üzerinden yeniden yazar. DNS'i çözülmeyen eski host yüzünden foto yükleme + yavaşlık olmasın.
 */
export function resolvePublicStorageUrl(url?: string | null): string | undefined {
  const raw = url?.trim();
  if (!raw) return undefined;
  if (raw.startsWith('data:image/')) return raw;
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) return undefined;

  const base = getRuntimeEnv('VITE_SUPABASE_URL').replace(/\/+$/, '');
  if (!base) return raw;

  try {
    const parsed = new URL(raw);
    const baseHost = new URL(base).host;
    // Eski proje ref hostu veya başka supabase.co → mevcut özel domain
    if (
      parsed.hostname !== baseHost
      && (
        parsed.hostname.endsWith('.supabase.co')
        || parsed.hostname.includes('supabase')
      )
      && parsed.pathname.includes('/storage/v1/object/')
    ) {
      return `${base}${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return raw;
  }
  return raw;
}

/** Gösterilebilir + host düzeltilmiş foto URL */
export function displayablePhotoUrl(url?: string | null): string | undefined {
  if (!isDisplayablePhotoUrl(url)) return undefined;
  return resolvePublicStorageUrl(url);
}

/** Başvuru veya yerel data URL → Supabase Storage (veya data URL yedek) */
export async function uploadStudentPhotoDataUrl(
  dataUrl: string,
  hintId?: string,
): Promise<string | undefined> {
  const trimmed = dataUrl.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return resolvePublicStorageUrl(trimmed) ?? trimmed;
  }
  if (!trimmed.startsWith('data:image/')) return undefined;

  const sb = getServiceSupabase();
  if (!sb) return trimmed;

  try {
    const res = await fetch(trimmed);
    const blob = await res.blob();
    const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const fileName = `${hintId ?? Math.random().toString(36).slice(2)}-${Date.now()}.${ext}`;
    const { error } = await sb.storage
      .from('student-photos')
      .upload(fileName, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (error) {
      console.warn('[studentPhoto] upload failed:', error.message);
      return trimmed;
    }
    const { data } = sb.storage.from('student-photos').getPublicUrl(fileName);
    return resolvePublicStorageUrl(data.publicUrl) ?? data.publicUrl;
  } catch (e) {
    console.warn('[studentPhoto] upload error:', e);
    return trimmed;
  }
}

export async function photoUrlFromApplication(
  photoDataUrl?: string | null,
  hintId?: string,
): Promise<string | undefined> {
  if (!isDisplayablePhotoUrl(photoDataUrl)) return undefined;
  return uploadStudentPhotoDataUrl(photoDataUrl!, hintId);
}
