
import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import StudentList from './components/StudentList';
import StudentAdd from './components/StudentAdd';
import StudentDetail from './components/StudentDetail';
import StudentPanel from './components/StudentPanel';
import Login from './components/Login';
import ChessBoard from './components/ChessBoard';
import BranchGroupManagement from './components/BranchGroupManagement';
import CorporateStructure from './components/CorporateStructure';
import Finance from './components/Finance';
import Attendance from './components/Attendance';
import Gallery from './components/Gallery';
import Homework from './components/Homework';
import Analysis from './components/Analysis';
import LiveLesson from './components/LiveLesson';
import Curriculum from './components/Curriculum';
import Messages from './components/Messages';
import Security from './components/Security';
import Inventory from './components/Inventory';
import StudyPage from './components/StudyPage';
import Tournaments from './components/Tournaments';
import { Menu, Search, Bell, HelpCircle } from 'lucide-react';
import { AppProvider, useApp } from './AppContext';
import { COACH_NAV_CATEGORIES, NAV_CATEGORIES } from './constants';
import ClubPanel from './components/ClubPanel';
import ApplicationForm from './components/ApplicationForm';
import ParentConsentForm from './components/ParentConsentForm';
import ApplicationsAdmin from './components/ApplicationsAdmin';
import LeaderboardPage from './components/leaderboard/LeaderboardPage';

// ─── Türkçe slug haritası ────────────────────────────────────────────────────
const TAB_TO_SLUG: Record<string, string> = {
  dashboard: 'anasayfa',
  corporate: 'kurumsal-yapi',
  'student-list': 'ogrenci-listesi',
  'student-add': 'ogrenci-ekle',
  'student-detail': 'ogrenci-detay',
  students: 'ogrenci-islemleri',
  attendance: 'yoklama-al',
  'qr-attendance': 'qr-yoklama',
  groups: 'brans-grup',
  'bulk-actions': 'toplu-islemler',
  applications: 'basvurular',
  puzzles: 'bulmaca-yonetimi',
  study: 'bulmaca-yeni',
  tournaments: 'turnuvalar',
  homework: 'odev-yonetimi',
  leaderboard: 'lider-tablosu',
  analysis: 'analiz-performans',
  finance: 'kasa-finans',
  inventory: 'depo-envanter',
  gallery: 'galeri',
  lessons: 'canli-ders',
  curriculum: 'ders-programi',
  messages: 'whatsapp',
  security: 'kullanici-guvenlik',
};

const SLUG_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_TO_SLUG).map(([tab, slug]) => [slug, tab])
);

/** Tahta / çalışma gibi tam genişlik modüller — mobilde yan padding taşmayı önler */
const FULL_BLEED_TABS = new Set(['study', 'lessons']);

function getPublicFormRoute(): 'basvuru' | 'veli-imza' | null {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/');
  const head = parts[0];
  if (head === 'basvuru') return 'basvuru';
  if (head === 'veli-imza' && parts[1]) return 'veli-imza';
  return null;
}

function getVeliImzaToken(): string | null {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/');
  return parts[0] === 'veli-imza' && parts[1] ? decodeURIComponent(parts[1]) : null;
}

function isPublicApplicationRoute(): boolean {
  return getPublicFormRoute() !== null;
}

function readHash(): { tab: string; studentId: string | null } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) return { tab: 'dashboard', studentId: null };
  const [slug, extra] = raw.split('/');
  const tab = SLUG_TO_TAB[slug] ?? 'dashboard';
  return { tab, studentId: tab === 'student-detail' && extra ? extra : null };
}

