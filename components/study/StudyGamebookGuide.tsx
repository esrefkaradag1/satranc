import React from 'react';
import { Play, RotateCcw, Microscope, RefreshCw, ChevronRight } from 'lucide-react';

export type GamebookFeedbackMode = 'play' | 'good' | 'bad' | 'end' | 'info';

export type GamebookFloorAction = {
  id: string;
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'danger' | 'neutral' | 'success';
  icon?: 'play' | 'retry' | 'analyse' | 'next' | 'refresh';
};

type Props = {
  /** Konuşma balonu metni (HTML yok — düz metin) */
  comment: string;
  feedback?: GamebookFeedbackMode;
  /** play: sıradaki renk için şah ikonu */
  turnColor?: 'white' | 'black';
  /** play altındaki kısa talimat */
  instruction?: string;
  /** Floor butonları (Tekrar dene / Sonraki / Analiz) */
  actions?: GamebookFloorAction[];
  /** İpucu satırı (balon altında) */
  hint?: string | null;
  className?: string;
};

const ACTION_ICONS = {
  play: Play,
  retry: RotateCcw,
  analyse: Microscope,
  next: ChevronRight,
  refresh: RefreshCw,
} as const;

const VARIANT_CLASS: Record<NonNullable<GamebookFloorAction['variant']>, string> = {
  primary: 'bg-sky-600 hover:bg-sky-500 text-white',
  danger: 'bg-rose-600 hover:bg-rose-500 text-white',
  success: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  neutral: 'bg-slate-700 hover:bg-slate-600 text-slate-100',
};

/** SatrançEdu rehber maskotu — 3D at (Lichess ahtapotundan bağımsız) */
const MASCOT_SRC = '/mascot-knight-3d.png';

/**
 * İnteraktif ders / bulmaca rehber paneli:
 * konuşma balonu + floor (aksiyonlar + SatrançEdu 3D maskot).
 */
export const StudyGamebookGuide: React.FC<Props> = ({
  comment,
  feedback = 'play',
  turnColor = 'white',
  instruction,
  actions = [],
  hint,
  className = '',
}) => {
  const showInfoFloor = feedback === 'play' || feedback === 'info' || feedback === 'good';
  const showKing = feedback === 'play';

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Konuşma balonu — kuyruk maskota bakar */}
      <div className="relative rounded-2xl bg-[#1e293b] border border-white/10 shadow-xl">
        <div className="px-4 py-3 text-sm font-medium leading-relaxed text-slate-200 whitespace-pre-wrap">
          {comment}
        </div>
        {hint ? (
          <button
            type="button"
            className="w-full text-left px-4 py-2.5 rounded-b-2xl bg-sky-600/90 text-white text-xs font-bold border-t border-sky-400/30"
          >
            {hint}
          </button>
        ) : null}
        <div
          className="pointer-events-none absolute -bottom-2 right-[18%] h-3.5 w-3.5 rotate-45 border-r border-b border-white/10 bg-[#1e293b]"
          aria-hidden
        />
      </div>

      {/* Floor: feedback + mascot */}
      <div className="flex items-stretch gap-3 min-h-[5.5rem]">
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {actions.length > 0 ? (
            <div
              className={`grid overflow-hidden rounded-xl border border-white/10 ${
                actions.length === 1 ? 'grid-cols-1' : actions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
              }`}
            >
              {actions.map((a, i) => {
                const Icon = a.icon ? ACTION_ICONS[a.icon] : null;
                const variant = a.variant ?? (feedback === 'bad' ? 'danger' : 'primary');
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={a.onClick}
                    className={`flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 text-[11px] font-black uppercase tracking-wide transition-colors active:scale-[0.98] ${
                      VARIANT_CLASS[variant]
                    } ${i > 0 ? 'border-l border-white/20' : ''}`}
                  >
                    {Icon ? <Icon className="w-5 h-5" strokeWidth={2.5} /> : null}
                    <span className="leading-tight text-center">{a.label}</span>
                  </button>
                );
              })}
            </div>
          ) : showInfoFloor ? (
            <div className="h-full rounded-xl border border-white/10 bg-[#0f172a]/80 px-3 py-3 flex items-center gap-3">
              {showKing ? (
                <div className="w-14 h-14 shrink-0 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center">
                  <span
                    className={`text-4xl leading-none ${turnColor === 'white' ? 'text-white drop-shadow' : 'text-slate-900'}`}
                    style={turnColor === 'black' ? { textShadow: '0 0 1px #fff, 0 0 2px #fff' } : undefined}
                    aria-hidden
                  >
                    ♔
                  </span>
                </div>
              ) : null}
              <div className="min-w-0">
                <p className="text-sm font-black text-white tracking-tight">
                  {feedback === 'good' ? 'İyi hamle!' : 'Sıra sizde'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                  {instruction
                    ?? (turnColor === 'white'
                      ? 'Beyaz için en iyi hamleyi bulunuz'
                      : 'Siyah için en iyi hamleyi bulunuz')}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="study-gamebook-mascot-wrap" aria-hidden>
          <img
            src={MASCOT_SRC}
            alt=""
            width={120}
            height={120}
            className="study-gamebook-mascot"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
};

export default StudyGamebookGuide;
