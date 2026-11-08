import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Trophy, Plus, Clock3, CalendarDays, Trash2, Users, Shuffle,
  ChevronLeft, Info, Swords, ChevronRight, Settings, UserPlus,
  CheckCircle2, Lock, Check, X, Minus, Hourglass,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { canShowStudentCounts } from '../lib/studentCountVisibility';
import { useCanShowStudentCounts } from './ui/StudentCountText';
import { filterStudentsByClub } from '../lib/clubScope';
import { resolveAuthClubId } from '../lib/supabaseClubContext';
import {
  ChessDuelloApiError,
  chessduelloStatus,
  chessduelloTournaments,
  tournamentTitle,
  type ChessDuelloTournament,
} from '../lib/chessduelloClient';
import {
  pairNextRound,
  rankParticipants,
  recalcStandings,
  type PairingPlayer,
} from '../lib/tournamentPairing';
import type { Tournament, TournamentPairing, TournamentStanding, Student } from '../types';

interface TournamentsProps {
  branch?: string;
  role?: 'admin' | 'club';
}

const inputCls = 'w-full px-3 py-2.5 rounded-lg text-sm bg-slate-900 border border-slate-700/60 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all';

function chessDuelloStatusLabel(status: string): string {
  const value = status.trim().toLowerCase();
  if (value === 'running' || value === 'active') return 'Devam ediyor';
  if (value === 'ended' || value === 'finished' || value === 'completed') return 'Tamamlandı';
  if (value === 'upcoming' || value === 'scheduled') return 'Yakında';
  return status || '—';
}

function formatChessDuelloDate(value: string | null): string {
  if (!value) return 'Tarih belirtilmemiş';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Tarih belirtilmemiş' : date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatChessDuelloLimit(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Süre sınırı yok';
  const minutes = Math.round(seconds / 60);
  return minutes > 0 ? `${minutes} dk süre sınırı` : `${seconds} sn süre sınırı`;
}

type TournamentStatus = 'upcoming' | 'ongoing' | 'finished';

const STATUS_META: Record<TournamentStatus, { label: string; dot: string; text: string }> = {
  ongoing: { label: 'Canlı', dot: 'bg-rose-500', text: 'text-rose-400' },
  upcoming: { label: 'Yakında', dot: 'bg-amber-500', text: 'text-amber-400' },
  finished: { label: 'Tamamlandı', dot: 'bg-slate-500', text: 'text-slate-400' },
};

