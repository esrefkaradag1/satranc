import { useCallback, useEffect, useRef, useState } from 'react';
import {
  detectExternalGamePasteKind,
  studentBoardFromPaste,
  type ExternalGamePasteKind,
} from '../lib/externalGamePaste';
import { parseExternalGameLink, normalizeExternalGamePasteInput } from '../lib/externalGameLink';
import {
  externalSnapshotToStudentBoard,
  fetchExternalGameSnapshotByLink,
  fetchLichessOAuthLiveSnapshot,
} from '../services/externalGameShareClient';
import type { LiveStudentBoardSnapshot } from '../components/LiveLesson';

const POLL_MS = 4000;

export type StudentGameShareMode = 'off' | 'link' | 'paste' | 'lichess-oauth';

type Options = {
  studentId: string;
  enabled: boolean;
  lichessOauthConnected: boolean;
  onPublish: (snapshot: LiveStudentBoardSnapshot) => void;
  onStop: () => void;
  onOAuthLost?: () => void;
};

export function useStudentExternalGameShare({
  studentId,
  enabled,
  lichessOauthConnected,
  onPublish,
  onStop,
  onOAuthLost,
}: Options) {
  const [mode, setMode] = useState<StudentGameShareMode>('off');
  const [linkInput, setLinkInput] = useState('');
  const [activeLink, setActiveLink] = useState('');
  const [activePaste, setActivePaste] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastLabel, setLastLabel] = useState<string | null>(null);
  const modeRef = useRef(mode);
  const linkRef = useRef(activeLink);
  const pasteRef = useRef(activePaste);
  modeRef.current = mode;
  linkRef.current = activeLink;
  pasteRef.current = activePaste;

  const publishPaste = useCallback(
    (raw: string): boolean => {
      const board = studentBoardFromPaste(raw);
      if (!board) return false;
      onPublish({
        fen: board.fen,
        moves: board.moves,
        baseFen: board.baseFen,
        source: board.source,
        gameId: board.gameId,
        gameUrl: board.gameUrl,
        label: board.label,
        shareKind: board.shareKind,
        pastePayload: board.pastePayload,
        updatedAt: new Date().toISOString(),
      });
      setLastLabel(board.label);
      return true;
    },
    [onPublish],
  );

  const pullSnapshot = useCallback(async () => {
    if (!enabled || !studentId.trim()) return;
    setLoading(true);
    try {
      if (modeRef.current === 'lichess-oauth') {
        const res = await fetchLichessOAuthLiveSnapshot(studentId);
        if (!res.connected) {
          onOAuthLost?.();
          setStatus(res.error || 'Lichess OAuth bağlı değil — hesabı yeniden bağlayın');
          return;
        }
        if (!res.snapshot) {
          setStatus(res.error || 'Devam eden oyun yok');
          return;
        }
        const board = externalSnapshotToStudentBoard(res.snapshot);
        onPublish({ ...board, shareKind: 'link' });
        setLastLabel(board.label ?? 'Lichess canlı oyun');
        setStatus(res.snapshot.isFinished ? 'Oyun bitti' : 'Canlı senkron aktif');
        return;
      }

      if (modeRef.current === 'paste') {
        const raw = pasteRef.current.trim();
        if (!raw) {
          setStatus('PGN veya FEN yapıştırın');
          return;
        }
        if (!publishPaste(raw)) {
          setStatus('PGN/FEN okunamadı — Chess.com Paylaş → PGN sekmesinden kopyalayın');
          return;
        }
        setStatus('Konum paylaşıldı — yeni hamlelerde PGN\'i güncelleyip yeniden paylaşın');
        return;
      }

      const link = normalizeExternalGamePasteInput(linkRef.current);
      if (!link) {
        setStatus('Oyun linki girin');
        return;
      }
      const parsed = parseExternalGameLink(link);
      if (!parsed) {
        setStatus('Geçerli Lichess veya Chess.com linki değil');
        return;
      }
      const res = await fetchExternalGameSnapshotByLink(link);
      if (!res.snapshot) {
        setStatus(res.error || 'Konum alınamadı');
        return;
      }
      const board = externalSnapshotToStudentBoard(res.snapshot);
      onPublish({ ...board, shareKind: 'link' });
      setLastLabel(board.label ?? parsed.platform);
      setStatus(
        res.snapshot.isFinished
          ? 'Oyun bitti — son konum paylaşıldı'
          : `${parsed.platform === 'lichess' ? 'Lichess' : 'Chess.com'} canlı senkron`,
      );
    } finally {
      setLoading(false);
    }
  }, [enabled, studentId, onPublish, onOAuthLost, publishPaste]);

  const startShare = useCallback(async () => {
    const trimmed = normalizeExternalGamePasteInput(linkInput);
    if (!trimmed) {
      setStatus('PGN, FEN, embed kodu veya oyun linki yapıştırın');
      return;
    }

    const kind: ExternalGamePasteKind | null = detectExternalGamePasteKind(trimmed);
    if (!kind) {
      setStatus('Tanınmadı. Bot için Paylaş → PGN veya Embed sekmesini kopyalayın.');
      return;
    }

    if (kind === 'pgn' || kind === 'fen') {
      setActivePaste(trimmed);
      setActiveLink('');
      setMode('paste');
      setStatus('Paylaşılıyor…');
      await pullSnapshot();
      return;
    }

    const parsed = parseExternalGameLink(trimmed);
    if (!parsed) {
      setStatus('Geçerli oyun linki veya embed kodu değil');
      return;
    }
    setActiveLink(trimmed);
    setActivePaste('');
    setMode('link');
    setStatus('Bağlanıyor…');
    await pullSnapshot();
  }, [linkInput, pullSnapshot]);

  const startLichessAutoShare = useCallback(async () => {
    if (!lichessOauthConnected) {
      setStatus('Önce Lichess hesabınızı bağlayın');
      return;
    }
    setMode('lichess-oauth');
    setStatus('Lichess oyunu aranıyor…');
    await pullSnapshot();
  }, [lichessOauthConnected, pullSnapshot]);

  const stopShare = useCallback(() => {
    setMode('off');
    setActiveLink('');
    setActivePaste('');
    setStatus(null);
    setLastLabel(null);
    onStop();
  }, [onStop]);

  useEffect(() => {
    if (!enabled || mode === 'off' || mode === 'paste') return;
    const id = window.setInterval(() => {
      void pullSnapshot();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, mode, pullSnapshot]);

  const inputKind = detectExternalGamePasteKind(linkInput);

  return {
    mode,
    linkInput,
    setLinkInput,
    inputKind,
    status,
    loading,
    lastLabel,
    startLinkShare: startShare,
    startLichessAutoShare,
    stopShare,
    refreshNow: pullSnapshot,
  };
}
