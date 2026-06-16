import React, { useState, useEffect } from 'react';
import { Lock, User, Shield, UserCircle, Loader2, Building2, ArrowRight } from 'lucide-react';
import { useApp } from '../AppContext';
import { isServerMode } from '../apiConfig';
import { apiParentLogin } from '../services/backendApi';
import { BRANCH_OPTIONS } from '../constants';

type Tab = 'admin' | 'coach' | 'club' | 'parent' | 'student';

const TAB_CONFIG: { id: Tab; label: string; color: string }[] = [
  { id: 'parent', label: 'Veli', color: 'indigo' },
  { id: 'student', label: 'Öğrenci', color: 'teal' },
  { id: 'admin', label: 'Yönetim', color: 'violet' },
  { id: 'coach', label: 'Antrenör', color: 'amber' },
  { id: 'club', label: 'Kulüp', color: 'emerald' },
];

const labelCls = 'block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2';
const inputWrapperCls = 'flex rounded-2xl border border-slate-600/60 bg-slate-800/30 overflow-hidden transition-all duration-200 focus-within:border-indigo-400/80 focus-within:ring-2 focus-within:ring-indigo-500/25 focus-within:bg-slate-800/50';
const inputIconSlotCls = 'flex items-center justify-center w-12 shrink-0 bg-slate-700/50 border-r border-slate-600/60 text-slate-400';
const inputInnerCls = 'flex-1 min-w-0 py-3.5 pl-4 pr-4 bg-transparent border-0 text-white placeholder:text-slate-500 outline-none text-sm font-medium';

