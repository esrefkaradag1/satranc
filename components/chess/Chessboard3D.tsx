import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Chess3DEngine } from '../../lib/chess3d/chess3dEngine';
import type { BoardOrientation } from '../../lib/chess3dUtils';

export type Chessboard3DProps = {
  fen: string;
  orientation?: BoardOrientation;
  squareStyles?: Record<string, React.CSSProperties>;
  onSquareClick?: (square: string) => void;
  className?: string;
};

const Chessboard3D: React.FC<Chessboard3DProps> = ({
  fen,
  orientation = 'white',
  squareStyles,
  onSquareClick,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Chess3DEngine | null>(null);
  const onSquareClickRef = useRef(onSquareClick);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  onSquareClickRef.current = onSquareClick;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setLoading(true);
    setError(null);

    const engine = new Chess3DEngine(el, {
      onReady: () => setLoading(false),
      onError: (err) => {
        setError(err.message);
        setLoading(false);
      },
      onSquareClick: (sq) => onSquareClickRef.current?.(sq),
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setFen(fen);
  }, [fen]);

  useEffect(() => {
    engineRef.current?.setOrientation(orientation);
  }, [orientation]);

  useEffect(() => {
    engineRef.current?.setSquareHighlights(squareStyles);
  }, [squareStyles]);

  return (
    <div className={`relative w-full h-full min-h-[320px] bg-[#02184a] rounded-xl overflow-hidden ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#02184a]/90 text-slate-300 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-sm font-medium">3D satranç ortamı yükleniyor…</p>
          <p className="text-[10px] text-slate-500 max-w-[220px] text-center">
            Masa, taşlar ve bahçe sahnesi hazırlanıyor
          </p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-rose-950/80 text-rose-200 text-sm px-4 text-center">
          3D tahta yüklenemedi: {error}
        </div>
      )}
      {!loading && !error && (
        <p className="absolute bottom-0 inset-x-0 text-[9px] text-center text-slate-400/80 py-1.5 pointer-events-none bg-gradient-to-t from-black/40 to-transparent">
          3D — döndürmek için sürükleyin · hamle için kareye tıklayın
        </p>
      )}
    </div>
  );
};

export default Chessboard3D;
