import React, { useEffect, useMemo, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { ChevronDown, Loader2, Radio } from 'lucide-react';
import type { Student } from '../../types';
import type { LiveStudentBoardSnapshot } from '../LiveLesson';
import { fetchStudentLivePlatformStatus } from '../../services/externalGameShareClient';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const LIST_PREVIEW = 8;
const LIVE_STATUS_POLL_MS = 20_000;

function normalizeStudentId(id: string | null | undefined): string {
  return String(id ?? '').trim();
}

function studentPlatformLabel(student: Student, snap?: LiveStudentBoardSnapshot): string {
  if (snap?.source === 'lichess') return 'Lichess.org';
  if (snap?.source === 'chesscom') return 'Chess.com';
  if (student.chessComUsername?.trim()) return 'Chess.com';
  if (student.lichessUsername?.trim()) return 'Lichess.org';
  return 'SatrancEdu';
}

function studentRating(student: Student): string {
  if (student.elo > 0) return String(student.elo);
  if (student.ukd > 0) return String(student.ukd);
  return '—';
}

type LivePlatformFlags = {
  lichessLive: boolean;
  chesscomLive: boolean;
  lichessPuzzleRecent: boolean;
  chesscomPuzzleRecent: boolean;
};

type Props = {
  students: Student[];
  studentBoards: Record<string, LiveStudentBoardSnapshot>;
  coachBoardFen: string;
  focusedStudentId: string | null;
  onlineStudentIds?: Set<string>;
  onSelectStudent: (studentId: string) => void;
  onFollowStudent: (studentId: string) => void;
  onPullLichessLive?: (studentId: string) => void;
  onPullChessComLive?: (studentId: string) => void;
  pullingLichessStudentIds?: Set<string>;
  pullingChessComStudentIds?: Set<string>;
};

function PlatformLiveButton({
  platform,
  active,
  pulling,
  disabled,
  onClick,
}: {
  platform: 'lichess' | 'chesscom';
  active: boolean;
  pulling: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const isLichess = platform === 'lichess';
  const label = isLichess ? 'Lichess canlı oyunu çek' : 'Chess.com oyununu çek (canlı/bot)';
  const activeClass = isLichess
    ? 'border-[#81b64c]/60 bg-[#81b64c]/25 text-[#b8e986] shadow-[0_0_10px_rgba(129,182,76,0.25)]'
    : 'border-emerald-400/60 bg-emerald-500/25 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.2)]';
  const idleClass = isLichess
    ? 'border-sky-500/20 bg-sky-500/5 text-sky-400/70 hover:bg-sky-500/15 hover:text-sky-300'
    : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400/70 hover:bg-emerald-500/15 hover:text-emerald-300';

  return (
    <button
      type="button"
      disabled={disabled || pulling}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center transition-all disabled:opacity-40 ${
        active ? activeClass : idleClass
      }`}
    >
      {pulling ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : isLichess ? (
        <span className="text-[10px] font-black leading-none">L</span>
      ) : (
        <span className="text-[9px] font-black leading-none">C</span>
      )}
    </button>
  );
}

export function LiveLessonStudentBoardsPanel({
  students,
  studentBoards,
  coachBoardFen,
  focusedStudentId,
  onlineStudentIds,
  onSelectStudent,
  onFollowStudent,
  onPullLichessLive,
  onPullChessComLive,
  pullingLichessStudentIds,
  pullingChessComStudentIds,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const [liveByStudent, setLiveByStudent] = useState<Record<string, LivePlatformFlags>>({});

  const list = useMemo(
    () => students.filter((s) => normalizeStudentId(s.id).length > 0),
    [students],
  );

  const visibleList = showAll ? list : list.slice(0, LIST_PREVIEW);
  const studentIdsKey = useMemo(
    () => list.map((s) => normalizeStudentId(s.id)).filter(Boolean).join(','),
    [list],
  );

  useEffect(() => {
    if (!studentIdsKey) {
      setLiveByStudent({});
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      const ids = studentIdsKey.split(',').filter(Boolean);
      const entries = await Promise.all(
        ids.map(async (sid) => {
          const status = await fetchStudentLivePlatformStatus(sid);
          return [sid, status] as const;
        }),
      );
      if (cancelled) return;
      setLiveByStudent(Object.fromEntries(entries));
    };

    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, LIVE_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [studentIdsKey]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0f172a]/50">
      <div className="shrink-0 px-3 py-2 border-b border-white/[0.06]">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          Canlı oyunlar ({list.length})
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {list.length === 0 ? (
          <p className="text-[11px] text-slate-600 text-center py-10 px-3">Derse alınan öğrenci yok.</p>
        ) : (
          visibleList.map((student) => {
            const sid = normalizeStudentId(student.id);
            const snap = studentBoards[sid];
            const fen = snap?.fen?.trim() || coachBoardFen || START_FEN;
            const isFocused = focusedStudentId === sid;
            const isOnline = onlineStudentIds?.has(sid) ?? false;
            const pullingLichess = pullingLichessStudentIds?.has(sid) ?? false;
            const pullingChessCom = pullingChessComStudentIds?.has(sid) ?? false;
            const liveFlags = liveByStudent[sid];
            const lichessActive =
              snap?.source === 'lichess'
              || !!liveFlags?.lichessLive
              || !!liveFlags?.lichessPuzzleRecent;
            const chesscomActive =
              snap?.source === 'chesscom'
              || !!liveFlags?.chesscomLive
              || !!liveFlags?.chesscomPuzzleRecent;
            const showLichessBtn = onPullLichessLive && (!!student.lichessUsername?.trim() || lichessActive);
            const showChessComBtn = onPullChessComLive && (!!student.chessComUsername?.trim() || chesscomActive);

            return (
              <div
                key={student.id}
                className={`w-full flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.04] transition-colors ${
                  isFocused ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectStudent(sid)}
                  onDoubleClick={() => onFollowStudent(sid)}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                >
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-slate-700 border border-white/10 flex items-center justify-center text-[11px] font-bold text-white">
                      {student.name.charAt(0).toUpperCase()}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                        isOnline ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-white truncate">{student.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      <span className="tabular-nums font-medium text-slate-400">{studentRating(student)}</span>
                      {' · '}
                      {studentPlatformLabel(student, snap)}
                      {lichessActive && chesscomActive ? ' · çift platform' : null}
                      {snap?.label ? ` · ${snap.label}` : ''}
                      {snap?.moves?.length ? ` · ${snap.moves.length} hamle` : ''}
                    </p>
                  </div>
                </button>

                {(showLichessBtn || showChessComBtn) ? (
                  <div className="flex items-center gap-1 shrink-0">
                    {showLichessBtn ? (
                      <PlatformLiveButton
                        platform="lichess"
                        active={lichessActive}
                        pulling={pullingLichess}
                        onClick={() => onPullLichessLive?.(sid)}
                      />
                    ) : null}
                    {showChessComBtn ? (
                      <PlatformLiveButton
                        platform="chesscom"
                        active={chesscomActive}
                        pulling={pullingChessCom}
                        onClick={() => onPullChessComLive?.(sid)}
                      />
                    ) : null}
                  </div>
                ) : (
                  <span className="shrink-0 text-[9px] text-slate-600 px-1" title="Platform kullanıcı adı yok">
                    <Radio className="w-3 h-3 opacity-40" />
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onSelectStudent(sid)}
                  onDoubleClick={() => onFollowStudent(sid)}
                  className="w-12 h-12 shrink-0 rounded-md overflow-hidden border border-white/10 bg-slate-950 shadow-inner"
                >
                  <Chessboard
                    options={{
                      id: `live-thumb-${sid}`,
                      position: fen,
                      allowDragging: false,
                      showNotation: false,
                      boardOrientation: 'white',
                    }}
                  />
                </button>
              </div>
            );
          })
        )}
        {list.length > LIST_PREVIEW && !showAll ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full py-2.5 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center justify-center gap-1"
          >
            Daha fazla göster
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
