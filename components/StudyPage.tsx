import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { loadStudiesAsync, saveStudyAsync, deleteStudyAsync, subscribeToStudies } from '../studyStorage';
import { loadStudyCategories, loadStudyCategoriesAsync, saveStudyCategoriesAsync, type StudyCategoryMeta } from '../studyCategoriesStorage';
import { Chessboard } from 'react-chessboard';
import { Chess, Square } from 'chess.js';
import {
  Plus, Settings2, MessageCircle, UserPlus, ChevronLeft, ChevronRight,
  SkipBack, SkipForward, Play, BookMarked, Check, X,
  Tag, MessageSquare, Share2, Info, Search, Menu,
  FlipHorizontal, Trash2, BarChart2, Download, Copy, Heart,
  ArrowLeft, Clock, Users, ListChecks, Globe, Lock, Star,
  MousePointer2, ChevronUp, ChevronDown, FileText, Video, Highlighter,
  Send, Undo2, RotateCcw, Eye, Folder, FolderPlus,
  FileImage, Loader2, Sparkles, Import, Upload, Keyboard,
} from 'lucide-react';
import StudyCallPanel from './StudyCallPanel';
import { createStudyCall } from '../services/studyCall';
import {
  Study, StudyChapter, StudyChatMessage, BottomTab, LeftTab, StudyView
} from '../lib/studyTypes';
import { StudyMoveTree } from './study/StudyMoveTree';
import { StudyBottomTools } from './study/StudyBottomTools';
import { EngineAnalysis } from './study/EngineAnalysis';
import Analysis from './Analysis';
import { getBestMove, getBestMoveAsync, getEvaluationPawns, evaluatePosition } from '../services/chessEngine';
import { 
  DEFAULT_FEN, genId, migrateChapter, migrateStudy, setFenTurn, makeBuilderGame, applyMove,
  buildPgn, parsePgnBlockToMoves, engineLevelFromDifficulty, 
  cpLossThresholdForDifficulty, chapterModeBadge, formatChapterListLabel, chapterListLabelMatches,
  loadEditorSelection, saveEditorSelection, EMOJIS, LICHESS_PIECE
} from '../lib/studyUtils';
import { parsePgnBlockToChapter } from '../lib/pgnChapterParse';
import { normalizeStudyChapterPuzzle } from '../lib/puzzlePlayUtils';
import { loadStudyEvents, type StudyEvent } from '../studyEvents';
import { useApp } from '../AppContext';
import { resolveStudyMembers, toCoachMemberId } from '../lib/studyMemberUtils';
import { useChessWheelNavigation } from '../hooks/useChessWheelNavigation';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION, squareMarksToStyles, SQUARE_MARK_BUTTON_PREVIEW, COLOR_VALUES, type SquareMarkColor } from '../lib/chessBoardUi';
import { useStudyCall } from '../hooks/useStudyCall';
import { DrawingToolbar, type DrawingTool } from './DrawingToolbar';
import { useStudyChapterSync } from '../hooks/useStudyChapterSync';
import { appendStudyAction } from '../services/studyActions';
import { loadStudyPresence, subscribeStudyPresence, upsertPresence } from '../services/studyActions';
import { serializePath } from '../lib/studySync/types';
import { mainlineSansFromTree, sanitizeChapterVariations, fenAtSyncPath, promoteVariationLines, mergeMainlineMoves, mergeVariationRecords, findVariationNodeAtMoveIndex } from '../lib/studySync/moveList';
import { exportLegacyFromTree } from '../lib/studySync/treeModel';
import { ChessBoardFrame, ChessEvalBar } from './chess/ChessBoardFrame';
import { ResponsiveTable } from './ui/ResponsiveTable';

import { isBoardFlipShortcutKey, keyboardTargetAllowsBoardShortcut } from '../lib/boardFlipShortcut';
import { useStudyBoardSettings } from '../hooks/useStudyBoardSettings';
import { useStudyKeyboardShortcuts } from '../hooks/useStudyKeyboardShortcuts';
import { StudyKeyboardHelpModal } from './study/StudyKeyboardHelpModal';
import { StudyBoardSettingsPanel } from './study/StudyBoardSettingsPanel';
import { computeThreatOverlay } from '../lib/chessThreats';
import { canCloneStudy, canExportStudy } from '../lib/studyPermissions';
import {
  buildGlyphSquareEntries,
  filterGlyphEntriesForCurrentBoard,
  findPlyByDestinationSquare,
  getDestinationSquareForPly,
  parseMoveGlyphs,
  studyAnnotationFromKey,
  toggleMoveGlyph,
} from '../lib/studyAnnotations';
import { createGlyphSquareRenderer } from './chess/ChessBoardGlyphOverlay';
import { imageToFenMultiple, formatOpenRouterError, type ImageBoardResult } from '../services/geminiService';
import { pdfAllPagesToDataUrls } from '../services/pdfToImage';
import StudentStudyView from './StudentStudyView';
import { readPanelHash, writeStudyEditorHash } from '../lib/panelRouting';

type AppView = StudyView;

type StudyListSidebar =
  | { type: 'all' }
  | { type: 'favorites' }
  | { type: 'category'; id: string };

type MoveAnalysisEntry = {
  id: string;
  moveNo: number;
  playedSan: string;
  expectedSan: string;
  isCorrect: boolean;
  thinkMs: number;
  atIso: string;
  userName?: string;
};

