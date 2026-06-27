
import React from 'react';
import { 
  LayoutDashboard, Users, FileText, CheckSquare, BarChart3, 
  Wallet, MessageCircle, Video, Image, ExternalLink, Trophy,
  CalendarCheck, BookOpen, ShieldCheck, Box, CalendarDays, Grid, CreditCard, User, Building2,
  GraduationCap, TrendingUp, MessageSquare, BookMarked, UserCog
} from 'lucide-react';

/** Menü öğesi ikon kutusu rengi: Tailwind sınıfı (bg-* veya gradient) */
export type NavIconColor =
  | 'blue'
  | 'violet'
  | 'violet-pink'
  | 'emerald'
  | 'amber'
  | 'blue-violet'
  | 'teal'
  | 'rose'
  | 'indigo';

/** Tek menü öğesi (alt menü olabilir) */
export type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** İkon kutusu rengi (renkli sidebar) */
  iconColor?: NavIconColor;
  subItems?: { id: string; label: string }[];
};

/** Eski düz liste (geri uyumluluk) */
export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Anasayfa', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'corporate', label: 'Kurumsal Yapı', icon: <Building2 className="w-5 h-5" /> },
  { id: 'students', label: 'Öğrenci İşlemleri', icon: <Users className="w-5 h-5" />, subItems: [
    { id: 'student-add', label: 'Öğrenci Ekle' },
    { id: 'student-list', label: 'Öğrenci Listesi' },
    { id: 'attendance', label: 'Yoklama Al' },
    { id: 'groups', label: 'Branş & Grup' },
    { id: 'bulk-actions', label: 'Toplu İşlemler' },
    { id: 'applications', label: 'Başvurular' },
  ]},
  { id: 'puzzles', label: 'Bulmaca Yönetimi', icon: <FileText className="w-5 h-5" /> },
  { id: 'homework', label: 'Ödev Yönetimi', icon: <CheckSquare className="w-5 h-5" /> },
  { id: 'leaderboard', label: 'Lider Tablosu', icon: <Trophy className="w-5 h-5" /> },
  { id: 'analysis', label: 'Analiz & Performans', icon: <BarChart3 className="w-5 h-5" /> },
  { id: 'finance', label: 'Kasa & Finans', icon: <Wallet className="w-5 h-5" /> },
  { id: 'inventory', label: 'Depo & Envanter', icon: <Box className="w-5 h-5" /> },
  { id: 'gallery', label: 'Galeri İşlemleri', icon: <Image className="w-5 h-5" /> },
  { id: 'lessons', label: 'Canlı Ders & Video', icon: <Video className="w-5 h-5" /> },
  { id: 'curriculum', label: 'Ders Programı & Müfredat', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'messages', label: 'Site İçi Mesajlar', icon: <MessageCircle className="w-5 h-5" /> },
  { id: 'security', label: 'Kullanıcı & Güvenlik', icon: <ShieldCheck className="w-5 h-5" /> },
];

/** Kategorize edilmiş menü (sidebar’da bölüm başlıklarıyla) */
export type NavCategory = { title: string; icon?: React.ReactNode; items: NavItem[] };

