
export enum UserRole {
  ADMIN = 'ADMIN',
  COACH = 'COACH',
  STUDENT = 'STUDENT',
  PARENT = 'PARENT'
}

export interface Student {
  id: string;
  /** Öğrenci no (giriş ve etiket için); 1'den başlar, yoksa listede sıra ile türetilir */
  studentNo?: number;
  name: string;
  level: 'Başlangıç' | 'Orta' | 'İleri';
  elo: number;
  ukd: number;
  lastAttendance: string;
  paymentStatus: 'Paid' | 'Unpaid' | 'Partial';
  group: string;
  parentName: string;
  parentPhone: string;
  birthDate: string;
  registrationDate: string;
  branch?: string;
  branchGroup?: string;
  branchOffice?: string;
  tcNo?: string;
  lichessUsername?: string;
  /** OAuth bağlantı zamanı (token istemciye gönderilmez; yalnızca bağlı mı kontrolü için) */
  lichessOauthConnectedAt?: string | null;
  chessComUsername?: string;
  /** FIDE oyuncu ID (ratings.fide.com profilinden); girilince FIDE bilgileri çekilir */
  fideId?: string;
  school?: string;
  teacher?: string;
  hasSiblingDiscount?: boolean;
  /** Kardeş indirimi türü: yüzde veya sabit tutar */
  siblingDiscountType?: 'percent' | 'amount';
  /** Kardeş indirimi oranı (yüzde) */
  siblingDiscountPercent?: number;
  /** Kardeş indirimi tutarı (₺) */
  siblingDiscountAmount?: number;
  notes?: string;
  healthInfo?: string;
  registrationType?: 'monthly' | 'package';
  monthlyFee?: number;
  paymentReminderDay?: string;
  latePaymentReminderDay?: string;
  isScholarshipStudent?: boolean;
  parentJob?: string;
  fatherName?: string;
  fatherPhone?: string;
  fatherJob?: string;
  motherName?: string;
  motherPhone?: string;
  motherJob?: string;
  address?: string;
  contactNumbers?: string[];
  status?: 'active' | 'inactive';
  /** Öğrenci giriş kullanıcı adı */
  username?: string;
  /** Öğrenci giriş şifresi */
  password?: string;
  photoUrl?: string;
  /** Veli girişi için PIN (opsiyonel; yoksa veli telefon son 4 hane ile giriş yapılabilir) */
  parentPin?: string;
  /** Antrenör ders günlüğü: tarih, konu, bilgi (link/not) */
  lessonLog?: StudentLessonLogEntry[];
  /** Birincil antrenör (coaches.id) */
  coachId?: string;
  /** Branş–grup tanımına bağlantı */
  trainingGroupId?: string;
  /** Ders günleri ve saatleri (gruptan kopyalanır; öğrenci bazında düzenlenebilir) */
  lessonSchedule?: GroupLessonSlot[];
  /** Ay bazlı beklenen aidat tutarı: "2026-01" -> ₺ */
  duesOverrides?: Record<string, number>;
  /** Ay bazlı aidat notu: "2026-01" -> "Eksik hafta" */
  duesOverrideNotes?: Record<string, string>;
}

/** Grup ders slotu: gün + saat */
export interface GroupLessonSlot {
  dayOfWeek: number;
  dayLabel: string;
  startTime: string;
  endTime?: string;
}

/** Branş tanımı: şube altında aylık ücret */
export interface DisciplineBranch {
  id: string;
  name: string;
  branchOffice: string;
  monthlyFee: number;
}

/** Eğitim grubu: branş altında kontenjan, ücret ve ders programı */
export interface TrainingGroup {
  id: string;
  name: string;
  branchOffice: string;
  discipline: string;
  /** Boşsa branş varsayılan ücreti kullanılır */
  monthlyFee?: number;
  lessonSlots: GroupLessonSlot[];
  capacity: number;
  coachIds?: string[];
}

