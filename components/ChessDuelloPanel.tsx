import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  Swords,
  Trophy,
  Unlink,
  Users,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { resolveAuthClubId } from '../lib/supabaseClubContext';
import {
  ChessDuelloApiError,
  chessduelloAllMembers,
  chessduelloAnalytics,
  chessduelloClearKey,
  chessduelloClan,
  chessduelloResults,
  chessduelloSaveKey,
  chessduelloStatus,
  chessduelloTournaments,
  chessduelloTraining,
  localizedTitle,
  matchChessDuelloMember,
  tournamentTitle,
  type ChessDuelloAnalytics,
  type ChessDuelloClan,
  type ChessDuelloMember,
  type ChessDuelloResult,
  type ChessDuelloStatus,
  type ChessDuelloTournament,
  type ChessDuelloTraining,
} from '../lib/chessduelloClient';

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Math.round(n)}%`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR');
}

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl text-sm font-medium outline-none bg-slate-950/50 border border-slate-700/60 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/40';

const ChessDuelloPanel: React.FC = () => {
  const { auth, clubs, coaches, branchOfficeRecords, students, updateStudent, showToast, scopedStudents, adminViewClub } = useApp();
  const clubId = useMemo(() => {
    if (auth?.role === 'admin') return adminViewClub?.id ?? '';
    return resolveAuthClubId(auth, coaches, clubs, branchOfficeRecords) ?? '';
  }, [auth, adminViewClub, coaches, clubs, branchOfficeRecords]);
  const [selectedClubId, setSelectedClubId] = useState(clubId);
  useEffect(() => {
    if (clubId) setSelectedClubId(clubId);
    else if (clubs.length === 1) setSelectedClubId(clubs[0].id);
  }, [clubId, clubs]);

  const activeClubId = selectedClubId || clubId;
  const roster = scopedStudents.length ? scopedStudents : students;

  const [status, setStatus] = useState<ChessDuelloStatus | null>(null);
  const [clan, setClan] = useState<ChessDuelloClan | null>(null);
  const [members, setMembers] = useState<ChessDuelloMember[]>([]);
  const [tournaments, setTournaments] = useState<ChessDuelloTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [tab, setTab] = useState<'members' | 'tournaments'>('members');
  const [selectedMember, setSelectedMember] = useState<ChessDuelloMember | null>(null);
  const [training, setTraining] = useState<ChessDuelloTraining | null>(null);
  const [analytics, setAnalytics] = useState<ChessDuelloAnalytics | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<ChessDuelloTournament | null>(null);
  const [results, setResults] = useState<ChessDuelloResult[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const st = await chessduelloStatus(activeClubId || undefined);
      setStatus(st);
      if (!st.configured) {
        setClan(null);
        setMembers([]);
        setTournaments([]);
        return;
      }
      const [clanRes, memberRows, tourRes] = await Promise.all([
        chessduelloClan(activeClubId || undefined),
        chessduelloAllMembers(activeClubId || undefined),
        chessduelloTournaments(activeClubId || undefined),
      ]);
      setClan(clanRes.data);
      setMembers(memberRows);
      setTournaments(Array.isArray(tourRes.data) ? tourRes.data : []);
    } catch (err) {
      setError(err instanceof ChessDuelloApiError ? err.message : 'ChessDuello bağlantısı kurulamadı');
    } finally {
      setLoading(false);
    }
  }, [activeClubId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveKey = async () => {
    if (!activeClubId) {
      showToast('Önce kulüp seçin.', 'error');
      return;
    }
    if (!apiKey.trim()) {
      showToast('Coach API anahtarını yapıştırın.', 'error');
      return;
    }
    setBusy(true);
    try {
      const saved = await chessduelloSaveKey(activeClubId, apiKey.trim());
      setApiKey('');
      setStatus(saved);
      showToast('ChessDuello anahtarı kaydedildi.', 'success');
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Anahtar kaydedilemedi', 'error');
    } finally {
      setBusy(false);
    }
  };

  const clearKey = async () => {
    if (!activeClubId) return;
    setBusy(true);
    try {
      const next = await chessduelloClearKey(activeClubId);
      setStatus(next);
      setClan(null);
      setMembers([]);
      setTournaments([]);
      showToast('Kulüp anahtarı silindi.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Anahtar silinemedi', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openMember = async (member: ChessDuelloMember) => {
    setSelectedMember(member);
    setDetailLoading(true);
    setTraining(null);
    setAnalytics(null);
    try {
      const [t, a] = await Promise.all([
        chessduelloTraining(member.id, activeClubId || undefined),
        chessduelloAnalytics(member.id, activeClubId || undefined, 30),
      ]);
      setTraining(t.data);
      setAnalytics(a.data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Üye detayı alınamadı', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const openTournament = async (tournament: ChessDuelloTournament) => {
    setSelectedTournament(tournament);
    setResults([]);
    try {
      const res = await chessduelloResults(tournament.id, activeClubId || undefined);
      setResults(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Turnuva sonuçları alınamadı', 'error');
    }
  };

  const linkStudent = (member: ChessDuelloMember, studentId: string) => {
    updateStudent(studentId, {
      chessDuelloMemberId: member.id,
      chessDuelloUsername: member.username,
    });
    showToast('Öğrenci ChessDuello üyesiyle eşlendi.', 'success');
  };

  const autoLink = () => {
    let n = 0;
    for (const member of members) {
      const already = roster.find((s) => s.chessDuelloMemberId === member.id);
      if (already) continue;
      const hit = matchChessDuelloMember(member, roster);
      if (!hit || hit.chessDuelloMemberId) continue;
      updateStudent(hit.id, {
        chessDuelloMemberId: member.id,
        chessDuelloUsername: member.username,
      });
      n += 1;
    }
    showToast(n ? `${n} öğrenci otomatik eşlendi.` : 'Yeni otomatik eşleşme bulunamadı.', n ? 'success' : 'info');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Swords className="w-5 h-5 text-violet-400" />
            ChessDuello
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Coach API salt okunur. Anahtar tarayıcıya yazılmaz; sunucu sizin adınıza çeker.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500/15 text-violet-200 text-xs font-bold hover:bg-violet-500/25 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Yenile
        </button>
      </div>

      {auth?.role === 'admin' && clubs.length > 1 ? (
        <label className="block max-w-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kulüp</span>
          <select
            value={activeClubId}
            onChange={(e) => setSelectedClubId(e.target.value)}
            className={`${inputCls} mt-1.5`}
          >
            <option value="">Seçin</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <section className="rounded-2xl border border-white/[0.06] bg-slate-900/40 p-4 sm:p-5 space-y-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
          <KeyRound className="w-4 h-4" />
          Coach API anahtarı
        </h2>
        {status?.configured ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 text-emerald-300 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              Bağlı · …{status.keyLast4}
            </span>
            <span className="text-slate-400">
              {status.source === 'env' ? 'Sunucu ortam değişkeni' : 'Kulüp kaydı'}
              {status.clanName ? ` · ${status.clanName}` : ''}
            </span>
            {status.source === 'club' ? (
              <button
                type="button"
                onClick={() => void clearKey()}
                disabled={busy}
                className="inline-flex items-center gap-1 text-xs font-bold text-rose-300 hover:text-rose-200"
              >
                <Unlink className="w-3.5 h-3.5" /> Anahtarı sil
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            dash.chessduello.com → Coach API anahtarını alın. Buraya yapıştırın; anahtar yalnızca sunucuda saklanır.
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="cdcoach_live…"
            className={`${inputCls} font-mono`}
          />
          <button
            type="button"
            onClick={() => void saveKey()}
            disabled={busy}
            className="shrink-0 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold disabled:opacity-50"
          >
            {busy ? 'Kaydediliyor…' : 'Kaydet ve dene'}
          </button>
        </div>
        {error ? (
          <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">{error}</p>
        ) : null}
      </section>

      {clan ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Kulüp" value={clan.name} />
          <Stat label="Üye" value={String(clan.memberCount)} />
          <Stat label="Antrenör" value={String(clan.coaches?.length ?? 0)} />
          <Stat label="Çekilen üye" value={String(members.length)} />
        </div>
      ) : null}

      {status?.configured ? (
        <>
          <div className="flex gap-1 rounded-xl bg-slate-900/50 p-1 w-fit">
            <TabBtn active={tab === 'members'} onClick={() => setTab('members')} icon={<Users className="w-3.5 h-3.5" />} label="Üyeler" />
            <TabBtn active={tab === 'tournaments'} onClick={() => setTab('tournaments')} icon={<Trophy className="w-3.5 h-3.5" />} label="Turnuvalar" />
          </div>

          {tab === 'members' ? (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={autoLink}
                  className="text-xs font-bold text-violet-300 hover:text-violet-200"
                >
                  Ada göre otomatik eşle
                </button>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="text-left px-3 py-2 font-bold">Üye</th>
                      <th className="text-left px-3 py-2 font-bold">ELO</th>
                      <th className="text-left px-3 py-2 font-bold">30g deneme</th>
                      <th className="text-left px-3 py-2 font-bold">İsabet</th>
                      <th className="text-left px-3 py-2 font-bold">Öğrenci</th>
                      <th className="text-left px-3 py-2 font-bold">Son aktif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => {
                      const linked = roster.find((s) => s.chessDuelloMemberId === m.id) ?? matchChessDuelloMember(m, roster);
                      return (
                        <tr key={m.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => void openMember(m)} className="text-left">
                              <div className="font-bold text-white">{m.username}</div>
                              <div className="text-[10px] text-slate-500">{m.role}</div>
                            </button>
                          </td>
                          <td className="px-3 py-2 text-slate-200 tabular-nums">{m.eloRating}</td>
                          <td className="px-3 py-2 text-slate-300 tabular-nums">{m.attemptsLast30Days ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-300">{pct(m.accuracyLast30Days)}</td>
                          <td className="px-3 py-2">
                            {linked ? (
                              <span className="text-emerald-300 text-xs font-bold">{linked.name}</span>
                            ) : (
                              <select
                                className="bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 px-2 py-1 max-w-[160px]"
                                defaultValue=""
                                onChange={(e) => {
                                  if (e.target.value) linkStudent(m, e.target.value);
                                }}
                              >
                                <option value="">Eşle…</option>
                                {roster.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-400 text-xs">{fmtDate(m.lastActiveAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {tournaments.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void openTournament(t)}
                  className="text-left rounded-2xl border border-white/[0.06] bg-slate-900/40 px-4 py-3 hover:border-violet-500/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-black text-white">{tournamentTitle(t)}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {t.status} · {t.totalPuzzles} bulmaca · {fmtDay(t.startDate)} – {fmtDay(t.endDate)}
                      </div>
                    </div>
                    <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                  </div>
                </button>
              ))}
              {tournaments.length === 0 && !loading ? (
                <p className="text-sm text-slate-400">Turnuva yok.</p>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      {selectedMember ? (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onClick={() => setSelectedMember(null)}>
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-950 border border-white/10 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-white">{selectedMember.username}</h3>
                <p className="text-xs text-slate-400">ELO {selectedMember.eloRating}</p>
              </div>
              <button type="button" onClick={() => setSelectedMember(null)} className="text-slate-400 text-sm font-bold">
                Kapat
              </button>
            </div>
            {detailLoading ? (
              <div className="flex items-center gap-2 text-slate-400 py-8">
                <Loader2 className="w-5 h-5 animate-spin" /> Yükleniyor…
              </div>
            ) : (
              <>
                {training ? (
                  <p className="text-sm text-slate-300">
                    Müfredat {training.completedLessons}/{training.totalLessons} ({pct(training.completionPercent)}) · son antrenman {fmtDate(training.lastTrainedAt)}
                  </p>
                ) : null}
                {analytics ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Stat label="Deneme" value={String(analytics.attempts)} />
                    <Stat label="İsabet" value={pct(analytics.accuracy)} />
                    <Stat label="İlk deneme" value={pct(analytics.firstTryAccuracy)} />
                    <Stat label="Maç" value={String(analytics.matchAttempts)} />
                  </div>
                ) : null}
                {analytics?.weakThemes?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {analytics.weakThemes.slice(0, 10).map((theme) => (
                      <span key={theme.id} className="px-2 py-1 rounded-lg bg-rose-500/10 text-rose-300 text-xs">
                        {localizedTitle(theme.title) || theme.slug} · {pct(theme.accuracy)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {selectedTournament ? (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onClick={() => setSelectedTournament(null)}>
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-950 border border-white/10 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-black text-white">{tournamentTitle(selectedTournament)}</h3>
              <button type="button" onClick={() => setSelectedTournament(null)} className="text-slate-400 text-sm font-bold">
                Kapat
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left py-1">Sıra</th>
                  <th className="text-left py-1">Üye</th>
                  <th className="text-left py-1">Puan</th>
                  <th className="text-left py-1">Cevap</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-t border-white/[0.05]">
                    <td className="py-1.5 text-slate-300">{r.rank}</td>
                    <td className="py-1.5 text-white font-medium">{r.member?.username || (r.isFormerMember ? 'Ayrılmış üye' : '—')}</td>
                    <td className="py-1.5 text-slate-200">{r.score}</td>
                    <td className="py-1.5 text-slate-400">{r.answeredCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length === 0 ? <p className="text-sm text-slate-400">Sonuç yok veya turnuva bitmemiş.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-slate-900/40 px-4 py-3">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-black text-white mt-1 truncate">{value}</div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
        active ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default ChessDuelloPanel;