export const NAV_CATEGORIES: NavCategory[] = [
  {
    title: 'Genel',
    icon: <LayoutDashboard className="w-4 h-4" />,
    items: [
      { id: 'dashboard', label: 'Anasayfa', icon: <LayoutDashboard className="w-5 h-5" />, iconColor: 'blue' },
    ],
  },
  {
    title: 'Öğrenci İşleri',
    icon: <Users className="w-4 h-4" />,
    items: [
      { id: 'student-list', label: 'Öğrenci Listesi', icon: <Users className="w-5 h-5" />, iconColor: 'violet-pink' },
      { id: 'student-add', label: 'Öğrenci Ekle', icon: <User className="w-5 h-5" />, iconColor: 'violet' },
      { id: 'attendance', label: 'Yoklama Al', icon: <CalendarCheck className="w-5 h-5" />, iconColor: 'emerald' },
      { id: 'groups', label: 'Branş & Grup', icon: <Building2 className="w-5 h-5" />, iconColor: 'violet' },
      { id: 'bulk-actions', label: 'Toplu İşlemler', icon: <Grid className="w-5 h-5" />, iconColor: 'teal' },
      { id: 'applications', label: 'Başvurular', icon: <FileText className="w-5 h-5" />, iconColor: 'amber' },
    ],
  },
  {
    title: 'Kurumsal Yapı',
    icon: <Building2 className="w-4 h-4" />,
    items: [
      { id: 'corporate', label: 'Kurumsal Yapı', icon: <Building2 className="w-5 h-5" />, iconColor: 'violet' },
    ],
  },
  {
    title: 'Turnuvalar',
    icon: <Trophy className="w-4 h-4" />,
    items: [
      { id: 'tournaments', label: 'Turnuvalar', icon: <Trophy className="w-5 h-5" />, iconColor: 'indigo' },
    ],
  },
  {
    title: 'Kasa Operasyon',
    icon: <Wallet className="w-4 h-4" />,
    items: [
      { id: 'finance', label: 'Kasa & Finans', icon: <Wallet className="w-5 h-5" />, iconColor: 'emerald' },
      { id: 'inventory', label: 'Depo & Envanter', icon: <Box className="w-5 h-5" />, iconColor: 'amber' },
    ],
  },
  {
    title: 'Medya & İletişim',
    icon: <MessageSquare className="w-4 h-4" />,
    items: [
      { id: 'gallery', label: 'Galeri İşlemleri', icon: <Image className="w-5 h-5" />, iconColor: 'rose' },
      { id: 'messages', label: 'Site İçi Mesajlar', icon: <MessageCircle className="w-5 h-5" />, iconColor: 'emerald' },
    ],
  },
  {
    title: 'Sistem',
    icon: <ShieldCheck className="w-4 h-4" />,
    items: [
      { id: 'security', label: 'Kullanıcı & Güvenlik', icon: <ShieldCheck className="w-5 h-5" />, iconColor: 'violet' },
      { id: 'roles', label: 'Rol Yönetimi', icon: <UserCog className="w-5 h-5" />, iconColor: 'indigo' },
    ],
  },
  {
    title: 'Raporlama',
    icon: <TrendingUp className="w-4 h-4" />,
    items: [
      { id: 'leaderboard', label: 'Lider Tablosu', icon: <Trophy className="w-5 h-5" />, iconColor: 'amber' },
      { id: 'analysis', label: 'Analiz & Performans', icon: <BarChart3 className="w-5 h-5" />, iconColor: 'blue-violet' },
    ],
  },
  {
    title: 'Hesap',
    icon: <User className="w-4 h-4" />,
    items: [
      { id: 'profile', label: 'Profil', icon: <User className="w-5 h-5" />, iconColor: 'indigo' },
    ],
  },
];

/** Antrenör paneli menü öğeleri (admin gibi renkli ikonlu) */
export const COACH_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Anasayfa', icon: <LayoutDashboard className="w-5 h-5" />, iconColor: 'blue' },
  { id: 'student-list', label: 'Öğrenci Listesi', icon: <Users className="w-5 h-5" />, iconColor: 'violet-pink' },
  { id: 'attendance', label: 'Yoklama Al', icon: <CalendarCheck className="w-5 h-5" />, iconColor: 'emerald' },
  { id: 'groups', label: 'Branş & Grup', icon: <Building2 className="w-5 h-5" />, iconColor: 'violet' },
  { id: 'lessons', label: 'Canlı Ders', icon: <Video className="w-5 h-5" />, iconColor: 'violet' },
  { id: 'puzzles', label: 'Bulmaca Yönetimi', icon: <FileText className="w-5 h-5" />, iconColor: 'amber' },
  { id: 'study', label: 'Çalışma', icon: <BookMarked className="w-5 h-5" />, iconColor: 'teal' },
  { id: 'homework', label: 'Ödev Yönetimi', icon: <CheckSquare className="w-5 h-5" />, iconColor: 'teal' },
  { id: 'curriculum', label: 'Ders Programı & Müfredat', icon: <BookOpen className="w-5 h-5" />, iconColor: 'indigo' },
  { id: 'gallery', label: 'Galeri İşlemleri', icon: <Image className="w-5 h-5" />, iconColor: 'rose' },
  { id: 'messages', label: 'Site İçi Mesajlar', icon: <MessageCircle className="w-5 h-5" />, iconColor: 'emerald' },
  { id: 'leaderboard', label: 'Lider Tablosu', icon: <Trophy className="w-5 h-5" />, iconColor: 'amber' },
  { id: 'analysis', label: 'Analiz & Performans', icon: <BarChart3 className="w-5 h-5" />, iconColor: 'rose' },
];

