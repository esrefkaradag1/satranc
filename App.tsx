
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
import WhatsAppManagement from './components/WhatsAppManagement';
import Security from './components/Security';
import Inventory from './components/Inventory';
import StudyPage from './components/StudyPage';
import Tournaments from './components/Tournaments';
import { Menu, Search, Bell, LayoutDashboard, User } from 'lucide-react';
import { AppProvider, useApp } from './AppContext';
import AdminClubSwitcher from './components/admin/AdminClubSwitcher';
import { COACH_NAV_CATEGORIES, NAV_CATEGORIES, type NavCategory } from './constants';
import ClubPanel from './components/ClubPanel';
import ApplicationForm from './components/ApplicationForm';
import ParentConsentForm from './components/ParentConsentForm';
import ApplicationsAdmin from './components/ApplicationsAdmin';
import LeaderboardPage from './components/leaderboard/LeaderboardPage';
import CoachProfilePage from './components/profile/CoachProfilePage';
import AdminProfilePage from './components/profile/AdminProfilePage';
import RoleManagement from './components/roles/RoleManagement';
import AccountDropdown, { type AccountDropdownItem } from './components/ui/AccountDropdown';
import { getSessionDisplay } from './lib/sessionDisplayName';
import { loadAdminProfile } from './lib/adminProfile';
import { filterNavByPermissions, coachNavForPermissions, isCoachPanelTabAllowed, coachSidebarTabFor } from './lib/rolePermissions';
import { readPanelHash, writePanelHash, isAdminLoginRoute, getPublicLoginRoute, type PublicLoginTab } from './lib/panelRouting';
import MainSiteEditor from './components/admin/MainSiteEditor';
import MainPublicSite from './components/public/MainPublicSite';
import { getClubApplicationSlug } from './lib/applicationClub';

// ─── Türkçe slug haritası (lib/panelRouting.ts) ───────────────────────────────
import { readPanelHash as readHash, writePanelHash as writeHash } from './lib/panelRouting';

/** Tahta / çalışma gibi tam genişlik modüller — mobilde yan padding taşmayı önler */
const FULL_BLEED_TABS = new Set(['study', 'lessons']);

