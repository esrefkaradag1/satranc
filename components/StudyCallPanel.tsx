/**
 * Sesli/görüntülü arama paneli — antrenör ve öğrenci aynı çalışmada araç içi görüşme
 * (Refactored to be a controlled component using useStudyCall hook)
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, X } from 'lucide-react';
import {
  getLocalMediaStream,
  isMediaSupported,
  type StudyCallStatus,
} from '../services/studyCall';
import { useApp } from '../AppContext';

export interface StudyCallPanelProps {
  role: 'coach' | 'student';
  onClose: () => void;
  status: StudyCallStatus;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  incomingOffer: RTCSessionDescriptionInit | null;
  error: string | null;
  startCall: (stream?: MediaStream | null) => Promise<void>;
  acceptCall: (offer: RTCSessionDescriptionInit, stream?: MediaStream | null) => Promise<void>;
  endCall: () => void;
}

const StudyCallPanel: React.FC<StudyCallPanelProps> = ({
  role,
  onClose,
  status,
  localStream,
  remoteStream,
  incomingOffer,
  error,
  startCall,
  acceptCall,
  endCall,
}) => {
  const { showToast } = useApp();
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [starting, setStarting] = useState(false);
  const [mediaRequesting, setMediaRequesting] = useState(false);
  const [internalLocalStream, setInternalLocalStream] = useState<MediaStream | null>(null);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Sync internalLocalStream with prop localStream
  useEffect(() => {
    if (localStream) {
      setInternalLocalStream(localStream);
    }
  }, [localStream]);

  const setLocalVideoRef = useCallback((el: HTMLVideoElement | null) => {
    (localVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    if (el && internalLocalStream) {
      el.srcObject = internalLocalStream;
      el.play().catch(() => {});
    }
  }, [internalLocalStream]);

  useEffect(() => {
    const video = localVideoRef.current;
    if (internalLocalStream && video) {
      video.srcObject = internalLocalStream;
      video.play().catch(() => {});
    }
  }, [internalLocalStream]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (remoteStream && video) {
      video.srcObject = remoteStream;
      video.play().catch(() => {});
    }
  }, [remoteStream]);

  const handleStartCall = useCallback(async () => {
    console.log('[StudyCallPanel] handleStartCall clicked');
    setStarting(true);
    try {
      await startCall(internalLocalStream);
    } finally {
      setStarting(false);
    }
  }, [startCall, internalLocalStream]);

  const handleAcceptCall = useCallback(async () => {
    console.log('[StudyCallPanel] handleAcceptCall clicked');
    if (!incomingOffer) return;
    await acceptCall(incomingOffer, internalLocalStream);
  }, [acceptCall, incomingOffer, internalLocalStream]);

  const handleStartCamera = useCallback(() => {
    setMediaRequesting(true);
    getLocalMediaStream(true, true)
      .then((stream) => {
        setMediaRequesting(false);
        setInternalLocalStream(stream);
      })
      .catch((e) => {
        console.error('[StudyCall] Kamera hatası:', e);
        setMediaRequesting(false);
        showToast(e instanceof Error ? e.message : 'Kamera açılamadı', 'error');
      });
  }, [showToast]);

  const toggleVideo = useCallback(() => {
    internalLocalStream?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setVideoEnabled((v) => !v);
  }, [internalLocalStream]);

  const toggleAudio = useCallback(() => {
    internalLocalStream?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setAudioEnabled((a) => !a);
  }, [internalLocalStream]);

  const handleEndCall = useCallback(() => {
    endCall();
    onClose();
  }, [endCall, onClose]);

  if (!isMediaSupported()) {
    return (
      <div className="rounded-2xl bg-slate-800 border border-slate-700 p-6 text-center">
        <p className="text-slate-400 text-sm">Tarayıcınız kamera/mikrofon desteklemiyor.</p>
        <button type="button" onClick={onClose} className="mt-4 px-4 py-2 rounded-xl bg-slate-700 text-white text-sm">Kapat</button>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-800/95 border border-slate-700 border-teal-500/30 shadow-2xl flex flex-col w-full max-w-lg mx-auto min-h-[340px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
        <span className="flex items-center gap-2 text-teal-400 font-bold text-sm">
          <Phone className="w-4 h-4" /> Görüntülü görüşme
        </span>
        <button type="button" onClick={handleEndCall} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>
      {!internalLocalStream && !error && (
        <p className="px-4 pt-2 text-[10px] text-slate-500 shrink-0">Kamera bu kutunun içinde açılır. Önce <strong>Kamerayı başlat</strong>a tıklayın.</p>
      )}

      <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
        {!internalLocalStream && !error && !incomingOffer && (
          <div className="rounded-xl bg-teal-500/15 border border-teal-500/40 p-4 text-center space-y-3">
            <p className="text-teal-200 text-sm font-medium">Kamera ve mikrofon için izin gerekiyor.</p>
            <button
              type="button"
              onClick={handleStartCamera}
              disabled={mediaRequesting}
              className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-70 text-white font-bold flex items-center justify-center gap-2"
            >
              {mediaRequesting ? 'Açılıyor…' : <><Video className="w-5 h-5" /> Kamerayı başlat</>}
            </button>
          </div>
        )}
        
        {error && (
          <div className="rounded-xl bg-rose-500/20 border border-rose-500/40 p-4 text-center space-y-2">
            <p className="text-rose-300 text-sm font-medium">{error}</p>
            <button
              type="button"
              onClick={handleStartCamera}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium"
            >
              Tekrar dene
            </button>
          </div>
        )}

        {incomingOffer && status === 'idle' && (
          <div className="rounded-xl bg-amber-500/20 border border-amber-500/40 p-4 flex flex-col gap-3">
            <p className="text-amber-200 text-sm font-medium">Gelen arama</p>
            <div className="flex gap-2">
              <button type="button" onClick={handleAcceptCall} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-bold">
                Kabul et
              </button>
              <button type="button" onClick={() => endCall()} className="flex-1 py-2.5 rounded-xl bg-slate-600 hover:bg-slate-500 text-white text-sm font-bold">
                Reddet
              </button>
            </div>
          </div>
        )}

        {(status === 'connecting' || status === 'connected' || internalLocalStream || remoteStream) && (
          <>
            <div className="w-full rounded-xl overflow-hidden bg-slate-900 relative" style={{ minHeight: 220, aspectRatio: '16/10' }}>
              {remoteStream ? (
                <>
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <span className="absolute bottom-2 left-2 text-[10px] text-white/90 bg-black/60 px-2 py-0.5 rounded z-10">Karşı taraf</span>
                </>
              ) : (
                <>
                  <video
                    ref={setLocalVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover mirror opacity-70"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/45">
                    <span className="text-xs text-slate-200 bg-black/55 px-2.5 py-1 rounded">Karşı taraf bekleniyor...</span>
                  </div>
                </>
              )}
            </div>
            {(status === 'connecting' || status === 'connected') && (
              <div className="flex items-center justify-center gap-2">
                <button type="button" onClick={toggleAudio} className={`p-3 rounded-xl ${audioEnabled ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-rose-600/80 text-white'}`}>
                  {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button type="button" onClick={toggleVideo} className={`p-3 rounded-xl ${videoEnabled ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-rose-600/80 text-white'}`}>
                  {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
                <button type="button" onClick={handleEndCall} className="p-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white">
                  <PhoneOff className="w-5 h-5" />
                </button>
              </div>
            )}
          </>
        )}

        {status === 'idle' && !incomingOffer && role === 'coach' && internalLocalStream && (
          <button
            type="button"
            onClick={handleStartCall}
            disabled={starting}
            className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-70 text-white font-bold flex items-center justify-center gap-2"
          >
            {starting ? 'Bağlanıyor…' : <><Phone className="w-5 h-5" /> Öğrenciyi ara</>}
          </button>
        )}
      </div>
      <style>{`.mirror { transform: scaleX(-1); }`}</style>
    </div>
  );
};

export default StudyCallPanel;
