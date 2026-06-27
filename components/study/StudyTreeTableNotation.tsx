import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, ArrowUpRight } from 'lucide-react';
import type { StudyTree, NodeId } from '../../lib/studySync/types';
import { pathToNode } from '../../lib/studySync/apply';
import { sideToMove } from '../../lib/studyUtils';
import { formatMoveGlyphs, parseMoveGlyphs } from '../../lib/studyAnnotations';
import { FigurineSan } from '../chess/FigurineSan';

type Props = {
  tree: StudyTree;
  startFen: string;
  currentPath: NodeId[];
  onSelectPath: (path: NodeId[]) => void;
  onDeleteFromNode?: (nodeId: NodeId) => void | Promise<void>;
  onPromoteBranch?: (branchNodeId: NodeId) => void | Promise<void>;
  showMoveAnnotations?: boolean;
  figurineNotation?: boolean;
  compact?: boolean;
  activeRef?: React.RefObject<HTMLButtonElement | null>;
};

function moveNumberLabel(moveNumber: number, isWhiteTurn: boolean): string {
  return `${moveNumber}${isWhiteTurn ? '.' : '...'}`;
}

/** Varyasyon dalının kök düğümü (ana hattan ayrılan ilk hamle). */
export function variationBranchRootId(tree: StudyTree, nodeId: NodeId): NodeId | null {
  const mainSet = new Set(tree.mainline ?? []);
  if (nodeId === tree.rootId) return null;
  let cur: NodeId | null = nodeId;
  while (cur && cur !== tree.rootId) {
    const node = tree.nodes[cur];
    const parentId = node?.parentId;
    if (!parentId) break;
    const parentIdx = tree.mainline.indexOf(parentId);
    const mainChildId = parentIdx >= 0 ? tree.mainline[parentIdx + 1] : parent.children?.[0];
    if (mainSet.has(parentId) && cur !== mainChildId) return cur;
    cur = parentId;
  }
  return null;
}

function branchLineSignature(tree: StudyTree, startId: NodeId, mainSet: Set<NodeId>): string {
  const parts: string[] = [];
  let cur: NodeId | null = startId;
  let guard = 0;
  while (cur && guard++ < 64) {
    const node = tree.nodes[cur];
    if (!node?.san) break;
    parts.push(node.san);
    const nextId = node.children?.[0] ?? null;
    if (!nextId || mainSet.has(nextId)) break;
    cur = nextId;
  }
  return parts.join('\0');
}

