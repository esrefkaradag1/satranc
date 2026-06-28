import type { SquareMarkColor } from './chessBoardUi';
import type { StudyTree } from './studySync/types';

export interface StudyChapter {
  id: string;
  title: string;
  fen: string;
  moves: string[];
  orientation: 'white' | 'black';
  lessonMode?: 'direct' | 'interactive';
  interactiveType?: 'puzzle' | 'liveAnalysis' | 'vsComputer';
  guidedPrompt?: string;
  moveHint?: string;
  /** 1 (kolay) → 10 (usta) */
  difficulty?: number;
  comment: string;
  /** Lichess uyumlu PGN başlıkları: [Event, "..."], [Date, "..."], … */
  pgnTags?: Array<[string, string]>;
  /** Serbest bölüm etiketleri (konu/anahtar kelime — eski alan). */
  tags: string[];
  moveComments: Record<number, string>;
  /** Tek sembol (eski) veya birden fazla sembol dizisi */
  moveAnnotations: Record<number, string | string[]>;
  // Varyasyonlar: her hamle indeksinde alternatif varyasyon dizileri
  variations: Record<number, string[][]>;
  /** PGN içe aktarımından gelen tam hamle ağacı (iç içe varyantlar). */
  seedTree?: StudyTree;
  // Çizimler: oklar ve daireler (sync için)
  arrows?: Array<{ startSquare: string; endSquare: string; color: string }>;
  circles?: Record<string, boolean>;
}

export interface StudyChatMessage {
  id: string;
  user: string;
  text: string;
  timestamp: string;
}

export interface Study {
  id: string;
  title: string;
  emoji: string;
  description: string;
  chapters: StudyChapter[];
  memberIds: string[];
  createdAt: string;
  /** Son yerel/uzak kayıt zamanı (birleştirme için) */
  updatedAt?: string;
  visibility: 'public' | 'unlisted' | 'private';
  chat: 'everyone' | 'members';
  computerAnalysis: 'everyone' | 'members' | 'none';
  openingExplorer: 'everyone' | 'members';
  clonePermission: 'everyone' | 'members' | 'onlyMe';
  shareExport: 'everyone' | 'members' | 'onlyMe';
  syncEnabled: boolean;
  studyComments: 'everyone' | 'members' | 'none';
  tags: string[];
  topicTags: string[];
  chatMessages: StudyChatMessage[];
  liked: boolean;
  likes: number;
  /** Öğrencinin taş oynatma izni; `none` = sadece izleme, `both` = her iki taraf (varsayılan). */
  studentPlaysColor?: StudentPlaysColor;
  /** true ise çalışma öğrenci panelinden oluşturulmuştur. */
  studentCreated?: boolean;
  /** Çalışmayı oluşturan öğrenci id'si (varsa). */
  createdByStudentId?: string | null;
  /** Öğrenci bazlı senkronize uygulama günlükleri (Admin görünümü için). */
  practiceLogs?: Record<string, any[]>;
  /** Antrenör listesi klasörleri; yerel netchess_study_categories + StudyPage */
  categoryId?: string | null;
}

export type StudentPlaysColor = 'white' | 'black' | 'both' | 'none';

export type BottomTab = 'tags' | 'comments' | 'annotations' | 'analysis' | 'liveNotes' | 'multiboard' | 'share' | 'info';
export type LeftTab = 'chapters' | 'members';
export type StudyView = 'list' | 'editor';
