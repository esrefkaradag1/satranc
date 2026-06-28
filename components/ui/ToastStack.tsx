import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { Toast, ToastType } from '../../AppContext';

const TOAST_DURATION_MS = 5200;

const styles: Record<ToastType, { wrap: string; icon: string; bar: string }> = {
  success: {
    wrap: 'bg-[#0f1a14]/95 border-emerald-500/25 text-emerald-50 shadow-[0_12px_40px_rgba(16,185,129,0.12)]',
    icon: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20',
    bar: 'bg-emerald-400',
  },
  error: {
    wrap: 'bg-[#1a1012]/95 border-rose-500/25 text-rose-50 shadow-[0_12px_40px_rgba(244,63,94,0.12)]',
    icon: 'bg-rose-500/15 text-rose-400 ring-rose-500/20',
    bar: 'bg-rose-400',
  },
  warning: {
    wrap: 'bg-[#1a160f]/95 border-amber-500/25 text-amber-50 shadow-[0_12px_40px_rgba(245,158,11,0.12)]',
    icon: 'bg-amber-500/15 text-amber-400 ring-amber-500/20',
    bar: 'bg-amber-400',
  },
  info: {
    wrap: 'bg-[#101622]/95 border-sky-500/20 text-slate-100 shadow-[0_12px_40px_rgba(56,189,248,0.08)]',
    icon: 'bg-sky-500/15 text-sky-400 ring-sky-500/20',
    bar: 'bg-sky-400',
  },
};

function ToastIcon({ type }: { type: ToastType }) {
  const cls = 'w-4 h-4';
  if (type === 'success') return <CheckCircle2 className={cls} />;
  if (type === 'error') return <XCircle className={cls} />;
  if (type === 'warning') return <AlertCircle className={cls} />;
  return <Info className={cls} />;
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [progress, setProgress] = useState(100);
  const theme = styles[toast.type];

  useEffect(() => {
    const started = Date.now();
    const tick = () => {
      const elapsed = Date.now() - started;
      const remaining = Math.max(0, 100 - (elapsed / TOAST_DURATION_MS) * 100);
      setProgress(remaining);
      if (remaining <= 0) onDismiss(toast.id);
    };
    const id = window.setInterval(tick, 40);
    return () => window.clearInterval(id);
  }, [toast.id, onDismiss]);

  return (
    <div
      role="status"
      className={`pointer-events-auto relative overflow-hidden flex items-start gap-3 px-4 py-3.5 rounded-2xl border backdrop-blur-xl animate-in slide-in-from-right-8 fade-in duration-300 min-w-[min(100vw-2rem,380px)] max-w-md ${theme.wrap}`}
    >
      <span className={`mt-0.5 shrink-0 w-8 h-8 rounded-xl ring-1 flex items-center justify-center ${theme.icon}`}>
        <ToastIcon type={toast.type} />
      </span>
      <div className="flex-1 min-w-0 pt-0.5 text-[13px] font-medium leading-relaxed pr-1">
        {toast.message}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 p-1.5 rounded-lg text-current/50 hover:text-current hover:bg-white/10 transition-colors"
        aria-label="Kapat"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/5">
        <div className={`h-full transition-[width] duration-100 ease-linear ${theme.bar}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export const ToastStack: React.FC<{
  toasts: Toast[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => (
  <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 pointer-events-none max-w-[calc(100vw-2.5rem)]">
    {toasts.map((toast) => (
      <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
    ))}
  </div>
);
