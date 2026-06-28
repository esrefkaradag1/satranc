import React, { useState, useCallback, useRef, useEffect, useMemo, type CSSProperties } from 'react';
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
import { getLiveLessonReadClient, getServiceSupabase, isSupabaseBackend } from '../services/supabase';
import {
  mergeChatMessageLists,
  parseStoredChatMessages,
  persistLiveLessonChatMessage,
} from '../lib/liveLessonChatDb.mjs';
import {
  persistSessionMediaOp,
  persistSessionMediaReplace,
} from '../lib/liveLessonSessionMediaDb.mjs';
import { getRuntimeEnv } from '../runtimeEnv';
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
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION, pvLineToEvalBarPawns, type SquareMarkColor, squareMarksToStyles, COLOR_VALUES } from '../lib/chessBoardUi';
import { getTerminalEval, terminalEvalToBarPawns } from '../lib/analysisTerminal';
import { Study, StudyChapter } from '../lib/studyTypes';
import type { Puzzle as PuzzleType, Student } from '../types';
import { makeBuilderGame, applyMove, studyDisplayEmoji } from '../lib/studyUtils';
import {
  liveLessonFenAt,
  inferLiveLessonNavFromFen,
  sanitizeLiveVariations,
  type LiveVariationRef,
} from '../lib/liveLessonVariations';
import { loadStudiesAsync } from '../studyStorage';
import { ChessBoardFrame, ChessEvalBar } from './chess/ChessBoardFrame';
import { StudyMoveTree } from './study/StudyMoveTree';
import {
  EnginePvInteractiveMoves,
  EngineLinePreviewPortal,
  buildPvHoverHandler,
  fenAfterUciPlies,
  type PvHoverState,
  type LinePreviewState,
} from '../lib/enginePvPreview';
import { isBoardFlipShortcutKey, keyboardTargetAllowsBoardShortcut } from '../lib/boardFlipShortcut';
import { promoteVariationLines } from '../lib/studySync/moveList';
import { studentsInTrainingGroup } from '../lib/trainingGroupUtils';
import type { TrainingGroup } from '../types';
import Analysis from './Analysis';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const DEFAULT_ROOM_ID = 'default';
const SYNC_POLL_MS = 1000;
const COACH_SIDE_STORAGE_KEY = 'live_lesson_coach_side';
const COACH_BOARD_SCALE_STORAGE_KEY = 'live_lesson_coach_board_scale_pct';
const STUDENT_BOARD_SCALE_STORAGE_KEY = 'live_lesson_student_board_scale_pct';
const BOARD_SCALE_MIGRATED_KEY = 'live_lesson_board_scale_v2_migrated';
const BOARD_SCALE_MIN = 50;
const BOARD_SCALE_MAX = 125;
const BOARD_SCALE_DEFAULT = 100;
/** UI %100 = önceki %80 boyut (canlı ders sınıf düzeni) */
const BOARD_BASE_SCALE = 0.8;
const VIDEO_DOCK_WIDTH_STORAGE_KEY = 'live_lesson_video_dock_width_px';
const VIDEO_DOCK_WIDTH_MIN = 168;
const VIDEO_DOCK_WIDTH_MAX = 520;
const VIDEO_DOCK_WIDTH_DEFAULT = 232;

function clampVideoDockWidth(v: number): number {
  return Math.min(VIDEO_DOCK_WIDTH_MAX, Math.max(VIDEO_DOCK_WIDTH_MIN, Math.round(v)));
}

function readVideoDockWidthPx(): number {
  if (typeof window === 'undefined') return VIDEO_DOCK_WIDTH_DEFAULT;
  try {
    const raw = localStorage.getItem(VIDEO_DOCK_WIDTH_STORAGE_KEY);
    if (!raw) return VIDEO_DOCK_WIDTH_DEFAULT;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? clampVideoDockWidth(n) : VIDEO_DOCK_WIDTH_DEFAULT;
  } catch {
    return VIDEO_DOCK_WIDTH_DEFAULT;
  }
}

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

/** Eski kayıtlı % değerini yeni referansa çevir (eski %80 ≈ yeni %100) */
function migrateBoardScalePct(stored: number): number {
  return clampBoardScalePct(Math.round(stored * (100 / 80)));
}

function ensureBoardScaleMigrated(): void {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(BOARD_SCALE_MIGRATED_KEY)) return;
  try {
    for (const storageKey of [COACH_BOARD_SCALE_STORAGE_KEY, STUDENT_BOARD_SCALE_STORAGE_KEY]) {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n)) {
        localStorage.setItem(storageKey, String(migrateBoardScalePct(n)));
      }
    }
    localStorage.setItem(BOARD_SCALE_MIGRATED_KEY, '1');
  } catch {
    /* ignore */
  }
}

function readStoredBoardScale(storageKey: string): number {
  if (typeof window === 'undefined') return BOARD_SCALE_DEFAULT;
  try {
    ensureBoardScaleMigrated();
    const n = Number.parseInt(localStorage.getItem(storageKey) || '', 10);
    return clampBoardScalePct(Number.isFinite(n) ? n : BOARD_SCALE_DEFAULT);
  } catch {
    return BOARD_SCALE_DEFAULT;
  }
}

function parseStoredCoachBoardScalePct(): number {
  return readStoredBoardScale(COACH_BOARD_SCALE_STORAGE_KEY);
}

function parseStoredStudentBoardScalePct(): number {
  return readStoredBoardScale(STUDENT_BOARD_SCALE_STORAGE_KEY);
}

const AGORA_APP_ID = getRuntimeEnv('VITE_AGORA_APP_ID');
const AGORA_CHANNEL_PREFIX = getRuntimeEnv('VITE_AGORA_CHANNEL_PREFIX') || 'satranc';

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
  /** Özel sohbet: hedef öğrenci kimliği (koç↔öğrenci) */
  privateWithStudentId?: string;
};

/** Sohbet şeridinde kısa öğrenci etiketi */
function shortChatStudentName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    const p = parts[0];
    return p.length > 9 ? `${p.slice(0, 8)}…` : p;
  }
  if (parts.length === 2) {
    const first = parts[0].length > 7 ? `${parts[0].slice(0, 6)}.` : parts[0];
    return `${first} ${parts[1][0]?.toUpperCase() ?? ''}.`;
  }
  return parts
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('.')
    .slice(0, 11);
}

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
  /** Antrenörün gösterdiği motor devam satırı sayısı (1 veya 3) */
  engineMultiPvLines?: number;
  /** Söz isteyen öğrenciler (antrenör onayı bekliyor) */
  handRaisedStudentIds?: string[];
  /** Bağımsız tahta kullanan öğrenci kimlikleri */
  independentBoardStudentIds?: string[];
  /** Öğrenci başına bağımsız tahta anlık görüntüsü */
  studentBoards?: Record<string, LiveStudentBoardSnapshot>;
  /** Öğrenci başına taş oynatma izni (bağımsız tahta / canlı ders) */
  studentPlaySides?: Record<string, PlayBoardSide>;
  /** Bu derse davet edilen / yoklama listesindeki öğrenciler */
  rosterStudentIds?: string[];
  /** Antrenörün işaretlediği yoklama durumları */
  attendanceMarks?: Record<string, 'present' | 'absent' | 'late' | 'excused'>;
  /** Zoom benzeri: öğrenciler antrenörden söz hakkı almadan mikrofonu açabilir */
  studentsCanUnmuteSelf?: boolean;
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
  studentPlaySides: {},
  studentsCanUnmuteSelf: false,
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

type LiveVideoTile = {
  id: string;
  name: string;
  role: 'coach' | 'student';
  isSelf: boolean;
  stream: MediaStream | null;
  micMuted: boolean;
  camOff: boolean;
};

