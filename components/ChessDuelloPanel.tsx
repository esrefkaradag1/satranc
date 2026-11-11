import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Loader2,
  Minus,
  RefreshCw,
  Swords,
  Trophy,
  Unlink,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { resolveAuthClubId } from '../lib/supabaseClubContext';
import {
  ChessDuelloApiError,
  chessduelloAllMembers,
  chessduelloAnalytics,
  chessduelloAttempt,
  chessduelloClearKey,
  chessduelloClan,
  chessduelloReport,
  chessduelloResults,
  chessduelloSaveKey,
  chessduelloStatus,
  chessduelloTournaments,
  chessduelloTraining,
  localizedTitle,
  matchChessDuelloMember,
  tournamentTitle,
  type ChessDuelloAnalytics,
  type ChessDuelloAttempt,
  type ChessDuelloReport,
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function valueOf(row: Record<string, unknown> | null | undefined, keys: string[]): unknown {
  if (!row) return undefined;
  for (const key of keys) {
    if (row[key] != null) return row[key];
  }
  return undefined;
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return String(value);
}

function itemsArray(source: Record<string, unknown> | null, candidates: string[]): Record<string, unknown>[] {
  if (!source) return [];
  for (const key of candidates) {
    const value = source[key];
    if (Array.isArray(value)) return value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
  }
  return [];
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** `ms` verilirse değer kesin milisaniyedir (…Ms alanları); aksi halde birim bilinmiyor, 1000'den büyükse ms kabul edilir. */
function secondsLabel(value: unknown, ms = false): string {
  const n = numOrNull(value);
  if (n == null) return '—';
  if (ms) return n < 1000 ? '<1 sn' : `${Math.round(n / 1000)} sn`;
  return `${Math.round(n > 1000 ? n / 1000 : n)} sn`;
}

type AttemptPuzzleRow = {
  key: string;
  questionId: string | null;
  turn: string | null;
  fen: string | null;
  available: boolean;
  isCorrect: boolean | null;
  timeMs: number | null;
  moves: string[];
};

/**
 * Coach API 1.2.0 Attempt: puzzles[] (id, order, fen, turn, available) ve
 * answers[] (questionId, isCorrect, timeMs, boardMoves) questionId ile eşleşir;
 * results[] ise sıraya göre boolean|null sonuçlardır.
 */
function attemptRows(attempt: ChessDuelloAttempt | null): AttemptPuzzleRow[] {
  if (!attempt) return [];
  const source = asRecord(attempt.attempt) ?? attempt;
  const answers = itemsArray(source, ['answers']);
  const puzzles = itemsArray(source, ['puzzles'])
    .sort((a, b) => (numOrNull(a.order) ?? 0) - (numOrNull(b.order) ?? 0));
  const results = Array.isArray(source.results) ? source.results : [];
  const answerById = new Map(answers.map((a) => [strOrNull(a.questionId) ?? '', a]));
  const base = puzzles.length ? puzzles : answers;

  return base.map((item, index) => {
    const questionId = strOrNull(puzzles.length ? item.id : item.questionId);
    const answer = puzzles.length
      ? (questionId ? answerById.get(questionId) : undefined) ?? null
      : item;
    const fromResults = results[index];
    const isCorrect = typeof answer?.isCorrect === 'boolean'
      ? answer.isCorrect
      : typeof fromResults === 'boolean' ? fromResults : null;
    const moves = Array.isArray(answer?.boardMoves)
      ? (answer.boardMoves as unknown[]).filter((m): m is string => typeof m === 'string')
      : [];
    return {
      key: questionId ?? String(index),
      questionId,
      turn: puzzles.length ? strOrNull(item.turn) : null,
      fen: puzzles.length ? strOrNull(item.fen) : null,
      available: puzzles.length ? item.available !== false : true,
      isCorrect,
      timeMs: numOrNull(answer?.timeMs),
      moves,
    };
  });
}

function reportRecord(report: ChessDuelloReport | null | undefined): Record<string, unknown> | null {
  if (!report) return null;
  return asRecord((report as Record<string, unknown>).report) ?? (report as Record<string, unknown>);
}

/** ReportQuestion şeması serbest (additionalProperties) — tema alanını birkaç adla dene. */
function questionThemes(question: Record<string, unknown> | null | undefined): string[] {
  const raw = valueOf(question, ['tags', 'themes', 'theme', 'themeName', 'tag']);
  if (Array.isArray(raw)) return raw.map((t) => (typeof t === 'string' ? t : displayValue(valueOf(asRecord(t), ['title', 'name', 'slug'])))).filter((t) => t && t !== '—');
  return typeof raw === 'string' && raw.trim() ? [raw] : [];
}

function questionKey(question: Record<string, unknown> | null | undefined): string | null {
  return strOrNull(valueOf(question, ['questionId', 'id', 'puzzleId']));
}

function turnLabel(turn: string | null): string {
  if (!turn) return '';
  const t = turn.toLowerCase();
  if (t === 'w' || t === 'white') return 'Beyaz oynar';
  if (t === 'b' || t === 'black') return 'Siyah oynar';
  return turn;
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
  const [selectedResult, setSelectedResult] = useState<ChessDuelloResult | null>(null);
  const [attemptReport, setAttemptReport] = useState<ChessDuelloAttempt | null>(null);
  const [tournamentReport, setTournamentReport] = useState<ChessDuelloReport | null>(null);
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [attemptError, setAttemptError] = useState('');
  const attemptReqRef = useRef(0);

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
    setSelectedResult(null);
    setAttemptReport(null);
    setAttemptError('');
    setTournamentReport(null);
    try {
      const res = await chessduelloResults(tournament.id, activeClubId || undefined);
      setResults(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Turnuva sonuçları alınamadı', 'error');
    }
    // /report turnuva geneli (bulmaca temaları, içgörüler, sıralama) — üye bazlı
    // /attempt'ten ayrı. Bulmaca temaları bir üyenin görünümünde de aynı olduğu
    // için burada bir kez çekilip tüm oyuncu raporlarında yeniden kullanılır.
    try {
      const rep = await chessduelloReport(tournament.id, activeClubId || undefined, 'tr');
      setTournamentReport(rep.data ?? null);
    } catch {
      setTournamentReport(null);
    }
  };

  const openAttemptReport = async (result: ChessDuelloResult) => {
    if (!selectedTournament || !result.member?.id) return;
    const req = attemptReqRef.current + 1;
    attemptReqRef.current = req;
    setSelectedResult(result);
    setAttemptReport(null);
    setAttemptError('');
    setAttemptLoading(true);
    try {
      const response = await chessduelloAttempt(selectedTournament.id, result.member.id, activeClubId || undefined);
      if (req !== attemptReqRef.current) return;
      setAttemptReport(response.data);
    } catch (err) {
      if (req !== attemptReqRef.current) return;
      setAttemptError(err instanceof Error ? err.message : 'Oyuncu raporu alınamadı');
    } finally {
      if (req === attemptReqRef.current) setAttemptLoading(false);
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
        <TournamentDialog
          key={selectedTournament.id}
          tournament={selectedTournament}
          results={results}
          report={tournamentReport}
          selectedResult={selectedResult}
          attempt={attemptReport}
          attemptLoading={attemptLoading}
          attemptError={attemptError}
          onClose={() => setSelectedTournament(null)}
          onOpenResult={(r) => void openAttemptReport(r)}
          onBack={() => {
            attemptReqRef.current += 1;
            setSelectedResult(null);
            setAttemptReport(null);
            setAttemptError("");
            setAttemptLoading(false);
          }}
        />
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

type KeyFigure = { label: string; value: string; tone?: 'good' | 'bad' };

function KeyFigures({ items }: { items: KeyFigure[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.06] sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-slate-950 px-4 py-3">
          <dt className="text-xs font-medium text-slate-400">{item.label}</dt>
          <dd
            className={`mt-0.5 text-lg font-black tabular-nums ${
              item.tone === 'good' ? 'text-emerald-300' : item.tone === 'bad' ? 'text-rose-300' : 'text-white'
            }`}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ResultPill({ value }: { value: boolean | null }) {
  const cfg = value === true
    ? { label: 'Doğru', cls: 'bg-emerald-500/[0.15] text-emerald-300', Icon: Check }
    : value === false
      ? { label: 'Yanlış', cls: 'bg-rose-500/[0.15] text-rose-300', Icon: X }
      : { label: 'Cevapsız', cls: 'bg-slate-700/40 text-slate-400', Icon: Minus };
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${cfg.cls}`}>
      <cfg.Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const tone = rank === 1 ? 'text-amber-300' : rank === 2 ? 'text-slate-200' : rank === 3 ? 'text-orange-300' : 'text-slate-500';
  return (
    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-sm font-black tabular-nums ${tone}`}>
      {rank}
    </span>
  );
}

function ResultRow({ result, onOpen }: { result: ChessDuelloResult; onOpen: (r: ChessDuelloResult) => void }) {
  const name = result.member?.username || (result.isFormerMember ? 'Ayrılmış üye' : '—');
  const accuracy = typeof result.accuracy === 'number' ? result.accuracy : null;
  const clickable = Boolean(result.member?.id);

  const content = (
    <>
      <RankBadge rank={result.rank} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold text-white">{name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
          <span><b className="font-bold text-emerald-300">{displayValue(result.correctCount)}</b> doğru</span>
          <span><b className="font-bold text-rose-300">{displayValue(result.incorrectCount)}</b> yanlış</span>
          <span>{secondsLabel(result.timeSpentMs, true)}</span>
        </div>
        {accuracy != null ? (
          <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
            <div className="h-full rounded-full bg-emerald-400/80" style={{ width: `${Math.min(100, Math.max(0, accuracy))}%` }} />
          </div>
        ) : null}
      </div>
      <div className="text-right">
        <div className="text-base font-black tabular-nums text-white">{result.score}</div>
        <div className="text-xs tabular-nums text-slate-400">{pct(accuracy)}</div>
      </div>
      {clickable ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /> : <span className="w-4 shrink-0" />}
    </>
  );

  return (
    <li>
      {clickable ? (
        <button
          type="button"
          onClick={() => onOpen(result)}
          aria-label={`${name} raporunu aç`}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500/50"
        >
          {content}
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 px-4 py-3">{content}</div>
      )}
    </li>
  );
}

function TournamentSummary({ report }: { report: ChessDuelloReport }) {
  const data = reportRecord(report);
  if (!data) return null;
  const questions = itemsArray(data, ['questionStats']);
  const indexOf = (q: Record<string, unknown> | null) => {
    const key = questionKey(q);
    const i = key ? questions.findIndex((x) => questionKey(x) === key) : -1;
    return i >= 0 ? `#${i + 1}` : '';
  };
  const highlights: Array<[string, Record<string, unknown> | null]> = [
    ['En zor', asRecord(data.hardest)],
    ['En çok kaçırılan', asRecord(data.mostMissed)],
    ['En uzun düşünülen', asRecord(data.mostPondered)],
  ];
  const shownHighlights = highlights.filter(([, q]) => q);
  const topTags = Array.isArray(data.topTags)
    ? (data.topTags as unknown[]).filter(Array.isArray) as unknown[][]
    : [];
  const accuracy = numOrNull(data.overallAccuracy) ?? numOrNull(data.avgAccuracy);

  return (
    <div className="space-y-6">
      <KeyFigures
        items={[
          { label: 'Ortalama doğruluk', value: pct(accuracy) },
          { label: 'Tamamlama', value: pct(numOrNull(data.completionRate)) },
          { label: 'En yüksek puan', value: displayValue(data.topScore) },
          { label: 'Bulmaca başı süre', value: secondsLabel(data.avgTimePerPuzzle) },
        ]}
      />

      {shownHighlights.length ? (
        <section>
          <h4 className="text-sm font-bold text-white">Dikkat çeken bulmacalar</h4>
          <ul className="mt-2 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.06]">
            {shownHighlights.map(([label, q]) => {
              const themes = questionThemes(q);
              return (
                <li key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <span className="text-sm text-slate-400">{label}</span>
                  <span className="text-right text-sm font-medium text-white">
                    {indexOf(q) || 'Bulmaca'}
                    {themes.length ? <span className="text-slate-400"> · {themes.join(', ')}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {topTags.length ? (
        <section>
          <h4 className="text-sm font-bold text-white">Hata yapılan temalar</h4>
          <ul className="mt-2 space-y-3">
            {topTags.map(([tag, mistakes, total]) => {
              const m = numOrNull(mistakes);
              const t = numOrNull(total);
              const ratio = m != null && t ? Math.min(100, Math.max(0, (m / t) * 100)) : 0;
              return (
                <li key={String(tag)}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-200">{String(tag)}</span>
                    <span className="tabular-nums text-slate-400">
                      <b className="font-bold text-rose-300">{displayValue(mistakes)}</b> hata · {displayValue(total)} cevap
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
                    <div className="h-full rounded-full bg-rose-400/80" style={{ width: `${ratio}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <details className="rounded-xl border border-white/[0.06] px-3 py-2 text-xs text-slate-400">
        <summary className="cursor-pointer font-bold text-slate-300">ChessDuello'nun gönderdiği tüm rapor verisi</summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-300">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

const PUZZLE_COLS = 'sm:grid-cols-[5.5rem_minmax(0,1fr)_6.5rem_3.5rem_6.5rem_3.5rem]';

function AttemptReport({
  attempt,
  report,
  result,
}: {
  attempt: ChessDuelloAttempt;
  report?: ChessDuelloReport | null;
  result?: ChessDuelloResult | null;
}) {
  const data = asRecord(attempt.attempt) ?? attempt;
  const rows = attemptRows(attempt);
  const questions = itemsArray(reportRecord(report), ['questionStats']);
  const questionById = new Map(questions.map((q) => [questionKey(q) ?? '', q]));
  const answered = rows.filter((r) => r.isCorrect !== null);
  const correct = result?.correctCount ?? (answered.length ? answered.filter((r) => r.isCorrect).length : null);
  const wrong = result?.incorrectCount ?? (answered.length ? answered.filter((r) => r.isCorrect === false).length : null);
  const accuracy = result?.accuracy ?? (answered.length && correct != null ? (correct / answered.length) * 100 : null);

  return (
    <div className="space-y-4">
      <KeyFigures
        items={[
          { label: 'Doğruluk', value: pct(accuracy) },
          { label: 'Doğru', value: displayValue(correct), tone: 'good' },
          { label: 'Yanlış', value: displayValue(wrong), tone: 'bad' },
          { label: 'Süre', value: secondsLabel(data.timeSpentMs ?? result?.timeSpentMs, true) },
        ]}
      />

      {rows.length ? (
        <div className="overflow-hidden rounded-2xl border border-white/[0.06]">
          <div className={`hidden gap-x-3 border-b border-white/[0.06] bg-slate-900/60 px-4 py-2 text-xs font-bold text-slate-400 sm:grid ${PUZZLE_COLS}`}>
            <span>Bulmaca</span>
            <span>Tema</span>
            <span>Hamle</span>
            <span>Süre</span>
            <span>Sonuç</span>
            <span className="sr-only">Pozisyon</span>
          </div>
          <ol className="divide-y divide-white/[0.06]">
            {rows.map((row, index) => {
              const themes = questionThemes(
                (row.questionId ? questionById.get(row.questionId) : undefined) ?? questions[index] ?? null,
              );
              const side = turnLabel(row.turn);
              return (
                <li
                  key={row.key}
                  className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 ${PUZZLE_COLS} ${
                    row.isCorrect === false ? 'bg-rose-500/[0.06]' : ''
                  }`}
                >
                  <div className="flex items-baseline gap-2 sm:block">
                    <span className="text-sm font-black tabular-nums text-white">#{index + 1}</span>
                    {side ? <span className="text-xs text-slate-400 sm:block">{side}</span> : null}
                  </div>
                  <div className="col-start-2 row-start-1 justify-self-end sm:col-start-5 sm:justify-self-start">
                    <ResultPill value={row.isCorrect} />
                  </div>
                  <div className="col-span-2 text-sm text-slate-300 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                    {themes.length ? themes.join(', ') : <span className="text-slate-500">Tema bilgisi yok</span>}
                  </div>
                  <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 sm:contents">
                    <span className="sm:col-start-3 sm:row-start-1">
                      <span className="sm:hidden">Hamle: </span>
                      <span className="font-mono text-slate-200">{row.moves.length ? row.moves.join(' ') : '—'}</span>
                    </span>
                    <span className="tabular-nums sm:col-start-4 sm:row-start-1">{secondsLabel(row.timeMs, true)}</span>
                    <span className="sm:col-start-6 sm:row-start-1 sm:justify-self-end">
                      {row.fen && row.available ? (
                        <a
                          href={`https://lichess.org/analysis/${row.fen.replace(/ /g, '_')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`#${index + 1} pozisyonunu Lichess'te aç`}
                          className="inline-flex items-center gap-1 rounded-md py-1 font-bold text-violet-300 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sm:hidden">Pozisyonu aç</span>
                          <span className="hidden sm:inline">Aç</span>
                        </a>
                      ) : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <p className="rounded-xl bg-slate-900/55 px-3 py-2 text-sm text-slate-400">
          Ayrıntı kaydı alındı; bu Coach API yanıtında bulmaca satırları bulunmuyor.
        </p>
      )}
    </div>
  );
}

type DialogView = 'ranking' | 'summary';

function TournamentDialog({
  tournament,
  results,
  report,
  selectedResult,
  attempt,
  attemptLoading,
  attemptError,
  onClose,
  onOpenResult,
  onBack,
}: {
  tournament: ChessDuelloTournament;
  results: ChessDuelloResult[];
  report: ChessDuelloReport | null;
  selectedResult: ChessDuelloResult | null;
  attempt: ChessDuelloAttempt | null;
  attemptLoading: boolean;
  attemptError: string;
  onClose: () => void;
  onOpenResult: (r: ChessDuelloResult) => void;
  onBack: () => void;
}) {
  const [view, setView] = useState<DialogView>('ranking');
  const ended = tournament.status === 'ended';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedResult) onBack();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedResult, onBack, onClose]);

  const playerName = selectedResult?.member?.username || 'Oyuncu';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cd-tournament-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-slate-950 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-white/[0.08] px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id="cd-tournament-title" className="truncate text-lg font-black text-white">
                {tournamentTitle(tournament)}
              </h3>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400">
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                    ended ? 'bg-emerald-500/[0.15] text-emerald-300' : 'bg-amber-500/[0.15] text-amber-200'
                  }`}
                >
                  {ended ? 'Tamamlandı' : tournament.status}
                </span>
                <span>{tournament.totalPuzzles} bulmaca</span>
                <span aria-hidden="true">·</span>
                <span>{results.length} katılımcı</span>
                <span aria-hidden="true">·</span>
                <span>{fmtDay(tournament.startDate)} – {fmtDay(tournament.endDate)}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="-mr-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {!selectedResult && report ? (
            <div role="tablist" aria-label="Turnuva görünümü" className="mt-4 inline-flex rounded-xl bg-slate-900/70 p-1">
              {([['ranking', 'Sıralama'], ['summary', 'Turnuva özeti']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={`rounded-lg px-4 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 ${
                    view === id ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6" role={!selectedResult && report ? "tabpanel" : undefined}>
          {selectedResult ? (
            <section className="space-y-4" aria-live="polite">
              <button
                type="button"
                onClick={onBack}
                autoFocus
                className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-bold text-violet-200 hover:bg-violet-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Sıralamaya dön
              </button>
              <div>
                <h4 className="text-lg font-black text-white">{playerName}</h4>
                <p className="mt-0.5 text-sm text-slate-400">
                  {selectedResult.rank}. sıra · {selectedResult.score} puan · {selectedResult.answeredCount}/{tournament.totalPuzzles} cevap
                </p>
              </div>

              {attemptLoading ? (
                <div className="space-y-3 animate-pulse" aria-label="Rapor yükleniyor">
                  <div className="h-16 rounded-2xl bg-slate-800/70" />
                  <div className="h-48 rounded-2xl bg-slate-800/50" />
                </div>
              ) : null}

              {attemptError ? (
                <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{attemptError}</p>
              ) : null}

              {attempt ? <AttemptReport attempt={attempt} report={report} result={selectedResult} /> : null}
            </section>
          ) : view === 'summary' && report ? (
            <TournamentSummary report={report} />
          ) : (
            <div className="space-y-3">
              {!ended ? (
                <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  Turnuva henüz bitmedi. Bulmaca ayrıntıları ve final sıralaması bitince açılır.
                </p>
              ) : null}
              {results.length === 0 ? (
                <p className="text-sm text-slate-400">Sonuç yok veya turnuva bitmemiş.</p>
              ) : (
                <>
                  <p className="text-sm text-slate-400">Bulmaca ayrıntıları için bir oyuncuya dokunun.</p>
                  <ol className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-900/30">
                    {results.map((r) => (
                      <ResultRow key={r.id} result={r} onOpen={onOpenResult} />
                    ))}
                  </ol>
                </>
              )}
            </div>
          )}
        </div>
      </div>
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
