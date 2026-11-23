import React, { useEffect, useState } from 'react';
import { Loader2, Swords, User } from 'lucide-react';
import {
  chessduelloStudentSummary,
  localizedTitle,
  type ChessDuelloStudentSummary,
} from '../../lib/chessduelloClient';

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `%${Math.round(n)}`;
}

/** Öğrenci / veli özetinde ChessDuello kartı — yalnızca eşlenmiş öğrencide görünür. */
export default function StudentChessDuelloSummary({
  studentId,
  memberId,
}: {
  studentId: string;
  memberId?: string | null;
}) {
  const [data, setData] = useState<ChessDuelloStudentSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!memberId?.trim()) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    chessduelloStudentSummary(studentId)
      .then((r) => {
        if (!cancelled) setData(r.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, memberId]);

  if (!memberId?.trim()) return null;
  if (!loading && (!data?.linked || (!data.member && !data.training && !data.analytics))) return null;

  const { member, training, analytics } = data ?? {};
  const username = member?.username || training?.username || '';
  const avatar = member?.avatarUrl || training?.avatarUrl || null;
  const weak = analytics?.weakThemes?.slice(0, 4) ?? [];

  return (
    <section className="mt-4 rounded-2xl border border-violet-500/20 bg-slate-900/50 overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-slate-700/60 flex items-center gap-2">
        <Swords className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-black text-white">ChessDuello</h3>
      </div>
      {loading && !data ? (
        <div className="flex items-center gap-2 px-5 py-6 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
        </div>
      ) : (
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-violet-500/15 flex items-center justify-center text-violet-300 overflow-hidden shrink-0">
              {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <User className="w-6 h-6" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base font-black text-white truncate">{username || 'ChessDuello'}</div>
              {training ? (
                <div className="text-xs text-slate-400">
                  Müfredat {training.completedLessons}/{training.totalLessons} · {pct(training.completionPercent)}
                </div>
              ) : null}
            </div>
            {typeof member?.eloRating === 'number' ? (
              <div className="rounded-xl bg-violet-500/15 border border-violet-500/30 px-3 py-1.5 text-center shrink-0">
                <div className="text-[10px] font-bold text-violet-300 uppercase tracking-wider">ELO</div>
                <div className="text-xl font-black text-white tabular-nums">{member.eloRating}</div>
              </div>
            ) : null}
          </div>

          {analytics ? (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="30 gün deneme" value={String(analytics.attempts ?? 0)} />
              <Stat label="İsabet" value={pct(analytics.accuracy)} />
              <Stat label="İlk deneme" value={pct(analytics.firstTryAccuracy)} />
            </div>
          ) : null}

          {weak.length ? (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Çalışılması gereken temalar</div>
              <div className="flex flex-wrap gap-1.5">
                {weak.map((t) => (
                  <span
                    key={t.id}
                    className="px-2 py-0.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium"
                  >
                    {localizedTitle(t.title) || t.slug} · {pct(t.accuracy)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 px-2.5 py-2 min-w-0">
      <div className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">{label}</div>
      <div className="text-sm font-black text-white mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
