import React from 'react';
import { Box, Grid3x3 } from 'lucide-react';
import type { BoardViewMode } from '../../hooks/useBoardViewMode';

type Props = {
  mode: BoardViewMode;
  onChange: (mode: BoardViewMode) => void;
  className?: string;
};

export const BoardViewToggle: React.FC<Props> = ({ mode, onChange, className = '' }) => (
  <div
    className={`inline-flex items-center rounded-xl border border-white/10 bg-slate-900/80 p-0.5 shadow-lg ${className}`}
    role="group"
    aria-label="Tahta görünümü"
  >
    <button
      type="button"
      onClick={() => onChange('2d')}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${
        mode === '2d'
          ? 'bg-indigo-600 text-white shadow-md'
          : 'text-slate-400 hover:text-white hover:bg-white/5'
      }`}
      title="2D tahta"
    >
      <Grid3x3 className="w-3.5 h-3.5" />
      2D
    </button>
    <button
      type="button"
      onClick={() => onChange('3d')}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${
        mode === '3d'
          ? 'bg-violet-600 text-white shadow-md'
          : 'text-slate-400 hover:text-white hover:bg-white/5'
      }`}
      title="3D tahta — döndürmek için sürükleyin"
    >
      <Box className="w-3.5 h-3.5" />
      3D
    </button>
  </div>
);
