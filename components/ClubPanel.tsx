import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Users,
  Wallet,
  UserPlus,
  Trash2,
  Phone,
  Mail,
  Menu,
  Search,
  Pencil,
  X,
  User,
  Lock,
  Eye,
  EyeOff,
  Shield,
} from 'lucide-react';
import { useApp } from '../AppContext';
import Sidebar from './Sidebar';
import { clubNavForPermissions, isClubPanelTabAllowed, clubSidebarTabFor, clubPreferredStudentListTab, defaultPermissionsForRole, sanitizeCoachGrantPermissions, permissionSetsEqual, coachPermissionSummary } from '../lib/rolePermissions';
import { CoachPermissionsPicker } from './club/CoachPermissionsPicker';
import { readPanelHash, writePanelHash } from '../lib/panelRouting';
import StudentAdd from './StudentAdd';
import Finance from './Finance';
import Security from './Security';
import RoleManagement from './roles/RoleManagement';
import CorporateStructure from './CorporateStructure';
import Tournaments from './Tournaments';
import ClubProfile from './club/ClubProfile';
import ClubDashboard from './club/ClubDashboard';
import StudentList from './StudentList';
import StudentDetail from './StudentDetail';
import Attendance from './Attendance';
import BranchGroupManagement from './BranchGroupManagement';
import Analysis from './Analysis';
import Gallery from './Gallery';
import Messages from './Messages';
import LeaderboardPage from './leaderboard/LeaderboardPage';
import Homework from './Homework';
import ChessBoard from './ChessBoard';
import StudyPage from './StudyPage';
import LiveLesson from './LiveLesson';
import Curriculum from './Curriculum';
import Inventory from './Inventory';
import ApplicationsAdmin from './ApplicationsAdmin';
import { getClubApplicationSlug } from '../lib/applicationClub';
import { getCoachNamesForStudent } from '../lib/orgScope';
import type { Coach, Student } from '../types';

const inputCls =
  'w-full px-4 py-2.5 rounded-lg text-sm font-medium outline-none bg-slate-900/60 border border-slate-700/60 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50';

interface ClubPanelProps {
  branch: string;
  clubId?: string;
  onLogout: () => void;
}

