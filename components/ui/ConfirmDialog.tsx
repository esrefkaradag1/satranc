import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, X } from 'lucide-react';

export type ConfirmDialogOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
};

export type AlertDialogOptions = {
  title?: string;
  message: string;
  okLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
};

export type ConfirmDialogRequest = ConfirmDialogOptions & {
  kind: 'confirm';
  resolve: (value: boolean) => void;
};

export type AlertDialogRequest = AlertDialogOptions & {
  kind: 'alert';
  resolve: () => void;
};

export type DialogRequest = ConfirmDialogRequest | AlertDialogRequest;

function DialogIcon({ variant }: { variant: 'danger' | 'warning' | 'info' | 'default' }) {
  if (variant === 'danger') {
    return (
      <span className="w-11 h-11 rounded-2xl bg-rose-500/15 ring-1 ring-rose-500/25 flex items-center justify-center text-rose-400">
        <AlertTriangle className="w-5 h-5" />
      </span>
    );
  }
  if (variant === 'warning') {
    return (
      <span className="w-11 h-11 rounded-2xl bg-amber-500/15 ring-1 ring-amber-500/25 flex items-center justify-center text-amber-400">
        <AlertTriangle className="w-5 h-5" />
      </span>
    );
  }
  return (
    <span className="w-11 h-11 rounded-2xl bg-sky-500/15 ring-1 ring-sky-500/25 flex items-center justify-center text-sky-400">
      <Info className="w-5 h-5" />
    </span>
  );
}

export const ConfirmDialog: React.FC<{
  request: DialogRequest | null;
  onClose: () => void;
}> = ({ request, onClose }) => {
  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (request.kind === 'confirm') request.resolve(false);
        else request.resolve();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, onClose]);

  if (!request) return null;

  const isConfirm = request.kind === 'confirm';
  const title = request.title ?? (isConfirm ? 'Emin misiniz?' : 'Bilgi');
  const iconVariant = isConfirm
    ? request.variant === 'danger'
      ? 'danger'
      : 'default'
    : request.variant ?? 'info';

  const handleBackdrop = () => {
    if (isConfirm) request.resolve(false);
    else request.resolve();
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#12161d] shadow-[0_24px_80px_rgba(0,0,0,0.55)] animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <DialogIcon variant={iconVariant} />
            <div className="flex-1 min-w-0 pt-0.5">
              <h2 id="app-dialog-title" className="text-base font-bold text-white tracking-tight">
                {title}
              </h2>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed whitespace-pre-line">
                {request.message}
              </p>
            </div>
            <button
              type="button"
              onClick={handleBackdrop}
              className="shrink-0 p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/5 bg-black/20 flex items-center justify-end gap-2">
          {isConfirm ? (
            <>
              <button
                type="button"
                onClick={() => {
                  request.resolve(false);
                  onClose();
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                {request.cancelLabel ?? 'İptal'}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  request.resolve(true);
                  onClose();
                }}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                  request.variant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30'
                }`}
              >
                {request.confirmLabel ?? 'Tamam'}
              </button>
            </>
          ) : (
            <button
              type="button"
              autoFocus
              onClick={() => {
                request.resolve();
                onClose();
              }}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30 transition-all active:scale-[0.98]"
            >
              {request.okLabel ?? 'Tamam'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
