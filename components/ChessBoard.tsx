import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, Square } from 'chess.js';
import { 
  RotateCcw, Trash2, History, Edit3, Layout, Eraser, 
  UserPlus, BarChart2, Save, Loader2,
  MousePointer2, Grid, CheckCircle2,
  Download, Upload, Search, Filter, X, ExternalLink, Zap, FileText, FileImage,
  Plus, Calendar, Users, BookOpen, Clock, ChevronDown, ChevronUp, Eye, Trash, Check, CheckSquare, AlertCircle,
  Sparkles, TrendingUp, PieChart, Target, RefreshCw, ClipboardList, Layers, FolderOpen
} from 'lucide-react';
import { useApp } from '../AppContext';
import { getBestMoveAsync, getEvaluationPawns, getEvaluationPawnsAsync, type EngineLevel } from '../services/chessEngine';
import { stopAnalysis as stopStockfishAnalysis } from '../services/stockfishService';
import { imageToFen, imageToFenMultiple, formatOpenRouterError, type ImageBoardResult } from '../services/geminiService';
import {
  parseCSVLine,
  csvRowToPuzzle,
  fetchLichessDailyPuzzle,
  fetchLichessPuzzlesFiltered,
  puzzleHasLichessTheme,
  lichessPuzzleFileToText,
  THEME_TR,
} from '../services/lichessService';
import { pdfAllPagesToDataUrls } from '../services/pdfToImage';
import { loadStudiesAsync, saveStudyAsync } from '../studyStorage';
import { loadStudyCategories, type StudyCategoryMeta } from '../studyCategoriesStorage';
import type { Puzzle } from '../types';
import type { Study } from '../lib/studyTypes';
import { genId, migrateStudy, migrateChapter } from '../lib/studyUtils';
import { useChessWheelNavigation } from '../hooks/useChessWheelNavigation';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION } from '../lib/chessBoardUi';
import { ChessBoardFrame } from './chess/ChessBoardFrame';
import { isBoardFlipShortcutKey, keyboardTargetAllowsBoardShortcut } from '../lib/boardFlipShortcut';

/** SAN hamlesini Unicode taş sembollü metne çevirir (♔♕♖♗♘ / ♚♛♜♝♞) */
function sanToSymbol(san: string): string {
  if (!san || san.startsWith('O-') || /^[a-h]/.test(san)) return san; // rok, piyon
  const piece: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' };
  const first = san[0];
  return (piece[first] ?? first) + san.slice(1);
}

/** Oyun geçmişinden numaralı beyaz/siyah çiftleri üretir. startsWithWhite=false ise FEN siyah sıra ile başlamıştır (ilk kayıt siyah). */
function buildMoveRows(
  history: string[],
  startsWithWhite: boolean = true
): { num: number; white: string; black: string; rowStart: number; rowEnd: number }[] {
  const rows: { num: number; white: string; black: string; rowStart: number; rowEnd: number }[] = [];
  if (startsWithWhite) {
    for (let i = 0; i < history.length; i += 2) {
      const num = Math.floor(i / 2) + 1;
      const hasBlack = !!(history[i + 1]);
      rows.push({
        num,
        white: history[i] ? sanToSymbol(history[i]) : '',
        black: history[i + 1] ? sanToSymbol(history[i + 1]) : '',
        rowStart: i + 1,
        rowEnd: hasBlack ? i + 2 : i + 1,
      });
    }
  } else {
    if (history.length === 0) return rows;
    rows.push({
      num: 1,
      white: '',
      black: history[0] ? sanToSymbol(history[0]) : '',
      rowStart: 1,
      rowEnd: 1,
    });
    for (let i = 1; i < history.length; i += 2) {
      const num = Math.floor(i / 2) + 2;
      const hasBlack = !!(history[i + 1]);
      rows.push({
        num,
        white: history[i] ? sanToSymbol(history[i]) : '',
        black: history[i + 1] ? sanToSymbol(history[i + 1]) : '',
        rowStart: i + 1,
        rowEnd: hasBlack ? i + 2 : i + 1,
      });
    }
  }
  return rows;
}

/** Başlangıç FEN + geçmiş ile verilen yarım hamle sonrasındaki FEN (0 = başlangıç). Tıklanınca tahta bu pozisyona gider. */
function getFenAtHalfMove(initialFen: string, history: string[], halfMoveCount: number, currentFen: string): string {
  if (halfMoveCount <= 0) return initialFen;
  if (halfMoveCount >= history.length) return currentFen;
  let c: Chess;
  try {
    c = new Chess(initialFen);
  } catch {
    try {
      c = new Chess(initialFen, { skipValidation: true });
    } catch {
      return currentFen;
    }
  }
  for (let i = 0; i < halfMoveCount && i < history.length; i++) {
    try {
      if (!c.move(history[i])) break;
    } catch {
      break;
    }
  }
  return c.fen();
}

/** Tahtanın kurallara uygun olup olmadığını denetler (örneğin kaydederken). Geçersizse Türkçe hata mesajı döner. */
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

