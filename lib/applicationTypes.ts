export type ApplicationStatus = 'pending' | 'signed' | 'approved' | 'rejected';

export type ApplicationSource = 'public' | 'admin_student';

export interface StudentApplication {
  id: string;
  applicationNo: string;
  status: ApplicationStatus;
  /** Admin tarafından eklenen öğrenciye bağlı veli imza daveti */
  studentId?: string;
  source?: ApplicationSource;
  inviteToken?: string;
  branchOffice: string;
  group: string;
  tcNo: string;
  name: string;
  birthDate: string;
  photoDataUrl: string | null;
  lichessUsername: string;
  chessComUsername: string;
  school: string;
  teacher: string;
  notes: string;
  healthInfo: string;
  fatherName: string;
  fatherPhone: string;
  fatherJob: string;
  motherName: string;
  motherPhone: string;
  motherJob: string;
  address: string;
  phones: string[];
  kvkkAccepted: boolean;
  kvkkAcceptedAt: string;
  clientIp: string;
  /** Veli dijital imzası (veli-imza formu) */
  signatureDataUrl: string;
  signatureName: string;
  signedAt: string;
  /** Kulüp tarafında öğrenci eklerken alınan temsilci imzası */
  registrarSignatureDataUrl?: string;
  registrarSignatureName?: string;
  createdAt: string;
  updatedAt: string;
}

export const KVKK_TEXT = `SAĞLIK BEYANI
Çocuğumun spor faaliyetlerine katılmasına engel bir sağlık sorunu bulunmamaktadır. Antrenman ve müsabakalara katılımında sağlık açısından sakınca olmadığını beyan ederim.

VELİ İZİN BELGESİ
Çocuğumun kulübünüz tarafından düzenlenen antrenman, etkinlik, kamp, gezi ve müsabakalara katılmasına izin veriyorum. Etkinlikler sırasında çekilen fotoğraf ve videoların kulüp tanıtımlarında kullanılmasını kabul ediyorum.

KİŞİSEL VERİLERİN KORUNMASI
6698 sayılı KVKK kapsamında kimlik, iletişim, görsel, sağlık ve aile bilgileriniz yalnızca kayıt, eğitim planlaması, acil durum iletişimi ve yasal yükümlülükler için işlenecektir. Başvuru sırasında IP adresi ve cihaz bilgileri güvenlik amacıyla kaydedilir.`;
