import React from 'react';
import { Settings2, X } from 'lucide-react';
import type { StudyBoardSettings } from '../../lib/studyBoardSettings';
import { STUDY_SETTINGS_SHORTCUTS } from '../../lib/studyKeyboardShortcuts';

type Props = {
  open: boolean;
  onClose: () => void;
  settings: StudyBoardSettings;
  onToggle: (key: keyof StudyBoardSettings) => void;
};

function ToggleRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.03] cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 w-4 h-4 rounded border-white/20 bg-slate-900 accent-emerald-500"
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-slate-200 group-hover:text-white">{label}</span>
        {hint ? <span className="block text-[10px] text-slate-500 mt-0.5">{hint}</span> : null}
      </span>
    </label>
  );
}

export const StudyBoardSettingsPanel: React.FC<Props> = ({
  open,
  onClose,
  settings,
  onToggle,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center p-4 pt-16 sm:pt-20 bg-black/50 backdrop-blur-[2px]">
      <div
        className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#1a2332]/95 shadow-2xl backdrop-blur-xl overflow-hidden"
        role="dialog"
        aria-labelledby="study-board-settings-title"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-indigo-400" />
            <h2 id="study-board-settings-title" className="text-sm font-black text-white uppercase tracking-wide">
              Tahta ayarları
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

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="rounded-xl border border-white/10 bg-black/20 p-3">
            <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 px-1 mb-2">
              Klavye kısayolları
            </h3>
            <div className="space-y-1">
              {STUDY_SETTINGS_SHORTCUTS.map((row) => (
                <div key={row.keys} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg">
                  <span className="text-xs text-slate-400">{row.label}</span>
                  <kbd className="text-[9px] font-bold text-slate-300 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                    {row.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-black/20 p-3">
            <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 px-1 mb-2">
              Genel
            </h3>
            <ToggleRow
              label="Değerlendirme çubuğu"
              checked={settings.showEvalBar}
              onChange={() => onToggle('showEvalBar')}
            />
            <ToggleRow
              label="Motor analizi"
              hint="Sağ panelde Stockfish satırları"
              checked={settings.showEngineAnalysis}
              onChange={() => onToggle('showEngineAnalysis')}
            />
          </section>

          <section className="rounded-xl border border-white/10 bg-black/20 p-3">
            <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 px-1 mb-2">
              Hamle listesi
            </h3>
            <ToggleRow
              label="Satır içi notasyon"
              hint="Tek satırda PGN — klavye: Shift + I"
              checked={settings.inlineNotation}
              onChange={() => onToggle('inlineNotation')}
            />
            <ToggleRow
              label="Hamle sembolleri"
              checked={settings.showMoveAnnotations}
              onChange={() => onToggle('showMoveAnnotations')}
            />
          </section>

          <section className="rounded-xl border border-white/10 bg-black/20 p-3">
            <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 px-1 mb-2">
              Tahta
            </h3>
            <ToggleRow
              label="En iyi hamle okları"
              hint="Klavye: a"
              checked={settings.showBestMoveArrows}
              onChange={() => onToggle('showBestMoveArrows')}
            />
            <ToggleRow
              label="Varyasyon okları"
              hint="Motor satırına gelince önizleme — klavye: v"
              checked={settings.showVariationArrows}
              onChange={() => onToggle('showVariationArrows')}
            />
            <ToggleRow
              label="Rakip tehditleri"
              hint="Savunmasız taşları vurgula — klavye: x"
              checked={settings.showThreats}
              onChange={() => onToggle('showThreats')}
            />
          </section>
        </div>
      </div>
    </div>
  );
};
