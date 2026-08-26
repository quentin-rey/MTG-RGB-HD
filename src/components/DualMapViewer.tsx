import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { Check, Download, Loader2, Monitor, Moon, Share2, Sun } from 'lucide-react';
import {
  DEFAULT_ACTIVE_LAYERS,
  computeLayerBlendState,
  fetchVerifiedLatestAvailableTime,
  getRenderedWmsLayers,
  getAvailableExportKindsFromLayers,
  getExportFileBaseName,
  getHdEnhancementProfile,
  getLatestAvailableTime,
  sanitizeMapOptions,
  sanitizeUtcDateValue,
  sanitizeUtcMinuteValue,
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
  renderAnimationFrameBlobs,
  exportAnimationWebm,
  generateExportPreviews,
  type GifDitherLevel,
  type GifFinalPauseMs,
  type GifPaletteMode,
  type StillImageFormat,
  WMS_CORS_BLOCKED,
} from './dualMapExport';

/** The imagery is reachable but the browser refuses to let the page read its pixels, because the
 *  WMS server stopped sending its CORS header. Nothing the user can act on — so say that, rather
 *  than sending them to check a connection that is working fine. */
const isWmsCorsBlocked = (error: unknown) => error instanceof Error && error.message === WMS_CORS_BLOCKED;
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
  PlaybackExitModal,
  TimeDock,
  ZoomControl,
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
  /* Every filter below sits on the individual tiles, never on the Leaflet tile container that
     carries the class. A CSS filter makes WebKit render its element into one buffer, and past
     roughly 1750px wide it stops painting: on a 2560px-wide window Safari left the right third of
     the map pure black, tiles loaded and correctly positioned but never drawn (issue #79). Chrome
     and Firefox paint it fine, which is why this only ever showed up on Safari. These filters are
     all pointwise — brightness, contrast, saturate, grayscale — so applying them per tile is
     pixel-identical to applying them to the whole layer. mix-blend-mode stays on the container:
     it has to blend against what is behind the layer, and it is not what triggers the bug. */
  .vis-layer-tiles .leaflet-tile {
    filter: brightness(var(--mtg-vis-brightness)) contrast(var(--mtg-vis-contrast));
  }
  .rgb-layer-tiles .leaflet-tile {
    filter: saturate(var(--mtg-rgb-saturation)) brightness(var(--mtg-rgb-brightness));
  }
  .ir-overlay-layer-tiles {
    mix-blend-mode: color;
  }
  .ir-overlay-layer-tiles .leaflet-tile {
    filter: saturate(1.2) contrast(1.08);
  }
  /* Raw IR crossfaded in underneath the VIS+IR cloud-only composite as dusk approaches (see
     cloudOnlyIrNightFloor), purely so the composite's own mix-blend-mode: color (which takes
     its luminosity from whatever's behind it) has a brighter backdrop to read luminosity from as
     VIS dims — not meant to be seen as color itself. Must stay grayscale: color blend assumes
     a neutral-luminance backdrop (the classic 'tint a B&W photo' use case); feeding it an already
     colored backdrop (this same raw IR image, un-desaturated) made the composite's own hue fight
     the backdrop's hue, producing muddy off-palette greens/reds in thick cloud cores instead of
     the clean blue/cyan/yellow ramp. Brightness-only keeps the composite in charge of hue/sat. */
  .ir-fallback-base-layer-tiles .leaflet-tile {
    filter: grayscale(1) contrast(1.05);
  }
  .ir-cloud-only-layer-tiles {
    mix-blend-mode: color;
  }
  .ir-cloud-only-layer-tiles .leaflet-tile {
    filter: saturate(1.2) contrast(1.08);
  }
  .vis-overlay-layer-tiles {
    mix-blend-mode: soft-light;
  }
  .vis-overlay-layer-tiles .leaflet-tile {
    filter: brightness(var(--mtg-vis-brightness)) contrast(var(--mtg-vis-contrast));
  }
  .vis-overlay-layer-tiles-rgb-hd {
    mix-blend-mode: luminosity;
  }
  .vis-overlay-layer-tiles-rgb-hd .leaflet-tile {
    filter: brightness(var(--mtg-vis-hd-legacy-brightness)) contrast(var(--mtg-vis-hd-legacy-contrast));
  }
  .vis-overlay-layer-tiles-on-ir {
    mix-blend-mode: screen;
  }
  .vis-overlay-layer-tiles-on-ir .leaflet-tile {
    filter: brightness(var(--mtg-vis-brightness)) contrast(var(--mtg-vis-contrast)) saturate(1.05);
  }
  .vis-overlay-layer-tiles-hybrid {
    mix-blend-mode: luminosity;
  }
  .vis-overlay-layer-tiles-hybrid .leaflet-tile {
    filter: brightness(var(--mtg-vis-brightness)) contrast(var(--mtg-vis-contrast));
  }