function writeHash(tab: string, studentId?: string | null) {
  const slug = TAB_TO_SLUG[tab] ?? 'anasayfa';
  const next =
    tab === 'student-detail' && studentId
      ? `#/${slug}/${studentId}`
      : `#/${slug}`;
  if (window.location.hash !== next) {
    window.location.hash = next;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const COACH_TAB_IDS = new Set(COACH_NAV_CATEGORIES.flatMap((cat) => cat.items.map((item) => item.id)));

/** Giriş yapılmamışsa Login; role'e göre Veli/Öğrenci paneli, Antrenör, Kulüp veya Admin */
const AppRoot: React.FC = () => {
  const { auth, logout } = useApp();
  const [publicForm, setPublicForm] = useState(() => getPublicFormRoute());

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    const onHash = () => setPublicForm(getPublicFormRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (publicForm === 'basvuru') return <ApplicationForm />;
  if (publicForm === 'veli-imza') {
    const token = getVeliImzaToken();
    if (token) return <ParentConsentForm token={token} />;
  }
  if (!auth) return <Login />;
  if (auth.role === 'parent') return <StudentPanel studentId={auth.studentId} onLogout={logout} viewAs="parent" />;
  if (auth.role === 'student') return <StudentPanel studentId={auth.studentId} onLogout={logout} viewAs="student" />;
  if (auth.role === 'coach') return <CoachLayout onLogout={logout} />;
  if (auth.role === 'club') return <ClubPanel branch={auth.branch} onLogout={logout} />;
  return <AdminLayout onLogout={logout} />;
};

const AdminLayout: React.FC<{ onLogout?: () => void }> = ({ onLogout }) => {
  const initial = readHash();
  const [activeTab, setActiveTabRaw] = useState(initial.tab);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(initial.studentId);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarDesktopExpanded, setSidebarDesktopExpanded] = useState(true);
  const sidebarIconOnlyDefault = activeTab === 'lessons';

  const setActiveTab = useCallback((tab: string, studentId?: string | null) => {
    setActiveTabRaw(tab);
    if (studentId !== undefined) setSelectedStudentId(studentId);
    writeHash(tab, studentId !== undefined ? studentId : selectedStudentId);
  }, [selectedStudentId]);

  useEffect(() => {
    const onHash = () => {
      const { tab, studentId } = readHash();
      setActiveTabRaw(tab);
      if (studentId !== null) setSelectedStudentId(studentId);
    };
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) writeHash(initial.tab, initial.studentId);
    return () => window.removeEventListener('hashchange', onHash);
  }, [initial.tab, initial.studentId]);

  const handleSidebarTab = useCallback((tab: string) => {
    setActiveTabRaw(tab);
    setSelectedStudentId(null);
    writeHash(tab, null);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'corporate':
        return <CorporateStructure />;
      case 'groups':
        return <BranchGroupManagement />;
      case 'applications':
        return <ApplicationsAdmin />;
      case 'students':
      case 'student-list':
      case 'bulk-actions':
        return (
          <StudentList
            onAddNew={() => setActiveTab('student-add', null)}
            onViewDetail={(id) => {
              setSelectedStudentId(id);
              setActiveTabRaw('student-detail');
              writeHash('student-detail', id);
            }}
          />
        );
      case 'student-add':
        return (
          <StudentAdd
            onCancel={() => setActiveTab('student-list', null)}
            onSaved={() => setActiveTab('student-list', null)}
          />
        );
      case 'student-detail':
        return (
          <StudentDetail
            studentId={selectedStudentId}
            onBack={() => setActiveTab('student-list', null)}
            onNavigate={(tab) => setActiveTab(tab, null)}
          />
        );
      case 'attendance':
      case 'qr-attendance':
        return <Attendance />;
      case 'puzzles':
        return <ChessBoard />;
      case 'study':
        return <StudyPage />;
      case 'tournaments':
        return <Tournaments role="admin" />;
      case 'homework':
        return <Homework />;
      case 'leaderboard':
        return <LeaderboardPage />;
      case 'analysis':
        return <Analysis />;
      case 'finance':
        return <Finance />;
      case 'inventory':
        return <Inventory />;
      case 'gallery':
        return <Gallery />;
      case 'lessons':
        return <LiveLesson />;
      case 'curriculum':
        return <Curriculum />;
      case 'messages':
        return <Messages />;
      case 'security':
        return <Security />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 py-20">
            <HelpCircle className="w-16 h-16 mb-4 opacity-20" />
            <h2 className="text-xl font-semibold">Bu modül yakında eklenecek</h2>
            <p className="text-sm">Geliştirme süreci devam etmektedir.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex min-h-screen transition-colors duration-500 dark bg-[#020617] text-slate-100 min-w-0">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={handleSidebarTab}
          navCategories={NAV_CATEGORIES}
          onLogout={onLogout}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          defaultIconOnly={sidebarIconOnlyDefault}
          onDesktopExpandedChange={setSidebarDesktopExpanded}
        />

        <main className={`flex-1 min-w-0 ml-0 min-h-screen flex flex-col relative overflow-x-hidden transition-[margin] duration-300 ${sidebarDesktopExpanded ? 'lg:ml-64' : 'lg:ml-[4.5rem]'}`}>
          <div className="absolute inset-0 atmospheric-bg pointer-events-none" />

          <header className="h-14 sm:h-16 lg:h-20 px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30 transition-all duration-500 bg-[#020617]/40 backdrop-blur-xl border-b border-white/5 shrink-0">
            <div className="flex items-center gap-3 sm:gap-6 min-w-0">
              <button type="button" onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg lg:hidden hover:bg-slate-800 text-slate-300" aria-label="Menüyü aç">
                <Menu className="w-5 h-5" />
              </button>
              <div className="hidden md:flex items-center rounded-lg px-4 py-2.5 border transition-all bg-slate-900/50 border-white/5 focus-within:border-indigo-500/50 flex-1 max-w-xs">
                <Search className="w-4 h-4 text-slate-500 mr-3 shrink-0" />
                <input
                  type="text"
                  placeholder="Hızlı arama..."
                  className="bg-transparent border-none outline-none text-sm w-full min-w-0 text-slate-400 focus:text-slate-200 placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-6 shrink-0">
              <button type="button" className="relative p-2 sm:p-2.5 rounded-lg transition-all text-slate-400 hover:text-indigo-400 hover:bg-slate-800/50">
                <Bell className="w-5 h-5" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full border-2 border-[#020617]" />
              </button>
              <div className="h-6 sm:h-8 w-px bg-white/5 hidden sm:block" />
              <div className="flex items-center gap-2 sm:gap-4 group cursor-pointer">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold tracking-tight text-slate-200 truncate max-w-[120px] lg:max-w-none">Çağrı Çankaya</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Baş Antrenör</p>
                </div>
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border-2 border-white/10 shadow-2xl overflow-hidden group-hover:scale-105 transition-transform shrink-0">
                  <img src="https://picsum.photos/seed/user123/100/100" alt="Avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
          </header>

          <div
            className={
              FULL_BLEED_TABS.has(activeTab)
                ? 'flex-1 min-h-0 flex flex-col p-0 overflow-hidden relative z-10 w-full'
                : 'p-4 sm:p-6 lg:p-8 mx-auto w-full min-w-0 relative z-10 flex-1'
            }
          >
            {renderContent()}
          </div>
        </main>
    </div>
  );
};

/** Antrenör paneli: kısıtlı menü (öğrenci listesi, yoklama, bulmaca, ödev, müfredat, analiz) */
const CoachLayout: React.FC<{ onLogout?: () => void }> = ({ onLogout }) => {
  const initial = readHash();
  const defaultCoachTab = 'student-list';
  const safeTab = COACH_TAB_IDS.has(initial.tab) ? initial.tab : defaultCoachTab;
  const [activeTab, setActiveTabRaw] = useState(safeTab);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(initial.studentId);

  const setActiveTab = useCallback((tab: string, studentId?: string | null) => {
    setActiveTabRaw(tab);
    if (studentId !== undefined) setSelectedStudentId(studentId);
    writeHash(tab, studentId !== undefined ? studentId : selectedStudentId);
  }, [selectedStudentId]);

  useEffect(() => {
    const onHash = () => {
      const { tab, studentId } = readHash();
      const safe = COACH_TAB_IDS.has(tab) ? tab : defaultCoachTab;
      setActiveTabRaw(safe);
      if (studentId !== null) setSelectedStudentId(studentId);
    };
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) writeHash(defaultCoachTab, initial.studentId);
    return () => window.removeEventListener('hashchange', onHash);
  }, [safeTab, initial.studentId]);

  const handleSidebarTab = useCallback((tab: string) => {
    setActiveTabRaw(tab);
    setSelectedStudentId(null);
    writeHash(tab, null);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'student-list':
        return (
          <StudentList
            onAddNew={() => {}}
            onViewDetail={(id) => {
              setSelectedStudentId(id);
              setActiveTabRaw('student-detail');
              writeHash('student-detail', id);
            }}
          />
        );
      case 'student-detail':
        return (
          <StudentDetail
            studentId={selectedStudentId}
            onBack={() => { setActiveTab('student-list', null); }}
            onNavigate={(tab) => setActiveTab(COACH_TAB_IDS.has(tab) ? tab : defaultCoachTab, null)}
          />
        );
      case 'attendance':
        return <Attendance />;
      case 'lessons':
        return <LiveLesson />;
      case 'puzzles':
        return <ChessBoard />;
      case 'study':
        return <StudyPage />;
      case 'homework':
        return <Homework />;
      case 'leaderboard':
        return <LeaderboardPage />;
      case 'curriculum':
        return <Curriculum />;
      case 'analysis':
        return <Analysis />;
      default:
        return <Dashboard />;
    }
  };

  const sidebarTab = COACH_TAB_IDS.has(activeTab) ? activeTab : (activeTab === 'student-detail' ? 'student-list' : defaultCoachTab);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarDesktopExpanded, setSidebarDesktopExpanded] = useState(true);
  const sidebarIconOnlyDefault = activeTab === 'lessons';

  return (
    <div className="flex min-h-screen transition-colors duration-500 dark bg-[#020617] text-slate-100 min-w-0">
      <Sidebar
        activeTab={sidebarTab}
        setActiveTab={handleSidebarTab}
        navCategories={COACH_NAV_CATEGORIES}
        onLogout={onLogout}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        defaultIconOnly={sidebarIconOnlyDefault}
        onDesktopExpandedChange={setSidebarDesktopExpanded}
      />
      <main className={`flex-1 min-w-0 ml-0 min-h-screen flex flex-col relative overflow-x-hidden transition-[margin] duration-300 ${sidebarDesktopExpanded ? 'lg:ml-64' : 'lg:ml-[4.5rem]'}`}>
        <div className="absolute inset-0 atmospheric-bg pointer-events-none" />
        <header className="h-14 sm:h-16 lg:h-20 px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30 bg-[#020617]/40 backdrop-blur-xl border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <button type="button" onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg lg:hidden hover:bg-slate-800 text-slate-300" aria-label="Menüyü aç"><Menu className="w-5 h-5" /></button>
            <div className="hidden md:flex items-center rounded-lg px-4 py-2.5 border bg-slate-900/50 border-white/5 max-w-xs">
              <Search className="w-4 h-4 text-slate-500 mr-3 shrink-0" />
              <input type="text" placeholder="Hızlı arama..." className="bg-transparent border-none outline-none text-sm w-full min-w-0 text-slate-400 placeholder:text-slate-600" />
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <p className="text-xs sm:text-sm font-bold text-amber-400/90 truncate max-w-[100px] sm:max-w-none">Antrenör Paneli</p>
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black shrink-0">A</div>
          </div>
        </header>
        <div
          className={
            FULL_BLEED_TABS.has(activeTab)
              ? 'flex-1 min-h-0 flex flex-col p-0 overflow-hidden relative z-10 w-full'
              : 'p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full min-w-0 relative z-10 flex-1'
          }
        >
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

const App: React.FC = () => (
  <AppProvider>
    <AppRoot />
  </AppProvider>
);

export default App;
