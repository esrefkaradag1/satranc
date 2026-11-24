import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Loader2, Swords, User } from 'lucide-react';
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
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
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
  return CATEGORY_TR[id.toLowerCase()] ?? id.toUpperCase();
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

  return (
    <section className="rounded-2xl border border-violet-500/20 bg-slate-900/50 overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-slate-700/60 flex items-center gap-2">
        <Swords className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-black text-white">ChessDuello</h3>
      </div>
      {loading && !data ? (
        <div className="flex items-center gap-2 px-5 py-6 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
        </div>
      ) : (
        <div className="p-4 sm:p-5 space-y-5">
          {/* Başlık */}
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
              {training?.lastTrainedAt ? (
                <div className="text-[11px] text-slate-500 mt-0.5">Son antrenman {fmtDate(training.lastTrainedAt)}</div>
              ) : null}
            </div>
            {typeof member?.eloRating === 'number' ? (
              <div className="rounded-xl bg-violet-500/15 border border-violet-500/30 px-3 py-1.5 text-center shrink-0">
                <div className="text-[10px] font-bold text-violet-300 uppercase tracking-wider">ELO</div>
                <div className="text-xl font-black text-white tabular-nums">{member.eloRating}</div>
              </div>
            ) : null}
          </div>

          {/* İstatistikler */}
          {analytics ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Stat label="30 gün deneme" value={String(analytics.attempts ?? 0)} />
              <Stat label="Doğru" value={String(analytics.correct ?? 0)} />
              <Stat label="İsabet" value={pct(analytics.accuracy)} />
              <Stat label="İlk deneme" value={pct(analytics.firstTryAccuracy)} />
              <Stat label="Antrenman / Maç" value={`${analytics.trainingAttempts ?? 0} / ${analytics.matchAttempts ?? 0}`} />
              <Stat label="Son cevap" value={fmtDate(analytics.lastAnsweredAt)} />
            </div>
          ) : null}

          {/* Müfredat kategorileri (Taktik / Oyunsonu / Strateji ...) */}
          {categories.length ? (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Müfredat ilerlemesi</div>
              <div className="space-y-2.5">
                {categories.map((cat) => {
                  const total = cat.totalLessons || 0;
                  const done = cat.completedLessons || 0;
                  const width = total ? Math.round((done / total) * 100) : 0;
                  return (
                    <div key={cat.id} className="rounded-xl border border-white/[0.06] bg-slate-950/40 px-3 py-2.5">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                        <span className="uppercase tracking-wider">{categoryLabel(cat.id)}</span>
                        <span className="tabular-nums text-slate-400">{done}/{total}</span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-violet-500" style={{ width: `${width}%` }} />
                      </div>
                      {cat.lessons?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {cat.lessons.map((lsn) => {
                            const complete = lsn.status === 'completed' || (lsn.totalSteps > 0 && lsn.completedSteps >= lsn.totalSteps);
                            return (
                              <span
                                key={lsn.slug}
                                title={`${localizedTitle(lsn.title) || lsn.slug} · ${lsn.completedSteps}/${lsn.totalSteps}`}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium ${
                                  complete
                                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                                    : 'bg-slate-800/70 border border-white/[0.06] text-slate-400'
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

          {/* 30 günlük aktivite (trend) */}
          {analytics?.trend?.length ? (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Son 30 gün aktivite</div>
              <div className="flex items-end gap-[2px] h-14">
                {analytics.trend.map((t) => {
                  const h = Math.round((t.attempts / maxTrend) * 100);
                  const acc = t.attempts ? t.correct / t.attempts : 0;
                  return (
                    <div
                      key={t.day}
                      className="flex-1 min-w-[2px] rounded-sm bg-slate-800 relative overflow-hidden"
                      style={{ height: '100%' }}
                      title={`${t.day}: ${t.correct}/${t.attempts} doğru`}
                    >
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-violet-500"
                        style={{ height: `${h}%`, opacity: 0.4 + acc * 0.6 }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Temalar */}
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

          {strong.length ? (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Güçlü temalar</div>
              <div className="flex flex-wrap gap-1.5">
                {strong.map((t) => (
                  <span
                    key={t.id}
                    className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium"
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
      <div className="text-sm font-black text-white mt-0.5 tabular-nums truncate">{value}</div>
    </div>
  );
}
