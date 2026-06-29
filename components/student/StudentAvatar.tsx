import React from 'react';
import type { Student } from '../types';
import { isDisplayablePhotoUrl } from '../../lib/studentPhotoUpload';

function studentInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

type Props = {
  student: Student;
  applicationPhotos?: Record<string, string>;
  className?: string;
};

const StudentAvatar: React.FC<Props> = ({ student, applicationPhotos, className = 'w-10 h-10' }) => {
  const photoUrl =
    (isDisplayablePhotoUrl(student.photoUrl) ? student.photoUrl : undefined) ||
    applicationPhotos?.[student.id];

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={student.name}
        className={`${className} rounded-lg object-cover border border-indigo-500/20 shrink-0`}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className={`${className} rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm shrink-0`}
    >
      {studentInitials(student.name)}
    </div>
  );
};

export default StudentAvatar;
