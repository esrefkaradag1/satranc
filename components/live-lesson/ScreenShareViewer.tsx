import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, MonitorUp } from 'lucide-react';

/**
 * Öğrenci tarafı: antrenör ekran paylaşırken büyük izleme penceresi.
 * Küçültülebilir (tahtaya dönmek için); tarayıcı tam ekranı da açılabilir.
 */
export const ScreenShareViewer: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const [minimized, setMinimized] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => {});
  }, [stream, minimized]);

  if (typeof document === 'undefined') return null;

  if (minimized) {
    return createPortal(
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-24 right-4 z-[110] inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-xl hover:bg-indigo-500"
      >
        <MonitorUp className="w-4 h-4" />
        Ekran paylaşımını göster
      </button>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex flex-col bg-[#0b1220]" role="dialog" aria-label="Antrenör ekran paylaşımı">
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 bg-[#0f172a]">
        <p className="flex items-center gap-2 text-sm font-bold text-white">
          <MonitorUp className="w-4 h-4 text-emerald-400" />
          Antrenör ekranını paylaşıyor
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void videoRef.current?.requestFullscreen?.().catch(() => {})}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Tam ekran
          </button>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            Küçült
          </button>
        </div>
      </div>
      <video ref={videoRef} className="flex-1 min-h-0 w-full object-contain bg-black" playsInline muted autoPlay />
    </div>,
    document.body,
  );
};

export default ScreenShareViewer;
