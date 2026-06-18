import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import {
  CheckCircle2, Clock, ExternalLink, Loader2, XCircle, Swords,
} from 'lucide-react';
import type { Student } from '../../types';
import type { ChessComPuzzleAttempt, ChessComPuzzleTab } from '../../lib/chesscomPuzzleParse';
import type { PlatformDayStats } from '../../lib/homeworkPlatformUtils';
import {
  fetchChessComPuzzlesForDay,
  capDailyPuzzleDisplay,
  type PlatformChessComPuzzleRow,
} from '../../lib/homeworkPlatformUtils';
import { selectHomeworkGoalPuzzles } from '../../lib/chesscomPuzzleParse';
import {
  chessComPuzzleAnalysisUrl,
  fetchChessComPuzzleDetail,
  fetchLichessGamePgn,
  fetchLichessGamesForDay,
  formatChessComPuzzleTime,
  type LichessGame,
} from '../../services/chessPlatformService';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION } from '../../lib/chessBoardUi';
import { ChessBoardFrame } from '../chess/ChessBoardFrame';
import ChessComPuzzleViewerModal from '../ChessComPuzzleViewerModal';
import LichessGameViewerModal from '../LichessGameViewerModal';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function pgnToFinalFen(pgn: string): string {
  try {
    const g = new Chess();
    g.loadPgn(pgn, { strict: false });
    return g.fen();
  } catch {
    return parseSetupFen(pgn) ?? START_FEN;
  }
}

function lichessGameLabel(game: LichessGame, username: string): string {
  const u = username.trim().toLowerCase();
  const isWhite = game.players?.white?.user?.name?.toLowerCase() === u
    || game.players?.white?.user?.id?.toLowerCase() === u;
  const opp = isWhite ? game.players?.black?.user?.name : game.players?.white?.user?.name;
  const result = game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '½-½';
  return `${game.speed ?? game.perf ?? 'oyun'} · ${result}${opp ? ` · ${opp}` : ''}`;
}

function lichessPlayerRating(game: LichessGame, username: string): number | undefined {
  const u = username.trim().toLowerCase();
  const white = game.players?.white;
  const black = game.players?.black;
  if (white?.user?.name?.toLowerCase() === u || white?.user?.id?.toLowerCase() === u) return white.rating;
  if (black?.user?.name?.toLowerCase() === u || black?.user?.id?.toLowerCase() === u) return black.rating;
  return undefined;
}

