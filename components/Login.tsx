import React, { Suspense, useEffect, useState } from 'react';
import {
  Lock,
  User,
  Shield,
  UserCircle,
  Loader2,
  Building2,
  ArrowRight,
  Sparkles,
  Trophy,
  GraduationCap,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { isServerMode } from '../apiConfig';
import { apiParentLogin } from '../services/backendApi';
import { BRANCH_OPTIONS } from '../constants';
import { useDashboard3DEnabled } from './dashboard/useDashboard3D';

const LoginScene3D = React.lazy(() => import('./login/LoginScene3D'));

type Tab = 'admin' | 'coach' | 'club' | 'parent' | 'student';

const TAB_CONFIG: { id: Tab; label: string; desc: string }[] = [
  { id: 'parent', label: 'Veli', desc: 'Öğrenci takibi ve iletişim' },
  { id: 'student', label: 'Öğrenci', desc: 'Ders, ödev ve bulmaca' },
  { id: 'admin', label: 'Yönetim', desc: 'Kurumsal yönetim paneli' },
  { id: 'coach', label: 'Antrenör', desc: 'Eğitim ve öğrenci işleri' },
  { id: 'club', label: 'Kulüp', desc: 'Şube ve personel yönetimi' },
];

const THEME: Record<
  Tab,
  {
    accent: string;
    glow: string;
    btn: string;
    btnHover: string;
    ring: string;
    tabActive: string;
    icon: string;
  }
> = {
  parent: {
    accent: '#6366f1',
    glow: 'rgba(99,102,241,0.35)',
    btn: 'bg-indigo-600',
    btnHover: 'hover:bg-indigo-500',
    ring: 'focus-within:ring-indigo-500/30 focus-within:border-indigo-400/60',
    tabActive: 'bg-indigo-600/90 text-white shadow-lg shadow-indigo-500/25',
    icon: 'text-indigo-400',
  },
  student: {
    accent: '#14b8a6',
    glow: 'rgba(20,184,166,0.35)',
    btn: 'bg-teal-600',
    btnHover: 'hover:bg-teal-500',
    ring: 'focus-within:ring-teal-500/30 focus-within:border-teal-400/60',
    tabActive: 'bg-teal-600/90 text-white shadow-lg shadow-teal-500/25',
    icon: 'text-teal-400',
  },
  admin: {
    accent: '#8b5cf6',
    glow: 'rgba(139,92,246,0.35)',
    btn: 'bg-violet-600',
    btnHover: 'hover:bg-violet-500',
    ring: 'focus-within:ring-violet-500/30 focus-within:border-violet-400/60',
    tabActive: 'bg-violet-600/90 text-white shadow-lg shadow-violet-500/25',
    icon: 'text-violet-400',
  },
  coach: {
    accent: '#f59e0b',
    glow: 'rgba(245,158,11,0.35)',
    btn: 'bg-amber-500',
    btnHover: 'hover:bg-amber-400',
    ring: 'focus-within:ring-amber-500/30 focus-within:border-amber-400/60',
    tabActive: 'bg-amber-500/90 text-white shadow-lg shadow-amber-500/25',
    icon: 'text-amber-400',
  },
  club: {
    accent: '#10b981',
    glow: 'rgba(16,185,129,0.35)',
    btn: 'bg-emerald-600',
    btnHover: 'hover:bg-emerald-500',
    ring: 'focus-within:ring-emerald-500/30 focus-within:border-emerald-400/60',
    tabActive: 'bg-emerald-600/90 text-white shadow-lg shadow-emerald-500/25',
    icon: 'text-emerald-400',
  },
};

const labelCls = 'block text-[10px] font-bold text-slate-400 uppercase tracking-[0.14em] mb-2';

const Login: React.FC = () => {
  const { loginAdmin, loginCoach, loginClub, loginParent, loginStudent, setAuthWithStudent, clubs } = useApp();
  const webgl3d = useDashboard3DEnabled();
  const clubBranchOptions = clubs?.length ? clubs.map((c) => c.name) : BRANCH_OPTIONS;

  const [tab, setTab] = useState<Tab>('parent');
  const theme = THEME[tab];

  const [adminPassword, setAdminPassword] = useState('');
  const [coachPassword, setCoachPassword] = useState('');
  const [coachIdentifier, setCoachIdentifier] = useState('');
  const [clubPassword, setClubPassword] = useState('');
  const [clubBranch, setClubBranch] = useState(clubBranchOptions[0] ?? BRANCH_OPTIONS[0]);

  useEffect(() => {
    if (clubBranchOptions.length > 0 && !clubBranchOptions.includes(clubBranch)) {
      setClubBranch(clubBranchOptions[0]);
    }
  }, [clubBranchOptions, clubBranch]);

  const [parentIdOrPhone, setParentIdOrPhone] = useState('');
  const [parentPin, setParentPin] = useState('');
  const [studentIdOrPhone, setStudentIdOrPhone] = useState('');
  const [studentPin, setStudentPin] = useState('');
  const [adminError, setAdminError] = useState('');
  const [coachError, setCoachError] = useState('');
  const [clubError, setClubError] = useState('');
  const [parentError, setParentError] = useState('');
  const [studentError, setStudentError] = useState('');
  const [parentLoading, setParentLoading] = useState(false);
  const [studentLoading, setStudentLoading] = useState(false);

  const clearErrors = () => {
    setAdminError('');
    setCoachError('');
    setClubError('');
    setParentError('');
    setStudentError('');
  };

  const inputWrap = `flex rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm overflow-hidden transition-all duration-300 ${theme.ring}`;
  const inputInner = 'flex-1 min-w-0 py-3 px-4 bg-transparent border-0 text-white placeholder:text-slate-500 outline-none text-sm';
  const iconSlot = 'flex items-center justify-center w-11 shrink-0 text-slate-500 border-r border-white/[0.06]';

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    if (loginAdmin(adminPassword)) return;
    setAdminError('Yanlış parola. Lütfen tekrar deneyin.');
  };

  const handleCoachSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCoachError('');
    if (loginCoach(coachIdentifier, coachPassword)) return;
    setCoachError('E-posta/ad veya şifre hatalı.');
  };

  const handleClubSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setClubError('');
    if (loginClub(clubPassword, clubBranch)) return;
    setClubError('Yanlış parola veya şube.');
  };

  const handleParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setParentError('');
    if (isServerMode()) {
      setParentLoading(true);
      try {
        const r = await apiParentLogin(parentIdOrPhone, parentPin);
        if (r) {
          setAuthWithStudent({ role: 'parent', studentId: r.studentId }, r.student);
          return;
        }
      } catch {
        /* ignore */
      }
      if (loginParent(parentIdOrPhone, parentPin)) return;
      setParentLoading(false);
      setParentError('Giriş başarısız. Öğrenci no veya telefon ile PIN kontrol edin.');
      return;
    }
    if (loginParent(parentIdOrPhone, parentPin)) return;
    setParentError('Öğrenci bulunamadı veya PIN hatalı.');
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentError('');
    if (isServerMode()) {
      setStudentLoading(true);
      try {
        const r = await apiParentLogin(studentIdOrPhone, studentPin);
        if (r) {
          setAuthWithStudent({ role: 'student', studentId: r.studentId }, r.student);
          setStudentLoading(false);
          return;
        }
      } catch {
        /* ignore */
      }
      if (loginStudent(studentIdOrPhone, studentPin)) return;
      setStudentLoading(false);
      setStudentError('Giriş başarısız.');
      return;
    }
    if (loginStudent(studentIdOrPhone, studentPin)) return;
    setStudentError('Öğrenci bulunamadı veya şifre/PIN hatalı.');
  };

  const activeTabMeta = TAB_CONFIG.find((t) => t.id === tab)!;

  const ErrorMsg = ({ msg }: { msg: string }) => (
    <p className="text-sm text-rose-400 font-medium flex items-center gap-2 px-1">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
      {msg}
    </p>
  );

  const SubmitBtn = ({
    loading,
    label,
  }: {
    loading?: boolean;
    label: string;
  }) => (
    <button
      type="submit"
      disabled={loading}
      className={`w-full py-3.5 rounded-xl ${theme.btn} ${theme.btnHover} text-white font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 shadow-lg disabled:opacity-70 hover:-translate-y-0.5 active:translate-y-0`}
      style={{ boxShadow: `0 12px 40px -8px ${theme.glow}` }}
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
      {loading ? 'Giriş yapılıyor...' : label}
    </button>
  );

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#060912]">
      {/* 3D arka plan */}
      {webgl3d && (
        <Suspense fallback={null}>
          <LoginScene3D accent={theme.accent} className="fixed inset-0 z-0 w-full h-full" />
        </Suspense>
      )}

      {/* Gradient overlay */}
      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          background: webgl3d
            ? `radial-gradient(ellipse 90% 70% at 70% 50%, rgba(6,9,18,0.55) 0%, rgba(6,9,18,0.82) 45%, rgba(6,9,18,0.95) 100%),
               radial-gradient(ellipse 50% 60% at 20% 50%, ${theme.glow.replace('0.35', '0.12')} 0%, transparent 70%)`
            : `radial-gradient(ellipse 80% 60% at 50% 0%, ${theme.glow.replace('0.35', '0.2')} 0%, transparent 55%),
               linear-gradient(180deg, #0a0f1e 0%, #060912 100%)`,
        }}
        aria-hidden
      />

      <div className="relative z-10 min-h-screen grid lg:grid-cols-[1fr_520px] xl:grid-cols-[1fr_560px]">
        {/* Sol: marka paneli */}
        <aside className="hidden lg:flex flex-col justify-between p-10 xl:p-14 min-h-screen">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-xs font-bold text-slate-400 mb-8">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Satranç Akademi Platformu
            </div>
            <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tight max-w-md">
              Geleceğin
              <span className="block mt-1 bg-gradient-to-r from-indigo-300 via-violet-300 to-amber-300 bg-clip-text text-transparent">
                satranç şampiyonları
              </span>
              burada yetişiyor.
            </h1>
            <p className="text-slate-400 text-sm mt-5 max-w-sm leading-relaxed">
              Dersler, ödevler, turnuvalar ve performans takibi — tek platformda.
            </p>
          </div>

          <div className="space-y-3 max-w-sm">
            {[
              { icon: GraduationCap, text: 'Canlı ders ve müfredat takibi' },
              { icon: Trophy, text: 'Turnuva ve lider tablosu' },
              { icon: Shield, text: 'Güvenli çok rollü giriş sistemi' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-slate-400">
                <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-slate-300" />
                </div>
                {text}
              </div>
            ))}
          </div>
        </aside>

        {/* Sağ: giriş kartı */}
        <main className="flex flex-col justify-center min-h-screen p-4 sm:p-8 lg:p-10 lg:border-l border-white/[0.06] bg-[#060912]/40 backdrop-blur-xl">
          <div className="w-full max-w-md mx-auto">
            {/* Mobil başlık */}
            <div className="lg:hidden text-center mb-8">
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4 ring-1 ring-white/10"
                style={{ background: `linear-gradient(135deg, ${theme.accent}33, ${theme.accent}11)` }}
              >
                <Shield className="w-6 h-6" style={{ color: theme.accent }} />
              </div>
              <h2 className="text-2xl font-black text-white">Hoş Geldiniz</h2>
              <p className="text-slate-500 text-sm mt-1">Hesabınıza giriş yapın</p>
            </div>

            <div className="hidden lg:block mb-8">
              <h2 className="text-2xl font-black text-white">Giriş Yap</h2>
              <p className="text-slate-500 text-sm mt-1">{activeTabMeta.desc}</p>
            </div>

            {/* Rol seçimi — dikey pill list */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 mb-6 scrollbar-none -mx-1 px-1">
              {TAB_CONFIG.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setTab(id);
                    clearErrors();
                  }}
                  className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                    tab === id ? THEME[id].tabActive : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Form kartı */}
            <div
              className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl overflow-hidden shadow-2xl transition-all duration-500"
              style={{ boxShadow: `0 24px 80px -20px ${theme.glow}, inset 0 1px 0 rgba(255,255,255,0.06)` }}
            >
              <div className="h-0.5 w-full transition-all duration-500" style={{ background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)` }} />

              {tab === 'parent' && (
                <form onSubmit={handleParentSubmit} className="p-6 sm:p-8 space-y-5">
                  <div>
                    <label className={labelCls}>Öğrenci No veya Veli Telefonu</label>
                    <div className={inputWrap}>
                      <div className={iconSlot}><User className="w-4 h-4" /></div>
                      <input type="text" value={parentIdOrPhone} onChange={(e) => setParentIdOrPhone(e.target.value)} placeholder="Örn: 1 veya 5XX XXX XX XX" className={inputInner} autoComplete="username" />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>PIN veya telefon son 4 hane</label>
                    <div className={inputWrap}>
                      <div className={iconSlot}><Lock className="w-4 h-4" /></div>
                      <input type="password" value={parentPin} onChange={(e) => setParentPin(e.target.value)} placeholder="••••" className={inputInner} autoComplete="current-password" />
                    </div>
                  </div>
                  {parentError && <ErrorMsg msg={parentError} />}
                  <SubmitBtn loading={parentLoading} label="Veli Girişi" />
                </form>
              )}

              {tab === 'student' && (
                <form onSubmit={handleStudentSubmit} className="p-6 sm:p-8 space-y-5">
                  <div>
                    <label className={labelCls}>Kullanıcı adı, öğrenci no veya telefon</label>
                    <div className={inputWrap}>
                      <div className={iconSlot}><UserCircle className="w-4 h-4" /></div>
                      <input type="text" value={studentIdOrPhone} onChange={(e) => setStudentIdOrPhone(e.target.value)} placeholder="Giriş bilgisi" className={inputInner} autoComplete="username" />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Şifre veya PIN</label>
                    <div className={inputWrap}>
                      <div className={iconSlot}><Lock className="w-4 h-4" /></div>
                      <input type="password" value={studentPin} onChange={(e) => setStudentPin(e.target.value)} placeholder="••••" className={inputInner} autoComplete="current-password" />
                    </div>
                  </div>
                  {studentError && <ErrorMsg msg={studentError} />}
                  <SubmitBtn loading={studentLoading} label="Öğrenci Girişi" />
                </form>
              )}

              {tab === 'coach' && (
                <form onSubmit={handleCoachSubmit} className="p-6 sm:p-8 space-y-5">
                  <div>
                    <label className={labelCls}>E-posta, ad veya telefon</label>
                    <div className={inputWrap}>
                      <div className={iconSlot}><User className="w-4 h-4" /></div>
                      <input type="text" value={coachIdentifier} onChange={(e) => setCoachIdentifier(e.target.value)} placeholder="ornek@email.com" className={inputInner} autoComplete="username" />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Şifre</label>
                    <div className={inputWrap}>
                      <div className={iconSlot}><Lock className="w-4 h-4" /></div>
                      <input type="password" value={coachPassword} onChange={(e) => setCoachPassword(e.target.value)} placeholder="••••" className={inputInner} autoComplete="current-password" />
                    </div>
                  </div>
                  {coachError && <ErrorMsg msg={coachError} />}
                  <SubmitBtn label="Antrenör Girişi" />
                </form>
              )}

              {tab === 'club' && (
                <form onSubmit={handleClubSubmit} className="p-6 sm:p-8 space-y-5">
                  <div>
                    <label className={labelCls}>Şube</label>
                    <div className={inputWrap}>
                      <div className={iconSlot}><Building2 className="w-4 h-4" /></div>
                      <select value={clubBranch} onChange={(e) => setClubBranch(e.target.value)} className={`${inputInner} cursor-pointer appearance-none`}>
                        {clubBranchOptions.map((b) => (
                          <option key={b} value={b} className="bg-slate-900">{b}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Kulüp parolası</label>
                    <div className={inputWrap}>
                      <div className={iconSlot}><Lock className="w-4 h-4" /></div>
                      <input type="password" value={clubPassword} onChange={(e) => setClubPassword(e.target.value)} placeholder="••••" className={inputInner} autoComplete="current-password" />
                    </div>
                  </div>
                  {clubError && <ErrorMsg msg={clubError} />}
                  <SubmitBtn label="Kulüp Girişi" />
                </form>
              )}

              {tab === 'admin' && (
                <form onSubmit={handleAdminSubmit} className="p-6 sm:p-8 space-y-5">
                  <div>
                    <label className={labelCls}>Yönetim parolası</label>
                    <div className={inputWrap}>
                      <div className={iconSlot}><Lock className="w-4 h-4" /></div>
                      <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••" className={inputInner} autoComplete="current-password" />
                    </div>
                  </div>
                  {adminError && <ErrorMsg msg={adminError} />}
                  <SubmitBtn label="Yönetime Giriş" />
                </form>
              )}
            </div>

            <p className="text-center text-slate-600 text-[11px] mt-6 leading-relaxed max-w-sm mx-auto">
              Öğrenci girişi: kullanıcı adı, öğrenci no veya veli telefonu + PIN ile yapılabilir.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Login;
