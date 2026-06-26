import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, Puzzle, TrendingDown, TrendingUp } from 'lucide-react';
import type { LichessPuzzleDashboard } from '../lib/lichessOAuthServer';
import { themeWinRate } from '../lib/lichessInsights';
import { fetchLichessPuzzleDashboard } from '../services/lichessOAuthClient';

type Props = {
  studentId: string;
  days?: number;
  compact?: boolean;
};

const THEME_TR: Record<string, string> = {
  advancedPawn: 'İleri piyon',
  anastasiaMate: 'Anastasia matı',
  arabianMate: 'Arap matı',
  fork: 'Çatal',
  pin: 'Tutuş',
  skewer: 'Şiş',
  mateIn1: '1 hamlede mat',
  mateIn2: '2 hamlede mat',
  mateIn3: '3 hamlede mat',
  backRankMate: 'Sırt sıra matı',
  discoveredAttack: 'Açma',
  sacrifice: 'Fedâ',
  endgame: 'Oyun sonu',
  middlegame: 'Orta oyun',
  opening: 'Açılış',
};

function themeLabel(key: string, fallback?: string): string {
  return THEME_TR[key] ?? fallback ?? key;
}

const LichessPuzzleDashboardSection: React.FC<Props> = ({ studentId, days = 30, compact = false }) => {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [dashboard, setDashboard] = useState<LichessPuzzleDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchLichessPuzzleDashboard(studentId, days).then((res) => {
      if (cancelled) return;
      setConnected(res.connected);
      setDashboard(res.dashboard ?? null);
      setError(res.error ?? null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [studentId, days]);

  const themeRows = useMemo(() => {
    if (!dashboard?.themes) return [];
    return Object.entries(dashboard.themes)
      .map(([key, row]) => ({
        key,
        label: themeLabel(key, row.theme),
        results: row.results,
        winRate: themeWinRate(row.results),
      }))
      .filter((r) => r.results.nb > 0)
      .sort((a, b) => b.results.nb - a.results.nb)
      .slice(0, compact ? 6 : 12);
  }, [dashboard, compact]);

  const weakThemes = useMemo(
    () => themeRows.filter((r) => r.results.nb >= 3 && r.winRate < 55).slice(0, 5),
    [themeRows],
  );

  if (loading) {
    return (
      <div className="rounded-xl bg-slate-800/50 border border-slate-700/60 px-4 py-6 flex items-center justify-center gap-2 text-sm text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Lichess bulmaca özeti yükleniyor…
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="rounded-xl bg-slate-800/40 border border-dashed border-slate-600/60 px-4 py-4 text-sm text-slate-500">
        Son {days} günlük tema analizi için öğrenci Lichess hesabını bağlamalı.
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 px-4 py-4 text-sm text-rose-300">
        {error || 'Bulmaca özeti alınamadı'}
      </div>
    );
  }

  const global = dashboard.global;
  const globalWinRate = themeWinRate(global);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-800/60 border border-emerald-500/20 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Puzzle className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-black text-white">Son {dashboard.days} gün — Lichess bulmaca özeti</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-slate-900/50 px-3 py-2">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Deneme</div>
            <div className="text-xl font-black text-white tabular-nums">{global.nb}</div>
          </div>
          <div className="rounded-lg bg-slate-900/50 px-3 py-2">
            <div className="text-[10px] text-slate-500 uppercase font-bold">İlk denemede doğru</div>
            <div className="text-xl font-black text-emerald-400 tabular-nums">{global.firstWins}</div>
          </div>
          <div className="rounded-lg bg-slate-900/50 px-3 py-2">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Başarı</div>
            <div className="text-xl font-black text-sky-400 tabular-nums">%{globalWinRate}</div>
          </div>
          <div className="rounded-lg bg-slate-900/50 px-3 py-2">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Performans</div>
            <div className="text-xl font-black text-amber-300 tabular-nums">{global.performance}</div>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          Ortalama bulmaca rating: <span className="text-slate-300 font-semibold">{global.puzzleRatingAvg}</span>
        </p>
      </div>

      {weakThemes.length > 0 ? (
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">Geliştirilmesi önerilen temalar</h4>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {weakThemes.map((t) => (
              <li key={t.key} className="flex justify-between gap-2">
                <span>{t.label}</span>
                <span className="text-amber-300 font-bold tabular-nums">%{t.winRate} ({t.results.nb})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {themeRows.length > 0 ? (
        <div className="rounded-xl bg-slate-800/50 border border-slate-700/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-sky-400" />
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tema dağılımı</h4>
          </div>
          <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {themeRows.map((t) => (
              <li key={t.key} className="flex items-center gap-3 text-xs">
                <span className="flex-1 min-w-0 truncate text-slate-300">{t.label}</span>
                <span className="text-slate-500 tabular-nums shrink-0">{t.results.nb}</span>
                <span className={`font-bold tabular-nums shrink-0 ${t.winRate >= 60 ? 'text-emerald-400' : t.winRate >= 45 ? 'text-slate-300' : 'text-rose-400'}`}>
                  %{t.winRate}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" />
          Bu dönemde tema verisi henüz yok.
        </p>
      )}
    </div>
  );
};

export default LichessPuzzleDashboardSection;
