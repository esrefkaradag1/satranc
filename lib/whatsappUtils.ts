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
