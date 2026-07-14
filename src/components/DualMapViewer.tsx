import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { Check, Download, Loader2, Monitor, Moon, Share2, Sun } from 'lucide-react';
import {
  DEFAULT_ACTIVE_LAYERS,
  fetchSyncedLatestAvailableTime,
  getAvailableExportKindsFromLayers,
  getExportFileBaseName,
  getHdEnhancementProfile,
  getLatestAvailableTime,
  IR_STYLES,
  sanitizeActiveLayers,
  STORAGE_KEYS,
  type ActiveLayers,
  type HdEnhancementPreset,
  type MapOptions,
  readStoredJson,
  RGB_VIS_FUSION,
  safeSetLocalStorage,
  themedClass,
  type ExportKind,
  type MapViewState,
} from './dualMapViewerShared';
import { getTranslator, type Language } from './i18n';
import {
  downloadSatellitePack,
  exportAnimationGif,
  exportAnimationWebm,
  generateExportPreviews,
  type GifDitherLevel,
  type GifFinalPauseMs,
  type GifPaletteMode,
  type StillImageFormat,
} from './dualMapExport';
import { useDualMapLeaflet } from './useDualMapLeaflet';
import {
  ExportModal,
  HeaderInfoButton,
  HeaderOverflowButton,
  HeaderOverflowMenu,
  HelpModal,
  InfoModal,
  Map2ControlBar,
  Map2TitleBadge,
  TimeDock,
} from './dualMapViewerPanels';
import { useImageAdjustments } from './useImageAdjustments';
import { useViewerPanelsState } from './useViewerPanelsState';
import { readShareSnapshotFromUrl, type AnimationPreset, type ShareSnapshot, type ThemeMode } from './shareSnapshot';
import { useShareLink } from './useShareLink';

// Static CSS referencing custom properties set on the root element's `style` attribute
// (see the render below). Keeping this string identity-stable across renders means React
// skips re-parsing the whole stylesheet every time a slider changes a filter value.
const DYNAMIC_TILE_STYLES = `
  .leaflet-container {
    background-color: #0a0a0a !important;
  }
  .ui-scrollbar {
    scrollbar-width: thin;
  }
  .theme-dark .ui-scrollbar {
    scrollbar-color: rgba(148, 163, 184, 0.55) rgba(255, 255, 255, 0.06);
  }
  .theme-light .ui-scrollbar {
    scrollbar-color: rgba(100, 116, 139, 0.65) rgba(148, 163, 184, 0.2);
  }
  .ui-scrollbar::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  .ui-scrollbar::-webkit-scrollbar-track {
    border-radius: 999px;
  }
  .theme-dark .ui-scrollbar::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.06);
  }
  .theme-light .ui-scrollbar::-webkit-scrollbar-track {
    background: rgba(148, 163, 184, 0.2);
  }
  .ui-scrollbar::-webkit-scrollbar-thumb {
    border-radius: 999px;
    border: 2px solid transparent;
    background-clip: content-box;
  }
  .theme-dark .ui-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(148, 163, 184, 0.55);
  }
  .theme-light .ui-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(100, 116, 139, 0.65);
  }
  .city-label {
    /* No position override here: Leaflet's own .leaflet-marker-icon rule already sets
       position: absolute on this element, which is what makes .city-dot's absolute
       positioning below anchor to it. Setting position: relative here (as a prior version
       of this rule did) overrides that to a different positioned value, which knocks the
       marker out of Leaflet's transform-only placement and into normal document flow —
       markers then stack top-to-bottom by DOM insertion order (roughly, population rank)
       instead of sitting at their true lat/lng, so only the most populous cities (added
       first, near-zero accumulated stack offset) still looked right; every city further
       down the list drifted further from its real position, worse the lower its population
       rank. Confirmed via getBoundingClientRect() vs the marker's own translate3d value:
       the CSS transform was always correct, only the rendered box didn't honor it. */
    color: rgba(255, 255, 255, 0.88);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.65);
    white-space: nowrap;
    pointer-events: none;
    font-family: Inter, system-ui, -apple-system, sans-serif;
    font-weight: 500;
  }
  .city-label-text {
    display: inline-block;
    transform: translate(4px, -2px);
  }
  .city-dot {
    position: absolute;
    left: 0;
    top: 0;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 0 3px rgba(0, 0, 0, 0.55);
  }
  .city-label-sm { font-size: 10px; opacity: 0.82; }
  .city-label-md { font-size: 11px; opacity: 0.88; }
  .city-label-lg { font-size: 12px; opacity: 0.95; }
  .city-label-sm .city-dot { width: 3px; height: 3px; }
  .city-label-md .city-dot { width: 4px; height: 4px; }
  .city-label-lg .city-dot { width: 5px; height: 5px; }
  .vis-layer-tiles {
    filter: brightness(var(--mtg-vis-brightness)) contrast(var(--mtg-vis-contrast));
  }
  .rgb-layer-tiles {
    filter: saturate(var(--mtg-rgb-saturation)) brightness(var(--mtg-rgb-brightness));
  }
  .ir-overlay-layer-tiles {
    mix-blend-mode: color;
    filter: saturate(1.2) contrast(1.08);
  }
  /* VIS+IR's night fallback: raw IR standing in for the VIS-luminance-dependent cloud-only
     composite (see shouldPreferIrBaseAtNight/isVisIrMode in dualMapViewerShared.ts). Boosted to
     match how vivid/bright the composite it replaces looks (satBoost in computeCloudOnlyIrRgba
     plus .ir-cloud-only-layer-tiles' own filter below) — the plain .ir-base-layer-tiles class
     (used by standalone IR mode) is intentionally left unfiltered/raw. */
  .ir-base-layer-tiles-vis-ir-fallback {
    filter: brightness(1.35) contrast(1.15) saturate(1.5);
  }
  /* Raw IR crossfaded in underneath the VIS+IR cloud-only composite as dusk approaches (see
     cloudOnlyIrNightFloor), purely so the composite's own mix-blend-mode: color (which takes
     its luminosity from whatever's behind it) has a brighter backdrop to read luminosity from as
     VIS dims — not meant to be seen as color itself. Must stay grayscale: color blend assumes
     a neutral-luminance backdrop (the classic 'tint a B&W photo' use case); feeding it an already
     colored backdrop (this same raw IR image, un-desaturated) made the composite's own hue fight
     the backdrop's hue, producing muddy off-palette greens/reds in thick cloud cores instead of
     the clean blue/cyan/yellow ramp. Brightness-only keeps the composite in charge of hue/sat. */
  .ir-fallback-base-layer-tiles {
    filter: grayscale(1) brightness(1.5) contrast(1.05);
  }
  .ir-cloud-only-layer-tiles {
    mix-blend-mode: color;
    filter: saturate(1.2) contrast(1.08);
  }
  .vis-overlay-layer-tiles {
    mix-blend-mode: soft-light;
    filter: brightness(var(--mtg-vis-brightness)) contrast(var(--mtg-vis-contrast));
  }
  .vis-overlay-layer-tiles-rgb-hd {
    mix-blend-mode: luminosity;
    filter: brightness(var(--mtg-vis-hd-legacy-brightness)) contrast(var(--mtg-vis-hd-legacy-contrast));
  }
  .vis-overlay-layer-tiles-on-ir {
    mix-blend-mode: screen;
    filter: brightness(var(--mtg-vis-brightness)) contrast(var(--mtg-vis-contrast)) saturate(1.05);
  }
  .vis-overlay-layer-tiles-hybrid {
    mix-blend-mode: luminosity;
    filter: brightness(var(--mtg-vis-brightness)) contrast(var(--mtg-vis-contrast));
  }
`;

const TEN_MINUTES_MS = 10 * 60 * 1000;
const MAX_ANIMATION_EXPORT_FRAMES = 73;
const MAX_CUSTOM_RANGE_MS = 12 * 60 * 60 * 1000;
const MIN_CUSTOM_RANGE_MS = 1 * 60 * 60 * 1000;
const DAY_MAX_STEP = (24 * 60) / 10 - 1;
const CUSTOM_MIN_RANGE_STEPS = MIN_CUSTOM_RANGE_MS / TEN_MINUTES_MS;
const CUSTOM_MAX_RANGE_STEPS = MAX_CUSTOM_RANGE_MS / TEN_MINUTES_MS;

function clampMapView(input: MapViewState | null | undefined): MapViewState | null {
  if (!input) return null;
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  const zoom = Number(input.zoom);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) return null;
  return {
    lat: Math.max(-85, Math.min(85, lat)),
    lng: Math.max(-180, Math.min(180, lng)),
    zoom: Math.max(3, Math.min(11, Math.round(zoom))),
  };
}

function toUtcInputValue(date: Date): string {
  return date.toISOString().slice(0, 16);
}