/** Öğrenci ders günlüğü satırı (antrenör — öğrenci listesi işlemler) */
export interface StudentLessonLogEntry {
  id: string;
  /** Görüntüleme: DD.MM.YYYY veya ISO */
  date: string;
  topic: string;
  info: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Giriş yapan kullanıcı: admin, antrenör, veli, öğrenci veya kulüp */
export type AuthUser =
  | { role: 'admin' }
  | { role: 'coach'; coachId?: string; branch?: string }
  | { role: 'parent'; studentId: string }
  | { role: 'student'; studentId: string }
  | { role: 'club'; branch: string; clubId?: string };

/** Rol paneli türü */
export type RolePanel = 'admin' | 'coach' | 'club' | 'student' | 'parent';

/** Uygulama rolü tanımı */
export interface AppRole {
  id: string;
  slug: string;
  name: string;
  panel: RolePanel;
  description?: string;
  color?: string;
  isSystem: boolean;
  createdAt?: string;
}

/** Kurumsal yapıda yönetilen kulüp (şube) — ad, adres, aktif günler, giriş parolası */
export interface Club {
  id: string;
  name: string;
  address?: string;
  /** Haftanın günleri: [Pzt, Sal, Çar, Per, Cum, Cmt, Paz] — true = aktif */
  activeDays?: boolean[];
  /** Kulüp girişi kullanıcı adı */
  loginUsername?: string;
  /** Kulüp girişi için parola; boşsa sistem parolası (kulup) kullanılır */
  loginPassword?: string;
  /** Atanan özel rol (app_roles.id); boşsa varsayılan kulüp rolü */
  roleId?: string;
}

/** Kulüp tarafından eklenen antrenör (şubeye bağlı) */
export interface Coach {
  id: string;
  name: string;
  branch: string;
  phone?: string;
  email?: string;
  /** Antrenör paneli giriş şifresi */
  password?: string;
  photoUrl?: string;
  /** Ünvan: FIDE Usta, Kıdemli Antrenör vb. */
  title?: string;
  /** Uzmanlık alanı */
  specialization?: string;
  /** Kısa özgeçmiş */
  bio?: string;
  birthDate?: string;
  fideId?: string;
  lichessUsername?: string;
  /** Atanan özel rol (app_roles.id); boşsa varsayılan antrenör rolü */
  roleId?: string;
}

export interface Transaction {
  id: string;
  date: string;
  type: 'income' | 'expense';
  category: string;
  description: string;
  paymentType: 'Nakit' | 'Havale/EFT' | 'Kredi Kartı';
  amount: number;
  /** Paket / özel ders satışında toplam tutar (amount = alınan) */
  totalAmount?: number;
  branch?: string;
  processedBy?: string;
  /** Öğrenciye ait gelir/gider için öğrenci id */
  studentId?: string;
}

/** İşlem geçmişi (log) kaydı */
export interface ActivityLog {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string; // ISO
  type: 'info' | 'success' | 'warning';
}

export interface Lesson {
  id: string;
  day: string; // 'Pazartesi', 'Salı', etc.
  startTime: string;
  endTime: string;
  group: string;
  topic: string;
  branch?: string;
  /** Doluysa sadece bu öğrenciye özel ders */
  studentId?: string;
}

/** Haftalık ders programı hücresi (Müfredat & İçerik grid) */
export type ScheduleEntryStatus =
  | 'yapildi'      // Yapıldı
  | 'yapilmadi'    // Yapılmadı
  | 'deneme'       // Deneme
  | 'iptal'        // İptal
  | 'konu_calismasi' // Konu Çalışması
  | 'tatil'        // Tatil
  | 'mola'         // Mola
  | 'zayif'        // Zayıf
  | 'ai_analiz';   // AI Analiz

export interface ScheduleEntry {
  id: string;
  week: number;      // 1-53
  year: number;
  dayOfWeek: number; // 1=Pzt .. 7=Paz
  slotIndex: number; // 1-6 (1. Ders, 2. Ders, ...)
  group: string;
  topic: string;
  status: ScheduleEntryStatus;
  /** Öğrenciye özel ders ise dolu; yoksa tüm grup için */
  studentId?: string;
  /** Öğrenci/veli veya antrenör notu (panelden güncellenebilir) */
  note?: string;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  studentId: string;
  lessonId?: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  notifiedParent?: boolean;
  /** Yoklama alan antrenör/öğretmen adı */
  teacherName?: string;
  /** Antrenörler arası ders özeti / açıklama */
  lessonSummary?: string;
}

export interface Puzzle {
  id: string;
  fen: string;
  solution: string[];
  title: string;
  difficulty: 'Kolay' | 'Orta' | 'Zor';
  points: number;
  category: string;
  theme?: string;
  hint?: string;
  /** Yüklenen görsel/PDF'den oluşturulmuş bulmaca için diagram görseli (data URL) */
  imageData?: string;
  /** Oyunun başlangıca kadar tüm hamleleri (PGN); varsa tahta buna göre doldurulur, hamle listesi tam görünür */
  gamePgn?: string;
  /** Bulmacanın kaynağı: Lichess veya el yapımı */
  source?: 'lichess' | 'custom';
  /** Lichess ham tema etiketleri (örn. mateIn3 fork) — filtreleme için */
  lichessThemes?: string;
  /** Orijinal Lichess bulmaca kimliği (UUID dışı) — onarım için */
  lichessId?: string;
}

export type AssignmentType = 'group' | 'package';

export interface StudentDailyTarget {
  /** Öğrenciye özel günlük maç hedefi (platform bağımsız) */
  dailyGameTarget?: number;
  /** Öğrenciye özel günlük bulmaca hedefi */
  dailyPuzzleTarget?: number;
  /** Öğrenciye özel bulmaca minimum doğruluk yüzdesi */
  minPuzzleAccuracyPct?: number;
  /** Haftalık program: 1=Pzt .. 7=Paz -> Hedefler */
  weeklySchedule?: Record<number, {
    dailyGameTarget?: number;
    dailyPuzzleTarget?: number;
    minPuzzleAccuracyPct?: number;
  }>;
}

export interface HomeworkAssignment {
  id: string;
  title: string;
  puzzles: string[]; // Puzzle IDs
  /** Boş string = son teslim tarihi yok */
  dueDate: string;
  assignedTo: string[]; // Group names or student IDs
  /** Günlük hedeflenen maç adedi (platform bağımsız) */
  dailyGameTarget?: number;
  /** Günlük hedeflenen bulmaca adedi */
  dailyPuzzleTarget?: number;
  /** Bulmaca hedefi için minimum doğruluk yüzdesi (varsayılan %60) */
  minPuzzleAccuracyPct?: number;
  /** Öğrenciye özel günlük hedef override'ları (ödev geneli değerler fallback olarak kullanılır) */
  studentDailyTargets?: Record<string, StudentDailyTarget>;
  branch?: string;
  branchName?: string;
  groupName?: string;
  startDate?: string;
  endDate?: string;
  timeLimitMinutes?: number;
  hintCount?: number;
  description?: string;
  assignmentType?: AssignmentType;
}

/** Öğrencinin ödevi bitirdiğini işaretlemesi (antrenör panelinde Tamamlandı/teslim edildi olarak görünür) */
export interface HomeworkSubmission {
  id: string;
  studentId: string;
  homeworkId: string;
  submittedAt: string; // ISO
}

/** Öğrencinin tek bir bulmaca denemesi (AI analiz ve antrenör görünümü için) */
export interface HomeworkPuzzleAttempt {
  id: string;
  studentId: string;
  homeworkId: string;
  puzzleId: string;
  puzzleTitle: string;
  /** Doğru çözdü mü */
  correct: boolean;
  /** Oynanan hamleler (sırayla; yanlışsa son hamle hatalı) */
  movesPlayed: string[];
  /** Çözüm hamleleri (doğru cevap) */
  solutionMoves: string[];
  /** Tahtanın son görüntüsü (FEN); admin detayda gösterilir */
  finalFen?: string;
  /** Bulmaca açıldıktan çözüme kadar geçen süre (sn) */
  thinkSeconds?: number;
  /** İpucu kullanıldı mı */
  hintUsed?: boolean;
  timestamp: string; // ISO
}

/** Öğrencinin bir atamadaki sonucu (detay tablosu için) */
export interface StudentPuzzleResult {
  studentId: string;
  correct: number;
  wrong: number;
  skipped: number;
  points: number;
  timeSeconds: number;
  hintsUsed: number;
  completionPct: number;
  status: 'Başlamadı' | 'Devam Ediyor' | 'Tamamlandı';
}

export interface HomeworkStats {
  id: string;
  studentId: string;
  homeworkId: string;
  completed: boolean;
  accuracy: number;
  timeSpent: number; // in seconds
  moves: string[];
  lastAttempt: string;
}

export interface Payment {
  id: string;
  studentId: string;
  amount: number;
  date: string;
  type: 'Cash' | 'Transfer' | 'Card';
  description: string;
  month: string;
}

export interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  monthlyData: { name: string; income: number; expense: number }[];
}

