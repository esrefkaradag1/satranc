import { useState, useEffect, useCallback, useRef } from 'react';
import { createStudyCall, StudyCallStatus, StudyCallCallbacks } from '../services/studyCall';

export function useStudyCall(studyId: string | null, displayName: string, role: 'coach' | 'student') {
  const [status, setStatus] = useState<StudyCallStatus>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<RTCSessionDescriptionInit | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const callRef = useRef<ReturnType<typeof createStudyCall> | null>(null);

  useEffect(() => {
    console.log(`[useStudyCall] Init studyId=${studyId}, displayName=${displayName}, role=${role}`);
    if (!studyId || !displayName) {
      callRef.current = null;
      return;
    }

    const call = createStudyCall(studyId, displayName, {
      onLocalStream: (s) => setLocalStream(s),
      onRemoteStream: (s) => setRemoteStream(s),
      onStatus: (s) => setStatus(s),
      onError: (m) => setError(m),
    });

    callRef.current = call;

    if (role === 'student') {
      call.subscribeForIncomingOffer((offer) => {
        setIncomingOffer(offer);
      });
    }

    return () => {
      call.endCall();
      callRef.current = null;
    };
  }, [studyId, displayName, role]);

  const startCall = useCallback(async (stream?: MediaStream | null) => {
    if (callRef.current) {
      await callRef.current.startCall(stream);
    }
  }, []);

  const acceptCall = useCallback(async (offer: RTCSessionDescriptionInit, stream?: MediaStream | null) => {
    if (callRef.current) {
      await callRef.current.acceptCall(offer, stream);
      setIncomingOffer(null);
    }
  }, []);

  const endCall = useCallback(() => {
    if (callRef.current) {
      callRef.current.resetConnection();
      setIncomingOffer(null);
      setLocalStream(null);
      setRemoteStream(null);
      setStatus('idle');
    }
  }, []);

  return {
    status,
    localStream,
    remoteStream,
    incomingOffer,
    error,
    startCall,
    acceptCall,
    endCall,
    setIncomingOffer,
  };
}
