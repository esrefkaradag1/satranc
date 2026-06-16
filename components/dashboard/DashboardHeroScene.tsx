import React, { Suspense } from 'react';
import { DashboardMascot } from './DashboardMascot';
import { useDashboard3DEnabled } from './useDashboard3D';

const DashboardHero3D = React.lazy(() => import('./DashboardHero3D'));

export const DashboardHeroScene: React.FC = () => {
  const enabled = useDashboard3DEnabled();

  if (!enabled) {
    return (
      <DashboardMascot className="absolute -right-2 sm:right-2 bottom-0 w-[7.5rem] sm:w-[8.5rem] h-auto drop-shadow-xl pointer-events-none" />
    );
  }

  return (
    <Suspense fallback={null}>
      <div className="absolute right-0 top-0 bottom-0 w-[58%] sm:w-[52%] min-w-[9rem]">
        <DashboardHero3D />
      </div>
    </Suspense>
  );
};
