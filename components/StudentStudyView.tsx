import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, Square } from 'chess.js';
import {
  ChevronLeft, ChevronRight, SkipBack, SkipForward, Play,
  MessageCircle, Check, X, BookMarked, RefreshCw, Eye, Phone,
  Lightbulb, RotateCcw, Zap, FlipHorizontal,
  Search, ListChecks, Star, Globe, Lock, Clock, Heart, ArrowLeft, Video, Highlighter, Plus,
  MessageSquare, Send, Menu, Users, MousePointer2, Highlighter as HighlighterIcon, Loader2,
  UserPlus, Trash2, Keyboard, Settings2,
} from 'lucide-react';
import { Study, StudyChapter, StudyChatMessage, BottomTab } from '../lib/studyTypes';
import StudyCallPanel from './StudyCallPanel';
import { createStudyCall } from '../services/studyCall';
import { loadStudiesAsync, saveStudyAsync, subscribeToStudies } from '../studyStorage';
import { getBestMove, getBestMoveAsync, getEvaluationPawns, getEvaluationPawnsAsync } from '../services/chessEngine';
import { logStudyEvent } from '../studyEvents';
import { useChessWheelNavigation } from '../hooks/useChessWheelNavigation';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION, squareMarksToStyles, SQUARE_MARK_BUTTON_PREVIEW, type SquareMarkColor } from '../lib/chessBoardUi';
import { useStudyCall } from '../hooks/useStudyCall';
import { useApp } from '../AppContext';
import { canExportStudy } from '../lib/studyPermissions';
import { useStudyChapterSync } from '../hooks/useStudyChapterSync';
import { DEFAULT_FEN, makeBuilderGame, applyMove, sideToMove,
  chapterModeBadge, formatChapterListLabel, chapterListLabelMatches, loadStudySelection, saveStudySelection,
  loadProgress, saveProgress, fenToCurrentFen,
  loadVcProgress, saveVcProgress,
  describeGameOutcomeFromFen, matedKingSquareFromFen,
  genId, migrateStudy, migrateChapter,
  normalizeStudentPlaysColor, canStudentDragPieceOnFen, studentCanMovePieces, studentPlaysColorLabel,
} from '../lib/studyUtils';
import { normalizeStudyChapterPuzzle } from '../lib/puzzlePlayUtils';
import { StudyMoveTree } from './study/StudyMoveTree';
import { EngineAnalysis } from './study/EngineAnalysis';
import { StudyBottomTools } from './study/StudyBottomTools';
import { loadStudyPresence, subscribeStudyPresence } from '../services/studyActions';
import { mainlineNodeIdForFen, mainlineSansFromTree, sanitizeChapterVariations, fenAtSyncPath, mergeMainlineMoves } from '../lib/studySync/moveList';
import { liveLessonFenAt } from '../lib/liveLessonVariations';
import { ChessBoardFrame, ChessEvalBar } from './chess/ChessBoardFrame';
import { useStudyBoardSettings } from '../hooks/useStudyBoardSettings';
import { useStudyKeyboardShortcuts } from '../hooks/useStudyKeyboardShortcuts';
import { StudyKeyboardHelpModal } from './study/StudyKeyboardHelpModal';
import { StudyBoardSettingsPanel } from './study/StudyBoardSettingsPanel';
import { computeThreatOverlay } from '../lib/chessThreats';
import { ResponsiveTable } from './ui/ResponsiveTable';
import { resolveStudyMembers, toCoachMemberId } from '../lib/studyMemberUtils';


// ── Types ─────────────────────────────────────────────────────────────────────
type Feedback = 'correct' | 'wrong' | 'solved' | null;
type ChapterMoveAnalysisItem = {
  id: string;
  moveNo: number;
  played: string;
  expected: string;
  isCorrect: boolean;
  thinkMs: number;
  atIso: string;
};

interface StudentStudyViewProps {
  studentId: string | null;
  studentName?: string;
  /** Admin/öğretmen: çalışmayı öğrencinin gördüğü gibi salt okunur önizle */
  previewMode?: boolean;
  previewStudyId?: string | null;
  onExitPreview?: () => void;
}