function getPublicFormRoute():
  | { route: 'basvuru'; clubSlug?: string }
  | { route: 'veli-imza' }
  | null {
  if (getVeliImzaToken()) return { route: 'veli-imza' };
  const parts = window.location.hash.replace(/^#\/?/, '').split('/');
  const head = parts[0];
  if (head === 'basvuru') {
    const slug = parts[1] ? decodeURIComponent(parts[1]).trim().toLowerCase() : undefined;
    return { route: 'basvuru', clubSlug: slug || undefined };
  }
  return null;
}

function getVeliImzaToken(): string | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('veli-imza')?.trim();
    if (fromQuery) return fromQuery;
  } catch {
    /* ignore */
  }
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
  const { auth, logout, students, apiStudent } = useApp();
  const [publicForm, setPublicForm] = useState(() => getPublicFormRoute());
  const [adminLoginRoute, setAdminLoginRoute] = useState(() => isAdminLoginRoute());
  const [publicLogin, setPublicLogin] = useState(() => getPublicLoginRoute());
  const [passiveBlocked, setPassiveBlocked] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    const onHash = () => {
      setPublicForm(getPublicFormRoute());
      setAdminLoginRoute(isAdminLoginRoute());
      setPublicLogin(getPublicLoginRoute());
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  useEffect(() => {
    if (!auth || (auth.role !== 'student' && auth.role !== 'parent')) {
      setPassiveBlocked(false);
      return;
    }
    const sid = auth.studentId;
    const fromList = students.find((s) => s.id === sid);
    const current = fromList ?? (apiStudent?.id === sid ? apiStudent : null);
    if (current?.status === 'inactive') {
      setPassiveBlocked(true);
      logout();
    }
  }, [auth, students, apiStudent, logout]);

  if (publicForm?.route === 'basvuru') return <ApplicationForm clubSlug={publicForm.clubSlug} />;
  if (publicForm?.route === 'veli-imza') {
    const token = getVeliImzaToken();
    if (token) return <ParentConsentForm token={token} />;
  }
  if (!auth) {
    const wantsLogin = adminLoginRoute || publicLogin !== null;
    if (!wantsLogin) {
      return (
        <>
          {passiveBlocked ? (
            <div className="fixed top-4 left-1/2 z-[200] -translate-x-1/2 max-w-md w-[calc(100%-2rem)] rounded-xl border border-amber-500/40 bg-amber-950/95 px-4 py-3 text-center text-sm font-bold text-amber-100 shadow-xl">
              Hesabınız pasiftir. Sisteme giriş yapamazsınız.
            </div>
          ) : null}
          <MainPublicSite />
        </>
      );
    }
    const loginTab = (publicLogin?.tab ?? undefined) as PublicLoginTab | undefined;
    return (
      <>
        {passiveBlocked ? (
          <div className="fixed top-4 left-1/2 z-[200] -translate-x-1/2 max-w-md w-[calc(100%-2rem)] rounded-xl border border-amber-500/40 bg-amber-950/95 px-4 py-3 text-center text-sm font-bold text-amber-100 shadow-xl">
            Hesabınız pasiftir. Sisteme giriş yapamazsınız.
          </div>
        ) : null}
        <Login adminOnly={adminLoginRoute} initialTab={loginTab} />
      </>
    );
  }
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
  const adminProfile = useMemo(() => loadAdminProfile(), [profileTick]);
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
      case 'main-site':
        return <MainSiteEditor />;
      case 'messages':
        return <Messages />;
      case 'whatsapp':
        return <WhatsAppManagement />;
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
  const adminAccountMenuItems: AccountDropdownItem[] = [
    {
      id: 'dashboard',
      label: 'Yönetim paneli',
      icon: <LayoutDashboard className="w-5 h-5" />,
      onClick: () => handleSidebarTab('dashboard'),
    },
    {
      id: 'profile',
      label: 'Profilim',
      icon: <User className="w-5 h-5" />,
      onClick: () => setActiveTab('profile', null),
    },
  ];

  return (
    <div className="app-ui-scale flex min-h-screen transition-colors duration-500 dark bg-[#020617] text-slate-100 min-w-0">
        <Sidebar
          activeTab={sidebarTab}
          setActiveTab={handleSidebarTab}
          navCategories={adminNavCategories}
          onLogout={onLogout}
          footerProfile={{
            name: session.fullName,
            subtitle: session.roleLabel,
            photoUrl: adminProfile.photoUrl,
            menuItems: adminAccountMenuItems,
          }}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          defaultIconOnly={sidebarIconOnlyDefault}
          onDesktopExpandedChange={setSidebarDesktopExpanded}
        />

        <main className={`flex-1 min-w-0 ml-0 min-h-screen flex flex-col relative overflow-x-hidden transition-[margin] duration-300 ${sidebarDesktopExpanded ? 'lg:ml-64' : 'lg:ml-[4.5rem]'}`}>
          <div className="absolute inset-0 atmospheric-bg pointer-events-none" />

          <header className="h-14 sm:h-16 lg:h-16 px-3 sm:px-5 lg:px-6 flex items-center justify-between sticky top-0 z-30 transition-all duration-300 bg-[#070b14]/75 backdrop-blur-2xl border-b border-white/[0.08] shrink-0">
            <div className="flex items-center gap-3 sm:gap-6 min-w-0">
              <button type="button" onClick={() => setSidebarOpen(true)} className="p-2.5 rounded-xl lg:hidden hover:bg-white/10 text-slate-300 transition-colors" aria-label="Menüyü aç">
                <Menu className="w-5 h-5" />
              </button>
              <div className="hidden md:flex items-center rounded-xl px-3.5 py-2 border transition-all bg-slate-900/60 border-white/10 focus-within:border-indigo-500/60 focus-within:shadow-[0_0_15px_rgba(99,102,241,0.2)] flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
                <input
                  type="text"
                  placeholder="Hızlı arama yapın..."
                  className="bg-transparent border-none outline-none text-xs font-medium w-full min-w-0 text-slate-200 placeholder:text-slate-500"
                />
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold text-slate-400 bg-white/[0.06] border border-white/10 rounded-md shrink-0">⌘K</kbd>
              </div>
            </div>

            <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
              <AdminClubSwitcher />
              <button type="button" className="relative p-2.5 rounded-xl transition-all text-slate-400 hover:text-white hover:bg-white/[0.06] active:scale-95">
                <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_8px_#6366f1]" />
              </button>
              <div className="h-6 w-px bg-white/10 hidden sm:block" />
              <AccountDropdown
                name={session.fullName}
                subtitle={session.roleLabel}
                photoUrl={adminProfile.photoUrl}
                initials={session.firstName.charAt(0).toUpperCase()}
                items={adminAccountMenuItems}
                onLogout={onLogout}
                accent="indigo"
              />
            </div>
          </header>

          <div
            className={
              FULL_BLEED_TABS.has(activeTab)
                ? 'flex-1 min-h-0 flex flex-col p-0 overflow-hidden relative z-10 w-full'
                : 'p-3 sm:p-5 lg:p-6 mx-auto w-full min-w-0 relative z-10 flex-1'
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
  const coachProfile = useMemo(
    () =>
      auth?.role === 'coach'
        ? (auth.coachId ? coaches.find((coach) => coach.id === auth.coachId) : undefined) ??
          coaches.find((coach) => (coach.branch || '').trim() === (auth.branch || '').trim())
        : undefined,
    [auth, coaches],
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
        return isCoachTabAllowed('finance') ? <Finance /> : <Dashboard />;
      case 'inventory':
        return <Inventory />;
      case 'gallery':
        return <Gallery />;
      case 'messages':
        return <Messages />;
      case 'whatsapp':
        return <WhatsAppManagement />;
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
  const coachAccountMenuItems: AccountDropdownItem[] = [
    {
      id: 'dashboard',
      label: 'Antrenör paneli',
      icon: <LayoutDashboard className="w-5 h-5" />,
      onClick: () => handleSidebarTab(defaultCoachTab),
    },
    {
      id: 'profile',
      label: 'Profilim',
      icon: <User className="w-5 h-5" />,
      onClick: () => setActiveTab('profile', null),
    },
  ];

  return (
    <div className="app-ui-scale flex min-h-screen transition-colors duration-500 dark bg-[#020617] text-slate-100 min-w-0">
      <Sidebar
        activeTab={sidebarTab}
        setActiveTab={handleSidebarTab}
        navCategories={coachNavCategories}
        onLogout={onLogout}
        footerProfile={{
          name: session.fullName,
          subtitle: coachProfile?.title || session.roleLabel,
          photoUrl: coachProfile?.photoUrl,
          menuItems: coachAccountMenuItems,
        }}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        defaultIconOnly={sidebarIconOnlyDefault}
        onDesktopExpandedChange={setSidebarDesktopExpanded}
      />
      <main className={`flex-1 min-w-0 ml-0 min-h-screen flex flex-col relative overflow-x-hidden transition-[margin] duration-300 ${sidebarDesktopExpanded ? 'lg:ml-64' : 'lg:ml-[4.5rem]'}`}>
        <div className="absolute inset-0 atmospheric-bg pointer-events-none" />
        <header className="h-14 sm:h-16 lg:h-16 px-3 sm:px-5 lg:px-6 flex items-center justify-between sticky top-0 z-30 transition-all duration-300 bg-[#070b14]/75 backdrop-blur-2xl border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <button type="button" onClick={() => setSidebarOpen(true)} className="p-2.5 rounded-xl lg:hidden hover:bg-white/10 text-slate-300 transition-colors" aria-label="Menüyü aç"><Menu className="w-5 h-5" /></button>
            <div className="hidden md:flex items-center rounded-xl px-3.5 py-2 border transition-all bg-slate-900/60 border-white/10 focus-within:border-indigo-500/60 focus-within:shadow-[0_0_15px_rgba(99,102,241,0.2)] flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
              <input type="text" placeholder="Hızlı arama yapın..." className="bg-transparent border-none outline-none text-xs font-medium w-full min-w-0 text-slate-200 placeholder:text-slate-500" />
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold text-slate-400 bg-white/[0.06] border border-white/10 rounded-md shrink-0">⌘K</kbd>
            </div>
          </div>
          <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
            <AccountDropdown
              name={session.fullName}
              subtitle={coachProfile?.title || session.roleLabel}
              photoUrl={coachProfile?.photoUrl}
              initials={session.firstName.charAt(0).toUpperCase()}
              items={coachAccountMenuItems}
              onLogout={onLogout}
              accent="amber"
            />
          </div>
        </header>
        <div
          className={
            FULL_BLEED_TABS.has(activeTab)
              ? 'flex-1 min-h-0 flex flex-col p-0 overflow-hidden relative z-10 w-full'
              : 'p-3 sm:p-5 lg:p-6 mx-auto w-full min-w-0 relative z-10 flex-1'
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
