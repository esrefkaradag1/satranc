import React, { useState } from 'react';
import { Building2, Users, Wallet, UserPlus, Trash2, Phone, Mail, Menu } from 'lucide-react';
import { useApp } from '../AppContext';
import Sidebar from './Sidebar';
import { CLUB_NAV_ITEMS } from '../constants';
import Tournaments from './Tournaments';

const inputCls = 'w-full px-4 py-2.5 rounded-lg text-sm font-medium outline-none bg-slate-900/60 border border-slate-700/60 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50';

interface ClubPanelProps {
  branch: string;
  onLogout: () => void;
}

const ClubPanel: React.FC<ClubPanelProps> = ({ branch, onLogout }) => {
  const { students, transactions, coaches, groups, addCoach, deleteCoach, addStudent } = useApp();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const branchStudents = students.filter((s) => (s.branch || 'Merkez') === branch);
  const branchCoaches = coaches.filter((c) => c.branch === branch);
  const paid = branchStudents.filter((s) => s.paymentStatus === 'Paid').length;
  const unpaid = branchStudents.filter((s) => s.paymentStatus === 'Unpaid').length;
  const partial = branchStudents.filter((s) => s.paymentStatus === 'Partial').length;
  const branchTx = transactions.filter((t) => t.branch === branch || (!t.branch && branch === 'Merkez'));
  const totalIncome = branchTx.filter((t) => t.type === 'income').reduce((sum, t) => sum + (t.amount || 0), 0);
  const totalExpense = branchTx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + (t.amount || 0), 0);

  const [showCoachModal, setShowCoachModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [coachForm, setCoachForm] = useState({ name: '', phone: '', email: '' });
  const [studentForm, setStudentForm] = useState({
    name: '',
    parentName: '',
    parentPhone: '',
    group: groups[0] || '',
    birthDate: new Date().toISOString().slice(0, 10),
  });

  const todayIso = () => new Date().toISOString().slice(0, 10);
  const onlyDigits = (v: string) => v.replace(/\D/g, '');

  const handleAddCoach = (e: React.FormEvent) => {
    e.preventDefault();
    const name = coachForm.name.trim();
    if (!name) return;
    addCoach({
      name,
      branch,
      phone: coachForm.phone.trim() || undefined,
      email: coachForm.email.trim() || undefined,
    });
    setCoachForm({ name: '', phone: '', email: '' });
    setShowCoachModal(false);
  };

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    const name = studentForm.name.trim();
    const parentName = studentForm.parentName.trim() || 'Veli';
    const parentPhone = onlyDigits(studentForm.parentPhone);
    if (!name) return;
    addStudent({
      name,
      level: 'Başlangıç',
      elo: 0,
      ukd: 0,
      lastAttendance: todayIso(),
      paymentStatus: 'Unpaid',
      group: studentForm.group || groups[0] || '',
      parentName,
      parentPhone: parentPhone || '',
      birthDate: studentForm.birthDate,
      registrationDate: todayIso(),
      branch,
      status: 'active',
    });
    setStudentForm({
      name: '',
      parentName: '',
      parentPhone: '',
      group: groups[0] || '',
      birthDate: new Date().toISOString().slice(0, 10),
    });
    setShowStudentModal(false);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-slate-800/50 border border-white/5 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Öğrenci</span>
                </div>
                <p className="text-2xl font-black text-white">{branchStudents.length}</p>
                <p className="text-xs text-slate-500 mt-1">Bu şubede kayıtlı</p>
              </div>
              <div className="bg-slate-800/50 border border-white/5 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <Wallet className="w-5 h-5 text-amber-400" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ödeme durumu</span>
                </div>
                <p className="text-sm text-slate-300">
                  <span className="text-emerald-400 font-bold">{paid}</span> ödedi · <span className="text-rose-400 font-bold">{unpaid}</span> ödemedi
                  {partial > 0 && <> · <span className="text-amber-400 font-bold">{partial}</span> kısmi</>}
                </p>
              </div>
              <div className="bg-slate-800/50 border border-white/5 rounded-xl p-5 sm:col-span-2 lg:col-span-1">
                <div className="flex items-center gap-3 mb-2">
                  <Wallet className="w-5 h-5 text-indigo-400" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Kasa özeti</span>
                </div>
                <p className="text-sm text-slate-300">
                  Gelir: <span className="text-emerald-400 font-bold">₺{totalIncome.toLocaleString('tr-TR')}</span>
                  <br />
                  Gider: <span className="text-rose-400 font-bold">₺{totalExpense.toLocaleString('tr-TR')}</span>
                </p>
              </div>
            </div>
            <section className="bg-slate-800/30 border border-white/5 rounded-xl p-5">
              <h2 className="text-sm font-black text-slate-300 uppercase tracking-wider mb-3">Şube özeti</h2>
              <p className="text-slate-400 text-sm">
                <strong className="text-slate-200">{branch}</strong> şubesinde toplam <strong>{branchStudents.length}</strong> öğrenci, <strong>{branchCoaches.length}</strong> antrenör kayıtlı.
              </p>
            </section>
          </div>
        );
      case 'coaches':
        return (
          <section className="bg-slate-800/30 border border-white/5 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-300 uppercase tracking-wider">Antrenörler</h2>
              <button
                type="button"
                onClick={() => setShowCoachModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all"
              >
                <UserPlus className="w-4 h-4" /> Antrenör Ekle
              </button>
            </div>
            <div className="p-4">
              {branchCoaches.length === 0 ? (
                <p className="text-slate-500 text-sm">Henüz antrenör eklenmedi. &quot;Antrenör Ekle&quot; ile ekleyebilirsiniz.</p>
              ) : (
                <ul className="space-y-2">
                  {branchCoaches.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-slate-900/50 border border-white/5">
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">{c.name}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-0.5">
                          {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</span>}
                          {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.email}</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteCoach(c.id)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all shrink-0"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      case 'students':
        return (
          <section className="bg-slate-800/30 border border-white/5 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-300 uppercase tracking-wider">Öğrenciler</h2>
              <button
                type="button"
                onClick={() => setShowStudentModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all"
              >
                <UserPlus className="w-4 h-4" /> Öğrenci Ekle
              </button>
            </div>
            <div className="p-4">
              {branchStudents.length === 0 ? (
                <p className="text-slate-500 text-sm">Henüz öğrenci eklenmedi. &quot;Öğrenci Ekle&quot; ile ekleyebilirsiniz.</p>
              ) : (
                <ul className="space-y-2 max-h-[70vh] overflow-y-auto custom-scrollbar">
                  {branchStudents.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-slate-900/50 border border-white/5">
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">{s.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{s.group} · {s.parentName}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${s.paymentStatus === 'Paid' ? 'bg-emerald-500/20 text-emerald-400' : s.paymentStatus === 'Unpaid' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {s.paymentStatus === 'Paid' ? 'Ödedi' : s.paymentStatus === 'Unpaid' ? 'Ödemedi' : 'Kısmi'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      case 'finance':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Toplam Gelir</p>
                <p className="text-2xl font-black text-emerald-400">₺{totalIncome.toLocaleString('tr-TR')}</p>
              </div>
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-6">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Toplam Gider</p>
                <p className="text-2xl font-black text-rose-400">₺{totalExpense.toLocaleString('tr-TR')}</p>
              </div>
            </div>
            <section className="bg-slate-800/30 border border-white/5 rounded-xl overflow-hidden">
              <h2 className="px-5 py-4 border-b border-white/5 text-sm font-black text-slate-300 uppercase tracking-wider">Son işlemler ({branchTx.length})</h2>
              {branchTx.length === 0 ? (
                <p className="p-5 text-slate-500 text-sm">Henüz işlem kaydı yok.</p>
              ) : (
                <ul className="divide-y divide-white/5 max-h-80 overflow-y-auto custom-scrollbar">
                  {branchTx.slice(0, 50).map((t) => (
                    <li key={t.id} className="px-5 py-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-200">{t.description || t.category}</p>
                        <p className="text-xs text-slate-500">{t.date}</p>
                      </div>
                      <span className={t.type === 'income' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {t.type === 'income' ? '+' : '-'}₺{(t.amount || 0).toLocaleString('tr-TR')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        );
      case 'tournaments':
        return <Tournaments role="club" branch={branch} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen transition-colors duration-500 dark bg-[#020617] text-slate-100 min-w-0">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        navItems={CLUB_NAV_ITEMS}
        onLogout={onLogout}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="flex-1 min-w-0 ml-0 lg:ml-64 min-h-screen flex flex-col relative overflow-x-hidden">
        <div className="absolute inset-0 atmospheric-bg pointer-events-none" />
        <header className="relative z-10 h-14 sm:h-16 lg:h-20 px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30 bg-[#020617]/40 backdrop-blur-xl border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button type="button" onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg lg:hidden hover:bg-slate-800 text-slate-300 shrink-0" aria-label="Menüyü aç">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-black text-white truncate">Kulüp Paneli</h1>
                <p className="text-xs text-emerald-400/90 font-bold truncate">{branch} şubesi</p>
              </div>
            </div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black text-sm shrink-0">
            K
          </div>
        </header>
        <div className="relative z-10 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full min-w-0 flex-1">
          {renderContent()}
        </div>
      </main>

      {/* Antrenör Ekle Modal */}
      {showCoachModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCoachModal(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-700">
              <h3 className="text-lg font-black text-white">Antrenör Ekle</h3>
              <p className="text-xs text-slate-400 mt-0.5">{branch} şubesi</p>
            </div>
            <form onSubmit={handleAddCoach} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Ad Soyad *</label>
                <input type="text" value={coachForm.name} onChange={(e) => setCoachForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Antrenör adı" required />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Telefon</label>
                <input type="tel" value={coachForm.phone} onChange={(e) => setCoachForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} placeholder="5XX XXX XX XX" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">E-posta</label>
                <input type="email" value={coachForm.email} onChange={(e) => setCoachForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} placeholder="ornek@email.com" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCoachModal(false)} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm">İptal</button>
                <button type="submit" className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">Ekle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Öğrenci Ekle Modal */}
      {showStudentModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowStudentModal(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-700">
              <h3 className="text-lg font-black text-white">Öğrenci Ekle</h3>
              <p className="text-xs text-slate-400 mt-0.5">{branch} şubesi</p>
            </div>
            <form onSubmit={handleAddStudent} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Öğrenci Ad Soyad *</label>
                <input type="text" value={studentForm.name} onChange={(e) => setStudentForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Ad Soyad" required />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Veli Adı</label>
                <input type="text" value={studentForm.parentName} onChange={(e) => setStudentForm((f) => ({ ...f, parentName: e.target.value }))} className={inputCls} placeholder="Veli adı" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Veli Telefonu *</label>
                <input type="tel" value={studentForm.parentPhone} onChange={(e) => setStudentForm((f) => ({ ...f, parentPhone: e.target.value }))} className={inputCls} placeholder="5XX XXX XX XX" required />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Grup</label>
                <select value={studentForm.group} onChange={(e) => setStudentForm((f) => ({ ...f, group: e.target.value }))} className={inputCls}>
                  {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Doğum Tarihi</label>
                <input type="date" value={studentForm.birthDate} onChange={(e) => setStudentForm((f) => ({ ...f, birthDate: e.target.value }))} className={inputCls} />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowStudentModal(false)} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm">İptal</button>
                <button type="submit" className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">Ekle</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClubPanel;
