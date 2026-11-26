import React from 'react';
import { useApp } from '../../AppContext';
import type { Student } from '../../types';

type Platform = 'lichess' | 'chesscom';

const PLATFORMS: Record<Platform, {
  letter: string;
  label: string;
  field: 'lichessUsername' | 'chessComUsername';
  url: (username: string) => string;
  usernamePattern: RegExp;
  activeCls: string;
}> = {
  lichess: {
    letter: 'L',
    label: 'Lichess',
    field: 'lichessUsername',
    // lichess profilindeki "İzle" düğmesinin adresi: oyuncunun süren (yoksa son) maçı.
    url: (u) => `https://lichess.org/@/${encodeURIComponent(u)}/tv`,
    usernamePattern: /^[A-Za-z0-9_-]{2,30}$/,
    activeCls: 'bg-slate-200 text-slate-900 hover:bg-white',
  },
  chesscom: {
    letter: 'C',
    label: 'Chess.com',
    field: 'chessComUsername',
    // chess.com'da herkese açık doğrudan izleme adresi yok; profildeki "İzleyin" düğmesi kullanılır.
    url: (u) => `https://www.chess.com/member/${encodeURIComponent(u)}`,
    usernamePattern: /^[A-Za-z0-9_-]{2,50}$/,
    activeCls: 'bg-emerald-600 text-white hover:bg-emerald-500',
  },
};

/** Girilen değer profil linki olabilir; yalnızca kullanıcı adını al. */
function usernameFromInput(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  const fromUrl = trimmed.match(/(?:lichess\.org\/@\/|chess\.com\/member\/)([^/?#]+)/i);
  return (fromUrl?.[1] ?? trimmed).replace(/^@/, '');
}

/**
 * Canlı derste öğrenci adının yanındaki L / C düğmeleri: platformun kendi sayfasını yeni sekmede açar
 * (API isteği yok). Antrenör oradan maçı izleyip ekranını paylaşabilir.
 * Kullanıcı adı kayıtlı değilse tıklayınca sorulur ve öğrenci kaydına yazılır.
 */
export const PlatformWatchLinks: React.FC<{ student: Student; className?: string }> = ({ student, className = '' }) => {
  const { updateStudent } = useApp();

  const open = (platform: Platform) => {
    const cfg = PLATFORMS[platform];
    let username = student[cfg.field]?.trim() ?? '';
    if (!username) {
      const input = window.prompt(`${student.name} için ${cfg.label} kullanıcı adı:`);
      if (input == null) return;
      username = usernameFromInput(input);
      if (!cfg.usernamePattern.test(username)) {
        window.alert(`Geçersiz ${cfg.label} kullanıcı adı.`);
        return;
      }
      updateStudent(student.id, { [cfg.field]: username });
    }
    window.open(cfg.url(username), '_blank', 'noopener,noreferrer');
  };

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      {(Object.keys(PLATFORMS) as Platform[]).map((platform) => {
        const cfg = PLATFORMS[platform];
        const username = student[cfg.field]?.trim();
        const label = username
          ? `${cfg.label}'ta izle: ${username}`
          : `${cfg.label} kullanıcı adı ekle`;
        return (
          <button
            key={platform}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              open(platform);
            }}
            title={label}
            aria-label={`${student.name} — ${label}`}
            className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-black leading-none transition-colors ${
              username ? cfg.activeCls : 'border border-dashed border-white/25 text-slate-500 hover:text-white hover:border-white/50'
            }`}
          >
            {cfg.letter}
          </button>
        );
      })}
    </span>
  );
};

export default PlatformWatchLinks;
