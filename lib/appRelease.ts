/** Her deploy'da güncellenir — admin sürüm popup'ı bu kimliği kullanır. */
export const APP_BUILD_ID = __APP_BUILD_ID__;

export type AppReleaseInfo = {
  versionLabel: string;
  title: string;
  highlights: string[];
};

/** Kullanıcıya gösterilen sürüm notları (deploy öncesi güncelleyin). */
export const APP_RELEASE: AppReleaseInfo = {
  versionLabel: '31 Ağu 2026',
  title: 'Yeni sürüm yayında',
  highlights: [
    'Lichess bulmaca: kurulum hamlesi ve doğru tahta perspektifi',
    'Çalışma (Hamle Bul): tıklayarak hamle + arayüz sadeleştirmeleri',
    'Bulmaca sekmesi: Ödevler / Bulmaca Çöz + rating aralığı seçimi',
    'Lider tablosu: dönem puanları önbellekte tutulur',
    'WhatsApp: antrenman bildirimi yalnızca başarılı gönderimden sonra işaretlenir',
    'Veli WhatsApp hedefi: baba, anne veya her ikisi (öğrenci detayı)',
    'WhatsApp yoklama: derse katıldı/katılmadı şablonları ve varsayılan kanal (WhatsApp+panel)',
  ],
};

const ACK_KEY = 'netchess_ack_build_id';

export function getAcknowledgedBuildId(): string | null {
  try {
    return localStorage.getItem(ACK_KEY);
  } catch {
    return null;
  }
}

export function acknowledgeAppBuild(buildId = APP_BUILD_ID): void {
  try {
    localStorage.setItem(ACK_KEY, buildId);
  } catch {
    /* private mode */
  }
}

export function shouldShowAdminUpdateModal(): boolean {
  return getAcknowledgedBuildId() !== APP_BUILD_ID;
}