/** Antrenör paneli — kategorize ve renkli ikonlu menü */
export const COACH_NAV_CATEGORIES: NavCategory[] = [
  {
    title: 'Genel',
    icon: <LayoutDashboard className="w-4 h-4" />,
    items: [
      { id: 'dashboard', label: 'Anasayfa', icon: <LayoutDashboard className="w-5 h-5" />, iconColor: 'blue' },
    ],
  },
  {
    title: 'Öğrenci İşleri',
    icon: <Users className="w-4 h-4" />,
    items: [
      { id: 'student-list', label: 'Öğrenci Listesi', icon: <Users className="w-5 h-5" />, iconColor: 'violet-pink' },
      { id: 'attendance', label: 'Yoklama Al', icon: <CalendarCheck className="w-5 h-5" />, iconColor: 'emerald' },
      { id: 'groups', label: 'Branş & Grup', icon: <Building2 className="w-5 h-5" />, iconColor: 'violet' },
    ],
  },
  {
    title: 'Eğitim & İçerik',
    icon: <GraduationCap className="w-4 h-4" />,
    items: [
      { id: 'lessons', label: 'Canlı Ders', icon: <Video className="w-5 h-5" />, iconColor: 'violet' },
      { id: 'puzzles', label: 'Bulmaca Yönetimi', icon: <FileText className="w-5 h-5" />, iconColor: 'amber' },
      { id: 'study', label: 'Çalışma', icon: <BookMarked className="w-5 h-5" />, iconColor: 'teal' },
      { id: 'homework', label: 'Ödev Yönetimi', icon: <CheckSquare className="w-5 h-5" />, iconColor: 'teal' },
      { id: 'curriculum', label: 'Ders Programı & Müfredat', icon: <BookOpen className="w-5 h-5" />, iconColor: 'indigo' },
    ],
  },
  {
    title: 'Medya & İletişim',
    icon: <MessageSquare className="w-4 h-4" />,
    items: [
      { id: 'gallery', label: 'Galeri İşlemleri', icon: <Image className="w-5 h-5" />, iconColor: 'rose' },
      { id: 'messages', label: 'Site İçi Mesajlar', icon: <MessageCircle className="w-5 h-5" />, iconColor: 'emerald' },
    ],
  },
  {
    title: 'Raporlama',
    icon: <TrendingUp className="w-4 h-4" />,
    items: [
      { id: 'leaderboard', label: 'Lider Tablosu', icon: <Trophy className="w-5 h-5" />, iconColor: 'amber' },
      { id: 'analysis', label: 'Analiz & Performans', icon: <BarChart3 className="w-5 h-5" />, iconColor: 'rose' },
    ],
  },
  {
    title: 'Hesap',
    icon: <User className="w-4 h-4" />,
    items: [
      { id: 'profile', label: 'Profil', icon: <User className="w-5 h-5" />, iconColor: 'indigo' },
    ],
  },
];

/** Kulüp paneli menü öğeleri (geri uyumluluk) */
export const CLUB_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Anasayfa', icon: <LayoutDashboard className="w-5 h-5" />, iconColor: 'blue' },
  { id: 'profile', label: 'Kulüp Bilgileri', icon: <Building2 className="w-5 h-5" />, iconColor: 'violet' },
  { id: 'coaches', label: 'Antrenörler', icon: <Users className="w-5 h-5" />, iconColor: 'teal' },
  { id: 'students', label: 'Öğrenciler', icon: <Users className="w-5 h-5" />, iconColor: 'violet-pink' },
  { id: 'tournaments', label: 'Turnuvalar', icon: <Trophy className="w-5 h-5" />, iconColor: 'indigo' },
  { id: 'finance', label: 'Kasa Özeti', icon: <Wallet className="w-5 h-5" />, iconColor: 'emerald' },
];

