const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 8 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type) && !file.type.startsWith('image/')) {
    return 'Yalnızca resim dosyası yükleyebilirsiniz (JPG, PNG, WebP).';
  }
  if (file.size > MAX_BYTES) return 'Dosya en fazla 8 MB olabilir.';
  return null;
}

/**
 * Bir resmi tarayıcıda küçültüp JPEG data URL döndürür. Listelerde kolay
 * gösterim için tasarlandı; sonuç metin sütununda ve localStorage'da saklanabilir.
 */
export function createImageThumbnail(
  file: File,
  maxSize = 240,
  quality = 0.8,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const validation = validateImageFile(file);
    if (validation) {
      reject(new Error(validation));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Görsel çözümlenemedi.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Görsel işlenemedi.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch {
          reject(new Error('Görsel dönüştürülemedi.'));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