// ── Select component helper ───────────────────────────────────────────────────
const Sel: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  className?: string;
}> = ({ label, value, onChange, options, className = '' }) => (
  <div className={className}>
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{label}</label>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-teal-500/50"
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const StudyPage: React.FC = () => {
  const pickSquare = (arg: unknown): string | null => {
    if (typeof arg === 'string') return arg;
    if (arg && typeof arg === 'object' && 'square' in arg) {
      const sq = (arg as { square?: unknown }).square;
      return typeof sq === 'string' ? sq : null;
    }
    return null;
  };
  const pickDropArgs = (a: unknown, b?: unknown) => {
    const sourceSquare = typeof a === 'string'
      ? a
      : (a as { sourceSquare?: unknown } | null)?.sourceSquare;
    const targetSquare = typeof b === 'string'
      ? b
      : (a as { targetSquare?: unknown } | null)?.targetSquare;
    return {
      sourceSquare: typeof sourceSquare === 'string' ? sourceSquare : null,
      targetSquare: typeof targetSquare === 'string' ? targetSquare : null,
    };
  };

  /** react-chessboard v5 onPieceDrop: { piece: { pieceType: 'wP', ... }, sourceSquare, targetSquare } */
  const parsePieceFromChessboardDrag = (piece: unknown): { color: 'w' | 'b'; type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k' } | null => {
    let code: string | null = null;
    if (typeof piece === 'string' && piece.length >= 2) code = piece;
    else if (piece && typeof piece === 'object' && 'pieceType' in piece) {
      const pt = (piece as { pieceType?: unknown }).pieceType;
      if (typeof pt === 'string' && pt.length >= 2) code = pt;
    }
    if (!code) return null;
    const color = code[0];
    const t = code[1]?.toLowerCase();
    if (color !== 'w' && color !== 'b') return null;
    if (!t || !'pnbrqk'.includes(t)) return null;
    return { color, type: t as 'p' | 'n' | 'b' | 'r' | 'q' | 'k' };
  };

  const initialSelection = useMemo(() => {
    const saved = loadEditorSelection();
    const hash = readPanelHash();
    if (hash.studyId) {
      return {
        studyId: hash.studyId,
        chapterIndex: hash.chapterIndex ?? saved.chapterIndex,
        moveIndex: saved.moveIndex ?? 0,
      };
    }
    return saved;
  }, []);
  const { scopedStudents: students, coaches, auth, showToast } = useApp();
  const currentUserName = useMemo(() => {
    if (auth?.role === 'admin') return 'Admin';
    if (auth?.role === 'coach') return 'Antrenör';
    if (auth?.role === 'club') return auth.branch?.trim() || 'Kulüp';
    if (auth?.role === 'student' || auth?.role === 'parent') {
      return students.find(s => s.id === (auth as any).studentId)?.name ?? 'Öğrenci';
    }
    return 'Misafir';
  }, [auth, students]);
  const [view, setView] = useState<AppView>(() => (readPanelHash().studyId ? 'editor' : 'list'));
  const [studentPreviewStudyId, setStudentPreviewStudyId] = useState<string | null>(null);
  const [listSidebar, setListSidebar] = useState<StudyListSidebar>({ type: 'all' });
  const [studyCategories, setStudyCategories] = useState<StudyCategoryMeta[]>([]);
  const studyCategoriesLoadedRef = useRef(false);
  const [categoryAddOpen, setCategoryAddOpen] = useState(false);
  const [categoryAddName, setCategoryAddName] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [listSort, setListSort] = useState<'date' | 'likes'>('date');
  const [studies, setStudies] = useState<Study[]>([]);
  const [studiesLoading, setStudiesLoading] = useState(true);
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(initialSelection.studyId);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(initialSelection.chapterIndex);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(initialSelection.moveIndex ?? 0);
  const [hoverState, setHoverState] = useState<{ active: boolean; ply?: number; var?: [number, number, number]; fen?: string } | null>(null);
  const [selectedAnalysisStudentId, setSelectedAnalysisStudentId] = useState<string | null>(null);
  const [liveWatchStudentId, setLiveWatchStudentId] = useState<string | null>(null);
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, any>>({});
  const anyStudentLive = useMemo(() => {
    return Object.values(presenceByUserId).some((p: any) => !!p.payload?.vsComputer);
  }, [presenceByUserId]);

  // Left panel
  const [leftTab, setLeftTab] = useState<'chapters' | 'members'>('chapters');
  const [mobilePanel, setMobilePanel] = useState<'board' | 'left' | 'right'>('board');
  const [showChapterSearch, setShowChapterSearch] = useState(false);
  const [chapterSearch, setChapterSearch] = useState('');

  // Chat
  const [chatEnabled, setChatEnabled] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const deletedIdsRef = useRef<Set<string>>(new Set());

  // Modals
  const [showAddMember, setShowAddMember] = useState(false);
  const [showStudySettings, setShowStudySettings] = useState(false);
  const [showCallPanel, setShowCallPanel] = useState(false);
  
  const {
    status: callStatus,
    localStream: callLocalStream,
    remoteStream: callRemoteStream,
    incomingOffer: callIncomingOffer,
    error: callError,
    startCall: callStartCall,
    acceptCall: callAcceptCall,
    endCall: callEndCall,
    setIncomingOffer: setCallIncomingOffer,
  } = useStudyCall(selectedStudyId, currentUserName, 'coach');

  useEffect(() => {
    if (callIncomingOffer && !showCallPanel) {
      setShowCallPanel(true);
    }
  }, [callIncomingOffer, showCallPanel]);
  const [studyDraft, setStudyDraft] = useState<Study | null>(null);
  const [settingsStudyId, setSettingsStudyId] = useState<string | null>(null);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [chapterDraft, setChapterDraft] = useState<StudyChapter | null>(null);

  // Bottom toolbar
  const [bottomTab, setBottomTab] = useState<BottomTab>('tags');
  const [viewingStudentId, setViewingStudentId] = useState<string | null>(null);

  // REC mode
  const [recording, setRecording] = useState(true);
  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceFeedback, setPracticeFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [difficultyFeedback, setDifficultyFeedback] = useState<string | null>(null);
  const [moveAnalysisEntries, setMoveAnalysisEntries] = useState<MoveAnalysisEntry[]>([]);
  const [practiceFen, setPracticeFen] = useState<string | null>(null);
  const [practicePly, setPracticePly] = useState(0);
  const [chapterStartedAtMs, setChapterStartedAtMs] = useState<number>(Date.now());
  const [lastMoveActionAtMs, setLastMoveActionAtMs] = useState<number>(Date.now());

  // Admin: Study events from Supabase
  const [studyEvents, setStudyEvents] = useState<StudyEvent[]>([]);


  // Move highlights
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const [lastMoveSquares, setLastMoveSquares] = useState<Record<string, React.CSSProperties>>({});
  const [moveFrom, setMoveFrom] = useState<string | null>(null);

  /** Tahta üzerinde kare boyama (Lichess benzeri) */
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('mouse');
  const [drawingColor, setDrawingColor] = useState<SquareMarkColor>('red');
  /** Ok aracı seçili değilken: Ctrl + sağ tık kare işareti; sağ sürükle ok (mouse modunda) */
  const [arrowCtrlShortcutHeld, setArrowCtrlShortcutHeld] = useState(false);
  /** Yazma yokken (izleyici): F ile yalnızca yerel görünüm çevirisi */
  const [studyBoardViewFlipLocal, setStudyBoardViewFlipLocal] = useState(false);
  const [drawArrowsEnabled, setDrawArrowsEnabled] = useState(false);
  const [boardArrows, setBoardArrows] = useState<Array<{ startSquare: string; endSquare: string; color: string }>>([]);
  const [engineHoverMove, setEngineHoverMove] = useState<{ from: string; to: string } | null>(null);
  const [engineTopMove, setEngineTopMove] = useState<{ from: string; to: string } | null>(null);
  const [circleMarks, setCircleMarks] = useState<Record<string, { color: SquareMarkColor; type: 'square' | 'circle' | 'x' }>>({});
  /** Sembol atanacak hamle (0-tabanlı ply); tahta veya hamle listesinden seçilir */
  const [selectedAnnotationPly, setSelectedAnnotationPly] = useState<number | null>(null);

  // Evaluation bar
  const { settings: boardSettings, toggleSetting: toggleBoardSetting } = useStudyBoardSettings();
  const [showStudyHelp, setShowStudyHelp] = useState(false);
  const [showStudyBoardSettings, setShowStudyBoardSettings] = useState(false);
  const [evalScore, setEvalScore] = useState(0);
  const [isDraggingPiece, setIsDraggingPiece] = useState(false);
  const [dragFrozenFen, setDragFrozenFen] = useState<string | null>(null);

  // ── Create Study Modal ───────────────────────────────────────────────────────
  const [showCreateStudy, setShowCreateStudy] = useState(false);
  const [createStudyDraft, setCreateStudyDraft] = useState<Partial<Study> | null>(null);

  // Variation navigation: null = main line, [mainLinePos, varGroupIdx, moveIdx]
  const [currentVariation, setCurrentVariation] = useState<[number, number, number] | null>(null);
  const activeMoveBtnRef = useRef<HTMLButtonElement | null>(null);

  // PGN import
  const [pgnImportText, setPgnImportText] = useState('');
  const [showPgnImport, setShowPgnImport] = useState(false);
  const [showBulkPgnImport, setShowBulkPgnImport] = useState(false);
  const [bulkPgnImportText, setBulkPgnImportText] = useState('');
  const bulkPgnFileRef = useRef<HTMLInputElement>(null);
  const ncFenFileRef = useRef<HTMLInputElement>(null);

  // Board settings panel (eski tahta menüsü — EngineAnalysis içinden)
  const [showBoardSettings, setShowBoardSettings] = useState(false);

  // Board builder
  const [showBoardBuilder, setShowBoardBuilder] = useState(false);
  const [builderFen, setBuilderFen] = useState<string>(DEFAULT_FEN);
  const [builderTool, setBuilderTool] = useState<string>('cursor');
  const [builderFenInput, setBuilderFenInput] = useState<string>('');
  const builderToolRef = useRef('cursor');
  builderToolRef.current = builderTool;

  /** Görsel/PDF → FEN (bulmaca editörü ile aynı akış) */
  const studyVisionFileInputRef = useRef<HTMLInputElement>(null);
  const [studyVisionImageData, setStudyVisionImageData] = useState<string | null>(null);
  const [studyVisionPdfPages, setStudyVisionPdfPages] = useState<string[]>([]);
  const [studyVisionPdfPage, setStudyVisionPdfPage] = useState(0);
  const [studyVisionUploadBusy, setStudyVisionUploadBusy] = useState(false);
  const [studyVisionExtractBusy, setStudyVisionExtractBusy] = useState(false);
  const [studyVisionError, setStudyVisionError] = useState('');
  const [studyVisionBoards, setStudyVisionBoards] = useState<ImageBoardResult[] | null>(null);
  const [studyVisionBoardIdx, setStudyVisionBoardIdx] = useState(0);

  // New Chapter modal
  const [showNewChapterModal, setShowNewChapterModal] = useState(false);
  const [ncName, setNcName] = useState('');
  const [ncTab, setNcTab] = useState<'empty' | 'editor' | 'fen' | 'vision'>('empty');
  const [ncFen, setNcFen] = useState(DEFAULT_FEN);
  const [ncFenInput, setNcFenInput] = useState('');
  const [ncOrientation, setNcOrientation] = useState<'white' | 'black'>('white');
  const [ncMode, setNcMode] = useState<'normal' | 'practice' | 'interactive'>('normal');
  const [ncEditorTool, setNcEditorTool] = useState<string | null>(null);
  const [ncCastling, setNcCastling] = useState({ K: true, Q: true, k: true, q: true });
  const [ncTurn, setNcTurn] = useState<'w' | 'b'>('w');
  const ncEditorToolRef = useRef<string | null>(null);
  ncEditorToolRef.current = ncEditorTool;

  const applyNcEditorAtSquare = useCallback((square: string) => {
    setNcFen((prev) => {
      const tool = ncEditorToolRef.current;
      const game = makeBuilderGame(prev);
      const occupied = !!game.get(square as Square);

      if (!tool || tool === 'cursor') {
        if (occupied) {
          game.remove(square as any);
          return game.fen();
        }
        return prev;
      }
      if (tool === 'trash') {
        try {
          game.remove(square as any);
        } catch { /* boş kare */ }
        return game.fen();
      }
      const color = tool[0] as 'w' | 'b';
      const type = tool[1].toLowerCase() as any;
      try {
        game.remove(square as any);
        game.put({ type, color }, square as any);
        return game.fen();
      } catch {
        return prev;
      }
    });
  }, []);

  const applyBuilderAtSquare = useCallback((square: string) => {
    setBuilderFen((prev) => {
      const tool = builderToolRef.current;
      const game = makeBuilderGame(prev);
      const occupied = !!game.get(square as Square);

      if (tool === 'cursor') {
        if (occupied) {
          game.remove(square as any);
          return game.fen();
        }
        return prev;
      }
      if (tool === 'trash') {
        try {
          game.remove(square as any);
        } catch { /* boş kare */ }
        return game.fen();
      }
      const color = tool[0] as 'w' | 'b';
      const type = tool[1].toLowerCase() as any;
      try {
        game.remove(square as any);
        game.put({ type, color }, square as any);
        return game.fen();
      } catch {
        return prev;
      }
    });
  }, []);

  useEffect(() => {
    if (!showBoardBuilder) return;
    setBuilderFenInput(builderFen);
  }, [builderFen, showBoardBuilder]);

  // ── Persistence ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setStudiesLoading(true);
    loadStudiesAsync()
      .then(fresh => {
        setStudies(fresh
          .filter(s => !deletedIdsRef.current.has(s.id))
          .map(migrateStudy)
        );
      })
      .catch(() => {})
      .finally(() => setStudiesLoading(false));

    const unsub = subscribeToStudies(fresh => {
      setStudiesLoading(false);
      setStudies(fresh
        .filter(s => !deletedIdsRef.current.has(s.id))
        .map(migrateStudy)
      );
    });
    return unsub;
  }, []);

  useEffect(() => {
    void loadStudyCategoriesAsync()
      .then((cats) => {
        setStudyCategories(cats);
        studyCategoriesLoadedRef.current = true;
      })
      .catch(() => {
        setStudyCategories(loadStudyCategories());
        studyCategoriesLoadedRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (!studyCategoriesLoadedRef.current) return;
    void saveStudyCategoriesAsync(studyCategories);
  }, [studyCategories]);

  useEffect(() => {
    if (studies.length === 0) return;
    if (selectedStudyId && studies.some((s) => s.id === selectedStudyId)) return;

    const hash = readPanelHash();
    if (hash.studyId && studies.some((s) => s.id === hash.studyId)) {
      setSelectedStudyId(hash.studyId);
      if (hash.chapterIndex != null) setSelectedChapterIndex(hash.chapterIndex);
      return;
    }
    if (!selectedStudyId) setSelectedStudyId(studies[0].id);
  }, [studies, selectedStudyId]);

  useEffect(() => {
    if (selectedStudyId && studies.length > 0 && !studies.find(s => s.id === selectedStudyId)) {
      setSelectedStudyId(studies[0].id);
      setSelectedChapterIndex(0);
    }
  }, [studies, selectedStudyId]);

  useEffect(() => {
    saveEditorSelection(selectedStudyId, selectedChapterIndex, currentMoveIndex);
    if (selectedStudyId && view === 'editor') {
      writeStudyEditorHash(selectedStudyId, selectedChapterIndex);
    }
  }, [selectedStudyId, selectedChapterIndex, currentMoveIndex, view]);

  // ── Derived state ─────────────────────────────────────────────────────────────
  const selectedStudy = useMemo(
    () => studies.find(s => s.id === selectedStudyId) ?? null,
    [studies, selectedStudyId],
  );

  // Auto-select first student for coaches
  useEffect(() => {
    if ((auth?.role === 'admin' || auth?.role === 'coach') && !viewingStudentId && selectedStudy?.practiceLogs) {
      const studentIds = Object.keys(selectedStudy.practiceLogs);
      if (studentIds.length > 0) {
        setViewingStudentId(studentIds[0]);
      }
    }
  }, [auth, viewingStudentId, selectedStudy?.practiceLogs]);

  const chatMessages = selectedStudy?.chatMessages ?? [];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  const selectedChapterRaw = useMemo(() => {
    if (!selectedStudy || selectedStudy.chapters.length === 0) return null;
    const idx = Math.min(selectedChapterIndex, selectedStudy.chapters.length - 1);
    return selectedStudy.chapters[idx];
  }, [selectedStudy, selectedChapterIndex]);

  const actorId = useMemo(() => {
    if (!auth) return 'anon';
    if ((auth as any).studentId) return String((auth as any).studentId);
    return String(auth.role || 'user');
  }, [auth]);

  const actorRole = auth?.role ?? 'unknown';

  const {
    syncState,
    legacyChapter,
    sticky,
    write,
    setSticky,
    setWrite,
    behind,
    catchUp,
    jumpToVariation,
    jumpToNodePath,
    jumpToMoveIndex,
    promoteVariation,
    promoteBranchNodeId,
    alignMainlineToMoves,
    navigationState,
    makeMove,
    setNodeGlyphs,
    undoMove,
    truncateMainlineFromMoveIndex,
    truncateFromNodeId,
    truncateVariationFromMove,
    clearChapter,
    parsePath,
    serializePath,
  } = useStudyChapterSync({
    study: selectedStudy,
    chapter: selectedChapterRaw,
    actorId,
    actorRole,
    initialSticky: true,
    initialWrite: recording,
  });

  const selectedChapter = useMemo(() => {
    const treeCh = legacyChapter ?? null;
    const raw = selectedChapterRaw;
    if (!raw) return treeCh;
    if (!treeCh || treeCh.id !== raw.id) return raw;

    const syncTreeActive =
      !!syncState && syncState.chapterId === raw.id && (syncState.tree?.mainline?.length ?? 0) > 1;
    if (syncTreeActive) {
      return {
        ...raw,
        ...treeCh,
        moves: treeCh.moves ?? [],
        variations: treeCh.variations ?? {},
        moveComments: {
          ...(raw.moveComments ?? {}),
          ...(treeCh.moveComments ?? {}),
        },
        moveAnnotations: {
          ...(raw.moveAnnotations ?? {}),
          ...(treeCh.moveAnnotations ?? {}),
        },
      };
    }

    const rawMoves = raw.moves ?? [];
    const treeMoves = treeCh.moves ?? [];
    const mergedVars = mergeVariationRecords(raw.variations ?? {}, treeCh?.variations ?? {});
    return {
      ...raw,
      moves: mergeMainlineMoves(rawMoves, treeMoves),
      variations: mergedVars,
      moveComments: {
        ...(raw.moveComments ?? {}),
        ...(treeCh.moveComments ?? {}),
      },
      moveAnnotations: {
        ...(raw.moveAnnotations ?? {}),
        ...(treeCh.moveAnnotations ?? {}),
      },
    };
  }, [legacyChapter, selectedChapterRaw, syncState?.chapterId, syncState?.tree?.mainline?.length]);

  /** Sync yüklenmeden önce seedTree ile anında ağaç notasyonu */
  const effectiveStudyTree = useMemo(() => {
    if (
      !!syncState &&
      syncState.chapterId === selectedChapterRaw?.id &&
      (syncState.tree?.mainline?.length ?? 0) > 1
    ) {
      return syncState.tree;
    }
    const seed = selectedChapterRaw?.seedTree;
    if (seed?.rootId && (seed.mainline?.length ?? 0) > 1) return seed;
    return null;
  }, [syncState, selectedChapterRaw?.id, selectedChapterRaw?.seedTree]);

  const effectiveStudyPath = useMemo(() => {
    if (!!syncState && syncState.chapterId === selectedChapterRaw?.id && syncState.currentPath?.length) {
      return syncState.currentPath;
    }
    if (effectiveStudyTree?.mainline?.length) return effectiveStudyTree.mainline.slice();
    return undefined;
  }, [syncState, selectedChapterRaw?.id, effectiveStudyTree]);

  const isInteractivePuzzleChapter = useMemo(
    () =>
      !!selectedChapter &&
      selectedChapter.lessonMode === 'interactive' &&
      (selectedChapter.interactiveType ?? 'puzzle') === 'puzzle',
    [selectedChapter?.id, selectedChapter?.lessonMode, selectedChapter?.interactiveType]
  );

  const puzzlePlayNorm = useMemo(() => {
    if (!isInteractivePuzzleChapter || !selectedChapter) return null;
    return normalizeStudyChapterPuzzle(selectedChapter);
  }, [isInteractivePuzzleChapter, selectedChapter?.fen, selectedChapter?.moves, selectedChapter?.id]);

  const chapterMovesForUi = useMemo(() => {
    if (isInteractivePuzzleChapter && puzzlePlayNorm) return puzzlePlayNorm.studentMoves;
    if (practiceMode && !recording) return selectedChapter?.moves ?? [];
    const legacy = selectedChapterRaw?.moves ?? [];
    const tree =
      !!syncState &&
      syncState.chapterId === selectedChapterRaw?.id &&
      (syncState.tree?.mainline?.length ?? 0) > 1
        ? syncState.tree
        : effectiveStudyTree;
    if (!tree?.mainline || tree.mainline.length <= 1) {
      return selectedChapter?.moves ?? legacy;
    }
    const rootFen = tree.nodes[tree.rootId]?.fen ?? selectedChapterRaw?.fen ?? DEFAULT_FEN;
    const fromTree = mainlineSansFromTree(tree, rootFen);
    return mergeMainlineMoves(legacy, fromTree);
  }, [isInteractivePuzzleChapter, puzzlePlayNorm, practiceMode, recording, syncState, effectiveStudyTree, selectedChapter?.moves, selectedChapterRaw?.moves, selectedChapterRaw?.id, selectedChapterRaw?.fen]);

  const moveListChapter = useMemo(() => {
    if (!selectedChapter) return null;
    const fen = isInteractivePuzzleChapter && puzzlePlayNorm
      ? puzzlePlayNorm.startFen
      : selectedChapter.fen;
    let moves = chapterMovesForUi;
    let variations = selectedChapter.variations ?? {};
    if (effectiveStudyTree) {
      const exported = exportLegacyFromTree(effectiveStudyTree, fen);
      moves = exported.moves.length ? exported.moves : moves;
      variations = exported.variations ?? variations;
    }
    const vars = sanitizeChapterVariations({ ...selectedChapter, fen, moves }, moves);
    return { ...selectedChapter, fen, moves, variations: vars };
  }, [selectedChapter, chapterMovesForUi, isInteractivePuzzleChapter, puzzlePlayNorm, effectiveStudyTree]);

  useEffect(() => {
    setWrite(recording);
  }, [recording, setWrite]);

  const formatDuration = useCallback((ms: number): string => {
    const sec = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, []);
  const totalThinkMs = useMemo(
    () => moveAnalysisEntries.reduce((sum, item) => sum + item.thinkMs, 0),
    [moveAnalysisEntries]
  );
  const totalCorrectThinkMs = useMemo(
    () => moveAnalysisEntries.filter((item) => item.isCorrect).reduce((sum, item) => sum + item.thinkMs, 0),
    [moveAnalysisEntries]
  );
  const totalWrongThinkMs = useMemo(
    () => moveAnalysisEntries.filter((item) => !item.isCorrect).reduce((sum, item) => sum + item.thinkMs, 0),
    [moveAnalysisEntries]
  );


  const initialMoveRestoreDoneRef = useRef(false);
  useEffect(() => {
    if (!selectedChapter || initialMoveRestoreDoneRef.current) return;
    const maxMoves = chapterMovesForUi.length;
    const savedMove = initialSelection.moveIndex ?? 0;
    // İlk açılışta kayıtlı hamle yoksa bile bölümün sonuna git (yenilemede başa dönmesin).
    const targetMove = savedMove > 0 ? Math.min(savedMove, maxMoves) : maxMoves;
    setCurrentMoveIndex(targetMove);
    initialMoveRestoreDoneRef.current = true;
  }, [selectedChapter, initialSelection.moveIndex, chapterMovesForUi.length]);

  // Live analizde hamleler append edildikçe otomatik en sona git
  const prevLiveMovesLenRef = useRef<number>(0);
  const [liveLastMoveAtMs, setLiveLastMoveAtMs] = useState<number | null>(null);
  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => {
    const isTeacher = auth?.role === 'admin' || auth?.role === 'coach';
    const isLive =
      !!selectedChapter &&
      selectedChapter.lessonMode === 'interactive' &&
      selectedChapter.interactiveType === 'liveAnalysis';
    if (!isTeacher || !isLive || !selectedStudy?.syncEnabled) return;
    const movesLen = chapterMovesForUi.length;
    const prev = prevLiveMovesLenRef.current;
    prevLiveMovesLenRef.current = movesLen;
    if (movesLen > prev) {
      setLiveLastMoveAtMs(Date.now());
      // Öğretmen zaten en sona yakınsa takip et
      if (currentMoveIndex >= prev) {
        setCurrentVariation(null);
        setHoverState(null);
        setOptionSquares({});
        setMoveFrom(null);
        setCurrentMoveIndex(movesLen);
      }
    }
  }, [
    auth?.role,
    selectedStudy?.syncEnabled,
    selectedChapter?.id,
    selectedChapter?.lessonMode,
    selectedChapter?.interactiveType,
    chapterMovesForUi.length,
    currentMoveIndex,
  ]);

  useEffect(() => {
    const isTeacher = auth?.role === 'admin' || auth?.role === 'coach';
    const isLive =
      !!selectedChapter &&
      selectedChapter.lessonMode === 'interactive' &&
      selectedChapter.interactiveType === 'liveAnalysis';
    if (!isTeacher || !isLive || !selectedStudy?.syncEnabled) return;
    const t = setInterval(() => setLiveTick((x) => (x + 1) % 1000000), 1000);
    return () => clearInterval(t);
  }, [auth?.role, selectedStudy?.syncEnabled, selectedChapter?.id, selectedChapter?.lessonMode, selectedChapter?.interactiveType]);

  const liveAgoLabel = useMemo(() => {
    if (!liveLastMoveAtMs) return 'bekleniyor';
    const sec = Math.max(0, Math.floor((Date.now() - liveLastMoveAtMs) / 1000));
    if (sec < 3) return 'şimdi';
    if (sec < 60) return `${sec} sn önce`;
    const min = Math.floor(sec / 60);
    return `${min} dk önce`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveLastMoveAtMs, liveTick]);

  useEffect(() => {
    setCircleMarks(selectedChapter?.circles ?? {});
    setBoardArrows(() => {
      const raw = (selectedChapter?.arrows ?? []) as Array<{ startSquare: string; endSquare: string; color: string }>;
      const seen = new Set<string>();
      const out: Array<{ startSquare: string; endSquare: string; color: string }> = [];
      for (const a of raw) {
        if (!a.startSquare || !a.endSquare) continue;
        const k = `${a.startSquare.toLowerCase()}-${a.endSquare.toLowerCase()}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({
          ...a,
          startSquare: a.startSquare.toLowerCase(),
          endSquare: a.endSquare.toLowerCase()
        });
      }
      return out;
    });
    setDrawingTool('mouse');
    setHoverState(null);
    setLastMoveSquares({});
    setOptionSquares({});
    setMoveFrom(null);
    setEngineHoverMove(null);
    setEngineTopMove(null);
  }, [selectedChapter?.id]);

  useEffect(() => {
    const now = Date.now();
    setChapterStartedAtMs(now);
    setLastMoveActionAtMs(now);
    setMoveAnalysisEntries([]);
  }, [selectedStudy?.id, selectedChapter?.id]);

  // Load study events from Supabase for admin/coach
  const refreshStudyEvents = useCallback(() => {
    if (!selectedStudy || (auth?.role !== 'admin' && auth?.role !== 'coach')) {
      setStudyEvents([]);
      return;
    }
    loadStudyEvents(selectedStudy.id).then(events => {
      setStudyEvents(events);
    }).catch(() => setStudyEvents([]));
  }, [selectedStudy?.id, auth?.role]);

  useEffect(() => {
    refreshStudyEvents();
  }, [refreshStudyEvents]);

  useEffect(() => {
    if (bottomTab === 'analysis') refreshStudyEvents();
  }, [bottomTab, selectedChapter?.id, refreshStudyEvents]);

  const syncPathFen = useMemo(() => {
    if (!syncState || syncState.chapterId !== selectedChapterRaw?.id) return null;
    return fenAtSyncPath(syncState);
  }, [syncState, selectedChapterRaw?.id]);

  const currentFen = useMemo(() => {
    if (syncPathFen) return syncPathFen;
    const ch = moveListChapter ?? selectedChapter;
    if (!ch) return DEFAULT_FEN;
    try {
      const game = makeBuilderGame(ch.fen || DEFAULT_FEN);
      const moves = ch.moves ?? [];
      const upTo = Math.min(currentMoveIndex, moves.length);
      for (let i = 0; i < upTo; i++) {
        if (!applyMove(game, moves[i])) break;
      }
      return game.fen();
    } catch { return ch.fen || DEFAULT_FEN; }
  }, [syncPathFen, moveListChapter, selectedChapter, currentMoveIndex]);

  // Practice (vs computer) oynanıyorsa chapter.moves yerine local fen kullan
  const practiceActiveFen = useMemo(() => {
    if (!practiceMode || recording) return null;
    return practiceFen ?? (selectedChapter?.fen || DEFAULT_FEN);
  }, [practiceMode, recording, practiceFen, selectedChapter?.fen]);

  const filteredChapters = useMemo(() => {
    if (!selectedStudy) return [];
    if (!chapterSearch.trim()) return selectedStudy.chapters;
    return selectedStudy.chapters.filter(ch =>
      chapterListLabelMatches(ch, chapterSearch, selectedStudy.chapters),
    );
  }, [selectedStudy, chapterSearch]);

  // --- Presence & Global Sync (Chapter Sync) ---
  useEffect(() => {
    if (!selectedStudyId || !auth?.user?.id) return;
    
    // Subscribe to presence updates for this study
    const unsub = subscribeStudyPresence({
      studyId: selectedStudyId,
      onRow: (row) => {
        // If someone else is driving (coach/admin) and we are sticky, follow their chapter
        if (row.user_id !== auth.user?.id && row.chapter_id && sticky) {
          // Identify if the user is a coach (optional, but good if we can)
          // For now, if we see a chapter change and we are in sync mode, we check if it's different
          const chapterIdx = selectedStudy?.chapters?.findIndex(c => c.id === row.chapter_id);
          if (chapterIdx !== undefined && chapterIdx !== -1 && chapterIdx !== selectedChapterIndex) {
            setSelectedChapterIndex(chapterIdx);
          }
        }
      }
    });

    return () => unsub();
  }, [selectedStudyId, auth?.user?.id, sticky, selectedChapterIndex, selectedStudy?.chapters]);

  // Upsert our own presence periodically
  useEffect(() => {
    if (!selectedStudyId || !auth?.user?.id || !selectedChapter) return;
    
    const interval = setInterval(() => {
      void upsertPresence({
        studyId: selectedStudyId,
        userId: auth.user!.id,
        chapterId: selectedChapter.id,
        path: syncState ? serializePath(syncState.currentPath) : null,
        sticky: !!sticky,
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedStudyId, auth?.user?.id, selectedChapter, syncState, sticky]);

  const members = useMemo(() => {
    if (!selectedStudy) return [];
    return resolveStudyMembers(selectedStudy.memberIds, students, coaches);
  }, [students, coaches, selectedStudy]);

  const availableStudentsToAdd = useMemo(() => {
    if (!selectedStudy) return [];
    const memberSet = new Set(selectedStudy.memberIds.map(String));
    return students.filter((s) => !memberSet.has(String(s.id)));
  }, [selectedStudy, students]);

  const availableCoachesToAdd = useMemo(() => {
    if (!selectedStudy) return [];
    const memberSet = new Set(selectedStudy.memberIds.map(String));
    return coaches.filter((c) => !memberSet.has(toCoachMemberId(String(c.id))));
  }, [selectedStudy, coaches]);
  useEffect(() => {
    if (!selectedStudy?.id) { setPresenceByUserId({}); return; }
    let mounted = true;
    loadStudyPresence(selectedStudy.id).then((rows) => {
      if (!mounted) return;
      const next: Record<string, any> = {};
      for (const r of rows) next[String(r.user_id)] = r;
      setPresenceByUserId(next);
    }).catch(() => {});
    const unsub = subscribeStudyPresence({
      studyId: selectedStudy.id,
      onRow: (row) => {
        if (!mounted) return;
        setPresenceByUserId((prev) => ({ ...prev, [String(row.user_id)]: row }));
      },
    });
    return () => { mounted = false; unsub(); };
  }, [selectedStudy?.id]);

  const getVsComputerHistory = useCallback((payload: any): string[] => {
    if (!payload) return [];
    if (Array.isArray(payload.vcHistory)) return payload.vcHistory.filter((m: unknown): m is string => typeof m === 'string');
    if (Array.isArray(payload.history)) return payload.history.filter((m: unknown): m is string => typeof m === 'string');
    if (Array.isArray(payload.moves)) return payload.moves.filter((m: unknown): m is string => typeof m === 'string');
    return [];
  }, []);

  const formatPresence = useCallback((row: any) => {
    if (!row) return null;
    const payload = row.payload ?? {};
    const chapId = row.chapter_id ? String(row.chapter_id) : null;
    const ch = chapId ? selectedStudy?.chapters?.find(c => String(c.id) === chapId) : null;
    const ply = row.path ? Math.max(0, String(row.path).split('.').filter(Boolean).length - 1) : 0;
    return {
      sticky: !!row.sticky,
      chapterTitle: ch?.title ?? (chapId ? `Bölüm ${chapId.slice(0, 6)}` : '—'),
      ply,
      vsComputer: !!payload.vsComputer,
      vcFen: payload.fen ?? payload.vcFen,
      vcHistory: getVsComputerHistory(payload),
      vcThinking: !!payload.thinking,
      gameOver: !!payload.gameOver,
    };
  }, [getVsComputerHistory, selectedStudy?.chapters]);

  // ── Navigation ────────────────────────────────────────────────────────────────
  const goStart = useCallback(() => {
    setHoverState(null);
    setCurrentVariation(null);
    setOptionSquares({});
    setMoveFrom(null);
    setCurrentMoveIndex(0);
    void jumpToMoveIndex(0);
  }, [jumpToMoveIndex]);
  const goPrev  = useCallback(() => {
    setHoverState(null);
    if (currentVariation && selectedChapter) {
      const [mainLinePos, varGroupIdx, varMoveIdx] = currentVariation;
      if (varMoveIdx > 0) {
        setCurrentVariation([mainLinePos, varGroupIdx, varMoveIdx - 1]);
        void jumpToVariation(mainLinePos, varGroupIdx, varMoveIdx - 1);
      } else {
        setCurrentVariation(null);
        void jumpToMoveIndex(mainLinePos);
      }
      setOptionSquares({});
      setMoveFrom(null);
      return;
    }
    const next = Math.max(0, currentMoveIndex - 1);
    setCurrentVariation(null);
    setOptionSquares({});
    setMoveFrom(null);
    void jumpToMoveIndex(next);
  }, [currentVariation, selectedChapter, currentMoveIndex, jumpToMoveIndex, jumpToVariation]);
  const goNext  = useCallback(() => {
    setHoverState(null);
    if (currentVariation && selectedChapter) {
      const [mainLinePos, varGroupIdx, varMoveIdx] = currentVariation;
      const line = selectedChapter.variations?.[mainLinePos]?.[varGroupIdx] ?? [];
      if (varMoveIdx < line.length - 1) {
        setCurrentVariation([mainLinePos, varGroupIdx, varMoveIdx + 1]);
        void jumpToVariation(mainLinePos, varGroupIdx, varMoveIdx + 1);
      } else {
        setCurrentVariation(null);
        void jumpToMoveIndex(Math.min(chapterMovesForUi.length, mainLinePos + 1));
      }
      return;
    }
    const next = Math.min(chapterMovesForUi.length, currentMoveIndex + 1);
    setCurrentVariation(null);
    void jumpToMoveIndex(next);
  }, [selectedChapter, currentVariation, chapterMovesForUi.length, currentMoveIndex, jumpToMoveIndex, jumpToVariation]);
  const goEnd   = useCallback(() => {
    setHoverState(null);
    setCurrentVariation(null);
    void jumpToMoveIndex(chapterMovesForUi.length);
  }, [chapterMovesForUi.length, jumpToMoveIndex]);

  const wheelPrev = useCallback(() => { setHoverState(null); goPrev(); }, [goPrev]);
  const wheelNext = useCallback(() => { setHoverState(null); goNext(); }, [goNext]);
  const hasMovesForWheel = chapterMovesForUi.length > 0;
  const boardWheelRef = useChessWheelNavigation(wheelPrev, wheelNext, hasMovesForWheel);

  useEffect(() => {
    activeMoveBtnRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [currentMoveIndex, currentVariation, selectedChapter?.id]);

  const goNextChapter = useCallback(() => {
    if (!selectedStudy) return;
    const next = selectedChapterIndex + 1;
    if (next < selectedStudy.chapters.length) {
      setSelectedChapterIndex(next);
      setHoverState(null);
      setCurrentMoveIndex(0);
      setCurrentVariation(null);
      setOptionSquares({});
      setLastMoveSquares({});
      setMoveFrom(null);
    }
  }, [selectedStudy, selectedChapterIndex]);

  /** Tahtanın kurallara uygun olup olmadığını denetler. Geçersizse Türkçe hata mesajı döner. */
  function validateBoardForSave(fen: string): string | null {
    const parts = fen.split(' ');
    const rows = parts[0].split('/');
    
    if (rows.length !== 8) return "Tahta geçersiz FEN formatına sahip.";

    let whiteKings = 0;
    let blackKings = 0;

    for (const row of rows) {
      for (const char of row) {
        if (char === 'K') whiteKings++;
        if (char === 'k') blackKings++;
      }
    }

    if (whiteKings !== 1 || blackKings !== 1) {
      return `Eksik veya fazla şah var. Lütfen her iki taraf için tam olarak 1 adet şah yerleştirin.\n(Şu an: ${whiteKings} Beyaz Şah, ${blackKings} Siyah Şah)`;
    }

    const rank8 = rows[0];
    const rank1 = rows[7];

    if (rank8.includes('p') || rank8.includes('P') || rank1.includes('p') || rank1.includes('P')) {
      return "Satranç kurallarına göre 1. veya 8. yatayda piyon bulunamaz.";
    }

    try {
      new Chess(fen);
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.includes('missing')) return "Eksik şah var. Lütfen her iki tarafa da şah yerleştirin.";
      if (msg.includes('edge rows')) return "1. veya 8. yatayda piyon bulunamaz.";
      if (msg.includes('too many')) return "Tahtada çok fazla şah var.";
      return "Tahta konumu geçersiz. Lütfen kurallara uygun bir pozisyon ayarlayın.";
    }

    return null;
  }

  // ── Study CRUD ────────────────────────────────────────────────────────────────
  const updateAndSaveStudy = useCallback((id: string, updater: (s: Study) => Study) => {
    setStudies(prev => {
      const next = prev.map(s => s.id === id ? updater(s) : s);
      const updated = next.find(s => s.id === id);
      if (updated) saveStudyAsync(updated).catch(() => {});
      return next;
    });
  }, []);

  const addStudyCategory = useCallback(() => {
    const name = categoryAddName.trim();
    if (!name) return;
    setStudyCategories((prev) => [...prev, { id: genId(), name }]);
    setCategoryAddName('');
    setCategoryAddOpen(false);
  }, [categoryAddName]);

  const deleteStudyCategory = useCallback((id: string) => {
    if (!window.confirm('Kategori silinsin mi? Bu klasördeki çalışmalar genel listeye taşınır.')) return;
    setStudyCategories((prev) => prev.filter((c) => c.id !== id));
    setStudies((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        if (s.categoryId !== id) return s;
        changed = true;
        const u = { ...s, categoryId: null as string | null };
        saveStudyAsync(u).catch(() => {});
        return u;
      });
      return changed ? next : prev;
    });
    setListSidebar((cur) => (cur.type === 'category' && cur.id === id ? { type: 'all' } : cur));
  }, []);

  const createStudyFromDraft = useCallback((draft: Partial<Study>) => {
    const id = genId();
    const study = migrateStudy({
      id,
      title: String(draft.title ?? `Çalışma ${studies.length + 1}`),
      emoji: String(draft.emoji ?? '♟️'),
      visibility: (draft.visibility as any) ?? 'unlisted',
      chat: (draft.chat as any) ?? 'members',
      computerAnalysis: (draft.computerAnalysis as any) ?? 'everyone',
      openingExplorer: (draft.openingExplorer as any) ?? 'everyone',
      clonePermission: (draft.clonePermission as any) ?? 'everyone',
      shareExport: (draft.shareExport as any) ?? 'everyone',
      syncEnabled: typeof draft.syncEnabled === 'boolean' ? draft.syncEnabled : true,
      studyComments: (draft.studyComments as any) ?? 'none',
      chapters: [migrateChapter({ id: genId(), title: 'Bölüm 1' })],
      description: String(draft.description ?? ''),
      tags: Array.isArray(draft.tags) ? draft.tags : [],
      topicTags: Array.isArray(draft.topicTags) ? draft.topicTags : [],
      liked: false,
      likes: 0,
      createdAt: new Date().toISOString(),
      studentCreated: false,
      createdByStudentId: null,
      categoryId:
        typeof draft.categoryId === 'string' && draft.categoryId.trim() !== ''
          ? draft.categoryId.trim()
          : null,
    });
    setStudies(prev => [...prev, study]);
    saveStudyAsync(study).catch(() => {});
    setSelectedStudyId(id);
    setSelectedChapterIndex(0);
    setCurrentMoveIndex(0);
    setView('editor');
  }, [studies.length]);

  const openCreateStudyModal = useCallback(() => {
    const defaultTitle =
      `${currentUserName ?? ''}`.trim()
        ? `${String(currentUserName).trim()}'s Study`
        : `Çalışma ${studies.length + 1}`;
    setCreateStudyDraft({
      emoji: '♟️',
      title: defaultTitle,
      visibility: 'unlisted',
      chat: 'members',
      computerAnalysis: 'everyone',
      openingExplorer: 'everyone',
      clonePermission: 'everyone',
      shareExport: 'everyone',
      syncEnabled: true,
      studyComments: 'none',
      description: '',
      categoryId:
        listSidebar.type === 'category'
          ? listSidebar.id
          : null,
    });
    setShowCreateStudy(true);
  }, [currentUserName, studies.length, listSidebar]);

  const addStudy = useCallback(() => {
    openCreateStudyModal();
  }, [openCreateStudyModal]);

  const openStudyInEditor = useCallback((studyId: string) => {
    setSelectedStudyId(studyId);
    setSelectedChapterIndex(0);
    setCurrentMoveIndex(0);
    setCurrentVariation(null);
    setOptionSquares({});
    setLastMoveSquares({});
    setMoveFrom(null);
    setView('editor');
  }, []);

  const updateStudy = useCallback((patch: Partial<Study>) => {
    if (!selectedStudy) return;
    updateAndSaveStudy(selectedStudy.id, s => ({ ...s, ...patch }));
  }, [selectedStudy, updateAndSaveStudy]);

  // ── Chapter CRUD ──────────────────────────────────────────────────────────────
  const openNewChapterModal = useCallback((tab: 'empty' | 'editor' | 'fen' | 'vision' = 'empty') => {
    if (!selectedStudy) return;
    setNcName(`Bölüm ${selectedStudy.chapters.length + 1}`);
    setNcTab(tab);
    setNcFen(DEFAULT_FEN);
    setNcFenInput('');
    setNcOrientation('white');
    setNcMode('normal');
    setNcEditorTool(null);
    setNcCastling({ K: true, Q: true, k: true, q: true });
    setNcTurn('w');
    setStudyVisionImageData(null);
    setStudyVisionPdfPages([]);
    setStudyVisionPdfPage(0);
    setStudyVisionBoards(null);
    setStudyVisionBoardIdx(0);
    setStudyVisionError('');
    setShowNewChapterModal(true);
  }, [selectedStudy]);

  const addChapter = useCallback(() => openNewChapterModal('empty'), [openNewChapterModal]);

  const handleNcFenFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const text = (await file.text()).trim();
        if (!text) {
          showToast('Dosya boş', 'error');
          return;
        }
        setNcFenInput(text);
        const baseName = file.name.replace(/\.(pgn|fen|txt)$/i, '').trim();
        if (baseName) {
          setNcName((prev) => (/^Bölüm \d+$/i.test(prev.trim()) ? baseName : prev));
        }
        showToast(`${file.name} yüklendi`, 'success');
      } catch {
        showToast('Dosya okunamadı', 'error');
      } finally {
        if (ncFenFileRef.current) ncFenFileRef.current.value = '';
      }
    })();
  }, [showToast]);

  const ncUpdateFenMeta = useCallback((turn: 'w' | 'b', castling: typeof ncCastling) => {
    try {
      const parts = ncFen.split(' ');
      if (parts.length < 6) return;
      parts[1] = turn;
      let c = '';
      if (castling.K) c += 'K';
      if (castling.Q) c += 'Q';
      if (castling.k) c += 'k';
      if (castling.q) c += 'q';
      parts[2] = c || '-';
      setNcFen(parts.join(' '));
    } catch {}
  }, [ncFen]);

  const createChapterFromModal = useCallback(() => {
    if (!selectedStudy) return;
    let fen = DEFAULT_FEN;
    let moves: string[] = [];
    switch (ncTab) {
      case 'empty':
        break;
      case 'editor':
      case 'vision':
        fen = ncFen;
        break;
      case 'fen': {
        const txt = ncFenInput.trim();
        if (!txt) break;
        const hasMoves = txt.includes('1.') || txt.includes('1 ');
        if (hasMoves) {
          try {
            const { startFen, moves: parsedMoves } = parsePgnBlockToMoves(txt);
            moves = parsedMoves;
            fen = startFen;
          } catch {}
        } else {
          fen = txt;
          try { new Chess(fen); } catch { fen = DEFAULT_FEN; }
        }
        break;
      }
    }

    const validationError = validateBoardForSave(fen);
    if (validationError) return showToast(validationError, 'error');

    const lessonMode = ncMode === 'normal' ? 'direct' as const : 'interactive' as const;
    const interactiveType = ncMode === 'interactive' ? 'liveAnalysis' as const : 'puzzle' as const;
    const ch = migrateChapter({
      id: genId(),
      title: ncName || `Bölüm ${selectedStudy.chapters.length + 1}`,
      fen,
      moves,
      orientation: ncOrientation,
      lessonMode,
      interactiveType,
    });
    updateAndSaveStudy(selectedStudy.id, s => ({ ...s, chapters: [...s.chapters, ch] }));
    setSelectedChapterIndex(selectedStudy.chapters.length);
    setCurrentMoveIndex(0);
    setCurrentVariation(null);
    setOptionSquares({});
    setLastMoveSquares({});
    setMoveFrom(null);
    setShowNewChapterModal(false);
    setStudyVisionImageData(null);
    setStudyVisionPdfPages([]);
    setStudyVisionPdfPage(0);
    setStudyVisionBoards(null);
    setStudyVisionBoardIdx(0);
    setStudyVisionError('');
  }, [selectedStudy, ncTab, ncFen, ncFenInput, ncOrientation, ncMode, ncName, updateAndSaveStudy]);

  const updateChapterAtIndex = useCallback((idx: number, patch: Partial<StudyChapter>) => {
    if (!selectedStudy) return;
    updateAndSaveStudy(selectedStudy.id, s => ({
      ...s,
      chapters: s.chapters.map((c, i) => i === idx ? { ...c, ...patch } : c),
    }));
  }, [selectedStudy, updateAndSaveStudy]);

  const applyTreeExportToChapter = useCallback(
    (
      pack: {
        exported: { moves: string[]; variations?: Record<number, string[][]> };
        tree: import('../lib/studySync/types').StudyTree;
      } | null,
      extras?: { moveComments?: Record<number, string>; moveAnnotations?: Record<number, string | string[]> },
    ) => {
      if (!pack || !selectedStudy) return;
      updateChapterAtIndex(selectedChapterIndex, {
        moves: pack.exported.moves,
        variations: pack.exported.variations ?? {},
        seedTree: pack.tree,
        ...(extras?.moveComments ? { moveComments: extras.moveComments } : {}),
        ...(extras?.moveAnnotations ? { moveAnnotations: extras.moveAnnotations } : {}),
      });
    },
    [selectedStudy, selectedChapterIndex, updateChapterAtIndex],
  );

  // ── Members ───────────────────────────────────────────────────────────────────
  const addMember = useCallback((memberId: string) => {
    if (!selectedStudy || selectedStudy.memberIds.includes(memberId)) return;
    updateStudy({ memberIds: [...selectedStudy.memberIds, memberId] });
    setShowAddMember(false);
  }, [selectedStudy, updateStudy]);

  const removeMember = useCallback((memberId: string) => {
    if (!selectedStudy) return;
    updateStudy({ memberIds: selectedStudy.memberIds.filter(id => id !== memberId) });
  }, [selectedStudy, updateStudy]);

  // ── Chat ──────────────────────────────────────────────────────────────────────
  const sendChat = useCallback(() => {
    const t = chatInput.trim();
    if (!t || !selectedStudy) return;
    const msg: StudyChatMessage = { id: genId(), user: 'Antrenör', text: t, timestamp: new Date().toISOString() };
    updateAndSaveStudy(selectedStudy.id, s => ({ ...s, chatMessages: [...(s.chatMessages ?? []), msg] }));
    setChatInput('');
  }, [chatInput, selectedStudy, updateAndSaveStudy]);

  const sendLiveNoteFromBottom = useCallback((text: string) => {
    const t = text.trim();
    if (!t || !selectedStudy || !selectedChapter) return;
    const chapterLabel = `Bölüm ${selectedChapterIndex + 1} · ${selectedChapter.title || '—'}`;
    const msg: StudyChatMessage = {
      id: genId(),
      user: 'Antrenör (Canlı Analiz)',
      text: `[LIVE_NOTE][CHAPTER:${selectedChapter.id}][CHAPTER_LABEL:${chapterLabel}]\n${t}`,
      timestamp: new Date().toISOString(),
    };
    updateAndSaveStudy(selectedStudy.id, s => ({
      ...s,
      syncEnabled: true,
      chatMessages: [...(s.chatMessages ?? []), msg],
    }));
  }, [selectedStudy, selectedChapter, selectedChapterIndex, updateAndSaveStudy]);

  // ── Clone study ───────────────────────────────────────────────────────────────
  const cloneStudy = useCallback((study: Study) => {
    if (!canCloneStudy(study, auth)) {
      showToast('Bu çalışma için klonlama izniniz yok.', 'warning');
      return;
    }
    const cloned = migrateStudy({
      ...study,
      id: genId(),
      title: `${study.title} (kopya)`,
      createdAt: new Date().toISOString(),
      chatMessages: [],
      memberIds: [],
      liked: false,
      likes: 0,
      studentCreated: false,
      createdByStudentId: null,
    });
    setStudies(prev => [...prev, cloned]);
    saveStudyAsync(cloned).catch(() => {});
    setSelectedStudyId(cloned.id);
    setView('editor');
  }, [auth, showToast]);

  // ── Like toggle ───────────────────────────────────────────────────────────
  const toggleLike = useCallback((studyId: string) => {
    setStudies(prev => {
      const next = prev.map(s => {
        if (s.id !== studyId) return s;
        const liked = !s.liked;
        const updated = { ...s, liked, likes: liked ? s.likes + 1 : Math.max(0, s.likes - 1) };
        saveStudyAsync(updated).catch(() => {});
        return updated;
      });
      return next;
    });
  }, []);

  // ── Chapter reorder ───────────────────────────────────────────────────────────
  const moveChapterUp = useCallback((idx: number) => {
    if (!selectedStudy || idx === 0) return;
    updateAndSaveStudy(selectedStudy.id, s => {
      const chs = [...s.chapters];
      [chs[idx - 1], chs[idx]] = [chs[idx], chs[idx - 1]];
      return { ...s, chapters: chs };
    });
    setSelectedChapterIndex(idx - 1);
  }, [selectedStudy, updateAndSaveStudy]);

  const moveChapterDown = useCallback((idx: number) => {
    if (!selectedStudy || idx >= selectedStudy.chapters.length - 1) return;
    updateAndSaveStudy(selectedStudy.id, s => {
      const chs = [...s.chapters];
      [chs[idx], chs[idx + 1]] = [chs[idx + 1], chs[idx]];
      return { ...s, chapters: chs };
    });
    setSelectedChapterIndex(idx + 1);
  }, [selectedStudy, updateAndSaveStudy]);

  const duplicateChapter = useCallback((idx: number) => {
    if (!selectedStudy) return;
    const src = selectedStudy.chapters[idx];
    if (!src) return;
    const copy: StudyChapter = {
      ...src,
      id: genId(),
      title: `${src.title} (kopya)`,
      moves: [...(src.moves ?? [])],
      tags: [...(src.tags ?? [])],
      moveComments: { ...(src.moveComments ?? {}) },
      moveAnnotations: { ...(src.moveAnnotations ?? {}) },
      variations: JSON.parse(JSON.stringify(src.variations ?? {})),
    };
    updateAndSaveStudy(selectedStudy.id, s => {
      const next = [...s.chapters];
      next.splice(idx + 1, 0, copy);
      return { ...s, chapters: next };
    });
    setSelectedChapterIndex(idx + 1);
    setCurrentMoveIndex(0);
    setCurrentVariation(null);
  }, [selectedStudy, updateAndSaveStudy]);

  const moveChapterTo = useCallback((fromIdx: number, toIdx: number) => {
    if (!selectedStudy || fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    updateAndSaveStudy(selectedStudy.id, s => {
      const next = [...s.chapters];
      if (fromIdx >= next.length || toIdx >= next.length) return s;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return { ...s, chapters: next };
    });
    setSelectedChapterIndex(toIdx);
  }, [selectedStudy, updateAndSaveStudy]);

  // ── PGN Import ────────────────────────────────────────────────────────────────
  const importPgn = useCallback(() => {
    if (!pgnImportText.trim()) return;
    try {
      const parsed = parsePgnBlockToChapter(pgnImportText.trim());
      setChapterDraft(d => d ? {
        ...d,
        moves: parsed.moves,
        fen: parsed.startFen,
        variations: parsed.variations,
        moveAnnotations: parsed.moveAnnotations,
        moveComments: parsed.moveComments,
        seedTree: parsed.tree,
      } : d);
      setCurrentMoveIndex(0);
      setPgnImportText('');
      setShowPgnImport(false);
    } catch {
      showToast('Geçersiz PGN formatı.', 'error');
    }
  }, [pgnImportText, showToast]);

  const bulkImportPgn = useCallback((pgnText: string) => {
    if (!selectedStudy || !pgnText.trim()) return 0;
    const normalized = pgnText.replace(/\r\n/g, '\n').trim();
    let blocks = normalized.split(/\n\s*\n(?=\s*\[(?:Event|FEN|White|Black|Round|Date|Site|Result|SetUp)\s)/i);
    if (blocks.length <= 1) {
      blocks = normalized.split(/\n\s*\n(?=\s*\d+\.\s)/);
    }
    if (blocks.length <= 1 && normalized.trim()) blocks = [normalized];
    const newChapters: StudyChapter[] = [];
    const firstNewIdx = selectedStudy.chapters.length;
    let titleIdx = firstNewIdx;
    for (let i = 0; i < blocks.length; i++) {
       const block = blocks[i].trim();
       if (!block) continue;
       const parsed = parsePgnBlockToChapter(block);
       titleIdx += 1;
       newChapters.push(migrateChapter({
         id: genId(),
         title: parsed.title || `Bölüm ${titleIdx}`,
         fen: parsed.startFen,
         moves: parsed.moves,
         variations: parsed.variations,
         moveComments: parsed.moveComments,
         moveAnnotations: parsed.moveAnnotations,
         seedTree: parsed.tree,
       }));
    }
    if (newChapters.length === 0) return 0;
    updateAndSaveStudy(selectedStudy.id, s => ({ ...s, chapters: [...s.chapters, ...newChapters] }));
    setSelectedChapterIndex(firstNewIdx);
    setCurrentMoveIndex(0);
    setCurrentVariation(null);
    return newChapters.length;
  }, [selectedStudy, updateAndSaveStudy]);

  // ── Variation recording ───────────────────────────────────────────────────────
  const recordVariation = useCallback((from: string, to: string) => {
    if (!selectedChapter) return false;
    try {
      const g = makeBuilderGame(currentFen);
      const result = g.move({ from: from as any, to: to as any, promotion: 'q' });
      if (!result) return false;
      const mainLinePos = Math.max(0, currentMoveIndex - 1);
      const existingVars = selectedChapter.variations?.[mainLinePos] ?? [];
      const newVars = [...existingVars, [result.san]];
      updateChapterAtIndex(selectedChapterIndex, {
        variations: { ...(selectedChapter.variations ?? {}), [mainLinePos]: newVars },
      });
      setCurrentVariation([mainLinePos, newVars.length - 1, 0]);
      return true;
    } catch { return false; }
  }, [selectedChapter, selectedChapterIndex, currentFen, currentMoveIndex, updateChapterAtIndex]);

  const appendToCurrentVariation = useCallback((san: string) => {
    if (!selectedChapter || !currentVariation) return false;
    const [mainLinePos, varGroupIdx, varMoveIdx] = currentVariation;
    const existingVars = selectedChapter.variations?.[mainLinePos] ?? [];
    const currentLine = existingVars[varGroupIdx];
    if (!currentLine) return false;
    const insertAt = Math.min(varMoveIdx + 1, currentLine.length);
    const nextLine = [...currentLine.slice(0, insertAt), san, ...currentLine.slice(insertAt)];
    const nextVars = existingVars.map((line, i) => (i === varGroupIdx ? nextLine : line));
    updateChapterAtIndex(selectedChapterIndex, {
      variations: { ...(selectedChapter.variations ?? {}), [mainLinePos]: nextVars },
    });
    setCurrentVariation([mainLinePos, varGroupIdx, insertAt]);
    return true;
  }, [selectedChapter, currentVariation, selectedChapterIndex, updateChapterAtIndex]);

  // ── Move recording ────────────────────────────────────────────────────────────
  const isInVariation = currentVariation !== null;

  const variationFen = useMemo(() => {
    if (!currentVariation || !moveListChapter) return null;
    const [mainLinePos, varGroupIdx, varMoveIdx] = currentVariation;
    try {
      const g = makeBuilderGame(moveListChapter.fen || DEFAULT_FEN);
      const mainMoves = moveListChapter.moves ?? [];
      for (let i = 0; i < mainLinePos; i++) { if (!applyMove(g, mainMoves[i])) break; }
      const varGroup = moveListChapter.variations?.[mainLinePos] ?? [];
      const varMoves = varGroup[varGroupIdx] ?? [];
      for (let i = 0; i <= varMoveIdx && i < varMoves.length; i++) { if (!applyMove(g, varMoves[i])) break; }
      return g.fen();
    } catch { return null; }
  }, [currentVariation, moveListChapter]);

  const viewingStudentPresenceRow = useMemo(() => {
    return viewingStudentId ? presenceByUserId[String(viewingStudentId)] : null;
  }, [viewingStudentId, presenceByUserId]);

  const viewingStudentPresence = useMemo(() => {
    return formatPresence(viewingStudentPresenceRow);
  }, [formatPresence, viewingStudentPresenceRow]);

  const viewingStudent = useMemo(() => {
    return viewingStudentId ? students.find(s => String(s.id) === String(viewingStudentId)) : null;
  }, [students, viewingStudentId]);

  const viewingStudentVcHistory = useMemo(() => viewingStudentPresence?.vcHistory ?? [], [viewingStudentPresence]);

  const viewingStudentMovePairs = useMemo(() => {
    return Array.from({ length: Math.ceil(viewingStudentVcHistory.length / 2) }, (_, i) => ({
      moveNo: i + 1,
      white: viewingStudentVcHistory[i * 2] || '',
      black: viewingStudentVcHistory[i * 2 + 1] || '',
    }));
  }, [viewingStudentVcHistory]);

  const isViewingStudentGameOver = !!viewingStudentPresence?.gameOver;
  const isViewingStudentThinking = !!viewingStudentPresence?.vcThinking;
  const viewingStudentStatusLabel = isViewingStudentGameOver
    ? 'Tamamlandı'
    : isViewingStudentThinking
      ? 'Bilgisayar düşünüyor'
      : 'Canlı takip';

  const viewingStudentVcPreviewFens = useMemo(() => {
    if (!viewingStudentPresence?.vsComputer) return [] as string[];
    const startFen = selectedChapter?.fen || DEFAULT_FEN;
    const game = makeBuilderGame(startFen);
    const fens: string[] = [];
    for (let i = 0; i < viewingStudentVcHistory.length; i++) {
      try {
        if (!applyMove(game, viewingStudentVcHistory[i])) break;
        fens[i] = game.fen();
      } catch {
        break;
      }
    }
    return fens;
  }, [viewingStudentPresence?.vsComputer, viewingStudentVcHistory, selectedChapter?.fen]);

  const viewingStudentChapter = useMemo(() => {
    if (!viewingStudentId || !viewingStudentPresence) return null;
    if (viewingStudentPresence.vsComputer) {
      return {
        id: 'viewing-student',
        title: 'Bilgisayara Karşı',
        moves: viewingStudentVcHistory,
        fen: viewingStudentPresence.vcFen || DEFAULT_FEN,
      } as any;
    }
    return null;
  }, [viewingStudentId, viewingStudentPresence, viewingStudentVcHistory]);

  const studentEffectiveFen = viewingStudentPresence?.vsComputer ? viewingStudentPresence.vcFen : viewingStudentPresenceRow?.payload?.fen;

  const effectiveFen = (viewingStudentId && studentEffectiveFen)
    ? studentEffectiveFen
    : (practiceActiveFen
      ?? (isInVariation && variationFen ? variationFen : null)
      ?? syncPathFen
      ?? currentFen);

  const boardDisplayFen = useMemo(() => {
    if (!hoverState || !selectedChapter) return effectiveFen;
    
    try {
      if (hoverState.fen) return hoverState.fen;
      if (hoverState.var) {
        const ch = moveListChapter ?? selectedChapter;
        const [mainLinePos, varGroupIdx, varMoveIdx] = hoverState.var;
        const g = makeBuilderGame(ch.fen || DEFAULT_FEN);
        const mainMoves = ch.moves ?? [];
        for (let i = 0; i < mainLinePos; i++) { if (!applyMove(g, mainMoves[i])) break; }
        const varGroup = ch.variations?.[mainLinePos] ?? [];
        const varMoves = varGroup[varGroupIdx] ?? [];
        for (let i = 0; i <= varMoveIdx && i < varMoves.length; i++) { if (!applyMove(g, varMoves[i])) break; }
        return g.fen();
      } else if (hoverState.ply !== undefined) {
        const ch = moveListChapter ?? selectedChapter;
        const game = makeBuilderGame(ch.fen || DEFAULT_FEN);
        const moves = ch.moves ?? [];
        const upTo = Math.min(Math.max(0, hoverState.ply), moves.length);
        for (let i = 0; i < upTo; i++) { if (!applyMove(game, moves[i])) break; }
        return game.fen();
      }
    } catch { return effectiveFen; }
    
    return effectiveFen;
  }, [hoverState, selectedChapter, moveListChapter, effectiveFen]);

  const chessboardPosition = isDraggingPiece && dragFrozenFen ? dragFrozenFen : boardDisplayFen;



  useEffect(() => {
    if (!boardSettings.showEvalBar) setEvalScore(0);
  }, [boardSettings.showEvalBar]);

  // Practice Mode (vs computer): Sıra kullanıcıda değilse motor veya bulmaca otomatik oynasın.
  useEffect(() => {
    if (!practiceMode || recording || !selectedChapter || isInVariation) return;
    if (!practiceActiveFen) return;
    if (selectedChapter.interactiveType === 'liveAnalysis') return;
    if (isInteractivePuzzleChapter) return;

    const userSide = selectedChapter.orientation === 'white' ? 'w' : 'b';
    const isInteractive = selectedChapter.lessonMode === 'interactive';
    let cancelled = false;

    const run = async () => {
      try {
        const g = makeBuilderGame(practiceActiveFen);
        const turn = g.turn();
        if (turn === userSide) return;

        // Küçük gecikme: kullanıcı hamlesi sonrası daha doğal hissetsin
        await new Promise((r) => setTimeout(r, 600));
        if (cancelled) return;

        let moveSan: string | null = null;

        // 1. Eğer etkileşimli bulmaca ise, bölümdeki sıradaki hamleyi oynat
        if (isInteractive) {
          const nextMove = selectedChapter.moves?.[currentMoveIndex];
          if (nextMove) {
            moveSan = nextMove;
          }
        }

        // 2. Eğer bulmaca hamlesi yoksa ve motor pratiği isteniyorsa motordan hamle al
        if (!moveSan) {
          const level = selectedChapter.interactiveType === 'vsComputer'
            ? 20
            : engineLevelFromDifficulty(selectedChapter.difficulty ?? 6);
          moveSan = await getBestMoveAsync(g, level);
        }

        if (cancelled || !moveSan) return;

        const mv = g.move(moveSan);
        if (!mv) return;

        setPracticeFen(g.fen());
        setPracticePly((p) => p + 1);
        setPracticeFeedback(null);
        
        // Eğer bulmaca hamlesi yaptıysak index'i ilerlet
        if (isInteractive && selectedChapter.moves?.[currentMoveIndex] === moveSan) {
          setCurrentMoveIndex(i => i + 1);
        }
      } catch {
        // sessiz geç: motor hazır değilse kullanıcı devam edebilir
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [practiceMode, recording, selectedChapter, isInVariation, practiceActiveFen, currentMoveIndex, isInteractivePuzzleChapter]);

  const isRecordedMoveStrongEnough = useCallback((fenBefore: string, san: string): boolean => {
    // If we're recording, always allow any move (educator may want to show errors)
    if (recording) return true;
    
    // For students or practice, check difficulty
    const difficulty = selectedChapter?.difficulty ?? 5;
    if (difficulty <= 4) return true;
    
    try {
      const base = makeBuilderGame(fenBefore);
      const level = engineLevelFromDifficulty(difficulty);
      // Use sync evaluation for immediate feedback if possible, or skip if complex
      const bestSan = getBestMove(base, level);
      if (!bestSan) return true;
      
      const bestPos = makeBuilderGame(fenBefore);
      const bestMv = bestPos.move(bestSan);
      if (!bestMv) return true;
      const bestEval = evaluatePosition(bestPos);
      
      const playedPos = makeBuilderGame(fenBefore);
      const playedMv = playedPos.move(san);
      if (!playedMv) return true;
      const playedEval = evaluatePosition(playedPos);
      
      const side = base.turn();
      const sign = side === 'w' ? 1 : -1;
      const cpLoss = (bestEval - playedEval) * sign;
      const maxLoss = cpLossThresholdForDifficulty(difficulty);
      
      if (cpLoss > maxLoss) {
        setDifficultyFeedback(`Hamle zayıf (${Math.round(cpLoss)}cp kayıp). Seviye ${difficulty} için yetersiz.`);
        return false;
      }
      setDifficultyFeedback(null);
      return true;
    } catch { return true; }
  }, [recording, selectedChapter?.difficulty]);

  const canRecordMove = recording && selectedChapter != null && !isInVariation && currentMoveIndex >= chapterMovesForUi.length;

  const getMoveOptions = useCallback((square: string) => {
    try {
      const g = makeBuilderGame(boardDisplayFen);
      const moves = g.moves({ square: square as Square, verbose: true });
      const squares: Record<string, React.CSSProperties> = {};
      moves.forEach((m) => {
        squares[m.to] = g.get(m.to as Square)
          ? { background: 'radial-gradient(circle, transparent 55%, rgba(0,0,0,0.12) 55%, rgba(0,0,0,0.12) 68%, transparent 68%)' }
          : { background: 'radial-gradient(circle, rgba(0,0,0,0.14) 24%, transparent 24%)' };
      });
      squares[square] = { background: 'rgba(255, 255, 50, 0.4)' };
      setOptionSquares(moves.length > 0 ? squares : {});
      return moves.length > 0;
    } catch { setOptionSquares({}); return false; }
  }, [boardDisplayFen]);

  useEffect(() => {
    if (!navigationState) return;
    setCurrentMoveIndex((prev) =>
      prev === navigationState.moveIndex ? prev : navigationState.moveIndex,
    );
    setCurrentVariation(navigationState.currentVariation);
  }, [navigationState]);

  useEffect(() => {
    const isCtrlPhysical = (e: KeyboardEvent) =>
      e.code === 'ControlLeft' || e.code === 'ControlRight';
    const onKeyDown = (e: KeyboardEvent) => {
      if (isCtrlPhysical(e)) setArrowCtrlShortcutHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isCtrlPhysical(e)) setArrowCtrlShortcutHeld(false);
    };
    const onBlur = () => setArrowCtrlShortcutHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const isCoachOrAdmin = auth?.role === 'admin' || auth?.role === 'coach';
  const canEditStudy = isCoachOrAdmin || auth?.role === 'club';
  const canAnnotateMoves = canEditStudy && !!selectedChapter && !!selectedStudy;
  const syncPathLen = syncState?.currentPath?.length ?? 0;
  /** Antrenör tahtası: motor pratiği hariç son hamleyi geri al (Ctrl+Z). REC kapalıyken hamleler yalnızca yerel silinir. */
  const canStudyUndo =
    isCoachOrAdmin && !practiceMode && !!syncState && syncPathLen > 1;

  const handleSquareClickInner = useCallback((square: string) => {
    if (!selectedChapter) return;
    const allowBoardMoveInput =
      recording ||
      (ncMode === 'normal' && !practiceMode && !!syncState && isCoachOrAdmin);
    if (!allowBoardMoveInput) return;
    const baselineFen = boardDisplayFen;

    if (moveFrom === square) {
      setOptionSquares({});
      setMoveFrom(null);
      return;
    }

    if (moveFrom) {
      try {
        const g = makeBuilderGame(baselineFen);
        const result = g.move({ from: moveFrom as any, to: square as any, promotion: 'q' });
        if (result) {
          // Unified sync logic: just send the move, the hook handles everything else
          // Unified sync logic: just send the move, the hook handles everything else (Lichess principles)
          if (syncState) {
            const parentId = syncState.currentPath[syncState.currentPath.length - 1] || syncState.tree.rootId;
            if (parentId) {
              if (recording && !isRecordedMoveStrongEnough(baselineFen, result.san)) { setOptionSquares({}); setMoveFrom(null); return; }
              void makeMove(parentId, result.san);
              setLastMoveSquares({ [result.from]: { background: 'rgba(99,102,241,0.35)' }, [result.to]: { background: 'rgba(99,102,241,0.35)' } });
              setOptionSquares({}); setMoveFrom(null); return;
            }
          }

          // Fallback
          const activePly = currentVariation ? currentVariation[2] : currentMoveIndex;
          const isAtEnd = activePly >= (currentVariation ? (selectedChapter.variations?.[currentVariation[0]]?.[currentVariation[1]]?.length ?? 0) : (selectedChapter.moves?.length ?? 0));
          if (canRecordMove && isAtEnd) {
            const newMoves = [...(selectedChapter.moves ?? []), result.san];
            updateChapterAtIndex(selectedChapterIndex, { moves: newMoves });
            setCurrentMoveIndex(newMoves.length);
          } else if (isInVariation) { 
            appendToCurrentVariation(result.san); 
          } else { 
            recordVariation(moveFrom, square); 
          }
          setLastMoveSquares({ [result.from]: { background: 'rgba(255, 255, 50, 0.35)' }, [result.to]: { background: 'rgba(255, 255, 50, 0.35)' } });
          setOptionSquares({}); setMoveFrom(null); return;
        }
      } catch (e) { console.error('Square click move error:', e); }
      try {
        const g = makeBuilderGame(baselineFen);
        const piece = g.get(square as Square);
        if (piece && piece.color === g.turn()) {
          const hasMoves = getMoveOptions(square);
          setMoveFrom(hasMoves ? square : null);
          if (!hasMoves) setOptionSquares({});
          return;
        }
      } catch { /* ignore */ }
      setOptionSquares({});
      setMoveFrom(null);
      return;
    }
    const hasMoves = getMoveOptions(square);
    setMoveFrom(hasMoves ? square : null);
    if (!hasMoves) setOptionSquares({});
  }, [recording, moveFrom, boardDisplayFen, selectedChapter, selectedChapterIndex, canRecordMove, isInVariation, currentVariation, currentMoveIndex, updateChapterAtIndex, getMoveOptions, recordVariation, appendToCurrentVariation, isRecordedMoveStrongEnough, syncState, makeMove, practiceMode, isCoachOrAdmin, ncMode]);

  const handlePieceDrop = useCallback(({ sourceSquare, targetSquare, piece }: { piece?: any; sourceSquare: string; targetSquare: string }) => {
    console.log('[StudyPage] Piece drop:', sourceSquare, targetSquare);
    setIsDraggingPiece(false);
    if (!sourceSquare || !targetSquare) return false;
    if (!selectedStudy || !selectedChapter) return false;
    
    // Use the displayed position as baseline for the move
    const baselineFen = boardDisplayFen;
    
    try {
      const game = makeBuilderGame(baselineFen);
      let result: { from: string; to: string; san: string; lan?: string } | null = null;
      try {
        const mv = game.move({ from: sourceSquare as any, to: targetSquare as any, promotion: 'q' });
        if (mv) result = mv;
      } catch {
        /* geçersiz hamle / pozisyon */
      }
      if (!result) {
        // Yasal chess hamlesi yoksa zorla taşımayı yapma — aksi halde sıra atlatabilirsiniz (çift beyaz vb.)
        return false;
      }
      
      // Unified sync logic
      // Unified sync logic (Lichess principles)
      if (syncState) {
        const parentId = syncState.currentPath[syncState.currentPath.length - 1] || syncState.tree.rootId;
        if (parentId) {
          if (recording && !isRecordedMoveStrongEnough(baselineFen, result.san)) { setOptionSquares({}); setMoveFrom(null); return false; }
          void makeMove(parentId, result.san);
          setLastMoveSquares({ [result.from]: { background: 'rgba(255,255,50,0.35)' }, [result.to]: { background: 'rgba(255,255,50,0.35)' } });
          setOptionSquares({}); setMoveFrom(null); return true;
        }
      }

      // Fallback
      const activePly = currentVariation ? currentVariation[2] : currentMoveIndex;
      const isAtEnd = activePly >= (currentVariation ? (selectedChapter.variations?.[currentVariation[0]]?.[currentVariation[1]]?.length ?? 0) : (selectedChapter.moves?.length ?? 0));
      if (canRecordMove && isAtEnd) {
        const newMoves = [...(selectedChapter.moves ?? []), result.san];
        updateChapterAtIndex(selectedChapterIndex, { moves: newMoves });
        setCurrentMoveIndex(newMoves.length);
      } else if (isInVariation) { 
        appendToCurrentVariation(result.san); 
      } else { 
        recordVariation(sourceSquare, targetSquare); 
      }
      
      setLastMoveSquares({ [result.from]: { background: 'rgba(255,255,50,0.35)' }, [result.to]: { background: 'rgba(255,255,50,0.35)' } });
      setOptionSquares({}); setMoveFrom(null); return true;
    } catch (e) { console.error('Piece drop error:', e); return false; }
  }, [selectedStudy, selectedChapter, selectedChapterIndex, boardDisplayFen, recording, canRecordMove, isInVariation, currentVariation, currentMoveIndex, hoverState, updateChapterAtIndex, recordVariation, appendToCurrentVariation, isRecordedMoveStrongEnough, syncState, makeMove, jumpToMoveIndex]);

  const selectMoveForAnnotation = useCallback((ply: number) => {
    if (ply < 0) return;
    setSelectedAnnotationPly(ply);
    const viewIndex = ply + 1;
    setCurrentMoveIndex(viewIndex);
    setCurrentVariation(null);
    void jumpToMoveIndex(viewIndex);
    setOptionSquares({});
    setMoveFrom(null);
  }, [jumpToMoveIndex]);

  const handleBoardSquareClick = useCallback((arg: unknown) => {
    const square = pickSquare(arg);
    if (!square) return;

    if (
      drawingTool === 'mouse' &&
      bottomTab === 'annotations' &&
      canAnnotateMoves &&
      selectedChapter
    ) {
      const ply = findPlyByDestinationSquare(
        selectedChapter.fen || DEFAULT_FEN,
        chapterMovesForUi,
        square,
        makeBuilderGame,
        applyMove,
      );
      if (ply != null) {
        selectMoveForAnnotation(ply);
        return;
      }
    }

    if (drawingTool === 'mouse') {
      handleSquareClickInner(square);
      return;
    }

    if (drawingTool === 'eraser') {
      setCircleMarks(prev => {
        const next = { ...prev };
        delete next[square];
        if (selectedChapter) updateChapterAtIndex(selectedChapterIndex, { circles: next });
        return next;
      });
      return;
    }

    // Drawing tool (square, circle, x)
    setCircleMarks(prev => {
      const currentMark = prev[square];
      const nextType = drawingTool === 'square' ? 'square' : (drawingTool === 'circle' ? 'circle' : 'x');
      
      // If same mark exists, toggle off
      if (currentMark && typeof currentMark === 'object' && currentMark.type === nextType && currentMark.color === drawingColor) {
        const next = { ...prev };
        delete next[square];
        if (selectedChapter) updateChapterAtIndex(selectedChapterIndex, { circles: next });
        return next;
      }

      // Add or update mark
      const next = { ...prev, [square]: { color: drawingColor, type: nextType } };
      if (selectedChapter) updateChapterAtIndex(selectedChapterIndex, { circles: next });
      return next;
    });
  }, [
    drawingTool,
    drawingColor,
    selectedChapter,
    selectedChapterIndex,
    handleSquareClickInner,
    bottomTab,
    canAnnotateMoves,
    chapterMovesForUi,
    selectMoveForAnnotation,
  ]);

  const applySquareMarkAt = useCallback((square: string, markType: 'circle' | 'square') => {
    setCircleMarks((prev) => {
      const currentMark = prev[square];
      if (currentMark?.type === markType) {
        const next = { ...prev };
        delete next[square];
        if (selectedChapter) updateChapterAtIndex(selectedChapterIndex, { circles: next });
        return next;
      }
      const next = { ...prev, [square]: { color: drawingColor, type: markType } };
      if (selectedChapter) updateChapterAtIndex(selectedChapterIndex, { circles: next });
      return next;
    });
  }, [drawingColor, selectedChapter, selectedChapterIndex, updateChapterAtIndex]);

  const handleBoardSquareRightClick = useCallback((arg: unknown) => {
    if (!isCoachOrAdmin) return;
    const square = pickSquare(arg);
    if (!square) return;
    const markType = arrowCtrlShortcutHeld ? 'square' : 'circle';
    applySquareMarkAt(square, markType);
  }, [isCoachOrAdmin, arrowCtrlShortcutHeld, applySquareMarkAt]);

  const handleBoardPieceClick = useCallback((arg: unknown) => {
    if (drawingTool !== 'mouse') return;
    const p = arg as { isSparePiece?: boolean; square?: string } | null;
    if (!p?.square || p.isSparePiece) return;
    if (bottomTab === 'annotations' && canAnnotateMoves && selectedChapter) {
      const ply = findPlyByDestinationSquare(
        selectedChapter.fen || DEFAULT_FEN,
        chapterMovesForUi,
        p.square,
        makeBuilderGame,
        applyMove,
      );
      if (ply != null) {
        selectMoveForAnnotation(ply);
        return;
      }
    }
    handleSquareClickInner(p.square);
  }, [
    drawingTool,
    handleSquareClickInner,
    bottomTab,
    canAnnotateMoves,
    selectedChapter,
    chapterMovesForUi,
    selectMoveForAnnotation,
  ]);

  useEffect(() => {
    if (drawingTool !== 'mouse') {
      setOptionSquares({});
      setMoveFrom(null);
    }
  }, [drawingTool]);

  const studyMainMergedSquareStyles = useMemo(() => ({
    ...squareMarksToStyles(circleMarks as any),
    ...lastMoveSquares,
    ...optionSquares,
    ...(boardSettings.showThreats ? computeThreatOverlay(boardDisplayFen).squareStyles : {}),
  }), [circleMarks, lastMoveSquares, optionSquares, boardSettings.showThreats, boardDisplayFen]);

  const studyThreatArrows = useMemo(
    () => (boardSettings.showThreats ? computeThreatOverlay(boardDisplayFen).arrows : []),
    [boardSettings.showThreats, boardDisplayFen],
  );

  const handlePracticeDrop = useCallback(({ sourceSquare, targetSquare, piece }: { piece?: any; sourceSquare: string; targetSquare: string }) => {
    console.log('[StudyPage] Practice drop:', sourceSquare, targetSquare);
    if (!sourceSquare || !targetSquare) return false;
    if (!selectedChapter || recording || !practiceMode || isInVariation) return false;
    const expectedSan = chapterMovesForUi[currentMoveIndex];
    const now = Date.now();
    const thinkMs = Math.max(0, now - lastMoveActionAtMs);
    try {
      const baseline = practiceActiveFen ?? effectiveFen;
      const g = makeBuilderGame(baseline);
      const mv = g.move({ from: sourceSquare as any, to: targetSquare as any, promotion: 'q' });
      if (!mv) return false;

      const isCorrect = expectedSan ? (mv.san === expectedSan || mv.lan === expectedSan) : true;
      const newEntry: MoveAnalysisEntry = {
        id: `${now}-${moveAnalysisEntries.length}`,
        moveNo: Math.floor((expectedSan ? currentMoveIndex : practicePly) / 2) + 1,
        playedSan: mv.san ?? mv.lan ?? `${sourceSquare}-${targetSquare}`,
        expectedSan: expectedSan ?? '',
        isCorrect,
        thinkMs,
        atIso: new Date(now).toISOString(),
        userName: currentUserName,
      };

      setMoveAnalysisEntries((prev) => [...prev, newEntry]);
      setLastMoveActionAtMs(now);

      // Sync to study if role is student
      if (auth?.role === 'student' && selectedStudy) {
        const sid = (auth as any).studentId;
        if (sid) {
          updateStudy({
            practiceLogs: {
              ...(selectedStudy.practiceLogs || {}),
              [sid]: [...moveAnalysisEntries, newEntry]
            }
          });
        }
      }

      // Local practice fen ilerlet
      setPracticeFen(g.fen());
      setPracticePly((p) => p + 1);

      if (isCorrect) {
        setPracticeFeedback('correct');
        // Eğer chapter.moves ile doğrulama yapıyorsak, index’i ilerlet; yoksa vs-computer modunda sadece ply takip ediliyor.
        if (expectedSan) setCurrentMoveIndex(i => Math.min(chapterMovesForUi.length, i + 1));
        return true;
      } else {
        setPracticeFeedback('wrong');
        return false;
      }
    } catch { setPracticeFeedback('wrong'); return false; }
  }, [selectedChapter, chapterMovesForUi, recording, practiceMode, isInVariation, currentMoveIndex, effectiveFen, practiceActiveFen, practicePly, lastMoveActionAtMs, currentUserName, auth, selectedStudy, moveAnalysisEntries, updateStudy]);

  const flipBoard = useCallback(() => {
    if (!selectedChapter) return;
    if (!write || !selectedStudy) return;
    const orientation = selectedChapter.orientation === 'white' ? 'black' : 'white';
    updateChapterAtIndex(selectedChapterIndex, { orientation });
    void appendStudyAction({
      studyId: selectedStudy.id,
      chapterId: selectedChapter.id,
      actorId,
      actorRole,
      type: 'setChapterMeta',
      payload: { patch: { orientation } },
    });
    setShowBoardSettings(false);
  }, [selectedChapter, selectedChapterIndex, updateChapterAtIndex, write, selectedStudy, actorId, actorRole]);

  const handleFlipBoardShortcut = useCallback(() => {
    if (view !== 'editor' || !selectedChapter) return;
    if (write && selectedStudy) flipBoard();
    else setStudyBoardViewFlipLocal((v) => !v);
  }, [view, selectedChapter, write, selectedStudy, flipBoard]);

  const canPlayBestMove = !!engineTopMove && (
    recording
    || practiceMode
    || (ncMode === 'normal' && !practiceMode && !!syncState && isCoachOrAdmin)
  );

  const playBestMove = useCallback(() => {
    if (!engineTopMove || !canPlayBestMove) return;
    const dragArgs = { sourceSquare: engineTopMove.from, targetSquare: engineTopMove.to, piece: '' };
    if (recording) {
      handlePieceDrop(dragArgs);
      return;
    }
    if (practiceMode) {
      handlePracticeDrop(dragArgs);
      return;
    }
    if (ncMode === 'normal' && !practiceMode && syncState && isCoachOrAdmin) {
      handlePieceDrop(dragArgs);
    }
  }, [engineTopMove, canPlayBestMove, recording, practiceMode, ncMode, syncState, isCoachOrAdmin, handlePieceDrop, handlePracticeDrop]);

  useStudyKeyboardShortcuts({
    enabled: view === 'editor' && !!selectedStudy && !!selectedChapter,
    goPrev,
    goNext,
    goStart,
    goEnd,
    flipBoard: handleFlipBoardShortcut,
    toggleEngine: () => toggleBoardSetting('showEngineAnalysis'),
    toggleBestMoveArrows: () => toggleBoardSetting('showBestMoveArrows'),
    toggleVariationArrows: () => toggleBoardSetting('showVariationArrows'),
    toggleEvalBar: () => toggleBoardSetting('showEvalBar'),
    toggleThreats: () => toggleBoardSetting('showThreats'),
    toggleInlineNotation: () => toggleBoardSetting('inlineNotation'),
    toggleSettingsPanel: () => setShowStudyBoardSettings((v) => !v),
    openHelp: () => setShowStudyHelp(true),
    playBestMove,
    canPlayBestMove,
    undo: () => { void undoMove(); },
    canUndo: canStudyUndo,
  });

  useEffect(() => {
    setStudyBoardViewFlipLocal(false);
  }, [selectedChapter?.id]);


  const openBoardBuilder = useCallback(() => {
    const fen = selectedChapter?.fen || DEFAULT_FEN;
    setBuilderFen(fen); setBuilderFenInput(fen); setBuilderTool('cursor');
    setShowBoardBuilder(true); setShowBoardSettings(false);
  }, [selectedChapter]);

  const applyBoardBuilder = useCallback(() => {
    if (!selectedStudy || !selectedChapter) return;
    updateAndSaveStudy(selectedStudy.id, (s) => ({
      ...s,
      chapters: s.chapters.map((c) =>
        c.id === selectedChapter.id
          ? { ...c, fen: builderFen, moves: [] }
          : c
      ),
    }));
    setCurrentMoveIndex(0);
    setShowBoardBuilder(false);
  }, [selectedStudy, selectedChapter, builderFen, updateAndSaveStudy]);

  const studyVisionPreviewUrl =
    studyVisionPdfPages.length > 0 ? (studyVisionPdfPages[studyVisionPdfPage] ?? null) : studyVisionImageData;

  const clearStudyVisionUpload = useCallback(() => {
    setStudyVisionImageData(null);
    setStudyVisionPdfPages([]);
    setStudyVisionPdfPage(0);
    setStudyVisionBoards(null);
    setStudyVisionBoardIdx(0);
    setStudyVisionError('');
  }, []);

  const normalizeVisionBoardFen = useCallback((board: ImageBoardResult): string | null => {
    const raw = board.fen?.trim();
    if (!raw) {
      showToast('Geçersiz FEN.', 'warning');
      return null;
    }
    let normalized = raw;
    try {
      normalized = new Chess(raw).fen();
    } catch {
      showToast('Çıkarılan FEN satranç kütüphanesinde geçersiz.', 'error');
      return null;
    }
    const invalid = validateBoardForSave(normalized);
    if (invalid) {
      showToast(invalid, 'error');
      return null;
    }
    return normalized;
  }, [showToast]);

  const applyStudyVisionBoard = useCallback(
    (board: ImageBoardResult) => {
      const normalized = normalizeVisionBoardFen(board);
      if (!normalized) return;
      setNcFen(normalized);
      clearStudyVisionUpload();
      showToast('FEN yüklendi. Bölüm oluştur ile kaydedin.', 'success');
    },
    [normalizeVisionBoardFen, clearStudyVisionUpload, showToast],
  );

  const createChaptersFromVisionBoards = useCallback(() => {
    if (!selectedStudy || !studyVisionBoards || studyVisionBoards.length === 0) return;
    const lessonMode = ncMode === 'normal' ? 'direct' as const : 'interactive' as const;
    const interactiveType = ncMode === 'interactive' ? 'liveAnalysis' as const : 'puzzle' as const;
    const baseIdx = selectedStudy.chapters.length;
    const newChapters = studyVisionBoards
      .map((board, i) => {
        const normalized = normalizeVisionBoardFen(board);
        if (!normalized) return null;
        return migrateChapter({
          id: genId(),
          title: `${ncName || 'Bölüm'} ${baseIdx + i + 1}`,
          fen: normalized,
          moves: [],
          orientation: ncOrientation,
          lessonMode,
          interactiveType,
        });
      })
      .filter((ch): ch is NonNullable<typeof ch> => ch !== null);

    if (newChapters.length === 0) {
      setStudyVisionError('Geçerli FEN bulunamadı.');
      return;
    }

    updateAndSaveStudy(selectedStudy.id, s => ({ ...s, chapters: [...s.chapters, ...newChapters] }));
    setSelectedChapterIndex(baseIdx);
    setCurrentMoveIndex(0);
    setCurrentVariation(null);
    setShowNewChapterModal(false);
    clearStudyVisionUpload();
    showToast(`${newChapters.length} bölüm görselden oluşturuldu.`, 'success');
  }, [
    selectedStudy,
    studyVisionBoards,
    ncMode,
    ncOrientation,
    ncName,
    normalizeVisionBoardFen,
    updateAndSaveStudy,
    clearStudyVisionUpload,
    showToast,
  ]);

  const handleStudyVisionFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setStudyVisionError('');
      setStudyVisionUploadBusy(true);
      setStudyVisionPdfPages([]);
      setStudyVisionPdfPage(0);
      setStudyVisionImageData(null);
      setStudyVisionBoards(null);
      setStudyVisionBoardIdx(0);
      try {
        if (file.type.startsWith('image/')) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = reject;
            r.readAsDataURL(file);
          });
          setStudyVisionImageData(dataUrl);
        } else if (file.type === 'application/pdf') {
          const urls = await pdfAllPagesToDataUrls(file);
          setStudyVisionPdfPages(urls);
          setStudyVisionPdfPage(0);
        } else {
          setStudyVisionError('Sadece görsel (JPG, PNG, WebP) veya PDF yükleyebilirsiniz.');
        }
      } catch {
        setStudyVisionError('Dosya işlenemedi. Tekrar deneyin.');
      } finally {
        setStudyVisionUploadBusy(false);
        if (studyVisionFileInputRef.current) studyVisionFileInputRef.current.value = '';
      }
    },
    []
  );

  const extractStudyVisionFen = useCallback(async () => {
    const dataUrl = studyVisionPreviewUrl;
    if (!dataUrl) {
      setStudyVisionError('Önce görsel veya PDF sayfası seçin.');
      return;
    }
    setStudyVisionError('');

    if (studyVisionBoards && studyVisionBoards.length > 1) {
      const board = studyVisionBoards[studyVisionBoardIdx];
      if (board) applyStudyVisionBoard(board);
      return;
    }

    setStudyVisionExtractBusy(true);
    try {
      const boards = await imageToFenMultiple(dataUrl);
      if (boards.length === 0) {
        setStudyVisionError('Görselde tahta bulunamadı.');
        return;
      }
      if (boards.length === 1) {
        applyStudyVisionBoard(boards[0]);
        setStudyVisionBoards(null);
      } else {
        setStudyVisionBoards(boards);
        setStudyVisionBoardIdx(0);
      }
    } catch (err) {
      setStudyVisionError(formatOpenRouterError(err));
    } finally {
      setStudyVisionExtractBusy(false);
    }
  }, [studyVisionPreviewUrl, studyVisionBoards, studyVisionBoardIdx, applyStudyVisionBoard]);

  // ── Annotations & Comments ────────────────────────────────────────────────────
  useEffect(() => {
    setSelectedAnnotationPly(null);
  }, [selectedChapter?.id]);

  useEffect(() => {
    if (currentVariation) return;
    if (currentMoveIndex > 0) {
      setSelectedAnnotationPly(currentMoveIndex - 1);
    } else {
      setSelectedAnnotationPly(null);
    }
  }, [currentMoveIndex, currentVariation]);

  /** 0-tabanlı hamle indeksi (moveAnnotations anahtarı) */
  const annotationPlyIndex = selectedAnnotationPly;

  const resolveAnnotationNodeId = useCallback((): string | null => {
    if (!syncState || annotationPlyIndex == null) return null;

    if (currentVariation) {
      const [mlp, vgi] = currentVariation;
      return findVariationNodeAtMoveIndex(
        syncState.tree,
        mlp,
        vgi,
        annotationPlyIndex,
        selectedChapterRaw?.variations ?? {},
      );
    }

    const ml = syncState.tree.mainline;
    const nodeAtPly = ml[annotationPlyIndex + 1];
    if (nodeAtPly) return nodeAtPly;
    const path = syncState.currentPath;
    const leaf = path[path.length - 1];
    if (leaf && leaf !== syncState.tree.rootId && path.length - 1 >= annotationPlyIndex + 1) {
      return leaf;
    }
    return null;
  }, [syncState, annotationPlyIndex, currentVariation, selectedChapterRaw?.variations]);

  const addAnnotation = useCallback((sym: string) => {
    if (!selectedChapter || annotationPlyIndex == null || !canAnnotateMoves) return;

    const current = parseMoveGlyphs(selectedChapter.moveAnnotations?.[annotationPlyIndex]);
    const nextGlyphs = toggleMoveGlyph(current, sym);

    const nodeId = resolveAnnotationNodeId();
    if (nodeId && syncState) {
      void setNodeGlyphs(nodeId, nextGlyphs);
    }

    const next = { ...(selectedChapter.moveAnnotations ?? {}) };
    if (nextGlyphs.length === 0) delete next[annotationPlyIndex];
    else next[annotationPlyIndex] = nextGlyphs[0];
    updateChapterAtIndex(selectedChapterIndex, { moveAnnotations: next });
  }, [
    selectedChapter,
    selectedChapterIndex,
    annotationPlyIndex,
    canAnnotateMoves,
    resolveAnnotationNodeId,
    syncState,
    setNodeGlyphs,
    updateChapterAtIndex,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!keyboardTargetAllowsBoardShortcut(e)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (view !== 'editor') return;
      if (!canAnnotateMoves || annotationPlyIndex == null) return;
      const sym = studyAnnotationFromKey(e.key);
      if (!sym) return;
      e.preventDefault();
      addAnnotation(sym);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, canAnnotateMoves, annotationPlyIndex, addAnnotation]);

  const boardGlyphEntries = useMemo(() => {
    if (!selectedChapter) return [];
    const anns = selectedChapter.moveAnnotations ?? {};
    const entries = buildGlyphSquareEntries(
      selectedChapter.fen || DEFAULT_FEN,
      chapterMovesForUi,
      anns,
      currentMoveIndex,
      makeBuilderGame,
      applyMove,
    );
    return filterGlyphEntriesForCurrentBoard(entries, boardDisplayFen, makeBuilderGame);
  }, [selectedChapter, chapterMovesForUi, currentMoveIndex, boardDisplayFen]);

  const annotationTargetSquare = useMemo(() => {
    if (annotationPlyIndex == null || !selectedChapter) return null;
    return getDestinationSquareForPly(
      selectedChapter.fen || DEFAULT_FEN,
      chapterMovesForUi,
      annotationPlyIndex,
      makeBuilderGame,
      applyMove,
    );
  }, [annotationPlyIndex, selectedChapter, chapterMovesForUi]);

  const studyBoardSquareStyles = useMemo(() => ({
    ...studyMainMergedSquareStyles,
    ...(annotationTargetSquare
      ? {
          [annotationTargetSquare]: {
            boxShadow: 'inset 0 0 0 3px rgba(20, 184, 166, 0.85)',
            background: 'rgba(20, 184, 166, 0.12)',
          },
        }
      : {}),
  }), [studyMainMergedSquareStyles, annotationTargetSquare]);

  const glyphSquareRenderer = useMemo(
    () => createGlyphSquareRenderer(boardGlyphEntries, studyBoardSquareStyles, annotationPlyIndex),
    [boardGlyphEntries, studyBoardSquareStyles, annotationPlyIndex],
  );

  const saveMoveComment = useCallback((comment: string) => {
    if (!selectedChapter || currentMoveIndex === 0) return;
    if (!write || !selectedStudy) return;
    const text = String(comment ?? '').trim();
    if (!text) return;
    const ml = syncState?.tree?.mainline ?? [];
    const nodeId = ml.length > 0 ? ml[Math.max(0, Math.min(ml.length - 1, currentMoveIndex))] : null;
    if (!nodeId) return;
    void appendStudyAction({
      studyId: selectedStudy.id,
      chapterId: selectedChapter.id,
      actorId,
      actorRole,
      type: 'setComment',
      payload: { nodeId, text, author: currentUserName ?? (auth?.role === 'coach' ? 'Antrenör' : 'Admin') },
    });
  }, [selectedChapter, currentMoveIndex, write, selectedStudy, syncState, actorId, actorRole, currentUserName, auth?.role]);

  const saveChapterComment = useCallback((comment: string) => {
    if (!selectedChapter) return;
    if (!write || !selectedStudy) return;
    const text = String(comment ?? '').trim();
    if (!text) return;
    const rootId = syncState?.tree?.rootId ?? 'root';
    void appendStudyAction({
      studyId: selectedStudy.id,
      chapterId: selectedChapter.id,
      actorId,
      actorRole,
      type: 'setComment',
      payload: { nodeId: rootId, text, author: currentUserName ?? (auth?.role === 'coach' ? 'Antrenör' : 'Admin') },
    });
  }, [selectedChapter, write, selectedStudy, syncState, actorId, actorRole, currentUserName, auth?.role]);

  const addTag = useCallback((tag: string) => {
    if (!selectedChapter || !tag.trim()) return;
    if (!write || !selectedStudy) return;
    const tags = [...new Set([...(selectedChapter.tags ?? []), tag.trim()])];
    updateChapterAtIndex(selectedChapterIndex, { tags });
    void appendStudyAction({
      studyId: selectedStudy.id,
      chapterId: selectedChapter.id,
      actorId,
      actorRole,
      type: 'setChapterMeta',
      payload: { patch: { tags } },
    });
  }, [selectedChapter, selectedChapterIndex, updateChapterAtIndex, write, selectedStudy, actorId, actorRole]);

  const removeTag = useCallback((tag: string) => {
    if (!selectedChapter) return;
    if (!write || !selectedStudy) return;
    const tags = (selectedChapter.tags ?? []).filter(t => t !== tag);
    updateChapterAtIndex(selectedChapterIndex, { tags });
    void appendStudyAction({
      studyId: selectedStudy.id,
      chapterId: selectedChapter.id,
      actorId,
      actorRole,
      type: 'setChapterMeta',
      payload: { patch: { tags } },
    });
  }, [selectedChapter, selectedChapterIndex, updateChapterAtIndex, write, selectedStudy, actorId, actorRole]);

  // ── Modals ──
  const closeStudySettings = useCallback(() => {
    setShowStudySettings(false);
    setSettingsStudyId(null);
  }, []);
  const openStudySettings = useCallback(() => {
    if (!selectedStudy) return;
    setStudyDraft({ ...selectedStudy });
    setSettingsStudyId(selectedStudy.id);
    setShowStudySettings(true);
  }, [selectedStudy]);
  const openStudySettingsFromList = useCallback((study: Study, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStudyDraft({ ...study });
    setSettingsStudyId(study.id);
    setShowStudySettings(true);
  }, []);
  const saveStudySettings = useCallback(() => {
    if (!studyDraft || !settingsStudyId) return;
    updateAndSaveStudy(settingsStudyId, s => ({ ...s, ...studyDraft }));
    closeStudySettings();
  }, [studyDraft, settingsStudyId, updateAndSaveStudy, closeStudySettings]);
  const deleteStudy = useCallback(() => {
    if (!studyDraft || !settingsStudyId) return;
    if (!window.confirm(`"${studyDraft.title}" silinsin mi?`)) return;
    deletedIdsRef.current.add(settingsStudyId);
    setStudies(prev => prev.filter(s => s.id !== settingsStudyId));
    if (selectedStudyId === settingsStudyId) {
      setSelectedStudyId(null);
      setView('list');
    }
    deleteStudyAsync(settingsStudyId).catch(() => {});
    closeStudySettings();
  }, [studyDraft, settingsStudyId, selectedStudyId, closeStudySettings]);
  const openChapterEdit = useCallback((ch: StudyChapter) => { setChapterDraft({ ...ch }); setEditingChapterId(ch.id); }, []);
  const saveChapterEdit = useCallback(() => {
    if (!selectedStudy || !chapterDraft || !editingChapterId) return;
    const toSave = chapterDraft.interactiveType === 'vsComputer'
      ? { ...chapterDraft, difficulty: 10 }
      : chapterDraft;
    updateAndSaveStudy(selectedStudy.id, s => ({ ...s, chapters: s.chapters.map(c => c.id === editingChapterId ? { ...c, ...toSave } : c) }));
    // Deterministic sync for chapter-level fields (Lichess-like).
    if (write) {
      void appendStudyAction({
        studyId: selectedStudy.id,
        chapterId: editingChapterId,
        actorId,
        actorRole,
        type: 'setChapterMeta',
        payload: {
          patch: {
            title: chapterDraft.title,
            orientation: chapterDraft.orientation,
            lessonMode: chapterDraft.lessonMode,
            interactiveType: chapterDraft.interactiveType,
            guidedPrompt: chapterDraft.guidedPrompt,
            moveHint: chapterDraft.moveHint,
            difficulty: toSave.difficulty,
            tags: chapterDraft.tags,
          },
        },
      });
    }
    setEditingChapterId(null);
    setChapterDraft(null);
  }, [selectedStudy, chapterDraft, editingChapterId, updateAndSaveStudy, write, actorId, actorRole]);
  const deleteChapter = useCallback((chapterId: string) => { if (!selectedStudy || selectedStudy.chapters.length <= 1) return; if (!window.confirm('Emin misiniz?')) return; updateAndSaveStudy(selectedStudy.id, s => ({ ...s, chapters: s.chapters.filter(c => c.id !== chapterId) })); setSelectedChapterIndex(0); setCurrentMoveIndex(0); setEditingChapterId(null); }, [selectedStudy, updateAndSaveStudy]);

  const copyToClipboard = useCallback((text: string) => navigator.clipboard.writeText(text).catch(() => {}), []);
  const canExportCurrentStudy = useMemo(
    () => (selectedStudy ? canExportStudy(selectedStudy, auth) : false),
    [selectedStudy, auth]
  );

  const downloadPgn = useCallback(() => {
    if (!selectedStudy || !selectedChapter) return;
    if (!canExportStudy(selectedStudy, auth)) {
      showToast('Bu çalışma için dışa aktarma izniniz yok.', 'warning');
      return;
    }
    const pgn = buildPgn(selectedStudy, selectedChapter);
    const blob = new Blob([pgn], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedStudy.title}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedStudy, selectedChapter, auth, showToast]);

  const applyEnginePvLine = useCallback(async ({ uciMoves }: { uciMoves: string[]; plyIndex: number }) => {
    if (!selectedChapter || !uciMoves.length || viewingStudentId || practiceMode || !isCoachOrAdmin) return;

    const sanMoves: string[] = [];
    try {
      const game = makeBuilderGame(effectiveFen);
      for (const uci of uciMoves) {
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promo = uci.length > 4 ? uci[4] : undefined;
        const m = game.move({ from: from as any, to: to as any, promotion: promo as any });
        if (!m) break;
        sanMoves.push(m.san);
      }
    } catch {
      return;
    }
    if (!sanMoves.length) return;

    setEngineHoverMove(null);
    setHoverState(null);

    const lastUci = uciMoves[uciMoves.length - 1];
    if (lastUci.length >= 4) {
      setLastMoveSquares({
        [lastUci.slice(0, 2)]: { background: 'rgba(99,102,241,0.35)' },
        [lastUci.slice(2, 4)]: { background: 'rgba(99,102,241,0.35)' },
      });
    }

    if (isInVariation && currentVariation) {
      const [mainLinePos, varGroupIdx, varMoveIdx] = currentVariation;
      const existingVars = selectedChapter.variations ?? {};
      const group = [...(existingVars[mainLinePos] ?? [])];
      const currentLine = [...(group[varGroupIdx] ?? [])];
      const newLine = [...currentLine.slice(0, varMoveIdx + 1), ...sanMoves];
      const nextGroup = group.map((line, idx) => (idx === varGroupIdx ? newLine : line));
      const newVarIdx = varMoveIdx + sanMoves.length;
      updateChapterAtIndex(selectedChapterIndex, {
        variations: { ...existingVars, [mainLinePos]: nextGroup },
      });
      setCurrentVariation([mainLinePos, varGroupIdx, newVarIdx]);
      setSelectedAnnotationPly(mainLinePos + newVarIdx);
      if (syncState?.tree?.mainline && syncState.tree.mainline.length > 1) {
        void jumpToVariation(mainLinePos, varGroupIdx, newVarIdx);
      }
      return;
    }

    const currentIdx = currentMoveIndex;
    const baseMoves = chapterMovesForUi;
    const newComments = { ...selectedChapter.moveComments };
    const newAnnotations = { ...selectedChapter.moveAnnotations };
    const newVars = { ...(selectedChapter.variations ?? {}) };

    if (currentIdx < baseMoves.length) {
      for (let k = currentIdx; k < baseMoves.length; k++) {
        delete newComments[k];
        delete newAnnotations[k];
        delete newVars[k];
      }
      const tree = syncState?.tree?.mainline;
      if (tree && tree.length > currentIdx + 1) {
        await truncateMainlineFromMoveIndex(currentIdx);
      }
    }

    const newMoves = [...baseMoves.slice(0, currentIdx), ...sanMoves];
    const newMoveIndex = currentIdx + sanMoves.length;

    updateChapterAtIndex(selectedChapterIndex, {
      moves: newMoves,
      moveComments: newComments,
      moveAnnotations: newAnnotations,
      variations: newVars,
    });

    setCurrentVariation(null);
    setCurrentMoveIndex(newMoveIndex);
    setSelectedAnnotationPly(Math.max(0, newMoveIndex - 1));

    if (syncState?.tree) {
      void jumpToMoveIndex(newMoveIndex, newMoves);
    }
  }, [
    selectedChapter,
    viewingStudentId,
    practiceMode,
    isCoachOrAdmin,
    effectiveFen,
    isInVariation,
    currentVariation,
    currentMoveIndex,
    chapterMovesForUi,
    selectedChapterIndex,
    updateChapterAtIndex,
    syncState?.tree?.mainline,
    write,
    truncateMainlineFromMoveIndex,
    alignMainlineToMoves,
    jumpToMoveIndex,
    jumpToVariation,
  ]);

  const chapterOrientationBase = selectedChapter?.orientation ?? 'white';
  const boardOrientation = useMemo(() => {
    if (write && selectedStudy) {
      return chapterOrientationBase;
    }
    return studyBoardViewFlipLocal
      ? (chapterOrientationBase === 'white' ? 'black' : 'white')
      : chapterOrientationBase;
  }, [write, selectedStudy, chapterOrientationBase, studyBoardViewFlipLocal]);

  const studySettingsModal = showStudySettings && studyDraft ? createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={closeStudySettings}>
      <div className="bg-[#15181c] border border-white/10 rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.8)] w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
          <h3 className="font-black text-white text-xl uppercase tracking-tighter">Çalışma Ayarları</h3>
          <button type="button" onClick={closeStudySettings} className="p-2 text-slate-500 hover:text-white rounded-xl hover:bg-white/5 transition-all"><X className="w-6 h-6" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="flex gap-4">
            <div className="w-24">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Flair</label>
              <select value={studyDraft.emoji} onChange={e => setStudyDraft(d => d ? { ...d, emoji: e.target.value } : d)} className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-2xl focus:ring-2 focus:ring-teal-500/50 outline-none">{EMOJIS.map(em => <option key={em} value={em}>{em}</option>)}</select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">İsim</label>
              <input type="text" value={studyDraft.title} onChange={e => setStudyDraft(d => d ? { ...d, title: e.target.value } : d)} className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white font-bold focus:ring-2 focus:ring-teal-500/50 outline-none" placeholder="Çalışma başlığı..." />
            </div>
          </div>
          <Sel
            label="Kategori"
            value={studyDraft.categoryId ?? ''}
            onChange={(v) => setStudyDraft((d) => (d ? { ...d, categoryId: v.trim() ? v : null } : d))}
            options={[
              ['', 'Genel (tüm çalışmalar)'],
              ...studyCategories.map((c) => [c.id, c.name] as [string, string]),
            ]}
          />
          <Sel label="Görünürlük" value={studyDraft.visibility} onChange={v => setStudyDraft(d => d ? { ...d, visibility: v as any } : d)} options={[['public', 'Herkese Açık'], ['unlisted', 'Listelenmemiş'], ['private', 'Özel (Sadece Ben)']]} />
          <div className="flex items-center justify-between p-4 bg-slate-900/80 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-teal-400" />
              <div>
                <p className="text-sm font-bold text-white leading-none mb-1">Anlık Senkronizasyon</p>
                <p className="text-[10px] text-slate-500 font-medium">Öğrencilerin tahtası sizinle eşzamanlı ilerler.</p>
              </div>
            </div>
            <button type="button" onClick={() => setStudyDraft(d => d ? { ...d, syncEnabled: !d.syncEnabled } : d)} className={`w-12 h-6 rounded-full transition-all relative ${studyDraft.syncEnabled ? 'bg-teal-500' : 'bg-slate-700'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${studyDraft.syncEnabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          <div className="border-t border-white/5 pt-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">İZİN AYARLARI</p>
            <div className="grid grid-cols-2 gap-3">
              <Sel label="Sohbet" value={studyDraft.chat} onChange={v => setStudyDraft(d => d ? { ...d, chat: v as any } : d)} options={[['everyone', 'Herkes'], ['members', 'Sadece Üyeler']]} />
              <Sel label="Bilgisayar Analizi" value={studyDraft.computerAnalysis} onChange={v => setStudyDraft(d => d ? { ...d, computerAnalysis: v as any } : d)} options={[['everyone', 'Herkes'], ['members', 'Sadece Üyeler'], ['none', 'Kapalı']]} />
              <Sel label="Açılış Veritabanı" value={studyDraft.openingExplorer} onChange={v => setStudyDraft(d => d ? { ...d, openingExplorer: v as any } : d)} options={[['everyone', 'Herkes'], ['members', 'Sadece Üyeler']]} />
              <Sel label="Klonlama İzni" value={studyDraft.clonePermission} onChange={v => setStudyDraft(d => d ? { ...d, clonePermission: v as any } : d)} options={[['everyone', 'Herkes'], ['members', 'Sadece Üyeler'], ['onlyMe', 'Sadece Ben (Admin)']]} />
              <Sel label="Paylaşım / Dışa Aktarma" value={studyDraft.shareExport} onChange={v => setStudyDraft(d => d ? { ...d, shareExport: v as any } : d)} options={[['everyone', 'Herkes'], ['members', 'Sadece Üyeler'], ['onlyMe', 'Sadece Ben (Admin)']]} />
              <Sel label="Yorumlar" value={studyDraft.studyComments} onChange={v => setStudyDraft(d => d ? { ...d, studyComments: v as any } : d)} options={[['everyone', 'Herkes'], ['members', 'Sadece Üyeler'], ['none', 'Kapalı']]} />
            </div>
          </div>

          <div className="border-t border-white/5 pt-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">ÖĞRENCİ AYARLARI</p>
            <Sel label="Öğrenci Taş Oynatma" value={studyDraft.studentPlaysColor ?? 'both'} onChange={v => setStudyDraft(d => d ? { ...d, studentPlaysColor: v as any } : d)} options={[['both', 'Her İki Taraf'], ['white', 'Sadece Beyaz'], ['black', 'Sadece Siyah'], ['none', 'Kapalı (Sadece İzleme)']]} />
          </div>
        </div>
        <div className="p-6 border-t border-white/5 bg-black/20 flex items-center justify-between">
          <button type="button" onClick={deleteStudy} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-rose-500 hover:bg-rose-500/10 transition-all font-black text-xs uppercase tracking-widest"><Trash2 className="w-4 h-4" /> Sil</button>
          <div className="flex gap-3">
            <button type="button" onClick={closeStudySettings} className="px-6 py-2.5 rounded-xl text-slate-400 font-bold text-sm hover:text-white transition-colors">İPTAL</button>
            <button type="button" onClick={saveStudySettings} className="px-8 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-black text-sm shadow-lg shadow-teal-500/20 transition-all active:scale-95">KAYDET</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  // ── RENDER ──
  if (studentPreviewStudyId) {
    return (
      <StudentStudyView
        studentId={null}
        studentName="Öğrenci"
        previewMode
        previewStudyId={studentPreviewStudyId}
        onExitPreview={() => setStudentPreviewStudyId(null)}
      />
    );
  }

  if (view === 'list') {
    const filteredStudies = studies
      .filter(s => {
        const q = listSearch.trim().toLowerCase();
        if (q && !s.title.toLowerCase().includes(q) && !s.description?.toLowerCase().includes(q)) return false;
        if (listSidebar.type === 'favorites' && !s.liked) return false;
        if (listSidebar.type === 'category' && s.categoryId !== listSidebar.id) return false;
        return true;
      })
      .sort((a, b) => {
        if (listSort === 'likes') return (b.likes ?? 0) - (a.likes ?? 0);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    return (
      <div className="flex flex-col lg:flex-row gap-0 h-full min-h-0 bg-[#0d0f12] overflow-hidden relative">
        {/* Mobil: yatay filtre şeridi */}
        <div className="lg:hidden shrink-0 border-b border-white/5 bg-slate-900/90 backdrop-blur-xl px-3 py-3 space-y-2.5">
          <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setListSidebar({ type: 'all' })}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${listSidebar.type === 'all' ? 'bg-teal-500/25 text-teal-200 border border-teal-500/40' : 'text-slate-400 border border-white/10'}`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              Tümü
            </button>
            <button
              type="button"
              onClick={() => setListSidebar({ type: 'favorites' })}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${listSidebar.type === 'favorites' ? 'bg-teal-500/25 text-teal-200 border border-teal-500/40' : 'text-slate-400 border border-white/10'}`}
            >
              <Star className="w-3.5 h-3.5" />
              Favoriler
            </button>
            {studyCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setListSidebar({ type: 'category', id: cat.id })}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all max-w-[9rem] ${listSidebar.type === 'category' && listSidebar.id === cat.id ? 'bg-teal-500/25 text-teal-200 border border-teal-500/40' : 'text-slate-400 border border-white/10'}`}
              >
                <Folder className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{cat.name}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCategoryAddOpen(true)}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-teal-300 border border-dashed border-teal-500/40"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Bölüm
            </button>
          </div>
        </div>
        <div className="hidden lg:flex w-60 shrink-0 flex-col min-h-0 bg-slate-900/50 backdrop-blur-xl border-r border-white/5 shadow-2xl">
          <div className="flex-1 overflow-y-auto py-5 flex flex-col gap-1 min-h-0">
            <button
              type="button"
              onClick={() => setListSidebar({ type: 'all' })}
              className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-xl text-sm font-medium transition-all ${listSidebar.type === 'all' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <ListChecks className="w-4 h-4 shrink-0" />
              Tüm Çalışmalar
            </button>
            <button
              type="button"
              onClick={() => setListSidebar({ type: 'favorites' })}
              className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-xl text-sm font-medium transition-all ${listSidebar.type === 'favorites' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <Star className="w-4 h-4 shrink-0" />
              Favoriler
            </button>
            <div className="mx-4 my-2 border-t border-white/10" />
            <p className="px-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Kategoriler</p>
            <div className="px-2 mx-2 mb-1 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setCategoryAddOpen(true)}
                className="flex w-full items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide text-teal-200 bg-teal-500/15 border border-teal-500/35 hover:bg-teal-500/25 hover:border-teal-400/50 transition-colors"
              >
                <FolderPlus className="w-4 h-4 shrink-0" aria-hidden />
                Bölüm ekle
              </button>
              {studyCategories.length === 0 ? (
                <p className="px-2 text-[11px] text-slate-600 leading-snug text-center">
                  Bölüm ekleyerek çalışmalarınızı gruplayın; seçili bölümde yeni çalışma açılır.
                </p>
              ) : null}
            </div>
            {studyCategories.map((cat) => (
              <div key={cat.id} className="flex items-stretch gap-1 mx-2 group">
                <button
                  type="button"
                  onClick={() => setListSidebar({ type: 'category', id: cat.id })}
                  className={`flex flex-1 min-w-0 items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all text-left ${listSidebar.type === 'category' && listSidebar.id === cat.id ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 shadow-lg' : 'text-slate-400 hover:text-white border border-transparent'}`}
                >
                  <Folder className="w-4 h-4 shrink-0 opacity-80" />
                  <span className="truncate">{cat.name}</span>
                </button>
                <button
                  type="button"
                  title="Kategoriyi sil"
                  onClick={() => deleteStudyCategory(cat.id)}
                  className="shrink-0 px-2 rounded-xl text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 opacity-80 group-hover:opacity-100 transition-opacity"
                  aria-label="Kategoriyi sil"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="shrink-0 border-t border-white/10 p-3 bg-slate-900/40">
            {categoryAddOpen ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={categoryAddName}
                  onChange={(e) => setCategoryAddName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addStudyCategory();
                    if (e.key === 'Escape') {
                      setCategoryAddOpen(false);
                      setCategoryAddName('');
                    }
                  }}
                  placeholder="Bölüm adı"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-500/50"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addStudyCategory}
                    className="flex-1 py-2 rounded-xl bg-teal-500/90 hover:bg-teal-400 text-black text-xs font-bold"
                  >
                    Ekle
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryAddOpen(false);
                      setCategoryAddName('');
                    }}
                    className="px-3 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold"
                  >
                    İptal
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCategoryAddOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-teal-300 border border-dashed border-white/15 hover:border-teal-500/40 transition-all"
              >
                <FolderPlus className="w-4 h-4" />
                Bölüm ekle
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col p-4 sm:p-6 lg:p-8 overflow-y-auto overflow-x-hidden">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6 sm:mb-8">
            <div className="flex-1 min-w-0 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input type="text" value={listSearch} onChange={e => setListSearch(e.target.value)} placeholder="Ara..." className="w-full bg-slate-800 border border-slate-700/60 rounded-2xl pl-12 pr-5 py-3 text-sm text-white outline-none focus:border-teal-500/50" />
            </div>
            <button type="button" onClick={addStudy} className="shrink-0 w-full sm:w-auto justify-center px-5 sm:px-6 py-3 bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-2xl shadow-xl shadow-teal-500/10 transition-all flex items-center gap-2">
              <Plus className="w-4 h-4" /> Yeni Çalışma
            </button>
          </div>
          {listSidebar.type === 'category' && (
            <p className="text-sm text-slate-400 mb-4 px-0.5">
              <span className="text-teal-400/90 font-semibold">
                {studyCategories.find((c) => c.id === listSidebar.id)?.name ?? 'Kategori'}
              </span>
              {' '}
              — Yeni çalışma bu klasöre eklenir. Mevcut çalışmayı taşımak için çalışma ayarlarından kategori seçin.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredStudies.map(s => (
              <div key={s.id} onClick={() => openStudyInEditor(s.id)} className="cursor-pointer rounded-3xl bg-slate-800/40 border border-white/5 p-6 hover:border-teal-500/40 transition-all group backdrop-blur-sm relative">
                {(s.clonePermission === 'onlyMe' || s.shareExport === 'onlyMe') && auth?.role === 'admin' && (
                  <span className="absolute top-4 right-4 p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400" title="Sadece admin erişebilir">
                    <Lock className="w-3 h-3" />
                  </span>
                )}
                <div className="flex items-center gap-4 mb-4">
                  <span className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-2xl">{s.emoji}</span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white group-hover:text-teal-400 truncate">{s.title}</h3>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                      {[
                        s.categoryId ? studyCategories.find((c) => c.id === s.categoryId)?.name : null,
                        `${s.chapters.length} BÖLÜM`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
                {s.description && <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">{s.description}</p>}
                <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                  <button type="button" onClick={e => { e.stopPropagation(); toggleLike(s.id); }} className={`p-2 rounded-xl ${s.liked ? 'text-rose-400 bg-rose-500/10' : 'text-slate-500 hover:text-rose-400'}`}><Heart className={`w-4 h-4 ${s.liked ? 'fill-current' : ''}`} /></button>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setStudentPreviewStudyId(s.id); }}
                    className="p-2 rounded-xl text-slate-500 hover:text-indigo-400"
                    title="Öğrenci görünümü"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {canCloneStudy(s, auth) && (
                    <button type="button" onClick={e => { e.stopPropagation(); cloneStudy(s); }} className="p-2 rounded-xl text-slate-500 hover:text-teal-400" title="Klonla"><Copy className="w-4 h-4" /></button>
                  )}
                  {auth?.role === 'admin' && (
                    <button type="button" onClick={e => openStudySettingsFromList(s, e)} className="p-2 rounded-xl text-slate-500 hover:text-teal-400" title="Ayarlar"><Settings2 className="w-4 h-4" /></button>
                  )}
                  <button type="button" onClick={e => { e.stopPropagation(); if (window.confirm('Silinsin mi?')) { deletedIdsRef.current.add(s.id); setStudies(prev => prev.filter(x => x.id !== s.id)); deleteStudyAsync(s.id); } }} className="p-2 rounded-xl text-slate-500 hover:text-rose-400 ml-auto"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {showCreateStudy && createStudyDraft && (
          <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#1b1a18] shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <div className="text-white font-bold text-lg">Çalışma oluştur</div>
                <button
                  type="button"
                  onClick={() => { setShowCreateStudy(false); setCreateStudyDraft(null); }}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Flair</label>
                    <select
                      value={String(createStudyDraft.emoji ?? '♟️')}
                      onChange={(e) => setCreateStudyDraft((d) => ({ ...(d ?? {}), emoji: e.target.value }))}
                      className="w-full bg-[#11100f] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-400/40"
                    >
                      {['♟️','🔥','⭐','📚','🧩','🎯','🦁','👑','⚡','🧠'].map((em) => (
                        <option key={em} value={em}>{em}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">İsim</label>
                    <input
                      value={String(createStudyDraft.title ?? '')}
                      onChange={(e) => setCreateStudyDraft((d) => ({ ...(d ?? {}), title: e.target.value }))}
                      className="w-full bg-[#11100f] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-400/40"
                      placeholder="Örn: Açılış Repertuarı"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Kategori</label>
                    <select
                      value={String(createStudyDraft.categoryId ?? '')}
                      onChange={(e) =>
                        setCreateStudyDraft((d) => ({
                          ...(d ?? {}),
                          categoryId: e.target.value.trim() ? e.target.value : null,
                        }))
                      }
                      className="w-full bg-[#11100f] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-400/40"
                    >
                      <option value="">Genel (tüm çalışmalar)</option>
                      {studyCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Görünürlük</label>
                    <select
                      value={String(createStudyDraft.visibility ?? 'unlisted')}
                      onChange={(e) => setCreateStudyDraft((d) => ({ ...(d ?? {}), visibility: e.target.value as any }))}
                      className="w-full bg-[#11100f] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-400/40"
                    >
                      <option value="public">Herkese açık</option>
                      <option value="unlisted">Liste dışı</option>
                      <option value="private">Özel</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Sohbet</label>
                    <select
                      value={String(createStudyDraft.chat ?? 'members')}
                      onChange={(e) => setCreateStudyDraft((d) => ({ ...(d ?? {}), chat: e.target.value as any }))}
                      className="w-full bg-[#11100f] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-400/40"
                    >
                      <option value="members">Üyeler</option>
                      <option value="everyone">Herkes</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Bilgisayar analizi</label>
                    <select
                      value={String(createStudyDraft.computerAnalysis ?? 'everyone')}
                      onChange={(e) => setCreateStudyDraft((d) => ({ ...(d ?? {}), computerAnalysis: e.target.value as any }))}
                      className="w-full bg-[#11100f] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-400/40"
                    >
                      <option value="everyone">Herkes</option>
                      <option value="members">Üyeler</option>
                      <option value="none">Kapalı</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Açılış keşfi &amp; oyunsonu analizi</label>
                    <select
                      value={String(createStudyDraft.openingExplorer ?? 'everyone')}
                      onChange={(e) => setCreateStudyDraft((d) => ({ ...(d ?? {}), openingExplorer: e.target.value as any }))}
                      className="w-full bg-[#11100f] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-400/40"
                    >
                      <option value="everyone">Herkes</option>
                      <option value="members">Üyeler</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Klonlamaya izin olanlar</label>
                    <select
                      value={String(createStudyDraft.clonePermission ?? 'everyone')}
                      onChange={(e) => setCreateStudyDraft((d) => ({ ...(d ?? {}), clonePermission: e.target.value as any }))}
                      className="w-full bg-[#11100f] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-400/40"
                    >
                      <option value="everyone">Herkes</option>
                      <option value="members">Üyeler</option>
                      <option value="onlyMe">Sadece Ben (Admin)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Paylaş ve dışa aktar</label>
                    <select
                      value={String(createStudyDraft.shareExport ?? 'everyone')}
                      onChange={(e) => setCreateStudyDraft((d) => ({ ...(d ?? {}), shareExport: e.target.value as any }))}
                      className="w-full bg-[#11100f] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-400/40"
                    >
                      <option value="everyone">Herkes</option>
                      <option value="members">Üyeler</option>
                      <option value="onlyMe">Sadece Ben (Admin)</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Senkronizasyonu etkinleştir</label>
                    <div className="flex items-center justify-between bg-[#11100f] border border-white/10 rounded-xl px-3 py-2">
                      <div className="text-sm text-slate-200">Evet: herkes aynı pozisyonda kalsın</div>
                      <input
                        type="checkbox"
                        checked={Boolean(createStudyDraft.syncEnabled ?? true)}
                        onChange={(e) => setCreateStudyDraft((d) => ({ ...(d ?? {}), syncEnabled: e.target.checked }))}
                        className="w-5 h-5 accent-teal-400"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Çalışma üzerine yorumlar</label>
                    <select
                      value={String(createStudyDraft.studyComments ?? 'none')}
                      onChange={(e) => setCreateStudyDraft((d) => ({ ...(d ?? {}), studyComments: e.target.value as any }))}
                      className="w-full bg-[#11100f] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-400/40"
                    >
                      <option value="none">Yok</option>
                      <option value="members">Üyeler</option>
                      <option value="everyone">Herkes</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setShowCreateStudy(false); setCreateStudyDraft(null); }}
                  className="text-rose-400 hover:text-rose-300 font-bold text-sm"
                >
                  İPTAL ET
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = createStudyDraft;
                    setShowCreateStudy(false);
                    setCreateStudyDraft(null);
                    createStudyFromDraft(d);
                  }}
                  className="px-6 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm"
                >
                  BAŞLAT
                </button>
              </div>
            </div>
          </div>
        )}
        {studySettingsModal}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 max-h-[100dvh] bg-[#0a0f1e] text-slate-300 overflow-hidden font-sans selection:bg-indigo-500/30 selection:text-indigo-200">

      <header className="shrink-0 flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-white/5 bg-[#0f172a]/95 backdrop-blur-xl z-50">
        <button
          type="button"
          onClick={() => setView('list')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider transition-all shrink-0"
          aria-label="Çalışmalara dön"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Çalışmalara Dön</span>
          <span className="sm:hidden">Geri</span>
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-lg leading-none shrink-0">{selectedStudy.emoji}</span>
          <h1 className="text-sm font-bold text-white truncate">{selectedStudy.title}</h1>
        </div>
        <button
          type="button"
          onClick={() => setStudentPreviewStudyId(selectedStudy.id)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 hover:text-indigo-200 text-xs font-bold uppercase tracking-wider transition-all shrink-0 border border-indigo-500/20"
          title="Öğrenci görünümü"
        >
          <Eye className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Öğrenci görünümü</span>
        </button>
      </header>

      {/* ═══════════════  THREE COLUMN LAYOUT (Lichess style)  ════════════════ */}
      <div className="flex flex-col xl:flex-row gap-0 flex-1 min-h-0 min-w-0 pb-14 xl:pb-0">

        {/* ── LEFT SIDEBAR: Chapters + Members + Chat ─────── */}
        <div className={`${mobilePanel === 'left' ? 'flex' : 'hidden'} xl:flex w-full xl:w-72 shrink-0 flex-col min-h-0 bg-[#0f172a] border-r border-white/5 overflow-hidden ${mobilePanel === 'left' ? 'fixed inset-x-0 top-12 bottom-14 z-40 xl:relative xl:top-auto xl:z-auto xl:inset-auto' : ''}`}>
          {/* Tab header */}
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-white/5 shrink-0">
            {(['chapters', 'members'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setLeftTab(tab)}
                className={`relative flex-1 min-w-0 rounded-lg px-2 py-2 text-[11px] font-bold uppercase tracking-wide transition-all text-center ${
                  leftTab === tab
                    ? 'bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-500/30'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
                }`}
              >
                {tab === 'chapters' ? `${selectedStudy.chapters.length} Bölüm` : `${members.length} Üye`}
                {tab === 'members' && anyStudentLive && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
                )}
              </button>
            ))}
            <div className="flex items-center shrink-0">
              {leftTab === 'chapters' && (
                <button
                  type="button"
                  onClick={() => { setShowChapterSearch(v => !v); setChapterSearch(''); }}
                  className={`p-2 rounded-lg transition-colors ${showChapterSearch ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                  title="Bölüm ara"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={openStudySettings}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
                title="Çalışma ayarları"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col min-h-0">
            {leftTab === 'chapters' ? (
              <>
                <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar min-h-0 px-2 py-2">
                  {showChapterSearch && (
                    <div className="mb-2">
                      <input
                        type="text"
                        autoFocus
                        value={chapterSearch}
                        onChange={e => setChapterSearch(e.target.value)}
                        placeholder="Bölüm ara..."
                        className="w-full bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    {filteredChapters.map((ch) => {
                      const realIdx = selectedStudy.chapters.findIndex(c => c.id === ch.id);
                      const active = selectedChapterIndex === realIdx;
                      return (
                        <div
                          key={ch.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => { setSelectedChapterIndex(realIdx); setCurrentMoveIndex(0); setCurrentVariation(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSelectedChapterIndex(realIdx); setCurrentMoveIndex(0); setCurrentVariation(null); } }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all group cursor-pointer ${
                            active
                              ? 'bg-indigo-500/15 text-white ring-1 ring-indigo-500/25'
                              : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                          }`}
                        >
                          <span className={`text-[11px] font-bold w-5 shrink-0 text-right tabular-nums ${active ? 'text-indigo-400' : 'text-slate-600'}`}>
                            {realIdx + 1}
                          </span>
                          <span className={`text-[13px] truncate flex-1 ${active ? 'font-semibold' : ''}`}>
                            {formatChapterListLabel(ch, { allChapters: selectedStudy.chapters })}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openChapterEdit(ch); }}
                            className="p-1 rounded-md text-slate-600 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                            title="Bölümü düzenle"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {filteredChapters.length === 0 && (
                    <p className="text-center py-10 text-xs text-slate-500">Henüz bölüm yok</p>
                  )}
                </div>

                <div className="shrink-0 border-t border-white/10 bg-[#0b1220] p-3 space-y-2">
                  <button
                    type="button"
                    onClick={addChapter}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Yeni bölüm
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openNewChapterModal('vision')}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-white/10 bg-white/[0.03] text-slate-400 hover:text-teal-300 hover:border-teal-500/30 hover:bg-teal-500/5 transition-all text-[11px] font-bold"
                      title="Görsel veya PDF ile FEN çıkar"
                    >
                      <FileImage className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Görsel / PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBulkPgnImport((v) => !v)}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg border text-[11px] font-bold transition-all ${
                        showBulkPgnImport
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                          : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-amber-300 hover:border-amber-500/30 hover:bg-amber-500/5'
                      }`}
                      title="Birden fazla PGN dosyasını toplu ekle"
                    >
                      <Import className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Toplu PGN</span>
                    </button>
                  </div>

                  {showBulkPgnImport ? (
                    <div className="rounded-xl border border-amber-500/20 bg-slate-900/70 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Import className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="text-[11px] font-bold text-slate-200">Toplu PGN içe aktar</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowBulkPgnImport(false)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors shrink-0"
                          aria-label="Kapat"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        ref={bulkPgnFileRef}
                        type="file"
                        accept=".pgn,.txt,text/plain"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = e.target.files;
                          if (!files?.length) return;
                          void (async () => {
                            let total = 0;
                            for (const file of Array.from(files)) {
                              const text = await file.text();
                              total += bulkImportPgn(text);
                            }
                            if (total > 0) {
                              showToast(`${total} bölüm eklendi`, 'success');
                              setBulkPgnImportText('');
                            } else {
                              showToast('Geçerli PGN bulunamadı', 'error');
                            }
                            if (bulkPgnFileRef.current) bulkPgnFileRef.current.value = '';
                          })();
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => bulkPgnFileRef.current?.click()}
                        className="w-full py-2.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] text-slate-300 text-xs font-bold hover:border-amber-500/35 hover:bg-amber-500/5 hover:text-amber-200 transition-all"
                      >
                        PGN dosyası seç
                      </button>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-[10px] text-slate-500 font-medium shrink-0">veya yapıştır</span>
                        <div className="flex-1 h-px bg-white/10" />
                      </div>
                      <textarea
                        rows={4}
                        value={bulkPgnImportText}
                        onChange={(e) => setBulkPgnImportText(e.target.value)}
                        placeholder="Birden fazla PGN yapıştırın — her oyun ayrı bölüm olur"
                        className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2.5 text-[11px] text-slate-300 font-mono resize-none focus:outline-none focus:border-amber-500/35 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const n = bulkImportPgn(bulkPgnImportText);
                          if (n > 0) {
                            showToast(`${n} bölüm eklendi`, 'success');
                            setBulkPgnImportText('');
                          } else {
                            showToast('Geçerli PGN bulunamadı', 'error');
                          }
                        }}
                        className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors"
                      >
                        İçe aktar
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar min-h-0 p-3 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowAddMember(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 hover:bg-indigo-500/25 transition-all text-xs font-bold uppercase tracking-wide"
                >
                  <UserPlus className="w-4 h-4" />
                  Üye Ekle
                </button>
                <div className="space-y-1">
                  {members.map(m => (
                    <div 
                      key={m.id} 
                      onClick={() => { if (m.kind === 'student') setViewingStudentId(m.id); }}
                      className={`group flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-all ${m.kind === 'student' ? 'cursor-pointer' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shadow-lg ${
                        m.kind === 'coach'
                          ? 'bg-amber-500/20 text-amber-300 shadow-amber-500/10'
                          : 'premium-gradient text-white shadow-indigo-500/10'
                      }`}>
                        {m.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-300 truncate flex items-center gap-1.5">
                          <span>{m.name}</span>
                          {m.kind === 'coach' ? (
                            <span className="text-[9px] font-bold uppercase text-amber-400/90">Antrenör</span>
                          ) : null}
                        </p>
                        {(() => {
                          const p = formatPresence(presenceByUserId[String(m.id)]);
                          if (!p) return null;
                          return (
                            <div className="flex flex-col gap-1 mt-0.5">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-extrabold tracking-tighter ${p.vsComputer ? 'text-orange-400' : p.sticky ? 'text-indigo-400' : 'text-slate-600'}`}>
                                  {p.vsComputer ? 'VS COMPUTER' : p.sticky ? 'SYNC' : 'FREE'}
                                </span>
                                <span className="text-[10px] text-[#787472] truncate">
                                  {p.chapterTitle} · {p.vsComputer ? `${p.vcHistory.length} hamle` : `ply ${p.ply}`}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        {m.kind === 'student' ? (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedAnalysisStudentId(m.id); }} className="p-1 text-[#787472] hover:text-[#bababa]" title="Analiz"><BarChart2 className="w-3 h-3" /></button>
                        ) : null}
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeMember(m.id); }} className="p-1 text-[#787472] hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                  ))}
                  {members.length === 0 && <p className="text-center py-6 text-[11px] text-[#787472] italic">Üye bulunamadı.</p>}
                </div>
              </div>
            )}
          </div>

          {/* Chat */}
          <div className="border-t border-white/10 bg-[#0b1220] flex flex-col shrink-0" style={{ minHeight: '160px', maxHeight: '200px' }}>
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sohbet</span>
                <button
                  type="button"
                  onClick={() => setChatEnabled(v => !v)}
                  className={`w-9 h-5 rounded-full transition-all relative ${chatEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
                  aria-label={chatEnabled ? 'Sohbeti kapat' : 'Sohbeti aç'}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${chatEnabled ? 'left-4.5' : 'left-0.5'}`} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowCallPanel(v => !v)}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
                title="Sesli arama"
              >
                <Video className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-1.5 space-y-1 custom-scrollbar min-h-0">
              {chatMessages.length === 0 && (
                <p className="text-center py-4 text-[10px] text-[#787472] italic">Mesaj yok</p>
              )}
              {chatMessages.map(m => (
                <div key={m.id} className="text-[11px] leading-snug px-1 py-0.5 rounded hover:bg-white/5 transition-colors">
                  <span className="font-extrabold text-indigo-400 mr-2">{m.user.replace(/\(Canlı Analiz\)/gi, '').trim()}:</span>
                  <span className="text-slate-200">
                    {m.text
                      .replace(/\[LIVE_NOTE\]/gi, '')
                      .replace(/\[CHAPTER:[^\]]+\]/gi, '')
                      .replace(/\[CHAPTER_LABEL:[^\]]+\]/gi, '')
                      .trim()}
                  </span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={e => { e.preventDefault(); sendChat(); }} className="flex border-t border-white/10 bg-slate-900/50">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Mesaj yaz..."
                className="flex-1 bg-transparent px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none"
              />
              <button type="submit" className="px-3 text-indigo-400 hover:text-indigo-300 transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </form>

            <div className="px-3 py-1.5 border-t border-white/5 flex items-center gap-2 text-[10px] text-slate-500">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
                <Users className="w-3 h-3 text-indigo-400" />
                <span className="text-[10px] text-indigo-400 font-extrabold">{members.length + 1}</span>
              </div>
              <span className="text-[10px] text-slate-300 font-bold truncate opacity-80">{currentUserName}</span>
            </div>
          </div>

          {showCallPanel && (
            <div className="p-2 border-t border-[rgba(255,255,255,0.05)] bg-[#0f172a]">
              <StudyCallPanel 
                role="coach" 
                onClose={() => setShowCallPanel(false)} 
                status={callStatus}
                localStream={callLocalStream}
                remoteStream={callRemoteStream}
                incomingOffer={callIncomingOffer}
                error={callError}
                startCall={callStartCall}
                acceptCall={callAcceptCall}
                endCall={callEndCall}
              />
            </div>
          )}
        </div>

        {/* ── CENTER COLUMN: Board & Tools (Lichess style) ──────────────────────── */}
        <div className={`${mobilePanel === 'board' ? 'flex' : 'hidden'} xl:flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden relative`}>

          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
            <div className="flex flex-col items-stretch sm:items-center py-2 px-2 sm:px-3 gap-2 sm:gap-1 w-full min-w-0">

              {/* Board with eval bar */}
              <div className="w-full max-w-full sm:max-w-[min(72vh,68vw)] group/board relative px-1">
                <div className="flex justify-end items-center gap-1.5 mb-1.5">
                  <button
                    type="button"
                    onClick={() => setShowStudyHelp(true)}
                    className="p-2 rounded-lg text-slate-500 hover:text-indigo-300 hover:bg-white/5 border border-transparent hover:border-white/10 transition-all"
                    title="Klavye kısayolları (?)"
                  >
                    <Keyboard className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowStudyBoardSettings((v) => !v)}
                    className={`p-2 rounded-lg border transition-all ${
                      showStudyBoardSettings
                        ? 'text-indigo-300 bg-indigo-500/15 border-indigo-500/30'
                        : 'text-slate-500 hover:text-indigo-300 hover:bg-white/5 border-transparent hover:border-white/10'
                    }`}
                    title="Tahta ayarları (h)"
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>
                </div>
                <ChessBoardFrame
                  boardOrientation={boardOrientation}
                  shellClassName="bg-[#0f172a] border-r border-white/5 shadow-inner"
                  evalBar={
                    boardSettings.showEvalBar ? (
                      <ChessEvalBar score={evalScore} orientation={boardOrientation} />
                    ) : undefined
                  }
                  boardClassName={`overflow-hidden shadow-lg transition-all duration-300 ${recording ? 'ring-2 ring-rose-500/40' : ''}`}
                >
                  <div
                    ref={boardWheelRef}
                    className="absolute inset-0"
                    onMouseDownCapture={() => {
                      setHoverState(null);
                      setDragFrozenFen(boardDisplayFen);
                      setIsDraggingPiece(true);
                    }}
                    onMouseUpCapture={() => {
                      setIsDraggingPiece(false);
                      setDragFrozenFen(null);
                    }}
                    onMouseLeave={() => {
                      setIsDraggingPiece(false);
                      setDragFrozenFen(null);
                    }}
                  >
                    <Chessboard
                      key={selectedChapter?.id || 'main'}
                      options={{
                        id: `study-board-${selectedChapter?.id || 'main'}`,
                        position: chessboardPosition,
                        boardOrientation,
                        darkSquareStyle: { backgroundColor: '#5d768e' },
                        lightSquareStyle: { backgroundColor: '#c1c9d2' },
                        ...CHESSBOARD_ANIMATION,
                        ...CHESSBOARD_NO_NOTATION,
                        onPieceDrop: (args: unknown) => {
                          const { sourceSquare, targetSquare } = pickDropArgs(args, undefined);
                          if (!sourceSquare || !targetSquare) return false;
                          if (drawingTool !== 'mouse') return false;
                          const dragArgs = { sourceSquare, targetSquare, piece: '' };
                          if (recording) return handlePieceDrop(dragArgs);
                          if (practiceMode) return handlePracticeDrop(dragArgs);
                          if (ncMode === 'normal' && !practiceMode && syncState && isCoachOrAdmin) {
                            return handlePieceDrop(dragArgs);
                          }
                          return false;
                        },
                        onSquareClick: (arg: unknown) => handleBoardSquareClick(arg),
                        onSquareRightClick: (arg: unknown) => handleBoardSquareRightClick(arg),
                        onPieceClick: (arg: unknown) => handleBoardPieceClick(arg),
                        allowDrawingArrows:
                          isCoachOrAdmin &&
                          (drawingTool === 'mouse' || drawingTool === 'arrow' || arrowCtrlShortcutHeld),
                        arePiecesDraggable: drawingTool === 'mouse',
                        arrows: (() => {
                          const base = boardArrows || [];
                          const seen = new Set<string>();
                          const merged: Array<{ startSquare: string; endSquare: string; color: string }> = [];
                          for (const a of base) {
                            const k = `${a.startSquare.toLowerCase()}-${a.endSquare.toLowerCase()}`;
                            if (!seen.has(k)) {
                              seen.add(k);
                              merged.push({
                                ...a,
                                startSquare: a.startSquare.toLowerCase(),
                                endSquare: a.endSquare.toLowerCase()
                              });
                            }
                          }
                          if (boardSettings.showVariationArrows && engineHoverMove) {
                            const k = `${engineHoverMove.from.toLowerCase()}-${engineHoverMove.to.toLowerCase()}`;
                            if (!seen.has(k)) {
                              seen.add(k);
                              merged.push({ startSquare: engineHoverMove.from.toLowerCase(), endSquare: engineHoverMove.to.toLowerCase(), color: 'rgba(99,102,241,0.85)' });
                            }
                          } else if (boardSettings.showBestMoveArrows && boardSettings.showEngineAnalysis && engineTopMove) {
                            const k = `${engineTopMove.from.toLowerCase()}-${engineTopMove.to.toLowerCase()}`;
                            if (!seen.has(k)) {
                              seen.add(k);
                              merged.push({ startSquare: engineTopMove.from.toLowerCase(), endSquare: engineTopMove.to.toLowerCase(), color: 'rgba(99,102,241,0.4)' });
                            }
                          }
                          for (const a of studyThreatArrows) {
                            const k = `${a.startSquare}-${a.endSquare}`;
                            if (!seen.has(k)) {
                              seen.add(k);
                              merged.push(a);
                            }
                          }
                          return merged;
                        })(),
                        arrowOptions: {
                          color: COLOR_VALUES[drawingColor],
                          secondaryColor: COLOR_VALUES[drawingColor],
                          tertiaryColor: COLOR_VALUES[drawingColor],
                          opacity: 0.7,
                          activeOpacity: 0.9,
                          arrowWidthDenominator: 5,
                          activeArrowWidthMultiplier: 1.2,
                          arrowLengthReducerDenominator: 8,
                          sameTargetArrowLengthReducerDenominator: 4,
                          arrowStartOffset: 0,
                        },
                        onArrowsChange: (payload: unknown) => {
                          const raw = Array.isArray(payload)
                            ? (payload as Array<{ startSquare: string; endSquare: string; color: string }>)
                            : ((payload as { arrows?: Array<{ startSquare: string; endSquare: string; color: string }> } | null)?.arrows ?? []);
                          const seen = new Set<string>();
                          const filtered: Array<{ startSquare: string; endSquare: string; color: string }> = [];
                          for (const a of raw) {
                            if (!a.startSquare || !a.endSquare) continue;
                            const k = `${a.startSquare.toLowerCase()}-${a.endSquare.toLowerCase()}`;
                            if (seen.has(k)) continue;
                            if (a.color === 'rgba(99,102,241,0.85)' || a.color === 'rgba(99,102,241,0.4)' || a.color === 'rgba(239,68,68,0.72)') continue;
                            seen.add(k);
                            filtered.push({
                              ...a,
                              startSquare: a.startSquare.toLowerCase(),
                              endSquare: a.endSquare.toLowerCase()
                            });
                          }
                          const currentArrows = boardArrows || [];
                          if (filtered.length > currentArrows.length) {
                            filtered[filtered.length - 1].color = COLOR_VALUES[drawingColor];
                          }
                          setBoardArrows(filtered);
                          if (write && selectedStudy && selectedChapter) {
                            const ml = syncState?.tree?.mainline ?? [];
                            const nodeId = ml.length > 0 ? ml[Math.max(0, Math.min(ml.length - 1, currentMoveIndex))] : (syncState?.tree?.rootId ?? 'root');
                            void appendStudyAction({
                              studyId: selectedStudy.id,
                              chapterId: selectedChapter.id,
                              actorId,
                              actorRole,
                              type: 'setShapes',
                              payload: { nodeId, shapes: filtered },
                            });
                          } else {
                            updateChapterAtIndex(selectedChapterIndex, { arrows: filtered });
                          }
                        },
                        squareStyles: studyBoardSquareStyles,
                        squareRenderer: boardSettings.showMoveAnnotations ? glyphSquareRenderer : undefined,
                      }}
                    />
                  </div>
                  {difficultyFeedback && (
                    <div className="absolute top-2 left-2 right-2 p-3 bg-rose-500/10 border border-rose-500/20 backdrop-blur-md rounded-xl text-rose-400 text-[10px] font-bold z-10 animate-in slide-in-from-top-2 pointer-events-none">
                       {difficultyFeedback}
                    </div>
                  )}
                </ChessBoardFrame>
              </div>

              {/* Drawing Toolbar Row (Coach Only) - Outside Board */}
              {(auth?.role === 'admin' || auth?.role === 'coach') && (
                <div className="w-full flex justify-center overflow-x-auto scrollbar-none mb-1 sm:mb-3">
                  <div className="inline-flex bg-[#1b1e23]/95 backdrop-blur-xl p-1 sm:p-2 rounded-xl border border-white/10 shadow-2xl">
                    <DrawingToolbar
                      currentTool={drawingTool}
                      currentColor={drawingColor}
                      onToolSelect={(t, c) => {
                        setDrawingTool(t);
                        setDrawingColor(c);
                      }}
                      onClear={() => {
                        setCircleMarks({});
                        updateChapterAtIndex(selectedChapterIndex, { circles: {}, arrows: [] });
                      }}
                      onCopy={() => {
                        navigator.clipboard.writeText(boardDisplayFen);
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Toolbar row: SYNC / REC / navigation */}
              <div className="w-full sm:max-w-[min(66vh,60vw)] flex flex-col gap-1.5 bg-[#1e293b] rounded-xl border border-white/5 px-2 py-1.5 sm:py-1 shadow-xl">
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => { void setSticky(!sticky); }}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-lg text-[10px] font-extrabold tracking-wider transition-all shrink-0 ${
                      sticky
                        ? 'text-indigo-400 bg-indigo-500/10 shadow-inner'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${sticky ? 'bg-indigo-500 animate-pulse' : 'bg-slate-700'}`} />
                    SYNC
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecording(!recording)}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-lg text-[10px] font-extrabold tracking-wider transition-all shrink-0 ${
                      recording
                        ? 'text-rose-400 bg-rose-500/10 shadow-inner'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${recording ? 'bg-rose-500 animate-pulse' : 'bg-slate-700'}`} />
                    REC
                  </button>
                  {!sticky && behind > 0 && (
                    <button
                      type="button"
                      onClick={() => { void catchUp(); }}
                      className="flex items-center gap-1 px-2 py-2 sm:py-1.5 rounded-lg text-[10px] font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-colors shrink-0"
                      title="Canlı konuma yetiş"
                    >
                      +{behind}
                    </button>
                  )}
                  <div className="flex-1 min-w-2" />
                  {canStudyUndo && (
                    <button type="button" onClick={() => void undoMove()} className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all shrink-0" title="Geri al">
                      <Undo2 className="w-4 h-4" />
                    </button>
                  )}
                  {write && (
                    <button type="button" onClick={() => void clearChapter()} className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all shrink-0" title="Bölümü sıfırla"><RotateCcw className="w-4 h-4" /></button>
                  )}
                </div>
                <div className="flex items-center justify-center gap-0.5 border-t border-white/5 pt-1.5 sm:border-0 sm:pt-0">
                  <button type="button" onClick={goStart} className="p-2.5 sm:p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all" title="Başa"><SkipBack className="w-4 h-4" /></button>
                  <button type="button" onClick={goPrev} className="p-2.5 sm:p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all" title="Önceki"><ChevronLeft className="w-5 h-5" /></button>
                  <button type="button" onClick={goNext} className="p-2.5 sm:p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all" title="Sonraki"><ChevronRight className="w-5 h-5" /></button>
                  <button type="button" onClick={goEnd} className="p-2.5 sm:p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all" title="Sona"><SkipForward className="w-4 h-4" /></button>
                </div>
              </div>

              {/* Study info — mobilde kompakt */}
              <div className="w-full sm:max-w-[min(66vh,60vw)] bg-[#0f172a] rounded-xl border border-white/5 px-3 py-3 sm:px-6 sm:py-5 shadow-2xl">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-xl sm:text-2xl shrink-0 leading-none">{selectedStudy.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xs sm:text-sm font-bold text-white truncate">{selectedStudy.title}</h2>
                    <p className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-tight truncate mt-0.5">{currentUserName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = { ...selectedStudy, liked: !selectedStudy.liked, likes: selectedStudy.liked ? Math.max(0, selectedStudy.likes - 1) : selectedStudy.likes + 1 };
                      updateStudy(updated);
                    }}
                    className={`shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all ${
                      selectedStudy.liked ? 'text-red-400 bg-red-500/10' : 'text-[#787472] hover:text-red-400 hover:bg-white/5'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${selectedStudy.liked ? 'fill-current' : ''}`} />
                    <span className="text-[11px] font-bold">{selectedStudy.likes}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5 sm:mt-3 pl-0 sm:pl-0">
                  <button
                    type="button"
                    onClick={openStudySettings}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-widest transition-colors flex items-center gap-1 min-h-[36px]"
                  >
                    <Settings2 className="w-3 h-3 shrink-0" /> KONULARI YÖNET
                  </button>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    <span className="opacity-60">TARİH</span>
                    <span className="text-slate-300">{new Date(selectedStudy.createdAt).toLocaleDateString('tr-TR').replace(/\//g, '.')}</span>
                  </div>
                </div>

                {selectedStudy.topicTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {selectedStudy.topicTags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded-full text-[9px] bg-indigo-500/10 text-indigo-400 font-extrabold border border-indigo-500/20 uppercase tracking-tighter">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom tools (tabs: tags, comments, annotations, etc.) */}
              <div className="w-full sm:max-w-[min(66vh,60vw)] min-w-0">
                <StudyBottomTools
                  study={selectedStudy}
                  chapter={selectedChapter}
                  activeTab={bottomTab}
                  currentMoveIndex={currentMoveIndex}
                  currentFen={currentFen}
                  chatMessages={chatMessages}
                  moveAnalysisEntries={moveAnalysisEntries}
                  totalThinkLabel={formatDuration(totalThinkMs)}
                  totalCorrectThinkLabel={formatDuration(totalCorrectThinkMs)}
                  totalWrongThinkLabel={formatDuration(totalWrongThinkMs)}
                  currentUserName={currentUserName}
                  viewingStudentId={viewingStudentId}
                  onViewingStudentChange={setViewingStudentId}
                  onTabChange={setBottomTab}
                  onAddTag={addTag}
                  onRemoveTag={removeTag}
                  onSaveComment={(msg) => currentMoveIndex === 0 ? saveChapterComment(msg) : saveMoveComment(msg)}
                  onAddAnnotation={addAnnotation}
                  canAnnotate={canAnnotateMoves}
                  annotationPlyIndex={annotationPlyIndex}
                  onSelectChapter={(idx) => { setSelectedChapterIndex(idx); setCurrentMoveIndex(0); }}
                  onDownloadPgn={downloadPgn}
                  canExportPgn={canExportCurrentStudy}
                  onCopyText={copyToClipboard}
                  studyEvents={studyEvents}
                  studentsData={students}
                  isAdminView={auth?.role === 'admin' || auth?.role === 'coach'}
                  onRefreshEvents={refreshStudyEvents}
                  onSendLiveNote={sendLiveNoteFromBottom}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Engine Analysis + Move Tree + Mini Board ──────────── */}
        <div className={`${mobilePanel === 'right' ? 'flex' : 'hidden'} xl:flex w-full xl:w-80 shrink-0 flex-col min-h-0 rounded-sm bg-[#0f172a] border border-white/5 overflow-hidden shadow-2xl ${mobilePanel === 'right' ? 'fixed inset-x-0 top-12 bottom-14 z-40 xl:relative xl:top-auto xl:z-auto xl:inset-auto' : ''}`}>
          {/* Engine Analysis Panel — sabit üst bölüm */}
          <div className="shrink-0">
          <EngineAnalysis
            fen={effectiveFen}
            boardOrientation={boardOrientation}
            enabled={
              boardSettings.showEngineAnalysis
              || boardSettings.showEvalBar
              || boardSettings.showBestMoveArrows
              || boardSettings.showVariationArrows
            }
            onToggle={() => toggleBoardSetting('showEngineAnalysis')}
            onEvalScoreChange={boardSettings.showEvalBar ? setEvalScore : undefined}
            boardSettings={{
              showEvalBar: boardSettings.showEvalBar,
              onToggleEvalBar: () => toggleBoardSetting('showEvalBar'),
              showEngineHint: boardSettings.showEngineAnalysis,
              onToggleEngineHint: () => toggleBoardSetting('showEngineAnalysis'),
              practiceMode,
              onTogglePracticeMode: () => {
                const n = !practiceMode;
                setPracticeMode(n);
                if (n) {
                  setCurrentMoveIndex(0);
                  setPracticeFeedback(null);
                  const ch = selectedChapter;
                  const isPuzzle = ch?.lessonMode === 'interactive' && (ch.interactiveType ?? 'puzzle') === 'puzzle';
                  const norm = isPuzzle && ch ? normalizeStudyChapterPuzzle(ch) : null;
                  setPracticeFen(norm?.startFen ?? ch?.fen ?? DEFAULT_FEN);
                  setPracticePly(0);
                } else {
                  setPracticeFen(null);
                  setPracticePly(0);
                }
              },
              onFlipBoard: flipBoard,
              onOpenBoardBuilder: openBoardBuilder,
              drawingEnabled: drawingTool !== 'mouse',
              onToggleDrawing: () => setDrawingTool(t => t === 'arrow' ? 'mouse' : 'arrow'),
              onOpenMultiboard: () => setBottomTab('multiboard'),
              onOpenShare: () => setBottomTab('share'),
              onDownloadPgn: downloadPgn,
              canDownloadPgn: canExportCurrentStudy,
              studentPlaysColor: selectedStudy?.studentPlaysColor ?? 'both',
              onStudentPlaysColorChange: (value) => updateStudy({ studentPlaysColor: value }),
            }}
            onHoverMove={setEngineHoverMove}
            onPvMoveClick={applyEnginePvLine}
            onTopMoveUpdate={setEngineTopMove}
            onOpenBoardPrefs={() => setShowStudyBoardSettings(true)}
          />
          </div>
          
          {viewingStudentId && (
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-orange-500 text-white px-3 py-1.5 rounded-full font-black text-[10px] uppercase tracking-widest shadow-xl shadow-orange-500/40 animate-pulse border border-white/20">
              <Eye className="w-3 h-3" />
              CANLI İZLENİYOR
            </div>
          )}

          {/* Right Panel: Student Info & Move Tree */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-[#0f172a] rounded-xl border border-white/5 shadow-2xl relative">
            {viewingStudentId && (
              <div className="shrink-0 p-4 bg-indigo-500/10 border-b border-indigo-500/20 animate-in slide-in-from-top duration-300">
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-200 font-black text-sm shadow-inner shadow-indigo-950/50">
                      {viewingStudent?.name?.[0] || 'Ö'}
                    </div>
                    <span className={`absolute -right-1 -bottom-1 w-3.5 h-3.5 rounded-full border-2 border-[#18203a] ${viewingStudentPresence?.gameOver ? 'bg-emerald-400' : viewingStudentPresence?.vcThinking ? 'bg-amber-400 animate-pulse' : 'bg-indigo-400 animate-pulse'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest leading-none">İZLENEN ÖĞRENCİ</span>
                      <span className="text-[9px] font-black text-white/70 bg-white/10 border border-white/10 px-2 py-0.5 rounded-full uppercase tracking-tight">
                        {viewingStudentStatusLabel}
                      </span>
                    </div>
                    <p className="text-sm font-black text-white truncate">
                      {viewingStudent?.name || 'Öğrenci'}
                    </p>
                    {viewingStudentPresence?.vsComputer && (
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">
                        {viewingStudentVcHistory.length} hamle · {viewingStudentMovePairs.length} sıra
                      </p>
                    )}
                  </div>
                  <button 
                    onClick={() => setViewingStudentId(null)}
                    className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all group"
                    title="İzlemeyi Durdur"
                  >
                    <X className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                  </button>
                </div>
              </div>
            )}
            
            {!viewingStudentId && selectedChapter?.lessonMode === 'interactive' && selectedChapter?.interactiveType === 'vsComputer' && (
              <div className="p-4 border-b border-white/5 bg-orange-500/5 animate-in slide-in-from-top duration-300">
                 <div className="flex items-center gap-2 mb-3">
                   <Users className="w-3.5 h-3.5 text-orange-500" />
                   <p className="text-[10px] font-black text-orange-500/80 uppercase tracking-widest">Oynayan Öğrenciler</p>
                 </div>
                 <div className="space-y-2">
                   {members.filter(m => m.kind === 'student').map(m => {
                     const p = formatPresence(presenceByUserId[String(m.id)]);
                     if (!p?.vsComputer) return null;
                     return (
                       <button 
                         key={m.id}
                         onClick={() => setViewingStudentId(m.id)}
                         className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-orange-500/10 hover:border-orange-500/20 transition-all text-left group shadow-lg"
                       >
                         <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-xs shadow-inner">
                           {m.name.charAt(0)}
                         </div>
                         <div className="flex-1 min-w-0">
                           <p className="text-xs font-bold text-slate-300 truncate group-hover:text-white transition-colors">{m.name}</p>
                           <p className="text-[9px] text-slate-500 uppercase font-black tracking-tighter">{p.vcHistory.length} hamle yapıldı</p>
                         </div>
                         <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white text-slate-600 transition-all">
                           <Eye className="w-3.5 h-3.5" />
                         </div>
                       </button>
                     );
                   })}
                   {members.filter(m => m.kind === 'student' && formatPresence(presenceByUserId[String(m.id)])?.vsComputer).length === 0 && (
                     <div className="py-8 px-4 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center gap-2 opacity-40">
                        <Users className="w-6 h-6 text-slate-600" />
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-center">Şu an bu bölümü oynayan öğrenci yok</p>
                     </div>
                   )}
                 </div>
              </div>
            )}
            
            {/* Move Tree or Student vsComputer History */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              {viewingStudentPresence?.vsComputer ? (
                <div className="flex-1 overflow-hidden flex flex-col p-4 bg-[#1e293b]/50">
                  {isViewingStudentGameOver && (
                    <div className="mb-4 bg-emerald-500/20 border border-emerald-500/50 rounded-lg p-3 text-center shadow-lg">
                      <span className="text-emerald-400 font-bold text-sm tracking-wide">Oyun Bitti!</span>
                      <p className="text-[10px] text-emerald-500/70 mt-1">Stockfish analizleri artık aktif.</p>
                    </div>
                  )}

                  <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Hamle Geçmişi</div>
                      <div className="text-[10px] font-bold text-indigo-400/70 bg-indigo-500/10 px-2 py-0.5 rounded-full uppercase tracking-tighter">Bilgisayara Karşı</div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar" onMouseLeave={() => setHoverState(null)}>
                      <ResponsiveTable minWidth={280}>
                      <table className="w-full text-xs text-slate-300 border-separate border-spacing-y-1">
                        <thead>
                          <tr className="text-[9px] text-slate-600 uppercase tracking-[0.1em] font-black">
                            <th className="w-8 text-left pb-1 pl-2">#</th>
                            <th className="text-left pb-1">BEYAZ</th>
                            <th className="text-left pb-1">SİYAH</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: Math.ceil(viewingStudentVcHistory.length / 2) }).map((_, i) => (
                            <tr key={i} className="group transition-all">
                              <td data-label="#" className="py-2.5 pl-2 text-slate-600 font-bold bg-white/[0.02] rounded-l-lg group-hover:text-slate-400 transition-colors">{i + 1}.</td>
                              <td
                                data-label="BEYAZ"
                                className="py-2.5 px-2 font-bold text-slate-200 bg-white/[0.02] group-hover:bg-white/[0.04] transition-colors"
                                onMouseEnter={() => {
                                  const plyIdx = i * 2;
                                  const fen = viewingStudentVcPreviewFens[plyIdx];
                                  setHoverState(fen ? { active: true, fen } : null);
                                }}
                              >
                                {viewingStudentVcHistory[i * 2] || ''}
                              </td>
                              <td
                                data-label="SİYAH"
                                className="py-2.5 px-2 font-bold text-indigo-400 bg-white/[0.02] rounded-r-lg group-hover:bg-white/[0.04] transition-colors"
                                onMouseEnter={() => {
                                  const plyIdx = i * 2 + 1;
                                  const fen = viewingStudentVcPreviewFens[plyIdx];
                                  setHoverState(fen ? { active: true, fen } : null);
                                }}
                              >
                                {viewingStudentVcHistory[i * 2 + 1] || ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </ResponsiveTable>
                      
                      {viewingStudentVcHistory.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 opacity-30 grayscale pointer-events-none">
                          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
                            <MousePointer2 className="w-6 h-6 text-slate-400" />
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Henüz hamle yapılmadı</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <StudyMoveTree
                  chapter={viewingStudentChapter || moveListChapter || selectedChapterRaw || selectedChapter}
                  currentMoveIndex={viewingStudentId && viewingStudentPresence?.vsComputer ? viewingStudentVcHistory.length : currentMoveIndex}
                  currentVariation={viewingStudentId ? null : currentVariation}
                  inlineNotation={boardSettings.inlineNotation}
                  figurineNotation={boardSettings.figurineNotation}
                  showMoveAnnotations={boardSettings.showMoveAnnotations}
                  tree={viewingStudentId ? null : effectiveStudyTree}
                  currentPath={viewingStudentId ? undefined : effectiveStudyPath}
                  onSelectPath={viewingStudentId ? undefined : (path) => { void jumpToNodePath(path); }}
                  onSelectMove={(idx, varData) => {
                    if (varData) {
                      setCurrentVariation(varData);
                      setSelectedAnnotationPly(varData[2]);
                      void jumpToVariation(varData[0], varData[1], varData[2]);
                    } else {
                      setSelectedAnnotationPly(Math.max(0, idx - 1));
                      setCurrentMoveIndex(idx);
                      setCurrentVariation(null);
                      void jumpToMoveIndex(idx);
                    }
                    setOptionSquares({});
                    setMoveFrom(null);
                  }}
                  onHoverMove={(ply, v) => {
                    if (isDraggingPiece) return;
                    setHoverState(ply !== null ? (v ? { active: true, var: v } : { active: true, ply }) : null);
                  }}
                  onDeleteFromHere={async (idx, varInfo) => {
                    if (!selectedStudy || !selectedChapter) return;

                    if (varInfo) {
                      const [mlp, vgi, vmi] = varInfo;
                      const pack = await truncateVariationFromMove(mlp, vgi, vmi);
                      applyTreeExportToChapter(pack);
                      if (
                        currentVariation &&
                        currentVariation[0] === mlp &&
                        currentVariation[1] === vgi &&
                        currentVariation[2] >= vmi
                      ) {
                        setCurrentVariation(null);
                      }
                      return;
                    }

                    const baseMoves = chapterMovesForUi;
                    const newComments = { ...selectedChapter.moveComments };
                    const newAnnotations = { ...selectedChapter.moveAnnotations };
                    for (let k = idx; k < baseMoves.length; k++) {
                      delete newComments[k];
                      delete newAnnotations[k];
                    }

                    const newMoveIndex = Math.min(currentMoveIndex, idx);

                    const tree = effectiveStudyTree?.mainline;
                    let pack = null as Awaited<ReturnType<typeof truncateMainlineFromMoveIndex>>;
                    if (tree && tree.length > idx + 1) {
                      pack = await truncateMainlineFromMoveIndex(idx);
                    }

                    if (pack) {
                      applyTreeExportToChapter(pack, {
                        moveComments: newComments,
                        moveAnnotations: newAnnotations,
                      });
                    } else {
                      const newMoves = baseMoves.slice(0, idx);
                      const newVars = { ...(selectedChapter.variations ?? {}) };
                      for (let k = idx; k < baseMoves.length; k++) delete newVars[k];
                      updateChapterAtIndex(selectedChapterIndex, {
                        moves: newMoves,
                        moveComments: newComments,
                        moveAnnotations: newAnnotations,
                        variations: newVars,
                      });
                    }

                    setCurrentVariation(null);
                    setCurrentMoveIndex(newMoveIndex);
                    setSelectedAnnotationPly(Math.max(0, newMoveIndex - 1));
                    void jumpToMoveIndex(newMoveIndex, pack?.exported.moves ?? baseMoves.slice(0, idx));
                  }}
                  onDeleteFromNode={async (nodeId) => {
                    if (!selectedStudy || !selectedChapter) return;
                    const pack = await truncateFromNodeId(nodeId);
                    applyTreeExportToChapter(pack);
                  }}
                  onPromoteBranch={async (branchNodeId) => {
                    if (!selectedStudy || !selectedChapter) return;
                    const pack = await promoteBranchNodeId(branchNodeId);
                    applyTreeExportToChapter(pack);
                  }}
                  onPromoteVariation={async (mlp, vgi) => {
                    if (!selectedStudy || !selectedChapter) return;
                    const baseMoves = chapterMovesForUi;
                    const baseVars = mergeVariationRecords(
                      selectedChapterRaw?.variations ?? {},
                      moveListChapter?.variations ?? selectedChapter.variations ?? {},
                    );
                    const promoted = promoteVariationLines(
                      baseMoves,
                      baseVars,
                      mlp,
                      vgi,
                      selectedChapter.fen || selectedChapterRaw?.fen,
                    );
                    if (!promoted) {
                      showToast('Varyasyon ana hatta yükseltilemedi.', 'warning');
                      return;
                    }

                    updateChapterAtIndex(selectedChapterIndex, {
                      moves: promoted.moves,
                      variations: promoted.variations,
                    });

                    setCurrentVariation(null);
                    setCurrentMoveIndex(promoted.nextMoveIndex);
                    setSelectedAnnotationPly(Math.max(0, promoted.nextMoveIndex - 1));

                    if (syncState?.tree) {
                      alignMainlineToMoves(promoted.moves, promoted.nextMoveIndex);
                    }
                    void jumpToMoveIndex(promoted.nextMoveIndex, promoted.moves);

                    if (syncState?.tree?.mainline && syncState.tree.mainline.length > 1 && write) {
                      void promoteVariation(mlp, vgi);
                    }
                  }}
                />
              )}
            </div>
          </div>

          {/* Next Chapter Button */}
          <div className="p-3 border-t border-white/5 bg-[#0f172a] shrink-0">
            <button
              type="button"
              onClick={goNextChapter}
              disabled={selectedChapterIndex >= (selectedStudy.chapters.length - 1)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl premium-gradient disabled:opacity-30 disabled:grayscale text-white text-xs font-extrabold uppercase tracking-widest transition-all active:scale-[0.95] shadow-lg shadow-indigo-500/20"
            >
              Sonraki bölüm <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobil: alt panel geçişi */}
        <nav
          className="xl:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-white/10 bg-[#0f172a]/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
          aria-label="Çalışma panelleri"
        >
          {([
            { id: 'left' as const, label: 'Bölümler', Icon: BookMarked },
            { id: 'board' as const, label: 'Tahta', Icon: MousePointer2 },
            { id: 'right' as const, label: 'Analiz', Icon: BarChart2 },
          ]).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMobilePanel(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[52px] py-2 text-[10px] font-bold uppercase tracking-wide transition-colors active:scale-[0.98] ${
                mobilePanel === id ? 'text-indigo-300 bg-indigo-500/15' : 'text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── MODALS ── */}

      {/* New Chapter modal */}
      {showNewChapterModal && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setShowNewChapterModal(false)}>
          <div className="bg-[#15181c] border border-white/5 rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.8)] w-full max-w-xl max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
              <h3 className="font-black text-white text-xl uppercase tracking-tighter flex items-center gap-2">
                Yeni bölüm
                <Info className="w-4 h-4 text-slate-600" />
              </h3>
              <button type="button" onClick={() => setShowNewChapterModal(false)} className="p-2 text-slate-500 hover:text-white rounded-xl hover:bg-white/5 transition-all"><X className="w-6 h-6" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
              {/* İsim */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">İsim</label>
                <input
                  type="text"
                  value={ncName}
                  onChange={e => setNcName(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white font-bold focus:ring-2 focus:ring-teal-500/50 outline-none"
                  placeholder="Bölüm adı..."
                />
              </div>

              {/* Tabs */}
              <div className="flex border-b border-white/5 overflow-x-auto">
                {([
                  ['empty', 'Boş'],
                  ['editor', 'Editör'],
                  ['fen', 'FEN / PGN'],
                  ['vision', 'Görsel / PDF'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setNcTab(key)}
                    className={`px-5 py-3 text-[11px] font-bold uppercase tracking-wider transition-all relative ${
                      ncTab === key ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {label}
                    {ncTab === key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {ncTab === 'editor' && (
                <div className="space-y-3">
                  {/* Piece palette top (black) */}
                  <div className="flex items-center gap-1 bg-slate-900/80 rounded-xl p-2 border border-white/5">
                    {['bK','bQ','bR','bB','bN','bP'].map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNcEditorTool(ncEditorTool === p ? null : p)}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${ncEditorTool === p ? 'bg-teal-500/30 ring-2 ring-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.3)]' : 'hover:bg-white/10'}`}
                      >
                        <img src={LICHESS_PIECE(p)} alt={p} className="w-7 h-7" />
                      </button>
                    ))}
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => setNcEditorTool(ncEditorTool === 'trash' ? null : 'trash')}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${ncEditorTool === 'trash' ? 'bg-rose-500/30 ring-2 ring-rose-500' : 'hover:bg-white/10'}`}
                      title="Taş sil"
                    >
                      <Trash2 className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Board */}
                    <ChessBoardFrame
                      boardOrientation={ncOrientation}
                      className="w-full max-w-[min(100%,280px)] mx-auto sm:mx-0 shrink-0 rounded-xl overflow-hidden border border-white/5 shadow-xl cursor-crosshair"
                      boardClassName="overflow-hidden"
                    >
                      <div className="absolute inset-0">
                      <Chessboard
                        options={{
                          position: ncFen,
                          boardOrientation: ncOrientation,
                          darkSquareStyle: { backgroundColor: '#5d768e' },
                          lightSquareStyle: { backgroundColor: '#c1c9d2' },
                          ...CHESSBOARD_ANIMATION,
                          ...CHESSBOARD_NO_NOTATION,
                          showAnimations: false,
                          animationDurationInMs: 0,
                          onSquareClick: (arg: unknown) => {
                            const square = pickSquare(arg);
                            if (square) applyNcEditorAtSquare(square);
                          },
                          onPieceClick: (arg: unknown) => {
                            const p = arg as { isSparePiece?: boolean; square?: string } | null;
                            if (!p?.square || p.isSparePiece) return;
                            applyNcEditorAtSquare(p.square);
                          },
                          onSquareRightClick: (arg: unknown) => {
                            const sq = pickSquare(arg);
                            if (!sq) return;
                            setNcFen((prev) => {
                              const game = makeBuilderGame(prev);
                              const piece = game.get(sq as Square);
                              if (!piece) return prev;
                              game.remove(sq as any);
                              const newColor = piece.color === 'w' ? 'b' : 'w';
                              const pt = String(piece.type).toLowerCase();
                              if (!/[pnbrqk]/.test(pt)) return prev;
                              try {
                                game.put({ type: pt as 'p' | 'n' | 'b' | 'r' | 'q' | 'k', color: newColor }, sq as any);
                                return game.fen();
                              } catch {
                                return prev;
                              }
                            });
                          },
                          onPieceDrop: (args: unknown) => {
                            const a = args as { piece?: unknown; sourceSquare?: string; targetSquare?: string | null } | null;
                            const sourceSquare = a?.sourceSquare;
                            const targetSquare = a?.targetSquare;
                            if (!sourceSquare || !targetSquare) return false;
                            const parsed = parsePieceFromChessboardDrag(a?.piece);
                            if (!parsed) return false;
                            setNcFen((prev) => {
                              const game = makeBuilderGame(prev);
                              game.remove(sourceSquare as any);
                              game.remove(targetSquare as any);
                              game.put({ type: parsed.type, color: parsed.color }, targetSquare as any);
                              return game.fen();
                            });
                            return true;
                          },
                        }}
                      />
                      </div>
                    </ChessBoardFrame>

                    {/* Side controls */}
                    <div className="flex-1 space-y-3 text-xs">
                      <select
                        value={ncTurn}
                        onChange={e => { const t = e.target.value as 'w' | 'b'; setNcTurn(t); ncUpdateFenMeta(t, ncCastling); }}
                        className="w-full bg-slate-900 border border-white/5 rounded-xl px-3 py-2.5 text-white text-xs outline-none focus:border-teal-500/50"
                      >
                        <option value="w">Hamle Beyazda</option>
                        <option value="b">Hamle Siyahta</option>
                      </select>

                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Rok Atma</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { key: 'K' as const, label: 'Beyaz O-O' },
                            { key: 'Q' as const, label: 'O-O-O' },
                            { key: 'k' as const, label: 'Siyah O-O' },
                            { key: 'q' as const, label: 'O-O-O' },
                          ].map(({ key, label }) => (
                            <label key={key} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={ncCastling[key]}
                                onChange={e => {
                                  const next = { ...ncCastling, [key]: e.target.checked };
                                  setNcCastling(next);
                                  ncUpdateFenMeta(ncTurn, next);
                                }}
                                className="accent-teal-500 w-3.5 h-3.5"
                              />
                              <span className="text-[10px]">{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="pt-1 space-y-1">
                        <button
                          type="button"
                          onClick={() => setNcFen(DEFAULT_FEN)}
                          className="w-full text-left text-teal-400 hover:text-teal-300 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors"
                        >
                          Başlangıç konumu
                        </button>
                        <button
                          type="button"
                          onClick={() => setNcFen('8/8/8/8/8/8/8/8 w - - 0 1')}
                          className="w-full text-left text-slate-500 hover:text-rose-400 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors"
                        >
                          Tahtayı temizle
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Piece palette bottom (white) */}
                  <div className="flex items-center gap-1 bg-slate-900/80 rounded-xl p-2 border border-white/5">
                    {['wK','wQ','wR','wB','wN','wP'].map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNcEditorTool(ncEditorTool === p ? null : p)}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${ncEditorTool === p ? 'bg-teal-500/30 ring-2 ring-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.3)]' : 'hover:bg-white/10'}`}
                      >
                        <img src={LICHESS_PIECE(p)} alt={p} className="w-7 h-7" />
                      </button>
                    ))}
                  </div>

                  {ncEditorTool && ncEditorTool !== 'cursor' && (
                    <p className="text-[10px] text-teal-400/70 text-center">
                      {ncEditorTool === 'trash' ? 'Silmek için kareye tıklayın' : 'Yerleştirmek için kareye tıklayın'}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-500 text-center">
                    Araç seçili değilken: dolu kareye sol tık taşı siler · sağ tık beyaz ↔ siyah çevirir
                  </p>
                </div>
              )}

              {ncTab === 'fen' && (
                <div className="space-y-3">
                  <input
                    ref={ncFenFileRef}
                    type="file"
                    accept=".pgn,.fen,.txt,text/plain"
                    className="hidden"
                    onChange={handleNcFenFile}
                  />
                  <button
                    type="button"
                    onClick={() => ncFenFileRef.current?.click()}
                    className="w-full py-3 rounded-xl border border-dashed border-white/15 bg-white/[0.03] text-slate-300 text-xs font-bold hover:border-amber-500/35 hover:bg-amber-500/5 hover:text-amber-200 transition-all flex items-center justify-center gap-2"
                  >
                    <Upload className="w-4 h-4 shrink-0" />
                    PGN / FEN dosyası seç
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[10px] text-slate-500 font-medium shrink-0">veya yapıştır</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                  <textarea
                    value={ncFenInput}
                    onChange={e => setNcFenInput(e.target.value)}
                    rows={5}
                    className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-3 text-white font-mono text-xs outline-none focus:ring-2 focus:ring-teal-500/50 resize-none custom-scrollbar"
                    placeholder={"FEN veya PGN yapıştırın...\n\nÖrnek FEN:\nrnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\n\nÖrnek PGN:\n1. e4 e5 2. Nf3 Nc6 3. Bb5"}
                  />
                  {ncFenInput.trim() && (() => {
                    const txt = ncFenInput.trim();
                    const isPgn = txt.includes('1.') || txt.includes('1 ') || txt.includes('[Event');
                    if (isPgn) {
                      try {
                        const g = new Chess();
                        const fenMatch = txt.match(/\[FEN\s+"([^"]+)"\]/i);
                        if (fenMatch) try { g.load(fenMatch[1]); } catch {}
                        g.loadPgn(txt);
                        const h = g.history();
                        return <p className="text-teal-400 text-[10px]">PGN algılandı — {h.length} hamle</p>;
                      } catch { return <p className="text-rose-400 text-[10px]">Geçersiz PGN</p>; }
                    }
                    try { new Chess(txt); return <p className="text-teal-400 text-[10px]">Geçerli FEN</p>; }
                    catch { return <p className="text-rose-400 text-[10px]">Geçersiz FEN</p>; }
                  })()}
                </div>
              )}

              {ncTab === 'empty' && (
                <div className="flex items-center justify-center py-6">
                  <p className="text-slate-500 text-xs">Standart başlangıç pozisyonuyla boş bölüm oluşturulacak.</p>
                </div>
              )}

              {ncTab === 'vision' && (
                <div className="space-y-3">
                  <input
                    ref={studyVisionFileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleStudyVisionFile}
                    className="hidden"
                  />
                  {!studyVisionImageData && studyVisionPdfPages.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => studyVisionFileInputRef.current?.click()}
                      disabled={studyVisionUploadBusy}
                      className="w-full px-4 py-4 bg-slate-800/60 border border-dashed border-white/10 rounded-xl text-slate-400 hover:border-teal-500/40 hover:bg-slate-800/90 hover:text-slate-300 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {studyVisionUploadBusy ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <FileImage className="w-5 h-5" />
                      )}
                      <span className="text-xs font-bold">
                        {studyVisionUploadBusy ? 'İşleniyor…' : 'Görsel veya PDF seçin (FEN çıkarır)'}
                      </span>
                    </button>
                  ) : (
                    <div className="space-y-3">
                      {studyVisionPdfPages.length > 1 ? (
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">PDF sayfası</p>
                          <div className="flex flex-wrap gap-2">
                            {studyVisionPdfPages.map((_, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setStudyVisionPdfPage(i)}
                                className={`min-w-[4rem] py-2 px-3 rounded-lg text-xs font-bold transition-colors ${
                                  studyVisionPdfPage === i
                                    ? 'bg-teal-600 text-white'
                                    : 'bg-slate-800/80 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                                }`}
                              >
                                Sayfa {i + 1}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {studyVisionPreviewUrl ? (
                        <div
                          className="relative inline-block rounded-lg overflow-hidden border border-white/10 bg-slate-800/50 max-w-full cursor-pointer"
                          title="Çift tık: diyagramı tahtaya yükle"
                          onDoubleClick={() => {
                            if (studyVisionBoards && studyVisionBoards.length > 0) {
                              const board = studyVisionBoards[studyVisionBoardIdx] ?? studyVisionBoards[0];
                              applyStudyVisionBoard(board);
                            } else {
                              void extractStudyVisionFen();
                            }
                          }}
                        >
                          <img
                            src={studyVisionPreviewUrl}
                            alt="Yüklenecek görsel"
                            className="max-h-40 object-contain pointer-events-none"
                          />
                          <button
                            type="button"
                            onClick={clearStudyVisionUpload}
                            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-rose-500/80 rounded text-white transition-colors"
                            aria-label="Seçimi temizle"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : null}
                      {studyVisionBoards && studyVisionBoards.length > 1 && (
                        <div className="space-y-3">
                          <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">
                            {studyVisionBoards.length} tahta bulundu — tek bölüm veya hepsini ekleyin
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {studyVisionBoards.map((_, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setStudyVisionBoardIdx(i)}
                                className={`min-w-[4rem] py-2 px-3 rounded-lg text-xs font-bold transition-colors ${
                                  studyVisionBoardIdx === i
                                    ? 'bg-teal-600 text-white'
                                    : 'bg-slate-800/80 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                                }`}
                              >
                                Tahta {i + 1}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={createChaptersFromVisionBoards}
                            className="w-full py-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 text-xs font-bold transition-all"
                          >
                            Tüm tahtaları bölüm olarak ekle ({studyVisionBoards.length})
                          </button>
                        </div>
                      )}
                      {studyVisionError ? <p className="text-rose-400 text-xs">{studyVisionError}</p> : null}
                      <p className="text-[10px] text-slate-500 mt-2">Görsele çift tıklayarak diyagramı tahtaya yükleyebilirsiniz.</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void extractStudyVisionFen()}
                          disabled={studyVisionExtractBusy}
                          className="bg-teal-600 hover:bg-teal-500 text-white px-5 py-2.5 rounded-lg font-bold text-xs shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                          {studyVisionExtractBusy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )}
                          {studyVisionExtractBusy
                            ? 'FEN çıkarılıyor…'
                            : studyVisionBoards && studyVisionBoards.length > 1
                              ? 'Seçileni yükle'
                              : 'FEN çıkar ve yükle'}
                        </button>
                        <button
                          type="button"
                          onClick={clearStudyVisionUpload}
                          className="px-4 py-2.5 rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 text-xs font-bold"
                        >
                          Temizle
                        </button>
                      </div>
                    </div>
                  )}
                  {ncFen !== DEFAULT_FEN && (
                    <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-3">
                      <p className="text-[10px] font-bold text-teal-400 uppercase tracking-widest mb-2">Yüklenen pozisyon</p>
                      <ChessBoardFrame boardOrientation={ncOrientation} className="w-full max-w-[10rem] rounded-lg overflow-hidden border border-white/10" boardClassName="overflow-hidden">
                        <div className="absolute inset-0">
                        <Chessboard
                          options={{
                            position: ncFen,
                            boardOrientation: ncOrientation,
                            arePiecesDraggable: false,
                            allowDragging: false,
                            darkSquareStyle: { backgroundColor: '#5d768e' },
                            lightSquareStyle: { backgroundColor: '#c1c9d2' },
                            ...CHESSBOARD_NO_NOTATION,
                          }}
                        />
                        </div>
                      </ChessBoardFrame>
                    </div>
                  )}
                </div>
              )}

              {/* Varyant + Tahta yönü */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Varyant</label>
                  <select className="w-full bg-slate-900 border border-white/5 rounded-xl px-3 py-2.5 text-white text-sm outline-none">
                    <option value="standard">Standard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Tahta yönü</label>
                  <select
                    value={ncOrientation}
                    onChange={e => setNcOrientation(e.target.value as any)}
                    className="w-full bg-slate-900 border border-white/5 rounded-xl px-3 py-2.5 text-white text-sm outline-none"
                  >
                    <option value="white">Beyaz</option>
                    <option value="black">Siyah</option>
                  </select>
                </div>
              </div>

              {/* Analiz modu */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Analiz modu</label>
                <select
                  value={ncMode}
                  onChange={e => setNcMode(e.target.value as any)}
                  className="w-full bg-slate-900 border border-white/5 rounded-xl px-3 py-2.5 text-white text-sm outline-none"
                >
                  <option value="normal">Normal analiz</option>
                  <option value="practice">Bilgisayar ile pratik yapın</option>
                  <option value="interactive">Etkileşimli ders</option>
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-white/5 bg-black/20 flex justify-end">
              <button
                type="button"
                onClick={createChapterFromModal}
                className="px-8 py-3 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-black font-black rounded-xl transition-all text-xs uppercase tracking-widest shadow-xl shadow-amber-500/20 active:scale-95"
              >
                BÖLÜM OLUŞTUR
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {studySettingsModal}

      {/* Chapter edit modal */}
      {editingChapterId && chapterDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in" onClick={() => setEditingChapterId(null)}>
          <div className="bg-[#15181c] border border-white/10 rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.8)] w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
              <h3 className="font-black text-white text-xl uppercase tracking-tighter">Bölümü Düzenle</h3>
              <button type="button" onClick={() => setEditingChapterId(null)} className="p-2 text-slate-500 hover:text-white rounded-xl hover:bg-white/5 transition-all"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Bölüm Başlığı</label>
                <input type="text" value={chapterDraft.title} onChange={e => setChapterDraft(d => d ? { ...d, title: e.target.value } : d)} className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white font-bold focus:ring-2 focus:ring-teal-500/50 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Sel label="Ders Modu" value={chapterDraft.lessonMode} onChange={v => setChapterDraft(d => d ? { ...d, lessonMode: v as any } : d)} options={[['direct', 'Ders (Okuma)'], ['interactive', 'Etkileşimli (VS)']]} />
                <Sel label="Açılış Yönü" value={chapterDraft.orientation} onChange={v => setChapterDraft(d => d ? { ...d, orientation: v as any } : d)} options={[['white', 'Beyaz'], ['black', 'Siyah']]} />
              </div>

              {chapterDraft.lessonMode === 'interactive' && (
                <div className="p-4 bg-teal-500/5 border border-teal-500/20 rounded-2xl space-y-4 animate-in slide-in-from-top-2">
                  <Sel label="Etkileşim Tipi" value={chapterDraft.interactiveType} onChange={v => setChapterDraft(d => d ? { ...d, interactiveType: v as any, difficulty: v === 'vsComputer' ? 10 : d.difficulty } : d)} options={[['puzzle', 'Bulmaca (Hamle Bul)'], ['liveAnalysis', 'Canlı Analiz'], ['vsComputer', 'Bilgisayara Karşı Antrenman']]} />
                  {chapterDraft.interactiveType === 'vsComputer' ? (
                    <p className="text-[11px] text-teal-300/80">Bilgisayar karşısında antrenman en yüksek seviyede başlar.</p>
                  ) : null}
                  {(chapterDraft.interactiveType ?? 'puzzle') === 'puzzle' ? (
                  <div>
                    <label className="block text-[10px] font-bold text-teal-400/70 uppercase tracking-widest mb-1.5">İpucu (Hint)</label>
                    <input type="text" value={chapterDraft.moveHint} onChange={e => setChapterDraft(d => d ? { ...d, moveHint: e.target.value } : d)} className="w-full bg-slate-900 border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none" placeholder="Sıkışan öğrenciye gösterilecek mesaj..." />
                  </div>
                  ) : null}
                </div>
              )}

              <div className="pt-4 border-t border-white/5">
                <button type="button" onClick={() => setShowPgnImport(v => !v)}
                  className="flex items-center gap-2 text-xs text-teal-400 hover:text-teal-300 font-bold mb-3 uppercase tracking-widest">
                  <FileText className="w-4 h-4" />
                  {showPgnImport ? "PGN KAPAT" : "PGN İLE DOLDUR"}
                </button>
                {showPgnImport && (
                  <div className="space-y-3 p-3 bg-black/40 rounded-2xl border border-white/5">
                    <textarea
                      rows={4}
                      value={pgnImportText}
                      onChange={e => setPgnImportText(e.target.value)}
                      placeholder="PGN metnini yapıştırın..."
                      className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-3 text-[11px] text-slate-300 font-mono focus:ring-1 focus:ring-teal-500/50 outline-none resize-none"
                    />
                    <button type="button" onClick={importPgn} className="w-full py-2.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 text-[10px] font-black rounded-xl border border-teal-500/20 transition-all">FEN VE HAMLELERİ AKTAR</button>
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-white/5 bg-black/20 flex items-center justify-between">
              <button type="button" onClick={() => deleteChapter(editingChapterId)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-rose-500 hover:bg-rose-500/10 font-bold text-xs"><Trash2 className="w-4 h-4" /> SİL</button>
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditingChapterId(null)} className="px-6 py-2.5 rounded-xl text-slate-400 font-bold text-sm hover:text-white transition-colors">İPTAL</button>
                <button type="button" onClick={saveChapterEdit} className="px-8 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-black text-sm shadow-lg shadow-teal-500/20 active:scale-95">KAYDET</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add member modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in" onClick={() => setShowAddMember(false)}>
          <div className="bg-[#15181c] border border-white/10 rounded-3xl shadow-3xl w-full max-w-sm overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-white/5 bg-slate-900/50 flex items-center justify-between">
              <h3 className="font-black text-white text-lg uppercase tracking-tight">Üye Ekle</h3>
              <button type="button" onClick={() => setShowAddMember(false)} className="text-slate-500 hover:text-white"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-2 max-h-80 overflow-y-auto custom-scrollbar space-y-4">
              {availableCoachesToAdd.length > 0 ? (
                <div>
                  <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-widest text-amber-400/80">Antrenörler</p>
                  {availableCoachesToAdd.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => addMember(toCoachMemberId(String(c.id)))}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-amber-500/10 group transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center font-black text-amber-300 group-hover:bg-amber-500 group-hover:text-black transition-all">{c.name.charAt(0)}</div>
                      <div className="flex-1"><p className="text-sm font-bold text-white leading-none mb-1">{c.name}</p><p className="text-[10px] text-amber-400/70 font-bold uppercase">Antrenör</p></div>
                      <Plus className="w-4 h-4 text-slate-700 group-hover:text-amber-400" />
                    </button>
                  ))}
                </div>
              ) : null}
              <div>
                <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Öğrenciler</p>
                {availableStudentsToAdd.map(s => (
                  <button key={s.id} type="button" onClick={() => addMember(s.id)} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-teal-500/10 group transition-all text-left">
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-black text-slate-400 group-hover:bg-teal-500 group-hover:text-black transition-all">{s.name.charAt(0)}</div>
                    <div className="flex-1"><p className="text-sm font-bold text-white leading-none mb-1">{s.name}</p><p className="text-[10px] text-slate-600 font-mono">#{s.id}</p></div>
                    <Plus className="w-4 h-4 text-slate-700 group-hover:text-teal-400" />
                  </button>
                ))}
                {availableStudentsToAdd.length === 0 && availableCoachesToAdd.length === 0 && (
                  <p className="text-center py-12 text-[11px] text-slate-600 italic">Eklenebilecek üye kalmadı.</p>
                )}
                {availableStudentsToAdd.length === 0 && availableCoachesToAdd.length > 0 && (
                  <p className="text-center py-4 text-[11px] text-slate-600 italic">Tüm öğrenciler zaten eklendi.</p>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-white/5 bg-black/40">
              <button type="button" onClick={() => setShowAddMember(false)} className="w-full py-3 rounded-xl text-slate-500 hover:text-white font-bold text-xs uppercase tracking-widest transition-all">Vazgeç</button>
            </div>
          </div>
        </div>
      )}

      {/* Board Builder Overlay */}
      {showBoardBuilder && typeof document !== 'undefined' && createPortal((
        <div className="fixed inset-0 z-[9999] bg-[#0d0f12] flex flex-col animate-in fade-in duration-300" onClick={e => e.stopPropagation()}>
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/40 backdrop-blur-xl">
             <div className="flex items-center gap-4">
               <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20"><Settings2 className="w-6 h-6" /></div>
               <h2 className="font-black text-white text-xl uppercase tracking-tighter">Tahta Tasarlayıcı</h2>
             </div>
             <button type="button" onClick={() => setShowBoardBuilder(false)} className="p-3 rounded-2xl bg-white/5 text-slate-500 hover:text-white hover:bg-white/10 transition-all font-bold text-xs flex items-center gap-2 uppercase tracking-widest leading-none shadow-xl border border-white/5"><X className="w-5 h-5" /> KAPAT</button>
          </div>
          <div className="flex-1 flex overflow-hidden">
              <div className="w-72 border-r border-white/5 bg-[#15181c] flex flex-col p-6 gap-8 overflow-y-auto custom-scrollbar">
                 <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">ARAÇLAR</p>
                    <div className="grid grid-cols-2 gap-3">
                       <button type="button" onClick={() => setBuilderTool('cursor')} className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all group ${builderTool === 'cursor' ? 'bg-amber-500 border-amber-500 text-black shadow-xl shadow-amber-500/20' : 'bg-slate-900 border-white/5 text-slate-500 hover:border-white/20'}`}>
                          <MousePointer2 className="w-6 h-6" /><span className="text-[9px] font-black uppercase">SEÇİCİ</span>
                       </button>
                       <button type="button" onClick={() => { setBuilderFen(DEFAULT_FEN); setBuilderFenInput(DEFAULT_FEN); }} className="p-4 rounded-2xl bg-slate-900 border border-white/5 text-slate-500 hover:border-white/20 hover:text-white transition-all flex flex-col items-center gap-2">
                          <SkipBack className="w-6 h-6" /><span className="text-[9px] font-black uppercase">SIFIRLA</span>
                       </button>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">TAŞ PAKETİ</p>
                    <div className="space-y-6">
                       <div className="grid grid-cols-3 gap-3">
                          {['wK','wQ','wR','wB','wN','wP'].map(p => (
                             <button key={p} type="button" onClick={() => setBuilderTool(p)} className={`aspect-square p-2 rounded-2xl border flex items-center justify-center transition-all bg-white/5 ${builderTool === p ? 'border-teal-500 bg-teal-500/10 scale-110 shadow-lg' : 'border-white/5 hover:border-white/20'}`}><img src={LICHESS_PIECE(p)} alt={p} className="w-10 h-10 drop-shadow-md" /></button>
                          ))}
                       </div>
                       <div className="grid grid-cols-3 gap-3">
                          {['bK','bQ','bR','bB','bN','bP'].map(p => (
                             <button key={p} type="button" onClick={() => setBuilderTool(p)} className={`aspect-square p-2 rounded-2xl border flex items-center justify-center transition-all bg-white/5 ${builderTool === p ? 'border-teal-500 bg-teal-500/10 scale-110 shadow-lg' : 'border-white/5 hover:border-white/20'}`}><img src={LICHESS_PIECE(p)} alt={p} className="w-10 h-10 drop-shadow-md" /></button>
                          ))}
                       </div>
                    </div>
                 </div>

                 <div className="mt-auto space-y-4">
                    <button type="button" onClick={() => { setBuilderFen('8/8/8/8/8/8/8/8 w - - 0 1'); setBuilderFenInput('8/8/8/8/8/8/8/8 w - - 0 1'); }} className="w-full py-3.5 rounded-2xl border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 text-[10px] font-black uppercase tracking-widest transition-all">TAHTAYI SİL</button>
                    <button type="button" onClick={applyBoardBuilder} className="w-full py-4 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-black font-black text-xs shadow-2xl shadow-teal-500/20 transition-all uppercase tracking-widest active:scale-95">TASARIMI UYGULA</button>
                 </div>
              </div>

              <div className="flex-1 bg-[#1b1e23]/50 flex flex-col items-center justify-center p-12 overflow-y-auto custom-scrollbar">
                 <div className="w-full max-w-4xl bg-[#15181c] p-12 rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/5">
                    <div className="flex flex-col md:flex-row gap-12 items-center">
                       <div className="w-full max-w-md space-y-3">
                          <div className="grid grid-cols-8 gap-2 bg-black/40 border border-white/10 rounded-2xl p-2">
                            <button
                              type="button"
                              onClick={() => setBuilderTool('cursor')}
                              className={`aspect-square rounded-xl border flex items-center justify-center transition-all ${builderTool === 'cursor' ? 'bg-teal-500/20 border-teal-500/60 text-teal-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                              title="Secici"
                            >
                              <MousePointer2 className="w-5 h-5" />
                            </button>
                            {['bK', 'bQ', 'bR', 'bB', 'bN', 'bP'].map((p) => (
                              <button
                                key={`top-${p}`}
                                type="button"
                                onClick={() => setBuilderTool(p)}
                                className={`aspect-square rounded-xl border flex items-center justify-center transition-all ${builderTool === p ? 'bg-teal-500/20 border-teal-500/60' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                                title={p}
                              >
                                <img src={LICHESS_PIECE(p)} alt={p} className="w-7 h-7 drop-shadow-md" />
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setBuilderTool('trash')}
                              className={`aspect-square rounded-xl border flex items-center justify-center transition-all ${builderTool === 'trash' ? 'bg-rose-500/20 border-rose-500/60 text-rose-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-rose-300'}`}
                              title="Silgi"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>

                          <ChessBoardFrame boardOrientation={boardOrientation} className="rounded-[2rem] overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.6)] border-4 border-white/5 cursor-crosshair relative ring-1 ring-white/10" boardClassName="overflow-hidden">
                          <div className="absolute inset-0">
                          <Chessboard
                            options={{
                              position: builderFen,
                              boardOrientation,
                              darkSquareStyle: { backgroundColor: '#5d768e' },
                              lightSquareStyle: { backgroundColor: '#c1c9d2' },
                              ...CHESSBOARD_ANIMATION,
                              ...CHESSBOARD_NO_NOTATION,
                              showAnimations: false,
                              animationDurationInMs: 0,
                              onSquareClick: (arg: unknown) => {
                                const square = pickSquare(arg);
                                if (square) applyBuilderAtSquare(square);
                              },
                              onPieceClick: (arg: unknown) => {
                                const p = arg as { isSparePiece?: boolean; square?: string } | null;
                                if (!p?.square || p.isSparePiece) return;
                                applyBuilderAtSquare(p.square);
                              },
                              onSquareRightClick: (arg: unknown) => {
                                const square = pickSquare(arg);
                                if (!square) return;
                                setBuilderFen((prev) => {
                                  const game = makeBuilderGame(prev);
                                  const piece = game.get(square as Square);
                                  if (!piece) return prev;
                                  game.remove(square as any);
                                  const newColor = piece.color === 'w' ? 'b' : 'w';
                                  const pt = String(piece.type).toLowerCase();
                                  if (!/[pnbrqk]/.test(pt)) return prev;
                                  try {
                                    game.put({ type: pt as 'p' | 'n' | 'b' | 'r' | 'q' | 'k', color: newColor }, square as any);
                                    return game.fen();
                                  } catch {
                                    return prev;
                                  }
                                });
                              },
                              onPieceDrop: (args: unknown) => {
                                const a = args as { piece?: unknown; sourceSquare?: string; targetSquare?: string | null } | null;
                                const sourceSquare = a?.sourceSquare;
                                const targetSquare = a?.targetSquare;
                                if (!sourceSquare || !targetSquare) return false;
                                const parsed = parsePieceFromChessboardDrag(a?.piece);
                                if (!parsed) return false;
                                setBuilderFen((prev) => {
                                  const game = makeBuilderGame(prev);
                                  game.remove(sourceSquare as any);
                                  game.remove(targetSquare as any);
                                  game.put({ type: parsed.type, color: parsed.color }, targetSquare as any);
                                  return game.fen();
                                });
                                return true;
                              },
                            }}
                          />
                          </div>
                          </ChessBoardFrame>

                          <div className="grid grid-cols-8 gap-2 bg-black/40 border border-white/10 rounded-2xl p-2">
                            <button
                              type="button"
                              onClick={() => setBuilderTool('cursor')}
                              className={`aspect-square rounded-xl border flex items-center justify-center transition-all ${builderTool === 'cursor' ? 'bg-teal-500/20 border-teal-500/60 text-teal-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                              title="Secici"
                            >
                              <MousePointer2 className="w-5 h-5" />
                            </button>
                            {['wK', 'wQ', 'wR', 'wB', 'wN', 'wP'].map((p) => (
                              <button
                                key={`bottom-${p}`}
                                type="button"
                                onClick={() => setBuilderTool(p)}
                                className={`aspect-square rounded-xl border flex items-center justify-center transition-all ${builderTool === p ? 'bg-teal-500/20 border-teal-500/60' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                                title={p}
                              >
                                <img src={LICHESS_PIECE(p)} alt={p} className="w-7 h-7 drop-shadow-md" />
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setBuilderTool('trash')}
                              className={`aspect-square rounded-xl border flex items-center justify-center transition-all ${builderTool === 'trash' ? 'bg-rose-500/20 border-rose-500/60 text-rose-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-rose-300'}`}
                              title="Silgi"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                       </div>

                       <div className="flex-1 space-y-8 w-full">
                          <div className="space-y-4">
                             <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest leading-none">FEN POZİSYONU</p>
                             <div className="flex gap-3">
                                <input type="text" value={builderFenInput} onChange={e => setBuilderFenInput(e.target.value)} className="flex-1 bg-slate-900 border border-white/5 rounded-2xl px-5 py-3.5 text-xs text-slate-300 font-mono focus:ring-2 focus:ring-teal-500/50 outline-none transition-all placeholder:text-slate-700 shadow-inner" placeholder="FEN yapıştır..." />
                                <button type="button" onClick={() => { try { const g = new Chess(builderFenInput); setBuilderFen(g.fen()); } catch { showToast('Hata: Geçersiz FEN', 'error'); } }} className="px-6 py-3.5 bg-slate-800 hover:bg-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all border border-white/5">YÜKLE</button>
                             </div>
                             <button
                               type="button"
                               onClick={() => {
                                 const emptyFen = '8/8/8/8/8/8/8/8 w - - 0 1';
                                 setBuilderFen(emptyFen);
                                 setBuilderFenInput(emptyFen);
                               }}
                               className="mt-3 w-full py-2.5 rounded-xl border border-rose-500/25 text-rose-400 hover:bg-rose-500/10 text-[10px] font-black uppercase tracking-widest transition-all"
                             >
                               TAHTAYI TEMIZLE
                             </button>
                          </div>

                          <div className="p-8 bg-black/40 rounded-[2rem] border border-white/5 space-y-6">
                             <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">SIRA KİMDE?</span>
                                <div className="flex bg-slate-900 rounded-xl p-1.5 border border-white/5 shadow-inner">
                                   <button type="button" onClick={() => { const nf = setFenTurn(builderFen, 'w'); setBuilderFen(nf); setBuilderFenInput(nf); }} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${builderFen.includes(' w ') ? 'bg-white text-black shadow-lg shadow-white/10 scale-105' : 'text-slate-500 hover:text-slate-300'}`}>BEYAZ</button>
                                   <button type="button" onClick={() => { const nf = setFenTurn(builderFen, 'b'); setBuilderFen(nf); setBuilderFenInput(nf); }} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${builderFen.includes(' b ') ? 'bg-slate-300 text-black shadow-lg scale-105' : 'text-slate-500 hover:text-slate-300'}`}>SİYAH</button>
                                </div>
                             </div>
                             
                             <div className="flex items-start gap-3 p-4 bg-teal-500/5 rounded-2xl border border-teal-500/10">
                                <Info className="w-4 h-4 text-teal-500/50 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-slate-500 italic leading-relaxed">Taşları sürükleyerek yerini değiştirebilir, sağ tık ile tahtadan kaldırabilirsiniz. Sol taraftaki paneli kullanarak yeni taşlar ekleyebilirsiniz.</p>
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
          </div>
        </div>
      ), document.body)}
      {/* ── STUDENT ANALYSIS MODAL ────────────────────────────────────────── */}
      {selectedAnalysisStudentId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 lg:p-12 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-3xl" onClick={() => setSelectedAnalysisStudentId(null)} />
          <div className="relative w-full h-full max-w-7xl bg-[#0f172a]/80 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 shadow-3xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-500">
            <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0 bg-[#1e293b]/50">
               <div>
                  <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Öğrenci Analiz Dashboard</h2>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Gelişim ve Performans Verileri</p>
               </div>
               <button 
                 onClick={() => setSelectedAnalysisStudentId(null)}
                 className="w-12 h-12 rounded-2xl bg-white/5 text-slate-400 hover:bg-rose-600 hover:text-white transition-all flex items-center justify-center shadow-lg border border-white/5"
               >
                 <X className="w-6 h-6" />
               </button>
            </div>
            <div className="flex-1 overflow-hidden p-8">
               <Analysis isEmbedded studentId={selectedAnalysisStudentId} />
            </div>
          </div>
        </div>
      )}
      {/* ── LIVE WATCH MODAL ────────────────────────────────────────── */}
      {liveWatchStudentId && (() => {
        const p = presenceByUserId[liveWatchStudentId]?.payload;
        const student = students.find(s => s.id === liveWatchStudentId);
        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in zoom-in-95 duration-300">
            <div className="relative w-full max-w-5xl aspect-video bg-[#0f172a] rounded-[2rem] border border-orange-500/30 shadow-[0_0_50px_rgba(249,115,22,0.2)] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-white/5 bg-black/20 shrink-0">
                 <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                   <h2 className="text-lg font-black text-white tracking-tight uppercase">
                     CANLI İZLE: <span className="text-orange-400">{student?.name || 'Öğrenci'}</span>
                   </h2>
                   <span className="px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 text-[10px] font-bold uppercase tracking-widest border border-orange-500/20">
                     Bilgisayara Karşı
                   </span>
                 </div>
                 <button onClick={() => setLiveWatchStudentId(null)} className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-500 hover:text-white">
                   <X className="w-6 h-6" />
                 </button>
              </div>
              <div className="flex-1 flex min-h-0">
                {/* Left: The Board */}
                <div className="flex-1 p-8 flex items-center justify-center bg-black/40">
                  <ChessBoardFrame
                    boardOrientation={(p?.orientation || 'white') as 'white' | 'black'}
                    className="w-full max-w-[500px] shadow-2xl shadow-black/50 border-4 border-white/5 rounded-xl overflow-hidden"
                    boardClassName="overflow-hidden"
                  >
                    <div className="absolute inset-0">
                    <Chessboard
                      options={{
                        position: p?.vcFen || DEFAULT_FEN,
                        boardOrientation: p?.orientation || 'white',
                        darkSquareStyle: { backgroundColor: '#5d768e' },
                        lightSquareStyle: { backgroundColor: '#c1c9d2' },
                        ...CHESSBOARD_ANIMATION,
                        ...CHESSBOARD_NO_NOTATION,
                        allowDragging: false,
                      }}
                    />
                    </div>
                  </ChessBoardFrame>
                </div>
                {/* Right: History & Analysis */}
                <div className="w-80 border-l border-white/5 bg-[#1e293b]/30 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                   <div>
                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Hamle Geçmişi</p>
                     <div className="flex flex-wrap gap-1.5">
                       {p?.vcHistory?.map((m: string, i: number) => (
                         <span key={i} className={`px-2 py-1 rounded text-[11px] font-bold ${i % 2 === 0 ? 'bg-white/5 text-slate-300' : 'bg-black/20 text-slate-400'}`}>
                           {Math.floor(i/2) + 1}. {m}
                         </span>
                       ))}
                       {(!p?.vcHistory || p.vcHistory.length === 0) && <p className="text-xs text-slate-600 italic">Henüz hamle yapılmadı.</p>}
                     </div>
                   </div>
                   
                   <div className="mt-auto pt-6 border-t border-white/5">
                      <EngineAnalysis fen={p?.vcFen || DEFAULT_FEN} enabled={false} onToggle={() => {}} />
                   </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <StudyKeyboardHelpModal open={showStudyHelp} onClose={() => setShowStudyHelp(false)} />
      <StudyBoardSettingsPanel
        open={showStudyBoardSettings}
        onClose={() => setShowStudyBoardSettings(false)}
        settings={boardSettings}
        onToggle={toggleBoardSetting}
      />
    </div>
  );
};

export default StudyPage;
