import { useEffect, useRef, type RefObject } from 'react';

/**
 * Tahta üzerinde fare tekerleği: aşağı = sonraki pozisyon, yukarı = önceki (Lichess benzeri).
 * `preventDefault` için pasif olmayan wheel dinleyicisi kullanılır.
 */
export function useChessWheelNavigation(
  goPrev: () => void,
  goNext: () => void,
  enabled: boolean
): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY > 0) goNext();
      else goPrev();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [goPrev, goNext, enabled]);

  return ref;
}
