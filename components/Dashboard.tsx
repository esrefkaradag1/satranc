import React, { useMemo } from 'react';
import {
  TrendingUp, Users, Calendar, ClipboardCheck, Box,
  MessageSquare, CheckCircle2, Clock, Target,
  Image as ImageIcon, Video, Wallet, AlertTriangle, UserPlus, Activity, FileText,
  ChevronRight, GraduationCap, QrCode,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useApp } from '../AppContext';
import { getSessionDisplay } from '../lib/sessionDisplayName';
import { DashboardHeroScene } from './dashboard/DashboardHeroScene';
import { Dashboard3DBackground } from './dashboard/Dashboard3DBackground';

const MONTH_NAMES = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const Dashboard: React.FC = () => {
  const { scopedStudents, transactions, homeworks, lessons, auth, coaches, clubs } = useApp();
  const students = scopedStudents;
  const session = useMemo(
    () => getSessionDisplay(auth, { students, coaches, clubs }),
    [auth, students, coaches, clubs],
  );

  const totalIncome = useMemo(() =>
    transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
    [transactions]
  );
  const totalExpense = useMemo(() =>
    transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
    [transactions]
  );
  const balance = totalIncome - totalExpense;

  const chartData = useMemo(() => {
    const now = new Date();
    const byMonth: Record<number, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      byMonth[d.getMonth() + d.getFullYear() * 12] = 0;
    }
    transactions.filter(t => t.type === 'income').forEach(t => {
      const parts = t.date.split('-').map(Number);
      const y = parts[0];
      const m = parts[1] ?? 1;
      const key = (y * 12) + (m - 1);
      if (byMonth[key] !== undefined) byMonth[key] += t.amount;
    });
    return (Object.entries(byMonth) as [string, number][])
      .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
      .map(([key, value]) => {
        const k = parseInt(key, 10);
        const month = k % 12;
        return { name: MONTH_NAMES[month], income: value || 0, full: value };
      });
  }, [transactions]);

  const pendingHomeworks = useMemo(() => {
    const now = new Date().toISOString().slice(0, 10);
    return homeworks
      .filter(h => h.dueDate && h.dueDate >= now)
      .slice(0, 5);
  }, [homeworks]);

  const todayLessons = useMemo(() => {
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const today = days[new Date().getDay()];
    return lessons.filter(l => l.day === today).slice(0, 5);
  }, [lessons]);

  const activeStudents = useMemo(() => students.filter(s => s.status !== 'inactive').length, [students]);
  const groupCount = useMemo(() => new Set(students.map(s => s.group).filter(Boolean)).size, [students]);

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

  const homeworkKpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = homeworks.filter((h) => h.dueDate && h.dueDate < today).length;
    const dueToday = homeworks.filter((h) => h.dueDate && h.dueDate === today).length;
    const dueThisWeek = homeworks.filter((h) => {
      if (!h.dueDate) return false;
      const d = new Date(h.dueDate);
      const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    }).length;
    return { overdue, dueToday, dueThisWeek };
  }, [homeworks]);

  const recentStudents = useMemo(
    () =>
      [...students]
        .sort((a, b) => {
          const aTime = new Date(a.registrationDate || 0).getTime();
          const bTime = new Date(b.registrationDate || 0).getTime();
          return bTime - aTime;
        })
        .slice(0, 5),
    [students]
  );

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }),
    []
  );

  const chartHasData = chartData.some((d) => d.income > 0);

  return (
    <Dashboard3DBackground>
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-500">
      {/* Kompakt hoş geldin + hızlı özet kutuları */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-7 relative rounded-2xl h-[108px] sm:h-[112px] overflow-hidden shadow-lg shadow-indigo-900/30 border border-indigo-400/25 dashboard-glass">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/50 via-indigo-500/30 to-transparent pointer-events-none" />
          <DashboardHeroScene />
          <div className="relative z-10 h-full flex flex-col justify-center pl-5 sm:pl-6 pr-[42%] sm:pr-[38%]">
            <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest capitalize">{todayLabel}</p>
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight mt-0.5 leading-tight">
              Hoş geldiniz, {session.firstName}
            </h1>
            <p className="text-xs sm:text-sm text-indigo-100/80 font-medium mt-1">
              Tüm istatistikleri ve işlemleri buradan yönetin
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 grid grid-cols-3 gap-3">
          <QuickStatBox
            href="#/ogrenci-listesi"
            icon={<Users className="w-5 h-5" />}
            value={activeStudents.toString()}
            label="Öğrenci"
            sub={`${groupCount} grup`}
            bg="from-rose-700 to-rose-900"
          />
          <QuickStatBox
            href="#/kasa-finans"
            icon={<TrendingUp className="w-5 h-5" />}
            value={
              financeKpis.thisMonthIncome > 0
                ? financeKpis.thisMonthIncome >= 1000
                  ? `₺${(financeKpis.thisMonthIncome / 1000).toFixed(1)}k`
                  : `₺${financeKpis.thisMonthIncome.toLocaleString('tr-TR')}`
                : '₺0'
            }
            label="Bu Ay Gelir"
            sub={balance >= 0 ? 'Kasa pozitif' : 'Dikkat'}
            bg="from-violet-700 to-purple-900"
          />
          <QuickStatBox
            href="#/canli-ders"
            icon={<GraduationCap className="w-5 h-5" />}
            value={todayLessons.length.toString()}
            label="Bugün Ders"
            sub={`${homeworks.length} ödev`}
            bg="from-emerald-700 to-green-900"
          />
        </div>
      </section>

      {/* Hızlı menü kutucukları */}
      <section className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 sm:gap-3">
        <QuickMenuBox href="#/yoklama-al" icon={<ClipboardCheck className="w-5 h-5" />} label="Yoklama" color="indigo" />
        <QuickMenuBox href="#/canli-ders" icon={<Video className="w-5 h-5" />} label="Canlı Ders" color="violet" />
        <QuickMenuBox href="#/odev-yonetimi" icon={<CheckCircle2 className="w-5 h-5" />} label="Ödevler" color="emerald" />
        <QuickMenuBox href="#/ogrenci-ekle" icon={<UserPlus className="w-5 h-5" />} label="Öğrenci Ekle" color="sky" />
        <QuickMenuBox href="#/qr-yoklama" icon={<QrCode className="w-5 h-5" />} label="QR Yoklama" color="amber" />
        <QuickMenuBox href="#/kasa-finans" icon={<Wallet className="w-5 h-5" />} label="Kasa" color="rose" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Sol kolon */}
        <div className="lg:col-span-8 space-y-4 sm:space-y-6">
          {/* Grafik */}
          <div className="bento-card p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Finansal Analiz</h3>
                </div>
                <p className="text-xs text-slate-500 font-medium ml-10">Son 6 ay gelir performansı</p>
              </div>
              <a
                href="#/kasa-finans"
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
              >
                Detaylar <ChevronRight className="w-3.5 h-3.5" />
              </a>
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
                    <linearGradient id="dashboardColorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="dashboardStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                    dy={8}
                  />
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
                      border: '1px solid rgba(99,102,241,0.25)',
                      backgroundColor: 'rgba(15,23,42,0.95)',
                      backdropFilter: 'blur(12px)',
                      color: '#f8fafc',
                      padding: '12px 16px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                    formatter={(value: number) => [`₺${Number(value).toLocaleString('tr-TR')}`, 'Gelir']}
                    labelFormatter={(label) => `${label}`}
                    cursor={{ stroke: 'rgba(99,102,241,0.3)', strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="url(#dashboardStroke)"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#dashboardColorIncome)"
                    dot={{ fill: '#818cf8', strokeWidth: 0, r: chartHasData ? 3 : 0 }}
                    activeDot={{ r: 5, fill: '#a855f7', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ödev + Ders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            <PanelCard
              title="Bekleyen Ödevler"
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              href="#/odev-yonetimi"
              linkLabel="Tümü"
              empty="Bekleyen ödev yok"
            >
              {pendingHomeworks.map((hw) => {
                const daysLeft = Math.ceil((new Date(hw.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const timeStr = daysLeft <= 0 ? 'Bugün' : daysLeft === 1 ? '1 gün' : `${daysLeft} gün`;
                return (
                  <a
                    key={hw.id}
                    href="#/odev-yonetimi"
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-indigo-500/[0.06] border border-white/[0.04] hover:border-indigo-500/20 transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <ClipboardCheck className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate group-hover:text-indigo-100 transition-colors">{hw.title}</p>
                      <p className="text-[11px] text-slate-500">{hw.puzzles?.length ?? 0} bulmaca</p>
                    </div>
                    <span className="text-[10px] font-bold text-amber-400/90 bg-amber-500/10 px-2 py-1 rounded-md shrink-0">{timeStr}</span>
                  </a>
                );
              })}
            </PanelCard>

            <PanelCard
              title="Bugünkü Dersler"
              icon={<Clock className="w-4 h-4 text-violet-400" />}
              href="#/canli-ders"
              linkLabel="Canlı Ders"
              empty="Bugün planlı ders yok"
            >
              {todayLessons.map((l) => (
                <a
                  key={l.id}
                  href="#/canli-ders"
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-violet-500/[0.06] border border-white/[0.04] hover:border-violet-500/20 transition-all group"
                >
                  <div className="px-2.5 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/25 text-violet-300 text-xs font-bold tabular-nums shrink-0">
                    {l.startTime}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{l.group}</p>
                    <p className="text-[11px] text-slate-500 truncate">{l.topic || 'Konu belirtilmedi'}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-violet-400 shrink-0 transition-colors" />
                </a>
              ))}
            </PanelCard>
          </div>

          {/* Son kayıtlar */}
          <div className="bento-card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-sky-400" />
                </div>
                <h3 className="font-bold text-white">Son Kayıtlar</h3>
              </div>
              <a href="#/ogrenci-listesi" className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-0.5">
                Tümü <ChevronRight className="w-3.5 h-3.5" />
              </a>
            </div>
            <div className="space-y-2">
              {recentStudents.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Kayıtlı öğrenci bulunmuyor.</p>
              ) : (
                recentStudents.map((s) => {
                  const initials = s.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <a
                      key={s.id}
                      href={`#/ogrenci-detay?id=${encodeURIComponent(s.id)}`}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-sky-500/25 hover:bg-sky-500/[0.04] transition-all"
                    >
                      <div className="w-9 h-9 rounded-xl premium-gradient flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-md shadow-indigo-900/30">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{s.group || 'Grup yok'} · {s.branch || 'Şube yok'}</p>
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
                        {s.registrationDate ? new Date(s.registrationDate).toLocaleDateString('tr-TR') : '—'}
                      </span>
                    </a>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Sağ kolon */}
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
              <MiniKpi label="Bugün Ders" value={`${todayLessons.length}`} tone="indigo" suffix="ders" />
            </div>
          </div>

          <div className="bento-card p-5 sm:p-6">
            <h3 className="text-base font-bold text-white mb-4">Hızlı İşlemler</h3>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon={<Users className="w-4 h-4" />} label="Yeni Öğrenci" href="#/ogrenci-ekle" accent="indigo" />
              <ActionButton icon={<FileText className="w-4 h-4" />} label="Başvurular" href="#/basvurular" accent="violet" />
              <ActionButton icon={<Calendar className="w-4 h-4" />} label="QR Yoklama" href="#/qr-yoklama" accent="sky" />
              <ActionButton icon={<ClipboardCheck className="w-4 h-4" />} label="Yoklama Al" href="#/yoklama-al" accent="emerald" />
              <ActionButton icon={<Box className="w-4 h-4" />} label="Envanter" href="#/depo-envanter" accent="amber" />
              <ActionButton icon={<Wallet className="w-4 h-4" />} label="Kasa" href="#/kasa-finans" accent="rose" />
              <ActionButton icon={<ImageIcon className="w-4 h-4" />} label="Galeri" href="#/galeri" accent="pink" />
              <ActionButton icon={<Video className="w-4 h-4" />} label="Canlı Ders" href="#/canli-ders" accent="cyan" />
              <ActionButton icon={<MessageSquare className="w-4 h-4" />} label="Mesajlar" href="#/mesajlar" accent="green" className="col-span-2" />
            </div>
          </div>

          <div className={`rounded-2xl p-5 border overflow-hidden relative ${
            homeworkKpis.overdue > 0
              ? 'bg-rose-500/[0.08] border-rose-500/25'
              : 'bg-indigo-500/[0.08] border-indigo-500/20'
          }`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="flex items-start gap-3 relative">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                homeworkKpis.overdue > 0 ? 'bg-rose-500/20' : 'bg-indigo-500/20'
              }`}>
                {homeworkKpis.overdue > 0 ? (
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                ) : (
                  <Target className="w-5 h-5 text-indigo-400" />
                )}
              </div>
              <div>
                <h4 className="text-xs font-bold text-white/90 uppercase tracking-wider mb-1.5">Sistem Notu</h4>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {homeworkKpis.overdue > 0 ? (
                    <>
                      <span className="text-rose-200 font-semibold">{homeworkKpis.overdue} gecikmiş ödev</span> var.
                      Ödev yönetiminden önceliklendirin.
                    </>
                  ) : (
                    'Operasyon dengeli görünüyor. Hızlı işlemlerden ders, yoklama ve finans akışını yönetebilirsiniz.'
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

const QuickStatBox: React.FC<{
  href: string;
  icon: React.ReactNode;
  value: string;
  label: string;
  sub: string;
  bg: string;
}> = ({ href, icon, value, label, sub, bg }) => (
  <a
    href={href}
    className={`group relative flex flex-col items-center justify-center rounded-2xl bg-gradient-to-b ${bg} h-[128px] sm:h-[132px] px-2 text-white shadow-lg overflow-hidden transition-transform hover:scale-[1.02] active:scale-[0.98] ring-1 ring-white/10 backdrop-blur-sm`}
  >
    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors" />
    <div className="relative w-9 h-9 rounded-full bg-white/15 flex items-center justify-center mb-2 border border-white/20">
      {icon}
    </div>
    <p className="relative text-xl sm:text-2xl font-black tabular-nums leading-none">{value}</p>
    <p className="relative text-[10px] font-bold uppercase tracking-wide mt-1 opacity-90">{label}</p>
    <p className="relative text-[9px] text-white/60 mt-0.5">{sub}</p>
  </a>
);

const quickMenuColors: Record<string, string> = {
  indigo: 'from-indigo-600/90 to-indigo-800/90 hover:shadow-indigo-500/20',
  violet: 'from-violet-600/90 to-violet-800/90 hover:shadow-violet-500/20',
  emerald: 'from-emerald-600/90 to-emerald-800/90 hover:shadow-emerald-500/20',
  sky: 'from-sky-600/90 to-sky-800/90 hover:shadow-sky-500/20',
  amber: 'from-amber-600/90 to-amber-800/90 hover:shadow-amber-500/20',
  rose: 'from-rose-600/90 to-rose-800/90 hover:shadow-rose-500/20',
};

const QuickMenuBox: React.FC<{
  href: string;
  icon: React.ReactNode;
  label: string;
  color: string;
}> = ({ href, icon, label, color }) => (
  <a
    href={href}
    className={`group flex flex-col items-center justify-center gap-2 p-3 sm:p-4 rounded-2xl bg-gradient-to-br ${quickMenuColors[color]} text-white shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 active:translate-y-0 border border-white/10`}
  >
    <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20 group-hover:bg-white/25 transition-colors">
      {icon}
    </div>
    <span className="text-[10px] sm:text-[11px] font-bold text-center leading-tight">{label}</span>
  </a>
);

const PanelCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  href: string;
  linkLabel: string;
  empty: string;
  children: React.ReactNode;
}> = ({ title, icon, href, linkLabel, empty, children }) => {
  const hasItems = React.Children.count(children) > 0;
  return (
    <div className="bento-card p-5 sm:p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
            {icon}
          </div>
          <h3 className="font-bold text-white text-sm">{title}</h3>
        </div>
        <a href={href} className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 uppercase tracking-wide">
          {linkLabel}
        </a>
      </div>
      <div className="space-y-2 flex-1">
        {hasItems ? children : <p className="text-sm text-slate-500 py-6 text-center">{empty}</p>}
      </div>
    </div>
  );
};

const actionAccents: Record<string, string> = {
  indigo: 'group-hover:bg-indigo-500/20 group-hover:border-indigo-500/30 group-hover:text-indigo-300',
  violet: 'group-hover:bg-violet-500/20 group-hover:border-violet-500/30 group-hover:text-violet-300',
  sky: 'group-hover:bg-sky-500/20 group-hover:border-sky-500/30 group-hover:text-sky-300',
  emerald: 'group-hover:bg-emerald-500/20 group-hover:border-emerald-500/30 group-hover:text-emerald-300',
  amber: 'group-hover:bg-amber-500/20 group-hover:border-amber-500/30 group-hover:text-amber-300',
  rose: 'group-hover:bg-rose-500/20 group-hover:border-rose-500/30 group-hover:text-rose-300',
  pink: 'group-hover:bg-pink-500/20 group-hover:border-pink-500/30 group-hover:text-pink-300',
  cyan: 'group-hover:bg-cyan-500/20 group-hover:border-cyan-500/30 group-hover:text-cyan-300',
  green: 'group-hover:bg-green-500/20 group-hover:border-green-500/30 group-hover:text-green-300',
};

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  href: string;
  accent?: string;
  className?: string;
}> = ({ icon, label, href, accent = 'indigo', className = '' }) => (
  <a
    href={href}
    className={`group flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-all text-slate-400 hover:text-white ${actionAccents[accent] ?? actionAccents.indigo} ${className}`}
  >
    <span className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0 transition-colors">
      {icon}
    </span>
    <span className="text-[11px] font-semibold leading-tight">{label}</span>
  </a>
);

const MiniKpi: React.FC<{ label: string; value: string; tone: 'green' | 'red' | 'indigo'; suffix?: string }> = ({
  label, value, tone, suffix,
}) => {
  const toneClass = tone === 'green'
    ? 'text-emerald-300 border-emerald-500/20 bg-emerald-500/[0.06]'
    : tone === 'red'
      ? 'text-rose-300 border-rose-500/20 bg-rose-500/[0.06]'
      : 'text-indigo-300 border-indigo-500/20 bg-indigo-500/[0.06]';
  return (
    <div className={`rounded-xl border px-3 py-3 ${toneClass}`}>
      <p className="text-[9px] uppercase tracking-widest opacity-70 font-semibold leading-tight">{label}</p>
      <p className="text-sm font-black mt-1 tabular-nums leading-none">
        {value}
        {suffix ? <span className="text-[10px] font-semibold opacity-60 ml-0.5">{suffix}</span> : null}
      </p>
    </div>
  );
};

export default Dashboard;
