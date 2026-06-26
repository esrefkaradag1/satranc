export type StudyBoardSettings = {
  showEvalBar: boolean;
  showEngineAnalysis: boolean;
  showBestMoveArrows: boolean;
  showVariationArrows: boolean;
  showMoveAnnotations: boolean;
  inlineNotation: boolean;
  showThreats: boolean;
};

export const DEFAULT_STUDY_BOARD_SETTINGS: StudyBoardSettings = {
  showEvalBar: true,
  showEngineAnalysis: true,
  showBestMoveArrows: true,
  showVariationArrows: true,
  showMoveAnnotations: true,
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
