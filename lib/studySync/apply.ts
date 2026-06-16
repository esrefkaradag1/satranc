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
  const id = genNodeId();
  const createdAt = new Date().toISOString();
  const next = {
    ...node,
    comments: [...node.comments, { id, by: author, text: commentText, createdAt }],
  };
  return { ...tree, nodes: { ...tree.nodes, [nodeId]: next } };
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