const ClubPanel: React.FC<ClubPanelProps> = ({ branch, clubId, onLogout }) => {
  const {
    groups,
    scopedTrainingGroups: trainingGroups,
    scopedCoaches: coaches,
    clubs,
    addCoach,
    updateCoach,
    deleteCoach,
    addStudent,
    updateStudent,
    updateClub,
    appRoles,
    rolePermissionMap,
    createAppRole,
    setRolePermissions,
    showToast,
    authPermissions,
    scopedStudents: branchStudents,
    scopedCoaches: branchCoaches,
    scopedTransactions: branchTx,
  } = useApp();

  const defaultClubTab = authPermissions.has('dashboard')
    ? 'dashboard'
    : [...authPermissions][0] || 'dashboard';

  const studentListTab = useMemo(
    () => clubPreferredStudentListTab(authPermissions),
    [authPermissions],
  );
  const studentAddTab = authPermissions.has('student-add') ? 'student-add' : studentListTab;

  const isClubTabAllowed = useCallback(
    (tab: string) => isClubPanelTabAllowed(authPermissions, tab),
    [authPermissions],
  );

  const initialHash = useMemo(() => readPanelHash(), []);
  const safeInitialTab = isClubPanelTabAllowed(authPermissions, initialHash.tab)
    ? initialHash.tab
    : defaultClubTab;

  const [activeTab, setActiveTabRaw] = useState(safeInitialTab);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    initialHash.studentId && isClubPanelTabAllowed(authPermissions, 'student-detail')
      ? initialHash.studentId
      : null,
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const setActiveTab = useCallback(
    (tab: string, studentId?: string | null) => {
      const safe = isClubTabAllowed(tab) ? tab : defaultClubTab;
      setActiveTabRaw(safe);
      if (studentId !== undefined) {
        setSelectedStudentId(studentId);
        writePanelHash(safe, studentId);
        return;
      }
      if (safe !== 'student-detail') setSelectedStudentId(null);
      writePanelHash(safe, null);
    },
    [defaultClubTab, isClubTabAllowed],
  );

  useEffect(() => {
    const onHash = () => {
      const { tab, studentId } = readPanelHash();
      const safe = isClubTabAllowed(tab) ? tab : defaultClubTab;
      setActiveTabRaw(safe);
      if (studentId !== null) setSelectedStudentId(studentId);
      else if (safe !== 'student-detail') setSelectedStudentId(null);
    };
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) writePanelHash(safeInitialTab);
    return () => window.removeEventListener('hashchange', onHash);
  }, [defaultClubTab, isClubTabAllowed, safeInitialTab]);

  useEffect(() => {
    if (!isClubTabAllowed(activeTab)) {
      setActiveTab(defaultClubTab);
    }
  }, [authPermissions, activeTab, defaultClubTab, isClubTabAllowed, setActiveTab]);

  const club = useMemo(
    () => clubs.find((c) => c.id === clubId) ?? clubs.find((c) => (c.name || '').trim() === branch.trim()),
    [clubs, clubId, branch],
  );

  const clubNavCategories = useMemo(
    () => clubNavForPermissions(authPermissions),
    [authPermissions],
  );

  const clubGroupOptions = useMemo(() => {
    const fromTraining = [...new Set(trainingGroups.map((g) => g.name).filter(Boolean))];
    if (fromTraining.length > 0) return fromTraining;
    return groups;
  }, [trainingGroups, groups]);

  const paid = branchStudents.filter((s) => s.paymentStatus === 'Paid').length;
  const unpaid = branchStudents.filter((s) => s.paymentStatus === 'Unpaid').length;
  const partial = branchStudents.filter((s) => s.paymentStatus === 'Partial').length;

  const [studentSearch, setStudentSearch] = useState('');
  const [showCoachModal, setShowCoachModal] = useState(false);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);

  const [coachForm, setCoachForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    permissions: defaultPermissionsForRole('coach'),
  });
  const [showCoachPassword, setShowCoachPassword] = useState(false);
  const [studentForm, setStudentForm] = useState({
    name: '',
    parentName: '',
    parentPhone: '',
    group: '',
    coachId: '',
    birthDate: new Date().toISOString().slice(0, 10),
    level: 'Başlangıç' as Student['level'],
    status: 'active' as NonNullable<Student['status']>,
  });

  const todayIso = () => new Date().toISOString().slice(0, 10);
  const onlyDigits = (v: string) => v.replace(/\D/g, '');

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return branchStudents;
    return branchStudents.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.parentName.toLowerCase().includes(q) ||
        (s.group || '').toLowerCase().includes(q) ||
        (s.parentPhone || '').includes(q),
    );
  }, [branchStudents, studentSearch]);

  const resetCoachForm = () => {
    setCoachForm({
      name: '',
      phone: '',
      email: '',
      password: '',
      permissions: defaultPermissionsForRole('coach'),
    });
    setEditingCoach(null);
    setShowCoachPassword(false);
  };

  const loadCoachPermissions = useCallback(
    (coach: Coach) => {
      const rid = coach.roleId;
      if (rid && rolePermissionMap[rid]?.length) {
        return sanitizeCoachGrantPermissions(rolePermissionMap[rid]);
      }
      return defaultPermissionsForRole('coach');
    },
    [rolePermissionMap],
  );

  const isDedicatedCoachRole = useCallback(
    (roleId?: string) => {
      if (!roleId || roleId === 'role-coach') return false;
      const role = appRoles.find((r) => r.id === roleId);
      return !!role && role.panel === 'coach' && !role.isSystem;
    },
    [appRoles],
  );

  const resetStudentForm = () => {
    setStudentForm({
      name: '',
      parentName: '',
      parentPhone: '',
      group: clubGroupOptions[0] || '',
      coachId: branchCoaches[0]?.id || '',
      birthDate: new Date().toISOString().slice(0, 10),
      level: 'Başlangıç',
      status: 'active',
    });
    setEditingStudent(null);
  };

  const openAddCoach = () => {
    resetCoachForm();
    setShowCoachModal(true);
  };

  const openEditCoach = (coach: Coach) => {
    setEditingCoach(coach);
    setCoachForm({
      name: coach.name,
      phone: coach.phone || '',
      email: coach.email || '',
      password: '',
      permissions: loadCoachPermissions(coach),
    });
    setShowCoachModal(true);
  };

  const resolveCoachRoleId = async (name: string, perms: string[]): Promise<string | undefined> => {
    const defaultPerms = defaultPermissionsForRole('coach');
    if (permissionSetsEqual(perms, defaultPerms)) return undefined;

    const existingId = editingCoach?.roleId;
    if (existingId && isDedicatedCoachRole(existingId)) {
      await setRolePermissions(existingId, perms);
      return existingId;
    }

    const role = createAppRole({
      name: `${name.trim().slice(0, 48)} · ${branch}`,
      panel: 'coach',
      description: `${branch} kulübü antrenör yetkileri`,
      color: '#f59e0b',
      isSystem: false,
    });
    await setRolePermissions(role.id, perms);
    return role.id;
  };

  const handleCoachSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = coachForm.name.trim();
    const email = coachForm.email.trim();
    const password = coachForm.password.trim();
    if (!name) return;
    if (!editingCoach && !password) {
      alert('Yeni antrenör için giriş şifresi zorunludur.');
      return;
    }
    const perms = sanitizeCoachGrantPermissions(coachForm.permissions);
    const roleId = await resolveCoachRoleId(name, perms);

    const payload: Omit<Coach, 'id'> = {
      name,
      branch,
      phone: coachForm.phone.trim() || undefined,
      email: email || undefined,
      roleId,
    };
    if (password) payload.password = password;
    if (editingCoach) {
      updateCoach(editingCoach.id, payload);
      showToast('Antrenör ve yetkiler güncellendi.', 'success');
    } else {
      addCoach(payload);
      showToast('Antrenör eklendi.', 'success');
    }
    resetCoachForm();
    setShowCoachModal(false);
  };

  const openAddStudent = () => {
    resetStudentForm();
    setShowStudentModal(true);
  };

  const openEditStudent = (student: Student) => {
    setEditingStudent(student);
    setStudentForm({
      name: student.name,
      parentName: student.parentName,
      parentPhone: student.parentPhone,
      group: student.group || clubGroupOptions[0] || '',
      coachId: student.coachId || branchCoaches[0]?.id || '',
      birthDate: student.birthDate || todayIso(),
      level: student.level,
      status: student.status || 'active',
    });
    setShowStudentModal(true);
  };

  const handleStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = studentForm.name.trim();
    const parentName = studentForm.parentName.trim() || 'Veli';
    const parentPhone = onlyDigits(studentForm.parentPhone);
    if (!name) return;

    const groupName = studentForm.group || clubGroupOptions[0] || '';
    const tg = trainingGroups.find((g) => g.name === groupName && (g.branchOffice || '').trim() === branch.trim());
    const discipline = tg?.discipline || 'Satranç';
    const coachId = studentForm.coachId.trim() || undefined;

    if (editingStudent) {
      updateStudent(editingStudent.id, {
        name,
        parentName,
        parentPhone: parentPhone || editingStudent.parentPhone,
        group: groupName,
        birthDate: studentForm.birthDate,
        level: studentForm.level,
        status: studentForm.status,
        branchOffice: branch,
        branch: discipline,
        coachId,
        trainingGroupId: tg?.id,
      });
    } else {
      addStudent({
        name,
        level: studentForm.level,
        elo: 0,
        ukd: 0,
        lastAttendance: todayIso(),
        paymentStatus: 'Unpaid',
        group: groupName,
        parentName,
        parentPhone: parentPhone || '',
        birthDate: studentForm.birthDate,
        registrationDate: todayIso(),
        branchOffice: branch,
        branch: discipline,
        status: studentForm.status,
        coachId,
        trainingGroupId: tg?.id,
      });
    }
    resetStudentForm();
    setShowStudentModal(false);
  };

  const handleProfileSave = (patch: { address?: string; activeDays: boolean[] }) => {
    if (!club) return;
    updateClub(club.id, patch);
  };

  const paymentBadge = (status: Student['paymentStatus']) => {
    if (status === 'Paid') return 'bg-emerald-500/20 text-emerald-400';
    if (status === 'Unpaid') return 'bg-rose-500/20 text-rose-400';
    return 'bg-amber-500/20 text-amber-400';
  };

  const paymentLabel = (status: Student['paymentStatus']) => {
    if (status === 'Paid') return 'Ödedi';
    if (status === 'Unpaid') return 'Ödemedi';
    return 'Kısmi';
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <ClubDashboard
            branch={branch}
            club={club}
            students={branchStudents}
            coaches={branchCoaches}
            transactions={branchTx}
            studentListTab={studentListTab}
            studentAddTab={studentAddTab}
            onNavigate={setActiveTab}
            canAccess={isClubTabAllowed}
          />
        );

      case 'profile':
        return (
          <ClubProfile
            club={club}
            branchName={branch}
            coachCount={branchCoaches.length}
            studentCount={branchStudents.length}
            onSave={handleProfileSave}
          />
        );

      case 'coaches':
        return (
          <section className="bg-slate-800/30 border border-white/5 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-slate-300 uppercase tracking-wider">Antrenörler</h2>
                <p className="text-xs text-slate-500 mt-0.5">{branch} kulübüne bağlı personel</p>
              </div>
              <button
                type="button"
                onClick={openAddCoach}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shrink-0"
              >
                <UserPlus className="w-4 h-4" /> Antrenör Ekle
              </button>
            </div>
            <div className="p-4">
              {branchCoaches.length === 0 ? (
                <p className="text-slate-500 text-sm">Henüz antrenör eklenmedi.</p>
              ) : (
                <ul className="space-y-2">
                  {branchCoaches.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 py-3 px-3 rounded-lg bg-slate-900/50 border border-white/5"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">{c.name}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-0.5">
                          {c.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {c.phone}
                            </span>
                          )}
                          {c.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {c.email}
                            </span>
                          )}
                        </div>
                        <p className="flex items-center gap-1 text-[10px] text-amber-400/90 mt-1">
                          <Shield className="w-3 h-3 shrink-0" />
                          {coachPermissionSummary(c.roleId, rolePermissionMap, appRoles)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditCoach(c)}
                          className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-emerald-400 transition-all"
                          title="Düzenle"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`"${c.name}" antrenörünü silmek istiyor musunuz?`)) deleteCoach(c.id);
                          }}
                          className="p-2 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
            <div className="px-5 py-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-slate-300 uppercase tracking-wider">Öğrenciler</h2>
                <p className="text-xs text-slate-500 mt-0.5">{filteredStudents.length} kayıt</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Ara..."
                    className="pl-9 pr-3 py-2 rounded-lg text-sm bg-slate-900/60 border border-slate-700/60 text-white placeholder:text-slate-500 w-full sm:w-48"
                  />
                </div>
                <button
                  type="button"
                  onClick={openAddStudent}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all"
                >
                  <UserPlus className="w-4 h-4" /> Öğrenci Ekle
                </button>
              </div>
            </div>
            <div className="p-4">
              {filteredStudents.length === 0 ? (
                <p className="text-slate-500 text-sm">
                  {branchStudents.length === 0 ? 'Henüz öğrenci eklenmedi.' : 'Arama sonucu bulunamadı.'}
                </p>
              ) : (
                <ul className="space-y-2 max-h-[70vh] overflow-y-auto custom-scrollbar">
                  {filteredStudents.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-slate-900/50 border border-white/5 hover:border-emerald-500/20 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => setDetailStudent(s)}
                        className="min-w-0 text-left flex-1"
                      >
                        <p className="font-bold text-white truncate">{s.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {s.group || 'Grup yok'} · {getCoachNamesForStudent(s, coaches, trainingGroups).join(', ') || 'Antrenör yok'}
                          {s.status === 'inactive' && (
                            <span className="ml-2 text-rose-400 font-bold">Pasif</span>
                          )}
                        </p>
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${paymentBadge(s.paymentStatus)}`}>
                          {paymentLabel(s.paymentStatus)}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEditStudent(s)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-emerald-400"
                          title="Düzenle"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        );

      case 'finance':
        return <Finance />;

      case 'tournaments':
        return <Tournaments role="club" branch={branch} />;

      case 'student-list':
      case 'bulk-actions':
        return (
          <StudentList
            onAddNew={() => {
              if (isClubTabAllowed('student-add')) setActiveTab('student-add');
            }}
            onViewDetail={(id) => {
              setActiveTab('student-detail', id);
            }}
          />
        );

      case 'student-add':
        return (
          <StudentAdd
            defaultBranchOffice={branch}
            lockBranchOffice
            onCancel={() => setActiveTab(studentListTab)}
            onSaved={() => setActiveTab(studentListTab)}
          />
        );

      case 'student-detail': {
        const canView = !selectedStudentId || branchStudents.some((s) => s.id === selectedStudentId);
        if (!canView) {
          return (
            <div className="p-8 text-center text-slate-400">
              <p className="font-medium">Bu öğrenciye erişim yetkiniz yok.</p>
              <button
                type="button"
                onClick={() => setActiveTab(studentListTab)}
                className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold"
              >
                Listeye dön
              </button>
            </div>
          );
        }
        return (
          <StudentDetail
            studentId={selectedStudentId}
            onBack={() => setActiveTab(studentListTab)}
            onNavigate={(tab) => setActiveTab(isClubTabAllowed(tab) ? tab : defaultClubTab)}
          />
        );
      }

      case 'qr-attendance':
      case 'attendance':
        return <Attendance />;
      case 'groups':
        return <BranchGroupManagement />;
      case 'applications':
        return (
          <ApplicationsAdmin
            clubId={club?.id}
            clubName={club?.name ?? branch}
            clubSlug={club ? getClubApplicationSlug(club) : undefined}
          />
        );
      case 'corporate':
        return <CorporateStructure />;
      case 'analysis':
        return <Analysis />;
      case 'gallery':
        return <Gallery />;
      case 'messages':
        return <Messages />;
      case 'leaderboard':
        return <LeaderboardPage />;
      case 'homework':
        return <Homework />;
      case 'puzzles':
        return <ChessBoard />;
      case 'study':
        return <StudyPage />;
      case 'lessons':
        return <LiveLesson />;
      case 'curriculum':
        return <Curriculum />;
      case 'inventory':
        return <Inventory />;
      case 'security':
        return <Security />;
      case 'roles':
        return <RoleManagement />;

      default:
        return null;
    }
  };

  const sidebarTab = clubSidebarTabFor(activeTab, authPermissions);

  return (
    <div className="flex min-h-screen transition-colors duration-500 dark bg-[#020617] text-slate-100 min-w-0">
      <Sidebar
        activeTab={sidebarTab}
        setActiveTab={setActiveTab}
        navCategories={clubNavCategories}
        onLogout={onLogout}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="flex-1 min-w-0 ml-0 lg:ml-64 min-h-screen flex flex-col relative overflow-x-hidden">
        <div className="absolute inset-0 atmospheric-bg pointer-events-none" />
        <header className="relative z-10 h-14 sm:h-16 lg:h-20 px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30 bg-[#020617]/40 backdrop-blur-xl border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg lg:hidden hover:bg-slate-800 text-slate-300 shrink-0"
              aria-label="Menüyü aç"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-black text-white truncate">Kulüp Paneli</h1>
                <p className="text-xs text-emerald-400/90 font-bold truncate">{branch}</p>
              </div>
            </div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black text-sm shrink-0">
            K
          </div>
        </header>
        <div className="relative z-10 p-4 sm:p-6 lg:p-8  mx-auto w-full min-w-0 flex-1">
          {renderContent()}
        </div>
      </main>

      {/* Antrenör modal */}
      {showCoachModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => {
            setShowCoachModal(false);
            resetCoachForm();
          }}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-white">
                  {editingCoach ? 'Antrenör Düzenle' : 'Antrenör Ekle'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{branch}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCoachModal(false);
                  resetCoachForm();
                }}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCoachSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Ad Soyad *
                </label>
                <input
                  type="text"
                  value={coachForm.name}
                  onChange={(e) => setCoachForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Telefon
                </label>
                <input
                  type="tel"
                  value={coachForm.phone}
                  onChange={(e) => setCoachForm((f) => ({ ...f, phone: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  E-posta
                </label>
                <input
                  type="email"
                  value={coachForm.email}
                  onChange={(e) => setCoachForm((f) => ({ ...f, email: e.target.value }))}
                  className={inputCls}
                  placeholder="Giriş için kullanılır"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Giriş Şifresi {editingCoach ? '' : '*'}
                </label>
                <div className="relative">
                  <input
                    type={showCoachPassword ? 'text' : 'password'}
                    value={coachForm.password}
                    onChange={(e) => setCoachForm((f) => ({ ...f, password: e.target.value }))}
                    className={`${inputCls} pr-10`}
                    placeholder={editingCoach ? 'Değiştirmek için yeni şifre' : 'Antrenör paneli şifresi'}
                    required={!editingCoach}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCoachPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showCoachPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Antrenör girişinde e-posta/ad + bu şifre kullanılır
                </p>
              </div>
              <CoachPermissionsPicker
                value={coachForm.permissions}
                onChange={(permissions) => setCoachForm((f) => ({ ...f, permissions }))}
              />
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCoachModal(false);
                    resetCoachForm();
                  }}
                  className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm"
                >
                  İptal
                </button>
                <button type="submit" className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">
                  {editingCoach ? 'Kaydet' : 'Ekle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Öğrenci modal */}
      {showStudentModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => {
            setShowStudentModal(false);
            resetStudentForm();
          }}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between sticky top-0 bg-slate-900">
              <div>
                <h3 className="text-lg font-black text-white">
                  {editingStudent ? 'Öğrenci Düzenle' : 'Öğrenci Ekle'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{branch}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowStudentModal(false);
                  resetStudentForm();
                }}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleStudentSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Öğrenci Ad Soyad *
                </label>
                <input
                  type="text"
                  value={studentForm.name}
                  onChange={(e) => setStudentForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Veli Adı
                </label>
                <input
                  type="text"
                  value={studentForm.parentName}
                  onChange={(e) => setStudentForm((f) => ({ ...f, parentName: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Veli Telefonu *
                </label>
                <input
                  type="tel"
                  value={studentForm.parentPhone}
                  onChange={(e) => setStudentForm((f) => ({ ...f, parentPhone: e.target.value }))}
                  className={inputCls}
                  required={!editingStudent}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Grup
                </label>
                <select
                  value={studentForm.group}
                  onChange={(e) => setStudentForm((f) => ({ ...f, group: e.target.value }))}
                  className={inputCls}
                >
                  {clubGroupOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Antrenör *
                </label>
                <select
                  value={studentForm.coachId}
                  onChange={(e) => setStudentForm((f) => ({ ...f, coachId: e.target.value }))}
                  className={inputCls}
                  required
                >
                  {branchCoaches.length === 0 ? (
                    <option value="">Önce antrenör ekleyin</option>
                  ) : (
                    branchCoaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Seviye
                  </label>
                  <select
                    value={studentForm.level}
                    onChange={(e) =>
                      setStudentForm((f) => ({ ...f, level: e.target.value as Student['level'] }))
                    }
                    className={inputCls}
                  >
                    <option value="Başlangıç">Başlangıç</option>
                    <option value="Orta">Orta</option>
                    <option value="İleri">İleri</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Durum
                  </label>
                  <select
                    value={studentForm.status}
                    onChange={(e) =>
                      setStudentForm((f) => ({
                        ...f,
                        status: e.target.value as NonNullable<Student['status']>,
                      }))
                    }
                    className={inputCls}
                  >
                    <option value="active">Aktif</option>
                    <option value="inactive">Pasif</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Doğum Tarihi
                </label>
                <input
                  type="date"
                  value={studentForm.birthDate}
                  onChange={(e) => setStudentForm((f) => ({ ...f, birthDate: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowStudentModal(false);
                    resetStudentForm();
                  }}
                  className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm"
                >
                  İptal
                </button>
                <button type="submit" className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">
                  {editingStudent ? 'Kaydet' : 'Ekle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Öğrenci detay */}
      {detailStudent && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setDetailStudent(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-black text-white">{detailStudent.name}</h3>
              <button
                type="button"
                onClick={() => setDetailStudent(null)}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Grup</span>
                <span className="text-slate-200 font-medium">{detailStudent.group || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Seviye</span>
                <span className="text-slate-200 font-medium">{detailStudent.level}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Veli</span>
                <span className="text-slate-200 font-medium">{detailStudent.parentName}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Telefon</span>
                <span className="text-slate-200 font-medium">{detailStudent.parentPhone || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">UKD / ELO</span>
                <span className="text-slate-200 font-medium">
                  {detailStudent.ukd} / {detailStudent.elo}
                </span>
              </div>
              <div className="flex justify-between gap-4 items-center">
                <span className="text-slate-500">Ödeme</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${paymentBadge(detailStudent.paymentStatus)}`}>
                  {paymentLabel(detailStudent.paymentStatus)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Kayıt</span>
                <span className="text-slate-200 font-medium">{detailStudent.registrationDate}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetailStudent(null);
                  openEditStudent(detailStudent);
                }}
                className="w-full mt-2 py-2.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 font-bold text-sm hover:bg-emerald-600/30"
              >
                Düzenle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClubPanel;
