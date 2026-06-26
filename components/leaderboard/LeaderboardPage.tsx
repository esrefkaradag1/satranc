import React, { useCallback, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { useApp } from '../../AppContext';
import { ClubLeaderboard } from './ClubLeaderboard';
import { HomeworkTargetSelector } from '../homework/HomeworkTargetSelector';
import { EMPTY_TARGET, filterStudentsByTarget, type TargetFilter } from '../../lib/homeworkPanelUtils';

const LeaderboardPage: React.FC = () => {
  const {
    scopedStudents: students,
    homeworkAttempts,
    branchOffices,
    scopedDisciplineBranches: disciplineBranches,
    scopedTrainingGroups: trainingGroups,
    activeClubBranch,
    auth,
  } = useApp();

  const visibleBranchOffices = useMemo(
    () => (auth?.role === 'club' && activeClubBranch ? [activeClubBranch] : branchOffices),
    [auth?.role, activeClubBranch, branchOffices],
  );

  const [targetFilter, setTargetFilter] = useState<TargetFilter>(EMPTY_TARGET);

  const handleTargetChange = useCallback((patch: Partial<TargetFilter>) => {
    setTargetFilter((prev) => ({ ...prev, ...patch }));
  }, []);

  const targetStudents = useMemo(
    () => filterStudentsByTarget(students, targetFilter, trainingGroups),
    [students, targetFilter, trainingGroups],
  );

  const anchorStudent = useMemo(() => {
    if (targetFilter.mode === 'student' && targetFilter.studentId) {
      return students.find((s) => s.id === targetFilter.studentId) ?? null;
    }
    if (targetFilter.groupId) {
      const group = trainingGroups.find((g) => g.id === targetFilter.groupId);
      if (group) {
        return students.find(
          (s) => s.trainingGroupId === group.id || (s.group || '').trim() === group.name.trim(),
        ) ?? null;
      }
    }
    if (targetFilter.branchOffice) {
      return students.find((s) => (s.branchOffice || '').trim() === targetFilter.branchOffice) ?? null;
    }
    return null;
  }, [students, targetFilter, trainingGroups]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="rounded-2xl bg-gradient-to-br from-amber-600/15 via-slate-900/50 to-slate-900/50 border border-amber-600/20 p-5 sm:p-6">
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <Trophy className="w-6 h-6 text-amber-400" />
          Lider Tablosu
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Kulüp içi sıralama — aktivite puanı, Lichess/Chess.com rating (Rapid, Blitz, Bullet, Bulmaca), UKD ve FIDE ELO.
        </p>
      </div>

      <HomeworkTargetSelector
        target={targetFilter}
        onChange={handleTargetChange}
        branchOffices={visibleBranchOffices}
        disciplineBranches={disciplineBranches}
        trainingGroups={trainingGroups}
        filteredStudents={targetStudents}
      />

      <ClubLeaderboard
        allStudents={students}
        anchorStudent={anchorStudent}
        homeworkAttempts={homeworkAttempts}
        peerStudentsOverride={targetStudents}
      />
    </div>
  );
};

export default LeaderboardPage;