/** Kulüp paneli — kategorize menü */
export const CLUB_NAV_CATEGORIES: NavCategory[] = [
  {
    title: 'Genel',
    icon: <LayoutDashboard className="w-4 h-4" />,
    items: [
      { id: 'dashboard', label: 'Anasayfa', icon: <LayoutDashboard className="w-5 h-5" />, iconColor: 'blue' },
    ],
  },
  {
    title: 'Kulüp Bilgileri',
    icon: <Building2 className="w-4 h-4" />,
    items: [
      { id: 'profile', label: 'Profil & Ayarlar', icon: <Building2 className="w-5 h-5" />, iconColor: 'violet' },
    ],
  },
  {
    title: 'Personel',
    icon: <Users className="w-4 h-4" />,
    items: [
      { id: 'coaches', label: 'Antrenörler', icon: <Users className="w-5 h-5" />, iconColor: 'teal' },
    ],
  },
  {
    title: 'Öğrenci İşleri',
    icon: <GraduationCap className="w-4 h-4" />,
    items: [
      { id: 'students', label: 'Öğrenci Listesi', icon: <Users className="w-5 h-5" />, iconColor: 'violet-pink' },
      { id: 'groups', label: 'Branş & Grup', icon: <Building2 className="w-5 h-5" />, iconColor: 'violet' },
    ],
  },
  {
    title: 'Turnuvalar',
    icon: <Trophy className="w-4 h-4" />,
    items: [
      { id: 'tournaments', label: 'Turnuvalar', icon: <Trophy className="w-5 h-5" />, iconColor: 'indigo' },
    ],
  },
  {
    title: 'Finans',
    icon: <Wallet className="w-4 h-4" />,
    items: [
      { id: 'finance', label: 'Kasa Özeti', icon: <Wallet className="w-5 h-5" />, iconColor: 'emerald' },
    ],
  },
];

/** Öğrenci / Veli paneli menü öğeleri (sidebar) — düz liste, geri uyumluluk */
export const STUDENT_NAV_ITEMS: NavItem[] = [
  { id: 'summary', label: 'Özet', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'leaderboard', label: 'Lider Tablosu', icon: <Trophy className="w-5 h-5" /> },
  { id: 'gallery', label: 'Medya & Galeri', icon: <Image className="w-5 h-5" /> },
  { id: 'schedule', label: 'Ders Programı', icon: <CalendarDays className="w-5 h-5" /> },
  { id: 'live-lesson', label: 'Canlı Derse Katıl', icon: <Video className="w-5 h-5" /> },
  { id: 'puzzles', label: 'Bulmaca', icon: <Grid className="w-5 h-5" /> },
  { id: 'attendance', label: 'Devam', icon: <CalendarCheck className="w-5 h-5" /> },
  { id: 'messages', label: 'Mesajlar', icon: <MessageCircle className="w-5 h-5" /> },
  { id: 'profile', label: 'Profil', icon: <User className="w-5 h-5" /> },
];

/** Öğrenci / Veli paneli — kategorize ve renkli ikonlu menü (admin gibi) */
export const STUDENT_NAV_CATEGORIES: NavCategory[] = [
  {
    title: 'Genel',
    icon: <LayoutDashboard className="w-4 h-4" />,
    items: [
      { id: 'summary', label: 'Özet', icon: <LayoutDashboard className="w-5 h-5" />, iconColor: 'blue' },
      { id: 'leaderboard', label: 'Lider Tablosu', icon: <Trophy className="w-5 h-5" />, iconColor: 'amber' },
      { id: 'messages', label: 'Mesajlar', icon: <MessageCircle className="w-5 h-5" />, iconColor: 'emerald' },
    ],
  },
  {
    title: 'İçerik & Eğitim',
    icon: <BookOpen className="w-4 h-4" />,
    items: [
      { id: 'gallery', label: 'Medya & Galeri', icon: <Image className="w-5 h-5" />, iconColor: 'rose' },
      { id: 'schedule', label: 'Ders Programı', icon: <CalendarDays className="w-5 h-5" />, iconColor: 'teal' },
      { id: 'live-lesson', label: 'Canlı Derse Katıl', icon: <Video className="w-5 h-5" />, iconColor: 'violet' },
      { id: 'puzzles', label: 'Bulmaca', icon: <Grid className="w-5 h-5" />, iconColor: 'amber' },
      { id: 'study', label: 'Çalışma', icon: <BookMarked className="w-5 h-5" />, iconColor: 'teal' },
      { id: 'tournaments', label: 'Turnuvalar', icon: <Trophy className="w-5 h-5" />, iconColor: 'amber' },
      { id: 'analyses', label: 'Analizler', icon: <BarChart3 className="w-5 h-5" />, iconColor: 'indigo' },
      { id: 'ukd', label: 'UKD/FIDE', icon: <Trophy className="w-5 h-5" />, iconColor: 'amber' },
      { id: 'lichess', label: 'Lichess', icon: <ExternalLink className="w-5 h-5" />, iconColor: 'teal' },
      { id: 'chesscom', label: 'Chess.com', icon: <ExternalLink className="w-5 h-5" />, iconColor: 'emerald' },
    ],
  },
  {
    title: 'Ödeme & Aidat',
    icon: <Wallet className="w-4 h-4" />,
    items: [
      { id: 'payments', label: 'Ödemeler', icon: <Wallet className="w-5 h-5" />, iconColor: 'emerald' },
      { id: 'dues', label: 'Aidat Geçmişi', icon: <CreditCard className="w-5 h-5" />, iconColor: 'amber' },
    ],
  },
  {
    title: 'Takip & Hesap',
    icon: <User className="w-4 h-4" />,
    items: [
      { id: 'attendance', label: 'Devam', icon: <CalendarCheck className="w-5 h-5" />, iconColor: 'emerald' },
      { id: 'profile', label: 'Profil', icon: <User className="w-5 h-5" />, iconColor: 'indigo' },
    ],
  },
];

