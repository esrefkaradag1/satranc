import { useEffect, useRef } from 'react';
import { isBoardFlipShortcutKey, keyboardTargetAllowsBoardShortcut } from '../lib/boardFlipShortcut';

export type StudyKeyboardActions = {
  enabled?: boolean;
  goPrev: () => void;
  goNext: () => void;
  goStart: () => void;
  goEnd: () => void;
  flipBoard: () => void;
  toggleEngine: () => void;
  toggleBestMoveArrows: () => void;
  toggleVariationArrows: () => void;
  toggleEvalBar: () => void;
  toggleThreats?: () => void;
  toggleInlineNotation?: () => void;
  toggleSettingsPanel: () => void;
  openHelp: () => void;
  playBestMove?: () => void;
  canPlayBestMove?: boolean;
  undo?: () => void;
  canUndo?: boolean;
};

export function useStudyKeyboardShortcuts(actions: StudyKeyboardActions) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (actionsRef.current.enabled === false) return;
      if (!keyboardTargetAllowsBoardShortcut(e)) return;

      const a = actionsRef.current;
      const key = e.key;
      const lower = key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && lower === 'z') {
        if (a.canUndo && a.undo) {
          e.preventDefault();
          a.undo();
        }
        return;
      }

      if (e.shiftKey && lower === 'i') {
        if (a.toggleInlineNotation) {
          e.preventDefault();
          a.toggleInlineNotation();
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (key === ' ' || key === 'Spacebar') {
        if (a.canPlayBestMove && a.playBestMove) {
          e.preventDefault();
          a.playBestMove();
        }
        return;
      }

      if (key === 'ArrowLeft' || lower === 'k') {
        e.preventDefault();
        a.goPrev();
        return;
      }
      if (key === 'ArrowRight' || lower === 'j') {
        e.preventDefault();
        a.goNext();
        return;
      }
      if (key === 'ArrowUp') {
        e.preventDefault();
        a.goEnd();
        return;
      }
      if (key === 'ArrowDown') {
        e.preventDefault();
        a.goStart();
        return;
      }

      if (isBoardFlipShortcutKey(e)) {
        e.preventDefault();
        a.flipBoard();
        return;
      }

      if (lower === 'l') {
        e.preventDefault();
        a.toggleEngine();
        return;
      }
      if (lower === 'a') {
        e.preventDefault();
        a.toggleBestMoveArrows();
        return;
      }
      if (lower === 'v') {
        e.preventDefault();
        a.toggleVariationArrows();
        return;
      }
      if (lower === 'h') {
        e.preventDefault();
        a.toggleSettingsPanel();
        return;
      }
      if (lower === 'x') {
        if (a.toggleThreats) {
          e.preventDefault();
          a.toggleThreats();
        }
        return;
      }
      if (key === '?' || (e.shiftKey && key === '/')) {
        e.preventDefault();
        a.openHelp();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
