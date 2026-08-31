import React, { useCallback, useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  APP_BUILD_ID,
  APP_RELEASE,
  acknowledgeAppBuild,
  shouldShowAdminUpdateModal,
} from '../../lib/appRelease';

export const AdminAppUpdateModal: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (shouldShowAdminUpdateModal()) {
      setOpen(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    acknowledgeAppBuild();
    setOpen(false);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-update-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-indigo-500/35 bg-[#0f172a] shadow-2xl shadow-indigo-950/50 overflow-hidden">
        <div className="premium-gradient px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Sürüm güncellendi
            </p>
            <h2 id="admin-update-title" className="text-lg font-black text-white mt-1">
              {APP_RELEASE.title}
            </h2>
            <p className="text-xs text-white/80 mt-0.5">
              {APP_RELEASE.versionLabel} · build {APP_BUILD_ID.slice(0, 12)}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[min(50vh,360px)] overflow-y-auto">
          <p className="text-sm text-slate-300 leading-relaxed">
            Siteye yeni bir sürüm yüklendi. Öne çıkan değişiklikler:
          </p>
          <ul className="space-y-2">
            {APP_RELEASE.highlights.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-slate-300 leading-snug">
                <span className="text-indigo-400 font-bold shrink-0">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-5 py-4 border-t border-white/10 bg-slate-900/50 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
          >
            Tamam, anladım
          </button>
        </div>
      </div>
    </div>
  );
};
