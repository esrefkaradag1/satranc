import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Trophy, Plus, Clock3, CalendarDays, Trash2, Users, Shuffle,
  ChevronLeft, Info, Swords, ChevronRight, Settings, UserPlus,
  CheckCircle2, Lock, Check, X, Minus, Hourglass, Flame, Shield, Search, Eye, Pencil,
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
  freeParticipants,
  pairNextRound,
  rankParticipants,
  rankTeams,
  recalcStandings,
  type PairingPlayer,
} from '../lib/tournamentPairing';
import { createTournamentGames, subscribeToTournamentGames, type TournamentGame } from '../lib/tournamentGames';
import { LiveGamesGrid, type PlayerInfo } from './tournament/LiveGamesGrid';
import { TournamentGameWatch } from './tournament/TournamentGameWatch';
import { useArenaDirector } from '../hooks/useArenaDirector';
import { getTournamentLifecycle, tournamentLengthLabel } from '../lib/tournamentStatus';
import type { Tournament, TournamentPairing, TournamentStanding, Student, Club } from '../types';

interface TournamentsProps {
  branch?: string;
  role?: 'admin' | 'club';
}

const inputCls = 'w-full px-3 py-2.5 rounded-lg text-sm bg-slate-900 border border-slate-700/60 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all';

/** `datetime-local` input, verilen Date'i YEREL saat olarak bekler — toISOString() UTC verdiği için
 * doğrudan kullanılırsa saat dilimi farkı kadar kayar. Önce yerel ofseti telafi edip öyle ISO'luyoruz. */
function toLocalDatetimeInputValue(d: Date): string {
  const localMs = d.getTime() - d.getTimezoneOffset() * 60000;
  return new Date(localMs).toISOString().slice(0, 16);
}

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

