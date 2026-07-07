import React from 'react';
import {
  Copy,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Shield,
  Trophy,
} from 'lucide-react';
import type { Student } from '../../types';
import { federationLabel, type FidePlayer } from '../../services/fideService';

type CoachProps = {
  mode: 'coach';
  student: Student;
  fideIdInput: string;
  onFideIdChange: (value: string) => void;
  onFideIdBlur: () => void;
  onLoadFide: () => void;
  loadingFide: boolean;
  fideProfile: FidePlayer | null;
  onFetchUkd: (opts?: { force?: boolean }) => void;
  loadingUkdFetch: boolean;
  ukdFetchNote: string | null;
  onOpenUkdImport: () => void;
};

type ViewerProps = {
  mode: 'viewer';
  student: Student;
  fideProfile: FidePlayer | null;
  resolvedFideId?: string | null;
  loadingFide: boolean;
  tsfUkdLive?: number | null;
  loadingTsfUkd?: boolean;
  tsfUkdError?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
};

export type UkdFideRatingsPanelProps = CoachProps | ViewerProps;

function StatHero({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent: 'indigo' | 'amber';
}) {
  const ring = accent === 'indigo' ? 'from-indigo-500/20 to-violet-500/5 border-indigo-500/25' : 'from-amber-500/20 to-orange-500/5 border-amber-500/25';
  const text = accent === 'indigo' ? 'text-indigo-300' : 'text-amber-300';
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-5 ${ring}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className={`mt-2 text-4xl font-black tabular-nums text-white`}>{value}</p>
      {sub ? <p className={`mt-1 text-xs font-medium ${text}`}>{sub}</p> : null}
    </div>
  );
}

