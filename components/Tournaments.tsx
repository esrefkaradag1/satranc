import React, { useMemo, useState, useEffect } from 'react';
import { 
  Trophy, Plus, Clock3, CalendarDays, Trash2, Users, Shuffle, 
  ChevronLeft, Play, Info, MessageSquare, Swords, Flame, 
  ChevronRight, ArrowRight, Settings, UserPlus, CheckCircle2
} from 'lucide-react';
import { useApp } from '../AppContext';
import { filterStudentsByClub } from '../lib/clubScope';
import type { Tournament, TournamentPairing, TournamentStanding, Student } from '../types';

interface TournamentsProps {
  branch?: string;
  role?: 'admin' | 'club';
}

const inputCls = 'w-full px-3 py-2.5 rounded-lg text-sm bg-slate-900 border border-slate-700/60 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all';

const Tournaments: React.FC<TournamentsProps> = ({ branch, role = 'admin' }) => {
  const { scopedTournaments: tournaments, addTournament, updateTournament, deleteTournament, scopedStudents: students, scopedCoaches: coaches } = useApp();
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

  const list = useMemo(() => {
    const base = tournaments;
    return base.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }, [tournaments]);

  const activeTournament = useMemo(() => 
    list.find(t => t.id === activeTournamentId), 
    [list, activeTournamentId]
  );

  const selectableStudents = useMemo(() => {
    const base = branch ? filterStudentsByClub(students, branch, coaches) : students;
    return base.filter((s) => s.status !== 'inactive');
  }, [students, branch, coaches]);

  const emptyStanding = (): TournamentStanding => ({ played: 0, wins: 0, draws: 0, losses: 0, points: 0 });

  const recalcStandings = (t: Tournament): Record<string, TournamentStanding> => {
    const standings: Record<string, TournamentStanding> = {};
    for (const id of t.participantIds ?? []) standings[id] = emptyStanding();
    
    for (const r of t.rounds ?? []) {
      for (const p of r.pairings) {
        standings[p.whiteId] ??= emptyStanding();
        standings[p.blackId] ??= emptyStanding();
        standings[p.whiteId].played += 1;
        standings[p.blackId].played += 1;
        if (p.result === '1-0') {
          standings[p.whiteId].wins += 1;
          standings[p.whiteId].points += 1;
          standings[p.blackId].losses += 1;
        } else if (p.result === '0-1') {
          standings[p.blackId].wins += 1;
          standings[p.blackId].points += 1;
          standings[p.whiteId].losses += 1;
        } else {
          standings[p.whiteId].draws += 1;
          standings[p.blackId].draws += 1;
          standings[p.whiteId].points += 0.5;
          standings[p.blackId].points += 0.5;
        }
      }
    }
    return standings;
  };

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
    });
    setName('');
    setDescription('');
    setShowForm(false);
  };

  const getStatus = (t: Tournament) => {
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Trophy className="w-6 h-6 text-amber-500" />
            </div>
            Turnuva Salonu
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {branch ? `${branch} Şubesi Turnuvaları` : 'Akademi Geneli Turnuva Yönetimi'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition-all shadow-lg shadow-amber-900/20"
        >
          <Plus className="w-5 h-5" /> Turnuva Oluştur
        </button>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <form onSubmit={handleCreate} className="bg-slate-800 border border-white/10 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h3 className="text-lg font-bold text-white">Yeni Turnuva Oluştur</h3>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 block mb-1">Turnuva Adı</label>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Haftalık Arena..." required />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 block mb-1">Format</label>
                  <select className={inputCls} value={format} onChange={(e) => setFormat(e.target.value as 'arena' | 'swiss')}>
                    <option value="arena">Arena</option>
                    <option value="swiss">Swiss</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 block mb-1">Tempo (3+2 vb.)</label>
                  <input className={inputCls} value={timeControl} onChange={(e) => setTimeControl(e.target.value)} placeholder="3+2" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 block mb-1">Süre (Dakika)</label>
                  <input className={inputCls} type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 block mb-1">Başlangıç</label>
                  <input className={inputCls} type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                </div>
              </div>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-700/50 cursor-pointer hover:border-amber-500/50 transition-all group">
                <input type="checkbox" checked={isRated} onChange={(e) => setIsRated(e.target.checked)} className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-500/30" />
                <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Puanlı (Rating) Turnuva</span>
              </label>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 block mb-1">Açıklama</label>
                <textarea className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Turnuva hakkında ek bilgiler..." />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold transition-all">İptal</button>
              <button type="submit" className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition-all shadow-lg shadow-amber-600/20">Turnuvayı Başlat</button>
            </div>
          </form>
        </div>
      )}

      {/* Tournament List */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {list.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-slate-800/20 rounded-3xl border-2 border-dashed border-white/5">
            <Trophy className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Henüz planlanmış bir turnuva bulunmuyor.</p>
          </div>
        ) : (
          list.map((t) => {
            const status = getStatus(t);
            return (
              <div 
                key={t.id} 
                onClick={() => setActiveTournamentId(t.id)}
                className="group relative bg-slate-800/40 border border-white/5 hover:border-amber-500/30 rounded-3xl p-5 cursor-pointer transition-all hover:translate-y-[-4px] hover:shadow-2xl hover:shadow-black/40 overflow-hidden"
              >
                {/* Background Pattern */}
                <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-all">
                  <Trophy className="w-32 h-32" />
                </div>

                <div className="relative z-10 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {status === 'ongoing' ? (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-black uppercase tracking-wider animate-pulse">
                          <div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> CANLI
                        </div>
                      ) : status === 'upcoming' ? (
                        <div className="px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-black uppercase tracking-wider">
                          YAKINDA
                        </div>
                      ) : (
                        <div className="px-2 py-1 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                          TAMAMLANDI
                        </div>
                      )}
                      <div className="px-2 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-wider">
                        {t.format}
                      </div>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteTournament(t.id); }}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-white group-hover:text-amber-400 transition-colors uppercase tracking-tight leading-none mb-1">
                      {t.name}
                    </h3>
                    <p className="text-slate-500 text-xs line-clamp-1">{t.description || 'Hızlı ve heyecanlı satranç arenasu.'}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Clock3 className="w-3.5 h-3.5" />
                      <span className="text-xs font-bold">{t.timeControl} · {t.durationMinutes}dk</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                      <Users className="w-3.5 h-3.5" />
                      <span className="text-xs font-bold">{t.participantIds?.length || 0} Oyuncu</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500 font-mono">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {new Date(t.startAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="p-2 rounded-full bg-slate-900 group-hover:bg-amber-600 transition-all transform group-hover:scale-110">
                      <ChevronRight className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// --- Tournament Viewer Component (The Lichess-style Detail Page) ---
interface ViewerProps {
  tournament: Tournament;
  students: Student[];
  onBack: () => void;
  onUpdate: (updates: Partial<Tournament>) => void;
  recalc: (t: Tournament) => Record<string, TournamentStanding>;
}

const TournamentViewer: React.FC<ViewerProps> = ({ tournament: t, students, onBack, onUpdate, recalc }) => {
  const standings = useMemo(() => t.standings ?? recalc(t), [t, recalc]);
  const ranking = useMemo(() => {
    return (t.participantIds ?? [])
      .map(id => ({ id, s: standings[id] || { played: 0, wins: 0, draws: 0, losses: 0, points: 0 } }))
      .sort((a, b) => b.s.points - a.s.points || b.s.wins - a.s.wins);
  }, [t.participantIds, standings]);

  const simulateResult = () => {
    const ids = [...(t.participantIds ?? [])];
    if (ids.length < 2) return;
    
    ids.sort((a, b) => (standings[b]?.points || 0) - (standings[a]?.points || 0));
    
    const pairings: TournamentPairing[] = [];
    const roll = () => {
      const r = Math.random();
      if (r < 0.4) return '1-0';
      if (r < 0.8) return '0-1';
      return '1/2-1/2';
    };

    const pool = [...ids];
    while (pool.length >= 2) {
      const w = pool.shift()!;
      const b = pool.shift()!;
      pairings.push({ whiteId: w, blackId: b, result: roll() });
    }

    const roundNo = (t.rounds?.length ?? 0) + 1;
    const nextRounds = [...(t.rounds ?? []), { 
      id: `${t.id}-r${roundNo}`, 
      roundNo, 
      createdAt: new Date().toISOString(), 
      pairings 
    }];
    
    onUpdate({ 
      rounds: nextRounds, 
      standings: recalc({ ...t, rounds: nextRounds }) 
    });
  };

  const toggleParticipant = (studentId: string) => {
    const current = new Set(t.participantIds ?? []);
    if (current.has(studentId)) current.delete(studentId);
    else current.add(studentId);
    const nextIds = Array.from(current);
    onUpdate({ 
      participantIds: nextIds, 
      standings: recalc({ ...t, participantIds: nextIds }) 
    });
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Detail Header */}
      <div className="bg-slate-800/80 rounded-3xl border border-white/10 overflow-hidden mb-6 shadow-2xl">
        <div className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative">
          <Trophy className="absolute right-10 top-1/2 -translate-y-1/2 w-48 h-48 text-amber-500/5 rotate-12 pointer-events-none" />

          <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left relative z-10">
            <button onClick={onBack} className="p-3 rounded-2xl bg-slate-900 border border-white/5 hover:bg-slate-700 transition-all group shadow-inner">
              <ChevronLeft className="w-5 h-5 text-white group-hover:scale-125 transition-transform" />
            </button>
            <div>
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                 <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest">{t.format} Arena</span>
                 <span className="px-3 py-1 rounded-full bg-slate-900 border border-white/5 text-slate-400 text-[10px] font-black uppercase tracking-widest">{t.timeControl} • Rated</span>
              </div>
              <h1 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter leading-none">{t.name}</h1>
              <p className="text-slate-400 mt-2 font-medium max-w-xl">{t.description || 'Hoş geldiniz! Bu resmi bir akademi turnuvasıdır, tüm sporcularımıza başarılar dileriz.'}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 relative z-10 shrink-0">
             <div className="text-center bg-slate-950/60 p-5 rounded-3xl border border-white/5 min-w-[130px] shadow-lg">
                <div className="text-4xl font-black text-white leading-none mb-1">{t.participantIds?.length || 0}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Oyuncu</div>
             </div>
             <div className="space-y-2">
                <button onClick={simulateResult} className="flex items-center justify-center gap-2 w-full px-5 py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition-all shadow-lg shadow-amber-900/40">
                  <Shuffle className="w-4 h-4" /> Simüle Et
                </button>
                <div className="p-0.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black text-center uppercase py-2">
                  KATILIM AÇIK
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Leaderboard (Lichess Style Standing) */}
        <div className="lg:col-span-8 space-y-6">
           <div className="bg-slate-800/40 rounded-3xl border border-white/5 overflow-hidden backdrop-blur-md shadow-2xl">
              <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-slate-900/40">
                <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-500" /> Turnuva Sıralaması
                </h2>
                <div className="flex items-center gap-12 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                  <span className="w-12 text-center ml-auto">Puan</span>
                  <span className="w-24 text-center mr-6">Sonuçlar</span>
                </div>
              </div>

              <div className="divide-y divide-white/5">
                {ranking.length === 0 ? (
                  <div className="px-6 py-20 text-center">
                    <Users className="w-16 h-16 text-slate-800 mx-auto mb-4" />
                    <p className="text-slate-500 font-bold uppercase tracking-widest">Henüz hiçbir sporcu katılmadı.</p>
                  </div>
                ) : (
                  ranking.map((r, i) => {
                    const student = students.find(s => s.id === r.id);
                    const isStreak = r.s.wins >= 2;
                    return (
                      <div key={r.id} className="group px-6 py-4 flex items-center justify-between hover:bg-white/[0.03] transition-all">
                        <div className="flex items-center gap-5">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-base shadow-lg transition-transform group-hover:scale-110 ${
                            i === 0 ? 'bg-gradient-to-br from-amber-300 to-amber-600 text-black shadow-amber-500/20' : 
                            i === 1 ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900 border border-white/20' :
                            i === 2 ? 'bg-gradient-to-br from-amber-700 to-amber-900 text-amber-50 border border-amber-500/20' :
                            'bg-slate-900 text-slate-500 border border-white/5'
                          }`}>
                            {i + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-lg group-hover:text-amber-400 transition-colors">{student?.name || 'Anonim'}</span>
                              {isStreak && <Flame className="w-4 h-4 text-orange-500 fill-orange-500 animate-bounce" />}
                            </div>
                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.1em] mt-0.5">{student?.group || 'GRUP BELİRTİLMEDİ'}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-12">
                           <div className="flex flex-col items-center w-12">
                              <div className="text-2xl font-black text-white group-hover:scale-110 transition-transform">{r.s.points.toFixed(1).replace('.0', '')}</div>
                           </div>
                           <div className="flex items-center justify-end gap-1.5 w-24 mr-6">
                              {/* Lichess style record dots */}
                              {Array.from({ length: 5 }).map((_, idx) => {
                                const hasPlayed = idx < r.s.played;
                                const wasWin = idx < r.s.wins;
                                return (
                                  <div key={idx} className={`w-2.5 h-2.5 rounded-full ring-2 ring-transparent transition-all ${
                                    !hasPlayed ? 'bg-slate-700/50' :
                                    wasWin ? 'bg-emerald-500 ring-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.3)]' :
                                    'bg-rose-500 ring-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                                  }`} />
                                );
                              })}
                           </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
           </div>

           {/* Pairings Section */}
           <div className="bg-slate-800/20 rounded-3xl border border-white/5 p-8 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Swords className="w-5 h-5 text-amber-500/60" /> Aktif / Son Masalar
                </h3>
                <button className="text-[10px] font-black text-amber-500 hover:text-amber-400 uppercase tracking-widest transition-colors">Tümünü Gör</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(!t.rounds || t.rounds.length === 0) ? (
                  <p className="col-span-full text-center text-slate-600 font-medium py-4 uppercase tracking-tighter">Henüz hiçbir maç oynanmadı.</p>
                ) : (
                  t.rounds[t.rounds.length - 1].pairings.slice(0, 8).map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/60 border border-white/5 hover:border-amber-500/20 transition-all group">
                      <div className="w-[42%] text-sm font-bold text-slate-300 truncate group-hover:text-white transition-colors">{students.find(s => s.id === p.whiteId)?.name}</div>
                      <div className="px-3 py-1 rounded-xl bg-slate-800 group-hover:bg-slate-700 text-amber-500 font-mono font-black text-xs transition-colors shadow-inner">{p.result}</div>
                      <div className="w-[42%] text-sm font-bold text-slate-300 truncate text-right group-hover:text-white transition-colors">{students.find(s => s.id === p.blackId)?.name}</div>
                    </div>
                  ))
                )}
              </div>
           </div>
        </div>

        {/* Right Column: Admin & Info */}
        <div className="lg:col-span-4 space-y-8">
           {/* Participants Admin (Join/Leave logic simulation for admin) */}
           <div className="bg-slate-800/40 rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
              <div className="px-6 py-5 border-b border-white/10 bg-slate-900/40 flex items-center justify-between">
                <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-500" /> Sporcu Kaydı
                </h3>
                <span className="text-[10px] font-black text-slate-500">{(t.participantIds?.length || 0)} / {students.length}</span>
              </div>
              <div className="p-4 max-h-[450px] overflow-y-auto space-y-2 thin-scrollbar bg-slate-900/20">
                {students.map(s => {
                  const isJoined = t.participantIds?.includes(s.id);
                  return (
                    <button 
                      key={s.id}
                      onClick={() => toggleParticipant(s.id)}
                      className={`flex items-center justify-between w-full p-4 rounded-2xl border transition-all text-left group/btn ${
                        isJoined 
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                          : 'bg-slate-900/50 border-white/5 text-slate-500 hover:border-amber-500/30 hover:text-slate-200'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate">{s.name}</div>
                        <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mt-0.5">{s.group}</div>
                      </div>
                      <div className={`p-1.5 rounded-lg transition-all ${isJoined ? 'bg-emerald-500 text-black scale-100' : 'bg-slate-800 group-hover/btn:bg-amber-600 group-hover/btn:text-white scale-90'}`}>
                        {isJoined ? <CheckCircle2 className="w-4 h-4 font-black" /> : <Plus className="w-4 h-4" />}
                      </div>
                    </button>
                  );
                })}
              </div>
           </div>

           {/* Rules & Info */}
           <div className="p-8 rounded-3xl bg-slate-900 border border-white/10 shadow-xl space-y-6 relative overflow-hidden">
              <Info className="absolute -left-4 -bottom-4 w-24 h-24 text-white/5 -rotate-12 pointer-events-none" />
              
              <h4 className="text-sm font-black text-white uppercase tracking-[0.2em] border-b border-white/5 pb-3">Kurallar & Bilgi</h4>
              
              <ul className="space-y-4 relative z-10">
                <li className="flex gap-4">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  </div>
                  <span className="text-[11px] leading-relaxed text-slate-400 font-medium tracking-tight">
                    Bu bir <b className="text-slate-200">{t.format.toUpperCase()}</b> turnuvasıdır. Maçınız bittiği anda yeni bir maça başlarsınız.
                  </span>
                </li>
                <li className="flex gap-4">
                  <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  </div>
                  <span className="text-[11px] leading-relaxed text-slate-400 font-medium tracking-tight">
                    Sıralama toplanan puanlara göre yapılır. Galibiyet 1, Beraberlik 0.5 puandır.
                  </span>
                </li>
                <li className="flex gap-4">
                  <div className="w-6 h-6 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  </div>
                  <span className="text-[11px] leading-relaxed text-slate-400 font-medium tracking-tight">
                    Turnuva süresi <b className="text-slate-200">{t.durationMinutes} dakikadır</b>. Süre sonunda puanlar dondurulur.
                  </span>
                </li>
              </ul>
              
              <div className="pt-6 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Organizasyon</span>
                    <span className="text-xs font-bold text-slate-300">{t.createdBy}</span>
                  </div>
                  <Settings className="w-4 h-4 text-slate-600 hover:text-white cursor-pointer transition-colors" />
                </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Tournaments;