const StudentStudyView: React.FC<StudentStudyViewProps> = ({
  studentId,
  studentName = 'Öğrenci',
  previewMode = false,
  previewStudyId = null,
  onExitPreview,
}) => {
  const { students, coaches, auth } = useApp();
  const [studies, setStudies] = useState<Study[]>([]);
  /** Öğretmendeki gibi girişte tüm çalışmalar listesi; son dosyaya otomatik gitme. */
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(
    () => (previewMode && previewStudyId ? previewStudyId : null),
  );
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [listSearch, setListSearch] = useState('');
  const [studyListCategory, setStudyListCategory] = useState<'mine' | 'teacher'>('mine');
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [currentVariation, setCurrentVariation] = useState<[number, number, number] | null>(null);
  const [hoverPly, setHoverPly] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [feedbackText, setFeedbackText] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>(loadProgress);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoReplyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Board UI state
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const [lastMoveSquares, setLastMoveSquares] = useState<Record<string, React.CSSProperties>>({});
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [squareMarks, setSquareMarks] = useState<Partial<Record<string, SquareMarkColor>>>({});
  const [markBrush, setMarkBrush] = useState<'off' | SquareMarkColor>('off');
  const [drawArrowsEnabled, setDrawArrowsEnabled] = useState(false);
  const [boardArrows, setBoardArrows] = useState<Array<{ startSquare: string; endSquare: string; color: string }>>([]);
  const [circleMarks, setCircleMarks] = useState<Record<string, boolean>>({});

  // vs Computer mode
  const [vsComputer, setVsComputer] = useState(false);
  const [vcFen, setVcFen] = useState(DEFAULT_FEN);
  const [vcHistory, setVcHistory] = useState<string[]>([]);
  const [vcOrientation, setVcOrientation] = useState<'white' | 'black'>('white');
  const [vcLevel, setVcLevel] = useState(20);
  const [vcThinking, setVcThinking] = useState(false);
  const [vcManualGameOver, setVcManualGameOver] = useState(false);
  const [vcMoveQuality, setVcMoveQuality] = useState<{ label: string; bestSan: string; color: string } | null>(null);
  const [vcHint, setVcHint] = useState<string | null>(null);
  const [vcOptionSquares, setVcOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const [vcLastMoveSquares, setVcLastMoveSquares] = useState<Record<string, React.CSSProperties>>({});
  const [vcMoveFrom, setVcMoveFrom] = useState<string | null>(null);

  const [showCallPanel, setShowCallPanel] = useState(false);
  const [liveAnalysisNote, setLiveAnalysisNote] = useState<string | null>(null);
  const [laAnalyzing, setLaAnalyzing] = useState(false);
  const [laReplyThinking, setLaReplyThinking] = useState(false);
  const [laHintThinking, setLaHintThinking] = useState(false);
  const [laMoveQuality, setLaMoveQuality] = useState<{ label: string; bestSan: string; color: string } | null>(null);
  const [laHint, setLaHint] = useState<string | null>(null);
  const [evalScore, setEvalScore] = useState(0);
  const [replyToCoach, setReplyToCoach] = useState('');
  const [chapterMoveAnalysis, setChapterMoveAnalysis] = useState<ChapterMoveAnalysisItem[]>([]);
  const [bottomTab, setBottomTab] = useState<BottomTab>('comments');
  const [leftTab, setLeftTab] = useState<'chapters' | 'members'>('chapters');
  const [chapterSearch, setChapterSearch] = useState('');
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Motor analizi için state
  const { settings: boardSettings, toggleSetting: toggleBoardSetting } = useStudyBoardSettings();
  const [showStudyHelp, setShowStudyHelp] = useState(false);
  const [showStudySettings, setShowStudySettings] = useState(false);
  const [engineHoverMove, setEngineHoverMove] = useState<{ from: string; to: string } | null>(null);
  const [engineTopMove, setEngineTopMove] = useState<{ from: string; to: string } | null>(null);
  
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
  } = useStudyCall(selectedStudyId, studentName, 'student');

  useEffect(() => {
    if (callIncomingOffer && !showCallPanel) {
      setShowCallPanel(true);
    }
  }, [callIncomingOffer, showCallPanel]);
  const [chapterStartMs, setChapterStartMs] = useState<number>(Date.now());
  const [lastActionMs, setLastActionMs] = useState<number>(Date.now());
  const laAutoReplyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Persistence ──────────────────────────────────────────────────────────────
  const refreshStudies = useCallback(() => {
    loadStudiesAsync().then(fresh => setStudies(fresh)).catch(() => {});
  }, []);

  useEffect(() => {
    refreshStudies();
    const unsub = subscribeToStudies(fresh => setStudies(fresh));
    return unsub;
  }, [refreshStudies]);

  const studentStudies = useMemo(() => {
    if (previewMode && previewStudyId) {
      const s = studies.find((x) => x.id === previewStudyId);
      return s ? [s] : [];
    }
    if (!studentId) return studies;
    return studies.filter(s => s.memberIds.some(id => String(id) === String(studentId)));
  }, [studies, studentId, previewMode, previewStudyId]);

  const myStudies = useMemo(
    () => studentStudies.filter(
      (s) => s.studentCreated && String(s.createdByStudentId ?? '') === String(studentId ?? '')
    ),
    [studentStudies, studentId]
  );

  const teacherStudies = useMemo(
    () => studentStudies.filter((s) => !s.studentCreated),
    [studentStudies]
  );

  const displayedStudies = useMemo(() => {
    const base = studyListCategory === 'mine' ? myStudies : teacherStudies;
    const q = listSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter((s) => s.title.toLowerCase().includes(q));
  }, [studyListCategory, myStudies, teacherStudies, listSearch]);

  const createStudentStudy = useCallback(() => {
    if (!studentId) return;
    const id = genId();
    const now = new Date().toISOString();
    const study = migrateStudy({
      id,
      title: `${studentName} — Çalışma ${myStudies.length + 1}`,
      emoji: '♟️',
      chapters: [migrateChapter({ id: genId(), title: 'Bölüm 1' })],
      memberIds: [studentId],
      createdAt: now,
      updatedAt: now,
      visibility: 'private',
      chat: 'members',
      computerAnalysis: 'none',
      openingExplorer: 'everyone',
      clonePermission: 'members',
      shareExport: 'members',
      syncEnabled: true,
      studyComments: 'none',
      tags: [],
      topicTags: [],
      chatMessages: [],
      liked: false,
      likes: 0,
      studentCreated: true,
      createdByStudentId: studentId,
      studentPlaysColor: 'white',
    });
    setStudies((prev) => [...prev, study]);
    void saveStudyAsync(study);
    setStudyListCategory('mine');
    setSelectedStudyId(id);
    setSelectedChapterIndex(0);
    setCurrentMoveIndex(0);
  }, [studentId, studentName, myStudies.length]);

  useEffect(() => {
    if (previewMode) return;
    if (selectedStudyId && studentStudies.length > 0 && !studentStudies.find(s => s.id === selectedStudyId)) {
      setSelectedStudyId(studentStudies[0].id);
      setSelectedChapterIndex(0);
    }
  }, [previewMode, studentStudies, selectedStudyId]);

  useEffect(() => {
    if (previewMode) return;
    saveStudySelection(studentId, selectedStudyId, selectedChapterIndex);
  }, [previewMode, studentId, selectedStudyId, selectedChapterIndex]);

  const selectedStudy = useMemo(() => studentStudies.find(s => s.id === selectedStudyId) ?? null, [studentStudies, selectedStudyId]);
  const selectedChapter = useMemo(() => {
    if (!selectedStudy || selectedStudy.chapters.length === 0) return null;
    const idx = Math.min(selectedChapterIndex, selectedStudy.chapters.length - 1);
    return selectedStudy.chapters[idx];
  }, [selectedStudy, selectedChapterIndex]);

  const {
    legacyChapter,
    syncState,
    jumpToMoveIndex,
    jumpToVariation,
    jumpToNodePath,
    makeMove,
    sticky,
    setSticky,
    behind,
    catchUp,
    updatePresencePayload,
  } = useStudyChapterSync({
    study: selectedStudy,
    chapter: selectedChapter,
    actorId: String(studentId ?? 'student'),
    actorRole: 'student',
    initialSticky: true,
    initialWrite: false,
  });

  const effectiveChapter = legacyChapter;

  const isInteractivePuzzle = useMemo(
    () =>
      !!effectiveChapter &&
      effectiveChapter.lessonMode === 'interactive' &&
      (effectiveChapter.interactiveType ?? 'puzzle') === 'puzzle',
    [effectiveChapter?.id, effectiveChapter?.lessonMode, effectiveChapter?.interactiveType]
  );

  const puzzlePlayNorm = useMemo(() => {
    if (!isInteractivePuzzle || !effectiveChapter) return null;
    return normalizeStudyChapterPuzzle(effectiveChapter);
  }, [isInteractivePuzzle, effectiveChapter?.fen, effectiveChapter?.moves, effectiveChapter?.id]);

  /** Tahta = sync ana hat; liste eski chapter.moves'ta kaldığında burada birleştirilir. */
  const chapterMovesForUi = useMemo(() => {
    if (isInteractivePuzzle && puzzlePlayNorm) return puzzlePlayNorm.studentMoves;
    if (vsComputer) return effectiveChapter?.moves ?? [];
    if (!syncState?.tree?.mainline || syncState.tree.mainline.length <= 1) {
      return effectiveChapter?.moves ?? [];
    }
    const rootFen = syncState.tree.nodes[syncState.tree.rootId]?.fen ?? DEFAULT_FEN;
    const fromTree = mainlineSansFromTree(syncState.tree, rootFen);
    const legacy = effectiveChapter?.moves ?? [];
    return mergeMainlineMoves(legacy, fromTree);
  }, [isInteractivePuzzle, puzzlePlayNorm, vsComputer, syncState, effectiveChapter?.moves, effectiveChapter?.id]);

  const moveListChapter = useMemo(() => {
    if (!effectiveChapter) return null;
    const fen = isInteractivePuzzle && puzzlePlayNorm
      ? puzzlePlayNorm.startFen
      : effectiveChapter.fen;
    const vars = sanitizeChapterVariations({ ...effectiveChapter, fen, moves: chapterMovesForUi }, chapterMovesForUi);
    return { ...effectiveChapter, fen, moves: chapterMovesForUi, variations: vars };
  }, [effectiveChapter, chapterMovesForUi, isInteractivePuzzle, puzzlePlayNorm]);

  const isVcGameOver = useMemo(() => {
    if (vcManualGameOver) return true;
    try {
      return makeBuilderGame(vcFen).isGameOver();
    } catch {
      return false;
    }
  }, [vcFen, vcManualGameOver]);

  // Periodic presence update (like StudyPage)
  useEffect(() => {
    if (!selectedStudy || !effectiveChapter || !studentId) return;
    const interval = setInterval(() => {
      const payload: any = {};
      if (vsComputer) {
        payload.vsComputer = true;
        payload.fen = vcFen;
        payload.history = vcHistory;
        payload.vcHistory = vcHistory;
        payload.thinking = vcThinking;
        payload.gameOver = isVcGameOver;
      }
      // `updatePresencePayload` already knows studyId/chapterId/userId/path/sticky from the sync hook.
      // Passing a nested object here breaks the expected payload shape and makes teacher UI miss `vsComputer`.
      void updatePresencePayload(payload);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedStudy, effectiveChapter, studentId, vsComputer, vcFen, vcHistory, vcThinking, isVcGameOver, syncState, sticky]);

  const isLiveAnalysis = useMemo(
    () => !!effectiveChapter && effectiveChapter.lessonMode === 'interactive' && effectiveChapter.interactiveType === 'liveAnalysis',
    [effectiveChapter?.lessonMode, effectiveChapter?.interactiveType]
  );
  const isVsComputer = useMemo(() => {
    const ch = selectedChapter ?? effectiveChapter;
    return !!ch && ch.lessonMode === 'interactive' && ch.interactiveType === 'vsComputer';
  }, [
    selectedChapter?.id,
    selectedChapter?.lessonMode,
    selectedChapter?.interactiveType,
    effectiveChapter?.id,
    effectiveChapter?.lessonMode,
    effectiveChapter?.interactiveType,
  ]);
  const isInteractive = useMemo(
    () => !!effectiveChapter && effectiveChapter.lessonMode === 'interactive',
    [effectiveChapter]
  );

  const memberStudents = useMemo(() => {
    if (!selectedStudy) return [];
    return resolveStudyMembers(selectedStudy.memberIds, students, coaches);
  }, [selectedStudy, students, coaches]);

  const canManageMembers = useMemo(() => {
    if (previewMode) return false;
    if (!selectedStudy || !studentId) return false;
    return (
      selectedStudy.studentCreated === true &&
      String(selectedStudy.createdByStudentId ?? '') === String(studentId)
    );
  }, [selectedStudy, studentId, previewMode]);

  const currentStudent = useMemo(
    () => students.find((s) => String(s.id) === String(studentId)),
    [students, studentId],
  );

  const availableStudentsToAdd = useMemo(() => {
    if (!selectedStudy || !studentId) return [];
    const memberSet = new Set(selectedStudy.memberIds.map(String));
    const group = (currentStudent?.group || '').trim();
    let pool = students.filter((s) => String(s.id) !== String(studentId) && !memberSet.has(String(s.id)));
    if (group) {
      const inGroup = pool.filter((s) => (s.group || '').trim() === group);
      if (inGroup.length > 0) pool = inGroup;
    }
    return pool.map((s) => ({ id: String(s.id), name: s.name }));
  }, [selectedStudy, students, studentId, currentStudent?.group]);

  const availableCoachesToAdd = useMemo(() => {
    if (!selectedStudy) return [];
    const memberSet = new Set(selectedStudy.memberIds.map(String));
    return coaches
      .filter((c) => !memberSet.has(toCoachMemberId(String(c.id))))
      .map((c) => ({ id: toCoachMemberId(String(c.id)), name: c.name, coachId: String(c.id) }));
  }, [selectedStudy, coaches]);

  const updateStudyMembers = useCallback((memberIds: string[]) => {
    if (!selectedStudy) return;
    setStudies((prev) => {
      const next = prev.map((s) =>
        s.id === selectedStudy.id ? { ...s, memberIds, updatedAt: new Date().toISOString() } : s,
      );
      const updated = next.find((s) => s.id === selectedStudy.id);
      if (updated) void saveStudyAsync(updated);
      return next;
    });
  }, [selectedStudy]);

  const addStudyMember = useCallback((memberId: string) => {
    if (!selectedStudy || selectedStudy.memberIds.includes(memberId)) return;
    updateStudyMembers([...selectedStudy.memberIds, memberId]);
  }, [selectedStudy, updateStudyMembers]);

  const removeStudyMember = useCallback((memberId: string) => {
    if (!selectedStudy) return;
    if (String(memberId) === String(studentId)) return;
    updateStudyMembers(selectedStudy.memberIds.filter((id) => id !== memberId));
  }, [selectedStudy, studentId, updateStudyMembers]);

  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, any>>({});
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

  const formatPresence = useCallback((row: any) => {
    if (!row) return null;
    const chapId = row.chapter_id ? String(row.chapter_id) : null;
    const ch = chapId ? selectedStudy?.chapters?.find(c => String(c.id) === chapId) : null;
    const ply = row.path ? Math.max(0, String(row.path).split('.').filter(Boolean).length - 1) : 0;
    const chIdx = ch && selectedStudy ? selectedStudy.chapters.findIndex(c => c.id === ch.id) : -1;
    const labelNo = chIdx >= 0 ? `${chIdx + 1}. ` : '';
    const raw = (ch?.title ?? '').trim();
    const modeLabel = ch ? chapterModeBadge(ch).label : '';
    const chapterTitle = ch
      ? `${labelNo}${raw || 'Adsız'} · ${modeLabel}`
      : chapId
        ? `id:${chapId.slice(0, 8)}`
        : '—';
    return {
      sticky: !!row.sticky,
      chapterTitle,
      ply,
    };
  }, [selectedStudy?.chapters, selectedStudy]);

  const filteredChapters = useMemo(() => {
    if (!selectedStudy) return [];
    const q = chapterSearch.trim().toLowerCase();
    if (!q) return selectedStudy.chapters.map((ch, idx) => ({ ch, idx }));
    return selectedStudy.chapters
      .map((ch, idx) => ({ ch, idx }))
      .filter(({ ch }) => chapterListLabelMatches(ch, q, selectedStudy.chapters));
  }, [selectedStudy, chapterSearch]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedStudy?.chatMessages?.length]);
  const scenarioText = useMemo(() => {
    if (!effectiveChapter) return "Bu pozisyonda en iyi devam yolunu bulun. Hamleleri tahtada sürükleyerek oynayın.";
    if (effectiveChapter.comment?.trim()) return effectiveChapter.comment.trim();
    return "Bu pozisyonda en iyi devam yolunu bulun. Hamleleri tahtada sürükleyerek oynayın.";
  }, [effectiveChapter]);
  const hintText = useMemo(() => {
    if (!effectiveChapter) return '';
    if (effectiveChapter.moveHint?.trim()) return effectiveChapter.moveHint.trim();
    return '';
  }, [effectiveChapter]);

  const currentMoveIndexFromSync = useMemo(() => {
    const path = syncState?.currentPath || [];
    return Math.max(0, path.length - 1);
  }, [syncState]);

  const syncPathFen = useMemo(() => fenAtSyncPath(syncState), [syncState]);

  const currentFen = useMemo(() => {
    if (syncPathFen) return syncPathFen;
    if (!moveListChapter) return DEFAULT_FEN;
    return fenToCurrentFen(moveListChapter, currentMoveIndex);
  }, [syncPathFen, moveListChapter, currentMoveIndex]);

  const totalMoves = chapterMovesForUi.length;
  const isComplete = isLiveAnalysis ? false : totalMoves > 0 && currentMoveIndex >= totalMoves;
  /** Bulmacada çözüm sızmasın: motor, ana hat hamle listesi ve ileri sarma kapalı; ipuçları butonlarla. */
  const hideEngineForStudentPuzzle = useMemo(
    () => isInteractivePuzzle && !isLiveAnalysis && !vsComputer && !isComplete,
    [isInteractivePuzzle, isLiveAnalysis, vsComputer, isComplete]
  );

  useEffect(() => {
    const now = Date.now();
    // Uzaktan path ile yerel ply'i eşitle (öğretmen ileri/geri). Bulmaca ve bilgisayar oyununda
    // öğrencinin tahtası geri sıçramasın diye bu çekmeyi yapma.
    if (hideEngineForStudentPuzzle || vsComputer) return;
    if (sticky && currentMoveIndexFromSync !== currentMoveIndex && (now - lastActionMs > 1000)) {
      setCurrentMoveIndex(currentMoveIndexFromSync);
    }
  }, [hideEngineForStudentPuzzle, vsComputer, sticky, currentMoveIndexFromSync, currentMoveIndex, lastActionMs]);

  useEffect(() => {
    if (!hideEngineForStudentPuzzle) return;
    setEngineTopMove(null);
    setEngineHoverMove(null);
  }, [hideEngineForStudentPuzzle, effectiveChapter?.id, currentMoveIndex]);

  const studentPlaysColor = normalizeStudentPlaysColor(selectedStudy?.studentPlaysColor);
  const studentMoveEnabled = studentCanMovePieces(studentPlaysColor);
  const chapterOrientation = effectiveChapter?.orientation ?? 'white';
  const [studentBoardOrientation, setStudentBoardOrientation] = useState<'white' | 'black'>(chapterOrientation);

  useEffect(() => { setStudentBoardOrientation(chapterOrientation); }, [effectiveChapter?.id, chapterOrientation]);

  const flipStudentBoard = useCallback(() => {
    setStudentBoardOrientation((o) => (o === 'white' ? 'black' : 'white'));
  }, []);

  const [freePlayFen, setFreePlayFen] = useState<string | null>(null);
  useEffect(() => {
    const ch = moveListChapter ?? effectiveChapter;
    if (ch && (totalMoves === 0 || isLiveAnalysis)) setFreePlayFen(fenToCurrentFen(ch, totalMoves));
    else setFreePlayFen(null);
  }, [effectiveChapter?.id, totalMoves, effectiveChapter?.fen, isLiveAnalysis, moveListChapter]);

  const studyBoardFen = useMemo(() => {
    if (vsComputer) return vcFen;
    if (isComplete && hoverPly !== null && (moveListChapter ?? effectiveChapter) && totalMoves > 0) {
      return fenToCurrentFen(moveListChapter ?? effectiveChapter!, Math.min(Math.max(0, hoverPly), totalMoves));
    }
    if (freePlayFen != null) return freePlayFen;
    return currentFen;
  }, [vsComputer, vcFen, isComplete, hoverPly, effectiveChapter, moveListChapter, totalMoves, freePlayFen, currentFen]);

  const turn = sideToMove(studyBoardFen);
  const studentTurnCode: 'w' | 'b' | null =
    studentPlaysColor === 'white' ? 'w' : studentPlaysColor === 'black' ? 'b' : null;
  /** `both`: her iki renk de oynanır; tek renge düşme ve motorun karşılık vermesi olmaz. */
  const effectiveStudentTurnCode: 'w' | 'b' | null = useMemo(() => {
    if (studentTurnCode) return studentTurnCode;
    return null;
  }, [studentTurnCode]);

  useEffect(() => {
    let cancelled = false;
    const updateEval = async () => {
      try {
        const score = await getEvaluationPawnsAsync(makeBuilderGame(studyBoardFen));
        if (!cancelled) setEvalScore(score);
      } catch {
        if (!cancelled) setEvalScore(0);
      }
    };
    updateEval();
    return () => { cancelled = true; };
  }, [studyBoardFen]);

  const progressKey = effectiveChapter ? `${selectedStudy?.id}_${effectiveChapter.id}` : null;
  const recordProgress = useCallback((key: string, idx: number) => {
    if (previewMode) return;
    setProgress(prev => {
      const next = { ...prev, [key]: Math.max(prev[key] ?? 0, idx) };
      saveProgress(next);
      return next;
    });
  }, [previewMode]);

  useEffect(() => {
    setSquareMarks({}); setBoardArrows([]); setCircleMarks({}); setMarkBrush('off'); setHoverPly(null); setFeedback(null); setFeedbackText(null);
    setCurrentVariation(null);
    setLiveAnalysisNote(null);
    setLaMoveQuality(null);
    setLaHint(null);
    const now = Date.now();
    setChapterStartMs(now);
    setLastActionMs(now);
    setChapterMoveAnalysis([]);
    if (!effectiveChapter) { setCurrentMoveIndex(0); return; }
    setCurrentMoveIndex(isLiveAnalysis ? totalMoves : 0);
  }, [effectiveChapter?.id, totalMoves, studentPlaysColor, isLiveAnalysis]);

  const boardGameOutcome = useMemo(() => describeGameOutcomeFromFen(studyBoardFen), [studyBoardFen]);

  /** Bulmacada gizli; bilgisayara karşı ve normal çalışmada tahta yanında avantaj çubuğu */
  const showEvalBar = !hideEngineForStudentPuzzle && boardSettings.showEvalBar;
  const engineEnabled = boardSettings.showEngineAnalysis;

  const matedKingHighlight = useMemo(() => {
    const sq = matedKingSquareFromFen(studyBoardFen);
    if (!sq) return {} as Record<string, React.CSSProperties>;
    const key = String(sq).toLowerCase();
    return {
      [key]: {
        boxShadow: 'inset 0 0 0 3px rgba(239,68,68,0.95)',
        backgroundColor: 'rgba(220,38,38,0.28)',
      } as React.CSSProperties,
    };
  }, [studyBoardFen]);

  const studentMainMergedSquareStyles = useMemo(() => {
    return {
      ...lastMoveSquares,
      ...optionSquares,
      ...squareMarksToStyles(circleMarks as any),
      ...matedKingHighlight,
      ...(boardSettings.showThreats ? computeThreatOverlay(studyBoardFen).squareStyles : {}),
    };
  }, [lastMoveSquares, optionSquares, circleMarks, matedKingHighlight, boardSettings.showThreats, studyBoardFen]);

  const studentThreatArrows = useMemo(
    () => (boardSettings.showThreats ? computeThreatOverlay(studyBoardFen).arrows : []),
    [boardSettings.showThreats, studyBoardFen],
  );

  const formatDuration = useCallback((ms: number) => {
    const totalSec = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }, []);

  const totalThinkMs = useMemo(() => Math.max(0, Date.now() - chapterStartMs), [chapterStartMs, chapterMoveAnalysis.length]);
  const totalCorrectThinkMs = useMemo(
    () => chapterMoveAnalysis.filter((x) => x.isCorrect).reduce((sum, x) => sum + x.thinkMs, 0),
    [chapterMoveAnalysis]
  );
  const totalWrongThinkMs = useMemo(
    () => chapterMoveAnalysis.filter((x) => !x.isCorrect).reduce((sum, x) => sum + x.thinkMs, 0),
    [chapterMoveAnalysis]
  );
  const studentBottomAnalysisEntries = useMemo(
    () => chapterMoveAnalysis.map((item) => ({
      id: item.id,
      moveNo: item.moveNo,
      playedSan: item.played,
      expectedSan: item.expected,
      isCorrect: item.isCorrect,
      thinkMs: item.thinkMs,
      atIso: item.atIso,
    })),
    [chapterMoveAnalysis]
  );

  useEffect(() => {
    if (!effectiveChapter || vsComputer || isComplete || totalMoves === 0) return;
    if (isLiveAnalysis || isInteractivePuzzle) return;
    if (effectiveStudentTurnCode == null) return;
    const fenAtIndex = fenToCurrentFen(effectiveChapter, currentMoveIndex);
    const turnCode = sideToMove(fenAtIndex) === 'white' ? 'w' : 'b';
    if (turnCode === effectiveStudentTurnCode) return;
    if (autoReplyTimer.current) clearTimeout(autoReplyTimer.current);
    autoReplyTimer.current = setTimeout(() => {
      setCurrentMoveIndex((i) => Math.min(totalMoves, i + 1));
      setLastActionMs(Date.now());
    }, 420);
    return () => {
      if (autoReplyTimer.current) clearTimeout(autoReplyTimer.current);
    };
  }, [effectiveChapter, currentMoveIndex, totalMoves, effectiveStudentTurnCode, isComplete, vsComputer, isLiveAnalysis, isInteractivePuzzle]);

  const showFeedback = useCallback((f: Feedback, text?: string | null) => {
    setFeedback(f);
    setFeedbackText(text ?? null);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    if (f === 'correct') feedbackTimer.current = setTimeout(() => { setFeedback(null); setFeedbackText(null); }, 1200);
    else if (f === 'wrong') feedbackTimer.current = setTimeout(() => { setFeedback(null); setFeedbackText(null); }, 3500);
  }, []);

  const getBestMoveWithTimeout = useCallback(async (fen: string, level: number, timeoutMs: number) => {
    const timeout = new Promise<string | null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    try {
      const g = makeBuilderGame(fen);
      const best = await Promise.race([getBestMoveAsync(g, level), timeout]);
      if (best) return best;
    } catch {}
    try {
      return getBestMove(makeBuilderGame(fen), level) ?? null;
    } catch {
      return null;
    }
  }, []);

  const estimateMoveQuality = useCallback(async (fenBefore: string, playedSan: string) => {
    if (!effectiveChapter) return;
    setLaAnalyzing(true);
    try {
      const base = makeBuilderGame(fenBefore);
      const bestSan = await getBestMoveAsync(base, 8);
      if (!bestSan) { setLaMoveQuality(null); return; }
      const bestPos = makeBuilderGame(fenBefore);
      bestPos.move(bestSan);
      const playedPos = makeBuilderGame(fenBefore);
      playedPos.move(playedSan);
      const bestEval = await getEvaluationPawnsAsync(bestPos);
      const playedEval = await getEvaluationPawnsAsync(playedPos);
      const side = base.turn();
      const sign = side === 'w' ? 1 : -1;
      const cpLoss = Math.round((bestEval - playedEval) * 100 * sign);
      let label = 'İyi';
      let color = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      if (cpLoss >= 250) { label = 'Blunder'; color = 'bg-rose-500/20 text-rose-300 border-rose-500/30'; }
      else if (cpLoss >= 120) { label = 'Hata'; color = 'bg-orange-500/20 text-orange-300 border-orange-500/30'; }
      else if (cpLoss >= 60) { label = 'İsabetsiz'; color = 'bg-amber-500/20 text-amber-300 border-amber-500/30'; }
      setLaMoveQuality({ label: `${label} (${cpLoss}cp)`, bestSan, color });
      setLaHint(`En iyi hamle: ${bestSan}`);
    } catch {
      setLaMoveQuality(null);
    } finally {
      setLaAnalyzing(false);
    }
  }, [effectiveChapter]);

  const requestHint = useCallback(async () => {
    if (!effectiveChapter) return;
    setLaHintThinking(true);
    try {
      setBoardArrows([]);
      setCircleMarks({});
      setOptionSquares({});

      const g0 = makeBuilderGame(studyBoardFen);
      const legalVerbose = g0.moves({ verbose: true }) as Array<{ from: string; to: string; san: string; lan?: string }>;
      if (!legalVerbose || legalVerbose.length === 0) {
        setLaHint('Hamle yok.');
        return;
      }

      let highlightFrom: string | null = null;
      let highlightTo: string | null = null;
      let hintText = '';

      if (effectiveChapter.interactiveType === 'liveAnalysis') {
        const g = makeBuilderGame(studyBoardFen);
        const bestSan = await getBestMoveAsync(g, 8);
        if (!bestSan) {
          setLaHint('İpucu bulunamadı.');
          return;
        }
        const gBest = makeBuilderGame(studyBoardFen);
        const bestApplied = gBest.move(bestSan);
        highlightFrom = (bestApplied as any)?.from ?? null;
        highlightTo = (bestApplied as any)?.to ?? null;
        hintText = `İpucu: En iyi hamle (${bestSan})`;
      } else {
        const expectedSan = chapterMovesForUi[currentMoveIndex];
        if (!expectedSan) {
          setLaHint('Beklenen hamle yok.');
          return;
        }
        const found = legalVerbose.find(m => m.san === expectedSan || (m.lan && m.lan === expectedSan));
        highlightFrom = found?.from ?? null;
        highlightTo = found?.to ?? null;
        hintText = `İpucu: Beklenen hamle (${expectedSan})`;
      }

      const maxArrows = 28;
      const trimmed = legalVerbose.slice(0, maxArrows);

      setBoardArrows(
        trimmed.map((m) => ({
          startSquare: m.from,
          endSquare: m.to,
          color:
            highlightFrom && highlightTo && m.from === highlightFrom && m.to === highlightTo
              ? '#6366f1' // en iyi hamle (indigo)
              : 'rgba(99,102,241,0.55)', // diğerleri (indigo muted)
        })),
      );

      const circles: Record<string, boolean> = {};
      for (const m of trimmed) circles[m.to] = true;
      setCircleMarks(circles);

      setLaHint(hintText);
    } catch {
      setLaHint('İpucu alınamadı.');
    } finally {
      setLaHintThinking(false);
    }
  }, [effectiveChapter, studyBoardFen, currentMoveIndex]);

  const showSolution = useCallback(async () => {
    if (!effectiveChapter || isLiveAnalysis) return;
    const expectedSan = chapterMovesForUi[currentMoveIndex];
    if (!expectedSan) return;
    setLaHint(`Çözüm: ${expectedSan}`);
    await requestHint();
  }, [effectiveChapter, currentMoveIndex, isLiveAnalysis, requestHint]);

  const pushStudyChatMessage = useCallback((studyId: string, msg: StudyChatMessage, opts?: { forceSync?: boolean }) => {
    setStudies(prev => {
      const next = prev.map(s => s.id === studyId
        ? {
            ...s,
            syncEnabled: opts?.forceSync ? true : s.syncEnabled,
            chatMessages: [...(s.chatMessages ?? []), msg],
          }
        : s
      );
      const updated = next.find(s => s.id === studyId);
      if (updated) void saveStudyAsync(updated);
      return next;
    });
  }, []);

  const canUseChat = useMemo(() => {
    if (!selectedStudy) return false;
    return selectedStudy.chat === 'everyone' || selectedStudy.chat === 'members';
  }, [selectedStudy]);

  const sendChat = useCallback(() => {
    if (!selectedStudy) return;
    const t = chatInput.trim();
    if (!t) return;
    const msg: StudyChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user: studentName,
      text: t,
      timestamp: new Date().toISOString(),
    };
    pushStudyChatMessage(selectedStudy.id, msg, { forceSync: true });
    setChatInput('');
  }, [selectedStudy, chatInput, pushStudyChatMessage, studentName]);

  const sendLiveAnalysisNote = useCallback(() => {
    if (!selectedStudy || !effectiveChapter) return;
    const t = replyToCoach.trim();
    if (!t) return;
    const chapterLabel = `Bölüm ${selectedChapterIndex + 1} · ${effectiveChapter.title || '—'}`;
    const msg: StudyChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user: `${studentName} (Canlı Analiz)`,
      text: `[LIVE_NOTE][CHAPTER:${effectiveChapter.id}][CHAPTER_LABEL:${chapterLabel}]\n${t}`,
      timestamp: new Date().toISOString(),
    };
    pushStudyChatMessage(selectedStudy.id, msg, { forceSync: true });
    setReplyToCoach('');
    setLiveAnalysisNote(selectedStudy.syncEnabled === false ? 'Not gönderildi (SYNC otomatik açıldı).' : 'Not gönderildi.');
    setTimeout(() => setLiveAnalysisNote(null), 2500);
  }, [selectedStudy, effectiveChapter, selectedChapterIndex, replyToCoach, pushStudyChatMessage, studentName]);

  const sendLiveNoteFromBottom = useCallback((text: string) => {
    if (!selectedStudy || !effectiveChapter) return;
    const t = text.trim();
    if (!t) return;
    const chapterLabel = `Bölüm ${selectedChapterIndex + 1} · ${effectiveChapter.title || '—'}`;
    const msg: StudyChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user: `${studentName} (Canlı Analiz)`,
      text: `[LIVE_NOTE][CHAPTER:${effectiveChapter.id}][CHAPTER_LABEL:${chapterLabel}]\n${t}`,
      timestamp: new Date().toISOString(),
    };
    pushStudyChatMessage(selectedStudy.id, msg, { forceSync: true });
    setLiveAnalysisNote('Not gönderildi.');
    setTimeout(() => setLiveAnalysisNote(null), 2500);
  }, [selectedStudy, effectiveChapter, selectedChapterIndex, pushStudyChatMessage, studentName]);

  const appendLiveMoveToChapter = useCallback((sid: string, cid: string, san: string) => {
    setStudies(prev => {
      const next = prev.map(s => {
        if (s.id !== sid) return s;
        return {
          ...s,
          chapters: s.chapters.map(ch => {
            if (ch.id !== cid) return ch;
            return { ...ch, moves: [...(ch.moves ?? []), san] };
          }),
        };
      });
      const updated = next.find(s => s.id === sid);
      if (updated) void saveStudyAsync(updated);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isLiveAnalysis || vsComputer) return;
    if (effectiveStudentTurnCode == null) return;
    const turnCode: 'w' | 'b' = sideToMove(studyBoardFen) === 'white' ? 'w' : 'b';
    if (turnCode === effectiveStudentTurnCode) return;
    if (laReplyThinking) return;
    if (laAutoReplyTimer.current) return;

    laAutoReplyTimer.current = setTimeout(() => {
      setLaReplyThinking(true);
      setLaHint('Motor en iyi hamleyi düşünüyor...');
      const sid = selectedStudy?.id;
      const cid = effectiveChapter?.id;
      (async () => {
        try {
          const best = await getBestMoveWithTimeout(studyBoardFen, 18, 3000);
          if (!best) return;
          const g2 = makeBuilderGame(studyBoardFen);
          const mv = g2.move(best);
          if (!mv) return;
          setFreePlayFen(g2.fen());
          if (sid && cid) {
            appendLiveMoveToChapter(sid, cid, mv.san);
            setCurrentMoveIndex(i => i + 1);
            setLastActionMs(Date.now());
          }
          setLaHint(`En iyi hamle: ${best}`);
        } finally {
          setLaReplyThinking(false);
          laAutoReplyTimer.current = null;
        }
      })().catch(() => {
        setLaReplyThinking(false);
        laAutoReplyTimer.current = null;
      });
    }, 50);

    return () => {
      if (laAutoReplyTimer.current) {
        clearTimeout(laAutoReplyTimer.current);
        laAutoReplyTimer.current = null;
      }
    };
  }, [isLiveAnalysis, vsComputer, effectiveStudentTurnCode, studyBoardFen, laReplyThinking, selectedStudy?.id, effectiveChapter?.id, appendLiveMoveToChapter, getBestMoveWithTimeout]);

  const handlePieceDrop = useCallback(({ sourceSquare, targetSquare, piece }: { piece?: any; sourceSquare: string; targetSquare: string | null }) => {
    if (!sourceSquare || !targetSquare) return false;
    if (!effectiveChapter) return false;
    if (!studentMoveEnabled) {
      showFeedback('wrong', 'Taş oynatma kapalı');
      return false;
    }
    setBoardArrows([]);
    setCircleMarks({});
    setOptionSquares({});

    // ── LIVE ANALYSIS ────────────────────────────────────────────────────────
    if (isLiveAnalysis) {
      if (effectiveStudentTurnCode != null) {
        const turnCode = sideToMove(studyBoardFen) === 'white' ? 'w' : 'b';
        if (turnCode !== effectiveStudentTurnCode) {
          showFeedback('wrong', 'Sıra sende değil');
          return false;
        }
      }
      const beforeFen = studyBoardFen;
      const now = Date.now();
      const thinkMs = Math.max(0, now - lastActionMs);
      try {
        const game = makeBuilderGame(beforeFen);
        const result = game.move({ from: sourceSquare as any, to: targetSquare as any, promotion: 'q' });
        if (!result) { showFeedback('wrong'); return false; }
        setLastActionMs(now);
        void estimateMoveQuality(beforeFen, result.san);

        if (syncState) {
          const parentId = mainlineNodeIdForFen(syncState.tree, beforeFen);
          void makeMove(parentId, result.san);
        } else if (selectedStudy?.id && effectiveChapter?.id) {
          appendLiveMoveToChapter(selectedStudy.id, effectiveChapter.id, result.san);
          setFreePlayFen(game.fen());
        } else {
          setFreePlayFen(game.fen());
        }

        setCurrentMoveIndex(i => i + 1);
        logStudyEvent({
          studyId: selectedStudy?.id,
          chapterId: effectiveChapter?.id ?? selectedChapter?.id,
          studentId,
          moveIndex: currentMoveIndex,
          expectedMove: null,
          playedMove: result.san ?? result.lan ?? `${sourceSquare}-${targetSquare}`,
          result: 'correct',
          thinkMs,
        });
        showFeedback('correct');
        return true;
      } catch { showFeedback('wrong'); return false; }
    }

    // ── INTERACTIVE PUZZLE ─────────────────────────────────────────────────────
    const isInteractivePuzzle = effectiveChapter.lessonMode === 'interactive' && (effectiveChapter.interactiveType ?? 'puzzle') === 'puzzle';
    
    if (isInteractivePuzzle && !isComplete && currentMoveIndex < totalMoves) {
      const game = makeBuilderGame(currentFen);
      const expectedSan = chapterMovesForUi[currentMoveIndex];
      
      try {
        const result = game.move({ from: sourceSquare as any, to: targetSquare as any, promotion: 'q' });
        if (!result) { showFeedback('wrong'); return false; }
        const nextFen = game.fen();
        const now = Date.now();
        const thinkMs = Math.max(0, now - lastActionMs);

        // Matching logic
        const expectedGame = makeBuilderGame(currentFen);
        const expectedApplied = expectedSan ? applyMove(expectedGame, expectedSan) : null;
        const matchesMainline = expectedApplied && expectedGame.fen() === nextFen;

        let matchedNodeId: string | null = null;
        const currentPath = syncState?.currentPath || [];
        const currentNodeId = currentPath[currentPath.length - 1] || syncState?.tree?.rootId;
        const currentNode = currentNodeId ? syncState?.tree?.nodes[currentNodeId] : null;
        
        if (currentNode?.children) {
          for (const childId of currentNode.children) {
            const childNode = syncState?.tree?.nodes[childId];
            if (childNode && childNode.fen === nextFen) {
              matchedNodeId = childId;
              break;
            }
          }
        }

        let matched = false;
        if (matchesMainline || matchedNodeId) {
          matched = true;
        } else {
          const playedSan = (result.san || '').trim();
          const playedLan = (result.from + result.to).trim();
          const targetSan = (expectedSan || '').trim();
          if (playedSan === targetSan || playedLan === targetSan) {
            matched = true;
          }
        }

        if (matched) {
          setLastActionMs(now);
          const nextIdx = currentMoveIndex + 1;
          
          setChapterMoveAnalysis((prev) => [
            ...prev,
            {
              id: `${now}-${prev.length}`,
              moveNo: Math.floor(currentMoveIndex / 2) + 1,
              played: result.san ?? result.lan ?? `${sourceSquare}-${targetSquare}`,
              expected: expectedSan || 'variation',
              isCorrect: true,
              thinkMs,
              atIso: new Date(now).toISOString(),
            },
          ]);

          logStudyEvent({
            studyId: selectedStudy?.id,
            chapterId: effectiveChapter?.id ?? selectedChapter?.id,
            studentId,
            moveIndex: currentMoveIndex,
            expectedMove: expectedSan || 'variation',
            playedMove: result.san ?? result.lan ?? `${sourceSquare}-${targetSquare}`,
            result: nextIdx >= totalMoves ? 'solution' : 'correct',
            thinkMs,
          });

          setCurrentMoveIndex(nextIdx);
          void jumpToMoveIndex(nextIdx);

          if (nextIdx >= totalMoves) {
            const outcome = describeGameOutcomeFromFen(nextFen);
            showFeedback(
              'solved',
              outcome
                ? `${outcome.title}! ${outcome.subtitle}`
                : 'Tebrikler! Bu bölümü tamamladınız.',
            );
            recordProgress(progressKey ?? '', 100);
          } else {
            showFeedback('correct');
          }
          return true;
        } else {
          showFeedback('wrong');
          logStudyEvent({
            studyId: selectedStudy?.id,
            chapterId: effectiveChapter?.id ?? selectedChapter?.id,
            studentId,
            moveIndex: currentMoveIndex,
            expectedMove: expectedSan,
            playedMove: result.san,
            result: 'wrong',
            thinkMs,
          });
          return false;
        }
      } catch (e) {
        console.error('Puzzle move error:', e);
        showFeedback('wrong');
        return false;
      }
    }

    // ── DIRECT / SANDBOX / TAMAMLANMIŞ ──────────────────────────────────────────
    if (effectiveStudentTurnCode != null) {
      const turnCode = sideToMove(studyBoardFen) === 'white' ? 'w' : 'b';
      if (turnCode !== effectiveStudentTurnCode) {
        showFeedback('wrong', 'Sıra sende değil');
        return false;
      }
    }
    try {
      const game = makeBuilderGame(studyBoardFen);
      const result = game.move({ from: sourceSquare as any, to: targetSquare as any, promotion: 'q' });
      if (!result) return false;
      setFreePlayFen(game.fen());
      setLastActionMs(Date.now());
      return true;
    } catch {
      return false;
    }
  }, [selectedStudy, effectiveChapter, chapterMovesForUi, currentFen, currentMoveIndex, totalMoves, isComplete, isInteractive, isLiveAnalysis, showFeedback, recordProgress, effectiveStudentTurnCode, lastActionMs, studentId, studyBoardFen, estimateMoveQuality, appendLiveMoveToChapter, syncState, jumpToMoveIndex, progressKey, makeMove, studentMoveEnabled]);

  useEffect(() => () => {
    if (autoReplyTimer.current) clearTimeout(autoReplyTimer.current);
    if (laAutoReplyTimer.current) clearTimeout(laAutoReplyTimer.current);
  }, []);

  const goNextChapter = useCallback(() => {
    if (!selectedStudy) return;
    const next = selectedChapterIndex + 1;
    if (next < selectedStudy.chapters.length) { setSelectedChapterIndex(next); setCurrentMoveIndex(0); setFeedback(null); setFeedbackText(null); }
  }, [selectedStudy, selectedChapterIndex]);

  const goToMove = useCallback((idx: number) => {
    if (vsComputer && effectiveChapter) {
      const nMoves = vcHistory.length;
      const target = Math.max(0, Math.min(nMoves, idx));
      let startFen: string;
      try {
        startFen = fenToCurrentFen(effectiveChapter, 0);
      } catch {
        startFen = effectiveChapter.fen || DEFAULT_FEN;
      }
      const g = makeBuilderGame(startFen);
      for (let i = 0; i < target; i++) {
        const sanvc = vcHistory[i];
        if (!sanvc) break;
        try {
          const ok = g.move(sanvc);
          if (!ok) break;
        } catch {
          break;
        }
      }
      const newHist = vcHistory.slice(0, target);
      setVcHistory(newHist);
      setVcFen(g.fen());
      setCurrentMoveIndex(target);
      if (target < nMoves) setVcManualGameOver(false);
      else if (!g.isGameOver()) setVcManualGameOver(false);
      setFeedback(null);
      setFeedbackText(null);
      return;
    }

    const ch = moveListChapter ?? effectiveChapter;
    let target = idx;
    if (hideEngineForStudentPuzzle) {
      target = target <= 0 ? 0 : Math.min(target, currentMoveIndex);
    }
    if (ch && (totalMoves === 0 || isLiveAnalysis)) {
      setFreePlayFen(fenToCurrentFen(ch, totalMoves));
    } else {
      setFreePlayFen(null);
    }
    const nextIdx = Math.max(0, Math.min(totalMoves, target));
    setCurrentVariation(null);
    setCurrentMoveIndex(nextIdx);
    void jumpToMoveIndex(nextIdx);
    setFeedback(null);
    setFeedbackText(null);
  }, [vsComputer, effectiveChapter, vcHistory, moveListChapter, totalMoves, isLiveAnalysis, jumpToMoveIndex, hideEngineForStudentPuzzle, currentMoveIndex]);

  const navMaxPly = vsComputer ? vcHistory.length : totalMoves;

  const chapterForNav = moveListChapter ?? effectiveChapter;

  const goStudyPrev = useCallback(() => {
    if (currentVariation && chapterForNav) {
      const [mainLinePos, varGroupIdx, varMoveIdx] = currentVariation;
      if (varMoveIdx > 0) {
        setCurrentVariation([mainLinePos, varGroupIdx, varMoveIdx - 1]);
        void jumpToVariation(mainLinePos, varGroupIdx, varMoveIdx - 1);
      } else {
        setCurrentVariation(null);
        goToMove(mainLinePos);
      }
      return;
    }
    goToMove(currentMoveIndex - 1);
  }, [currentVariation, chapterForNav, jumpToVariation, goToMove, currentMoveIndex]);

  const goStudyNext = useCallback(() => {
    if (currentVariation && chapterForNav) {
      const [mainLinePos, varGroupIdx, varMoveIdx] = currentVariation;
      const line = chapterForNav.variations?.[mainLinePos]?.[varGroupIdx] ?? [];
      if (varMoveIdx < line.length - 1) {
        setCurrentVariation([mainLinePos, varGroupIdx, varMoveIdx + 1]);
        void jumpToVariation(mainLinePos, varGroupIdx, varMoveIdx + 1);
      } else {
        setCurrentVariation(null);
        goToMove(Math.min(totalMoves, mainLinePos + 1));
      }
      return;
    }
    goToMove(currentMoveIndex + 1);
  }, [currentVariation, chapterForNav, jumpToVariation, goToMove, totalMoves, currentMoveIndex]);

  const wheelPrev = useCallback(() => goStudyPrev(), [goStudyPrev]);
  const wheelNext = useCallback(() => goStudyNext(), [goStudyNext]);
  const studyBoardWheelRef = useChessWheelNavigation(wheelPrev, wheelNext, vsComputer || totalMoves > 0);

  const goStudyStart = useCallback(() => goToMove(0), [goToMove]);
  const goStudyEnd = useCallback(() => goToMove(navMaxPly), [goToMove, navMaxPly]);

  const canPlayBestMove = !!engineTopMove && studentMoveEnabled && !vsComputer && !hideEngineForStudentPuzzle;

  const playBestMove = useCallback(() => {
    if (!engineTopMove || !canPlayBestMove) return;
    handlePieceDrop({
      sourceSquare: engineTopMove.from,
      targetSquare: engineTopMove.to,
      piece: '',
    });
  }, [engineTopMove, canPlayBestMove, handlePieceDrop]);

  useStudyKeyboardShortcuts({
    enabled: !!selectedStudyId && !!selectedStudy && !vsComputer,
    goPrev: goStudyPrev,
    goNext: goStudyNext,
    goStart: goStudyStart,
    goEnd: goStudyEnd,
    flipBoard: flipStudentBoard,
    toggleEngine: () => toggleBoardSetting('showEngineAnalysis'),
    toggleBestMoveArrows: () => toggleBoardSetting('showBestMoveArrows'),
    toggleVariationArrows: () => toggleBoardSetting('showVariationArrows'),
    toggleEvalBar: () => toggleBoardSetting('showEvalBar'),
    toggleThreats: () => toggleBoardSetting('showThreats'),
    toggleInlineNotation: () => toggleBoardSetting('inlineNotation'),
    toggleSettingsPanel: () => setShowStudySettings((v) => !v),
    openHelp: () => setShowStudyHelp(true),
    playBestMove,
    canPlayBestMove,
  });

  const handleCopyText = useCallback((text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);
  const canExportCurrentStudy = useMemo(
    () => (selectedStudy ? canExportStudy(selectedStudy, auth) : false),
    [selectedStudy, auth]
  );

  const handleDownloadPgn = useCallback(() => {
    if (!selectedStudy || !effectiveChapter) return;
    if (!canExportStudy(selectedStudy, auth)) return;
    if (hideEngineForStudentPuzzle) return;
    try {
      const g = makeBuilderGame(effectiveChapter.fen || DEFAULT_FEN);
      (effectiveChapter.moves ?? []).forEach((m) => { try { applyMove(g, m); } catch {} });
      const pgn = g.pgn();
      const blob = new Blob([pgn], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedStudy.title}-${effectiveChapter.title || 'chapter'}.pgn`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {}
  }, [selectedStudy, effectiveChapter, hideEngineForStudentPuzzle, auth]);

  const handleStopVc = useCallback(() => {
    setVsComputer(false);
    setVcManualGameOver(false);
    if (studentId && effectiveChapter) {
      const all = loadVcProgress(studentId);
      delete all[effectiveChapter.id];
      saveVcProgress(studentId, all);
    }
  }, [studentId, effectiveChapter]);

  const handleRestartVc = useCallback(() => {
    if (isInteractive && !isLiveAnalysis && effectiveChapter) {
      const fen = effectiveChapter.fen || DEFAULT_FEN;
      setVcFen(fen);
      setVcHistory([]);
      setCurrentMoveIndex(0);
      setVcManualGameOver(false);
      setVsComputer(true);
      if (studentId) {
        const all = loadVcProgress(studentId);
        all[effectiveChapter.id] = { fen, history: [], gameOver: false };
        saveVcProgress(studentId, all);
      }
    }
  }, [isInteractive, isLiveAnalysis, effectiveChapter, studentId]);

  /** Bilgisayar karşısı bölümü: öğretmende olduğu gibi açılışta doğrudan oyun modu (Motor Pratiği tıklamadan). */
  useEffect(() => {
    const ch = selectedChapter ?? effectiveChapter;
    const isVcChapter =
      !!ch && ch.lessonMode === 'interactive' && ch.interactiveType === 'vsComputer';
    if (!isVcChapter) {
      setVsComputer(false);
      return;
    }

    const all = loadVcProgress(studentId);
    const saved = all[ch.id];

    if (saved) {
      setVcFen(saved.fen);
      setVcHistory(saved.history);
      setCurrentMoveIndex(Array.isArray(saved.history) ? saved.history.length : 0);
      setVcManualGameOver(saved.gameOver);
      setVsComputer(true);
    } else {
      let fen = ch.fen || DEFAULT_FEN;
      try {
        fen = fenToCurrentFen(ch, 0);
      } catch {
        /* chapter fen */
      }
      const side = ch.orientation === 'black' ? 'black' : 'white';
      setVcFen(fen);
      setVcOrientation(side);
      setVcHistory([]);
      setCurrentMoveIndex(0);
      setVsComputer(true);
      setVcManualGameOver(false);
      if (studentId) {
        const cur = loadVcProgress(studentId);
        cur[ch.id] = { fen, history: [], gameOver: false };
        saveVcProgress(studentId, cur);
      }
    }

    setVcLevel(20);
  }, [
    selectedChapter?.id,
    selectedChapter?.lessonMode,
    selectedChapter?.interactiveType,
    effectiveChapter?.id,
    effectiveChapter?.lessonMode,
    effectiveChapter?.interactiveType,
    studentId,
  ]);

  // Persist vsComputer moves
  useEffect(() => {
    if (vsComputer && studentId && effectiveChapter) {
      const all = loadVcProgress(studentId);
      all[effectiveChapter.id] = { fen: vcFen, history: vcHistory, gameOver: vcManualGameOver };
      saveVcProgress(studentId, all);
    }
  }, [vsComputer, studentId, effectiveChapter?.id, vcFen, vcHistory, vcManualGameOver]);

  const doComputerMove = useCallback(async (fen: string) => {
     setVcThinking(true);
     try {
       const game = makeBuilderGame(fen);
       const san = await getBestMoveAsync(game, vcLevel);
       if (san) {
         game.move(san);
         const nextFen = game.fen();
         let newHistory: string[] = [];
         setVcHistory((prev) => {
           newHistory = [...prev, san];
           return newHistory;
         });
         setVcFen(nextFen);
         setCurrentMoveIndex(newHistory.length);
         void updatePresencePayload({
           vsComputer: true,
           fen: nextFen,
           vcHistory: newHistory,
           history: newHistory,
           thinking: false,
           gameOver: game.isGameOver() || vcManualGameOver
         });
       }
     } finally { setVcThinking(false); }
  }, [vcLevel, vcManualGameOver, updatePresencePayload]);

  useEffect(() => {
    if (!vsComputer || vcThinking) return;
    const game = makeBuilderGame(vcFen);
    if (game.isGameOver()) return;
    const currentTurn = game.turn();
    const studentTurn = vcOrientation === 'white' ? 'w' : 'b';
    if (currentTurn !== studentTurn) {
      const timer = setTimeout(() => {
        void doComputerMove(vcFen);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [vsComputer, vcFen, vcOrientation, vcThinking, doComputerMove]);

  useEffect(() => {
    if (!vsComputer) return;
    const timer = setTimeout(() => {
      void updatePresencePayload({
        vsComputer: true,
        fen: vcFen,
        vcHistory: vcHistory,
        history: vcHistory,
        thinking: vcThinking,
        gameOver: isVcGameOver
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [vsComputer, vcFen, vcHistory, vcThinking, isVcGameOver, updatePresencePayload]);

  const handleVcDrop = useCallback(({ sourceSquare, targetSquare, piece }: { piece?: any; sourceSquare: string; targetSquare: string | null }) => {
    if (!sourceSquare || !targetSquare) return false;
    if (vcThinking) return false;
    const game = makeBuilderGame(vcFen);
    try {
      const result = game.move({ from: sourceSquare as any, to: targetSquare as any, promotion: 'q' });
      if (!result) return false;
      const nf = game.fen(); 
      setVcFen(nf); 
      const nextHistory = [...vcHistory, result.san];
      setVcHistory(nextHistory);
      setCurrentMoveIndex(nextHistory.length);

      // Immediate sync
      void updatePresencePayload({
        vsComputer: true,
        fen: nf,
        vcHistory: nextHistory,
        history: nextHistory,
        thinking: true,
        gameOver: game.isGameOver() || vcManualGameOver
      });

      if (!game.isGameOver()) doComputerMove(nf);
      return true;
    } catch { return false; }
  }, [vcFen, vcHistory, vcThinking, vcManualGameOver, doComputerMove, updatePresencePayload]);

  const canDragStudentPiece = useCallback(({ piece }: { piece?: { pieceType?: string } | string }) => {
    if (vsComputer) return true;
    const pieceType = typeof piece === 'string' ? piece : piece?.pieceType ?? '';
    const colorChar = typeof pieceType === 'string' ? pieceType.charAt(0) : '';
    if (!colorChar) return studentMoveEnabled;
    return canStudentDragPieceOnFen(studentPlaysColor, studyBoardFen, colorChar);
  }, [vsComputer, studentPlaysColor, studyBoardFen, studentMoveEnabled]);

  if (!selectedStudyId || !selectedStudy) {
    if (previewMode && previewStudyId) {
      return (
        <div className="flex flex-col h-full items-center justify-center bg-[#0d0f12] gap-4 p-6">
          {studies.length === 0 ? (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
              <p className="text-sm text-slate-400">Çalışma yükleniyor…</p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-400">Çalışma bulunamadı.</p>
              <button
                type="button"
                onClick={() => onExitPreview?.()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-bold text-white"
              >
                <ArrowLeft className="w-4 h-4" />
                Geri dön
              </button>
            </>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full bg-[#0d0f12] p-4 sm:p-6 lg:p-8 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
           <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Çalışmalar</h1>
           <div className="flex flex-wrap items-center gap-2">
             <div className="inline-flex rounded-xl border border-white/10 bg-slate-900/80 p-0.5">
               <button type="button" onClick={() => setStudyListCategory('mine')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${studyListCategory === 'mine' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'}`}>Çalışmalarım ({myStudies.length})</button>
               <button type="button" onClick={() => setStudyListCategory('teacher')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${studyListCategory === 'teacher' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'}`}>Öğretmenin paylaştıkları ({teacherStudies.length})</button>
             </div>
             {studyListCategory === 'mine' ? (
               <button type="button" onClick={createStudentStudy} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold uppercase tracking-wide"><Plus className="w-4 h-4" /> Yeni çalışma</button>
             ) : null}
             <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input type="text" value={listSearch} onChange={e => setListSearch(e.target.value)} placeholder="Ara..." className="w-full bg-slate-900 border border-white/5 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500/50" />
             </div>
           </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
           {displayedStudies.length === 0 ? (
             <div className="col-span-full py-16 text-center rounded-2xl border border-dashed border-white/10 bg-slate-900/30">
               <p className="text-slate-400 text-sm">
                 {studyListCategory === 'mine'
                   ? 'Henüz kendi çalışmanız yok. «Yeni çalışma» ile oluşturabilirsiniz.'
                   : 'Öğretmeniniz henüz sizinle çalışma paylaşmadı.'}
               </p>
             </div>
           ) : displayedStudies.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  const saved = loadStudySelection(studentId);
                  setSelectedStudyId(s.id);
                  setSelectedChapterIndex(saved.studyId === s.id ? saved.chapterIndex : 0);
                  setCurrentMoveIndex(0);
                }}
                className="p-6 rounded-3xl bg-slate-800/40 border border-white/5 hover:border-teal-500/30 transition-all text-left flex items-start gap-4 group"
              >
                 <span className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-3xl">{s.emoji}</span>
                 <div className="flex-1">
                    <h3 className="font-bold text-white group-hover:text-teal-400 mb-1">{s.title}</h3>
                    <p className="text-xs text-slate-500">{s.chapters.length} Bölüm</p>
                 </div>
              </button>
           ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 max-h-[100dvh] bg-[#0d0f12] text-slate-200 overflow-hidden font-sans">
      {previewMode && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-3 sm:px-4 py-2 border-b border-indigo-500/30 bg-indigo-500/10">
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="w-4 h-4 text-indigo-300 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest leading-none">Öğrenci önizlemesi</p>
              <p className="text-xs text-slate-300 truncate">{selectedStudy.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onExitPreview?.()}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Düzenlemeye dön
          </button>
        </div>
      )}
      <div className="flex flex-col lg:flex-row gap-0 lg:gap-4 flex-1 min-h-0 min-w-0 p-2 sm:p-4 pb-16 lg:pb-4">
        
        {/* ── LEFT: CHAPTERS / MEMBERS + CHAT ── */}
        <div className="hidden lg:flex w-72 shrink-0 flex-col min-h-0 rounded-sm bg-[#0f172a] border border-[rgba(255,255,255,0.05)] overflow-hidden">
          <button
            onClick={() => (previewMode ? onExitPreview?.() : setSelectedStudyId(null))}
            className="flex items-center gap-2 p-3 text-xs font-bold text-[#999] hover:text-[#bababa] border-b border-[rgba(255,255,255,0.05)] uppercase tracking-wider bg-[#1e293b]"
          >
            <ArrowLeft className="w-4 h-4" /> {previewMode ? 'Düzenlemeye dön' : 'Tüm Çalışmalar'}
          </button>
          <div className="px-2 py-2 border-b border-[rgba(255,255,255,0.05)] bg-[#0f172a] flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLeftTab('chapters')}
              className={`flex-1 py-2 rounded-sm text-[10px] font-black uppercase tracking-wider border ${
                leftTab === 'chapters' ? 'bg-[#1e293b] text-[#bababa] border-[rgba(255,255,255,0.05)]' : 'bg-transparent text-[#999] border-transparent hover:border-[rgba(255,255,255,0.05)]'
              }`}
            >
              Bölümler ({selectedStudy.chapters.length})
            </button>
            <button
              type="button"
              onClick={() => setLeftTab('members')}
              className={`flex-1 py-2 rounded-sm text-[10px] font-black uppercase tracking-wider border ${
                leftTab === 'members' ? 'bg-[#1e293b] text-[#bababa] border-[rgba(255,255,255,0.05)]' : 'bg-transparent text-[#999] border-transparent hover:border-[rgba(255,255,255,0.05)]'
              }`}
            >
              Üyeler ({selectedStudy.memberIds.length})
            </button>
          </div>

          {leftTab === 'chapters' && (
            <div className="p-2 border-b border-[rgba(255,255,255,0.05)] bg-[#0f172a]">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#777]" />
                <input
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  placeholder="Bölüm ara..."
                  className="w-full bg-[#1e1d1b] border border-[#444] rounded px-7 py-2 text-xs text-white outline-none focus:border-[#6366f1]/50"
                />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-2 space-y-0.5 bg-[#0f172a]">
            {leftTab === 'chapters' ? (
              filteredChapters.map(({ ch, idx }) => {
                const titleOverride =
                  effectiveChapter && effectiveChapter.id === ch.id ? effectiveChapter.title : undefined;
                const line = formatChapterListLabel(ch, {
                  titleOverride,
                  allChapters: selectedStudy.chapters,
                });
                return (
                <button
                  key={ch.id}
                  title={`${ch.id}`}
                  onClick={() => { setSelectedChapterIndex(idx); setCurrentMoveIndex(0); setFeedback(null); setFeedbackText(null); }}
                  className={`w-full flex items-center gap-2 p-2.5 rounded-sm text-left text-xs transition-colors ${
                    selectedChapterIndex === idx
                      ? 'bg-[#6366f1]/20 text-[#6366f1]'
                      : 'text-[#bababa] hover:bg-[rgba(255,255,255,0.05)]'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-sm flex items-center justify-center font-bold text-[10px] ${
                    selectedChapterIndex === idx ? 'bg-[#6366f1] text-white' : 'bg-[rgba(255,255,255,0.05)] text-[#999]'
                  }`}>{idx + 1}</span>
                  <span className="flex-1 truncate font-medium">{line}</span>
                </button>
                );
              })
            ) : (
              <div className="space-y-3">
                {memberStudents.length === 0 ? (
                  <div className="p-4 text-slate-500 text-xs text-center">Henüz üye eklenmedi.</div>
                ) : (
                  memberStudents.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 p-2.5 rounded-sm text-xs text-[#bababa] hover:bg-[rgba(255,255,255,0.05)] group">
                      <div className={`w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-black ${
                        m.kind === 'coach' ? 'bg-amber-500/20 text-amber-300' : 'bg-[rgba(255,255,255,0.05)] text-[#ddd]'
                      }`}>
                        {m.name.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate flex items-center gap-1.5">
                          <span>{m.name}</span>
                          {m.kind === 'coach' ? (
                            <span className="text-[9px] font-bold uppercase text-amber-400/90">Antrenör</span>
                          ) : null}
                        </div>
                        {(() => {
                          const p = formatPresence(presenceByUserId[String(m.id)]);
                          if (!p) return null;
                          return (
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] font-bold ${p.sticky ? 'text-[#6366f1]' : 'text-[#777]'}`}>
                                {p.sticky ? 'SYNC' : 'FREE'}
                              </span>
                              <span className="text-[10px] text-[#777] truncate">
                                {p.chapterTitle} · ply {p.ply}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                      {canManageMembers && String(m.id) !== String(studentId) ? (
                        <button
                          type="button"
                          onClick={() => removeStudyMember(m.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Üyeyi kaldır"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ))
                )}

                {canManageMembers ? (
                  <div className="pt-2 border-t border-[rgba(255,255,255,0.05)] space-y-3">
                    <p className="px-1 text-[10px] text-slate-500 uppercase tracking-widest font-bold flex items-center gap-1.5">
                      <UserPlus className="w-3 h-3" />
                      Üye ekle
                    </p>

                    {availableCoachesToAdd.length > 0 ? (
                      <div>
                        <p className="px-1 pb-1.5 text-[10px] text-amber-400/80 font-semibold">Antrenör</p>
                        <div className="space-y-1">
                          {availableCoachesToAdd.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => addStudyMember(c.id)}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 transition-all text-left"
                            >
                              <span className="text-xs text-amber-100 font-medium truncate">{c.name}</span>
                              <Plus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <p className="px-1 pb-1.5 text-[10px] text-slate-500 font-semibold">
                        {currentStudent?.group ? `Grup: ${currentStudent.group}` : 'Öğrenciler'}
                      </p>
                      {availableStudentsToAdd.length === 0 ? (
                        <p className="px-1 text-[11px] text-slate-500">Eklenebilecek öğrenci yok.</p>
                      ) : (
                        <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                          {availableStudentsToAdd.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => addStudyMember(m.id)}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-black/30 border border-white/5 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all text-left"
                            >
                              <span className="text-xs text-slate-200 font-medium truncate">{m.name}</span>
                              <Plus className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="px-2 text-[10px] text-slate-600 leading-relaxed">
                    Antrenörün bu çalışmayı görmesi için çalışma sahibi Üyeler sekmesinden antrenörü eklemelidir.
                  </p>
                )}
              </div>
            )}
          </div>

          {canUseChat && (
            <div className="border-t border-[rgba(255,255,255,0.05)] bg-[#0f172a] flex flex-col min-h-[180px] max-h-[34vh]">
              <div className="px-3 py-2 border-b border-[rgba(255,255,255,0.05)] text-[10px] font-black uppercase tracking-wider text-[#999] flex items-center justify-between">
                <span>Sohbet</span>
                <span className="text-[#666]">{(selectedStudy.chatMessages ?? []).length}</span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 bg-[#1e1d1b]">
                {(selectedStudy.chatMessages ?? []).slice(-80).map((m) => (
                  <div key={m.id} className="text-[11px] leading-snug">
                    <span className="text-indigo-400 font-bold">{m.user.replace(/\(Canlı Analiz\)/gi, '').trim()}:</span>{' '}
                    <span className="text-slate-200 whitespace-pre-wrap break-words">
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
              <form
                onSubmit={(e) => { e.preventDefault(); sendChat(); }}
                className="p-2 border-t border-[rgba(255,255,255,0.05)] flex gap-2 bg-[#0f172a]"
              >
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Mesaj yaz..."
                  className="flex-1 bg-[#1e1d1b] border border-[#444] rounded px-2 py-2 text-xs text-white outline-none focus:border-[#6366f1]/50"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="px-3 py-2 rounded bg-[#6366f1] hover:bg-[#2563eb] disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider"
                >
                  Gönder
                </button>
              </form>
            </div>
          )}

          <div className="p-3 border-t border-[rgba(255,255,255,0.05)] bg-[#1e293b] shrink-0">
             <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                   <Video className="w-4 h-4 text-[#6366f1]" />
                   <span className="text-[10px] font-bold text-[#999] uppercase tracking-wider">Canlı Yayın</span>
                </div>
                {showCallPanel && (
                  <button onClick={() => setShowCallPanel(false)} className="text-[10px] text-[#999] hover:text-[#bababa] font-bold">KAPAT</button>
                )}
             </div>
             {!showCallPanel ? (
               <button onClick={() => setShowCallPanel(true)} className="w-full py-2 rounded bg-[#6366f1]/20 hover:bg-[#6366f1]/30 text-[#6366f1] text-[10px] font-bold uppercase tracking-wider transition-colors">KATIL</button>
             ) : (
               <div className="mt-2">
                 <StudyCallPanel
                   role="student"
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
        </div>

        {/* ── CENTER: BOARD ── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 rounded-sm bg-[#1e293b] border border-[rgba(255,255,255,0.05)] overflow-hidden">
          <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[rgba(255,255,255,0.05)] bg-[#0f172a] flex flex-wrap items-center justify-between gap-2">
             <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setSelectedStudyId(null)}
                  className="lg:hidden shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
                  aria-label="Tüm çalışmalar"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span className="text-lg shrink-0">{selectedStudy.emoji}</span>
               <h2 className="font-bold text-[#bababa] tracking-tight text-xs sm:text-sm truncate min-w-0">
                 <span className="truncate">{selectedStudy.title}</span>
                 <span className="mx-1 sm:mx-2 text-[#555]">/</span>
                 <span className="text-[#6366f1] truncate">{effectiveChapter?.title ?? selectedChapter?.title}</span>
               </h2>
             </div>
             <select
               className="lg:hidden w-full sm:w-auto max-w-full text-xs bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-slate-200"
               value={selectedChapterIndex}
               onChange={(e) => { setSelectedChapterIndex(Number(e.target.value)); setCurrentMoveIndex(0); }}
             >
               {selectedStudy.chapters.map((ch, i) => (
                 <option key={ch.id} value={i}>{i + 1}. {ch.title}</option>
               ))}
             </select>
             {!sticky && behind > 0 && (
               <button
                 type="button"
                 onClick={() => { void catchUp(); }}
                 className="px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                 title="Canlı konuma yetiş"
               >
                 Geride: {behind}
               </button>
             )}
             {studentPlaysColor !== 'both' && (
               <span
                 className={`shrink-0 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                   studentMoveEnabled
                     ? 'text-indigo-200 bg-indigo-500/10 border-indigo-500/25'
                     : 'text-slate-400 bg-white/5 border-white/10'
                 }`}
                 title="Antrenörün belirlediği taş oynatma izni"
               >
                 {studentPlaysColorLabel(studentPlaysColor)}
               </span>
             )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 flex flex-col items-center justify-start gap-4 sm:gap-6 custom-scrollbar overflow-x-hidden">
             <div className="w-full max-w-full sm:max-w-[min(66vh,66vw)] relative">
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
                    onClick={() => setShowStudySettings((v) => !v)}
                    className={`p-2 rounded-lg border transition-all ${
                      showStudySettings
                        ? 'text-indigo-300 bg-indigo-500/15 border-indigo-500/30'
                        : 'text-slate-500 hover:text-indigo-300 hover:bg-white/5 border-transparent hover:border-white/10'
                    }`}
                    title="Tahta ayarları (h)"
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>
                </div>
                <ChessBoardFrame
                  boardOrientation={studentBoardOrientation}
                  boardClassName="rounded-sm overflow-hidden ring-1 ring-[rgba(255,255,255,0.05)]"
                  evalBar={
                    showEvalBar ? (
                      <ChessEvalBar score={evalScore} orientation={studentBoardOrientation} />
                    ) : undefined
                  }
                >
                <div ref={studyBoardWheelRef} className="absolute inset-0">
                    <Chessboard
                      key={effectiveChapter?.id || 'main'}
                      options={{
                        id: `student-board-${effectiveChapter?.id || 'main'}`,
                        position: studyBoardFen,
                        boardOrientation: studentBoardOrientation,
                        darkSquareStyle: { backgroundColor: '#5d768e' },
                        lightSquareStyle: { backgroundColor: '#c1c9d2' },
                        ...CHESSBOARD_ANIMATION,
                        ...CHESSBOARD_NO_NOTATION,
                        allowDragging: studentMoveEnabled,
                        canDragPiece: canDragStudentPiece,
                        onPieceDrop: ({ sourceSquare, targetSquare, piece }) => {
                          if (!sourceSquare || !targetSquare) return false;
                          const args = { sourceSquare, targetSquare, piece };
                          return vsComputer ? handleVcDrop(args) : handlePieceDrop(args);
                        },
                        squareStyles: studentMainMergedSquareStyles,
                        allowDrawingArrows: true,
                        arrows: (() => {
                          const seen = new Set<string>();
                          const merged: Array<{ startSquare: string; endSquare: string; color: string }> = [];
                          
                          for (const a of boardArrows) {
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

                          if (!vsComputer || isVcGameOver) {
                            if (!hideEngineForStudentPuzzle && boardSettings.showVariationArrows && engineHoverMove) {
                              const k = `${engineHoverMove.from.toLowerCase()}-${engineHoverMove.to.toLowerCase()}`;
                              if (!seen.has(k)) {
                                seen.add(k);
                                merged.push({ startSquare: engineHoverMove.from.toLowerCase(), endSquare: engineHoverMove.to.toLowerCase(), color: 'rgba(99,102,241,0.85)' });
                              }
                            } else if (
                              !hideEngineForStudentPuzzle
                              && boardSettings.showBestMoveArrows
                              && engineEnabled
                              && engineTopMove
                            ) {
                              const k = `${engineTopMove.from.toLowerCase()}-${engineTopMove.to.toLowerCase()}`;
                              if (!seen.has(k)) {
                                seen.add(k);
                                merged.push({ startSquare: engineTopMove.from.toLowerCase(), endSquare: engineTopMove.to.toLowerCase(), color: 'rgba(99,102,241,0.4)' });
                              }
                            }
                          }
                          for (const a of studentThreatArrows) {
                            const k = `${a.startSquare}-${a.endSquare}`;
                            if (!seen.has(k)) {
                              seen.add(k);
                              merged.push(a);
                            }
                          }
                          return merged;
                        })(),
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
                          setBoardArrows(filtered);
                        }
                      }}
                    />
                    {boardGameOutcome && (!vsComputer || isVcGameOver || !vcThinking) && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-2 pb-2 pt-10 bg-gradient-to-t from-black/80 via-black/35 to-transparent rounded-sm">
                        <div
                          className={`rounded-xl border px-3 py-2.5 shadow-lg ${
                            boardGameOutcome.kind === 'checkmate'
                              ? 'bg-rose-950/92 border-rose-400/45 text-rose-50'
                              : boardGameOutcome.kind === 'stalemate'
                                ? 'bg-amber-950/88 border-amber-400/40 text-amber-50'
                                : 'bg-slate-900/92 border-slate-500/40 text-slate-100'
                          }`}
                        >
                          <p className="text-sm font-black tracking-wide">{boardGameOutcome.title}</p>
                          <p className="text-[11px] font-medium opacity-95 mt-0.5 leading-snug">{boardGameOutcome.subtitle}</p>
                        </div>
                      </div>
                    )}
                    {vsComputer && vcThinking && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10 backdrop-blur-[2px] rounded-sm animate-in fade-in duration-300">
                        <div className="bg-[#1e293b]/90 border border-white/10 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
                          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs font-bold text-white uppercase tracking-widest">Bilgisayar Düşünüyor...</span>
                        </div>
                      </div>
                    )}
                </div>
                </ChessBoardFrame>
             </div>

             <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 bg-[#0f172a] p-2 rounded-sm border border-[rgba(255,255,255,0.05)]">
                <div className="flex items-center justify-center gap-0.5">
                  <button type="button" title="Tahtayı çevir (F)" onClick={() => setStudentBoardOrientation(o => o === 'white' ? 'black' : 'white')} className="p-2.5 sm:p-2 rounded-sm hover:bg-[rgba(255,255,255,0.05)] text-[#999] hover:text-[#bababa] transition-colors"><FlipHorizontal className="w-4 h-4" /></button>
                  <div className="w-px h-5 bg-[rgba(255,255,255,0.05)] mx-0.5" />
                  <button onClick={() => goToMove(0)} className="p-2.5 sm:p-2 rounded-sm hover:bg-[rgba(255,255,255,0.05)] text-[#999] hover:text-[#bababa] transition-colors"><SkipBack className="w-4 h-4" /></button>
                  <button onClick={() => goToMove(currentMoveIndex - 1)} className="p-2.5 sm:p-2 rounded-sm hover:bg-[rgba(255,255,255,0.05)] text-[#999] hover:text-[#bababa] transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={() => goToMove(currentMoveIndex + 1)} className="p-2.5 sm:p-2 rounded-sm hover:bg-[rgba(255,255,255,0.05)] text-[#999] hover:text-[#bababa] transition-colors"><ChevronRight className="w-4 h-4" /></button>
                  <button onClick={() => goToMove(navMaxPly)} className="p-2.5 sm:p-2 rounded-sm hover:bg-[rgba(255,255,255,0.05)] text-[#999] hover:text-[#bababa] transition-colors"><SkipForward className="w-4 h-4" /></button>
                  <div className="w-px h-5 bg-[rgba(255,255,255,0.05)] mx-0.5" />
                  <button onClick={() => goToMove(0)} className="p-2.5 sm:p-2 rounded-sm hover:bg-[rgba(255,255,255,0.05)] text-[#999] hover:text-[#bababa] transition-colors"><RotateCcw className="w-4 h-4" /></button>
                </div>
             </div>
             <div className="w-full sm:max-w-[min(66vh,66vw)] min-w-0">
               <StudyBottomTools
                 study={selectedStudy}
                   chapter={moveListChapter ?? effectiveChapter ?? selectedChapter}
                 activeTab={bottomTab}
                 currentMoveIndex={currentMoveIndex}
                 currentFen={studyBoardFen}
                 chatMessages={selectedStudy.chatMessages ?? []}
                 moveAnalysisEntries={studentBottomAnalysisEntries}
                 totalThinkLabel={formatDuration(totalThinkMs)}
                 totalCorrectThinkLabel={formatDuration(totalCorrectThinkMs)}
                 totalWrongThinkLabel={formatDuration(totalWrongThinkMs)}
                 onTabChange={setBottomTab}
                 onAddTag={() => {}}
                 onRemoveTag={() => {}}
                 onSaveComment={() => {}}
                 onAddAnnotation={() => {}}
                 onSelectChapter={(idx) => { setSelectedChapterIndex(idx); setCurrentMoveIndex(0); }}
                 onDownloadPgn={handleDownloadPgn}
                 canExportPgn={canExportCurrentStudy}
                 onCopyText={handleCopyText}
                 currentUserName={studentName}
                 studentsData={[]}
                 isAdminView={false}
                 readOnly
                 onSendLiveNote={sendLiveNoteFromBottom}
               />
             </div>
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className="hidden lg:flex w-80 shrink-0 flex-col min-h-0 rounded-sm bg-[#0f172a] border border-[rgba(255,255,255,0.05)] overflow-hidden">
          {!hideEngineForStudentPuzzle && (!vsComputer || isVcGameOver) && (
            (boardSettings.showEngineAnalysis
              || boardSettings.showEvalBar
              || boardSettings.showBestMoveArrows
              || boardSettings.showVariationArrows) && (
            <EngineAnalysis
              fen={studyBoardFen}
              enabled={
                engineEnabled
                || boardSettings.showEvalBar
                || boardSettings.showBestMoveArrows
                || boardSettings.showVariationArrows
              }
              onToggle={() => toggleBoardSetting('showEngineAnalysis')}
              onHoverMove={setEngineHoverMove}
              onTopMoveUpdate={setEngineTopMove}
              onEvalScoreChange={setEvalScore}
              onOpenBoardPrefs={() => setShowStudySettings(true)}
            />
          ))}

          <div className="flex-1 overflow-y-auto bg-[#1e293b] border-t border-[rgba(255,255,255,0.05)]">
            {!vsComputer ? (
              hideEngineForStudentPuzzle ? (
                <div className="p-4 min-h-[140px] flex flex-col items-center justify-center text-center border-b border-white/5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Hamle geçmişi</p>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-[260px]">
                    Bulmacada çözüm hamleleri gizlidir. Hamlenizi tahtada oynayın; ipucu ve çözüm için alttaki butonları kullanın.
                  </p>
                  {puzzlePlayNorm?.setupMoveSan ? (
                    <p className="text-xs text-sky-300/90 mt-3">
                      Rakip hamle: <span className="font-mono font-bold">{puzzlePlayNorm.setupMoveSan}</span>
                    </p>
                  ) : null}
                </div>
              ) : (
                <StudyMoveTree
                  chapter={moveListChapter ?? effectiveChapter ?? selectedChapter}
                  currentMoveIndex={currentMoveIndex}
                  currentVariation={currentVariation}
                  inlineNotation={boardSettings.inlineNotation}
                  figurineNotation={boardSettings.figurineNotation}
                  showMoveAnnotations={boardSettings.showMoveAnnotations}
                  tree={syncState?.tree}
                  currentPath={syncState?.currentPath}
                  onSelectPath={(path) => { void jumpToNodePath(path); }}
                  onSelectMove={(idx, varData) => {
                    if (varData) {
                      setCurrentVariation(varData);
                      setCurrentMoveIndex(varData[0]);
                      void jumpToVariation(varData[0], varData[1], varData[2]);
                    } else {
                      setCurrentVariation(null);
                      goToMove(idx);
                    }
                  }}
                  onHoverMove={(idx, varInfo) => {
                    if (varInfo && moveListChapter) {
                      setHoverPly(null);
                      const previewFen = liveLessonFenAt(
                        moveListChapter.fen || DEFAULT_FEN,
                        moveListChapter.moves ?? [],
                        moveListChapter.variations ?? {},
                        varInfo[0],
                        varInfo,
                      );
                      if (isComplete) setHoverPly(varInfo[2]);
                      else setFreePlayFen(previewFen);
                    } else if (idx !== null) {
                      setHoverPly(idx);
                      if (!isComplete && (totalMoves === 0 || isLiveAnalysis)) {
                        const ch = moveListChapter ?? effectiveChapter;
                        if (ch) setFreePlayFen(fenToCurrentFen(ch, idx));
                      }
                    } else {
                      setHoverPly(null);
                      if (!isComplete && (totalMoves === 0 || isLiveAnalysis)) {
                        const ch = moveListChapter ?? effectiveChapter;
                        if (ch) setFreePlayFen(fenToCurrentFen(ch, totalMoves));
                      }
                    }
                  }}
                />
              )
            ) : (
              <div className="p-4 flex flex-col h-full">
                {isVcGameOver && (
                  <div className="mb-4 bg-emerald-500/20 border border-emerald-500/50 rounded-lg p-3 text-center shadow-lg">
                    <span className="text-emerald-400 font-bold text-sm tracking-wide">Oyun Bitti!</span>
                  </div>
                )}
                <div className="flex items-center gap-3 mb-5 px-1">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm shadow-inner">
                    {studentName?.[0] || 'Ö'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] leading-tight mb-0.5">Katılımcı</p>
                    <p className="text-sm font-bold text-slate-200 truncate">{studentName || 'Öğrenci'}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Hamle Geçmişi</div>
                    <div className="text-[10px] font-bold text-indigo-400/70 bg-indigo-500/10 px-2 py-0.5 rounded-full uppercase tracking-tighter">Bilgisayara Karşı</div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
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
                        {Array.from({ length: Math.ceil(vcHistory.length / 2) }).map((_, i) => {
                          const wPly = i * 2 + 1;
                          const bPly = i * 2 + 2;
                          const isWActive = currentMoveIndex === wPly;
                          const isBActive = currentMoveIndex === bPly;
                          
                          return (
                            <tr key={i} className="group transition-all">
                              <td data-label="#" className="py-2.5 pl-2 text-slate-600 font-bold bg-white/[0.02] rounded-l-lg group-hover:text-slate-400 transition-colors">{i + 1}.</td>
                              <td 
                                data-label="BEYAZ"
                                onClick={() => goToMove(wPly)}
                                className={`py-2.5 px-2 font-bold cursor-pointer transition-all bg-white/[0.02] ${
                                  isWActive ? 'text-white bg-indigo-500/40 shadow-[inset_0_0_10px_rgba(99,102,241,0.3)]' : 'text-slate-200 hover:bg-white/[0.05]'
                                }`}
                              >
                                {vcHistory[i * 2]}
                              </td>
                              <td 
                                data-label="SİYAH"
                                onClick={() => vcHistory[i * 2 + 1] && goToMove(bPly)}
                                className={`py-2.5 px-2 font-bold cursor-pointer transition-all bg-white/[0.02] rounded-r-lg ${
                                  isBActive ? 'text-white bg-indigo-500/40 shadow-[inset_0_0_10px_rgba(99,102,241,0.3)]' : 'text-indigo-400 hover:bg-white/[0.05]'
                                }`}
                              >
                                {vcHistory[i * 2 + 1] || ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </ResponsiveTable>
                    
                    {vcHistory.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 opacity-30 grayscale pointer-events-none">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
                          <MousePointer2 className="w-6 h-6 text-slate-400" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Henüz hamle yapılmadı</span>
                      </div>
                    )}
                  </div>

                  {!isVcGameOver && (
                    <button 
                      onClick={() => setVcManualGameOver(true)}
                      className="shrink-0 mt-4 py-3.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg"
                    >
                      <X className="w-3.5 h-3.5" />
                      OYUNU BİTİR
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {(isInteractive || isLiveAnalysis) && (
            <div className="border-t border-white/5 bg-[#0f172a] p-4 flex flex-col gap-4">
              <div className="relative flex items-end gap-3 group">
                <div className={`flex-1 relative p-4 rounded-2xl border shadow-2xl transition-all duration-300 ${
                  feedback === 'correct' ? 'bg-emerald-500/10 border-emerald-500/30' :
                  feedback === 'solved' ? 'bg-indigo-500/10 border-indigo-500/30' :
                  feedback === 'wrong' ? 'bg-rose-500/10 border-rose-500/30' :
                  'bg-[#1e293b] border-white/5'
                }`}>
                  <p className={`text-sm font-medium leading-relaxed ${
                    feedback === 'correct' ? 'text-emerald-400' :
                    feedback === 'solved' ? 'text-indigo-400' :
                    feedback === 'wrong' ? 'text-rose-400' :
                    'text-slate-200'
                  }`}>
                    {feedbackText || (laHint && `${laHint}`) || scenarioText || (feedback === 'correct' ? 'İyi hamle!' : feedback === 'solved' ? 'Tebrikler! Bu dersi tamamladınız.' : (feedback === 'wrong' ? 'Yanlış hamle, tekrar dene.' : 'Burada hangi hamleyi yapardınız?'))}
                  </p>
                  
                  <div className={`absolute -right-2 bottom-4 w-4 h-4 rotate-45 border-r border-b transition-colors duration-300 ${
                    feedback === 'correct' ? 'bg-[#152926] border-emerald-500/30' :
                    feedback === 'solved' ? 'bg-[#1a1c3d] border-indigo-500/30' :
                    feedback === 'wrong' ? 'bg-[#2d1b1e] border-rose-500/30' :
                    'bg-[#1e293b] border-white/5'
                  }`} />
                </div>

                <div className="w-12 h-12 shrink-0 text-indigo-500 animate-bounce-slow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
                    <circle cx="9" cy="10" r="1" fill="currentColor" />
                    <circle cx="15" cy="10" r="1" fill="currentColor" />
                    <path d="M8 15s1.5 2 4 2 4-2 4-2" />
                    <path d="M2 12h2M20 12h2M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41" />
                  </svg>
                </div>
              </div>

              <div className="flex gap-2">
                {feedback === 'solved' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentMoveIndex(0);
                      setFeedback(null);
                      setFeedbackText(null);
                      void jumpToMoveIndex(0);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                  >
                    <RefreshCw className="w-4 h-4" />
                    TEKRAR OYNA
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => { void requestHint(); }}
                      disabled={laHintThinking || laAnalyzing || laReplyThinking}
                      className="flex-1 py-2.5 px-4 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition-all border border-white/5 disabled:opacity-40"
                    >
                      {laHintThinking ? 'HAZIRLANIYOR...' : 'İPUCU GÖSTER'}
                    </button>
                    {isInteractive && !isLiveAnalysis && (
                      <button
                        type="button"
                        onClick={() => { void showSolution(); }}
                        className="flex-1 py-2.5 px-4 bg-white/5 hover:bg-white/10 text-slate-400 rounded-xl text-xs font-bold transition-all border border-white/5"
                      >
                        ÇÖZÜMÜ GÖSTER
                      </button>
                    )}
                  </>
                )}
              </div>

              {isLiveAnalysis && (
                <div className="space-y-2 mt-2 pt-4 border-t border-white/5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Antrenöre Not</p>
                  <div className="flex gap-2">
                    <input
                      value={replyToCoach}
                      onChange={(e) => setReplyToCoach(e.target.value)}
                      placeholder="Hamle fikrin..."
                      className="flex-1 bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/40"
                    />
                    <button
                      type="button"
                      onClick={sendLiveAnalysisNote}
                      disabled={!replyToCoach.trim()}
                      className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition-all"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {liveAnalysisNote && <p className="text-[10px] text-indigo-400 font-bold">{liveAnalysisNote}</p>}
                </div>
              )}
            </div>
          )}

          <div className="p-3 border-t border-[rgba(255,255,255,0.05)] bg-[#1e293b] shrink-0">
            <button
              onClick={goNextChapter}
              disabled={selectedChapterIndex >= (selectedStudy.chapters.length - 1)}
              className="w-full py-3 rounded bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-30 text-black text-xs font-black uppercase tracking-wider transition-colors"
            >
              Sonraki Bölüm
            </button>
          </div>
        </div>
      </div>

      <StudyKeyboardHelpModal open={showStudyHelp} onClose={() => setShowStudyHelp(false)} />
      <StudyBoardSettingsPanel
        open={showStudySettings}
        onClose={() => setShowStudySettings(false)}
        settings={boardSettings}
        onToggle={toggleBoardSetting}
      />
    </div>
  );
};

export default StudentStudyView;
