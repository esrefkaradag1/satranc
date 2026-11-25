import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  chessduelloStudentSummary,
  type ChessDuelloStudentSummary,
} from '../../lib/chessduelloClient';
import ChessDuelloSummaryView from './ChessDuelloSummaryView';

/** Öğrenci / veli özetinde ChessDuello kartı — yalnızca eşlenmiş öğrencide görünür. */
export default function StudentChessDuelloSummary({
  studentId,
  memberId,
}: {
  studentId: string;
  memberId?: string | null;
}) {
  const [data, setData] = useState<ChessDuelloStudentSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!memberId?.trim()) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    chessduelloStudentSummary(studentId)
      .then((r) => {
        if (!cancelled) setData(r.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, memberId]);

  const { member, training, analytics } = data ?? {};

  if (!memberId?.trim()) return null;
  if (!loading && (!data?.linked || (!member && !training && !analytics))) return null;

  return (
    <section className="rounded-3xl border border-white/[0.07] bg-slate-900/60 overflow-hidden shadow-xl shadow-black/20">
      {loading && !data ? (
        <div className="flex items-center gap-2 px-6 py-10 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> ChessDuello yükleniyor…
        </div>
      ) : (
        <ChessDuelloSummaryView member={member} training={training} analytics={analytics} />
      )}
    </section>
  );
}