function formatLichessGameDuration(game: LichessGame): string {
  const start = game.createdAt;
  const end = game.lastMoveAt ?? start;
  if (!start || !end) return '—';
  const sec = Math.max(0, Math.round((end - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatLichessGameTime(ts?: number): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function lichessMatchResult(game: LichessGame, username: string): 'win' | 'loss' | 'draw' | null {
  const u = username.trim().toLowerCase();
  const isWhite = game.players?.white?.user?.name?.toLowerCase() === u
    || game.players?.white?.user?.id?.toLowerCase() === u;
  const isBlack = game.players?.black?.user?.name?.toLowerCase() === u
    || game.players?.black?.user?.id?.toLowerCase() === u;
  if (!isWhite && !isBlack) return null;
  if (!game.winner) return 'draw';
  if (game.winner === 'white') return isWhite ? 'win' : 'loss';
  return isBlack ? 'win' : 'loss';
}

const TAB_LABELS: Record<ChessComPuzzleTab, string> = {
  rated: 'Puanlı',
  learning: 'Özel',
  rush: 'Hücum',
};

function sanitizePuzzlePgn(raw: string): string {
  return raw
    .replace(/\{\[%clk[^\]]*\]\}/gi, '')
    .replace(/\{\[%eval[^\]]*\]\}/gi, '')
    .replace(/\{\[%emt[^\]]*\]\}/gi, '')
    .trim();
}

function parseSetupFen(pgn: string): string | null {
  const m = pgn.match(/\[FEN\s+"([^"]+)"\]/i);
  return m?.[1]?.trim() ?? null;
}

function buildMoveList(pgn: string): string[] {
  try {
    const g = new Chess();
    g.loadPgn(pgn, { strict: false });
    return g.history();
  } catch {
    return [];
  }
}

function formatDayLabel(dayIso: string): string {
  try {
    return new Date(`${dayIso}T12:00:00`).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dayIso;
  }
}

function formatAttemptTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

type ChessComCardProps = {
  row: PlatformChessComPuzzleRow;
  username: string;
  onOpenViewer: (attempt: ChessComPuzzleAttempt) => void;
};

const ChessComPuzzleCard: React.FC<ChessComCardProps> = ({ row, username, onOpenViewer }) => {
  const { attempt, tab } = row;
  const [loading, setLoading] = useState(true);
  const [pgn, setPgn] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPgn('');

    fetchChessComPuzzleDetail(attempt.id)
      .then((detail) => {
        if (cancelled) return;
        if (!detail?.pgn?.trim()) {
          setLoadError('Hamle verisi yüklenemedi');
          return;
        }
        setPgn(sanitizePuzzlePgn(detail.pgn));
      })
      .catch(() => {
        if (!cancelled) setLoadError('Hamle verisi yüklenemedi');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [attempt.id]);

  const moves = useMemo(() => (pgn ? buildMoveList(pgn) : []), [pgn]);
  const boardFen = useMemo(() => {
    if (pgn) {
      const setup = parseSetupFen(pgn);
      if (setup) return setup;
    }
    if (attempt.fen?.trim()) return attempt.fen;
    return START_FEN;
  }, [pgn, attempt.fen]);

  const resultMeta = attempt.passed
    ? { label: 'Doğru', icon: CheckCircle2, badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', border: 'border-emerald-500/35' }
    : { label: 'Yanlış', icon: XCircle, badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30', border: 'border-rose-500/35' };
  const StatusIcon = resultMeta.icon;

  return (
    <div className={`rounded-xl border bg-[#1a2332]/90 overflow-hidden shadow-lg ring-1 ${resultMeta.border} ring-white/5`}>
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2 bg-white/[0.02]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-[#3d6e4e] text-white">
            Chess.com
          </span>
          <span className="text-[10px] font-bold text-slate-400 uppercase">{TAB_LABELS[tab]}</span>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${resultMeta.badge}`}>
          <StatusIcon className="w-3 h-3" />
          {resultMeta.label}
        </span>
      </div>

      <div className="p-3 bg-black/25">
        <button
          type="button"
          onClick={() => onOpenViewer(attempt)}
          className="block w-full max-w-[240px] mx-auto text-left rounded-lg overflow-hidden border border-white/10 shadow-inner hover:border-emerald-500/40 transition-colors"
          title="Hamleleri göster"
        >
          <ChessBoardFrame
            boardOrientation={attempt.flipBoard ? 'black' : 'white'}
            hideCoordinates
            className="w-full"
            boardClassName="relative"
          >
            <div className="absolute inset-0 w-full h-full">
              <Chessboard
                options={{
                  id: `platform-cc-${attempt.id}`,
                  position: boardFen,
                  allowDragging: false,
                  boardOrientation: attempt.flipBoard ? 'black' : 'white',
                  darkSquareStyle: { backgroundColor: '#779952' },
                  lightSquareStyle: { backgroundColor: '#edeed1' },
                  ...CHESSBOARD_ANIMATION,
                  ...CHESSBOARD_NO_NOTATION,
                }}
              />
            </div>
          </ChessBoardFrame>
        </button>
        <p className="mt-2 text-center text-xs font-semibold text-slate-400">
          Bulmaca #{attempt.id}
        </p>
      </div>

      <div className="px-4 py-3 border-t border-white/[0.06] space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-500">Kullanıcı</span>
          <span className="font-semibold text-slate-200">@{username}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-500">Bulmaca Rating</span>
          <span className="font-semibold text-slate-200">{attempt.puzzleRating || '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-500">Hamle</span>
          <span className="font-semibold text-slate-200">
            {attempt.movesCorrect}/{attempt.movesTotal}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-500">Süre</span>
          <span className="inline-flex items-center gap-1 font-semibold text-slate-200 tabular-nums">
            <Clock className="w-3 h-3 text-slate-500" />
            {formatChessComPuzzleTime(attempt.myTimeSec)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-500">Tarih</span>
          <span className="font-semibold text-slate-300">{formatAttemptTime(attempt.date)}</span>
        </div>

        <div className="pt-2 border-t border-white/[0.06]">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Oynanan Hamleler
          </p>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Hamleler yükleniyor…
            </div>
          ) : loadError ? (
            <p className="text-xs text-amber-400/90">{loadError}</p>
          ) : moves.length > 0 ? (
            <p className="font-mono text-[11px] text-slate-300 break-all leading-relaxed">
              {moves.join(' · ')}
            </p>
          ) : attempt.movesTotal > 0 ? (
            <p className="text-xs text-slate-400">
              Chess.com özeti: {attempt.movesCorrect}/{attempt.movesTotal} hamle doğru
              {attempt.passed ? ' · çözüldü' : ' · tamamlanamadı'}
            </p>
          ) : (
            <p className="text-xs text-slate-500">Hamle kaydı yok</p>
          )}
        </div>

        <a
          href={chessComPuzzleAnalysisUrl(attempt.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 mt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Chess.com&apos;da aç
        </a>
        <button
          type="button"
          onClick={() => onOpenViewer(attempt)}
          className="block w-full mt-2 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 text-left"
        >
          Hamleleri göster →
        </button>
      </div>
    </div>
  );
};

type LichessMatchCardProps = {
  username: string;
  viewDate: string;
  gameTarget: number;
  gameGoalMet: boolean;
};

const LichessMatchGoalCard: React.FC<LichessMatchCardProps> = ({
  username,
  viewDate,
  gameTarget,
  gameGoalMet,
}) => {
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<LichessGame | null>(null);
  const [pgn, setPgn] = useState('');
  const [fen, setFen] = useState(START_FEN);
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPgnError(null);
    setGame(null);
    setPgn('');
    setFen(START_FEN);

    fetchLichessGamesForDay(username, viewDate)
      .then(async (games) => {
        if (cancelled) return;
        const pick = games.slice(0, Math.max(1, gameTarget))[0] ?? null;
        if (!pick?.id) {
          setPgnError('Bugünkü maç bulunamadı');
          return;
        }
        setGame(pick);
        const fetchedPgn = await fetchLichessGamePgn(pick.id);
        if (cancelled) return;
        if (fetchedPgn?.trim()) {
          const clean = sanitizePuzzlePgn(fetchedPgn);
          setPgn(clean);
          setFen(pgnToFinalFen(clean));
        } else {
          setPgnError('Hamle verisi yüklenemedi');
        }
      })
      .catch(() => {
        if (!cancelled) setPgnError('Lichess maçı alınamadı');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [username, viewDate, gameTarget]);

  const moves = useMemo(() => (pgn ? buildMoveList(pgn) : []), [pgn]);
  const orientation: 'white' | 'black' = (() => {
    const u = username.trim().toLowerCase();
    const w = game?.players?.white?.user?.name?.toLowerCase() ?? game?.players?.white?.user?.id?.toLowerCase();
    return w === u ? 'white' : 'black';
  })();
  const matchResult = game ? lichessMatchResult(game, username) : null;
  const resultMeta = matchResult === 'win'
    ? { label: 'Kazandı', icon: CheckCircle2, badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', border: 'border-emerald-500/35' }
    : matchResult === 'loss'
      ? { label: 'Kaybetti', icon: XCircle, badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30', border: 'border-rose-500/35' }
      : matchResult === 'draw'
        ? { label: 'Berabere', icon: Swords, badge: 'bg-slate-500/20 text-slate-300 border-slate-500/30', border: 'border-slate-500/35' }
        : gameGoalMet
          ? { label: 'Tamam', icon: CheckCircle2, badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', border: 'border-[#81b64c]/35' }
          : { label: 'Bekliyor', icon: Swords, badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30', border: 'border-slate-600/40' };
  const StatusIcon = resultMeta.icon;
  const fullMoves = moves.length > 0 ? Math.ceil(moves.length / 2) : 0;

  return (
    <>
      <div className={`rounded-xl border bg-[#1a2332]/90 overflow-hidden shadow-lg ring-1 ${resultMeta.border} ring-white/5`}>
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2 bg-white/[0.02]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-[#262421] text-[#81b64c] border border-[#81b64c]/30">
              Lichess
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Maç</span>
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${resultMeta.badge}`}>
            <StatusIcon className="w-3 h-3" />
            {resultMeta.label}
          </span>
        </div>

        <div className="p-3 bg-black/25">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              Maç yükleniyor…
            </div>
          ) : game ? (
            <>
              <button
                type="button"
                onClick={() => setViewerOpen(true)}
                className="block w-full max-w-[240px] mx-auto text-left rounded-lg overflow-hidden border border-white/10 shadow-inner hover:border-[#81b64c]/40 transition-colors"
                title="Hamleleri göster"
              >
                <ChessBoardFrame boardOrientation={orientation} hideCoordinates className="w-full" boardClassName="relative">
                  <div className="absolute inset-0 w-full h-full">
                    <Chessboard
                      options={{
                        id: `platform-lichess-${game.id}`,
                        position: fen,
                        allowDragging: false,
                        boardOrientation: orientation,
                        darkSquareStyle: { backgroundColor: '#779952' },
                        lightSquareStyle: { backgroundColor: '#edeed1' },
                        ...CHESSBOARD_ANIMATION,
                        ...CHESSBOARD_NO_NOTATION,
                      }}
                    />
                  </div>
                </ChessBoardFrame>
              </button>
              <p className="mt-2 text-center text-xs font-semibold text-slate-400 px-1">
                {lichessGameLabel(game, username)}
              </p>
            </>
          ) : (
            <p className="text-center text-xs text-amber-400/90 py-8">{pgnError ?? 'Maç yok'}</p>
          )}
        </div>

        {game ? (
          <div className="px-4 py-3 border-t border-white/[0.06] space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">Kullanıcı</span>
              <span className="font-semibold text-slate-200">@{username}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">Maç Rating</span>
              <span className="font-semibold text-slate-200">{lichessPlayerRating(game, username) ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">Hamle</span>
              <span className="font-semibold text-slate-200">
                {fullMoves > 0 ? fullMoves : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">Süre</span>
              <span className="inline-flex items-center gap-1 font-semibold text-slate-200 tabular-nums">
                <Clock className="w-3 h-3 text-slate-500" />
                {formatLichessGameDuration(game)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">Tarih</span>
              <span className="font-semibold text-slate-300">{formatLichessGameTime(game.createdAt)}</span>
            </div>
            {game.opening?.name ? (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-500">Açılış</span>
                <span className="font-semibold text-slate-300 text-right truncate max-w-[60%]">{game.opening.name}</span>
              </div>
            ) : null}

            <div className="pt-2 border-t border-white/[0.06]">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Oynanan Hamleler
              </p>
              {loading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Hamleler yükleniyor…
                </div>
              ) : pgnError ? (
                <p className="text-xs text-amber-400/90">{pgnError}</p>
              ) : moves.length > 0 ? (
                <p className="font-mono text-[11px] text-slate-300 break-all leading-relaxed">
                  {moves.join(' · ')}
                </p>
              ) : (
                <p className="text-xs text-slate-500">Hamle kaydı yok</p>
              )}
            </div>

            <a
              href={`https://lichess.org/${game.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#81b64c] hover:text-[#a5d46f] mt-1"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Lichess&apos;te aç
            </a>
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="block w-full mt-2 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 text-left"
            >
              Hamleleri göster →
            </button>
          </div>
        ) : null}
      </div>

      <LichessGameViewerModal
        game={viewerOpen && game ? game : null}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
};

type Props = {
  student: Student;
  viewDate: string;
  platformStats?: PlatformDayStats;
  dailyPuzzleTarget?: number;
  dailyGameTarget?: number;
  onGoalActivityChange?: (data: { puzzleCorrect: number; puzzleWrong: number; games: number }) => void;
};

export const PlatformDailyPuzzlesSection: React.FC<Props> = ({
  student,
  viewDate,
  platformStats,
  dailyPuzzleTarget = 0,
  dailyGameTarget = 0,
  onGoalActivityChange,
}) => {
  const [loading, setLoading] = useState(false);
  const [chessComRows, setChessComRows] = useState<PlatformChessComPuzzleRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewerAttempt, setViewerAttempt] = useState<ChessComPuzzleAttempt | null>(null);

  const lichessUsername = student.lichessUsername?.trim() || '';
  const chessComUsername = student.chessComUsername?.trim().toLowerCase() || '';

  const load = useCallback(async () => {
    if (!chessComUsername) {
      setChessComRows([]);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchChessComPuzzlesForDay(chessComUsername, viewDate);
      setChessComRows(rows);
    } catch {
      setChessComRows([]);
      setLoadError('Chess.com bulmacaları yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [chessComUsername, viewDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const lichessPuzzles = platformStats?.lichessPuzzles ?? 0;
  const lichessPassed = platformStats?.lichessPuzzlePassed ?? 0;
  const lichessFailed = platformStats?.lichessPuzzleFailed ?? 0;
  const lichessGames = platformStats?.lichessGames ?? 0;
  const chessComGames = platformStats?.chessComGames ?? 0;
  const chessComPuzzles = platformStats?.chessComPuzzles ?? 0;
  const totalGames = platformStats?.games ?? 0;
  const totalPuzzlesSolved = platformStats?.puzzleSolved ?? 0;

  const effectivePuzzleTarget = Math.max(
    dailyPuzzleTarget,
    lichessPassed + lichessFailed,
    chessComPuzzles,
    totalPuzzlesSolved,
  );
  const effectiveGameTarget = Math.max(dailyGameTarget, totalGames, lichessGames, chessComGames);

  const goalPuzzleRows = useMemo(() => {
    if (chessComRows.length === 0) return [];
    if (effectivePuzzleTarget <= 0) {
      return chessComRows.slice(0, 12);
    }
    const selected = selectHomeworkGoalPuzzles(
      chessComRows.map((r) => r.attempt),
      effectivePuzzleTarget,
    );
    const selectedIds = new Set(selected.map((a) => a.id));
    return chessComRows
      .filter((r) => selectedIds.has(r.attempt.id))
      .sort(
        (a, b) => selected.findIndex((x) => x.id === a.attempt.id)
          - selected.findIndex((x) => x.id === b.attempt.id),
      );
  }, [chessComRows, effectivePuzzleTarget]);

  const showLichessPuzzleSummary = lichessUsername && lichessPuzzles > 0 && goalPuzzleRows.length === 0;
  const gameGoalMet = effectiveGameTarget > 0 && totalGames >= effectiveGameTarget;
  const hasPlatformActivity = totalGames > 0 || totalPuzzlesSolved > 0;
  const hasContent = hasPlatformActivity
    || showLichessPuzzleSummary
    || goalPuzzleRows.length > 0
    || effectiveGameTarget > 0
    || effectivePuzzleTarget > 0
    || loading;

  useEffect(() => {
    if (!onGoalActivityChange) return;
    const puzzleCorrect = goalPuzzleRows.filter((r) => r.attempt.passed).length;
    const puzzleWrong = goalPuzzleRows.filter((r) => !r.attempt.passed).length;
    onGoalActivityChange({
      puzzleCorrect,
      puzzleWrong,
      games: totalGames,
    });
  }, [goalPuzzleRows, totalGames, onGoalActivityChange]);

  if (!lichessUsername && !chessComUsername) {
    return (
      <p className="text-center text-slate-500 py-8 text-sm">
        Öğrencinin Lichess veya Chess.com kullanıcı adı tanımlı değil.
      </p>
    );
  }

  if (!hasContent && !loadError) {
    return (
      <p className="text-center text-slate-500 py-8 text-sm">
        {formatDayLabel(viewDate)} için platform aktivitesi bulunamadı.
        {chessComUsername || lichessUsername ? ' Platform Çek ile yeniden deneyin.' : ''}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-white">Platform Aktiviteleri</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {formatDayLabel(viewDate)}
            {(effectivePuzzleTarget > 0 || effectiveGameTarget > 0) && (
              <>
                {' · '}
                Ödev hedefi:
                {effectivePuzzleTarget > 0 ? ` ${effectivePuzzleTarget} bulmaca` : ''}
                {effectivePuzzleTarget > 0 && effectiveGameTarget > 0 ? ' ·' : ''}
                {effectiveGameTarget > 0 ? ` ${effectiveGameTarget} maç` : ''}
              </>
            )}
          </p>
          {(effectivePuzzleTarget > 0 || effectiveGameTarget > 0) ? (
            <p className="text-[10px] text-slate-600 mt-1">
              Yalnızca ödev hedefi kadar kayıt gösterilir ({effectivePuzzleTarget} bulmaca{effectiveGameTarget > 0 ? ` · ${effectiveGameTarget} maç` : ''}).
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
        >
          Yenile
        </button>
      </div>

      {showLichessPuzzleSummary ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#1a2332]/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-[#262421] text-[#81b64c] border border-[#81b64c]/30">
                Lichess
              </span>
              <p className="mt-2 text-sm font-semibold text-white">@{lichessUsername}</p>
              <p className="text-xs text-slate-400 mt-1">
                Lichess API yalnızca günlük özet verir; tek tek hamle listesi bu platformda mevcut değil.
              </p>
            </div>
            <div className="text-right text-xs space-y-1">
              <p className="text-slate-500">
                Bulmaca: <span className="text-white font-bold">{lichessPuzzles}</span>
              </p>
              <p className="text-emerald-400">
                Doğru: <span className="font-bold">{lichessPassed}</span>
              </p>
              <p className="text-rose-400">
                Yanlış: <span className="font-bold">{lichessFailed}</span>
              </p>
            </div>
          </div>
          <a
            href={`https://lichess.org/@/${encodeURIComponent(lichessUsername)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#81b64c] hover:text-[#a5d46f] mt-3"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Lichess profilinde aç
          </a>
        </div>
      ) : null}

      {loading && goalPuzzleRows.length === 0 && !hasPlatformActivity ? (
        <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          Chess.com bulmacaları yükleniyor…
        </div>
      ) : null}

      {loadError ? (
        <p className="text-sm text-rose-400/90 text-center">{loadError}</p>
      ) : null}

      {goalPuzzleRows.length > 0 || lichessGames > 0 || chessComGames > 0 || effectiveGameTarget > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {lichessUsername && lichessGames > 0 ? (
            <LichessMatchGoalCard
              username={lichessUsername}
              viewDate={viewDate}
              gameTarget={Math.max(effectiveGameTarget, lichessGames)}
              gameGoalMet={gameGoalMet}
            />
          ) : effectiveGameTarget > 0 ? (
            <div className={`rounded-xl border bg-[#1a2332]/90 overflow-hidden shadow-lg ring-1 ${gameGoalMet ? 'border-sky-500/35 ring-sky-500/10' : 'border-slate-600/40 ring-slate-500/10'}`}>
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-sky-600/30 text-sky-200">
                    Maç
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Günlük hedef</span>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${gameGoalMet ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>
                  {gameGoalMet ? <CheckCircle2 className="w-3 h-3" /> : <Swords className="w-3 h-3" />}
                  {gameGoalMet ? 'Tamam' : 'Bekliyor'}
                </span>
              </div>
              <div className="px-4 py-5 space-y-2 text-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Toplam maç</span>
                  <span className="font-bold text-white tabular-nums">{Math.min(totalGames, effectiveGameTarget || totalGames)}/{effectiveGameTarget || totalGames}</span>
                </div>
                {chessComUsername ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Chess.com</span>
                    <span className="font-semibold text-slate-300">{platformStats?.chessComGames ?? 0}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {goalPuzzleRows.map((row) => (
            <ChessComPuzzleCard
              key={`${row.tab}-${row.attempt.id}`}
              row={row}
              username={chessComUsername}
              onOpenViewer={setViewerAttempt}
            />
          ))}
        </div>
      ) : null}

      <ChessComPuzzleViewerModal
        attempt={viewerAttempt}
        onClose={() => setViewerAttempt(null)}
      />

      {chessComUsername && !loading && goalPuzzleRows.length === 0 && effectivePuzzleTarget > 0 && !loadError && chessComPuzzles === 0 ? (
        <p className="text-center text-xs text-slate-500">
          Chess.com&apos;da bu gün için kayıtlı bulmaca yok.
        </p>
      ) : null}
    </div>
  );
};
