import React from 'react';
import { X, Keyboard } from 'lucide-react';
import { STUDY_KEYBOARD_SECTIONS } from '../../lib/studyKeyboardShortcuts';

type Props = {
  open: boolean;
  onClose: () => void;
};

export const StudyKeyboardHelpModal: React.FC<Props> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div className="modal-overlay z-[80]">
      <div
        className="modal-panel w-full max-w-2xl overflow-hidden rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#1e293b] shadow-2xl"
        role="dialog"
        aria-labelledby="study-kbd-help-title"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-[#0f172a]/80">
          <div className="flex items-center gap-2 min-w-0">
            <Keyboard className="w-5 h-5 text-indigo-400 shrink-0" />
            <h2 id="study-kbd-help-title" className="text-base font-black text-white truncate">
              Klavye kısayolları
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-scroll-body p-5 space-y-5 custom-scrollbar">
          {STUDY_KEYBOARD_SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300 mb-2">
                {section.title}
              </h3>
              <div className="rounded-xl border border-white/10 overflow-hidden">
                {section.rows.map((row) => (
                  <div
                    key={`${section.title}-${row.keys}`}
                    className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-white/5 last:border-b-0 bg-black/15"
                  >
                    <span className="text-sm text-slate-300">{row.label}</span>
                    <kbd className="shrink-0 text-[10px] font-bold text-slate-200 bg-white/10 border border-white/15 rounded-lg px-2 py-1 tabular-nums">
                      {row.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Metin kutusundayken kısayollar devre dışıdır. Ayarlar tarayıcıda saklanır.
          </p>
        </div>
      </div>
    </div>
  );
};
