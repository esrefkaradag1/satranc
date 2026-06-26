import React, { useCallback, useMemo, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { AlertTriangle, BookOpen, ChevronRight, Loader2, RotateCcw } from 'lucide-react';
import {
  fetchLichessGamePgn,
  type LichessGame,
  type ChessComGame,
  chessComGameInvolvesUser,
} from '../services/chessPlatformService';
import {
  inferPlayerColorFromPgn,
  JUDGEMENT_LABELS,
  reviewPlayerMovesInPgn,
  type ReviewedMove,
} from '../lib/gameMoveReview';
import { CHESSBOARD_NO_NOTATION } from '../lib/chessBoardUi';

type GamePick =
  | { source: 'lichess'; id: string; label: string; playerColor?: 'w' | 'b' }
  | { source: 'chesscom'; pgn: string; label: string; playerColor?: 'w' | 'b' };

function lichessPlayerColor(game: LichessGame, username: string): 'w' | 'b' | undefined {
  const u = username.trim().toLowerCase();
  const w = (game.players?.white?.user?.name ?? game.players?.white?.user?.id ?? '').toLowerCase();
  const b = (game.players?.black?.user?.name ?? game.players?.black?.user?.id ?? '').toLowerCase();
  if (w === u) return 'w';
  if (b === u) return 'b';
  return undefined;
}

function chessComPlayerColor(game: ChessComGame, username: string): 'w' | 'b' | undefined {
  const u = username.trim().toLowerCase();
  const w = game.white?.username?.toLowerCase() ?? '';
  const b = game.black?.username?.toLowerCase() ?? '';
  if (w === u) return 'w';
  if (b === u) return 'b';
  return undefined;
}

interface GameMistakeReviewProps {
  studentName: string;
  lichessUsername?: string;
  chessComUsername?: string;
  lichessGames: LichessGame[];
  chessComGames: ChessComGame[];
}

const judgementColor: Record<ReviewedMove['judgement'], string> = {
  inaccuracy: 'bg-amber-500/15 border-amber-500/30 text-amber-200',
  mistake: 'bg-orange-500/15 border-orange-500/30 text-orange-200',
  blunder: 'bg-rose-500/15 border-rose-500/30 text-rose-200',
  good: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200',
};

export const GameMistakeReview: React.FC<GameMistakeReviewProps> = ({
  studentName,
  lichessUsername,
  chessComUsername,
  lichessGames,
  chessComGames,
}) => {
  const [selectedGameKey, setSelectedGameKey] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState<ReviewedMove[]>([]);
  const [activeMistakeIdx, setActiveMistakeIdx] = useState(0);

  const gameOptions = useMemo((): GamePick[] => {
    const opts: GamePick[] = [];
    const lUser = lichessUsername?.trim();
    const cUser = chessComUsername?.trim().toLowerCase();

    for (const g of lichessGames.slice(0, 15)) {
      if (!g.id) continue;
      const opening = g.opening?.name?.trim();
      const date = g.createdAt ? new Date(g.createdAt).toLocaleDateString('tr-TR') : '';
      opts.push({
        source: 'lichess',
        id: g.id,
        label: `Lichess · ${opening || 'Oyun'} · ${date}`,
        playerColor: lUser ? lichessPlayerColor(g, lUser) : undefined,
      });
    }

    for (const g of chessComGames.slice(0, 10)) {
      if (!g.pgn?.trim() || !cUser || !chessComGameInvolvesUser(g, cUser)) continue;
      const date = g.end_time ? new Date(g.end_time * 1000).toLocaleDateString('tr-TR') : '';
      opts.push({
        source: 'chesscom',
        pgn: g.pgn,
        label: `Chess.com · ${g.time_class || 'oyun'} · ${date}`,
        playerColor: chessComPlayerColor(g, cUser),
      });
    }

    return opts;
  }, [lichessGames, chessComGames, lichessUsername, chessComUsername]);

  const selectedGame = useMemo(
    () => gameOptions.find((g) => `${g.source}:${g.source === 'lichess' ? g.id : g.label}` === selectedGameKey) ?? null,
    [gameOptions, selectedGameKey]
  );

  const activeMistake = mistakes[activeMistakeIdx] ?? null;

  const runReview = useCallback(async () => {
    if (!selectedGame) {
      setError('Önce bir oyun seçin.');
      return;
    }
    setReviewing(true);
    setError(null);
    setMistakes([]);
    setActiveMistakeIdx(0);
    setProgress('PGN yükleniyor…');

    try {
      let pgn: string | null = null;
      if (selectedGame.source === 'lichess') {
        pgn = await fetchLichessGamePgn(selectedGame.id);
      } else {
        pgn = selectedGame.pgn;
      }
      if (!pgn?.trim()) {
        setError('Oyun PGN verisi alınamadı.');
        return;
      }

      const lUser = lichessUsername?.trim();
      const cUser = chessComUsername?.trim();
      const color =
        selectedGame.playerColor ??
        (lUser ? inferPlayerColorFromPgn(pgn, lUser) : null) ??
        (cUser ? inferPlayerColorFromPgn(pgn, cUser) : null);

      if (!color) {
        setError('Öğrencinin bu oyundaki rengi belirlenemedi. Profildeki kullanıcı adının platformla aynı olduğundan emin olun.');
        return;
      }

      setProgress('Hamleler analiz ediliyor…');
      const result = await reviewPlayerMovesInPgn(pgn, color, {
        maxPlies: 160,
        engineLevel: 12,
        evalMovetimeMs: 600,
        onProgress: (done, total) => setProgress(`Stockfish: ${done}/${total} hamle`),
      });

      if (!result.ok) {
        setError(
          result.reason === 'parse'
            ? 'Oyun PGN formatı okunamadı. Chess.com saat notları temizlense de hamle listesi çıkarılamadı.'
            : 'PGN içinde analiz edilecek hamle bulunamadı.',
        );
        return;
      }

      setMistakes(result.mistakes);
      if (!result.mistakes.length) {
        setError('Bu oyunda belirgin hata (≥60cp kayıp) bulunamadı veya oyun çok kısa.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Oyun analizi başarısız.');
    } finally {
      setReviewing(false);
      setProgress('');
    }
  }, [selectedGame, lichessUsername, chessComUsername]);

  if (!lichessUsername?.trim() && !chessComUsername?.trim()) {
    return (
      <div className="p-6 rounded-[2rem] bg-black/20 border border-white/5 text-center">
        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
          Hatalardan ders alma için öğrenci profiline Lichess veya Chess.com kullanıcı adı ekleyin.
        </p>
      </div>
    );
  }

  if (gameOptions.length === 0) {
    return (
      <div className="p-6 rounded-[2rem] bg-black/20 border border-white/5 text-center">
        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
          Platformdan henüz oyun çekilemedi. Kullanıcı adını kontrol edin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={selectedGameKey}
          onChange={(e) => setSelectedGameKey(e.target.value)}
          className="flex-1 min-w-0 rounded-xl bg-slate-900/80 border border-white/10 text-sm text-white px-3 py-2.5 outline-none focus:border-indigo-500/50"
        >
          <option value="">Son oyunlardan seçin…</option>
          {gameOptions.map((g) => {
            const key = `${g.source}:${g.source === 'lichess' ? g.id : g.label}`;
            return (
              <option key={key} value={key}>
                {g.label}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          onClick={() => void runReview()}
          disabled={reviewing || !selectedGameKey}
          className="shrink-0 px-4 py-2.5 rounded-xl premium-gradient text-white text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {reviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
          Hataları tara
        </button>
      </div>

      {progress ? (
        <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest">{progress}</p>
      ) : null}
      {error ? (
        <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">{error}</p>
      ) : null}

      {mistakes.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
            {mistakes.map((m, idx) => (
              <button
                key={`${m.ply}-${m.san}`}
                type="button"
                onClick={() => setActiveMistakeIdx(idx)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                  idx === activeMistakeIdx
                    ? 'border-indigo-500/50 bg-indigo-500/15'
                    : 'border-white/10 bg-black/20 hover:border-indigo-500/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-white">
                    {m.moveNumber}. {m.san}
                  </span>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${judgementColor[m.judgement]}`}>
                    {JUDGEMENT_LABELS[m.judgement]}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  −{m.cpLoss} cp{m.bestSan ? ` · En iyi: ${m.bestSan}` : ''}
                </p>
              </button>
            ))}
          </div>

          {activeMistake ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3 space-y-3">
              <div className="aspect-square max-w-[280px] mx-auto rounded-xl overflow-hidden">
                <Chessboard
                  options={{
                    ...CHESSBOARD_NO_NOTATION,
                    position: activeMistake.fenBefore,
                    boardOrientation: activeMistake.color === 'w' ? 'white' : 'black',
                    allowDragging: false,
                  }}
                />
              </div>
              <div className="text-xs text-slate-300 space-y-2">
                <p>
                  <span className="text-slate-500 uppercase text-[10px] font-black tracking-widest">Oynanan</span>
                  <br />
                  <span className="text-white font-bold">{activeMistake.san}</span>
                  {' → '}
                  <span className="text-rose-300">{JUDGEMENT_LABELS[activeMistake.judgement]}</span>
                </p>
                {activeMistake.bestSan ? (
                  <p>
                    <span className="text-slate-500 uppercase text-[10px] font-black tracking-widest">Ders</span>
                    <br />
                    Bu pozisyonda <span className="text-emerald-300 font-bold">{activeMistake.bestSan}</span> oynamayı
                    deneyin; yaklaşık <span className="text-white font-bold">{activeMistake.cpLoss} cp</span> kayıp
                    yaşanmış.
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveMistakeIdx((i) => Math.min(mistakes.length - 1, i + 1))}
                  className="flex-1 py-2 rounded-xl bg-indigo-600/80 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center justify-center gap-1"
                >
                  Sonraki hata <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMistakeIdx(0)}
                  className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white"
                  title="Başa dön"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-slate-600 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                {studentName} — Bu pozisyonları çalışma dosyasına ekleyerek tekrar edebilirsiniz.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
