import React, { useState } from 'react';
import { Square, X as CloseIcon, MousePointer2, Eraser, MoveUpRight, Brush, Copy, ChevronRight, Circle, Pencil } from 'lucide-react';
import { SquareMarkColor, COLOR_VALUES } from '../lib/chessBoardUi';

export type DrawingTool = 'square' | 'circle' | 'x' | 'arrow' | 'highlighter' | 'eraser' | 'mouse';

interface DrawingToolbarProps {
  onToolSelect: (tool: DrawingTool, color: SquareMarkColor) => void;
  onClear: () => void;
  onCopy: () => void;
  currentTool: DrawingTool;
  currentColor: SquareMarkColor;
  orientation?: 'horizontal' | 'vertical';
}

const COLORS: SquareMarkColor[] = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'cyan', 'lime'];

const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  onToolSelect,
  onClear,
  onCopy,
  currentTool,
  currentColor,
  orientation = 'horizontal',
}) => {
  const [openSubMenu, setOpenSubMenu] = useState<DrawingTool | null>(null);

  const tools: { id: DrawingTool; icon: React.ReactNode; hasColor?: boolean; label: string }[] = [
    { id: 'mouse', icon: <MousePointer2 className="w-4 h-4" />, label: 'Seç' },
    { id: 'square', icon: <Square className="w-4 h-4" />, hasColor: true, label: 'Kare' },
    { id: 'x', icon: <CloseIcon className="w-4 h-4" />, hasColor: true, label: 'Çarpı' },
    { id: 'circle', icon: <Circle className="w-4 h-4" />, hasColor: true, label: 'Daire' },
    { id: 'arrow', icon: <MoveUpRight className="w-4 h-4" />, hasColor: true, label: 'Ok' },
  ];

  const handleToolClick = (toolId: DrawingTool) => {
    if (openSubMenu === toolId) {
      setOpenSubMenu(null);
    } else {
      setOpenSubMenu(toolId);
      onToolSelect(toolId, currentColor);
    }
  };

  const handleColorSelect = (color: SquareMarkColor) => {
    if (openSubMenu) {
      onToolSelect(openSubMenu, color);
      setOpenSubMenu(null);
    }
  };

  const btnSize = 'w-9 h-9 sm:w-10 sm:h-10';
  const isVertical = orientation === 'vertical';
  const dividerClass = isVertical ? 'h-px w-6 bg-white/10 my-1' : 'w-px h-6 bg-white/10 mx-1';

  return (
    <div className={`flex shrink-0 ${isVertical ? 'flex-col items-center gap-0.5' : 'items-center gap-0.5'}`}>
      {/* Drawing tools */}
      {tools.map((tool) => (
        <div key={tool.id} className="relative shrink-0">
          <button
            type="button"
            onClick={() => handleToolClick(tool.id)}
            className={`${btnSize} flex flex-col items-center justify-center rounded-lg transition-all relative ${
              currentTool === tool.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 ring-1 ring-indigo-400/40'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title={tool.label}
          >
            <div style={{ color: currentTool === tool.id && tool.hasColor ? COLOR_VALUES[currentColor] : undefined }}>
              {tool.icon}
            </div>
            {tool.hasColor && (
              <ChevronRight
                className={`w-2 h-2 absolute opacity-40 ${
                  isVertical ? 'bottom-1 right-1 rotate-90' : 'bottom-1 right-1 rotate-90'
                }`}
              />
            )}
          </button>

          {/* Color Sub-Menu */}
          {openSubMenu === tool.id && tool.hasColor && (
            <div
              className={`absolute z-[110] flex bg-[#1b1e23] backdrop-blur-xl p-1.5 rounded-xl shadow-2xl border border-white/10 gap-1 animate-in fade-in zoom-in-95 duration-200 ${
                isVertical
                  ? 'left-full top-1/2 -translate-y-1/2 ml-2 flex-row flex-wrap max-w-[9.5rem]'
                  : 'bottom-full left-1/2 -translate-x-1/2 mb-2 items-center slide-in-from-bottom-2'
              }`}
            >
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleColorSelect(c)}
                  className={`w-7 h-7 rounded-lg border transition-all hover:scale-110 ${
                    currentColor === c && currentTool === tool.id
                      ? 'ring-2 ring-indigo-400 border-white'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                  style={{ backgroundColor: COLOR_VALUES[c] }}
                  title={c}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Divider */}
      <div className={dividerClass} />

      {/* Eraser */}
      <button
        type="button"
        onClick={() => { setOpenSubMenu(null); onToolSelect('eraser', currentColor); }}
        className={`${btnSize} shrink-0 flex items-center justify-center rounded-lg transition-all ${
          currentTool === 'eraser'
            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 ring-1 ring-indigo-400/40'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
        }`}
        title="Silgi"
      >
        <Eraser className="w-4 h-4" />
      </button>

      {/* Divider */}
      <div className={dividerClass} />

      {/* Clear */}
      <button
        type="button"
        onClick={onClear}
        className={`${btnSize} shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all`}
        title="Temizle"
      >
        <Brush className="w-4 h-4" />
      </button>

      {/* Copy FEN */}
      <button
        type="button"
        onClick={onCopy}
        className={`${btnSize} shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/15 transition-all`}
        title="FEN Kopyala"
      >
        <Copy className="w-4 h-4" />
      </button>
    </div>
  );
};

export { DrawingToolbar };