export const StudyTreeTableNotation: React.FC<Props> = ({
  tree,
  startFen,
  currentPath,
  onSelectPath,
  onDeleteFromNode,
  onPromoteBranch,
  showMoveAnnotations = true,
  figurineNotation = true,
  compact = false,
  activeRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: NodeId;
    branchId: NodeId | null;
  } | null>(null);

  const activeNodeId = currentPath[currentPath.length - 1] ?? tree.rootId;
  const startMoveNumber = parseInt(startFen.split(' ')[5] ?? '1', 10) || 1;
  const isBlackToMove = startFen.split(' ')[1] === 'b';
  const textSize = compact ? 'text-[11px]' : 'text-[13px]';
  const mainline = tree.mainline ?? [];
  const mainSet = useMemo(() => new Set(mainline), [mainline]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [contextMenu]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, nodeId: NodeId) => {
      if (nodeId === tree.rootId) return;
      if (!onDeleteFromNode && !onPromoteBranch) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = containerRef.current?.getBoundingClientRect();
      setContextMenu({
        x: e.clientX - (rect?.left ?? 0),
        y: e.clientY - (rect?.top ?? 0),
        nodeId,
        branchId: variationBranchRootId(tree, nodeId),
      });
    },
    [onDeleteFromNode, onPromoteBranch, tree],
  );

  const renderMoveButton = (nodeId: NodeId, isVar = false) => {
    const node = tree.nodes[nodeId];
    if (!node?.san) return null;
    const isActive = nodeId === activeNodeId;
    const annotation = node.glyphs?.length ? node.glyphs : undefined;
    const canMenu = nodeId !== tree.rootId && (!!onDeleteFromNode || !!onPromoteBranch);

    return (
      <button
        key={`btn-${nodeId}`}
        ref={isActive ? activeRef : undefined}
        type="button"
        onClick={() => onSelectPath(pathToNode(tree, nodeId))}
        onContextMenu={canMenu ? (e) => handleContextMenu(e, nodeId) : undefined}
        className={`inline-flex items-center px-1.5 rounded font-bold transition-colors ${
          isActive
            ? 'bg-[#3692e7] text-white shadow-sm'
            : isVar
              ? 'text-slate-300 hover:bg-white/10'
              : 'text-slate-200 hover:bg-white/10'
        }`}
      >
        <FigurineSan san={node.san} figurine={figurineNotation} />
        {showMoveAnnotations && annotation != null && parseMoveGlyphs(annotation).length > 0 && (
          <span className="text-amber-500 font-bold ml-0.5">{formatMoveGlyphs(parseMoveGlyphs(annotation))}</span>
        )}
      </button>
    );
  };

  const mainChildId = (nodeId: NodeId): NodeId | null => {
    const idx = mainline.indexOf(nodeId);
    if (idx >= 0 && mainline[idx + 1]) return mainline[idx + 1]!;
    const node = tree.nodes[nodeId];
    return node?.children?.find((cid) => cid && mainSet.has(cid)) ?? node?.children?.[0] ?? null;
  };

  const altChildIds = (nodeId: NodeId): NodeId[] => {
    const node = tree.nodes[nodeId];
    if (!node?.children?.length) return [];
    const mainId = mainChildId(nodeId);
    return node.children.filter((cid): cid is NodeId => !!cid && cid !== mainId);
  };

  const renderBranchLine = (startId: NodeId, branchStartFen: string): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    let cur: NodeId | null = startId;
    let guard = 0;
    let moveNumber = startMoveNumber;
    let first = true;

    while (cur && guard++ < 256) {
      const node = tree.nodes[cur];
      if (!node?.san) break;

      const parent = node.parentId ? tree.nodes[node.parentId] : null;
      const parentFen = parent?.fen ?? branchStartFen;
      const isWhiteTurn = sideToMove(parentFen) === 'white';

      const showNumber = first || isWhiteTurn;
      if (isWhiteTurn && !first) moveNumber++;

      if (showNumber) {
        out.push(
          <span key={`n-${cur}`} className="text-slate-500 font-bold mr-0.5 tabular-nums">
            {moveNumberLabel(moveNumber, isWhiteTurn)}
          </span>,
        );
      }
      out.push(renderMoveButton(cur, true));

      first = false;
      const nextId = node.children?.[0] ?? null;
      if (!nextId) break;
      if (mainSet.has(nextId)) break;
      cur = nextId;
    }

    return out;
  };

  const renderVariationBarsForParents = (parentIds: NodeId[], seen: Set<string>): React.ReactNode[] => {
    const bars: React.ReactNode[] = [];
    for (const parentNodeId of parentIds) {
      for (const altId of altChildIds(parentNodeId)) {
        const sig = `${parentNodeId}\0${branchLineSignature(tree, altId, mainSet)}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        bars.push(
          <div
            key={`varbar-${sig}`}
            className={`w-full flex flex-wrap items-center gap-x-0.5 gap-y-0.5 px-2 rounded-md bg-slate-700/35 ring-1 ring-white/5 ${compact ? 'py-1 my-0.5' : 'py-1.5 my-1'} ${textSize} text-slate-300`}
          >
            {renderBranchLine(altId, tree.nodes[parentNodeId]?.fen ?? startFen)}
          </div>,
        );
      }
    }
    return bars;
  };

  const rowGrid = 'grid grid-cols-[2rem_1fr_1fr] gap-x-1.5 items-stretch w-full';
  const indexCell = `text-[11px] font-bold text-slate-500 text-right pr-1.5 tabular-nums bg-slate-800/50 flex items-center justify-end ${compact ? 'py-1' : 'py-1.5'}`;
  const moveCell = `min-w-0 flex items-center ${compact ? 'py-0.5' : 'py-1'}`;

  const rows: React.ReactNode[] = [];
  let currentMoveNumber = startMoveNumber;
  let ply = 1;

  if (isBlackToMove && mainline.length > 1) {
    const blackId = mainline[1]!;
    const rowSeen = new Set<string>();
    rows.push(
      <div key="row-black-first" className="w-full">
        <div className={rowGrid}>
          <span className={indexCell}>{currentMoveNumber}</span>
          <div className={moveCell} />
          <div className={moveCell}>
            <span className="text-slate-500 font-bold mr-1 tabular-nums">{currentMoveNumber}...</span>
            {renderMoveButton(blackId)}
          </div>
        </div>
        {renderVariationBarsForParents([tree.rootId], rowSeen)}
      </div>,
    );
    ply = 2;
    currentMoveNumber++;
  }

  for (let mi = ply; mi < mainline.length; mi += 2) {
    const whiteId = mainline[mi];
    const blackId = mainline[mi + 1];
    if (!whiteId) break;

    const rowSeen = new Set<string>();
    const parentIds = blackId
      ? [mainline[mi - 1] ?? tree.rootId, whiteId]
      : [mainline[mi - 1] ?? tree.rootId];

    rows.push(
      <div key={`row-${mi}`} className="w-full">
        <div className={rowGrid}>
          <span className={indexCell}>{currentMoveNumber}</span>
          <div className={moveCell}>{renderMoveButton(whiteId)}</div>
          <div className={moveCell}>{blackId ? renderMoveButton(blackId) : null}</div>
        </div>
        {renderVariationBarsForParents(parentIds, rowSeen)}
      </div>,
    );
    currentMoveNumber++;
  }

  return (
    <div ref={containerRef} className={`relative ${textSize} font-sans text-slate-300 select-none space-y-0.5`}>
      <div className={`${rowGrid} px-0 pb-1 mb-1 border-b border-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-500`}>
        <span />
        <span>Beyaz</span>
        <span>Siyah</span>
      </div>
      {rows}
      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className="absolute z-50 glass-card rounded-xl border border-white/10 shadow-2xl py-1 min-w-[200px] overflow-hidden animate-in zoom-in-95"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {onPromoteBranch && contextMenu.branchId ? (
            <button
              type="button"
              onClick={() => {
                void onPromoteBranch(contextMenu.branchId!);
                setContextMenu(null);
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-bold text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Ana hat yap
            </button>
          ) : null}
          {onDeleteFromNode ? (
            <button
              type="button"
              onClick={() => {
                void onDeleteFromNode(contextMenu.nodeId);
                setContextMenu(null);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Bu hamleden sonrasını sil
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setContextMenu(null)}
            className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-bold text-slate-500 hover:bg-white/5 transition-all"
          >
            İptal
          </button>
        </div>
      ) : null}
    </div>
  );
};
