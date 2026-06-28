import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, ArrowUpRight } from 'lucide-react';
import type { StudyTree, NodeId } from '../../lib/studySync/types';
import { pathToNode } from '../../lib/studySync/apply';
import { variationStartMoveNumber } from '../../lib/studyNotationUtils';
import { sideToMove } from '../../lib/studyUtils';
import { formatMoveGlyphs, parseMoveGlyphs } from '../../lib/studyAnnotations';
import { FigurineSan } from '../chess/FigurineSan';
import { variationBranchRootId } from './StudyTreeTableNotation';
import { nodeCommentText } from '../../lib/studySync/apply';

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

export const StudyTreeInlineNotation: React.FC<Props> = ({
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: NodeId; branchId: NodeId | null } | null>(null);

  const activeNodeId = currentPath[currentPath.length - 1] ?? tree.rootId;
  const startMoveNumber = parseInt(startFen.split(' ')[5] ?? '1', 10) || 1;
  const isBlackToMove = startFen.split(' ')[1] === 'b';
  const textSize = compact ? 'text-[11px]' : 'text-[13px]';

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: NodeId) => {
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
  }, [onDeleteFromNode, onPromoteBranch, tree]);

  const renderMoveButton = (
    nodeId: NodeId,
    moveNumber: number,
    isWhiteTurn: boolean,
    showNumber: boolean,
  ) => {
    const node = tree.nodes[nodeId];
    if (!node?.san) return null;
    const isActive = nodeId === activeNodeId;
    const annotation = node.glyphs?.length ? node.glyphs : undefined;
    const com = nodeCommentText(node);
    const canDelete = !!onDeleteFromNode && nodeId !== tree.rootId;
    const canMenu = nodeId !== tree.rootId && (!!onDeleteFromNode || !!onPromoteBranch);

    return (
      <React.Fragment key={`n-${nodeId}`}>
        {showNumber && (
          <span className="text-slate-500 font-bold mr-0.5 tabular-nums">
            {moveNumberLabel(moveNumber, isWhiteTurn)}
          </span>
        )}
        <button
          ref={isActive ? activeRef : undefined}
          type="button"
          onClick={() => onSelectPath(pathToNode(tree, nodeId))}
          onContextMenu={canMenu ? (e) => handleContextMenu(e, nodeId) : undefined}
          className={`inline-flex items-center px-1.5 rounded font-bold transition-colors ${
            isActive ? 'bg-[#3692e7] text-white shadow-sm' : 'text-slate-200 hover:bg-white/10'
          }`}
        >
          <FigurineSan san={node.san} figurine={figurineNotation} />
          {showMoveAnnotations && annotation != null && parseMoveGlyphs(annotation).length > 0 && (
            <span className="text-amber-500 font-bold ml-0.5">{formatMoveGlyphs(parseMoveGlyphs(annotation))}</span>
          )}
        </button>
        {com ? (
          <span className="text-slate-500 italic mx-0.5">
            {'{'}{com}{'}'}
          </span>
        ) : null}
      </React.Fragment>
    );
  };

  const renderSiblings = (nodeId: NodeId) => {
    const node = tree.nodes[nodeId];
    const parentId = node?.parentId;
    if (!node || !parentId) return null;
    const parent = tree.nodes[parentId];
    const siblings = (parent?.children ?? []).filter((cid) => cid && cid !== nodeId);
    if (!siblings.length) return null;

    return siblings.map((sibId) => (
      <React.Fragment key={`var-${nodeId}-${sibId}`}>
        <span className="text-slate-500 mx-0.5">(</span>
        {renderBranch(
          sibId,
          parent.fen ?? startFen,
          variationStartMoveNumber(tree, sibId, startMoveNumber, isBlackToMove),
          true,
        )}
        <span className="text-slate-500 mx-0.5">)</span>
      </React.Fragment>
    ));
  };

  const renderBranch = (
    startId: NodeId,
    branchStartFen: string,
    initialMoveNumber: number | null,
    /** Parantez içi varyant girişi: ilk hamlede kardeşleri tekrar gösterme (A↔B sonsuz döngüsünü önler). */
    skipSiblingsOnFirstMove = false,
  ): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    let cur: NodeId | null = startId;
    let guard = 0;
    let moveNumber = initialMoveNumber ?? startMoveNumber;
    let first = true;

    while (cur && guard++ < 512) {
      const node = tree.nodes[cur];
      if (!node?.san) break;

      const parent = node.parentId ? tree.nodes[node.parentId] : null;
      const parentFen = parent?.fen ?? branchStartFen;
      const isWhiteTurn = sideToMove(parentFen) === 'white';

      let showNumber = first || isWhiteTurn;
      if (first && isBlackToMove && isWhiteTurn === false) {
        showNumber = true;
      }
      if (isWhiteTurn && !first) moveNumber++;

      out.push(renderMoveButton(cur, moveNumber, isWhiteTurn, showNumber));
      if (!(skipSiblingsOnFirstMove && first)) {
        out.push(renderSiblings(cur));
      }

      first = false;
      cur = node.children?.[0] ?? null;
    }

    return out;
  };

  const mainStart = tree.mainline[1];
  const nodes = mainStart ? renderBranch(mainStart, startFen, null) : [];

  return (
    <div
      ref={containerRef}
      className={`relative ${textSize} font-sans text-slate-300 select-none leading-relaxed`}
    >
      <div className="flex flex-wrap items-baseline gap-x-0.5 gap-y-1">{nodes}</div>
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

/** Ağaçta ana hat dışında en az bir varyant var mı? */
export function treeHasVariations(tree: StudyTree): boolean {
  const mainSet = new Set(tree.mainline ?? []);
  for (const id of Object.keys(tree.nodes)) {
    const node = tree.nodes[id];
    if (!node?.parentId) continue;
    const parent = tree.nodes[node.parentId];
    if (!parent) continue;
    const mainChild = parent.children?.find((cid) => mainSet.has(cid)) ?? parent.children?.[0];
    for (const cid of parent.children ?? []) {
      if (cid && cid !== mainChild) return true;
    }
  }
  return false;
}
