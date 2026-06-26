import React, { useMemo } from 'react';
import {
  TrendingUp,
  Users,
  Calendar,
  ClipboardCheck,
  CheckCircle2,
  Clock,
  Target,
  Wallet,
  AlertTriangle,
  UserPlus,
  Activity,
  Trophy,
  ChevronRight,
  GraduationCap,
  Building2,
  User,
  Video,
  Image as ImageIcon,
  MessageSquare,
  BarChart3,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useApp } from '../../AppContext';
import { normalizeClubKey } from '../../lib/clubScope';
import { Dashboard3DBackground } from '../dashboard/Dashboard3DBackground';
import { DashboardHeroScene } from '../dashboard/DashboardHeroScene';
import { QuickMenuButton, QuickStatCard } from '../dashboard/dashboardQuickUI';
import type { Club, Coach, Student, Transaction } from '../../types';

const MONTH_NAMES = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

type ClubDashboardProps = {
  branch: string;
  club?: Club;
  students: Student[];
  coaches: Coach[];
  transactions: Transaction[];
  studentListTab: string;
  studentAddTab: string;
  onNavigate: (tab: string) => void;
  canAccess: (tab: string) => boolean;
};

const ClubDashboard: React.FC<ClubDashboardProps> = ({
  branch,
  club,
  students,
  coaches,
  transactions,
  studentListTab,
  studentAddTab,
  onNavigate,
  canAccess,
}) => {
  const { homeworks, lessons, scopedTournaments } = useApp();
  const clubKey = normalizeClubKey(branch);

  const totalIncome = useMemo(
    () => transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
    [transactions],
  );
  const totalExpense = useMemo(
    () => transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
    [transactions],
  );
  const balance = totalIncome - totalExpense;

  const chartData = useMemo(() => {
    const now = new Date();
    const byMonth: Record<number, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      byMonth[d.getMonth() + d.getFullYear() * 12] = 0;
    }
    transactions
      .filter((t) => t.type === 'income')
      .forEach((t) => {
        const parts = t.date.split('-').map(Number);
        const y = parts[0];
        const m = parts[1] ?? 1;
        const key = y * 12 + (m - 1);
        if (byMonth[key] !== undefined) byMonth[key] += t.amount;
      });
    return (Object.entries(byMonth) as [string, number][])
      .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
      .map(([key, value]) => {
        const k = parseInt(key, 10);
        const month = k % 12;
        return { name: MONTH_NAMES[month], income: value || 0 };
      });
  }, [transactions]);

  const financeKpis = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthIncome = transactions
      .filter((t) => t.type === 'income' && t.date.startsWith(thisMonth))
      .reduce((sum, t) => sum + t.amount, 0);
    const thisMonthExpense = transactions
      .filter((t) => t.type === 'expense' && t.date.startsWith(thisMonth))
      .reduce((sum, t) => sum + t.amount, 0);
    return {
      thisMonthIncome,
      thisMonthExpense,
      thisMonthNet: thisMonthIncome - thisMonthExpense,
    };
  }, [transactions]);

  const activeStudents = useMemo(() => students.filter((s) => s.status !== 'inactive').length, [students]);
  const groupCount = useMemo(() => new Set(students.map((s) => s.group).filter(Boolean)).size, [students]);
  const paid = students.filter((s) => s.paymentStatus === 'Paid').length;
  const unpaid = students.filter((s) => s.paymentStatus === 'Unpaid').length;
  const partial = students.filter((s) => s.paymentStatus === 'Partial').length;

  const clubHomeworks = useMemo(() => {
    const studentIds = new Set(students.map((s) => s.id));
    const groups = new Set(students.map((s) => (s.group || '').trim()).filter(Boolean));
    return homeworks.filter((h) => {
      if (h.branch && normalizeClubKey(h.branch) === clubKey) return true;
      if (h.branchName && normalizeClubKey(h.branchName) === clubKey) return true;
      return (h.assignedTo ?? []).some(
        (a) => studentIds.has(a) || groups.has(a.trim()),
      );
    });
  }, [homeworks, students, clubKey]);

  const pendingHomeworks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return clubHomeworks.filter((h) => h.dueDate && h.dueDate >= today).slice(0, 5);
  }, [clubHomeworks]);

  const homeworkKpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = clubHomeworks.filter((h) => h.dueDate && h.dueDate < today).length;
    return { overdue };
  }, [clubHomeworks]);

  const todayLessons = useMemo(() => {
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const today = days[new Date().getDay()];
    return lessons
      .filter((l) => l.day === today && (!l.branch || normalizeClubKey(l.branch) === clubKey))
      .slice(0, 5);
  }, [lessons, clubKey]);

  const recentStudents = useMemo(
    () =>
      [...students]
        .sort((a, b) => new Date(b.registrationDate || 0).getTime() - new Date(a.registrationDate || 0).getTime())
        .slice(0, 5),
    [students],
  );

  const recentTransactions = useMemo(() => [...transactions].slice(0, 6), [transactions]);

  const upcomingTournaments = useMemo(() => {
    const now = Date.now();
    return scopedTournaments
      .filter((t) => new Date(t.startAt).getTime() >= now - 86400000)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      .slice(0, 4);
  }, [scopedTournaments]);

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }),
    [],
  );

  const chartHasData = chartData.some((d) => d.income > 0);

  const quickMenus = [
    { tab: studentListTab, icon: <Users className="w-5 h-5" />, label: 'Öğrenciler', color: 'emerald' as const },
    { tab: 'coaches', icon: <User className="w-5 h-5" />, label: 'Antrenörler', color: 'sky' as const },
    { tab: 'attendance', icon: <ClipboardCheck className="w-5 h-5" />, label: 'Yoklama', color: 'indigo' as const },
    { tab: 'finance', icon: <Wallet className="w-5 h-5" />, label: 'Kasa', color: 'rose' as const },
    { tab: 'tournaments', icon: <Trophy className="w-5 h-5" />, label: 'Turnuva', color: 'amber' as const },
    { tab: 'lessons', icon: <Video className="w-5 h-5" />, label: 'Canlı Ders', color: 'violet' as const },
  ].filter((m) => canAccess(m.tab));

  const quickActions = [
    { tab: studentAddTab, icon: <UserPlus className="w-4 h-4" />, label: 'Öğrenci Ekle', accent: 'emerald' },
    { tab: 'coaches', icon: <Users className="w-4 h-4" />, label: 'Antrenör Ekle', accent: 'sky' },
    { tab: 'attendance', icon: <ClipboardCheck className="w-4 h-4" />, label: 'Yoklama Al', accent: 'indigo' },
    { tab: 'finance', icon: <Wallet className="w-4 h-4" />, label: 'Kasa İşlemi', accent: 'rose' },
    { tab: 'homework', icon: <CheckCircle2 className="w-4 h-4" />, label: 'Ödevler', accent: 'violet' },
    { tab: 'gallery', icon: <ImageIcon className="w-4 h-4" />, label: 'Galeri', accent: 'pink' },
    { tab: 'messages', icon: <MessageSquare className="w-4 h-4" />, label: 'Mesajlar', accent: 'green' },
    { tab: 'analysis', icon: <BarChart3 className="w-4 h-4" />, label: 'Analiz', accent: 'cyan' },
  ].filter((a) => canAccess(a.tab));

  const incomeLabel =
    financeKpis.thisMonthIncome > 0
      ? financeKpis.thisMonthIncome >= 1000
        ? `₺${(financeKpis.thisMonthIncome / 1000).toFixed(1)}k`
        : `₺${financeKpis.thisMonthIncome.toLocaleString('tr-TR')}`
      : '₺0';

  return (
    <Dashboard3DBackground>
      <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-500">
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-7 relative rounded-2xl h-[108px] sm:h-[112px] overflow-hidden shadow-lg shadow-emerald-900/30 border border-emerald-400/25 dashboard-glass">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/50 via-emerald-500/25 to-transparent pointer-events-none" />
            <DashboardHeroScene />
            <div className="relative z-10 h-full flex flex-col justify-center pl-5 sm:pl-6 pr-[42%] sm:pr-[38%]">
              <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest capitalize">{todayLabel}</p>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight mt-0.5 leading-tight">
                {branch} Kulüp Paneli
              </h1>
              <p className="text-xs sm:text-sm text-emerald-100/80 font-medium mt-1">
                Şube özetiniz, finans ve operasyonlar tek ekranda
              </p>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-3 gap-3">
            <QuickStatCard
              icon={<Users className="w-5 h-5" />}
              value={activeStudents.toString()}
              label="Öğrenci"
              sub={`${groupCount} grup`}
              bg="from-emerald-700 to-emerald-900"
              onClick={() => onNavigate(studentListTab)}
            />
            <QuickStatCard
              icon={<TrendingUp className="w-5 h-5" />}
              value={incomeLabel}
              label="Bu Ay Gelir"
              sub={balance >= 0 ? 'Kasa pozitif' : 'Dikkat'}
              bg="from-teal-700 to-cyan-900"
              onClick={() => onNavigate('finance')}
            />
            <QuickStatCard
              icon={<GraduationCap className="w-5 h-5" />}
              value={coaches.length.toString()}
              label="Antrenör"
              sub={`${todayLessons.length} ders bugün`}
              bg="from-violet-700 to-purple-900"
              onClick={() => onNavigate('coaches')}
            />
          </div>
        </section>

        {quickMenus.length > 0 && (
          <section className={`grid gap-2.5 sm:gap-3 grid-cols-${Math.min(quickMenus.length, 6)}`} style={{ gridTemplateColumns: `repeat(${Math.min(quickMenus.length, 6)}, minmax(0, 1fr))` }}>
            {quickMenus.map((m) => (
              <QuickMenuButton
                key={m.tab}
                icon={m.icon}
                label={m.label}
                color={m.color}
                onClick={() => onNavigate(m.tab)}
              />
            ))}
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          <div className="lg:col-span-8 space-y-4 sm:space-y-6">
            <div className="bento-card p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Finansal Analiz</h3>
                  </div>
                  <p className="text-xs text-slate-500 font-medium ml-10">Son 6 ay gelir performansı — {branch}</p>
                </div>
                {canAccess('finance') && (
                  <button
                    type="button"
                    onClick={() => onNavigate('finance')}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                  >
                    Detaylar <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="h-[280px] sm:h-[300px] w-full min-w-0 relative">
                {!chartHasData && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
                    <p className="text-slate-500 text-sm font-medium">Henüz gelir kaydı yok</p>
                    <p className="text-slate-600 text-xs mt-1">İlk tahsilat sonrası grafik dolacak</p>
                  </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="clubDashboardIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="clubDashboardStroke" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#14b8a6" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} dy={8} />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                      tickFormatter={(v) => `₺${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '14px',
                        border: '1px solid rgba(16,185,129,0.25)',
                        backgroundColor: 'rgba(15,23,42,0.95)',
                        backdropFilter: 'blur(12px)',
                        color: '#f8fafc',
                        padding: '12px 16px',
                      }}
                      formatter={(value: number) => [`₺${Number(value).toLocaleString('tr-TR')}`, 'Gelir']}
                    />
                    <Area
                      type="monotone"
                      dataKey="income"
                      stroke="url(#clubDashboardStroke)"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#clubDashboardIncome)"
                      dot={{ fill: '#34d399', strokeWidth: 0, r: chartHasData ? 3 : 0 }}
                      activeDot={{ r: 5, fill: '#14b8a6', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <ClubPanelCard
                title="Bekleyen Ödevler"
                icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                onViewAll={canAccess('homework') ? () => onNavigate('homework') : undefined}
                empty="Bekleyen ödev yok"
              >
                {pendingHomeworks.map((hw) => {
                  const daysLeft = Math.ceil((new Date(hw.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const timeStr = daysLeft <= 0 ? 'Bugün' : daysLeft === 1 ? '1 gün' : `${daysLeft} gün`;
                  return (
                    <button
                      key={hw.id}
                      type="button"
                      onClick={() => canAccess('homework') && onNavigate('homework')}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-emerald-500/[0.06] border border-white/[0.04] hover:border-emerald-500/20 transition-all text-left"
                    >
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <ClipboardCheck className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">{hw.title}</p>
                        <p className="text-[11px] text-slate-500">{hw.puzzles?.length ?? 0} bulmaca</p>
                      </div>
                      <span className="text-[10px] font-bold text-amber-400/90 bg-amber-500/10 px-2 py-1 rounded-md shrink-0">{timeStr}</span>
                    </button>
                  );
                })}
              </ClubPanelCard>

              <ClubPanelCard
                title="Bugünkü Dersler"
                icon={<Clock className="w-4 h-4 text-violet-400" />}
                onViewAll={canAccess('lessons') ? () => onNavigate('lessons') : undefined}
                linkLabel="Canlı Ders"
                empty="Bugün planlı ders yok"
              >
                {todayLessons.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => canAccess('lessons') && onNavigate('lessons')}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-violet-500/[0.06] border border-white/[0.04] transition-all text-left"
                  >
                    <div className="px-2.5 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/25 text-violet-300 text-xs font-bold tabular-nums shrink-0">
                      {l.startTime}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{l.group}</p>
                      <p className="text-[11px] text-slate-500 truncate">{l.topic || 'Konu belirtilmedi'}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                  </button>
                ))}
              </ClubPanelCard>
            </div>

            <div className="bento-card p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
                    <UserPlus className="w-4 h-4 text-sky-400" />
                  </div>
                  <h3 className="font-bold text-white">Son Kayıtlar</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(studentListTab)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-0.5"
                >
                  Tümü <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                {recentStudents.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">Kayıtlı öğrenci bulunmuyor.</p>
                ) : (
                  recentStudents.map((s) => {
                    const initials = s.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]"
                      >
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{s.group || 'Grup yok'}</p>
                        </div>
                        <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
                          {s.registrationDate ? new Date(s.registrationDate).toLocaleDateString('tr-TR') : '—'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-4 sm:space-y-6">
            <div className="bento-card p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="text-base font-bold text-white">Operasyon Özeti</h3>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <MiniKpi label="Bu Ay Gelir" value={`₺${financeKpis.thisMonthIncome.toLocaleString('tr-TR')}`} tone="green" />
                <MiniKpi label="Bu Ay Gider" value={`₺${financeKpis.thisMonthExpense.toLocaleString('tr-TR')}`} tone="red" />
                <MiniKpi label="Aylık Net" value={`₺${financeKpis.thisMonthNet.toLocaleString('tr-TR')}`} tone={financeKpis.thisMonthNet >= 0 ? 'green' : 'red'} />
                <MiniKpi label="Kasa Bakiye" value={`₺${balance.toLocaleString('tr-TR')}`} tone={balance >= 0 ? 'green' : 'red'} />
                <MiniKpi label="Ödedi" value={`${paid}`} tone="green" suffix="öğrenci" />
                <MiniKpi label="Ödemedi" value={`${unpaid}`} tone="red" suffix="öğrenci" />
              </div>
            </div>

            {club?.address && (
              <div className="bento-card p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white mb-1">Kulüp Bilgisi</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{club.address}</p>
                    {canAccess('profile') && (
                      <button
                        type="button"
                        onClick={() => onNavigate('profile')}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold mt-2"
                      >
                        Profili düzenle →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {quickActions.length > 0 && (
              <div className="bento-card p-5 sm:p-6">
                <h3 className="text-base font-bold text-white mb-4">Hızlı İşlemler</h3>
                <div className="grid grid-cols-2 gap-2">
                  {quickActions.map((a) => (
                    <ClubActionButton
                      key={a.tab}
                      icon={a.icon}
                      label={a.label}
                      accent={a.accent}
                      onClick={() => onNavigate(a.tab)}
                    />
                  ))}
                </div>
              </div>
            )}

            {upcomingTournaments.length > 0 && (
              <div className="bento-card p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <h3 className="font-bold text-white text-sm">Yaklaşan Turnuvalar</h3>
                  </div>
                  {canAccess('tournaments') && (
                    <button type="button" onClick={() => onNavigate('tournaments')} className="text-[10px] text-emerald-400 font-semibold uppercase">
                      Tümü
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {upcomingTournaments.map((t) => (
                    <div key={t.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                      <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {new Date(t.startAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {' · '}
                        {(t.participantIds ?? []).length} katılımcı
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recentTransactions.length > 0 && (
              <div className="bento-card p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-white text-sm">Son Kasa İşlemleri</h3>
                  {canAccess('finance') && (
                    <button type="button" onClick={() => onNavigate('finance')} className="text-[10px] text-emerald-400 font-semibold uppercase">
                      Kasa
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {recentTransactions.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">{t.description || t.category}</p>
                        <p className="text-[10px] text-slate-500">{t.date}</p>
                      </div>
                      <span className={`text-xs font-bold shrink-0 ${t.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {t.type === 'income' ? '+' : '-'}₺{(t.amount || 0).toLocaleString('tr-TR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              className={`rounded-2xl p-5 border overflow-hidden relative ${
                homeworkKpis.overdue > 0 || unpaid > 0
                  ? 'bg-amber-500/[0.08] border-amber-500/25'
                  : 'bg-emerald-500/[0.08] border-emerald-500/20'
              }`}
            >
              <div className="flex items-start gap-3 relative">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    homeworkKpis.overdue > 0 || unpaid > 0 ? 'bg-amber-500/20' : 'bg-emerald-500/20'
                  }`}
                >
                  {homeworkKpis.overdue > 0 || unpaid > 0 ? (
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                  ) : (
                    <Target className="w-5 h-5 text-emerald-400" />
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white/90 uppercase tracking-wider mb-1.5">Kulüp Notu</h4>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {homeworkKpis.overdue > 0 ? (
                      <>
                        <span className="text-amber-200 font-semibold">{homeworkKpis.overdue} gecikmiş ödev</span> var.
                      </>
                    ) : unpaid > 0 ? (
                      <>
                        <span className="text-amber-200 font-semibold">{unpaid} öğrenci</span> ödeme bekliyor.
                      </>
                    ) : (
                      `${branch} kulübü dengeli görünüyor. ${coaches.length} antrenör, ${activeStudents} aktif öğrenci.`
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Dashboard3DBackground>
  );
};

const ClubPanelCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  onViewAll?: () => void;
  linkLabel?: string;
  empty: string;
  children: React.ReactNode;
}> = ({ title, icon, onViewAll, linkLabel = 'Tümü', empty, children }) => {
  const hasItems = React.Children.count(children) > 0;
  return (
    <div className="bento-card p-5 sm:p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">{icon}</div>
          <h3 className="font-bold text-white text-sm">{title}</h3>
        </div>
        {onViewAll && (
          <button type="button" onClick={onViewAll} className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 uppercase tracking-wide">
            {linkLabel}
          </button>
        )}
      </div>
      <div className="space-y-2 flex-1">
        {hasItems ? children : <p className="text-sm text-slate-500 py-6 text-center">{empty}</p>}
      </div>
    </div>
  );
};

const actionAccents: Record<string, string> = {
  emerald: 'group-hover:bg-emerald-500/20 group-hover:border-emerald-500/30 group-hover:text-emerald-300',
  sky: 'group-hover:bg-sky-500/20 group-hover:border-sky-500/30 group-hover:text-sky-300',
  indigo: 'group-hover:bg-indigo-500/20 group-hover:border-indigo-500/30 group-hover:text-indigo-300',
  rose: 'group-hover:bg-rose-500/20 group-hover:border-rose-500/30 group-hover:text-rose-300',
  violet: 'group-hover:bg-violet-500/20 group-hover:border-violet-500/30 group-hover:text-violet-300',
  pink: 'group-hover:bg-pink-500/20 group-hover:border-pink-500/30 group-hover:text-pink-300',
  cyan: 'group-hover:bg-cyan-500/20 group-hover:border-cyan-500/30 group-hover:text-cyan-300',
  green: 'group-hover:bg-green-500/20 group-hover:border-green-500/30 group-hover:text-green-300',
};

const ClubActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  accent?: string;
  onClick: () => void;
}> = ({ icon, label, accent = 'emerald', onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`group flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-all text-slate-400 hover:text-white w-full text-left ${actionAccents[accent] ?? actionAccents.emerald}`}
  >
    <span className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0 transition-colors">
      {icon}
    </span>
    <span className="text-[11px] font-semibold leading-tight">{label}</span>
  </button>
);

const MiniKpi: React.FC<{ label: string; value: string; tone: 'green' | 'red'; suffix?: string }> = ({
  label,
  value,
  tone,
  suffix,
}) => {
  const toneClass =
    tone === 'green'
      ? 'text-emerald-300 border-emerald-500/20 bg-emerald-500/[0.06]'
      : 'text-rose-300 border-rose-500/20 bg-rose-500/[0.06]';
  return (
    <div className={`rounded-xl border px-3 py-3 ${toneClass}`}>
      <p className="text-[9px] uppercase tracking-widest opacity-70 font-semibold leading-tight">{label}</p>
      <p className="text-sm font-black mt-1 tabular-nums leading-none">
        {value}
        {suffix && <span className="text-[9px] font-medium opacity-70 ml-1">{suffix}</span>}
      </p>
    </div>
  );
};

export default ClubDashboard;