const ChessBoard: React.FC = () => {
  const { puzzles, addPuzzle, importPuzzles, clearPuzzles, deletePuzzle, students, homeworks, addHomework, updateHomework, deleteHomework, showToast } = useApp();
  const [activeTab, setActiveTab] = useState<'editor' | 'puzzles' | 'assign' | 'analysis'>('editor');
  
  const [showImportModal, setShowImportModal] = useState(false);
  const [importProgress, setImportProgress] = useState<{ loading: boolean; message: string; count: number; total: number }>({ loading: false, message: '', count: 0, total: 0 });
  const [importFilter, setImportFilter] = useState({ minRating: 1400, maxRating: 2800, count: 500, themes: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [puzzleSearch, setPuzzleSearch] = useState('');
  const [puzzleDiffFilter, setPuzzleDiffFilter] = useState<string>('all');
  const [puzzleCatFilter, setPuzzleCatFilter] = useState<string>('all');
  const [puzzleThemeFilter, setPuzzleThemeFilter] = useState<string>('all');
  const [puzzleSourceFilter, setPuzzleSourceFilter] = useState<'all' | 'lichess' | 'custom'>('all');
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedPuzzleIds, setSelectedPuzzleIds] = useState<string[]>([]);

  // Ödev Ata state
  const [hwMode, setHwMode] = useState<'list' | 'create'>('list');
  const [hwTitle, setHwTitle] = useState('');
  const [hwDueDate, setHwDueDate] = useState('');
  const [hwSelectedPuzzles, setHwSelectedPuzzles] = useState<string[]>([]);
  const [hwAssignMode, setHwAssignMode] = useState<'students' | 'groups'>('groups');
  const [hwSelectedStudents, setHwSelectedStudents] = useState<string[]>([]);
  const [hwSelectedGroups, setHwSelectedGroups] = useState<string[]>([]);
  const [hwPuzzleSearch, setHwPuzzleSearch] = useState('');
  const [hwExpandedId, setHwExpandedId] = useState<string | null>(null);

  const DEFAULT_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const [game, setGame] = useState(new Chess());
  /** Oyunun başlangıç pozisyonu (FEN). makeAMove geçmişi buradan yeniden oynatır; yanlış hamlede sıfırlanmayı önler. */
  const [gameInitialFen, setGameInitialFen] = useState(DEFAULT_START_FEN);
  const [importString, setImportString] = useState(game.fen());
  
  useEffect(() => { setImportString(game.fen()); }, [game]);

  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const [lastMoveSquares, setLastMoveSquares] = useState<Record<string, React.CSSProperties>>({});
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [isThinking, setIsThinking] = useState(false);
  const [vsComputer, setVsComputer] = useState(false);
  const [computerLevel] = useState<EngineLevel>(5);
  const [puzzlePlayMode, setPuzzlePlayMode] = useState<'computer' | 'solution'>('solution');
  const [solutionFeedback, setSolutionFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  
  const { stockfishReady, stockfishLoading } = useApp();
  const [evalScore, setEvalScore] = useState(0);
  const [tool, setTool] = useState<string>('cursor');
  /** Taş ekleme modunda imlecin yanında gösterilecek taş için mouse pozisyonu */
  const [pieceCursorPos, setPieceCursorPos] = useState<{ x: number; y: number } | null>(null);
  
  const [puzzleTitle, setPuzzleTitle] = useState('');
  const [difficulty, setDifficulty] = useState<'Kolay' | 'Orta' | 'Zor'>('Zor');
  const [points, setPoints] = useState(10);
  const [theme, setTheme] = useState('');
  const [hint, setHint] = useState('');
  const [solutionMoves, setSolutionMoves] = useState<string[]>([]);
  const [studentVsComputer, setStudentVsComputer] = useState(true);
  const [interactiveMode, setInteractiveMode] = useState<'none' | 'puzzle' | 'liveAnalysis' | 'vsComputer'>('none');
  const [studySaveSuccess, setStudySaveSuccess] = useState(false);
  /** Bulmacayı çalışmaya aktarırken hedef seçimi */
  const [studiesPickerList, setStudiesPickerList] = useState<Study[]>([]);
  const [studyPickerCategories, setStudyPickerCategories] = useState<StudyCategoryMeta[]>([]);
  const [studyPickerLoading, setStudyPickerLoading] = useState(false);
  /** '__new__' = yeni çalışma; aksi halde mevcut çalışma id (bölüm eklenir) */
  const [saveAsStudyTargetId, setSaveAsStudyTargetId] = useState<string>('__new__');
  /** Çalışmaya gidecek yeni bölümün görünen adı; boşsa bulmaca başlığı kullanılır */
  const [exportChapterTitleDraft, setExportChapterTitleDraft] = useState('');
  /** Editör sağ panel: sekme (tahta kontrolleri / bulmaca formu / çalışma aktarımı) */
  const [editorSidebarTab, setEditorSidebarTab] = useState<'board' | 'puzzle' | 'study'>('board');
  /** Hamle listesinden görüntülenen pozisyon: null = güncel, 0 = başlangıç, k = k yarım hamle sonrası */
  const [browseIndex, setBrowseIndex] = useState<number | null>(null);
  /** FEN'den yüklendiğinde ilk kaydedilen hamle beyaz mı? (false = bulmaca siyah ile başlıyor, sütunları doğru eşleştir) */
  const [recordedHistoryStartsWithWhite, setRecordedHistoryStartsWithWhite] = useState(true);
  const [hoverFen, setHoverFen] = useState<string | null>(null);
  const moveListScrollRef = useRef<HTMLDivElement>(null);
  const activeMoveRowRef = useRef<HTMLButtonElement | null>(null);

  const refreshStudiesForPicker = useCallback(() => {
    setStudyPickerLoading(true);
    void Promise.all([loadStudiesAsync(), Promise.resolve(loadStudyCategories())])
      .then(([studies, cats]) => {
        setStudiesPickerList(studies ?? []);
        setStudyPickerCategories(cats);
      })
      .catch(() => {
        setStudiesPickerList([]);
        setStudyPickerCategories(loadStudyCategories());
      })
      .finally(() => setStudyPickerLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab !== 'editor') return;
    refreshStudiesForPicker();
  }, [activeTab, refreshStudiesForPicker]);

  useEffect(() => {
    if (saveAsStudyTargetId === '__new__') return;
    if (!studiesPickerList.some((s) => s.id === saveAsStudyTargetId)) {
      setSaveAsStudyTargetId('__new__');
    }
  }, [studiesPickerList, saveAsStudyTargetId]);

  const studiesSortedForPicker = useMemo(() => {
    const cat = (id: string | null | undefined) => {
      if (!id) return 'Kategorisiz';
      return studyPickerCategories.find((c) => c.id === id)?.name ?? 'Kategorisiz';
    };
    return [...studiesPickerList].sort((a, b) => {
      const ca = cat(a.categoryId ?? null);
      const cb = cat(b.categoryId ?? null);
      if (ca !== cb) return ca.localeCompare(cb, 'tr');
      return (a.title || '').localeCompare(b.title || '', 'tr');
    });
  }, [studiesPickerList, studyPickerCategories]);

  const exportTargetStudy = useMemo(() => {
    if (saveAsStudyTargetId === '__new__') return null;
    return studiesPickerList.find((s) => s.id === saveAsStudyTargetId) ?? null;
  }, [saveAsStudyTargetId, studiesPickerList]);

  useEffect(() => {
    if (activeTab !== 'editor') {
      stopStockfishAnalysis();
      return;
    }
    let cancelled = false;
    const updateEval = async () => {
      try {
        const dFen = browseIndex === null ? game.fen() : getFenAtHalfMove(gameInitialFen, game.history(), browseIndex, game.fen());
        const score = await getEvaluationPawnsAsync(new Chess(dFen));
        if (!cancelled) setEvalScore(score);
      } catch {
        if (!cancelled) setEvalScore(0);
      }
    };
    updateEval();
    return () => {
      cancelled = true;
      stopStockfishAnalysis();
    };
  }, [game, browseIndex, gameInitialFen, activeTab]);

  // Seçili hamle satırını, sadece hamle listesi içinde kaydır (sayfanın tamamını aşağı itme)
  useEffect(() => {
    const container = moveListScrollRef.current;
    const row = activeMoveRowRef.current;
    if (!container || !row) return;
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    // Satır, liste içinde çok yukarıda/aşağıda ise listeyi ortalamaya yakın kaydır
    const offset = row.offsetTop - container.offsetTop;
    const targetTop = offset - container.clientHeight / 2 + row.clientHeight / 2;
    container.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' });
  }, [game, browseIndex]);

  const isPieceTool = tool.length === 2 && (tool[0] === 'w' || tool[0] === 'b') && /^[KQRBNP]$/i.test(tool[1]);
  useEffect(() => {
    if (!isPieceTool) {
      setPieceCursorPos(null);
      return;
    }
    const onMove = (e: MouseEvent) => setPieceCursorPos({ x: e.clientX, y: e.clientY });
    const onLeave = () => setPieceCursorPos(null);
    window.addEventListener('mousemove', onMove);
    document.body.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.body.removeEventListener('mouseleave', onLeave);
    };
  }, [isPieceTool]);

  // Move Highlighting — green dots for valid moves, green bg for selected piece
  const getMoveOptions = useCallback((square: string) => {
    let copy: Chess;
    try {
      copy = new Chess(game.fen());
    } catch {
      try { copy = new Chess(game.fen(), { skipValidation: true }); } catch { setOptionSquares({}); return; }
    }
    const moves = copy.moves({ square: square as Square, verbose: true });
    const newSquares: Record<string, React.CSSProperties> = {};
    moves.forEach((move) => {
      const isCapture = copy.get(move.to as Square);
      if (isCapture) {
        newSquares[move.to] = {
          background: "radial-gradient(circle, transparent 55%, rgba(0,0,0,0.12) 55%, rgba(0,0,0,0.12) 68%, transparent 68%)",
        };
      } else {
        newSquares[move.to] = {
          background: "radial-gradient(circle, rgba(0,0,0,0.14) 24%, transparent 24%)",
        };
      }
    });
    newSquares[square] = { background: "rgba(255, 255, 50, 0.4)" };
    setOptionSquares(newSquares);
    return moves.length > 0;
  }, [game]);

  // Safe Move — geçmişi korumak için her zaman gameInitialFen + history replay; yanlış hamlede sıfırlamaz
  const makeAMove = useCallback((move: any) => {
    let copy: Chess;
    try {
      copy = new Chess(gameInitialFen);
    } catch {
      try {
        copy = new Chess(gameInitialFen, { skipValidation: true });
      } catch {
        return false;
      }
    }
    const prevHistory = game.history();
    for (const san of prevHistory) {
      try {
        if (!copy.move(san)) break;
      } catch {
        break;
      }
    }
    if (copy.fen() !== game.fen()) {
      setGameInitialFen(game.fen());
      try {
        copy = new Chess(game.fen());
      } catch {
        copy = new Chess(game.fen(), { skipValidation: true });
      }
    }
    try {
      const result = copy.move(move);
      if (result) {
        setGame(copy);
        setBrowseIndex(null);
        setOptionSquares({});
        setMoveFrom(null);
        setLastMoveSquares({
          [result.from]: { background: "rgba(255, 255, 50, 0.35)" },
          [result.to]:   { background: "rgba(255, 255, 50, 0.35)" },
        });
        if (activeTab === 'editor') setSolutionMoves(prev => [...prev, result.san]);
        return true;
      }
    } catch { /* invalid move */ }
    return false;
  }, [game, gameInitialFen, activeTab]);

  // v5 onPieceDrop: { piece, sourceSquare, targetSquare }
  const handlePieceDrop = useCallback((args: any) => {
    const sourceSquare: string = args.sourceSquare;
    const targetSquare: string | null = args.targetSquare;
    if (tool !== 'cursor' || isThinking || !targetSquare) return false;
    
    if (vsComputer) {
      const playerColor = boardOrientation === 'white' ? 'w' : 'b';
      if (game.turn() !== playerColor) return false;
    }

    if (puzzlePlayMode === 'solution' && solutionMoves.length > 0) {
      const g = new Chess(game.fen());
      const res = g.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      if (!res) return false;

      const expectedIndex = game.history().length;
      const expected = solutionMoves[expectedIndex];
      const match = expected && (res.san === expected || res.lan === expected || res.from + res.to === expected.replace(/[+#]/, ''));
      
      if (match) {
        setSolutionFeedback({ ok: true, message: 'Doğru hamle!' });
        return makeAMove({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      } else {
        setSolutionFeedback({ ok: false, message: `Yanlış hamle. Tekrar deneyin.` });
        return false;
      }
    }

    return makeAMove({ from: sourceSquare, to: targetSquare, promotion: "q" });
  }, [tool, isThinking, vsComputer, boardOrientation, game, makeAMove, puzzlePlayMode, solutionMoves]);

  /** Editörde boş/eksik pozisyonlar için kopya; skipValidation ile güvenli yükleme */
  const copyGame = useCallback(() => {
    try {
      return new Chess(game.fen());
    } catch {
      return new Chess(game.fen(), { skipValidation: true });
    }
  }, [game]);

  const handleClick = useCallback((square: string) => {
    if (tool === 'eraser') {
      const copy = copyGame();
      copy.remove(square as Square);
      setGame(copy);
      setGameInitialFen(copy.fen());
      setMoveFrom(null);
      setOptionSquares({});
      return;
    }

    if (tool !== 'cursor') {
      const color = tool[0] as 'w' | 'b';
      const type = tool[1].toLowerCase() as 'q' | 'k' | 'r' | 'b' | 'n' | 'p';
      const copy = copyGame();
      try {
        copy.put({ type, color }, square as Square);
        setGame(copy);
        setGameInitialFen(copy.fen());
        setMoveFrom(null);
        setOptionSquares({});
      } catch {
        // Aynı kareye tekrar taş koyma vb.
      }
      return;
    }

    if (!isThinking) {
      if (moveFrom) {
        const moved = makeAMove({ from: moveFrom, to: square, promotion: "q" });
        if (moved) return;

        const piece = game.get(square as Square);
        if (piece && piece.color === game.turn()) {
          setMoveFrom(square);
          getMoveOptions(square);
          return;
        }
        setMoveFrom(null);
        setOptionSquares({});
      } else {
        const piece = game.get(square as Square);
        if (piece && (!vsComputer || piece.color === game.turn())) {
          setMoveFrom(square);
          getMoveOptions(square);
        }
      }
    }
  }, [tool, isThinking, moveFrom, game, vsComputer, makeAMove, getMoveOptions, copyGame]);

  const handleSquareClick = useCallback((args: any) => {
    handleClick(args.square);
  }, [handleClick]);

  const handlePieceClick = useCallback((args: any) => {
    handleClick(args.square);
  }, [handleClick]);

  // AI Response — Stockfish (veya yerel motor) ile bilgisayar hamlesi
  useEffect(() => {
    if (puzzlePlayMode !== 'computer' || !vsComputer || game.isGameOver() || isThinking) return;
    const playerColor = boardOrientation === 'white' ? 'w' : 'b';
    if (game.turn() === playerColor) return;
    setIsThinking(true);
    const gameFen = game.fen();
    let cancelled = false;
    (async () => {
      const move = await getBestMoveAsync(new Chess(gameFen), computerLevel);
      if (!cancelled && move) makeAMove(move);
      if (!cancelled) setIsThinking(false);
    })();
    return () => { cancelled = true; };
  }, [game, vsComputer, boardOrientation, makeAMove, computerLevel, puzzlePlayMode]);

  // Solution Auto-Play: Plays the machine's reply from solutionMoves
  useEffect(() => {
    if (activeTab === 'editor' && puzzlePlayMode === 'solution' && solutionMoves.length > 0) {
      const currentPly = game.history().length;
      // İndeks çiftleri: 0 (kul), 1 (mak), 2 (kul), 3 (mak)... 
      // Makine hamlesi beklenen ply tek sayı ise auto-run
      if (currentPly < solutionMoves.length && currentPly % 2 !== 0) {
        const timer = setTimeout(() => {
          makeAMove(solutionMoves[currentPly]);
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [game, activeTab, puzzlePlayMode, solutionMoves, makeAMove]);

  const resetToStart = () => {
    setGame(new Chess());
    setGameInitialFen(DEFAULT_START_FEN);
    setBrowseIndex(null);
    setOptionSquares({});
    setLastMoveSquares({});
    setMoveFrom(null);
    setSolutionMoves([]);
    setPlayingPuzzleImage(null);
    setRecordedHistoryStartsWithWhite(true);
    setSolutionFeedback(null);
  };
  const clearBoard = () => {
    const emptyFen = '8/8/8/8/8/8/8/8 w - - 0 1';
    let empty: Chess;
    try {
      empty = new Chess(emptyFen, { skipValidation: true });
    } catch {
      empty = new Chess();
      empty.load(emptyFen, { skipValidation: true });
    }
    setGame(empty);
    setGameInitialFen(emptyFen);
    setBrowseIndex(null);
    setOptionSquares({});
    setLastMoveSquares({});
    setMoveFrom(null);
    setRecordedHistoryStartsWithWhite(true);
    setSolutionFeedback(null);
  };
  const undoMove = () => {
    const prevHistory = game.history();
    if (prevHistory.length === 0) return;
    let c: Chess;
    try {
      c = new Chess(gameInitialFen);
    } catch {
      try {
        c = new Chess(gameInitialFen, { skipValidation: true });
      } catch {
        return;
      }
    }
    for (let i = 0; i < prevHistory.length - 1; i++) {
      try {
        if (!c.move(prevHistory[i])) break;
      } catch {
        break;
      }
    }
    setGame(c);
    setBrowseIndex(null);
    setOptionSquares({});
    setLastMoveSquares({});
    setMoveFrom(null);
    setSolutionMoves((p) => p.slice(0, -1));
  };
  const toggleOrientation = () => setBoardOrientation(p => p === 'white' ? 'black' : 'white');

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (!isBoardFlipShortcutKey(e) || !keyboardTargetAllowsBoardShortcut(e)) return;
      e.preventDefault();
      setBoardOrientation((p) => (p === 'white' ? 'black' : 'white'));
    };
    window.addEventListener('keydown', onDown);
    return () => window.removeEventListener('keydown', onDown);
  }, []);

  const changeTurn = (t: 'w'|'b') => {
    const tokens = game.fen().split(' '); tokens[1] = t;
    const newFen = tokens.join(' ');
    try {
      const c = new Chess(newFen);
      setGame(c);
      setGameInitialFen(newFen);
    } catch { showToast("Sıra değiştirilemedi!", 'error'); }
  };

  const importFromText = (str: string) => {
    const trimmed = str.trim();
    try {
      const c = new Chess(); c.load(trimmed);
      setGame(c); setGameInitialFen(trimmed); setBrowseIndex(null); setOptionSquares({}); setLastMoveSquares({}); setMoveFrom(null); setSolutionMoves([]);
      setRecordedHistoryStartsWithWhite(c.turn() === 'w');
      return;
    } catch {}
    try {
      const c = new Chess(); c.loadPgn(trimmed);
      setGame(c); setGameInitialFen(DEFAULT_START_FEN); setBrowseIndex(null); setOptionSquares({}); setLastMoveSquares({}); setMoveFrom(null); setSolutionMoves([]);
      setRecordedHistoryStartsWithWhite(true);
      return;
    } catch {}
    
    const validationError = validateBoardForSave(trimmed);
    if (validationError) {
      showToast(`Uyarı: Yüklenen tahta konumu satranç kurallarına aykırı!\n\n${validationError}`, 'warning');
      return;
    }

    showToast("Hatalı FEN veya PGN formatı!", 'error');
  };

  const [playingPuzzleImage, setPlayingPuzzleImage] = useState<string | null>(null);
  const [puzzlePositionLoading, setPuzzlePositionLoading] = useState(false);

  // Editör: Görsel / PDF ile bulmaca yükleme (tahtaya FEN çıkarıp yükle)
  const editorUploadFileInputRef = useRef<HTMLInputElement>(null);
  const [editorUploadImageData, setEditorUploadImageData] = useState<string | null>(null);
  const [editorPdfPages, setEditorPdfPages] = useState<string[]>([]);
  const [editorPdfSelectedPage, setEditorPdfSelectedPage] = useState(0);
  const [editorUploadFenExtracting, setEditorUploadFenExtracting] = useState(false);
  const [editorUploadError, setEditorUploadError] = useState('');
  const [editorUploadLoading, setEditorUploadLoading] = useState(false);
  /** Görselde birden fazla tahta çıktıysa seçim için; null = henüz tarama yok veya tek tahta yüklendi */
  const [editorExtractedBoards, setEditorExtractedBoards] = useState<ImageBoardResult[] | null>(null);
  const [editorSelectedBoardIndex, setEditorSelectedBoardIndex] = useState(0);

  const playPuzzle = async (puzzle: any) => {
    setActiveTab('editor');
    setTool('cursor');
    setPuzzlePlayMode('computer');
    setVsComputer(true);
    setSolutionFeedback(null);
    setPuzzleTitle(puzzle.title);
    setDifficulty(puzzle.difficulty as any);
    setPoints(puzzle.points);
    setTheme(puzzle.theme || '');
    setHint(puzzle.hint || '');
    setSolutionMoves(puzzle.solution || []);
    setPlayingPuzzleImage(puzzle.imageData || null);

    let fenToUse = puzzle.fen?.trim() || DEFAULT_START_FEN;
    const isDefaultStart = fenToUse === DEFAULT_START_FEN;

    if (puzzle.imageData && isDefaultStart) {
      setPuzzlePositionLoading(true);
      try {
        const result = await imageToFen(puzzle.imageData);
        if (result?.fen) {
          fenToUse = result.fen;
          if (result.solution?.length) setSolutionMoves(result.solution.replace(/\s+/g, ',').split(',').map((s: string) => s.trim()).filter(Boolean));
        }
      } catch { /* keep default */ } finally {
        setPuzzlePositionLoading(false);
      }
    }

    try {
      // Sadece pozisyonu (FEN) yükle; böylece hamle listesi sadece bu tahtada oynanan hamleleri gösterir (eski oyun hamleleri değil)
      const c = new Chess(fenToUse);
      setGame(c);
      setGameInitialFen(fenToUse);
      setBrowseIndex(null);
      setOptionSquares({});
      setLastMoveSquares({});
      setMoveFrom(null);
      // İlk kaydedilen hamle FEN'deki sıraya göre: beyaz sıra ise history[0]=beyaz, siyah sıra ise history[0]=siyah
      setRecordedHistoryStartsWithWhite(c.turn() === 'w');
    } catch {
      showToast("Bulmaca yüklenemedi! FEN geçersiz olabilir.", 'error');
    }
  };

  const editorUploadSelectedDataUrl = editorPdfPages.length > 0
    ? (editorPdfPages[editorPdfSelectedPage] ?? null)
    : editorUploadImageData;

  const handleEditorUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditorUploadError('');
    setEditorUploadLoading(true);
    setEditorPdfPages([]);
    setEditorPdfSelectedPage(0);
    setEditorUploadImageData(null);
    setEditorExtractedBoards(null);
    setEditorSelectedBoardIndex(0);
    try {
      if (file.type.startsWith('image/')) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        setEditorUploadImageData(dataUrl);
      } else if (file.type === 'application/pdf') {
        const urls = await pdfAllPagesToDataUrls(file);
        setEditorPdfPages(urls);
        setEditorPdfSelectedPage(0);
      } else {
        setEditorUploadError('Sadece görsel (JPG, PNG, WebP) veya PDF yükleyebilirsiniz.');
      }
    } catch {
      setEditorUploadError('Dosya işlenemedi. Tekrar deneyin.');
    } finally {
      setEditorUploadLoading(false);
      if (editorUploadFileInputRef.current) editorUploadFileInputRef.current.value = '';
    }
  };

  const loadBoardFromResult = (board: ImageBoardResult, imageDataUrl: string) => {
    const fenToUse = board.fen?.trim() || DEFAULT_START_FEN;
    if (board.solution?.length) {
      setSolutionMoves(board.solution.replace(/\s+/g, ',').split(',').map((s: string) => s.trim()).filter(Boolean));
    } else {
      setSolutionMoves([]);
    }
    const c = new Chess(fenToUse);
    setGame(c);
    setGameInitialFen(fenToUse);
    setBrowseIndex(null);
    setOptionSquares({});
    setLastMoveSquares({});
    setMoveFrom(null);
    setPlayingPuzzleImage(imageDataUrl);
    setRecordedHistoryStartsWithWhite(c.turn() === 'w');
  };

  const handleEditorExtractFenAndLoad = async () => {
    const dataUrl = editorUploadSelectedDataUrl;
    if (!dataUrl) {
      setEditorUploadError('Önce görsel veya PDF sayfası seçin.');
      return;
    }
    setEditorUploadError('');

    if (editorExtractedBoards && editorExtractedBoards.length > 1) {
      const board = editorExtractedBoards[editorSelectedBoardIndex];
      if (board) loadBoardFromResult(board, dataUrl);
      return;
    }

    setEditorUploadFenExtracting(true);
    try {
      const boards = await imageToFenMultiple(dataUrl);
      if (boards.length === 0) {
        setEditorUploadError('Görselde tahta bulunamadı. FEN/PGN alanından yapıştırmayı deneyin.');
        return;
      }
      if (boards.length === 1) {
        loadBoardFromResult(boards[0], dataUrl);
        setEditorExtractedBoards(null);
      } else {
        setEditorExtractedBoards(boards);
        setEditorSelectedBoardIndex(0);
      }
    } catch (err) {
      setEditorUploadError(formatOpenRouterError(err));
    } finally {
      setEditorUploadFenExtracting(false);
    }
  };

  const clearEditorUpload = () => {
    setEditorUploadImageData(null);
    setEditorPdfPages([]);
    setEditorPdfSelectedPage(0);
    setEditorExtractedBoards(null);
    setEditorSelectedBoardIndex(0);
    setEditorUploadError('');
  };

  const handleSavePuzzle = () => {
    if (!puzzleTitle) return showToast("Lütfen Bulmaca Başlığı giriniz.", 'warning');

    const validationError = validateBoardForSave(game.fen());
    if (validationError) return showToast(validationError, 'error');

    // Öğrencinin başlayacağı pozisyon = tahtadaki tüm hamleleri geri alarak bul (gameInitialFen bazen güncellenebiliyor)
    let puzzleStartFen = gameInitialFen;
    try {
      const c = new Chess(game.fen());
      const history = c.history();
      for (let i = 0; i < history.length; i++) c.undo();
      puzzleStartFen = c.fen();
    } catch {
      /* gameInitialFen kullan */
    }
    addPuzzle({
      title: puzzleTitle,
      fen: puzzleStartFen,
      difficulty,
      points,
      category: 'Genel',
      theme,
      hint,
      solution: solutionMoves,
      source: 'custom',
    });
    showToast("Bulmaca başarıyla kaydedildi.", 'success');
    setPuzzleTitle(''); setSolutionMoves([]);
  };

  const handleSaveAsStudy = useCallback(() => {
    if (!puzzleTitle) return showToast("Lütfen başlık giriniz.", 'warning');

    const validationError = validateBoardForSave(game.fen());
    if (validationError) return showToast(validationError, 'error');

    let puzzleStartFen = gameInitialFen;
    try {
      const c = new Chess(game.fen());
      const hist = c.history();
      for (let i = 0; i < hist.length; i++) c.undo();
      puzzleStartFen = c.fen();
    } catch { /* fallback */ }

    const chapterDisplayTitle =
      exportChapterTitleDraft.trim() ||
      puzzleTitle.trim() ||
      'Bölüm';

    const lessonMode = interactiveMode === 'none' ? 'direct' : 'interactive';
    const interactiveType = interactiveMode === 'none' ? 'puzzle' : interactiveMode;

    const chapter = migrateChapter({
      id: genId(),
      title: chapterDisplayTitle,
      fen: puzzleStartFen,
      moves: solutionMoves,
      orientation: boardOrientation,
      lessonMode,
      interactiveType,
      guidedPrompt: '',
      moveHint: hint,
      difficulty: difficulty === 'Kolay' ? 3 : difficulty === 'Orta' ? 5 : 8,
      comment: '',
      tags: theme ? [theme] : [],
    });

    const finishSave = (study: Study, message: string) => {
      saveStudyAsync(study)
        .then(() => {
          setStudySaveSuccess(true);
          setTimeout(() => setStudySaveSuccess(false), 3500);
          showToast(message, 'success');
          refreshStudiesForPicker();
        })
        .catch(() => showToast('Çalışma kaydedilemedi.', 'error'));
    };

    if (saveAsStudyTargetId !== '__new__') {
      const base = studiesPickerList.find((s) => s.id === saveAsStudyTargetId);
      if (!base) {
        showToast('Seçilen çalışma bulunamadı. Listeyi yenileyip tekrar deneyin.', 'error');
        return;
      }
      const merged = migrateStudy({
        ...base,
        chapters: [...base.chapters, chapter],
      });
      finishSave(
        merged,
        `«${base.title || 'Çalışma'}» (${base.chapters.length + 1}. bölüm: «${chapterDisplayTitle}») kaydedildi.`
      );
      return;
    }

    const study = migrateStudy({
      id: genId(),
      title: puzzleTitle,
      emoji: interactiveMode === 'liveAnalysis' ? '🔬' : '🎯',
      chapters: [chapter],
      createdAt: new Date().toISOString(),
      syncEnabled: interactiveMode === 'liveAnalysis',
    });

    finishSave(
      study,
      `Yeni çalışma «${puzzleTitle.trim()}» — 1 / 1 bölüm («${chapterDisplayTitle}») oluşturuldu.`,
    );
  }, [
    puzzleTitle,
    exportChapterTitleDraft,
    gameInitialFen,
    game,
    solutionMoves,
    boardOrientation,
    interactiveMode,
    hint,
    difficulty,
    theme,
    showToast,
    saveAsStudyTargetId,
    studiesPickerList,
    refreshStudiesForPicker,
  ]);

  const handleCSVUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportProgress({ loading: true, message: 'CSV okunuyor...', count: 0, total: 0 });
    const { minRating, maxRating, count, themes } = importFilter;
    const themeList = themes.split(',').map(t => t.trim()).filter(Boolean);

    let text = '';
    try {
      const sizeMb = Math.round((file.size / (1024 * 1024)) * 10) / 10;
      // Lichess full dump (csv.zst) is huge; browser-side decompression will OOM/freeze.
      if ((file.name || '').toLowerCase().endsWith('.zst') && file.size > 120 * 1024 * 1024) {
        setImportProgress({
          loading: false,
          message: `Dosya çok büyük (${sizeMb}MB). Tarayıcı içinde .zst açmak genelde mümkün olmuyor. ` +
            `Lütfen dosyayı bilgisayarda açıp küçülterek (ör. ilk 2-5 milyon satır) CSV olarak yükleyin.`,
          count: 0,
          total: count,
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      text = await lichessPuzzleFileToText(file);
    } catch (err) {
      console.error('[LichessImport] file decode failed:', err);
      setImportProgress({
        loading: false,
        message: `Dosya okunamadı: ${(err as any)?.message ? String((err as any).message) : 'bilinmeyen hata'}. ` +
          `Eğer .zst ise çok büyük/bozuk olabilir; değilse CSV’nin UTF-8 olduğundan emin olun.`,
        count: 0,
        total: count,
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const lines = text.split('\n');
    const imported: Puzzle[] = [];
    let processed = 0;

    for (const line of lines) {
      if (imported.length >= count) break;
      processed++;
      const row = parseCSVLine(line);
      if (!row) continue;
      if (row.Rating < minRating || row.Rating > maxRating) continue;
      if (row.Popularity < -30) continue;
      if (themeList.length > 0) {
        const rowThemes = row.Themes.split(' ');
        if (!themeList.some(t => rowThemes.includes(t))) continue;
      }
      imported.push(csvRowToPuzzle(row));

      if (processed % 50000 === 0) {
        setImportProgress({ loading: true, message: `${processed.toLocaleString()} satır okundu...`, count: imported.length, total: count });
        await new Promise(r => setTimeout(r, 0));
      }
    }

    if (imported.length > 0) setImportProgress({ loading: true, message: 'Veritabanına kaydediliyor...', count: imported.length, total: count });
    await importPuzzles(imported);
    setImportProgress({ loading: false, message: `${imported.length} bulmaca başarıyla import edildi!`, count: imported.length, total: count });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [importFilter, importPuzzles]);

  const handleFetchDaily = useCallback(async () => {
    setImportProgress({ loading: true, message: 'Günün bulmacası çekiliyor...', count: 0, total: 1 });
    const puzzle = await fetchLichessDailyPuzzle();
    if (puzzle) {
      await importPuzzles([puzzle]);
      setImportProgress({ loading: false, message: 'Günün bulmacası eklendi!', count: 1, total: 1 });
    } else {
      setImportProgress({ loading: false, message: 'Bulmaca çekilemedi. Lütfen tekrar deneyin.', count: 0, total: 1 });
    }
  }, [importPuzzles]);

  const handleFetchFromApi = useCallback(async () => {
    const { minRating, maxRating, count, themes } = importFilter;
    const themeList = themes.split(',').map((t) => t.trim()).filter(Boolean);
    const target = Math.min(Math.max(1, count), 500);

    setImportProgress({ loading: true, message: 'Lichess API\'den bulmacalar çekiliyor...', count: 0, total: target });

    try {
      const imported = await fetchLichessPuzzlesFiltered({
        count: target,
        minRating,
        maxRating,
        themes: themeList,
        onProgress: (loaded, total, message) => {
          setImportProgress({
            loading: true,
            message: message || 'Bulmacalar çekiliyor...',
            count: loaded,
            total,
          });
        },
      });

      if (imported.length === 0) {
        setImportProgress({
          loading: false,
          message: 'Filtrelere uygun bulmaca bulunamadı. Puan aralığını genişletin veya temayı değiştirin.',
          count: 0,
          total: target,
        });
        return;
      }

      setImportProgress({ loading: true, message: 'Veritabanına kaydediliyor...', count: imported.length, total: target });
      await importPuzzles(imported);
      setImportProgress({
        loading: false,
        message: `${imported.length} bulmaca Lichess API'den eklendi!`,
        count: imported.length,
        total: target,
      });
    } catch (err) {
      console.error('[LichessImport] API fetch failed:', err);
      setImportProgress({
        loading: false,
        message: 'API bağlantısı başarısız. İnternet bağlantınızı kontrol edip tekrar deneyin.',
        count: 0,
        total: target,
      });
    }
  }, [importFilter, importPuzzles]);

  const handleAddPuzzleToStudy = useCallback(async (puzzle: Puzzle) => {
    const makeId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
    const now = new Date().toISOString();
    const studyId = makeId();
    const chapterId = makeId();
    const title = (puzzle.title || 'Bulmaca').trim();
    const topicTags = [puzzle.category, puzzle.theme].filter((v): v is string => Boolean(v && v.trim())).map(v => v.trim());
    const chapterDifficulty = puzzle.difficulty === 'Kolay' ? 3 : puzzle.difficulty === 'Orta' ? 5 : 7;

    try {
      await saveStudyAsync({
        id: studyId,
        title: `${title} Çalışması`,
        emoji: '♟️',
        description: puzzle.hint ? `Bulmaca ipucu: ${puzzle.hint}` : '',
        chapters: [{
          id: chapterId,
          title,
          fen: puzzle.fen,
          moves: puzzle.solution ?? [],
          orientation: 'white',
          difficulty: chapterDifficulty,
          comment: puzzle.hint ?? '',
          tags: topicTags,
          moveComments: {},
          moveAnnotations: {},
          variations: {},
        }],
        memberIds: [],
        createdAt: now,
        visibility: 'public',
        chat: 'members',
        computerAnalysis: 'none',
        openingExplorer: 'everyone',
        clonePermission: 'everyone',
        shareExport: 'everyone',
        syncEnabled: true,
        studyComments: 'none',
        tags: [],
        topicTags,
        chatMessages: [],
        liked: false,
        likes: 0,
      });
      showToast(`"${title}" çalışmaya eklendi. Çalışmalar sayfasına yönlendiriliyorsunuz.`, 'success');
      window.location.hash = '#/bulmaca-yeni';
    } catch {
      showToast('Çalışmaya eklenirken hata oluştu. Lütfen tekrar deneyin.', 'error');
    }
  }, [showToast]);

  const categories = [...new Set(puzzles.map(p => p.category))].sort();

  const filteredPuzzles = puzzles.filter(p => {
    if (puzzleSourceFilter === 'lichess' && p.source !== 'lichess') return false;
    if (puzzleSourceFilter === 'custom' && p.source !== 'custom' && p.source != null) return false;
    if (puzzleSearch && !p.title.toLowerCase().includes(puzzleSearch.toLowerCase()) && !p.theme?.toLowerCase().includes(puzzleSearch.toLowerCase())) return false;
    if (puzzleDiffFilter !== 'all' && p.difficulty !== puzzleDiffFilter) return false;
    if (puzzleCatFilter !== 'all' && p.category !== puzzleCatFilter) return false;
    if (puzzleThemeFilter !== 'all' && !puzzleHasLichessTheme(p, puzzleThemeFilter)) return false;
    return true;
  });

  const selectedPuzzleSet = React.useMemo(() => new Set(selectedPuzzleIds), [selectedPuzzleIds]);
  const selectedInViewCount = React.useMemo(
    () => filteredPuzzles.reduce((n, p) => n + (selectedPuzzleSet.has(p.id) ? 1 : 0), 0),
    [filteredPuzzles, selectedPuzzleSet]
  );

  const togglePuzzleSelected = useCallback((id: string) => {
    setSelectedPuzzleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);
  const clearPuzzleSelection = useCallback(() => setSelectedPuzzleIds([]), []);
  const selectAllFiltered = useCallback(() => {
    setSelectedPuzzleIds((prev) => {
      const set = new Set(prev);
      for (const p of filteredPuzzles) set.add(p.id);
      return Array.from(set);
    });
  }, [filteredPuzzles]);
  const deleteSelectedPuzzles = useCallback(async () => {
    const ids = selectedPuzzleIds;
    if (ids.length === 0) return;
    const ok = window.confirm(`${ids.length} bulmaca silinecek. Emin misiniz?`);
    if (!ok) return;
    // Silme işlemi AppContext'te tekli; burada batch çalıştırıyoruz.
    for (const id of ids) {
      try { deletePuzzle(id); } catch {}
    }
    setSelectedPuzzleIds([]);
    showToast?.(`${ids.length} bulmaca silindi.`, 'success');
  }, [selectedPuzzleIds, deletePuzzle, showToast]);

  // Homework helpers
  const studentGroups: string[] = [...new Set<string>(students.map(s => s.group).filter((g): g is string => Boolean(g)))].sort();

  const hwFilteredPuzzles = puzzles.filter(p => {
    if (!hwPuzzleSearch) return true;
    const q = hwPuzzleSearch.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || (p.theme || '').toLowerCase().includes(q);
  });

  const toggleHwPuzzle = (id: string) => {
    setHwSelectedPuzzles(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleHwStudent = (id: string) => {
    setHwSelectedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleHwGroup = (g: string) => {
    setHwSelectedGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  };

  const handleCreateHomework = () => {
    if (!hwTitle.trim()) return showToast('Lütfen ödev başlığı girin.', 'warning');
    let assignedTo: string[] = [];
    if (hwAssignMode === 'groups') {
      if (hwSelectedGroups.length === 0) return showToast('En az 1 grup seçin.', 'warning');
      assignedTo = hwSelectedGroups.map(g => `group:${(g || '').trim()}`);
    } else {
      if (hwSelectedStudents.length === 0) return showToast('En az 1 öğrenci seçin.', 'warning');
      assignedTo = hwSelectedStudents.map(id => String(id).trim());
    }

    addHomework({
      title: hwTitle.trim(),
      puzzles: hwSelectedPuzzles,
      dueDate: hwDueDate.trim(),
      assignedTo,
    });

    setHwTitle('');
    setHwDueDate('');
    setHwSelectedPuzzles([]);
    setHwSelectedStudents([]);
    setHwSelectedGroups([]);
    setHwMode('list');
  };

  const getHwAssignees = (hw: typeof homeworks[0]) => {
    const groups = hw.assignedTo.filter(a => a.startsWith('group:')).map(a => a.replace('group:', ''));
    const studentIds = hw.assignedTo.filter(a => !a.startsWith('group:'));
    const fromGroups = groups.length > 0 ? students.filter(s => groups.includes(s.group)) : [];
    const fromIds = studentIds.length > 0 ? students.filter(s => studentIds.includes(s.id)) : [];
    const all = [...fromGroups, ...fromIds];
    const unique = Array.from(new Map(all.map(s => [s.id, s])).values());
    return unique;
  };

  const isHwOverdue = (dueDate: string) => !!dueDate && new Date(dueDate) < new Date();

  // Analysis stats
  const puzzleStats = {
    total: puzzles.length,
    easy: puzzles.filter(p => p.difficulty === 'Kolay').length,
    medium: puzzles.filter(p => p.difficulty === 'Orta').length,
    hard: puzzles.filter(p => p.difficulty === 'Zor').length,
    categories: Object.entries(
      puzzles.reduce<Record<string, number>>((acc, p) => { acc[p.category] = (acc[p.category] || 0) + 1; return acc; }, {})
    ).sort((a: [string, number], b: [string, number]) => b[1] - a[1]),
    totalPoints: puzzles.reduce((s, p) => s + p.points, 0),
    avgPoints: puzzles.length > 0 ? Math.round(puzzles.reduce((s, p) => s + p.points, 0) / puzzles.length) : 0,
    hwTotal: homeworks.length,
    hwActive: homeworks.filter(h => !isHwOverdue(h.dueDate)).length,
    hwOverdue: homeworks.filter(h => isHwOverdue(h.dueDate)).length,
    hwTotalPuzzles: homeworks.reduce((s, h) => s + h.puzzles.length, 0),
  };

  const mergedSquareStyles = { ...lastMoveSquares, ...optionSquares };

  const history = game.history();
  const displayFen = hoverFen || (browseIndex === null ? game.fen() : getFenAtHalfMove(gameInitialFen, history, browseIndex, game.fen()));
  const isBrowsing = browseIndex !== null;

  const browseGoPrev = useCallback(() => {
    if (history.length === 0) return;
    const cur = browseIndex === null ? history.length : browseIndex;
    if (cur <= 0) return;
    setBrowseIndex(cur - 1);
  }, [history.length, browseIndex]);

  const browseGoNext = useCallback(() => {
    if (history.length === 0) return;
    const cur = browseIndex === null ? history.length : browseIndex;
    if (cur >= history.length) return;
    const n = cur + 1;
    setBrowseIndex(n >= history.length ? null : n);
  }, [history.length, browseIndex]);

  const editorBoardWheelRef = useChessWheelNavigation(browseGoPrev, browseGoNext, history.length > 0);

  /** Bulmaca editörü durum çubuğu: mevcut pozisyona göre beyaz/siyah üstünlük (piyon birimi). */
  const evaluationForBar = evalScore;
  const evalClamped = Math.max(-10, Math.min(10, evaluationForBar));
  const whiteBarShare = 0.5 + evalClamped / 20;
  const whiteBarPct = Math.round(whiteBarShare * 100);
  const evalDisplay = Math.abs(evaluationForBar) > 20 ? 'Mat' : evaluationForBar.toFixed(1);

  const boardOptions: any = {
    position: displayFen,
    boardOrientation,
    ...CHESSBOARD_NO_NOTATION,
    squareStyles: isBrowsing ? {} : mergedSquareStyles,
    darkSquareStyle: { backgroundColor: '#779952' },
    lightSquareStyle: { backgroundColor: '#edeed1' },
    ...CHESSBOARD_ANIMATION,
    allowDragging: !isBrowsing,
    onPieceDrop: isBrowsing ? undefined : handlePieceDrop,
    onPieceClick: isBrowsing ? undefined : handlePieceClick,
    onSquareClick: isBrowsing ? undefined : handleSquareClick,
  };

  const staticBoardOptions = (fen: string): any => ({
    position: fen,
    darkSquareStyle: { backgroundColor: '#779952' },
    lightSquareStyle: { backgroundColor: '#edeed1' },
    ...CHESSBOARD_ANIMATION,
    ...CHESSBOARD_NO_NOTATION,
    allowDragging: false,
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex items-center gap-3 mb-6 px-2">
        <div className="bg-indigo-600/20 p-2 rounded-lg text-indigo-400 shadow-inner border border-indigo-500/20"><Grid className="w-6 h-6" /></div>
        <h1 className="text-2xl font-black text-white tracking-tight">Bulmaca Yönetimi</h1>
      </div>

      <div className="flex flex-wrap bg-slate-900/60 p-1.5 rounded-lg border border-white/5 shadow-inner w-full max-w-max">
        <TabButton active={activeTab === 'editor'} onClick={() => setActiveTab('editor')} icon={<Edit3 className="w-4 h-4" />} label="Editör" />
        <TabButton active={activeTab === 'puzzles'} onClick={() => setActiveTab('puzzles')} icon={<Grid className="w-4 h-4" />} label="Bulmacalar" />
      </div>

      {activeTab === 'editor' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          <div className="xl:col-span-7 flex flex-col gap-4">
            {playingPuzzleImage && (
              <div className="rounded-lg overflow-hidden border border-white/10 bg-slate-800/50 p-2">
                <p className="text-[10px] text-slate-500 px-2 py-1 font-bold uppercase tracking-wider">Bulmaca diagramı</p>
                <img src={playingPuzzleImage} alt="Bulmaca" className="w-full max-h-36 object-contain rounded" />
              </div>
            )}
            {/* Top Palette (Black Pieces) */}
            <div className="flex bg-slate-900/80 items-center gap-2 p-2.5 rounded-lg shadow-xl border border-white/10 backdrop-blur-md">
              <button type="button" onClick={() => setTool('cursor')} className={`p-3.5 rounded-lg flex items-center justify-center transition-all ${tool === 'cursor' ? 'bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-500/50' : 'hover:bg-white/5 text-slate-400'}`}><MousePointer2 className="w-5 h-5 fill-current" /></button>
              <div className="w-px h-10 bg-white/10 mx-2" />
              {['k','q','r','b','n'].map((p) => (
                <button key={p} type="button" onClick={() => setTool('b'+p)} className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all ${tool === 'b'+p ? 'bg-white/10 shadow-inner scale-110 border border-white/20' : 'hover:bg-white/5 border border-transparent'}`}>
                  <img src={`https://lichess1.org/assets/piece/cburnett/b${p.toUpperCase()}.svg`} className="w-9 h-9 pointer-events-none drop-shadow-md" alt="" />
                </button>
              ))}
              <button type="button" onClick={() => setTool('bp')} className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all ${tool === 'bp' ? 'bg-white/10 shadow-inner scale-110 border border-white/20' : 'hover:bg-white/5 border border-transparent'}`}>
                <img src="https://lichess1.org/assets/piece/cburnett/bP.svg" className="w-9 h-9 pointer-events-none drop-shadow-md" alt="" />
              </button>
              <button
                type="button"
                title="Taşı sil (silgi)"
                onClick={() => setTool('eraser')}
                className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all shrink-0 border border-transparent ${tool === 'eraser' ? 'bg-amber-600/85 text-white shadow-lg ring-2 ring-amber-400/45' : 'text-amber-200/90 hover:bg-amber-500/15'}`}
              >
                <Eraser className="w-6 h-6" strokeWidth={2} />
              </button>
            </div>

            {/* Board */}
            <div className="bg-[#0f172a] border border-white/10 rounded-lg overflow-hidden shadow-2xl relative w-full max-w-[min(100%,480px)] mx-auto">
              <ChessBoardFrame
                boardOrientation={boardOrientation}
                shellClassName="bg-slate-800 border-r border-white/5"
                evalBar={
                  <div className="flex flex-col-reverse h-full min-h-0 w-full relative">
                    <div className="bg-white w-full transition-all duration-300 shadow-[0_0_8px_rgba(255,255,255,0.4)] shrink-0" style={{ height: `${whiteBarPct}%` }} title="Beyaz üstünlük" />
                    <div className="bg-slate-700 w-full transition-all duration-300 flex-1 min-h-[4px]" title="Siyah üstünlük" />
                    <span className="absolute top-1.5 left-0 right-0 z-10 text-center text-[9px] font-black text-slate-300 bg-slate-800/90 rounded px-0.5 py-0.5 border border-white/10 shadow-sm pointer-events-none">
                      {evalDisplay}
                    </span>
                  </div>
                }
              >
                <div ref={editorBoardWheelRef} className={`absolute inset-0 ${history.length > 0 ? 'touch-none' : ''}`}>
                  <Chessboard options={boardOptions} />
                  {puzzlePositionLoading && (
                    <div className="absolute inset-0 flex items-center justify-center z-20 bg-slate-900/80 backdrop-blur-sm">
                      <div className="bg-indigo-600/90 px-6 py-3 rounded-lg text-white font-bold flex items-center gap-2 shadow-xl border border-white/20">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Görselden pozisyon çıkarılıyor…
                      </div>
                    </div>
                  )}
                  {!isBrowsing && (game.isGameOver() || isThinking) && !game.fen().startsWith('8/8/8/8/8/8/8/8') && (game.history().length > 0 || game.fen() === DEFAULT_START_FEN) && (
                    <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                      <div className="bg-indigo-600/90 backdrop-blur-md px-8 py-4 rounded-full text-white font-bold flex items-center gap-3 shadow-2xl border border-white/20">
                        {isThinking ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                        {isThinking ? 'Bilgisayar Düşünüyor...' : (game.isCheckmate() ? 'MAT!' : 'BERABERE')}
                      </div>
                    </div>
                  )}
                </div>
              </ChessBoardFrame>
            </div>

            {/* Taş seçiliyken imlecin yanında taş göster */}
            {isPieceTool && pieceCursorPos && (
              <div
                className="fixed pointer-events-none z-[9999] w-10 h-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: pieceCursorPos.x, top: pieceCursorPos.y }}
              >
                <img
                  src={`https://lichess1.org/assets/piece/cburnett/${tool[0]}${tool[1].toUpperCase()}.svg`}
                  alt=""
                  className="w-10 h-10 drop-shadow-lg"
                />
              </div>
            )}

            {/* Bottom Palette (White Pieces) */}
            <div className="flex bg-slate-900/80 items-center gap-2 p-2.5 rounded-lg shadow-xl border border-white/10 backdrop-blur-md">
              <button type="button" onClick={() => setTool('cursor')} className={`p-3.5 rounded-lg flex items-center justify-center transition-all ${tool === 'cursor' ? 'bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-500/50' : 'hover:bg-white/5 text-slate-400'}`}><MousePointer2 className="w-5 h-5 fill-current" /></button>
              <div className="w-px h-10 bg-white/10 mx-2" />
              {(['K','Q','R','B','N'] as const).map((p) => (
                <button key={p} type="button" onClick={() => setTool('w' + p)} className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all ${tool === 'w' + p ? 'bg-white/10 shadow-inner scale-110 border border-white/20' : 'hover:bg-white/5 border border-transparent'}`}>
                  <img src={`https://lichess1.org/assets/piece/cburnett/w${p}.svg`} className="w-9 h-9 pointer-events-none drop-shadow-md" alt="" />
                </button>
              ))}
              <button type="button" onClick={() => setTool('wP')} className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all ${tool === 'wP' ? 'bg-white/10 shadow-inner scale-110 border border-white/20' : 'hover:bg-white/5 border border-transparent'}`}>
                <img src="https://lichess1.org/assets/piece/cburnett/wP.svg" className="w-9 h-9 pointer-events-none drop-shadow-md" alt="" />
              </button>
              <button
                type="button"
                title="Taşı sil (silgi)"
                onClick={() => setTool('eraser')}
                className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all shrink-0 border border-transparent ${tool === 'eraser' ? 'bg-amber-600/85 text-white shadow-lg ring-2 ring-amber-400/45' : 'text-amber-200/90 hover:bg-amber-500/15'}`}
              >
                <Eraser className="w-6 h-6" strokeWidth={2} />
              </button>
            </div>

            {/* FEN / PGN Import */}
            <div className="flex bg-slate-900/40 items-center gap-3 p-3.5 rounded-lg shadow-sm border border-white/5 backdrop-blur-sm mt-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2 whitespace-nowrap">FEN / PGN</span>
              <input 
                type="text" value={importString} onChange={(e) => setImportString(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') importFromText(importString); }}
                placeholder="Geçerli bir FEN veya PGN dizilimi yapıştırın..."
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-xs text-slate-300 font-mono focus:outline-none focus:border-indigo-500 transition-colors" 
              />
              <button onClick={() => importFromText(importString)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-lg font-bold text-xs shadow-lg transition-all">YÜKLE</button>
            </div>

            {/* Görsel / PDF ile Bulmaca Yükle — editörde tahtaya FEN çıkarıp yükle */}
            <div className="bg-slate-900/40 rounded-lg shadow-sm border border-white/5 backdrop-blur-sm mt-2 p-3.5 space-y-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2 block">Görsel / PDF ile Yükle</span>
              <input
                ref={editorUploadFileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleEditorUploadFile}
                className="hidden"
              />
              {!editorUploadImageData && editorPdfPages.length === 0 ? (
                <button
                  type="button"
                  onClick={() => editorUploadFileInputRef.current?.click()}
                  disabled={editorUploadLoading}
                  className="w-full px-4 py-5 bg-slate-800/50 border border-dashed border-white/10 rounded-lg text-slate-400 hover:border-indigo-500/50 hover:bg-slate-800/80 hover:text-slate-300 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {editorUploadLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileImage className="w-5 h-5" />}
                  <span className="text-xs font-bold">{editorUploadLoading ? 'İşleniyor…' : 'Görsel veya PDF seçin'}</span>
                </button>
              ) : (
                <div className="space-y-3">
                  {editorPdfPages.length > 1 ? (
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">PDF sayfası seçin</p>
                      <div className="flex flex-wrap gap-2">
                        {editorPdfPages.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setEditorPdfSelectedPage(i)}
                            className={`min-w-[4rem] py-2 px-3 rounded-lg text-xs font-bold transition-colors ${editorPdfSelectedPage === i ? 'bg-indigo-600 text-white' : 'bg-slate-800/80 text-slate-400 border border-slate-700/50 hover:border-slate-600'}`}
                          >
                            Sayfa {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="relative inline-block rounded-lg overflow-hidden border border-white/10 bg-slate-800/50">
                    {editorUploadSelectedDataUrl && (
                      <img src={editorUploadSelectedDataUrl} alt="Seçilen görsel" className="max-h-40 object-contain" />
                    )}
                    <button type="button" onClick={clearEditorUpload} className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-rose-500/80 rounded text-white transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {editorExtractedBoards && editorExtractedBoards.length > 1 && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Görselde birden fazla tahta bulundu — birini seçin</p>
                      <div className="flex flex-wrap gap-2">
                        {editorExtractedBoards.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setEditorSelectedBoardIndex(i)}
                            className={`min-w-[4rem] py-2 px-3 rounded-lg text-xs font-bold transition-colors ${editorSelectedBoardIndex === i ? 'bg-indigo-600 text-white' : 'bg-slate-800/80 text-slate-400 border border-slate-700/50 hover:border-slate-600'}`}
                          >
                            Tahta {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {editorUploadError && <p className="text-rose-400 text-xs">{editorUploadError}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleEditorExtractFenAndLoad}
                      disabled={editorUploadFenExtracting}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg font-bold text-xs shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {editorUploadFenExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {editorUploadFenExtracting
                        ? 'FEN çıkarılıyor…'
                        : editorExtractedBoards && editorExtractedBoards.length > 1
                          ? 'Seçileni tahtaya yükle'
                          : 'FEN çıkar ve tahtaya yükle'}
                    </button>
                    <button type="button" onClick={clearEditorUpload} className="px-4 py-2.5 rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 text-xs font-bold">Temizle</button>
                  </div>
                </div>
              )}
            </div>

            <button onClick={toggleOrientation} className="bg-white/5 border border-white/10 text-slate-300 px-6 py-3.5 rounded-lg font-bold text-xs flex items-center self-start shadow-sm hover:bg-white/10 transition-colors">
              <RotateCcw className="w-4 h-4 mr-3 text-indigo-400" /> Tahta Yönü: <span className="text-white ml-2">{boardOrientation === 'white' ? 'Beyaz Altta' : 'Siyah Altta'}</span>
            </button>
          </div>

          {/* RIGHT COLUMN */}
          <div className="xl:col-span-5 flex flex-col gap-6">
            {solutionFeedback && activeTab === 'editor' && (
              <div
                role="status"
                className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                  solutionFeedback.ok
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                    : 'border-rose-500/40 bg-rose-500/15 text-rose-200'
                }`}
              >
                {solutionFeedback.message}
              </div>
            )}

            <div className="bg-slate-900/60 border border-white/5 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl flex flex-col min-h-0">
              <div role="tablist" aria-label="Editör yan panel" className="flex shrink-0 gap-1 p-1.5 bg-black/35 border-b border-white/10">
                <button
                  type="button"
                  role="tab"
                  aria-selected={editorSidebarTab === 'board'}
                  onClick={() => setEditorSidebarTab('board')}
                  className={`flex-1 min-w-0 flex items-center justify-center gap-2 rounded-xl py-3 px-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all ${
                    editorSidebarTab === 'board'
                      ? 'bg-indigo-600 text-white shadow-md ring-1 ring-indigo-400/35'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <Layout className="w-4 h-4 shrink-0 opacity-90" aria-hidden /> Tahta
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={editorSidebarTab === 'puzzle'}
                  onClick={() => setEditorSidebarTab('puzzle')}
                  className={`flex-1 min-w-0 flex items-center justify-center gap-2 rounded-xl py-3 px-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all ${
                    editorSidebarTab === 'puzzle'
                      ? 'bg-indigo-600 text-white shadow-md ring-1 ring-indigo-400/35'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <Edit3 className="w-4 h-4 shrink-0 opacity-90" aria-hidden /> Bulmaca
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={editorSidebarTab === 'study'}
                  onClick={() => setEditorSidebarTab('study')}
                  className={`flex-1 min-w-0 flex items-center justify-center gap-2 rounded-xl py-3 px-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all ${
                    editorSidebarTab === 'study'
                      ? 'bg-indigo-600 text-white shadow-md ring-1 ring-indigo-400/35'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <Zap className="w-4 h-4 shrink-0 opacity-90 text-violet-300" aria-hidden /> Çalışma
                </button>
              </div>

              <div className="p-6 sm:p-7 space-y-5 max-h-[min(72vh,46rem)] overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
                {editorSidebarTab === 'board' && (
                  <>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Hamle Sırası</label>
                      <select value={game.turn()} onChange={(e) => changeTurn(e.target.value as 'w'|'b')} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm font-semibold text-white focus:outline-none focus:border-indigo-500 appearance-none">
                        <option value="w">Beyaz</option><option value="b">Siyah</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <button type="button" onClick={resetToStart} className="flex items-center justify-center gap-2 border border-white/5 bg-white/5 hover:bg-white/10 py-3.5 rounded-lg text-[11px] font-bold text-slate-300 transition-colors">
                        <RotateCcw className="w-4 h-4 shrink-0" /> Başlangıç
                      </button>
                      <button type="button" onClick={toggleOrientation} className="flex items-center justify-center gap-2 border border-white/5 bg-white/5 hover:bg-white/10 py-3.5 rounded-lg text-[11px] font-bold text-slate-300 transition-colors">
                        <RotateCcw className="w-4 h-4 shrink-0 rotate-180" /> Döndür
                      </button>
                      <button type="button" onClick={undoMove} className="flex items-center justify-center gap-2 border border-white/5 bg-white/5 hover:bg-white/10 py-3.5 rounded-lg text-[11px] font-bold text-slate-300 transition-colors">
                        <History className="w-4 h-4 shrink-0" /> Geri Al
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={clearBoard}
                      className="w-full rounded-xl py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:text-rose-300 hover:bg-rose-500/[0.08] border border-white/5 hover:border-rose-500/25 transition-colors"
                    >
                      Tüm taşları kaldır
                    </button>
            {history.length > 0 && (
              <div className="bg-[#0f172a] border border-slate-700/60 rounded-xl overflow-hidden flex flex-col min-h-[200px] max-h-[380px]">
                <div className="px-3 py-2 border-b border-slate-700/60 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-500" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hamleler</span>
                    <span className="text-[10px] text-slate-500 font-mono">({history.length})</span>
                  </div>
                  {isBrowsing && (
                    <button type="button" onClick={() => setBrowseIndex(null)} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                      Son pozisyon
                    </button>
                  )}
                </div>
                <div
                  ref={moveListScrollRef}
                  className="overflow-y-scroll overflow-x-auto flex-1 min-h-[120px] font-mono text-sm text-slate-200 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:bg-slate-800/70 [&::-webkit-scrollbar-thumb]:bg-slate-500 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-slate-400"
                >
                  {/* Sütun başlıkları — beyaz/siyah yan yana */}
                  <div className="grid grid-cols-[2rem_1fr_1fr] gap-2 px-3 py-1.5 border-b border-slate-700/80 shrink-0 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <span />
                    <span>Beyaz</span>
                    <span>Siyah</span>
                  </div>
                  <button
                    type="button"
                    ref={browseIndex === 0 ? (el) => { activeMoveRowRef.current = el; } : undefined}
                    onClick={() => setBrowseIndex(0)}
                    className={`w-full grid grid-cols-[2rem_1fr_1fr] gap-2 px-3 py-1.5 border-b border-slate-800/80 text-left transition-colors hover:bg-slate-800/50 items-center ${browseIndex === 0 ? 'bg-blue-600/30 text-white border-l-2 border-l-amber-500' : ''}`}
                  >
                    <span className="text-slate-500 text-xs font-bold">0.</span>
                    <span className="text-slate-500 text-xs col-span-2">Başlangıç</span>
                  </button>
                  {buildMoveRows(history, recordedHistoryStartsWithWhite).map((row) => {
                    const cur = browseIndex === null ? history.length : browseIndex;
                    const isActive = cur >= row.rowStart && cur <= row.rowEnd;
                    return (
                      <div
                        key={row.num}
                        className={`w-full grid grid-cols-[2rem_1fr_1fr] gap-2 px-3 py-1.5 border-b border-slate-800/80 last:border-b-0 text-left transition-colors items-center min-w-0 ${isActive ? 'bg-blue-600/40 text-white border-l-2 border-l-amber-500' : 'hover:bg-slate-700/30'}`}
                      >
                        <span className="text-slate-500 text-xs font-bold shrink-0">{row.num}.</span>
                        <button 
                          type="button"
                          onMouseEnter={() => setHoverFen(getFenAtHalfMove(gameInitialFen, history, row.rowStart, game.fen()))}
                          onMouseLeave={() => setHoverFen(null)}
                          onClick={() => setBrowseIndex(row.rowStart)}
                          ref={browseIndex === row.rowStart ? (el) => { activeMoveRowRef.current = el; } : undefined}
                          className={`font-mono text-sm min-w-0 truncate text-left px-1 rounded transition-colors ${browseIndex === row.rowStart ? 'bg-amber-500/30 text-amber-200' : 'hover:bg-amber-500/10'}`} 
                          title={row.white}
                        >
                          {row.white || '—'}
                        </button>
                        {row.black ? (
                          <button 
                            type="button"
                            onMouseEnter={() => setHoverFen(getFenAtHalfMove(gameInitialFen, history, row.rowEnd, game.fen()))}
                            onMouseLeave={() => setHoverFen(null)}
                            onClick={() => setBrowseIndex(row.rowEnd)}
                            ref={browseIndex === row.rowEnd ? (el) => { activeMoveRowRef.current = el; } : undefined}
                            className={`font-mono text-sm min-w-0 truncate text-left px-1 rounded transition-colors ${browseIndex === row.rowEnd ? 'bg-amber-500/30 text-amber-200' : 'text-slate-400 hover:bg-amber-500/10'}`}
                            title={row.black}
                          >
                            {row.black}
                          </button>
                        ) : (
                          <span className="text-slate-600">...</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
                  </>
                )}

                {editorSidebarTab === 'puzzle' && (
                  <>
              <h3 className="font-black text-white flex items-center gap-3 border-b border-white/10 pb-4 text-base tracking-tight"><Edit3 className="w-5 h-5 text-indigo-400" /> Bulmaca Bilgileri</h3>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Başlık</label>
                <input value={puzzleTitle} onChange={e => setPuzzleTitle(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-5 py-3.5 text-sm focus:outline-none focus:border-indigo-500 text-white font-medium placeholder:text-slate-600 transition-colors" placeholder="Örn: 2 Hamlede Mat" />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Zorluk</label>
                  <select value={difficulty} onChange={e => setDifficulty(e.target.value as any)} className="w-full bg-black/40 border border-white/10 rounded-lg px-5 py-3.5 text-sm focus:outline-none focus:border-indigo-500 text-white font-medium appearance-none"><option>Kolay</option><option>Orta</option><option>Zor</option></select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Puan</label>
                  <input type="number" value={points} onChange={e => setPoints(parseInt(e.target.value))} className="w-full bg-black/40 border border-white/10 rounded-lg px-5 py-3.5 text-sm focus:outline-none focus:border-indigo-500 text-white font-medium transition-colors" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Tema <span className="text-rose-500">*</span></label>
                <select value={theme} onChange={e => setTheme(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-5 py-3.5 text-sm focus:outline-none focus:border-indigo-500 text-white font-medium appearance-none"><option value="">Tema Seçin...</option><option value="mat">Mat</option><option value="catal">Çatal</option><option value="acilis">Açılış</option></select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">İpucu</label>
                <select value={hint} onChange={e => setHint(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-5 py-3.5 text-sm focus:outline-none focus:border-indigo-500 text-white font-medium appearance-none"><option value="">Yok</option><option value="Düşün">Düşün</option></select>
              </div>

              <button type="button" onClick={handleSavePuzzle} className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-lg flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all active:scale-[0.98] uppercase tracking-widest text-xs">
                <Save className="w-5 h-5" /> KAYDET VE YAYINLA
              </button>

                  </>
                )}

                {editorSidebarTab === 'study' && (
                  <>
                    <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-1">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/25">
                        <Zap className="w-5 h-5" />
                      </span>
                      <div>
                        <p className="font-black text-white text-base tracking-tight">Çalışmaya aktar</p>
                        <p className="text-[10px] text-slate-500">Hedef çalışma, etkileşim ve yeni bölüm adı</p>
                      </div>
                    </div>

                <div>
                  <label className="text-[10px] font-black text-violet-300/90 uppercase tracking-widest flex items-center gap-2 mb-2">
                    <span className="h-1 w-4 rounded-full bg-violet-500/60" />
                    Etkileşimli mod
                  </label>
                  <select
                    value={interactiveMode}
                    onChange={(e) => setInteractiveMode(e.target.value as 'none' | 'puzzle' | 'liveAnalysis' | 'vsComputer')}
                    className="w-full bg-black/50 border border-violet-500/15 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/35 focus:border-violet-500/40 text-white font-medium appearance-none shadow-inner"
                  >
                    <option value="none">Direkt (Okuma)</option>
                    <option value="puzzle">Bulmaca (Doğru / Yanlış)</option>
                    <option value="liveAnalysis">Canlı analiz (serbest)</option>
                    <option value="vsComputer">Bilgisayara karşı antrenman</option>
                  </select>
                  {interactiveMode !== 'none' && (
                    <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
                      <div className={`rounded-xl border px-2 py-2 text-center ${interactiveMode === 'puzzle' ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/5 bg-black/25 opacity-75'}`}>
                        <span className="text-emerald-400 font-bold">Bulmaca</span>
                      </div>
                      <div className={`rounded-xl border px-2 py-2 text-center ${interactiveMode === 'liveAnalysis' ? 'border-violet-500/40 bg-violet-500/10' : 'border-white/5 bg-black/25 opacity-75'}`}>
                        <span className="text-violet-300 font-bold">Analiz</span>
                      </div>
                      <div className={`rounded-xl border px-2 py-2 text-center ${interactiveMode === 'vsComputer' ? 'border-orange-500/35 bg-orange-500/10' : 'border-white/5 bg-black/25 opacity-75'}`}>
                        <span className="text-orange-300 font-bold">Motor</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-violet-950/35 via-slate-900/95 to-[#0c0a14] p-5 space-y-5 shadow-xl shadow-black/40 ring-1 ring-violet-500/10">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Hedef</p>
                    <span className="text-[10px] text-slate-500 font-medium">
                      Çalışma + bölüm
                    </span>
                  </div>

                  {/* Çalışma */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/25">
                        <FolderOpen className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <label htmlFor="export-study-select" className="text-[11px] font-bold text-slate-300 block">
                          Hangi çalışma?
                        </label>
                        <div className="flex gap-2">
                          <select
                            id="export-study-select"
                            value={saveAsStudyTargetId}
                            onChange={(e) => setSaveAsStudyTargetId(e.target.value)}
                            className="flex-1 min-w-0 rounded-xl border border-white/10 bg-black/45 px-3.5 py-3 text-sm text-white placeholder:text-slate-600 shadow-inner focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/35"
                          >
                            <option value="__new__">Yeni çalışma oluştur</option>
                            {studiesSortedForPicker.map((s) => {
                              const catLabel = s.categoryId
                                ? studyPickerCategories.find((c) => c.id === s.categoryId)?.name
                                : null;
                              const prefix = catLabel ? `[${catLabel}] ` : '';
                              return (
                                <option key={s.id} value={s.id}>
                                  {prefix}
                                  {s.emoji ? `${s.emoji} ` : ''}
                                  {s.title || 'İsimsiz'} · {s.chapters.length} bölüm · sona yeni ekle
                                </option>
                              );
                            })}
                          </select>
                          <button
                            type="button"
                            title="Çalışma listesini yenile"
                            onClick={() => refreshStudiesForPicker()}
                            className="shrink-0 flex h-[46px] w-11 items-center justify-center rounded-xl border border-white/10 bg-black/35 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/15 transition-colors"
                          >
                            <RefreshCw className={`h-4 w-4 ${studyPickerLoading ? 'animate-spin text-violet-400' : ''}`} />
                          </button>
                        </div>

                        {!exportTargetStudy ? (
                          <div className="rounded-xl bg-black/30 border border-white/5 px-3 py-2.5 text-[11px] text-slate-400 leading-snug">
                            <span className="text-slate-300 font-semibold">Yeni çalışma</span>{' '}
                            — liste adını yukarıdaki{' '}
                            <span className="text-white font-semibold">«Başlık»</span> alanı belirler. İlk bölüm olarak bu tahta
                            kaydedilir ({interactiveMode === 'none' ? 'okuma modu' : 'etkileşim seçili'}).
                          </div>
                        ) : (
                          <div className="rounded-xl bg-black/35 border border-white/[0.07] px-3 py-2.5 space-y-2">
                            <div className="flex flex-wrap gap-2 items-center">
                              <span className="text-lg leading-none">{exportTargetStudy.emoji ?? '♟️'}</span>
                              <span className="text-sm font-bold text-white truncate">{exportTargetStudy.title || 'İsimsiz çalışma'}</span>
                              {(() => {
                                const cn =
                                  exportTargetStudy.categoryId != null &&
                                  studyPickerCategories.find((c) => c.id === exportTargetStudy.categoryId)?.name;
                                return cn ? (
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/25">
                                    {cn}
                                  </span>
                                ) : null;
                              })()}
                            </div>
                            <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
                              <span className="rounded-md bg-white/[0.04] px-2 py-1 border border-white/5">
                                {exportTargetStudy.chapters.length}{' '}
                                {exportTargetStudy.chapters.length === 1 ? 'bölüm mevcut' : 'bölüm mevcut'}
                              </span>
                              <span className="rounded-md bg-violet-500/10 px-2 py-1 border border-violet-500/20 text-violet-200 font-semibold">
                                +1 · {exportTargetStudy.chapters.length + 1}. sırada yeni bölüm
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

                  {/* Bölüm */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/25">
                        <Layers className="w-5 h-5 text-violet-300" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <label htmlFor="export-chapter-title" className="text-[11px] font-bold text-slate-300 block">
                          Bu kayıt hangi bölüm adıyla yazılsın?
                        </label>
                        <input
                          id="export-chapter-title"
                          value={exportChapterTitleDraft}
                          onChange={(e) => setExportChapterTitleDraft(e.target.value)}
                          placeholder={puzzleTitle.trim() || 'Bulmaca başlığı kullanılacak'}
                          className="w-full rounded-xl border border-white/10 bg-black/45 px-3.5 py-3 text-sm text-white placeholder:text-slate-600 shadow-inner focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/35"
                        />
                        <p className="text-[10px] text-slate-500 leading-snug">
                          Kaydedilen bölüm:{' '}
                          <strong className="text-slate-300">
                            «{exportChapterTitleDraft.trim() || puzzleTitle.trim() || '—'}»
                          </strong>
                          {!exportChapterTitleDraft.trim() && puzzleTitle.trim() ? (
                            <span className="text-slate-600"> · boş ise bulmacanın başlığı kullanılıyor</span>
                          ) : null}
                        </p>
                        {!exportTargetStudy ? (
                          <div className="flex items-start gap-2 rounded-lg bg-violet-500/5 border border-violet-500/15 px-3 py-2 text-[11px] text-violet-200/90">
                            <BookOpen className="w-4 h-4 shrink-0 mt-0.5 text-violet-400" />
                            <span>Yeni çalışmada yalnızca bu tek bölüm oluşur (liste adı = bulmaca başlığı).</span>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 px-3 py-2 text-[11px] text-emerald-100/90">
                            <Layers className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                            <span>
                              Bu tahta çalışma listesinin <strong>{exportTargetStudy.chapters.length + 1}</strong>.
                              sırasına, <strong>«{exportTargetStudy.title || 'Çalışma'}»</strong> içinin{' '}
                              <strong>{exportTargetStudy.chapters.length + 1}</strong>. bölümü olarak eklenecek.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveAsStudy}
                  className="group w-full relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-violet-500 to-indigo-600 py-4 font-black uppercase tracking-[0.15em] text-xs text-white shadow-[0_12px_40px_rgba(124,58,237,0.35)] transition-all hover:brightness-110 active:scale-[0.98]"
                >
                  <span className="relative flex items-center justify-center gap-3">
                    <BookOpen className="w-5 h-5 opacity-95" /> ÇALIŞMAYI KAYDET
                  </span>
                </button>
                <p className="text-[9px] text-center text-slate-600 uppercase tracking-widest px-2">
                  Önce başlığı doldurun · tahta geçerli pozisyon olmalıdır
                </p>
                {studySaveSuccess && (
                  <div className="flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/40 rounded-lg px-4 py-3 text-emerald-300 text-xs font-bold animate-in fade-in">
                    <Check className="w-4 h-4 shrink-0" /> İşlem tamam. Çalışma / Bulmaca-Yeni sekmesinden devam edebilirsiniz.
                  </div>
                )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'puzzles' && (
        <div className="space-y-6">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={puzzleSearch} onChange={e => setPuzzleSearch(e.target.value)}
                placeholder="Bulmaca ara..."
                className="w-full bg-slate-900/60 border border-white/10 rounded-lg pl-11 pr-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div className="inline-flex items-center rounded-lg bg-slate-900/60 border border-white/10 text-[11px] font-bold text-slate-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setPuzzleSourceFilter('all')}
                className={`px-3 py-2 transition-colors ${puzzleSourceFilter === 'all' ? 'bg-indigo-600 text-white' : 'hover:bg-white/5'}`}
              >
                Hepsi
              </button>
              <button
                type="button"
                onClick={() => setPuzzleSourceFilter('lichess')}
                className={`px-3 py-2 border-l border-white/10 transition-colors ${puzzleSourceFilter === 'lichess' ? 'bg-indigo-600 text-white' : 'hover:bg-white/5'}`}
              >
                Lichess
              </button>
              <button
                type="button"
                onClick={() => setPuzzleSourceFilter('custom')}
                className={`px-3 py-2 border-l border-white/10 transition-colors ${puzzleSourceFilter === 'custom' ? 'bg-indigo-600 text-white' : 'hover:bg-white/5'}`}
              >
                Kendi
              </button>
            </div>
            <select value={puzzleDiffFilter} onChange={e => setPuzzleDiffFilter(e.target.value)} className="bg-slate-900/60 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 appearance-none">
              <option value="all">Tüm Zorluklar</option>
              <option value="Kolay">Kolay</option>
              <option value="Orta">Orta</option>
              <option value="Zor">Zor</option>
            </select>
            <select value={puzzleCatFilter} onChange={e => setPuzzleCatFilter(e.target.value)} className="bg-slate-900/60 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 appearance-none">
              <option value="all">Tüm Kategoriler</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={puzzleThemeFilter} onChange={e => setPuzzleThemeFilter(e.target.value)} className="bg-slate-900/60 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 appearance-none">
              <option value="all">Tüm Temalar</option>
              <option value="mateIn1">Mate 1</option>
              <option value="mateIn2">Mate 2</option>
              <option value="mateIn3">Mate 3</option>
              <option value="mateIn4">Mate 4</option>
              <option value="fork">Çatal</option>
              <option value="pin">Şiş</option>
            </select>
            <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-5 py-3 rounded-lg text-xs font-black shadow-lg transition-all uppercase tracking-wider">
              <Download className="w-4 h-4" /> Lichess'ten Çek
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBulkSelectMode(v => {
                    const next = !v;
                    if (!next) setSelectedPuzzleIds([]);
                    return next;
                  });
                }}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg text-xs font-black uppercase tracking-wider border transition-colors ${
                  bulkSelectMode ? 'bg-indigo-600/20 text-indigo-200 border-indigo-500/30' : 'bg-slate-900/60 text-slate-200 border-white/10 hover:bg-white/5'
                }`}
                title="Toplu seçim"
              >
                <CheckSquare className="w-4 h-4" />
                Toplu Sil
              </button>
              {bulkSelectMode && (
                <>
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="px-4 py-3 rounded-lg text-xs font-black uppercase tracking-wider bg-slate-900/60 border border-white/10 text-slate-200 hover:bg-white/5 transition-colors"
                    title="Filtrelenenlerin hepsini seç"
                  >
                    Tümünü Seç
                  </button>
                  <button
                    type="button"
                    onClick={clearPuzzleSelection}
                    disabled={selectedPuzzleIds.length === 0}
                    className="px-4 py-3 rounded-lg text-xs font-black uppercase tracking-wider bg-slate-900/60 border border-white/10 text-slate-200 hover:bg-white/5 disabled:opacity-40 transition-colors"
                    title="Seçimi temizle"
                  >
                    Temizle
                  </button>
                  <button
                    type="button"
                    onClick={() => { void deleteSelectedPuzzles(); }}
                    disabled={selectedPuzzleIds.length === 0}
                    className="flex items-center gap-2 px-4 py-3 rounded-lg text-xs font-black uppercase tracking-wider bg-rose-600/20 border border-rose-500/30 text-rose-200 hover:bg-rose-600/30 disabled:opacity-40 transition-colors"
                    title="Seçilileri sil"
                  >
                    <Trash2 className="w-4 h-4" />
                    Seçilileri Sil ({selectedPuzzleIds.length})
                  </button>
                </>
              )}
            </div>
            {puzzles.length > 0 && (
              <span className="text-xs text-slate-500 font-mono">{filteredPuzzles.length}/{puzzles.length} bulmaca</span>
            )}
            {bulkSelectMode && (
              <span className="text-xs text-slate-500 font-mono">
                görünürde seçili: {selectedInViewCount}
              </span>
            )}
          </div>

          {/* Puzzle Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filteredPuzzles.length === 0 ? (
              <div className="col-span-full py-40 text-center bg-slate-900/40 rounded-lg border border-white/5 border-dashed shadow-inner">
                <div className="w-24 h-24 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-400 mx-auto mb-6"><Grid className="w-10 h-10" /></div>
                <h3 className="text-2xl font-black text-white mb-3">{puzzles.length === 0 ? 'Henüz Bulmaca Yok' : 'Sonuç Bulunamadı'}</h3>
                <p className="text-slate-400 text-sm max-w-sm mx-auto mb-8">
                  {puzzles.length === 0 ? 'Lichess veritabanından binlerce bulmaca import edebilir veya editörden manuel oluşturabilirsiniz.' : 'Arama kriterlerini değiştirerek tekrar deneyin.'}
                </p>
                <div className="flex gap-4 justify-center">
                  <button onClick={() => setShowImportModal(true)} className="px-8 py-4 bg-amber-600 text-white rounded-lg font-bold text-xs shadow-lg hover:bg-amber-500 transition-all uppercase tracking-widest flex items-center gap-2"><Download className="w-4 h-4" /> Lichess'ten Çek</button>
                  <button onClick={() => setActiveTab('editor')} className="px-8 py-4 bg-indigo-600 text-white rounded-lg font-bold text-xs shadow-lg hover:bg-indigo-500 transition-all uppercase tracking-widest">Manuel Oluştur</button>
                </div>
              </div>
            ) : (
              filteredPuzzles.map(puzzle => (
                <div key={puzzle.id} className="bg-slate-900/60 p-6 rounded-lg border border-white/5 flex flex-col items-center shadow-xl relative group hover:shadow-2xl transition-all">
                  {bulkSelectMode && (
                    <button
                      type="button"
                      onClick={() => togglePuzzleSelected(puzzle.id)}
                      className={`absolute top-3 left-3 z-20 w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
                        selectedPuzzleSet.has(puzzle.id)
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-black/30 border-white/10 text-slate-300 hover:bg-white/5'
                      }`}
                      title={selectedPuzzleSet.has(puzzle.id) ? 'Seçimi kaldır' : 'Seç'}
                    >
                      {selectedPuzzleSet.has(puzzle.id) ? <Check className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { if (window.confirm(`"${puzzle.title}" bulmacasını silmek istediğinize emin misiniz?`)) deletePuzzle(puzzle.id); }}
                    className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 border border-rose-500/30 transition-colors"
                    title="Bulmacayı sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="w-full aspect-square mb-5 rounded-lg overflow-hidden border-4 border-[#1e293b] relative flex-shrink-0 shadow-inner bg-slate-800/50">
                    {puzzle.imageData ? (
                      <img src={puzzle.imageData} alt={puzzle.title} className="w-full h-full object-contain" />
                    ) : (
                      <ChessBoardFrame hideCoordinates boardOrientation="white"><Chessboard options={staticBoardOptions(puzzle.fen)} /></ChessBoardFrame>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-auto backdrop-blur-sm">
                      <button onClick={() => playPuzzle(puzzle)} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black shadow-2xl scale-90 group-hover:scale-100 transition-all uppercase tracking-wider">Hemen Oyna</button>
                    </div>
                  </div>
                  <h4 className="text-sm font-black text-white mb-3 w-full text-left truncate">{puzzle.title}</h4>
                  <div className="w-full mb-3">
                    <button
                      type="button"
                      onClick={() => handleAddPuzzleToStudy(puzzle)}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-teal-600/20 text-teal-300 border border-teal-500/30 hover:bg-teal-600/30 transition-colors text-[11px] font-black uppercase tracking-wider"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Çalışmaya Ekle
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 w-full">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-wider font-black ${puzzle.difficulty === 'Kolay' ? 'bg-emerald-500/20 text-emerald-400' : puzzle.difficulty === 'Orta' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'}`}>{puzzle.difficulty}</span>
                    <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-lg text-[10px] uppercase tracking-wider font-black">{puzzle.points}p</span>
                    {puzzle.category && <span className="px-2.5 py-1 bg-slate-700/50 text-slate-400 rounded-lg text-[10px] font-bold truncate max-w-[120px]">{puzzle.category}</span>}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Lichess Import Modal */}
          {showImportModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => !importProgress.loading && setShowImportModal(false)}>
              <div className="bg-[#0f172a] border border-white/10 rounded-3xl shadow-2xl w-full max-w-xl mx-4 p-8 space-y-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-amber-500/20 rounded-lg flex items-center justify-center">
                      <Zap className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-white">Lichess Bulmaca Import</h2>
                      <p className="text-xs text-slate-500">4M+ bulmaca veritabanından çekin</p>
                    </div>
                  </div>
                  <button onClick={() => !importProgress.loading && setShowImportModal(false)} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Method 1: API Auto Fetch */}
                <div className="bg-slate-800/50 rounded-lg p-6 border border-white/5 space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Zap className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-bold text-white text-sm">Otomatik Çek (Lichess API)</h3>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Seviye, tema ve puan aralığına göre bulmacalar Lichess API üzerinden otomatik indirilir. CSV dosyası gerekmez.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Min Rating</label>
                      <input type="number" value={importFilter.minRating} onChange={e => setImportFilter(p => ({...p, minRating: +e.target.value}))} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Max Rating</label>
                      <input type="number" value={importFilter.maxRating} onChange={e => setImportFilter(p => ({...p, maxRating: +e.target.value}))} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Bulmaca Sayısı</label>
                      <div className="flex gap-1.5 mb-1.5">
                        {[1, 3, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setImportFilter((p) => ({ ...p, count: n }))}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-black border transition-colors ${
                              importFilter.count === n
                                ? 'bg-indigo-600 text-white border-indigo-500'
                                : 'bg-black/40 text-slate-400 border-white/10 hover:border-indigo-500/40'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <input type="number" min={1} max={500} value={importFilter.count} onChange={e => setImportFilter(p => ({...p, count: +e.target.value}))} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Temalar (opsiyonel)</label>
                      <input type="text" value={importFilter.themes} onChange={e => setImportFilter(p => ({...p, themes: e.target.value}))} placeholder="fork,pin,mate" className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">Örnek temalar: mix, fork, pin, mate, endgame, sacrifice. Boş bırakılırsa karışık (mix) kullanılır.</p>

                  <button onClick={handleFetchFromApi} disabled={importProgress.loading} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-4 rounded-lg flex items-center justify-center gap-3 text-xs uppercase tracking-widest transition-all shadow-lg">
                    <Download className="w-4 h-4" /> Bulmacaları Otomatik Çek
                  </button>
                </div>

                {/* Method 2: CSV Upload (optional) */}
                <details className="bg-slate-800/30 rounded-lg border border-white/5 group">
                  <summary className="cursor-pointer p-4 text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 list-none">
                    <FileText className="w-4 h-4 text-slate-500" />
                    Gelişmiş: CSV dosyasından içe aktar
                  </summary>
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-[10px] text-slate-500">
                      <a href="https://database.lichess.org/#puzzles" target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline">database.lichess.org</a> üzerinden indirilen CSV ile toplu import (büyük dosyalar için).
                    </p>
                    <input ref={fileInputRef} type="file" accept=".csv,.txt,.zst" onChange={handleCSVUpload} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} disabled={importProgress.loading} className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 text-xs uppercase tracking-widest">
                      <Upload className="w-4 h-4" /> CSV Dosyası Yükle
                    </button>
                  </div>
                </details>

                {/* Daily Puzzle */}
                <div className="bg-slate-800/50 rounded-lg p-6 border border-white/5 space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Zap className="w-5 h-5 text-amber-400" />
                    <h3 className="font-bold text-white text-sm">Günün Bulmacası</h3>
                  </div>
                  <p className="text-xs text-slate-400">Lichess API üzerinden günün bulmacasını otomatik çekin.</p>
                  <button onClick={handleFetchDaily} disabled={importProgress.loading} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-4 rounded-lg flex items-center justify-center gap-3 text-xs uppercase tracking-widest transition-all shadow-lg">
                    <Download className="w-4 h-4" /> Günün Bulmacasını Çek
                  </button>
                </div>

                {/* Progress */}
                {importProgress.message && (
                  <div className={`p-4 rounded-lg border ${importProgress.loading ? 'bg-indigo-500/10 border-indigo-500/20' : importProgress.count > 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                    <div className="flex items-center gap-3">
                      {importProgress.loading && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin flex-shrink-0" />}
                      <span className={`text-sm font-bold ${importProgress.loading ? 'text-indigo-300' : importProgress.count > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{importProgress.message}</span>
                    </div>
                    {importProgress.loading && importProgress.total > 0 && (
                      <div className="mt-3 bg-black/30 rounded-full h-2 overflow-hidden">
                        <div className="bg-indigo-500 h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (importProgress.count / importProgress.total) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                )}

                {/* Info */}
                <div className="bg-slate-800/30 rounded-lg p-4 border border-white/5">
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    <strong className="text-slate-400">Not:</strong> API ile istek başına en fazla 50 bulmaca gelir; hedef sayıya ulaşmak için birden fazla istek yapılır.
                    Çok yüksek sayılar (500+) birkaç dakika sürebilir. Tüm Lichess bulmacaları CC0 lisansı altındadır.
                  </p>
                </div>

                {/* Danger Zone */}
                {puzzles.length > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <span className="text-xs text-slate-500">{puzzles.length} bulmaca mevcut</span>
                    <button onClick={() => { if (confirm(`${puzzles.length} bulmaca silinecek. Emin misiniz?`)) { clearPuzzles(); setImportProgress({ loading: false, message: 'Tüm bulmacalar silindi.', count: 0, total: 0 }); }}} className="text-xs text-rose-400 hover:text-rose-300 font-bold transition-colors">
                      Tümünü Sil
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'assign' && (
        <div className="space-y-6">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex bg-slate-900/60 p-1 rounded-lg border border-white/5">
              <button onClick={() => setHwMode('list')} className={`px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${hwMode === 'list' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                <span className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5" /> Ödevler</span>
              </button>
              <button onClick={() => setHwMode('create')} className={`px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${hwMode === 'create' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                <span className="flex items-center gap-2"><Plus className="w-3.5 h-3.5" /> Yeni Ödev</span>
              </button>
            </div>
            {hwMode === 'list' && (
              <button onClick={() => setHwMode('create')} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg text-xs font-black shadow-lg transition-all uppercase tracking-wider">
                <Plus className="w-4 h-4" /> Ödev Oluştur
              </button>
            )}
          </div>

          {/* CREATE MODE */}
          {hwMode === 'create' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* Left: Puzzle Selection */}
              <div className="xl:col-span-7 space-y-4">
                <div className="bg-slate-900/60 border border-white/5 rounded-lg p-6 space-y-4">
                  <h3 className="font-black text-white flex items-center gap-2 text-sm"><Grid className="w-4 h-4 text-indigo-400" /> Bulmaca Seç <span className="text-xs text-slate-500 font-normal ml-auto">{hwSelectedPuzzles.length} seçili</span></h3>
                  
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input value={hwPuzzleSearch} onChange={e => setHwPuzzleSearch(e.target.value)} placeholder="Bulmaca ara..." className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors" />
                  </div>

                  {puzzles.length === 0 ? (
                    <div className="text-center py-12">
                      <AlertCircle className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                      <p className="text-sm text-slate-500">Henüz bulmaca yok. Önce bulmaca ekleyin veya Lichess'ten import edin.</p>
                      <button onClick={() => setActiveTab('puzzles')} className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 font-bold transition-colors">Bulmacalara Git</button>
                    </div>
                  ) : (
                    <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                      {hwFilteredPuzzles.map(p => {
                        const selected = hwSelectedPuzzles.includes(p.id);
                        return (
                          <button key={p.id} onClick={() => toggleHwPuzzle(p.id)} className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${selected ? 'bg-indigo-600/15 border-indigo-500/40' : 'bg-black/20 border-white/5 hover:bg-white/5'}`}>
                            <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center transition-colors ${selected ? 'bg-indigo-500' : 'border border-slate-600'}`}>
                              {selected && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                              <ChessBoardFrame hideCoordinates boardOrientation="white" className="w-full h-full"><Chessboard options={{ position: p.fen, darkSquareStyle: { backgroundColor: '#779952' }, lightSquareStyle: { backgroundColor: '#edeed1' }, ...CHESSBOARD_ANIMATION, ...CHESSBOARD_NO_NOTATION, allowDragging: false }} /></ChessBoardFrame>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-white truncate">{p.title}</p>
                              <p className="text-[10px] text-slate-500">{p.category} · {p.difficulty}</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${p.difficulty === 'Kolay' ? 'bg-emerald-500/20 text-emerald-400' : p.difficulty === 'Orta' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'}`}>{p.points}p</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {hwSelectedPuzzles.length > 0 && (
                    <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                      <span className="text-[10px] text-slate-500">{hwSelectedPuzzles.length} bulmaca, toplam {puzzles.filter(p => hwSelectedPuzzles.includes(p.id)).reduce((s, p) => s + p.points, 0)} puan</span>
                      <button onClick={() => setHwSelectedPuzzles([])} className="ml-auto text-[10px] text-rose-400 hover:text-rose-300 font-bold">Temizle</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Assignment Details */}
              <div className="xl:col-span-5 space-y-4">
                <div className="bg-slate-900/60 border border-white/5 rounded-lg p-6 space-y-5">
                  <h3 className="font-black text-white flex items-center gap-2 text-sm"><Edit3 className="w-4 h-4 text-indigo-400" /> Ödev Bilgileri</h3>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Ödev Başlığı</label>
                    <input value={hwTitle} onChange={e => setHwTitle(e.target.value)} placeholder="Örn: Haftalık Taktik Ödevi" className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                      Son Teslim Tarihi <span className="text-slate-600 font-bold normal-case">(isteğe bağlı)</span>
                    </label>
                    <input type="date" value={hwDueDate} onChange={e => setHwDueDate(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors [color-scheme:dark]" />
                  </div>
                </div>

                {/* Assign To */}
                <div className="bg-slate-900/60 border border-white/5 rounded-lg p-6 space-y-4">
                  <h3 className="font-black text-white flex items-center gap-2 text-sm"><Users className="w-4 h-4 text-indigo-400" /> Kimler Görsün</h3>

                  <div className="flex bg-black/30 p-1 rounded-lg">
                    <button onClick={() => setHwAssignMode('groups')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${hwAssignMode === 'groups' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400'}`}>Gruplara</button>
                    <button onClick={() => setHwAssignMode('students')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${hwAssignMode === 'students' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400'}`}>Öğrencilere</button>
                  </div>

                  {hwAssignMode === 'groups' ? (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {studentGroups.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-4">Grup bulunamadı.</p>
                      ) : studentGroups.map((g: string) => {
                        const selected = hwSelectedGroups.includes(g);
                        const count = students.filter(s => s.group === g).length;
                        return (
                          <button key={g} onClick={() => toggleHwGroup(g)} className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${selected ? 'bg-indigo-600/15 border-indigo-500/40' : 'bg-black/20 border-white/5 hover:bg-white/5'}`}>
                            <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center transition-colors ${selected ? 'bg-indigo-500' : 'border border-slate-600'}`}>
                              {selected && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className="text-sm text-white font-medium flex-1">{g}</span>
                            <span className="text-[10px] text-slate-500">{count} öğrenci</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {students.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-4">Öğrenci bulunamadı.</p>
                      ) : students.map(s => {
                        const selected = hwSelectedStudents.includes(s.id);
                        return (
                          <button key={s.id} onClick={() => toggleHwStudent(s.id)} className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${selected ? 'bg-indigo-600/15 border-indigo-500/40' : 'bg-black/20 border-white/5 hover:bg-white/5'}`}>
                            <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center transition-colors ${selected ? 'bg-indigo-500' : 'border border-slate-600'}`}>
                              {selected && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-white truncate">{s.name}</p>
                              <p className="text-[10px] text-slate-500">{s.group} · {s.level}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Summary & Save */}
                <div className="bg-slate-900/60 border border-white/5 rounded-lg p-6 space-y-4">
                  <h3 className="font-black text-white text-sm">Özet</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-black/30 rounded-lg p-3 text-center">
                      <p className="text-lg font-black text-indigo-400">{hwSelectedPuzzles.length}</p>
                      <p className="text-[10px] text-slate-500">Bulmaca</p>
                    </div>
                    <div className="bg-black/30 rounded-lg p-3 text-center">
                      <p className="text-lg font-black text-emerald-400">
                        {hwAssignMode === 'groups'
                          ? students.filter(s => hwSelectedGroups.includes(s.group)).length
                          : hwSelectedStudents.length}
                      </p>
                      <p className="text-[10px] text-slate-500">Öğrenci</p>
                    </div>
                    <div className="bg-black/30 rounded-lg p-3 text-center">
                      <p className="text-lg font-black text-amber-400">{puzzles.filter(p => hwSelectedPuzzles.includes(p.id)).reduce((s, p) => s + p.points, 0)}</p>
                      <p className="text-[10px] text-slate-500">Toplam Puan</p>
                    </div>
                  </div>
                  <button onClick={handleCreateHomework} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-lg flex items-center justify-center gap-3 text-xs uppercase tracking-widest transition-all shadow-lg active:scale-[0.98]">
                    <Save className="w-4 h-4" /> Ödevi Kaydet ve Ata
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* LIST MODE */}
          {hwMode === 'list' && (
            <div className="space-y-4">
              {homeworks.length === 0 ? (
                <div className="py-32 text-center bg-slate-900/40 rounded-lg border border-white/5 border-dashed shadow-inner">
                  <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-400 mx-auto mb-5"><BookOpen className="w-9 h-9" /></div>
                  <h3 className="text-xl font-black text-white mb-2">Henüz Ödev Yok</h3>
                  <p className="text-slate-400 text-sm max-w-sm mx-auto mb-6">Öğrencilerinize bulmaca ödevleri atayarak pratik yapmalarını sağlayın.</p>
                  <button onClick={() => setHwMode('create')} className="px-8 py-3.5 bg-emerald-600 text-white rounded-lg font-bold text-xs shadow-lg hover:bg-emerald-500 transition-all uppercase tracking-widest flex items-center gap-2 mx-auto">
                    <Plus className="w-4 h-4" /> İlk Ödevi Oluştur
                  </button>
                </div>
              ) : (
                homeworks.map(hw => {
                  const expanded = hwExpandedId === hw.id;
                  const hwPuzzles = puzzles.filter(p => hw.puzzles.includes(p.id));
                  const assignees = getHwAssignees(hw);
                  const overdue = isHwOverdue(hw.dueDate);
                  const groups = hw.assignedTo.filter(a => a.startsWith('group:')).map(a => a.replace('group:', ''));
                  const totalPoints = hwPuzzles.reduce((s, p) => s + p.points, 0);

                  return (
                    <div key={hw.id} className="bg-slate-900/60 border border-white/5 rounded-lg overflow-hidden transition-all">
                      {/* Header */}
                      <button onClick={() => setHwExpandedId(expanded ? null : hw.id)} className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/[0.02] transition-colors">
                        <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${overdue ? 'bg-rose-500/20' : 'bg-indigo-500/20'}`}>
                          <BookOpen className={`w-5 h-5 ${overdue ? 'text-rose-400' : 'text-indigo-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-white truncate">{hw.title}</h4>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(hw.dueDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                            <span className="text-[10px] text-slate-500 flex items-center gap-1"><Grid className="w-3 h-3" /> {hw.puzzles.length} bulmaca</span>
                            <span className="text-[10px] text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" /> {assignees.length} öğrenci</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {overdue && <span className="px-2.5 py-1 bg-rose-500/20 text-rose-400 rounded-lg text-[10px] font-black uppercase">Süresi Doldu</span>}
                          <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-lg text-[10px] font-black">{totalPoints}p</span>
                          {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                        </div>
                      </button>

                      {/* Expanded Details */}
                      {expanded && (
                        <div className="border-t border-white/5 p-5 space-y-5">
                          {/* Puzzles */}
                          <div>
                            <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Bulmacalar ({hwPuzzles.length})</h5>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                              {hwPuzzles.map(p => (
                                <div key={p.id} className="bg-black/30 rounded-lg p-2.5 border border-white/5">
                                  <div className="aspect-square rounded-lg overflow-hidden mb-2 border border-white/10">
                                    <ChessBoardFrame hideCoordinates boardOrientation="white" className="w-full h-full"><Chessboard options={{ position: p.fen, darkSquareStyle: { backgroundColor: '#779952' }, lightSquareStyle: { backgroundColor: '#edeed1' }, ...CHESSBOARD_ANIMATION, ...CHESSBOARD_NO_NOTATION, allowDragging: false }} /></ChessBoardFrame>
                                  </div>
                                  <p className="text-[10px] font-bold text-white truncate">{p.title}</p>
                                  <div className="flex gap-1 mt-1">
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${p.difficulty === 'Kolay' ? 'bg-emerald-500/20 text-emerald-400' : p.difficulty === 'Orta' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'}`}>{p.difficulty}</span>
                                    <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[8px] font-black">{p.points}p</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Assignees */}
                          <div>
                            <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                              Atanan {groups.length > 0 ? `Gruplar: ${groups.join(', ')}` : ''} ({assignees.length} öğrenci)
                            </h5>
                            <div className="flex flex-wrap gap-2">
                              {assignees.map(s => (
                                <span key={s.id} className="px-3 py-1.5 bg-black/30 border border-white/5 rounded-lg text-xs text-slate-300 font-medium">
                                  {s.name} <span className="text-slate-600">({s.group})</span>
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-3 pt-3 border-t border-white/5">
                            <button onClick={() => { if (confirm('Bu ödev silinecek. Emin misiniz?')) deleteHomework(hw.id); }} className="flex items-center gap-2 px-4 py-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs font-bold hover:bg-rose-500/20 transition-colors">
                              <Trash className="w-3.5 h-3.5" /> Sil
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* ANALİZ */}
      {activeTab === 'analysis' && (
        <div className="space-y-6">
          {puzzles.length === 0 && homeworks.length === 0 ? (
            <div className="py-32 text-center bg-slate-900/40 rounded-lg border border-white/5 border-dashed shadow-inner">
              <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-400 mx-auto mb-5"><BarChart2 className="w-9 h-9" /></div>
              <h3 className="text-xl font-black text-white mb-2">Analiz için Veri Yok</h3>
              <p className="text-slate-400 text-sm max-w-sm mx-auto mb-6">Bulmaca ekleyin veya ödev atayın, istatistikler burada görünecek.</p>
            </div>
          ) : (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-900/60 border border-white/5 rounded-lg p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center"><Grid className="w-5 h-5 text-indigo-400" /></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Toplam Bulmaca</span>
                  </div>
                  <p className="text-3xl font-black text-white">{puzzleStats.total}</p>
                </div>
                <div className="bg-slate-900/60 border border-white/5 rounded-lg p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center"><Target className="w-5 h-5 text-amber-400" /></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Toplam Puan</span>
                  </div>
                  <p className="text-3xl font-black text-white">{puzzleStats.totalPoints}</p>
                </div>
                <div className="bg-slate-900/60 border border-white/5 rounded-lg p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center"><BookOpen className="w-5 h-5 text-emerald-400" /></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Aktif Ödev</span>
                  </div>
                  <p className="text-3xl font-black text-white">{puzzleStats.hwActive}</p>
                </div>
                <div className="bg-slate-900/60 border border-white/5 rounded-lg p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-rose-500/20 rounded-lg flex items-center justify-center"><Clock className="w-5 h-5 text-rose-400" /></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Süresi Dolan</span>
                  </div>
                  <p className="text-3xl font-black text-white">{puzzleStats.hwOverdue}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Difficulty Distribution */}
                <div className="bg-slate-900/60 border border-white/5 rounded-lg p-6 space-y-5">
                  <h3 className="font-black text-white flex items-center gap-2 text-sm"><PieChart className="w-4 h-4 text-indigo-400" /> Zorluk Dağılımı</h3>
                  {puzzleStats.total > 0 ? (
                    <>
                      <div className="flex items-center justify-center py-4">
                        <div className="relative w-40 h-40">
                          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                            {(() => {
                              const data = [
                                { pct: puzzleStats.easy / puzzleStats.total * 100, color: '#10b981' },
                                { pct: puzzleStats.medium / puzzleStats.total * 100, color: '#f59e0b' },
                                { pct: puzzleStats.hard / puzzleStats.total * 100, color: '#ef4444' },
                              ];
                              let offset = 0;
                              return data.map((d, i) => {
                                const el = <circle key={i} cx="18" cy="18" r="15.9155" fill="none" stroke={d.color} strokeWidth="3.5" strokeDasharray={`${d.pct} ${100 - d.pct}`} strokeDashoffset={-offset} strokeLinecap="round" />;
                                offset += d.pct;
                                return el;
                              });
                            })()}
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center flex-col">
                            <span className="text-2xl font-black text-white">{puzzleStats.total}</span>
                            <span className="text-[9px] text-slate-500 uppercase">bulmaca</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {[
                          { label: 'Kolay', count: puzzleStats.easy, color: 'bg-emerald-500', textColor: 'text-emerald-400' },
                          { label: 'Orta', count: puzzleStats.medium, color: 'bg-amber-500', textColor: 'text-amber-400' },
                          { label: 'Zor', count: puzzleStats.hard, color: 'bg-rose-500', textColor: 'text-rose-400' },
                        ].map(d => (
                          <div key={d.label} className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${d.color} flex-shrink-0`} />
                            <span className="text-xs font-bold text-slate-300 flex-1">{d.label}</span>
                            <span className={`text-sm font-black ${d.textColor}`}>{d.count}</span>
                            <span className="text-[10px] text-slate-600 w-10 text-right">{puzzleStats.total > 0 ? Math.round(d.count / puzzleStats.total * 100) : 0}%</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : <p className="text-sm text-slate-500 text-center py-8">Bulmaca verisi yok</p>}
                </div>

                {/* Category Distribution */}
                <div className="bg-slate-900/60 border border-white/5 rounded-lg p-6 space-y-5">
                  <h3 className="font-black text-white flex items-center gap-2 text-sm"><TrendingUp className="w-4 h-4 text-indigo-400" /> Kategori Dağılımı</h3>
                  {puzzleStats.categories.length > 0 ? (
                    <div className="space-y-3">
                      {puzzleStats.categories.slice(0, 10).map(([cat, count]: [string, number]) => {
                        const maxCat = puzzleStats.categories[0][1] as number;
                        const cnt = Number(count);
                        const pct = maxCat > 0 ? (cnt / maxCat) * 100 : 0;
                        return (
                          <div key={cat} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-300">{cat}</span>
                              <span className="text-xs font-black text-indigo-400">{count}</span>
                            </div>
                            <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-indigo-600 to-violet-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="text-sm text-slate-500 text-center py-8">Kategori verisi yok</p>}
                </div>
              </div>

              {/* Homework Overview */}
              <div className="bg-slate-900/60 border border-white/5 rounded-lg p-6 space-y-5">
                <h3 className="font-black text-white flex items-center gap-2 text-sm"><BookOpen className="w-4 h-4 text-indigo-400" /> Ödev Özeti</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-black/30 rounded-lg p-4 text-center border border-white/5">
                    <p className="text-2xl font-black text-white">{puzzleStats.hwTotal}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Toplam Ödev</p>
                  </div>
                  <div className="bg-black/30 rounded-lg p-4 text-center border border-white/5">
                    <p className="text-2xl font-black text-emerald-400">{puzzleStats.hwActive}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Aktif</p>
                  </div>
                  <div className="bg-black/30 rounded-lg p-4 text-center border border-white/5">
                    <p className="text-2xl font-black text-rose-400">{puzzleStats.hwOverdue}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Süresi Dolan</p>
                  </div>
                  <div className="bg-black/30 rounded-lg p-4 text-center border border-white/5">
                    <p className="text-2xl font-black text-amber-400">{puzzleStats.hwTotalPuzzles}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Atanan Bulmaca</p>
                  </div>
                </div>

                {homeworks.length > 0 && (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {homeworks.map(hw => {
                      const overdue = isHwOverdue(hw.dueDate);
                      const assignees = getHwAssignees(hw);
                      return (
                        <div key={hw.id} className="flex items-center gap-3 p-3 bg-black/20 rounded-lg border border-white/5">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${overdue ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                          <span className="text-xs font-bold text-white flex-1 truncate">{hw.title}</span>
                          <span className="text-[10px] text-slate-500">{hw.puzzles.length} bulmaca</span>
                          <span className="text-[10px] text-slate-500">{assignees.length} öğrenci</span>
                          <span className={`text-[10px] font-bold ${overdue ? 'text-rose-400' : 'text-slate-500'}`}>
                            {new Date(hw.dueDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Puzzle Per Student Group */}
              {homeworks.length > 0 && (
                <div className="bg-slate-900/60 border border-white/5 rounded-lg p-6 space-y-5">
                  <h3 className="font-black text-white flex items-center gap-2 text-sm"><Users className="w-4 h-4 text-indigo-400" /> Gruplara Atanan Ödev Sayısı</h3>
                  <div className="space-y-3">
                    {studentGroups.map(g => {
                      const groupHws = homeworks.filter(h => h.assignedTo.some(a => a === `group:${g}`));
                      const totalPuzzles = groupHws.reduce((s, h) => s + h.puzzles.length, 0);
                      return (
                        <div key={g} className="flex items-center gap-4 p-3 bg-black/20 rounded-lg border border-white/5">
                          <span className="text-xs font-bold text-white flex-1">{g}</span>
                          <span className="text-[10px] text-slate-500">{groupHws.length} ödev</span>
                          <span className="text-xs font-black text-indigo-400">{totalPuzzles} bulmaca</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const TabButton: React.FC<{active: boolean; onClick: () => void; icon: React.ReactNode; label: string}> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`flex items-center gap-3 px-6 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${active ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
    {icon} <span>{label}</span>
  </button>
);

export default ChessBoard;
