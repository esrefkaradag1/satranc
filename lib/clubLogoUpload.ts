import { getServiceSupabase, isSupabaseBackend } from '../services/supabase';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function validateClubLogoFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type) && !file.type.startsWith('image/')) {
    return 'Yalnızca resim dosyası yükleyebilirsiniz (JPG, PNG, WebP).';
  }
  if (file.size > MAX_BYTES) return 'Dosya en fazla 5 MB olabilir.';
  return null;
}

/** Kulüp logosunu Supabase Storage'a yükler; public URL döner. */
export async function uploadClubLogo(clubId: string, file: File): Promise<string> {
  const validation = validateClubLogoFile(file);
  if (validation) throw new Error(validation);

  if (!isSupabaseBackend()) {
    return URL.createObjectURL(file);
  }

  const sb = getServiceSupabase();
  if (!sb) throw new Error('Depolama bağlantısı kurulamadı.');

  const ext = (file.name.split('.').pop() || 'jpg').replace('jpeg', 'jpg');
  const fileName = `club-${clubId}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('coach-photos').upload(fileName, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw new Error(error.message);

  const { data } = sb.storage.from('coach-photos').getPublicUrl(fileName);
  return data.publicUrl;
}
