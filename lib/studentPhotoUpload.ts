import { getServiceSupabase } from '../services/supabase';

export function isDisplayablePhotoUrl(url?: string | null): boolean {
  const u = url?.trim();
  if (!u || u === '__HAS_PHOTO__') return false;
  return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:image/');
}

/** Başvuru veya yerel data URL → Supabase Storage (veya data URL yedek) */
export async function uploadStudentPhotoDataUrl(
  dataUrl: string,
  hintId?: string,
): Promise<string | undefined> {
  const trimmed = dataUrl.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
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
    return data.publicUrl;
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
