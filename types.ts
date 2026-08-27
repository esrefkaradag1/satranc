
import type { LeaderboardPointSettings } from './lib/leaderboardPointSettings';

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
  /** Kulüp kaydı (clubs.id) — çok kiracılı izolasyon */
  clubId?: string;
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
  /** true ise lessonSchedule grup programını geçersiz kılar (admin özelleştirmesi) */
  lessonScheduleCustom?: boolean;
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
  /** Kulübe özel kayıt — boşsa merkez/admin tanımı */
  clubId?: string;
}

/** Ders paketi: branş altında satılabilir paket (ör. özel ders 4/8 saat) */
export interface LessonPackage {
  id: string;
  name: string;
  branchOffice: string;
  discipline: string;
  lessonCount: number;
  validityDays: number;
  packageFee: number;
  capacity: number;
  coachIds?: string[];
  clubId?: string;
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
  /** Kulübe özel kayıt — boşsa merkez/admin tanımı */
  clubId?: string;
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
  | { role: 'coach'; coachId?: string; branch?: string; clubId?: string; roleId?: string }
  | { role: 'parent'; studentId: string }
  | { role: 'student'; studentId: string }
  | { role: 'club'; branch: string; clubId?: string; roleId?: string };

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
export interface ClubExtendedProfile {
  /** Kulüp tanıtım metni */
  description?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  city?: string;
  district?: string;
  /** Örn: "14:00 – 20:00" veya serbest metin */
  openingHours?: string;
  foundedYear?: string;
  contactPerson?: string;
}

/** satrancedu.com ana site içeriği (platform — kulüp değil) */
export interface MainSiteFeature {
  title: string;
  body: string;
  /** Kısa etiket / eyebrow (örn. ÖĞREN, 01) */
  tag?: string;
}

export interface MainSiteFaq {
  q: string;
  a: string;
}

export interface MainSiteStat {
  label: string;
  value: string;
}

export interface MainSiteAnnouncement {
  id: string;
  title: string;
  body: string;
  date?: string;
}

export interface MainSiteHeroSlide {
  title: string;
  body: string;
  ctaLabel?: string;
  /** Kart alt yazısı örn. 3. KADEME FIDE TRAINER */
  cardCaption?: string;
}

export interface MainSitePageBlock {
  title: string;
  body: string;
  items?: { title: string; body: string }[];
}

export interface MainSiteContent {
  enabled?: boolean;
  brandTitle?: string;
  heroEyebrow?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  /** Slider slaytları (opsiyonel; ana sayfada kullanılmayabilir) */
  heroSlides?: MainSiteHeroSlide[];
  aboutTitle?: string;
  aboutBody?: string;
  features?: MainSiteFeature[];
  stats?: MainSiteStat[];
  /** Platform modül kartları */
  modulesTitle?: string;
  modulesSubtitle?: string;
  modules?: MainSiteFeature[];
  /** Kimler kullanır */
  rolesTitle?: string;
  rolesSubtitle?: string;
  roles?: MainSiteFeature[];
  /** Nasıl çalışır adımları */
  stepsTitle?: string;
  stepsSubtitle?: string;
  steps?: MainSiteFeature[];
  /** Neden biz / 3 büyük fayda */
  benefitsTitle?: string;
  benefitsSubtitle?: string;
  benefits?: MainSiteFeature[];
  /** Yolculuk / harita adımları */
  journeyTitle?: string;
  journeySubtitle?: string;
  journey?: MainSiteFeature[];
  /** Kullanım modları */
  modesTitle?: string;
  modesSubtitle?: string;
  modes?: MainSiteFeature[];
  /** SSS */
  faqTitle?: string;
  faqSubtitle?: string;
  faqs?: MainSiteFaq[];
  /** Hero alt güven şeridi */
  trustLine?: string;
  announcementsTitle?: string;
  announcementsSubtitle?: string;
  announcements?: MainSiteAnnouncement[];
  galleryTitle?: string;
  gallerySubtitle?: string;
  showGallery?: boolean;
  ctaTitle?: string;
  ctaBody?: string;
  ctaButtonLabel?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactWhatsapp?: string;
  contactAddress?: string;
  /** Google Maps embed URL */
  mapEmbedUrl?: string;
  openingHoursWeekday?: string;
  openingHoursSaturday?: string;
  openingHoursSunday?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  youtubeUrl?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  foundedYear?: string;
  /** Alt sayfalar */
  pageKurumsal?: MainSitePageBlock;
  pageEgitimler?: MainSitePageBlock;
  pageAntrenman?: MainSitePageBlock;
  pageDenemeDersi?: MainSitePageBlock;
}

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
  /** Lider tablosu mod bazlı puan ayarları */
  leaderboardPoints?: LeaderboardPointSettings;
  /** Kulüp logosu (URL) */
  logoUrl?: string;
  /** İletişim, sosyal medya ve tanıtım alanları */
  profile?: ClubExtendedProfile;
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
  /** Bağlı kulüp (clubs.id) */
  clubId?: string;
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
  /** Satış tipi: aylık paket veya özel ders */
  saleKind?: 'monthly_package' | 'private_lesson';
  /** Özel ders satışında seçilen paket kimliği */
  lessonPackageId?: string;
  /** Özel ders satışında görünen paket adı */
  lessonPackageName?: string;
  /** Özel ders paketinin branşı */
  lessonDiscipline?: string;
  /** Özel ders paketinin şubesi */
  lessonBranchOffice?: string;
  /** Özel ders paketindeki toplam ders/saat */
  lessonCount?: number;
  /** Sisteme aktarım öncesi kullanılmış ders sayısı (devir bakiye için) */
  startingUsedLessons?: number;
  /** Özel ders paketi geçerlilik süresi */
  validityDays?: number;
  branch?: string;
  processedBy?: string;
  /**
   * Gerçek tahsilat / eklenme tarihi (YYYY-MM-DD).
   * Aidat/paket kayıtlarında `date` aidat dönemi (ayın 1’i) kalır; bu alan fiili ödeme günüdür.
   */
  collectedAt?: string;
  /** Öğrenciye ait gelir/gider için öğrenci id */
  studentId?: string;
  /** Kişisel kasa işlemi (varsayılan olarak genel kasa toplamlarına dahil edilmez) */
  personalCash?: boolean;
  /** Kişisel kasa işleminin genel kasa toplamlarına da yansıması */
  includeInGeneralCash?: boolean;
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
  attendanceType?: 'group' | 'lesson';
  groupName?: string;
  branch?: string;
  branchOffice?: string;
  sessionTime?: string;
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
  /** Lichess rakip kurulum hamlesi (UCI) — import sırasında kaydedilir; FEN kurulum sonrasıdır */
  lichessSetupMove?: string;
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
  assignedTo: string[]; // group:<name>, exclude:<studentId> or direct student IDs
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
  /** Oluşturulma zamanı (ISO) — yeni programda aynı gün platform aktivitesi katılım sayılmaz */
  createdAt?: string;
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
  /** Ürün küçük görseli (küçültülmüş data URL veya yüklenmiş URL) */
  imageUrl?: string;
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

/** WhatsApp API sağlayıcısı — varsayılan WaMessage (app.wamessage.app) */
export type WhatsAppProvider = 'wamessage' | 'evolution';

/** WhatsApp API yapılandırması (WaMessage / Evolution) */
export interface WhatsAppConfig {
  /** wamessage = api.toplusms.app · evolution = self-host Evolution API */
  provider: WhatsAppProvider;
  apiBaseUrl: string;
  /** WaMessage: API Key (Api Entegrasyonu → API Key Göster) · Evolution: apikey */
  apiKey: string;
  /** WaMessage: cihaz reg_id · Evolution: instance adı */
  instanceName: string;
  enabled: boolean;
  /** Gönderici WhatsApp numarası (+905… veya 905…) — QR / check için */
  devicePhone?: string;
  /** Çalışan auth: x-api-key | authorization-raw | bearer */
  authMode?: 'x-api-key' | 'authorization-raw' | 'bearer';
  /** @deprecated Eski SMS login */
  loginIdentifier?: string;
  /** Şube bazlı ayar — boşsa tüm şubeler */
  branchOffice?: string;
}

export type WhatsAppSystemTemplateKey =
  | 'parent_login'
  | 'parent_consent'
  | 'lesson_start'
  | 'attendance_reminder'
  | 'training_completed'
  | 'training_partial'
  | 'training_incomplete'
  | 'manual';

/** Sistem + kullanıcı tanımlı özel şablon anahtarları */
export type WhatsAppTemplateKey = WhatsAppSystemTemplateKey | (string & {});

export interface WhatsAppTemplate {
  id: string;
  key: WhatsAppTemplateKey;
  name: string;
  body: string;
  enabled: boolean;
}

export type WhatsAppMessageStatus = 'sent' | 'failed' | 'manual' | 'queued';

export interface WhatsAppMessageLog {
  id: string;
  phone: string;
  message: string;
  status: WhatsAppMessageStatus;
  templateKey?: WhatsAppTemplateKey;
  studentId?: string;
  studentName?: string;
  branchOffice?: string;
  error?: string;
  createdAt: string;
}

export type WhatsAppAutoEvent =
  | 'parent_login'
  | 'parent_consent'
  | 'lesson_start'
  | 'training_completed'
  | 'training_partial'
  | 'training_incomplete';

export interface WhatsAppAutoRule {
  event: WhatsAppAutoEvent;
  enabled: boolean;
  templateKey: WhatsAppTemplateKey;
}

export interface WhatsAppContactGroup {
  id: string;
  name: string;
  phones: string[];
  branchOffice?: string;
}
