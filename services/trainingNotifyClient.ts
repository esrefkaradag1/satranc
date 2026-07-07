/** Öğrenci antrenman tamamlanınca veliye WhatsApp — sunucu kontrolü tetikler */
export async function requestTrainingNotifyCheck(studentId: string, dayIso?: string): Promise<void> {
  const id = studentId?.trim();
  if (!id) return;
  try {
    await fetch('/api/training-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: id, dayIso: dayIso?.slice(0, 10) }),
    });
  } catch {
    /* sessiz — bildirim kritik UI değil */
  }
}
