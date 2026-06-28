import type { NodeId, StudyTree } from './studySync/types';

/** Kökten düğüme kadar oynanan hamle sayısı (kök = 0). */
export function plyDepthToNode(tree: StudyTree, nodeId: NodeId): number {
  if (!nodeId || nodeId === tree.rootId) return 0;
  let depth = 0;
  let cur: NodeId | null = nodeId;
  while (cur && cur !== tree.rootId) {
    depth += 1;
    cur = tree.nodes[cur]?.parentId ?? null;
  }
  return depth;
}

/**
 * Verilen ply sonrası sıradaki hamlenin satranç numarası.
 * Lichess notasyonu: ana hattan ayrılan varyantlar 1'den değil dallanma noktasından numaralanır.
 */
export function moveNumberAfterPly(
  ply: number,
  startMoveNumber: number,
  gameStartsBlackToMove: boolean,
): number {
  if (gameStartsBlackToMove) {
    return startMoveNumber + Math.floor((ply + 1) / 2);
  }
  return startMoveNumber + Math.floor(ply / 2);
}

/** Varyasyon dalının ilk hamlesi için başlangıç hamle numarası. */
export function variationStartMoveNumber(
  tree: StudyTree,
  branchStartNodeId: NodeId,
  startMoveNumber: number,
  gameStartsBlackToMove: boolean,
): number {
  const node = tree.nodes[branchStartNodeId];
  const parentId = node?.parentId;
  const parentPly = parentId ? plyDepthToNode(tree, parentId) : 0;
  return moveNumberAfterPly(parentPly, startMoveNumber, gameStartsBlackToMove);
}