const Login: React.FC = () => {
  const { loginAdmin, loginCoach, loginClub, loginParent, loginStudent, setAuthWithStudent, clubs } = useApp();
  const clubBranchOptions = clubs?.length ? clubs.map((c) => c.name) : BRANCH_OPTIONS;
  const [tab, setTab] = useState<Tab>('parent');
  const [adminPassword, setAdminPassword] = useState('');
  const [coachPassword, setCoachPassword] = useState('');
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
    setAdminError(''); setCoachError(''); setClubError(''); setParentError(''); setStudentError('');
  };

  const btnCls = (t: Tab) => {
    const base = 'flex-1 min-w-0 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ';
    const active: Record<Tab, string> = {
      parent: 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25',
      student: 'bg-teal-600 text-white shadow-lg shadow-teal-500/25',
      admin: 'bg-violet-600 text-white shadow-lg shadow-violet-500/25',
      coach: 'bg-amber-500 text-white shadow-lg shadow-amber-500/25',
      club: 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/25',
    };
    return base + (tab === t ? active[t] : 'text-slate-400 hover:text-white hover:bg-white/5');
  };

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    if (loginAdmin(adminPassword)) return;
    setAdminError('Yanlış parola. Lütfen tekrar deneyin.');
  };

  const handleCoachSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCoachError('');
    if (loginCoach(coachPassword)) return;
    setCoachError('Yanlış parola. Lütfen tekrar deneyin.');
  };

  const handleClubSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setClubError('');
    if (loginClub(clubPassword, clubBranch)) return;
    setClubError('Yanlış parola veya şube. Lütfen tekrar deneyin.');
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
      setParentLoading(false);
      setParentError('Giriş başarısız. Öğrenci no veya telefon ile PIN kontrol edin.');
      return;
    }
    if (loginParent(parentIdOrPhone, parentPin)) return;
    setParentError('Öğrenci bulunamadı veya PIN/telefon son 4 hane hatalı.');
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
          return;
        }
      } catch {
        /* ignore */
      }
      setStudentLoading(false);
      setStudentError('Giriş başarısız. Öğrenci no veya telefon ile PIN kontrol edin.');
      return;
    }
    if (loginStudent(studentIdOrPhone, studentPin)) return;
    setStudentError('Öğrenci bulunamadı veya PIN hatalı. Kullanıcı adı, öğrenci no veya telefon ile giriş yapabilirsiniz.');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.18),transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_80%_100%,rgba(139,92,246,0.1),transparent)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgba(15,23,42,0.7)_100%)] pointer-events-none" />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-500/25 mb-5 ring-2 ring-white/10">
            <Shield className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-1.5">Hoş Geldiniz</h1>
          <p className="text-slate-400 text-sm">Veli, öğrenci, yönetim, antrenör veya kulüp girişi</p>
        </div>

        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-800/60 border border-slate-700/50 p-1 mb-6">
          {TAB_CONFIG.map(({ id, label }) => (
            <button key={id} type="button" onClick={() => { setTab(id); clearErrors(); }} className={btnCls(id)}>{label}</button>
          ))}
        </div>

        <div className="rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 shadow-2xl shadow-black/30 overflow-hidden">
          {tab === 'parent' ? (
            <form onSubmit={handleParentSubmit} className="p-8 space-y-5">
              <div>
                <label className={labelCls}>Öğrenci No veya Veli Telefonu</label>
                <div className={inputWrapperCls}>
                  <div className={inputIconSlotCls}><User className="w-5 h-5" /></div>
                  <input
                    type="text"
                    value={parentIdOrPhone}
                    onChange={(e) => setParentIdOrPhone(e.target.value)}
                    placeholder="Örn: 1 veya 5XX XXX XX XX"
                    className={inputInnerCls}
                    autoComplete="username"
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>PIN (veya telefon son 4 hane)</label>
                <div className={inputWrapperCls}>
                  <div className={inputIconSlotCls}><Lock className="w-5 h-5" /></div>
                  <input
                    type="password"
                    value={parentPin}
                    onChange={(e) => setParentPin(e.target.value)}
                    placeholder="••••"
                    className={inputInnerCls}
                    autoComplete="current-password"
                  />
                </div>
              </div>
              {parentError && (
                <p className="text-sm text-rose-400 font-medium flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  {parentError}
                </p>
              )}
              <button
                type="submit"
                disabled={parentLoading}
                className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0"
              >
                {parentLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {parentLoading ? 'Giriş yapılıyor...' : 'Veli Girişi'}
              </button>
            </form>
          ) : tab === 'student' ? (
            <form onSubmit={handleStudentSubmit} className="p-8 space-y-5">
              <div>
                <label className={labelCls}>Kullanıcı Adı, Öğrenci No veya Veli Telefonu</label>
                <div className={inputWrapperCls}>
                  <div className={inputIconSlotCls}><UserCircle className="w-5 h-5" /></div>
                  <input
                    type="text"
                    value={studentIdOrPhone}
                    onChange={(e) => setStudentIdOrPhone(e.target.value)}
                    placeholder="Kullanıcı adı, öğrenci no veya telefon"
                    className={inputInnerCls}
                    autoComplete="username"
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Şifre veya PIN</label>
                <div className={inputWrapperCls}>
                  <div className={inputIconSlotCls}><Lock className="w-5 h-5" /></div>
                  <input
                    type="password"
                    value={studentPin}
                    onChange={(e) => setStudentPin(e.target.value)}
                    placeholder="••••"
                    className={inputInnerCls}
                    autoComplete="current-password"
                  />
                </div>
              </div>
              {studentError && (
                <p className="text-sm text-rose-400 font-medium flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  {studentError}
                </p>
              )}
              <button
                type="submit"
                disabled={studentLoading}
                className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-teal-500/25 hover:shadow-teal-500/30 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0"
              >
                {studentLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {studentLoading ? 'Giriş yapılıyor...' : 'Öğrenci Girişi'}
              </button>
            </form>
          ) : tab === 'coach' ? (
            <form onSubmit={handleCoachSubmit} className="p-8 space-y-5">
              <div>
                <label className={labelCls}>Antrenör Parolası</label>
                <div className={inputWrapperCls}>
                  <div className={inputIconSlotCls}><Lock className="w-5 h-5" /></div>
                  <input type="password" value={coachPassword} onChange={(e) => setCoachPassword(e.target.value)} placeholder="Parola" className={inputInnerCls} autoComplete="current-password" />
                </div>
              </div>
              {coachError && <p className="text-sm text-rose-400 font-medium flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-rose-400" />{coachError}</p>}
              <button type="submit" className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 hover:-translate-y-0.5 active:translate-y-0">
                <ArrowRight className="w-5 h-5" /> Antrenör Girişi
              </button>
            </form>
          ) : tab === 'club' ? (
            <form onSubmit={handleClubSubmit} className="p-8 space-y-5">
              <div>
                <label className={labelCls}>Şube</label>
                <div className={inputWrapperCls}>
                  <div className={inputIconSlotCls}><Building2 className="w-5 h-5" /></div>
                  <select value={clubBranch} onChange={(e) => setClubBranch(e.target.value)} className={`${inputInnerCls} cursor-pointer appearance-none`}>
                    {clubBranchOptions.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Kulüp Parolası</label>
                <div className={inputWrapperCls}>
                  <div className={inputIconSlotCls}><Lock className="w-5 h-5" /></div>
                  <input type="password" value={clubPassword} onChange={(e) => setClubPassword(e.target.value)} placeholder="Parola" className={inputInnerCls} autoComplete="current-password" />
                </div>
              </div>
              {clubError && <p className="text-sm text-rose-400 font-medium flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-rose-400" />{clubError}</p>}
              <button type="submit" className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 hover:-translate-y-0.5 active:translate-y-0">
                <ArrowRight className="w-5 h-5" /> Kulüp Girişi
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminSubmit} className="p-8 space-y-5">
              <div>
                <label className={labelCls}>Yönetim Parolası</label>
                <div className={inputWrapperCls}>
                  <div className={inputIconSlotCls}><Lock className="w-5 h-5" /></div>
                  <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Parola" className={inputInnerCls} autoComplete="current-password" />
                </div>
              </div>
              {adminError && <p className="text-sm text-rose-400 font-medium flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-rose-400" />{adminError}</p>}
              <button type="submit" className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25 hover:-translate-y-0.5 active:translate-y-0">
                <ArrowRight className="w-5 h-5" /> Yönetime Giriş
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-slate-500/90 text-xs mt-6 max-w-sm mx-auto leading-relaxed">
          Öğrenci: Kullanıcı adı, öğrenci no veya veli telefonu + PIN (veya telefon son 4 hane) ile giriş yapabilirsiniz.
        </p>
      </div>
    </div>
  );
};

export default Login;
