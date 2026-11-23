import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, Swords, User } from 'lucide-react';
import type { Student } from '../../types';
import {
  ChessDuelloApiError,
  chessduelloAllMembers,
  chessduelloAnalytics,
  chessduelloMember,
  chessduelloTraining,
  localizedTitle,
  type ChessDuelloAnalytics,
  type ChessDuelloMember,
  type ChessDuelloTraining,
} from '../../lib/chessduelloClient';

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

export default function ChessDuelloStudentCard({
  student,
  clubId,
  onChange,
}: {
  student: Student;
  clubId?: string;
  onChange: (patch: Partial<Student>) => void;
}) {
  const [username, setUsername] = useState(student.chessDuelloUsername ?? '');
  const [memberId, setMemberId] = useState(student.chessDuelloMemberId ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [training, setTraining] = useState<ChessDuelloTraining | null>(null);
  const [analytics, setAnalytics] = useState<ChessDuelloAnalytics | null>(null);
  const [member, setMember] = useState<ChessDuelloMember | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    setUsername(student.chessDuelloUsername ?? '');
    setMemberId(student.chessDuelloMemberId ?? '');
  }, [student.id, student.chessDuelloUsername, student.chessDuelloMemberId]);

  const load = useCallback(async () => {
    const id = memberId.trim();
    if (!id) {
      setTraining(null);
      setAnalytics(null);
      setMember(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [t, a, m] = await Promise.all([
        chessduelloTraining(id, clubId),
        chessduelloAnalytics(id, clubId, 30),
        chessduelloMember(id, clubId)
          .then((r) => (typeof r.data?.eloRating === 'number' ? r.data : null))
          .catch(() => null)
          .then(async (direct) => {
            if (direct) return direct;
            // Tekil uç ELO döndürmezse listeden (ChessDuello sayfasındaki tablo) al.
            const list = await chessduelloAllMembers(clubId).catch(() => []);
            return list.find((x) => x.id === id) ?? null;
          }),
      ]);
      setTraining(t.data);
      setAnalytics(a.data);
      setMember(m);
    } catch (err) {
      setTraining(null);
      setAnalytics(null);
      setMember(null);
      setError(err instanceof ChessDuelloApiError ? err.message : 'ChessDuello verisi alınamadı');
    } finally {
      setLoading(false);
    }
  }, [memberId, clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  // null → veritabanında alan temizlenir (undefined yazılmaz).
  const persist = (nextUsername: string, nextMemberId: string) => {
    onChange({
      chessDuelloUsername: (nextUsername || null) as string | undefined,
      chessDuelloMemberId: (nextMemberId || null) as string | undefined,
    });
  };

  const saveMemberId = () => {
    const nextId = memberId.trim();
    if (nextId === (student.chessDuelloMemberId ?? '')) return;
    persist(username.trim(), nextId);
  };

  /** Kullanıcı adı değişince üye ID'yi kulüp üyelerinden yeniden bul; eski (yanlış) ID'de kalmasın. */
  const saveUsername = async () => {
    const nextUser = username.trim();
    if (nextUser === (student.chessDuelloUsername ?? '').trim()) return;
    if (!nextUser) {
      setMemberId('');
      setError('');
      persist('', '');
      return;
    }
    setResolving(true);
    setError('');
    try {
      const members = await chessduelloAllMembers(clubId);
      const hit = members.find((m) => m.username.trim().toLowerCase() === nextUser.toLowerCase());
      if (hit) {
        setUsername(hit.username);
        setMemberId(hit.id);
        persist(hit.username, hit.id);
      } else {
        setMemberId('');
        persist(nextUser, '');
        setError(`"${nextUser}" kulübün ChessDuello üyeleri arasında bulunamadı. Kullanıcı adını kontrol edin.`);
      }
    } catch (err) {
      setError(err instanceof ChessDuelloApiError ? err.message : 'ChessDuello üyeleri alınamadı');
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-slate-900/50 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-700/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="w-5 h-5 text-violet-400" />
          <span className="text-sm font-black text-white">ChessDuello</span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !memberId.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 text-xs font-bold disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Yenile
        </button>
      </div>
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Kullanıcı adı</div>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={() => void saveUsername()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              disabled={resolving}
              placeholder="ChessDuello kullanıcı adı"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-medium placeholder:text-slate-500 focus:ring-2 focus:ring-violet-500/40 outline-none"
            />
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Üye ID</div>
            <input
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              onBlur={saveMemberId}
              placeholder="UUID (kulüp panelinden eşlenir)"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm font-mono placeholder:text-slate-500 focus:ring-2 focus:ring-violet-500/40 outline-none"
            />
          </div>
        </div>
        {username.trim() ? (
          <a
            href={`https://dash.chessduello.com`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-300 hover:text-violet-200"
          >
            <ExternalLink className="w-3.5 h-3.5" /> ChessDuello paneli
          </a>
        ) : null}

        {error ? (
          <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">{error}</p>
        ) : null}

        {loading && !training && !analytics ? (
          <div className="flex items-center gap-2 py-8 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" /> ChessDuello verileri çekiliyor…
          </div>
        ) : null}

        {training || analytics ? (
          <div className="space-y-4">
            {training ? (
              <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-4 flex flex-wrap items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-violet-500/15 flex items-center justify-center text-violet-300 overflow-hidden">
                  {training.avatarUrl ? (
                    <img src={training.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-black text-white">{training.username}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Müfredat {training.completedLessons}/{training.totalLessons} · {pct(training.completionPercent)}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">Son antrenman {fmtDate(training.lastTrainedAt)}</div>
                </div>
                {member?.eloRating != null ? (
                  <div className="rounded-xl bg-violet-500/15 border border-violet-500/30 px-4 py-2 text-center">
                    <div className="text-[10px] font-bold text-violet-300 uppercase tracking-wider">ELO Puanı</div>
                    <div className="text-2xl font-black text-white tabular-nums">{member.eloRating}</div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {analytics ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="30 gün deneme" value={String(analytics.attempts)} />
                <Stat label="İsabet" value={pct(analytics.accuracy)} />
                <Stat label="İlk deneme" value={pct(analytics.firstTryAccuracy)} />
                <Stat label="Son cevap" value={fmtDate(analytics.lastAnsweredAt)} />
              </div>
            ) : null}

            {analytics?.weakThemes?.length ? (
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Zayıf temalar</div>
                <div className="flex flex-wrap gap-2">
                  {analytics.weakThemes.slice(0, 8).map((theme) => (
                    <span
                      key={theme.id}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium"
                    >
                      {localizedTitle(theme.title) || theme.slug} · {pct(theme.accuracy)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {training?.categories?.length ? (
              <div className="space-y-2">
                {training.categories.map((cat) => (
                  <div key={cat.id} className="rounded-xl border border-white/[0.06] bg-slate-950/40 px-3 py-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                      <span className="uppercase tracking-wider">{cat.id}</span>
                      <span>
                        {cat.completedLessons}/{cat.totalLessons}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-violet-500"
                        style={{
                          width: `${cat.totalLessons ? Math.round((cat.completedLessons / cat.totalLessons) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : !loading && !error ? (
          <p className="text-slate-400 text-sm font-medium">
            ChessDuello kullanıcı adı veya üye ID kaydedin. Kulüp panelindeki ChessDuello sayfasından otomatik eşleme de yapılabilir.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 px-3 py-2.5">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-black text-white mt-1 truncate">{value}</div>
    </div>
  );
}
