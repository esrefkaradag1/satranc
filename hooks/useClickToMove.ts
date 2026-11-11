import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Chess, type Square } from 'chess.js';

/**
 * Tıkla-oynat (lichess gibi): taşa tıkla → yasal kareler noktayla gösterilir → hedef kareye
 * tıkla → hamle, sürükle-bırak ile AYNI işleyiciye (`onMove`) gider; kurallar orada uygulanır.
 * Sürükle-bırak aynen çalışmaya devam eder.
 *
 * Yalnızca `onSquareClick` kullanılır: react-chessboard'da taşa tıklama karenin tıklamasına da
 * yayılır, ikisini birden bağlamak tek tıklamayı iki kez işletirdi.
 */
export function useClickToMove(opts: {
  fen: string;
  /** false iken tıklamalar yok sayılır (ör. sıra rakipte, maç bitti) */
  enabled: boolean;
  /** Yalnızca bu rengin taşları seçilebilir (verilmezse sırası gelen taraf) */
  playerColor?: 'w' | 'b';
  /** Hamleyi uygular; kabul edildiyse true döner (sürükle-bırak işleyicisiyle aynı) */
  onMove: (from: string, to: string) => boolean;
}) {
  const { fen, enabled, playerColor, onMove } = opts;
  const [from, setFrom] = useState<string | null>(null);

  // Konum değişince (hamle oynandı, sürükle-bırak yapıldı, geri alındı) seçim temizlenir.
  useEffect(() => setFrom(null), [fen]);
  useEffect(() => {
    if (!enabled) setFrom(null);
  }, [enabled]);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  const targets = useMemo(() => {
    if (!chess || !from) return new Map<string, boolean>();
    const out = new Map<string, boolean>(); // kare → taş alma mı
    for (const m of chess.moves({ square: from as Square, verbose: true })) {
      out.set(m.to, !!m.captured || m.flags.includes('e'));
    }
    return out;
  }, [chess, from]);

  const canSelect = useCallback(
    (square: string): boolean => {
      if (!chess) return false;
      const p = chess.get(square as Square);
      if (!p) return false;
      const side = playerColor ?? chess.turn();
      return p.color === side && p.color === chess.turn();
    },
    [chess, playerColor],
  );

  const onSquareClick = useCallback(
    ({ square }: { square: string }) => {
      if (!enabled || !chess) return;
      if (from && square !== from && targets.has(square)) {
        const ok = onMove(from, square);
        setFrom(null);
        if (ok) return;
        return;
      }
      if (square === from) {
        setFrom(null);
        return;
      }
      setFrom(canSelect(square) ? square : null);
    },
    [enabled, chess, from, targets, onMove, canSelect],
  );

  const squareStyles = useMemo(() => {
    const out: Record<string, CSSProperties> = {};
    if (!from) return out;
    out[from] = { backgroundColor: 'rgba(20, 85, 30, 0.5)' };
    for (const [sq, capture] of targets) {
      out[sq] = capture
        ? { background: 'radial-gradient(transparent 0%, transparent 79%, rgba(20, 85, 0, 0.35) 80%)' }
        : { background: 'radial-gradient(rgba(20, 85, 30, 0.45) 22%, transparent 23%)' };
    }
    return out;
  }, [from, targets]);

  return { onSquareClick, squareStyles, selected: from, clear: () => setFrom(null) };
}
