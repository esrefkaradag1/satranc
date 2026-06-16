import React, { useRef, useEffect, useCallback } from 'react';
import { Search, Trash2, ArrowUpRight, GitBranch, MousePointer2 } from 'lucide-react';
import type { StudyChapter } from '../../lib/studyTypes';
import { formatMoveGlyphs, parseMoveGlyphs } from '../../lib/studyAnnotations';

interface StudyMoveTreeProps {
  chapter: StudyChapter | null;
  currentMoveIndex: number;
  currentVariation: [number, number, number] | null;
  onSelectMove: (idx: number, variation?: [number, number, number]) => void;
  onHoverMove?: (idx: number | null, variation?: [number, number, number]) => void;
  onDeleteFromHere?: (idx: number) => void | Promise<void>;
  onPromoteVariation?: (mainLinePos: number, varGroupIdx: number) => void;
  compact?: boolean;
}

export const StudyMoveTree: React.FC<StudyMoveTreeProps> = ({
  chapter,
  currentMoveIndex,
  currentVariation,
  onSelectMove,
  onHoverMove,
  onDeleteFromHere,
  onPromoteVariation,
  compact = false,
}) => {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = React.useState<{
    x: number; y: number; moveIdx: number; varInfo?: [number, number, number];
  } | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [currentMoveIndex, currentVariation, chapter?.id]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, moveIdx: number, varInfo?: [number, number, number]) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    setContextMenu({
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
      moveIdx,
      varInfo,
    });
  }, []);

  if (!chapter) return null;

  const moves = chapter.moves ?? [];
  const startMoveNumber = parseInt(chapter.fen?.split(' ')[5] ?? '1') || 1;
  const isBlackToMove = chapter.fen?.split(' ')[1] === 'b';
  const isInVariation = !!currentVariation;
  const variations = chapter.variations ?? {};

  const renderMoveButton = (
    san: string,
    plyIndex: number,
    isActive: boolean,
    annotation?: string | string[],
    varInfo?: [number, number, number],
  ) => {
    const isVar = !!varInfo;
    return (
      <button
        key={varInfo ? `v-${varInfo[0]}-${varInfo[1]}-${varInfo[2]}` : `m-${plyIndex}`}
        ref={isActive ? activeRef : undefined}
        type="button"
        onClick={() => {
          if (varInfo) onSelectMove(varInfo[0], varInfo);
          else onSelectMove(plyIndex + 1);
        }}
        onMouseEnter={() => {
          if (varInfo) onHoverMove?.(varInfo[0], varInfo);
          else onHoverMove?.(plyIndex + 1);
        }}
        onContextMenu={(e) => handleContextMenu(e, plyIndex, varInfo)}
        className={`inline px-1 rounded transition-all font-bold ${
          isActive
            ? 'bg-indigo-600 text-white shadow-sm'
            : isVar
            ? 'hover:bg-white/10 text-slate-400'
            : 'hover:bg-white/10 text-slate-200'
        }`}
      >
        {san}
        {annotation != null && parseMoveGlyphs(annotation).length > 0 && (
          <span className="text-[#bf811d] font-bold ml-0.5">{formatMoveGlyphs(parseMoveGlyphs(annotation))}</span>
        )}
      </button>
    );
  };

  const renderVariationBlock = (mainLineIdx: number) => {
    const varGroups = variations[mainLineIdx];
    if (!varGroups || varGroups.length === 0) return null;

    return varGroups.map((line, gi) => {
      if (!line || line.length === 0) return null;

      const varStartFenTurn = isBlackToMove
        ? ((mainLineIdx + 1) % 2 === 0 ? 'w' : 'b')
        : (mainLineIdx % 2 === 0 ? 'b' : 'w');
      
      let varMoveNumber: number;
      if (isBlackToMove) {
        varMoveNumber = startMoveNumber + Math.floor((mainLineIdx + 1) / 2);
      } else {
        varMoveNumber = startMoveNumber + Math.floor(mainLineIdx / 2);
      }

      return (
        <span key={`var-${mainLineIdx}-${gi}`} className="inline ml-1 bg-white/5 px-1 py-0.5 rounded">
          <span className="text-slate-500 font-bold opacity-50">(</span>
          {line.map((vSan, vi) => {
            const isWhiteTurn = varStartFenTurn === 'w'
              ? vi % 2 === 0
              : vi % 2 !== 0;

            let mn: number;
            if (varStartFenTurn === 'w') {
              mn = varMoveNumber + Math.floor(vi / 2);
            } else {
              mn = varMoveNumber + Math.floor((vi + 1) / 2);
            }

            const showNumber = vi === 0 || isWhiteTurn;
            const varTuple: [number, number, number] = [mainLineIdx, gi, vi];
            const isActive =
              currentVariation !== null &&
              currentVariation[0] === mainLineIdx &&
              currentVariation[1] === gi &&
              currentVariation[2] === vi;

            return (
              <span key={vi}>
                {showNumber && (
                  <span className="text-[#787472] font-bold mr-0.5 ml-0.5">
                    {mn}{isWhiteTurn ? '.' : '...'}
                  </span>
                )}
                {renderMoveButton(vSan, mainLineIdx, isActive, undefined, varTuple)}
              </span>
            );
          })}
          <span className="text-slate-500 font-bold opacity-50">)</span>
        </span>
      );
    });
  };

  const rows: React.ReactNode[] = [];
  let currentPly = 0;
  let currentMoveNumber = startMoveNumber;

  if (isBlackToMove && moves.length > 0) {
    const bm = moves[0];
    const isActive = currentMoveIndex === 1 && !isInVariation;
    rows.push(
      <span key="row-0" className="inline mr-2">
        <span className="text-slate-500 font-bold mr-1 opacity-60">{currentMoveNumber}...</span>
        <span className="inline-block">
          {renderMoveButton(bm, 0, isActive, chapter.moveAnnotations?.[0])}
        </span>
        {renderVariationBlock(0)}
      </span>
    );
    currentPly = 1;
    currentMoveNumber++;
  }

  for (let i = currentPly; i < moves.length; i += 2) {
    const wm = moves[i];
    const bm = moves[i + 1];
    const wmActive = currentMoveIndex === i + 1 && !isInVariation;
    const bmActive = bm !== undefined && currentMoveIndex === i + 2 && !isInVariation;

    rows.push(
      <span key={i} className="inline mr-2">
        <span className="text-slate-500 font-bold mr-1 opacity-60">{currentMoveNumber}.</span>
        {wm !== undefined && (
          <span className="inline-block">
            {renderMoveButton(wm, i, wmActive, chapter.moveAnnotations?.[i])}
          </span>
        )}
        {renderVariationBlock(i)}
        {bm !== undefined && (
          <span className="inline-block ml-1">
            {renderMoveButton(bm, i + 1, bmActive, chapter.moveAnnotations?.[i + 1])}
          </span>
        )}
        {bm !== undefined && renderVariationBlock(i + 1)}
      </span>
    );
    currentMoveNumber++;
  }

  return (
    <div
      ref={containerRef}
      className={`flex-1 overflow-y-auto min-h-0 bg-[#0f172a] overscroll-contain custom-scrollbar relative ${compact ? 'p-2' : 'p-4'}`}
      onMouseLeave={() => onHoverMove?.(null)}
    >
      {moves.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full py-20 opacity-40 grayscale pointer-events-none">
          <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mb-4 ring-1 ring-white/10">
            <MousePointer2 className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Bu bölümde hamle yok</p>
          <p className="text-[9px] text-slate-600 mt-1">Tahta üzerinde hamle yaparak başlayın</p>
        </div>
      ) : (
        <div className={`${compact ? 'text-[11px] leading-relaxed' : 'text-[13px] leading-loose'} font-sans text-slate-300 select-none`}>
          {rows}
        </div>
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="absolute z-50 glass-card rounded-xl border border-white/10 shadow-2xl py-1 min-w-[200px] overflow-hidden animate-in zoom-in-95"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {onDeleteFromHere && !contextMenu.varInfo && (
            <button
              type="button"
              onClick={() => {
                onDeleteFromHere(contextMenu.moveIdx);
                setContextMenu(null);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Buradan itibaren sil
            </button>
          )}
          {onPromoteVariation && contextMenu.varInfo && (
            <button
              type="button"
              onClick={() => {
                onPromoteVariation(contextMenu.varInfo![0], contextMenu.varInfo![1]);
                setContextMenu(null);
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-bold text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Ana hat yap
            </button>
          )}
          {onDeleteFromHere && contextMenu.varInfo && (
            <button
              type="button"
              onClick={() => {
                const [mlp, vgi] = contextMenu.varInfo!;
                onDeleteFromHere(-(mlp * 1000 + vgi + 1));
                setContextMenu(null);
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-bold text-rose-400 hover:bg-rose-600 hover:text-white transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Varyasyonu sil
            </button>
          )}
          <button
            type="button"
            onClick={() => setContextMenu(null)}
            className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-bold text-slate-500 hover:bg-white/5 transition-all"
          >
            İptal
          </button>
        </div>
      )}
    </div>
  );
};
