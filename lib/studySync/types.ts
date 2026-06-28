export type StudyId = string;
export type ChapterId = string;
export type NodeId = string;

// Lichess-style path: concatenation of node ids from root (root is '')
// We keep explicit arrays for easier operations, and store serialized path in presence/actions.
export type Path = NodeId[]; // root -> leaf, root included as first element

export type Role = 'admin' | 'coach' | 'student' | 'parent' | 'unknown';

export type GlyphSymbol = '!' | '!!' | '?' | '??' | '!?' | '?!' | string;

export type Shape = { startSquare: string; endSquare: string; color: string };

export type TreeComment = {
  id: string;
  by: { id: string; name: string } | string;
  text: string;
  createdAt: string;
};

export interface StudyNode {
  id: NodeId;
  parentId: NodeId | null;
  /** Ana hat = children[0] (Lichess tree modeli). */
  children: NodeId[];
  // Move metadata
  san?: string; // move SAN for this node (root has none)
  fen: string;
  ply: number; // half-move index from root
  // Annotations
  comments: TreeComment[];
  glyphs: GlyphSymbol[];
  shapes: Shape[];
}

export interface StudyTree {
  rootId: NodeId;
  nodes: Record<NodeId, StudyNode>;
  mainline: NodeId[]; // node ids from root to current mainline end
}

export type ToolTab = 'tags' | 'comments' | 'glyphs' | 'serverEval' | 'multiBoard' | 'share';

export interface StudySyncVm {
  // SYNC / REC semantics (like Lichess)
  sticky: boolean; // SYNC
  write: boolean; // REC
  behind: number;
  toolTab: ToolTab;
}

export interface StudyChapterState {
  studyId: StudyId;
  chapterId: ChapterId;
  tree: StudyTree;
  /** Chapter-level fields that are outside the move tree (title, tags, lesson mode, etc). */
  meta: {
    title?: string;
    orientation?: 'white' | 'black';
    lessonMode?: 'direct' | 'interactive';
    interactiveType?: 'puzzle' | 'liveAnalysis' | 'vsComputer';
    guidedPrompt?: string;
    moveHint?: string;
    difficulty?: number;
    comment?: string;
    tags?: string[];
    pgnTags?: Array<[string, string]>;
  };
  currentPath: Path; // client local current path
  serverPath: Path; // last sticky path seen from stream (or own broadcast)
  lastSeq: number;
  vm: StudySyncVm;
}

export type StudyActionType =
  | 'setChapter'
  | 'setChapterMeta'
  | 'setPath'
  | 'addNode'
  | 'deleteNode'
  | 'promote'
  | 'setComment'
  | 'deleteComment'
  | 'setGlyphs'
  | 'setShapes'
  | 'setTags'
  | 'chatMessageAdd'
  | 'likeToggle';

export interface StudyActionEnvelope {
  id: string;
  studyId: StudyId;
  chapterId: ChapterId;
  seq: number;
  actorId?: string | null;
  actorRole?: string | null;
  type: StudyActionType;
  payload: any;
  createdAt: string;
}

export type PresenceRow = {
  studyId: StudyId;
  userId: string;
  chapterId: ChapterId | null;
  path: string | null;
  sticky: boolean;
  lastSeen: string;
};

export function serializePath(path: Path): string {
  return path.join('.');
}

export function parsePath(s: string | null | undefined): Path {
  if (!s) return [];
  return String(s)
    .split('.')
    .map((x) => x.trim())
    .filter(Boolean);
}