function ClassroomVideoTile({
  tile,
  muted,
  className = '',
  labelClassName = 'text-[9px]',
  showLabel = true,
  isSpeaking = false,
}: {
  tile: LiveVideoTile;
  muted: boolean;
  className?: string;
  labelClassName?: string;
  showLabel?: boolean;
  isSpeaking?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-black border ${
        isSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/80' : 'border-white/10'
      } ${className}`}
    >
      {tile.stream ? (
        <>
          <LiveLessonVideoPlayer
            stream={tile.stream}
            muted={muted}
            camOff={tile.camOff}
            className="w-full h-full object-cover"
          />
          {tile.camOff ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 pointer-events-none">
              <VideoOff className="w-6 h-6 text-slate-500" />
            </div>
          ) : null}
        </>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 gap-0.5">
          <span className="text-base font-bold text-slate-400">{tile.name.charAt(0).toUpperCase()}</span>
          <VideoOff className="w-3.5 h-3.5 text-slate-600" />
        </div>
      )}
      {showLabel ? (
        <div className={`absolute bottom-0 left-0 right-0 flex items-center justify-between gap-1 bg-black/65 px-1.5 py-0.5 text-white ${labelClassName}`}>
          <span className="truncate">{tile.name}</span>
          {tile.micMuted ? <MicOff className="w-3 h-3 shrink-0 text-rose-400" /> : null}
        </div>
      ) : null}
    </div>
  );
}

function StudentSpeakFloorBar({
  hasFloor,
  hasRaisedHand,
  canRequest,
  onRequest,
  onCancel,
  onRelease,
  compact = false,
}: {
  hasFloor: boolean;
  hasRaisedHand: boolean;
  canRequest: boolean;
  onRequest: () => void;
  onCancel: () => void;
  onRelease?: () => void;
  compact?: boolean;
}) {
  if (!canRequest && !hasFloor && !hasRaisedHand) return null;

  if (hasFloor) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5">
        <span
          className={`flex items-center gap-1.5 font-medium text-emerald-200 leading-snug ${
            compact ? 'text-[10px]' : 'text-[11px]'
          }`}
        >
          <Mic className="w-3.5 h-3.5 shrink-0 text-emerald-300" aria-hidden />
          Söz hakkınız var — mikrofonu açabilirsiniz
        </span>
        {onRelease ? (
          <button
            type="button"
            onClick={onRelease}
            className={`shrink-0 rounded-md border border-emerald-500/40 bg-emerald-600/20 px-2 py-1 font-bold uppercase tracking-wide text-emerald-100 hover:bg-emerald-600/35 ${
              compact ? 'text-[9px]' : 'text-[10px]'
            }`}
          >
            Sözü bırak
          </button>
        ) : null}
      </div>
    );
  }

  if (hasRaisedHand) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
        <span
          className={`flex items-center gap-1.5 font-medium text-amber-200 leading-snug ${
            compact ? 'text-[10px]' : 'text-[11px]'
          }`}
        >
          <Hand className="w-3.5 h-3.5 shrink-0 text-amber-300 animate-pulse" aria-hidden />
          Söz isteğiniz iletildi — onay bekleniyor
        </span>
        <button
          type="button"
          onClick={onCancel}
          className={`shrink-0 rounded-md border border-amber-500/40 bg-amber-600/20 px-2 py-1 font-bold uppercase tracking-wide text-amber-100 hover:bg-amber-600/35 ${
            compact ? 'text-[9px]' : 'text-[10px]'
          }`}
        >
          İptal
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onRequest}
      className={`flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-500/35 bg-indigo-600/20 font-bold uppercase tracking-wide text-indigo-100 hover:bg-indigo-600/30 ${
        compact ? 'px-2 py-1.5 text-[9px]' : 'px-3 py-2 text-[10px]'
      }`}
    >
      <Hand className="w-3.5 h-3.5 shrink-0" aria-hidden />
      Söz iste
    </button>
  );
}

function ClassroomVideoDockResizeHandle({
  onResizeStart,
}: {
  onResizeStart: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Kamera paneli genişliği"
      title="Sürükleyerek kamera alanını genişletin"
      onPointerDown={onResizeStart}
      className="hidden lg:flex shrink-0 w-4 cursor-col-resize items-center justify-center group touch-none select-none self-stretch py-4"
    >
      <div className="flex h-14 w-2 flex-col items-center justify-center gap-0.5 rounded-full border border-white/10 bg-slate-800/90 shadow-md group-hover:border-indigo-500/40 group-hover:bg-slate-700/90 group-active:border-indigo-500/60 group-active:bg-indigo-950/80 transition-colors">
        <span className="block h-1 w-1 rounded-full bg-slate-500 group-hover:bg-indigo-300" aria-hidden />
        <span className="block h-1 w-1 rounded-full bg-slate-500 group-hover:bg-indigo-300" aria-hidden />
        <span className="block h-1 w-1 rounded-full bg-slate-500 group-hover:bg-indigo-300" aria-hidden />
      </div>
    </div>
  );
}

function ClassroomAttendancePanel({
  rosterStudents,
  tiles,
  attendanceMarks,
  admittedIds,
  pendingIds,
  focusedId,
  onFocus,
  onAdmit,
  vbSupported,
  cameraBackgroundBlur,
  onToggleBlur,
  vbApplying,
  localCamOff,
  mediaLoading,
  variant = 'dock',
  floorStudentId = null,
  studentMicBlocked = {},
  studentCamForcedOff = {},
  speakingStudentIds,
  onToggleStudentMic,
  onToggleStudentCam,
  onOpenPrivateChat,
  handRaisedStudentIds = [],
  onGrantSpeakFloor,
  onReleaseSpeakFloor,
  sessionMedia,
  onSetStudentPlayPermission,
  dockWidthPx = VIDEO_DOCK_WIDTH_DEFAULT,
}: {
  rosterStudents: Student[];
  tiles: LiveVideoTile[];
  attendanceMarks?: Record<string, 'present' | 'absent' | 'late' | 'excused'>;
  admittedIds: string[];
  pendingIds: string[];
  focusedId: string | null;
  onFocus: (id: string) => void;
  onAdmit: (studentId: string) => void;
  vbSupported: boolean;
  cameraBackgroundBlur: boolean;
  onToggleBlur: () => void;
  vbApplying: boolean;
  localCamOff: boolean;
  mediaLoading: boolean;
  variant?: 'dock' | 'mobile';
  floorStudentId?: string | null;
  studentMicBlocked?: Record<string, boolean>;
  studentCamForcedOff?: Record<string, boolean>;
  speakingStudentIds?: Set<string>;
  onToggleStudentMic?: (studentId: string) => void;
  onToggleStudentCam?: (studentId: string) => void;
  onOpenPrivateChat?: (studentId: string) => void;
  handRaisedStudentIds?: string[];
  onGrantSpeakFloor?: (studentId: string) => void;
  onReleaseSpeakFloor?: (studentId: string) => void;
  sessionMedia?: SessionMediaState;
  onSetStudentPlayPermission?: (studentId: string, side: PlayBoardSide | null) => void;
  dockWidthPx?: number;
}) {
  const coachTile = tiles.find((t) => t.role === 'coach') ?? null;
  const tileByStudentId = useMemo(() => {
    const map = new Map<string, LiveVideoTile>();
    for (const t of tiles) {
      if (t.role === 'student') map.set(t.id.replace(/^student-/, ''), t);
    }
    return map;
  }, [tiles]);

  /** Derse katılan veya bekleme odasındaki öğrenciler — tüm yoklama listesi değil. */
  const joinedStudents = useMemo(() => {
    const list = rosterStudents.filter((s) => {
      const sid = normalizeStudentId(s.id);
      if (pendingIds.some((k) => idsEqual(k, sid))) return true;
      if (admittedIds.some((k) => idsEqual(k, sid))) return true;
      if (tileByStudentId.get(sid)?.stream) return true;
      return false;
    });
    return list.sort((a, b) => {
      const aSid = normalizeStudentId(a.id);
      const bSid = normalizeStudentId(b.id);
      const aPending = pendingIds.some((k) => idsEqual(k, aSid));
      const bPending = pendingIds.some((k) => idsEqual(k, bSid));
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;
      return a.name.localeCompare(b.name, 'tr');
    });
  }, [rosterStudents, pendingIds, admittedIds, tileByStudentId]);

  const studentRow = (student: Student, compact: boolean) => {
    const sid = normalizeStudentId(student.id);
    const tile = tileByStudentId.get(sid);
    const tileId = tile?.id ?? `student-${sid}`;
    const status = resolveLiveAttendanceStatus(sid, attendanceMarks, admittedIds, pendingIds, !!tile?.stream);
    const isPending = pendingIds.some((k) => idsEqual(k, sid));
    const hasFloor = idsEqual(floorStudentId, sid);
    const handRaised = handRaisedStudentIds.some((kid) => idsEqual(kid, sid));
    const micBlocked = studentMicBlocked[sid] ?? false;
    const audioOpen = sessionMedia
      ? canStudentTransmitAudio(sid, sessionMedia)
      : hasFloor && !micBlocked;
    const camForcedOff = !!(studentCamForcedOff[sid]);
    const isSpeaking = speakingStudentIds?.has(sid) ?? false;

    return (
      <div
        key={student.id}
        className={`rounded-lg border bg-slate-900/50 overflow-hidden ${
          isPending
            ? 'border-amber-500/50 ring-2 ring-amber-500/30'
            : handRaised && !hasFloor
              ? 'border-indigo-400/60 ring-2 ring-indigo-400/40'
              : isSpeaking
                ? 'border-emerald-400 ring-2 ring-emerald-400/70'
                : focusedId === tileId
                  ? 'border-indigo-500/60 ring-1 ring-indigo-500/30'
                  : 'border-white/10'
        }`}
      >
        <div className="relative w-full text-left">
          <div className={`relative ${compact ? 'aspect-[4/3]' : 'aspect-video'} bg-black`}>
            {tile ? (
              <ClassroomVideoTile
                tile={tile}
                muted={tile.isSelf}
                className="w-full h-full"
                showLabel={false}
                isSpeaking={isSpeaking}
              />
            ) : student.photoUrl ? (
              <img src={student.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 gap-1">
                <span className="text-lg font-bold text-slate-400">{student.name.charAt(0).toUpperCase()}</span>
                <VideoOff className="w-3.5 h-3.5 text-slate-600" />
              </div>
            )}
            {!isPending && !tile?.stream ? (
              <div className="absolute bottom-1 right-1 flex gap-0.5 pointer-events-none">
                <span className={`p-0.5 rounded ${camForcedOff ? 'bg-rose-900/80' : 'bg-black/55'}`}>
                  {camForcedOff ? <VideoOff className="w-2.5 h-2.5 text-rose-300" /> : <Video className="w-2.5 h-2.5 text-slate-400" />}
                </span>
                <span className={`p-0.5 rounded ${audioOpen ? 'bg-black/55' : 'bg-rose-900/80'}`}>
                  {audioOpen ? <Mic className="w-2.5 h-2.5 text-slate-300" /> : <MicOff className="w-2.5 h-2.5 text-rose-300" />}
                </span>
              </div>
            ) : null}
            <span className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-bold border ${liveAttendanceStatusClass(status)}`}>
              {LIVE_ATTENDANCE_STATUS_LABEL[status]}
            </span>
            {isPending ? (
              <button
                type="button"
                onClick={() => onAdmit(student.id)}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-emerald-950/75 hover:bg-emerald-900/85 transition-colors border-0 cursor-pointer"
                title={`${student.name} derse alınsın`}
              >
                <Check className="w-6 h-6 text-emerald-300" />
                <span className="text-[10px] font-bold text-emerald-100 uppercase tracking-wide">Derse al</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onFocus(tileId)}
                className="absolute inset-0 opacity-0"
                aria-label={`${student.name} görüntüsü`}
              />
            )}
          </div>
        </div>
        <div className="border-t border-white/5 bg-slate-950/80">
          <p className="text-[9px] font-semibold text-slate-200 truncate px-1.5 pt-1 leading-tight" title={student.name}>
            {student.name}
          </p>
          {!isPending ? (
            <>
              {onSetStudentPlayPermission && sessionMedia ? (
                <div className="px-1 pt-1">
                  <StudentPlaySideBar
                    playSide={getExplicitStudentPlaySide(student.id, sessionMedia)}
                    onSetPlaySide={(side) => onSetStudentPlayPermission(student.id, side)}
                    compact
                  />
                </div>
              ) : null}
              {hasFloor && onReleaseSpeakFloor ? (
                <button
                  type="button"
                  onClick={() => onReleaseSpeakFloor(student.id)}
                  className="mx-1 mt-1 flex w-[calc(100%-0.5rem)] items-center justify-center gap-1 rounded-md bg-rose-600/90 py-1 text-[8px] font-bold uppercase tracking-wide text-white hover:bg-rose-500"
                >
                  Sözü kes
                </button>
              ) : handRaised && !hasFloor && onGrantSpeakFloor ? (
                <button
                  type="button"
                  onClick={() => onGrantSpeakFloor(student.id)}
                  className="mx-1 mt-1 flex w-[calc(100%-0.5rem)] items-center justify-center gap-1 rounded-md bg-indigo-600 py-1 text-[8px] font-bold uppercase tracking-wide text-white hover:bg-indigo-500"
                >
                  <Hand className="w-3 h-3 shrink-0" aria-hidden />
                  Söz ver
                </button>
              ) : null}
              <div className="flex items-center justify-center gap-0.5 px-1 py-0.5">
                {onOpenPrivateChat ? (
                  <button
                    type="button"
                    onClick={() => onOpenPrivateChat(student.id)}
                    className="p-1 rounded-md bg-slate-800/90 text-slate-300 hover:bg-indigo-600 hover:text-white transition-colors"
                    title="Özel sohbet"
                    aria-label={`${student.name} ile sohbet`}
                  >
                    <MessageCircle className="w-3 h-3" />
                  </button>
                ) : null}
                {onToggleStudentCam ? (
                  <button
                    type="button"
                    onClick={() => onToggleStudentCam(student.id)}
                    className={`p-1 rounded-md transition-colors ${
                      camForcedOff
                        ? 'bg-rose-800/70 text-white hover:bg-rose-700'
                        : 'bg-slate-800/90 text-slate-300 hover:bg-indigo-600 hover:text-white'
                    }`}
                    title={camForcedOff ? 'Kamerayı açtır' : 'Kamerayı kapat'}
                    aria-label={camForcedOff ? 'Kamerayı aç' : 'Kamerayı kapat'}
                  >
                    {camForcedOff ? <VideoOff className="w-3 h-3" /> : <Video className="w-3 h-3" />}
                  </button>
                ) : null}
                {onToggleStudentMic ? (
                  <button
                    type="button"
                    onClick={() => onToggleStudentMic(student.id)}
                    className={`p-1 rounded-md transition-colors ${
                      audioOpen
                        ? 'bg-slate-800/90 text-slate-300 hover:bg-indigo-600 hover:text-white'
                        : 'bg-rose-800/70 text-white hover:bg-rose-700'
                    }`}
                    title={
                      sessionMedia?.studentsCanUnmuteSelf
                        ? audioOpen
                          ? 'Öğrenciyi sustur'
                          : 'Susturmayı kaldır'
                        : audioOpen
                          ? 'Sesi kapat'
                          : 'Sesi aç (söz hakkı)'
                    }
                    aria-label={
                      sessionMedia?.studentsCanUnmuteSelf
                        ? audioOpen
                          ? 'Öğrenciyi sustur'
                          : 'Susturmayı kaldır'
                        : audioOpen
                          ? 'Sesi kapat'
                          : 'Sesi aç'
                    }
                  >
                    {audioOpen ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="space-y-1 px-1.5 pb-1">
              <p className="text-[8px] text-amber-200/90 leading-snug">Bekleme odasında</p>
              {handRaised && onGrantSpeakFloor ? (
                <button
                  type="button"
                  onClick={() => onGrantSpeakFloor(student.id)}
                  className="flex w-full items-center justify-center gap-1 rounded-md bg-indigo-600 py-1 text-[8px] font-bold uppercase tracking-wide text-white hover:bg-indigo-500"
                >
                  <Hand className="w-3 h-3 shrink-0" aria-hidden />
                  Söz ver
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  };

  const blurButton = vbSupported ? (
    <button
      type="button"
      onClick={onToggleBlur}
      disabled={localCamOff || vbApplying}
      title={cameraBackgroundBlur ? 'Bulanıklığı kapat' : 'Arka planı bulanıklaştır'}
      className={`absolute top-1 right-1 z-10 p-1 rounded-md border transition-colors ${
        cameraBackgroundBlur
          ? 'bg-indigo-600/80 border-indigo-400/40 text-white'
          : 'border-white/10 bg-black/55 text-slate-300 hover:text-white'
      } ${localCamOff || vbApplying ? 'opacity-50' : ''}`}
    >
      {vbApplying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Focus className="w-3 h-3" />}
    </button>
  ) : null;

  if (variant === 'mobile') {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-2 space-y-2">
        {coachTile ? (
          <div className="relative aspect-video max-h-24 rounded-lg overflow-hidden ring-1 ring-white/10">
            <ClassroomVideoTile tile={coachTile} muted={coachTile.isSelf} className="w-full h-full" />
            {blurButton}
          </div>
        ) : null}
        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-0.5 min-h-[7.5rem]">
          {joinedStudents.length > 0 ? (
            joinedStudents.map((s) => (
              <div key={s.id} className="shrink-0 w-32">{studentRow(s, true)}</div>
            ))
          ) : (
            <p className="text-[10px] text-slate-500 py-6 px-2 text-center w-full">
              Henüz öğrenci katılmadı. Katıldıkça burada görünecek.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <aside
      className="hidden lg:flex shrink-0 flex-col gap-1.5 sticky top-2 self-start max-h-[min(72vh,560px)] min-h-0"
      style={{ width: dockWidthPx, minWidth: dockWidthPx, maxWidth: dockWidthPx }}
    >
      {coachTile ? (
        <div className="relative aspect-video w-full rounded-lg overflow-hidden ring-1 ring-white/10 shrink-0">
          <ClassroomVideoTile tile={coachTile} muted={coachTile.isSelf} className="w-full h-full rounded-lg" labelClassName="text-[8px]" />
          {blurButton}
          {coachTile.isSelf && mediaLoading ? (
            <div className="absolute top-1 left-1"><Loader2 className="w-3.5 h-3.5 animate-spin text-white" /></div>
          ) : null}
        </div>
      ) : null}
      {joinedStudents.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5 overflow-y-auto custom-scrollbar min-h-0 flex-1">
          {joinedStudents.map((s) => studentRow(s, true))}
        </div>
      ) : (
        <p className="text-[10px] text-slate-500 text-center py-6 px-2 border border-dashed border-white/10 rounded-lg">
          Henüz öğrenci katılmadı.
          <span className="block mt-1 text-slate-600">Öğrenciler derse girdikçe kareler burada belirir.</span>
        </p>
      )}
    </aside>
  );
}

/** Öğrenci: tahta yanında sürekli görüntü (antrenör + kendi + sınıf arkadaşları) */
function ClassroomStudentVideoPanel({
  tiles,
  focusedId,
  onFocus,
  vbSupported,
  cameraBackgroundBlur,
  onToggleBlur,
  vbApplying,
  localCamOff,
  mediaLoading,
  variant = 'dock',
  speakingStudentIds,
  coachIsSpeaking = false,
  studentSpeakFloor,
  dockWidthPx = VIDEO_DOCK_WIDTH_DEFAULT,
}: {
  tiles: LiveVideoTile[];
  focusedId: string | null;
  onFocus: (id: string) => void;
  vbSupported: boolean;
  cameraBackgroundBlur: boolean;
  onToggleBlur: () => void;
  vbApplying: boolean;
  localCamOff: boolean;
  mediaLoading: boolean;
  variant?: 'dock' | 'mobile';
  speakingStudentIds?: Set<string>;
  coachIsSpeaking?: boolean;
  studentSpeakFloor?: {
    hasFloor: boolean;
    hasRaisedHand: boolean;
    canRequest: boolean;
    onRequest: () => void;
    onCancel: () => void;
    onRelease: () => void;
  };
  dockWidthPx?: number;
}) {
  const coachTile = tiles.find((t) => t.role === 'coach') ?? null;
  const selfTile = tiles.find((t) => t.isSelf) ?? null;
  const activeTile = tiles.find((t) => t.id === focusedId) ?? coachTile ?? selfTile ?? tiles[0] ?? null;
  const sideTiles = tiles.filter((t) => activeTile && t.id !== activeTile.id);

  const blurBtn = vbSupported ? (
    <button
      type="button"
      onClick={onToggleBlur}
      disabled={localCamOff || vbApplying}
      title={cameraBackgroundBlur ? 'Bulanıklığı kapat' : 'Arka planı bulanıklaştır'}
      className={`p-1 rounded-md border transition-colors ${
        cameraBackgroundBlur
          ? 'bg-indigo-600/80 border-indigo-400/40 text-white'
          : 'border-white/10 text-slate-400 hover:text-white'
      } ${localCamOff || vbApplying ? 'opacity-50' : ''}`}
    >
      {vbApplying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Focus className="w-3 h-3" />}
    </button>
  ) : null;

  const tileIsSpeaking = (tile: LiveVideoTile) => {
    if (tile.role === 'coach') return coachIsSpeaking;
    const sid = normalizeStudentId(tile.id.replace(/^(student-|self-)/, ''));
    return sid ? (speakingStudentIds?.has(sid) ?? false) : false;
  };

  const tileButton = (tile: LiveVideoTile, className: string, labelClass = 'text-[8px]') => {
    const speaking = tileIsSpeaking(tile);
    return (
    <button
      key={tile.id}
      type="button"
      onClick={() => onFocus(tile.id)}
      className={`relative overflow-hidden text-left transition-all ${
        speaking
          ? 'ring-2 ring-emerald-400'
          : focusedId === tile.id
            ? 'ring-2 ring-indigo-500'
            : 'ring-1 ring-white/10 hover:ring-indigo-500/40'
      } ${className}`}
    >
      <ClassroomVideoTile
        tile={tile}
        muted={tile.isSelf}
        className="w-full h-full"
        labelClassName={labelClass}
        isSpeaking={speaking}
      />
      {tile.isSelf && mediaLoading ? (
        <div className="absolute top-1 right-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
        </div>
      ) : null}
    </button>
  );
  };

  const speakFloorBar = studentSpeakFloor ? (
    <StudentSpeakFloorBar
      hasFloor={studentSpeakFloor.hasFloor}
      hasRaisedHand={studentSpeakFloor.hasRaisedHand}
      canRequest={studentSpeakFloor.canRequest}
      onRequest={studentSpeakFloor.onRequest}
      onCancel={studentSpeakFloor.onCancel}
      onRelease={studentSpeakFloor.onRelease}
      compact
    />
  ) : null;

  if (variant === 'mobile') {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-2">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Canlı görüntü</span>
          {blurBtn}
        </div>
        {speakFloorBar ? <div className="mb-2">{speakFloorBar}</div> : null}
        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-0.5">
          {tiles.map((tile) => (
            <div key={tile.id} className="shrink-0 w-28 aspect-video rounded-lg overflow-hidden">
              {tileButton(tile, 'w-full h-full rounded-lg')}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <aside
      className="hidden lg:flex shrink-0 flex-col gap-1.5 sticky top-2 self-start max-h-[min(72vh,560px)] min-h-0"
      style={{ width: dockWidthPx, minWidth: dockWidthPx, maxWidth: dockWidthPx }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Canlı görüntü</span>
        {blurBtn}
      </div>

      {activeTile ? tileButton(activeTile, 'aspect-video w-full rounded-xl', 'text-[9px]') : (
        <div className="aspect-video rounded-xl border border-dashed border-white/10 flex items-center justify-center text-[10px] text-slate-500">
          Görüntü bekleniyor…
        </div>
      )}

      {speakFloorBar ? <div className="shrink-0">{speakFloorBar}</div> : null}

      {sideTiles.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5 overflow-y-auto custom-scrollbar min-h-0 flex-1">
          {sideTiles.map((tile) => tileButton(tile, 'aspect-[4/3] rounded-lg'))}
        </div>
      ) : null}
    </aside>
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

/** Koç↔öğrenci özel sohbet kanalı */
function isPrivateChatMessage(msg: LiveChatMessage, peerStudentId: string): boolean {
  return !!msg.privateWithStudentId && idsEqual(msg.privateWithStudentId, peerStudentId);
}

/** Genel sınıf sohbeti (özel etiketi olmayan) */
function isGeneralChatMessage(msg: LiveChatMessage, studentId: string, isStudentView: boolean): boolean {
  if (msg.privateWithStudentId) return false;
  if (msg.role === 'coach') return true;
  if (msg.role === 'student') {
    return isStudentView ? idsEqual(msg.studentId, studentId) : true;
  }
  return false;
}

type ChatReadCursors = {
  general: string | null;
  private: Record<string, string | null>;
};

const EMPTY_CHAT_READ: ChatReadCursors = { general: null, private: {} };

function activeChatChannelKey(args: {
  isStudentView: boolean;
  chatPrivateStudentId: string | null;
  studentChatPrivate: boolean;
  studentIdProp?: string;
}): 'general' | `private:${string}` {
  if (args.isStudentView) {
    const sid = normalizeStudentId(args.studentIdProp);
    return args.studentChatPrivate && sid ? `private:${sid}` : 'general';
  }
  if (args.chatPrivateStudentId) {
    const pid = normalizeStudentId(args.chatPrivateStudentId);
    if (pid) return `private:${pid}`;
  }
  return 'general';
}

function readCursorForChannel(cursors: ChatReadCursors, channel: string): string | null {
  if (channel === 'general') return cursors.general;
  if (channel.startsWith('private:')) {
    const sid = channel.slice('private:'.length);
    return cursors.private[sid] ?? null;
  }
  return null;
}

function countUnreadChatMessages(
  messages: LiveChatMessage[],
  readAt: string | null,
  predicate: (msg: LiveChatMessage) => boolean,
): number {
  return messages.filter((m) => predicate(m) && (!readAt || m.at > readAt)).length;
}

function ChatUnreadBadge({
  count,
  className = '',
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  const label = count > 9 ? '9+' : String(count);
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-emerald-500 text-[9px] font-bold text-white ring-2 ring-slate-900 ${className}`}
      aria-label={`${count} okunmamış mesaj`}
    >
      {label}
    </span>
  );
}

/** Agora kanal uid — öğrenci join'de studentId'nin ilk 32 karakteri */
function agoraUidForStudent(studentId: string): string {
  const sid = normalizeStudentId(studentId);
  return sid ? sid.slice(0, 32) : '';
}

/** Öğrenci görünümü: yalnızca derse katılan veya bekleme odasındaki öğrenciler */
function isStudentJoinedLiveClass(
  studentId: string,
  sessionMedia: SessionMediaState,
  remoteStreamsByUid: Record<string, MediaStream | null>,
): boolean {
  const sid = normalizeStudentId(studentId);
  if (!sid) return false;
  const admitted = sessionMedia.admittedStudentIds ?? [];
  const pending = sessionMedia.pendingStudentIds ?? [];
  if (admitted.some((k) => idsEqual(k, sid))) return true;
  if (pending.some((k) => idsEqual(k, sid))) return true;
  const agoraUid = agoraUidForStudent(studentId);
  if (agoraUid && remoteStreamsByUid[agoraUid]) return true;
  return false;
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
    studentPlaySides: parseStudentPlaySides(o.studentPlaySides),
    studentAnalysisVisible: !!o.studentAnalysisVisible,
    studentEvalBarVisible:
      o.studentEvalBarVisible !== undefined
        ? !!o.studentEvalBarVisible
        : !!o.studentAnalysisVisible,
    engineMultiPvLines:
      o.engineMultiPvLines === 1 || o.engineMultiPvLines === 3 ? o.engineMultiPvLines : undefined,
    rosterStudentIds: parseIdList('rosterStudentIds'),
    attendanceMarks: parseAttendanceMarks(o.attendanceMarks),
    studentsCanUnmuteSelf: !!o.studentsCanUnmuteSelf,
  };
}

function isStudentClassroomAnalysisEnabled(sm: SessionMediaState): boolean {
  return !!sm.studentAnalysisVisible;
}

function isStudentBoardEvalBarEnabled(sm: SessionMediaState): boolean {
  return !!sm.studentEvalBarVisible;
}

function resolveEngineMultiPvLines(sm: SessionMediaState, coachLinesVisible?: boolean): number {
  const raw = sm.engineMultiPvLines;
  if (raw === 1 || raw === 3) return raw;
  if (coachLinesVisible != null) return coachLinesVisible ? 3 : 1;
  return 3;
}

function parseAttendanceMarks(raw: unknown): Record<string, 'present' | 'absent' | 'late' | 'excused'> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const allowed = new Set(['present', 'absent', 'late', 'excused']);
  const out: Record<string, 'present' | 'absent' | 'late' | 'excused'> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const sid = normalizeStudentId(k);
    if (!sid || typeof v !== 'string' || !allowed.has(v)) continue;
    out[sid] = v as 'present' | 'absent' | 'late' | 'excused';
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

type LiveAttendanceUiStatus = 'present' | 'absent' | 'late' | 'excused' | 'waiting' | 'unset';

function resolveLiveAttendanceStatus(
  studentId: string,
  marks: Record<string, 'present' | 'absent' | 'late' | 'excused'> | undefined,
  admittedIds: string[],
  pendingIds: string[],
  hasVideoStream: boolean,
): LiveAttendanceUiStatus {
  const sid = normalizeStudentId(studentId);
  if (marks?.[sid]) return marks[sid];
  const joinedLesson =
    admittedIds.some((k) => idsEqual(k, sid)) ||
    pendingIds.some((k) => idsEqual(k, sid)) ||
    hasVideoStream;
  if (joinedLesson) return 'present';
  return 'unset';
}

const LIVE_ATTENDANCE_STATUS_LABEL: Record<LiveAttendanceUiStatus, string> = {
  present: 'Geldi',
  absent: 'Yok',
  late: 'Geç',
  excused: 'İzinli',
  waiting: 'Bekliyor',
  unset: '—',
};

function liveAttendanceStatusClass(status: LiveAttendanceUiStatus): string {
  switch (status) {
    case 'present':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'absent':
      return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    case 'late':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    case 'excused':
      return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
    case 'waiting':
      return 'bg-amber-500/15 text-amber-200 border-amber-500/25 animate-pulse';
    default:
      return 'bg-slate-700/50 text-slate-400 border-white/10';
  }
}

function LiveAttendanceMarkButtons({
  studentId,
  attendanceMarks,
  resolvedStatus,
  onSetMark,
  compact = false,
}: {
  studentId: string;
  attendanceMarks?: Record<string, 'present' | 'absent' | 'late' | 'excused'>;
  resolvedStatus: LiveAttendanceUiStatus;
  onSetMark: (studentId: string, status: 'present' | 'absent' | 'late' | 'excused') => void;
  compact?: boolean;
}) {
  const sid = normalizeStudentId(studentId);
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {(['present', 'absent', 'late', 'excused'] as const).map((mark) => (
        <button
          key={mark}
          type="button"
          title={LIVE_ATTENDANCE_STATUS_LABEL[mark]}
          onClick={() => onSetMark(studentId, mark)}
          className={`${compact ? 'p-1 rounded-md text-[10px]' : 'p-0.5 rounded text-[8px]'} font-bold transition-colors ${
            attendanceMarks?.[sid] === mark || (resolvedStatus === mark && !attendanceMarks?.[sid])
              ? mark === 'present'
                ? 'bg-emerald-600 text-white'
                : mark === 'absent'
                  ? 'bg-rose-600 text-white'
                  : mark === 'late'
                    ? 'bg-amber-600 text-white'
                    : 'bg-sky-600 text-white'
              : 'bg-slate-800/80 text-slate-500 hover:bg-slate-700 hover:text-white'
          }`}
        >
          {mark === 'present' ? '✓' : mark === 'absent' ? '✗' : mark === 'late' ? '⏱' : 'İ'}
        </button>
      ))}
    </div>
  );
}

function LiveAttendanceSummaryBar({
  rosterStudents,
  tiles,
  attendanceMarks,
  admittedIds,
  pendingIds,
  onMarkAll,
  onSave,
  onAdmitAll,
  saving,
  saveMessage,
}: {
  rosterStudents: Student[];
  tiles: LiveVideoTile[];
  attendanceMarks?: Record<string, 'present' | 'absent' | 'late' | 'excused'>;
  admittedIds: string[];
  pendingIds: string[];
  onMarkAll: (status: 'present' | 'absent' | 'late' | 'excused') => void;
  onSave: () => void;
  onAdmitAll?: () => void;
  saving: boolean;
  saveMessage: string | null;
}) {
  const tileByStudentId = useMemo(() => {
    const map = new Map<string, LiveVideoTile>();
    for (const t of tiles) {
      if (t.role === 'student') map.set(t.id.replace(/^student-/, ''), t);
    }
    return map;
  }, [tiles]);

  const joinedCount = useMemo(() => {
    let count = 0;
    for (const s of rosterStudents) {
      const sid = normalizeStudentId(s.id);
      if (pendingIds.some((k) => idsEqual(k, sid))) count += 1;
      else if (admittedIds.some((k) => idsEqual(k, sid))) count += 1;
      else if (tileByStudentId.get(sid)?.stream) count += 1;
    }
    return count;
  }, [rosterStudents, pendingIds, admittedIds, tileByStudentId]);

  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    for (const s of rosterStudents) {
      const sid = normalizeStudentId(s.id);
      const tile = tileByStudentId.get(sid);
      const status = resolveLiveAttendanceStatus(
        sid,
        attendanceMarks,
        admittedIds,
        pendingIds,
        !!tile?.stream,
      );
      if (status === 'present' || status === 'late' || status === 'excused') present += 1;
      else if (status === 'absent') absent += 1;
    }
    const waiting = pendingIds.length;
    return { present, absent, waiting, total: rosterStudents.length };
  }, [rosterStudents, attendanceMarks, admittedIds, pendingIds, tileByStudentId]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Canlı yoklama
          <span className="ml-1 normal-case font-semibold text-slate-400">
            · {summary.present}/{summary.total}
            {joinedCount > 0 ? (
              <span className="text-indigo-400/90"> · {joinedCount} bağlı</span>
            ) : null}
          </span>
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || rosterStudents.length === 0}
          className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[10px] font-bold shrink-0"
        >
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
          {summary.present} geldi
        </span>
        <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/25">
          {summary.absent} yok
        </span>
        {summary.waiting > 0 ? (
          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-200 border border-amber-500/25">
            {summary.waiting} bekliyor
          </span>
        ) : null}
      </div>
      {summary.waiting > 0 && onAdmitAll ? (
        <button
          type="button"
          onClick={onAdmitAll}
          className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-lg shadow-emerald-900/30"
        >
          Bekleyen {summary.waiting} öğrenciyi derse al
        </button>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onMarkAll('present')}
          className="px-2.5 py-1 rounded-md bg-emerald-600/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 hover:bg-emerald-600/30"
        >
          Tümü geldi
        </button>
        <button
          type="button"
          onClick={() => onMarkAll('absent')}
          className="px-2.5 py-1 rounded-md bg-rose-600/20 text-rose-300 text-[10px] font-bold border border-rose-500/30 hover:bg-rose-600/30"
        >
          Tümü yok
        </button>
      </div>
      {saveMessage ? <p className="text-[11px] text-indigo-300">{saveMessage}</p> : null}
    </div>
  );
}

/** Antrenörün tahtadaki rolü; öğrenci tarafı ters renk veya both (işbirlik) */
export type CollaborativeBoardSide = 'w' | 'b' | 'both';

export type PlayBoardSide = 'w' | 'b' | 'both';

function parseStudentPlaySides(raw: unknown): Record<string, PlayBoardSide> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, PlayBoardSide> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const id = normalizeStudentId(key);
    if (!id) continue;
    if (val === 'w' || val === 'b' || val === 'both') out[id] = val;
  }
  return out;
}

/** Öğrencinin yalnızca antrenörün atadığı taş oynatma izni (koç tarafından türetilmez). */
function getExplicitStudentPlaySide(
  studentId: string | null | undefined,
  sessionMedia: SessionMediaState,
): PlayBoardSide | null {
  const sid = normalizeStudentId(studentId);
  if (!sid) return null;
  const side = sessionMedia.studentPlaySides?.[sid];
  return side === 'w' || side === 'b' || side === 'both' ? side : null;
}

function resolveStudentPlaySide(
  studentId: string | null | undefined,
  sessionMedia: SessionMediaState,
): PlayBoardSide | null {
  return getExplicitStudentPlaySide(studentId, sessionMedia);
}

function isStudentMicBlockedByCoach(
  studentId: string | null | undefined,
  sessionMedia: SessionMediaState,
): boolean {
  const sid = normalizeStudentId(studentId);
  if (!sid) return true;
  return sessionMedia.studentMicBlocked[sid] === true;
}

/** Öğrencinin mikrofon yayınına izin var mı (antrenör susturmadıysa + söz hakkı veya serbest açma). */
function canStudentTransmitAudio(
  studentId: string | null | undefined,
  sessionMedia: SessionMediaState,
): boolean {
  const sid = normalizeStudentId(studentId);
  if (!sid) return false;
  if (isStudentMicBlockedByCoach(sid, sessionMedia)) return false;
  if (sessionMedia.studentsCanUnmuteSelf) return true;
  return idsEqual(sessionMedia.floorStudentId, sid);
}

function collectLiveStudentMediaIds(
  sessionMedia: SessionMediaState,
  rosterStudents: Student[],
): string[] {
  const ids = new Set<string>();
  for (const raw of [
    ...(sessionMedia.admittedStudentIds ?? []),
    ...(sessionMedia.pendingStudentIds ?? []),
    ...(sessionMedia.rosterStudentIds ?? []),
  ]) {
    const sid = normalizeStudentId(raw);
    if (sid) ids.add(sid);
  }
  for (const s of rosterStudents) {
    const sid = normalizeStudentId(s.id);
    if (sid) ids.add(sid);
  }
  return [...ids];
}

/** session_media yamalarını ref üzerinden birleştir — eski closure ile susturma geri yazılmasın */
function applySessionMediaPatch(
  prev: SessionMediaState,
  patch: Partial<SessionMediaState>,
): SessionMediaState {
  return {
    ...prev,
    ...patch,
    studentMicBlocked:
      patch.studentMicBlocked !== undefined ? patch.studentMicBlocked : prev.studentMicBlocked,
    studentCamForcedOff:
      patch.studentCamForcedOff !== undefined
        ? { ...prev.studentCamForcedOff, ...patch.studentCamForcedOff }
        : prev.studentCamForcedOff,
    studentPlaySides:
      patch.studentPlaySides !== undefined
        ? { ...prev.studentPlaySides, ...patch.studentPlaySides }
        : prev.studentPlaySides,
    studentBoards:
      patch.studentBoards !== undefined
        ? { ...prev.studentBoards, ...patch.studentBoards }
        : prev.studentBoards,
    attendanceMarks:
      patch.attendanceMarks !== undefined
        ? { ...prev.attendanceMarks, ...patch.attendanceMarks }
        : prev.attendanceMarks,
    handRaisedStudentIds:
      patch.handRaisedStudentIds !== undefined
        ? patch.handRaisedStudentIds
        : prev.handRaisedStudentIds,
  };
}

function parseCoachSideFromRow(raw: unknown): CollaborativeBoardSide | null | undefined {
  if (raw === 'w' || raw === 'b' || raw === 'both') return raw;
  if (raw == null || raw === '') return null;
  return undefined;
}

function formatCoachSeatLabel(side: CollaborativeBoardSide | null): string {
  if (side === 'w') return 'Beyaz';
  if (side === 'b') return 'Siyah';
  if (side === 'both') return 'Her iki taraf';
  return 'Serbest';
}

function StudentPlaySideBar({
  playSide,
  onSetPlaySide,
  compact = false,
}: {
  playSide: PlayBoardSide | null;
  onSetPlaySide: (side: PlayBoardSide | null) => void;
  compact?: boolean;
}) {
  const options: Array<{ side: PlayBoardSide | null; label: string; title: string }> = [
    { side: 'w', label: compact ? 'B' : 'Beyaz', title: 'Beyaz oynasın' },
    { side: 'b', label: compact ? 'S' : 'Siyah', title: 'Siyah oynasın' },
    { side: 'both', label: compact ? 'İk' : 'İkisi', title: 'Her iki renk oynasın' },
    { side: null, label: compact ? '✕' : 'Kapalı', title: 'Oynamayı kapat' },
  ];
  return (
    <div
      className={`rounded-md border border-white/10 bg-slate-950/70 ${
        compact ? 'p-0.5' : 'p-1.5'
      }`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {!compact ? (
        <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500 mb-1 px-0.5">
          Öğrenci taşı
        </p>
      ) : null}
      <div className="grid grid-cols-4 gap-0.5">
        {options.map(({ side, label, title }) => {
          const active = playSide === side;
          const isOff = side === null;
          return (
            <button
              key={title}
              type="button"
              title={title}
              aria-pressed={active}
              onClick={() => onSetPlaySide(side)}
              className={`rounded font-bold uppercase tracking-wide transition-colors ${
                compact ? 'px-0.5 py-1 text-[8px]' : 'px-1.5 py-1 text-[9px]'
              } ${
                active
                  ? isOff
                    ? 'bg-slate-700 text-slate-300 ring-1 ring-white/20'
                    : side === 'w'
                      ? 'bg-slate-100 text-slate-900 ring-1 ring-white/30'
                      : side === 'b'
                        ? 'bg-slate-900 text-white ring-1 ring-indigo-400/40'
                        : 'bg-indigo-600 text-white ring-1 ring-indigo-400/50'
                  : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CoachPlaySideBar({
  coachSide,
  onSetCoachSide,
  compact = false,
}: {
  coachSide: CollaborativeBoardSide | null;
  onSetCoachSide: (side: CollaborativeBoardSide | null) => void;
  compact?: boolean;
}) {
  const options: Array<{ side: CollaborativeBoardSide | null; label: string }> = [
    { side: 'w', label: 'Beyaz' },
    { side: 'b', label: 'Siyah' },
    { side: 'both', label: 'Her ikisi' },
    { side: null, label: 'Serbest' },
  ];
  return (
    <div
      className={`rounded-lg border border-white/10 bg-slate-900/55 ${
        compact ? 'p-1.5' : 'p-2'
      }`}
    >
      <p
        className={`font-bold uppercase tracking-wider text-slate-500 mb-1.5 ${
          compact ? 'text-[8px]' : 'text-[9px]'
        }`}
      >
        Antrenör taşı
      </p>
      <div className="flex flex-wrap gap-1">
        {options.map(({ side, label }) => {
          const active = coachSide === side;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSetCoachSide(side)}
              className={`rounded-md border px-2 py-1 font-bold uppercase tracking-wide transition-colors ${
                compact ? 'text-[8px]' : 'text-[9px]'
              } ${
                active
                  ? 'border-indigo-400/50 bg-indigo-600/35 text-white'
                  : 'border-white/10 bg-slate-800/60 text-slate-300 hover:border-indigo-500/30 hover:text-white'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
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

/** Motor / katılım anahtarı: thumb pist içinde kalır */
function ClassroomToggle({
  on,
  onToggle,
  id,
  compact = false,
}: {
  on: boolean;
  onToggle: () => void;
  id?: string;
  compact?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`relative shrink-0 overflow-hidden rounded-full border border-white/10 transition-colors duration-200 hover:brightness-[1.06] active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/55 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
        compact ? 'h-5 w-9' : 'h-[26px] w-[46px]'
      } ${on ? 'bg-indigo-500' : 'bg-slate-700'}`}
    >
      <span className="sr-only">{on ? 'Açık' : 'Kapalı'}</span>
      <span
        aria-hidden
        className={`pointer-events-none absolute left-[2px] top-1/2 rounded-full bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_1px_2px_rgba(0,0,0,0.28)] ring-1 ring-black/12 transition-[transform] duration-200 ease-[cubic-bezier(0.2,0.85,0.25,1)] motion-reduce:transition-none ${
          compact ? 'size-3.5' : 'size-[18px]'
        }`}
        style={{
          transform: on
            ? `translate3d(${compact ? '16px' : '22px'}, -50%, 0)`
            : 'translate3d(0, -50%, 0)',
        }}
      />
    </button>
  );
}

const LiveLesson: React.FC<LiveLessonProps> = ({ onBack, isStudentView, roomId: roomIdProp, studentId: studentIdProp }) => {
  const { scopedStudents: students, puzzles, refreshStudentsFromSupabase, addAttendanceRecord, trainingGroups, showToast, confirmDialog, alertDialog } = useApp();
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
  const baseFenRef = useRef(baseFen);
  baseFenRef.current = baseFen;
  const [hoverFen, setHoverFen] = useState<string | null>(null);
  const [enginePvHovered, setEnginePvHovered] = useState<PvHoverState>(null);
  const [enginePvLinePreview, setEnginePvLinePreview] = useState<LinePreviewState>(null);
  const boardWheelNavTsRef = useRef(0);
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
  const canStudentRequestSpeak = useMemo(() => {
    if (!isStudentView || !sidSelfNormEarly || isStudentKickedFromRoom) return false;
    if (!isSupabaseBackend()) return true;
    const admitted = (sessionMedia.admittedStudentIds ?? []).some((kid) => idsEqual(kid, sidSelfNormEarly));
    const pending = (sessionMedia.pendingStudentIds ?? []).some((kid) => idsEqual(kid, sidSelfNormEarly));
    return admitted || pending;
  }, [
    isStudentView,
    sidSelfNormEarly,
    isStudentKickedFromRoom,
    sessionMedia.admittedStudentIds,
    sessionMedia.pendingStudentIds,
  ]);
  const [chatMessages, setChatMessages] = useState<LiveChatMessage[]>([]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatSendError, setChatSendError] = useState<string | null>(null);
  const chatMessagesRef = useRef<LiveChatMessage[]>([]);
  const pendingChatIdsRef = useRef<Set<string>>(new Set());
  const pendingHandRaiseRef = useRef(false);
  /** Koç: özel sohbet hedefi; null = genel sohbet */
  const [chatPrivateStudentId, setChatPrivateStudentId] = useState<string | null>(null);
  /** Öğrenci: antrenörle özel sohbet modu */
  const [studentChatPrivate, setStudentChatPrivate] = useState(false);
  const [speakingUids, setSpeakingUids] = useState<Set<string>>(() => new Set());
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
  /** Davet kutusu kullanıcı adı (arka uç uyarı/link odaklı) */
  const [inviteUsernameInput, setInviteUsernameInput] = useState('');
  const [inviteToast, setInviteToast] = useState<string | null>(null);
  const [managePanelOpen, setManagePanelOpen] = useState(false);
  const [participantMenuStudentId, setParticipantMenuStudentId] = useState<string | null>(null);
  /** Antrenör odayı kapattığında öğrenciyi dersten çıkar */
  const [lessonRoomClosed, setLessonRoomClosed] = useState(false);
  const lessonExitTriggeredRef = useRef(false);
  /** Sohbeti Chess.com tarzı altta küçük panelde göster */
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  /** Kanal bazlı son okunan mesaj zaman damgası (at) */
  const [chatReadCursors, setChatReadCursors] = useState<ChatReadCursors>(EMPTY_CHAT_READ);
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
  /** Öğrenci tahta ölçeği % — localStorage `live_lesson_student_board_scale_pct` */
  const [studentBoardScalePct, setStudentBoardScalePct] = useState(parseStoredStudentBoardScalePct);
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
  const [boardDrawRevision, setBoardDrawRevision] = useState(0);
  const [videoDockWidthPx, setVideoDockWidthPx] = useState(readVideoDockWidthPx);
  const videoDockWidthRef = useRef(videoDockWidthPx);
  const boardVideoRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    videoDockWidthRef.current = videoDockWidthPx;
  }, [videoDockWidthPx]);

  const handleVideoDockResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handleEl = e.currentTarget;
    const startX = e.clientX;
    const startW = videoDockWidthRef.current;

    const onMove = (ev: PointerEvent) => {
      const rowW = boardVideoRowRef.current?.clientWidth ?? window.innerWidth;
      const maxW = Math.min(VIDEO_DOCK_WIDTH_MAX, Math.floor(rowW * 0.52));
      const delta = ev.clientX - startX;
      setVideoDockWidthPx(clampVideoDockWidth(Math.min(maxW, startW - delta)));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        handleEl.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(VIDEO_DOCK_WIDTH_STORAGE_KEY, String(videoDockWidthRef.current));
      } catch {
        /* ignore */
      }
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    handleEl.setPointerCapture(e.pointerId);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);
  const [boardReady, setBoardReady] = useState(false);
  /** Yerel kamera/mikrofon akışı (önizleme + track.enabled ile aç/kapa) */
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreamsByUid, setRemoteStreamsByUid] = useState<Record<string, MediaStream>>({});
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'ended' | 'error'>('idle');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
  const agoraLocalAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const agoraLocalVideoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const syncCoachRemoteAudioRef = useRef<() => void>(() => {});
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
  const visibleStudents = useMemo(() => {
    if (!isStudentView) return students;
    return students.filter(
      (s) =>
        !idsEqual(s.id, studentIdProp) &&
        isStudentJoinedLiveClass(s.id, sessionMedia, remoteStreamsByUid),
    );
  }, [students, isStudentView, studentIdProp, sessionMedia, remoteStreamsByUid]);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceSaveToast, setAttendanceSaveToast] = useState<string | null>(null);

  const showSpeakRequestError = useCallback((message: string) => {
    showToast(message, 'error');
  }, [showToast]);

  const classroomRosterStudents = useMemo(() => {
    const roster = sessionMedia.rosterStudentIds ?? [];
    if (roster.length > 0) {
      return roster
        .map((id) => students.find((s) => idsEqual(s.id, id)))
        .filter((s): s is Student => !!s);
    }
    const roomName = effectiveRoomName.trim();
    if (roomName) {
      const exactGroup = students.filter((s) => s.group?.trim() === roomName);
      if (exactGroup.length > 0) return exactGroup;
    }
    return [];
  }, [sessionMedia.rosterStudentIds, students, effectiveRoomName]);

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

    const coachRemote = remoteStreamsByUid.coach ?? null;

    // Koç kutusu: koç görünümünde yerel akış, öğrenci görünümünde uzak akış.
    tiles.push({
      id: 'coach',
      name: 'Baş Antrenör',
      role: 'coach',
      isSelf: !isStudentView,
      stream: isStudentView ? coachRemote : localStream,
      micMuted: sessionMedia.coachMicMuted,
      camOff: isStudentView ? sessionMedia.coachCamOff && !coachRemote : sessionMedia.coachCamOff,
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

    const otherStudents = isStudentView ? visibleStudents : classroomRosterStudents;
    for (const s of otherStudents) {
      const sid = normalizeStudentId(s.id);
      if (isStudentView && currentStudent && idsEqual(s.id, currentStudent.id)) continue;
      const agoraUid = agoraUidForStudent(s.id);
      const remoteForStudent = agoraUid ? remoteStreamsByUid[agoraUid] ?? null : null;
      const coachForcedStudentCam = !!(sid && (sessionMedia.studentCamForcedOff[sid] ?? false));
      const micAllowed = canStudentTransmitAudio(sid, sessionMedia);
      tiles.push({
        id: `student-${sid || s.id}`,
        name: s.name,
        role: 'student',
        isSelf: false,
        stream: remoteForStudent,
        micMuted: !micAllowed,
        camOff: coachForcedStudentCam,
      });
    }

    return tiles;
  }, [isStudentView, localStream, remoteStreamsByUid, sessionMedia, isCameraOff, currentStudent, isMuted, visibleStudents, classroomRosterStudents]);
  const [focusedVideoTileId, setFocusedVideoTileId] = useState<string | null>(null);

  useEffect(() => {
    if (!liveVideoTiles.length) {
      setFocusedVideoTileId(null);
      return;
    }
    if (!focusedVideoTileId || !liveVideoTiles.some((t) => t.id === focusedVideoTileId)) {
      setFocusedVideoTileId(liveVideoTiles[0].id);
    }
  }, [liveVideoTiles, focusedVideoTileId]);

  const speakingStudentIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      const sid = normalizeStudentId(s.id);
      const uid = agoraUidForStudent(s.id);
      if (sid && speakingUids.has(uid)) set.add(sid);
    }
    return set;
  }, [speakingUids, students]);

  const syncCoachRemoteAudioPlayback = useCallback(() => {
    if (isStudentView) return;
    const client = agoraClientRef.current;
    if (!client) return;
    const sm = sessionMediaRef.current;
    for (const user of client.remoteUsers) {
      if (!user.audioTrack) continue;
      const uid = String(user.uid);
      if (uid === 'coach') continue;
      const matched =
        classroomRosterStudents.find((s) => agoraUidForStudent(s.id) === uid) ??
        students.find((s) => agoraUidForStudent(s.id) === uid);
      const sid = matched ? normalizeStudentId(matched.id) : '';
      const sm = sessionMediaRef.current;
      try {
        if (canStudentTransmitAudio(sid, sm)) void user.audioTrack.play();
        else user.audioTrack.stop();
      } catch {
        /* ignore */
      }
    }
  }, [isStudentView, classroomRosterStudents, students]);

  syncCoachRemoteAudioRef.current = syncCoachRemoteAudioPlayback;

  useEffect(() => {
    syncCoachRemoteAudioPlayback();
  }, [sessionMedia, syncCoachRemoteAudioPlayback]);

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
      setRemoteStreamsByUid({});
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
          setRemoteStreamsByUid({});
        }

        const client = agoraClientRef.current ?? AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        agoraClientRef.current = client;
        activeCallRoomRef.current = callRoomKey;

        const upsertRemoteVideo = (uid: string | number, stream: MediaStream) => {
          const key = String(uid);
          if (cancelled) return;
          setRemoteStreamsByUid((prev) => ({ ...prev, [key]: stream }));
          setCallStatus('connected');
        };
        const removeRemoteVideo = (uid: string | number) => {
          const key = String(uid);
          if (cancelled) return;
          setRemoteStreamsByUid((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
        };

        client.removeAllListeners();
        client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
          try {
            await client.subscribe(user, mediaType);
            if (mediaType === 'audio' && user.audioTrack) {
              user.audioTrack.play();
              syncCoachRemoteAudioRef.current();
            }
            if (mediaType === 'video' && user.videoTrack) {
              const track = user.videoTrack.getMediaStreamTrack();
              upsertRemoteVideo(user.uid, new MediaStream([track]));
            }
          } catch (e) {
            if (!cancelled) {
              const msg = e instanceof Error ? e.message : String(e);
              setMediaError(msg);
              setCallStatus('error');
            }
          }
        });
        client.on('user-unpublished', (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
          if (mediaType === 'video') removeRemoteVideo(user.uid);
        });
        client.on('user-left', (user: IAgoraRTCRemoteUser) => {
          removeRemoteVideo(user.uid);
        });

        if (client.connectionState !== 'CONNECTED') {
          const uidBase = isStudentView ? normalizeStudentId(studentIdProp) || roleDisplayName : 'coach';
          await client.join(AGORA_APP_ID, callRoomKey, null, uidBase.slice(0, 32));
        }

        try {
          client.enableAudioVolumeIndicator();
        } catch {
          /* ignore */
        }
        client.on('volume-indicator', (volumes) => {
          if (cancelled) return;
          const next = new Set<string>();
          for (const vol of volumes) {
            if (vol.level > 8) next.add(String(vol.uid));
          }
          setSpeakingUids(next);
        });

        for (const user of client.remoteUsers) {
          try {
            if (user.hasVideo) {
              await client.subscribe(user, 'video');
              if (user.videoTrack) {
                const track = user.videoTrack.getMediaStreamTrack();
                upsertRemoteVideo(user.uid, new MediaStream([track]));
              }
            }
            if (user.hasAudio) {
              await client.subscribe(user, 'audio');
              if (user.audioTrack) user.audioTrack.play();
            }
          } catch {
            /* tek kullanıcı hatası diğerlerini engellemesin */
          }
        }
        syncCoachRemoteAudioRef.current();

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
          setCallStatus(client.remoteUsers.length > 0 ? 'connected' : 'idle');
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
      const coachForcedCamOff = !!(sid && (sessionMedia.studentCamForcedOff[sid] ?? false));
      micEnabled = canStudentTransmitAudio(sid, sessionMedia) && !isMuted;
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
    const sb = getLiveLessonReadClient();
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
      if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
        if (isStudentView && effectiveRoomId) {
          setLessonRoomClosed(true);
        }
        return;
      }
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

      if (!skipBoardSync) {
        const syncKey = `${data.fen}|${JSON.stringify(data.variations ?? {})}|${data.updated_at}|${annoKey}|${JSON.stringify(data.session_media ?? '')}|${JSON.stringify(data.chat_messages ?? '')}`;
        if (syncKey !== lastSyncRef.current) {
          lastSyncRef.current = syncKey;
          try {
            const c = new Chess(data.fen as string);
            const syncedFen = c.fen();
            const moves = Array.isArray(data.moves) ? (data.moves as string[]) : [];
            const vars = 'variations' in data
              ? sanitizeLiveVariations(data.variations)
              : {};
            setGame(c);
            setFen(syncedFen);
            setMoveHistory(moves);
            setVariations(vars);
            const nav = inferLiveLessonNavFromFen(baseFenRef.current, moves, vars, syncedFen);
            setCurrentVariation(nav.currentVariation);
            setReplayNavPly(
              nav.currentVariation
                ? null
                : nav.mainLinePly >= moves.length
                  ? null
                  : nav.mainLinePly,
            );
            if (isStudentView) {
              setHoverFen(null);
              setReplayIsPlaying(false);
            }
          } catch {
            // ignore invalid fen
          }
        }
      }

      if ('coach_side' in data) {
        const parsedCoachSide = parseCoachSideFromRow(data.coach_side);
        if (parsedCoachSide !== undefined) {
          if (parsedCoachSide) {
            try { sessionStorage.setItem(COACH_SIDE_STORAGE_KEY, parsedCoachSide); } catch { /* ignore */ }
            setCoachSide(parsedCoachSide);
          } else {
            setCoachSide(null);
            try { sessionStorage.removeItem(COACH_SIDE_STORAGE_KEY); } catch { /* ignore */ }
          }
        }
      }

      /** session_media kolonu yoksa bu alan gelmez; varsa ({} dahil) her zaman işle */
      if (data.session_media != null && typeof data.session_media === 'object') {
        let sm = smFromRow ?? parseSessionMedia(data.session_media);
        if (isStudentView && pendingHandRaiseRef.current) {
          const sid = normalizeStudentId(studentIdProp);
          if (sid) {
            const hands = sm.handRaisedStudentIds ?? [];
            if (!hands.some((kid) => idsEqual(kid, sid))) {
              sm = { ...sm, handRaisedStudentIds: [...hands, sid] };
            }
          }
        }
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
          if (!canStudentTransmitAudio(sid, sm)) {
            setIsMuted(true);
          } else if (!sm.studentsCanUnmuteSelf && idsEqual(sm.floorStudentId, sid)) {
            /** Söz hakkı verildi: yerel sessizi kapat ki ses akışı açılsın */
            setIsMuted(false);
          }
        }
      }
      if ('chat_messages' in data) {
        const parsed = parseStoredChatMessages(data.chat_messages) as LiveChatMessage[];
        const remoteIds = new Set(parsed.map((m) => m.id));
        const pendingLocal = chatMessagesRef.current.filter(
          (m) => pendingChatIdsRef.current.has(m.id) && !remoteIds.has(m.id),
        );
        const merged = mergeChatMessageLists(parsed, pendingLocal) as LiveChatMessage[];
        /** Toplu derste öğrenci belleğinde ve ekranda yalnızca antrenör + kendi mesajları (diğer öğrenciler gizli) */
        if (isStudentView) {
          const sid = normalizeStudentId(studentIdProp);
          if (!sid) setChatMessages([]);
          else {
            setChatMessages(
              merged.filter((m) =>
                isPrivateChatMessage(m, sid) || isGeneralChatMessage(m, sid, true),
              ),
            );
          }
        } else {
          setChatMessages(merged);
        }
      }
    };
    fetchState();
    const interval = setInterval(fetchState, SYNC_POLL_MS);
    return () => clearInterval(interval);
  }, [effectiveRoomId, isStudentView, studentIdProp, isPgColumnError]);

  useEffect(() => {
    setLessonRoomClosed(false);
    lessonExitTriggeredRef.current = false;
  }, [effectiveRoomId]);

  useEffect(() => {
    if (!isStudentView || !lessonRoomClosed || lessonExitTriggeredRef.current) return;
    lessonExitTriggeredRef.current = true;
    showToast('Antrenör dersi bitirdi.', 'info');
    const timer = window.setTimeout(() => {
      if (onBack) onBack();
      else window.location.hash = '#/ogrenci';
    }, 400);
    return () => window.clearTimeout(timer);
  }, [isStudentView, lessonRoomClosed, onBack, showToast]);

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

  const inviteTrainingGroups = useMemo(
    () =>
      [...trainingGroups].sort(
        (a, b) =>
          a.branchOffice.localeCompare(b.branchOffice, 'tr') ||
          a.discipline.localeCompare(b.discipline, 'tr') ||
          a.name.localeCompare(b.name, 'tr'),
      ),
    [trainingGroups],
  );

  const toggleInviteTrainingGroup = useCallback(
    (group: TrainingGroup) => {
      const ids = studentsInTrainingGroup(students, group).map((s) => s.id);
      setInviteStudentIds((prev) => {
        const allIn = ids.length > 0 && ids.every((id) => prev.includes(id));
        if (allIn) return prev.filter((id) => !ids.includes(id));
        return [...new Set([...prev, ...ids])];
      });
    },
    [students],
  );

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
      showToast('Geçersiz konum; kayıt yapılamadı.', 'error');
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
          showToast('Seçili bölüm bulunamadı.', 'error');
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
      showToast('Çalışma kaydedilemedi. Supabase bağlantınızı kontrol edin.', 'error');
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
        showToast('Tahta verisi alınamadı.', 'error');
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
    const ok = await confirmDialog({
      title: 'Dersi bitir',
      message: 'Dersi bitirmek istiyor musunuz? Oda kapatılacak ve öğrenciler çıkarılacak.',
      confirmLabel: 'Dersi bitir',
      variant: 'danger',
    });
    if (!ok) return;
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
  }, [isStudentView, effectiveRoomId, confirmDialog]);

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
      coach_side: 'both',
      arrows: [],
      session_media: {
        ...DEFAULT_SESSION_MEDIA,
        studentAnalysisVisible: true,
        studentEvalBarVisible: true,
        rosterStudentIds: inviteStudentIds
          .map((id) => normalizeStudentId(id))
          .filter(Boolean),
      },
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
    async (patch: Partial<SessionMediaState>) => {
      if (!isSupabaseBackend()) return;
      const prev = sessionMediaRef.current;
      const { handRaisedStudentIds: _patchHands, ...patchRest } = patch;
      const merged = applySessionMediaPatch(prev, patchRest);
      const nextWithoutHands: SessionMediaState = {
        ...merged,
        handRaisedStudentIds: prev.handRaisedStudentIds ?? [],
      };
      sessionMediaRef.current = nextWithoutHands;
      setSessionMedia((cur) => ({
        ...nextWithoutHands,
        handRaisedStudentIds: cur.handRaisedStudentIds ?? [],
      }));
      if (schemaHasSessionMediaRef.current === false) return;
      const result = await persistSessionMediaReplace(
        effectiveRoomId,
        nextWithoutHands,
        getServiceSupabase,
      );
      if (result.missingColumn) schemaHasSessionMediaRef.current = false;
      else if (!result.ok) {
        console.warn('[LiveLesson] session_media güncellenemedi:', result.error ?? result);
      } else {
        schemaHasSessionMediaRef.current = true;
        if (result.sessionMedia) {
          const sm = parseSessionMedia(result.sessionMedia);
          sessionMediaRef.current = {
            ...sm,
            handRaisedStudentIds: sessionMediaRef.current.handRaisedStudentIds ?? sm.handRaisedStudentIds ?? [],
          };
          setSessionMedia((cur) => ({
            ...sm,
            handRaisedStudentIds: cur.handRaisedStudentIds ?? sm.handRaisedStudentIds ?? [],
          }));
        }
      }
    },
    [effectiveRoomId],
  );

  const sendChatMessage = useCallback(async () => {
    const text = chatInput.trim().slice(0, 600);
    if (!text || !isSupabaseBackend()) return;
    if (schemaHasChatMessagesRef.current === false) {
      setChatSendError('Sohbet bu sunucuda etkin değil (chat_messages kolonu eksik).');
      return;
    }
    const sid = !isStudentView ? 'coach' : normalizeStudentId(studentIdProp);
    if (!sid) return;
    const role: LiveChatMessage['role'] = !isStudentView ? 'coach' : 'student';
    const sidNorm = normalizeStudentId(studentIdProp);
    const coachPrivateTarget = chatPrivateStudentId ? normalizeStudentId(chatPrivateStudentId) : '';
    const studentInPrivateThread = isStudentView && !!sidNorm && studentChatPrivate;
    const privateWithStudentId = isStudentView
      ? (studentInPrivateThread ? sidNorm : undefined)
      : (coachPrivateTarget || undefined);
    const msg: LiveChatMessage = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      studentId: sid,
      role,
      text,
      at: new Date().toISOString(),
      ...(privateWithStudentId ? { privateWithStudentId } : {}),
    };
    setChatInput('');
    setChatSending(true);
    setChatSendError(null);
    pendingChatIdsRef.current.add(msg.id);
    setChatMessages((prev) => [...prev, msg]);
    try {
      const result = await persistLiveLessonChatMessage(effectiveRoomId, msg, getServiceSupabase);
      if (!result.ok) {
        pendingChatIdsRef.current.delete(msg.id);
        setChatMessages((prev) => prev.filter((m) => m.id !== msg.id));
        setChatSendError(result.error ?? 'Mesaj gönderilemedi');
        if (result.missingColumn) schemaHasChatMessagesRef.current = false;
      } else {
        pendingChatIdsRef.current.delete(msg.id);
        schemaHasChatMessagesRef.current = true;
      }
    } finally {
      setChatSending(false);
    }
  }, [chatInput, effectiveRoomId, isStudentView, studentIdProp, chatPrivateStudentId, studentChatPrivate]);

  const openPrivateChatWithStudent = useCallback((studentId: string) => {
    const id = normalizeStudentId(studentId);
    if (!id || isStudentView) return;
    setChatPrivateStudentId(id);
    setSidebarTab('sohbet');
    setMobileClassroomPanel('sidebar');
    setShowChatDrawer(true);
  }, [isStudentView]);

  const toggleCoachStudentLiveAudio = useCallback(
    (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id) return;
      const prev = sessionMediaRef.current;
      if (prev.studentsCanUnmuteSelf) {
        const blocked = prev.studentMicBlocked[id] === true;
        void pushSessionMediaRemote({
          studentMicBlocked: { ...prev.studentMicBlocked, [id]: !blocked },
        });
        window.setTimeout(() => syncCoachRemoteAudioRef.current(), 120);
        return;
      }
      const blocked = prev.studentMicBlocked[id] === true;
      const hasFloor = idsEqual(prev.floorStudentId, id);
      const audioOpenForCoach = !blocked && hasFloor;
      const clearHand = (prev.handRaisedStudentIds ?? []).filter((kid) => !idsEqual(kid, id));
      if (clearHand.length < (prev.handRaisedStudentIds ?? []).length) {
        void persistSessionMediaOp(effectiveRoomId, 'handLower', id, getServiceSupabase);
      }
      if (audioOpenForCoach) {
        const nextBlocked = { ...prev.studentMicBlocked, [id]: true };
        void pushSessionMediaRemote({
          studentMicBlocked: nextBlocked,
          floorStudentId: idsEqual(prev.floorStudentId, id) ? null : prev.floorStudentId,
        });
      } else {
        void pushSessionMediaRemote({
          floorStudentId: id,
          studentMicBlocked: { ...prev.studentMicBlocked, [id]: false },
        });
      }
      window.setTimeout(() => syncCoachRemoteAudioRef.current(), 120);
    },
    [pushSessionMediaRemote, effectiveRoomId],
  );

  const grantFloorToStudent = useCallback(
    (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id || isStudentView) return;
      void persistSessionMediaOp(effectiveRoomId, 'handLower', id, getServiceSupabase).then((result) => {
        if (result.ok && result.sessionMedia) {
          const sm = parseSessionMedia(result.sessionMedia);
          sessionMediaRef.current = sm;
          setSessionMedia(sm);
        }
      });
      const prev = sessionMediaRef.current;
      void pushSessionMediaRemote({
        floorStudentId: id,
        studentMicBlocked: { ...prev.studentMicBlocked, [id]: false },
      });
    },
    [isStudentView, pushSessionMediaRemote, effectiveRoomId],
  );

  const requestSpeakFloor = useCallback(() => {
    if (!canStudentRequestSpeak) return;
    const sid = normalizeStudentId(studentIdProp);
    if (!sid) return;
    const raised = sessionMedia.handRaisedStudentIds ?? [];
    if (raised.some((kid) => idsEqual(kid, sid))) return;
    pendingHandRaiseRef.current = true;
    setSessionMedia((prev) => ({
      ...prev,
      handRaisedStudentIds: [...(prev.handRaisedStudentIds ?? []), sid],
    }));
    void persistSessionMediaOp(effectiveRoomId, 'handRaise', sid, getServiceSupabase).then((result) => {
      pendingHandRaiseRef.current = false;
      if (!result.ok) {
        setSessionMedia((prev) => ({
          ...prev,
          handRaisedStudentIds: (prev.handRaisedStudentIds ?? []).filter((kid) => !idsEqual(kid, sid)),
        }));
        showSpeakRequestError(result.error ?? 'Söz isteği gönderilemedi. Tekrar deneyin.');
        console.warn('[LiveLesson] handRaise başarısız:', result.error);
        return;
      }
      if (result.sessionMedia) {
        const sm = parseSessionMedia(result.sessionMedia);
        sessionMediaRef.current = sm;
        setSessionMedia(sm);
      }
    });
  }, [canStudentRequestSpeak, studentIdProp, sessionMedia.handRaisedStudentIds, effectiveRoomId, showSpeakRequestError]);

  const cancelSpeakRequest = useCallback(() => {
    if (!isStudentView) return;
    const sid = normalizeStudentId(studentIdProp);
    if (!sid) return;
    setSessionMedia((prev) => ({
      ...prev,
      handRaisedStudentIds: (prev.handRaisedStudentIds ?? []).filter((kid) => !idsEqual(kid, sid)),
    }));
    void persistSessionMediaOp(effectiveRoomId, 'handLower', sid, getServiceSupabase).then((result) => {
      if (!result.ok) {
        console.warn('[LiveLesson] handLower başarısız:', result.error);
        return;
      }
      if (result.sessionMedia) {
        const sm = parseSessionMedia(result.sessionMedia);
        sessionMediaRef.current = sm;
        setSessionMedia(sm);
      }
    });
  }, [isStudentView, studentIdProp, effectiveRoomId]);

  const releaseSpeakFloor = useCallback(
    (targetStudentId?: string) => {
      const id = normalizeStudentId(targetStudentId ?? (isStudentView ? studentIdProp : ''));
      if (!id) return;
      if (isStudentView && !idsEqual(id, studentIdProp)) return;
      const prev = sessionMediaRef.current;
      if (!idsEqual(prev.floorStudentId, id)) return;

      if (isStudentView) {
        setIsMuted(true);
      }

      const selfUnmute = !!prev.studentsCanUnmuteSelf;
      const nextBlocked =
        !isStudentView && !selfUnmute
          ? { ...prev.studentMicBlocked, [id]: true }
          : prev.studentMicBlocked;

      setSessionMedia((cur) => ({
        ...cur,
        floorStudentId: idsEqual(cur.floorStudentId, id) ? null : cur.floorStudentId,
        studentMicBlocked: isStudentView ? cur.studentMicBlocked : nextBlocked,
      }));
      sessionMediaRef.current = {
        ...sessionMediaRef.current,
        floorStudentId: idsEqual(sessionMediaRef.current.floorStudentId, id)
          ? null
          : sessionMediaRef.current.floorStudentId,
        studentMicBlocked: isStudentView
          ? sessionMediaRef.current.studentMicBlocked
          : nextBlocked,
      };

      void persistSessionMediaOp(effectiveRoomId, 'releaseFloor', id, getServiceSupabase).then((result) => {
        if (result.ok && result.sessionMedia) {
          const sm = parseSessionMedia(result.sessionMedia);
          sessionMediaRef.current = {
            ...sm,
            handRaisedStudentIds: sessionMediaRef.current.handRaisedStudentIds ?? sm.handRaisedStudentIds ?? [],
          };
          setSessionMedia((cur) => ({
            ...sm,
            handRaisedStudentIds: cur.handRaisedStudentIds ?? sm.handRaisedStudentIds ?? [],
            studentMicBlocked: isStudentView ? cur.studentMicBlocked : nextBlocked,
          }));
        }
      });

      if (!isStudentView) {
        void pushSessionMediaRemote({
          floorStudentId: null,
          ...(selfUnmute ? {} : { studentMicBlocked: nextBlocked }),
        });
        window.setTimeout(() => syncCoachRemoteAudioRef.current(), 120);
      }
    },
    [isStudentView, studentIdProp, effectiveRoomId, pushSessionMediaRemote],
  );

  const setStudentPlayPermission = useCallback(
    (studentId: string, side: PlayBoardSide | null) => {
      const id = normalizeStudentId(studentId);
      if (!id || isStudentView) return;
      const prev = sessionMediaRef.current;
      const playSides = { ...(prev.studentPlaySides ?? {}) };
      if (side) playSides[id] = side;
      else delete playSides[id];
      const boards = { ...(prev.studentBoards ?? {}) };
      delete boards[id];
      const indIds = (prev.independentBoardStudentIds ?? []).filter((kid) => !idsEqual(kid, id));
      void pushSessionMediaRemote({
        studentPlaySides: playSides,
        studentBoards: boards,
        independentBoardStudentIds: indIds,
      });
    },
    [isStudentView, pushSessionMediaRemote],
  );

  const toggleCoachStudentCam = useCallback(
    (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id) return;
      const prev = sessionMediaRef.current;
      const forcedOff = !!(prev.studentCamForcedOff[id]);
      void pushSessionMediaRemote({
        studentCamForcedOff: { ...prev.studentCamForcedOff, [id]: !forcedOff },
      });
    },
    [pushSessionMediaRemote]
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

  const setLiveAttendanceMark = useCallback(
    (studentId: string, status: 'present' | 'absent' | 'late' | 'excused') => {
      const id = normalizeStudentId(studentId);
      if (!id || isStudentView) return;
      const marks = { ...(sessionMediaRef.current.attendanceMarks ?? {}), [id]: status };
      void pushSessionMediaRemote({ attendanceMarks: marks });
      if (status === 'present') recordLiveAttendance(id);
    },
    [isStudentView, pushSessionMediaRemote, recordLiveAttendance],
  );

  const markAllLiveAttendance = useCallback(
    (status: 'present' | 'absent' | 'late' | 'excused') => {
      if (isStudentView) return;
      const marks = { ...(sessionMediaRef.current.attendanceMarks ?? {}) };
      for (const s of classroomRosterStudents) {
        const id = normalizeStudentId(s.id);
        if (id) marks[id] = status;
      }
      void pushSessionMediaRemote({ attendanceMarks: marks });
      if (status === 'present') {
        classroomRosterStudents.forEach((s) => recordLiveAttendance(s.id));
      }
    },
    [classroomRosterStudents, isStudentView, pushSessionMediaRemote, recordLiveAttendance],
  );

  const saveLiveAttendance = useCallback(async () => {
    if (isStudentView || classroomRosterStudents.length === 0) return;
    setAttendanceSaving(true);
    setAttendanceSaveToast(null);
    const today = new Date().toISOString().slice(0, 10);
    const marks = sessionMedia.attendanceMarks ?? {};
    const admitted = sessionMedia.admittedStudentIds ?? [];
    const pending = sessionMedia.pendingStudentIds ?? [];
    try {
      for (const s of classroomRosterStudents) {
        const sid = normalizeStudentId(s.id);
        if (!sid) continue;
        const agoraUid = agoraUidForStudent(s.id);
        const hasVideo = !!(agoraUid && remoteStreamsByUid[agoraUid]);
        const resolved = resolveLiveAttendanceStatus(sid, marks, admitted, pending, hasVideo);
        const status: 'present' | 'absent' | 'late' | 'excused' =
          marks[sid] ??
          (resolved === 'present' || resolved === 'late' || resolved === 'excused' ? resolved : 'absent');
        await addAttendanceRecord({
          date: today,
          studentId: sid,
          status,
          lessonSummary: `Canlı ders: ${effectiveRoomName}`,
        });
        attendanceRecordedRef.current.add(sid);
      }
      setAttendanceSaveToast('Yoklama kaydedildi');
      window.setTimeout(() => setAttendanceSaveToast(null), 3500);
    } finally {
      setAttendanceSaving(false);
    }
  }, [
    addAttendanceRecord,
    classroomRosterStudents,
    effectiveRoomName,
    isStudentView,
    remoteStreamsByUid,
    sessionMedia.admittedStudentIds,
    sessionMedia.attendanceMarks,
    sessionMedia.pendingStudentIds,
  ]);

  const sendStudentToWaitingRoom = useCallback(
    async (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id || isStudentView) return;
      const ok = await confirmDialog({
        title: 'Bekleme odasına al',
        message: 'Bu öğrenci dersten çıkarılıp bekleme odasına alınacak. Tekrar derse alabilirsiniz.',
        confirmLabel: 'Bekleme odasına al',
        variant: 'danger',
      });
      if (!ok) return;
      const prev = sessionMediaRef.current;
      const pending = [...new Set([...(prev.pendingStudentIds ?? []), id])];
      const nextBlocked = { ...prev.studentMicBlocked, [id]: true };
      let floor = prev.floorStudentId;
      if (idsEqual(floor, id)) floor = null;
      void persistSessionMediaOp(effectiveRoomId, 'handLower', id, getServiceSupabase);
      void pushSessionMediaRemote({
        kickedStudentIds: (prev.kickedStudentIds ?? []).filter((kid) => !idsEqual(kid, id)),
        pendingStudentIds: pending,
        admittedStudentIds: (prev.admittedStudentIds ?? []).filter((kid) => !idsEqual(kid, id)),
        independentBoardStudentIds: (prev.independentBoardStudentIds ?? []).filter((kid) => !idsEqual(kid, id)),
        studentBoards: Object.fromEntries(
          Object.entries(prev.studentBoards ?? {}).filter(([kid]) => !idsEqual(kid, id)),
        ),
        studentPlaySides: Object.fromEntries(
          Object.entries(prev.studentPlaySides ?? {}).filter(([kid]) => !idsEqual(kid, id)),
        ),
        floorStudentId: floor,
        studentMicBlocked: nextBlocked,
        studentCamForcedOff: { ...prev.studentCamForcedOff, [id]: true },
      });
      setParticipantMenuStudentId(null);
    },
    [pushSessionMediaRemote, isStudentView, effectiveRoomId, confirmDialog],
  );

  const banParticipantPermanently = useCallback(
    async (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id || isStudentView) return;
      const ok = await confirmDialog({
        title: 'Kalıcı çıkar',
        message: 'Bu öğrenci dersten kalıcı olarak çıkarılacak. Tekrar katılmak için sizin onayınız gerekir.',
        confirmLabel: 'Kalıcı çıkar',
        variant: 'danger',
      });
      if (!ok) return;
      const prev = sessionMediaRef.current;
      const kicks = new Set([...(prev.kickedStudentIds ?? []), id]);
      const nextBlocked = { ...prev.studentMicBlocked, [id]: true };
      let floor = prev.floorStudentId;
      if (idsEqual(floor, id)) floor = null;
      void persistSessionMediaOp(effectiveRoomId, 'handLower', id, getServiceSupabase);
      void pushSessionMediaRemote({
        kickedStudentIds: Array.from(kicks),
        pendingStudentIds: (prev.pendingStudentIds ?? []).filter((kid) => !idsEqual(kid, id)),
        admittedStudentIds: (prev.admittedStudentIds ?? []).filter((kid) => !idsEqual(kid, id)),
        independentBoardStudentIds: (prev.independentBoardStudentIds ?? []).filter((kid) => !idsEqual(kid, id)),
        studentBoards: Object.fromEntries(
          Object.entries(prev.studentBoards ?? {}).filter(([kid]) => !idsEqual(kid, id)),
        ),
        studentPlaySides: Object.fromEntries(
          Object.entries(prev.studentPlaySides ?? {}).filter(([kid]) => !idsEqual(kid, id)),
        ),
        floorStudentId: floor,
        studentMicBlocked: nextBlocked,
        studentCamForcedOff: { ...prev.studentCamForcedOff, [id]: true },
      });
      setParticipantMenuStudentId(null);
    },
    [pushSessionMediaRemote, isStudentView, effectiveRoomId, confirmDialog],
  );

  const readmitParticipant = useCallback(
    (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id || isStudentView) return;
      const prev = sessionMediaRef.current;
      const kicks = (prev.kickedStudentIds ?? []).filter((kid) => !idsEqual(kid, id));
      const nextBlocked = { ...prev.studentMicBlocked };
      delete nextBlocked[id];
      const nextCam = { ...prev.studentCamForcedOff };
      delete nextCam[id];
      const admitted = [...new Set([...(prev.admittedStudentIds ?? []), id])];
      const pending = (prev.pendingStudentIds ?? []).filter((kid) => !idsEqual(kid, id));
      void pushSessionMediaRemote({
        kickedStudentIds: kicks,
        admittedStudentIds: admitted,
        pendingStudentIds: pending,
        studentMicBlocked: nextBlocked,
        studentCamForcedOff: nextCam,
      });
      recordLiveAttendance(id);
      setParticipantMenuStudentId(null);
    },
    [pushSessionMediaRemote, isStudentView, recordLiveAttendance],
  );

  const toggleOpenParticipationRemote = useCallback(() => {
    const next = !(sessionMediaRef.current.openParticipation ?? false);
    void pushSessionMediaRemote({ openParticipation: next });
  }, [pushSessionMediaRemote]);

  const toggleStudentsCanUnmuteSelf = useCallback(() => {
    if (isStudentView) return;
    const prev = sessionMediaRef.current;
    const next = !(prev.studentsCanUnmuteSelf ?? false);
    const ids = collectLiveStudentMediaIds(prev, classroomRosterStudents);
    const clearedBlocked = { ...prev.studentMicBlocked };
    if (next) {
      ids.forEach((id) => {
        delete clearedBlocked[id];
      });
    }
    void pushSessionMediaRemote({
      studentsCanUnmuteSelf: next,
      floorStudentId: next ? null : prev.floorStudentId,
      ...(next ? { studentMicBlocked: clearedBlocked } : {}),
    });
  }, [isStudentView, classroomRosterStudents, pushSessionMediaRemote]);

  const muteAllStudentsRemote = useCallback(() => {
    if (isStudentView) return;
    const prev = sessionMediaRef.current;
    const ids = collectLiveStudentMediaIds(prev, classroomRosterStudents);
    const nextBlocked = { ...prev.studentMicBlocked };
    ids.forEach((id) => {
      nextBlocked[id] = true;
    });
    void pushSessionMediaRemote({
      floorStudentId: null,
      handRaisedStudentIds: [],
      studentMicBlocked: nextBlocked,
    });
    window.setTimeout(() => syncCoachRemoteAudioRef.current(), 120);
  }, [isStudentView, classroomRosterStudents, pushSessionMediaRemote]);

  const unmuteAllStudentsRemote = useCallback(() => {
    if (isStudentView) return;
    const prev = sessionMediaRef.current;
    const ids = collectLiveStudentMediaIds(prev, classroomRosterStudents);
    const nextBlocked = { ...prev.studentMicBlocked };
    ids.forEach((id) => {
      delete nextBlocked[id];
    });
    void pushSessionMediaRemote({
      studentMicBlocked: nextBlocked,
    });
    window.setTimeout(() => syncCoachRemoteAudioRef.current(), 120);
  }, [isStudentView, classroomRosterStudents, pushSessionMediaRemote]);

  const admitStudentToClass = useCallback(
    (studentId: string) => {
      const id = normalizeStudentId(studentId);
      if (!id || isStudentView) return;
      const prev = sessionMediaRef.current;
      const pending = (prev.pendingStudentIds ?? []).filter((kid) => !idsEqual(kid, id));
      const admitted = [...new Set([...(prev.admittedStudentIds ?? []), id])];
      const marks = { ...(prev.attendanceMarks ?? {}), [id]: 'present' as const };
      void pushSessionMediaRemote({
        pendingStudentIds: pending,
        admittedStudentIds: admitted,
        attendanceMarks: marks,
      });
      recordLiveAttendance(id);
    },
    [isStudentView, pushSessionMediaRemote, recordLiveAttendance],
  );

  const admitAllPendingStudents = useCallback(() => {
    if (isStudentView) return;
    const prev = sessionMediaRef.current;
    const pending = prev.pendingStudentIds ?? [];
    if (pending.length === 0) return;
    const admitted = [...new Set([...(prev.admittedStudentIds ?? []), ...pending])];
    const marks = { ...(prev.attendanceMarks ?? {}) };
    pending.forEach((id) => {
      marks[normalizeStudentId(id)] = 'present';
    });
    void pushSessionMediaRemote({
      pendingStudentIds: [],
      admittedStudentIds: admitted,
      attendanceMarks: marks,
    });
    pending.forEach((id) => recordLiveAttendance(id));
  }, [isStudentView, pushSessionMediaRemote, recordLiveAttendance]);

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
      const prev = sessionMediaRef.current;
      const nextAdmitted = [...new Set([...(prev.admittedStudentIds ?? []), sid])];
      const nextPending = (prev.pendingStudentIds ?? []).filter((kid) => !idsEqual(kid, sid));
      const marks = { ...(prev.attendanceMarks ?? {}), [sid]: 'present' as const };
      void pushSessionMediaRemote({
        admittedStudentIds: nextAdmitted,
        pendingStudentIds: nextPending,
        attendanceMarks: marks,
      });
      recordLiveAttendance(sid);
      return;
    }

    if (pending.some((kid) => idsEqual(kid, sid))) return;
    if (studentJoinRegisteredRef.current) return;
    studentJoinRegisteredRef.current = true;
    void persistSessionMediaOp(effectiveRoomId, 'joinPending', sid, getServiceSupabase).then((result) => {
      if (result.ok && result.sessionMedia) {
        const sm = parseSessionMedia(result.sessionMedia);
        sessionMediaRef.current = sm;
        setSessionMedia(sm);
      } else if (!result.ok) {
        console.warn('[LiveLesson] joinPending başarısız:', result.error);
      }
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
  const studentCanUseMic = !!(
    isStudentView &&
    sidSelfMedia &&
    canStudentTransmitAudio(sidSelfMedia, sessionMedia)
  );
  const studentMicBlockedByCoach = !!(
    isStudentView &&
    sidSelfMedia &&
    isStudentMicBlockedByCoach(sidSelfMedia, sessionMedia)
  );
  const studentMicToggleDisabled = isStudentView && !studentCanUseMic;

  const toggleLocalMic = useCallback(() => {
    if (!isStudentView) {
      coachLocalMediaShieldUntilRef.current = Date.now() + 4500;
      void pushSessionMediaRemote({ coachMicMuted: !sessionMediaRef.current.coachMicMuted });
    } else if (studentCanUseMic) {
      setIsMuted((m) => !m);
    }
  }, [isStudentView, pushSessionMediaRemote, studentCanUseMic]);

  const toggleLocalCam = useCallback(() => {
    if (!isStudentView) {
      coachLocalMediaShieldUntilRef.current = Date.now() + 4500;
      const nextCamOff = !sessionMediaRef.current.coachCamOff;
      void pushSessionMediaRemote({ coachCamOff: nextCamOff });
    } else {
      setIsCameraOff((c) => !c);
    }
  }, [isStudentView, pushSessionMediaRemote]);

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

    if (isStudentView) {
      const sid = normalizeStudentId(studentIdProp);
      if (!sid) return [];
      if (studentChatPrivate) {
        return sorted.filter((m) => isPrivateChatMessage(m, sid));
      }
      return sorted.filter((m) => isGeneralChatMessage(m, sid, true));
    }

    if (chatPrivateStudentId) {
      const pid = normalizeStudentId(chatPrivateStudentId);
      return sorted.filter((m) => isPrivateChatMessage(m, pid));
    }
    return sorted.filter((m) => isGeneralChatMessage(m, '', false));
  }, [chatMessages, isStudentView, studentIdProp, chatPrivateStudentId, studentChatPrivate]);

  const lastAutoPrivateCoachMsgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isStudentView) return;
    const sid = normalizeStudentId(studentIdProp);
    if (!sid) return;
    const coachPrivate = chatMessages
      .filter((m) => m.role === 'coach' && isPrivateChatMessage(m, sid))
      .sort((a, b) => a.at.localeCompare(b.at));
    const latest = coachPrivate[coachPrivate.length - 1];
    if (!latest || latest.id === lastAutoPrivateCoachMsgIdRef.current) return;
    lastAutoPrivateCoachMsgIdRef.current = latest.id;
    setStudentChatPrivate(true);
    setSidebarTab('sohbet');
    setShowChatDrawer(true);
  }, [chatMessages, isStudentView, studentIdProp]);

  useEffect(() => {
    setChatReadCursors(EMPTY_CHAT_READ);
  }, [effectiveRoomId]);

  const chatUnreadStats = useMemo(() => {
    const studentSid = normalizeStudentId(studentIdProp);
    const privateUnreadByStudent: Record<string, number> = {};

    if (isStudentView) {
      const generalUnread = countUnreadChatMessages(
        chatMessages,
        chatReadCursors.general,
        (m) => m.role === 'coach' && !m.privateWithStudentId,
      );
      const privateUnread = studentSid
        ? countUnreadChatMessages(
            chatMessages,
            readCursorForChannel(chatReadCursors, `private:${studentSid}`),
            (m) => m.role === 'coach' && isPrivateChatMessage(m, studentSid),
          )
        : 0;
      return {
        generalUnread,
        privateUnreadByStudent: {} as Record<string, number>,
        totalUnread: studentChatPrivate ? privateUnread : generalUnread,
        activeChannelUnread: studentChatPrivate ? privateUnread : generalUnread,
      };
    }

    const generalUnread = countUnreadChatMessages(
      chatMessages,
      chatReadCursors.general,
      (m) => m.role === 'student' && !m.privateWithStudentId,
    );
    let privateUnreadTotal = 0;
    for (const s of classroomRosterStudents) {
      const sid = normalizeStudentId(s.id);
      if (!sid) continue;
      const count = countUnreadChatMessages(
        chatMessages,
        readCursorForChannel(chatReadCursors, `private:${sid}`),
        (m) => m.role === 'student' && isPrivateChatMessage(m, sid),
      );
      if (count > 0) {
        privateUnreadByStudent[sid] = count;
        privateUnreadTotal += count;
      }
    }
    const activeChannel = activeChatChannelKey({
      isStudentView,
      chatPrivateStudentId,
      studentChatPrivate,
      studentIdProp,
    });
    const activeChannelUnread =
      activeChannel === 'general'
        ? generalUnread
        : privateUnreadByStudent[activeChannel.slice('private:'.length)] ?? 0;

    return {
      generalUnread,
      privateUnreadByStudent,
      totalUnread: generalUnread + privateUnreadTotal,
      activeChannelUnread,
    };
  }, [
    chatMessages,
    chatReadCursors,
    isStudentView,
    studentIdProp,
    studentChatPrivate,
    chatPrivateStudentId,
    classroomRosterStudents,
  ]);

  useEffect(() => {
    if (sidebarTab !== 'sohbet') return;
    const channel = activeChatChannelKey({
      isStudentView,
      chatPrivateStudentId,
      studentChatPrivate,
      studentIdProp,
    });
    const latestAt = visibleChatMessages.reduce<string | null>((max, m) => {
      if (!max || m.at > max) return m.at;
      return max;
    }, null);
    if (!latestAt) return;
    setChatReadCursors((prev) => {
      if (channel === 'general') {
        if (prev.general && prev.general >= latestAt) return prev;
        return { ...prev, general: latestAt };
      }
      const sid = channel.slice('private:'.length);
      const cur = prev.private[sid];
      if (cur && cur >= latestAt) return prev;
      return { ...prev, private: { ...prev.private, [sid]: latestAt } };
    });
  }, [
    sidebarTab,
    visibleChatMessages,
    isStudentView,
    chatPrivateStudentId,
    studentChatPrivate,
    studentIdProp,
  ]);

  const chatNotifyCount =
    sidebarTab === 'sohbet'
      ? Math.max(0, chatUnreadStats.totalUnread - chatUnreadStats.activeChannelUnread)
      : chatUnreadStats.totalUnread;

  const openGeneralChat = useCallback(() => {
    setChatPrivateStudentId(null);
    setStudentChatPrivate(false);
    setSidebarTab('sohbet');
    setShowChatDrawer(true);
  }, []);

  const chatSenderName = useCallback(
    (msg: LiveChatMessage) => {
      if (msg.role === 'coach') return 'Antrenör';
      const s = students.find((st) => idsEqual(st.id, msg.studentId));
      return s?.name ?? 'Öğrenci';
    },
    [students],
  );

  const displayBaseFen = baseFen;
  const displayMoveHistory = moveHistory;
  const displayVariations = variations;

  const getFenAtPly = useCallback((plyIndex: number) => {
    try {
      const c = new Chess(displayBaseFen);
      for (let i = 0; i <= plyIndex; i++) {
        c.move(displayMoveHistory[i]);
      }
      return c.fen();
    } catch { return fen; }
  }, [displayBaseFen, displayMoveHistory, fen]);

  const mainLinePly = currentVariation
    ? currentVariation[0]
    : (replayNavPly ?? displayMoveHistory.length);
  const liveLessonCurrentPly = currentVariation
    ? currentVariation[2] + 1
    : mainLinePly;
  const activeLineLength = currentVariation && !isStudentView
    ? (displayVariations[currentVariation[0]]?.[currentVariation[1]]?.length ?? 0)
    : displayMoveHistory.length;
  /** Oynanabilir uç pozisyon (notasyon gezintisinde değiliz) */
  const atLiveGameHead = isStudentView || liveLessonCurrentPly === activeLineLength;
  const studentPlaySideResolved = resolveStudentPlaySide(studentIdProp, sessionMedia);
  /** Öğrenci: antrenör izin verdiyse tahta oynanır; antrenör: analiz / canlı uç / analiz sekmesi */
  const boardExploreMode = isStudentView
    ? studentPlaySideResolved != null
    : (analysisMode || atLiveGameHead || sidebarTab === 'analiz');
  const replayNavActive = !isStudentView && (replayNavPly !== null || currentVariation !== null);

  const boardDisplayFen = useMemo(() => {
    if (hoverFen && !replayNavActive) return hoverFen;
    if (isStudentView) return fen;
    return liveLessonFenAt(displayBaseFen, displayMoveHistory, displayVariations, mainLinePly, currentVariation);
  }, [isStudentView, fen, hoverFen, replayNavActive, displayBaseFen, displayMoveHistory, displayVariations, mainLinePly, currentVariation]);

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

  /** Tahtadaki avantaj çubuğu — öğrencide yalnızca antrenör «Avantaj» ile açılır */
  const studentClassroomAnalysisOn = isStudentClassroomAnalysisEnabled(sessionMedia);
  const studentBoardEvalOn = isStudentBoardEvalBarEnabled(sessionMedia);
  const showBoardEvalBar = isStudentView ? studentBoardEvalOn : engineEvalVisible;
  const coachEngineActive = engineEvalVisible && sidebarTab === 'analiz';
  const studentEngineActive = studentClassroomAnalysisOn && sidebarTab === 'analiz';
  const enginePanelActive = isStudentView ? studentEngineActive : coachEngineActive;
  const engineLineSlotCount = isStudentView
    ? resolveEngineMultiPvLines(sessionMedia)
    : engineLinesVisible
      ? 3
      : 1;
  const studentAnalyseBoard = isStudentView && studentEngineActive;

  useEffect(() => {
    if (isStudentView) return;
    const remoteLines = sessionMedia.engineMultiPvLines;
    if (remoteLines === 1 || remoteLines === 3) {
      setEngineLinesVisible(remoteLines === 3);
    }
  }, [isStudentView, sessionMedia.engineMultiPvLines]);

  const {
    pvLines: enginePvLines,
    depth: engineDepth,
    analyseFen: analyseEngineFen,
    ready: engineReady,
    loading: engineLoading,
    error: engineError,
  } = useStockfish({
    numPv: enginePanelActive ? engineLineSlotCount : 1,
    enabled: studentAnalyseBoard || (!isStudentView && (engineEvalVisible || coachEngineActive)),
  });

  /** Tahta / analiz sekmesi FEN değişince motoru güncelle (tek giriş noktası) */
  useEffect(() => {
    const shouldAnalyse = isStudentView
      ? studentAnalyseBoard
      : showBoardEvalBar || enginePanelActive;
    if (!shouldAnalyse) return;
    const fen = boardDisplayFen.trim();
    try {
      new Chess(fen);
    } catch {
      return;
    }
    analyseEngineFen(fen);
  }, [isStudentView, studentAnalyseBoard, showBoardEvalBar, enginePanelActive, boardDisplayFen, analyseEngineFen]);

  const onEnginePvHoverPly = useMemo(
    () =>
      buildPvHoverHandler({
        rootFen: boardDisplayFen,
        pvLines: enginePvLines,
        setHovered: setEnginePvHovered,
        setPreview: setEnginePvLinePreview,
      }),
    [boardDisplayFen, enginePvLines],
  );

  const onEnginePvClickPly = useCallback((lineIndex: number, plyIndex: number) => {
    const line = enginePvLines[lineIndex];
    if (!line?.pv?.length || plyIndex < 0 || plyIndex >= line.pv.length) return;
    setEnginePvHovered(null);
    setEnginePvLinePreview(null);
    const nextFen = fenAfterUciPlies(boardDisplayFen, line.pv, plyIndex + 1);
    if (nextFen) setHoverFen(nextFen);
  }, [enginePvLines, boardDisplayFen]);

  useEffect(() => {
    if (!enginePanelActive) {
      setEnginePvHovered(null);
      setEnginePvLinePreview(null);
    }
  }, [enginePanelActive]);

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
    broadcastCoachSide?: CollaborativeBoardSide | null,
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

    if (!isStudentView) {
      lastLocalMoveTimeRef.current = Date.now();
    }

    const applySyncKey = (stamp: string) => {
      const varsKey = JSON.stringify(payload.variations ?? {});
      lastSyncRef.current = `${broadcastFen}|${varsKey}|${stamp}|${JSON.stringify(payload.session_media ?? '')}|${JSON.stringify(payload.chat_messages ?? '')}`;
      if (broadcastMarks !== undefined || broadcastArrows !== undefined) {
        lastAnnoSyncRef.current = `${JSON.stringify(broadcastMarks ?? null)}|${JSON.stringify(broadcastArrows ?? [])}`;
      }
    };

    void sb.from('live_lesson_state').upsert(payload, { onConflict: 'id' }).then(({ error }) => {
      if (!error) {
        if ('marks' in payload) schemaHasMarksRef.current = true;
        if ('arrows' in payload) schemaHasArrowsRef.current = true;
        applySyncKey(new Date().toISOString());
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
            applySyncKey(new Date().toISOString());
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
              if (!e3) applySyncKey(new Date().toISOString());
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
          if (!e2) applySyncKey(new Date().toISOString());
        });
      }
    });
  }, [effectiveRoomId, effectiveRoomName, isPgColumnError, isStudentView]);

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
        activePuzzleId: puzzle.id,
      });
      setReplayNavPly(null);
      setSidebarTab('analiz');
      void pushState(finalFen, [], [], {}, coachSide ?? undefined);
    } catch (e) {
      console.error('[LiveLesson] Failed to apply puzzle:', e);
    }
  }, [pushState, coachSide, pushSessionMediaRemote]);

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
      studentCanSeePuzzleSolution: !sessionMediaRef.current.studentCanSeePuzzleSolution,
    });
  }, [isStudentView, pushSessionMediaRemote]);

  const toggleStudentAnalysisVisibility = useCallback(() => {
    if (isStudentView) return;
    void pushSessionMediaRemote({
      studentAnalysisVisible: !(sessionMediaRef.current.studentAnalysisVisible ?? false),
    });
  }, [isStudentView, pushSessionMediaRemote]);

  const toggleCoachEvalBarVisible = useCallback(() => {
    if (isStudentView) return;
    const next = !engineEvalVisible;
    setEngineEvalVisible(next);
    void pushSessionMediaRemote({
      studentEvalBarVisible: next,
    });
  }, [isStudentView, engineEvalVisible, pushSessionMediaRemote]);

  const toggleCoachEngineLinesVisible = useCallback(() => {
    if (isStudentView) return;
    const next = !engineLinesVisible;
    setEngineLinesVisible(next);
    void pushSessionMediaRemote({
      engineMultiPvLines: next ? 3 : 1,
    });
  }, [engineLinesVisible, isStudentView, pushSessionMediaRemote]);

  const recordVariation = useCallback((
    from: string,
    to: string,
    branchMainPly: number,
  ): { nextVars: Record<number, string[][]>; varRef: LiveVariationRef } | null => {
    try {
      const g = makeBuilderGame(boardDisplayFen);
      const result = g.move({ from: from as any, to: to as any, promotion: 'q' });
      if (!result) return null;
      const existingVars = displayVariations[branchMainPly] ?? [];
      const existingIdx = existingVars.findIndex((line) => line[0] === result.san);
      if (existingIdx >= 0) {
        return {
          nextVars: displayVariations,
          varRef: [branchMainPly, existingIdx, 0],
        };
      }
      const varRef: LiveVariationRef = [branchMainPly, existingVars.length, 0];
      const nextVars = { ...displayVariations, [branchMainPly]: [...existingVars, [result.san]] };
      return { nextVars, varRef };
    } catch {
      return null;
    }
  }, [boardDisplayFen, displayVariations]);

  const appendToCurrentVariation = useCallback((
    san: string,
  ): { nextVars: Record<number, string[][]>; varRef: LiveVariationRef } | null => {
    if (!currentVariation) return null;
    const [mainLinePos, varGroupIdx, varMoveIdx] = currentVariation;
    const existingVars = displayVariations[mainLinePos] ?? [];
    const currentLine = existingVars[varGroupIdx];
    if (!currentLine) return null;
    const insertAt = Math.min(varMoveIdx + 1, currentLine.length);
    if (currentLine[insertAt] === san) {
      return {
        nextVars: displayVariations,
        varRef: [mainLinePos, varGroupIdx, insertAt],
      };
    }
    const nextLine = [...currentLine.slice(0, insertAt), san, ...currentLine.slice(insertAt)];
    const varRef: LiveVariationRef = [mainLinePos, varGroupIdx, insertAt];
    const nextVars = {
      ...displayVariations,
      [mainLinePos]: existingVars.map((line, i) => (i === varGroupIdx ? nextLine : line)),
    };
    return { nextVars, varRef };
  }, [currentVariation, displayVariations]);

  const commitLiveBoardState = useCallback((
    nextFen: string,
    nextMoves: string[],
    nextVars: Record<number, string[][]>,
    opts?: { keepVariation?: LiveVariationRef | null },
  ) => {
    setReplayNavPly(null);
    setFen(nextFen);
    setGame(new Chess(nextFen));
    setCurrentVariation(opts?.keepVariation ?? null);
    lastLocalMoveTimeRef.current = Date.now();
    setMoveHistory(nextMoves);
    setVariations(nextVars);
    pushState(
      nextFen,
      nextMoves,
      undefined,
      undefined,
      isStudentView ? undefined : coachSide,
      nextVars,
    );
  }, [pushState, coachSide, isStudentView]);

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

  const publishCoachBoardNav = useCallback((
    nextVar: LiveVariationRef | null,
    nextReplay: number | null,
  ) => {
    if (isStudentView) return;
    setReplayIsPlaying(false);
    setHoverFen(null);
    const mainPly = nextVar ? nextVar[0] : (nextReplay ?? moveHistory.length);
    const nextFen = liveLessonFenAt(baseFen, moveHistory, variations, mainPly, nextVar);
    setCurrentVariation(nextVar);
    setReplayNavPly(nextReplay);
    setFen(nextFen);
    setGame(new Chess(nextFen));
    lastLocalMoveTimeRef.current = Date.now();
    pushState(nextFen, moveHistory, undefined, undefined, coachSide ?? undefined, variations);
  }, [isStudentView, baseFen, moveHistory, variations, pushState, coachSide]);

  const selectLiveMove = useCallback((idx: number, varInfo?: LiveVariationRef) => {
    if (isStudentView) return;
    if (varInfo) {
      publishCoachBoardNav(varInfo, null);
      return;
    }
    publishCoachBoardNav(null, Math.max(0, idx));
  }, [isStudentView, publishCoachBoardNav]);

  const deleteLiveMoveFromHere = useCallback((idx: number) => {
    if (isStudentView) return;
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
  }, [isStudentView, variations, moveHistory, baseFen, mainLinePly, coachSide, pushState]);

  const promoteLiveVariation = useCallback((mlp: number, vgi: number) => {
    if (isStudentView) return;
    const promoted = promoteVariationLines(moveHistory, variations, mlp, vgi, baseFen);
    if (!promoted) return;
    const nextFen = liveLessonFenAt(baseFen, promoted.moves, promoted.variations, promoted.nextMoveIndex, null);
    setMoveHistory(promoted.moves);
    setVariations(promoted.variations);
    setCurrentVariation(null);
    setReplayNavPly(null);
    setFen(nextFen);
    setGame(new Chess(nextFen));
    pushState(nextFen, promoted.moves, undefined, undefined, coachSide ?? undefined, promoted.variations);
  }, [isStudentView, variations, moveHistory, baseFen, coachSide, pushState]);

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
    ? studentPlaySideResolved
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

    const commitBoard = (nextFen: string, nextMoves: string[], nextVars: Record<number, string[][]>) => {
      commitLiveBoardState(nextFen, nextMoves, nextVars);
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
            const nextFen = liveLessonFenAt(
              displayBaseFen,
              displayMoveHistory,
              appended.nextVars,
              mainLinePly,
              appended.varRef,
            );
            commitLiveBoardState(nextFen, displayMoveHistory, appended.nextVars, {
              keepVariation: appended.varRef,
            });
            return true;
          }
          const nextMoves = [...displayMoveHistory, move.san];
          commitBoard(anyTurnCopy.fen(), nextMoves, displayVariations);
          return true;
        }
        return false;
      }

      if (!move) return false;

      if (currentVariation) {
        const appended = appendToCurrentVariation(move.san);
        if (!appended) return false;
        const nextFen = liveLessonFenAt(
          displayBaseFen,
          displayMoveHistory,
          appended.nextVars,
          mainLinePly,
          appended.varRef,
        );
        commitLiveBoardState(nextFen, displayMoveHistory, appended.nextVars, {
          keepVariation: appended.varRef,
        });
        return true;
      }

      const onMainHead = mainLinePly === displayMoveHistory.length;
      if (onMainHead) {
        const nextMoves = [...displayMoveHistory, move.san];
        commitBoard(copy.fen(), nextMoves, displayVariations);
        return true;
      }

      const recorded = recordVariation(sourceSquare, targetSquare, mainLinePly);
      if (recorded) {
        const nextFen = liveLessonFenAt(
          displayBaseFen,
          displayMoveHistory,
          recorded.nextVars,
          mainLinePly,
          recorded.varRef,
        );
        commitLiveBoardState(nextFen, displayMoveHistory, recorded.nextVars, {
          keepVariation: recorded.varRef,
        });
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
    commitLiveBoardState,
    displayBaseFen,
    displayMoveHistory,
    displayVariations,
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
      if (!keyboardTargetAllowsBoardShortcut(e)) return;

      // Ctrl/Cmd+Z: son hamleyi gerçekten geri al (koçta ana tahtadan siler; öğrencide kendi tahtasında siler)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setReplayIsPlaying(false);
        setHoverFen(null);
        setCurrentVariation(null);
        setReplayNavPly(null);

        if (isStudentView) return;

        if (moveHistory.length === 0) return;
        deleteLiveMoveFromHere(moveHistory.length - 1);
        return;
      }

      if (displayMoveHistory.length === 0 && !currentVariation) return;

      if (isStudentView) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setReplayIsPlaying(false);
        if (currentVariation) {
          const [mainLinePos, varGroupIdx, varMoveIdx] = currentVariation;
          const varLine = displayVariations[mainLinePos]?.[varGroupIdx] ?? [];
          let nextVar: LiveVariationRef | null = currentVariation;
          let nextReplay: number | null = null;
          if (e.key === 'ArrowLeft') {
            if (varMoveIdx > 0) {
              nextVar = [mainLinePos, varGroupIdx, varMoveIdx - 1];
            } else {
              nextVar = null;
              nextReplay = mainLinePos;
            }
          } else if (varMoveIdx < varLine.length - 1) {
            nextVar = [mainLinePos, varGroupIdx, varMoveIdx + 1];
          } else {
            nextVar = null;
            nextReplay = mainLinePos + 1 >= displayMoveHistory.length ? null : mainLinePos + 1;
          }
          publishCoachBoardNav(nextVar, nextReplay);
          return;
        }
        const len = displayMoveHistory.length;
        const cur = replayNavPly ?? len;
        if (e.key === 'ArrowLeft') {
          publishCoachBoardNav(null, Math.max(0, cur - 1));
        } else {
          const next = Math.min(len, cur + 1);
          publishCoachBoardNav(null, next >= len ? null : next);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    moveHistory.length,
    displayMoveHistory.length,
    displayVariations,
    currentVariation,
    replayNavPly,
    isStudentView,
    deleteLiveMoveFromHere,
    publishCoachBoardNav,
  ]);

  const setCoachPlaySide = useCallback(
    (side: CollaborativeBoardSide | null) => {
      if (side) {
        try {
          sessionStorage.setItem(COACH_SIDE_STORAGE_KEY, side);
        } catch {
          /* ignore */
        }
      } else {
        try {
          sessionStorage.removeItem(COACH_SIDE_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
      setCoachSide(side);
      pushState(fen, moveHistory, arrows, marks, side);
    },
    [fen, moveHistory, arrows, marks, pushState],
  );

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

  const liveLessonDrawArrowsEnabled =
    !isStudentView && (drawingTool === 'mouse' || drawingTool === 'arrow');

  const applyLiveLessonSquareMarkAt = useCallback(
    (square: string, markType: 'circle' | 'square' = 'circle') => {
      if (isStudentView) return;
      setMarks((prev) => {
        const current = prev[square];
        if (current?.type === markType && current.color === drawingColor) {
          const next = { ...prev };
          delete next[square];
          pushState(fen, moveHistory, arrows, next, coachSide ?? undefined);
          return next;
        }
        const next = { ...prev, [square]: { color: drawingColor, type: markType } };
        pushState(fen, moveHistory, arrows, next, coachSide ?? undefined);
        return next;
      });
    },
    [isStudentView, drawingColor, fen, moveHistory, arrows, coachSide, pushState],
  );

  const handleBoardSquareRightClick = useCallback(
    (arg: unknown) => {
      if (isStudentView) return;
      const square = pickSquare(arg);
      if (!square) return;
      if (drawingTool !== 'mouse') return;
      applyLiveLessonSquareMarkAt(square, 'circle');
    },
    [isStudentView, drawingTool, applyLiveLessonSquareMarkAt],
  );

  const boardArrowsToShow = arrowsToShow;

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
    onSquareRightClick: !isStudentView && drawingTool === 'mouse' ? handleBoardSquareRightClick : undefined,
    onSquareClick: (arg: unknown) => {
      const square = pickSquare(arg);
      if (!square) return;
      if (isStudentView) return;
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
      if (drawingTool === 'mouse') return;
      if (drawingTool === 'eraser') {
        const sq = square.toLowerCase();
        const nextMarks = { ...marks };
        delete nextMarks[square];
        const nextArrows = sanitizedArrows.filter(
          (a) => a.startSquare !== sq && a.endSquare !== sq,
        );
        setMarks(nextMarks);
        setArrows(nextArrows);
        pushState(fen, moveHistory, nextArrows, nextMarks, coachSide ?? undefined);
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
    allowDrawingArrows: liveLessonDrawArrowsEnabled,
    arrows: boardArrowsToShow,
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
    onArrowsChange: (payload: unknown) => {
      if (isStudentView) return;
      const raw = Array.isArray(payload)
        ? (payload as ArrowItem[])
        : ((payload as { arrows?: ArrowItem[] } | null)?.arrows ?? []);
      const withoutPreview = raw.filter((a) => !ARROW_PREVIEW_COLORS.has(a.color));
      const next = sanitizeArrows(withoutPreview);
      const prevKeys = new Set(sanitizedArrows.map((a) => `${a.startSquare}-${a.endSquare}`));
      const colored = next.map((a) => {
        const key = `${a.startSquare}-${a.endSquare}`;
        if (!prevKeys.has(key)) {
          return { ...a, color: COLOR_VALUES[drawingColor] };
        }
        return a;
      });
      const toPersist = persistedArrows(colored);
      setArrows(toPersist);
      pushState(fen, moveHistory, toPersist, marks, coachSide ?? undefined);
    },
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

  const showLiveEvalBar = showBoardEvalBar;
  const liveEvalBarMeta = useMemo(() => {
    const terminal = getTerminalEval(boardDisplayFen);
    if (terminal) {
      return {
        score: terminalEvalToBarPawns(terminal),
        label: terminal.label,
      };
    }
    const line = enginePvLines[0];
    return {
      score: pvLineToEvalBarPawns(line, displayTurn),
      label: formatClassroomEngineScore(line, displayTurn),
    };
  }, [boardDisplayFen, enginePvLines, displayTurn]);
  const liveEvalBarScore = liveEvalBarMeta.score;

  const classroomOpenParticipation = sessionMedia.openParticipation ?? false;
  const classroomStudentsCanUnmuteSelf = sessionMedia.studentsCanUnmuteSelf ?? false;

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
                    {inviteTrainingGroups.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {inviteTrainingGroups.map((g) => {
                          const groupStudents = studentsInTrainingGroup(students, g);
                          const ids = groupStudents.map((s) => s.id);
                          const allSelected = ids.length > 0 && ids.every((id) => inviteStudentIds.includes(id));
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => toggleInviteTrainingGroup(g)}
                              title={`${g.discipline} · ${g.branchOffice}`}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                                allSelected
                                  ? 'bg-indigo-600/25 text-indigo-200 border-indigo-500/40'
                                  : 'bg-slate-800/60 text-slate-400 border-white/10 hover:border-indigo-500/30'
                              }`}
                            >
                              {g.name} ({groupStudents.length})
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 mb-3 leading-snug">
                        Henüz eğitim grubu yok. Branş–Grup sayfasından grup ekleyin.
                      </p>
                    )}
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

  if (!showClassList && isStudentView && lessonRoomClosed) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-[calc(100vh-5rem)] bg-[#0f172a] text-center px-8 rounded-2xl lg:rounded-3xl border border-white/[0.06] atmospheric-bg ring-1 ring-indigo-500/10">
        <Check className="w-14 h-14 text-emerald-400 shrink-0" aria-hidden />
        <h2 className="text-xl font-bold text-white">Ders sona erdi</h2>
        <p className="text-sm text-slate-400 max-w-md">
          Antrenör dersi bitirdi. Ders listesine yönlendiriliyorsunuz…
        </p>
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
  const boardMul = (boardScalePct / 100) * BOARD_BASE_SCALE;
  const boardViewportDeduction = mobileClassroomPanel === 'board' ? '9rem' : (isStudentView ? '12.5rem' : '15rem');
  /** Eval + rakam sütunu + alt harf satırı — tahta karesi dışındaki pay */
  const boardChromeW = showLiveEvalBar ? '2.875rem' : '1.25rem';
  const classroomEvalWidth = '1.625rem';
  const boardFileRowH = '1.25rem';
  const boardColumnStyle: CSSProperties = { width: '100%', maxWidth: '100%' };
  const boardShellStyle: CSSProperties = {
    width: `min(calc(100% * ${boardMul}), calc((100dvh - ${boardViewportDeduction}) * ${boardMul}), calc(${Math.max(280, Math.round(980 * boardMul))}px + ${boardChromeW}))`,
    maxWidth: '100%',
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
        <section className={`${mobileClassroomPanel === 'board' ? 'flex' : 'hidden'} lg:flex flex-1 lg:flex-[2.2] xl:flex-[2.5] min-w-0 min-h-0 flex-col bg-gradient-to-b from-slate-900/90 via-[#0f172a] to-slate-950 lg:border-r lg:border-white/10`}>
          <div
            className={`flex-1 flex flex-col min-h-0 items-stretch px-2 sm:px-3 lg:px-5 py-1 sm:py-2 overflow-x-hidden ${
              isStudentView
                ? 'overflow-y-auto overflow-x-hidden custom-scrollbar justify-center'
                : 'overflow-y-auto custom-scrollbar justify-start xl:justify-center'
            }`}
            >
            <div
              ref={boardVideoRowRef}
              className="flex flex-1 min-h-0 w-full max-w-full flex-col lg:flex-row items-stretch lg:items-start justify-center gap-0 lg:gap-1 xl:gap-2"
            >
            <div
              className={`${lessonBoardSizing} min-h-0 min-w-0 flex flex-col gap-2 ${
                isStudentView ? 'flex-1 min-h-0' : 'shrink-0 lg:flex-1'
              }`}
              style={boardColumnStyle}
            >
              <div
                className="flex shrink-0 flex-wrap items-center justify-start gap-2 sm:gap-3 pb-1"
                aria-label="Tahta boyutu"
              >
                {!isStudentView ? (
                  <button
                    type="button"
                    onClick={() => (onBack ? onBack() : setSelectedRoomId(null))}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                    aria-label="Geri"
                    title="Ders listesine dön"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 hidden sm:inline">
                    Tahta boyutu
                  </span>
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
                </div>
              </div>

              <div className="flex flex-1 min-h-0 w-full min-w-0 items-center justify-center gap-2 sm:gap-3 overflow-visible py-1 sm:py-2">
              {!isStudentView ? (
                <div className="shrink-0 self-center">
                  <div className="rounded-xl border border-white/10 bg-slate-900/90 p-1 shadow-lg shadow-black/30">
                    <DrawingToolbar
                      orientation="vertical"
                      currentTool={drawingTool}
                      currentColor={drawingColor}
                      onToolSelect={(t, c) => {
                        setDrawingTool(t);
                        setDrawingColor(c);
                      }}
                      onClear={() => {
                        setMarks({});
                        setArrows([]);
                        setBoardDrawRevision((r) => r + 1);
                        pushState(fen, moveHistory, [], {}, coachSide ?? undefined);
                      }}
                      onCopy={() => {
                        void navigator.clipboard?.writeText(new Chess(boardDisplayFen).fen());
                      }}
                    />
                  </div>
                </div>
              ) : null}
              <div
                className="relative mx-auto shrink-0 rounded-2xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.45)] bg-slate-900/90 ring-1 ring-indigo-500/15"
                style={boardShellStyle}
                onWheel={(e) => {
                  if (isStudentView) return;
                  // Tahta üstünde mouse wheel ile hamle gez (ArrowLeft/Right gibi).
                  // Ctrl/Cmd + wheel tarayıcı zoom/scroll davranışını bozmasın.
                  if (e.ctrlKey || e.metaKey) return;
                  const now = Date.now();
                  if (now - boardWheelNavTsRef.current < 80) return;
                  const dy = e.deltaY;
                  if (Math.abs(dy) < 2) return;
                  if (displayMoveHistory.length === 0 && !currentVariation) return;
                  e.preventDefault();
                  boardWheelNavTsRef.current = now;
                  const len = displayMoveHistory.length;
                  if (currentVariation) {
                    const [mainLinePos, varGroupIdx, varMoveIdx] = currentVariation;
                    const varLine = displayVariations[mainLinePos]?.[varGroupIdx] ?? [];
                    if (dy < 0) {
                      if (varMoveIdx > 0) {
                        publishCoachBoardNav([mainLinePos, varGroupIdx, varMoveIdx - 1], null);
                      } else {
                        publishCoachBoardNav(null, mainLinePos);
                      }
                    } else if (varMoveIdx < varLine.length - 1) {
                      publishCoachBoardNav([mainLinePos, varGroupIdx, varMoveIdx + 1], null);
                    } else {
                      publishCoachBoardNav(null, mainLinePos + 1 >= len ? null : mainLinePos + 1);
                    }
                    return;
                  }
                  const cur = replayNavPly ?? len;
                  if (dy < 0) {
                    publishCoachBoardNav(null, Math.max(0, cur - 1));
                  } else {
                    const next = Math.min(len, cur + 1);
                    publishCoachBoardNav(null, next >= len ? null : next);
                  }
                }}
              >
                <ChessBoardFrame
                  boardOrientation={boardOrientation as 'white' | 'black'}
                  evalColumnWidth={classroomEvalWidth}
                  className="w-full min-h-0"
                  shellClassName="bg-slate-900 border-r border-white/10 min-w-[1.625rem]"
                  boardClassName="min-w-0 w-full"
                  evalBar={
                    showLiveEvalBar ? (
                      <ChessEvalBar
                        score={liveEvalBarScore}
                        orientation={boardOrientation as 'white' | 'black'}
                        label={
                          engineLoading || !engineReady
                            ? '…'
                            : liveEvalBarMeta.label.slice(0, 9)
                        }
                        darkClassName="bg-slate-800 border-b border-white/10"
                        lightClassName="bg-slate-200"
                        labelClassName="text-[9px] font-bold text-slate-200 bg-slate-900/95 border-b border-white/10 py-1 leading-tight tabular-nums"
                      />
                    ) : undefined
                  }
                >
                  <div className="absolute inset-0">
                    <Chessboard
                      key={`${effectiveRoomId}-${boardDrawRevision}`}
                      options={{
                        id: `live-lesson-board-${effectiveRoomId}-${boardDrawRevision}`,
                        ...boardOptions,
                      }}
                    />
                  </div>
                </ChessBoardFrame>
              </div>
              </div>
            </div>

            <ClassroomVideoDockResizeHandle onResizeStart={handleVideoDockResizeStart} />

            {!isStudentView ? (
            <ClassroomAttendancePanel
              variant="dock"
              dockWidthPx={videoDockWidthPx}
              rosterStudents={classroomRosterStudents}
              tiles={liveVideoTiles}
              attendanceMarks={sessionMedia.attendanceMarks}
              admittedIds={sessionMedia.admittedStudentIds ?? []}
              pendingIds={sessionMedia.pendingStudentIds ?? []}
              focusedId={focusedVideoTileId}
              onFocus={setFocusedVideoTileId}
              onAdmit={admitStudentToClass}
              vbSupported={vbSupported}
              cameraBackgroundBlur={cameraBackgroundBlur}
              onToggleBlur={toggleCameraBackgroundBlur}
              vbApplying={vbApplying}
              localCamOff={localCamOff}
              mediaLoading={mediaLoading}
              floorStudentId={sessionMedia.floorStudentId}
              studentMicBlocked={sessionMedia.studentMicBlocked}
              studentCamForcedOff={sessionMedia.studentCamForcedOff}
              speakingStudentIds={speakingStudentIds}
              onToggleStudentMic={toggleCoachStudentLiveAudio}
              onToggleStudentCam={toggleCoachStudentCam}
              onOpenPrivateChat={openPrivateChatWithStudent}
              handRaisedStudentIds={sessionMedia.handRaisedStudentIds ?? []}
              onGrantSpeakFloor={grantFloorToStudent}
              onReleaseSpeakFloor={releaseSpeakFloor}
              sessionMedia={sessionMedia}
              onSetStudentPlayPermission={setStudentPlayPermission}
            />
            ) : (
            <ClassroomStudentVideoPanel
              variant="dock"
              dockWidthPx={videoDockWidthPx}
              tiles={liveVideoTiles}
              focusedId={focusedVideoTileId}
              onFocus={setFocusedVideoTileId}
              vbSupported={vbSupported}
              cameraBackgroundBlur={cameraBackgroundBlur}
              onToggleBlur={toggleCameraBackgroundBlur}
              vbApplying={vbApplying}
              localCamOff={localCamOff}
              mediaLoading={mediaLoading}
              speakingStudentIds={speakingStudentIds}
              coachIsSpeaking={speakingUids.has('coach')}
              studentSpeakFloor={
                canStudentRequestSpeak && !classroomStudentsCanUnmuteSelf
                  ? {
                      hasFloor: studentHasSpeakFloor,
                      hasRaisedHand: studentHasRaisedHand,
                      canRequest: canStudentRequestSpeak,
                      onRequest: requestSpeakFloor,
                      onCancel: cancelSpeakRequest,
                      onRelease: () => releaseSpeakFloor(),
                    }
                  : undefined
              }
            />
            )}
            </div>

            <div className={`${isStudentView ? '' : 'lg:hidden'} w-full shrink-0 max-w-lg mx-auto`}>
              {!isStudentView ? (
              <ClassroomAttendancePanel
                variant="mobile"
                rosterStudents={classroomRosterStudents}
                tiles={liveVideoTiles}
                attendanceMarks={sessionMedia.attendanceMarks}
                admittedIds={sessionMedia.admittedStudentIds ?? []}
                pendingIds={sessionMedia.pendingStudentIds ?? []}
                focusedId={focusedVideoTileId}
                onFocus={setFocusedVideoTileId}
                onAdmit={admitStudentToClass}
                vbSupported={vbSupported}
                cameraBackgroundBlur={cameraBackgroundBlur}
                onToggleBlur={toggleCameraBackgroundBlur}
                vbApplying={vbApplying}
                localCamOff={localCamOff}
                mediaLoading={mediaLoading}
                floorStudentId={sessionMedia.floorStudentId}
                studentMicBlocked={sessionMedia.studentMicBlocked}
                studentCamForcedOff={sessionMedia.studentCamForcedOff}
                speakingStudentIds={speakingStudentIds}
                onToggleStudentMic={toggleCoachStudentLiveAudio}
                onToggleStudentCam={toggleCoachStudentCam}
                onOpenPrivateChat={openPrivateChatWithStudent}
                handRaisedStudentIds={sessionMedia.handRaisedStudentIds ?? []}
                onGrantSpeakFloor={grantFloorToStudent}
                onReleaseSpeakFloor={releaseSpeakFloor}
                sessionMedia={sessionMedia}
                onSetStudentPlayPermission={setStudentPlayPermission}
              />
              ) : (
              <div className="lg:hidden">
                <ClassroomStudentVideoPanel
                  variant="mobile"
                  tiles={liveVideoTiles}
                  focusedId={focusedVideoTileId}
                  onFocus={setFocusedVideoTileId}
                  vbSupported={vbSupported}
                  cameraBackgroundBlur={cameraBackgroundBlur}
                  onToggleBlur={toggleCameraBackgroundBlur}
                  vbApplying={vbApplying}
                  localCamOff={localCamOff}
                  mediaLoading={mediaLoading}
                  speakingStudentIds={speakingStudentIds}
                  coachIsSpeaking={speakingUids.has('coach')}
                  studentSpeakFloor={
                    canStudentRequestSpeak && !classroomStudentsCanUnmuteSelf
                      ? {
                          hasFloor: studentHasSpeakFloor,
                          hasRaisedHand: studentHasRaisedHand,
                          canRequest: canStudentRequestSpeak,
                          onRequest: requestSpeakFloor,
                          onCancel: cancelSpeakRequest,
                          onRelease: () => releaseSpeakFloor(),
                        }
                      : undefined
                  }
                />
              </div>
              )}
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
                className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[4.5rem] sm:min-w-0 px-2 py-2 text-[10px] sm:text-[11px] font-semibold transition-colors border-b-2 shrink-0 snap-start sm:shrink ${
                  sidebarTab === id
                    ? id === 'sohbet' && chatNotifyCount > 0
                      ? 'text-white bg-emerald-500/15 border-emerald-400'
                      : 'text-white bg-indigo-500/15 border-indigo-500'
                    : id === 'sohbet' && chatNotifyCount > 0
                      ? 'text-emerald-200 hover:text-emerald-100 border-transparent'
                      : 'text-slate-500 hover:text-slate-200 border-transparent'
                }`}
              >
                <span className="relative">
                  <Ico className="w-3.5 h-3.5 shrink-0" />
                  {id === 'sohbet' && chatNotifyCount > 0 ? (
                    <ChatUnreadBadge
                      count={chatNotifyCount}
                      className="absolute -top-2 -right-3 min-w-[0.95rem] h-[0.95rem] text-[8px] ring-1"
                    />
                  ) : null}
                </span>
                <span className="truncate max-w-[4.5rem] sm:max-w-full px-0.5">{label}</span>
              </button>
            ))}
          </nav>

          <div className="row-start-3 min-h-0 overflow-hidden flex flex-col">
            {sidebarTab === 'analiz' && (
              <div className="flex flex-col h-full min-h-0">
                <section className="shrink-0 border-b border-white/10 px-2 py-1.5 bg-slate-800/30">
                  {isStudentView && !studentClassroomAnalysisOn ? (
                    <p className="text-[10px] text-slate-500 leading-snug rounded-lg border border-white/10 bg-slate-800/40 px-2 py-1.5">
                      Antrenör analiz panelini henüz açmadı.
                    </p>
                  ) : (
                  <>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-0.5 border-b border-white/[0.06]">
                    {!isStudentView ? (
                      <label
                        htmlFor="live-student-analysis-toggle"
                        className="flex items-center gap-1 cursor-pointer text-[8px] text-slate-400 whitespace-nowrap"
                        title="Öğrenci analiz paneli"
                      >
                        <span>Öğr. analiz</span>
                        <ClassroomToggle
                          id="live-student-analysis-toggle"
                          compact
                          on={sessionMedia.studentAnalysisVisible ?? false}
                          onToggle={() => toggleStudentAnalysisVisibility()}
                        />
                      </label>
                    ) : null}
                    {!isStudentView ? (
                      <label
                        htmlFor="live-advantage-bar-toggle"
                        className="flex items-center gap-1 cursor-pointer text-[8px] text-slate-400 whitespace-nowrap"
                        title="Tahtanın solunda avantaj çubuğu"
                      >
                        <span>Avantaj</span>
                        <ClassroomToggle
                          id="live-advantage-bar-toggle"
                          compact
                          on={engineEvalVisible}
                          onToggle={() => toggleCoachEvalBarVisible()}
                        />
                      </label>
                    ) : null}
                    {!isStudentView ? (
                      <label
                        htmlFor="live-engine-lines-toggle"
                        className="flex items-center gap-1 cursor-pointer text-[8px] text-slate-400 whitespace-nowrap"
                        title="Devam yolları (2. ve 3. satır)"
                      >
                        <span>Devam</span>
                        <ClassroomToggle
                          id="live-engine-lines-toggle"
                          compact
                          on={engineLinesVisible}
                          onToggle={() => toggleCoachEngineLinesVisible()}
                        />
                      </label>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-2 py-0.5 text-[9px] text-slate-500">
                    <span className="shrink-0 tabular-nums font-medium text-slate-400">
                      depth={enginePanelActive ? (engineLoading ? '…' : String(engineDepth || 0)) : '—'}
                    </span>
                    <span className="truncate">Stockfish 18 · lite</span>
                  </div>

                  {engineError ? (
                    <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-100/95 leading-snug">
                      {engineError}
                    </div>
                  ) : null}

                  {enginePanelActive ? (
                    <div
                      className="divide-y divide-white/[0.05] overflow-hidden rounded-md border border-white/[0.06] bg-black/20"
                      style={{ height: engineLineSlotCount * 26 }}
                    >
                      {Array.from({ length: engineLineSlotCount }).map((_, slotIdx) => {
                        const line = enginePvLines[slotIdx];
                        return (
                          <div
                            key={`pv-row-${slotIdx}`}
                            className="flex items-center h-[26px] px-1.5 gap-1.5 min-h-[26px] max-h-[26px]"
                          >
                            <span className="shrink-0 w-10 text-[11px] font-bold tabular-nums text-indigo-300 text-right">
                              {line ? formatClassroomEngineScore(line, displayTurn) : '···'}
                            </span>
                            <div className="min-w-0 flex-1 overflow-hidden">
                              {line ? (
                                <span className="block truncate whitespace-nowrap text-[12px] leading-[26px] font-mono text-slate-400">
                                  <EnginePvInteractiveMoves
                                    fen={boardDisplayFen}
                                    pvMoves={line.pv}
                                    lineIndex={slotIdx}
                                    hovered={enginePvHovered}
                                    onHoverPly={onEnginePvHoverPly}
                                    onClickPly={onEnginePvClickPly}
                                    theme="classroom"
                                    maxMoves={10}
                                  />
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-600 italic truncate">
                                  {!engineReady || engineLoading ? 'Motor…' : 'Bekleniyor…'}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  </>
                  )}
                </section>

                <div className="flex flex-col flex-1 min-h-0 border-t border-white/10">
                <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/10 shrink-0 bg-slate-800/50">
                  <span className="text-xs font-semibold text-white tracking-tight">Beyaz · Siyah</span>
                  {!isStudentView ? (
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
                  ) : null}
                </div>

                <div className="flex-1 min-h-[14rem] overflow-y-auto overflow-x-hidden p-2 bg-slate-800/35 text-[11px] custom-scrollbar">
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
                      onDeleteFromHere={!isStudentView ? deleteLiveMoveFromHere : undefined}
                      onPromoteVariation={!isStudentView ? promoteLiveVariation : undefined}
                      onHoverMove={
                        isStudentView
                          ? undefined
                          : (idx, varInfo) => {
                        if (varInfo) {
                          setHoverFen(liveLessonFenAt(displayBaseFen, displayMoveHistory, displayVariations, varInfo[0], varInfo));
                        } else if (idx == null) {
                          setHoverFen(null);
                        } else {
                          setHoverFen(liveLessonFenAt(displayBaseFen, displayMoveHistory, displayVariations, Math.max(0, idx), null));
                        }
                      }}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 px-2 py-2 border-t border-white/10 shrink-0 bg-slate-900/50">
                  {!isStudentView ? (
                  <div className="flex items-center gap-0.5 rounded-lg bg-slate-800/60 p-0.5 border border-white/[0.06]">
                    <button
                      type="button"
                      className="p-2 rounded text-slate-300 hover:bg-indigo-500/20 hover:text-white"
                      title="Başa dön"
                      onClick={() => {
                        publishCoachBoardNav(null, 0);
                      }}
                    >
                      <ChevronFirst className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      className="p-2 rounded text-slate-300 hover:bg-indigo-500/20 hover:text-white"
                      title="Önceki hamle"
                      onClick={() => {
                        const cur = replayNavPly ?? displayMoveHistory.length;
                        publishCoachBoardNav(null, Math.max(0, cur - 1));
                      }}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      className="p-2 rounded text-slate-300 hover:bg-indigo-500/20 hover:text-white"
                      title="Sonraki hamle"
                      onClick={() => {
                        const len = displayMoveHistory.length;
                        const cur = replayNavPly ?? len;
                        const next = Math.min(len, cur + 1);
                        publishCoachBoardNav(null, next >= len ? null : next);
                      }}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      className="p-2 rounded text-slate-300 hover:bg-indigo-500/20 hover:text-white"
                      title="Son konum"
                      onClick={() => {
                        if (currentVariation) {
                          const [mainLinePos, varGroupIdx] = currentVariation;
                          const varLine = displayVariations[mainLinePos]?.[varGroupIdx] ?? [];
                          if (varLine.length === 0) {
                            publishCoachBoardNav(null, null);
                          } else {
                            publishCoachBoardNav([mainLinePos, varGroupIdx, varLine.length - 1], null);
                          }
                        } else {
                          publishCoachBoardNav(null, null);
                        }
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
                  ) : (
                    <p className="text-[10px] text-slate-500 px-1 leading-snug">
                      Hamle geçmişi antrenörle senkron kalır.
                    </p>
                  )}
                  {!isStudentView ? (
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
                  ) : null}
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
                    <div className="flex items-center gap-2 min-h-[2rem] flex-wrap">
                      <label htmlFor="live-student-mic-self-toggle" className="cursor-pointer text-[13px] leading-snug text-slate-300 flex-1 min-w-0 pr-1 inline-flex items-center gap-1.5">
                        <span>Öğrenci mik. açabilir</span>
                        <HelpCircle className="w-4 h-4 shrink-0 text-slate-500" aria-hidden title="Açık: öğrenciler söz istemeden mikrofonu açabilir. Kapalı: yalnızca söz hakkı verilen konuşur." />
                      </label>
                      <ClassroomToggle
                        id="live-student-mic-self-toggle"
                        on={classroomStudentsCanUnmuteSelf}
                        onToggle={() => toggleStudentsCanUnmuteSelf()}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => muteAllStudentsRemote()}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-[12px] font-semibold text-rose-200 hover:bg-rose-950/50"
                        title="Tüm öğrencilerin mikrofonunu kapat"
                      >
                        <MicOff className="w-3.5 h-3.5 shrink-0" />
                        Tümünü sustur
                      </button>
                      <button
                        type="button"
                        onClick={() => unmuteAllStudentsRemote()}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-3 py-2 text-[12px] font-semibold text-emerald-200 hover:bg-emerald-950/40"
                        title="Öğrencilerin antrenör susturmasını kaldır"
                      >
                        <Mic className="w-3.5 h-3.5 shrink-0" />
                        Susturmayı kaldır
                      </button>
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
                        const handRaised = (sessionMedia.handRaisedStudentIds ?? []).some((kid) =>
                          idsEqual(kid, pid),
                        );
                        return (
                          <div key={pid} className="flex items-center justify-between gap-2 px-3 py-2.5">
                            <div className="min-w-0 flex items-center gap-2">
                              {handRaised ? <Hand className="w-4 h-4 text-indigo-300 shrink-0" /> : null}
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-white truncate">
                                  {pendingStudent?.name ?? pid}
                                </p>
                                <p className={`text-[11px] ${handRaised ? 'text-indigo-300' : 'text-amber-400/80'}`}>
                                  {handRaised ? 'Söz istedi' : 'Onay bekliyor'}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {handRaised ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    admitStudentToClass(pid);
                                    grantFloorToStudent(pid);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-[11px] font-bold"
                                >
                                  Söz ver
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => admitStudentToClass(pid)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-[11px] font-bold"
                              >
                                Derse al
                              </button>
                            </div>
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
                              onClick={() =>
                                hasFloor ? releaseSpeakFloor(hid) : grantFloorToStudent(hid)
                              }
                              className={`shrink-0 px-3 py-1.5 rounded-lg text-white text-[11px] font-bold ${
                                hasFloor
                                  ? 'bg-rose-600/90 hover:bg-rose-500'
                                  : 'bg-indigo-600/90 hover:bg-indigo-500'
                              }`}
                            >
                              {hasFloor ? 'Sözü kes' : 'Söz ver'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {!isStudentView ? (
                  <div className="px-3 py-3 border-b border-white/10 shrink-0">
                    <LiveAttendanceSummaryBar
                      rosterStudents={classroomRosterStudents}
                      tiles={liveVideoTiles}
                      attendanceMarks={sessionMedia.attendanceMarks}
                      admittedIds={sessionMedia.admittedStudentIds ?? []}
                      pendingIds={sessionMedia.pendingStudentIds ?? []}
                      onMarkAll={markAllLiveAttendance}
                      onSave={() => void saveLiveAttendance()}
                      onAdmitAll={admitAllPendingStudents}
                      saving={attendanceSaving}
                      saveMessage={attendanceSaveToast}
                    />
                  </div>
                ) : null}

                <div className="px-3 py-3 space-y-2 flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Katılımcılar</p>
                  <div className="rounded-xl border border-white/10 bg-slate-800/40 divide-y divide-white/10">
                    <div>
                      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {(() => {
                            const selfTile = isStudentView
                              ? liveVideoTiles.find((t) => t.isSelf)
                              : liveVideoTiles.find((t) => t.id === 'coach');
                            return selfTile ? (
                              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 ring-1 ring-white/10">
                                <ClassroomVideoTile tile={selfTile} muted={selfTile.isSelf} className="w-full h-full" showLabel={false} />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-sm font-bold text-indigo-200 shrink-0">
                                {isStudentView ? (currentStudent?.name?.charAt(0) ?? '?') : 'A'}
                              </div>
                            );
                          })()}
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
                      {isStudentView && canStudentRequestSpeak && !classroomStudentsCanUnmuteSelf ? (
                        <div className="px-3 pb-2.5">
                          <StudentSpeakFloorBar
                            hasFloor={studentHasSpeakFloor}
                            hasRaisedHand={studentHasRaisedHand}
                            canRequest={canStudentRequestSpeak}
                            onRequest={requestSpeakFloor}
                            onCancel={cancelSpeakRequest}
                            onRelease={() => releaseSpeakFloor()}
                          />
                        </div>
                      ) : null}
                    </div>
                    {(isStudentView ? visibleStudents : classroomRosterStudents).map((s) => {
                      const sid = normalizeStudentId(s.id);
                      const blocked = sessionMedia.studentMicBlocked[sid] ?? false;
                      const hasFloor = idsEqual(sessionMedia.floorStudentId, sid);
                      const handRaised = (sessionMedia.handRaisedStudentIds ?? []).some((kid) => idsEqual(kid, sid));
                      const audioCoachOpen = canStudentTransmitAudio(s.id, sessionMedia);
                      const camForcedOffByCoach = !!(sessionMedia.studentCamForcedOff[sid]);
                      const isSpeaking = speakingStudentIds.has(sid);
                      const isPending = (sessionMedia.pendingStudentIds ?? []).some((k) => idsEqual(k, sid));
                      const agoraUid = agoraUidForStudent(s.id);
                      const attStatus = resolveLiveAttendanceStatus(
                        sid,
                        sessionMedia.attendanceMarks,
                        sessionMedia.admittedStudentIds ?? [],
                        sessionMedia.pendingStudentIds ?? [],
                        !!(agoraUid && remoteStreamsByUid[agoraUid]),
                      );
                      return (
                        <div
                          key={s.id}
                          className={`${isSpeaking ? 'bg-emerald-500/10' : ''}`}
                        >
                          <div
                            className={`relative flex items-center justify-between gap-2 px-3 py-2`}
                          >
                          <div className="flex items-center gap-2 min-w-0">
                            {(() => {
                              const studentTile = liveVideoTiles.find((t) => t.id === `student-${sid}`);
                              return studentTile ? (
                                <div
                                  className={`w-10 h-10 rounded-lg overflow-hidden shrink-0 ${
                                    isSpeaking ? 'ring-2 ring-emerald-400' : 'ring-1 ring-white/10'
                                  }`}
                                >
                                  <ClassroomVideoTile
                                    tile={studentTile}
                                    muted
                                    className="w-full h-full"
                                    showLabel={false}
                                    isSpeaking={isSpeaking}
                                  />
                                </div>
                              ) : (
                                <div
                                  className={`w-10 h-10 rounded-lg bg-slate-700/80 border flex items-center justify-center text-xs font-bold text-slate-300 shrink-0 ${
                                    isSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/70' : 'border-white/10'
                                  }`}
                                >
                                  {s.name.charAt(0)}
                                </div>
                              );
                            })()}
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!isStudentView) openPrivateChatWithStudent(s.id);
                                }}
                                className="text-[13px] font-semibold text-white truncate text-left hover:text-indigo-300"
                                title={!isStudentView ? 'Özel sohbet' : undefined}
                              >
                                {s.name}
                              </button>
                              <span className={`inline-flex mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border ${liveAttendanceStatusClass(attStatus)}`}>
                                {LIVE_ATTENDANCE_STATUS_LABEL[attStatus]}
                              </span>
                              <p className="text-[11px] text-slate-400 leading-snug">
                                {handRaised && !hasFloor ? <span className="text-amber-300">Söz istedi · </span> : null}
                                {hasFloor ? <span className="text-indigo-300">Söz hakkı · </span> : null}
                                {getExplicitStudentPlaySide(s.id, sessionMedia)
                                  ? `Öğrenci: ${formatStudentSeatLabel(getExplicitStudentPlaySide(s.id, sessionMedia))}`
                                  : 'İzleyici'}
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
                              {!classroomStudentsCanUnmuteSelf && hasFloor ? (
                                <button
                                  type="button"
                                  onClick={() => releaseSpeakFloor(s.id)}
                                  className="flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-rose-500"
                                  title="Söz hakkını kes"
                                >
                                  Sözü kes
                                </button>
                              ) : !classroomStudentsCanUnmuteSelf && handRaised ? (
                                <button
                                  type="button"
                                  onClick={() => grantFloorToStudent(s.id)}
                                  className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-indigo-500"
                                  title="Söz hakkı ver"
                                >
                                  <Hand className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                  Söz ver
                                </button>
                              ) : null}
                              {!isPending ? (
                                <LiveAttendanceMarkButtons
                                  studentId={s.id}
                                  attendanceMarks={sessionMedia.attendanceMarks}
                                  resolvedStatus={attStatus}
                                  onSetMark={setLiveAttendanceMark}
                                  compact
                                />
                              ) : null}
                              <button
                                type="button"
                                onClick={() => toggleCoachStudentLiveAudio(s.id)}
                                className={`p-1.5 rounded ${audioCoachOpen ? 'bg-slate-700/80 text-slate-200' : 'bg-rose-800/60 text-white'}`}
                                title={
                                  classroomStudentsCanUnmuteSelf
                                    ? audioCoachOpen
                                      ? 'Öğrenciyi sustur'
                                      : 'Susturmayı kaldır'
                                    : audioCoachOpen
                                      ? 'Sözü kes ve mikrofonu kapat'
                                      : 'Söz hakkı ver ve mikrofonu aç'
                                }
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
                                        openPrivateChatWithStudent(s.id);
                                      }}
                                    >
                                      Özel sohbet
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full text-left px-3 py-2 text-slate-200 hover:bg-indigo-500/15 border-b border-white/10"
                                      onClick={() => {
                                        setParticipantMenuStudentId(null);
                                        setSelectedAnalysisStudentId(s.id);
                                      }}
                                    >
                                      Analiz paneli
                                    </button>
                                    <div className="border-b border-white/10" />
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
                                      <>
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="w-full text-left px-3 py-2 text-amber-200/95 hover:bg-amber-950/30 border-b border-white/10"
                                          onClick={() => void sendStudentToWaitingRoom(s.id)}
                                        >
                                          Bekleme odasına al
                                        </button>
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="w-full text-left px-3 py-2 text-red-200/95 hover:bg-red-950/40 border-b border-white/10"
                                          onClick={() => void banParticipantPermanently(s.id)}
                                        >
                                          Kalıcı çıkar
                                        </button>
                                      </>
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
                          {!isStudentView && !isPending ? (
                            <div className="px-3 pb-2.5">
                              <StudentPlaySideBar
                                playSide={getExplicitStudentPlaySide(s.id, sessionMedia)}
                                onSetPlaySide={(side) => setStudentPlayPermission(s.id, side)}
                                compact
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {sidebarTab === 'goruntu' && (
              <div className="flex flex-col flex-1 min-h-0 p-3 space-y-3 overflow-y-auto custom-scrollbar">
                <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-2">
                  <p className="text-[11px] text-indigo-200/90 leading-snug">
                    {isStudentView
                      ? 'Ana görüntü tahtanın yanında sürekli açık. Buradan derse katılanları büyütülmüş şekilde görebilirsiniz.'
                      : 'Ana görüntü tahtanın yanında sürekli açık. Buradan tüm katılımcıları büyütülmüş şekilde yönetebilirsiniz.'}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    {isStudentView ? 'Katılanlar' : 'Tüm katılımcılar'}
                  </p>
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
                {liveVideoTiles.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {liveVideoTiles.map((tile) => {
                      const tileSpeaking =
                        tile.role === 'coach'
                          ? speakingUids.has('coach')
                          : speakingStudentIds.has(
                              normalizeStudentId(tile.id.replace(/^(student-|self-)/, '')),
                            );
                      return (
                      <button
                        key={tile.id}
                        type="button"
                        onClick={() => setFocusedVideoTileId(tile.id)}
                        className={`relative aspect-video rounded-xl overflow-hidden text-left transition-all ${
                          tileSpeaking
                            ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/20'
                            : focusedVideoTileId === tile.id
                              ? 'ring-2 ring-indigo-500 shadow-lg shadow-indigo-500/20'
                              : 'ring-1 ring-white/10 hover:ring-indigo-500/40'
                        }`}
                      >
                        <ClassroomVideoTile
                          tile={tile}
                          muted={tile.isSelf}
                          className="w-full h-full rounded-xl"
                          isSpeaking={tileSpeaking}
                        />
                        {tile.isSelf && mediaLoading ? (
                          <div className="absolute top-1.5 right-1.5">
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                          </div>
                        ) : null}
                      </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 text-center py-10">Henüz görüntü yok.</p>
                )}
              </div>
            )}

            {sidebarTab === 'sohbet' && (
              <div className="flex flex-col h-full min-h-0 bg-slate-800/35">
                    {(chatPrivateStudentId || studentChatPrivate) ? (
                      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-indigo-500/30 bg-indigo-500/10">
                        <p className="text-[11px] font-semibold text-indigo-200 truncate">
                          {isStudentView
                            ? 'Özel sohbet · Antrenör'
                            : `Özel sohbet · ${students.find((s) => idsEqual(s.id, chatPrivateStudentId))?.name ?? 'Öğrenci'}`}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setChatPrivateStudentId(null);
                            setStudentChatPrivate(false);
                          }}
                          className="text-[10px] font-bold text-indigo-300 hover:text-white shrink-0"
                        >
                          Genel sohbet
                        </button>
                      </div>
                    ) : !isStudentView ? null : (
                      <div className="shrink-0 px-3 py-1.5 border-b border-white/5">
                        <button
                          type="button"
                          onClick={() => setStudentChatPrivate(true)}
                          className="text-[10px] font-bold text-indigo-300 hover:text-indigo-200"
                        >
                          Antrenöre özel mesaj
                        </button>
                      </div>
                    )}
                    {!isStudentView && classroomRosterStudents.length > 0 ? (
                      <div className="shrink-0 px-2 py-2 border-b border-white/5">
                        <p className="text-[9px] text-slate-500 px-0.5 mb-1">
                          {chatPrivateStudentId ? 'Öğrenci değiştir' : 'Özel sohbet'}
                        </p>
                        <div className="flex flex-nowrap gap-1 overflow-x-auto custom-scrollbar pb-0.5">
                          <button
                            type="button"
                            onClick={openGeneralChat}
                            title="Genel sınıf sohbeti"
                            className={`relative shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition-colors ${
                              !chatPrivateStudentId
                                ? chatUnreadStats.generalUnread > 0
                                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100'
                                  : 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-900/40'
                                : chatUnreadStats.generalUnread > 0
                                  ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-200 hover:bg-emerald-500/20'
                                  : 'bg-slate-800/80 border-white/10 text-slate-400 hover:bg-slate-700 hover:text-white'
                            }`}
                          >
                            Genel
                            {chatUnreadStats.generalUnread > 0 ? (
                              <ChatUnreadBadge count={chatUnreadStats.generalUnread} className="static ring-0 min-w-[1rem] h-4 text-[8px]" />
                            ) : null}
                          </button>
                          {classroomRosterStudents.map((s) => {
                            const sid = normalizeStudentId(s.id);
                            const isAdmitted = (sessionMedia.admittedStudentIds ?? []).some((k) => idsEqual(k, sid));
                            const isPending = (sessionMedia.pendingStudentIds ?? []).some((k) => idsEqual(k, sid));
                            const isSelected = chatPrivateStudentId ? idsEqual(chatPrivateStudentId, sid) : false;
                            const unreadCount = chatUnreadStats.privateUnreadByStudent[sid] ?? 0;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => openPrivateChatWithStudent(s.id)}
                                title={`${s.name}${unreadCount > 0 ? ` · ${unreadCount} okunmamış` : ''}`}
                                className={`relative shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition-colors ${
                                  isSelected
                                    ? unreadCount > 0
                                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100'
                                      : 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-900/40'
                                    : unreadCount > 0
                                      ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-200 hover:bg-emerald-500/20'
                                      : isAdmitted
                                        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/20'
                                        : isPending
                                          ? 'bg-amber-500/10 border-amber-500/35 text-amber-200'
                                          : 'bg-slate-800/80 border-white/10 text-slate-400 hover:bg-slate-700 hover:text-white'
                                }`}
                              >
                                <span className="max-w-[4.5rem] truncate">{shortChatStudentName(s.name)}</span>
                                {unreadCount > 0 ? (
                                  <ChatUnreadBadge count={unreadCount} className="static ring-0 min-w-[1rem] h-4 text-[8px]" />
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : !isStudentView ? (
                      <p className="shrink-0 px-3 py-2 text-[10px] text-slate-600 text-center border-b border-white/5">
                        Bu odada öğrenci listesi yok.
                      </p>
                    ) : null}
                    <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                      {visibleChatMessages.length === 0 ? (
                        <p className="text-xs text-slate-600 text-center py-6">
                          {chatPrivateStudentId || studentChatPrivate
                            ? 'Henüz mesaj yok.'
                            : isStudentView
                              ? 'Henüz mesaj yok.'
                              : 'Henüz genel mesaj yok. Yukarıdan öğrenci seçerek özel yazışma başlatabilirsiniz.'}
                        </p>
                      ) : (
                        visibleChatMessages.map((msg) => {
                          const sender = chatSenderName(msg);
                          const isCoachMsg = msg.role === 'coach';
                          const canOpenPrivate =
                            !isStudentView && msg.role === 'student' && !msg.privateWithStudentId;
                          return (
                          <div
                            key={msg.id}
                            className={`text-[13px] rounded-xl px-3 py-2 border ${
                              isCoachMsg
                                ? 'bg-indigo-500/10 border-indigo-500/25 text-slate-200'
                                : 'bg-violet-500/10 border-violet-500/25 text-slate-200 ml-4'
                            } ${msg.privateWithStudentId ? 'ring-1 ring-indigo-400/30' : ''}`}
                          >
                            {canOpenPrivate ? (
                              <button
                                type="button"
                                onClick={() => openPrivateChatWithStudent(msg.studentId)}
                                className="text-[10px] font-bold text-indigo-300 hover:text-indigo-200 mb-0.5 inline-flex items-center gap-1"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden />
                                {sender}
                              </button>
                            ) : (
                              <p className="text-[10px] font-bold text-slate-400 mb-0.5 inline-flex items-center gap-1">
                                {!isCoachMsg ? (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden />
                                ) : null}
                                {sender}
                              </p>
                            )}
                            {msg.text}
                          </div>
                          );
                        })
                      )}
                    </div>
                    <div className="p-2 border-t border-white/10 flex flex-col gap-1.5">
                      {chatSendError ? (
                        <p className="text-[11px] text-rose-400 px-1">{chatSendError}</p>
                      ) : null}
                      <div className="flex gap-2">
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                        placeholder={
                          chatPrivateStudentId || studentChatPrivate
                            ? 'Özel mesaj…'
                            : 'Mesaj…'
                        }
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
                              <span className="mr-2">{studyDisplayEmoji(sItem)}</span>
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
              {isStudentView && canStudentRequestSpeak && !classroomStudentsCanUnmuteSelf ? (
                studentHasSpeakFloor ? (
                  <button
                    type="button"
                    onClick={() => releaseSpeakFloor()}
                    className="h-9 px-2.5 flex items-center justify-center gap-1 rounded-lg bg-emerald-600/25 text-emerald-200 border border-emerald-500/30 text-[10px] font-bold uppercase hover:bg-emerald-600/35"
                    title="Söz hakkını bırak"
                  >
                    Sözü bırak
                  </button>
                ) : studentHasRaisedHand ? (
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
                    ? studentMicBlockedByCoach
                      ? 'Antrenör mikrofonunuzu kapattı'
                      : 'Mikrofon için antrenörden izin gerekir'
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
                onClick={() => {
                  setSidebarTab('sohbet');
                  setShowChatDrawer(true);
                }}
                className={`relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                  sidebarTab === 'sohbet'
                    ? chatNotifyCount > 0
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/25'
                      : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                    : chatNotifyCount > 0
                      ? 'bg-emerald-600/80 text-white hover:bg-emerald-500'
                      : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600/80'
                }`}
                title={
                  chatNotifyCount > 0
                    ? `Sohbet · ${chatNotifyCount} okunmamış mesaj`
                    : 'Sohbet'
                }
              >
                <MessageCircle className="w-4 h-4" />
                {chatNotifyCount > 0 ? (
                  <ChatUnreadBadge
                    count={chatNotifyCount}
                    className="absolute -top-1.5 -right-1.5 min-w-[1rem] h-4 text-[9px] ring-2 ring-slate-900"
                  />
                ) : null}
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
      <EngineLinePreviewPortal preview={enginePvLinePreview} boardOrientation={boardOrientation} />

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
