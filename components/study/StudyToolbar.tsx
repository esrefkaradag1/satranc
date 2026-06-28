import React from 'react';
import { ArrowLeft, Check, Settings2, SkipBack, ChevronLeft, ChevronRight, SkipForward, FlipHorizontal, LayoutGrid } from 'lucide-react';
import type { Study, StudyChapter } from '../../lib/studyTypes';
import { studyDisplayEmoji } from '../../lib/studyUtils';

interface StudyToolbarProps {
  study: Study;
  chapter: StudyChapter | null;
  recording: boolean;
  onBack: () => void;
  onUpdateStudy: (updates: Partial<Study>) => void;
  onToggleRecording: () => void;
  onOpenSettings: () => void;
}

export const StudyToolbar: React.FC<StudyToolbarProps> = ({
  study,
  chapter,
  recording,
  onBack,
  onUpdateStudy,
  onToggleRecording,
  onOpenSettings,
}) => {
  return (
    <div className="px-4 py-2 flex items-center justify-between border-b border-white/5 bg-[#1b1e23] gap-3 shrink-0">
      <div className="flex items-center gap-2 overflow-hidden">
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 p-1.5 text-slate-500 hover:text-white rounded-lg transition-colors"
          title="Çalışmalara dön"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex flex-col min-w-0">
          <h1 className="text-sm font-bold text-white truncate flex items-center gap-1.5">
            <span className="text-lg leading-none">{studyDisplayEmoji(study)}</span>
            {study.title}
          </h1>
          <p className="text-[10px] text-slate-500 font-medium truncate">{chapter?.title}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/5">
          <button
            type="button"
            onClick={() => onUpdateStudy({ syncEnabled: !study.syncEnabled })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-extrabold uppercase tracking-tighter transition-all ${
              study.syncEnabled
                ? 'text-teal-400 bg-teal-500/10'
                : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            <Check className={`w-3 h-3 ${study.syncEnabled ? 'opacity-100' : 'opacity-0'}`} />
            SYNC
          </button>
          <button
            type="button"
            onClick={onToggleRecording}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-extrabold uppercase tracking-tighter transition-all ${
              recording
                ? 'text-rose-400 bg-rose-500/10'
                : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${recording ? 'bg-rose-500 animate-pulse' : 'bg-slate-600'}`} />
            REC
          </button>
        </div>

        <div className="w-px h-6 bg-white/5 mx-1" />

        <button
          type="button"
          onClick={onOpenSettings}
          className="p-2 text-slate-500 hover:text-teal-400 transition-colors"
          title="Çalışma ayarları"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

interface BoardControlsProps {
  onFlip: () => void;
  onGoStart: () => void;
  onGoPrev: () => void;
  onGoNext: () => void;
  onGoEnd: () => void;
  onOpenBuilder: () => void;
}

export const BoardControls: React.FC<BoardControlsProps> = ({
  onFlip,
  onGoStart,
  onGoPrev,
  onGoNext,
  onGoEnd,
  onOpenBuilder,
}) => {
  return (
    <div className="w-full max-w-[min(66vh,66vw)] mt-4 flex items-center gap-2 justify-center shrink-0">
      <button 
        type="button" 
        onClick={onFlip} 
        className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors shadow-lg" 
        title="Tahtayı Döndür"
      >
        <FlipHorizontal className="w-5 h-5" />
      </button>

      <div className="flex-1" />

      <div className="flex bg-slate-800/80 rounded-xl overflow-hidden shadow-lg p-1 border border-white/5">
        {[
          { fn: onGoStart, icon: <SkipBack className="w-5 h-5" />, title: 'Başa (↑)' },
          { fn: onGoPrev,  icon: <ChevronLeft className="w-6 h-6" />, title: 'Önceki (←)' },
          { fn: onGoNext,  icon: <ChevronRight className="w-6 h-6" />, title: 'Sonraki (→)' },
          { fn: onGoEnd,   icon: <SkipForward className="w-5 h-5" />, title: 'Sona (↓)' },
        ].map(({ fn, icon, title }, idx) => (
          <button
            key={idx}
            type="button"
            onClick={fn}
            className="px-6 py-2.5 text-slate-400 hover:text-white hover:bg-white/5 transition-all active:scale-95 border-r border-white/5 last:border-0"
            title={title}
          >
            {icon}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <button 
        type="button" 
        onClick={onOpenBuilder} 
        className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors shadow-lg" 
        title="Tahta Yapıcı"
      >
        <LayoutGrid className="w-5 h-5" />
      </button>
    </div>
  );
};
