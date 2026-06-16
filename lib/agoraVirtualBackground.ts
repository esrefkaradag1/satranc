import AgoraRTC, { type ICameraVideoTrack } from 'agora-rtc-sdk-ng';
import VirtualBackgroundExtension, {
  type IVirtualBackgroundProcessor,
} from 'agora-extension-virtual-background';

let extensionInstance: VirtualBackgroundExtension | null = null;
let extensionRegistered = false;

export const CAMERA_BLUR_STORAGE_KEY = 'live_lesson_camera_blur';
export const DEFAULT_BLUR_DEGREE = 2;

export function readCameraBlurPreference(): boolean {
  try {
    return localStorage.getItem(CAMERA_BLUR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeCameraBlurPreference(enabled: boolean): void {
  try {
    localStorage.setItem(CAMERA_BLUR_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function isVirtualBackgroundSupported(): boolean {
  const ext = getVirtualBackgroundExtension();
  return !!ext;
}

function getVirtualBackgroundExtension(): VirtualBackgroundExtension | null {
  if (!extensionInstance) {
    extensionInstance = new VirtualBackgroundExtension();
  }
  if (!extensionInstance.checkCompatibility()) {
    return null;
  }
  if (!extensionRegistered) {
    AgoraRTC.registerExtensions([extensionInstance]);
    extensionRegistered = true;
  }
  return extensionInstance;
}

export async function ensureVirtualBackgroundProcessor(
  videoTrack: ICameraVideoTrack,
  processorRef: { current: IVirtualBackgroundProcessor | null },
  pipedTrackRef: { current: ICameraVideoTrack | null }
): Promise<IVirtualBackgroundProcessor | null> {
  const extension = getVirtualBackgroundExtension();
  if (!extension) return null;

  if (processorRef.current && pipedTrackRef.current === videoTrack) {
    return processorRef.current;
  }

  if (processorRef.current && pipedTrackRef.current && pipedTrackRef.current !== videoTrack) {
    await releaseVirtualBackgroundProcessor(processorRef, pipedTrackRef);
  }

  const processor = extension.createProcessor();
  try {
    await processor.init();
  } catch {
    return null;
  }

  videoTrack.pipe(processor).pipe(videoTrack.processorDestination);
  processorRef.current = processor;
  pipedTrackRef.current = videoTrack;
  return processor;
}

export async function applyVirtualBackgroundBlur(
  processor: IVirtualBackgroundProcessor,
  enabled: boolean,
  blurDegree: 1 | 2 | 3 = DEFAULT_BLUR_DEGREE
): Promise<void> {
  if (!enabled) {
    await processor.disable();
    return;
  }
  processor.setOptions({ type: 'blur', blurDegree });
  await processor.enable();
}

export async function releaseVirtualBackgroundProcessor(
  processorRef: { current: IVirtualBackgroundProcessor | null },
  pipedTrackRef: { current: ICameraVideoTrack | null }
): Promise<void> {
  const processor = processorRef.current;
  const pipedTrack = pipedTrackRef.current;

  if (processor) {
    try {
      await processor.disable();
    } catch {
      /* ignore */
    }
  }

  if (pipedTrack) {
    try {
      pipedTrack.unpipe();
    } catch {
      /* ignore */
    }
  }

  if (processor) {
    try {
      await processor.release();
    } catch {
      /* ignore */
    }
  }

  processorRef.current = null;
  pipedTrackRef.current = null;
}
