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

export type ShareSnapshot = {
  activeLayers: ActiveLayers;
  animationFps: number;
  animationPreset: AnimationPreset;
  autoReduceVisAtNight: boolean;
  customAnimationDate: string;
  customEndStep: number;
  customStartStep: number;
  currentTime: string;
  fireHotspotEnabled: boolean;
  fireHotspotMinBrightness: number;
  fireHotspotMinRedBlueDiff: number;
  fireHotspotOpacity: number;
  gifColorCount: 64 | 128 | 256;
  gifDitherLevel: GifDitherLevel;
  gifFinalPauseMs: GifFinalPauseMs;
  gifMaxDimension: 960 | 1280 | 1600;
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
  rgbHdOpacity: number;
  rgbSaturation: number;
  sandwichOpacity: number;
  themeMode: ThemeMode;
  visBrightness: number;
  visContrast: number;
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
