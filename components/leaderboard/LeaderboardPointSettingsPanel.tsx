import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Save, Settings2 } from 'lucide-react';
import {
  DEFAULT_LEADERBOARD_POINT_SETTINGS,
  LEADERBOARD_SCORING_MODES,
  type LeaderboardPointSettings,
  normalizeLeaderboardPointSettings,
} from '../../lib/leaderboardPointSettings';

type Props = {
  settings: LeaderboardPointSettings;
  canEdit: boolean;
  clubName?: string;
  onSave: (settings: LeaderboardPointSettings) => void;
};

export const LeaderboardPointSettingsPanel: React.FC<Props> = ({
  settings,
  canEdit,
  clubName,
  onSave,
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LeaderboardPointSettings>(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const updateMode = (
    mode: (typeof LEADERBOARD_SCORING_MODES)[number]['id'],
    field: 'win' | 'draw' | 'loss',
    value: string,
  ) => {
    const n = Math.max(0, Math.round(Number(value) || 0));
    setDraft((prev) => ({
      ...prev,
      [mode]: { ...prev[mode], [field]: n },
    }));
  };

  const handleSave = () => {
    onSave(normalizeLeaderboardPointSettings(draft));
  };

  const handleReset = () => {
    setDraft({ ...DEFAULT_LEADERBOARD_POINT_SETTINGS });
  };

  return (
    <div className="rounded-2xl bg-[#1e293b] border border-white/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Settings2 className="w-4 h-4 text-indigo-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-white">Aktivite Puan Ayarları</div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {clubName ? `${clubName} · ` : ''}Bulmaca ve mod bazlı maç puanları (Rapid, Blitz, Bullet…)
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-white/5 pt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 items-center max-w-xs">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Bulmaca (puan)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={draft.puzzle}
              disabled={!canEdit}
              onChange={(e) => setDraft((prev) => ({ ...prev, puzzle: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-white text-sm disabled:opacity-60"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/5 bg-slate-900/50">
                  <th className="px-3 py-2.5 text-left font-bold">Mod</th>
                  <th className="px-3 py-2.5 text-center font-bold">Galibiyet</th>
                  <th className="px-3 py-2.5 text-center font-bold">Beraberlik</th>
                  <th className="px-3 py-2.5 text-center font-bold">Mağlubiyet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {LEADERBOARD_SCORING_MODES.map(({ id, label }) => (
                  <tr key={id}>
                    <td className="px-3 py-2.5 font-semibold text-white">{label}</td>
                    {(['win', 'draw', 'loss'] as const).map((field) => (
                      <td key={field} className="px-3 py-2.5">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={draft[id][field]}
                          disabled={!canEdit}
                          onChange={(e) => updateMode(id, field, e.target.value)}
                          className="w-full max-w-[88px] mx-auto block px-2 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-white text-sm text-center disabled:opacity-60"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
              >
                <Save className="w-3.5 h-3.5" /> Kaydet
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Varsayılana dön
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Puan ayarlarını yalnızca kulüp veya admin hesabı düzenleyebilir.</p>
          )}
        </div>
      )}
    </div>
  );
};
