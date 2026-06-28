import { Chess } from 'chess.js';
import { applyMove, makeBuilderGame } from '../studyUtils';
import type { NodeId, Path, StudyNode, StudyTree } from './types';

export function genNodeId(): string {
  // short, URL/path friendly
  return typeof crypto !== 'undefined' && (crypto as any).randomUUID
    ? (crypto as any).randomUUID().replace(/-/g, '').slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function ensureNode(tree: StudyTree, nodeId: NodeId): StudyNode | null {
  return tree.nodes[nodeId] ?? null;
}

export function pathToNodeId(path: Path): NodeId | null {
  return path.length ? path[path.length - 1] : null;
}

export function buildInitialTree(startFen: string): StudyTree {
  const rootId = 'root';
  const root: StudyNode = {
    id: rootId,
    parentId: null,
    children: [],
    fen: startFen,
    ply: 0,
    comments: [],
    glyphs: [],
    shapes: [],
  };
  return { rootId, nodes: { [rootId]: root }, mainline: [rootId] };
}

export function addChildNode(tree: StudyTree, parentId: NodeId, san: string, preferredId?: NodeId): { nextTree: StudyTree; childId: NodeId | null } {
  const parent = tree.nodes[parentId];
  if (!parent) return { nextTree: tree, childId: null };

  const g: Chess = makeBuilderGame(parent.fen);
  const pliesBefore = g.history().length;
  const ok = applyMove(g, san);
  const childFen = ok ? g.fen() : parent.fen;
  let normalizedSan = san;
  if (ok && g.history().length > pliesBefore) {
    const hist = g.history({ verbose: true });
    normalizedSan = hist[hist.length - 1]!.san;
  }

  const childId = preferredId || genNodeId();
  const child: StudyNode = {
    id: childId,
    parentId,
    children: [],
    san: normalizedSan,
    fen: childFen,
    ply: parent.ply + 1,
    comments: [],
    glyphs: [],
    shapes: [],
  };

  const nextNodes = { ...tree.nodes, [childId]: child };
  const nextParent: StudyNode = { ...parent, children: [...parent.children, childId] };
  nextNodes[parentId] = nextParent;

  // mainline extension heuristic: first child of each node is mainline; add to mainline if parent is last mainline
  let nextMainline = tree.mainline;
  if (tree.mainline.length && tree.mainline[tree.mainline.length - 1] === parentId) {
    nextMainline = [...tree.mainline, childId];
  }

  return { nextTree: { ...tree, nodes: nextNodes, mainline: nextMainline }, childId };
}

export function deleteSubtree(tree: StudyTree, nodeId: NodeId): StudyTree {
  if (nodeId === tree.rootId) return tree;
  const node = tree.nodes[nodeId];
  if (!node) return tree;

  const toDelete = new Set<NodeId>();
  const stack: NodeId[] = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    if (toDelete.has(id)) continue;
    toDelete.add(id);
    const n = tree.nodes[id];
    if (n) stack.push(...n.children);
  }

  const nextNodes: Record<NodeId, StudyNode> = {};
  for (const [id, n] of Object.entries(tree.nodes)) {
    if (toDelete.has(id)) continue;
    nextNodes[id] = n;
  }

  // remove from parent's children
  const parentId = node.parentId;
  if (parentId && nextNodes[parentId]) {
    nextNodes[parentId] = { ...nextNodes[parentId], children: nextNodes[parentId].children.filter((c) => c !== nodeId) };
  }

  const nextMainline = tree.mainline.filter((id) => !toDelete.has(id));
  const safeMainline = nextMainline.length ? nextMainline : [tree.rootId];
  return { ...tree, nodes: nextNodes, mainline: safeMainline };
}

export function setNodeComment(tree: StudyTree, nodeId: NodeId, commentText: string, author: string): StudyTree {
  const node = tree.nodes[nodeId];
  if (!node) return tree;
  const trimmed = commentText.trim();
  if (!trimmed) {
    return { ...tree, nodes: { ...tree.nodes, [nodeId]: { ...node, comments: [] } } };
  }
  const existing = node.comments[0];
  const id = existing?.id ?? genNodeId();
  const createdAt = existing?.createdAt ?? new Date().toISOString();
  const next = {
    ...node,
    comments: [{ id, by: author, text: trimmed, createdAt }],
  };
  return { ...tree, nodes: { ...tree.nodes, [nodeId]: next } };
}

/** Düğüm yorum metni (Lichess tek yorum alanı). */
export function nodeCommentText(node: StudyTree['nodes'][string] | undefined): string {
  return (node?.comments ?? []).map((c) => c.text).join('\n').trim();
}

export function deleteNodeComment(tree: StudyTree, nodeId: NodeId, commentId: string): StudyTree {
  const node = tree.nodes[nodeId];
  if (!node) return tree;
  return { ...tree, nodes: { ...tree.nodes, [nodeId]: { ...node, comments: node.comments.filter((c) => c.id !== commentId) } } };
}

