import React, { useCallback, useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound } from 'lucide-react';
import type { Student } from '../../types';

function buildLoginClipboardText(student: Student): string {
  const lines = [`Öğrenci: ${student.name}`];
  if (student.username?.trim()) lines.push(`Kullanıcı adı: ${student.username.trim()}`);
  if (student.password?.trim()) lines.push(`Şifre: ${student.password.trim()}`);
  if (student.parentPin?.trim()) lines.push(`Veli PIN: ${student.parentPin.trim()}`);
  return lines.join('\n');
}

type Props = {
  student: Student;
  onCopied?: () => void;
};

export const StudentLoginQuickInfo: React.FC<Props> = ({ student, onCopied }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const username = student.username?.trim() || '';
  const password = student.password?.trim() || '';
  const parentPin = student.parentPin?.trim() || '';
  const hasAny = Boolean(username || password || parentPin);

  const copyAll = useCallback(() => {
    if (!hasAny) return;
    void navigator.clipboard?.writeText(buildLoginClipboardText(student)).then(() => {
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 2000);
    });
  }, [hasAny, onCopied, student]);

  if (!hasAny) {
    return <span className="text-xs text-slate-500">Giriş bilgisi yok</span>;
  }

  return (
    <div className="space-y-1 min-w-[9rem] max-w-[11rem]">
      {username ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[9px] font-bold uppercase text-slate-500 shrink-0">K.adı</span>
          <span className="text-[11px] font-mono text-slate-200 truncate" title={username}>
            {username}
          </span>
        </div>
      ) : null}
      {password ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[9px] font-bold uppercase text-slate-500 shrink-0">Şifre</span>
          <span className="text-[11px] font-mono text-slate-200 truncate flex-1" title={showPassword ? password : undefined}>
            {showPassword ? password : '••••••••'}
          </span>
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="p-0.5 rounded text-slate-500 hover:text-slate-300 shrink-0"
            title={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
          >
            {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
        </div>
      ) : null}
      {parentPin ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[9px] font-bold uppercase text-slate-500 shrink-0">Veli</span>
          <span className="text-[11px] font-mono text-violet-300/90 truncate" title={`Veli PIN: ${parentPin}`}>
            {parentPin}
          </span>
        </div>
      ) : null}
      <button
        type="button"
        onClick={copyAll}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/50 text-[10px] font-bold text-slate-300 transition-colors"
        title="Giriş bilgilerini kopyala"
      >
        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Kopyalandı' : 'Kopyala'}
      </button>
    </div>
  );
};

type InlineProps = {
  student: Student;
  onCopied?: () => void;
};

/** Mobil kart ve dar alanlar için yatay özet */
export const StudentLoginQuickInfoInline: React.FC<InlineProps> = ({ student, onCopied }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const username = student.username?.trim() || '';
  const password = student.password?.trim() || '';
  const hasAny = Boolean(username || password || student.parentPin?.trim());

  const copyAll = useCallback(() => {
    if (!hasAny) return;
    void navigator.clipboard?.writeText(buildLoginClipboardText(student)).then(() => {
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 2000);
    });
  }, [hasAny, onCopied, student]);

  if (!hasAny) return null;

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500">
        <KeyRound className="w-3 h-3" />
        Giriş bilgisi
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {username ? (
          <span>
            <span className="text-slate-500">K.adı:</span>{' '}
            <span className="font-mono text-slate-200">{username}</span>
          </span>
        ) : null}
        {password ? (
          <span className="inline-flex items-center gap-1">
            <span className="text-slate-500">Şifre:</span>{' '}
            <span className="font-mono text-slate-200">{showPassword ? password : '••••••••'}</span>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="p-0.5 text-slate-500 hover:text-slate-300"
            >
              {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          </span>
        ) : null}
        {student.parentPin?.trim() ? (
          <span>
            <span className="text-slate-500">Veli PIN:</span>{' '}
            <span className="font-mono text-violet-300">{student.parentPin.trim()}</span>
          </span>
        ) : null}
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:text-indigo-300"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Kopyalandı' : 'Kopyala'}
        </button>
      </div>
    </div>
  );
};
