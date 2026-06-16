import React, { useState } from 'react';
import ChessComRecentPuzzlesTable from './ChessComRecentPuzzlesTable';
import ChessComPuzzleViewerModal from './ChessComPuzzleViewerModal';
import type { ChessComPuzzleAttempt } from '../services/chessPlatformService';

type ChessComPuzzlesSectionProps = {
  username: string;
};

/** Chess.com bulmaca geçmişi — Oyunlar sekmesiyle aynı mantıkta tam liste */
const ChessComPuzzlesSection: React.FC<ChessComPuzzlesSectionProps> = ({ username }) => {
  const [viewerAttempt, setViewerAttempt] = useState<ChessComPuzzleAttempt | null>(null);

  return (
    <div className="space-y-3">
      <ChessComRecentPuzzlesTable username={username} onPuzzleClick={setViewerAttempt} />
      <p className="text-[10px] text-slate-600 px-1">
        Satıra tıklayınca bulmaca uygulama içinde açılır. Liste Chess.com profilindeki &quot;En Son Bulmacalar&quot; ile
        aynı kaynaktan gelir (~25 kayıt).
      </p>
      <ChessComPuzzleViewerModal attempt={viewerAttempt} onClose={() => setViewerAttempt(null)} />
    </div>
  );
};

export default ChessComPuzzlesSection;