const Tournaments: React.FC<TournamentsProps> = ({ branch, role = 'admin' }) => {
  const {
    scopedTournaments: tournaments,
    addTournament,
    updateTournament,
    deleteTournament,
    scopedStudents: students,
    scopedCoaches: coaches,
    auth,
    clubs,
    branchOfficeRecords,
  } = useApp();
  const showStudentCounts = canShowStudentCounts(auth);
  const [showForm, setShowForm] = useState(false);
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [format, setFormat] = useState<'arena' | 'swiss'>('arena');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [timeControl, setTimeControl] = useState('3+2');
  const [startAt, setStartAt] = useState(() => new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  const [description, setDescription] = useState('');
  const [isRated, setIsRated] = useState(true);
  const [roundLimit, setRoundLimit] = useState(7);
  const [chessDuelloTournaments, setChessDuelloTournaments] = useState<ChessDuelloTournament[]>([]);
  const [chessDuelloLoading, setChessDuelloLoading] = useState(true);
  const [chessDuelloError, setChessDuelloError] = useState('');

  const chessDuelloClubId = useMemo(
    () => resolveAuthClubId(auth, coaches, clubs, branchOfficeRecords) ?? (clubs.length === 1 ? clubs[0].id : ''),
    [auth, coaches, clubs, branchOfficeRecords],
  );

  const refreshChessDuello = useCallback(async () => {
    setChessDuelloLoading(true);
    setChessDuelloError('');
    try {
      const status = await chessduelloStatus(chessDuelloClubId || undefined);
      if (!status.configured) {
        setChessDuelloTournaments([]);
        return;
      }
      const response = await chessduelloTournaments(chessDuelloClubId || undefined, { limit: 100 });
      const data = response.data;
      setChessDuelloTournaments(Array.isArray(data) ? data : []);
    } catch (err) {
      setChessDuelloTournaments([]);
      setChessDuelloError(err instanceof ChessDuelloApiError ? err.message : 'ChessDuello turnuvaları alınamadı.');
    } finally {
      setChessDuelloLoading(false);
    }
  }, [chessDuelloClubId]);

  useEffect(() => {
    void refreshChessDuello();
  }, [refreshChessDuello]);

  const list = useMemo(() => {
    return [...tournaments].sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }, [tournaments]);

  const activeTournament = useMemo(() =>
    list.find(t => t.id === activeTournamentId),
    [list, activeTournamentId]
  );

  const selectableStudents = useMemo(() => {
    const base = branch ? filterStudentsByClub(students, branch, coaches) : students;
    return base.filter((s) => s.status !== 'inactive');
  }, [students, branch, coaches]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addTournament({
      name: name.trim(),
      format,
      durationMinutes: Math.max(5, durationMinutes),
      timeControl: timeControl.trim() || '3+2',
      startAt: new Date(startAt).toISOString(),
      description: description.trim() || undefined,
      isRated,
      createdByRole: role,
      createdBy: role === 'club' ? `Kulüp${branch ? ` (${branch})` : ''}` : 'Admin',
      branch: branch || undefined,
      participantIds: [],
      roundLimit: format === 'swiss' ? Math.max(1, roundLimit) : undefined,
    });
    setName('');
    setDescription('');
    setShowForm(false);
  };

  const getStatus = (t: Tournament): TournamentStatus => {
    const start = new Date(t.startAt).getTime();
    const end = start + (t.durationMinutes || 0) * 60000;
    const now = Date.now();
    if (now < start) return 'upcoming';
    if (now < end) return 'ongoing';
    return 'finished';
  };

  if (activeTournament) {
    return (
      <TournamentViewer
        tournament={activeTournament}
        students={selectableStudents}
        onBack={() => setActiveTournamentId(null)}
        onUpdate={(updates) => updateTournament(activeTournament.id, updates)}
        recalc={recalcStandings}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-indigo-400" />
            Turnuva Salonu
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {branch ? `${branch} Şubesi Turnuvaları` : 'Akademi Geneli Turnuva Yönetimi'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-950/30"
        >
          <Plus className="w-4 h-4" /> Turnuva Oluştur
        </button>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <form onSubmit={handleCreate} className="bg-slate-800 border border-slate-700/60 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-700/50 pb-4">
              <h3 className="text-base font-bold text-white">Yeni Turnuva Oluştur</h3>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Turnuva Adı</label>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Haftalık Arena..." required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Format</label>
                  <select className={inputCls} value={format} onChange={(e) => setFormat(e.target.value as 'arena' | 'swiss')}>
                    <option value="arena">Arena</option>
                    <option value="swiss">Swiss</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Tempo (3+2 vb.)</label>
                  <input className={inputCls} value={timeControl} onChange={(e) => setTimeControl(e.target.value)} placeholder="3+2" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Süre (Dakika)</label>
                  <input className={inputCls} type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Başlangıç</label>
                  <input className={inputCls} type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                </div>
              </div>

              {format === 'swiss' && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Tur Sayısı (İsviçre)</label>
                  <input className={inputCls} type="number" min={1} max={30} value={roundLimit} onChange={(e) => setRoundLimit(Number(e.target.value))} />
                </div>
              )}

              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-700/50 cursor-pointer hover:border-indigo-500/40 transition-colors group">
                <input type="checkbox" checked={isRated} onChange={(e) => setIsRated(e.target.checked)} className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500/30" />
                <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Puanlı (Rating) Turnuva</span>
              </label>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Açıklama</label>
                <textarea className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Turnuva hakkında ek bilgiler..." />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold text-sm transition-colors">İptal</button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-950/30">Turnuvayı Başlat</button>
            </div>
          </form>
        </div>
      )}

      {/* ChessDuello (external, read-only) */}
      <section className="rounded-2xl border border-slate-700/50 bg-slate-800/30">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2 min-w-0">
            <Swords className="h-4 w-4 text-slate-400 shrink-0" />
            <h2 className="text-sm font-bold text-white">ChessDuello turnuvaları</h2>
            <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Harici · salt okunur</span>
          </div>
          <button
            type="button"
            onClick={() => void refreshChessDuello()}
            disabled={chessDuelloLoading}
            className="rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-700/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-wait disabled:opacity-50"
          >
            {chessDuelloLoading ? 'Yükleniyor…' : 'Yenile'}
          </button>
        </div>

        <div className="p-4">
          {chessDuelloError ? (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{chessDuelloError}</p>
          ) : !chessDuelloLoading && chessDuelloTournaments.length === 0 ? (
            <p className="rounded-xl bg-slate-900/40 px-4 py-3 text-sm text-slate-500">Bu kulüp için ChessDuello turnuvası bulunmuyor veya bağlantı yapılandırılmamış.</p>
          ) : chessDuelloTournaments.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {chessDuelloTournaments.map((tournament) => (
                <article key={tournament.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/40 bg-slate-900/40 px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-white">{tournamentTitle(tournament)}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">{formatChessDuelloDate(tournament.startDate)} – {formatChessDuelloDate(tournament.endDate)}</p>
                    <p className="mt-1 text-xs text-slate-500">{tournament.totalPuzzles} bulmaca · {formatChessDuelloLimit(tournament.timeLimitSeconds)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-700/60 px-2 py-1 text-[10px] font-semibold text-slate-300">{chessDuelloStatusLabel(tournament.status)}</span>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* Tournament List */}
      <section className="rounded-2xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
        {list.length === 0 ? (
          <div className="py-16 text-center">
            <Trophy className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">Henüz planlanmış bir turnuva bulunmuyor.</p>
            <p className="text-slate-600 text-xs mt-1">Yukarıdaki "Turnuva Oluştur" butonuyla ilk turnuvanızı başlatın.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/40">
            {list.map((t) => {
              const status = getStatus(t);
              const meta = STATUS_META[status];
              return (
                <div
                  key={t.id}
                  onClick={() => setActiveTournamentId(t.id)}
                  className="group flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-700/20 transition-colors"
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 ${meta.dot} ${status === 'ongoing' ? 'animate-pulse' : ''}`} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white truncate">{t.name}</h3>
                      <span className="shrink-0 rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                        {t.format === 'swiss' ? 'İsviçre' : 'Arena'}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className={`font-semibold ${meta.text}`}>{meta.label}</span>
                      <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{new Date(t.startAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="flex items-center gap-1"><Clock3 className="w-3 h-3" />{t.timeControl} · {t.durationMinutes}dk</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{t.participantIds?.length || 0} oyuncu</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); deleteTournament(t.id); }}
                    className="p-2 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title="Turnuvayı sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

// --- Tournament Viewer ---
interface ViewerProps {
  tournament: Tournament;
  students: Student[];
  onBack: () => void;
  onUpdate: (updates: Partial<Tournament>) => void;
  recalc: (t: Tournament) => Record<string, TournamentStanding>;
}

const TournamentViewer: React.FC<ViewerProps> = ({ tournament: t, students, onBack, onUpdate, recalc }) => {
  const showStudentCounts = useCanShowStudentCounts();
  const standings = useMemo(() => recalc(t), [t, recalc]);
  const ranking = useMemo(() => {
    return rankParticipants(t, standings)
      .map(id => ({ id, s: standings[id] || { played: 0, wins: 0, draws: 0, losses: 0, points: 0, tieBreak: 0 } }));
  }, [t, standings]);

  const players: PairingPlayer[] = useMemo(
    () => students.map((s) => ({ id: s.id, rating: s.elo })),
    [students],
  );

  const rounds = t.rounds ?? [];
  const lastRound = rounds[rounds.length - 1];
  const lastRoundComplete = !lastRound || lastRound.pairings.every((p) => !!p.result);
  const roundLimitReached = t.format === 'swiss' && !!t.roundLimit && rounds.length >= t.roundLimit;
  const rosterLocked = t.format === 'swiss' && rounds.length > 0;
  const canPairNextRound = (t.participantIds?.length ?? 0) >= 2 && lastRoundComplete && !roundLimitReached;

  const pairNextRoundNow = () => {
    if (!canPairNextRound) return;
    const { pairings } = pairNextRound(t, players);
    if (pairings.length === 0) return;
    const roundNo = rounds.length + 1;
    const nextRounds = [...rounds, {
      id: `${t.id}-r${roundNo}`,
      roundNo,
      createdAt: new Date().toISOString(),
      pairings,
    }];
    onUpdate({
      rounds: nextRounds,
      standings: recalc({ ...t, rounds: nextRounds }),
    });
  };

  const setPairingResult = (roundId: string, pairingIdx: number, result: TournamentPairing['result']) => {
    const nextRounds = rounds.map((r) => {
      if (r.id !== roundId) return r;
      return {
        ...r,
        pairings: r.pairings.map((p, idx) => (idx === pairingIdx ? { ...p, result } : p)),
      };
    });
    onUpdate({
      rounds: nextRounds,
      standings: recalc({ ...t, rounds: nextRounds }),
    });
  };

  const toggleParticipant = (studentId: string) => {
    if (rosterLocked) return;
    const current = new Set(t.participantIds ?? []);
    if (current.has(studentId)) current.delete(studentId);
    else current.add(studentId);
    const nextIds = Array.from(current);
    onUpdate({
      participantIds: nextIds,
      standings: recalc({ ...t, participantIds: nextIds })
    });
  };

  const statusPill = roundLimitReached
    ? { label: 'Turnuva tamamlandı', cls: 'bg-slate-700/50 text-slate-300' }
    : !lastRoundComplete
      ? { label: 'Sonuç bekleniyor', cls: 'bg-amber-500/15 text-amber-300' }
      : { label: 'Katılım açık', cls: 'bg-emerald-500/15 text-emerald-300' };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <button onClick={onBack} className="p-2 rounded-lg bg-slate-900/60 border border-slate-700/50 hover:bg-slate-700/60 transition-colors shrink-0" title="Turnuva listesine dön">
              <ChevronLeft className="w-4 h-4 text-slate-300" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-white truncate">{t.name}</h1>
                <span className="shrink-0 rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">{t.format === 'swiss' ? 'İsviçre' : 'Arena'}</span>
                <span className="shrink-0 rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">{t.timeControl}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusPill.cls}`}>{statusPill.label}</span>
              </div>
              {t.description && <p className="text-slate-400 text-sm mt-1.5 max-w-xl">{t.description}</p>}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="font-bold text-white leading-none">{t.participantIds?.length || 0}</div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mt-0.5">Oyuncu</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-white leading-none">{rounds.length}{t.format === 'swiss' && t.roundLimit ? `/${t.roundLimit}` : ''}</div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mt-0.5">Tur</div>
              </div>
            </div>
            <button
              onClick={pairNextRoundNow}
              disabled={!canPairNextRound}
              title={!lastRoundComplete ? 'Önce bu turun tüm sonuçlarını girin' : roundLimitReached ? 'Planlanan tur sayısına ulaşıldı' : undefined}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700/60 disabled:cursor-not-allowed disabled:text-slate-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-950/30 whitespace-nowrap"
            >
              <Shuffle className="w-4 h-4" /> {rounds.length === 0 ? '1. Turu Eşleştir' : 'Sıradaki Turu Eşleştir'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-8 space-y-6">
          {/* Standings */}
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-700/50">
              <h2 className="text-sm font-bold text-white">Turnuva Sıralaması</h2>
            </div>

            {ranking.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <Users className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-sm font-medium">Henüz hiçbir sporcu katılmadı.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="w-10 text-center py-2 px-2">#</th>
                    <th className="text-left py-2 px-2">Oyuncu</th>
                    <th className="w-12 text-center py-2 px-2" title="Oynanan">O</th>
                    <th className="w-12 text-center py-2 px-2" title="Galibiyet">G</th>
                    <th className="w-12 text-center py-2 px-2" title="Mağlubiyet">M</th>
                    {t.format === 'swiss' && <th className="w-14 text-center py-2 px-2" title="Sonneborn-Berger derece ayırıcı">SB</th>}
                    <th className="w-16 text-center py-2 px-3">Puan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {ranking.map((r, i) => {
                    const student = students.find(s => s.id === r.id);
                    const rankCls = i === 0 ? 'bg-amber-500 text-slate-950'
                      : i === 1 ? 'bg-slate-300 text-slate-900'
                      : i === 2 ? 'bg-amber-700/70 text-amber-50'
                      : 'bg-slate-900 text-slate-500';
                    return (
                      <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-2 text-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold ${rankCls}`}>{i + 1}</span>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="font-semibold text-white truncate max-w-[14rem]">{student?.name || 'Anonim'}</div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[14rem]">{student?.group || 'Grup belirtilmedi'}</div>
                        </td>
                        <td className="py-2.5 px-2 text-center tabular-nums text-slate-300">{r.s.played}</td>
                        <td className="py-2.5 px-2 text-center tabular-nums text-emerald-400">{r.s.wins}</td>
                        <td className="py-2.5 px-2 text-center tabular-nums text-rose-400">{r.s.losses}</td>
                        {t.format === 'swiss' && <td className="py-2.5 px-2 text-center tabular-nums text-slate-500">{r.s.tieBreak}</td>}
                        <td className="py-2.5 px-3 text-center">
                          <span className="font-bold text-white tabular-nums">{r.s.points.toFixed(1).replace('.0', '')}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>

          {/* Pairings */}
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40">
            {(!rounds || rounds.length === 0) ? (
              <div className="px-5 py-14 text-center">
                <Swords className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-sm font-medium">Henüz hiçbir tur eşleştirilmedi.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/50">
                {[...rounds].reverse().map((round) => (
                  <div key={round.id} className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                        <Swords className="w-3.5 h-3.5" /> {round.roundNo}. Tur
                      </h3>
                      {round.id === lastRound?.id && !lastRoundComplete && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                          <Hourglass className="w-3 h-3" /> Sonuç bekleniyor
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {round.pairings.map((p, idx) => {
                        const whiteName = students.find(s => s.id === p.whiteId)?.name ?? 'Bilinmiyor';
                        const blackName = p.blackId == null ? null : (students.find(s => s.id === p.blackId)?.name ?? 'Bilinmiyor');
                        return (
                          <div key={idx} className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900/50 border border-slate-700/40">
                            <div className="w-[40%] text-sm font-medium text-slate-200 truncate">{whiteName}</div>
                            {blackName === null ? (
                              <span className="shrink-0 rounded-md bg-emerald-500/15 text-emerald-400 font-semibold text-[10px] uppercase tracking-wide px-2 py-1">BAY</span>
                            ) : p.result ? (
                              <button
                                type="button"
                                onClick={() => setPairingResult(round.id, idx, undefined)}
                                title="Sonucu düzenle"
                                className="shrink-0 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-bold text-xs tabular-nums transition-colors"
                              >
                                {p.result}
                              </button>
                            ) : (
                              <div className="flex items-center gap-1 shrink-0">
                                <button type="button" onClick={() => setPairingResult(round.id, idx, '1-0')} title={`${whiteName} kazandı`} className="w-6 h-6 rounded-md bg-slate-800 hover:bg-emerald-600 text-slate-500 hover:text-white flex items-center justify-center transition-colors">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button type="button" onClick={() => setPairingResult(round.id, idx, '1/2-1/2')} title="Berabere" className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-500 text-slate-500 hover:text-white flex items-center justify-center transition-colors">
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <button type="button" onClick={() => setPairingResult(round.id, idx, '0-1')} title={`${blackName} kazandı`} className="w-6 h-6 rounded-md bg-slate-800 hover:bg-rose-600 text-slate-500 hover:text-white flex items-center justify-center transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                            <div className="w-[40%] text-sm font-medium text-slate-200 truncate text-right">{blackName ?? '—'}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-4 space-y-6">
          {/* Participants */}
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-700/50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-slate-400" /> Sporcu Kaydı
              </h3>
              {showStudentCounts ? (
                <span className="text-xs font-semibold text-slate-500 tabular-nums">{(t.participantIds?.length || 0)} / {students.length}</span>
              ) : null}
            </div>
            {rosterLocked && (
              <div className="px-5 py-2 bg-slate-900/40 border-b border-slate-700/50 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <Lock className="w-3 h-3" /> İsviçre turnuvası başladı, kayıt listesi kilitlendi
              </div>
            )}
            <div className="p-2 max-h-[420px] overflow-y-auto space-y-1 thin-scrollbar">
              {students.map(s => {
                const isJoined = t.participantIds?.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleParticipant(s.id)}
                    disabled={rosterLocked}
                    className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl border transition-colors text-left ${
                      rosterLocked ? 'opacity-50 cursor-not-allowed' : ''
                    } ${
                      isJoined
                        ? 'bg-indigo-500/10 border-indigo-500/30'
                        : 'bg-transparent border-transparent hover:bg-slate-700/30'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className={`font-medium text-sm truncate ${isJoined ? 'text-indigo-300' : 'text-slate-300'}`}>{s.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{s.group}</div>
                    </div>
                    <div className={`p-1 rounded-md shrink-0 ${isJoined ? 'text-indigo-400' : 'text-slate-600'}`}>
                      {isJoined ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rules & Info */}
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-5 space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Info className="w-4 h-4 text-slate-400" /> Kurallar &amp; Bilgi
            </h4>
            <ul className="space-y-3 text-[13px] leading-relaxed text-slate-400">
              <li>Bu bir <b className="text-slate-200">{t.format === 'swiss' ? 'İsviçre' : 'Arena'}</b> turnuvasıdır.</li>
              <li>Sıralama toplanan puanlara göre yapılır. Galibiyet 1, beraberlik 0.5 puandır.</li>
              <li>Turnuva süresi <b className="text-slate-200">{t.durationMinutes} dakikadır</b>.</li>
            </ul>
            <div className="pt-3 border-t border-slate-700/50 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Organizasyon</div>
                <div className="text-xs font-semibold text-slate-300 mt-0.5">{t.createdBy}</div>
              </div>
              <Settings className="w-4 h-4 text-slate-600" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tournaments;