`;

const TEN_MINUTES_MS = 10 * 60 * 1000;
const MAX_ANIMATION_EXPORT_FRAMES = 73;
/**
 * Playback and export share one ceiling: since the animation panel became the only way to obtain
 * a GIF or a WebM, capping playback lower would have quietly removed twelve-hour animations.
 * Preparing that many frames takes minutes, which is why the launch button spells the count out.
 */
const MAX_ANIMATION_PLAYBACK_FRAMES = MAX_ANIMATION_EXPORT_FRAMES;
const MIN_PLAYBACK_FPS = 4;
const MAX_PLAYBACK_FPS = 12;
const DEFAULT_PLAYBACK_FPS = 8;
/**
 * Rendered frame sizes for playback. Each frame is a full render, so this trades preparation time
 * and memory against sharpness: 960 prepares about a third faster than 1280, 1600 about a third
 * slower. A whole sequence stays a few tens of megabytes at any of them.
 */
const PLAYBACK_QUALITY_CHOICES = [960, 1280, 1600] as const;
type PlaybackQuality = (typeof PLAYBACK_QUALITY_CHOICES)[number];
const DEFAULT_PLAYBACK_QUALITY: PlaybackQuality = 1280;
const MAX_CUSTOM_RANGE_MS = 12 * 60 * 60 * 1000;
const MIN_CUSTOM_RANGE_MS = 1 * 60 * 60 * 1000;
const DAY_MAX_STEP = (24 * 60) / 10 - 1;
const CUSTOM_MIN_RANGE_STEPS = MIN_CUSTOM_RANGE_MS / TEN_MINUTES_MS;
const CUSTOM_MAX_RANGE_STEPS = MAX_CUSTOM_RANGE_MS / TEN_MINUTES_MS;

type CustomAnimationRange = {
  date: string;
  startStep: number;
  endStep: number;
  dayMaxStep: number;
  start: string;
  end: string;
  setDate: (nextDate: string) => void;
  setStartStep: (step: number) => void;
  setEndStep: (step: number) => void;
  seed: (nextDate: string, nextStartStep: number, nextEndStep: number) => void;
};

/**
 * One custom animation range: a UTC day plus a start and end ten-minute step inside it, kept
 * normalised (ordered, at least one hour, at most twelve, never past the latest available image).
 *
 * Instantiated twice — once for the export, once for playback — because the two are deliberately
 * independent: setting up a twelve-hour GIF should not silently change what the play button is
 * about to read back, and vice versa.
 */
function useCustomAnimationRange(options: {
  initialDate: string;
  initialStartStep: number;
  initialEndStep: number;
  latestAvailableTime: string;
  latestAvailableDatePart: string;
}): CustomAnimationRange {
  const { latestAvailableTime, latestAvailableDatePart } = options;
  const [date, setDateState] = useState(options.initialDate);
  const [startStep, setStartStep] = useState(options.initialStartStep);
  const [endStep, setEndStep] = useState(options.initialEndStep);

  const dayMaxStep = getLatestAllowedStepForDate(date, latestAvailableTime);

  useEffect(() => {
    const normalized = normalizeCustomDaySteps(startStep, endStep, dayMaxStep);
    if (normalized.start !== startStep) setStartStep(normalized.start);
    if (normalized.end !== endStep) setEndStep(normalized.end);
  }, [date, dayMaxStep, endStep, startStep]);

  return {
    date,
    startStep,
    endStep,
    dayMaxStep,
    start: `${date}T${toTimePartFromStep(startStep)}`,
    end: `${date}T${toTimePartFromStep(endStep)}`,
    setDate: (nextDate: string) => {
      setDateState(nextDate > latestAvailableDatePart ? latestAvailableDatePart : nextDate);
    },
    setStartStep: (step: number) => {
      const minSpan = Math.max(1, Math.min(CUSTOM_MIN_RANGE_STEPS, dayMaxStep));
      const maxSpan = Math.max(minSpan, Math.min(CUSTOM_MAX_RANGE_STEPS, dayMaxStep));
      const minStart = Math.max(0, endStep - maxSpan);
      const maxStart = Math.max(0, endStep - minSpan);
      setStartStep(Math.max(minStart, Math.min(maxStart, Math.round(step))));
    },
    setEndStep: (step: number) => {
      const minSpan = Math.max(1, Math.min(CUSTOM_MIN_RANGE_STEPS, dayMaxStep));
      const maxSpan = Math.max(minSpan, Math.min(CUSTOM_MAX_RANGE_STEPS, dayMaxStep));
      const minEnd = Math.min(dayMaxStep, startStep + minSpan);
      const maxEnd = Math.min(dayMaxStep, startStep + maxSpan);
      setEndStep(Math.max(minEnd, Math.min(maxEnd, Math.round(step))));
    },
    seed: (nextDate: string, nextStartStep: number, nextEndStep: number) => {
      setDateState(nextDate);
      setStartStep(nextStartStep);
      setEndStep(nextEndStep);
    },
  };
}

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
    const stored = sanitizeMapOptions(readStoredJson<unknown>(STORAGE_KEYS.mapOptions, defaults), defaults);
    return sanitizeMapOptions({ ...stored, ...(sharedSnapshot?.mapOptions ?? {}) }, stored);
  });

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.mapOptions, JSON.stringify(mapOptions));
  }, [mapOptions]);

  useEffect(() => {
    if (!mapViewState) return;
    safeSetLocalStorage(STORAGE_KEYS.lastMapView, JSON.stringify(mapViewState));
  }, [mapViewState]);

  // Initialize time to current time (rounded to nearest 10 mins as MTG is every 10 min, with buffer).
  // Priority: share-link snapshot > last time the user viewed (persisted below) > "latest available".
  // Both sources are validated rather than trusted: an unusable value is treated as absent, so a
  // malformed share link or a corrupted storage entry degrades to "start at latest" instead of
  // throwing on `currentTime.split('T')` and blanking the app (see sanitizeUtcMinuteValue).
  const sharedCurrentTime = sanitizeUtcMinuteValue(sharedSnapshot?.currentTime);
  const restoredCurrentTime = sharedCurrentTime
    ?? sanitizeUtcMinuteValue(readStoredJson<unknown>(STORAGE_KEYS.currentTime, null));
  const hadRestoredCurrentTimeRef = useRef(restoredCurrentTime !== null);
  const [currentTime, setCurrentTime] = useState(() => restoredCurrentTime ?? getLatestAvailableTime());

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.currentTime, JSON.stringify(currentTime));
  }, [currentTime]);
  const [animationPreset, setAnimationPreset] = useState<AnimationPreset>(() => {
    const preset = sharedSnapshot?.animationPreset;
    return preset === '3h' || preset === '6h' || preset === '12h' || preset === 'custom' ? preset : '3h';
  });
  const [animationFps, setAnimationFps] = useState(() => {
    const fps = Number(sharedSnapshot?.animationFps ?? 6);
    return Math.max(2, Math.min(20, Math.round(fps)));
  });

  // In-app animation (issue #78). `playbackFrames` is the resolved sequence for the current
  // session, `playbackIndex` the frame on screen; `isPlaybackActive` is what tells the map hook to
  // switch times without waiting, since every frame has already been warmed.
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackFrames, setPlaybackFrames] = useState<string[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackPreload, setPlaybackPreload] = useState<{ done: number; total: number } | null>(null);
  const [playbackUrls, setPlaybackUrls] = useState<string[]>([]);
  const [playbackFps, setPlaybackFps] = useState<number>(() => {
    const stored = readStoredJson<number>(STORAGE_KEYS.playbackFps, DEFAULT_PLAYBACK_FPS);
    return Number.isFinite(stored)
      ? Math.max(MIN_PLAYBACK_FPS, Math.min(MAX_PLAYBACK_FPS, Math.round(stored)))
      : DEFAULT_PLAYBACK_FPS;
  });
  const [playbackBoomerang, setPlaybackBoomerang] = useState<boolean>(
    () => readStoredJson<boolean>(STORAGE_KEYS.playbackBoomerang, false),
  );
  const [playbackQuality, setPlaybackQuality] = useState<PlaybackQuality>(() => {
    const stored = readStoredJson<PlaybackQuality>(STORAGE_KEYS.playbackQuality, DEFAULT_PLAYBACK_QUALITY);
    return PLAYBACK_QUALITY_CHOICES.includes(stored) ? stored : DEFAULT_PLAYBACK_QUALITY;
  });
  const [playbackPreset, setPlaybackPreset] = useState<AnimationPreset>(() => {
    const stored = readStoredJson<AnimationPreset>(STORAGE_KEYS.playbackPreset, '3h');
    return stored === '3h' || stored === '6h' || stored === '12h' || stored === 'custom' ? stored : '3h';
  });
  const playbackCancelRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.playbackFps, JSON.stringify(playbackFps));
  }, [playbackFps]);
  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.playbackPreset, JSON.stringify(playbackPreset));
  }, [playbackPreset]);
  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.playbackQuality, JSON.stringify(playbackQuality));
  }, [playbackQuality]);
  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.playbackBoomerang, JSON.stringify(playbackBoomerang));
  }, [playbackBoomerang]);
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
  // The single source of truth for "what is the newest image that actually exists". Everything
  // that needs to reason about freshness reads this: the "past image" badge (#52), auto-update
  // (#50), the date-input max, the animation range clamps and handleTimeChange's own clamp.
  //
  // It has to be *state*, not a bare `getLatestAvailableTime()` call per render, for the reason
  // both issues exist: that helper is a synchronous heuristic (now − 20min floored to 10min) that
  // nothing re-evaluates, so no render ever happens just because a new image was published — the
  // UI could not have told you a newer image existed even if it wanted to. Seeded from the
  // heuristic (instant, no network) and then kept honest by `fetchVerifiedLatestAvailableTime`,
  // which verifies against each *rendered* layer's own published time rather than assuming a
  // shared publishing lag. Only verified probe results are ever stored here — see the refresh
  // effect below for why that distinction is load-bearing (issue #55).
  const [latestAvailableTime, setLatestAvailableTime] = useState(() => getLatestAvailableTime());
  const latestAvailableDatePart = latestAvailableTime.split('T')[0];

  // Single place where a verified probe result is committed, shared by the refresh poll,
  // "Dernier" and the mount-time sync — they each applied their own copy of this comparison and
  // could drift apart.
  //
  // The seeded value above is the *unverified* heuristic, and that heuristic regularly overshoots
  // reality: its fixed 20-minute buffer is shorter than real publishing lag (RGB was measured at
  // ~28min while VIS/IR sat at ~18min). So the first verified probe is usually *older* than the
  // seed. Refusing to move backwards from it — which is what the plain monotonic guard did —
  // kept an invented timestamp until real publishing caught up ten-odd minutes later, showing a
  // "past image" badge while the view was on the newest image that exists, and stalling
  // auto-update for that whole window (issue #66). Monotonicity only makes sense between two
  // verified values, where a regression could only be noise; it must never protect a guess.
  const latestIsVerifiedRef = useRef(false);
  const commitVerifiedLatest = (verifiedTime: string, options?: { mayGoBackwards?: boolean }) => {
    // Read (and set) the flag before queueing the update: the updater below runs later, by which
    // point the ref would already say "verified" and the first probe would lose its exemption.
    const hadVerifiedValue = latestIsVerifiedRef.current;
    latestIsVerifiedRef.current = true;
    setLatestAvailableTime((previous) => {
      if (!hadVerifiedValue || options?.mayGoBackwards) return verifiedTime;
      return verifiedTime > previous ? verifiedTime : previous;
    });
  };

  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState<boolean>(
    () => readStoredJson<boolean>(STORAGE_KEYS.autoUpdate, false),
  );
  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.autoUpdate, JSON.stringify(autoUpdateEnabled));
  }, [autoUpdateEnabled]);

  // The one predicate both issues are built on. #52 renders a cue when this is false; #50 only
  // advances while it is true. Deriving both from the same comparison is the point of doing them
  // together — two independent staleness checks would drift apart, the same way the live and
  // export renderers did before their blending math was centralised into
  // `computeLayerBlendState` (dualMapViewerShared.ts).
  const isAtLatest = currentTime >= latestAvailableTime;
  const exportRange = useCustomAnimationRange({
    initialDate: sanitizeUtcDateValue(sharedSnapshot?.customAnimationDate) ?? currentTime.split('T')[0],
    initialStartStep: typeof sharedSnapshot?.customStartStep === 'number'
      ? Math.max(0, Math.min(DAY_MAX_STEP, Math.round(sharedSnapshot.customStartStep)))
      : Math.max(0, getStepFromUtcValue(latestAvailableTime) - 18),
    initialEndStep: typeof sharedSnapshot?.customEndStep === 'number'
      ? Math.max(0, Math.min(DAY_MAX_STEP, Math.round(sharedSnapshot.customEndStep)))
      : getStepFromUtcValue(latestAvailableTime),
    latestAvailableTime,
    latestAvailableDatePart,
  });

  // Playback's own range, independent of the export's (see useCustomAnimationRange).
  const playbackRange = useCustomAnimationRange({
    initialDate: sanitizeUtcDateValue(readStoredJson<string | null>(STORAGE_KEYS.playbackCustomDate, null))
      ?? currentTime.split('T')[0],
    initialStartStep: readStoredJson<number>(STORAGE_KEYS.playbackCustomStartStep, Math.max(0, getStepFromUtcValue(latestAvailableTime) - 18)),
    initialEndStep: readStoredJson<number>(STORAGE_KEYS.playbackCustomEndStep, getStepFromUtcValue(latestAvailableTime)),
    latestAvailableTime,
    latestAvailableDatePart,
  });

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.playbackCustomDate, JSON.stringify(playbackRange.date));
    safeSetLocalStorage(STORAGE_KEYS.playbackCustomStartStep, JSON.stringify(playbackRange.startStep));
    safeSetLocalStorage(STORAGE_KEYS.playbackCustomEndStep, JSON.stringify(playbackRange.endStep));
  }, [playbackRange.date, playbackRange.startStep, playbackRange.endStep]);

  const customAnimationDate = exportRange.date;
  const customStartStep = exportRange.startStep;
  const customEndStep = exportRange.endStep;
  const customDayMaxStep = exportRange.dayMaxStep;
  const customAnimationStart = exportRange.start;
  const customAnimationEnd = exportRange.end;
  const handleCustomDateChange = exportRange.setDate;
  const handleCustomStartStepChange = exportRange.setStartStep;
  const handleCustomEndStepChange = exportRange.setEndStep;

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

  // Which WMS layers are actually on screen right now — NOT simply `activeLayers` (issue #55).
  // At dusk `shouldPreferIrBaseAtNight` renders IR as the base even in RGB+VIS mode, where
  // `activeLayers.ir` is false; probing only the flagged-active layers left the visible base
  // layer's freshness unchecked, so it silently snapped to a different instant than the overlays.
  // Derived from `computeLayerBlendState`, the same function the renderers use to decide what to
  // draw, so the probe set cannot drift away from what is actually drawn.
  const renderedWmsLayers = getRenderedWmsLayers({
    activeLayers,
    blendState: computeLayerBlendState({
      activeLayers,
      rgbHdOpacity,
      sandwichOpacity,
      autoReduceVisAtNight,
      solarElevation,
    }),
    fireHotspotEnabled,
  });
  const renderedWmsLayersKey = [...renderedWmsLayers].sort().join(',');

  // Keeps `latestAvailableTime` current. Deliberately NOT a plain setInterval on its own:
  // browsers throttle timers hard in a backgrounded tab, and "came back to the app after two
  // hours" is precisely the situation issue #52 is about — so a visibilitychange re-probe is the
  // part that actually matters, with the interval covering a tab left open in the foreground.
  // MTG publishes every 10 minutes; probing every 5 keeps the badge honest without being chatty
  // (one small scoped GetCapabilities per rendered layer, no GetMap traffic).
  const previousRenderedLayersKeyRef = useRef(renderedWmsLayersKey);
  useEffect(() => {
    // Bringing a laggier layer into view (enabling IR, or dusk switching the base to it) can
    // legitimately move the verified latest *backwards*; that first probe after a layer-set
    // change is therefore allowed to lower the value. Within a stable layer set it is not, since
    // a regression there could only be noise.
    const layerSetChanged = previousRenderedLayersKeyRef.current !== renderedWmsLayersKey;
    previousRenderedLayersKeyRef.current = renderedWmsLayersKey;

    let cancelled = false;
    const layers = renderedWmsLayersKey ? renderedWmsLayersKey.split(',') : [];

    const refreshLatest = async (mayGoBackwards: boolean) => {
      const probe = await fetchVerifiedLatestAvailableTime(layers);
      if (cancelled) return;
      // Unverified results are dropped outright rather than stored (issue #55). An unverified
      // result is the plain now−20min heuristic, whose fixed buffer is regularly shorter than
      // RGB's real publishing lag — storing it would move the view onto a slot RGB does not have,
      // and GeoServer serves that as a neighbouring frame instead of an error, which is the
      // desync itself. Keeping the last known-good value and waiting for the next probe is always
      // the safer failure mode: at worst the badge is a few minutes conservative.
      if (!probe.verified) return;
      commitVerifiedLatest(probe.time, { mayGoBackwards });
    };

    void refreshLatest(layerSetChanged);
    const intervalId = window.setInterval(() => { void refreshLatest(false); }, 5 * 60 * 1000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshLatest(false);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [renderedWmsLayersKey]);

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

  // True while an auto-update refresh is loading tiles nobody asked for. Used only to keep the
  // blocking "Chargement des tuiles" modal from popping up unattended every 10 minutes, which is
  // exactly the passive/kiosk use case auto-update exists for. Any user-initiated time change
  // clears it, so a real interaction always gets the real indicator back.
  const [isBackgroundRefresh, setIsBackgroundRefresh] = useState(false);
  const wasMapLoadingRef = useRef(false);
  useEffect(() => {
    // Only clear on a true→false transition: clearing whenever `isMapLoading` is false would
    // cancel the flag in the gap between setting it and the tile cycle actually starting.
    if (wasMapLoadingRef.current && !isMapLoading) setIsBackgroundRefresh(false);
    wasMapLoadingRef.current = isMapLoading;
  }, [isMapLoading]);

  const handleTimeChange = (newTimeStr: string) => {
    if (requestPlaybackExit(() => handleTimeChange(newTimeStr))) return;
    setIsBackgroundRefresh(false);
    const newTime = new Date(newTimeStr);
    const maxTime = new Date(latestAvailableTime);

    if (newTime > maxTime) {
      setCurrentTime(latestAvailableTime);
    } else {
      setCurrentTime(newTimeStr);
    }
  };

  // Auto-update (#50). Advances only when a genuinely newer slot appears AND the user was already
  // on the previous latest — comparing against the *previous* `latestAvailableTime` is what
  // distinguishes "a new image was published" from "the user deliberately scrubbed back", which
  // `isAtLatest` alone cannot tell apart once a new slot exists. So scrubbing into the past pauses
  // auto-update implicitly, and "Dernier" resumes it; without that, this would drag the user
  // forward against their will and re-break the persistence fix of #21.
  const previousLatestAvailableTimeRef = useRef(latestAvailableTime);
  useEffect(() => {
    const previousLatest = previousLatestAvailableTimeRef.current;
    previousLatestAvailableTimeRef.current = latestAvailableTime;

    if (!autoUpdateEnabled) return;
    if (latestAvailableTime <= previousLatest) return;
    if (currentTime < previousLatest) return;

    setIsBackgroundRefresh(true);
    setCurrentTime(latestAvailableTime);
  }, [latestAvailableTime, autoUpdateEnabled, currentTime]);

  const [isJumpingToLatest, setIsJumpingToLatest] = useState(false);

  // The plain `getLatestAvailableTime()` heuristic (now minus a fixed buffer) assumes every WMS
  // layer publishes within that same margin, but RGB/VIS/IR can each lag independently — see
  // `fetchVerifiedLatestAvailableTime`'s comment for why that silently desyncs RGB and VIS at the
  // exact instant this button is meant to guarantee freshness. Probes each *rendered* layer's real
  // latest-published time first (briefly, with its own fallback/timeout) so "jump to latest"
  // actually lands on a timestamp every layer on screen genuinely has data for.
  const jumpToLatest = async () => {
    if (isJumpingToLatest) return;
    setIsJumpingToLatest(true);
    try {
      const probe = await fetchVerifiedLatestAvailableTime(renderedWmsLayers);
      // An unverified probe is the bare heuristic, which can name a slot some rendered layer does
      // not have — jumping there is precisely the desync of issue #55. Fall back to the last
      // verified value we already hold instead; it is guaranteed good, only possibly a little old.
      const target = probe.verified ? probe.time : latestAvailableTime;
      // Fold the result into the shared latest-available state before moving: otherwise a
      // verified time newer than what polling has seen would be clamped straight back down by
      // handleTimeChange, and "Dernier" would refuse to reach the actual latest image.
      if (probe.verified) {
        commitVerifiedLatest(probe.time);
      }
      setIsBackgroundRefresh(false);
      setCurrentTime(target);
    } finally {
      setIsJumpingToLatest(false);
    }
  };

  useEffect(() => {
    const requested = new Date(currentTime + 'Z');
    const latest = new Date(latestAvailableTime + 'Z');
    if (requested.getTime() > latest.getTime()) {
      setCurrentTime(latestAvailableTime);
    }
  }, [currentTime, latestAvailableTime]);

  // `currentTime`'s initial state (above) is seeded with the same synchronous
  // `getLatestAvailableTime()` heuristic that `fetchVerifiedLatestAvailableTime` exists to correct
  // for "jump to latest" (see that function's comment) — RGB/VIS/IR can each lag independently,
  // so the naive guess can silently land on a timestamp only some rendered layers actually have
  // data for. That's the intermittent RGB/VIS desync users still see on a fresh page load (no
  // share link, no persisted time either): the "jump to latest" fix only covered the L
  // shortcut/"Dernier" button, not this initial mount. Re-probes once on mount and snaps to the
  // genuinely-synced timestamp — but only if the user hasn't already navigated away from the
  // initial guess while the probe (up to 4s) was in flight, so this can't clobber an intentional
  // time change. Also skipped entirely whenever the initial time came from a share link or from
  // localStorage (`hadRestoredCurrentTimeRef`, set above) — otherwise this would silently snap a
  // deliberately-restored past time back to "latest" a few seconds after every reload.
  //
  // Auto-update (#50) is the one deliberate exception to that skip: having it on means "I want
  // live imagery", so it outranks the remembered timestamp and we do snap forward on load. A
  // share link still wins over both — a shared link is a snapshot of a specific moment, and
  // yanking the recipient to "now" would destroy the thing that was shared.
  const initialCurrentTimeRef = useRef(currentTime);
  const autoUpdateEnabledOnMountRef = useRef(autoUpdateEnabled);
  useEffect(() => {
    const shouldFollowLatestOnMount = autoUpdateEnabledOnMountRef.current && !sharedCurrentTime;
    if (hadRestoredCurrentTimeRef.current && !shouldFollowLatestOnMount) return;
    let cancelled = false;
    setIsJumpingToLatest(true);
    fetchVerifiedLatestAvailableTime(renderedWmsLayers)
      .then((probe) => {
        if (cancelled) return;
        // Same rule as everywhere else (#55): only a verified time is safe to render. If the
        // probe failed, leave the heuristic seed alone rather than committing to another guess —
        // the polling effect will correct it as soon as one probe succeeds.
        if (!probe.verified) return;
        commitVerifiedLatest(probe.time);
        setCurrentTime((prev) => (prev === initialCurrentTimeRef.current ? probe.time : prev));
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

    const base = parseUtcInputValue(currentTime) ?? parseUtcInputValue(latestAvailableTime) ?? new Date();
    const datePart = base.toISOString().slice(0, 10);
    const baseStep = getStepFromUtcValue(toUtcInputValue(base));
    const nextEnd = Math.max(0, Math.min(getLatestAllowedStepForDate(datePart, latestAvailableTime), baseStep));
    const nextStart = Math.max(0, nextEnd - 18);
    const normalized = normalizeCustomDaySteps(nextStart, nextEnd, getLatestAllowedStepForDate(datePart, latestAvailableTime));

    exportRange.seed(datePart, normalized.start, normalized.end);
  };

  type AnimationRangeSpec = { preset: AnimationPreset; customStart: string; customEnd: string };

  const exportRangeSpec: AnimationRangeSpec = {
    preset: animationPreset,
    customStart: customAnimationStart,
    customEnd: customAnimationEnd,
  };
  const playbackRangeSpec: AnimationRangeSpec = {
    preset: playbackPreset,
    customStart: playbackRange.start,
    customEnd: playbackRange.end,
  };

  const buildAnimationFrameTimes = (
    spec: AnimationRangeSpec,
    maxFrames: number = MAX_ANIMATION_EXPORT_FRAMES,
  ): string[] => {
    // The verified `latestAvailableTime`, not the raw now−20min heuristic (issue #59, a residue of
    // #55). The heuristic's fixed buffer is regularly shorter than a layer's real publishing lag,
    // so bounding the range with it puts the last frames on slots some layer has no image for —
    // and GeoServer answers those by silently serving a neighbouring frame instead of erroring.
    // The exported animation then ends on frames where one layer is frozen while the others keep
    // moving, with nothing to indicate it.
    const latestAvailable = parseUtcInputValue(latestAvailableTime);
    if (!latestAvailable) {
      throw new Error('No latest time available');
    }

    let startDate: Date;
    let endDate: Date;
    if (spec.preset === 'custom') {
      const parsedStart = parseUtcInputValue(spec.customStart);
      const parsedEnd = parseUtcInputValue(spec.customEnd);
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
      // Anchored to the time being viewed, not to the newest image. "Dernières 3h" while you are
      // looking at a past date means the three hours leading up to *that* moment — anchoring to
      // the latest image instead silently exported a completely different day, with nothing in
      // the UI to say so. Still clamped to the latest available, so at the live edge (where
      // currentTime is the latest slot) the behaviour is unchanged.
      const durationHours = spec.preset === '3h' ? 3 : spec.preset === '6h' ? 6 : 12;
      const viewedTime = parseUtcInputValue(currentTime);
      endDate = viewedTime && viewedTime < latestAvailable ? viewedTime : latestAvailable;
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
      if (frames.length > maxFrames) {
        throw new Error(
          maxFrames === MAX_ANIMATION_EXPORT_FRAMES
            ? 'animation-max-export-frames'
            : 'animation-max-playback-frames',
        );
      }
    }

    if (frames.length < 2) {
      throw new Error('animation-export-too-few-frames');
    }

    return frames;
  };

  const mapAnimationErrorCode = (code: string): string => {
    if (code === 'animation-max-export-frames') return t('animationMaxExportFramesError');
    if (code === 'animation-max-playback-frames') return t('animationMaxPlaybackFramesError');
    if (code === 'animation-export-too-few-frames') return t('animationExportTooFewFramesError');
    if (code === 'animation-custom-future-end') return t('animationCustomFutureEndError');
    if (code === 'animation-custom-too-short') return t('animationCustomTooShortError');
    if (code === 'animation-custom-too-long') return t('animationCustomTooLongError');
    return t('animationRangeError');
  };

  /**
   * Frames already rendered, kept after the animation is closed so that reopening it with the same
   * settings costs nothing. The signature covers everything a frame's pixels depend on — the range,
   * the layers, every image adjustment, and the map's framing — so a stale set can never be
   * replayed as if it described the current view.
   */
  const playbackCacheRef = useRef<{ renderKey: string; frames: string[]; urls: string[]; blobs: Blob[] } | null>(null);
  const playbackRenderedViewRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
  // Set while we put the map back ourselves, so the guard below doesn't mistake it for the user
  // moving the map again.
  const restoringPlaybackViewRef = useRef(false);
  type PlaybackExitIntent = {
    mode: 'session' | 'preload';
    /** 'view' when the map was moved, 'time' when a control would change the displayed time. */
    reason: 'view' | 'time';
    /** Ran only if the user chooses to leave: the action that was held back. */
    apply?: () => void;
  };
  const [playbackExitPrompt, setPlaybackExitPrompt] = useState<PlaybackExitIntent | null>(null);

  const releasePlaybackCache = () => {
    playbackCacheRef.current?.urls.forEach((url) => URL.revokeObjectURL(url));
    playbackCacheRef.current = null;
  };

  const buildPlaybackRenderKey = (): string => {
    const map = map2Instance.current;
    const container = map2Ref.current;
    const view = map && container
      ? `${map.getCenter().lat.toFixed(4)},${map.getCenter().lng.toFixed(4)},${map.getZoom()},${container.clientWidth}x${container.clientHeight}`
      : 'no-map';
    return [
      effectiveGifKind, playbackQuality, view,
      `${activeLayers.rgb}${activeLayers.vis}${activeLayers.ir}`,
      fireHotspotEnabled, fireHotspotMinBrightness, fireHotspotMinRedBlueDiff, fireHotspotOpacity,
      irStyle, visBrightness, visContrast,
      hdEnhanceEnabled, hdEnhanceHighlightProtection, hdEnhanceLocalContrast, hdEnhanceNoiseReduction,
      hdEnhancePreset, hdEnhanceRadius, hdEnhanceSaturationAdjust, hdEnhanceShadowProtection,
      hdEnhanceSharpen, hdEnhanceStrength,
      rgbSaturation, rgbHdOpacity, sandwichOpacity, autoReduceVisAtNight,
      JSON.stringify(mapOptions), language,
    ].join('|');
  };

  /** Pauses without leaving: the frame on screen stays on screen. */
  const pausePlayback = () => setIsPlaying(false);

  /** Leaves the animation. The frame you were on becomes the current time (issue #78). */
  const closePlayback = () => {
    playbackCancelRef.current?.();
    playbackCancelRef.current = null;
    setIsPlaying(false);
    setPlaybackPreload(null);
    const landing = playbackFrames[Math.min(playbackIndexRef.current, playbackFrames.length - 1)];
    if (landing) setCurrentTime(landing);
    setPlaybackFrames([]);
    setPlaybackUrls([]);
    setPlaybackIndex(0);
    // The rendered frames are kept: reopening the same animation is then instant.
  };

  const startPlayback = async () => {
    if (!map2Instance.current || !map2Ref.current) return;

    let frames: string[];
    try {
      frames = buildAnimationFrameTimes(playbackRangeSpec, MAX_ANIMATION_PLAYBACK_FRAMES);
    } catch (error) {
      window.alert(mapAnimationErrorCode((error as Error).message));
      return;
    }

    // A new image arriving mid-sequence would move the view out from under the animation.
    setAutoUpdateEnabled(false);
    setPlaybackIndex(0);

    const renderKey = buildPlaybackRenderKey();
    const cached = playbackCacheRef.current;
    if (cached && cached.renderKey === renderKey) {
      // Same frames, or the time we are sitting on is one of the frames already rendered. The
      // second case is the ordinary stop-and-replay: closing the animation moves the current time
      // onto the frame you stopped at, which shifts a preset range's anchor — rebuilding an
      // identical-looking sequence for that would waste a render per frame.
      const sameFrames = cached.frames.length === frames.length
        && cached.frames.every((frame, index) => frame === frames[index]);
      const resumeIndex = cached.frames.indexOf(currentTime);
      if (sameFrames || resumeIndex >= 0) {
        playbackRenderedViewRef.current = {
          lat: map2Instance.current.getCenter().lat,
          lng: map2Instance.current.getCenter().lng,
          zoom: map2Instance.current.getZoom(),
        };
        setPlaybackFrames(cached.frames);
        setPlaybackUrls(cached.urls);
        setPlaybackIndex(resumeIndex >= 0 ? resumeIndex : 0);
        setIsPlaying(true);
        return;
      }
    }

    const map = map2Instance.current;
    playbackRenderedViewRef.current = {
      lat: map.getCenter().lat,
      lng: map.getCenter().lng,
      zoom: map.getZoom(),
    };
    setPlaybackPreload({ done: 0, total: frames.length });
    let cancelled = false;
    playbackCancelRef.current = () => { cancelled = true; };

    try {
      // The same renderer the GIF and WebM exports use, so what plays is what an export of the
      // same range produces. Playing off Leaflet's own tiles instead was measured at 58% of the
      // time showing a blank map: `setParams` drops every tile on each frame, and at 8 frames a
      // second the grid never finishes coming back before the next one wipes it again.
      const blobs = await renderAnimationFrameBlobs({
        frameTimes: frames,
        kind: effectiveGifKind,
        maxDimension: playbackQuality,
        imageFormat: 'jpeg',
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
        onFrameProgress: (fraction) => {
          if (cancelled) return;
          setPlaybackPreload({ done: Math.round(fraction * frames.length), total: frames.length });
        },
      });

      if (cancelled) {
        setPlaybackPreload(null);
        return;
      }
      const urls = blobs.map((blob) => URL.createObjectURL(blob));
      releasePlaybackCache();
      playbackCacheRef.current = { renderKey, frames, urls, blobs };
      playbackCancelRef.current = null;
      setPlaybackFrames(frames);
      setPlaybackUrls(urls);
      setPlaybackPreload(null);
      setIsPlaying(true);
    } catch (error) {
      console.error('Playback preparation failed:', error);
      setPlaybackPreload(null);
      playbackCancelRef.current = null;
      window.alert(isWmsCorsBlocked(error) ? t('exportCorsBlocked') : t('playbackPrepareFailed'));
    }
  };

  // Resolved before anything is rendered: a preset is anchored on the time being viewed, not on
  // the newest image (PR #75), and spelling the range out is the only way that reads as obvious.
  let playbackFramePreview: { count: number; start: string; end: string } | null = null;
  try {
    const preview = buildAnimationFrameTimes(playbackRangeSpec, MAX_ANIMATION_PLAYBACK_FRAMES);
    playbackFramePreview = {
      count: preview.length,
      start: preview[0],
      end: preview[preview.length - 1],
    };
  } catch {
    playbackFramePreview = null;
  }

  const [isDownloadingPlayback, setIsDownloadingPlayback] = useState(false);

  /**
   * Encodes the sequence already in memory into a GIF. No frame is rendered again: the animation
   * you just watched is exactly the one you get, at the quality it was prepared with.
   */
  const downloadPlaybackAnimation = async (format: 'gif' | 'webm') => {
    const cached = playbackCacheRef.current;
    if (!cached || cached.blobs.length === 0 || isDownloadingPlayback) return;
    if (!map2Instance.current || !map2Ref.current) return;

    setIsDownloadingPlayback(true);
    try {
      const { saveAs } = await import('file-saver');
      // Resolution and speed are the playback's, deliberately: the promise of this button is that
      // the file is the animation you just watched, so offering a second set would break it.
      const shared = {
        frameBlobs: cached.blobs,
        frameTimes: cached.frames,
        fps: playbackFps,
        kind: effectiveGifKind,
        maxDimension: playbackQuality,
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
      };

      const blob = format === 'gif'
        ? await exportAnimationGif({
            ...shared,
            colorCount: gifColorCount,
            paletteMode: gifPaletteMode,
            ditherLevel: gifDitherLevel,
            finalPauseMs: gifFinalPauseMs,
          })
        : await exportAnimationWebm({ ...shared, quality: webmQuality });

      const safeStart = cached.frames[0].replace('T', '_').replace(/:/g, '-');
      const safeEnd = cached.frames[cached.frames.length - 1].replace('T', '_').replace(/:/g, '-');
      const baseName = getExportFileBaseName(effectiveGifKind, hdEnhanceEnabled);
      saveAs(blob, `MTG_ANIMATION_${baseName}_${playbackQuality}px_${safeStart}_to_${safeEnd}.${format}`);
    } catch (error) {
      console.error('Playback download failed:', error);
      const message = error instanceof Error && error.message === 'webm-unsupported'
        ? t('animationExportWebmUnsupported')
        : isWmsCorsBlocked(error) ? t('exportCorsBlocked') : t('animationExportFailed');
      window.alert(message);
    } finally {
      setIsDownloadingPlayback(false);
    }
  };

  const togglePlayback = () => {
    if (playbackPreload) {
      playbackCancelRef.current?.();
      playbackCancelRef.current = null;
      setPlaybackPreload(null);
      return;
    }
    if (isPlaying) {
      pausePlayback();
      return;
    }
    if (playbackUrls.length > 0) {
      setIsPlaying(true);
      return;
    }
    void startPlayback();
  };

  /** Scrubbing pauses but stays in the animation — the overlay keeps showing the frame you land on. */
  const seekPlayback = (index: number) => {
    if (playbackFrames.length === 0) return;
    playbackDirectionRef.current = 1;
    setIsPlaying(false);
    setPlaybackIndex(Math.max(0, Math.min(playbackFrames.length - 1, index)));
  };

  // Advances the sequence. Wraps around: an animation of the last few hours is something you leave
  // running, not something that stops on the last frame.
  // Direction of travel, only ever -1 in boomerang mode. A ref because the interval updates the
  // index through a functional setState and must not be rebuilt every time the direction flips.
  const playbackDirectionRef = useRef(1);

  useEffect(() => {
    if (!isPlaying || playbackFrames.length === 0) return;
    const interval = window.setInterval(() => {
      setPlaybackIndex((previous) => {
        const lastIndex = playbackFrames.length - 1;
        if (lastIndex < 1) return 0;
        if (!playbackBoomerang) {
          playbackDirectionRef.current = 1;
          return previous >= lastIndex ? 0 : previous + 1;
        }
        // Turn around one frame short of each end, so the end frames are not shown twice in a row.
        let next = previous + playbackDirectionRef.current;
        if (next > lastIndex) {
          playbackDirectionRef.current = -1;
          next = lastIndex - 1;
        } else if (next < 0) {
          playbackDirectionRef.current = 1;
          next = 1;
        }
        return next;
      });
    }, Math.round(1000 / playbackFps));
    return () => window.clearInterval(interval);
  }, [isPlaying, playbackFrames, playbackFps, playbackBoomerang]);

  // Read by closePlayback, which runs outside this render and needs the frame actually on screen.
  const playbackIndexRef = useRef(playbackIndex);
  playbackIndexRef.current = playbackIndex;

  // The frames were rendered for one framing of the map. Panning or zooming leaves them describing
  // a view that is no longer there, so the animation closes and the cache goes with it.
  useEffect(() => {
    const map = map2Instance.current;
    if (!map || (playbackUrls.length === 0 && !playbackPreload)) return;
    const handleMove = () => {
      if (restoringPlaybackViewRef.current) return;
      if (playbackPreload) {
        // Each frame is rendered from the map's bounds at the moment it is drawn, so letting the
        // render continue past a pan would mix two framings in one sequence.
        playbackCancelRef.current?.();
        playbackCancelRef.current = null;
        setPlaybackPreload(null);
        setPlaybackExitPrompt({ mode: 'preload', reason: 'view' });
        return;
      }
      setIsPlaying(false);
      setPlaybackExitPrompt({ mode: 'session', reason: 'view' });
    };
    map.on('movestart', handleMove);
    map.on('zoomstart', handleMove);
    return () => {
      map.off('movestart', handleMove);
      map.off('zoomstart', handleMove);
    };
  }, [playbackUrls, playbackPreload, playbackFrames]);

  const restorePlaybackView = () => {
    const map = map2Instance.current;
    const view = playbackRenderedViewRef.current;
    if (!map || !view) return;
    restoringPlaybackViewRef.current = true;
    map.setView([view.lat, view.lng], view.zoom, { animate: false });
    // Cleared after Leaflet has emitted its own move events for this programmatic change.
    window.setTimeout(() => { restoringPlaybackViewRef.current = false; }, 0);
  };

  const resumePlaybackAfterMove = () => {
    const intent = playbackExitPrompt;
    setPlaybackExitPrompt(null);
    if (!intent) return;
    // A time change never moved the map, so there is nothing to put back.
    if (intent.reason === 'view') restorePlaybackView();
    if (intent.mode === 'preload') {
      void startPlayback();
      return;
    }
    setIsPlaying(true);
  };

  const leavePlaybackAfterMove = () => {
    const intent = playbackExitPrompt;
    setPlaybackExitPrompt(null);
    // A moved map means the rendered frames can never be replayed as they are; a time change
    // leaves them perfectly valid, so the sequence stays cached for a later replay.
    if (intent?.reason === 'view') releasePlaybackCache();
    closePlayback();
    intent?.apply?.();
  };

  /**
   * Anything that would end a running animation goes through here: the time slider, the date
   * field, the ±10/30 min steps, "Dernier", and turning auto-update back on. Guarding only pans
   * and zooms would have made the rule impossible to remember — some gestures ask, others throw
   * the sequence away without a word (issue #78).
   *
   * Returns true when the action has been held back and the dialog is up.
   */
  const requestPlaybackExit = (apply: () => void): boolean => {
    if (playbackUrls.length === 0 && !playbackPreload) return false;
    setIsPlaying(false);
    setPlaybackExitPrompt({
      mode: playbackPreload ? 'preload' : 'session',
      reason: 'time',
      apply,
    });
    return true;
  };

  // The rendered frames belong to one layer set; keeping them across a toggle would replay the
  // wrong imagery.
  const playbackLayersKeyRef = useRef(renderedWmsLayersKey);
  useEffect(() => {
    if (playbackLayersKeyRef.current === renderedWmsLayersKey) return;
    playbackLayersKeyRef.current = renderedWmsLayersKey;
    releasePlaybackCache();
    if (playbackUrls.length > 0 || playbackPreload) closePlayback();
  }, [renderedWmsLayersKey]);

  // A hidden tab throttles the timer; pause rather than close, so coming back resumes where it was.
  useEffect(() => {
    if (!isPlaying) return;
    const handleVisibility = () => {
      if (document.hidden) setIsPlaying(false);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isPlaying]);

  useEffect(() => releasePlaybackCache, []);

  // Computed once per render (buildAnimationFrameTimes previously ran twice per render:
  // once to check for an error, once more to get the frame count).
  let computedAnimationRangeError: string | null = null;
  let animationFrameTimesPreview: string[] = [];
  try {
    animationFrameTimesPreview = buildAnimationFrameTimes(exportRangeSpec);
  } catch (error) {
    computedAnimationRangeError = mapAnimationErrorCode(error instanceof Error ? error.message : '');
  }
  const animationEstimatedFrameCount = animationFrameTimesPreview.length;
  const gifFileName = animationFrameTimesPreview.length > 0
    ? `MTG_ANIMATION_${getExportFileBaseName(effectiveGifKind, hdEnhanceEnabled)}_${gifMaxDimension}px_${
      animationFrameTimesPreview[0].replace('T', '_').replace(/:/g, '-')
    }_to_${
      animationFrameTimesPreview[animationFrameTimesPreview.length - 1].replace('T', '_').replace(/:/g, '-')
    }.gif`
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

  const openExportModal = () => {
    const nextSelection: Record<ExportKind, boolean> = {
      vis: availableExportKinds.includes('vis'),
      rgb: availableExportKinds.includes('rgb'),
      ir: availableExportKinds.includes('ir'),
      hd: availableExportKinds.includes('hd'),
      sandwich: availableExportKinds.includes('sandwich'),
      hybrid: availableExportKinds.includes('hybrid'),
    };
    setSelectedExports(nextSelection);
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
      alert(isWmsCorsBlocked(err) ? t('exportCorsBlocked') : t('exportFailedAlert'));
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
        openExportModal();
        return;
      }

      if (lowerKey === 'd') {
        event.preventDefault();
        openExportModal();
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
            onClick={() => openExportModal()}
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

          <div className="absolute top-4 left-4 right-4 z-[400] flex flex-col gap-2 pointer-events-none">
          <div className="flex flex-wrap items-start gap-2">
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

          <div className="flex justify-end">
            <ZoomControl
              onZoomIn={() => map2Instance.current?.zoomIn()}
              onZoomOut={() => map2Instance.current?.zoomOut()}
              t={t}
              theme={resolvedTheme}
            />
          </div>
          </div>

          <div ref={map2Ref} className="w-full h-full bg-[#0a0a0a] !z-0" />

          {/* The animation plays as pre-rendered frames laid over the map rather than by moving
              the map's own time (issue #78). Driving Leaflet at 8 frames a second left the map
              blank 58% of the time — `setParams` drops every tile on each frame, and the grid
              never finishes coming back before the next one wipes it. These frames come from the
              very same renderer as the GIF export, so what you watch is what an export of the
              same range produces. */}
          {playbackUrls.length > 0 && (
            <img
              src={playbackUrls[Math.min(playbackIndex, playbackUrls.length - 1)]}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover z-[410] pointer-events-none select-none"
            />
          )}

          {playbackExitPrompt && (
            <PlaybackExitModal
              mode={playbackExitPrompt.mode}
              reason={playbackExitPrompt.reason}
              t={t}
              theme={resolvedTheme}
              onLeave={leavePlaybackAfterMove}
              onResume={resumePlaybackAfterMove}
            />
          )}

          <TimeDock
            autoUpdateEnabled={autoUpdateEnabled}
            currentTime={currentTime}
            isAtLatest={isAtLatest}
            isBackgroundRefreshing={isBackgroundRefresh && isMapLoading}
            isPlaying={isPlaying}
            isSyncingLatest={isJumpingToLatest}
            latestAvailableTime={latestAvailableTime}
            latestAvailableDatePart={latestAvailableDatePart}
            playbackCustomDate={playbackRange.date}
            playbackCustomDayMaxStep={playbackRange.dayMaxStep}
            playbackCustomEndStep={playbackRange.endStep}
            playbackCustomStartStep={playbackRange.startStep}
            playbackFps={playbackFps}
            playbackFpsMax={MAX_PLAYBACK_FPS}
            playbackFpsMin={MIN_PLAYBACK_FPS}
            playbackFramePreview={playbackFramePreview}
            playbackDownloadBusy={isDownloadingPlayback}
            playbackFrames={playbackFrames}
            playbackIndex={playbackIndex}
            playbackPreload={playbackPreload}
            playbackBoomerang={playbackBoomerang}
            playbackPreset={playbackPreset}
            playbackQuality={playbackQuality}
            playbackQualityChoices={PLAYBACK_QUALITY_CHOICES}
            onAutoUpdateToggle={() => {
              // Only turning it back *on* matters: auto-update advancing the time is what would
              // pull the view out from under a running animation.
              const enabling = !autoUpdateEnabled;
              if (enabling && requestPlaybackExit(() => setAutoUpdateEnabled(true))) return;
              setAutoUpdateEnabled(enabling);
            }}
            onLatest={() => {
              if (requestPlaybackExit(() => { void jumpToLatest(); })) return;
              void jumpToLatest();
            }}
            onPlaybackCustomDateChange={playbackRange.setDate}
            onPlaybackCustomEndStepChange={playbackRange.setEndStep}
            onPlaybackCustomStartStepChange={playbackRange.setStartStep}
            onPlaybackFpsChange={setPlaybackFps}
            onPlaybackDownload={(format) => { void downloadPlaybackAnimation(format); }}
            onPlaybackBoomerangToggle={() => setPlaybackBoomerang((previous) => !previous)}
            onPlaybackPresetChange={setPlaybackPreset}
            onPlaybackQualityChange={(quality) => setPlaybackQuality(quality as PlaybackQuality)}
            onPlaybackSeek={seekPlayback}
            onPlaybackStop={closePlayback}
            onPlaybackToggle={togglePlayback}
            onTimeChange={handleTimeChange}
            t={t}
            theme={resolvedTheme}
          />

          {isMapLoading && !isBackgroundRefresh && playbackUrls.length === 0 && (
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
        resolvedRangeStart={animationFrameTimesPreview[0] ?? ''}
        resolvedRangeEnd={animationFrameTimesPreview[animationFrameTimesPreview.length - 1] ?? ''}
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
        gifSelectedKind={effectiveGifKind}
        hdEnhanceEnabled={hdEnhanceEnabled}
        isExporting={isExporting}
        isOpen={isExportModalOpen}
        isPreviewLoading={isPreviewLoading}
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
        onExportResolutionChange={setExportResolution}
        onFinalPauseChange={setGifFinalPauseMs}
        onFpsChange={setAnimationFps}
        onGifKindChange={setGifSelectedKind}
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
        webmQuality={webmQuality}
        theme={resolvedTheme}
      />

      {/* Static stylesheet; per-render values are passed as CSS custom properties above. */}
      <style>{DYNAMIC_TILE_STYLES}</style>
    </div>
  );
}
