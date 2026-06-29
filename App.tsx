
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Menu, Search, Bell } from 'lucide-react';
import { AppProvider, useApp } from './AppContext';
import { COACH_NAV_CATEGORIES, NAV_CATEGORIES, type NavCategory } from './constants';
import ClubPanel from './components/ClubPanel';
import ApplicationForm from './components/ApplicationForm';
import ParentConsentForm from './components/ParentConsentForm';
import ApplicationsAdmin from './components/ApplicationsAdmin';
import LeaderboardPage from './components/leaderboard/LeaderboardPage';
import CoachProfilePage from './components/profile/CoachProfilePage';
import AdminProfilePage from './components/profile/AdminProfilePage';
import RoleManagement from './components/roles/RoleManagement';
import { getSessionDisplay } from './lib/sessionDisplayName';
import { filterNavByPermissions, coachNavForPermissions, isCoachPanelTabAllowed, coachSidebarTabFor } from './lib/rolePermissions';
import { readPanelHash, writePanelHash, isAdminLoginRoute } from './lib/panelRouting';
import { getClubApplicationSlug } from './lib/applicationClub';

// ─── Türkçe slug haritası (lib/panelRouting.ts) ───────────────────────────────
import { readPanelHash as readHash, writePanelHash as writeHash } from './lib/panelRouting';

/** Tahta / çalışma gibi tam genişlik modüller — mobilde yan padding taşmayı önler */
const FULL_BLEED_TABS = new Set(['study', 'lessons']);

function getPublicFormRoute(): { route: 'basvuru'; clubSlug?: string } | { route: 'veli-imza' } | null {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/');
  const head = parts[0];
  if (head === 'basvuru') {
    const slug = parts[1] ? decodeURIComponent(parts[1]).trim().toLowerCase() : undefined;
    return { route: 'basvuru', clubSlug: slug || undefined };
  }
  if (head === 'veli-imza' && parts[1]) return { route: 'veli-imza' };
  return null;
}

function getVeliImzaToken(): string | null {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/');
  return parts[0] === 'veli-imza' && parts[1] ? decodeURIComponent(parts[1]) : null;
}

function isPublicApplicationRoute(): boolean {
  return getPublicFormRoute() !== null;
}

function collectNavTabIds(categories: NavCategory[]): Set<string> {
  return new Set(
    categories.flatMap((cat) =>
      cat.items.flatMap((item) => (item.subItems ? item.subItems.map((s) => s.id) : [item.id])),
    ),
  );
}

const ADMIN_TAB_IDS = collectNavTabIds(NAV_CATEGORIES);
const ADMIN_EXTRA_TAB_IDS = new Set(['student-detail', 'students', 'qr-attendance']);

function isAdminAllowedTab(tab: string): boolean {
  return ADMIN_TAB_IDS.has(tab) || ADMIN_EXTRA_TAB_IDS.has(tab);
}
const COACH_TAB_IDS = collectNavTabIds(COACH_NAV_CATEGORIES);
const COACH_EXTRA_TAB_IDS = new Set(['student-detail']);

function isCoachAllowedTab(tab: string): boolean {
  return COACH_TAB_IDS.has(tab) || COACH_EXTRA_TAB_IDS.has(tab);
}

