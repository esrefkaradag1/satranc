import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';

export type AccountDropdownItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger';
};

type Accent = 'indigo' | 'amber' | 'emerald';

interface AccountDropdownProps {
  name: string;
  subtitle?: string;
  photoUrl?: string;
  initials?: string;
  items?: AccountDropdownItem[];
  onLogout?: () => void;
  accent?: Accent;
  align?: 'left' | 'right';
  showIdentity?: boolean;
  avatarClassName?: string;
  menuClassName?: string;
  triggerClassName?: string;
}

function nameInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'U';
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

const ACCENT_STYLES: Record<Accent, { avatar: string; fallback: string }> = {
  indigo: {
    avatar: 'border-indigo-500/25 shadow-indigo-500/10',
    fallback: 'bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border-indigo-500/25 text-indigo-300 shadow-indigo-500/10',
  },
  amber: {
    avatar: 'border-amber-500/35 shadow-amber-500/10',
    fallback: 'bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-500/35 text-amber-300 shadow-amber-500/10',
  },
  emerald: {
    avatar: 'border-emerald-500/30 shadow-emerald-500/10',
    fallback: 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-300 shadow-emerald-500/10',
  },
};

const AccountDropdown: React.FC<AccountDropdownProps> = ({
  name,
  subtitle,
  photoUrl,
  initials,
  items = [],
  onLogout,
  accent = 'indigo',
  align = 'right',
  showIdentity = true,
  avatarClassName = 'w-10 h-10 rounded-xl',
  menuClassName = 'w-72',
  triggerClassName,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const accentStyles = ACCENT_STYLES[accent];
  const fallbackInitials = useMemo(() => initials || nameInitials(name), [initials, name]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={
          triggerClassName ||
          'group flex items-center gap-2 sm:gap-4 rounded-2xl px-1.5 py-1.5 hover:bg-white/[0.04] transition-colors'
        }
      >
        {showIdentity ? (
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold tracking-tight text-slate-200 truncate max-w-[140px] lg:max-w-none">
              {name}
            </p>
            {subtitle ? (
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{subtitle}</p>
            ) : null}
          </div>
        ) : null}

        {photoUrl ? (
          <img
            src={photoUrl}
            alt={name}
            referrerPolicy="no-referrer"
            className={`${avatarClassName} object-cover border shadow-md ${accentStyles.avatar} shrink-0`}
          />
        ) : (
          <div
            className={`${avatarClassName} border shadow-md ${accentStyles.fallback} flex items-center justify-center font-black text-sm shrink-0`}
          >
            {fallbackInitials.slice(0, 2)}
          </div>
        )}

        <ChevronDown
          className={`hidden sm:block w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-3 ${menuClassName} overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#1b2233]/95 backdrop-blur-2xl shadow-2xl shadow-black/40 z-50`}
        >
          <div className="p-4 border-b border-white/8">
            <div className="text-lg font-semibold text-white truncate">{name}</div>
            {subtitle ? <div className="text-sm text-slate-400 mt-1 truncate">{subtitle}</div> : null}
          </div>

          <div className="p-2 space-y-1.5">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors ${
                  item.tone === 'danger'
                    ? 'text-rose-300 hover:bg-rose-500/10'
                    : 'text-slate-200 hover:bg-white/[0.06]'
                }`}
              >
                <span className={`${item.tone === 'danger' ? 'text-rose-400' : 'text-slate-400'} shrink-0`}>
                  {item.icon}
                </span>
                <span className="text-sm font-medium truncate">{item.label}</span>
              </button>
            ))}

            {onLogout ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left text-rose-300 hover:bg-rose-500/10 transition-colors"
              >
                <span className="text-rose-400 shrink-0">
                  <LogOut className="w-5 h-5" />
                </span>
                <span className="text-sm font-medium truncate">Çıkış Yap</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AccountDropdown;
