import React from 'react';

/** Satranç antrenörü — 3D tarzı düz illüstrasyon */
export const DashboardMascot: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 200 220"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden
  >
    {/* gölge */}
    <ellipse cx="100" cy="208" rx="52" ry="10" fill="#000" fillOpacity="0.18" />

    {/* megafon */}
    <path d="M148 72 L178 58 L178 98 L148 84 Z" fill="#FBBF24" />
    <path d="M148 76 L168 66 L168 90 L148 80 Z" fill="#F59E0B" />
    <rect x="138" y="74" width="14" height="10" rx="3" fill="#D97706" />
    <path d="M178 64 Q188 78 178 92" stroke="#FDE68A" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />
    <path d="M182 60 Q195 78 182 96" stroke="#FDE68A" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.45" />

    {/* vücut */}
    <path d="M72 118 Q100 108 128 118 L132 168 Q100 178 68 168 Z" fill="#4F46E5" />
    <path d="M82 122 Q100 116 118 122 L120 158 Q100 164 80 158 Z" fill="#6366F1" />

    {/* yaka */}
    <path d="M88 118 L100 128 L112 118" stroke="#C7D2FE" strokeWidth="3" strokeLinecap="round" fill="none" />

    {/* kafa */}
    <circle cx="100" cy="82" r="34" fill="#FCD9B6" />
    <circle cx="100" cy="86" r="30" fill="#FBBF98" />

    {/* saç */}
    <path d="M68 78 Q72 48 100 44 Q128 48 132 78 Q125 62 100 58 Q75 62 68 78" fill="#1E293B" />
    <path d="M70 76 Q74 56 100 52 Q126 56 130 76" fill="#334155" />

    {/* gözler */}
    <ellipse cx="88" cy="84" rx="4" ry="5" fill="#1E293B" />
    <ellipse cx="112" cy="84" rx="4" ry="5" fill="#1E293B" />
    <circle cx="89" cy="83" r="1.5" fill="#fff" />
    <circle cx="113" cy="83" r="1.5" fill="#fff" />

    {/* gülümseme */}
    <path d="M92 96 Q100 102 108 96" stroke="#B45309" strokeWidth="2.5" strokeLinecap="round" fill="none" />

    {/* yanak */}
    <circle cx="80" cy="92" r="5" fill="#FDA4AF" fillOpacity="0.45" />
    <circle cx="120" cy="92" r="5" fill="#FDA4AF" fillOpacity="0.45" />

    {/* sol kol + megafon tutuş */}
    <path d="M68 122 Q48 108 52 88 Q54 78 62 82" stroke="#FBBF98" strokeWidth="14" strokeLinecap="round" fill="none" />
    <path d="M58 86 L72 78" stroke="#FBBF98" strokeWidth="12" strokeLinecap="round" />

    {/* sağ kol */}
    <path d="M132 122 Q152 112 148 96" stroke="#FBBF98" strokeWidth="14" strokeLinecap="round" fill="none" />

    {/* satranç şahı */}
    <rect x="138" y="148" width="36" height="36" rx="8" fill="#0F172A" fillOpacity="0.15" />
    <path d="M152 176 L148 164 L154 158 L160 164 L156 176 Z" fill="#1E293B" />
    <circle cx="154" cy="154" r="5" fill="#1E293B" />
    <rect x="150" y="160" width="8" height="6" rx="1" fill="#1E293B" />
    <rect x="147" y="166" width="14" height="5" rx="1" fill="#334155" />
    <rect x="145" y="171" width="18" height="5" rx="1.5" fill="#1E293B" />
  </svg>
);
