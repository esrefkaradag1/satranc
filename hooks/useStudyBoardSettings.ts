import { useCallback, useState } from 'react';
import {
  DEFAULT_STUDY_BOARD_SETTINGS,
  loadStudyBoardSettings,
  saveStudyBoardSettings,
  type StudyBoardSettings,
} from '../lib/studyBoardSettings';

export function useStudyBoardSettings() {
  const [settings, setSettings] = useState<StudyBoardSettings>(() => loadStudyBoardSettings());

  const updateSettings = useCallback((patch: Partial<StudyBoardSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveStudyBoardSettings(next);
      return next;
    });
  }, []);

  const toggleSetting = useCallback((key: keyof StudyBoardSettings) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveStudyBoardSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const next = { ...DEFAULT_STUDY_BOARD_SETTINGS };
    saveStudyBoardSettings(next);
    setSettings(next);
  }, []);

  return { settings, updateSettings, toggleSetting, resetSettings };
}
