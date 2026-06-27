import React from 'react';
import type { StudyTree, NodeId } from '../../lib/studySync/types';
import { pathToNode } from '../../lib/studySync/apply';
import { sideToMove } from '../../lib/studyUtils';
import { formatMoveGlyphs, parseMoveGlyphs } from '../../lib/studyAnnotations';

type Props = {
  tree: StudyTree;
  startFen: string;
  currentPath: NodeId[];
  onSelectPath: (path: NodeId[]) => void;
  showMoveAnnotations?: boolean;
  compact?: boolean;
  activeRef?: React.RefObject<HTMLButtonElement | null>;
};

function moveNumberLabel(moveNumber: number, isWhiteTurn: boolean): string {
  return `${moveNumber}${isWhiteTurn ? '.' : '...'}`;
}

function commentText(node: StudyTree['nodes'][string] | undefined): string {
  return (node?.comments ?? []).map((c) => c.text).join('\n').trim();
}

export const StudyTreeInlineNotation: React.FC<Props> = ({
  tree,
  startFen,
  currentPath,
  onSelectPath,
  showMoveAnnotations = true,
  compact = false,
  activeRef,
}) => {
  const activeNodeId = currentPath[currentPath.length - 1] ?? tree.rootId;
  const startMoveNumber = parseInt(startFen.split(' ')[5] ?? '1', 10) || 1;
  const isBlackToMove = startFen.split(' ')[1] === 'b';
  const textSize = compact ? 'text-[11px]' : 'text-[13px]';

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
    const com = commentText(node);

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
          className={`inline-flex items-center px-1.5 rounded font-bold transition-colors ${
            isActive ? 'bg-[#3692e7] text-white shadow-sm' : 'text-slate-200 hover:bg-white/10'
          }`}
        >
          {node.san}
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
        {renderBranch(sibId, parent.fen ?? startFen, null, true)}
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
    <div className={`${textSize} font-sans text-slate-300 select-none leading-relaxed`}>
      <div className="flex flex-wrap items-baseline gap-x-0.5 gap-y-1">{nodes}</div>
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
};
