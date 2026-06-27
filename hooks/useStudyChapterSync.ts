import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { Study, StudyChapter } from '../lib/studyTypes';
import { DEFAULT_FEN } from '../lib/studyUtils';
import type { StudyChapterState, StudyActionEnvelope, NodeId } from '../lib/studySync/types';
import { parsePath, serializePath } from '../lib/studySync/types';
import { initialChapterState, applyAction, applyActions } from '../lib/studySync/reducer';
import { genNodeId, deleteSubtree, alignTreeMainlineToSans } from '../lib/studySync/apply';
import {
  buildLegacyVariationsFromTree,
  findVariationBranchNodeId,
  findVariationNodeAtMoveIndex,
  mergeVariationRecords,
} from '../lib/studySync/moveList';
import { exportLegacyFromTree, buildTreeFromLegacy } from '../lib/studySync/treeModel';
import { loadStudyActions, loadStudySnapshot, subscribeStudyActions, appendStudyAction, upsertPresence, upsertStudySnapshot } from '../services/studyActions';

function pathsEqual(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function treeToLegacyChapter(state: StudyChapterState, fallback: StudyChapter | null): StudyChapter | null {
  const tree = state.tree;
  const root = tree.nodes[tree.rootId];
  if (!root) return fallback;
  const mainline = tree.mainline;
  const moves: string[] = [];
  const moveComments: Record<number, string> = {};
  const moveAnnotations: Record<number, string | string[]> = {};
  const variations = buildLegacyVariationsFromTree(tree);

  for (let i = 1; i < mainline.length; i++) {
    const id = mainline[i];
    const n = tree.nodes[id];
    if (!n) continue;
    moves.push(n.san || '');
    const plyIdx = i - 1;
    if (n.comments?.length) {
      // merge comments into single block (Lichess supports multiple; legacy is one string)
      moveComments[plyIdx] = n.comments.map(c => `${typeof c.by === 'string' ? c.by : c.by?.name}: ${c.text}`).join('\n');
    }
    if (n.glyphs?.length) {
      moveAnnotations[plyIdx] = [...n.glyphs];
    }
  }

  const base = fallback ?? ({
    id: state.chapterId,
    title: 'Bölüm',
    fen: root.fen || DEFAULT_FEN,
    moves: [],
    orientation: 'white',
    lessonMode: 'direct',
    interactiveType: 'puzzle',
    guidedPrompt: '',
    moveHint: '',
    difficulty: 5,
    comment: '',
    tags: [],
    moveComments: {},
    moveAnnotations: {},
    variations: {},
    arrows: [],
    circles: {},
  } satisfies StudyChapter);

  const meta = state.meta ?? {};
  const chapterCommentFromRoot = root.comments?.length
    ? root.comments.map(c => `${typeof c.by === 'string' ? c.by : c.by?.name}: ${c.text}`).join('\n')
    : '';

  // shapes: take from current node (for now) + root
  const curNodeId = state.currentPath.length ? state.currentPath[state.currentPath.length - 1] : tree.rootId;
  const cur = tree.nodes[curNodeId] || root;
  const arrows = [...(root.shapes || []), ...(cur?.shapes || [])];

  return {
    ...base,
    title: meta.title ?? base.title,
    orientation: meta.orientation ?? base.orientation,
    lessonMode: meta.lessonMode ?? base.lessonMode,
    interactiveType: meta.interactiveType ?? base.interactiveType,
    guidedPrompt: meta.guidedPrompt ?? base.guidedPrompt,
    moveHint: meta.moveHint ?? base.moveHint,
    difficulty: meta.difficulty ?? base.difficulty,
    comment: meta.comment ?? (chapterCommentFromRoot || base.comment),
    tags: meta.tags ?? base.tags,
    fen: root.fen || base.fen,
    moves,
    moveComments,
    moveAnnotations,
    variations,
    arrows,
  };
}

export function useStudyChapterSync(args: {
  study: Study | null;
  chapter: StudyChapter | null;
  actorId: string;
  actorRole: string;
  initialSticky: boolean;
  initialWrite: boolean;
}) {
  const studyId = args.study?.id ?? null;
  const chapterId = args.chapter?.id ?? null;

  const [syncState, setSyncState] = useState<StudyChapterState | null>(null);
  const lastSeqRef = useRef(0);
  const lastSnapshotSeqRef = useRef(0);
  const snapshotTimerRef = useRef<any>(null);
  /** REC kapalıyken yalnızca yerelde eklenen düğümler; geri alında sunucuya delete gitmez. */
  const ephemeralTipsRef = useRef<string[]>([]);
  const canWrite = useMemo(
    () => args.actorRole === 'admin' || args.actorRole === 'coach' || args.actorRole === 'club',
    [args.actorRole],
  );

  useEffect(() => {
    ephemeralTipsRef.current = [];
  }, [chapterId]);

  const ensureState = useCallback(async () => {
    if (!studyId || !chapterId) return;

    const startFen = args.chapter?.fen || DEFAULT_FEN;
    const meta: StudyChapterState['meta'] = {
      title: args.chapter?.title,
      orientation: args.chapter?.orientation,
      lessonMode: args.chapter?.lessonMode,
      interactiveType: args.chapter?.interactiveType,
      guidedPrompt: args.chapter?.guidedPrompt,
      moveHint: args.chapter?.moveHint,
      difficulty: args.chapter?.difficulty,
      comment: args.chapter?.comment,
      tags: args.chapter?.tags,
    };
    let base = initialChapterState({ studyId, chapterId, startFen, meta });
    base.vm.sticky = !!args.initialSticky;
    base.vm.write = !!args.initialWrite && canWrite;

    const snapshot = await loadStudySnapshot(studyId, chapterId);
    if (snapshot?.tree?.rootId && snapshot?.tree?.nodes) {
      const snapMeta = (snapshot.tree as any)?.meta && typeof (snapshot.tree as any).meta === 'object'
        ? (snapshot.tree as any).meta
        : {};
      base = {
        ...base,
        tree: snapshot.tree,
        meta: { ...(base.meta ?? {}), ...(snapMeta ?? {}) },
        lastSeq: snapshot.lastSeq ?? 0,
      };
      const rp = [snapshot.tree.rootId];
      base.currentPath = rp;
      base.serverPath = rp;
    } else if (args.chapter?.seedTree?.rootId && args.chapter.seedTree.nodes) {
      const seeded = args.chapter.seedTree;
      base = {
        ...base,
        tree: seeded,
        currentPath: seeded.mainline.slice(),
        serverPath: seeded.mainline.slice(),
        lastSeq: 0,
      };
    } else if (args.chapter?.moves?.length && Object.keys(args.chapter.variations ?? {}).length > 0) {
      const built = buildTreeFromLegacy({
        fen: startFen,
        moves: args.chapter.moves,
        variations: args.chapter.variations ?? {},
      });
      base = {
        ...base,
        tree: built,
        currentPath: built.mainline.slice(),
        serverPath: built.mainline.slice(),
        lastSeq: 0,
      };
    }

    const actions = await loadStudyActions(studyId, chapterId, base.lastSeq);
    let hydrated = applyActions(base, actions);
    lastSeqRef.current = hydrated.lastSeq;

    const seedMoves = args.chapter?.moves ?? [];
    const mainlineLen = hydrated.tree?.mainline?.length ?? 0;
    if (mainlineLen <= 1 && seedMoves.length > 0 && actions.length === 0 && hydrated.lastSeq === 0) {
      let state = hydrated;
      let parentId = state.tree.rootId;
      for (let i = 0; i < seedMoves.length; i++) {
        const san = seedMoves[i];
        if (!san) continue;
        const seq = state.lastSeq + 1;
        const childId = genNodeId();
        const env: StudyActionEnvelope = {
          id: `seed-${chapterId}-${i}`,
          studyId,
          chapterId,
          seq,
          type: 'addNode',
          payload: { parentId, san, nodeId: childId },
          createdAt: new Date().toISOString(),
        };
        state = applyAction(state, env);
        parentId = childId;
      }
      const path = state.tree.mainline.slice();
      hydrated = { ...state, currentPath: path, serverPath: path };
    }

    lastSeqRef.current = hydrated.lastSeq;
    setSyncState(hydrated);
  }, [studyId, chapterId, args.chapter?.fen, args.chapter?.moves?.length, args.chapter?.seedTree, args.chapter?.variations, args.initialSticky, args.initialWrite, canWrite]);

  // Periodically persist snapshot (tree + meta) for fast, deterministic reload.
  useEffect(() => {
    if (!studyId || !chapterId || !syncState) return;
    if (syncState.lastSeq <= 0) return;
    if (syncState.lastSeq <= lastSnapshotSeqRef.current) return;
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = setTimeout(() => {
      void upsertStudySnapshot({
        studyId,
        chapterId,
        lastSeq: syncState.lastSeq,
        tree: { ...(syncState.tree as any), meta: syncState.meta ?? {} },
      });
      lastSnapshotSeqRef.current = syncState.lastSeq;
    }, 900);
    return () => {
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    };
  }, [studyId, chapterId, syncState?.lastSeq]);

  useEffect(() => {
    setSyncState(null);
    lastSeqRef.current = 0;
    void ensureState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId, chapterId]);

  useEffect(() => {
    if (!studyId || !chapterId) return;
    if (!syncState) return;

    const unsub = subscribeStudyActions({
      studyId,
      chapterId,
      onAction: (a: StudyActionEnvelope) => {
        setSyncState((prev) => (prev ? applyAction(prev, a) : prev));
        lastSeqRef.current = Math.max(lastSeqRef.current, a.seq);
      },
    });
    return unsub;
  }, [studyId, chapterId, syncState?.studyId]); // re-subscribe on chapter switch

  const legacyChapter = useMemo(() => {
    if (!syncState || syncState.chapterId !== chapterId) return args.chapter;
    return treeToLegacyChapter(syncState, args.chapter);
  }, [syncState, args.chapter, chapterId]);

  const setSticky = useCallback(async (sticky: boolean) => {
    if (!studyId || !chapterId || !syncState) return;
    setSyncState((prev) => (prev ? { ...prev, vm: { ...prev.vm, sticky } } : prev));
    await upsertPresence({
      studyId,
      userId: args.actorId,
      chapterId,
      path: serializePath(syncState.currentPath),
      sticky,
    });
  }, [studyId, chapterId, syncState, args.actorId]);

  const catchUp = useCallback(async () => {
    ephemeralTipsRef.current = [];
    if (!studyId || !chapterId || !syncState) return;
    const target = syncState.serverPath?.length ? syncState.serverPath : syncState.currentPath;
    setSyncState((prev) => (prev ? { ...prev, currentPath: target, vm: { ...prev.vm, behind: 0 } } : prev));
    await upsertPresence({
      studyId,
      userId: args.actorId,
      chapterId,
      path: serializePath(target),
      sticky: !!syncState.vm.sticky,
    });
  }, [studyId, chapterId, syncState, args.actorId]);

  const setWrite = useCallback((write: boolean) => {
    if (!canWrite && write) return;
    setSyncState((prev) => (prev ? { ...prev, vm: { ...prev.vm, write: canWrite ? write : false } } : prev));
  }, [canWrite]);

  const broadcastPathIfSticky = useCallback(async (path: string) => {
    if (!studyId || !chapterId || !syncState) return;
    if (!syncState.vm.sticky) return;
    await appendStudyAction({
      studyId,
      chapterId,
      actorId: args.actorId,
      actorRole: args.actorRole,
      type: 'setPath',
      payload: { path },
    });
    await upsertPresence({
      studyId,
      userId: args.actorId,
      chapterId,
      path,
      sticky: true,
    });
  }, [studyId, chapterId, syncState, args.actorId, args.actorRole]);

  const jumpToVariation = useCallback(async (mainLinePos: number, varGroupIdx: number, varMoveIdx: number) => {
    ephemeralTipsRef.current = [];
    if (!syncState) return;
    const tree = syncState.tree;
    const variations = buildLegacyVariationsFromTree(tree);
    const groups = variations[mainLinePos];
    const line = groups?.[varGroupIdx];
    if (!line || line.length === 0) return;

    // Parent: mainline[mainLinePos] — varyasyonun ayrıldığı düğüm (kök veya önceki ana hat hamlesi)
    const parentMlIndex = Math.max(0, Math.min(tree.mainline.length - 1, mainLinePos));
    const parentId = tree.mainline[parentMlIndex];
    const parent = tree.nodes[parentId];
    if (!parent) return;

    const mainChild = tree.mainline[parentMlIndex + 1] ?? null;
    const firstSan = line[0];
    const firstAltChild = (parent.children ?? []).find((cid) => {
      if (!cid || cid === mainChild) return false;
      const n = tree.nodes[cid];
      return !!n && String(n.san ?? '') === String(firstSan);
    });
    if (!firstAltChild) return;

    const targetDepth = Math.max(0, Math.min(line.length - 1, varMoveIdx));
    const extra: string[] = [];
    let curId: string | null = firstAltChild;
    for (let i = 0; i <= targetDepth; i++) {
      const cur = curId ? tree.nodes[curId] : null;
      if (!cur) break;
      extra.push(curId!);
      const nextSan = line[i + 1];
      if (!nextSan) break;
      const nextId = (cur.children ?? []).find((cid) => {
        const n = tree.nodes[cid];
        return !!n && String(n.san ?? '') === String(nextSan);
      }) ?? (cur.children?.[0] ?? null);
      curId = nextId ?? null;
    }

    const basePath = tree.mainline.slice(0, parentMlIndex + 1);
    const path = [...basePath, ...extra];
    if (path.length === 0) return;
    const shouldClearBehind = pathsEqual(path, syncState.serverPath ?? []);
    setSyncState((prev) => (prev ? { ...prev, currentPath: path, vm: shouldClearBehind ? { ...prev.vm, behind: 0 } : prev.vm } : prev));
    await broadcastPathIfSticky(serializePath(path));
    await upsertPresence({
      studyId,
      userId: args.actorId,
      chapterId,
      path: serializePath(path),
      sticky: !!syncState.vm.sticky,
    });
  }, [studyId, chapterId, syncState, broadcastPathIfSticky, args.actorId]);

  const jumpToNodePath = useCallback(async (path: NodeId[]) => {
    ephemeralTipsRef.current = [];
    if (!syncState || !studyId || !chapterId || !path.length) return;
    const shouldClearBehind = pathsEqual(path, syncState.serverPath ?? []);
    setSyncState((prev) => (prev ? { ...prev, currentPath: path, vm: shouldClearBehind ? { ...prev.vm, behind: 0 } : prev.vm } : prev));
    const serialized = serializePath(path);
    await broadcastPathIfSticky(serialized);
    await upsertPresence({
      studyId,
      userId: args.actorId,
      chapterId,
      path: serialized,
      sticky: !!syncState.vm.sticky,
    });
  }, [studyId, chapterId, syncState, broadcastPathIfSticky, args.actorId]);

  const jumpToMoveIndex = useCallback(async (moveIndex: number, movesOverride?: string[]) => {
    if (!studyId || !chapterId) return;

    const safeIndex = Math.max(0, moveIndex);
    const seedMoves = movesOverride ?? args.chapter?.moves ?? [];

    let nextPathSerialized = '';
    setSyncState((prev) => {
      if (!prev) return prev;

      let working = prev;
      if (movesOverride !== undefined) {
        const alignedTree = alignTreeMainlineToSans(working.tree, movesOverride);
        working = { ...working, tree: alignedTree };
      }

      let ml = working.tree.mainline;
      const alreadyPlayed = Math.max(0, ml.length - 1);

      if (safeIndex > alreadyPlayed && seedMoves.length > safeIndex) {
        let parentId = ml[ml.length - 1] ?? working.tree.rootId;
        for (let i = alreadyPlayed; i < safeIndex; i++) {
          const san = seedMoves[i];
          if (!san) break;
          const childId = genNodeId();
          const tempAction: StudyActionEnvelope = {
            id: `jump-seed-${chapterId}-${i}-${Date.now()}`,
            studyId,
            chapterId,
            seq: working.lastSeq + 1,
            type: 'addNode',
            payload: { parentId, san, nodeId: childId },
            createdAt: new Date().toISOString(),
          };
          working = applyAction(working, tempAction);
          parentId = childId;
        }
        ml = working.tree.mainline;
      }

      const path = ml.slice(0, Math.max(1, Math.min(ml.length, safeIndex + 1)));
      const shouldClearBehind = pathsEqual(path, prev.serverPath ?? []);
      nextPathSerialized = serializePath(path);

      return {
        ...working,
        currentPath: path,
        vm: shouldClearBehind ? { ...prev.vm, behind: 0 } : prev.vm,
      };
    });

    if (!nextPathSerialized) return;
    await broadcastPathIfSticky(nextPathSerialized);
    await upsertPresence({
      studyId,
      userId: args.actorId,
      chapterId,
      path: nextPathSerialized,
      sticky: !!syncState?.vm.sticky,
    });
  }, [studyId, chapterId, syncState?.vm.sticky, args.chapter?.moves, broadcastPathIfSticky, args.actorId]);

  const makeMove = useCallback(async (parentNodeId: string, san: string) => {
    if (!studyId || !chapterId || !syncState) return;

    // Lichess principle: Anyone can make a move.
    // Coach: persisted when REC (write) is on.
    // Öğrenci + canlı analiz: hamleler Supabase study_actions'a yazılır; öğretmen tahtası aynı ağacı görür.
    const isLiveAnalysisChapter = syncState.meta?.interactiveType === 'liveAnalysis';
    const studentLivePersist = isLiveAnalysisChapter && args.actorRole === 'student';
    const canPersist = !!syncState.vm.write || studentLivePersist;
    const childId = genNodeId();
    if (!canPersist) ephemeralTipsRef.current.push(childId);

    const tempAction: StudyActionEnvelope = {
      id: `tmp-${Date.now()}`,
      studyId,
      chapterId,
      seq: (lastSeqRef.current || syncState.lastSeq || 0) + 1,
      type: 'addNode',
      payload: { parentId: parentNodeId, san, nodeId: childId },
      createdAt: new Date().toISOString(),
    };
    
    setSyncState(prev => {
      if (!prev) return prev;
      const next = applyAction(prev, tempAction);
      const nextPath = [...next.currentPath, childId];
      const serialized = serializePath(nextPath);
      
      let nextVm = { ...next.vm };
      const coachStickyBroadcast =
        canPersist && nextVm.sticky && args.actorRole !== 'student';
      if (coachStickyBroadcast) {
        void broadcastPathIfSticky(serialized);
      } else {
        nextVm.sticky = false;
      }

      return { ...next, currentPath: nextPath, vm: nextVm };
    });

    if (canPersist) {
      await appendStudyAction({
        studyId,
        chapterId,
        actorId: args.actorId,
        actorRole: args.actorRole,
        type: 'addNode',
        payload: { parentId: parentNodeId, san, nodeId: childId },
      });
    }
  }, [studyId, chapterId, syncState, args.actorId, args.actorRole, broadcastPathIfSticky]);

  const setNodeGlyphs = useCallback(
    async (nodeId: string, glyphs: string[]) => {
      if (!syncState) return;
      const node = syncState.tree.nodes[nodeId];
      if (!node) return;
      const nextGlyphs = [...glyphs];

      const tempAction: StudyActionEnvelope = {
        id: `tmp-glyph-${Date.now()}`,
        studyId: studyId ?? '',
        chapterId: chapterId ?? '',
        seq: (lastSeqRef.current || syncState.lastSeq || 0) + 1,
        actorId: args.actorId,
        actorRole: args.actorRole,
        type: 'setGlyphs',
        payload: { nodeId, glyphs: nextGlyphs },
        createdAt: new Date().toISOString(),
      };

      setSyncState((prev) => {
        if (!prev) return prev;
        const action: StudyActionEnvelope = { ...tempAction, seq: prev.lastSeq + 1 };
        const next = applyAction(prev, action);
        lastSeqRef.current = next.lastSeq;
        return next;
      });

      if (!studyId || !chapterId || !canWrite) return;

      await appendStudyAction({
        studyId,
        chapterId,
        actorId: args.actorId,
        actorRole: args.actorRole,
        type: 'setGlyphs',
        payload: { nodeId, glyphs: nextGlyphs },
      });
    },
    [studyId, chapterId, syncState, canWrite, args.actorId, args.actorRole],
  );

  const deleteMove = useCallback(async (nodeId: string) => {
    if (!studyId || !chapterId || !syncState || !canWrite) return;
    if (nodeId === syncState.tree.rootId) return; // cannot delete root

    const tempAction: StudyActionEnvelope = {
      id: `tmp-del-${Date.now()}-${nodeId}`,
      studyId,
      chapterId,
      seq: (lastSeqRef.current || syncState.lastSeq || 0) + 1,
      actorId: args.actorId,
      actorRole: args.actorRole,
      type: 'deleteNode',
      payload: { nodeId },
      createdAt: new Date().toISOString(),
    };

    setSyncState((prev) => {
      if (!prev) return prev;
      const next = applyAction(prev, tempAction);
      lastSeqRef.current = next.lastSeq;
      return next;
    });

    await appendStudyAction({
      studyId,
      chapterId,
      actorId: args.actorId,
      actorRole: args.actorRole,
      type: 'deleteNode',
      payload: { nodeId },
    });
  }, [studyId, chapterId, syncState, canWrite, args.actorId, args.actorRole]);

  const removeTreeNode = useCallback(
    async (nodeId: string) => {
      if (!studyId || !chapterId || !canWrite) {
        setSyncState((prev) => {
          if (!prev) return prev;
          const nextTree = deleteSubtree(prev.tree, nodeId);
          const nextPath = prev.currentPath.filter((id) => !!nextTree.nodes[id]);
          const safePath = nextPath.length ? nextPath : [nextTree.rootId];
          return { ...prev, tree: nextTree, currentPath: safePath };
        });
        return;
      }
      const ep = ephemeralTipsRef.current;
      const lastIsEphemeral = ep.length > 0 && ep[ep.length - 1] === nodeId;
      if (lastIsEphemeral) {
        ep.pop();
        setSyncState((prev) => {
          if (!prev) return prev;
          const nextTree = deleteSubtree(prev.tree, nodeId);
          const nextPath = prev.currentPath.filter((id) => !!nextTree.nodes[id]);
          const safePath = nextPath.length ? nextPath : [nextTree.rootId];
          return { ...prev, tree: nextTree, currentPath: safePath };
        });
      } else {
        await deleteMove(nodeId);
      }
    },
    [studyId, chapterId, canWrite, deleteMove],
  );

  /** Varyasyonda tıklanan hamleden itibaren (dahil) sonrasını siler — Lichess "Bu hamleden sonrasını sil". */
  const truncateVariationFromMove = useCallback(
    async (mainLinePos: number, varGroupIdx: number, varMoveIdx: number) => {
      if (!syncState) return null;
      const nodeId = findVariationNodeAtMoveIndex(
        syncState.tree,
        mainLinePos,
        varGroupIdx,
        varMoveIdx,
        args.chapter?.variations ?? {},
      );
      if (!nodeId) return null;
      await removeTreeNode(nodeId);

      let exported: ReturnType<typeof exportLegacyFromTree> | null = null;
      setSyncState((prev) => {
        if (!prev) return prev;
        exported = exportLegacyFromTree(prev.tree, args.chapter?.fen);
        return prev;
      });

      const stillHasBranch = exported?.variations?.[mainLinePos]?.[varGroupIdx]?.length;
      if (stillHasBranch) {
        const nextIdx = Math.max(0, varMoveIdx - 1);
        await jumpToVariation(mainLinePos, varGroupIdx, nextIdx);
      } else {
        await jumpToMoveIndex(mainLinePos);
      }
      return exported;
    },
    [syncState, args.chapter?.variations, args.chapter?.fen, removeTreeNode, jumpToVariation, jumpToMoveIndex],
  );

  /** Ana hat üzerinde idx ve sonrasındaki tüm düğümleri siler (idx = silinecek ilk hamlenin 0-tabanlı indeksi). */
  const truncateMainlineFromMoveIndex = useCallback(
    async (firstMoveIdx: number) => {
      if (!studyId || !chapterId || !canWrite) return;

      let toDelete: string[] = [];
      setSyncState((prev) => {
        if (!prev) return prev;
        const ml = prev.tree.mainline;
        const targetLen = firstMoveIdx + 1;
        if (ml.length <= targetLen) return prev;
        toDelete = [...ml.slice(targetLen)].reverse();
        return prev;
      });

      if (toDelete.length === 0) return;

      for (const nodeId of toDelete) {
        await removeTreeNode(nodeId);
      }

      let exported: ReturnType<typeof exportLegacyFromTree> | null = null;
      setSyncState((prev) => {
        if (!prev) return prev;
        exported = exportLegacyFromTree(prev.tree, args.chapter?.fen);
        return prev;
      });
      return exported;
    },
    [studyId, chapterId, canWrite, removeTreeNode, args.chapter?.fen],
  );

  const promoteVariation = useCallback(async (mainLinePos: number, varGroupIdx: number) => {
    if (!studyId || !chapterId || !syncState) return false;

    const branchId = findVariationBranchNodeId(
      syncState.tree,
      mainLinePos,
      varGroupIdx,
      args.chapter?.variations ?? {},
    );
    if (!branchId) return false;

    const variations = mergeVariationRecords(
      args.chapter?.variations ?? {},
      buildLegacyVariationsFromTree(syncState.tree),
    );
    const varLine = variations[mainLinePos]?.[varGroupIdx] ?? [];
    const targetMoveIndex = mainLinePos + varLine.length;

    const tempAction: StudyActionEnvelope = {
      id: `tmp-promote-${Date.now()}`,
      studyId,
      chapterId,
      seq: (lastSeqRef.current || syncState.lastSeq || 0) + 1,
      type: 'promote',
      payload: { nodeId: branchId },
      createdAt: new Date().toISOString(),
    };

    let nextPathSerialized = '';
    setSyncState((prev) => {
      if (!prev) return prev;
      const action: StudyActionEnvelope = { ...tempAction, seq: prev.lastSeq + 1 };
      const next = applyAction(prev, action);
      lastSeqRef.current = next.lastSeq;
      const pathLen = Math.min(targetMoveIndex + 1, next.tree.mainline.length);
      const nextPath = next.tree.mainline.slice(0, Math.max(1, pathLen));
      nextPathSerialized = serializePath(nextPath);
      return { ...next, currentPath: nextPath };
    });

    if (nextPathSerialized && syncState.vm.sticky) {
      await broadcastPathIfSticky(nextPathSerialized);
    }

    if (canWrite) {
      await appendStudyAction({
        studyId,
        chapterId,
        actorId: args.actorId,
        actorRole: args.actorRole,
        type: 'promote',
        payload: { nodeId: branchId },
      });
    }

    return true;
  }, [studyId, chapterId, syncState, canWrite, args.actorId, args.actorRole, broadcastPathIfSticky]);

  const alignMainlineToMoves = useCallback((moves: string[], moveIndex: number) => {
    setSyncState((prev) => {
      if (!prev) return prev;
      const alignedTree = alignTreeMainlineToSans(prev.tree, moves);
      const pathLen = Math.min(moveIndex + 1, alignedTree.mainline.length);
      const nextPath = alignedTree.mainline.slice(0, Math.max(1, pathLen));
      return { ...prev, tree: alignedTree, currentPath: nextPath };
    });
  }, []);

  const undoMove = useCallback(async () => {
    if (!syncState || !canWrite) return;
    const path = syncState.currentPath;
    if (path.length <= 1) return; // at root
    const lastId = path[path.length - 1]!;
    const nextPath = path.slice(0, path.length - 1);

    const ep = ephemeralTipsRef.current;
    const lastIsEphemeral = ep.length > 0 && ep[ep.length - 1] === lastId;
    if (lastIsEphemeral) {
      ep.pop();
      setSyncState((prev) => {
        if (!prev) return prev;
        const nextTree = deleteSubtree(prev.tree, lastId);
        return { ...prev, tree: nextTree, currentPath: nextPath };
      });
      return;
    }

    setSyncState((prev) => (prev ? { ...prev, currentPath: nextPath } : prev));
    await deleteMove(lastId);
  }, [syncState, canWrite, deleteMove]);

  const clearChapter = useCallback(async () => {
    if (!syncState || !canWrite) return;
    const root = syncState.tree.nodes[syncState.tree.rootId];
    if (!root || !root.children || root.children.length === 0) return;

    if (!window.confirm('Bu bölümdeki TÜM hamleler silinecek. Emin misiniz?')) return;

    ephemeralTipsRef.current = [];
    // Delete all direct children of root
    for (const childId of root.children) {
      await deleteMove(childId);
    }
    
    setSyncState(prev => (prev ? { ...prev, currentPath: [prev.tree.rootId] } : prev));
  }, [syncState, canWrite, deleteMove]);

  const navigationState = useMemo(() => {
    if (!syncState) return { moveIndex: 0, currentVariation: null };
    const tree = syncState.tree;
    const path = syncState.currentPath;
    const ml = tree.mainline;

    // Check if on mainline
    let isOnMainline = true;
    if (path.length > ml.length) {
      isOnMainline = false;
    } else {
      for (let i = 0; i < path.length; i++) {
        if (path[i] !== ml[i]) {
          isOnMainline = false;
          break;
        }
      }
    }

    if (isOnMainline) {
      return { moveIndex: Math.max(0, path.length - 1), currentVariation: null };
    }

    // It's a variation. Find the junction.
    const variations = buildLegacyVariationsFromTree(tree);
    let junctionIdx = 0;
    for (let i = 0; i < Math.min(path.length, ml.length); i++) {
      if (path[i] === ml[i]) junctionIdx = i;
      else break;
    }

    // junctionIdx: ana hat ile son ortak düğüm; varyasyon anahtarı aynı indeks
    const legacyKey = Math.max(0, junctionIdx);
    const groups = variations[legacyKey] ?? [];
    
    // Find which group matches our path
    for (let gIdx = 0; gIdx < groups.length; gIdx++) {
      const group = groups[gIdx];
      // A group matches if the first move in the group is the first node after junction in our path
      const branchId = path[junctionIdx + 1];
      const branchNode = tree.nodes[branchId];
      if (branchNode && branchNode.san === group[0]) {
        const moveIdx = Math.max(0, path.length - (junctionIdx + 1) - 1);
        return { moveIndex: legacyKey, currentVariation: [legacyKey, gIdx, moveIdx] as [number, number, number] };
      }
    }

    return { moveIndex: Math.max(0, junctionIdx), currentVariation: null };
  }, [syncState]);

  return {
    syncState,
    legacyChapter,
    navigationState,
    sticky: !!syncState?.vm.sticky,
    write: !!syncState?.vm.write,
    behind: syncState?.vm.behind ?? 0,
    catchUp,
    setSticky,
    setWrite,
    jumpToVariation,
    jumpToNodePath,
    jumpToMoveIndex,
    promoteVariation,
    alignMainlineToMoves,
    makeMove,
    setNodeGlyphs,
    undoMove,
    truncateMainlineFromMoveIndex,
    truncateVariationFromMove,
    clearChapter,
    parsePath,
    serializePath,
    updatePresencePayload: useCallback(async (payload: any) => {
      if (!studyId || !chapterId || !syncState) return;
      await upsertPresence({
        studyId,
        userId: args.actorId,
        chapterId,
        path: serializePath(syncState.currentPath),
        sticky: !!syncState.vm.sticky,
        payload,
      });
    }, [studyId, chapterId, syncState, args.actorId]),
  };
}

