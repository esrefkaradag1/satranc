import type { StudyActionEnvelope, StudyChapterState } from './types';
import { parsePath } from './types';
import {
  addChildNode,
  buildInitialTree,
  deleteNodeComment,
  deleteSubtree,
  setNodeComment,
  setNodeGlyphs,
  setNodeShapes,
  pathToNodeId,
  promoteBranchToMainline,
} from './apply';

export function initialChapterState(args: {
  studyId: string;
  chapterId: string;
  startFen: string;
  meta?: StudyChapterState['meta'];
}): StudyChapterState {
  const tree = buildInitialTree(args.startFen);
  const rootPath = [tree.rootId];
  return {
    studyId: args.studyId,
    chapterId: args.chapterId,
    tree,
    meta: args.meta ?? {},
    currentPath: rootPath,
    serverPath: rootPath,
    lastSeq: 0,
    vm: {
      sticky: false,
      write: false,
      behind: 0,
      toolTab: 'tags',
    },
  };
}

export function applyAction(state: StudyChapterState, action: StudyActionEnvelope): StudyChapterState {
  if (action.studyId !== state.studyId || action.chapterId !== state.chapterId) return state;
  if (action.seq <= state.lastSeq) return state;

  let next = { ...state, lastSeq: action.seq };

  switch (action.type) {
    case 'setPath': {
      const path = parsePath(action.payload?.path);
      // server path always updates
      next.serverPath = path.length ? path : next.serverPath;
      // if sticky, follow; else mark behind
      if (next.vm.sticky) {
        next.currentPath = next.serverPath;
        next.vm = { ...next.vm, behind: 0 };
      } else {
        next.vm = { ...next.vm, behind: (next.vm.behind ?? 0) + 1 };
      }
      return next;
    }
    case 'addNode': {
      const parentId = String(action.payload?.parentId || '');
      const san = String(action.payload?.san || '');
      const nodeId = action.payload?.nodeId ? String(action.payload.nodeId) : undefined;
      if (!parentId || !san) return next;
      const { nextTree } = addChildNode(next.tree, parentId, san, nodeId);
      next.tree = nextTree;
      return next;
    }
    case 'promote': {
      const nodeId = String(action.payload?.nodeId || '');
      if (!nodeId || !next.tree.nodes[nodeId]) return next;
      next.tree = promoteBranchToMainline(next.tree, nodeId);
      const curId = pathToNodeId(next.currentPath);
      if (curId && !next.tree.nodes[curId]) {
        next.currentPath = [...next.tree.mainline];
      }
      return next;
    }
    case 'deleteNode': {
      const nodeId = String(action.payload?.nodeId || '');
      if (!nodeId) return next;
      next.tree = deleteSubtree(next.tree, nodeId);
      // keep paths safe
      const curId = pathToNodeId(next.currentPath);
      if (curId && !next.tree.nodes[curId]) next.currentPath = [next.tree.rootId];
      const srvId = pathToNodeId(next.serverPath);
      if (srvId && !next.tree.nodes[srvId]) next.serverPath = [next.tree.rootId];
      return next;
    }
    case 'setComment': {
      const nodeId = String(action.payload?.nodeId || '');
      const text = String(action.payload?.text || '');
      const author = String(action.payload?.author || 'Unknown');
      if (!nodeId || !text) return next;
      next.tree = setNodeComment(next.tree, nodeId, text, author);
      return next;
    }
    case 'deleteComment': {
      const nodeId = String(action.payload?.nodeId || '');
      const commentId = String(action.payload?.commentId || '');
      if (!nodeId || !commentId) return next;
      next.tree = deleteNodeComment(next.tree, nodeId, commentId);
      return next;
    }
    case 'setGlyphs': {
      const nodeId = String(action.payload?.nodeId || '');
      const glyphs = Array.isArray(action.payload?.glyphs) ? action.payload.glyphs.map(String) : [];
      if (!nodeId) return next;
      next.tree = setNodeGlyphs(next.tree, nodeId, glyphs);
      return next;
    }
    case 'setShapes': {
      const nodeId = String(action.payload?.nodeId || '');
      const shapes = Array.isArray(action.payload?.shapes) ? action.payload.shapes : [];
      if (!nodeId) return next;
      next.tree = setNodeShapes(next.tree, nodeId, shapes);
      return next;
    }
    case 'setTags': {
      // chapter tags are outside tree; we will carry in snapshot later (wire-up step)
      return next;
    }
    case 'setChapter': {
      // chapter switching handled by controller/hook; reducer only for same chapter stream.
      return next;
    }
    case 'setChapterMeta': {
      const patch = (action.payload?.patch ?? {}) as Record<string, any>;
      if (!patch || typeof patch !== 'object') return next;
      next.meta = { ...(next.meta ?? {}), ...patch };
      return next;
    }
    default:
      return next;
  }
}

export function applyActions(state: StudyChapterState, actions: StudyActionEnvelope[]): StudyChapterState {
  return actions.reduce((s, a) => applyAction(s, a), state);
}

