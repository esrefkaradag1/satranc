import React from 'react';
import {
  Calendar, CalendarCheck, CalendarDays, CheckSquare, ChevronRight,
  ExternalLink, Image as ImageIcon, ShieldCheck, Trophy,
  User, Users, Video, Wallet, BarChart3,
} from 'lucide-react';
import type { Student, Transaction } from '../../types';
import { Dashboard3DBackground } from '../dashboard/Dashboard3DBackground';
import { DashboardHeroScene } from '../dashboard/DashboardHeroScene';
import { QuickMenuButton, QuickStatCard } from '../dashboard/dashboardQuickUI';
import { LeaderboardPreview } from '../leaderboard/LeaderboardPreview';
import type { HomeworkPuzzleAttempt } from '../../types';

type PanelTab = string;

type Props = {
  student: Student;
  students: Student[];
  studentId: string;
  viewAs: 'student' | 'parent';
  derived: {
    attendanceRate: string;
    totalAttendance: number;
  };
  homeworkAttempts: HomeworkPuzzleAttempt[];
  studentTransactions: Transaction[];
  statusBadge: React.ReactNode;
  onTabChange: (tab: PanelTab) => void;
  onOpenLoginInfo: () => void;
  formatDateTR: (iso?: string) => string;
  ageFromBirthDate: (iso?: string) => number | null;
  initials: (name: string) => string;
};

