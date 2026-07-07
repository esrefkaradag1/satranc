import React, { useMemo } from 'react';
import { PieChart, Target, Users } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Student } from '../../types';
import type { ChessComGame, ChessComPlayer, ChessComStats, LichessGame, LichessUserProfile } from '../../services/chessPlatformService';
import { chessComProfileUrl, lichessProfileUrl } from '../../lib/analysisDashboardUtils';
import {
  computeChessComWinRate,
  computeCombinedPerformance,
  computeLichessWinRate,
} from '../../lib/combinedPlatformPerformance';
import { PlatformAnalysisCard, useRecentGames } from '../analysis/AnalysisDashboardPanels';

type Props = {
  student: Student;
  lichessProfile: LichessUserProfile | null;
  chessComStats: ChessComStats | null;
  lichessGames: LichessGame[];
  chessComGames: ChessComGame[];
  platformLoading: boolean;
  homeworkAccuracy: number;
};

export const StudentPlatformAnalysisSection: React.FC<Props> = ({
  student,
  lichessProfile,
  chessComStats,
  lichessGames,
  chessComGames,
  platformLoading,
  homeworkAccuracy,
}) => {
  const recentGames = useRecentGames(
    lichessGames,
    chessComGames,
    student.lichessUsername,
    student.chessComUsername,
  );

  const lichessWinRate = useMemo(
    () => computeLichessWinRate(student.lichessUsername, lichessGames),
    [student.lichessUsername, lichessGames],
  );

  const chessComWinRate = useMemo(
    () => computeChessComWinRate(student.chessComUsername, chessComGames),
    [student.chessComUsername, chessComGames],
  );

  const combinedPerformance = useMemo(
    () => computeCombinedPerformance(student, lichessGames, chessComGames),
    [student, lichessGames, chessComGames],
  );

  const hasPlatformUsernames = !!student.lichessUsername?.trim() || !!student.chessComUsername?.trim();

  if (!hasPlatformUsernames) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] py-8 px-4 text-center">
        <p className="text-sm text-slate-400">Öğrenci profilinde Lichess veya Chess.com kullanıcı adı tanımlı değil.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlatformAnalysisCard
          platform="lichess"
          username={student.lichessUsername}
          profileUrl={student.lichessUsername ? lichessProfileUrl(student.lichessUsername) : undefined}
          rapidRating={lichessProfile?.perfs?.rapid?.rating ?? '—'}
          winRate={lichessWinRate}
          games={recentGames}
          loading={platformLoading}
          accentClass="bg-sky-500/5"
          borderClass="border-sky-500/10"
          icon={
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center text-sky-400 border border-sky-500/20">
              <Users className="w-5 h-5" />
            </div>
          }
        />
        <PlatformAnalysisCard
          platform="chesscom"
          username={student.chessComUsername}
          profileUrl={student.chessComUsername ? chessComProfileUrl(student.chessComUsername) : undefined}
          rapidRating={chessComStats?.chess_rapid?.last?.rating ?? '—'}
          winRate={chessComWinRate}
          games={recentGames}
          loading={platformLoading}
          accentClass="bg-[#81b64c]/5"
          borderClass="border-[#81b64c]/10"
          icon={
            <div className="w-10 h-10 rounded-xl bg-[#81b64c]/20 flex items-center justify-center text-[#81b64c] border border-[#81b64c]/20">
              <Target className="w-5 h-5" />
            </div>
          }
        />
      </div>

      <div className="bg-[#1e293b]/50 backdrop-blur-2xl p-5 sm:p-8 rounded-[2rem] border border-white/10 shadow-2xl space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-black text-white text-xs uppercase tracking-[0.2em] flex items-center gap-3">
            <PieChart className="w-5 h-5 text-violet-400" />
            Kapsamlı Platform + Ödev Analizi
          </h3>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            Lichess + Chess.com + Ödev verisi
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Toplam Oyun</p>
            <p className="text-2xl font-black text-white">{combinedPerformance.totalGames}</p>
          </div>
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-[9px] font-black text-emerald-300/80 uppercase tracking-widest">Win Rate</p>
            <p className="text-2xl font-black text-emerald-300">%{combinedPerformance.winRate}</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-500/10 border border-slate-400/20">
            <p className="text-[9px] font-black text-slate-300/80 uppercase tracking-widest">Draw Rate</p>
            <p className="text-2xl font-black text-slate-200">%{combinedPerformance.drawRate}</p>
          </div>
          <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
            <p className="text-[9px] font-black text-indigo-300/80 uppercase tracking-widest">Ödev Doğruluk</p>
            <p className="text-2xl font-black text-indigo-300">%{homeworkAccuracy}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">En Çok Oynanan Tempo</p>
            <p className="text-sm mt-1 font-black text-white uppercase">{combinedPerformance.topSpeed}</p>
          </div>
          <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Favori Açılış (Lichess)</p>
            <p className="text-sm mt-1 font-black text-white truncate">{combinedPerformance.topOpening}</p>
          </div>
          <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Kalite Göstergesi</p>
            <p className="text-sm mt-1 font-black text-white">
              Lichess Δ {combinedPerformance.avgLichessRatingDiff != null ? combinedPerformance.avgLichessRatingDiff : '—'} ·
              Chess.com Acc {combinedPerformance.avgChessComAccuracy != null ? `%${combinedPerformance.avgChessComAccuracy}` : '—'}
            </p>
          </div>
        </div>

        <div className="h-[220px] w-full bg-black/20 rounded-3xl p-4 border border-white/5 shadow-inner">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={combinedPerformance.last14DaysActivity}>
              <defs>
                <linearGradient id="parentAnalysisActivity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }} dy={8} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}
                itemStyle={{ color: '#fff', fontWeight: 700, fontSize: '12px' }}
                labelStyle={{ color: '#94a3b8', marginBottom: '6px', fontSize: '10px' }}
              />
              <Area type="monotone" dataKey="games" stroke="#a78bfa" strokeWidth={3} fillOpacity={1} fill="url(#parentAnalysisActivity)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
