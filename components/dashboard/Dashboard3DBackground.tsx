import React, { Suspense } from 'react';
import { useDashboard3DEnabled } from './useDashboard3D';

const DashboardScene3D = React.lazy(() => import('./DashboardScene3D'));

type Props = {
  children: React.ReactNode;
};

/** Tüm dashboard içeriğinin arkasında 3D sahne */
export const Dashboard3DBackground: React.FC<Props> = ({ children }) => {
  const enabled = useDashboard3DEnabled();

  return (
    <div className="relative min-h-[720px] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 overflow-hidden">
      {enabled && (
        <Suspense fallback={null}>
          <DashboardScene3D className="absolute inset-0 z-0 w-full h-full min-h-[720px]" />
        </Suspense>
      )}

      {enabled && (
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 100% 80% at 50% 20%, rgba(10,15,30,0.35) 0%, rgba(10,15,30,0.72) 50%, rgba(10,15,30,0.9) 100%)',
          }}
          aria-hidden
        />
      )}

      <div className="relative z-10">{children}</div>
    </div>
  );
};
