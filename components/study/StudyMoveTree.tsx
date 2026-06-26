import React, { useRef, useEffect, useCallback } from 'react';
import { Trash2, ArrowUpRight, MousePointer2 } from 'lucide-react';
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
  inlineNotation?: boolean;
  showMoveAnnotations?: boolean;
}

/** Varyasyon satırındaki hamle numarası ve nokta (1. / 1...) */
function moveNumberLabel(moveNumber: number, isWhiteTurn: boolean): string {
  return `${moveNumber}${isWhiteTurn ? '.' : '...'}`;
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
  inlineNotation = false,
  showMoveAnnotations = true,
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

  const textSize = compact ? 'text-[11px]' : 'text-[13px]';
  const rowGrid = 'grid grid-cols-[2rem_1fr_1fr] gap-x-1.5 items-stretch w-full';
  const indexCell = `text-[11px] font-bold text-slate-500 text-right pr-1.5 tabular-nums bg-slate-800/50 flex items-center justify-end ${compact ? 'py-1' : 'py-1.5'}`;
  const moveCell = `min-w-0 flex items-center ${compact ? 'py-0.5' : 'py-1'}`;

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
        className={`inline-flex items-center px-1.5 rounded font-bold transition-colors ${
          isActive
            ? 'bg-[#3692e7] text-white shadow-sm'
            : isVar
            ? 'text-slate-400 hover:bg-white/10'
            : 'text-slate-200 hover:bg-white/10'
        }`}
      >
        {san}
        {showMoveAnnotations && annotation != null && parseMoveGlyphs(annotation).length > 0 && (
          <span className="text-amber-500 font-bold ml-0.5">{formatMoveGlyphs(parseMoveGlyphs(annotation))}</span>
        )}
      </button>
    );
  };

  const renderVariationLines = (mainLineIdx: number) => {
    const varGroups = variations[mainLineIdx];
    if (!varGroups?.length) return null;

    const varStartFenTurn = isBlackToMove
      ? ((mainLineIdx + 1) % 2 === 0 ? 'w' : 'b')
      : (mainLineIdx % 2 === 0 ? 'b' : 'w');

    let varMoveNumber: number;
    if (isBlackToMove) {
      varMoveNumber = startMoveNumber + Math.floor((mainLineIdx + 1) / 2);
    } else {
      varMoveNumber = startMoveNumber + Math.floor(mainLineIdx / 2);
    }

    return varGroups.map((line, gi) => {
      if (!line?.length) return null;

      return (
        <div
          key={`var-${mainLineIdx}-${gi}`}
          className={`w-full flex flex-wrap items-center gap-x-0.5 gap-y-0.5 pl-3 ml-1 border-l-2 border-slate-600/40 ${compact ? 'py-1 my-0.5' : 'py-1.5 my-1'} text-slate-400 ${textSize}`}
        >
          {line.map((vSan, vi) => {
            const isWhiteTurn = varStartFenTurn === 'w' ? vi % 2 === 0 : vi % 2 !== 0;
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
              <span key={vi} className="inline-flex items-center">
                {showNumber && (
                  <span className="text-slate-500 font-bold mr-0.5 tabular-nums">
                    {moveNumberLabel(mn, isWhiteTurn)}
                  </span>
                )}
                {renderMoveButton(vSan, mainLineIdx, isActive, undefined, varTuple)}
              </span>
            );
          })}
        </div>
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
      <div key="row-black-first" className="w-full">
        <div className={rowGrid}>
          <span className={indexCell}>{currentMoveNumber}</span>
          <div className={moveCell} />
          <div className={moveCell}>
            <span className="text-slate-500 font-bold mr-1 tabular-nums">{currentMoveNumber}...</span>
            {renderMoveButton(bm, 0, isActive, chapter.moveAnnotations?.[0])}
          </div>
        </div>
        {renderVariationLines(0)}
      </div>,
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
      <div key={`row-${i}`} className="w-full">
        <div className={rowGrid}>
          <span className={indexCell}>{currentMoveNumber}</span>
          <div className={moveCell}>
            {wm !== undefined && renderMoveButton(wm, i, wmActive, chapter.moveAnnotations?.[i])}
          </div>
          <div className={moveCell}>
            {bm !== undefined && renderMoveButton(bm, i + 1, bmActive, chapter.moveAnnotations?.[i + 1])}
          </div>
        </div>
        {renderVariationLines(i)}
        {bm !== undefined && renderVariationLines(i + 1)}
      </div>,
    );
    currentMoveNumber++;
  }

  if (inlineNotation) {
    const inlineNodes: React.ReactNode[] = [];
    let inlinePly = 0;
    let inlineMoveNumber = startMoveNumber;

    const pushMainMove = (san: string, plyIndex: number, annotation?: string | string[]) => {
      const isActive = currentMoveIndex === plyIndex + 1 && !isInVariation;
      const isWhiteTurn = isBlackToMove ? plyIndex % 2 !== 0 : plyIndex % 2 === 0;
      if (plyIndex === 0 && isBlackToMove) {
        inlineNodes.push(
          <span key={`n-${plyIndex}`} className="text-slate-500 font-bold mr-0.5 tabular-nums">
            {inlineMoveNumber}...
          </span>,
        );
      } else if (isWhiteTurn) {
        inlineNodes.push(
          <span key={`n-${plyIndex}`} className="text-slate-500 font-bold mr-0.5 tabular-nums">
            {inlineMoveNumber}.
          </span>,
        );
        if (!isBlackToMove || plyIndex > 0) inlineMoveNumber++;
      }
      inlineNodes.push(renderMoveButton(san, plyIndex, isActive, annotation));
      const varGroups = variations[plyIndex];
      if (varGroups?.length) {
        varGroups.forEach((line, gi) => {
          if (!line?.length) return;
          inlineNodes.push(
            <span key={`paren-${plyIndex}-${gi}`} className="text-slate-500 mx-0.5">
              (
            </span>,
          );
          line.forEach((vSan, vi) => {
            const varTuple: [number, number, number] = [plyIndex, gi, vi];
            const isActive =
              currentVariation !== null &&
              currentVariation[0] === plyIndex &&
              currentVariation[1] === gi &&
              currentVariation[2] === vi;
            const varStartFenTurn = isBlackToMove
              ? ((plyIndex + 1) % 2 === 0 ? 'w' : 'b')
              : (plyIndex % 2 === 0 ? 'b' : 'w');
            const isWhiteVarTurn = varStartFenTurn === 'w' ? vi % 2 === 0 : vi % 2 !== 0;
            let mn: number;
            if (isBlackToMove) {
              mn = startMoveNumber + Math.floor((plyIndex + 1) / 2);
            } else {
              mn = startMoveNumber + Math.floor(plyIndex / 2);
            }
            if (varStartFenTurn === 'w') mn += Math.floor(vi / 2);
            else mn += Math.floor((vi + 1) / 2);
            if (vi === 0 || isWhiteVarTurn) {
              inlineNodes.push(
                <span key={`vn-${plyIndex}-${gi}-${vi}`} className="text-slate-500 font-bold mr-0.5 tabular-nums">
                  {moveNumberLabel(mn, isWhiteVarTurn)}
                </span>,
              );
            }
            inlineNodes.push(renderMoveButton(vSan, plyIndex, isActive, undefined, varTuple));
          });
          inlineNodes.push(
            <span key={`paren-end-${plyIndex}-${gi}`} className="text-slate-500 mx-0.5">
              )
            </span>,
          );
        });
      }
    };

    if (isBlackToMove && moves.length > 0) {
      pushMainMove(moves[0], 0, chapter.moveAnnotations?.[0]);
      inlinePly = 1;
      inlineMoveNumber++;
    }
    for (let i = inlinePly; i < moves.length; i++) {
      pushMainMove(moves[i], i, chapter.moveAnnotations?.[i]);
    }

    return (
      <div
        ref={containerRef}
        className={`flex-1 overflow-y-auto min-h-0 bg-[#0f172a] overscroll-contain custom-scrollbar relative [contain:layout] ${compact ? 'p-2' : 'p-3'}`}
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
          <div className={`${textSize} font-sans text-slate-300 select-none leading-relaxed`}>
            <div className="flex flex-wrap items-baseline gap-x-0.5 gap-y-1">
              {inlineNodes}
            </div>
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
  }

  return (
    <div
      ref={containerRef}
      className={`flex-1 overflow-y-auto min-h-0 bg-[#0f172a] overscroll-contain custom-scrollbar relative [contain:layout] ${compact ? 'p-2' : 'p-3'}`}
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
        <div className={`${textSize} font-sans text-slate-300 select-none space-y-0.5`}>
          <div className={`${rowGrid} px-0 pb-1 mb-1 border-b border-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-500`}>
            <span />
            <span>Beyaz</span>
            <span>Siyah</span>
          </div>
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
