/** Metin alanındayken tahta kısayollarını yutma */
export function keyboardTargetAllowsBoardShortcut(ev: KeyboardEvent): boolean {
  if (ev.defaultPrevented) return false;
  const t = ev.target;
  if (t instanceof HTMLElement) {
    if (t.isContentEditable) return false;
    const tag = t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  }
  return true;
}

export function isBoardFlipShortcutKey(ev: KeyboardEvent): boolean {
  return ev.key === 'f' || ev.key === 'F';
}
