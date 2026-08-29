/** TR numarasını WhatsApp Click-to-Chat / send API formatına çevirir (ülke kodu, + yok). */
export function toWhatsAppPhoneDigits(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('0')) d = `90${d.slice(1)}`;
  else if (d.length === 10 && d.startsWith('5')) d = `90${d}`;
  else if (!d.startsWith('90') && d.length >= 10) d = `90${d}`;
  return d;
}

export function isValidWhatsAppPhone(phone: string): boolean {
  const d = toWhatsAppPhoneDigits(phone);
  return d.length >= 11 && d.length <= 13 && d.startsWith('90');
}

/**
 * WhatsApp resmi "send" URL — tarayıcıda WhatsApp Web / uygulamasını açar, mesaj hazır gelir.
 * @see https://developers.facebook.com/docs/whatsapp/guides/send-messages
 */
export function buildWhatsAppSendUrl(phone: string, message: string): string {
  const digits = toWhatsAppPhoneDigits(phone);
  const params = new URLSearchParams({
    phone: digits,
    text: message,
    type: 'phone_number',
    app_absent: '0',
  });
  return `https://api.whatsapp.com/send?${params.toString()}`;
}

export function openWhatsAppSend(phone: string, message: string): void {
  const url = buildWhatsAppSendUrl(phone, message);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Şablondaki "Merhaba Veli Adı," satırından hitap adını çıkarır. */
export function parseWhatsAppGreetingName(message: string): string | undefined {
  const m = String(message || '').match(/^Merhaba\s+([^,\n]+)/i);
  const name = m?.[1]?.trim();
  return name && name.length > 1 ? name : undefined;
}

type LogPartyStudent = {
  id?: string;
  name?: string;
  parentName?: string;
  fatherName?: string;
  motherName?: string;
};

/** Gönderim kaydında veli (alıcı) ve öğrenci adlarını çözümler. */
export function resolveWhatsAppLogParties(
  log: {
    studentId?: string;
    studentName?: string;
    recipientName?: string;
    message?: string;
  },
  students: LogPartyStudent[] = [],
): { parentName: string; studentName: string } {
  const student = log.studentId
    ? students.find((s) => s.id === log.studentId)
    : students.find((s) => s.name && log.studentName && s.name === log.studentName);
  const studentName = log.studentName?.trim() || student?.name?.trim() || '—';
  const parentFromStudent =
    student?.parentName?.trim()
    || student?.fatherName?.trim()
    || student?.motherName?.trim();
  const parentFromMessage = parseWhatsAppGreetingName(log.message ?? '');
  const parentName =
    log.recipientName?.trim()
    || parentFromStudent
    || parentFromMessage
    || '—';
  return { parentName, studentName };
}
