import React from 'react';

export const quickMenuColors: Record<string, string> = {
  indigo: 'from-indigo-600/90 to-indigo-800/90 hover:shadow-indigo-500/20',
  violet: 'from-violet-600/90 to-violet-800/90 hover:shadow-violet-500/20',
  emerald: 'from-emerald-600/90 to-emerald-800/90 hover:shadow-emerald-500/20',
  sky: 'from-sky-600/90 to-sky-800/90 hover:shadow-sky-500/20',
  amber: 'from-amber-600/90 to-amber-800/90 hover:shadow-amber-500/20',
  rose: 'from-rose-600/90 to-rose-800/90 hover:shadow-rose-500/20',
};

export const QuickStatCard: React.FC<{
  icon: React.ReactNode;
  value: string;
  label: string;
  sub: string;
  bg: string;
  onClick?: () => void;
}> = ({ icon, value, label, sub, bg, onClick }) => {
  const cls = `group relative flex flex-col items-center justify-center rounded-2xl bg-gradient-to-b ${bg} h-[128px] sm:h-[132px] px-2 text-white shadow-lg overflow-hidden transition-transform hover:scale-[1.02] active:scale-[0.98] ring-1 ring-white/10 backdrop-blur-sm w-full`;
  const inner = (
    <>
      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors" />
      <div className="relative w-9 h-9 rounded-full bg-white/15 flex items-center justify-center mb-2 border border-white/20">{icon}</div>
      <p className="relative text-xl sm:text-2xl font-black tabular-nums leading-none">{value}</p>
      <p className="relative text-[10px] font-bold uppercase tracking-wide mt-1 opacity-90 text-center">{label}</p>
      <p className="relative text-[9px] text-white/60 mt-0.5 text-center">{sub}</p>
    </>
  );
  if (onClick) {
    return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  }
  return <div className={cls}>{inner}</div>;
};

export const QuickMenuButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
}> = ({ icon, label, color, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`group flex flex-col items-center justify-center gap-2 p-3 sm:p-4 rounded-2xl bg-gradient-to-br ${quickMenuColors[color]} text-white shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 active:translate-y-0 border border-white/10 w-full`}
  >
    <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20 group-hover:bg-white/25 transition-colors">
      {icon}
    </div>
    <span className="text-[10px] sm:text-[11px] font-bold text-center leading-tight">{label}</span>
  </button>
);