/** Kulüp girişinde seçilebilecek şubeler */
export const BRANCH_OPTIONS = ['Merkez', 'Şube 2', 'Şube 3'];

export const MOCK_STUDENTS = [
  // ── Alt Yapı A ──
  { id: '1',  name: 'Ahmet Ensar Kızılarslan', level: 'Orta',      elo: 1433, ukd: 1520, lastAttendance: '2026-02-20', paymentStatus: 'Paid',    group: 'Alt Yapı A', parentName: 'Mehmet Kızılarslan', parentPhone: '5551234567', birthDate: '2012-05-15', registrationDate: '2024-09-01', branch: 'Merkez', school: 'Atatürk İlkokulu', status: 'active' },
  { id: '5',  name: 'Elif Su Aydın',          level: 'Başlangıç',  elo: 720,  ukd: 800,  lastAttendance: '2026-02-21', paymentStatus: 'Paid',    group: 'Alt Yapı A', parentName: 'Selin Aydın',        parentPhone: '5321112233', birthDate: '2015-08-22', registrationDate: '2025-09-15', branch: 'Merkez', school: 'Cumhuriyet İlkokulu', status: 'active' },
  { id: '6',  name: 'Yusuf Kaan Erdoğan',     level: 'Başlangıç',  elo: 650,  ukd: 710,  lastAttendance: '2026-02-19', paymentStatus: 'Unpaid',  group: 'Alt Yapı A', parentName: 'Hasan Erdoğan',      parentPhone: '5423334455', birthDate: '2016-01-10', registrationDate: '2025-10-01', branch: 'Merkez', school: 'Fatih İlkokulu', status: 'active' },
  { id: '7',  name: 'Zeynep Naz Polat',       level: 'Başlangıç',  elo: 580,  ukd: 620,  lastAttendance: '2026-02-18', paymentStatus: 'Paid',    group: 'Alt Yapı A', parentName: 'Derya Polat',        parentPhone: '5069998877', birthDate: '2016-06-03', registrationDate: '2025-11-01', branch: 'Merkez', school: 'İstiklal İlkokulu', status: 'active' },

  // ── Alt Yapı B ──
  { id: '3',  name: 'Duru Yazıcı',            level: 'Başlangıç',  elo: 800,  ukd: 950,  lastAttendance: '2026-02-17', paymentStatus: 'Unpaid',  group: 'Alt Yapı B', parentName: 'Fatma Yazıcı',       parentPhone: '5554443322', birthDate: '2015-11-10', registrationDate: '2024-10-10', branch: 'Merkez', school: 'Zafer İlkokulu', status: 'active' },
  { id: '8',  name: 'Berat Yılmaz',           level: 'Başlangıç',  elo: 690,  ukd: 750,  lastAttendance: '2026-02-21', paymentStatus: 'Paid',    group: 'Alt Yapı B', parentName: 'Kemal Yılmaz',       parentPhone: '5337778899', birthDate: '2015-04-17', registrationDate: '2025-09-01', branch: 'Merkez', school: 'Atatürk İlkokulu', status: 'active' },
  { id: '9',  name: 'Ada Çelik',              level: 'Başlangıç',  elo: 610,  ukd: 680,  lastAttendance: '2026-02-20', paymentStatus: 'Partial', group: 'Alt Yapı B', parentName: 'Melek Çelik',        parentPhone: '5448889900', birthDate: '2016-09-28', registrationDate: '2025-10-15', branch: 'Merkez', school: 'Mehmet Akif İlkokulu', status: 'active' },
  { id: '10', name: 'Kerem Aksoy',            level: 'Başlangıç',  elo: 740,  ukd: 810,  lastAttendance: '2026-02-15', paymentStatus: 'Paid',    group: 'Alt Yapı B', parentName: 'Serkan Aksoy',       parentPhone: '5362223344', birthDate: '2015-12-05', registrationDate: '2025-08-20', branch: 'Merkez', school: 'Kurtuluş İlkokulu', status: 'active' },

  // ── Gelişim A ──
  { id: '2',  name: 'Mir Tuna Demir',         level: 'İleri',      elo: 1850, ukd: 1910, lastAttendance: '2026-02-21', paymentStatus: 'Paid',    group: 'Gelişim A', parentName: 'Ayşe Demir',         parentPhone: '5559876543', birthDate: '2010-03-20', registrationDate: '2023-01-15', branch: 'Merkez', school: 'Özel Bilfen Ortaokulu', status: 'active' },
  { id: '11', name: 'Defne Sarı',             level: 'İleri',      elo: 1720, ukd: 1800, lastAttendance: '2026-02-21', paymentStatus: 'Paid',    group: 'Gelişim A', parentName: 'Burcu Sarı',         parentPhone: '5313334455', birthDate: '2011-07-14', registrationDate: '2023-06-01', branch: 'Merkez', school: 'Özel Doğa Ortaokulu', status: 'active' },
  { id: '12', name: 'Arda Koç',               level: 'Orta',       elo: 1480, ukd: 1550, lastAttendance: '2026-02-20', paymentStatus: 'Paid',    group: 'Gelişim A', parentName: 'Emre Koç',           parentPhone: '5424445566', birthDate: '2011-02-09', registrationDate: '2024-01-10', branch: 'Merkez', school: 'Atatürk Ortaokulu', status: 'active' },
  { id: '13', name: 'Nehir Öztürk',           level: 'Orta',       elo: 1350, ukd: 1420, lastAttendance: '2026-02-19', paymentStatus: 'Unpaid',  group: 'Gelişim A', parentName: 'Gül Öztürk',         parentPhone: '5065556677', birthDate: '2012-10-25', registrationDate: '2024-03-15', branch: 'Merkez', school: 'Fatih Ortaokulu', status: 'active' },
  { id: '14', name: 'Alperen Kaya',           level: 'İleri',      elo: 1680, ukd: 1750, lastAttendance: '2026-02-21', paymentStatus: 'Paid',    group: 'Gelişim A', parentName: 'Volkan Kaya',        parentPhone: '5356667788', birthDate: '2010-12-01', registrationDate: '2023-09-01', branch: 'Merkez', school: 'Cumhuriyet Ortaokulu', status: 'active' },

  // ── Gelişim B ──
  { id: '4',  name: 'Çağan Açık',             level: 'Orta',       elo: 1250, ukd: 1300, lastAttendance: '2026-02-21', paymentStatus: 'Partial', group: 'Gelişim B', parentName: 'Ali Açık',           parentPhone: '5556667788', birthDate: '2013-07-04', registrationDate: '2024-02-01', branch: 'Merkez', school: 'İstiklal Ortaokulu', status: 'active' },
  { id: '15', name: 'Miraç Yıldız',           level: 'Orta',       elo: 1190, ukd: 1270, lastAttendance: '2026-02-20', paymentStatus: 'Paid',    group: 'Gelişim B', parentName: 'Hüseyin Yıldız',     parentPhone: '5447778899', birthDate: '2013-03-18', registrationDate: '2024-05-01', branch: 'Merkez', school: 'Zafer Ortaokulu', status: 'active' },
  { id: '16', name: 'Ecrin Arslan',           level: 'Orta',       elo: 1320, ukd: 1380, lastAttendance: '2026-02-18', paymentStatus: 'Paid',    group: 'Gelişim B', parentName: 'Sibel Arslan',       parentPhone: '5328889900', birthDate: '2012-11-30', registrationDate: '2024-04-10', branch: 'Merkez', school: 'Atatürk Ortaokulu', status: 'active' },
  { id: '17', name: 'Emir Can Şahin',         level: 'Orta',       elo: 1150, ukd: 1210, lastAttendance: '2026-02-16', paymentStatus: 'Unpaid',  group: 'Gelişim B', parentName: 'Murat Şahin',        parentPhone: '5069990011', birthDate: '2013-09-12', registrationDate: '2024-06-15', branch: 'Merkez', school: 'Mehmet Akif Ortaokulu', status: 'active' },

  // ── Turnuva Grubu ──
  { id: '18', name: 'Burak Tan Özdemir',      level: 'İleri',      elo: 2010, ukd: 2080, lastAttendance: '2026-02-21', paymentStatus: 'Paid',    group: 'Turnuva', parentName: 'Okan Özdemir',       parentPhone: '5311112200', birthDate: '2009-01-25', registrationDate: '2022-09-01', branch: 'Merkez', school: 'Özel Bilfen Lisesi', status: 'active' },
  { id: '19', name: 'İrem Başak Tunç',        level: 'İleri',      elo: 1950, ukd: 2020, lastAttendance: '2026-02-21', paymentStatus: 'Paid',    group: 'Turnuva', parentName: 'Pınar Tunç',         parentPhone: '5422223311', birthDate: '2009-06-08', registrationDate: '2022-10-15', branch: 'Merkez', school: 'Fen Lisesi', status: 'active' },
  { id: '20', name: 'Kuzey Acar',             level: 'İleri',      elo: 1880, ukd: 1940, lastAttendance: '2026-02-20', paymentStatus: 'Partial', group: 'Turnuva', parentName: 'Tolga Acar',         parentPhone: '5333334422', birthDate: '2010-04-17', registrationDate: '2023-02-01', branch: 'Merkez', school: 'Anadolu Lisesi', status: 'active' },
  { id: '21', name: 'Asya Güneş',             level: 'İleri',      elo: 1790, ukd: 1860, lastAttendance: '2026-02-19', paymentStatus: 'Paid',    group: 'Turnuva', parentName: 'Deniz Güneş',        parentPhone: '5064445533', birthDate: '2010-08-30', registrationDate: '2023-05-10', branch: 'Merkez', school: 'Özel Doğa Lisesi', status: 'active' },

  // ── Yetişkin Grubu ──
  { id: '22', name: 'Serhat Karaman',         level: 'Orta',       elo: 1400, ukd: 1450, lastAttendance: '2026-02-21', paymentStatus: 'Paid',    group: 'Yetişkin', parentName: '-',                  parentPhone: '5351110022', birthDate: '1990-03-12', registrationDate: '2025-01-10', branch: 'Merkez', status: 'active' },
  { id: '23', name: 'Aylin Demirtaş',         level: 'Başlangıç',  elo: 850,  ukd: 920,  lastAttendance: '2026-02-20', paymentStatus: 'Paid',    group: 'Yetişkin', parentName: '-',                  parentPhone: '5442220033', birthDate: '1985-07-20', registrationDate: '2025-02-01', branch: 'Merkez', status: 'active' },
  { id: '24', name: 'Onur Bayrak',            level: 'İleri',      elo: 1650, ukd: 1720, lastAttendance: '2026-02-18', paymentStatus: 'Unpaid',  group: 'Yetişkin', parentName: '-',                  parentPhone: '5063330044', birthDate: '1988-11-05', registrationDate: '2024-11-20', branch: 'Merkez', status: 'active' },
];

/** Yoklama alırken seçilebilecek antrenör/öğretmen listesi */
export const TEACHERS = ['Ahmet Öğretmen', 'Ayşe Antrenör', 'Mehmet Hoca', 'Fatma Öğretmen', 'Diğer'];

export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
