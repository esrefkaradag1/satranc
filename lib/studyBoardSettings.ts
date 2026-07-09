export type StudyBoardSettings = {
  showEvalBar: boolean;
  showEngineAnalysis: boolean;
  showBestMoveArrows: boolean;
  showVariationArrows: boolean;
  showMoveAnnotations: boolean;
  /** Hamle listesinde N→♘, R→♖ figür sembolleri */
  figurineNotation: boolean;
  inlineNotation: boolean;
  showThreats: boolean;
};

export const DEFAULT_STUDY_BOARD_SETTINGS: StudyBoardSettings = {
  showEvalBar: true,
  showEngineAnalysis: true,
  showBestMoveArrows: true,
  showVariationArrows: true,
  showMoveAnnotations: true,
  figurineNotation: true,
  inlineNotation: false,
  showThreats: false,
};

const STORAGE_KEY = 'netchess_study_board_settings';

export function loadStudyBoardSettings(): StudyBoardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STUDY_BOARD_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<StudyBoardSettings>;
    return { ...DEFAULT_STUDY_BOARD_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_STUDY_BOARD_SETTINGS };
  }
}

export function saveStudyBoardSettings(settings: StudyBoardSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* quota */
  }
}

export function patchStudyBoardSettings(patch: Partial<StudyBoardSettings>): StudyBoardSettings {
  const next = { ...loadStudyBoardSettings(), ...patch };
  saveStudyBoardSettings(next);
  return next;
}

/**
 * Motoru (Stockfish) çalıştıran tüm ayarlar. Bunlardan herhangi biri açıksa
 * motor arka planda çalışır ve EngineAnalysis başlığındaki anahtar "açık" görünür.
 */
export const ENGINE_FEATURE_KEYS: (keyof StudyBoardSettings)[] = [
  'showEngineAnalysis',
  'showEvalBar',
  'showBestMoveArrows',
  'showVariationArrows',
];

/** Motor şu an aktif mi (herhangi bir motor özelliği açık mı)? */
export function isEngineActive(settings: StudyBoardSettings): boolean {
  return ENGINE_FEATURE_KEYS.some((key) => settings[key]);
}

/**
 * Başlıktaki ana Stockfish aç/kapa anahtarı için patch üretir.
 * Motor açıksa hepsini kapatır; kapalıysa hepsini açar. Böylece tek anahtar
 * gerçekten motoru başlatır/durdurur (tek bir bayrağa takılıp kalmaz).
 */
export function engineMasterTogglePatch(settings: StudyBoardSettings): Partial<StudyBoardSettings> {
  const turnOff = isEngineActive(settings);
  return {
    showEngineAnalysis: !turnOff,
    showEvalBar: !turnOff,
    showBestMoveArrows: !turnOff,
    showVariationArrows: !turnOff,
  };
}
