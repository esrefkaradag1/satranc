import React, { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense, type CSSProperties } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import {
  ArrowLeft, Mic, MicOff, Video, VideoOff, Clock,
  Move, LayoutGrid, Upload, FileText, ChevronRight, Plus, Link2, Copy, Check,
  Users, BookMarked, Trash2, AlertTriangle, MessageCircle, Send, Loader2, X, Puzzle,
  Library, BookOpen, ChevronDown, ChevronUp, ChevronLeft,
  Settings2, Search, Compass, FolderOpen, GraduationCap, Pencil,
  ChevronFirst, ChevronLast, Play, Pause, Download, Zap, MoreVertical, HelpCircle, Minus, Focus,
  MousePointer2, PanelRight, Hand,
} from 'lucide-react';
import { useStockfish } from '../hooks/useStockfish';
import type { PvLine } from '../hooks/useStockfish';
import { useApp } from '../AppContext';
import { getServiceSupabase, isSupabaseBackend } from '../services/supabase';
import AgoraRTC, { type IAgoraRTCClient, type ICameraVideoTrack, type IMicrophoneAudioTrack, type IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import type { IVirtualBackgroundProcessor } from 'agora-extension-virtual-background';
import {
  applyVirtualBackgroundBlur,
  ensureVirtualBackgroundProcessor,
  isVirtualBackgroundSupported,
  readCameraBlurPreference,
  releaseVirtualBackgroundProcessor,
  writeCameraBlurPreference,
} from '../lib/agoraVirtualBackground';
import { DrawingToolbar, type DrawingTool } from '../components/DrawingToolbar';
import { saveStudyAsync } from '../studyStorage';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION, type SquareMarkColor, squareMarksToStyles, COLOR_VALUES } from '../lib/chessBoardUi';
import { Study, StudyChapter } from '../lib/studyTypes';
import type { Puzzle as PuzzleType } from '../types';
import { makeBuilderGame, applyMove } from '../lib/studyUtils';
import {
  liveLessonFenAt,
  sanitizeLiveVariations,
  type LiveVariationRef,
} from '../lib/liveLessonVariations';
import { loadStudiesAsync } from '../studyStorage';
import { ChessBoardFrame, ChessEvalBar } from './chess/ChessBoardFrame';
import { BoardViewToggle } from './chess/BoardViewToggle';
import { useBoardViewMode } from '../hooks/useBoardViewMode';

const Chessboard3D = lazy(() => import('./chess/Chessboard3D'));
import {
  fenAfterUciPlies,
  EngineLinePreviewInline,
  EnginePvInteractiveMoves,
  type LinePreviewState,
  type PvHoverState,
} from '../lib/enginePvPreview';
import { isBoardFlipShortcutKey, keyboardTargetAllowsBoardShortcut } from '../lib/boardFlipShortcut';
import { StudyMoveTree } from './study/StudyMoveTree';
import Analysis from './Analysis';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const DEFAULT_ROOM_ID = 'default';
const SYNC_POLL_MS = 1000;
const COACH_SIDE_STORAGE_KEY = 'live_lesson_coach_side';
const COACH_BOARD_SCALE_STORAGE_KEY = 'live_lesson_coach_board_scale_pct';
const STUDENT_BOARD_SCALE_STORAGE_KEY = 'live_lesson_student_board_scale_pct';
const BOARD_SCALE_MIN = 65;
const BOARD_SCALE_MAX = 125;
const BOARD_SCALE_DEFAULT = 100;

const liveLessonStudyTargetKey = (roomId: string) => `live_lesson_study_target_${roomId}`;

type StudyExportPayload = {
  fen: string;
  moves: string[];
  defaultChapterTitle: string;
};

type SavedStudyTarget = {
  studyId: string;
  chapterId?: string;
  mode?: 'update' | 'new';
};

function parseSavedStudyTarget(roomId: string): SavedStudyTarget | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(liveLessonStudyTargetKey(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as SavedStudyTarget;
  } catch {
    return null;
  }
}

function validateExportFen(fenStr: string): string | null {
  try {
    new Chess(fenStr);
    return fenStr;
  } catch {
    try {
      new Chess(fenStr, { skipValidation: true } as { skipValidation: boolean });
      return fenStr;
    } catch {
      return null;
    }
  }
}

const STUDY_EXPORT_NEW_ID = '__new__';

function sortStudiesForPicker(studies: Study[]): Study[] {
  return [...studies].sort((a, b) => {
    const ta = new Date(b.updatedAt ?? b.createdAt).getTime();
    const tb = new Date(a.updatedAt ?? a.createdAt).getTime();
    return ta - tb;
  });
}

function splitStudiesForExportPicker(studies: Study[]): { myStudies: Study[]; contributedStudies: Study[] } {
  const myStudies = sortStudiesForPicker(studies.filter((s) => !s.studentCreated));
  const contributedStudies = sortStudiesForPicker(studies.filter((s) => s.studentCreated));
  return { myStudies, contributedStudies };
}
const BOARD_SCALE_STEP = 5;

function clampBoardScalePct(v: number): number {
  if (!Number.isFinite(v)) return BOARD_SCALE_DEFAULT;
  return Math.min(BOARD_SCALE_MAX, Math.max(BOARD_SCALE_MIN, Math.round(v)));
}

function parseStoredCoachBoardScalePct(): number {
  if (typeof window === 'undefined') return BOARD_SCALE_DEFAULT;
  try {
    const n = Number.parseInt(localStorage.getItem(COACH_BOARD_SCALE_STORAGE_KEY) || '', 10);
    return clampBoardScalePct(Number.isFinite(n) ? n : BOARD_SCALE_DEFAULT);
  } catch {
    return BOARD_SCALE_DEFAULT;
  }
}

function parseStoredStudentBoardScalePct(): number {
  if (typeof window === 'undefined') return BOARD_SCALE_DEFAULT;
  try {
    const n = Number.parseInt(localStorage.getItem(STUDENT_BOARD_SCALE_STORAGE_KEY) || '', 10);
    return clampBoardScalePct(Number.isFinite(n) ? n : BOARD_SCALE_DEFAULT);
  } catch {
    return BOARD_SCALE_DEFAULT;
  }
}
const AGORA_APP_ID = (import.meta.env.VITE_AGORA_APP_ID as string | undefined)?.trim() ?? '';
const AGORA_CHANNEL_PREFIX = (import.meta.env.VITE_AGORA_CHANNEL_PREFIX as string | undefined)?.trim() || 'satranc';

export type LiveLessonRoom = { id: string; room_name: string | null; updated_at?: string };

const VALID_SQUARE = /^[a-h][1-8]$/;
type ArrowItem = { startSquare: string; endSquare: string; color: string };

/** react-chessboard çizim önizlemesi — kayda yazılmaz */
const ARROW_PREVIEW_COLORS = new Set(['rgba(99,102,241,0.85)', 'rgba(99,102,241,0.4)']);

