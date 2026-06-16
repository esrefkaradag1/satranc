/**
 * Çalışma (study) bazlı sesli/görüntülü arama — WebRTC + Supabase Realtime broadcast
 */
import { supabase } from './supabase';

const CHANNEL_PREFIX = 'study-call:';

export type CallSignal = 
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit };

export type StudyCallStatus = 'idle' | 'connecting' | 'connected' | 'ended' | 'error';

export interface StudyCallCallbacks {
  onLocalStream?: (stream: MediaStream | null) => void;
  onRemoteStream?: (stream: MediaStream | null) => void;
  onStatus?: (status: StudyCallStatus) => void;
  onError?: (message: string) => void;
}

export function getCallChannelName(studyId: string): string {
  return `${CHANNEL_PREFIX}${studyId}`;
}

export function isMediaSupported(): boolean {
  return !!(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia);
}

export async function getLocalMediaStream(video = true, audio = true): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: video || false, audio: audio || false });
  } catch (e) {
    const err = e as DOMException;
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      throw new Error('Kamera ve mikrofon izni gerekli. Tarayıcı çubuğundaki kilidi tıklayıp izin verin.');
    }
    throw new Error(err.message || 'Kamera veya mikrofon açılamadı.');
  }
}

export function createStudyCall(
  studyId: string,
  displayName: string,
  callbacks: StudyCallCallbacks = {}
) {
  const channelName = getCallChannelName(studyId);
  const localChannelName = `study-call-local:${studyId}`;
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let localSignalChannel: BroadcastChannel | null = null;
  let pc: RTCPeerConnection | null = null;
  let localStream: MediaStream | null = null;
  let ownsLocalStream = false;
  let remoteStream: MediaStream | null = null;
  const { onLocalStream, onRemoteStream, onStatus, onError } = callbacks;
  const peerId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pendingIce: RTCIceCandidateInit[] = [];
  
  let incomingOfferHandler: ((offer: RTCSessionDescriptionInit) => void) | null = null;

  function setStatus(s: StudyCallStatus) {
    onStatus?.(s);
  }

  async function handleIce(candidate: RTCIceCandidateInit) {
    if (!pc) return;
    if (!pc.remoteDescription) {
      pendingIce.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('[StudyCall] addIceCandidate error', e);
    }
  }

  async function handleOffer(offer: RTCSessionDescriptionInit) {
    if (incomingOfferHandler) {
      incomingOfferHandler(offer);
    }
    // If already in a call or connecting, we might want to ignore or handle conflict
    // But for now, we just pass it to the handler (student UI)
  }

  async function handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!pc) return;
    try {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        while (pendingIce.length > 0) {
          const cand = pendingIce.shift();
          if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand));
        }
      }
    } catch (e) {
      console.error('[StudyCall] handleAnswer error:', e);
    }
  }

  function onSignalReceived(payload: CallSignal & { fromId?: string }) {
    if (payload.fromId === peerId) return;
    console.log(`[StudyCall] Signal received: ${payload.type} from ${payload.fromId}`);
    const { type } = payload;
    if (type === 'offer') handleOffer((payload as any).sdp);
    else if (type === 'answer') handleAnswer((payload as any).sdp);
    else if (type === 'ice') handleIce((payload as any).candidate);
  }

  function setupChannel() {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' && !localSignalChannel) {
      localSignalChannel = new BroadcastChannel(localChannelName);
      localSignalChannel.onmessage = (ev) => onSignalReceived(ev.data);
    }

    if (!channel) {
      channel = supabase.channel(channelName, {
        config: { broadcast: { self: false, ack: false } },
      });
      channel.on('broadcast', { event: 'signal' }, (payload) => onSignalReceived(payload.payload));
      channel.subscribe();
    }
  }

  function sendSignal(payload: CallSignal) {
    setupChannel();
    console.log(`[StudyCall] Sending signal: ${payload.type}`);
    const enriched = { ...payload, from: displayName, fromId: peerId };
    channel?.send({ type: 'broadcast', event: 'signal', payload: enriched });
    localSignalChannel?.postMessage(enriched);
  }

  function resetConnection() {
    try {
      if (ownsLocalStream) {
        localStream?.getTracks().forEach(t => t.stop());
      }
      localStream = null;
      ownsLocalStream = false;
      onLocalStream?.(null);
    } catch {}
    try {
      remoteStream = null;
      onRemoteStream?.(null);
    } catch {}
    try {
      pc?.close();
      pc = null;
    } catch {}
    setStatus('idle');
  }

  function cleanup() {
    resetConnection();
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
    if (localSignalChannel) {
      localSignalChannel.close();
      localSignalChannel = null;
    }
    setStatus('ended');
  }

  // Auto-setup channel
  setupChannel();

  return {
    async startCall(existingStream?: MediaStream | null) {
      setStatus('connecting');
      try {
        if (existingStream) {
          localStream = existingStream;
          ownsLocalStream = false;
        } else {
          localStream = await getLocalMediaStream(true, true);
          ownsLocalStream = true;
        }
        onLocalStream?.(localStream);

        const config: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        pc = new RTCPeerConnection(config);
        pc.ontrack = (e) => {
          if (e.streams?.[0]) {
            remoteStream = e.streams[0];
            onRemoteStream?.(remoteStream);
            setStatus('connected');
          }
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) sendSignal({ type: 'ice', candidate: e.candidate.toJSON() });
        };
        
        localStream.getTracks().forEach(track => pc!.addTrack(track, localStream!));
        
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ type: 'offer', sdp: offer });
      } catch (e) {
        onError?.(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    },

    async acceptCall(offer: RTCSessionDescriptionInit, existingStream?: MediaStream | null) {
      setStatus('connecting');
      try {
        if (existingStream) {
          localStream = existingStream;
          ownsLocalStream = false;
        } else {
          localStream = await getLocalMediaStream(true, true);
          ownsLocalStream = true;
        }
        onLocalStream?.(localStream);

        const config: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        pc = new RTCPeerConnection(config);
        pc.ontrack = (e) => {
          if (e.streams?.[0]) {
            remoteStream = e.streams[0];
            onRemoteStream?.(remoteStream);
            setStatus('connected');
          }
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) sendSignal({ type: 'ice', candidate: e.candidate.toJSON() });
        };

        localStream.getTracks().forEach(track => pc!.addTrack(track, localStream!));

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        while (pendingIce.length > 0) {
          const cand = pendingIce.shift();
          if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand));
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: 'answer', sdp: answer });
      } catch (e) {
        onError?.(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    },

    subscribeForIncomingOffer(handler: (offer: RTCSessionDescriptionInit) => void) {
      incomingOfferHandler = handler;
    },

    endCall: cleanup,
    resetConnection,
    sendSignal,
  };
}
