function keyboardTargetIsTextEntry(ev: KeyboardEvent): boolean {
  const t = ev.target;
  if (t instanceof HTMLElement) {
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  }
  return false;
}

/** Metin alanındayken tahta kısayollarını yutma */
export function keyboardTargetAllowsBoardShortcut(ev: KeyboardEvent): boolean {
  if (ev.defaultPrevented) return false;
  return !keyboardTargetIsTextEntry(ev);
}

/** Notasyon gezintisi — defaultPrevented yok sayılır (capture fazında erken yakalama) */
export function keyboardTargetAllowsReplayNav(ev: KeyboardEvent): boolean {
  return !keyboardTargetIsTextEntry(ev);
}

export function isBoardFlipShortcutKey(ev: KeyboardEvent): boolean {
  return ev.key === 'f' || ev.key === 'F';
}
