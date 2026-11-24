import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Loader2, Swords, TrendingUp, User } from 'lucide-react';
import {
  chessduelloStudentSummary,
  localizedTitle,
  type ChessDuelloStudentSummary,
} from '../../lib/chessduelloClient';

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `%${Math.round(n)}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

const CATEGORY_TR: Record<string, string> = {
  tactics: 'Taktik',
  endgame: 'Oyunsonu',
  strategy: 'Strateji',
  opening: 'Açılış',
  middlegame: 'Orta Oyun',
  fundamentals: 'Temeller',
};

function categoryLabel(id: string): string {
  return CATEGORY_TR[id.toLowerCase()] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Doğruluk yüzdesine göre renk — hızlı okunsun diye. */
function accuracyTone(n: number | null | undefined): { text: string; bar: string } {
  if (n == null) return { text: 'text-slate-200', bar: 'bg-slate-500' };
  if (n >= 65) return { text: 'text-emerald-300', bar: 'bg-emerald-500' };
  if (n >= 45) return { text: 'text-amber-300', bar: 'bg-amber-500' };
  return { text: 'text-rose-300', bar: 'bg-rose-500' };
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

  const { member, training, analytics } = data ?? {};
  const weak = analytics?.weakThemes?.slice(0, 6) ?? [];
  const strong = analytics?.strongThemes?.slice(0, 6) ?? [];
  const categories = training?.categories ?? [];

  const maxTrend = useMemo(
    () => Math.max(1, ...((analytics?.trend ?? []).map((t) => t.attempts))),
    [analytics?.trend],
  );

  if (!memberId?.trim()) return null;
  if (!loading && (!data?.linked || (!member && !training && !analytics))) return null;

  const username = member?.username || training?.username || '';
  const avatar = member?.avatarUrl || training?.avatarUrl || null;
  const curriculumPct = training?.completionPercent ?? null;
  const accTone = accuracyTone(analytics?.accuracy);

  return (
    <section className="rounded-3xl border border-white/[0.07] bg-slate-900/60 overflow-hidden shadow-xl shadow-black/20">
      {loading && !data ? (
        <div className="flex items-center gap-2 px-6 py-10 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> ChessDuello yükleniyor…
        </div>
      ) : (
        <>
          {/* Hero — isim, müfredat ilerleme, ELO */}
          <header className="relative px-5 sm:px-6 py-5 bg-gradient-to-br from-violet-600/20 via-violet-500/5 to-transparent border-b border-white/[0.06]">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl ring-2 ring-violet-400/30 bg-violet-500/15 overflow-hidden flex items-center justify-center text-violet-200 shrink-0">
                {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <User className="w-7 h-7" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Swords className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-violet-300/90">ChessDuello</span>
                </div>
                <div className="text-xl font-black text-white truncate leading-tight mt-0.5">{username || '—'}</div>
                {training ? (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[11px] text-violet-200/80 font-semibold">
                      <span>Müfredat</span>
                      <span className="tabular-nums">{training.completedLessons}/{training.totalLessons} · {pct(curriculumPct)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.max(2, Math.round(curriculumPct ?? 0))}%` }} />
                    </div>
                  </div>
                ) : null}
              </div>
              {typeof member?.eloRating === 'number' ? (
                <div className="shrink-0 text-right">
                  <div className="text-3xl sm:text-4xl font-black text-white tabular-nums leading-none">{member.eloRating}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-violet-300/80 mt-1">ELO Puanı</div>
                </div>
              ) : null}
            </div>
          </header>

          <div className="p-5 sm:p-6 space-y-6">
            {/* Birincil metrikler — doğruluk öne çıkar */}
            {analytics ? (
              <div className="grid grid-cols-3 divide-x divide-white/[0.06] rounded-2xl border border-white/[0.06] bg-slate-950/40 overflow-hidden">
                <Metric label="İsabet" value={pct(analytics.accuracy)} valueClass={accTone.text} />
                <Metric label="30 gün deneme" value={(analytics.attempts ?? 0).toLocaleString('tr-TR')} />
                <Metric label="İlk deneme" value={pct(analytics.firstTryAccuracy)} />
              </div>
            ) : null}

            {/* İkincil metrikler — tek satır, ayraçlı */}
            {analytics ? (
              <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                <SubStat label="Doğru" value={`${(analytics.correct ?? 0).toLocaleString('tr-TR')} / ${(analytics.attempts ?? 0).toLocaleString('tr-TR')}`} />
                <SubStat label="Antrenman / Maç" value={`${analytics.trainingAttempts ?? 0} / ${analytics.matchAttempts ?? 0}`} />
                <SubStat label="Son cevap" value={fmtDate(analytics.lastAnsweredAt)} />
                {training?.lastTrainedAt ? <SubStat label="Son antrenman" value={fmtDate(training.lastTrainedAt)} /> : null}
              </dl>
            ) : null}

            {/* Müfredat ilerlemesi — kategoriler */}
            {categories.length ? (
              <div className="space-y-4">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Müfredat ilerlemesi</h4>
                <div className="space-y-4">
                  {categories.map((cat) => {
                    const total = cat.totalLessons || 0;
                    const done = cat.completedLessons || 0;
                    const width = total ? Math.round((done / total) * 100) : 0;
                    return (
                      <div key={cat.id}>
                        <div className="flex items-baseline justify-between gap-2 mb-1.5">
                          <span className="text-sm font-bold text-white">{categoryLabel(cat.id)}</span>
                          <span className="text-xs font-semibold text-slate-400 tabular-nums">{done}/{total} ders</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full rounded-full bg-violet-500 transition-[width] duration-500" style={{ width: `${width}%` }} />
                        </div>
                        {cat.lessons?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {cat.lessons.map((lsn) => {
                              const complete = lsn.status === 'completed' || (lsn.totalSteps > 0 && lsn.completedSteps >= lsn.totalSteps);
                              const started = !complete && lsn.completedSteps > 0;
                              return (
                                <span
                                  key={lsn.slug}
                                  title={`${localizedTitle(lsn.title) || lsn.slug} · ${lsn.completedSteps}/${lsn.totalSteps} adım`}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium ${
                                    complete
                                      ? 'bg-emerald-500/12 text-emerald-300'
                                      : started
                                        ? 'bg-violet-500/12 text-violet-200'
                                        : 'bg-white/[0.04] text-slate-400'
                                  }`}
                                >
                                  {complete ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                                  {localizedTitle(lsn.title) || lsn.slug}
                                </span>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* 30 günlük aktivite */}
            {analytics?.trend && analytics.trend.length > 1 ? (
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Son 30 gün aktivite</h4>
                </div>
                <div className="flex items-end justify-between gap-1.5 h-16 rounded-xl bg-slate-950/40 border border-white/[0.05] px-3 py-2">
                  {analytics.trend.map((t) => {
                    const h = t.attempts ? Math.max(8, Math.round((t.attempts / maxTrend) * 100)) : 2;
                    const acc = t.attempts ? t.correct / t.attempts : 0;
                    return (
                      <div
                        key={t.day}
                        className="flex-1 max-w-[14px] min-w-[4px] rounded-md bg-violet-500 self-end"
                        style={{ height: `${h}%`, opacity: t.attempts ? 0.45 + acc * 0.55 : 0.2 }}
                        title={`${fmtDate(t.day)}: ${t.correct}/${t.attempts} doğru`}
                      />
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">Çubuk yüksekliği günlük deneme, renk yoğunluğu doğruluk oranı.</p>
              </div>
            ) : null}

            {/* Temalar */}
            {weak.length || strong.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {weak.length ? (
                  <ThemeList title="Gelişime açık" tone="rose" themes={weak} />
                ) : null}
                {strong.length ? (
                  <ThemeList title="Güçlü yönler" tone="emerald" themes={strong} />
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value, valueClass = 'text-white' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <div className={`text-2xl font-black tabular-nums leading-none ${valueClass}`}>{value}</div>
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1.5">{label}</div>
    </div>
  );
}

function SubStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-bold text-slate-200 tabular-nums">{value}</dd>
    </div>
  );
}

function ThemeList({
  title,
  tone,
  themes,
}: {
  title: string;
  tone: 'rose' | 'emerald';
  themes: Array<{ id: number; slug: string; title: Record<string, string>; accuracy: number | null }>;
}) {
  const barBg = tone === 'rose' ? 'bg-rose-500/70' : 'bg-emerald-500/70';
  const dot = tone === 'rose' ? 'bg-rose-400' : 'bg-emerald-400';
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{title}</h4>
      </div>
      <ul className="space-y-1.5">
        {themes.map((t) => {
          const p = Math.max(0, Math.min(100, Math.round(t.accuracy ?? 0)));
          return (
            <li key={t.id} className="flex items-center gap-2.5">
              <span className="flex-1 min-w-0 text-sm text-slate-200 truncate">{localizedTitle(t.title) || t.slug}</span>
              <span className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden shrink-0">
                <span className={`block h-full ${barBg}`} style={{ width: `${p}%` }} />
              </span>
              <span className="w-9 text-right text-xs font-bold text-slate-300 tabular-nums shrink-0">%{p}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
