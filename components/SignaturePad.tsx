import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onChange, height = 160 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const logicalSize = useRef({ width: 0, height });
  const [hasStroke, setHasStroke] = useState(false);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.getBoundingClientRect().width;
    if (width <= 0) return;

    logicalSize.current = { width, height };
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }, [height]);

  const getPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    let clientX: number;
    let clientY: number;
    if ('touches' in e) {
      const touch = e.touches[0] ?? e.changedTouches[0];
      if (!touch) return null;
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const exportImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) {
      onChange(null);
      return;
    }
    onChange(canvas.toDataURL('image/png'));
  }, [hasStroke, onChange]);

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    const p = getPoint(e);
    if (!ctx || !p) return;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    const p = getPoint(e);
    if (!ctx || !p) return;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hasStroke) setHasStroke(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    exportImage();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height: h } = logicalSize.current;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, h);
    setHasStroke(false);
    onChange(null);
  };

  useEffect(() => {
    setupCanvas();
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => setupCanvas());
    observer.observe(container);
    return () => observer.disconnect();
  }, [setupCanvas]);

  useEffect(() => {
    exportImage();
  }, [hasStroke, exportImage]);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative rounded-xl border-2 border-dashed border-slate-300 bg-white overflow-hidden touch-none"
      >
        <canvas
          ref={canvasRef}
          className="block cursor-crosshair"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Parmağınız veya kalemle imzanızı atın</p>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
        >
          <Eraser className="w-3.5 h-3.5" /> Temizle
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;