export function setNodeGlyphs(tree: StudyTree, nodeId: NodeId, glyphs: string[]): StudyTree {
  const node = tree.nodes[nodeId];
  if (!node) return tree;
  return { ...tree, nodes: { ...tree.nodes, [nodeId]: { ...node, glyphs: [...glyphs] } } };
}

export function setNodeShapes(tree: StudyTree, nodeId: NodeId, shapes: any[]): StudyTree {
  const node = tree.nodes[nodeId];
  if (!node) return tree;
  return { ...tree, nodes: { ...tree.nodes, [nodeId]: { ...node, shapes: Array.isArray(shapes) ? shapes : [] } } };
}

/** İlk çocuk zincirini ana hat olarak yeniden oluşturur */
export function rebuildMainlineFromTree(tree: StudyTree): NodeId[] {
  const line: NodeId[] = [tree.rootId];
  let cur: NodeId = tree.rootId;
  for (let guard = 0; guard < 512; guard++) {
    const node = tree.nodes[cur];
    const next = node?.children?.[0];
    if (!next) break;
    line.push(next);
    cur = next;
  }
  return line;
}

/** Bir varyant dalını ana hatta öne alır (Lichess promoteVariation) */
export function promoteBranchToMainline(tree: StudyTree, branchNodeId: NodeId): StudyTree {
  const branch = tree.nodes[branchNodeId];
  if (!branch?.parentId) return tree;

  const nextNodes: Record<NodeId, StudyNode> = { ...tree.nodes };
  let curId: NodeId | null = branchNodeId;

  while (curId) {
    const node = nextNodes[curId];
    if (!node?.parentId) break;
    const parent = nextNodes[node.parentId];
    if (!parent) break;
    const children = [...parent.children];
    const idx = children.indexOf(curId);
    if (idx > 0) {
      children.splice(idx, 1);
      children.unshift(curId);
      nextNodes[node.parentId] = { ...parent, children };
    }
    curId = node.parentId;
  }

  const nextTree = { ...tree, nodes: nextNodes };
  return { ...nextTree, mainline: rebuildMainlineFromTree(nextTree) };
}

/** Ana hattaki hamle sayısına kısaltır (0 = yalnızca kök). */
export function truncateTreeMainlineToMoves(tree: StudyTree, moveCount: number): StudyTree {
  const targetLen = Math.max(1, moveCount + 1);
  let nextTree = tree;
  while (nextTree.mainline.length > targetLen) {
    const nodeToDelete = nextTree.mainline[nextTree.mainline.length - 1];
    if (!nodeToDelete || nodeToDelete === nextTree.rootId) break;
    nextTree = deleteSubtree(nextTree, nodeToDelete);
  }
  const mainline = nextTree.mainline.slice(0, Math.min(targetLen, nextTree.mainline.length));
  return { ...nextTree, mainline: mainline.length ? mainline : [nextTree.rootId] };
}

/** Ana hat SAN listesine göre ağacı hizalar (legacy varyasyon yükseltme sonrası). */
export function alignTreeMainlineToSans(tree: StudyTree, targetSans: string[]): StudyTree {
  let nextTree = tree;
  let parentId = tree.rootId;

  for (const raw of targetSans) {
    const san = (raw || '').trim();
    if (!san) break;

    const parent = nextTree.nodes[parentId];
    if (!parent) break;

    const children = parent.children ?? [];
    const parentFen = parent.fen || '';
    let matchId: NodeId | null = null;
    for (const cid of children) {
      const n = nextTree.nodes[cid];
      if (!n) continue;
      const nodeSan = String(n.san ?? '').trim();
      if (nodeSan === san) {
        matchId = cid;
        break;
      }
      try {
        const g = makeBuilderGame(parentFen);
        const mv = g.move(san);
        if (mv?.san === nodeSan) {
          matchId = cid;
          break;
        }
      } catch {
        /* try next child */
      }
    }

    if (matchId) {
      if (children[0] !== matchId) {
        nextTree = promoteBranchToMainline(nextTree, matchId);
      }
      parentId = matchId;
      continue;
    }

    const { nextTree: withChild, childId } = addChildNode(nextTree, parentId, san);
    if (!childId) break;
    nextTree = promoteBranchToMainline(withChild, childId);
    parentId = childId;
  }

  nextTree = truncateTreeMainlineToMoves(nextTree, targetSans.length);
  return { ...nextTree, mainline: rebuildMainlineFromTree(nextTree) };
}

/** Düğüm kimliğinden köke kadar path dizisi (Lichess currentPath). */
export function pathToNode(tree: StudyTree, nodeId: NodeId): Path {
  const path: Path = [];
  let cur: NodeId | null = nodeId;
  let guard = 0;
  while (cur && guard++ < 512) {
    path.unshift(cur);
    const parentId = tree.nodes[cur]?.parentId ?? null;
    if (!parentId) break;
    cur = parentId;
  }
  return path.length ? path : [tree.rootId];
}

