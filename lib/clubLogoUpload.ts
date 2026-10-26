import { getServiceSupabase, isSupabaseBackend, supabase } from '../services/supabase';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const PREFERRED_BUCKETS = ['club-logos', 'coach-photos', 'student-photos'] as const;

export function validateClubLogoFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type) && !file.type.startsWith('image/')) {
    return 'Yalnızca resim dosyası yükleyebilirsiniz (JPG, PNG, WebP).';
  }
  if (file.size > MAX_BYTES) return 'Dosya en fazla 5 MB olabilir.';
  return null;
}

function isBucketMissing(message: string): boolean {
  return /bucket not found|not found|does not exist/i.test(message);
}

async function ensurePublicImageBucket(name: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  try {
    const { data } = await sb.storage.listBuckets();
    if ((data ?? []).some((b) => b.id === name || b.name === name)) return true;
    const { error } = await sb.storage.createBucket(name, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: [...ACCEPTED],
    });
    if (!error) return true;
    if (/already exists|duplicate/i.test(error.message)) return true;
    console.warn('[clubLogo] createBucket', name, error.message);
    return false;
  } catch (e) {
    console.warn('[clubLogo] ensureBucket', name, e);
    return false;
  }
}

async function uploadToBucket(
  bucket: string,
  fileName: string,
  file: File,
): Promise<string> {
  const sb = getServiceSupabase() ?? supabase;
  const { error } = await sb.storage.from(bucket).upload(fileName, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw new Error(error.message);
  const { data } = sb.storage.from(bucket).getPublicUrl(fileName);
  if (!data?.publicUrl) throw new Error('Logo adresi alınamadı.');
  return data.publicUrl;
}

/** Kulüp logosunu Supabase Storage'a yükler; public URL döner. */
export async function uploadClubLogo(clubId: string, file: File): Promise<string> {
  const validation = validateClubLogoFile(file);
  if (validation) throw new Error(validation);

  if (!isSupabaseBackend()) {
    return URL.createObjectURL(file);
  }

  const ext = (file.name.split('.').pop() || 'jpg').replace(/jpeg/i, 'jpg').toLowerCase();
  const fileName = `club-logos/${clubId}-${Date.now()}.${ext}`;

  await ensurePublicImageBucket('club-logos');

  let lastError = 'Logo yüklenemedi.';
  for (const bucket of PREFERRED_BUCKETS) {
    try {
      return await uploadToBucket(bucket, fileName, file);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError = msg;
      if (!isBucketMissing(msg)) throw new Error(msg);
    }
  }

  throw new Error(
    isBucketMissing(lastError)
      ? 'Logo deposu bulunamadı. Yönetici panelinden storage bucket oluşturun (club-logos).'
      : lastError,
  );
}