function RatingChip({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string | number;
  accent: 'indigo' | 'sky' | 'amber';
  hint?: string;
}) {
  const border =
    accent === 'indigo' ? 'border-l-indigo-500' : accent === 'sky' ? 'border-l-sky-500' : 'border-l-amber-500';
  const valueColor =
    accent === 'indigo' ? 'text-indigo-400' : accent === 'sky' ? 'text-sky-400' : 'text-amber-400';
  return (
    <div className={`rounded-xl border border-slate-700/50 border-l-4 ${border} bg-slate-900/40 px-4 py-3.5`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${valueColor}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export const UkdFideRatingsPanel: React.FC<UkdFideRatingsPanelProps> = (props) => {
  const { student, mode } = props;
  const isCoach = mode === 'coach';
  const fideProfile = props.fideProfile;
  const loadingFide = props.loadingFide;

  const fideIdDisplay = isCoach
    ? props.fideIdInput.trim() || student.fideId || '—'
    : student.fideId || props.resolvedFideId || '—';

  const fideIdForLink = isCoach
    ? (props.fideIdInput.trim().replace(/\D/g, '') || student.fideId)
    : (student.fideId || props.resolvedFideId || '');

  const ukdDisplay = student.ukd != null && student.ukd > 0 ? student.ukd : '—';
  const fideStandard = fideProfile?.standard ?? '—';

  const onRefresh = isCoach
    ? () => {
        props.onLoadFide();
        void props.onFetchUkd({ force: true });
      }
    : props.onRefresh;

  const refreshing = isCoach
    ? props.loadingFide || props.loadingUkdFetch
    : props.refreshing;

  return (
    <div className="rounded-2xl bg-slate-900/50 backdrop-blur-xl border border-white/[0.06] shadow-xl overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-white/[0.06] bg-gradient-to-r from-slate-900/80 via-indigo-950/30 to-amber-950/20 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/30 to-amber-500/20 border border-white/10 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-white tracking-tight">UKD & FIDE Bilgileri</h2>
            <p className="text-[11px] text-slate-400 truncate">
              {isCoach ? 'TSF UKD ve FIDE dereceleri' : 'Kayıtlı dereceler — salt okunur'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-bold disabled:opacity-50 transition-colors"
            >
              {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Yenile
            </button>
          ) : null}
          <a
            href="https://ukd.tsf.org.tr/ukdsorgulama.php"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> TSF
          </a>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        {!isCoach ? (
          <div className="flex items-start gap-2 rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3 text-xs text-slate-400">
            <Shield className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>UKD, FIDE ID ve derece bilgileri yalnızca antrenör tarafından güncellenir; bu ekranda değiştirilemez.</span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatHero label="UKD (TSF)" value={ukdDisplay} sub="Ulusal kuvvet derecesi" accent="indigo" />
          <StatHero
            label="FIDE Standard"
            value={fideStandard}
            sub={fideProfile?.name || 'Klasik ELO'}
            accent="amber"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* TSF UKD */}
          <section className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-indigo-300">TSF UKD</h3>
              <a
                href="https://ukd.tsf.org.tr/ukdsorgulama.php"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
              >
                ukd.tsf.org.tr <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">TC Kimlik No</p>
              {student.tcNo ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white font-mono text-sm tracking-wide">
                    {student.tcNo}
                  </span>
                  {isCoach ? (
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(student.tcNo || '')}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                    >
                      <Copy className="w-3.5 h-3.5" /> Kopyala
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-slate-500">{isCoach ? 'TC yok — öğrenci düzenlemeden ekleyin' : 'Kayıtlı TC yok'}</p>
              )}
            </div>

            <div className="rounded-xl bg-slate-950/40 border border-slate-800/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Kayıtlı UKD</p>
                <p className="text-2xl font-black text-white tabular-nums mt-0.5">{ukdDisplay}</p>
              </div>
              {!isCoach && props.loadingTsfUkd ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Kontrol…
                </span>
              ) : !isCoach && props.tsfUkdLive != null ? (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-bold">
                  TSF: {props.tsfUkdLive}
                </span>
              ) : !isCoach && props.tsfUkdError && student.tcNo ? (
                <span className="text-[10px] text-slate-500 max-w-[10rem] text-right" title={props.tsfUkdError}>
                  {props.tsfUkdError === 'Kayıt bulunamadı' ? 'TSF kaydı yok' : 'TSF sorgusu başarısız'}
                </span>
              ) : isCoach && props.ukdFetchNote ? (
                <span className="text-[10px] text-slate-400 max-w-[11rem] text-right">{props.ukdFetchNote}</span>
              ) : null}
            </div>

            {isCoach ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void props.onFetchUkd({ force: true })}
                  disabled={props.loadingUkdFetch}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/25 text-emerald-300 text-xs font-bold disabled:opacity-50"
                >
                  {props.loadingUkdFetch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  UKD çek
                </button>
                <button
                  type="button"
                  onClick={props.onOpenUkdImport}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/25 text-indigo-300 text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5" /> Elle aktar
                </button>
              </div>
            ) : null}
          </section>

          {/* FIDE */}
          <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-amber-300">FIDE</h3>
              <a
                href="https://ratings.fide.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-bold text-amber-400 hover:text-amber-300 inline-flex items-center gap-1"
              >
                ratings.fide.com <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {isCoach ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">FIDE ID</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={props.fideIdInput}
                    onChange={(e) => props.onFideIdChange(e.target.value)}
                    onBlur={props.onFideIdBlur}
                    placeholder="FIDE ID veya otomatik ara…"
                    className="flex-1 min-w-[10rem] px-3 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white text-sm font-mono placeholder:text-slate-600 focus:ring-2 focus:ring-amber-500/30 outline-none"
                  />
                  <button
                    type="button"
                    onClick={props.onLoadFide}
                    disabled={loadingFide}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold disabled:opacity-50"
                  >
                    {loadingFide ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {props.fideIdInput.trim() ? 'Yenile' : 'Ara & çek'}
                  </button>
                </div>
                {!props.fideIdInput.trim() ? (
                  <p className="text-[10px] text-slate-500">ID boşsa ad ve doğum yılıyla aranır.</p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">FIDE ID</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white font-mono text-sm">
                    {fideIdDisplay}
                  </span>
                  {fideIdForLink ? (
                    <a
                      href={`https://ratings.fide.com/profile/${fideIdForLink}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/25"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Profil
                    </a>
                  ) : null}
                </div>
                {!student.fideId && props.resolvedFideId ? (
                  <p className="text-[10px] text-slate-500">Ad ve doğum yılıyla eşleştirildi.</p>
                ) : null}
              </div>
            )}

            {fideIdForLink && isCoach ? (
              <a
                href={`https://ratings.fide.com/profile/${fideIdForLink}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300"
              >
                <ExternalLink className="w-3.5 h-3.5" /> ratings.fide.com profili
              </a>
            ) : null}
          </section>
        </div>

        {/* FIDE profile detail */}
        {(fideIdForLink || loadingFide) && (isCoach ? props.fideIdInput.trim() : true) ? (
          loadingFide && !fideProfile ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400 rounded-2xl border border-dashed border-slate-700/60">
              <Loader2 className="w-5 h-5 animate-spin" /> FIDE verileri yükleniyor…
            </div>
          ) : fideProfile ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-4 sm:p-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-black text-white">{fideProfile.name}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
                    <span>Federasyon: {federationLabel(fideProfile.federation)}</span>
                    {fideProfile.year != null ? <span>Doğum: {fideProfile.year}</span> : null}
                    {fideProfile.inactive ? <span className="text-amber-400 font-semibold">Pasif</span> : null}
                  </div>
                </div>
                <a
                  href={`https://ratings.fide.com/profile/${fideProfile.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-bold hover:bg-amber-500/30"
                >
                  <ExternalLink className="w-4 h-4" /> Profil
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <RatingChip label="Standard" value={fideProfile.standard ?? '—'} accent="indigo" hint="Klasik" />
                <RatingChip label="Rapid" value={fideProfile.rapid ?? '—'} accent="sky" />
                <RatingChip label="Blitz" value={fideProfile.blitz ?? '—'} accent="amber" />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-6 text-center text-sm text-slate-500">
              FIDE profili bulunamadı veya geçersiz ID.
            </div>
          )
        ) : isCoach ? (
          <div className="rounded-2xl border border-dashed border-slate-700/60 bg-slate-800/20 px-6 py-10 text-center">
            <Trophy className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              FIDE ID girildiğinde dereceler <span className="text-amber-400">ratings.fide.com</span> üzerinden otomatik yüklenir.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700/60 bg-slate-800/20 px-6 py-10 text-center">
            <Trophy className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              FIDE ID antrenör tarafından tanımlandığında dereceler burada görüntülenecektir.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