const TIME_CONTROL_PRESETS = ['3+0', '3+2', '5+0', '5+3', '10+0', '15+10', '30+0'];

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
  const [customTimeControl, setCustomTimeControl] = useState('');
  const [startAt, setStartAt] = useState(() => toLocalDatetimeInputValue(new Date(Date.now() + 3600000)));
  const [startAtError, setStartAtError] = useState('');
  const [description, setDescription] = useState('');
  const minStartAt = useMemo(() => toLocalDatetimeInputValue(new Date(Date.now() - Date.now() % 60000)), [showForm]);
  const [isRated, setIsRated] = useState(true);
  const [roundLimit, setRoundLimit] = useState(7);
  const [streakBonus, setStreakBonus] = useState(true);
  const [teamBattleOn, setTeamBattleOn] = useState(false);
  const [teamBattleSource, setTeamBattleSource] = useState<'club' | 'group'>('group');
  const [teamBattleTeamIds, setTeamBattleTeamIds] = useState<string[]>([]);
  const [teamBattleLeaders, setTeamBattleLeaders] = useState(5);
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

  const availableGroups = useMemo(
    () => Array.from(new Set(selectableStudents.map((s) => s.group).filter((g): g is string => !!g))).sort((a, b) => a.localeCompare(b, 'tr')),
    [selectableStudents],
  );

  // Düzenleme: aynı form, turnuvanın bilgileriyle dolu açılır; yalnızca ayarlar güncellenir
  // (katılımcılar, eşleşmeler, sıralama korunur).
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingTournament = useMemo(
    () => (editingId ? tournaments.find((x) => x.id === editingId) ?? null : null),
    [editingId, tournaments],
  );
  /** Eşleşme yapılmış turnuvada format değişirse puanlama/eşleştirme bozulur. */
  const formatLocked = (editingTournament?.rounds?.length ?? 0) > 0;

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setFormat('arena');
    setDurationMinutes(45);
    setTimeControl('3+2');
    setCustomTimeControl('');
    setStartAt(toLocalDatetimeInputValue(new Date(Date.now() + 3600000)));
    setStartAtError('');
    setDescription('');
    setIsRated(true);
    setRoundLimit(7);
    setStreakBonus(true);
    setTeamBattleOn(false);
    setTeamBattleSource('group');
    setTeamBattleTeamIds([]);
    setTeamBattleLeaders(5);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (t: Tournament) => {
    setEditingId(t.id);
    setName(t.name);
    setFormat(t.format);
    setDurationMinutes(t.durationMinutes);
    if (TIME_CONTROL_PRESETS.includes(t.timeControl)) {
      setTimeControl(t.timeControl);
      setCustomTimeControl('');
    } else {
      setTimeControl('custom');
      setCustomTimeControl(t.timeControl);
    }
    setStartAt(toLocalDatetimeInputValue(new Date(t.startAt)));
    setStartAtError('');
    setDescription(t.description ?? '');
    setIsRated(t.isRated);
    setRoundLimit(t.roundLimit ?? 7);
    setStreakBonus(t.streakBonus !== false);
    setTeamBattleOn(!!t.teamBattle && t.teamBattle.teamIds.length > 1);
    setTeamBattleSource(t.teamBattle?.source ?? 'group');
    setTeamBattleTeamIds(t.teamBattle?.teamIds ?? []);
    setTeamBattleLeaders(t.teamBattle?.nbLeaders ?? 5);
    setShowForm(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const startDate = new Date(startAt);
    // Düzenlemede başlangıç değişmediyse (turnuva başlamış olabilir) geçmiş zaman kabul edilir.
    const startUnchanged = !!editingTournament
      && Math.abs(new Date(editingTournament.startAt).getTime() - startDate.getTime()) < 60000;
    if (Number.isNaN(startDate.getTime()) || (!startUnchanged && startDate.getTime() < Date.now() - 60000)) {
      setStartAtError('Başlangıç zamanı şu andan ileri bir zaman olmalı.');
      return;
    }
    const resolvedTimeControl = timeControl === 'custom' ? customTimeControl.trim() : timeControl;
    const effectiveFormat = formatLocked && editingTournament ? editingTournament.format : format;
    const settings = {
      name: name.trim(),
      format: effectiveFormat,
      durationMinutes: Math.max(5, durationMinutes),
      timeControl: resolvedTimeControl || '3+2',
      startAt: startUnchanged && editingTournament ? editingTournament.startAt : startDate.toISOString(),
      description: description.trim() || undefined,
      isRated,
      roundLimit: effectiveFormat === 'swiss' ? Math.max(1, roundLimit) : undefined,
      streakBonus: effectiveFormat === 'arena' ? streakBonus : undefined,
      teamBattle: effectiveFormat === 'arena' && teamBattleOn && teamBattleTeamIds.length > 1
        ? { source: teamBattleSource, teamIds: teamBattleTeamIds, nbLeaders: Math.max(1, teamBattleLeaders) }
        : undefined,
    };
    if (editingTournament) {
      const next = { ...editingTournament, ...settings };
      // Seri bonusu / takım ayarı puanı etkiler → sıralama yeni ayarla yeniden hesaplanır.
      updateTournament(editingTournament.id, { ...settings, standings: recalcStandings(next) });
      closeForm();
      return;
    }
    addTournament({
      name: name.trim(),
      format,
      durationMinutes: Math.max(5, durationMinutes),
      timeControl: resolvedTimeControl || '3+2',
      startAt: startDate.toISOString(),
      description: description.trim() || undefined,
      isRated,
      createdByRole: role,
      createdBy: role === 'club' ? `Kulüp${branch ? ` (${branch})` : ''}` : 'Admin',
      branch: branch || undefined,
      participantIds: [],
      roundLimit: format === 'swiss' ? Math.max(1, roundLimit) : undefined,
      streakBonus: format === 'arena' ? streakBonus : undefined,
      teamBattle: format === 'arena' && teamBattleOn && teamBattleTeamIds.length > 1
        ? { source: teamBattleSource, teamIds: teamBattleTeamIds, nbLeaders: Math.max(1, teamBattleLeaders) }
        : undefined,
    });
    closeForm();
  };

  const toggleTeamBattleTeam = (teamId: string) => {
    setTeamBattleTeamIds((prev) => (prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]));
  };

  const getStatus = (t: Tournament): TournamentStatus => getTournamentLifecycle(t);

  // Oluşturma/düzenleme formu — liste ve turnuva ayrıntı ekranında ortak.
  const formModal = showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <form onSubmit={handleCreate} className="bg-slate-800 border border-slate-700/60 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-700/50 pb-4">
              <h3 className="text-base font-bold text-white">{editingTournament ? 'Turnuvayı Düzenle' : 'Yeni Turnuva Oluştur'}</h3>
              <button type="button" onClick={closeForm} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
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
                  <select
                    className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
                    value={format}
                    disabled={formatLocked}
                    title={formatLocked ? 'Eşleşme yapılmış turnuvanın formatı değiştirilemez' : undefined}
                    onChange={(e) => setFormat(e.target.value as 'arena' | 'swiss')}
                  >
                    <option value="arena">Arena</option>
                    <option value="swiss">Swiss</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Tempo</label>
                  <select className={inputCls} value={timeControl} onChange={(e) => setTimeControl(e.target.value)}>
                    {TIME_CONTROL_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>{preset}</option>
                    ))}
                    <option value="custom">Özel…</option>
                  </select>
                  {timeControl === 'custom' && (
                    <input
                      className={`${inputCls} mt-2`}
                      value={customTimeControl}
                      onChange={(e) => setCustomTimeControl(e.target.value)}
                      placeholder="Örn. 7+5"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* İsviçre süreyle değil tur sayısıyla biter; süre yalnızca Arena'da sorulur */}
                {format === 'arena' ? (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Süre (Dakika)</label>
                    <input className={inputCls} type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Tur Sayısı</label>
                    <input className={inputCls} type="number" min={1} max={30} value={roundLimit} onChange={(e) => setRoundLimit(Number(e.target.value))} />
                  </div>
                )}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Başlangıç</label>
                  <input
                    className={inputCls}
                    type="datetime-local"
                    min={editingTournament ? undefined : minStartAt}
                    value={startAt}
                    onChange={(e) => { setStartAt(e.target.value); setStartAtError(''); }}
                  />
                  {startAtError && <p className="text-[11px] text-rose-400 mt-1">{startAtError}</p>}
                </div>
              </div>

              {format === 'swiss' && (
                <p className="text-[11px] text-slate-500 -mt-2 ml-1">
                  İsviçre sisteminde süre yoktur: turnuva, belirlenen tur sayısı oynanıp son turun sonuçları girilince biter.
                </p>
              )}

              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-700/50 cursor-pointer hover:border-indigo-500/40 transition-colors group">
                <input type="checkbox" checked={isRated} onChange={(e) => setIsRated(e.target.checked)} className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500/30" />
                <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Puanlı (Rating) Turnuva</span>
              </label>

              {format === 'arena' && (
                <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-700/50 cursor-pointer hover:border-indigo-500/40 transition-colors group">
                  <input type="checkbox" checked={streakBonus} onChange={(e) => setStreakBonus(e.target.checked)} className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500/30" />
                  <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-orange-400" /> Seri Bonusu (2 galibiyetten sonra puan ikiye katlanır)
                  </span>
                </label>
              )}

              {format === 'arena' && (clubs.length > 1 || availableGroups.length > 1) && (
                <div className="rounded-xl bg-slate-900/50 border border-slate-700/50 overflow-hidden">
                  <label className="flex items-center gap-3 p-3 cursor-pointer hover:border-indigo-500/40 transition-colors group">
                    <input type="checkbox" checked={teamBattleOn} onChange={(e) => setTeamBattleOn(e.target.checked)} className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500/30" />
                    <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-indigo-400" /> Takım Savaşı (lichess Team Battle)
                    </span>
                  </label>
                  {teamBattleOn && (
                    <div className="px-3 pb-3 space-y-3">
                      {clubs.length > 1 && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setTeamBattleSource('group'); setTeamBattleTeamIds([]); }}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${teamBattleSource === 'group' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                          >
                            Gruplar (kendi kulübümde)
                          </button>
                          <button
                            type="button"
                            onClick={() => { setTeamBattleSource('club'); setTeamBattleTeamIds([]); }}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${teamBattleSource === 'club' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                          >
                            Kulüpler (birbirine karşı)
                          </button>
                        </div>
                      )}
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1">
                          {teamBattleSource === 'club' ? 'Yarışan Kulüpler (en az 2)' : 'Yarışan Gruplar (en az 2)'}
                        </label>
                        <div className="max-h-36 overflow-y-auto space-y-1 thin-scrollbar">
                          {(teamBattleSource === 'club' ? clubs.map((c) => ({ id: c.id, label: c.name })) : availableGroups.map((g) => ({ id: g, label: g }))).map((opt) => (
                            <label key={opt.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer text-sm text-slate-300">
                              <input type="checkbox" checked={teamBattleTeamIds.includes(opt.id)} onChange={() => toggleTeamBattleTeam(opt.id)} className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500/30" />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Lider Sayısı (takım puanına katkıda bulunan en iyi N oyuncu)</label>
                        <input className={inputCls} type="number" min={1} max={20} value={teamBattleLeaders} onChange={(e) => setTeamBattleLeaders(Number(e.target.value))} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Açıklama</label>
                <textarea className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Turnuva hakkında ek bilgiler..." />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={closeForm} className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold text-sm transition-colors">İptal</button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-950/30">{editingTournament ? 'Değişiklikleri Kaydet' : 'Turnuvayı Başlat'}</button>
            </div>
          </form>
        </div>
      ) : null;

  if (activeTournament) {
    return (
      <>
      {formModal}
      <TournamentViewer
        tournament={activeTournament}
        onEdit={() => openEdit(activeTournament)}
        students={selectableStudents}
        clubs={clubs}
        onBack={() => setActiveTournamentId(null)}
        onUpdate={(updates) => updateTournament(activeTournament.id, updates)}
        recalc={recalcStandings}
      />
      </>
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
          onClick={openCreate}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-950/30"
        >
          <Plus className="w-4 h-4" /> Turnuva Oluştur
        </button>
      </div>

      {formModal}

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
                      <span className="flex items-center gap-1"><Clock3 className="w-3 h-3" />{t.timeControl} · {tournamentLengthLabel(t)}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{t.participantIds?.length || 0} oyuncu</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(t); }}
                    className="p-2 rounded-lg text-slate-500 hover:text-indigo-300 hover:bg-indigo-500/10 transition-all shrink-0"
                    title="Turnuvayı düzenle"
                    aria-label={`${t.name} turnuvasını düzenle`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
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
  clubs: Club[];
  onBack: () => void;
  onUpdate: (updates: Partial<Tournament>) => void;
  recalc: (t: Tournament) => Record<string, TournamentStanding>;
  onEdit?: () => void;
}

const TournamentViewer: React.FC<ViewerProps> = ({ tournament: t, students, clubs, onBack, onUpdate, recalc, onEdit }) => {
  const showStudentCounts = useCanShowStudentCounts();
  const standings = useMemo(() => recalc(t), [t, recalc]);
  const ranking = useMemo(() => {
    return rankParticipants(t, standings)
      .map(id => ({ id, s: standings[id] || { played: 0, wins: 0, draws: 0, losses: 0, points: 0, tieBreak: 0, winStreak: 0 } }));
  }, [t, standings]);

  const teamBattleOn = !!t.teamBattle && t.teamBattle.teamIds.length > 1;
  const teamBattleSource = t.teamBattle?.source ?? 'group';

  const players: PairingPlayer[] = useMemo(
    () => students.map((s) => ({ id: s.id, rating: s.elo, team: teamBattleSource === 'club' ? s.clubId : s.group })),
    [students, teamBattleSource],
  );

  const teamRanking = useMemo(
    () => (teamBattleOn ? rankTeams(t, standings, players) : []),
    [teamBattleOn, t, standings, players],
  );
  const teamLabel = (teamId: string) => (teamBattleSource === 'club' ? (clubs.find((c) => c.id === teamId)?.name || 'Bilinmeyen Kulüp') : (teamId || 'Grup belirtilmedi'));

  const isArena = t.format === 'arena';
  const rounds = t.rounds ?? [];
  const lastRound = rounds[rounds.length - 1];
  const lastRoundComplete = !lastRound || lastRound.pairings.every((p) => !!p.result);
  const roundLimitReached = !isArena && !!t.roundLimit && rounds.length >= t.roundLimit;
  const rosterLocked = !isArena && rounds.length > 0;
  const freeCount = useMemo(() => (isArena ? freeParticipants(t).length : 0), [isArena, t]);
  const totalGames = useMemo(() => rounds.reduce((n, r) => n + r.pairings.filter((p) => !!p.result).length, 0), [rounds]);
  // Arena'da (lichess Arena gibi) sürekli eşleştirme: maçı süren oyuncular beklenmez,
  // sadece o an boşta olan (sonuçsuz eşleşmesi kalmayan) katılımcılar yeniden eşleştirilir.
  // İsviçre'de ise klasik tur mantığı: bir sonraki tur, bu turun tüm sonuçları girilmeden açılmaz.
  const canPairNextRound = isArena
    ? freeCount >= 2
    : (t.participantIds?.length ?? 0) >= 2 && lastRoundComplete && !roundLimitReached;

  // Canlı maçı olan (gameId) eşleşmeler sonucu oynanan maçtan otomatik alır (arena yöneticisi);
  // admin bağlantı sorunu vb. bir durumda bu listeye ekleyip elle sonuç girebilir.
  const [manualOverrideIds, setManualOverrideIds] = useState<Set<string>>(new Set());

  // Canlı izleme: turnuvanın maçları (mini tahtalar + izleme penceresi).
  const [liveGames, setLiveGames] = useState<TournamentGame[]>([]);
  const [watchGameId, setWatchGameId] = useState<string | null>(null);
  const activeGames = useMemo(
    () => liveGames
      .filter((g) => g.status === 'active')
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
    [liveGames],
  );
  const watchGame = useMemo(() => liveGames.find((g) => g.id === watchGameId) ?? null, [liveGames, watchGameId]);
  const rankById = useMemo(() => new Map(ranking.map((r, i) => [r.id, i + 1])), [ranking]);
  const playerInfo = useCallback(
    (id: string): PlayerInfo => ({
      name: students.find((s) => s.id === id)?.name ?? 'Bilinmiyor',
      rank: rankById.get(id) ?? null,
    }),
    [students, rankById],
  );

  // Maç listesi yalnızca canlı tahtalar için; sonuçların sıralamaya işlenmesi ve eşleştirme
  // lib/arenaDirector.ts'te (antrenör olmasa da öğrenci panelleri yürütür).
  useEffect(() => {
    if (!isArena) return;
    return subscribeToTournamentGames(t.id, setLiveGames);
  }, [isArena, t.id]);

  const { applyRemoteTournament } = useApp();
  useArenaDirector(isArena ? [t] : [], applyRemoteTournament, { allowWithoutLease: true });

  const pairNextRoundNow = async () => {
    if (!canPairNextRound) return;
    const { pairings } = pairNextRound(t, players);
    if (pairings.length === 0) return;
    const roundNo = rounds.length + 1;

    let pairingsWithGames = pairings;
    if (isArena) {
      const realPairings = pairings.filter((p): p is TournamentPairing & { blackId: string } => p.blackId != null);
      if (realPairings.length > 0) {
        const games = await createTournamentGames(realPairings.map((p) => ({
          tournamentId: t.id,
          roundNo,
          whiteStudentId: p.whiteId,
          blackStudentId: p.blackId,
          timeControl: t.timeControl,
        })));
        const gameByPair = new Map(games.map((g) => [`${g.whiteStudentId}|${g.blackStudentId}`, g]));
        pairingsWithGames = pairings.map((p) => {
          if (p.blackId == null) return p;
          const game = gameByPair.get(`${p.whiteId}|${p.blackId}`);
          return game ? { ...p, gameId: game.id } : p;
        });
      }
    }

    const nextRounds = [...rounds, {
      id: `${t.id}-r${roundNo}`,
      roundNo,
      createdAt: new Date().toISOString(),
      pairings: pairingsWithGames,
    }];
    onUpdate({
      rounds: nextRounds,
      standings: recalc({ ...t, rounds: nextRounds }),
    });
  };

  // Arena durumu (başlık etiketi için); otomatik eşleştirmeyi useArenaDirector yürütür.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isArena) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, [isArena]);
  const arenaStartMs = new Date(t.startAt).getTime();
  const arenaEndMs = arenaStartMs + Math.max(0, t.durationMinutes || 0) * 60000;
  const arenaPhase: 'upcoming' | 'running' | 'over' = !Number.isFinite(arenaStartMs) || nowMs < arenaStartMs
    ? 'upcoming'
    : nowMs < arenaEndMs ? 'running' : 'over';

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

  const applyParticipantIds = (nextIds: string[]) => {
    onUpdate({
      participantIds: nextIds,
      standings: recalc({ ...t, participantIds: nextIds })
    });
  };

  const toggleParticipant = (studentId: string) => {
    if (rosterLocked) return;
    const current = new Set(t.participantIds ?? []);
    if (current.has(studentId)) current.delete(studentId);
    else current.add(studentId);
    applyParticipantIds(Array.from(current));
  };

  const allJoined = students.length > 0 && students.every((s) => t.participantIds?.includes(s.id));
  const toggleAllParticipants = () => {
    if (rosterLocked) return;
    applyParticipantIds(allJoined ? [] : students.map((s) => s.id));
  };

  const studentGroups = useMemo(() => {
    const byGroup = new Map<string, Student[]>();
    students.forEach((s) => {
      const key = teamBattleOn ? teamLabel((teamBattleSource === 'club' ? s.clubId : s.group) || '') : (s.group || 'Grup belirtilmedi');
      const bucket = byGroup.get(key);
      if (bucket) bucket.push(s);
      else byGroup.set(key, [s]);
    });
    return Array.from(byGroup.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
      .map(([groupName, groupStudents]) => ({
        groupName,
        students: [...groupStudents].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
      }));
  }, [students, teamBattleOn, teamBattleSource]);

  const [rosterSearch, setRosterSearch] = useState('');
  const filteredStudentGroups = useMemo(() => {
    const query = rosterSearch.trim().toLocaleLowerCase('tr');
    if (!query) return studentGroups;
    return studentGroups
      .map(({ groupName, students: groupStudents }) => ({
        groupName,
        students: groupStudents.filter((s) => s.name.toLocaleLowerCase('tr').includes(query)),
      }))
      .filter(({ students: groupStudents }) => groupStudents.length > 0);
  }, [studentGroups, rosterSearch]);

  // Gruplar akordeon: varsayılan hepsi kapalı; arama yapılırken eşleşen gruplar açık gösterilir.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const toggleGroupOpen = (groupName: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  };

  const toggleGroupParticipants = (groupStudents: Student[]) => {
    if (rosterLocked) return;
    const current = new Set(t.participantIds ?? []);
    const allInGroupJoined = groupStudents.every((s) => current.has(s.id));
    groupStudents.forEach((s) => {
      if (allInGroupJoined) current.delete(s.id);
      else current.add(s.id);
    });
    applyParticipantIds(Array.from(current));
  };

  const statusPill = roundLimitReached
    ? { label: 'Turnuva tamamlandı', cls: 'bg-slate-700/50 text-slate-300' }
    : !isArena && !lastRoundComplete
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
                {onEdit && (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="shrink-0 flex items-center gap-1 rounded-full bg-slate-700/60 hover:bg-indigo-500/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300 hover:text-indigo-200 transition-colors"
                    title="Turnuva ayarlarını düzenle"
                  >
                    <Pencil className="w-3 h-3" /> Düzenle
                  </button>
                )}
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
                <div className="font-bold text-white leading-none">{isArena ? totalGames : rounds.length}{!isArena && t.roundLimit ? `/${t.roundLimit}` : ''}</div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mt-0.5">{isArena ? 'Maç' : 'Tur'}</div>
              </div>
            </div>
            {isArena && (
              <div
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap ${
                  arenaPhase === 'running'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : arenaPhase === 'upcoming'
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-slate-700/50 text-slate-400'
                }`}
                title="Maçı biten oyuncular birkaç saniye içinde yeni rakiple otomatik eşleşir; aynı rakiple tekrar eşleşme en son seçenektir."
              >
                <Shuffle className="w-4 h-4" />
                {arenaPhase === 'running'
                  ? `Otomatik eşleştirme açık${freeCount > 0 ? ` · ${freeCount} boşta` : ''}`
                  : arenaPhase === 'upcoming'
                    ? `Başlayınca otomatik eşleşir · ${new Date(t.startAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Turnuva süresi doldu'}
              </div>
            )}
            <button
              onClick={pairNextRoundNow}
              disabled={!canPairNextRound}
              title={
                isArena
                  ? (!canPairNextRound ? 'Eşleşmesi tamamlanmış en az 2 boşta oyuncu gerekiyor' : undefined)
                  : (!lastRoundComplete ? 'Önce bu turun tüm sonuçlarını girin' : roundLimitReached ? 'Planlanan tur sayısına ulaşıldı' : undefined)
              }
              className={isArena
                ? 'px-3 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors whitespace-nowrap'
                : 'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700/60 disabled:cursor-not-allowed disabled:text-slate-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-950/30 whitespace-nowrap'}
            >
              {isArena ? 'Şimdi eşleştir' : <><Shuffle className="w-4 h-4" /> {rounds.length === 0 ? '1. Turu Eşleştir' : 'Sıradaki Turu Eşleştir'}</>}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-8 space-y-6">
          {/* Team Battle standings */}
          {teamBattleOn && (
            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-700/50 flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-bold text-white">Takım Sıralaması</h2>
                <span className="text-[11px] text-slate-500 font-medium">· en iyi {t.teamBattle!.nbLeaders} oyuncunun puan toplamı</span>
              </div>
              <div className="divide-y divide-slate-700/40">
                {teamRanking.map((team, i) => (
                  <div key={team.teamId} className="flex items-center gap-4 px-5 py-3">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold shrink-0 ${
                      i === 0 ? 'bg-amber-500 text-slate-950' : i === 1 ? 'bg-slate-300 text-slate-900' : i === 2 ? 'bg-amber-700/70 text-amber-50' : 'bg-slate-900 text-slate-500'
                    }`}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white truncate">{teamLabel(team.teamId)}</div>
                      <div className="text-[11px] text-slate-500 truncate">{team.playerCount} oyuncu · liderler: {team.leaders.map((id) => students.find((s) => s.id === id)?.name || '—').join(', ') || '—'}</div>
                    </div>
                    <span className="font-bold text-white tabular-nums shrink-0">{team.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Standings */}
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-700/50">
              <h2 className="text-sm font-bold text-white">{teamBattleOn ? 'Bireysel Sıralama' : 'Turnuva Sıralaması'}</h2>
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
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-white truncate max-w-[14rem]">{student?.name || 'Anonim'}</span>
                            {isArena && t.streakBonus !== false && r.s.winStreak >= 2 && (
                              <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" aria-label="Seride, sıradaki galibiyet 4 puan eder" />
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[14rem]">{teamBattleOn ? teamLabel((teamBattleSource === 'club' ? student?.clubId : student?.group) || '') : (student?.group || 'Grup belirtilmedi')}</div>
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

          {/* Süren maçlar — lichess Arena'daki gibi küçük tahtalar */}
          {isArena && <LiveGamesGrid games={activeGames} player={playerInfo} onOpen={(g) => setWatchGameId(g.id)} />}
          {watchGame && (
            <TournamentGameWatch game={watchGame} player={playerInfo} onClose={() => setWatchGameId(null)} />
          )}

          {/* Pairings */}
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40">
            {(!rounds || rounds.length === 0) ? (
              <div className="px-5 py-14 text-center">
                <Swords className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-sm font-medium">{isArena ? 'Henüz hiçbir maç eşleştirilmedi.' : 'Henüz hiçbir tur eşleştirilmedi.'}</p>
              </div>
            ) : isArena ? (
              // Arena'da (lichess Arena gibi) sabit tur yok: tüm maçlar, oynanma sırasına göre
              // en yeniden en eskiye, sürekli tek bir akış halinde gösterilir.
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {[...rounds].reverse().flatMap((round) =>
                  round.pairings.map((p, idx) => ({ round, idx, p })),
                ).map(({ round, idx, p }) => {
                  const whiteName = students.find(s => s.id === p.whiteId)?.name ?? 'Bilinmiyor';
                  const blackName = p.blackId == null ? null : (students.find(s => s.id === p.blackId)?.name ?? 'Bilinmiyor');
                  return (
                    <div key={`${round.id}-${idx}`} className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900/50 border border-slate-700/40">
                      <div className="w-[36%] text-sm font-medium text-slate-200 truncate">{whiteName}</div>
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
                      ) : p.gameId && !manualOverrideIds.has(p.gameId) ? (
                        <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setWatchGameId(p.gameId!)}
                          title="Maçı canlı izle"
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-semibold text-[10px] uppercase tracking-wide transition-colors"
                        >
                          <Eye className="w-3 h-3" /> İzle
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualOverrideIds((prev) => new Set(prev).add(p.gameId!))}
                          title="Maç canlı oynanıyor — elle sonuç girmek için tıklayın"
                          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold text-[10px] uppercase tracking-wide transition-colors"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> Canlı
                        </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="hidden sm:flex items-center gap-1 text-[10px] font-semibold text-amber-400 mr-1"><Hourglass className="w-3 h-3" /></span>
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
                      <div className="w-[36%] text-sm font-medium text-slate-200 truncate text-right">{blackName ?? '—'}</div>
                    </div>
                  );
                })}
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
            <div className="px-5 py-3.5 border-b border-slate-700/50 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-slate-400" /> Sporcu Kaydı
              </h3>
              <div className="flex items-center gap-3 shrink-0">
                {showStudentCounts ? (
                  <span className="text-xs font-semibold text-slate-500 tabular-nums">{(t.participantIds?.length || 0)} / {students.length}</span>
                ) : null}
                <button
                  type="button"
                  onClick={toggleAllParticipants}
                  disabled={rosterLocked || students.length === 0}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {allJoined ? 'Tümünü Kaldır' : 'Tümünü Ekle'}
                </button>
              </div>
            </div>
            {rosterLocked && (
              <div className="px-5 py-2 bg-slate-900/40 border-b border-slate-700/50 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <Lock className="w-3 h-3" /> İsviçre turnuvası başladı, kayıt listesi kilitlendi
              </div>
            )}
            <div className="px-3 pt-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  placeholder="Sporcu ara…"
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-700/60 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all"
                />
              </div>
            </div>
            <div className="p-2 max-h-[420px] overflow-y-auto space-y-1 thin-scrollbar">
              {filteredStudentGroups.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-slate-500">Eşleşen sporcu bulunamadı.</p>
              )}
              {filteredStudentGroups.map(({ groupName, students: groupStudents }) => {
                const allInGroupJoined = groupStudents.every((s) => t.participantIds?.includes(s.id));
                const joinedInGroup = groupStudents.filter((s) => t.participantIds?.includes(s.id)).length;
                const isOpen = rosterSearch.trim() !== '' || openGroups.has(groupName);
                const panelId = `roster-group-${groupName.replace(/[^\w-]/g, '_')}`;
                return (
                  <div key={groupName} className="rounded-xl border border-slate-700/40 bg-slate-900/30">
                    <div className="flex items-center justify-between gap-2 pr-3">
                      <button
                        type="button"
                        onClick={() => toggleGroupOpen(groupName)}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left rounded-xl hover:bg-slate-700/20 transition-colors"
                      >
                        <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide truncate">{groupName}</span>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                          joinedInGroup > 0 ? 'bg-indigo-500/15 text-indigo-300' : 'bg-slate-700/50 text-slate-500'
                        }`}>
                          {joinedInGroup}/{groupStudents.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleGroupParticipants(groupStudents)}
                        disabled={rosterLocked}
                        className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                      >
                        {allInGroupJoined ? 'Grubu Kaldır' : 'Grubu Ekle'}
                      </button>
                    </div>
                    {isOpen && (
                    <div id={panelId} className="space-y-1 px-1 pb-1">
                      {groupStudents.map(s => {
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
                    )}
                  </div>
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
              <li>
                {isArena
                  ? <>Sıralama toplanan puanlara göre yapılır. Galibiyet <b className="text-slate-200">2 puan</b>, beraberlik <b className="text-slate-200">1 puan</b>, mağlubiyet 0 puandır.</>
                  : <>Sıralama toplanan puanlara göre yapılır. Galibiyet 1, beraberlik 0.5 puandır.</>}
              </li>
              {isArena && (
                <li>
                  {t.streakBonus !== false ? (
                    <>Üst üste <b className="text-slate-200">2 galibiyetten</b> sonra seri (ateşte) başlar; seri sürdükçe galibiyet <b className="text-slate-200 inline-flex items-center gap-1">4 puan <Flame className="w-3 h-3 text-orange-400 inline" /></b>, beraberlik ise 2 puan eder. Bir kayıp seriyi sıfırlar.</>
                  ) : (
                    <>Bu turnuvada seri bonusu kapalı — her galibiyet 1 puandır.</>
                  )}
                </li>
              )}
              {isArena && (
                <li>Maçı süren oyuncu beklenmez: boşta kalan oyuncular, diğerlerinin maçı bitmeden eşleştirilebilir (lichess Arena gibi sürekli akış).</li>
              )}
              {teamBattleOn && (
                <li className="flex items-start gap-1.5"><Shield className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" /><span>Bu bir <b className="text-slate-200">Takım Savaşı</b> ({teamBattleSource === 'club' ? 'kulüpler' : 'gruplar'} birbirine karşı): aynı takımdan iki oyuncu asla eşleşmez, her takımın puanı o takımın en iyi <b className="text-slate-200">{t.teamBattle!.nbLeaders}</b> oyuncusunun bireysel puan toplamıdır.</span></li>
              )}
              {isArena || !t.roundLimit ? (
                <li>Turnuva süresi <b className="text-slate-200">{t.durationMinutes} dakikadır</b>.</li>
              ) : (
                <li>Turnuva <b className="text-slate-200">{t.roundLimit} tur</b> oynanır; süre sınırı yoktur, son turun maçları bitince turnuva tamamlanır.</li>
              )}
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