/** Kütüphane key olarak sadece startSquare-endSquare kullandığı için aynı çift tek olmalı. */
function sanitizeArrows(list: ArrowItem[]): ArrowItem[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list.filter((a) => {
    if (!a || typeof a.startSquare !== 'string' || typeof a.endSquare !== 'string') return false;
    const start = a.startSquare.toLowerCase();
    const end = a.endSquare.toLowerCase();
    if (!VALID_SQUARE.test(start) || !VALID_SQUARE.test(end)) return false;
    const key = `${start}-${end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((a) => ({
    startSquare: a.startSquare.toLowerCase(),
    endSquare: a.endSquare.toLowerCase(),
    color: typeof a.color === 'string' ? a.color : '#ffaa00',
  }));
}

function persistedArrows(list: ArrowItem[]): ArrowItem[] {
  return sanitizeArrows(list).filter((a) => !ARROW_PREVIEW_COLORS.has(a.color));
}

export type LiveChatMessage = {
  id: string;
  /** coach için sabit 'coach' */
  studentId: string;
  role: 'coach' | 'student';
  text: string;
  at: string;
};

export type SessionMediaState = {
  /** Söz hakkı: bu öğrenci mikrofonu açabilir (tek kişi) */
  floorStudentId: string | null;
  /** Antrenörün öğrenci mikrofonunu kapatması (söz hakkı olsa bile açılamaz) */
  studentMicBlocked: Record<string, boolean>;
  /** Antrenör bu öğrencinin kamera yayınını kapatır (öğrenci yerelde açsa bile kapanır) */
  studentCamForcedOff: Record<string, boolean>;
  coachMicMuted: boolean;
  coachCamOff: boolean;
  activePuzzleId?: string | null;
  studentCanSeePuzzleSolution?: boolean;
  /** Yeni öğrencilerin bağlantı/link ile katılımına izin */
  openParticipation?: boolean;
  /** Kovulan öğrenci kimlikleri — istemci kendini çıkarır */
  kickedStudentIds?: string[];
  /** Bekleme odasındaki öğrenciler (antrenör onayı bekliyor) */
  pendingStudentIds?: string[];
  /** Derse alınmış öğrenciler */
  admittedStudentIds?: string[];
  /** Öğrenci tarafında Stockfish / analiz paneli görünür mü */
  studentAnalysisVisible?: boolean;
  /** Öğrenci tahtasında avantaj çubuğu (antrenör «Avantaj çubuğu» ile senkron) */
  studentEvalBarVisible?: boolean;
  /** Söz isteyen öğrenciler (antrenör onayı bekliyor) */
  handRaisedStudentIds?: string[];
  /** Bağımsız tahta kullanan öğrenci kimlikleri */
  independentBoardStudentIds?: string[];
  /** Öğrenci başına bağımsız tahta anlık görüntüsü */
  studentBoards?: Record<string, LiveStudentBoardSnapshot>;
};

export type LiveStudentBoardSnapshot = {
  fen: string;
  moves: string[];
  baseFen?: string;
  variations?: Record<number, string[][]>;
};

const DEFAULT_SESSION_MEDIA: SessionMediaState = {
  floorStudentId: null,
  studentMicBlocked: {},
  studentCamForcedOff: {},
  coachMicMuted: false,
  coachCamOff: false,
  activePuzzleId: null,
  studentCanSeePuzzleSolution: false,
  openParticipation: false,
  kickedStudentIds: [],
  pendingStudentIds: [],
  admittedStudentIds: [],
  studentAnalysisVisible: false,
  studentEvalBarVisible: false,
  handRaisedStudentIds: [],
  independentBoardStudentIds: [],
  studentBoards: {},
};

/** Agora stream değişince video önizlemesinin siyah kalmasını önler */
function LiveLessonVideoPlayer({
  stream,
  muted = false,
  className = '',
  camOff = false,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  camOff?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!stream) {
      el.srcObject = null;
      return;
    }
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    void el.play().catch(() => {});
  }, [stream]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;
    const replay = () => {
      void el.play().catch(() => {});
    };
    const tracks = stream.getVideoTracks();
    tracks.forEach((t) => {
      t.addEventListener('ended', replay);
      t.addEventListener('unmute', replay);
    });
    return () => {
      tracks.forEach((t) => {
        t.removeEventListener('ended', replay);
        t.removeEventListener('unmute', replay);
      });
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className={`${className} ${camOff ? 'opacity-40' : ''}`}
      playsInline
      muted={muted}
      autoPlay
    />
  );
}

/** Öğrenci id eşlemesi (UUID / Supabase bazen farklı tipte dönebilir) */
function normalizeStudentId(id: string | null | undefined): string {
  if (id == null) return '';
  return String(id).trim();
}

function idsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeStudentId(a);
  const y = normalizeStudentId(b);
  return x !== '' && x === y;
}

function pickSquare(arg: unknown): string | null {
  if (typeof arg === 'string') return arg;
  if (!arg || typeof arg !== 'object') return null;
  const square = (arg as any).square;
  return typeof square === 'string' ? square : null;
}

function pickDropArgs(a: unknown, b?: unknown) {
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
}

function parseDropSquares(
  a: unknown,
  b?: unknown
): { sourceSquare: string | null; targetSquare: string | null } {
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
}

function parseStudentBoards(raw: unknown): Record<string, LiveStudentBoardSnapshot> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, LiveStudentBoardSnapshot> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    const o = val as Record<string, unknown>;
    const fen = typeof o.fen === 'string' ? o.fen.trim() : '';
    if (!fen) continue;
    const moves = Array.isArray(o.moves) ? o.moves.map((m) => String(m)) : [];
    let variations: Record<number, string[][]> | undefined;
    if (o.variations && typeof o.variations === 'object' && !Array.isArray(o.variations)) {
      variations = sanitizeLiveVariations(o.variations);
    }
    out[normalizeStudentId(key)] = {
      fen,
      moves,
      baseFen: typeof o.baseFen === 'string' ? o.baseFen : undefined,
      variations,
    };
  }
  return out;
}

function parseSessionMedia(raw: unknown): SessionMediaState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SESSION_MEDIA };
  const o = raw as Record<string, unknown>;
  const fl = o.floorStudentId;
  let floorStudentId: string | null = null;
  if (fl != null && fl !== '') {
    const s = typeof fl === 'string' ? fl.trim() : String(fl).trim();
    floorStudentId = s || null;
  }
  let studentMicBlocked: Record<string, boolean> = {};
  if (o.studentMicBlocked && typeof o.studentMicBlocked === 'object' && !Array.isArray(o.studentMicBlocked)) {
    studentMicBlocked = {};
    for (const [k, v] of Object.entries(o.studentMicBlocked as Record<string, unknown>)) {
      studentMicBlocked[normalizeStudentId(k)] = !!v;
    }
  }
  let studentCamForcedOff: Record<string, boolean> = {};
  if (o.studentCamForcedOff && typeof o.studentCamForcedOff === 'object' && !Array.isArray(o.studentCamForcedOff)) {
    studentCamForcedOff = {};
    for (const [k, v] of Object.entries(o.studentCamForcedOff as Record<string, unknown>)) {
      studentCamForcedOff[normalizeStudentId(k)] = !!v;
    }
  }
  let kickedStudentIds: string[] | undefined;
  if (Array.isArray(o.kickedStudentIds)) {
    kickedStudentIds = o.kickedStudentIds
      .map((x) => normalizeStudentId(typeof x === 'string' ? x : String(x)))
      .filter(Boolean);
  }
  const parseIdList = (
    key: 'pendingStudentIds' | 'admittedStudentIds' | 'handRaisedStudentIds' | 'independentBoardStudentIds',
  ): string[] | undefined => {
    const raw = o[key];
    if (!Array.isArray(raw)) return undefined;
    return raw
      .map((x) => normalizeStudentId(typeof x === 'string' ? x : String(x)))
      .filter(Boolean);
  };
  return {
    floorStudentId,
    studentMicBlocked,
    studentCamForcedOff,
    coachMicMuted: !!o.coachMicMuted,
    coachCamOff: !!o.coachCamOff,
    activePuzzleId: o.activePuzzleId != null ? String(o.activePuzzleId) : null,
    studentCanSeePuzzleSolution: !!o.studentCanSeePuzzleSolution,
    openParticipation: o.openParticipation === undefined ? undefined : !!o.openParticipation,
    kickedStudentIds,
    pendingStudentIds: parseIdList('pendingStudentIds'),
    admittedStudentIds: parseIdList('admittedStudentIds'),
    handRaisedStudentIds: parseIdList('handRaisedStudentIds'),
    independentBoardStudentIds: parseIdList('independentBoardStudentIds'),
    studentBoards: parseStudentBoards(o.studentBoards),
    studentAnalysisVisible: !!o.studentAnalysisVisible,
    studentEvalBarVisible:
      o.studentEvalBarVisible !== undefined
        ? !!o.studentEvalBarVisible
        : !!o.studentAnalysisVisible,
  };
}

/** Antrenörün tahtadaki rolü; öğrenci tarafı ters renk veya both (işbirlik) */
export type CollaborativeBoardSide = 'w' | 'b' | 'both';

export type PlayBoardSide = 'w' | 'b' | 'both';

/** Menü: «Beyaz olarak oynayın» → antrenör siyah, öğrenci beyaz */
function studentPlaySideFromCoach(coach: CollaborativeBoardSide | null): PlayBoardSide | null {
  if (coach === 'w') return 'b';
  if (coach === 'b') return 'w';
  if (coach === 'both') return 'both';
  return null;
}

function formatCoachSeatLabel(side: CollaborativeBoardSide | null): string {
  if (side === 'w') return 'Beyaz';
  if (side === 'b') return 'Siyah';
  if (side === 'both') return 'Her iki taraf';
  return '';
}

/** Sağ panel sekmeleri */
export type ClassroomSidebarTab =
  | 'analiz'
  | 'katilimcilar'
  | 'goruntu'
  | 'sohbet'
  | 'oyunlar'
  | 'kesfet';

function formatStudentSeatLabel(side: PlayBoardSide | null): string {
  if (side === 'w') return 'Beyaz';
  if (side === 'b') return 'Siyah';
  if (side === 'both') return 'Her iki renk';
  return 'Henüz atanmadı';
}

export interface LiveLessonProps {
  /** Öğrenci panelinden açıldığında "Geri" yerine bu çağrılır */
  onBack?: () => void;
  /** Öğrenci görünümü: katılım linki bölümü gizlenir, geri butonu onBack kullanır */
  isStudentView?: boolean;
  /** Öğrenci bir odaya tıklayıp katıldığında verilir; yoksa admin'de oda seçimi/listesi gösterilir */
  roomId?: string;
  /** Öğrenci görünümünde sohbet / mikrofon eşlemesi için */
  studentId?: string;
}

function genShortRoomId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

function makeStudyId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function formatClassroomEngineScore(line: PvLine | null | undefined, turn: 'w' | 'b'): string {
  if (!line) return '—';
  const flip = turn === 'b' ? -1 : 1;
  if (line.mate !== null) {
    const m = line.mate * flip;
    return m > 0 ? `M${Math.abs(m)}` : `-M${Math.abs(m)}`;
  }
  // analysisService cp değerini zaten /100 ile puan cinsinden tutar; tekrar bölünmez
  const s = line.score * flip;
  const x = `${s >= 0 ? '+' : ''}${s.toFixed(2)}`;
  return x;
}

/** Dikey avantaj çubuğu (atan eşlemesi StudyPage ile uyumlu) — değer + = beyaz lehine */
function classroomEvalBarPawns(line: PvLine | null | undefined, turn: 'w' | 'b'): number {
  if (!line) return 0;
  const flip = turn === 'b' ? -1 : 1;
  if (line.mate !== null) {
    const m = line.mate * flip;
    if (m > 0) return 8;
    if (m < 0) return -8;
    return 0;
  }
  const v = line.score * flip;
  return Math.max(-6, Math.min(6, v));
}

/** Motor / katılım anahtarı: thumb pist içinde kalır */
function ClassroomToggle({ on, onToggle, id }: { on: boolean; onToggle: () => void; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`relative h-[26px] w-[46px] shrink-0 overflow-hidden rounded-full border border-white/10 transition-colors duration-200 hover:brightness-[1.06] active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/55 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${on ? 'bg-indigo-500' : 'bg-slate-700'}`}
    >
      <span className="sr-only">{on ? 'Açık' : 'Kapalı'}</span>
      <span
        aria-hidden
        className="pointer-events-none absolute left-[3px] top-1/2 size-[18px] rounded-full bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_1px_2px_rgba(0,0,0,0.28)] ring-1 ring-black/12 transition-[transform] duration-200 ease-[cubic-bezier(0.2,0.85,0.25,1)] motion-reduce:transition-none"
        style={{ transform: on ? 'translate3d(22px, -50%, 0)' : 'translate3d(0, -50%, 0)' }}
      />
    </button>
  );
}

const LiveLesson: React.FC<LiveLessonProps> = ({ onBack, isStudentView, roomId: roomIdProp, studentId: studentIdProp }) => {
  const { students, puzzles, refreshStudentsFromSupabase, addAttendanceRecord } = useApp();
  /** Admin: seçilen oda (null = sınıf listesi göster) */
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<LiveLessonRoom[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [showNewRoomModal, setShowNewRoomModal] = useState(false);
  /** Yeni oda oluştururken davet edilecek öğrenci id'leri */
  const [inviteStudentIds, setInviteStudentIds] = useState<string[]>([]);
  /** Oda oluşturulduktan sonra davet linki göster */
  const [inviteFollowUp, setInviteFollowUp] = useState<{
    roomId: string;
    roomName: string;
    invitedStudentIds: string[];
  } | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteStudentsLoading, setInviteStudentsLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  /** Oda silme onayı (native confirm yerine) */
  const [roomPendingDelete, setRoomPendingDelete] = useState<LiveLessonRoom | null>(null);
  const [deleteRoomLoading, setDeleteRoomLoading] = useState(false);
  const [deleteRoomError, setDeleteRoomError] = useState<string | null>(null);
  const selectedRoomIdRef = useRef<string | null>(null);
  /** Etkili oda: öğrenci için prop, admin için seçilen veya default */
  const effectiveRoomId = roomIdProp ?? selectedRoomId ?? DEFAULT_ROOM_ID;
  /** Upsert için zorunlu olabilecek oda adı (race / yeni satır için) */
  const effectiveRoomName = useMemo(() => {
    const fromList = rooms.find((r) => r.id === effectiveRoomId)?.room_name?.trim();
    if (fromList) return fromList;
    if (effectiveRoomId === DEFAULT_ROOM_ID) return 'Varsayılan ders';
    return `Oda ${effectiveRoomId}`;
  }, [rooms, effectiveRoomId]);
  const showClassList = !isStudentView && !roomIdProp && selectedRoomId === null && isSupabaseBackend();
  const [game, setGame] = useState(() => new Chess());
  const [fen, setFen] = useState(game.fen());
  const [baseFen, setBaseFen] = useState(START_FEN);
  const [hoverFen, setHoverFen] = useState<string | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [variations, setVariations] = useState<Record<number, string[][]>>({});
  const [currentVariation, setCurrentVariation] = useState<LiveVariationRef | null>(null);
  const variationsRef = useRef(variations);
  variationsRef.current = variations;
  /** Kamera varsayılan açık; öğrenci mikrofonu söz hakkı gelene kadar kapalı */
  const [isMuted, setIsMuted] = useState(() => !!isStudentView);
  const [isCameraOff, setIsCameraOff] = useState(false);
  /** fetchState closure’da güncel sessionMedia (kalkan birleştirmesi için). */
  const sessionMediaRef = useRef<SessionMediaState>(DEFAULT_SESSION_MEDIA);
  const [sessionMedia, setSessionMedia] = useState<SessionMediaState>(DEFAULT_SESSION_MEDIA);
  sessionMediaRef.current = sessionMedia;
  const sidSelfNormEarly = useMemo(() => normalizeStudentId(studentIdProp), [studentIdProp]);
  const isStudentAdmittedToClass = useMemo(
    () =>
      !isStudentView ||
      !isSupabaseBackend() ||
      !sidSelfNormEarly ||
      (sessionMedia.admittedStudentIds ?? []).some((kid) => idsEqual(kid, sidSelfNormEarly)),
    [isStudentView, sidSelfNormEarly, sessionMedia.admittedStudentIds],
  );
  const isStudentWaitingForAdmission = useMemo(
    () =>
      isStudentView &&
      isSupabaseBackend() &&
      !!sidSelfNormEarly &&
      !isStudentAdmittedToClass &&
      !(sessionMedia.kickedStudentIds ?? []).some((kid) => idsEqual(kid, sidSelfNormEarly)),
    [isStudentView, sidSelfNormEarly, isStudentAdmittedToClass, sessionMedia.kickedStudentIds],
  );
  const isStudentKickedFromRoom = useMemo(
    () =>
      isStudentView &&
      isSupabaseBackend() &&
      !!sidSelfNormEarly &&
      (sessionMedia.kickedStudentIds ?? []).some((kid) => idsEqual(kid, sidSelfNormEarly)),
    [isStudentView, sidSelfNormEarly, sessionMedia.kickedStudentIds],
  );
  const [chatMessages, setChatMessages] = useState<LiveChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<ClassroomSidebarTab>('analiz');
  /** Mobilde tahta / yan panel — masaüstünde ikisi yan yana */
  const [mobileClassroomPanel, setMobileClassroomPanel] = useState<'board' | 'sidebar'>('board');
  /** Oyunlar sekmesi alt bölümü */
  const [oyunlarSection, setOyunlarSection] = useState<'library' | 'pgn' | 'position'>('library');
  /** Notasyon zaman çizelgesinde gezinme; null = güncel (son ply) */
  const [replayNavPly, setReplayNavPly] = useState<number | null>(null);
  const [replayIsPlaying, setReplayIsPlaying] = useState(false);
  /** Motor göstergesi (sidebar) */
  const [engineEvalVisible, setEngineEvalVisible] = useState(true);
  const [engineLinesVisible, setEngineLinesVisible] = useState(true);
  const [enginePvHover, setEnginePvHover] = useState<PvHoverState>(null);
  const [engineLinePreview, setEngineLinePreview] = useState<LinePreviewState>(null);
  const [enginePreviewFen, setEnginePreviewFen] = useState<string | null>(null);
  /** Davet kutusu kullanıcı adı (arka uç uyarı/link odaklı) */
  const [inviteUsernameInput, setInviteUsernameInput] = useState('');
  const [inviteToast, setInviteToast] = useState<string | null>(null);
  const [managePanelOpen, setManagePanelOpen] = useState(false);
  const [participantMenuStudentId, setParticipantMenuStudentId] = useState<string | null>(null);
  /** Sohbeti Chess.com tarzı altta küçük panelde göster */
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  /** Sağ üst masaüstü saati */
  const [wallClock, setWallClock] = useState(() =>
    typeof window !== 'undefined' ? new Date().toLocaleTimeString('tr-TR') : '');
  const [puzzleSearch, setPuzzleSearch] = useState('');
  const [selectedPoolPuzzleId, setSelectedPoolPuzzleId] = useState<string | null>(null);
  const [showPoolSolution, setShowPoolSolution] = useState(false);
  const [fenInput, setFenInput] = useState('');
  const [pgnInput, setPgnInput] = useState('');
  const [positionError, setPositionError] = useState('');
  const [pgnError, setPgnError] = useState('');
  const sessionStartRef = useRef(Date.now());
  const [sessionTime, setSessionTime] = useState('00:00');
  const lastSyncRef = useRef<string>('');
  const lastAnnoSyncRef = useRef<string>('');
  const lastLocalMoveTimeRef = useRef<number>(0);
  const [analysisMode, setAnalysisMode] = useState(false);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('mouse');
  /** Tıklanan taşa göre yasal hamle noktaları (sürükleyerek de uyumlu) */
  const [moveHintSquare, setMoveHintSquare] = useState<string | null>(null);
  /** Antrenör tahta ölçeği % — localStorage `live_lesson_coach_board_scale_pct` */
  const [coachBoardScalePct, setCoachBoardScalePct] = useState(parseStoredCoachBoardScalePct);
  const [boardViewMode, setBoardViewMode] = useBoardViewMode();
  /** Öğrenci tahta ölçeği % — localStorage `live_lesson_student_board_scale_pct` */
  const [studentBoardScalePct, setStudentBoardScalePct] = useState(parseStoredStudentBoardScalePct);
  /** Öğrenci: antrenör tahtası mı kendi bağımsız tahtası mı görünsün */
  const [studentBoardViewMode, setStudentBoardViewMode] = useState<'teacher' | 'own'>('own');
  useEffect(() => {
    if (isStudentView) return;
    if (drawingTool !== 'mouse') setMoveHintSquare(null);
  }, [drawingTool, isStudentView]);

  useEffect(() => {
    if (isStudentView) return;
    try {
      localStorage.setItem(COACH_BOARD_SCALE_STORAGE_KEY, String(coachBoardScalePct));
    } catch {
      /* ignore */
    }
  }, [coachBoardScalePct, isStudentView]);

  useEffect(() => {
    if (!isStudentView) return;
    try {
      localStorage.setItem(STUDENT_BOARD_SCALE_STORAGE_KEY, String(studentBoardScalePct));
    } catch {
      /* ignore */
    }
  }, [studentBoardScalePct, isStudentView]);

  const [drawingColor, setDrawingColor] = useState<SquareMarkColor>('red');
  const [marks, setMarks] = useState<Record<string, { color: SquareMarkColor, type: 'square' | 'circle' | 'x' }>>({});
  /** DB'de coach_side kolonu yoksa false (400 sonrası) */
  const schemaHasExtendedRef = useRef<boolean | null>(null);
  /** arrows kolonu — marks gibi ayrı tespit (coach_side olmasa da ok senkronu çalışsın) */
  const schemaHasArrowsRef = useRef<boolean | null>(null);
  /** marks kolonu yoksa upsert'te marks göndermeyin; yoksa tam istek 400 olur ve coach_side yazılamaz. */
  const schemaHasMarksRef = useRef<boolean | null>(null);
  /** Antrenör mik/kam tıkladıktan sonra kısa süre uzak session_media’nin eski coachMicMuted/coachCamOff ile üzerine yazmasını engelle. */
  const coachLocalMediaShieldUntilRef = useRef<number>(0);
  /** Tabloda kolon var mı (select '*' ile tespit); yoksa ilgili PATCH atlanır (400 gürültüsü olmaz) */
  const schemaHasSessionMediaRef = useRef<boolean | null>(null);
  const schemaHasChatMessagesRef = useRef<boolean | null>(null);
  const schemaHasVariationsRef = useRef<boolean | null>(null);
  const [coachSide, setCoachSide] = useState<CollaborativeBoardSide | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem(COACH_SIDE_STORAGE_KEY);
      if (stored === 'w' || stored === 'b' || stored === 'both') return stored;
    } catch { /* ignore */ }
    return null;
  });
  /** Klavye F: tahtayı yalnızca yerelde çevir (oturumdaki koç tarafı değişmez) */
  const [lessonBoardViewFlipped, setLessonBoardViewFlipped] = useState(false);

  useEffect(() => {
    setLessonBoardViewFlipped(false);
  }, [coachSide]);

  const [arrows, setArrows] = useState<Array<{ startSquare: string; endSquare: string; color: string }>>([]);
  const [boardReady, setBoardReady] = useState(false);
  /** Yerel kamera/mikrofon akışı (önizleme + track.enabled ile aç/kapa) */
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'ended' | 'error'>('idle');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
  const agoraLocalAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const agoraLocalVideoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const vbProcessorRef = useRef<IVirtualBackgroundProcessor | null>(null);
  const vbPipedTrackRef = useRef<ICameraVideoTrack | null>(null);
  const [cameraBackgroundBlur, setCameraBackgroundBlur] = useState(readCameraBlurPreference);
  const [vbSupported] = useState(() => isVirtualBackgroundSupported());
  const [vbApplying, setVbApplying] = useState(false);
  const activeCallRoomRef = useRef<string | null>(null);
  /** Son yazdığımız Agora mic/cam; session_media yoklaması effect’i tetiklese bile setEnabled spam’ını keser */
  const prevAgoraMediaAppliedRef = useRef<{ mic: boolean; cam: boolean } | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [studies, setStudies] = useState<Study[]>([]);
  const [fetchingStudies, setFetchingStudies] = useState(false);
  const [expandedStudyId, setExpandedStudyId] = useState<string | null>(null);
  const [showStudyExportModal, setShowStudyExportModal] = useState(false);
  const [studyExportPayload, setStudyExportPayload] = useState<StudyExportPayload | null>(null);
  const [studyExportRoomId, setStudyExportRoomId] = useState('');
  const [studyExportStudyId, setStudyExportStudyId] = useState('');
  const [studyExportChapterId, setStudyExportChapterId] = useState('');
  const [studyExportMode, setStudyExportMode] = useState<'update' | 'new'>('update');
  const [studyExportChapterTitle, setStudyExportChapterTitle] = useState('');
  const [studyExportSaving, setStudyExportSaving] = useState(false);
  const [studyExportMessage, setStudyExportMessage] = useState('');
  const [selectedAnalysisStudentId, setSelectedAnalysisStudentId] = useState<string | null>(null);
  const currentStudent = useMemo(
    () => students.find((s) => idsEqual(s.id, studentIdProp)) ?? null,
    [students, studentIdProp]
  );
  const visibleStudents = useMemo(
    () => (isStudentView ? students.filter((s) => !idsEqual(s.id, studentIdProp)) : students),
    [students, isStudentView, studentIdProp]
  );
  const liveVideoTiles = useMemo(() => {
    const tiles: Array<{
      id: string;
      name: string;
      role: 'coach' | 'student';
      isSelf: boolean;
      stream: MediaStream | null;
      micMuted: boolean;
      camOff: boolean;
    }> = [];

    // Koç kutusu: koç görünümünde yerel akış, öğrenci görünümünde uzak akış.
    tiles.push({
      id: 'coach',
      name: 'Baş Antrenör',
      role: 'coach',
      isSelf: !isStudentView,
      stream: isStudentView ? remoteStream : localStream,
      micMuted: sessionMedia.coachMicMuted,
      /** Koç önizlemesi: yalnızca sessionMedia (toggle burayı anında güncelliyor); isCameraOff koçta güncellenmeyebiliyordu ve OR ile preview kapanık kalıyordu */
      camOff: isStudentView ? (sessionMedia.coachCamOff && !remoteStream) : sessionMedia.coachCamOff,
    });

    if (isStudentView && currentStudent) {
      const selfSid = normalizeStudentId(currentStudent.id);
      const coachOffCam = !!(selfSid && (sessionMedia.studentCamForcedOff[selfSid] ?? false));
      tiles.push({
        id: `self-${currentStudent.id}`,
        name: `${currentStudent.name} (Siz)`,
        role: 'student',
        isSelf: true,
        stream: localStream,
        micMuted: isMuted,
        camOff: isCameraOff || coachOffCam,
      });
    }

    const otherStudents = isStudentView ? visibleStudents : students;
    for (const [index, s] of otherStudents.entries()) {
      const sid = normalizeStudentId(s.id);
      if (isStudentView && currentStudent && idsEqual(s.id, currentStudent.id)) continue;
      const streamForTile = !isStudentView && index === 0 ? remoteStream : null;
      const coachForcedStudentCam = !!(sid && (sessionMedia.studentCamForcedOff[sid] ?? false));
      tiles.push({
        id: `student-${sid || s.id}`,
        name: s.name,
        role: 'student',
        isSelf: false,
        stream: streamForTile,
        micMuted: sessionMedia.studentMicBlocked[sid] ?? false,
        camOff: !streamForTile || coachForcedStudentCam,
      });
    }

    return tiles;
  }, [isStudentView, localStream, remoteStream, sessionMedia, isCameraOff, currentStudent, isMuted, visibleStudents, students]);
  const [focusedVideoTileId, setFocusedVideoTileId] = useState<string | null>(null);
  const activeVideoTile = useMemo(
    () => liveVideoTiles.find((t) => t.id === focusedVideoTileId) ?? liveVideoTiles[0] ?? null,
    [liveVideoTiles, focusedVideoTileId]
  );
  const sideVideoTiles = useMemo(
    () => liveVideoTiles.filter((t) => !activeVideoTile || t.id !== activeVideoTile.id),
    [liveVideoTiles, activeVideoTile]
  );

  useEffect(() => {
    if (!liveVideoTiles.length) {
      setFocusedVideoTileId(null);
      return;
    }
    if (!focusedVideoTileId || !liveVideoTiles.some((t) => t.id === focusedVideoTileId)) {
      setFocusedVideoTileId(liveVideoTiles[0].id);
    }
  }, [liveVideoTiles, focusedVideoTileId]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    return () => {
      const client = agoraClientRef.current;
      const audioTrack = agoraLocalAudioTrackRef.current;
      const videoTrack = agoraLocalVideoTrackRef.current;
      Promise.resolve().then(async () => {
        try {
          if (client && (audioTrack || videoTrack)) {
            await client.unpublish([audioTrack, videoTrack].filter(Boolean) as Array<IMicrophoneAudioTrack | ICameraVideoTrack>);
          }
        } catch {}
        try { audioTrack?.close(); } catch {}
        try { videoTrack?.close(); } catch {}
        try { await client?.leave(); } catch {}
        try {
          await releaseVirtualBackgroundProcessor(vbProcessorRef, vbPipedTrackRef);
        } catch {}
      });
      agoraClientRef.current = null;
      agoraLocalAudioTrackRef.current = null;
      agoraLocalVideoTrackRef.current = null;
      activeCallRoomRef.current = null;
      setRemoteStream(null);
      setCallStatus('ended');
    };
  }, []);

  useEffect(() => {
    if (showClassList || !effectiveRoomId || isStudentWaitingForAdmission) return;
    if (!AGORA_APP_ID) {
      setMediaError('Agora APP ID eksik. .env dosyasina VITE_AGORA_APP_ID ekleyin.');
      return;
    }
    let cancelled = false;
    const callRoomKey = `${AGORA_CHANNEL_PREFIX}-${effectiveRoomId}`;
    const roleDisplayName = isStudentView
      ? (currentStudent?.name || `ogrenci-${normalizeStudentId(studentIdProp).slice(0, 6) || 'anonim'}`)
      : 'coach';

    const startAgora = async () => {
      setMediaLoading(true);
      setMediaError(null);
      setCallStatus('connecting');
      try {
        if (activeCallRoomRef.current && activeCallRoomRef.current !== callRoomKey) {
          try {
            const prevClient = agoraClientRef.current;
            const prevAudio = agoraLocalAudioTrackRef.current;
            const prevVideo = agoraLocalVideoTrackRef.current;
            if (prevClient && (prevAudio || prevVideo)) {
              await prevClient.unpublish([prevAudio, prevVideo].filter(Boolean) as Array<IMicrophoneAudioTrack | ICameraVideoTrack>);
            }
            prevAudio?.close();
            prevVideo?.close();
            await prevClient?.leave();
            await releaseVirtualBackgroundProcessor(vbProcessorRef, vbPipedTrackRef);
          } catch {}
          agoraClientRef.current = null;
          agoraLocalAudioTrackRef.current = null;
          agoraLocalVideoTrackRef.current = null;
          setLocalStream(null);
          setRemoteStream(null);
        }

        const client = agoraClientRef.current ?? AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        agoraClientRef.current = client;
        activeCallRoomRef.current = callRoomKey;

        client.removeAllListeners();
        client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
          try {
            await client.subscribe(user, mediaType);
            if (mediaType === 'audio' && user.audioTrack) user.audioTrack.play();
            if (mediaType === 'video' && user.videoTrack) {
              const track = user.videoTrack.getMediaStreamTrack();
              const stream = new MediaStream([track]);
              if (!cancelled) {
                setRemoteStream(stream);
                setCallStatus('connected');
              }
            }
          } catch (e) {
            if (!cancelled) {
              const msg = e instanceof Error ? e.message : String(e);
              setMediaError(msg);
              setCallStatus('error');
            }
          }
        });
        client.on('user-unpublished', (_user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
          if (mediaType === 'video' && !cancelled) setRemoteStream(null);
        });
        client.on('user-left', () => {
          if (!cancelled) setRemoteStream(null);
        });

        if (client.connectionState !== 'CONNECTED') {
          const uidBase = isStudentView ? normalizeStudentId(studentIdProp) || roleDisplayName : 'coach';
          await client.join(AGORA_APP_ID, callRoomKey, null, uidBase.slice(0, 32));
        }

        if (!agoraLocalAudioTrackRef.current || !agoraLocalVideoTrackRef.current) {
          const [micTrack, camTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
            { ANS: true, AEC: true },
            { encoderConfig: '480p_1' },
          );
          agoraLocalAudioTrackRef.current = micTrack;
          agoraLocalVideoTrackRef.current = camTrack;
          const preview = new MediaStream([camTrack.getMediaStreamTrack()]);
          setLocalStream(preview);
          await client.publish([micTrack, camTrack]);
        }

        if (!cancelled) {
          setCallStatus(remoteStream ? 'connected' : 'idle');
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setMediaError(msg);
          setCallStatus('error');
        }
      } finally {
        if (!cancelled) setMediaLoading(false);
      }
    };

    void startAgora();
    return () => {
      cancelled = true;
    };
  }, [effectiveRoomId, showClassList, isStudentView, currentStudent?.name, studentIdProp, isStudentWaitingForAdmission]);

  useEffect(() => {
    prevAgoraMediaAppliedRef.current = null;
  }, [effectiveRoomId, isStudentView]);

  useEffect(() => {
    const t = setTimeout(() => setBoardReady(true), 150);
    return () => clearTimeout(t);
  }, []);



  /** UI ve sunucu durumuna göre Agora yerel track’leri güncelle. Kamera tekrar açılınca SDK yeni MediaStreamTrack döndürür; eski yerel önizleme siyah kalırdı — bu yüzden stream’i tazeliyoruz. MediaStream.track.enabled ile müdahale ETME — setEnabled ile çakışır. */
  useEffect(() => {
    if (mediaLoading) return;
    const audioTrack = agoraLocalAudioTrackRef.current;
    const videoTrack = agoraLocalVideoTrackRef.current;
    if (!audioTrack || !videoTrack) return;

    let micEnabled: boolean;
    let camEnabled: boolean;
    if (!isStudentView) {
      micEnabled = !sessionMedia.coachMicMuted;
      camEnabled = !sessionMedia.coachCamOff;
    } else {
      const sid = normalizeStudentId(studentIdProp);
      const blocked = sid ? (sessionMedia.studentMicBlocked[sid] ?? false) : true;
      const hasFloor = !!(sid && idsEqual(sessionMedia.floorStudentId, sid));
      const coachForcedCamOff = !!(sid && (sessionMedia.studentCamForcedOff[sid] ?? false));
      micEnabled = hasFloor && !blocked && !isMuted;
      camEnabled = !isCameraOff && !coachForcedCamOff;
    }

    const prev = prevAgoraMediaAppliedRef.current;
    const micChanged = !prev || prev.mic !== micEnabled;
    const camChanged = !prev || prev.cam !== camEnabled;
    /** Kapalıdan açığa geçiş: Agora iç track’i yenilediği için yerel `<video>` srcObject güncellenmeli */
    const reopenLocalCamPreview =
      !!(prev && prev.cam === false && camEnabled && camChanged);

    prevAgoraMediaAppliedRef.current = { mic: micEnabled, cam: camEnabled };

    if (micChanged) void audioTrack.setEnabled(micEnabled);
    if (camChanged) {
      void videoTrack.setEnabled(camEnabled).then(() => {
        if (!reopenLocalCamPreview) return;
        try {
          setLocalStream(new MediaStream([videoTrack.getMediaStreamTrack()]));
        } catch {
          /* ignore */
        }
      });
    }
  }, [
    mediaLoading,
    isStudentView,
    studentIdProp,
    sessionMedia,
    isMuted,
    isCameraOff,
  ]);

  const retryLocalMedia = useCallback(() => {
    setMediaError(null);
    const videoTrack = agoraLocalVideoTrackRef.current;
    const audioTrack = agoraLocalAudioTrackRef.current;
    if (!videoTrack || !audioTrack) {
      setMediaError('Kamera akisiniz hazir degil. Odaya tekrar katilin.');
      return;
    }
    try {
      const preview = new MediaStream([videoTrack.getMediaStreamTrack()]);
      setLocalStream(preview);
    } catch (e) {
      setMediaError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  /** Antrenör tarayıcı sekmesini kapatınca açık odayı sil (canlı ders oturumu bitti) */
  useEffect(() => {
    if (isStudentView || !isSupabaseBackend()) return;
    const onPageHide = () => {
      const id = selectedRoomIdRef.current;
      if (!id) return;
      const sb = getServiceSupabase();
      if (!sb) return;
      void sb.from('live_lesson_state').delete().eq('id', id);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [isStudentView]);

  useEffect(() => {
    const t = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      setSessionTime(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const tick = () => setWallClock(new Date().toLocaleTimeString('tr-TR'));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, []);

  const isPgColumnError = useCallback((err: unknown) => {
    const e = err as { status?: number; code?: string; message?: string };
    return (
      e.status === 400 ||
      e.code === 'PGRST204' ||
      String(e.message || '').toLowerCase().includes('column')
    );
  }, []);

  /** Paylaşılan tahta + medya + sohbet: Supabase’ten oku ve periyodik güncelle */
  useEffect(() => {
    if (!isSupabaseBackend()) return;
    const sb = getServiceSupabase();
    if (!sb) return;
    const fetchState = async () => {
      /** '*' = yalnızca tabloda gerçekten var olan kolonlar döner; eksik kolon adı 400 hatası vermez */
      const result = await sb.from('live_lesson_state').select('*').eq('id', effectiveRoomId).maybeSingle();
      if (result.error) {
        if (isPgColumnError(result.error)) {
          schemaHasSessionMediaRef.current = false;
          schemaHasChatMessagesRef.current = false;
          schemaHasExtendedRef.current = false;
          schemaHasArrowsRef.current = false;
          schemaHasMarksRef.current = false;
        }
        return;
      }
      if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) return;
      const data = result.data as Record<string, unknown>;
      schemaHasSessionMediaRef.current = 'session_media' in data;
      schemaHasChatMessagesRef.current = 'chat_messages' in data;
      schemaHasExtendedRef.current = 'coach_side' in data;
      schemaHasArrowsRef.current = 'arrows' in data;
      schemaHasMarksRef.current = 'marks' in data;
      schemaHasVariationsRef.current = 'variations' in data;
      const now = Date.now();
      const skipBoardSync = now - lastLocalMoveTimeRef.current < 2000;

      /** Kare işaretleri ve oklar — hamle kalkanından bağımsız, öğrenciye her zaman yansıt */
      const annoKey = `${JSON.stringify(data.marks ?? null)}|${JSON.stringify(data.arrows ?? [])}`;
      if (annoKey !== lastAnnoSyncRef.current) {
        lastAnnoSyncRef.current = annoKey;
        if ('marks' in data) {
          setMarks(
            data.marks && typeof data.marks === 'object' && !Array.isArray(data.marks)
              ? (data.marks as Record<string, { color: SquareMarkColor; type: 'square' | 'circle' | 'x' }>)
              : {}
          );
        }
        if ('arrows' in data && Array.isArray(data.arrows)) {
          setArrows(sanitizeArrows(data.arrows as ArrowItem[]));
        }
      }

      const smFromRow =
        data.session_media != null && typeof data.session_media === 'object'
          ? parseSessionMedia(data.session_media)
          : null;
      const sidForBoard = normalizeStudentId(studentIdProp);
      const studentUsesOwnBoard =
        isStudentView &&
        studentBoardViewMode === 'own' &&
        !!sidForBoard &&
        (smFromRow?.independentBoardStudentIds ?? sessionMediaRef.current.independentBoardStudentIds ?? []).some(
          (kid) => idsEqual(kid, sidForBoard),
        );

      if (!skipBoardSync && !studentUsesOwnBoard) {
        const syncKey = `${data.fen}|${data.updated_at}|${annoKey}|${JSON.stringify(data.session_media ?? '')}|${JSON.stringify(data.chat_messages ?? '')}`;
        if (syncKey !== lastSyncRef.current) {
          lastSyncRef.current = syncKey;
          try {
            const c = new Chess(data.fen as string);
            setGame(c);
            setFen(c.fen());
            setMoveHistory(Array.isArray(data.moves) ? (data.moves as string[]) : []);
            if ('variations' in data) {
              setVariations(sanitizeLiveVariations(data.variations));
            }
            setCurrentVariation(null);
          } catch {
            // ignore invalid fen
          }
          if ('coach_side' in data) {
            const raw = data.coach_side;
            if (raw === 'w' || raw === 'b' || raw === 'both') {
              const side = raw as CollaborativeBoardSide;
              try { sessionStorage.setItem(COACH_SIDE_STORAGE_KEY, side); } catch { /* ignore */ }
              setCoachSide(side);
            } else if (raw == null || raw === '') {
              setCoachSide(null);
              try { sessionStorage.removeItem(COACH_SIDE_STORAGE_KEY); } catch { /* ignore */ }
            }
          }
        }
      }

      /** session_media kolonu yoksa bu alan gelmez; varsa ({} dahil) her zaman işle */
      if (data.session_media != null && typeof data.session_media === 'object') {
        let sm = smFromRow ?? parseSessionMedia(data.session_media);
        /** Optimistik koç mik/kam güncellemesi, yoklamanın eski satırla üzerine yazmasını engelle */
        if (!isStudentView && Date.now() < coachLocalMediaShieldUntilRef.current) {
          const cur = sessionMediaRef.current;
          sm = { ...sm, coachMicMuted: cur.coachMicMuted, coachCamOff: cur.coachCamOff };
        }
        setSessionMedia(sm);
        if (!isStudentView) {
          setIsMuted(sm.coachMicMuted);
          setIsCameraOff(sm.coachCamOff);
        } else if (studentIdProp) {
          const sid = normalizeStudentId(studentIdProp);
          const blocked = !!(sid && sm.studentMicBlocked[sid]);
          const hasFloor = idsEqual(sm.floorStudentId, sid);
          if (blocked || !hasFloor) {
            setIsMuted(true);
          } else {
            /** Söz hakkı + mik. izni var: yerel sessizi kapat ki ses akışı açılsın */
            setIsMuted(false);
          }
        }
      }
      if (Array.isArray(data.chat_messages)) {
        const raw = data.chat_messages as unknown[];
        const parsed: LiveChatMessage[] = raw
          .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
          .map((x) => ({
            id: String(x.id ?? ''),
            studentId: String(x.studentId ?? ''),
            role: x.role === 'coach' ? 'coach' : 'student',
            text: String(x.text ?? ''),
            at: String(x.at ?? ''),
          }))
          .filter((m) => m.id && m.text);
        /** Toplu derste öğrenci belleğinde ve ekranda yalnızca antrenör + kendi mesajları (diğer öğrenciler gizli) */
        if (isStudentView) {
          const sid = normalizeStudentId(studentIdProp);
          if (!sid) setChatMessages([]);
          else {
            setChatMessages(
              parsed.filter(
                (m) =>
                  m.role === 'coach' ||
                  (m.role === 'student' && idsEqual(m.studentId, sid))
              )
            );
          }
        } else {
          setChatMessages(parsed);
        }
      }
    };
    fetchState();
    const interval = setInterval(fetchState, SYNC_POLL_MS);
    return () => clearInterval(interval);
  }, [effectiveRoomId, isStudentView, studentIdProp, studentBoardViewMode, isPgColumnError]);

  /** Admin: Sınıf listesi için odaları yükle */
  useEffect(() => {
    if (!showClassList || !isSupabaseBackend()) return;
    const sb = getServiceSupabase();
    if (!sb) return;
    void Promise.resolve(
      sb.from('live_lesson_state').select('id, room_name, updated_at').order('updated_at', { ascending: false })
    ).then(({ data }) => setRooms((data as LiveLessonRoom[]) ?? [])).catch(() => setRooms([]));
  }, [showClassList]);

  /** Sınıf ekranı veya davet modalında öğrenci listesi güncellensin */
  useEffect(() => {
    if (!isSupabaseBackend()) return;
    if (!showClassList && !showNewRoomModal) return;
    if (showNewRoomModal) {
      let cancelled = false;
      setInviteStudentsLoading(true);
      void refreshStudentsFromSupabase().finally(() => {
        if (!cancelled) setInviteStudentsLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }
    void refreshStudentsFromSupabase();
  }, [showClassList, showNewRoomModal, refreshStudentsFromSupabase]);

  const toggleInviteStudent = useCallback((studentId: string) => {
    setInviteStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((x) => x !== studentId) : [...prev, studentId]
    );
  }, []);

  const inviteGroupNames = useMemo(
    () => [...new Set(students.map((s) => s.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    [students],
  );

  const toggleInviteGroup = useCallback((groupName: string) => {
    const ids = students.filter((s) => s.group === groupName).map((s) => s.id);
    setInviteStudentIds((prev) => {
      const allIn = ids.length > 0 && ids.every((id) => prev.includes(id));
      if (allIn) return prev.filter((id) => !ids.includes(id));
      return [...new Set([...prev, ...ids])];
    });
  }, [students]);

  const buildStudentInviteUrl = useCallback((roomId: string) => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}${window.location.pathname}#/canli-ders?room=${encodeURIComponent(roomId)}`;
  }, []);

  const studyExportSelectedStudy = useMemo(
    () =>
      studyExportStudyId && studyExportStudyId !== STUDY_EXPORT_NEW_ID
        ? studies.find((s) => s.id === studyExportStudyId) ?? null
        : null,
    [studies, studyExportStudyId]
  );

  const { myStudies: exportMyStudies, contributedStudies: exportContributedStudies } = useMemo(
    () => splitStudiesForExportPicker(studies),
    [studies]
  );

  const selectStudyForExport = useCallback((studyId: string) => {
    setStudyExportStudyId(studyId);
    setStudyExportMessage('');
    if (studyId === STUDY_EXPORT_NEW_ID) {
      setStudyExportChapterId('');
      setStudyExportMode('new');
      return;
    }
    const st = studies.find((s) => s.id === studyId);
    if (st && st.chapters.length > 0) {
      setStudyExportChapterId(st.chapters[st.chapters.length - 1].id);
      setStudyExportMode('update');
    } else {
      setStudyExportChapterId('');
      setStudyExportMode('new');
    }
  }, [studies]);

  const openStudyExportModal = useCallback(
    async (payload: StudyExportPayload, roomIdForMemory?: string) => {
      const memoryRoomId = roomIdForMemory ?? effectiveRoomId;
      setStudyExportPayload(payload);
      setStudyExportRoomId(memoryRoomId);
      setStudyExportMessage('');
      setShowStudyExportModal(true);
      setFetchingStudies(true);
      try {
        const data = await loadStudiesAsync();
        setStudies(data);
        const saved = parseSavedStudyTarget(memoryRoomId);
        let nextStudyId = '';
        let nextChapterId = '';
        let nextMode: 'update' | 'new' = 'update';
        if (saved?.studyId && data.some((s) => s.id === saved.studyId)) {
          nextStudyId = saved.studyId;
          const study = data.find((s) => s.id === nextStudyId)!;
          if (saved.mode === 'new') {
            nextMode = 'new';
          } else if (saved.chapterId && study.chapters.some((c) => c.id === saved.chapterId)) {
            nextChapterId = saved.chapterId;
            nextMode = 'update';
          } else if (study.chapters.length > 0) {
            nextChapterId = study.chapters[study.chapters.length - 1].id;
            nextMode = 'update';
          } else {
            nextMode = 'new';
          }
        } else if (data.length > 0) {
          nextStudyId = data[0].id;
          const study = data[0];
          if (study.chapters.length > 0) {
            nextChapterId = study.chapters[study.chapters.length - 1].id;
            nextMode = 'update';
          } else {
            nextMode = 'new';
          }
        }
        setStudyExportStudyId(nextStudyId);
        setStudyExportChapterId(nextChapterId);
        setStudyExportMode(nextMode);
        setStudyExportChapterTitle(payload.defaultChapterTitle);
      } finally {
        setFetchingStudies(false);
      }
    },
    [effectiveRoomId]
  );

  const closeStudyExportModal = useCallback(() => {
    setShowStudyExportModal(false);
    setStudyExportPayload(null);
    setStudyExportMessage('');
  }, []);

  const confirmStudyExport = useCallback(async () => {
    if (!studyExportPayload || !studyExportStudyId) return;
    let study =
      studyExportStudyId === STUDY_EXPORT_NEW_ID
        ? null
        : studies.find((s) => s.id === studyExportStudyId) ?? null;
    if (studyExportStudyId !== STUDY_EXPORT_NEW_ID && !study) return;
    const fenOk = validateExportFen(studyExportPayload.fen);
    if (!fenOk) {
      alert('Geçersiz konum; kayıt yapılamadı.');
      return;
    }
    const moves = Array.isArray(studyExportPayload.moves) ? studyExportPayload.moves : [];
    setStudyExportSaving(true);
    setStudyExportMessage('');
    try {
      const now = new Date().toISOString();
      let savedChapterId = studyExportChapterId;
      let updatedChapters: StudyChapter[];
      const chapterTitle =
        studyExportChapterTitle.trim() || studyExportPayload.defaultChapterTitle || 'Canlı ders';

      if (studyExportStudyId === STUDY_EXPORT_NEW_ID) {
        const titleBase = studyExportPayload.defaultChapterTitle.trim() || 'Canlı ders';
        const studyId = makeStudyId();
        savedChapterId = makeStudyId();
        const newChapter: StudyChapter = {
          id: savedChapterId,
          title: chapterTitle,
          fen: fenOk,
          moves,
          orientation: 'white',
          difficulty: 5,
          comment: '',
          tags: ['canlı ders'],
          moveComments: {},
          moveAnnotations: {},
          variations: {},
        };
        const newStudy: Study = {
          id: studyId,
          title: `${titleBase} — Çalışma`,
          emoji: '♟️',
          description: `Canlı dersten aktarıldı (${new Date().toLocaleString('tr-TR')}).`,
          chapters: [newChapter],
          memberIds: [],
          createdAt: now,
          updatedAt: now,
          visibility: 'public',
          chat: 'members',
          computerAnalysis: 'none',
          openingExplorer: 'everyone',
          clonePermission: 'everyone',
          shareExport: 'everyone',
          syncEnabled: true,
          studyComments: 'none',
          tags: ['canlı-ders'],
          topicTags: ['canlı ders'],
          chatMessages: [],
          liked: false,
          likes: 0,
        };
        await saveStudyAsync(newStudy);
        setStudies((prev) => [...prev, newStudy]);
        study = newStudy;
        setStudyExportStudyId(studyId);
        setStudyExportMode('update');
        setStudyExportChapterId(savedChapterId);
      } else if (studyExportMode === 'update' && studyExportChapterId && study) {
        const exists = study.chapters.some((c) => c.id === studyExportChapterId);
        if (!exists) {
          alert('Seçili bölüm bulunamadı.');
          return;
        }
        updatedChapters = study.chapters.map((c) =>
          c.id === studyExportChapterId ? { ...c, fen: fenOk, moves } : c
        );
        const updated: Study = { ...study, chapters: updatedChapters, updatedAt: now };
        await saveStudyAsync(updated);
        setStudies((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        study = updated;
      } else if (study) {
        savedChapterId = makeStudyId();
        const newChapter: StudyChapter = {
          id: savedChapterId,
          title: chapterTitle,
          fen: fenOk,
          moves,
          orientation: 'white',
          difficulty: 5,
          comment: '',
          tags: ['canlı ders'],
          moveComments: {},
          moveAnnotations: {},
          variations: {},
        };
        updatedChapters = [...study.chapters, newChapter];
        const updated: Study = { ...study, chapters: updatedChapters, updatedAt: now };
        await saveStudyAsync(updated);
        setStudies((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        study = updated;
      } else {
        return;
      }

      if (typeof window !== 'undefined' && studyExportRoomId && study) {
        const target: SavedStudyTarget = {
          studyId: study.id,
          chapterId: savedChapterId,
          mode: studyExportMode,
        };
        localStorage.setItem(liveLessonStudyTargetKey(studyExportRoomId), JSON.stringify(target));
      }
      const chapterLabel =
        studyExportMode === 'update' && study
          ? study.chapters.find((c) => c.id === savedChapterId)?.title ?? 'bölüm'
          : chapterTitle;
      setStudyExportMessage(
        study ? `"${study.title}" çalışmasına "${chapterLabel}" kaydedildi.` : 'Kaydedildi.'
      );
    } catch {
      alert('Çalışma kaydedilemedi. Supabase bağlantınızı kontrol edin.');
    } finally {
      setStudyExportSaving(false);
    }
  }, [
    studyExportPayload,
    studyExportStudyId,
    studyExportChapterId,
    studyExportMode,
    studyExportChapterTitle,
    studyExportRoomId,
    studies,
  ]);

  const sendCurrentBoardToStudy = useCallback(() => {
    const name =
      rooms.find((r) => r.id === effectiveRoomId)?.room_name?.trim() ||
      `Oda ${effectiveRoomId}`;
    void openStudyExportModal({
      fen,
      moves: moveHistory,
      defaultChapterTitle: name,
    });
  }, [rooms, effectiveRoomId, fen, moveHistory, openStudyExportModal]);

  const downloadCurrentPgnFile = useCallback(() => {
    try {
      const g = new Chess(baseFen);
      for (const m of moveHistory) {
        if (!g.move(m)) break;
      }
      const pgn = g.pgn();
      const blob = new Blob([pgn], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sinif-${effectiveRoomId}.pgn`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      /* ignore */
    }
  }, [baseFen, moveHistory, effectiveRoomId]);

  const copyClassroomInviteLink = useCallback(() => {
    const u = buildStudentInviteUrl(effectiveRoomId);
    void navigator.clipboard?.writeText(u).then(() => {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [buildStudentInviteUrl, effectiveRoomId]);

  const sendUsernameInvite = useCallback(() => {
    const t = inviteUsernameInput.trim();
    if (!t) {
      setInviteToast('Kullanıcı adı veya öğrenci adı yazın.');
      window.setTimeout(() => setInviteToast(null), 2800);
      return;
    }
    const st = students.find(
      (s) =>
        (s.username && s.username.toLowerCase() === t.toLowerCase()) ||
        (s.name && s.name.toLowerCase() === t.toLowerCase())
    );
    const u = buildStudentInviteUrl(effectiveRoomId);
    void navigator.clipboard?.writeText(u).then(() => {
      setInviteToast(st ? `${st.name} için davet linki kopyalandı.` : 'Sınıf linki panoya kopyalandı.');
      window.setTimeout(() => setInviteToast(null), 2800);
    });
  }, [inviteUsernameInput, students, buildStudentInviteUrl, effectiveRoomId]);

  const sendRoomRowToStudy = useCallback(
    async (room: LiveLessonRoom) => {
      if (!isSupabaseBackend()) return;
      const sb = getServiceSupabase();
      if (!sb) return;
      const { data, error } = await sb
        .from('live_lesson_state')
        .select('fen, moves, room_name')
        .eq('id', room.id)
        .maybeSingle();
      if (error || !data || typeof data !== 'object') {
        alert('Tahta verisi alınamadı.');
        return;
      }
      const rec = data as Record<string, unknown>;
      const fenStr = typeof rec.fen === 'string' ? rec.fen : START_FEN;
      const moves = Array.isArray(rec.moves) ? (rec.moves as string[]) : [];
      const title = (typeof rec.room_name === 'string' && rec.room_name.trim()) || room.room_name || `Oda ${room.id}`;
      void openStudyExportModal(
        { fen: fenStr, moves, defaultChapterTitle: title },
        room.id
      );
    },
    [openStudyExportModal]
  );

  const openDeleteRoomModal = useCallback((room: LiveLessonRoom) => {
    setDeleteRoomError(null);
    setRoomPendingDelete(room);
  }, []);

  const confirmDeleteRoom = useCallback(async () => {
    const room = roomPendingDelete;
    if (!room) return;
    if (!isSupabaseBackend()) {
      setRoomPendingDelete(null);
      return;
    }
    const sb = getServiceSupabase();
    if (!sb) {
      setRoomPendingDelete(null);
      return;
    }
    setDeleteRoomLoading(true);
    setDeleteRoomError(null);
    const { error } = await sb.from('live_lesson_state').delete().eq('id', room.id);
    setDeleteRoomLoading(false);
    if (error) {
      setDeleteRoomError(error.message);
      return;
    }
    setRooms((prev) => prev.filter((x) => x.id !== room.id));
    if (selectedRoomId === room.id) setSelectedRoomId(null);
    setRoomPendingDelete(null);
  }, [roomPendingDelete, selectedRoomId]);

  const endActiveLesson = useCallback(async () => {
    if (isStudentView || !effectiveRoomId || !isSupabaseBackend()) {
      setSelectedRoomId(null);
      return;
    }
    if (!window.confirm('Dersi bitirmek istiyor musunuz? Oda kapatılacak ve öğrenciler çıkarılacak.')) return;
    const sb = getServiceSupabase();
    if (!sb) {
      setSelectedRoomId(null);
      return;
    }
    const { error } = await sb.from('live_lesson_state').delete().eq('id', effectiveRoomId);
    if (error) {
      console.warn('[LiveLesson] Ders bitirilemedi:', error.message ?? error);
      return;
    }
    setRooms((prev) => prev.filter((x) => x.id !== effectiveRoomId));
    setSelectedRoomId(null);
  }, [isStudentView, effectiveRoomId]);

  const createRoom = useCallback(async (name: string) => {
    if (!isSupabaseBackend()) return;
    const sb = getServiceSupabase();
    if (!sb) return;

    // Yeni oda açılınca eski odaları kapat (tek aktif sınıf)
    const existingIds = rooms.map((r) => r.id);
    if (existingIds.length > 0) {
      await sb.from('live_lesson_state').delete().in('id', existingIds);
      setRooms([]);
      if (selectedRoomId && existingIds.includes(selectedRoomId)) setSelectedRoomId(null);
    }

    const id = genShortRoomId();
    const payload = {
      id,
      room_name: name.trim() || `Oda ${id}`,
      fen: START_FEN,
      moves: [],
      coach_side: null,
      arrows: [],
      session_media: DEFAULT_SESSION_MEDIA,
      chat_messages: [] as LiveChatMessage[],
      updated_at: new Date().toISOString(),
    };
    let { error } = await sb.from('live_lesson_state').upsert(payload, { onConflict: 'id' });
    if (error && isPgColumnError(error)) {
      const { session_media: _sm, chat_messages: _cm, ...rest } = payload;
      const r = await sb.from('live_lesson_state').upsert(rest, { onConflict: 'id' });
      error = r.error;
      schemaHasSessionMediaRef.current = false;
      schemaHasChatMessagesRef.current = false;
    } else if (!error) {
      schemaHasSessionMediaRef.current = true;
      schemaHasChatMessagesRef.current = true;
    }
    if (!error) {
      const invited = [...inviteStudentIds];
      setRooms((prev) => [{ id, room_name: payload.room_name, updated_at: payload.updated_at }, ...prev]);
      setSelectedRoomId(id);
      setShowNewRoomModal(false);
      setNewRoomName('');
      setInviteFollowUp({ roomId: id, roomName: String(payload.room_name), invitedStudentIds: invited });
      setInviteStudentIds([]);
    }
  }, [inviteStudentIds, isPgColumnError, rooms, selectedRoomId]);

  const pushSessionMediaRemote = useCallback(
    async (next: SessionMediaState) => {
      if (!isSupabaseBackend()) return;
      const sb = getServiceSupabase();
      if (!sb) return;
      sessionMediaRef.current = next;
      setSessionMedia(next);
      if (schemaHasSessionMediaRef.current === false) return;
      const { error } = await sb
        .from('live_lesson_state')
        .update({ session_media: next, updated_at: new Date().toISOString() })
        .eq('id', effectiveRoomId);
      if (error) {
        if (isPgColumnError(error)) schemaHasSessionMediaRef.current = false;
        else console.warn('[LiveLesson] session_media güncellenemedi:', error.message ?? error);
      } else {
        schemaHasSessionMediaRef.current = true;
      }
    },
    [effectiveRoomId, isPgColumnError]
  );

  const sendChatMessage = useCallback(async () => {
    const text = chatInput.trim().slice(0, 600);
    if (!text || !isSupabaseBackend()) return;
    if (schemaHasChatMessagesRef.current === false) return;
    const sb = getServiceSupabase();
    if (!sb) return;
    const sid = !isStudentView ? 'coach' : normalizeStudentId(studentIdProp);
    if (!sid) return;
    const role: LiveChatMessage['role'] = !isStudentView ? 'coach' : 'student';
    const msg: LiveChatMessage = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      studentId: sid,
      role,
      text,
      at: new Date().toISOString(),
    };
    setChatInput('');
    setChatSending(true);
    setChatMessages((prev) => {
      const next = [...prev, msg];
      void sb
        .from('live_lesson_state')
        .update({ chat_messages: next, updated_at: new Date().toISOString() })
        .eq('id', effectiveRoomId)
        .then(({ error }) => {
          if (error) {
            if (isPgColumnError(error)) schemaHasChatMessagesRef.current = false;
            else console.warn('[LiveLesson] chat_messages güncellenemedi:', error.message ?? error);
          } else {
            schemaHasChatMessagesRef.current = true;
          }
        })
        .finally(() => setChatSending(false));
      return next;
    });
  }, [chatInput, effectiveRoomId, isStudentView, studentIdProp, isPgColumnError]);

  const toggleCoachStudentLiveAudio = useCallback(
    (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id) return;
      const blocked = sessionMedia.studentMicBlocked[id] ?? false;
      const hasFloor = idsEqual(sessionMedia.floorStudentId, id);
      const audioOpenForCoach = !blocked && hasFloor;
      const clearHand = (sessionMedia.handRaisedStudentIds ?? []).filter((kid) => !idsEqual(kid, id));
      if (audioOpenForCoach) {
        const nextBlocked = { ...sessionMedia.studentMicBlocked, [id]: true };
        let floor = sessionMedia.floorStudentId;
        if (idsEqual(floor, id)) floor = null;
        void pushSessionMediaRemote({
          ...sessionMedia,
          studentMicBlocked: nextBlocked,
          floorStudentId: floor,
          handRaisedStudentIds: clearHand,
        });
      } else {
        void pushSessionMediaRemote({
          ...sessionMedia,
          floorStudentId: id,
          studentMicBlocked: { ...sessionMedia.studentMicBlocked, [id]: false },
          handRaisedStudentIds: clearHand,
        });
      }
    },
    [sessionMedia, pushSessionMediaRemote]
  );

  const grantFloorToStudent = useCallback(
    (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id || isStudentView) return;
      const clearHand = (sessionMedia.handRaisedStudentIds ?? []).filter((kid) => !idsEqual(kid, id));
      void pushSessionMediaRemote({
        ...sessionMedia,
        floorStudentId: id,
        studentMicBlocked: { ...sessionMedia.studentMicBlocked, [id]: false },
        handRaisedStudentIds: clearHand,
      });
    },
    [isStudentView, sessionMedia, pushSessionMediaRemote],
  );

  const requestSpeakFloor = useCallback(() => {
    if (!isStudentView || !isStudentAdmittedToClass) return;
    const sid = normalizeStudentId(studentIdProp);
    if (!sid) return;
    const raised = sessionMedia.handRaisedStudentIds ?? [];
    if (raised.some((kid) => idsEqual(kid, sid))) return;
    void pushSessionMediaRemote({
      ...sessionMedia,
      handRaisedStudentIds: [...raised, sid],
    });
  }, [isStudentView, isStudentAdmittedToClass, studentIdProp, sessionMedia, pushSessionMediaRemote]);

  const cancelSpeakRequest = useCallback(() => {
    if (!isStudentView) return;
    const sid = normalizeStudentId(studentIdProp);
    if (!sid) return;
    const raised = (sessionMedia.handRaisedStudentIds ?? []).filter((kid) => !idsEqual(kid, sid));
    void pushSessionMediaRemote({
      ...sessionMedia,
      handRaisedStudentIds: raised,
    });
  }, [isStudentView, studentIdProp, sessionMedia, pushSessionMediaRemote]);

  const assignIndependentBoardToStudent = useCallback(
    (studentId: string, snapshot?: LiveStudentBoardSnapshot) => {
      const id = normalizeStudentId(studentId);
      if (!id || isStudentView) return;
      const snap = snapshot ?? {
        fen,
        moves: [...moveHistory],
        baseFen,
        variations: { ...variations },
      };
      const boards = { ...(sessionMedia.studentBoards ?? {}), [id]: snap };
      const ids = [...new Set([...(sessionMedia.independentBoardStudentIds ?? []), id])];
      void pushSessionMediaRemote({
        ...sessionMedia,
        studentBoards: boards,
        independentBoardStudentIds: ids,
      });
    },
    [isStudentView, sessionMedia, pushSessionMediaRemote, fen, moveHistory, baseFen, variations],
  );

  const syncTeacherBoardToStudent = useCallback(
    (studentId: string) => {
      assignIndependentBoardToStudent(studentId, {
        fen,
        moves: [...moveHistory],
        baseFen,
        variations: { ...variations },
      });
    },
    [assignIndependentBoardToStudent, fen, moveHistory, baseFen, variations],
  );

  const revokeIndependentBoard = useCallback(
    (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id || isStudentView) return;
      const boards = { ...(sessionMedia.studentBoards ?? {}) };
      delete boards[id];
      const ids = (sessionMedia.independentBoardStudentIds ?? []).filter((kid) => !idsEqual(kid, id));
      void pushSessionMediaRemote({
        ...sessionMedia,
        studentBoards: boards,
        independentBoardStudentIds: ids,
      });
    },
    [isStudentView, sessionMedia, pushSessionMediaRemote],
  );

  const pushStudentBoardSnapshot = useCallback(
    (snap: LiveStudentBoardSnapshot) => {
      const sid = normalizeStudentId(studentIdProp);
      if (!sid || !isStudentView) return;
      const boards = { ...(sessionMedia.studentBoards ?? {}), [sid]: snap };
      const ids = [...new Set([...(sessionMedia.independentBoardStudentIds ?? []), sid])];
      lastLocalMoveTimeRef.current = Date.now();
      void pushSessionMediaRemote({
        ...sessionMedia,
        studentBoards: boards,
        independentBoardStudentIds: ids,
      });
    },
    [isStudentView, studentIdProp, sessionMedia, pushSessionMediaRemote],
  );

  const toggleCoachStudentCam = useCallback(
    (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id) return;
      const forcedOff = !!(sessionMedia.studentCamForcedOff[id]);
      void pushSessionMediaRemote({
        ...sessionMedia,
        studentCamForcedOff: { ...sessionMedia.studentCamForcedOff, [id]: !forcedOff },
      });
    },
    [sessionMedia, pushSessionMediaRemote]
  );

  const attendanceRecordedRef = useRef<Set<string>>(new Set());
  const studentJoinRegisteredRef = useRef(false);

  useEffect(() => {
    studentJoinRegisteredRef.current = false;
    attendanceRecordedRef.current = new Set();
  }, [effectiveRoomId]);

  const recordLiveAttendance = useCallback(
    (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id || attendanceRecordedRef.current.has(id)) return;
      attendanceRecordedRef.current.add(id);
      void addAttendanceRecord({
        date: new Date().toISOString().slice(0, 10),
        studentId: id,
        status: 'present',
        lessonSummary: `Canlı ders: ${effectiveRoomName}`,
      });
    },
    [addAttendanceRecord, effectiveRoomName],
  );

  const kickParticipant = useCallback(
    (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id || isStudentView) return;
      if (!window.confirm('Bu öğrenciyi dersten çıkarmak istiyor musunuz?')) return;
      const kicks = new Set([...(sessionMedia.kickedStudentIds ?? []), id]);
      const nextBlocked = { ...sessionMedia.studentMicBlocked, [id]: true };
      let floor = sessionMedia.floorStudentId;
      if (idsEqual(floor, id)) floor = null;
      void pushSessionMediaRemote({
        ...sessionMedia,
        kickedStudentIds: Array.from(kicks),
        pendingStudentIds: (sessionMedia.pendingStudentIds ?? []).filter((kid) => !idsEqual(kid, id)),
        admittedStudentIds: (sessionMedia.admittedStudentIds ?? []).filter((kid) => !idsEqual(kid, id)),
        handRaisedStudentIds: (sessionMedia.handRaisedStudentIds ?? []).filter((kid) => !idsEqual(kid, id)),
        independentBoardStudentIds: (sessionMedia.independentBoardStudentIds ?? []).filter((kid) => !idsEqual(kid, id)),
        studentBoards: Object.fromEntries(
          Object.entries(sessionMedia.studentBoards ?? {}).filter(([kid]) => !idsEqual(kid, id)),
        ),
        floorStudentId: floor,
        studentMicBlocked: nextBlocked,
        studentCamForcedOff: { ...sessionMedia.studentCamForcedOff, [id]: true },
      });
      setParticipantMenuStudentId(null);
    },
    [sessionMedia, pushSessionMediaRemote, isStudentView]
  );

  const readmitParticipant = useCallback(
    (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id || isStudentView) return;
      const kicks = (sessionMedia.kickedStudentIds ?? []).filter((kid) => !idsEqual(kid, id));
      const nextBlocked = { ...sessionMedia.studentMicBlocked };
      delete nextBlocked[id];
      const nextCam = { ...sessionMedia.studentCamForcedOff };
      delete nextCam[id];
      const admitted = [...new Set([...(sessionMedia.admittedStudentIds ?? []), id])];
      const pending = (sessionMedia.pendingStudentIds ?? []).filter((kid) => !idsEqual(kid, id));
      void pushSessionMediaRemote({
        ...sessionMedia,
        kickedStudentIds: kicks,
        admittedStudentIds: admitted,
        pendingStudentIds: pending,
        studentMicBlocked: nextBlocked,
        studentCamForcedOff: nextCam,
      });
      recordLiveAttendance(id);
      setParticipantMenuStudentId(null);
    },
    [sessionMedia, pushSessionMediaRemote, isStudentView, recordLiveAttendance],
  );

  const toggleOpenParticipationRemote = useCallback(() => {
    const next = !(sessionMedia.openParticipation ?? false);
    void pushSessionMediaRemote({ ...sessionMedia, openParticipation: next });
  }, [sessionMedia, pushSessionMediaRemote]);

  const admitStudentToClass = useCallback(
    (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id || isStudentView) return;
      const pending = (sessionMedia.pendingStudentIds ?? []).filter((kid) => !idsEqual(kid, id));
      const admitted = [...new Set([...(sessionMedia.admittedStudentIds ?? []), id])];
      void pushSessionMediaRemote({
        ...sessionMedia,
        pendingStudentIds: pending,
        admittedStudentIds: admitted,
      });
      recordLiveAttendance(id);
    },
    [isStudentView, pushSessionMediaRemote, recordLiveAttendance, sessionMedia],
  );

  const admitAllPendingStudents = useCallback(() => {
    if (isStudentView) return;
    const pending = sessionMedia.pendingStudentIds ?? [];
    if (pending.length === 0) return;
    const admitted = [...new Set([...(sessionMedia.admittedStudentIds ?? []), ...pending])];
    void pushSessionMediaRemote({
      ...sessionMedia,
      pendingStudentIds: [],
      admittedStudentIds: admitted,
    });
    pending.forEach((id) => recordLiveAttendance(id));
  }, [isStudentView, pushSessionMediaRemote, recordLiveAttendance, sessionMedia]);

  useEffect(() => {
    if (!isStudentView || showClassList || !isSupabaseBackend()) return;
    const sid = normalizeStudentId(studentIdProp);
    if (!sid) return;
    if ((sessionMedia.kickedStudentIds ?? []).some((kid) => idsEqual(kid, sid))) return;

    const admitted = sessionMedia.admittedStudentIds ?? [];
    const pending = sessionMedia.pendingStudentIds ?? [];
    const isAdmitted = admitted.some((kid) => idsEqual(kid, sid));
    if (isAdmitted) return;

    const openPart = sessionMedia.openParticipation ?? false;
    if (openPart) {
      if (studentJoinRegisteredRef.current) return;
      studentJoinRegisteredRef.current = true;
      const nextAdmitted = [...new Set([...admitted, sid])];
      const nextPending = pending.filter((kid) => !idsEqual(kid, sid));
      void pushSessionMediaRemote({
        ...sessionMedia,
        admittedStudentIds: nextAdmitted,
        pendingStudentIds: nextPending,
      });
      recordLiveAttendance(sid);
      return;
    }

    if (pending.some((kid) => idsEqual(kid, sid))) return;
    if (studentJoinRegisteredRef.current) return;
    studentJoinRegisteredRef.current = true;
    void pushSessionMediaRemote({
      ...sessionMedia,
      pendingStudentIds: [...pending, sid],
    });
  }, [
    isStudentView,
    showClassList,
    studentIdProp,
    sessionMedia,
    pushSessionMediaRemote,
    recordLiveAttendance,
    effectiveRoomId,
  ]);

  useEffect(() => {
    if (participantMenuStudentId == null) return;
    const stop = (_e: MouseEvent) => {
      const el = _e.target;
      if (el instanceof HTMLElement && el.closest('[data-live-lesson-participant-menu-anchor]')) return;
      setParticipantMenuStudentId(null);
    };
    const t = window.setTimeout(() => document.addEventListener('click', stop, true), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('click', stop, true);
    };
  }, [participantMenuStudentId]);

  /** StudyCallPanel ile aynı: yerel kullanıcının mik/kam tek kaynak; hem alt bar hem video alanı aynı handler */
  const localMicMuted = !isStudentView ? sessionMedia.coachMicMuted : isMuted;
  const sidSelfMedia = normalizeStudentId(studentIdProp);
  const coachForcesStudentCamOff = !!(sidSelfMedia && (sessionMedia.studentCamForcedOff[sidSelfMedia] ?? false));
  const localCamOff = !isStudentView ? sessionMedia.coachCamOff : isCameraOff || coachForcesStudentCamOff;
  const studentHasSpeakFloor = !!(
    isStudentView &&
    sidSelfMedia &&
    idsEqual(sessionMedia.floorStudentId, sidSelfMedia)
  );
  const studentHasRaisedHand = !!(
    isStudentView &&
    sidSelfMedia &&
    (sessionMedia.handRaisedStudentIds ?? []).some((kid) => idsEqual(kid, sidSelfMedia))
  );
  const studentMicToggleDisabled =
    isStudentView && (!studentHasSpeakFloor || (sessionMedia.studentMicBlocked[sidSelfMedia] ?? false));

  const toggleLocalMic = useCallback(() => {
    if (!isStudentView) {
      coachLocalMediaShieldUntilRef.current = Date.now() + 4500;
      void pushSessionMediaRemote({ ...sessionMedia, coachMicMuted: !sessionMedia.coachMicMuted });
    } else if (studentHasSpeakFloor) {
      setIsMuted((m) => !m);
    }
  }, [isStudentView, sessionMedia, pushSessionMediaRemote, studentHasSpeakFloor]);

  const toggleLocalCam = useCallback(() => {
    if (!isStudentView) {
      coachLocalMediaShieldUntilRef.current = Date.now() + 4500;
      const nextCamOff = !sessionMedia.coachCamOff;
      void pushSessionMediaRemote({ ...sessionMedia, coachCamOff: nextCamOff });
    } else {
      setIsCameraOff((c) => !c);
    }
  }, [isStudentView, sessionMedia, pushSessionMediaRemote]);

  const refreshLocalVideoPreview = useCallback(() => {
    const videoTrack = agoraLocalVideoTrackRef.current;
    if (!videoTrack) return;
    try {
      setLocalStream(new MediaStream([videoTrack.getMediaStreamTrack()]));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCameraBackgroundBlur = useCallback(() => {
    setCameraBackgroundBlur((prev) => {
      const next = !prev;
      writeCameraBlurPreference(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (mediaLoading) return;
    refreshLocalVideoPreview();
  }, [mediaLoading, localCamOff, refreshLocalVideoPreview]);

  useEffect(() => {
    if (!vbSupported || mediaLoading) return;
    const videoTrack = agoraLocalVideoTrackRef.current;
    if (!videoTrack) return;

    let cancelled = false;
    const shouldBlur = cameraBackgroundBlur && !localCamOff;

    void (async () => {
      setVbApplying(true);
      try {
        const processor = await ensureVirtualBackgroundProcessor(
          videoTrack,
          vbProcessorRef,
          vbPipedTrackRef
        );
        if (cancelled || !processor) return;
        await applyVirtualBackgroundBlur(processor, shouldBlur);
        if (!cancelled) {
          refreshLocalVideoPreview();
        }
      } catch {
        if (!cancelled) {
          setCameraBackgroundBlur(false);
          writeCameraBlurPreference(false);
        }
      } finally {
        if (!cancelled) setVbApplying(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    vbSupported,
    mediaLoading,
    cameraBackgroundBlur,
    localCamOff,
    effectiveRoomId,
    refreshLocalVideoPreview,
  ]);

  const visibleChatMessages = useMemo(() => {
    const sorted = [...chatMessages].sort((a, b) => a.at.localeCompare(b.at));
    if (!isStudentView) return sorted;
    if (!studentIdProp) return [];
    const sid = normalizeStudentId(studentIdProp);
    if (!sid) return [];
    /** Öğrenci: yalnızca antrenör + kendi mesajları (chatMessages zaten senkronde filtrelendi; çift kontrol) */
    return sorted.filter(
      (m) => m.role === 'coach' || (m.role === 'student' && idsEqual(m.studentId, sid))
    );
  }, [chatMessages, isStudentView, studentIdProp]);

  const sidSelfBoard = normalizeStudentId(studentIdProp);
  const hasIndependentBoard = !!(
    sidSelfBoard &&
    (sessionMedia.independentBoardStudentIds ?? []).some((kid) => idsEqual(kid, sidSelfBoard))
  );
  const ownBoardSnapshot = sidSelfBoard ? sessionMedia.studentBoards?.[sidSelfBoard] : null;
  const usesOwnBoardDisplay =
    isStudentView && hasIndependentBoard && studentBoardViewMode === 'own' && !!ownBoardSnapshot;

  const displayBaseFen = usesOwnBoardDisplay
    ? (ownBoardSnapshot?.baseFen ?? ownBoardSnapshot?.fen ?? baseFen)
    : baseFen;
  const displayMoveHistory = usesOwnBoardDisplay ? (ownBoardSnapshot?.moves ?? []) : moveHistory;
  const displayVariations = usesOwnBoardDisplay
    ? (ownBoardSnapshot?.variations ?? {})
    : variations;

  const getFenAtPly = useCallback((plyIndex: number) => {
    try {
      const c = new Chess(displayBaseFen);
      for (let i = 0; i <= plyIndex; i++) {
        c.move(displayMoveHistory[i]);
      }
      return c.fen();
    } catch { return fen; }
  }, [displayBaseFen, displayMoveHistory, fen]);

  const mainLinePly = replayNavPly === null ? displayMoveHistory.length : replayNavPly;
  const liveLessonCurrentPly = currentVariation
    ? currentVariation[2] + 1
    : mainLinePly;
  const activeLineLength = currentVariation
    ? (displayVariations[currentVariation[0]]?.[currentVariation[1]]?.length ?? 0)
    : displayMoveHistory.length;
  /** Oynanabilir uç pozisyon (notasyon gezintisinde değiliz) */
  const atLiveGameHead = liveLessonCurrentPly === activeLineLength;
  /** Analiz sekmesinde veya analiz modunda geçmiş konumdan varyasyon denenebilir */
  const boardExploreMode = analysisMode || atLiveGameHead || sidebarTab === 'analiz';
  const replayNavActive = replayNavPly !== null || currentVariation !== null;

  const boardDisplayFen = useMemo(() => {
    if (hoverFen && !replayNavActive) return hoverFen;
    return liveLessonFenAt(displayBaseFen, displayMoveHistory, displayVariations, mainLinePly, currentVariation);
  }, [displayBaseFen, displayMoveHistory, displayVariations, mainLinePly, currentVariation, hoverFen, replayNavActive]);

  useEffect(() => {
    setMoveHintSquare(null);
  }, [boardDisplayFen]);

  useEffect(() => {
    setReplayNavPly((p) => (p == null ? null : Math.min(p, displayMoveHistory.length)));
  }, [displayMoveHistory.length]);

  useEffect(() => {
    if (!replayIsPlaying) return;
    if (moveHistory.length === 0) {
      setReplayIsPlaying(false);
      return;
    }
    const id = window.setInterval(() => {
      setReplayNavPly((prev) => {
        const len = moveHistory.length;
        const cur = prev ?? len;
        if (cur >= len) {
          window.setTimeout(() => setReplayIsPlaying(false), 0);
          return null;
        }
        const next = cur + 1;
        if (next >= len) {
          window.setTimeout(() => setReplayIsPlaying(false), 0);
          return null;
        }
        return next;
      });
    }, 880);
    return () => window.clearInterval(id);
  }, [replayIsPlaying, moveHistory]);

  const {
    pvLines: enginePvLines,
    depth: engineDepth,
    analyseFen: analyseEngineFen,
    stop: stopEngine,
    ready: engineReady,
    loading: engineLoading,
    error: engineError,
  } = useStockfish({
    numPv: engineLinesVisible ? 3 : 1,
    enabled: isStudentView
      ? (sessionMedia.studentEvalBarVisible ?? sessionMedia.studentAnalysisVisible ?? false)
      : engineEvalVisible && sidebarTab === 'analiz',
  });

  /** Tahtadaki avantaj çubuğu — öğrencide sekme değişince de açık kalır */
  const studentBoardEvalOn =
    sessionMedia.studentEvalBarVisible ?? sessionMedia.studentAnalysisVisible ?? false;
  const showBoardEvalBar = isStudentView ? studentBoardEvalOn : engineEvalVisible;

  /** Analiz sekmesi dışına çıkınca sonsuz aramayı durdur (yan panel satırları) */
  const coachEngineActive = engineEvalVisible && sidebarTab === 'analiz';
  const studentEngineActive =
    (sessionMedia.studentAnalysisVisible ?? false) && sidebarTab === 'analiz';
  const enginePanelActive = isStudentView ? studentEngineActive : coachEngineActive;

  const handleEnginePvHover = useCallback(
    (lineIndex: number, plyIndex: number | null, _clientX: number, _clientY: number) => {
      if (plyIndex === null) {
        setEnginePvHover(null);
        setEngineLinePreview(null);
        setEnginePreviewFen(null);
        return;
      }
      const line = enginePvLines[lineIndex];
      if (!line?.pv?.length) return;
      setEnginePvHover({ lineIndex, plyIndex });
      const previewFen = fenAfterUciPlies(boardDisplayFen, line.pv, plyIndex + 1);
      if (previewFen) {
        setEnginePreviewFen(previewFen);
        setEngineLinePreview(null);
      }
      const uci = line.pv[plyIndex];
      if (uci && uci.length >= 4) {
        setHoverFen(null);
      }
    },
    [boardDisplayFen, enginePvLines],
  );

  useEffect(() => {
    setEnginePvHover(null);
    setEngineLinePreview(null);
    setEnginePreviewFen(null);
  }, [boardDisplayFen, sidebarTab, enginePanelActive]);

  useEffect(() => {
    if (!showBoardEvalBar && !enginePanelActive) {
      stopEngine();
    }
  }, [showBoardEvalBar, enginePanelActive, stopEngine]);

  useEffect(() => () => { stopEngine(); }, [stopEngine]);

  /** Tahta / analiz sekmesi FEN değişince motoru güncelle (tek giriş noktası) */
  useEffect(() => {
    if (!showBoardEvalBar && !enginePanelActive) return;
    const fen = boardDisplayFen.trim();
    try {
      new Chess(fen);
    } catch {
      return;
    }
    analyseEngineFen(fen);
  }, [showBoardEvalBar, enginePanelActive, boardDisplayFen, analyseEngineFen]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [visibleChatMessages.length]);

  /** Hamle yapıldığında Supabase’e yaz (antrenör ve öğrenci aynı tahtayı paylaşır) */
  const pushState = useCallback((
    broadcastFen: string,
    broadcastMoves: string[],
    broadcastArrows?: Array<{ startSquare: string; endSquare: string; color: string }>,
    broadcastMarks?: Record<string, unknown>,
    broadcastCoachSide?: CollaborativeBoardSide,
    broadcastVariations?: Record<number, string[][]>,
  ) => {
    if (!isSupabaseBackend()) return;
    const sb = getServiceSupabase();
    if (!sb) return;

    const vars = broadcastVariations ?? variationsRef.current;

    const payload: Record<string, unknown> = {
      id: effectiveRoomId,
      room_name: effectiveRoomName,
      fen: broadcastFen,
      moves: broadcastMoves,
      updated_at: new Date().toISOString(),
    };

    if (schemaHasVariationsRef.current === true) {
      payload.variations = vars;
    }

    if (broadcastArrows !== undefined && schemaHasArrowsRef.current !== false) {
      payload.arrows = persistedArrows(broadcastArrows as ArrowItem[]);
    }
    if (broadcastMarks !== undefined && schemaHasMarksRef.current !== false) {
      payload.marks = broadcastMarks;
    }
    if (broadcastCoachSide !== undefined && schemaHasExtendedRef.current !== false) {
      payload.coach_side = broadcastCoachSide;
    }

    const applySyncKey = () => {
      const stamp = new Date().toISOString();
      lastSyncRef.current = `${broadcastFen}-${stamp}`;
      if (broadcastMarks !== undefined || broadcastArrows !== undefined) {
        lastAnnoSyncRef.current = `${JSON.stringify(broadcastMarks ?? null)}|${JSON.stringify(broadcastArrows ?? [])}`;
      }
    };

    void sb.from('live_lesson_state').upsert(payload, { onConflict: 'id' }).then(({ error }) => {
      if (!error) {
        if ('marks' in payload) schemaHasMarksRef.current = true;
        if ('arrows' in payload) schemaHasArrowsRef.current = true;
        applySyncKey();
        return;
      }
      /** Sunucuda `marks` kolonu yokken gönderilirse tam upsert reddedilir; önce marksız yeniden dene. */
      const hadMarks = 'marks' in payload && payload.marks !== undefined;
      if (hadMarks && schemaHasMarksRef.current !== false && isPgColumnError(error)) {
        schemaHasMarksRef.current = false;
        const sansMarks: Record<string, unknown> = { ...payload };
        delete sansMarks.marks;
        void sb.from('live_lesson_state').upsert(sansMarks, { onConflict: 'id' }).then(({ error: e2 }) => {
          if (!e2) {
            applySyncKey();
            return;
          }
          if (schemaHasExtendedRef.current !== false) {
            schemaHasExtendedRef.current = false;
            const minimal = {
              id: effectiveRoomId,
              room_name: effectiveRoomName,
              fen: broadcastFen,
              moves: broadcastMoves,
              updated_at: new Date().toISOString(),
            };
            void sb.from('live_lesson_state').upsert(minimal, { onConflict: 'id' }).then(({ error: e3 }) => {
              if (!e3) applySyncKey();
            });
          }
        });
        return;
      }
      if (schemaHasExtendedRef.current !== false) {
        schemaHasExtendedRef.current = false;
        const minimal = {
          id: effectiveRoomId,
          room_name: effectiveRoomName,
          fen: broadcastFen,
          moves: broadcastMoves,
          updated_at: new Date().toISOString(),
        };
        void sb.from('live_lesson_state').upsert(minimal, { onConflict: 'id' }).then(({ error: e2 }) => {
          if (!e2) applySyncKey();
        });
      }
    });
  }, [effectiveRoomId, effectiveRoomName, isPgColumnError]);

  useEffect(() => {
    if (!isStudentView && sidebarTab === 'oyunlar') {
      const load = async () => {
        setFetchingStudies(true);
        const data = await loadStudiesAsync();
        setStudies(data);
        setFetchingStudies(false);
      };
      void load();
    }
  }, [sidebarTab, isStudentView]);

  const applyChapterContent = useCallback((ch: StudyChapter) => {
    try {
      const initFen = ch.fen || START_FEN;
      const newGame = makeBuilderGame(initFen);
      const chapterMoves = Array.isArray(ch.moves) ? ch.moves : [];
      // Çalışmadan yüklerken tahtayı sadece başlangıç FEN'ine değil, hamlelerin son konumuna getir.
      for (const san of chapterMoves) {
        if (!applyMove(newGame, String(san))) break;
      }
      const finalFen = newGame.fen();
      setGame(newGame);
      setFen(finalFen);
      setBaseFen(initFen);
      setMoveHistory(chapterMoves);
      // Push to remote seans
      void pushState(
        finalFen,
        chapterMoves,
        ch.arrows || [],
        (ch as any).circles || {},
        ch.orientation === 'black' ? 'b' : 'w'
      );
      setReplayNavPly(null);
      setSidebarTab('analiz');
    } catch (e) {
      console.error("[LiveLesson] Failed to apply chapter:", e);
    }
  }, [pushState]);

  const applyPuzzleContent = useCallback((puzzle: PuzzleType) => {
    try {
      const initFen = (puzzle.fen || START_FEN).trim();
      const newGame = makeBuilderGame(initFen);
      const finalFen = newGame.fen();
      setGame(newGame);
      setFen(finalFen);
      setBaseFen(initFen);
      // Canli derste ogrenciler bulmacayi tahtada cozsun diye hamle listesi sifirdan baslar.
      setMoveHistory([]);
      setSelectedPoolPuzzleId(puzzle.id);
      void pushSessionMediaRemote({
        ...sessionMedia,
        activePuzzleId: puzzle.id,
      });
      setReplayNavPly(null);
      setSidebarTab('analiz');
      void pushState(finalFen, [], [], {}, coachSide ?? undefined);
    } catch (e) {
      console.error('[LiveLesson] Failed to apply puzzle:', e);
    }
  }, [pushState, coachSide, pushSessionMediaRemote, sessionMedia]);

  const filteredPuzzles = useMemo(() => {
    const q = puzzleSearch.trim().toLowerCase();
    if (!q) return puzzles.slice(0, 200);
    return puzzles
      .filter((p) =>
        p.title.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.theme || '').toLowerCase().includes(q)
      )
      .slice(0, 200);
  }, [puzzles, puzzleSearch]);

  const selectedPoolPuzzle = useMemo(
    () => puzzles.find((p) => p.id === selectedPoolPuzzleId) ?? null,
    [puzzles, selectedPoolPuzzleId]
  );

  const studentVisiblePuzzleSolution = useMemo(() => {
    if (!isStudentView) return null;
    if (!sessionMedia.studentCanSeePuzzleSolution) return null;
    if (!selectedPoolPuzzle || !selectedPoolPuzzle.solution || selectedPoolPuzzle.solution.length === 0) return null;
    return selectedPoolPuzzle.solution.join(', ');
  }, [isStudentView, sessionMedia.studentCanSeePuzzleSolution, selectedPoolPuzzle]);

  useEffect(() => {
    if (sessionMedia.activePuzzleId) {
      setSelectedPoolPuzzleId(sessionMedia.activePuzzleId);
    }
  }, [sessionMedia.activePuzzleId]);

  const sendSelectedPuzzleToStudy = useCallback(() => {
    if (!selectedPoolPuzzle) return;
    const title = (selectedPoolPuzzle.title || 'Bulmaca').trim();
    void openStudyExportModal({
      fen: selectedPoolPuzzle.fen,
      moves: selectedPoolPuzzle.solution ?? [],
      defaultChapterTitle: title,
    });
  }, [selectedPoolPuzzle, openStudyExportModal]);

  const toggleStudentPuzzleSolutionVisibility = useCallback(() => {
    if (isStudentView) return;
    void pushSessionMediaRemote({
      ...sessionMedia,
      studentCanSeePuzzleSolution: !sessionMedia.studentCanSeePuzzleSolution,
    });
  }, [isStudentView, pushSessionMediaRemote, sessionMedia]);

  const toggleStudentAnalysisVisibility = useCallback(() => {
    if (isStudentView) return;
    const next = !(sessionMedia.studentAnalysisVisible ?? false);
    void pushSessionMediaRemote({
      ...sessionMedia,
      studentAnalysisVisible: next,
    });
  }, [isStudentView, pushSessionMediaRemote, sessionMedia]);

  const toggleCoachEvalBarVisible = useCallback(() => {
    if (isStudentView) return;
    const next = !engineEvalVisible;
    setEngineEvalVisible(next);
    void pushSessionMediaRemote({
      ...sessionMedia,
      studentEvalBarVisible: next,
    });
  }, [isStudentView, engineEvalVisible, pushSessionMediaRemote, sessionMedia]);

  const recordVariation = useCallback((
    from: string,
    to: string,
    branchMainPly: number,
  ): { nextVars: Record<number, string[][]>; varRef: LiveVariationRef } | null => {
    try {
      const g = makeBuilderGame(boardDisplayFen);
      const result = g.move({ from: from as any, to: to as any, promotion: 'q' });
      if (!result) return null;
      const existingVars = variations[branchMainPly] ?? [];
      const varRef: LiveVariationRef = [branchMainPly, existingVars.length, 0];
      const nextVars = { ...variations, [branchMainPly]: [...existingVars, [result.san]] };
      setVariations(nextVars);
      setCurrentVariation(varRef);
      setReplayNavPly(null);
      return { nextVars, varRef };
    } catch {
      return null;
    }
  }, [boardDisplayFen, variations]);

  const appendToCurrentVariation = useCallback((
    san: string,
  ): { nextVars: Record<number, string[][]>; varRef: LiveVariationRef } | null => {
    if (!currentVariation) return null;
    const [mainLinePos, varGroupIdx, varMoveIdx] = currentVariation;
    const existingVars = variations[mainLinePos] ?? [];
    const currentLine = existingVars[varGroupIdx];
    if (!currentLine) return null;
    const insertAt = Math.min(varMoveIdx + 1, currentLine.length);
    const nextLine = [...currentLine.slice(0, insertAt), san, ...currentLine.slice(insertAt)];
    const varRef: LiveVariationRef = [mainLinePos, varGroupIdx, insertAt];
    const nextVars = {
      ...variations,
      [mainLinePos]: existingVars.map((line, i) => (i === varGroupIdx ? nextLine : line)),
    };
    setVariations(nextVars);
    setCurrentVariation(varRef);
    setReplayNavPly(null);
    return { nextVars, varRef };
  }, [currentVariation, variations]);

  const liveLessonChapter = useMemo((): StudyChapter | null => {
    if (displayMoveHistory.length === 0 && Object.keys(displayVariations).length === 0) return null;
    return {
      id: 'live',
      title: 'Canlı ders',
      fen: displayBaseFen,
      moves: displayMoveHistory,
      orientation: 'white',
      comment: '',
      tags: [],
      moveComments: {},
      moveAnnotations: {},
      variations: displayVariations,
    };
  }, [displayBaseFen, displayMoveHistory, displayVariations]);

  const selectLiveMove = useCallback((idx: number, varInfo?: LiveVariationRef) => {
    setReplayIsPlaying(false);
    setHoverFen(null);
    if (varInfo) {
      setCurrentVariation(varInfo);
      setReplayNavPly(null);
      return;
    }
    setCurrentVariation(null);
    setReplayNavPly(Math.max(0, idx));
  }, []);

  const deleteLiveMoveFromHere = useCallback((idx: number) => {
    if (isStudentView || usesOwnBoardDisplay) return;
    if (idx < 0) {
      const encoded = -idx - 1;
      const mlp = Math.floor(encoded / 1000);
      const vgi = encoded % 1000;
      const vars = { ...variations };
      const group = [...(vars[mlp] ?? [])];
      group.splice(vgi, 1);
      if (group.length === 0) delete vars[mlp];
      else vars[mlp] = group;
      setVariations(vars);
      setCurrentVariation(null);
      setReplayNavPly(null);
      const nextFen = liveLessonFenAt(baseFen, moveHistory, vars, mainLinePly, null);
      setFen(nextFen);
      setGame(new Chess(nextFen));
      pushState(nextFen, moveHistory, undefined, undefined, coachSide ?? undefined, vars);
      return;
    }
    const newMoves = moveHistory.slice(0, idx);
    const newVars = { ...variations };
    for (let k = idx; k < moveHistory.length; k++) delete newVars[k];
    const nextFen = liveLessonFenAt(baseFen, newMoves, newVars, newMoves.length, null);
    setMoveHistory(newMoves);
    setVariations(newVars);
    setCurrentVariation(null);
    setReplayNavPly(null);
    setFen(nextFen);
    setGame(new Chess(nextFen));
    pushState(nextFen, newMoves, undefined, undefined, coachSide ?? undefined, newVars);
  }, [isStudentView, usesOwnBoardDisplay, variations, moveHistory, baseFen, mainLinePly, coachSide, pushState]);

  const promoteLiveVariation = useCallback((mlp: number, vgi: number) => {
    if (isStudentView || usesOwnBoardDisplay) return;
    const varLine = variations[mlp]?.[vgi];
    if (!varLine || varLine.length === 0) return;
    const prefix = moveHistory.slice(0, mlp + 1);
    const oldContinuation = moveHistory.slice(mlp + 1);
    const newMainMoves = [...prefix, ...varLine];
    const vars = { ...variations };
    const group = [...(vars[mlp] ?? [])];
    group.splice(vgi, 1);
    if (oldContinuation.length > 0) group.push(oldContinuation);
    if (group.length === 0) delete vars[mlp];
    else vars[mlp] = group;
    for (let k = mlp + 1; k < moveHistory.length; k++) delete vars[k];
    const nextFen = liveLessonFenAt(baseFen, newMainMoves, vars, newMainMoves.length, null);
    setMoveHistory(newMainMoves);
    setVariations(vars);
    setCurrentVariation(null);
    setReplayNavPly(null);
    setFen(nextFen);
    setGame(new Chess(nextFen));
    pushState(nextFen, newMainMoves, undefined, undefined, coachSide ?? undefined, vars);
  }, [isStudentView, usesOwnBoardDisplay, variations, moveHistory, baseFen, coachSide, pushState]);

  const lastMoveSquares: Record<string, React.CSSProperties> = {};
  try {
    const gHist = new Chess(displayBaseFen);
    const slice = displayMoveHistory.slice(0, liveLessonCurrentPly);
    if (slice.length > 0) {
      for (let i = 0; i < slice.length - 1; i++) gHist.move(slice[i]);
      const lastMv = gHist.move(slice[slice.length - 1]);
      if (lastMv) {
        lastMoveSquares[lastMv.from] = { background: 'rgba(99, 102, 241, 0.35)' };
        lastMoveSquares[lastMv.to] = { background: 'rgba(99, 102, 241, 0.35)' };
      }
    }
  } catch { /* ignore */ }

  const playSide: PlayBoardSide | null = isStudentView
    ? studentPlaySideFromCoach(coachSide)
    : coachSide;

  const onPieceDrop = useCallback((a: unknown, b?: unknown) => {
    const { sourceSquare, targetSquare } = parseDropSquares(a, b);
    if (!targetSquare || !sourceSquare) return false;

    if (!boardExploreMode) return false;

    let turnNow: 'w' | 'b';
    try {
      turnNow = new Chess(boardDisplayFen).turn();
    } catch {
      turnNow = game.turn();
    }
    if (!analysisMode && isStudentView) {
      if (playSide == null) return false;
      if (playSide !== 'both') {
        try {
          const g0 = new Chess(boardDisplayFen);
          const pc0 = g0.get(sourceSquare as any);
          if (!pc0 || pc0.color !== playSide || turnNow !== playSide) return false;
        } catch {
          return false;
        }
      }
    } else if (!analysisMode && !isStudentView && coachSide != null && coachSide !== 'both') {
      try {
        const g0 = new Chess(boardDisplayFen);
        const pc0 = g0.get(sourceSquare as any);
        if (!pc0 || pc0.color !== coachSide || turnNow !== coachSide) return false;
      } catch {
        return false;
      }
    }

    const sideForPush: CollaborativeBoardSide | undefined = coachSide ?? undefined;

    const commitBoard = (nextFen: string, nextMoves: string[], nextVars: Record<number, string[][]>) => {
      setReplayNavPly(null);
      setGame(new Chess(nextFen));
      setFen(nextFen);
      setCurrentVariation(null);
      lastLocalMoveTimeRef.current = Date.now();
      if (isStudentView && usesOwnBoardDisplay) {
        pushStudentBoardSnapshot({
          fen: nextFen,
          moves: nextMoves,
          baseFen: displayBaseFen,
          variations: nextVars,
        });
        return;
      }
      setMoveHistory(nextMoves);
      setVariations(nextVars);
      pushState(nextFen, nextMoves, undefined, undefined, sideForPush, nextVars);
    };

    try {
      const copy = new Chess(boardDisplayFen);
      let move = copy.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });

      if (analysisMode && !move) {
        const anyTurnCopy = new Chess(boardDisplayFen);
        const piece = anyTurnCopy.get(sourceSquare as any);
        if (piece && piece.color !== anyTurnCopy.turn()) {
          const fenParts = anyTurnCopy.fen().split(' ');
          fenParts[1] = piece.color;
          anyTurnCopy.load(fenParts.join(' '));
        }
        move = anyTurnCopy.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
        if (move) {
          if (currentVariation) {
            const appended = appendToCurrentVariation(move.san);
            if (!appended) return false;
            const nextFen = liveLessonFenAt(baseFen, moveHistory, appended.nextVars, mainLinePly, appended.varRef);
            setFen(nextFen);
            setGame(new Chess(nextFen));
            lastLocalMoveTimeRef.current = Date.now();
            pushState(nextFen, moveHistory, undefined, undefined, sideForPush, appended.nextVars);
            return true;
          }
          const nextMoves = [...moveHistory, move.san];
          commitBoard(anyTurnCopy.fen(), nextMoves, variations);
          return true;
        }
        return false;
      }

      if (!move) return false;

      if (currentVariation) {
        const appended = appendToCurrentVariation(move.san);
        if (!appended) return false;
        const nextFen = liveLessonFenAt(baseFen, moveHistory, appended.nextVars, mainLinePly, appended.varRef);
        setFen(nextFen);
        setGame(new Chess(nextFen));
        lastLocalMoveTimeRef.current = Date.now();
        pushState(nextFen, moveHistory, undefined, undefined, sideForPush, appended.nextVars);
        return true;
      }

      const onMainHead = mainLinePly === displayMoveHistory.length;
      if (onMainHead) {
        const nextMoves = [...displayMoveHistory, move.san];
        setCurrentVariation(null);
        commitBoard(copy.fen(), nextMoves, displayVariations);
        return true;
      }

      const recorded = recordVariation(sourceSquare, targetSquare, mainLinePly);
      if (recorded) {
        const nextFen = liveLessonFenAt(baseFen, moveHistory, recorded.nextVars, mainLinePly, recorded.varRef);
        setFen(nextFen);
        setGame(new Chess(nextFen));
        lastLocalMoveTimeRef.current = Date.now();
        pushState(nextFen, moveHistory, undefined, undefined, sideForPush, recorded.nextVars);
        return true;
      }
    } catch {
      // Geçersiz hamle
    }
    return false;
  }, [
    game,
    moveHistory,
    variations,
    pushState,
    coachSide,
    playSide,
    isStudentView,
    analysisMode,
    boardExploreMode,
    boardDisplayFen,
    mainLinePly,
    currentVariation,
    baseFen,
    recordVariation,
    appendToCurrentVariation,
    usesOwnBoardDisplay,
    displayBaseFen,
    displayMoveHistory,
    displayVariations,
    pushStudentBoardSnapshot,
  ]);

  const handleDrop = useCallback((a: unknown, b?: unknown) => onPieceDrop(a, b), [onPieceDrop]);

  const applyFen = useCallback(() => {
    setPositionError('');
    const trimmed = fenInput.trim() || START_FEN;
    try {
      const c = new Chess(trimmed);
      setReplayNavPly(null);
      setGame(c);
      setFen(c.fen());
      setBaseFen(trimmed);
      setFenInput(trimmed);
      setMoveHistory([]);
      setVariations({});
      setCurrentVariation(null);
      pushState(c.fen(), [], arrows, marks, coachSide ?? undefined, {});
    } catch {
      setPositionError('Geçersiz FEN. Standart başlangıç veya geçerli bir konum girin.');
    }
  }, [fenInput, pushState, arrows, coachSide]);

  const loadPgn = useCallback(() => {
    setPgnError('');
    const trimmed = pgnInput.trim();
    if (!trimmed) {
      setPgnError('PGN veya FEN yapıştırın.');
      return;
    }
    try {
      if (trimmed.includes('1.') || trimmed.includes('[Event')) {
        const c = new Chess();
        const loaded = (c.loadPgn as (pgn: string, opts?: { strict?: boolean }) => boolean)(trimmed, { strict: false });
        if (loaded) {
          const moves = c.history();
          setReplayNavPly(null);
          setGame(c);
          setFen(c.fen());
          setMoveHistory(moves);
          setPgnInput('');
          pushState(c.fen(), moves, arrows, marks, coachSide ?? undefined);
        } else {
          setPgnError('PGN ayrıştırılamadı.');
        }
      } else {
        const c = new Chess(trimmed);
        setReplayNavPly(null);
        setGame(c);
        setFen(c.fen());
        setMoveHistory([]);
        setPgnInput('');
        pushState(c.fen(), [], arrows, marks, coachSide ?? undefined);
      }
    } catch {
      setPgnError('Geçersiz PGN veya FEN.');
    }
  }, [pgnInput, pushState, arrows, coachSide]);

  const resetBoard = useCallback(() => {
    const c = new Chess();
    setReplayNavPly(null);
    setGame(c);
    setFen(c.fen());
    setBaseFen(c.fen());
    setMoveHistory([]);
    setFenInput('');
    setPgnInput('');
    setPositionError('');
    setPgnError('');
    setArrows([]);
    lastLocalMoveTimeRef.current = Date.now();
    setVariations({});
    setCurrentVariation(null);
    pushState(c.fen(), [], [], {}, coachSide ?? undefined, {});
  }, [pushState, coachSide]);

  // Arrow Key Navigation (replay gezinme — hamle silmez)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (moveHistory.length === 0) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setReplayIsPlaying(false);
        const len = moveHistory.length;
        if (e.key === 'ArrowLeft') {
          setReplayNavPly((p) => {
            const cur = p ?? len;
            return Math.max(0, cur - 1);
          });
        } else {
          setReplayNavPly((p) => {
            const cur = p ?? len;
            const next = Math.min(len, cur + 1);
            return next >= len ? null : next;
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveHistory.length]);

  const setCoachSideAndPush = useCallback((side: CollaborativeBoardSide) => {
    try { sessionStorage.setItem(COACH_SIDE_STORAGE_KEY, side); } catch { /* ignore */ }
    setCoachSide(side);
    pushState(fen, moveHistory, arrows, marks, side);
  }, [fen, moveHistory, arrows, marks, pushState]);

  const isMyTurn = isStudentView
    ? playSide != null && (playSide === 'both' || game.turn() === playSide)
    : coachSide == null || coachSide === 'both' || game.turn() === coachSide;

  const derivedBoardOrientation = useMemo(
    () =>
      isStudentView
        ? coachSide === 'b'
          ? 'black'
          : 'white'
        : coachSide === 'b'
          ? 'black'
          : 'white',
    [isStudentView, coachSide],
  );

  const boardOrientation =
    lessonBoardViewFlipped
      ? derivedBoardOrientation === 'white'
        ? 'black'
        : 'white'
      : derivedBoardOrientation;

  useEffect(() => {
    const onFlipKey = (e: KeyboardEvent) => {
      if (!isBoardFlipShortcutKey(e) || !keyboardTargetAllowsBoardShortcut(e)) return;
      e.preventDefault();
      setLessonBoardViewFlipped((v) => !v);
    };
    window.addEventListener('keydown', onFlipKey, true);
    return () => window.removeEventListener('keydown', onFlipKey, true);
  }, []);

  const sanitizedArrows = useMemo(() => sanitizeArrows(arrows), [arrows]);
  const arrowsToShow = boardReady ? sanitizedArrows : [];

  const moveHintsToolOk = !isStudentView && drawingTool === 'mouse';

  const liveLessonPieceEligibleForMoveHints = (
    square: string,
    piece: { pieceType?: string } | undefined,
    isSparePiece?: boolean
  ): boolean => {
    if (isSparePiece || !square || !piece?.pieceType) return false;
    if (!moveHintsToolOk) return false;
    if (!boardExploreMode) return false;
    if (isStudentView) {
      if (playSide == null) return false;
      if (playSide !== 'both') {
        const pt = piece.pieceType;
        if (typeof pt !== 'string' || pt.charAt(0) !== playSide) return false;
      }
    } else if (drawingTool !== 'mouse') return false;
    try {
      const fenPos = (hoverFen || boardDisplayFen).trim();
      const g = new Chess(fenPos);
      const pc = g.get(square as any);
      if (!pc || pc.color !== g.turn()) return false;
      if (!analysisMode && isStudentView && playSide != null && playSide !== 'both') {
        if (g.turn() !== playSide || pc.color !== playSide) return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const [legalMoveHintStyles, legalMoveHintDests] = useMemo((): [Record<string, CSSProperties>, Set<string>] => {
    const empty: [Record<string, CSSProperties>, Set<string>] = [{}, new Set()];
    if (!moveHintSquare || !moveHintsToolOk) return empty;
    if (!boardExploreMode) return empty;
    try {
      const fenPos = (hoverFen || boardDisplayFen).trim();
      const g = new Chess(fenPos);
      const piece = g.get(moveHintSquare as any);
      if (!piece || piece.color !== g.turn()) return empty;
      if (!analysisMode && isStudentView) {
        if (playSide == null) return empty;
        if (playSide !== 'both' && (g.turn() !== playSide || piece.color !== playSide)) return empty;
      }
      const moves = g.moves({ square: moveHintSquare as any, verbose: true });
      if (moves.length === 0) return empty;
      const styles: Record<string, CSSProperties> = {
        [moveHintSquare]: { backgroundColor: 'rgba(99, 102, 241, 0.45)' },
      };
      const dests = new Set<string>();
      for (const m of moves) {
        dests.add(m.to);
        if (m.to === moveHintSquare) continue;
        if (m.captured) {
          styles[m.to] = {
            backgroundImage:
              'radial-gradient(circle at center, transparent 62%, rgba(0,0,0,0.2) 63%, rgba(0,0,0,0.2) 86%, transparent 87%)',
          };
        } else {
          styles[m.to] = {
            backgroundImage:
              'radial-gradient(circle at center, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.2) 26%, transparent 28%)',
          };
        }
      }
      return [styles, dests];
    } catch {
      return empty;
    }
  }, [
    moveHintSquare,
    moveHintsToolOk,
    boardExploreMode,
    analysisMode,
    hoverFen,
    boardDisplayFen,
    playSide,
    isStudentView,
  ]);

  const boardOptions = {
    position: boardDisplayFen,
    boardOrientation: boardOrientation as 'white' | 'black',
    ...CHESSBOARD_NO_NOTATION,
    squareStyles: {
      ...lastMoveSquares,
      ...legalMoveHintStyles,
      ...squareMarksToStyles(marks),
    },
    /** Klasik yeşil / krem Chess.com tahtası */
    darkSquareStyle: { backgroundColor: '#769656' },
    lightSquareStyle: { backgroundColor: '#eeeed2' },
    ...CHESSBOARD_ANIMATION,
    /** Sürüklemeye başlayınca hedef kareleri göster — dnd sensörleri tıklamayı yutmaya eğilimli */
    onPieceDrag: ({
      square,
      piece,
      isSparePiece,
    }: {
      isSparePiece?: boolean;
      piece?: { pieceType?: string };
      square?: string | null;
    }) => {
      if (!square || !liveLessonPieceEligibleForMoveHints(square, piece, !!isSparePiece)) return;
      setMoveHintSquare(square);
    },
    onPieceDrop: (src: unknown, tgt: unknown, p: unknown) => {
      const { sourceSquare, targetSquare } = pickDropArgs(src, tgt);
      if (!sourceSquare) return false;
      if (!targetSquare) {
        setMoveHintSquare(null);
        return false;
      }
      const ok = onPieceDrop(sourceSquare, targetSquare, p);
      if (!ok) setMoveHintSquare(null);
      return ok;
    },
    onPieceClick: ({
      piece,
      square,
      isSparePiece,
    }: {
      isSparePiece?: boolean;
      piece?: { pieceType?: string };
      square?: string | null;
    }) => {
      if (!square || !liveLessonPieceEligibleForMoveHints(square, piece, !!isSparePiece)) return;
      setMoveHintSquare((prev) => (prev === square ? null : square));
    },
    onSquareClick: (arg: unknown) => {
      const square = pickSquare(arg);
      if (!square) return;
      const mousePlay = moveHintsToolOk && boardExploreMode;
      if (mousePlay && moveHintSquare) {
        if (square === moveHintSquare) {
          setMoveHintSquare(null);
          return;
        }
        if (legalMoveHintDests.has(square)) {
          const ok = handleDrop(moveHintSquare, square);
          if (ok) setMoveHintSquare(null);
          return;
        }
        setMoveHintSquare(null);
        return;
      }
      if (isStudentView) return;
      if (drawingTool === 'mouse') return;
      if (drawingTool === 'eraser') {
        setMarks((prev) => {
          const next = { ...prev };
          delete next[square];
          pushState(fen, moveHistory, arrows, next, coachSide ?? undefined);
          return next;
        });
        return;
      }
      setMarks((prev) => {
        const nextType = drawingTool === 'square' ? 'square' : (drawingTool === 'circle' ? 'circle' : 'x');
        const current = prev[square];
        if (current && current.type === nextType && current.color === drawingColor) {
          const next = { ...prev };
          delete next[square];
          pushState(fen, moveHistory, arrows, next, coachSide ?? undefined);
          return next;
        }
        const next = { ...prev, [square]: { color: drawingColor, type: nextType } };
        pushState(fen, moveHistory, arrows, next, coachSide ?? undefined);
        return next;
      });
    },
    arePiecesDraggable:
      (isStudentView
        ? playSide != null
        : drawingTool === 'mouse') && boardExploreMode,
    allowDrawingArrows: !isStudentView && drawingTool === 'arrow',
    /** Öğrenci: sunucudan gelen oklar; antrenör kendi çizimini internalArrows ile görür (boş dizi = çift ok yok) */
    arrows: isStudentView ? arrowsToShow : [],
    clearArrowsOnPositionChange: false,
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
    onArrowsChange: !isStudentView ? (payload: unknown) => {
      const newArrows = Array.isArray(payload)
        ? (payload as ArrowItem[])
        : ((payload as { arrows?: ArrowItem[] } | null)?.arrows ?? []);
      const next = sanitizeArrows(newArrows ?? []);
      if (next.length > arrows.length) {
        next[next.length - 1].color = COLOR_VALUES[drawingColor];
      }
      const toPersist = persistedArrows(next);
      setArrows(toPersist);
      pushState(fen, moveHistory, toPersist, marks, coachSide ?? undefined);
    } : undefined,
    canDragPiece: ({ piece }: { piece?: { pieceType?: string }; isSparePiece?: boolean; square?: string | null }) => {
      const pieceType = piece?.pieceType ?? (piece as unknown as string);
      const pt = typeof pieceType === 'string' ? pieceType : '';
      const color = pt.charAt(0);
      if (!isStudentView) {
        if (coachSide == null || coachSide === 'both') return true;
        return color === coachSide;
      }
      if (playSide == null) return false;
      if (playSide === 'both') return true;
      return color === playSide;
    },
  };

  const displayTurn = useMemo(() => {
    try {
      return new Chess(boardDisplayFen).turn();
    } catch {
      return game.turn();
    }
  }, [boardDisplayFen, game]);
  const turn = displayTurn === 'w' ? 'Beyaz' : 'Siyah';

  const showLiveEvalBar = showBoardEvalBar;
  const liveEvalBarScore = useMemo(
    () => classroomEvalBarPawns(enginePvLines[0], displayTurn),
    [enginePvLines, displayTurn]
  );

  const classroomOpenParticipation = sessionMedia.openParticipation ?? false;

  const STALE_ROOM_MS = 24 * 60 * 60 * 1000;
  const activeRooms = useMemo(
    () =>
      rooms.filter((r) => {
        const t = new Date(r.updated_at || '').getTime();
        return Number.isFinite(t) && Date.now() - t < STALE_ROOM_MS;
      }),
    [rooms],
  );

  /** Admin: Sınıf listesi ekranı (oda seç veya yeni oda oluştur) */
  if (showClassList) {
    return (
      <div className="flex flex-col h-full min-h-0 max-h-[100dvh] bg-[#0f172a] overflow-hidden rounded-none sm:rounded-2xl lg:rounded-3xl border-0 sm:border border-white/[0.06] animate-in fade-in duration-500 atmospheric-bg ring-0 sm:ring-1 ring-indigo-500/10 shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
        <div className="lg:hidden shrink-0 px-4 py-3 border-b border-white/[0.06] bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl premium-gradient flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 shrink-0">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white tracking-tight">Canlı Sınıflar</h2>
              <p className="text-xs text-slate-400 leading-snug">Odaya katılın veya yeni ders oluşturun</p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex min-h-0 flex-col lg:flex-row">
          <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-6 sm:p-8 text-center min-h-[280px]">
            <div className="w-full max-w-[min(60vh,520px)] aspect-square rounded-3xl border border-dashed border-indigo-500/20 flex flex-col items-center justify-center gap-5 bg-[#1e293b]/40 shadow-inner group">
              <div className="w-20 h-20 rounded-2xl premium-gradient flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 transition-transform group-hover:scale-105">
                <LayoutGrid className="w-10 h-10" />
              </div>
              <div className="space-y-2 px-6">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Canlı Sınıflar</h2>
                <p className="text-sm text-slate-400 font-medium max-w-xs mx-auto leading-relaxed">
                  Bir odaya katılın veya yeni oda oluşturarak dersi başlatın
                </p>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[380px] xl:w-[400px] flex flex-col flex-1 lg:flex-none bg-[#1e293b]/60 backdrop-blur-xl border-t lg:border-t-0 lg:border-l border-white/[0.06] shrink-0 overflow-hidden min-h-0">
            <div className="p-5 sm:p-6 border-b border-white/[0.06] bg-slate-900/40">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-indigo-500" />
                Aktif Odalar
              </h2>
              <button
                type="button"
                onClick={() => setShowNewRoomModal(true)}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl premium-gradient text-white font-bold text-sm transition-all shadow-lg shadow-indigo-500/25 hover:brightness-110 active:scale-[0.98]"
              >
                <Plus className="w-5 h-5" />
                Yeni Oda Oluştur
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5 custom-scrollbar min-h-0">
              {activeRooms.length === 0 && (
                <div className="text-center py-16 px-6 rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
                  <p className="text-xs text-slate-500 font-medium">Henüz aktif ders bulunmuyor.</p>
                </div>
              )}
              {activeRooms.map((r) => (
                <div key={r.id} className="group rounded-xl bg-[#0f172a]/50 border border-white/[0.06] hover:border-indigo-500/35 overflow-hidden transition-all">
                  <button
                    type="button"
                    onClick={() => setSelectedRoomId(r.id)}
                    className="w-full min-w-0 flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-indigo-500/[0.06] transition-all text-left"
                  >
                    <div className="min-w-0">
                      <span className="block text-sm font-semibold text-white truncate">{r.room_name || `Oda ${r.id}`}</span>
                      <span className="text-[10px] text-slate-500 font-medium mt-0.5">
                        {new Date(r.updated_at || '').toLocaleDateString('tr-TR')}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-400" />
                  </button>
                  <div className="flex border-t border-white/[0.06]">
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); void sendRoomRowToStudy(r); }}
                      className="flex-1 flex items-center justify-center gap-2 min-h-[44px] py-2.5 text-[11px] font-semibold text-indigo-300 hover:bg-indigo-500/15 hover:text-white transition-all"
                    >
                      <BookMarked className="w-4 h-4 shrink-0" />
                      <span>Çalışmaya gönder</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); openDeleteRoomModal(r); }}
                      className="flex-1 flex items-center justify-center gap-2 min-h-[44px] py-2.5 text-[11px] font-semibold text-rose-400 border-l border-white/[0.06] hover:bg-rose-500/15 hover:text-white transition-all"
                    >
                      <Trash2 className="w-4 h-4 shrink-0" />
                      <span>Sil</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 sm:p-5 bg-slate-900/50 border-t border-white/[0.06]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-slate-500">
                  <Users className="w-4 h-4 text-indigo-400/80" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide">Çevrimiçi öğrenciler</span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 text-xs font-bold tabular-nums">
                  {students.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal - Modernized */}
        {roomPendingDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in" onClick={() => !deleteRoomLoading && setRoomPendingDelete(null)}>
            <div className="w-full max-w-sm rounded-2xl bg-[#1e293b] border border-white/[0.08] shadow-[0_24px_80px_rgba(0,0,0,0.55)] overflow-hidden animate-in zoom-in-95 atmospheric-bg" onClick={(e) => e.stopPropagation()}>
              <div className="p-8 text-center space-y-4">
                <div className="w-20 h-20 rounded-3xl bg-rose-500/10 flex items-center justify-center text-rose-500 mx-auto border border-rose-500/20 shadow-xl shadow-rose-500/10">
                  <Trash2 className="w-10 h-10" />
                </div>
                <div>
                   <h3 className="text-xl font-black text-white uppercase tracking-tighter">Odayı Kapat?</h3>
                   <p className="text-sm text-slate-500 font-medium mt-2"><span className="text-white">{roomPendingDelete.room_name || `Oda ${roomPendingDelete.id}`}</span> dersi kalıcı olarak sonlandırılacak.</p>
                </div>
              </div>
              <div className="p-6 bg-black/40 flex gap-3">
                 <button onClick={() => setRoomPendingDelete(null)} className="flex-1 py-4 rounded-2xl bg-white/5 text-slate-400 font-black text-xs uppercase tracking-widest hover:text-white transition-all">VAZGEÇ</button>
                 <button onClick={() => void confirmDeleteRoom()} className="flex-1 py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-rose-600/20">SİL</button>
              </div>
            </div>
          </div>
        )}

        {/* New Room Modal - Chess.com Style */}
        {showNewRoomModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in" onClick={() => setShowNewRoomModal(false)}>
            <div className="w-full max-w-md bg-[#1e293b] rounded-2xl border border-white/[0.08] shadow-[0_24px_80px_rgba(0,0,0,0.55)] overflow-hidden animate-in zoom-in-95 atmospheric-bg" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-white/[0.06] flex items-center justify-between bg-slate-900/40">
                 <h3 className="text-lg font-bold text-white">Sınıf Oluştur</h3>
                 <button onClick={() => setShowNewRoomModal(false)} className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-5">
                 <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Ders başlığı</label>
                    <input autoFocus value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder="Örn: 15-B Taktiği Analizi" className="input-base w-full rounded-xl" />
                 </div>
                 <div>
                    <div className="flex items-center justify-between mb-2">
                       <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Katılımcı daveti</label>
                       <button type="button" onClick={() => refreshStudentsFromSupabase()} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase">Yenile</button>
                    </div>
                    {inviteGroupNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {inviteGroupNames.map((g) => {
                          const ids = students.filter((s) => s.group === g).map((s) => s.id);
                          const allSelected = ids.length > 0 && ids.every((id) => inviteStudentIds.includes(id));
                          return (
                            <button
                              key={g}
                              type="button"
                              onClick={() => toggleInviteGroup(g)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                                allSelected
                                  ? 'bg-indigo-600/25 text-indigo-200 border-indigo-500/40'
                                  : 'bg-slate-800/60 text-slate-400 border-white/10 hover:border-indigo-500/30'
                              }`}
                            >
                              {g} ({ids.length})
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-white/[0.06] bg-[#0f172a]/60 custom-scrollbar divide-y divide-white/[0.04]">
                       {students.map(s => (
                         <label key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-500/[0.06] cursor-pointer transition-colors group">
                            <input type="checkbox" checked={inviteStudentIds.includes(s.id)} onChange={() => toggleInviteStudent(s.id)} className="w-4 h-4 rounded border-slate-600 bg-[#0f172a] text-indigo-600 focus:ring-indigo-500/30" />
                            <span className="text-sm font-medium text-slate-300 group-hover:text-white">{s.name}</span>
                         </label>
                       ))}
                    </div>
                 </div>
              </div>
              <div className="p-6 bg-slate-900/40 border-t border-white/[0.06]">
                 <button onClick={() => createRoom(newRoomName)} disabled={!newRoomName.trim()} className="w-full py-3.5 rounded-xl premium-gradient text-white font-bold text-sm transition-all shadow-lg shadow-indigo-500/25 hover:brightness-110 disabled:opacity-40 active:scale-[0.98]">Sınıfı Başlat</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!showClassList && isStudentWaitingForAdmission) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-[calc(100vh-5rem)] bg-[#0f172a] text-center px-8 rounded-2xl lg:rounded-3xl border border-white/[0.06] atmospheric-bg ring-1 ring-indigo-500/10">
        <Clock className="w-14 h-14 text-indigo-400 shrink-0 animate-pulse" aria-hidden />
        <h2 className="text-xl font-bold text-white">Bekleme odası</h2>
        <p className="text-sm text-slate-400 max-w-md">
          Antrenör sizi derse alana kadar burada bekleyeceksiniz. Lütfen bu sayfayı kapatmayın.
        </p>
        <p className="text-xs text-slate-500">Oda: {effectiveRoomName}</p>
      </div>
    );
  }

  /** Antrenörün öğrenciyi oyundan çıkarması (session_media ile senkron). */
  if (!showClassList && isStudentKickedFromRoom) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-[calc(100vh-5rem)] bg-[#0f172a] text-center px-8 rounded-2xl lg:rounded-3xl border border-white/[0.06] atmospheric-bg ring-1 ring-indigo-500/10">
        <AlertTriangle className="w-14 h-14 text-amber-500 shrink-0" aria-hidden />
        <h2 className="text-xl font-bold text-white">Oturum sonlandırıldı</h2>
        <p className="text-sm text-slate-400 max-w-md">
          Antrenör sizi bu canlı dersten çıkardı. Yeniden katılmak için antrenörden yeni bağlantı isteyin.
        </p>
        <button
          type="button"
          onClick={() => (onBack ? onBack() : (window.location.hash = '#/ogrenci'))}
          className="mt-2 px-6 py-3 rounded-xl premium-gradient text-white font-semibold shadow-lg shadow-indigo-500/20 hover:brightness-110 transition-all"
        >
          Geri dön
        </button>
      </div>
    );
  }
  /** Dersi başlatmadan önce renk seçimi veya davet linkini gösterme */
  if (inviteFollowUp) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-5rem)] bg-[#0f172a] p-6 animate-in fade-in duration-500 atmospheric-bg">
        <div className="w-full max-w-md bg-[#1e293b] rounded-2xl border border-white/[0.08] shadow-[0_24px_80px_rgba(0,0,0,0.55)] overflow-hidden animate-in zoom-in-95 ring-1 ring-indigo-500/10">
          <div className="p-8 text-center space-y-5">
            <div className="w-20 h-20 rounded-2xl premium-gradient flex items-center justify-center text-white mx-auto shadow-lg shadow-indigo-500/30 group">
              <Link2 className="w-10 h-10 transition-transform group-hover:rotate-12" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white">Sınıf hazır</h3>
              <p className="text-sm text-slate-400 font-medium leading-relaxed px-2">
                <span className="text-white font-semibold">{inviteFollowUp.roomName}</span> dersi için davet linkiniz oluşturuldu.
              </p>
            </div>

            <div className="space-y-3 pt-2">
               <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl opacity-20 blur group-hover:opacity-30 transition-all" />
                  <div className="relative flex items-center gap-2 bg-[#0f172a]/80 border border-white/[0.08] rounded-xl px-4 py-3">
                    <code className="flex-1 text-[11px] text-slate-300 font-mono truncate text-left">
                      {buildStudentInviteUrl(inviteFollowUp.roomId)}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        const u = buildStudentInviteUrl(inviteFollowUp.roomId);
                        navigator.clipboard?.writeText(u).then(() => {
                          setInviteCopied(true);
                          setTimeout(() => setInviteCopied(false), 2000);
                        });
                      }}
                      className="shrink-0 p-2 rounded-lg hover:bg-indigo-500/15 text-slate-400 hover:text-indigo-300 transition-all"
                    >
                      {inviteCopied ? <Check className="w-5 h-5 text-indigo-400" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
               </div>

               {inviteFollowUp.invitedStudentIds.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-indigo-500/[0.06] border border-indigo-500/15 text-left">
                     <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Davet edilenler</p>
                     <p className="text-xs text-slate-300 font-medium">
                        {inviteFollowUp.invitedStudentIds.map(id => students.find(x => x.id === id)?.name || id).join(', ')}
                     </p>
                  </div>
               )}
            </div>
          </div>
          <div className="p-6 bg-slate-900/40 border-t border-white/[0.06]">
             <button type="button" onClick={() => setInviteFollowUp(null)} className="w-full py-3.5 rounded-xl premium-gradient text-white font-bold text-sm transition-all shadow-lg shadow-indigo-500/25 hover:brightness-110 active:scale-[0.98]">Derse Giriş Yap</button>
          </div>
        </div>
      </div>
    );
  }

  /** Tahta sütunu: koç ve öğrenci aynı kare ölçek mantığı (Chess.com sınıf düzeni) */
  const lessonBoardSizing = 'w-full mx-auto';
  const boardScalePct = isStudentView ? studentBoardScalePct : coachBoardScalePct;
  const boardMul = boardScalePct / 100;
  const boardViewportDeduction = mobileClassroomPanel === 'board' ? '9rem' : (isStudentView ? '12.5rem' : '15rem');
  /** Eval + rakam sütunu + alt harf satırı — tahta karesi dışındaki pay */
  const boardChromeW = showLiveEvalBar ? '3.5rem' : '1.25rem';
  const classroomEvalWidth = '2.25rem';
  const boardFileRowH = '1.25rem';
  const boardColumnStyle: CSSProperties = { width: '100%', maxWidth: '100%' };
  const boardShellStyle: CSSProperties = {
    // Not: cqw/cqh + container-type bazı tarayıcılarda tahtayı aşırı küçültebiliyor.
    // Bu yüzden daha uyumlu bir min(vw, vh, px) kuralı kullanıyoruz.
    // Önemli: ChessBoardFrame dışarıda eval + koordinat "chrome" eklediği için genişlik hesabına chrome'u dahil etmeliyiz,
    // aksi halde taşma/scroll oluşup butonlar iç içe girebiliyor.
    width: `min(96vw, calc(100dvh - ${boardViewportDeduction}), calc(${Math.max(280, Math.round(980 * boardMul))}px + ${boardChromeW}))`,
    maxWidth: '96vw',
  };
  const setBoardScalePct = isStudentView ? setStudentBoardScalePct : setCoachBoardScalePct;
  const sidebarTabDefs: { id: ClassroomSidebarTab; Icon: typeof Search; label: string; coachOnly?: boolean }[] = [
    { id: 'analiz', Icon: Search, label: 'Analiz' },
    { id: 'katilimcilar', Icon: Users, label: 'Katılımcılar' },
    { id: 'goruntu', Icon: Video, label: 'Görüntü' },
    { id: 'sohbet', Icon: MessageCircle, label: 'Sohbet' },
    { id: 'oyunlar', Icon: FolderOpen, label: 'Oyunlar', coachOnly: true },
    { id: 'kesfet', Icon: Compass, label: 'Keşfet', coachOnly: true },
  ];
  const visibleSidebarTabs = sidebarTabDefs.filter((t) => !t.coachOnly || !isStudentView);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-none sm:rounded-2xl lg:rounded-3xl border-0 sm:border border-white/10 bg-[#0f172a] animate-in fade-in duration-500 shadow-[0_24px_70px_rgba(0,0,0,0.45)] ring-0 sm:ring-1 ring-indigo-500/10 atmospheric-bg h-full min-h-0 max-h-[100dvh]`}
    >
      <div className="flex flex-1 min-h-0 overflow-hidden flex-col lg:flex-row pb-14 lg:pb-0">
        {/* ── Classroom: Tahta (ekrana oturan kare) ── */}
        <section className={`${mobileClassroomPanel === 'board' ? 'flex' : 'hidden'} lg:flex flex-1 lg:flex-[1.85] xl:flex-[2] min-w-0 min-h-0 flex-col bg-gradient-to-b from-slate-900/90 via-[#0f172a] to-slate-950 lg:border-r lg:border-white/10`}>
          {isStudentView && (
            <div className="shrink-0 px-3 pt-1.5 pb-0 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-300 bg-indigo-500/15 border border-indigo-500/30 rounded-full px-3 py-1">
                Öğrenci görünümü
              </span>
              {hasIndependentBoard ? (
                <div className="flex items-center rounded-lg border border-white/10 bg-slate-800/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => setStudentBoardViewMode('teacher')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      studentBoardViewMode === 'teacher'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Antrenör tahtası
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentBoardViewMode('own')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      studentBoardViewMode === 'own'
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Kendi tahtam
                  </button>
                </div>
              ) : (
                <span className="text-[10px] text-slate-500 truncate">Tahtayı antrenör yönetir</span>
              )}
            </div>
          )}
          {false && (
            <div className="shrink-0 flex justify-center pt-3 px-4">
              <div className={`${lessonBoardSizing} flex justify-center`} style={boardFrameStyle}>
                <div className="inline-flex flex-wrap justify-center rounded-lg border border-black/45 bg-black/35 p-0.5 shadow-inner gap-0.5 max-w-full">
                  <button
                    type="button"
                    onClick={() => setCoachSideAndPush('w')}
                    className="px-6 sm:px-8 py-2.5 rounded-md bg-[#81b64c] text-white text-xs font-bold uppercase tracking-wide shadow-sm"
                  >
                    Beyaz
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoachSideAndPush('b')}
                    className="px-6 sm:px-8 py-2.5 rounded-md text-[#e8e2dc] hover:bg-white/10 text-xs font-bold uppercase tracking-wide transition-colors"
                  >
                    Siyah
                  </button>
                </div>
              </div>
            </div>
          )}

          <div
            className={`flex-1 flex flex-col min-h-0 items-stretch px-2 sm:px-3 lg:px-5 py-1 sm:py-2 overflow-x-hidden ${
              isStudentView
                ? 'overflow-y-auto overflow-x-hidden custom-scrollbar justify-center'
                : 'overflow-y-auto custom-scrollbar justify-start xl:justify-center'
            }`}
          >
            {isStudentView && selectedPoolPuzzle && (
              <div
                className={`${lessonBoardSizing} ${isStudentView ? 'mb-2' : 'mb-4'} rounded-xl border px-4 py-2.5 ${
                  sessionMedia.studentCanSeePuzzleSolution ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-slate-800/40 border-white/10'
                }`}
                style={boardColumnStyle}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Antrenör bulmacası</p>
                <p className="text-sm font-semibold text-white truncate mt-1">{selectedPoolPuzzle.title}</p>
                {studentVisiblePuzzleSolution ? (
                  <p className="text-xs text-indigo-200 mt-1 break-words">Çözüm: {studentVisiblePuzzleSolution}</p>
                ) : (
                  <p className="text-xs text-slate-500 mt-1">Çözüm paylaşılmadı.</p>
                )}
              </div>
            )}

            <div
              className={`${lessonBoardSizing} min-h-0 w-full flex flex-col gap-2 ${
                isStudentView ? 'flex-1 min-h-0' : 'shrink-0'
              }`}
              style={boardColumnStyle}
            >
              <div className="flex items-center justify-between gap-2 px-0.5 min-h-[20px] shrink-0">
                <div className="flex items-center gap-1.5 text-slate-300 text-xs font-medium">
                  <span className="text-[10px] text-slate-500 leading-none" aria-hidden>▲</span>
                  <span>Siyah</span>
                </div>
                <div className="flex items-center gap-2">
                  {turn === 'Siyah' ? (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/40 bg-indigo-500/15">
                      Sırada
                    </span>
                  ) : null}
                  <div className="sm:hidden">
                    <BoardViewToggle mode={boardViewMode} onChange={setBoardViewMode} />
                  </div>
                </div>
              </div>
              <div
                className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pb-1"
                aria-label="Tahta boyutu"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Tahta boyutu
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center rounded-xl border border-white/10 bg-slate-800/60 p-0.5">
                    <button
                      type="button"
                      className="p-2 rounded-lg text-slate-300 hover:bg-indigo-500/20 hover:text-white disabled:opacity-35 disabled:pointer-events-none"
                      disabled={boardScalePct <= BOARD_SCALE_MIN}
                      aria-label="Tahtayı küçült"
                      onClick={() =>
                        setBoardScalePct((p) => clampBoardScalePct(p - BOARD_SCALE_STEP))
                      }
                    >
                      <Minus className="h-4 w-4" aria-hidden />
                    </button>
                    <span className="min-w-[2.85rem] text-center text-[11px] font-bold tabular-nums text-white px-1">
                      {boardScalePct}%
                    </span>
                    <button
                      type="button"
                      className="p-2 rounded-lg text-slate-300 hover:bg-indigo-500/20 hover:text-white disabled:opacity-35 disabled:pointer-events-none"
                      disabled={boardScalePct >= BOARD_SCALE_MAX}
                      aria-label="Tahtayı büyüt"
                      onClick={() =>
                        setBoardScalePct((p) => clampBoardScalePct(p + BOARD_SCALE_STEP))
                      }
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 hover:text-indigo-300 px-2 py-1 rounded-lg border border-transparent hover:bg-indigo-500/10"
                    onClick={() => setBoardScalePct(BOARD_SCALE_DEFAULT)}
                  >
                    Sıfırla
                  </button>
                  <BoardViewToggle mode={boardViewMode} onChange={setBoardViewMode} />
                </div>
              </div>

              <div className="flex flex-1 min-h-0 w-full min-w-0 items-center justify-center overflow-visible py-1 sm:py-2">
              <div
                className="relative mx-auto shrink-0 rounded-2xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.45)] bg-slate-900/90 ring-1 ring-indigo-500/15"
                style={boardShellStyle}
              >
                {boardViewMode === '3d' ? (
                  <div className="w-full aspect-square min-h-[200px]">
                    <Suspense fallback={
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 3D tahta yükleniyor…
                      </div>
                    }>
                      <Chessboard3D
                        fen={hoverFen || boardDisplayFen}
                        orientation={boardOrientation as 'white' | 'black'}
                        squareStyles={boardOptions.squareStyles as Record<string, CSSProperties>}
                        onSquareClick={(square) => boardOptions.onSquareClick({ square })}
                      />
                    </Suspense>
                  </div>
                ) : (
                <ChessBoardFrame
                  boardOrientation={boardOrientation as 'white' | 'black'}
                  evalColumnWidth={classroomEvalWidth}
                  className="w-full min-h-0"
                  shellClassName="bg-slate-900 border-r border-white/10 min-w-[2.25rem]"
                  boardClassName="min-w-0 w-full"
                  evalBar={
                    showLiveEvalBar ? (
                      <ChessEvalBar
                        score={liveEvalBarScore}
                        orientation={boardOrientation as 'white' | 'black'}
                        label={
                          engineLoading || !engineReady
                            ? '…'
                            : formatClassroomEngineScore(enginePvLines[0], displayTurn).slice(0, 9)
                        }
                        darkClassName="bg-slate-800 border-b border-white/10"
                        lightClassName="bg-slate-200"
                        labelClassName="text-[10px] font-bold text-slate-200 bg-slate-900/90 border-b border-white/10 py-1.5"
                      />
                    ) : undefined
                  }
                >
                  <div className="absolute inset-0">
                    <Chessboard
                      key={effectiveRoomId}
                      options={{
                        id: `live-lesson-board-${effectiveRoomId}`,
                        ...boardOptions,
                      }}
                    />
                  </div>
                </ChessBoardFrame>
                )}
              </div>
              </div>

              {!isStudentView ? (
                <div
                  className={`${lessonBoardSizing} flex justify-center shrink-0 mt-1 sm:mt-2 w-full overflow-x-auto scrollbar-none`}
                  style={boardColumnStyle}
                >
                  <div className="inline-flex max-w-full rounded-xl border border-white/10 bg-slate-900/90 px-1 py-1 sm:px-1.5 shadow-lg shadow-black/30">
                    <DrawingToolbar
                      currentTool={drawingTool}
                      currentColor={drawingColor}
                      onToolSelect={(t, c) => {
                        setDrawingTool(t);
                        setDrawingColor(c);
                      }}
                      onClear={() => {
                        setMarks({});
                        setArrows([]);
                        pushState(fen, moveHistory, [], {}, coachSide ?? undefined);
                      }}
                      onCopy={() => {
                        void navigator.clipboard?.writeText(new Chess(boardDisplayFen).fen());
                      }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-2 px-0.5 min-h-[20px] shrink-0">
                <div className="flex items-center gap-1.5 text-slate-300 text-xs font-medium">
                  <span className="text-[10px] text-slate-500 leading-none" aria-hidden>▲</span>
                  <span>Beyaz</span>
                </div>
                {turn === 'Beyaz' ? (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/40 bg-indigo-500/15">
                    Sırada
                  </span>
                ) : (
                  <span className="w-14 shrink-0" aria-hidden />
                )}
              </div>
            </div>

            {/* Tahta görünmez kaldığında hata bildir */}
            {!isStudentView && coachSide !== null && mediaError ? (
              <p className="text-xs text-red-400 text-center mt-3">{mediaError}</p>
            ) : null}
          </div>
        </section>

        {/* ── Classroom sağ sidebar ── */}
        <aside className={`${mobileClassroomPanel === 'sidebar' ? 'grid' : 'hidden'} lg:grid flex-1 lg:flex-none w-full lg:w-[min(420px,32vw)] lg:shrink-0 grid-rows-[auto_auto_1fr_auto_auto] overflow-hidden bg-slate-900/95 backdrop-blur-xl border-t lg:border-t-0 lg:border-l border-white/10 min-h-0 lg:max-w-[440px]`}>
          <header className="flex items-center justify-between border-b border-white/10 px-3 py-2.5 gap-2 row-start-1 bg-slate-900/50">
            <button
              type="button"
              onClick={onBack || (() => setSelectedRoomId(null))}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Geri"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex flex-col items-center gap-1 text-center px-4 min-w-0">
              <div className="flex items-center justify-center gap-2 text-white font-semibold text-base leading-tight truncate max-w-[11rem] sm:max-w-[14rem]">
                <GraduationCap className="w-5 h-5 shrink-0 text-indigo-400" aria-hidden />
                <span>Sınıf</span>
              </div>
              <span className="text-[11px] text-slate-500 truncate max-w-[16rem]" title={effectiveRoomName}>
                {effectiveRoomName}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0 min-w-[4.75rem]" title={`Oturum süresi: ${sessionTime}`}>
              <Clock className="w-6 h-6 text-slate-400" aria-hidden />
              <span className="text-[10px] font-mono tabular-nums text-slate-500">{sessionTime}</span>
            </div>
          </header>

          <nav className="flex overflow-x-auto scrollbar-none snap-x snap-mandatory border-b border-white/10 bg-slate-900/40 row-start-2 sm:grid sm:grid-cols-6 sm:overflow-visible">
            {visibleSidebarTabs.map(({ id, Icon: Ico, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSidebarTab(id)}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[4.5rem] sm:min-w-0 px-2 py-2 text-[10px] sm:text-[11px] font-semibold transition-colors border-b-2 shrink-0 snap-start sm:shrink ${
                  sidebarTab === id
                    ? 'text-white bg-indigo-500/15 border-indigo-500'
                    : 'text-slate-500 hover:text-slate-200 border-transparent'
                }`}
              >
                <Ico className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[4.5rem] sm:max-w-full px-0.5">{label}</span>
              </button>
            ))}
          </nav>

          <div className="row-start-3 min-h-0 overflow-hidden flex flex-col">
            {sidebarTab === 'analiz' && (
              <div className="flex flex-col h-full min-h-0">
                <section className="shrink-0 border-b border-white/10 px-3 py-3 space-y-2.5 bg-slate-800/30 overflow-y-auto max-h-[min(32vh,260px)] lg:max-h-[min(42vh,320px)] custom-scrollbar">
                  {!isStudentView ? (
                    <div className="flex items-center justify-between gap-3 py-1 border-b border-white/[0.06]">
                      <label
                        htmlFor="live-student-analysis-toggle"
                        className="cursor-pointer text-[13px] leading-snug text-slate-300 flex-1 min-w-0"
                      >
                        Öğrenci analiz paneli
                      </label>
                      <ClassroomToggle
                        id="live-student-analysis-toggle"
                        on={sessionMedia.studentAnalysisVisible ?? false}
                        onToggle={() => toggleStudentAnalysisVisibility()}
                      />
                    </div>
                  ) : null}
                  {isStudentView && !studentBoardEvalOn && !(sessionMedia.studentAnalysisVisible ?? false) ? (
                    <p className="text-[12px] text-slate-500 leading-snug rounded-xl border border-white/10 bg-slate-800/40 px-3 py-2.5">
                      Antrenör avantaj çubuğunu veya analiz panelini henüz açmadı.
                    </p>
                  ) : isStudentView && !studentBoardEvalOn ? (
                    <p className="text-[12px] text-slate-500 leading-snug rounded-xl border border-white/10 bg-slate-800/40 px-3 py-2.5">
                      Avantaj çubuğu için antrenörün «Avantaj çubuğu» ayarını açması gerekir.
                    </p>
                  ) : (
                  <>
                  <div className="flex items-center justify-between gap-3 py-1 border-b border-white/[0.06]">
                    <label
                      htmlFor="live-advantage-bar-toggle"
                      className="cursor-pointer text-[13px] leading-snug text-slate-300 flex-1 min-w-0"
                      title="Tahtanın solunda beyaz–siyah avantaj çubuğunu gösterir (Stockfish)."
                    >
                      Avantaj çubuğu
                    </label>
                    <ClassroomToggle
                      id="live-advantage-bar-toggle"
                      on={
                        isStudentView
                          ? (sessionMedia.studentEvalBarVisible ??
                              sessionMedia.studentAnalysisVisible ??
                              false)
                          : engineEvalVisible
                      }
                      onToggle={() => {
                        if (!isStudentView) toggleCoachEvalBarVisible();
                      }}
                    />
                  </div>
                  {!isStudentView ? (
                  <div className="flex items-center justify-between gap-3 py-1 border-b border-white/[0.06]">
                    <label htmlFor="live-engine-lines-toggle" className="cursor-pointer text-[13px] leading-snug text-slate-300 flex-1 min-w-0">
                      Devam yolları
                    </label>
                    <ClassroomToggle
                      id="live-engine-lines-toggle"
                      on={engineLinesVisible}
                      onToggle={() => setEngineLinesVisible(!engineLinesVisible)}
                    />
                  </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-2 pt-2 text-[11px] text-slate-400">
                    <span className="shrink-0 tabular-nums font-medium text-slate-300">
                      depth={enginePanelActive ? (engineLoading ? '…' : String(engineDepth || 0)) : '—'}
                      {!engineReady && enginePanelActive ? (
                        <span className="text-slate-500 font-normal"> · bekleniyor</span>
                      ) : null}
                    </span>
                    <div className="flex min-w-0 items-center gap-1 text-[10px] text-slate-500">
                      <span className="truncate">Stockfish 18 · lite-single</span>
                      <button
                        type="button"
                        title="Çok hat analizi için devam satırlarını açık tutun"
                        className="shrink-0 p-1 text-slate-500 hover:text-indigo-300 rounded-md"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {engineError ? (
                    <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100/95 leading-snug">
                      {engineError}
                    </div>
                  ) : null}
                  {enginePanelActive && enginePvLines[0] ? (
                    <div className="flex flex-col gap-2">
                      {enginePreviewFen ? (
                        <div className="flex items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-950/30 px-2 py-2">
                          <EngineLinePreviewInline fen={enginePreviewFen} boardOrientation={boardOrientation} />
                          <p className="text-[10px] text-slate-400 leading-snug">Hamle önizlemesi sabit konumda — Lichess gibi kaymaz.</p>
                        </div>
                      ) : null}
                    <div className="flex flex-col gap-1 max-h-[6rem] overflow-y-auto custom-scrollbar">
                      {(engineLinesVisible ? ([0, 1, 2] as const) : ([0] as const)).map((slotIdx) => {
                        const line = enginePvLines[slotIdx];
                        if (!line) return null;
                        return (
                          <div
                            key={`pv-row-${slotIdx}-${line.multipv}-${line.depth}`}
                            className="flex items-start gap-1.5 rounded-lg border border-indigo-500/20 bg-indigo-950/40 px-1.5 py-1 text-left"
                          >
                            <span className="shrink-0 min-w-[2.75rem] rounded-md bg-indigo-500/25 border border-indigo-400/35 px-1 py-0.5 text-center text-[9px] font-bold tabular-nums text-indigo-100 leading-tight">
                              {formatClassroomEngineScore(line, displayTurn)}
                            </span>
                            <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar">
                              <span className="inline-flex items-center whitespace-nowrap text-[9px] leading-tight">
                                <EnginePvInteractiveMoves
                                  fen={boardDisplayFen}
                                  pvMoves={line.pv}
                                  lineIndex={slotIdx}
                                  hovered={enginePvHover}
                                  onHoverPly={handleEnginePvHover}
                                  theme="classroom"
                                />
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    </div>
                  ) : enginePanelActive ? (
                    <div className="rounded-xl border border-white/10 bg-slate-800/40 px-3 py-3 text-center text-[11px] text-slate-500 leading-snug">
                      {!engineReady || engineLoading ? 'Motor başlatılıyor…' : 'Henüz satır gelmedi — tahtayı değiştirin veya bekleyin.'}
                    </div>
                  ) : null}
                  </>
                  )}
                </section>

                <div className="flex flex-col flex-1 min-h-0 border-t border-white/10">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0 bg-slate-800/50">
                  <span className="text-sm font-semibold text-white tracking-tight">Beyaz · Siyah</span>
                  <button
                    type="button"
                    className="p-1.5 text-slate-400 hover:text-indigo-300 rounded-md hover:bg-white/10"
                    title="Hamle yapıştır (PGN)"
                    aria-label="Düzenle"
                    onClick={() => {
                      setSidebarTab('oyunlar');
                      setOyunlarSection('pgn');
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 min-h-[5.5rem] overflow-y-auto p-2 bg-slate-800/35 text-[11px] custom-scrollbar">
                  {!liveLessonChapter ? (
                    <div className="flex flex-col items-center justify-center text-slate-600 gap-2 py-6">
                      <Move className="w-9 h-9 opacity-35 text-slate-500" />
                      <p className="text-[11px] font-medium text-center text-slate-500 leading-snug px-2">
                        Henüz hamle yok. Tahtada oynayın veya PGN ile yükleyin.
                      </p>
                      {!isStudentView ? (
                        <p className="text-[10px] text-center text-slate-600 px-2">
                          Geçmiş bir hamleden farklı oynayarak varyasyon ekleyebilirsiniz.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <StudyMoveTree
                      chapter={liveLessonChapter}
                      currentMoveIndex={currentVariation ? currentVariation[0] + 1 : liveLessonCurrentPly}
                      currentVariation={currentVariation}
                      onSelectMove={selectLiveMove}
                      compact
                      onDeleteFromHere={!isStudentView && !usesOwnBoardDisplay ? deleteLiveMoveFromHere : undefined}
                      onPromoteVariation={!isStudentView && !usesOwnBoardDisplay ? promoteLiveVariation : undefined}
                      onHoverMove={(idx, varInfo) => {
                        if (varInfo) {
                          setHoverFen(liveLessonFenAt(baseFen, moveHistory, variations, varInfo[0], varInfo));
                        } else if (idx == null) {
                          setHoverFen(null);
                        } else {
                          setHoverFen(liveLessonFenAt(baseFen, moveHistory, variations, Math.max(0, idx), null));
                        }
                      }}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 px-2 py-2 border-t border-white/10 shrink-0 bg-slate-900/50">
                  <div className="flex items-center gap-0.5 rounded-lg bg-slate-800/60 p-0.5 border border-white/[0.06]">
                    <button
                      type="button"
                      className="p-2 rounded text-slate-300 hover:bg-indigo-500/20 hover:text-white"
                      title="Başa dön"
                      onClick={() => {
                        setHoverFen(null);
                        setReplayNavPly(0);
                        setReplayIsPlaying(false);
                      }}
                    >
                      <ChevronFirst className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      className="p-2 rounded text-slate-300 hover:bg-indigo-500/20 hover:text-white"
                      title="Önceki hamle"
                      onClick={() => {
                        setHoverFen(null);
                        setReplayNavPly((p) => {
                          const cur = p ?? moveHistory.length;
                          return Math.max(0, cur - 1);
                        });
                        setReplayIsPlaying(false);
                      }}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      className="p-2 rounded text-slate-300 hover:bg-indigo-500/20 hover:text-white"
                      title="Sonraki hamle"
                      onClick={() => {
                        setHoverFen(null);
                        setReplayNavPly((p) => {
                          const len = moveHistory.length;
                          const cur = p ?? len;
                          const next = Math.min(len, cur + 1);
                          return next >= len ? null : next;
                        });
                        setReplayIsPlaying(false);
                      }}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      className="p-2 rounded text-slate-300 hover:bg-indigo-500/20 hover:text-white"
                      title="Son konum"
                      onClick={() => {
                        setHoverFen(null);
                        setReplayNavPly(null);
                        setReplayIsPlaying(false);
                      }}
                    >
                      <ChevronLast className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      className="p-2 rounded text-slate-300 hover:bg-indigo-500/20 hover:text-white"
                      title={replayIsPlaying ? 'Duraklat' : 'Oynat'}
                      onClick={() => setReplayIsPlaying((v) => !v)}
                    >
                      {replayIsPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-0.5 rounded-lg bg-slate-800/60 p-0.5 border border-white/[0.06]">
                    <button
                      type="button"
                      className="p-2 rounded-md text-slate-300 hover:bg-indigo-500/20 hover:text-white"
                      title="PGN indir"
                      onClick={() => downloadCurrentPgnFile()}
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      className="p-2 rounded text-slate-300 hover:bg-indigo-500/20 hover:text-white"
                      title="Tahtayı çalışmaya aktar"
                      onClick={() => void sendCurrentBoardToStudy()}
                    >
                      <BookMarked className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      className="p-2 rounded text-slate-300 hover:bg-indigo-500/20 hover:text-white"
                      title="Yeni tahta"
                      onClick={() => resetBoard()}
                    >
                      <LayoutGrid className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                </div>

              </div>
            )}

            {sidebarTab === 'katilimcilar' && (
              <div className="flex flex-col h-full min-h-0 overflow-y-auto custom-scrollbar">
                {!isStudentView && (
                  <div className="px-3 py-3 space-y-3 border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-2 min-h-[2rem] flex-wrap">
                      <label htmlFor="live-open-part-toggle" className="cursor-pointer text-[13px] leading-snug text-slate-300 flex-1 min-w-0 pr-1 inline-flex items-center gap-1.5">
                        <span>Açık katılım</span>
                        <HelpCircle className="w-4 h-4 shrink-0 text-slate-500" aria-hidden title="Açık: öğrenciler otomatik derse alınır. Kapalı: bekleme odasında onay bekler." />
                      </label>
                      <ClassroomToggle
                        id="live-open-part-toggle"
                        on={classroomOpenParticipation}
                        onToggle={() => toggleOpenParticipationRemote()}
                      />
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setManagePanelOpen(!managePanelOpen)}
                        className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-slate-800/50 px-3 py-2 text-[13px] text-slate-300 hover:bg-slate-800/70"
                      >
                        Yönet
                        <ChevronDown className={`w-4 h-4 transition-transform ${managePanelOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {managePanelOpen ? (
                        <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-white/10 bg-slate-800 shadow-xl py-1">
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-[13px] text-slate-200 hover:bg-indigo-500/15"
                            onClick={() => {
                              setManagePanelOpen(false);
                              void sendCurrentBoardToStudy();
                            }}
                          >
                            Tahtayı çalışmaya aktar
                          </button>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-[13px] text-slate-200 hover:bg-indigo-500/15"
                            onClick={() => {
                              setManagePanelOpen(false);
                              setSelectedRoomId(null);
                            }}
                          >
                            Sınıftan çık
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2">
                        <input
                          value={inviteUsernameInput}
                          onChange={(e) => setInviteUsernameInput(e.target.value)}
                          placeholder="Kullanıcı adı veya öğrenci adı…"
                          className="flex-1 min-w-0 bg-transparent text-[13px] text-white placeholder:text-slate-500 outline-none py-1"
                        />
                        <button
                          type="button"
                          onClick={() => sendUsernameInvite()}
                          className="p-2 text-indigo-400 hover:text-indigo-300 rounded"
                          title="Davet linkini kopyala"
                        >
                          <Send className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => copyClassroomInviteLink()}
                          className="p-2 text-slate-400 hover:text-white rounded"
                          title="Sınıf linki"
                        >
                          {linkCopied ? <Check className="w-5 h-5 text-indigo-400" /> : <Link2 className="w-5 h-5" />}
                        </button>
                      </div>
                      {inviteToast ? <p className="text-[11px] text-indigo-400">{inviteToast}</p> : null}
                    </div>
                  </div>
                )}

                {!isStudentView && (sessionMedia.pendingStudentIds ?? []).length > 0 ? (
                  <div className="px-3 py-3 border-b border-white/10 space-y-2 shrink-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/90">
                        Bekleme odası ({(sessionMedia.pendingStudentIds ?? []).length})
                      </p>
                      <button
                        type="button"
                        onClick={() => admitAllPendingStudents()}
                        className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300"
                      >
                        Tümünü al
                      </button>
                    </div>
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 divide-y divide-amber-500/10">
                      {(sessionMedia.pendingStudentIds ?? []).map((pid) => {
                        const pendingStudent = students.find((s) => idsEqual(s.id, pid));
                        return (
                          <div key={pid} className="flex items-center justify-between gap-2 px-3 py-2.5">
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-white truncate">
                                {pendingStudent?.name ?? pid}
                              </p>
                              <p className="text-[11px] text-amber-400/80">Onay bekliyor</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => admitStudentToClass(pid)}
                              className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-[11px] font-bold"
                            >
                              Derse al
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {!isStudentView && (sessionMedia.handRaisedStudentIds ?? []).length > 0 ? (
                  <div className="px-3 py-3 border-b border-white/10 space-y-2 shrink-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400/90">
                      Söz isteyenler ({(sessionMedia.handRaisedStudentIds ?? []).length})
                    </p>
                    <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/5 divide-y divide-indigo-500/10">
                      {(sessionMedia.handRaisedStudentIds ?? []).map((hid) => {
                        const handStudent = students.find((s) => idsEqual(s.id, hid));
                        const hasFloor = idsEqual(sessionMedia.floorStudentId, hid);
                        return (
                          <div key={hid} className="flex items-center justify-between gap-2 px-3 py-2.5">
                            <div className="min-w-0 flex items-center gap-2">
                              <Hand className="w-4 h-4 text-indigo-300 shrink-0" />
                              <p className="text-[13px] font-semibold text-white truncate">
                                {handStudent?.name ?? hid}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => grantFloorToStudent(hid)}
                              disabled={hasFloor}
                              className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-bold"
                            >
                              {hasFloor ? 'Söz hakkı var' : 'Söz ver'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="px-3 py-3 space-y-2 flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Katılımcılar</p>
                  <div className="rounded-xl border border-white/10 bg-slate-800/40 divide-y divide-white/10">
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-sm font-bold text-indigo-200 shrink-0">
                          {isStudentView ? (currentStudent?.name?.charAt(0) ?? '?') : 'A'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-white truncate">
                            {isStudentView ? `${currentStudent?.name ?? 'Öğrenci'} (Siz)` : 'Antrenör'}
                          </p>
                          <p className="text-[11px] text-slate-400 leading-snug">
                            {isStudentView
                              ? playSide
                                ? `${formatStudentSeatLabel(playSide)} · tahta`
                                : 'İzleyici · tahtayı antrenör yönetir'
                              : coachSide == null
                                ? 'Ev sahibi · antrenör'
                                : `${formatCoachSeatLabel(coachSide)} · Ev sahibi`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-slate-500">
                        {localMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        {localCamOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                      </div>
                    </div>
                    {visibleStudents.map((s) => {
                      const sid = normalizeStudentId(s.id);
                      const blocked = sessionMedia.studentMicBlocked[sid] ?? false;
                      const hasFloor = idsEqual(sessionMedia.floorStudentId, sid);
                      const handRaised = (sessionMedia.handRaisedStudentIds ?? []).some((kid) => idsEqual(kid, sid));
                      const audioCoachOpen = !blocked && hasFloor;
                      const camForcedOffByCoach = !!(sessionMedia.studentCamForcedOff[sid]);
                      return (
                        <div key={s.id} className="relative flex items-center justify-between gap-2 px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-slate-700/80 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                              {s.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => !isStudentView && setSelectedAnalysisStudentId(s.id)}
                                className="text-[13px] font-semibold text-white truncate text-left hover:text-indigo-300"
                              >
                                {s.name}
                              </button>
                              <p className="text-[11px] text-slate-400 leading-snug">
                                {handRaised && !hasFloor ? <span className="text-amber-300">Söz istedi · </span> : null}
                                {hasFloor ? <span className="text-indigo-300">Söz hakkı · </span> : null}
                                {(sessionMedia.independentBoardStudentIds ?? []).some((kid) => idsEqual(kid, sid)) ? (
                                  <span className="text-teal-300">Bağımsız tahta · </span>
                                ) : null}
                                {coachSide
                                  ? `Öğrenci: ${formatStudentSeatLabel(studentPlaySideFromCoach(coachSide))}`
                                  : 'Katılımcı'}
                              </p>
                            </div>
                          </div>
                          {!isStudentView ? (
                            <div
                              className="flex items-center gap-0.5 shrink-0 relative"
                              data-live-lesson-participant-menu-anchor
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => toggleCoachStudentLiveAudio(s.id)}
                                className={`p-1.5 rounded ${audioCoachOpen ? 'bg-slate-700/80 text-slate-200' : 'bg-rose-800/60 text-white'}`}
                                title={audioCoachOpen ? 'Öğrenci sesini kapat (mik + söz)' : 'Öğrenci sesini aç (söz + mik izni)'}
                              >
                                {audioCoachOpen ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleCoachStudentCam(s.id)}
                                className={`p-1.5 rounded ${camForcedOffByCoach ? 'bg-rose-800/60 text-white' : 'bg-slate-700/80 text-slate-200'}`}
                                title={camForcedOffByCoach ? 'Kamerayı açtır' : 'Kamerayı kapat'}
                              >
                                {camForcedOffByCoach ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                              </button>
                              <div className="relative shrink-0">
                                <button
                                  type="button"
                                  aria-haspopup="menu"
                                  aria-expanded={participantMenuStudentId === s.id}
                                  aria-label="Katılımcı kontrolleri"
                                  title="Katılımcı kontrolleri"
                                  className={`p-1.5 rounded ${participantMenuStudentId === s.id ? 'bg-indigo-600 text-white' : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600/80'}`}
                                  onClick={() =>
                                    setParticipantMenuStudentId((prev) => (prev === s.id ? null : s.id))
                                  }
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                                {participantMenuStudentId === s.id ? (
                                  <div
                                    role="menu"
                                    className="absolute right-0 top-full mt-1 z-40 min-w-[12.5rem] rounded-xl border border-white/10 bg-slate-800 py-1 shadow-xl text-[13px]"
                                  >
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full text-left px-3 py-2 text-slate-200 hover:bg-indigo-500/15"
                                      onClick={() => {
                                        setParticipantMenuStudentId(null);
                                        setCoachSideAndPush('b');
                                        assignIndependentBoardToStudent(s.id);
                                      }}
                                    >
                                      Beyaz olarak oynayın
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full text-left px-3 py-2 text-slate-200 hover:bg-indigo-500/15"
                                      onClick={() => {
                                        setParticipantMenuStudentId(null);
                                        setCoachSideAndPush('w');
                                        assignIndependentBoardToStudent(s.id);
                                      }}
                                    >
                                      Siyah olarak oynayın
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full text-left px-3 py-2 text-slate-200 hover:bg-indigo-500/15 border-b border-white/10"
                                      onClick={() => {
                                        setParticipantMenuStudentId(null);
                                        setCoachSideAndPush('both');
                                        assignIndependentBoardToStudent(s.id);
                                      }}
                                    >
                                      Her ikisi
                                    </button>
                                    {(sessionMedia.independentBoardStudentIds ?? []).some((kid) => idsEqual(kid, s.id)) ? (
                                      <>
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="w-full text-left px-3 py-2 text-teal-200 hover:bg-teal-950/30"
                                          onClick={() => {
                                            setParticipantMenuStudentId(null);
                                            syncTeacherBoardToStudent(s.id);
                                          }}
                                        >
                                          Tahtayı senkronize et
                                        </button>
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="w-full text-left px-3 py-2 text-slate-200 hover:bg-indigo-500/15 border-b border-white/10"
                                          onClick={() => {
                                            setParticipantMenuStudentId(null);
                                            revokeIndependentBoard(s.id);
                                          }}
                                        >
                                          Bağımsız tahtayı kaldır
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="w-full text-left px-3 py-2 text-teal-200 hover:bg-teal-950/30 border-b border-white/10"
                                        onClick={() => {
                                          setParticipantMenuStudentId(null);
                                          assignIndependentBoardToStudent(s.id);
                                        }}
                                      >
                                        Bağımsız tahta ver
                                      </button>
                                    )}
                                    {(sessionMedia.kickedStudentIds ?? []).some((kid) => idsEqual(kid, s.id)) ? (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="w-full text-left px-3 py-2 text-emerald-200 hover:bg-emerald-950/30 border-b border-white/10"
                                        onClick={() => readmitParticipant(s.id)}
                                      >
                                        Derse tekrar al
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="w-full text-left px-3 py-2 text-red-200/95 hover:bg-red-950/40 border-b border-white/10"
                                        onClick={() => kickParticipant(s.id)}
                                      >
                                        Dersten çıkarın
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full text-left px-3 py-2 text-slate-200 hover:bg-indigo-500/15"
                                      onClick={() => {
                                        setParticipantMenuStudentId(null);
                                        setSidebarTab('oyunlar');
                                      }}
                                    >
                                      Oyunları yükleyin
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full text-left px-3 py-2 text-slate-200 hover:bg-indigo-500/15"
                                      onClick={() => {
                                        setParticipantMenuStudentId(null);
                                        setSidebarTab('kesfet');
                                      }}
                                    >
                                      Keşfet
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <div className="text-slate-500">
                              <Users className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {sidebarTab === 'goruntu' && (
              <div className="flex flex-col flex-1 min-h-0 p-3 space-y-2 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Görüntü</p>
                  {vbSupported ? (
                    <button
                      type="button"
                      onClick={() => toggleCameraBackgroundBlur()}
                      disabled={localCamOff || vbApplying}
                      title={
                        localCamOff
                          ? 'Arka plan bulanıklaştırma için kamerayı açın'
                          : cameraBackgroundBlur
                            ? 'Arka plan bulanıklaştırmayı kapat'
                            : 'Arka planı bulanıklaştır'
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                        cameraBackgroundBlur
                          ? 'bg-indigo-600/90 border-indigo-400/40 text-white shadow-md shadow-indigo-500/20'
                          : 'bg-slate-800/60 border-white/10 text-slate-300 hover:border-indigo-500/30 hover:text-white'
                      } ${localCamOff || vbApplying ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {vbApplying ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Focus className="w-3.5 h-3.5" />
                      )}
                      {cameraBackgroundBlur ? 'Bulanık: Açık' : 'Arka planı bulanıklaştır'}
                    </button>
                  ) : null}
                </div>
                {activeVideoTile ? (
                  <>
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-white/10">
                      {activeVideoTile.stream ? (
                        <>
                          <LiveLessonVideoPlayer
                            stream={activeVideoTile.stream}
                            muted={activeVideoTile.isSelf}
                            camOff={activeVideoTile.camOff}
                            className="w-full h-full object-cover"
                          />
                          {activeVideoTile.camOff && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/55 pointer-events-none">
                              <VideoOff className="w-10 h-10 text-slate-500" />
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-900">
                          <VideoOff className="w-10 h-10 text-slate-600" />
                        </div>
                      )}
                      <div className="absolute bottom-1 left-1 right-1 flex justify-between text-[10px] text-white bg-black/60 rounded px-2 py-1">
                        <span className="truncate">{activeVideoTile.name}</span>
                        {activeVideoTile.isSelf && mediaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      </div>
                    </div>
                    {sideVideoTiles.length > 0 ? (
                      <div className="grid grid-cols-3 gap-1.5">
                        {sideVideoTiles.map((tile) => (
                          <button
                            key={tile.id}
                            type="button"
                            onClick={() => setFocusedVideoTileId(tile.id)}
                            className="relative aspect-video rounded-lg overflow-hidden bg-black border border-white/10"
                          >
                            {tile.stream ? (
                              <LiveLessonVideoPlayer
                                stream={tile.stream}
                                muted={tile.isSelf}
                                camOff={tile.camOff}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-slate-900">
                                <VideoOff className="w-6 h-6 text-slate-600" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-slate-600 text-center py-10">Henüz görüntü yok.</p>
                )}
              </div>
            )}

            {sidebarTab === 'sohbet' && (
              <div className="flex flex-col h-full min-h-0 bg-slate-800/35">
                    <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                      {visibleChatMessages.length === 0 ? (
                        <p className="text-xs text-slate-600 text-center py-6">Henüz mesaj yok.</p>
                      ) : (
                        visibleChatMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`text-[13px] rounded-xl px-3 py-2 border ${
                              msg.role === 'coach'
                                ? 'bg-indigo-500/10 border-indigo-500/25 text-slate-200'
                                : 'bg-violet-500/10 border-violet-500/25 text-slate-200 ml-4'
                            }`}
                          >
                            {msg.text}
                          </div>
                        ))
                      )}
                    </div>
                    <div className="p-2 border-t border-white/10 flex gap-2">
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                        placeholder="Mesaj…"
                        className="flex-1 min-w-0 rounded-xl bg-slate-900/80 border border-white/10 text-[13px] text-white px-3 py-2 outline-none placeholder:text-slate-500 focus:border-indigo-500/50"
                      />
                      <button
                        type="button"
                        onClick={() => sendChatMessage()}
                        disabled={chatSending || !chatInput.trim()}
                        className="p-3 rounded-xl premium-gradient text-white disabled:opacity-40 shadow-md shadow-indigo-500/20"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
              </div>
            )}

            {sidebarTab === 'oyunlar' && (
              <div className="p-3 flex flex-col gap-3 h-full min-h-0 overflow-y-auto custom-scrollbar">
                <div className="flex gap-1 p-1 rounded-xl bg-slate-800/50 border border-white/10">
                  {([
                    ['library' as const, 'Çalışmalar'],
                    ['pgn' as const, 'PGN'],
                    ['position' as const, 'FEN'],
                  ]).map(([k, lab]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setOyunlarSection(k)}
                      className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-colors ${
                        oyunlarSection === k ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {lab}
                    </button>
                  ))}
                </div>
                {oyunlarSection === 'library' && (
                  <div className="space-y-2">
                    {fetchingStudies ? (
                      <div className="flex items-center gap-3 text-slate-400 py-8 justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                      </div>
                    ) : studies.length === 0 ? (
                      <p className="text-xs text-slate-600 text-center py-8">Çalışma yok.</p>
                    ) : (
                      studies.map((sItem) => (
                        <div key={sItem.id} className="border border-white/10 rounded-xl bg-slate-800/40 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedStudyId(expandedStudyId === sItem.id ? null : sItem.id)}
                            className="w-full flex items-center justify-between px-3 py-2 text-left text-[13px] text-slate-300 hover:bg-indigo-500/10"
                          >
                            <span className="truncate pr-2">
                              <span className="mr-2">{sItem.emoji}</span>
                              {sItem.title}
                            </span>
                            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${expandedStudyId === sItem.id ? 'rotate-180' : ''}`} />
                          </button>
                          {expandedStudyId === sItem.id ? (
                            <div className="border-t border-white/10 px-2 py-1 space-y-1">
                              {sItem.chapters.map((ch) => (
                                <button
                                  key={ch.id}
                                  type="button"
                                  onClick={() => applyChapterContent(ch)}
                                  className="w-full text-left text-[12px] text-slate-400 hover:bg-indigo-500/10 hover:text-slate-200 rounded-lg px-2 py-2"
                                >
                                  {ch.title}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                )}
                {oyunlarSection === 'pgn' && (
                  <div className="space-y-2">
                    <textarea
                      value={pgnInput}
                      onChange={(e) => setPgnInput(e.target.value)}
                      placeholder="PGN veya FEN yapıştırın…"
                      className="w-full bg-slate-900/80 border border-white/10 rounded-xl p-3 text-[13px] text-slate-300 min-h-[8rem] focus:border-indigo-500/50 outline-none"
                    />
                    {pgnError ? <p className="text-xs text-red-400">{pgnError}</p> : null}
                    <button
                      type="button"
                      onClick={() => loadPgn()}
                      className="w-full py-2.5 rounded-xl premium-gradient text-white font-semibold text-[13px] shadow-md shadow-indigo-500/20"
                    >
                      Oyunu yükle
                    </button>
                  </div>
                )}
                {oyunlarSection === 'position' && (
                  <div className="space-y-2">
                    <textarea
                      value={fenInput}
                      onChange={(e) => setFenInput(e.target.value)}
                      placeholder="FEN…"
                      className="w-full bg-slate-900/80 border border-white/10 rounded-xl p-3 text-[13px] text-slate-300 min-h-[6rem] focus:border-indigo-500/50 outline-none"
                    />
                    {positionError ? <p className="text-xs text-red-400">{positionError}</p> : null}
                    <button
                      type="button"
                      onClick={() => applyFen()}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[13px] shadow-md shadow-indigo-500/20 transition-colors"
                    >
                      Konumu uygula
                    </button>
                  </div>
                )}
              </div>
            )}

            {sidebarTab === 'kesfet' && (
              <div className="p-3 flex flex-col gap-2 h-full min-h-0 overflow-y-auto custom-scrollbar">
                <input
                  value={puzzleSearch}
                  onChange={(e) => setPuzzleSearch(e.target.value)}
                  placeholder="Bulmaca ara…"
                  className="w-full bg-slate-900/80 border border-white/10 rounded-xl px-3 py-2 text-[13px] text-white focus:border-indigo-500/50 outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPoolSolution((v) => !v)}
                    className="flex-1 py-2 rounded-xl bg-slate-800/50 border border-white/10 text-[12px] text-slate-300 hover:bg-slate-800/70"
                  >
                    {showPoolSolution ? 'Çözümü gizle' : 'Çözüm'}
                  </button>
                  {!isStudentView ? (
                    <button
                      type="button"
                      onClick={() => toggleStudentPuzzleSolutionVisibility()}
                      className="flex-1 py-2 rounded-xl bg-slate-800/50 border border-white/10 text-[12px] text-slate-300 hover:bg-slate-800/70"
                    >
                      {sessionMedia.studentCanSeePuzzleSolution ? 'Öğrenci: açık' : 'Öğrenci: kapalı'}
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto custom-scrollbar">
                  {filteredPuzzles.length === 0 ? (
                    <p className="text-xs text-slate-600 text-center py-6">Bulmaca yok.</p>
                  ) : (
                    filteredPuzzles.map((pz) => (
                      <button
                        key={pz.id}
                        type="button"
                        onClick={() => applyPuzzleContent(pz)}
                        className={`text-left px-3 py-2 rounded-xl border text-[13px] transition-colors ${
                          selectedPoolPuzzleId === pz.id ? 'border-indigo-500/50 bg-indigo-500/15 text-white' : 'border-white/10 bg-slate-800/40 text-slate-300 hover:border-indigo-500/30'
                        }`}
                      >
                        <span className="font-semibold text-white block truncate">{pz.title}</span>
                        <span className="text-[11px] text-slate-500">{pz.difficulty}</span>
                      </button>
                    ))
                  )}
                </div>
                {!isStudentView && selectedPoolPuzzle ? (
                  <button
                    type="button"
                    onClick={() => void sendSelectedPuzzleToStudy()}
                    className="py-2 rounded-xl premium-gradient text-white text-[12px] font-semibold shadow-md shadow-indigo-500/20"
                  >
                    Çalışmaya aktar
                  </button>
                ) : null}
              </div>
            )}
          </div>

          <div className="row-start-4 border-t border-white/10 bg-slate-900/80 px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">{wallClock}</span>
            <div className="flex items-center justify-end gap-1.5">
              {isStudentView && isStudentAdmittedToClass ? (
                studentHasSpeakFloor ? null : studentHasRaisedHand ? (
                  <button
                    type="button"
                    onClick={() => cancelSpeakRequest()}
                    className="h-9 px-2.5 flex items-center justify-center gap-1 rounded-lg bg-amber-600/25 text-amber-200 border border-amber-500/30 text-[10px] font-bold uppercase"
                    title="Söz isteğini geri çek"
                  >
                    <Hand className="w-3.5 h-3.5" />
                    İptal
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => requestSpeakFloor()}
                    className="h-9 px-2.5 flex items-center justify-center gap-1 rounded-lg bg-indigo-600/25 text-indigo-200 border border-indigo-500/30 text-[10px] font-bold uppercase hover:bg-indigo-600/35"
                    title="Antrenörden söz hakkı iste"
                  >
                    <Hand className="w-3.5 h-3.5" />
                    Söz iste
                  </button>
                )
              ) : null}
              <button
                type="button"
                onClick={() => toggleLocalMic()}
                disabled={studentMicToggleDisabled}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                  studentMicToggleDisabled
                    ? 'bg-slate-800/60 text-slate-600 cursor-not-allowed'
                    : localMicMuted
                      ? 'bg-rose-900/50 text-rose-200'
                      : 'bg-slate-700/80 text-slate-100 hover:bg-slate-600/80'
                }`}
                title={
                  studentMicToggleDisabled
                    ? 'Mikrofon için antrenörden söz hakkı gerekir'
                    : localMicMuted
                      ? 'Mikrofonu aç'
                      : 'Mikrofonu kapat'
                }
              >
                {localMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => toggleLocalCam()}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${localCamOff ? 'bg-rose-900/50 text-rose-200' : 'bg-slate-700/80 text-slate-100 hover:bg-slate-600/80'}`}
                title={localCamOff ? 'Kamerayı aç' : 'Kamerayı kapat'}
              >
                {localCamOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              </button>
              {vbSupported ? (
                <button
                  type="button"
                  onClick={() => toggleCameraBackgroundBlur()}
                  disabled={localCamOff || vbApplying}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                    cameraBackgroundBlur
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                      : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600/80'
                  } ${localCamOff || vbApplying ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={
                    localCamOff
                      ? 'Arka plan bulanıklaştırma için kamerayı açın'
                      : cameraBackgroundBlur
                        ? 'Arka plan bulanıklaştırmayı kapat'
                        : 'Arka planı bulanıklaştır'
                  }
                >
                  {vbApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Focus className="w-4 h-4" />}
                </button>
              ) : null}
              {!isStudentView ? (
                <button
                  type="button"
                  onClick={() => setAnalysisMode(!analysisMode)}
                  title="Analiz modu"
                  className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${analysisMode ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25' : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600/80'}`}
                >
                  <Zap className="w-4 h-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSidebarTab('sohbet')}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${sidebarTab === 'sohbet' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25' : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600/80'}`}
                title="Sohbet"
              >
                <MessageCircle className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('katilimcilar')}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${sidebarTab === 'katilimcilar' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25' : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600/80'}`}
                title="Katılımcılar"
              >
                <Users className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isStudentView ? null : (
            <div className="row-start-5 border-t border-white/10 bg-slate-900/90 p-3 flex flex-col sm:flex-row gap-2 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
              <button
                type="button"
                onClick={() => void sendCurrentBoardToStudy()}
                className="flex-1 min-h-[46px] py-3 px-4 rounded-xl premium-gradient text-white font-bold text-[14px] shadow-lg shadow-indigo-500/25 hover:brightness-110 transition-all active:scale-[0.99]"
              >
                Çalışmaya gönder
              </button>
              <button
                type="button"
                onClick={() => void endActiveLesson()}
                className="sm:min-w-[100px] min-h-[46px] py-3 px-4 rounded-xl bg-rose-950/65 text-[#fecaca] font-semibold text-[14px] border border-rose-900/50 hover:bg-rose-900/75 transition-colors"
              >
                Dersi bitir
              </button>
            </div>
          )}
        </aside>

        {/* Mobil: tahta / panel geçişi */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-white/10 bg-slate-900/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
          aria-label="Canlı ders panelleri"
        >
          {([
            { id: 'board' as const, label: 'Tahta', Icon: MousePointer2 },
            { id: 'sidebar' as const, label: 'Panel', Icon: PanelRight },
          ]).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMobileClassroomPanel(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[52px] py-2 text-[10px] font-bold uppercase tracking-wide transition-colors active:scale-[0.98] ${
                mobileClassroomPanel === id ? 'text-indigo-300 bg-indigo-500/15' : 'text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── ÇALIŞMAYA KAYDET MODAL ───────────────────────────────────────── */}
      {showStudyExportModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            onClick={closeStudyExportModal}
          />
          <div
            className="relative w-full max-w-4xl max-h-[90vh] bg-[#1e293b]/95 backdrop-blur-2xl rounded-2xl border border-white/[0.08] shadow-[0_24px_80px_rgba(0,0,0,0.55)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 atmospheric-bg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 sm:px-8 pt-6 pb-4 flex items-start justify-between gap-4 border-b border-white/5 bg-black/20">
              <div className="min-w-0 flex items-start gap-4">
                <div className="hidden sm:flex w-11 h-11 shrink-0 rounded-2xl premium-gradient items-center justify-center shadow-lg shadow-indigo-500/25">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                    Bu çalışmayı nerede sürdürmek istersiniz?
                  </h3>
                  {studyExportPayload?.defaultChapterTitle ? (
                    <p className="text-[11px] text-slate-500 mt-1.5 truncate uppercase tracking-widest font-bold">
                      Kaynak · {studyExportPayload.defaultChapterTitle}
                    </p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={closeStudyExportModal}
                className="shrink-0 w-10 h-10 rounded-xl bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center border border-white/5"
                aria-label="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-6 custom-scrollbar">
              {fetchingStudies ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400 text-sm">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  Çalışmalar yükleniyor…
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => selectStudyForExport(STUDY_EXPORT_NEW_ID)}
                    className={`group w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all active:scale-[0.99] ${
                      studyExportStudyId === STUDY_EXPORT_NEW_ID
                        ? 'premium-gradient text-white shadow-xl shadow-indigo-500/30 ring-2 ring-indigo-400/50 ring-offset-2 ring-offset-[#1e293b]'
                        : 'bg-white/[0.04] border border-white/10 text-slate-300 hover:border-indigo-500/35 hover:bg-indigo-500/10 hover:text-white'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                        studyExportStudyId === STUDY_EXPORT_NEW_ID
                          ? 'bg-white/15'
                          : 'bg-indigo-500/15 text-indigo-300 group-hover:bg-indigo-500/25'
                      }`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </span>
                    Çalışma Oluştur
                  </button>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                    <div className="min-w-0 rounded-2xl border border-white/5 bg-black/20 p-4 flex flex-col">
                      <div className="flex items-center gap-2 mb-3 px-0.5 shrink-0">
                        <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
                        <h4 className="flex-1 min-w-0 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                          Çalışmalarım
                        </h4>
                        <span className="shrink-0 text-[10px] font-bold text-slate-600 tabular-nums">
                          {exportMyStudies.length}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto overflow-x-hidden custom-scrollbar pr-1">
                        {exportMyStudies.length === 0 ? (
                          <p className="text-xs text-slate-500 py-8 text-center border border-dashed border-white/10 rounded-xl">
                            Henüz çalışmanız yok
                          </p>
                        ) : (
                          exportMyStudies.map((s) => {
                            const selected = studyExportStudyId === s.id;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => selectStudyForExport(s.id)}
                                title={s.title}
                                className={`flex w-full shrink-0 items-center gap-2.5 min-h-[46px] px-3.5 py-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                                  selected
                                    ? 'border-indigo-500/50 bg-indigo-500/15 text-white shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/25'
                                    : 'border-white/5 bg-slate-800/40 text-slate-300 hover:border-indigo-500/25 hover:bg-indigo-500/5 hover:text-white'
                                }`}
                              >
                                <span className="text-base shrink-0 leading-none">{s.emoji || '♟️'}</span>
                                <span className="flex-1 min-w-0 truncate leading-snug">{s.title}</span>
                                <span className="shrink-0 text-[10px] text-slate-500 font-bold whitespace-nowrap pl-1">
                                  {s.chapters.length} bölüm
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 rounded-2xl border border-white/5 bg-black/20 p-4 flex flex-col">
                      <div className="flex items-center gap-2 mb-3 px-0.5 min-w-0 shrink-0">
                        <Users className="w-4 h-4 text-violet-400 shrink-0" />
                        <h4 className="flex-1 min-w-0 text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-widest leading-tight truncate">
                          Katkıda bulunduğum çalışmalar
                        </h4>
                        <span className="shrink-0 text-[10px] font-bold text-slate-600 tabular-nums">
                          {exportContributedStudies.length}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto overflow-x-hidden custom-scrollbar pr-1">
                        {exportContributedStudies.length === 0 ? (
                          <p className="text-xs text-slate-500 py-8 text-center border border-dashed border-white/10 rounded-xl">
                            Katkıda bulunduğunuz çalışma yok
                          </p>
                        ) : (
                          exportContributedStudies.map((s) => {
                            const selected = studyExportStudyId === s.id;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => selectStudyForExport(s.id)}
                                title={s.title}
                                className={`flex w-full shrink-0 items-center gap-2.5 min-h-[46px] px-3.5 py-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                                  selected
                                    ? 'border-violet-500/50 bg-violet-500/15 text-white shadow-lg shadow-violet-500/10 ring-1 ring-violet-500/25'
                                    : 'border-white/5 bg-slate-800/40 text-slate-300 hover:border-violet-500/25 hover:bg-violet-500/5 hover:text-white'
                                }`}
                              >
                                <span className="text-base shrink-0 leading-none">{s.emoji || '♟️'}</span>
                                <span className="flex-1 min-w-0 truncate leading-snug">{s.title}</span>
                                <span className="shrink-0 text-[10px] text-slate-500 font-bold whitespace-nowrap pl-1">
                                  {s.chapters.length} bölüm
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {studyExportStudyId ? (
                    <div className="rounded-2xl border border-white/8 bg-gradient-to-br from-slate-900/80 to-black/40 p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-4 rounded-full bg-indigo-500" />
                        <p className="text-[11px] font-black text-indigo-300 uppercase tracking-widest truncate">
                          {studyExportStudyId === STUDY_EXPORT_NEW_ID
                            ? 'Yeni çalışma · ilk bölüm'
                            : `Seçili · ${studyExportSelectedStudy?.title ?? 'Çalışma'}`}
                        </p>
                      </div>

                      {studyExportStudyId !== STUDY_EXPORT_NEW_ID && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setStudyExportMode('update')}
                            disabled={!studyExportSelectedStudy || studyExportSelectedStudy.chapters.length === 0}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all disabled:opacity-40 ${
                              studyExportMode === 'update'
                                ? 'border-indigo-500/50 bg-indigo-500/10 text-white'
                                : 'border-white/8 bg-black/25 text-slate-400 hover:border-white/15 hover:text-slate-200'
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                                studyExportMode === 'update' ? 'border-indigo-400' : 'border-slate-600'
                              }`}
                            >
                              {studyExportMode === 'update' ? (
                                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                              ) : null}
                            </span>
                            <span className="text-xs font-semibold">Mevcut bölümü güncelle</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setStudyExportMode('new')}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                              studyExportMode === 'new'
                                ? 'border-indigo-500/50 bg-indigo-500/10 text-white'
                                : 'border-white/8 bg-black/25 text-slate-400 hover:border-white/15 hover:text-slate-200'
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                                studyExportMode === 'new' ? 'border-indigo-400' : 'border-slate-600'
                              }`}
                            >
                              {studyExportMode === 'new' ? (
                                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                              ) : null}
                            </span>
                            <span className="text-xs font-semibold">Yeni bölüm ekle</span>
                          </button>
                        </div>
                      )}

                      {studyExportMode === 'update' &&
                        studyExportStudyId !== STUDY_EXPORT_NEW_ID &&
                        studyExportSelectedStudy &&
                        studyExportSelectedStudy.chapters.length > 0 && (
                          <select
                            value={studyExportChapterId}
                            onChange={(e) => setStudyExportChapterId(e.target.value)}
                            className="input-base rounded-xl py-2.5"
                          >
                            {studyExportSelectedStudy.chapters.map((ch) => (
                              <option key={ch.id} value={ch.id}>
                                {ch.title}
                              </option>
                            ))}
                          </select>
                        )}

                      {(studyExportStudyId === STUDY_EXPORT_NEW_ID || studyExportMode === 'new') && (
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                            Bölüm adı
                          </label>
                          <input
                            type="text"
                            value={studyExportChapterTitle}
                            onChange={(e) => setStudyExportChapterTitle(e.target.value)}
                            placeholder={studyExportPayload?.defaultChapterTitle ?? 'Canlı ders'}
                            className="input-base rounded-xl"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-2">
                      Kaydetmek için bir çalışma seçin veya yeni çalışma oluşturun.
                    </p>
                  )}

                  {studyExportMessage ? (
                    <p className="text-sm text-indigo-200 bg-indigo-500/10 border border-indigo-500/25 rounded-xl px-4 py-3">
                      {studyExportMessage}
                    </p>
                  ) : null}
                </>
              )}
            </div>

            <div className="px-6 sm:px-8 py-5 border-t border-white/5 bg-black/25 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeStudyExportModal}
                className="px-5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-sm font-bold hover:bg-white/10 hover:text-white transition-colors"
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={() => void confirmStudyExport()}
                disabled={
                  !studyExportStudyId ||
                  studyExportSaving ||
                  (studyExportStudyId !== STUDY_EXPORT_NEW_ID &&
                    studyExportMode === 'update' &&
                    !studyExportChapterId)
                }
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl premium-gradient text-white text-sm font-black uppercase tracking-wide shadow-lg shadow-indigo-500/25 disabled:opacity-40 disabled:grayscale transition-all active:scale-[0.98]"
              >
                {studyExportSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STUDENT ANALYSIS MODAL ────────────────────────────────────────── */}
      {selectedAnalysisStudentId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 lg:p-12 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-3xl" onClick={() => setSelectedAnalysisStudentId(null)} />
          <div className="relative w-full h-full max-w-7xl bg-[#0f172a]/80 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 shadow-3xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-500">
            <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0 bg-[#1e293b]/50">
               <div>
                  <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Öğrenci Analiz Dashboard</h2>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Canlı Ders Performans İzleme</p>
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
    </div>
  );
};

export default LiveLesson;
