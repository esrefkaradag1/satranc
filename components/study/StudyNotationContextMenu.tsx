import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type StudyNotationMenuPoint = { x: number; y: number };

function clampMenuPoint(x: number, y: number, width = 210, height = 150): StudyNotationMenuPoint {
  return {
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8)),
  };
}

type StudyNotationContextMenuProps = {
  open: StudyNotationMenuPoint | null;
  onClose: () => void;
  children: React.ReactNode;
};

export function StudyNotationContextMenu({ open, onClose, children }: StudyNotationContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open, onClose]);

  if (!open) return null;

  const { x, y } = clampMenuPoint(open.x, open.y);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] glass-card rounded-xl border border-white/10 shadow-2xl py-1 min-w-[200px] overflow-hidden animate-in zoom-in-95"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function openStudyNotationMenuFromEvent(e: React.MouseEvent): StudyNotationMenuPoint {
  e.preventDefault();
  e.stopPropagation();
  return { x: e.clientX, y: e.clientY };
}

export function studyMoveCellButtonClass(isActive: boolean, isVar = false): string {
  const base =
    'w-full min-h-[1.75rem] h-full flex items-center justify-start gap-1 px-2 rounded-md font-bold transition-colors text-left';
  if (isActive) return `${base} bg-[#3692e7] text-white shadow-sm`;
  if (isVar) return `${base} text-slate-300 hover:bg-white/10`;
  return `${base} text-slate-200 hover:bg-white/10`;
}

export const STUDY_NOTATION_MOVE_CELL = 'min-w-0 flex items-stretch self-stretch';