export interface GalleryItem {
  id: string;
  url: string;
  title: string;
  group: string;
  date: string;
  /** Doluysa sadece bu öğrenci ve velisi görür; boşsa herkese açık. */
  studentId?: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  status: 'Yeterli' | 'Azalıyor' | 'Kritik';
  minStock?: number;
}

/** Performans analizi değerlendirme maddesi */
export interface PerformanceAnalysisCategory {
  id: string;
  label: string;
  value: number;
  notes: string;
}

/** Antrenörün AI kapsamlı analiz raporu — öğrenci/veli panelinde görünür */
export interface CoachAiReport {
  id: string;
  studentId: string;
  createdAt: string;
  title: string;
  summary: string;
  eksiklikler: string;
  hamleler: string;
  skillSnapshot?: Partial<Record<'endgame' | 'tactics' | 'opening' | 'strategy', number>>;
  /** Öğrenci paneline yayınlandı */
  publishedToStudent?: boolean;
  /** Veli paneline yayınlandı */
  publishedToParent?: boolean;
}

/** Öğrenci performans analizi (Analizler sekmesi) */
export interface PerformanceAnalysis {
  id: string;
  studentId: string;
  branch: string;
  analysisDate: string; // YYYY-MM-DD
  /** Özelleştirilebilir değerlendirme maddeleri */
  categories?: PerformanceAnalysisCategory[];
  technicalSkills: number;      // 1-10
  technicalNotes: string;
  physicalCondition: number;
  physicalNotes: string;
  tacticalUnderstanding: number;
  tacticalNotes: string;
  mentalState: number;
  mentalNotes: string;
  disciplineAttitude: number;
  disciplineNotes: string;
  teamwork: number;
  teamworkNotes: string;
  generalEvaluation: string;
  recommendations: string;
  shortTermGoal: string;
  longTermGoal: string;
}

export interface Tournament {
  id: string;
  name: string;
  format: 'arena' | 'swiss';
  durationMinutes: number;
  timeControl: string;
  startAt: string; // ISO
  description?: string;
  isRated: boolean;
  createdByRole: 'admin' | 'club';
  createdBy: string;
  branch?: string;
  participantIds?: string[];
  rounds?: TournamentRound[];
  standings?: Record<string, TournamentStanding>;
}

export interface TournamentRound {
  id: string;
  roundNo: number;
  createdAt: string; // ISO
  pairings: TournamentPairing[];
}

export interface TournamentPairing {
  whiteId: string;
  blackId: string;
  result: '1-0' | '0-1' | '1/2-1/2';
}

export interface TournamentStanding {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
}