/** Giriş yapılmamışsa Login; role'e göre Veli/Öğrenci paneli, Antrenör, Kulüp veya Admin */
const AppRoot: React.FC = () => {
  const { auth, logout } = useApp();
  const [publicForm, setPublicForm] = useState(() => getPublicFormRoute());
  const [adminLoginRoute, setAdminLoginRoute] = useState(() => isAdminLoginRoute());

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    const onHash = () => {
      setPublicForm(getPublicFormRoute());
      setAdminLoginRoute(isAdminLoginRoute());
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  if (publicForm?.route === 'basvuru') return <ApplicationForm clubSlug={publicForm.clubSlug} />;
  if (publicForm?.route === 'veli-imza') {
    const token = getVeliImzaToken();
    if (token) return <ParentConsentForm token={token} />;
  }
  if (!auth) return <Login adminOnly={adminLoginRoute} />;
  if (auth.role === 'parent') return <StudentPanel studentId={auth.studentId} onLogout={logout} viewAs="parent" />;
  if (auth.role === 'student') return <StudentPanel studentId={auth.studentId} onLogout={logout} viewAs="student" />;
  if (auth.role === 'coach') return <CoachLayout onLogout={logout} />;
  if (auth.role === 'club') return <ClubPanel branch={auth.branch} clubId={auth.clubId} onLogout={logout} />;
  return <AdminLayout onLogout={logout} />;
};

const AdminLayout: React.FC<{ onLogout?: () => void }> = ({ onLogout }) => {
  const { auth, students, coaches, clubs, authPermissions } = useApp();
  const [profileTick, setProfileTick] = useState(0);
  useEffect(() => {
    const onProfile = () => setProfileTick((n) => n + 1);
    window.addEventListener('admin-profile-updated', onProfile);
    return () => window.removeEventListener('admin-profile-updated', onProfile);
  }, []);
  const session = useMemo(
    () => getSessionDisplay(auth, { students, coaches, clubs }),
    [auth, students, coaches, clubs, profileTick],
  );
  const initial = readHash();
  const defaultAdminTab = 'dashboard';
  const [activeTab, setActiveTabRaw] = useState(() => {
    const { tab } = readHash();
    return isAdminAllowedTab(tab) ? tab : defaultAdminTab;
  });
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(() => readHash().studentId);
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
      const safe = isAdminAllowedTab(tab) ? tab : defaultAdminTab;
      setActiveTabRaw(safe);
      if (studentId !== null) setSelectedStudentId(studentId);
    };
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash.replace(/^#\/?/, '')) {
      const stored = readHash();
      const safe = isAdminAllowedTab(stored.tab) ? stored.tab : defaultAdminTab;
      writeHash(safe, stored.studentId);
      setActiveTabRaw(safe);
      if (stored.studentId) setSelectedStudentId(stored.studentId);
    }
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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
      case 'student-list':
      case 'students':
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
            onNavigate={(tab) => setActiveTab(isAdminAllowedTab(tab) ? tab : defaultAdminTab, null)}
          />
        );
      case 'attendance':
      case 'qr-attendance':
        return <Attendance />;
      case 'groups':
        return <BranchGroupManagement />;
      case 'applications':
        return <ApplicationsAdmin />;
      case 'lessons':
        return <LiveLesson />;
      case 'puzzles':
        return <ChessBoard />;
      case 'study':
        return <StudyPage />;
      case 'homework':
        return <Homework />;
      case 'curriculum':
        return <Curriculum />;
      case 'tournaments':
        return <Tournaments role="admin" />;
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
      case 'messages':
        return <Messages />;
      case 'security':
        return <Security />;
      case 'roles':
        return <RoleManagement />;
      case 'profile':
        return <AdminProfilePage />;
      default:
        return <Dashboard />;
    }
  };

  const sidebarTab = ADMIN_TAB_IDS.has(activeTab)
    ? activeTab
    : activeTab === 'student-detail'
      ? 'student-list'
      : defaultAdminTab;

  const adminNavCategories = useMemo(
    () => filterNavByPermissions(NAV_CATEGORIES, authPermissions),
    [authPermissions],
  );

  return (
    <div className="flex min-h-screen transition-colors duration-500 dark bg-[#020617] text-slate-100 min-w-0">
        <Sidebar
          activeTab={sidebarTab}
          setActiveTab={handleSidebarTab}
          navCategories={adminNavCategories}
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
                  <p className="text-sm font-bold tracking-tight text-slate-200 truncate max-w-[120px] lg:max-w-none">{session.fullName}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{session.roleLabel}</p>
                </div>
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border-2 border-white/10 shadow-2xl overflow-hidden group-hover:scale-105 transition-transform shrink-0 bg-indigo-600/30 flex items-center justify-center text-indigo-200 font-black text-sm">
                  {session.firstName.charAt(0).toUpperCase()}
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

/** Antrenör paneli: öğrenci işleri, eğitim & içerik, medya, raporlama */
const CoachLayout: React.FC<{ onLogout?: () => void }> = ({ onLogout }) => {
  const { auth, students, scopedStudents, coaches, clubs, authPermissions, rolesLoaded } = useApp();
  const [profileTick, setProfileTick] = useState(0);
  useEffect(() => {
    const onProfile = () => setProfileTick((n) => n + 1);
    window.addEventListener('admin-profile-updated', onProfile);
    return () => window.removeEventListener('admin-profile-updated', onProfile);
  }, []);
  const session = useMemo(
    () => getSessionDisplay(auth, { students, coaches, clubs }),
    [auth, students, coaches, clubs, profileTick],
  );
  const coachPermissions = authPermissions;
  const isCoachTabAllowed = useCallback(
    (tab: string) => isCoachPanelTabAllowed(coachPermissions, tab),
    [coachPermissions],
  );

  const coachNavCategories = useMemo(
    () => coachNavForPermissions(coachPermissions),
    [coachPermissions],
  );

  const initial = readHash();
  const defaultCoachTab = coachPermissions.has('dashboard') ? 'dashboard' : [...coachPermissions][0] || 'dashboard';
  const [activeTab, setActiveTabRaw] = useState(() => initial.tab);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(initial.studentId);

  const setActiveTab = useCallback((tab: string, studentId?: string | null) => {
    setActiveTabRaw(tab);
    if (studentId !== undefined) setSelectedStudentId(studentId);
    writeHash(tab, studentId !== undefined ? studentId : selectedStudentId);
  }, [selectedStudentId]);

  useEffect(() => {
    const onHash = () => {
      const { tab, studentId } = readHash();
      if (!rolesLoaded) {
        setActiveTabRaw(tab);
        if (studentId !== null) setSelectedStudentId(studentId);
        return;
      }
      const safe = isCoachTabAllowed(tab) ? tab : defaultCoachTab;
      setActiveTabRaw(safe);
      if (studentId !== null) setSelectedStudentId(studentId);
    };
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash.replace(/^#\/?/, '')) {
      const stored = readHash();
      const safe = rolesLoaded && !isCoachTabAllowed(stored.tab) ? defaultCoachTab : stored.tab;
      writeHash(safe, stored.studentId);
    }
    return () => window.removeEventListener('hashchange', onHash);
  }, [defaultCoachTab, isCoachTabAllowed, rolesLoaded]);

  useEffect(() => {
    if (!rolesLoaded) return;
    const { tab } = readHash();
    if (isCoachTabAllowed(tab)) {
      setActiveTabRaw(tab);
      return;
    }
    if (!isCoachTabAllowed(activeTab)) {
      setActiveTabRaw(defaultCoachTab);
      writeHash(defaultCoachTab, null);
    }
  }, [rolesLoaded, coachPermissions, activeTab, defaultCoachTab, isCoachTabAllowed]);

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
      case 'student-list':
      case 'students':
      case 'bulk-actions':
        return (
          <StudentList
            onAddNew={() => {
              setActiveTabRaw('student-add');
              writeHash('student-add', null);
            }}
            onViewDetail={(id) => {
              setSelectedStudentId(id);
              setActiveTabRaw('student-detail');
              writeHash('student-detail', id);
            }}
          />
        );
      case 'student-add': {
        const coachBranch =
          auth?.role === 'coach'
            ? auth.branch || coaches.find((c) => c.id === auth.coachId)?.branch
            : undefined;
        const coachId = auth?.role === 'coach' ? auth.coachId : undefined;
        return (
          <StudentAdd
            defaultBranchOffice={coachBranch}
            defaultCoachId={coachId}
            lockBranchOffice={Boolean(coachBranch)}
            lockCoachId={Boolean(coachId)}
            onCancel={() => setActiveTab('student-list', null)}
            onSaved={() => setActiveTab('student-list', null)}
          />
        );
      }
      case 'student-detail': {
        const canView =
          !selectedStudentId || scopedStudents.some((s) => s.id === selectedStudentId);
        if (!canView) {
          return (
            <div className="p-8 text-center text-slate-400">
              <p className="font-medium">Bu öğrenciye erişim yetkiniz yok.</p>
              <button
                type="button"
                onClick={() => setActiveTab('student-list', null)}
                className="mt-4 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold"
              >
                Listeye dön
              </button>
            </div>
          );
        }
        return (
          <StudentDetail
            studentId={selectedStudentId}
            onBack={() => { setActiveTab('student-list', null); }}
            onNavigate={(tab) => setActiveTab(isCoachTabAllowed(tab) ? tab : defaultCoachTab, null)}
          />
        );
      }
      case 'attendance':
      case 'qr-attendance':
        return <Attendance />;
      case 'groups':
        return <BranchGroupManagement />;
      case 'applications': {
        const coachBranch =
          auth?.role === 'coach'
            ? auth.branch || coaches.find((c) => c.id === auth.coachId)?.branch
            : undefined;
        const coachClub = coachBranch
          ? clubs.find((c) => c.name.trim().toLowerCase() === coachBranch.trim().toLowerCase())
          : undefined;
        return (
          <ApplicationsAdmin
            clubId={coachClub?.id}
            clubName={coachClub?.name ?? coachBranch}
            clubSlug={coachClub ? getClubApplicationSlug(coachClub) : undefined}
          />
        );
      }
      case 'tournaments': {
        const coachBranch =
          auth?.role === 'coach'
            ? auth.branch || coaches.find((c) => c.id === auth.coachId)?.branch
            : undefined;
        return <Tournaments role="club" branch={coachBranch} />;
      }
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
      case 'finance':
        return <Finance />;
      case 'inventory':
        return <Inventory />;
      case 'gallery':
        return <Gallery />;
      case 'messages':
        return <Messages />;
      case 'security':
        return <Security />;
      case 'roles':
        return <RoleManagement />;
      case 'profile':
        return <CoachProfilePage />;
      default:
        return <Dashboard />;
    }
  };

  const sidebarTab = coachSidebarTabFor(activeTab, coachPermissions);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarDesktopExpanded, setSidebarDesktopExpanded] = useState(true);
  const sidebarIconOnlyDefault = activeTab === 'lessons';

  return (
    <div className="flex min-h-screen transition-colors duration-500 dark bg-[#020617] text-slate-100 min-w-0">
      <Sidebar
        activeTab={sidebarTab}
        setActiveTab={handleSidebarTab}
        navCategories={coachNavCategories}
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
            <div className="text-right hidden sm:block">
              <p className="text-xs sm:text-sm font-bold text-amber-400/90 truncate max-w-[140px] lg:max-w-none">{session.fullName}</p>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{session.roleLabel}</p>
            </div>
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black shrink-0 text-sm">
              {session.firstName.charAt(0).toUpperCase()}
            </div>
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