function parseUtcInputValue(value: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function roundDownToTenMinutes(date: Date): Date {
  return new Date(Math.floor(date.getTime() / TEN_MINUTES_MS) * TEN_MINUTES_MS);
}

function roundUpToTenMinutes(date: Date): Date {
  return new Date(Math.ceil(date.getTime() / TEN_MINUTES_MS) * TEN_MINUTES_MS);
}

function toTimePartFromStep(step: number): string {
  const safeStep = Math.max(0, Math.min(DAY_MAX_STEP, Math.round(step)));
  const totalMinutes = safeStep * 10;
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function getStepFromUtcValue(utcValue: string): number {
  const parsed = parseUtcInputValue(utcValue);
  if (!parsed) return 0;
  return Math.max(0, Math.min(DAY_MAX_STEP, Math.floor((parsed.getUTCHours() * 60 + parsed.getUTCMinutes()) / 10)));
}

function getLatestAllowedStepForDate(datePart: string, latestUtcValue: string): number {
  const latestDatePart = latestUtcValue.split('T')[0];
  if (datePart < latestDatePart) {
    return DAY_MAX_STEP;
  }
  if (datePart > latestDatePart) {
    return 0;
  }
  return getStepFromUtcValue(latestUtcValue);
}

function normalizeCustomDaySteps(startStep: number, endStep: number, dayMaxStep: number): { start: number; end: number } {
  const safeDayMax = Math.max(0, Math.min(DAY_MAX_STEP, dayMaxStep));
  let start = Math.max(0, Math.min(safeDayMax, Math.round(startStep)));
  let end = Math.max(0, Math.min(safeDayMax, Math.round(endStep)));

  if (end < start) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  const minSpan = Math.max(1, Math.min(CUSTOM_MIN_RANGE_STEPS, safeDayMax));
  const maxSpan = Math.max(minSpan, Math.min(CUSTOM_MAX_RANGE_STEPS, safeDayMax));
  let span = end - start;

  if (span < minSpan) {
    end = Math.min(safeDayMax, start + minSpan);
    span = end - start;
    if (span < minSpan) {
      start = Math.max(0, end - minSpan);
    }
  }

  if (end - start > maxSpan) {
    end = start + maxSpan;
    if (end > safeDayMax) {
      end = safeDayMax;
      start = Math.max(0, end - maxSpan);
    }
  }

  return { start, end };
}

function getAnimationExportKind(layers: ActiveLayers): ExportKind {
  if (layers.rgb && layers.vis && layers.ir) return 'hybrid';
  if (layers.rgb && layers.vis) return 'hd';
  if (layers.vis && layers.ir) return 'sandwich';
  if (layers.rgb) return 'rgb';
  if (layers.vis) return 'vis';
  return 'ir';
}

const HD_PRESET_SLIDER_VALUES: Record<Exclude<HdEnhancementPreset, 'custom'>, {
  highlightProtection: number;
  localContrast: number;
  noiseReduction: number;
  radius: number;
  saturationAdjust: number;
  shadowProtection: number;
  sharpen: number;
  strength: number;
}> = {
  natural: {
    highlightProtection: 0.38,
    localContrast: 0.18,
    noiseReduction: 0.18,
    radius: 1.2,
    saturationAdjust: 4,
    shadowProtection: 0.28,
    sharpen: 0.28,
    strength: 0.28,
  },
  balanced: {
    highlightProtection: 0.3,
    localContrast: 0.25,
    noiseReduction: 0.1,
    radius: 1.4,
    saturationAdjust: 8,
    shadowProtection: 0.2,
    sharpen: 0.4,
    strength: 0.35,
  },
  punchy: {
    highlightProtection: 0.2,
    localContrast: 0.42,
    noiseReduction: 0.08,
    radius: 1.65,
    saturationAdjust: 16,
    shadowProtection: 0.16,
    sharpen: 0.62,
    strength: 0.52,
  },
  analyze: {
    highlightProtection: 0.15,
    localContrast: 0.5,
    noiseReduction: 0.06,
    radius: 1.85,
    saturationAdjust: 2,
    shadowProtection: 0.1,
    sharpen: 0.72,
    strength: 0.62,
  },
};

export default function DualMapViewer() {
  const [sharedSnapshot] = useState<Partial<ShareSnapshot> | null>(() => readShareSnapshotFromUrl());
  const rememberedMapView = readStoredJson<MapViewState | null>(STORAGE_KEYS.lastMapView, null);
  const initialMapView = clampMapView(sharedSnapshot?.mapView ?? rememberedMapView);
  const [mapViewState, setMapViewState] = useState<MapViewState | null>(initialMapView);
  const [isExporting, setIsExporting] = useState(false);
  const [justCopiedShareLink, setJustCopiedShareLink] = useState(false);
  const [selectedExports, setSelectedExports] = useState<Record<ExportKind, boolean>>({
    vis: true,
    rgb: true,
    ir: false,
    hd: false,
    sandwich: false,
    hybrid: false,
  });
  const [exportFormat, setExportFormat] = useState<StillImageFormat>('png');
  const [exportResolution, setExportResolution] = useState<1920 | 2560 | 4096>(4096);
  const [exportMode, setExportMode] = useState<'image' | 'gif' | 'webm'>('image');
  const [webmQuality, setWebmQuality] = useState(0.8);
  const [gifSelectedKind, setGifSelectedKind] = useState<ExportKind | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [previewImages, setPreviewImages] = useState<Partial<Record<ExportKind, string>>>({});
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [activeLayers, setActiveLayers] = useState<ActiveLayers>(() => {
    const fromShare = sharedSnapshot?.activeLayers;
    if (fromShare) return sanitizeActiveLayers(fromShare);
    const stored = readStoredJson<ActiveLayers>(STORAGE_KEYS.activeLayers, DEFAULT_ACTIVE_LAYERS);
    return sanitizeActiveLayers(stored);
  });
  const [fireHotspotEnabled, setFireHotspotEnabled] = useState<boolean>(() => {
    if (typeof sharedSnapshot?.fireHotspotEnabled === 'boolean') return sharedSnapshot.fireHotspotEnabled;
    return readStoredJson<boolean>(STORAGE_KEYS.fireHotspotEnabled, false);
  });
  const [language, setLanguage] = useState<Language>(() => {
    if (sharedSnapshot?.language === 'fr' || sharedSnapshot?.language === 'en') {
      return sharedSnapshot.language;
    }
    const stored = readStoredJson<Language>(STORAGE_KEYS.language, 'fr');
    return stored === 'en' ? 'en' : 'fr';
  });
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (sharedSnapshot?.themeMode === 'dark' || sharedSnapshot?.themeMode === 'light' || sharedSnapshot?.themeMode === 'auto') {
      return sharedSnapshot.themeMode;
    }
    const stored = readStoredJson<ThemeMode>(STORAGE_KEYS.themeMode, 'auto');
    return stored === 'dark' || stored === 'light' || stored === 'auto' ? stored : 'auto';
  });
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  });
  const t = getTranslator(language);

  const {
    adjustmentsRef,
    exportModalRef,
    fireHotspotRef,
    helpRef,
    infoRef,
    isAdjustmentsOpen,
    isExportModalOpen,
    isFireHotspotOpen,
    isHelpOpen,
    isInfoOpen,
    isOverflowMenuOpen,
    overflowMenuRef,
    setIsAdjustmentsOpen,
    setIsExportModalOpen,
    setIsFireHotspotOpen,
    setIsHelpOpen,
    setIsInfoOpen,
    setIsOverflowMenuOpen,
  } = useViewerPanelsState();

  const { shareToastMessage, setShareToastMessage, copyShareLink } = useShareLink();

  const {
    autoReduceVisAtNight,
    fireHotspotMinBrightness,
    fireHotspotMinRedBlueDiff,
    fireHotspotOpacity,
    hdEnhanceEnabled,
    hdEnhanceHighlightProtection,
    hdEnhanceLocalContrast,
    hdEnhanceNoiseReduction,
    hdEnhancePreset,
    hdEnhanceRadius,
    hdEnhanceSaturationAdjust,
    hdEnhanceShadowProtection,
    hdEnhanceSharpen,
    hdEnhanceStrength,
    irStyle,
    resetHdEnhancement,
    resetAdjustments,
    rgbHdOpacity,
    rgbSaturation,
    sandwichOpacity,
    setAutoReduceVisAtNight,
    setHdEnhanceEnabled,
    setHdEnhanceHighlightProtection,
    setHdEnhanceLocalContrast,
    setHdEnhanceNoiseReduction,
    setHdEnhancePreset,
    setHdEnhanceRadius,
    setHdEnhanceSaturationAdjust,
    setHdEnhanceShadowProtection,
    setHdEnhanceSharpen,
    setHdEnhanceStrength,
    setFireHotspotMinBrightness,
    setFireHotspotMinRedBlueDiff,
    setFireHotspotOpacity,
    setIrStyle,
    setRgbHdOpacity,
    setRgbSaturation,
    setSandwichOpacity,
    setVisBrightness,
    setVisContrast,
    visBrightness,
    visContrast,
  } = useImageAdjustments();

  // Once a shared view has been read into `sharedSnapshot` (above), strip the `view` query param
  // from the address bar so it stops being the source of truth: without this, `initialMapView`
  // (derived from `sharedSnapshot?.mapView` on every render) keeps winning over the user's actual
  // panned position for reads that happen to re-run off this URL (e.g. a page refresh), which is
  // what made the map appear to keep "snapping back" to the originally-shared spot instead of
  // just applying it once. Runs once on mount, after the value has already been captured into
  // state — removing the param doesn't affect the already-loaded `sharedSnapshot`.
  useEffect(() => {
    if (!sharedSnapshot || typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (!params.has('view')) return;
    params.delete('view');
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, [sharedSnapshot]);

  useEffect(() => {
    if (!sharedSnapshot) return;

    if (typeof sharedSnapshot.visBrightness === 'number') {
      setVisBrightness(Math.max(0.6, Math.min(1.8, sharedSnapshot.visBrightness)));
    }
    if (typeof sharedSnapshot.visContrast === 'number') {
      setVisContrast(Math.max(0.6, Math.min(2, sharedSnapshot.visContrast)));
    }
    if (typeof sharedSnapshot.rgbSaturation === 'number') {
      setRgbSaturation(Math.max(0.5, Math.min(2, sharedSnapshot.rgbSaturation)));
    }
    if (typeof sharedSnapshot.rgbHdOpacity === 'number') {
      setRgbHdOpacity(Math.max(0.1, Math.min(1, sharedSnapshot.rgbHdOpacity)));
    }
    if (typeof sharedSnapshot.sandwichOpacity === 'number') {
      setSandwichOpacity(Math.max(0.1, Math.min(1, sharedSnapshot.sandwichOpacity)));
    }
    if (typeof sharedSnapshot.fireHotspotOpacity === 'number') {
      setFireHotspotOpacity(Math.max(0.1, Math.min(1, sharedSnapshot.fireHotspotOpacity)));
    }
    if (typeof sharedSnapshot.fireHotspotMinRedBlueDiff === 'number') {
      setFireHotspotMinRedBlueDiff(Math.max(0, Math.min(255, sharedSnapshot.fireHotspotMinRedBlueDiff)));
    }
    if (typeof sharedSnapshot.fireHotspotMinBrightness === 'number') {
      setFireHotspotMinBrightness(Math.max(0, Math.min(255, sharedSnapshot.fireHotspotMinBrightness)));
    }
    if (typeof sharedSnapshot.autoReduceVisAtNight === 'boolean') {
      setAutoReduceVisAtNight(sharedSnapshot.autoReduceVisAtNight);
    }
    if (typeof sharedSnapshot.hdEnhanceEnabled === 'boolean') {
      setHdEnhanceEnabled(sharedSnapshot.hdEnhanceEnabled);
    }
    if (typeof sharedSnapshot.hdEnhanceStrength === 'number') {
      setHdEnhanceStrength(Math.max(0, Math.min(1, sharedSnapshot.hdEnhanceStrength)));
    }
    if (typeof sharedSnapshot.hdEnhanceSharpen === 'number') {
      setHdEnhanceSharpen(Math.max(0, Math.min(1, sharedSnapshot.hdEnhanceSharpen)));
    }
    if (typeof sharedSnapshot.hdEnhanceRadius === 'number') {
      setHdEnhanceRadius(Math.max(0.5, Math.min(3, sharedSnapshot.hdEnhanceRadius)));
    }
    if (typeof sharedSnapshot.hdEnhanceLocalContrast === 'number') {
      setHdEnhanceLocalContrast(Math.max(0, Math.min(1, sharedSnapshot.hdEnhanceLocalContrast)));
    }
    if (typeof sharedSnapshot.hdEnhanceHighlightProtection === 'number') {
      setHdEnhanceHighlightProtection(Math.max(0, Math.min(1, sharedSnapshot.hdEnhanceHighlightProtection)));
    }
    if (typeof sharedSnapshot.hdEnhanceSaturationAdjust === 'number') {
      setHdEnhanceSaturationAdjust(Math.max(-20, Math.min(30, sharedSnapshot.hdEnhanceSaturationAdjust)));
    }
    if (typeof sharedSnapshot.hdEnhanceNoiseReduction === 'number') {
      setHdEnhanceNoiseReduction(Math.max(0, Math.min(1, sharedSnapshot.hdEnhanceNoiseReduction)));
    }
    if (typeof sharedSnapshot.hdEnhanceShadowProtection === 'number') {
      setHdEnhanceShadowProtection(Math.max(0, Math.min(1, sharedSnapshot.hdEnhanceShadowProtection)));
    }
    if (
      sharedSnapshot.hdEnhancePreset === 'natural'
      || sharedSnapshot.hdEnhancePreset === 'balanced'
      || sharedSnapshot.hdEnhancePreset === 'punchy'
      || sharedSnapshot.hdEnhancePreset === 'analyze'
      || sharedSnapshot.hdEnhancePreset === 'custom'
    ) {
      setHdEnhancePreset(sharedSnapshot.hdEnhancePreset);
    }
    const matchedIrStyle = IR_STYLES.find((style) => style.id === sharedSnapshot.irStyle);
    if (matchedIrStyle) {
      setIrStyle(matchedIrStyle.id);
    }
  }, [
    setAutoReduceVisAtNight,
    setFireHotspotMinBrightness,
    setFireHotspotMinRedBlueDiff,
    setFireHotspotOpacity,
    setHdEnhanceEnabled,
    setHdEnhanceHighlightProtection,
    setHdEnhanceLocalContrast,
    setHdEnhanceNoiseReduction,
    setHdEnhancePreset,
    setHdEnhanceRadius,
    setHdEnhanceSaturationAdjust,
    setHdEnhanceShadowProtection,
    setHdEnhanceSharpen,
    setHdEnhanceStrength,
    setIrStyle,
    setRgbHdOpacity,
    setRgbSaturation,
    setSandwichOpacity,
    setVisBrightness,
    setVisContrast,
    sharedSnapshot,
  ]);

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.activeLayers, JSON.stringify(activeLayers));
  }, [activeLayers]);

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.fireHotspotEnabled, JSON.stringify(fireHotspotEnabled));
  }, [fireHotspotEnabled]);

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.language, JSON.stringify(language));
  }, [language]);

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.themeMode, JSON.stringify(themeMode));
  }, [themeMode]);

  useEffect(() => {
    if (themeMode === 'dark' || themeMode === 'light') {
      setResolvedTheme(themeMode);
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const syncFromSystem = () => setResolvedTheme(mediaQuery.matches ? 'light' : 'dark');
    syncFromSystem();

    mediaQuery.addEventListener('change', syncFromSystem);
    return () => mediaQuery.removeEventListener('change', syncFromSystem);
  }, [themeMode]);

  const [mapOptions, setMapOptions] = useState<MapOptions>(() => {
    const defaults: MapOptions = {
      bordersOpacity: 0.4,
      cityDensity: 1,
      franceDepartmentsOpacity: 0.9,
      showBorders: false,
      showCities: false,
      showFranceDepartments: false,
    };
    const stored = readStoredJson<MapOptions>(STORAGE_KEYS.mapOptions, defaults);
    return { ...defaults, ...stored, ...(sharedSnapshot?.mapOptions ?? {}) };
  });

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.mapOptions, JSON.stringify(mapOptions));
  }, [mapOptions]);

  useEffect(() => {
    if (!mapViewState) return;
    safeSetLocalStorage(STORAGE_KEYS.lastMapView, JSON.stringify(mapViewState));
  }, [mapViewState]);

  // Initialize time to current time (rounded to nearest 10 mins as MTG is every 10 min, with buffer)
  const [currentTime, setCurrentTime] = useState(() => sharedSnapshot?.currentTime ?? getLatestAvailableTime());
  const [animationPreset, setAnimationPreset] = useState<AnimationPreset>(() => {
    const preset = sharedSnapshot?.animationPreset;
    return preset === '3h' || preset === '6h' || preset === '12h' || preset === 'custom' ? preset : '3h';
  });
  const [animationFps, setAnimationFps] = useState(() => {
    const fps = Number(sharedSnapshot?.animationFps ?? 6);
    return Math.max(2, Math.min(20, Math.round(fps)));
  });
  const [gifMaxDimension, setGifMaxDimension] = useState<960 | 1280 | 1600>(() => {
    const value = sharedSnapshot?.gifMaxDimension;
    return value === 960 || value === 1280 || value === 1600 ? value : 1280;
  });
  const [gifColorCount, setGifColorCount] = useState<64 | 128 | 256>(() => {
    const value = sharedSnapshot?.gifColorCount;
    return value === 64 || value === 128 || value === 256 ? value : 128;
  });
  const [gifPaletteMode, setGifPaletteMode] = useState<GifPaletteMode>(() => {
    const value = sharedSnapshot?.gifPaletteMode;
    return value === 'global' || value === 'per-frame' ? value : 'per-frame';
  });
  const [gifDitherLevel, setGifDitherLevel] = useState<GifDitherLevel>(() => {
    const value = sharedSnapshot?.gifDitherLevel;
    return value === 'none' || value === 'low' || value === 'medium' || value === 'high' ? value : 'none';
  });
  const [gifFinalPauseMs, setGifFinalPauseMs] = useState<GifFinalPauseMs>(() => {
    const value = sharedSnapshot?.gifFinalPauseMs;
    return value === 100 || value === 500 || value === 1000 || value === 2000 ? value : 100;
  });
  const [isGifExporting, setIsGifExporting] = useState(false);
  const [gifExportProgress, setGifExportProgress] = useState(0);
  const [isWebmExporting, setIsWebmExporting] = useState(false);
  const [webmExportProgress, setWebmExportProgress] = useState(0);
  const [animationRangeError, setAnimationRangeError] = useState<string | null>(null);
  const latestAvailableTime = getLatestAvailableTime();
  const latestAvailableDatePart = latestAvailableTime.split('T')[0];
  const [customAnimationDate, setCustomAnimationDate] = useState(() => sharedSnapshot?.customAnimationDate ?? currentTime.split('T')[0]);
  const [customStartStep, setCustomStartStep] = useState(() => {
    if (typeof sharedSnapshot?.customStartStep === 'number') {
      return Math.max(0, Math.min(DAY_MAX_STEP, Math.round(sharedSnapshot.customStartStep)));
    }
    const latestStep = getStepFromUtcValue(getLatestAvailableTime());
    return Math.max(0, latestStep - 18);
  });
  const [customEndStep, setCustomEndStep] = useState(() => {
    if (typeof sharedSnapshot?.customEndStep === 'number') {
      return Math.max(0, Math.min(DAY_MAX_STEP, Math.round(sharedSnapshot.customEndStep)));
    }
    return getStepFromUtcValue(getLatestAvailableTime());
  });

  const customDayMaxStep = getLatestAllowedStepForDate(customAnimationDate, latestAvailableTime);
  const customAnimationStart = `${customAnimationDate}T${toTimePartFromStep(customStartStep)}`;
  const customAnimationEnd = `${customAnimationDate}T${toTimePartFromStep(customEndStep)}`;

  useEffect(() => {
    const normalized = normalizeCustomDaySteps(customStartStep, customEndStep, customDayMaxStep);
    if (normalized.start !== customStartStep) {
      setCustomStartStep(normalized.start);
    }
    if (normalized.end !== customEndStep) {
      setCustomEndStep(normalized.end);
    }
  }, [customAnimationDate, customDayMaxStep, customEndStep, customStartStep]);

  const handleCustomDateChange = (nextDate: string) => {
    const safeDate = nextDate > latestAvailableDatePart ? latestAvailableDatePart : nextDate;
    setCustomAnimationDate(safeDate);
  };

  const handleCustomStartStepChange = (step: number) => {
    const minSpan = Math.max(1, Math.min(CUSTOM_MIN_RANGE_STEPS, customDayMaxStep));
    const maxSpan = Math.max(minSpan, Math.min(CUSTOM_MAX_RANGE_STEPS, customDayMaxStep));
    const minStart = Math.max(0, customEndStep - maxSpan);
    const maxStart = Math.max(0, customEndStep - minSpan);
    const clamped = Math.max(minStart, Math.min(maxStart, Math.round(step)));
    setCustomStartStep(clamped);
  };

  const handleCustomEndStepChange = (step: number) => {
    const minSpan = Math.max(1, Math.min(CUSTOM_MIN_RANGE_STEPS, customDayMaxStep));
    const maxSpan = Math.max(minSpan, Math.min(CUSTOM_MAX_RANGE_STEPS, customDayMaxStep));
    const minEnd = Math.min(customDayMaxStep, customStartStep + minSpan);
    const maxEnd = Math.min(customDayMaxStep, customStartStep + maxSpan);
    const clamped = Math.max(minEnd, Math.min(maxEnd, Math.round(step)));
    setCustomEndStep(clamped);
  };

  const {
    cityLoadPromiseRef,
    effectiveHybridVisOpacity,
    effectiveSandwichOpacity,
    getVisibleCityFeatures,
    isNightIrFallbackActive,
    isRgbVisOnlyMode,
    rgbVisOnlyNightBrightness,
    isMapLoading,
    loadingProgress,
    loadingTileCount,
    map1BordersRef,
    map1DepartmentsRef,
    map1Ref,
    map2Instance,
    map2Ref,
    solarElevation,
  } = useDualMapLeaflet({
    autoReduceVisAtNight,
    activeLayers,
    currentTime,
    fireHotspotEnabled,
    fireHotspotMinBrightness,
    fireHotspotMinRedBlueDiff,
    fireHotspotOpacity,
    initialMapView,
    irStyle,
    mapOptions,
    onMapViewChange: setMapViewState,
    rgbHdOpacity,
    sandwichOpacity,
  });
  const rgbLegacyFusionSaturationBoost = isRgbVisOnlyMode ? RGB_VIS_FUSION.rgbSaturationBoost : 1;
  const rgbLegacyFusionBrightnessBoost = isRgbVisOnlyMode ? RGB_VIS_FUSION.rgbBrightnessBoost : 1;
  const hdPresetProfile = getHdEnhancementProfile(hdEnhancePreset);

  const applyHdSliderChange = (apply: () => void) => {
    apply();
    if (hdEnhancePreset !== 'custom') {
      setHdEnhancePreset('custom');
    }
  };

  const handleHdPresetChange = (preset: HdEnhancementPreset) => {
    setHdEnhancePreset(preset);
    if (preset === 'custom') return;

    const values = HD_PRESET_SLIDER_VALUES[preset];
    setHdEnhanceStrength(values.strength);
    setHdEnhanceSharpen(values.sharpen);
    setHdEnhanceRadius(values.radius);
    setHdEnhanceLocalContrast(values.localContrast);
    setHdEnhanceHighlightProtection(values.highlightProtection);
    setHdEnhanceSaturationAdjust(values.saturationAdjust);
    setHdEnhanceNoiseReduction(values.noiseReduction);
    setHdEnhanceShadowProtection(values.shadowProtection);
  };
  const hdSharpenWeight = hdEnhanceEnabled ? hdEnhanceStrength * hdEnhanceSharpen * hdPresetProfile.sharpen : 0;
  const hdContrastWeight = hdEnhanceEnabled ? hdEnhanceStrength * hdEnhanceLocalContrast * hdPresetProfile.contrast : 0;
  const hdHighlightCut = hdEnhanceEnabled ? hdEnhanceHighlightProtection * hdEnhanceStrength * 0.08 : 0;
  const hdShadowLift = hdEnhanceEnabled ? hdEnhanceShadowProtection * hdEnhanceStrength * 0.06 : 0;
  const hdSaturationFactor = hdEnhanceEnabled
    ? 1 + (hdEnhanceSaturationAdjust / 100) * hdEnhanceStrength * hdPresetProfile.saturation
    : 1;
  const hdPreviewBoost = 1 + hdSharpenWeight * 0.18;
  const hdPreviewVisBrightnessBoost = Math.max(0.7, 1 + hdShadowLift - hdHighlightCut + hdSharpenWeight * 0.04);
  const hdPreviewVisContrastBoost = 1 + hdContrastWeight * 0.24;
  const rgbLayerEffectiveSaturation = rgbSaturation * rgbLegacyFusionSaturationBoost * hdPreviewBoost;
  const rgbLayerEffectiveBrightness = rgbVisOnlyNightBrightness * rgbLegacyFusionBrightnessBoost * hdPreviewVisBrightnessBoost;
  // Upper-bounded like visHdLegacyBrightness/visHdLegacyContrast below: rgbSaturation alone goes up to
  // 2.0, and rgbLegacyFusionSaturationBoost (1.45x, always applied in RGB+VIS-only mode) stacks on top of
  // it unbounded, so without a ceiling this can exceed ~1.9 even with HD disabled. That range renders fine
  // in Chromium but washes out to a flat yellow-olive with no visible clouds in Safari/WebKit (its filter
  // pipeline color-manages saturate() against the display's gamut, e.g. wide-gamut P3 Macs, and clips
  // harder than Chromium at extreme values) — confirmed by a user report that only reproduced on Safari
  // and only past this range. 1.8 sits above the default (~1.67 with default rgbSaturation) so the slider
  // still has room to move, but keeps it out of the confirmed-bad zone.
  const rgbLayerEffectiveSaturationWithHd = Math.min(1.8, Math.max(0.4, rgbLayerEffectiveSaturation * hdSaturationFactor));
  const visHdLegacyBrightness = Math.min(2, visBrightness * RGB_VIS_FUSION.visBrightnessBoost * hdPreviewVisBrightnessBoost);
  const visHdLegacyContrast = Math.min(2.4, visContrast * RGB_VIS_FUSION.visContrastBoost * hdPreviewVisContrastBoost);
  const availableExportKinds: ExportKind[] = getAvailableExportKindsFromLayers(activeLayers);
  const selectedExportKinds = availableExportKinds.filter((kind) => selectedExports[kind]);
  const effectiveGifKind: ExportKind = gifSelectedKind && availableExportKinds.includes(gifSelectedKind)
    ? gifSelectedKind
    : getAnimationExportKind(activeLayers);

  const handleTimeChange = (newTimeStr: string) => {
    const newTime = new Date(newTimeStr);
    const latestAvailable = getLatestAvailableTime();
    const maxTime = new Date(latestAvailable);

    if (newTime > maxTime) {
      setCurrentTime(latestAvailable);
    } else {
      setCurrentTime(newTimeStr);
    }
  };

  const [isJumpingToLatest, setIsJumpingToLatest] = useState(false);

  // The plain `getLatestAvailableTime()` heuristic (now minus a fixed buffer) assumes every WMS
  // layer publishes within that same margin, but RGB/VIS/IR can each lag independently — see
  // `fetchSyncedLatestAvailableTime`'s comment for why that silently desyncs RGB and VIS at the
  // exact instant this button is meant to guarantee freshness. Probes each active layer's real
  // latest-published time first (briefly, with its own fallback/timeout) so "jump to latest"
  // actually lands on a timestamp every active layer genuinely has data for.
  const jumpToLatest = async () => {
    if (isJumpingToLatest) return;
    setIsJumpingToLatest(true);
    try {
      const syncedLatest = await fetchSyncedLatestAvailableTime(activeLayers);
      handleTimeChange(syncedLatest);
    } finally {
      setIsJumpingToLatest(false);
    }
  };

  useEffect(() => {
    const latestAvailable = getLatestAvailableTime();
    const requested = new Date(currentTime + 'Z');
    const latest = new Date(latestAvailable + 'Z');
    if (requested.getTime() > latest.getTime()) {
      setCurrentTime(latestAvailable);
    }
  }, [currentTime]);

  // `currentTime`'s initial state (above) is seeded with the same synchronous
  // `getLatestAvailableTime()` heuristic that `fetchSyncedLatestAvailableTime` exists to correct
  // for "jump to latest" (see that function's comment) — RGB/VIS/IR can each lag independently,
  // so the naive guess can silently land on a timestamp only some active layers actually have
  // data for. That's the intermittent RGB/VIS desync users still see on a fresh page load (no
  // share link): the "jump to latest" fix only covered the L shortcut/"Dernier" button, not this
  // initial mount. Re-probes once on mount and snaps to the genuinely-synced timestamp — but only
  // if the user hasn't already navigated away from the initial guess while the probe (up to 4s)
  // was in flight, so this can't clobber an intentional time change.
  const initialCurrentTimeRef = useRef(currentTime);
  useEffect(() => {
    if (sharedSnapshot?.currentTime) return;
    let cancelled = false;
    setIsJumpingToLatest(true);
    fetchSyncedLatestAvailableTime(activeLayers)
      .then((synced) => {
        if (cancelled) return;
        setCurrentTime((prev) => (prev === initialCurrentTimeRef.current ? synced : prev));
      })
      .finally(() => {
        if (!cancelled) setIsJumpingToLatest(false);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally mount-only: this re-probes the initial guess exactly once, not on every
    // activeLayers/sharedSnapshot change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnimationPresetChange = (value: AnimationPreset) => {
    setAnimationPreset(value);
    if (value !== 'custom') return;

    const base = parseUtcInputValue(currentTime) ?? parseUtcInputValue(getLatestAvailableTime()) ?? new Date();
    const datePart = base.toISOString().slice(0, 10);
    const baseStep = getStepFromUtcValue(toUtcInputValue(base));
    const nextEnd = Math.max(0, Math.min(getLatestAllowedStepForDate(datePart, latestAvailableTime), baseStep));
    const nextStart = Math.max(0, nextEnd - 18);
    const normalized = normalizeCustomDaySteps(nextStart, nextEnd, getLatestAllowedStepForDate(datePart, latestAvailableTime));

    setCustomAnimationDate(datePart);
    setCustomStartStep(normalized.start);
    setCustomEndStep(normalized.end);
  };

  const buildAnimationFrameTimes = (): string[] => {
    const latestAvailable = parseUtcInputValue(getLatestAvailableTime());
    if (!latestAvailable) {
      throw new Error('No latest time available');
    }

    let startDate: Date;
    let endDate: Date;
    if (animationPreset === 'custom') {
      const parsedStart = parseUtcInputValue(customAnimationStart);
      const parsedEnd = parseUtcInputValue(customAnimationEnd);
      if (!parsedStart || !parsedEnd) {
        throw new Error('animation-range-invalid');
      }
      if (parsedEnd > latestAvailable) {
        throw new Error('animation-custom-future-end');
      }
      const customDuration = parsedEnd.getTime() - parsedStart.getTime();
      if (customDuration < MIN_CUSTOM_RANGE_MS) {
        throw new Error('animation-custom-too-short');
      }
      if (customDuration > MAX_CUSTOM_RANGE_MS) {
        throw new Error('animation-custom-too-long');
      }
      startDate = parsedStart;
      endDate = parsedEnd;
    } else {
      const durationHours = animationPreset === '3h' ? 3 : animationPreset === '6h' ? 6 : 12;
      endDate = latestAvailable;
      startDate = new Date(endDate.getTime() - durationHours * 60 * 60 * 1000);
    }

    if (startDate > endDate) {
      throw new Error('animation-range-invalid');
    }

    const clampedEnd = new Date(Math.min(endDate.getTime(), latestAvailable.getTime()));
    const roundedStart = roundUpToTenMinutes(startDate);
    const roundedEnd = roundDownToTenMinutes(clampedEnd);
    if (roundedStart > roundedEnd) {
      throw new Error('animation-range-invalid');
    }

    const frames: string[] = [];
    for (let ts = roundedStart.getTime(); ts <= roundedEnd.getTime(); ts += TEN_MINUTES_MS) {
      frames.push(toUtcInputValue(new Date(ts)));
      if (frames.length > MAX_ANIMATION_EXPORT_FRAMES) {
        throw new Error('animation-max-export-frames');
      }
    }

    if (frames.length < 2) {
      throw new Error('animation-export-too-few-frames');
    }

    return frames;
  };

  const mapAnimationErrorCode = (code: string): string => {
    if (code === 'animation-max-export-frames') return t('animationMaxExportFramesError');
    if (code === 'animation-export-too-few-frames') return t('animationExportTooFewFramesError');
    if (code === 'animation-custom-future-end') return t('animationCustomFutureEndError');
    if (code === 'animation-custom-too-short') return t('animationCustomTooShortError');
    if (code === 'animation-custom-too-long') return t('animationCustomTooLongError');
    return t('animationRangeError');
  };

  const exportGif = async () => {
    if (!map2Instance.current || !map2Ref.current || isGifExporting) return;

    let frames: string[] = [];
    try {
      frames = buildAnimationFrameTimes();
    } catch (error) {
      setAnimationRangeError(mapAnimationErrorCode(error instanceof Error ? error.message : ''));
      return;
    }

    setAnimationRangeError(null);
    setIsGifExporting(true);
    setGifExportProgress(0);

    try {
      const { saveAs } = await import('file-saver');
      const exportKind = effectiveGifKind;
      const gifBlob = await exportAnimationGif({
        frameTimes: frames,
        fps: animationFps,
        kind: exportKind,
        maxDimension: gifMaxDimension,
        colorCount: gifColorCount,
        paletteMode: gifPaletteMode,
        ditherLevel: gifDitherLevel,
        finalPauseMs: gifFinalPauseMs,
        map: map2Instance.current,
        mapContainer: map2Ref.current,
        activeLayers,
        fireHotspotEnabled,
        fireHotspotMinBrightness,
        fireHotspotMinRedBlueDiff,
        fireHotspotOpacity,
        irStyle,
        visBrightness,
        visContrast,
        hdEnhanceEnabled,
        hdEnhanceHighlightProtection,
        hdEnhanceLocalContrast,
        hdEnhanceNoiseReduction,
        hdEnhancePreset,
        hdEnhanceRadius,
        hdEnhanceSaturationAdjust,
        hdEnhanceShadowProtection,
        hdEnhanceSharpen,
        hdEnhanceStrength,
        rgbSaturation,
        rgbHdOpacity,
        sandwichOpacity,
        autoReduceVisAtNight,
        mapOptions,
        language,
        map1BordersLayer: map1BordersRef.current,
        map1DepartmentsLayer: map1DepartmentsRef.current,
        cityLoadPromise: cityLoadPromiseRef.current,
        getVisibleCityFeatures,
        onProgress: setGifExportProgress,
      });

      const safeStart = frames[0].replace('T', '_').replace(/:/g, '-');
      const safeEnd = frames[frames.length - 1].replace('T', '_').replace(/:/g, '-');
      const gifFileBaseName = getExportFileBaseName(exportKind, hdEnhanceEnabled);
      saveAs(gifBlob, `MTG_ANIMATION_${gifFileBaseName}_${gifMaxDimension}px_${safeStart}_to_${safeEnd}.gif`);
    } catch (error) {
      console.error('GIF export failed:', error);
      alert(t('animationExportFailed'));
    } finally {
      setIsGifExporting(false);
    }
  };

  const exportWebm = async () => {
    if (!map2Instance.current || !map2Ref.current || isWebmExporting) return;

    let frames: string[] = [];
    try {
      frames = buildAnimationFrameTimes();
    } catch (error) {
      setAnimationRangeError(mapAnimationErrorCode(error instanceof Error ? error.message : ''));
      return;
    }

    setAnimationRangeError(null);
    setIsWebmExporting(true);
    setWebmExportProgress(0);

    try {
      const { saveAs } = await import('file-saver');
      const exportKind = effectiveGifKind;
      const webmBlob = await exportAnimationWebm({
        frameTimes: frames,
        fps: animationFps,
        kind: exportKind,
        maxDimension: gifMaxDimension,
        quality: webmQuality,
        map: map2Instance.current,
        mapContainer: map2Ref.current,
        activeLayers,
        fireHotspotEnabled,
        fireHotspotMinBrightness,
        fireHotspotMinRedBlueDiff,
        fireHotspotOpacity,
        irStyle,
        visBrightness,
        visContrast,
        hdEnhanceEnabled,
        hdEnhanceHighlightProtection,
        hdEnhanceLocalContrast,
        hdEnhanceNoiseReduction,
        hdEnhancePreset,
        hdEnhanceRadius,
        hdEnhanceSaturationAdjust,
        hdEnhanceShadowProtection,
        hdEnhanceSharpen,
        hdEnhanceStrength,
        rgbSaturation,
        rgbHdOpacity,
        sandwichOpacity,
        autoReduceVisAtNight,
        mapOptions,
        language,
        map1BordersLayer: map1BordersRef.current,
        map1DepartmentsLayer: map1DepartmentsRef.current,
        cityLoadPromise: cityLoadPromiseRef.current,
        getVisibleCityFeatures,
        onProgress: setWebmExportProgress,
      });

      const safeStart = frames[0].replace('T', '_').replace(/:/g, '-');
      const safeEnd = frames[frames.length - 1].replace('T', '_').replace(/:/g, '-');
      const webmFileBaseName = getExportFileBaseName(exportKind, hdEnhanceEnabled);
      saveAs(webmBlob, `MTG_ANIMATION_${webmFileBaseName}_${gifMaxDimension}px_${safeStart}_to_${safeEnd}.webm`);
    } catch (error) {
      console.error('WebM export failed:', error);
      alert(error instanceof Error && error.message === 'webm-unsupported' ? t('animationExportWebmUnsupported') : t('animationExportWebmFailed'));
    } finally {
      setIsWebmExporting(false);
    }
  };

  // Computed once per render (buildAnimationFrameTimes previously ran twice per render:
  // once to check for an error, once more to get the frame count).
  let computedAnimationRangeError: string | null = null;
  let animationFrameTimesPreview: string[] = [];
  try {
    animationFrameTimesPreview = buildAnimationFrameTimes();
  } catch (error) {
    computedAnimationRangeError = mapAnimationErrorCode(error instanceof Error ? error.message : '');
  }
  const animationEstimatedFrameCount = animationFrameTimesPreview.length;
  const animationFileExtension = exportMode === 'webm' ? 'webm' : 'gif';
  const gifFileName = animationFrameTimesPreview.length > 0
    ? `MTG_ANIMATION_${getExportFileBaseName(effectiveGifKind, hdEnhanceEnabled)}_${gifMaxDimension}px_${
      animationFrameTimesPreview[0].replace('T', '_').replace(/:/g, '-')
    }_to_${
      animationFrameTimesPreview[animationFrameTimesPreview.length - 1].replace('T', '_').replace(/:/g, '-')
    }.${animationFileExtension}`
    : '';

  const buildBaseExportOptions = () => {
    if (!map2Instance.current || !map2Ref.current) return null;
    const map = map2Instance.current;
    return {
      map,
      mapContainer: map2Ref.current,
      currentTime,
      activeLayers,
      fireHotspotEnabled,
      fireHotspotMinBrightness,
      fireHotspotMinRedBlueDiff,
      fireHotspotOpacity,
      irStyle,
      visBrightness,
      visContrast,
      hdEnhanceEnabled,
      hdEnhanceHighlightProtection,
      hdEnhanceLocalContrast,
      hdEnhanceNoiseReduction,
      hdEnhancePreset,
      hdEnhanceRadius,
      hdEnhanceSaturationAdjust,
      hdEnhanceShadowProtection,
      hdEnhanceSharpen,
      hdEnhanceStrength,
      rgbSaturation,
      rgbHdOpacity,
      sandwichOpacity,
      autoReduceVisAtNight,
      mapOptions,
      language,
      map1BordersLayer: map1BordersRef.current,
      map1DepartmentsLayer: map1DepartmentsRef.current,
      cityLoadPromise: cityLoadPromiseRef.current,
      getVisibleCityFeatures,
    };
  };

  const revokePreviewImages = () => {
    Object.values(previewImages).forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  };

  const loadDownloadPreviews = async () => {
    const base = buildBaseExportOptions();
    if (!base || availableExportKinds.length === 0) return;
    setIsPreviewLoading(true);

    try {
      const results = await generateExportPreviews({ ...base, requestedKinds: availableExportKinds });
      revokePreviewImages();
      const next: Partial<Record<ExportKind, string>> = {};
      results.forEach(({ kind, url }) => {
        next[kind] = url;
      });
      setPreviewImages(next);
    } catch (err) {
      console.error('Preview generation failed:', err);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const openExportModal = (mode: 'image' | 'gif') => {
    const nextSelection: Record<ExportKind, boolean> = {
      vis: availableExportKinds.includes('vis'),
      rgb: availableExportKinds.includes('rgb'),
      ir: availableExportKinds.includes('ir'),
      hd: availableExportKinds.includes('hd'),
      sandwich: availableExportKinds.includes('sandwich'),
      hybrid: availableExportKinds.includes('hybrid'),
    };
    setSelectedExports(nextSelection);
    setExportMode(mode);
    setIsExportModalOpen(true);
    void loadDownloadPreviews();
  };

  const closeExportModal = () => {
    setIsExportModalOpen(false);
    revokePreviewImages();
    setPreviewImages({});
  };

  const downloadPack = async (requestedKinds: ExportKind[]) => {
    const base = buildBaseExportOptions();
    if (!base) return;
    if (requestedKinds.length === 0) return;
    setIsExporting(true);
    setDownloadProgress(0);

    try {
      await downloadSatellitePack({
        ...base,
        requestedKinds,
        imageFormat: exportFormat,
        maxDimension: exportResolution,
        onProgress: setDownloadProgress,
      });
    } catch (err) {
      console.error('Export failed:', err);
      alert(t('exportFailedAlert'));
    } finally {
      setIsExporting(false);
    }
  };

  const shareCurrentView = async () => {
    if (typeof window === 'undefined') return false;

    const map = map2Instance.current;
    const liveCenter = map?.getCenter();
    const liveZoom = map?.getZoom();
    const shareMapView = clampMapView(
      liveCenter && typeof liveZoom === 'number'
        ? { lat: liveCenter.lat, lng: liveCenter.lng, zoom: liveZoom }
        : mapViewState,
    );

    if (!shareMapView) {
      setShareToastMessage(t('shareUnavailable'));
      return false;
    }

    const snapshot: ShareSnapshot = {
      activeLayers,
      animationFps,
      animationPreset,
      autoReduceVisAtNight,
      customAnimationDate,
      customEndStep,
      customStartStep,
      currentTime,
      fireHotspotEnabled,
      fireHotspotMinBrightness,
      fireHotspotMinRedBlueDiff,
      fireHotspotOpacity,
      gifColorCount,
      gifDitherLevel,
      gifFinalPauseMs,
      gifMaxDimension,
      gifPaletteMode,
      hdEnhanceEnabled,
      hdEnhanceHighlightProtection,
      hdEnhanceLocalContrast,
      hdEnhanceNoiseReduction,
      hdEnhancePreset,
      hdEnhanceRadius,
      hdEnhanceSaturationAdjust,
      hdEnhanceShadowProtection,
      hdEnhanceSharpen,
      hdEnhanceStrength,
      irStyle,
      language,
      mapOptions,
      mapView: shareMapView,
      rgbHdOpacity,
      rgbSaturation,
      sandwichOpacity,
      themeMode,
      visBrightness,
      visContrast,
    };

    return copyShareLink(snapshot, { copied: t('shareCopied'), failed: t('shareCopyFailed') });
  };

  const shareCurrentViewWithFeedback = async () => {
    const copied = await shareCurrentView();
    if (copied) {
      setJustCopiedShareLink(true);
      window.setTimeout(() => setJustCopiedShareLink(false), 1600);
    }
  };

  useEffect(() => {
    const handleGlobalShortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() ?? '';
      const isEditable = target?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
      if (isEditable) return;

      const key = event.key;
      const lowerKey = key.toLowerCase();

      if (event.shiftKey && lowerKey === 's') {
        event.preventDefault();
        void shareCurrentViewWithFeedback();
        return;
      }

      if (lowerKey === 'a') {
        event.preventDefault();
        openExportModal('gif');
        return;
      }

      if (lowerKey === 'd') {
        event.preventDefault();
        openExportModal('image');
        return;
      }

      if (lowerKey === 'f') {
        event.preventDefault();
        setFireHotspotEnabled((prev) => !prev);
        return;
      }

      if (lowerKey === 'l') {
        event.preventDefault();
        void jumpToLatest();
        return;
      }

      if (lowerKey === 'r') {
        event.preventDefault();
        resetAdjustments();
        return;
      }

      if (lowerKey === 's') {
        event.preventDefault();
        setIsAdjustmentsOpen((prev) => !prev);
        return;
      }

      if (lowerKey === 'i') {
        event.preventDefault();
        setIsInfoOpen((prev) => !prev);
        return;
      }

      if (key === '?') {
        event.preventDefault();
        setIsHelpOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [
    handleTimeChange,
    jumpToLatest,
    openExportModal,
    resetAdjustments,
    setFireHotspotEnabled,
    setIsAdjustmentsOpen,
    setIsHelpOpen,
    setIsInfoOpen,
    shareCurrentViewWithFeedback,
  ]);

  const dynamicTileStyleVars = {
    '--mtg-vis-brightness': visBrightness,
    '--mtg-vis-contrast': visContrast,
    '--mtg-rgb-saturation': rgbLayerEffectiveSaturationWithHd,
    '--mtg-rgb-brightness': rgbLayerEffectiveBrightness,
    '--mtg-vis-hd-legacy-brightness': visHdLegacyBrightness,
    '--mtg-vis-hd-legacy-contrast': visHdLegacyContrast,
  } as React.CSSProperties;

  return (
    <div
      className={`theme-${resolvedTheme} flex flex-col h-dvh w-full font-sans overflow-hidden ${
        themedClass(resolvedTheme === 'light', 'bg-slate-100 text-slate-900', 'bg-[#0a0a0a] text-white')
      }`}
      style={dynamicTileStyleVars}
    >
      <div className={`min-h-16 flex flex-wrap items-center justify-between px-3 py-2 sm:px-6 border-b shadow-sm z-10 shrink-0 gap-2 sm:gap-3 ${
        themedClass(resolvedTheme === 'light', 'bg-slate-50 border-slate-200', 'bg-[#111] border-white/10')
      }`}>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/15 flex items-center justify-center shrink-0">
            <span className="text-base leading-none" aria-hidden="true">🛰️</span>
          </div>
          <div className="flex flex-col min-w-0">
            <h1 className={`text-base sm:text-lg font-medium tracking-tight whitespace-nowrap ${
              themedClass(resolvedTheme === 'light', 'text-slate-900', 'text-slate-100')
            }`}>MTG-RGB-HD</h1>
            <p className={`hidden lg:block text-xs whitespace-nowrap ${
              themedClass(resolvedTheme === 'light', 'text-slate-600', 'text-slate-400')
            }`}>{t('subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center justify-center sm:justify-end gap-2 sm:gap-3 relative shrink-0 flex-wrap w-full sm:w-auto">
          <div className="hidden sm:flex items-center gap-2 sm:gap-3">
          <div className={`flex items-center gap-1 rounded-lg p-1 border ${
            themedClass(resolvedTheme === 'light', 'bg-white border-slate-200', 'bg-[#1b1b1b] border-white/10')
          }`}>
            <div className={`relative grid grid-cols-2 rounded-md p-0.5 border ${
              themedClass(resolvedTheme === 'light', 'bg-slate-100 border-slate-200', 'bg-black/30 border-white/10')
            }`}>
              <span
                className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-[5px] bg-blue-500 shadow-sm transition-all duration-200"
                style={{ left: language === 'fr' ? 2 : 'calc(50% + 0px)' }}
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => setLanguage('fr')}
                aria-pressed={language === 'fr'}
                title={t('langFrench')}
                className={`relative z-10 rounded px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] font-medium transition-colors ${
                  language === 'fr'
                    ? 'text-white'
                    : resolvedTheme === 'light'
                      ? 'text-slate-700 hover:text-slate-900'
                      : 'text-slate-200 hover:text-white'
                }`}
              >
                FR
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                aria-pressed={language === 'en'}
                title={t('langEnglish')}
                className={`relative z-10 rounded px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] font-medium transition-colors ${
                  language === 'en'
                    ? 'text-white'
                    : resolvedTheme === 'light'
                      ? 'text-slate-700 hover:text-slate-900'
                      : 'text-slate-200 hover:text-white'
                }`}
              >
                EN
              </button>
            </div>
          </div>

          <div className={`flex items-center gap-1 rounded-lg p-1 border ${
            themedClass(resolvedTheme === 'light', 'bg-white border-slate-200', 'bg-[#1b1b1b] border-white/10')
          }`}>
            <div className={`relative grid grid-cols-3 rounded-md p-0.5 border ${
              themedClass(resolvedTheme === 'light', 'bg-slate-100 border-slate-200', 'bg-black/30 border-white/10')
            }`}>
              <span
                className="absolute top-0.5 bottom-0.5 w-[calc(33.333%-2px)] rounded-[5px] bg-blue-500 shadow-sm transition-all duration-200"
                style={{
                  left: themeMode === 'dark' ? 2 : themeMode === 'light' ? 'calc(33.333% + 1px)' : 'calc(66.666% + 0px)',
                }}
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => setThemeMode('dark')}
                aria-pressed={themeMode === 'dark'}
                aria-label={t('themeDark')}
                title={t('themeDark')}
                className={`relative z-10 rounded p-1 sm:px-2 sm:py-1 text-[11px] font-medium transition-colors ${
                  themeMode === 'dark'
                    ? 'text-white'
                    : resolvedTheme === 'light'
                      ? 'text-slate-700 hover:text-slate-900'
                      : 'text-slate-200 hover:text-white'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setThemeMode('light')}
                aria-pressed={themeMode === 'light'}
                aria-label={t('themeLight')}
                title={t('themeLight')}
                className={`relative z-10 rounded p-1 sm:px-2 sm:py-1 text-[11px] font-medium transition-colors ${
                  themeMode === 'light'
                    ? 'text-white'
                    : resolvedTheme === 'light'
                      ? 'text-slate-700 hover:text-slate-900'
                      : 'text-slate-200 hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setThemeMode('auto')}
                aria-pressed={themeMode === 'auto'}
                aria-label={t('themeAuto')}
                title={t('themeAuto')}
                className={`relative z-10 rounded p-1 sm:px-2 sm:py-1 text-[11px] font-medium transition-colors ${
                  themeMode === 'auto'
                    ? 'text-white'
                    : resolvedTheme === 'light'
                      ? 'text-slate-700 hover:text-slate-900'
                      : 'text-slate-200 hover:text-white'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <HeaderInfoButton onHelpClick={() => setIsHelpOpen(true)} onInfoClick={() => setIsInfoOpen(true)} t={t} theme={resolvedTheme} />
          </div>

          <HeaderOverflowButton onOpen={() => setIsOverflowMenuOpen(true)} t={t} theme={resolvedTheme} />

          <button
            onClick={() => { void shareCurrentViewWithFeedback(); }}
            className={`flex items-center justify-center gap-2 w-11 h-11 sm:w-auto sm:h-auto sm:px-4 sm:py-2 rounded-md font-medium text-sm transition-colors shrink-0 ${
              justCopiedShareLink
                ? resolvedTheme === 'light'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                : resolvedTheme === 'light'
                  ? 'bg-slate-100 text-slate-900 hover:bg-slate-200 border border-slate-300'
                  : 'bg-[#222] text-white hover:bg-[#333] border border-white/10'
            }`}
            title={t('shareView')}
          >
            {justCopiedShareLink ? <Check className="w-4 h-4 shrink-0" /> : <Share2 className="w-4 h-4 shrink-0" />}
            <span className="hidden sm:inline">{justCopiedShareLink ? t('shareCopiedShort') : t('shareView')}</span>
          </button>

          <button
            onClick={() => openExportModal('image')}
            disabled={isExporting || isGifExporting || isWebmExporting}
            className={`flex items-center justify-center gap-2 w-11 h-11 sm:w-auto sm:h-auto sm:px-4 sm:py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${
              resolvedTheme === 'light'
                ? 'bg-slate-900 text-white hover:bg-slate-700'
                : 'bg-white text-black hover:bg-slate-200'
            }`}
          >
            {isExporting || isGifExporting || isWebmExporting ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Download className="w-4 h-4 shrink-0" />}
            <span className="hidden sm:inline">
              {isExporting
                ? `${t('generating')} ${downloadProgress}%`
                : isGifExporting
                  ? `${t('generating')} ${gifExportProgress}%`
                  : isWebmExporting
                    ? `${t('generating')} ${webmExportProgress}%`
                    : t('export')}
            </span>
          </button>
        </div>
      </div>

      {/* Maps Layout */}
      <div className="flex-1 w-full min-h-0 relative z-0">
        <div className="w-full h-full relative z-0">
          <div
            ref={map1Ref}
            className="absolute -left-[99999px] top-0 w-px h-px opacity-0 pointer-events-none"
            aria-hidden="true"
          />

          <div className="absolute top-4 left-4 right-4 z-[400] flex flex-wrap items-start gap-2 pointer-events-none">
          <Map2TitleBadge activeLayers={activeLayers} isNightIrFallbackActive={isNightIrFallbackActive} t={t} theme={resolvedTheme} />

          <Map2ControlBar
            activeLayers={activeLayers}
            adjustmentsRef={adjustmentsRef}
            autoReduceVisAtNight={autoReduceVisAtNight}
            effectiveHybridVisOpacity={effectiveHybridVisOpacity}
            effectiveSandwichOpacity={effectiveSandwichOpacity}
            fireHotspotEnabled={fireHotspotEnabled}
            fireHotspotMinBrightness={fireHotspotMinBrightness}
            fireHotspotMinRedBlueDiff={fireHotspotMinRedBlueDiff}
            fireHotspotOpacity={fireHotspotOpacity}
            fireHotspotRef={fireHotspotRef}
            hdEnhanceEnabled={hdEnhanceEnabled}
            hdEnhanceHighlightProtection={hdEnhanceHighlightProtection}
            hdEnhanceLocalContrast={hdEnhanceLocalContrast}
            hdEnhanceNoiseReduction={hdEnhanceNoiseReduction}
            hdEnhancePreset={hdEnhancePreset}
            hdEnhanceRadius={hdEnhanceRadius}
            hdEnhanceSaturationAdjust={hdEnhanceSaturationAdjust}
            hdEnhanceShadowProtection={hdEnhanceShadowProtection}
            hdEnhanceSharpen={hdEnhanceSharpen}
            hdEnhanceStrength={hdEnhanceStrength}
            irStyle={irStyle}
            isAdjustmentsOpen={isAdjustmentsOpen}
            isFireHotspotOpen={isFireHotspotOpen}
            mapOptions={mapOptions}
            onActiveLayersChange={(next) => setActiveLayers(sanitizeActiveLayers(next))}
            onAutoReduceVisAtNightChange={setAutoReduceVisAtNight}
            onFireHotspotEnabledChange={setFireHotspotEnabled}
            onFireHotspotMinBrightnessChange={setFireHotspotMinBrightness}
            onFireHotspotMinRedBlueDiffChange={setFireHotspotMinRedBlueDiff}
            onFireHotspotOpacityChange={setFireHotspotOpacity}
            onToggleFireHotspot={() => setIsFireHotspotOpen((prev) => !prev)}
            onHdEnhanceEnabledChange={setHdEnhanceEnabled}
            onHdEnhanceHighlightProtectionChange={(value) => applyHdSliderChange(() => setHdEnhanceHighlightProtection(value))}
            onHdEnhanceLocalContrastChange={(value) => applyHdSliderChange(() => setHdEnhanceLocalContrast(value))}
            onHdEnhanceNoiseReductionChange={(value) => applyHdSliderChange(() => setHdEnhanceNoiseReduction(value))}
            onHdEnhancePresetChange={handleHdPresetChange}
            onHdEnhanceRadiusChange={(value) => applyHdSliderChange(() => setHdEnhanceRadius(value))}
            onHdEnhanceSaturationAdjustChange={(value) => applyHdSliderChange(() => setHdEnhanceSaturationAdjust(value))}
            onHdEnhanceShadowProtectionChange={(value) => applyHdSliderChange(() => setHdEnhanceShadowProtection(value))}
            onHdEnhanceSharpenChange={(value) => applyHdSliderChange(() => setHdEnhanceSharpen(value))}
            onHdEnhanceStrengthChange={(value) => applyHdSliderChange(() => setHdEnhanceStrength(value))}
            onIrStyleChange={setIrStyle}
            onMapOptionsChange={setMapOptions}
            onResetAdjustments={resetAdjustments}
            onRgbHdOpacityChange={setRgbHdOpacity}
            onRgbSaturationChange={setRgbSaturation}
            onSandwichOpacityChange={setSandwichOpacity}
            onToggleAdjustments={() => setIsAdjustmentsOpen((prev) => !prev)}
            onResetHdEnhancement={resetHdEnhancement}
            onVisBrightnessChange={setVisBrightness}
            onVisContrastChange={setVisContrast}
            rgbHdOpacity={rgbHdOpacity}
            rgbSaturation={rgbSaturation}
            sandwichOpacity={sandwichOpacity}
            solarElevation={solarElevation}
            t={t}
            theme={resolvedTheme}
            visBrightness={visBrightness}
            visContrast={visContrast}
          />
          </div>

          <div ref={map2Ref} className="w-full h-full bg-[#0a0a0a] !z-0" />

          <TimeDock
            currentTime={currentTime}
            isSyncingLatest={isJumpingToLatest}
            onLatest={() => { void jumpToLatest(); }}
            onTimeChange={handleTimeChange}
            t={t}
            theme={resolvedTheme}
          />

          {isMapLoading && (
            <div className="absolute inset-x-0 top-20 sm:top-24 z-[430] pointer-events-none flex justify-center px-3">
              <div className={`backdrop-blur-md border rounded-lg px-4 py-3 text-xs shadow-2xl w-[min(92vw,320px)] ${
                resolvedTheme === 'light'
                  ? 'bg-white/95 border-slate-300 text-slate-800'
                  : 'bg-black/65 border-white/15 text-slate-100'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-300" />
                    <span>{t('loadingTiles')}</span>
                  </div>
                  <span className="text-blue-200 font-mono tabular-nums">{loadingProgress}%</span>
                </div>

                <div className={`mt-2 h-1.5 w-full rounded overflow-hidden ${themedClass(resolvedTheme === 'light', 'bg-slate-300', 'bg-white/10')}`}>
                  <div
                    className="h-full bg-blue-400 transition-[width] duration-150"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>

                {loadingTileCount > 0 && (
                  <div className={`mt-1 text-[11px] font-mono ${themedClass(resolvedTheme === 'light', 'text-slate-600', 'text-slate-300')}`}>{t('pendingTiles')}: {loadingTileCount}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <HelpModal helpRef={helpRef} isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} t={t} theme={resolvedTheme} />
      <InfoModal infoRef={infoRef} isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} t={t} theme={resolvedTheme} />

      <HeaderOverflowMenu
        isOpen={isOverflowMenuOpen}
        language={language}
        menuRef={overflowMenuRef}
        onClose={() => setIsOverflowMenuOpen(false)}
        onHelpClick={() => { setIsOverflowMenuOpen(false); setIsHelpOpen(true); }}
        onInfoClick={() => { setIsOverflowMenuOpen(false); setIsInfoOpen(true); }}
        onLanguageChange={setLanguage}
        onThemeModeChange={setThemeMode}
        t={t}
        theme={resolvedTheme}
        themeMode={themeMode}
      />

      {shareToastMessage && (
        <div className={`fixed left-1/2 -translate-x-1/2 top-20 sm:top-24 z-[610] pointer-events-none px-4 py-2 text-xs rounded-md border shadow-xl backdrop-blur-md ${
          resolvedTheme === 'light'
            ? 'bg-white/95 border-slate-300 text-slate-800'
            : 'bg-black/70 border-white/15 text-slate-100'
        }`}>
          {shareToastMessage}
        </div>
      )}

      <ExportModal
        availableExportKinds={availableExportKinds}
        currentTime={currentTime}
        customDate={customAnimationDate}
        customEnd={customAnimationEnd}
        customEndStep={customEndStep}
        customLatestDate={latestAvailableDatePart}
        customMaxStep={customDayMaxStep}
        customStart={customAnimationStart}
        customStartStep={customStartStep}
        downloadProgress={downloadProgress}
        estimatedFrameCount={animationEstimatedFrameCount}
        exportFormat={exportFormat}
        exportModalRef={exportModalRef}
        exportResolution={exportResolution}
        fireHotspotEnabled={fireHotspotEnabled}
        exportResolutionText={(() => {
          const container = map2Ref.current;
          if (!container) return `${exportResolution}x${exportResolution}`;
          const rect = container.getBoundingClientRect();
          const rawWidth = Math.max(64, Math.round(rect.width));
          const rawHeight = Math.max(64, Math.round(rect.height));
          const scale = exportResolution / Math.max(rawWidth, rawHeight);
          const width = Math.max(64, Math.round(rawWidth * scale));
          const height = Math.max(64, Math.round(rawHeight * scale));
          return `${width}x${height}`;
        })()}
        fps={animationFps}
        gifColorCount={gifColorCount}
        gifDitherLevel={gifDitherLevel}
        gifFileName={gifFileName}
        gifFinalPauseMs={gifFinalPauseMs}
        gifMaxDimension={gifMaxDimension}
        gifPaletteMode={gifPaletteMode}
        gifProgress={gifExportProgress}
        gifSelectedKind={effectiveGifKind}
        hdEnhanceEnabled={hdEnhanceEnabled}
        isExporting={isExporting}
        isExportingGif={isGifExporting}
        isExportingWebm={isWebmExporting}
        isOpen={isExportModalOpen}
        isPreviewLoading={isPreviewLoading}
        mode={exportMode}
        onClose={closeExportModal}
        onColorCountChange={setGifColorCount}
        onConfirmImage={() => {
          if (selectedExportKinds.length === 0) return;
          void downloadPack(selectedExportKinds);
        }}
        onCustomDateChange={handleCustomDateChange}
        onCustomEndStepChange={handleCustomEndStepChange}
        onCustomStartStepChange={handleCustomStartStepChange}
        onDitherLevelChange={setGifDitherLevel}
        onExportFormatChange={setExportFormat}
        onExportGif={() => { void exportGif(); }}
        onExportResolutionChange={setExportResolution}
        onExportWebm={() => { void exportWebm(); }}
        onFinalPauseChange={setGifFinalPauseMs}
        onFpsChange={setAnimationFps}
        onGifKindChange={setGifSelectedKind}
        onModeChange={setExportMode}
        onPaletteModeChange={setGifPaletteMode}
        onPresetChange={handleAnimationPresetChange}
        onResolutionChange={setGifMaxDimension}
        onToggleImageKind={(kind, checked) => setSelectedExports((prev) => ({ ...prev, [kind]: checked }))}
        onWebmQualityChange={setWebmQuality}
        preset={animationPreset}
        previewImages={previewImages}
        rangeError={computedAnimationRangeError ?? animationRangeError}
        selectedExports={selectedExports}
        selectedExportKinds={selectedExportKinds}
        t={t}
        webmProgress={webmExportProgress}
        webmQuality={webmQuality}
        theme={resolvedTheme}
      />

      {/* Static stylesheet; per-render values are passed as CSS custom properties above. */}
      <style>{DYNAMIC_TILE_STYLES}</style>
    </div>
  );
}