export const StudentSummaryDashboard: React.FC<Props> = ({
  student,
  students,
  studentId,
  viewAs,
  derived,
  homeworkAttempts,
  studentTransactions,
  statusBadge,
  onTabChange,
  onOpenLoginInfo,
  formatDateTR,
  ageFromBirthDate,
  initials: studentInitials,
}) => {
  const firstName = student.name.split(' ')[0];
  const todayLabel = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const groupName = student.group?.trim() || '—';
  const groupMeta = [student.branchOffice, student.branch].filter(Boolean).join(' · ') || 'Henüz grup yok';

  return (
    <Dashboard3DBackground>
      <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-300">
        {/* Hoş geldin + özet */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-7 relative rounded-2xl h-[128px] sm:h-[132px] overflow-hidden shadow-lg shadow-indigo-900/30 border border-indigo-400/25 dashboard-glass">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/50 via-violet-500/25 to-transparent pointer-events-none" />
            <DashboardHeroScene />
            <div className="relative z-10 h-full flex flex-col justify-center pl-5 sm:pl-6 pr-[42%] sm:pr-[38%]">
              <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest capitalize">{todayLabel}</p>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-0.5 leading-tight">
                {viewAs === 'student' ? `Merhaba, ${firstName}` : 'Veli Paneli'}
              </h2>
              <p className="text-xs sm:text-sm text-indigo-100/80 font-medium mt-1 line-clamp-2">
                {viewAs === 'student'
                  ? 'Ödevler, ders programı ve galeriye hızlıca geç'
                  : `${student.name} — devam ve ödeme bilgileri`}
              </p>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-3 gap-3">
            <QuickStatCard
              icon={<CalendarCheck className="w-5 h-5" />}
              value={derived.attendanceRate}
              label="Devam"
              sub="30 gün"
              bg="from-rose-700 to-rose-900"
              onClick={() => onTabChange('attendance')}
            />
            <QuickStatCard
              icon={<Calendar className="w-5 h-5" />}
              value={String(derived.totalAttendance)}
              label="Katılım"
              sub="Toplam ders"
              bg="from-violet-700 to-purple-900"
              onClick={() => onTabChange('attendance')}
            />
            <QuickStatCard
              icon={<Users className="w-5 h-5" />}
              value={groupName}
              valueClassName="text-sm sm:text-base font-bold leading-tight line-clamp-2 px-1 normal-case tracking-tight"
              label="Grup"
              sub={groupMeta}
              bg="from-emerald-700 to-green-900"
              onClick={() => onTabChange('profile')}
            />
          </div>
        </section>

        {/* Hızlı menü */}
        <section className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 sm:gap-3">
          <QuickMenuButton icon={<Trophy className="w-5 h-5" />} label="Liderlik" color="amber" onClick={() => onTabChange('leaderboard')} />
          {viewAs !== 'parent' && (
            <QuickMenuButton icon={<CheckSquare className="w-5 h-5" />} label="Ödevler" color="emerald" onClick={() => onTabChange('puzzles')} />
          )}
          <QuickMenuButton icon={<CalendarDays className="w-5 h-5" />} label="Program" color="indigo" onClick={() => onTabChange('schedule')} />
          {viewAs !== 'parent' && (
            <QuickMenuButton icon={<Video className="w-5 h-5" />} label="Canlı Ders" color="violet" onClick={() => onTabChange('live-lesson')} />
          )}
          <QuickMenuButton icon={<ImageIcon className="w-5 h-5" />} label="Galeri" color="sky" onClick={() => onTabChange('gallery')} />
          <QuickMenuButton icon={<CalendarCheck className="w-5 h-5" />} label="Devam" color="rose" onClick={() => onTabChange('attendance')} />
        </section>

        {/* Profil */}
        <div className="bento-card overflow-hidden">
          <div className="p-5 sm:p-6 flex flex-col sm:flex-row gap-6 items-center sm:items-start">
            <div className="flex-1 min-w-0 w-full order-2 sm:order-1">
              {viewAs === 'parent' && (
                <p className="text-[10px] font-bold text-indigo-400/90 uppercase tracking-wider mb-0.5">Çocuğunuz</p>
              )}
              <h3 className="text-lg sm:text-xl font-bold text-white">{student.name}</h3>
              <p className="text-slate-400 text-sm mt-0.5">{[student.branch, student.group].filter(Boolean).join(' · ') || '—'}</p>
              <div className="mt-2">{statusBadge}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
                <span>TC: {student.tcNo || '—'}</span>
                <span>{ageFromBirthDate(student.birthDate) != null ? `${ageFromBirthDate(student.birthDate)} yaş` : '—'}</span>
                <span>{student.branchOffice || '—'}</span>
              </div>
            </div>
            <div className="shrink-0 order-1 sm:order-2">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl premium-gradient flex items-center justify-center text-white text-2xl font-bold shadow-xl shadow-indigo-900/40 overflow-hidden ring-2 ring-white/15">
                {student.photoUrl ? (
                  <img src={student.photoUrl} alt={student.name} className="w-full h-full object-cover" />
                ) : (
                  studentInitials(student.name)
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Lider tablosu */}
        <LeaderboardPreview
          allStudents={students}
          anchorStudent={student}
          homeworkAttempts={homeworkAttempts}
          highlightStudentId={studentId}
          onViewAll={() => onTabChange('leaderboard')}
        />

        {/* Detaylı hızlı geçiş */}
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
            {viewAs === 'student' ? 'Tüm alanlar' : 'Çocuğunuzla ilgili alanlar'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              { tab: 'leaderboard', icon: <Trophy className="w-5 h-5" />, title: 'Lider tablosu', sub: 'Haftalık sıralama', color: 'text-amber-400 bg-amber-500/15' },
              ...(viewAs !== 'parent' ? [{ tab: 'puzzles', icon: <CheckSquare className="w-5 h-5" />, title: 'Ödevler / Bulmaca', sub: 'Ödevlere git', color: 'text-emerald-400 bg-emerald-500/15' }] : []),
              { tab: 'schedule', icon: <CalendarDays className="w-5 h-5" />, title: 'Ders programı', sub: 'Haftalık program', color: 'text-indigo-400 bg-indigo-500/15' },
              { tab: 'gallery', icon: <ImageIcon className="w-5 h-5" />, title: 'Medya & Galeri', sub: 'Fotoğraflar', color: 'text-violet-400 bg-violet-500/15' },
              ...(viewAs !== 'parent' ? [{ tab: 'live-lesson', icon: <Video className="w-5 h-5" />, title: 'Canlı ders', sub: 'Derse katıl', color: 'text-sky-400 bg-sky-500/15' }] : []),
              { tab: 'attendance', icon: <CalendarCheck className="w-5 h-5" />, title: 'Devam', sub: 'Yoklama bilgisi', color: 'text-rose-400 bg-rose-500/15' },
              { tab: 'profile', icon: <User className="w-5 h-5" />, title: 'Profil', sub: 'Kişisel bilgiler', color: 'text-slate-300 bg-white/10' },
              ...(viewAs !== 'parent' ? [{ tab: 'analyses', icon: <BarChart3 className="w-5 h-5" />, title: 'Analizler', sub: 'Performans raporu', color: 'text-indigo-300 bg-indigo-500/15' }] : []),
            ].map((item) => (
              <button
                key={item.tab}
                type="button"
                onClick={() => onTabChange(item.tab)}
                className="group bento-card flex items-center gap-4 p-4 text-left w-full"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${item.color} group-hover:scale-105 transition-transform`}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-bold text-white block truncate">{item.title}</span>
                  <span className="text-xs text-slate-500">{item.sub}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-indigo-400 shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        </div>

        {viewAs !== 'student' && (
          <div className="bento-card p-5">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-indigo-400" />
              {viewAs === 'parent' ? 'Çocuğunuzun ödeme geçmişi' : 'Ödeme Geçmişi'}
            </h3>
            {studentTransactions.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">Henüz kayıtlı ödeme yok.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {studentTransactions.slice(0, 10).map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <div>
                      <p className="text-sm font-semibold text-white">{t.category}</p>
                      <p className="text-xs text-slate-500">{formatDateTR(t.date)} · {t.paymentType}</p>
                    </div>
                    <span className="text-sm font-bold text-emerald-400">₺{Number(t.amount).toLocaleString('tr-TR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Hesap</p>
            <button
              type="button"
              onClick={onOpenLoginInfo}
              className="bento-card w-full flex items-center gap-3 p-4 text-left hover:border-indigo-500/25 transition-colors"
            >
              <User className="w-5 h-5 text-indigo-400 shrink-0" />
              <span className="text-sm font-medium text-slate-200">{viewAs === 'student' ? 'Hesap / Giriş bilgisi' : 'Giriş bilgisi'}</span>
              <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
            </button>
          </div>
          {viewAs !== 'parent' && (
            <div className="flex-1 sm:flex-[2]">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Dış bağlantılar</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => window.open(student.lichessUsername ? `https://lichess.org/@/${encodeURIComponent(student.lichessUsername)}` : 'https://lichess.org/', '_blank')} className="bento-card flex items-center gap-2 px-4 py-3 text-left hover:border-sky-500/30 transition-colors">
                  <ExternalLink className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="text-sm font-medium text-slate-200">Lichess</span>
                </button>
                <button type="button" onClick={() => window.open(student.chessComUsername ? `https://www.chess.com/member/${encodeURIComponent(student.chessComUsername)}` : 'https://www.chess.com/', '_blank')} className="bento-card flex items-center gap-2 px-4 py-3 text-left hover:border-emerald-500/30 transition-colors">
                  <ExternalLink className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-sm font-medium text-slate-200">Chess.com</span>
                </button>
                <button type="button" onClick={() => window.open('https://ukd.tsf.org.tr/ukdsorgulama.php', '_blank')} className="bento-card flex items-center gap-2 px-4 py-3 text-left hover:border-amber-500/30 transition-colors">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-sm font-medium text-slate-200">UKD/FIDE</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dashboard3DBackground>
  );
};
