/** Bir sonraki tam saate (14:00, 15:00 …) kalan ms */
export function msUntilNextHour(ref = new Date()): number {
  const next = new Date(ref);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return Math.max(1000, next.getTime() - ref.getTime());
}

/** Her saat başında callback çalıştırır; cleanup fonksiyonu döner */
export function scheduleHourlyRefresh(callback: () => void): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    timeoutId = setTimeout(() => {
      callback();
      schedule();
    }, msUntilNextHour());
  };
  schedule();
  return () => {
    if (timeoutId != null) clearTimeout(timeoutId);
  };
}
