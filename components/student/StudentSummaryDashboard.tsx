import React from 'react';
import {
  Bell, Calendar, CalendarCheck, CalendarDays, CheckSquare, ChevronRight,
  ExternalLink, GraduationCap, Image as ImageIcon, BookOpen, ShieldCheck, Trophy,
  User, Users, Video, Wallet, BarChart3,
} from 'lucide-react';
import type { Student, Transaction } from '../../types';
import { Dashboard3DBackground } from '../dashboard/Dashboard3DBackground';
import { DashboardHeroScene } from '../dashboard/DashboardHeroScene';
import { QuickMenuButton, QuickStatCard } from '../dashboard/dashboardQuickUI';
import { LeaderboardPreview } from '../leaderboard/LeaderboardPreview';
import type { HomeworkPuzzleAttempt } from '../../types';
import type { ClubDisplayInfo } from '../../lib/clubDisplay';
import { clubNameInitials } from '../../lib/clubDisplay';

type PanelTab = string;

export type StudentDashboardAlert = {
  id: string;
  kind: 'homework' | 'study' | 'training';
  title: string;
  detail: string;
  tab: PanelTab;
};

type Props = {
  student: Student;
  students: Student[];
  studentId: string;
  viewAs: 'student' | 'parent';
  derived: {
    attendanceRate: string;
    totalAttendance: number;
  };
  privateLessonSummary?: {
    packageName: string;
    branchOffice: string;
    discipline: string;
    totalLessons?: number;
    usedLessons: number;
    remainingLessons?: number;
    attendanceUsedLessons: number;
    startingUsedLessons: number;
    saleDate: string;
  } | null;
  homeworkAttempts: HomeworkPuzzleAttempt[];
  studentTransactions: Transaction[];
  statusBadge: React.ReactNode;
  onTabChange: (tab: PanelTab) => void;
  onOpenLoginInfo: () => void;
  formatDateTR: (iso?: string) => string;
  ageFromBirthDate: (iso?: string) => number | null;
  initials: (name: string) => string;
  clubDisplay?: ClubDisplayInfo | null;
  alerts?: StudentDashboardAlert[];
  pendingHomeworkCount?: number;
  pendingStudyCount?: number;
};

