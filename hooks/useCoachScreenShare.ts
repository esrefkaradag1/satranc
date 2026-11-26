import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import AgoraRTC, { type IAgoraRTCClient, type ICameraVideoTrack, type ILocalVideoTrack } from 'agora-rtc-sdk-ng';

interface Options {
  clientRef: MutableRefObject<IAgoraRTCClient | null>;
  cameraTrackRef: MutableRefObject<ICameraVideoTrack | null>;
  /** Oda değişince / dersten çıkınca paylaşım kapatılır */
  roomKey: string;
  /** Paylaşım durumu değişti (öğrencilere bildirmek için) */
  onActiveChange: (active: boolean) => void;
  onError: (message: string) => void;
}

/**
 * Antrenörün ekran paylaşımı. Agora'da istemci başına tek video yayını olabildiğinden
 * paylaşım boyunca kamera yayından çekilir, paylaşım bitince geri yayınlanır (mikrofon hep açık kalır).
 */
export function useCoachScreenShare({ clientRef, cameraTrackRef, roomKey, onActiveChange, onError }: Options) {
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const screenTrackRef = useRef<ILocalVideoTrack | null>(null);
  const busyRef = useRef(false);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

  const republishCamera = useCallback(async () => {
    const client = clientRef.current;
    const camera = cameraTrackRef.current;
    if (!client || !camera || client.connectionState !== 'CONNECTED') return;
    // Kapalı (disabled) track yayınlanamaz: geçici aç, yayınla, eski durumuna döndür.
    const wasEnabled = camera.enabled;
    if (!wasEnabled) await camera.setEnabled(true);
    await client.publish(camera);
    if (!wasEnabled) await camera.setEnabled(false);
  }, [clientRef, cameraTrackRef]);

  const stop = useCallback(async () => {
    const screen = screenTrackRef.current;
    if (!screen) return;
    screenTrackRef.current = null;
    setSharing(false);
    onActiveChangeRef.current(false);
    try {
      await clientRef.current?.unpublish(screen);
    } catch {
      /* bağlantı kapanmış olabilir */
    }
    screen.close();
    try {
      await republishCamera();
    } catch {
      onErrorRef.current('Kamera yeniden açılamadı. Dersten çıkıp tekrar girin.');
    }
  }, [clientRef, republishCamera]);

  const start = useCallback(async () => {
    const client = clientRef.current;
    if (!client || client.connectionState !== 'CONNECTED') {
      onErrorRef.current('Görüntü bağlantısı henüz hazır değil.');
      return;
    }
    let screen: ILocalVideoTrack;
    try {
      // 'detail': satranç tahtası ve yazılar net kalsın.
      screen = await AgoraRTC.createScreenVideoTrack(
        { encoderConfig: '1080p_1', optimizationMode: 'detail' },
        'disable',
      );
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      // Kullanıcı seçim penceresini iptal ettiyse sessizce vazgeç.
      if (!/PERMISSION_DENIED|NotAllowedError|Permission denied/i.test(text)) {
        onErrorRef.current('Ekran paylaşımı başlatılamadı.');
      }
      return;
    }
    try {
      const camera = cameraTrackRef.current;
      if (camera) {
        try {
          await client.unpublish(camera);
        } catch {
          /* yayında değilse sorun yok */
        }
      }
      await client.publish(screen);
    } catch {
      screen.close();
      await republishCamera().catch(() => undefined);
      onErrorRef.current('Ekran paylaşımı yayınlanamadı.');
      return;
    }
    screenTrackRef.current = screen;
    // Tarayıcının kendi "Paylaşımı durdur" düğmesi
    screen.on('track-ended', () => { void stop(); });
    setSharing(true);
    onActiveChangeRef.current(true);
  }, [clientRef, cameraTrackRef, republishCamera, stop]);

  const toggle = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (screenTrackRef.current) await stop();
      else await start();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [start, stop]);

  // Oda değişirse ya da ekran kapanırsa yakalamayı mutlaka bırak (tarayıcı kaydı sürmesin).
  useEffect(() => () => {
    const screen = screenTrackRef.current;
    if (!screen) return;
    screenTrackRef.current = null;
    setSharing(false);
    void clientRef.current?.unpublish(screen).catch(() => undefined);
    screen.close();
  }, [roomKey, clientRef]);

  return { sharing, busy, supported, toggle, stop };
}
