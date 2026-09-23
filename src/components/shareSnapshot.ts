import {
  type ActiveLayers,
  type HdEnhancementPreset,
  type MapOptions,
  type MapViewState,
} from './dualMapViewerShared';
import type { Language } from './i18n';
import type { GifDitherLevel, GifFinalPauseMs, GifPaletteMode } from './dualMapExport';

export type ThemeMode = 'dark' | 'light' | 'auto';
export type AnimationPreset = '3h' | '6h' | '12h' | 'custom';

/**
 * Everything that describes the current view, as carried by a `?view=` link.
 *
 * The animation fields are the in-app animation's own settings. Links made before that carried
 * `animationPreset`, `animationFps`, `customAnimationDate`, `customStartStep`, `customEndStep` and
 * `gifMaxDimension` instead: the export modal's range, which issue #78 removed. Those are ignored
 * when read — they have described nothing on screen since then.
 */
export type ShareSnapshot = {
  activeLayers: ActiveLayers;
  autoReduceVisAtNight: boolean;
  currentTime: string;
  fireHotspotEnabled: boolean;
  fireHotspotMinBrightness: number;
  fireHotspotMinRedBlueDiff: number;
  fireHotspotOpacity: number;
  gifColorCount: 64 | 128 | 256;
  gifDitherLevel: GifDitherLevel;
  gifFinalPauseMs: GifFinalPauseMs;
  gifPaletteMode: GifPaletteMode;
  hdEnhanceEnabled: boolean;
  hdEnhanceHighlightProtection: number;
  hdEnhanceLocalContrast: number;
  hdEnhanceNoiseReduction: number;
  hdEnhancePreset: HdEnhancementPreset;
  hdEnhanceRadius: number;
  hdEnhanceSaturationAdjust: number;
  hdEnhanceShadowProtection: number;
  hdEnhanceSharpen: number;
  hdEnhanceStrength: number;
  irStyle: string;
  language: Language;
  mapOptions: MapOptions;
  mapView: MapViewState;
  playbackBoomerang: boolean;
  playbackCustomDate: string;
  playbackCustomEndStep: number;
  playbackCustomStartStep: number;
  playbackFps: number;
  playbackPreset: AnimationPreset;
  playbackQuality: number;
  rgbHdOpacity: number;
  rgbSaturation: number;
  sandwichOpacity: number;
  themeMode: ThemeMode;
  visBrightness: number;
  visContrast: number;
  webmQuality: number;
};

export function encodeShareSnapshot(snapshot: ShareSnapshot): string {
  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeShareSnapshot(raw: string): Partial<ShareSnapshot> | null {
  try {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as Partial<ShareSnapshot>;
  } catch {
    return null;
  }
}

export function readShareSnapshotFromUrl(): Partial<ShareSnapshot> | null {
  if (typeof window === 'undefined') return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('view');
    if (!raw) return null;
    const compactPayload = decodeShareSnapshot(raw);
    if (compactPayload) return compactPayload;

    // Backward compatibility with previous raw JSON links.
    return JSON.parse(raw) as Partial<ShareSnapshot>;
  } catch {
    return null;
  }
}