export const StudentSummaryDashboard: React.FC<Props> = ({
  student,
  students,
  studentId,
  viewAs,
  derived,
  privateLessonSummary,
  homeworkAttempts,
  studentTransactions,
  statusBadge,
  onTabChange,
  onOpenLoginInfo,
  formatDateTR,
  ageFromBirthDate,
  initials: studentInitials,
  clubDisplay,
  alerts = [],
  pendingHomeworkCount = 0,
  pendingStudyCount = 0,
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
              {clubDisplay ? (
                <div className="flex items-center gap-2.5 mb-2 min-w-0">
                  {clubDisplay.logoUrl ? (
                    <img
                      src={clubDisplay.logoUrl}
                      alt={clubDisplay.name}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover border border-white/20 shadow-md shadow-black/20 shrink-0 bg-white/10"
                    />
                  ) : (
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white font-black text-xs sm:text-sm shrink-0 shadow-md shadow-black/20">
                      {clubNameInitials(clubDisplay.name)}
                    </div>
                  )}
                  <p className="text-[11px] sm:text-xs font-bold text-white/90 uppercase tracking-wide line-clamp-2 leading-snug">
                    {clubDisplay.name}
                  </p>
                </div>
              ) : null}
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

        {viewAs === 'student' && alerts.length > 0 ? (
          <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-amber-400/90 uppercase tracking-widest">Bildirimler</p>
                <p className="text-sm font-bold text-white">Sizin için bekleyen görevler var</p>
              </div>
            </div>
            <div className="space-y-2">
              {alerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => onTabChange(alert.tab)}
                  className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-left hover:bg-black/30 hover:border-amber-500/30 transition-colors"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    alert.kind === 'study'
                      ? 'bg-teal-500/20 text-teal-300'
                      : alert.kind === 'training'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-indigo-500/20 text-indigo-300'
                  }`}>
                    {alert.kind === 'study' ? <BookOpen className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{alert.title}</p>
                    <p className="text-xs text-slate-400 truncate">{alert.detail}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* Hızlı menü */}
        <section className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 sm:gap-3">
          <QuickMenuButton icon={<Trophy className="w-5 h-5" />} label="Liderlik" color="amber" onClick={() => onTabChange('leaderboard')} />
          {viewAs === 'parent' ? (
            <QuickMenuButton icon={<BarChart3 className="w-5 h-5" />} label="Analiz" color="indigo" onClick={() => onTabChange('analyses')} />
          ) : (
            <QuickMenuButton
              icon={<CheckSquare className="w-5 h-5" />}
              label="Ödevler"
              color="emerald"
              badge={pendingHomeworkCount > 0 ? pendingHomeworkCount : null}
              onClick={() => onTabChange('puzzles')}
            />
          )}
          <QuickMenuButton icon={<CalendarDays className="w-5 h-5" />} label="Program" color="indigo" onClick={() => onTabChange('schedule')} />
          {viewAs === 'parent' && privateLessonSummary ? (
            <QuickMenuButton icon={<GraduationCap className="w-5 h-5" />} label="Özel Ders" color="amber" onClick={() => onTabChange('private-lesson')} />
          ) : viewAs !== 'parent' ? (
            <QuickMenuButton icon={<Video className="w-5 h-5" />} label="Canlı Ders" color="violet" onClick={() => onTabChange('live-lesson')} />
          ) : null}
          <QuickMenuButton icon={<ImageIcon className="w-5 h-5" />} label="Galeri" color="sky" onClick={() => onTabChange('gallery')} />
          <QuickMenuButton icon={<CalendarCheck className="w-5 h-5" />} label="Devam" color="rose" onClick={() => onTabChange('attendance')} />
        </section>

        {privateLessonSummary && (
          <section className="bento-card p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-indigo-400/90 uppercase tracking-wider mb-1">Özel Ders Paketi</p>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-amber-400 shrink-0" />
                  <span className="truncate">{privateLessonSummary.packageName}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {[privateLessonSummary.branchOffice, privateLessonSummary.discipline].filter(Boolean).join(' · ') || 'Özel ders paketi'}
                  {privateLessonSummary.saleDate ? ` · ${formatDateTR(privateLessonSummary.saleDate)}` : ''}
                </p>
              </div>
              {viewAs === 'parent' && (
                <button
                  type="button"
                  onClick={() => onTabChange('private-lesson')}
                  className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/15 transition-colors"
                >
                  <GraduationCap className="w-4 h-4" />
                  Özel ders detayı
                </button>
              )}
              {viewAs === 'parent' && (
                <button
                  type="button"
                  onClick={() => onTabChange('payments')}
                  className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs font-bold text-indigo-200 hover:bg-indigo-500/15 transition-colors"
                >
                  <Wallet className="w-4 h-4" />
                  Ödeme detayları
                </button>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl bg-slate-900/50 border border-slate-700/50 p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Toplam</p>
                <p className="mt-1 text-lg font-bold text-white">{privateLessonSummary.totalLessons ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-slate-900/50 border border-slate-700/50 p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kullanılan</p>
                <p className="mt-1 text-lg font-bold text-amber-300">{privateLessonSummary.usedLessons}</p>
              </div>
              <div className="rounded-xl bg-slate-900/50 border border-slate-700/50 p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kalan</p>
                <p className="mt-1 text-lg font-bold text-emerald-300">{privateLessonSummary.remainingLessons ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-slate-900/50 border border-slate-700/50 p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kullanım Türü</p>
                <p className="mt-1 text-sm font-bold text-white">
                  Yoklama {privateLessonSummary.attendanceUsedLessons}
                  <span className="text-slate-500 font-medium"> · Elle {privateLessonSummary.startingUsedLessons}</span>
                </p>
              </div>
            </div>
          </section>
        )}

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
              {
                tab: 'puzzles',
                icon: <CheckSquare className="w-5 h-5" />,
                title: viewAs === 'parent' ? 'Antrenman' : 'Ödevler / Bulmaca',
                sub: viewAs === 'parent' ? 'Tamamlama durumu' : 'Ödevlere git',
                color: 'text-emerald-400 bg-emerald-500/15',
              },
              { tab: 'schedule', icon: <CalendarDays className="w-5 h-5" />, title: 'Ders programı', sub: 'Haftalık program', color: 'text-indigo-400 bg-indigo-500/15' },
              { tab: 'gallery', icon: <ImageIcon className="w-5 h-5" />, title: 'Medya & Galeri', sub: 'Fotoğraflar', color: 'text-violet-400 bg-violet-500/15' },
              ...(viewAs !== 'parent' ? [{ tab: 'live-lesson', icon: <Video className="w-5 h-5" />, title: 'Canlı ders', sub: 'Derse katıl', color: 'text-sky-400 bg-sky-500/15' }] : []),
              { tab: 'attendance', icon: <CalendarCheck className="w-5 h-5" />, title: 'Devam', sub: 'Yoklama bilgisi', color: 'text-rose-400 bg-rose-500/15' },
              { tab: 'analyses', icon: <BarChart3 className="w-5 h-5" />, title: 'Performans analizi', sub: 'Antrenör raporları', color: 'text-indigo-300 bg-indigo-500/15' },
              ...(viewAs === 'parent' && privateLessonSummary
                ? [{ tab: 'private-lesson', icon: <GraduationCap className="w-5 h-5" />, title: 'Özel ders', sub: `Kalan ${privateLessonSummary.remainingLessons ?? '—'} ders`, color: 'text-amber-300 bg-amber-500/15' }]
                : []),
              { tab: 'profile', icon: <User className="w-5 h-5" />, title: 'Profil', sub: 'Kişisel bilgiler', color: 'text-slate-300 bg-white/10' },
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
                      <p className="text-xs text-slate-500">{formatDateTR(t.collectedAt || t.date)} · {t.paymentType}</p>
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
