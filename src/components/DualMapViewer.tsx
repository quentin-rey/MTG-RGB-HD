import React, { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { Download, Film, Loader2, Monitor, Moon, Sun } from 'lucide-react';
import {
  DEFAULT_ACTIVE_LAYERS,
  getAvailableExportKindsFromLayers,
  getLatestAvailableTime,
  getSolarElevation,
  sanitizeActiveLayers,
  STORAGE_KEYS,
  type ActiveLayers,
  type MapOptions,
  readStoredJson,
  safeSetLocalStorage,
  type ExportKind,
} from './dualMapViewerShared';
import { getTranslator, type Language } from './i18n';
import {
  downloadSatellitePack,
  exportAnimationGif,
  type GifDitherLevel,
  type GifFinalPauseMs,
  type GifPaletteMode,
} from './dualMapExport';
import { useDualMapLeaflet } from './useDualMapLeaflet';
import {
  AnimationModal,
  DownloadModal,
  HeaderInfoButton,
  InfoModal,
  Map2ControlBar,
  Map2TitleBadge,
  TimeDock,
} from './dualMapViewerPanels';
import { useImageAdjustments } from './useImageAdjustments';
import { useViewerPanelsState } from './useViewerPanelsState';

type ThemeMode = 'dark' | 'light' | 'auto';
type AnimationPreset = '3h' | '6h' | '12h' | 'custom';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const MAX_ANIMATION_EXPORT_FRAMES = 73;
const MAX_CUSTOM_RANGE_MS = 12 * 60 * 60 * 1000;
const MIN_CUSTOM_RANGE_MS = 1 * 60 * 60 * 1000;
const DAY_MAX_STEP = (24 * 60) / 10 - 1;
const CUSTOM_MIN_RANGE_STEPS = MIN_CUSTOM_RANGE_MS / TEN_MINUTES_MS;
const CUSTOM_MAX_RANGE_STEPS = MAX_CUSTOM_RANGE_MS / TEN_MINUTES_MS;

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

export default function DualMapViewer() {
  const [isExporting, setIsExporting] = useState(false);
  const [selectedExports, setSelectedExports] = useState<Record<ExportKind, boolean>>({
    vis: true,
    rgb: true,
    ir: false,
    hd: false,
    sandwich: false,
    hybrid: false,
  });
  const [activeLayers, setActiveLayers] = useState<ActiveLayers>(() => {
    const stored = readStoredJson<ActiveLayers>(STORAGE_KEYS.activeLayers, DEFAULT_ACTIVE_LAYERS);
    return sanitizeActiveLayers(stored);
  });
  const [language, setLanguage] = useState<Language>(() => {
    const stored = readStoredJson<Language>(STORAGE_KEYS.language, 'fr');
    return stored === 'en' ? 'en' : 'fr';
  });
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
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
    animationModalRef,
    downloadModalRef,
    infoRef,
    isAdjustmentsOpen,
    isAnimationModalOpen,
    isDownloadModalOpen,
    isInfoOpen,
    setIsAdjustmentsOpen,
    setIsAnimationModalOpen,
    setIsDownloadModalOpen,
    setIsInfoOpen,
  } = useViewerPanelsState();

  const {
    autoReduceVisAtNight,
    irStyle,
    resetAdjustments,
    rgbHdOpacity,
    rgbSaturation,
    sandwichOpacity,
    setAutoReduceVisAtNight,
    setIrStyle,
    setRgbHdOpacity,
    setRgbSaturation,
    setSandwichOpacity,
    setVisBrightness,
    setVisContrast,
    visBrightness,
    visContrast,
  } = useImageAdjustments();

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.activeLayers, JSON.stringify(activeLayers));
  }, [activeLayers]);

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
      franceDepartmentsOpacity: 0.9,
      showBorders: false,
      showCities: false,
      showFranceDepartments: false,
    };
    const stored = readStoredJson<MapOptions>(STORAGE_KEYS.mapOptions, defaults);
    return { ...defaults, ...stored };
  });

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.mapOptions, JSON.stringify(mapOptions));
  }, [mapOptions]);

  // Initialize time to current time (rounded to nearest 10 mins as MTG is every 10 min, with buffer)
  const [currentTime, setCurrentTime] = useState(() => getLatestAvailableTime());
  const [animationPreset, setAnimationPreset] = useState<AnimationPreset>('3h');
  const [animationFps, setAnimationFps] = useState(6);
  const [gifMaxDimension, setGifMaxDimension] = useState<960 | 1280 | 1600>(1280);
  const [gifColorCount, setGifColorCount] = useState<64 | 128 | 256>(128);
  const [gifPaletteMode, setGifPaletteMode] = useState<GifPaletteMode>('per-frame');
  const [gifDitherLevel, setGifDitherLevel] = useState<GifDitherLevel>('none');
  const [gifFinalPauseMs, setGifFinalPauseMs] = useState<GifFinalPauseMs>(100);
  const [isGifExporting, setIsGifExporting] = useState(false);
  const [gifExportProgress, setGifExportProgress] = useState(0);
  const [animationRangeError, setAnimationRangeError] = useState<string | null>(null);
  const latestAvailableTime = getLatestAvailableTime();
  const latestAvailableDatePart = latestAvailableTime.split('T')[0];
  const [customAnimationDate, setCustomAnimationDate] = useState(() => currentTime.split('T')[0]);
  const [customStartStep, setCustomStartStep] = useState(() => {
    const latestStep = getStepFromUtcValue(getLatestAvailableTime());
    return Math.max(0, latestStep - 18);
  });
  const [customEndStep, setCustomEndStep] = useState(() => getStepFromUtcValue(getLatestAvailableTime()));

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
    irStyle,
    mapOptions,
    rgbHdOpacity,
    sandwichOpacity,
  });
  const rgbVisNightFade = Math.max(0, Math.min(1, (solarElevation + 2) / 6));
  const rgbVisNightBrightness = activeLayers.rgb && activeLayers.vis && !activeLayers.ir
    ? 0.55 + rgbVisNightFade * 0.45
    : 1;
  const rgbLegacyFusionSaturationBoost = activeLayers.rgb && activeLayers.vis && !activeLayers.ir ? 1.45 : 1;
  const rgbLegacyFusionBrightnessBoost = activeLayers.rgb && activeLayers.vis && !activeLayers.ir ? 1.12 : 1;
  const rgbLayerEffectiveSaturation = rgbSaturation * rgbLegacyFusionSaturationBoost;
  const rgbLayerEffectiveBrightness = rgbVisNightBrightness * rgbLegacyFusionBrightnessBoost;
  const visHdLegacyBrightness = Math.min(2, visBrightness * 1.2);
  const visHdLegacyContrast = Math.min(2.4, visContrast * 1.2);
  const availableExportKinds: ExportKind[] = getAvailableExportKindsFromLayers(activeLayers);
  const selectedExportKinds = availableExportKinds.filter((kind) => selectedExports[kind]);

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

  const exportGif = async () => {
    if (!map2Instance.current || !map2Ref.current || isGifExporting) return;

    let frames: string[] = [];
    try {
      frames = buildAnimationFrameTimes();
    } catch {
      frames = [];
    }

    if (frames.length === 0) {
      try {
        buildAnimationFrameTimes();
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        const message =
          code === 'animation-max-export-frames'
            ? t('animationMaxExportFramesError')
            : code === 'animation-export-too-few-frames'
              ? t('animationExportTooFewFramesError')
              : code === 'animation-custom-future-end'
                ? t('animationCustomFutureEndError')
                : code === 'animation-custom-too-short'
                  ? t('animationCustomTooShortError')
                  : code === 'animation-custom-too-long'
                    ? t('animationCustomTooLongError')
                    : t('animationRangeError');
        setAnimationRangeError(message);
      }
      return;
    }

    setAnimationRangeError(null);
    setIsGifExporting(true);
    setGifExportProgress(0);

    try {
      const { saveAs } = await import('file-saver');
      const exportKind = getAnimationExportKind(activeLayers);
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
        irStyle,
        visBrightness,
        visContrast,
        rgbSaturation,
        rgbHdOpacity,
        sandwichOpacity,
        autoReduceVisAtNight,
        exportSolarElevation: solarElevation,
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
      saveAs(gifBlob, `MTG_ANIMATION_${safeStart}_to_${safeEnd}.gif`);
    } catch (error) {
      console.error('GIF export failed:', error);
      alert(t('animationExportFailed'));
    } finally {
      setIsGifExporting(false);
    }
  };

  const getAnimationRangeError = (): string | null => {
    try {
      buildAnimationFrameTimes();
      return null;
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'animation-max-export-frames') return t('animationMaxExportFramesError');
      if (code === 'animation-export-too-few-frames') return t('animationExportTooFewFramesError');
      if (code === 'animation-custom-future-end') return t('animationCustomFutureEndError');
      if (code === 'animation-custom-too-short') return t('animationCustomTooShortError');
      if (code === 'animation-custom-too-long') return t('animationCustomTooLongError');
      return t('animationRangeError');
    }
  };

  const computedAnimationRangeError = getAnimationRangeError();
  const animationEstimatedFrameCount = computedAnimationRangeError ? 0 : buildAnimationFrameTimes().length;

  const openDownloadModal = () => {
    const nextSelection: Record<ExportKind, boolean> = {
      vis: availableExportKinds.includes('vis'),
      rgb: availableExportKinds.includes('rgb'),
      ir: availableExportKinds.includes('ir'),
      hd: availableExportKinds.includes('hd'),
      sandwich: availableExportKinds.includes('sandwich'),
      hybrid: availableExportKinds.includes('hybrid'),
    };
    setSelectedExports(nextSelection);
    setIsDownloadModalOpen(true);
  };

  const downloadPack = async (requestedKinds: ExportKind[]) => {
    if (!map2Instance.current || !map2Ref.current) return;
    if (requestedKinds.length === 0) return;
    setIsExporting(true);

    try {
      const map = map2Instance.current;
      const exportCenter = map.getCenter();
      await downloadSatellitePack({
        requestedKinds,
        map,
        mapContainer: map2Ref.current,
        currentTime,
        activeLayers,
        irStyle,
        visBrightness,
        visContrast,
        rgbSaturation,
        rgbHdOpacity,
        sandwichOpacity,
        autoReduceVisAtNight,
        exportSolarElevation: getSolarElevation(new Date(currentTime + 'Z'), exportCenter.lat, exportCenter.lng),
        mapOptions,
        language,
        map1BordersLayer: map1BordersRef.current,
        map1DepartmentsLayer: map1DepartmentsRef.current,
        cityLoadPromise: cityLoadPromiseRef.current,
        getVisibleCityFeatures,
      });
    } catch (err) {
      console.error('Export failed:', err);
      alert(t('exportFailedAlert'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`theme-${resolvedTheme} flex flex-col h-screen w-full font-sans overflow-hidden ${
      resolvedTheme === 'light' ? 'bg-slate-100 text-slate-900' : 'bg-[#0a0a0a] text-white'
    }`}>
      <div className={`min-h-16 flex items-center justify-between px-3 py-2 sm:px-6 border-b shadow-sm z-10 shrink-0 gap-2 sm:gap-3 ${
        resolvedTheme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-[#111] border-white/10'
      }`}>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/15 flex items-center justify-center shrink-0">
            <span className="text-base leading-none" aria-hidden="true">🛰️</span>
          </div>
          <div className="flex flex-col min-w-0">
            <h1 className={`text-base sm:text-lg font-medium tracking-tight whitespace-nowrap ${
              resolvedTheme === 'light' ? 'text-slate-900' : 'text-slate-100'
            }`}>MTG-RGB-HD</h1>
            <p className={`hidden lg:block text-xs whitespace-nowrap ${
              resolvedTheme === 'light' ? 'text-slate-600' : 'text-slate-400'
            }`}>{t('subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 sm:gap-3 relative shrink-0 flex-wrap">
          <div className={`flex items-center gap-1 rounded-lg p-1 border ${
            resolvedTheme === 'light' ? 'bg-white border-slate-200' : 'bg-[#1b1b1b] border-white/10'
          }`}>
            <div className={`relative grid grid-cols-2 rounded-md p-0.5 border ${
              resolvedTheme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-black/30 border-white/10'
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
            resolvedTheme === 'light' ? 'bg-white border-slate-200' : 'bg-[#1b1b1b] border-white/10'
          }`}>
            <div className={`relative grid grid-cols-3 rounded-md p-0.5 border ${
              resolvedTheme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-black/30 border-white/10'
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
          <HeaderInfoButton onClick={() => setIsInfoOpen(true)} t={t} theme={resolvedTheme} />

          <button
            onClick={() => setIsAnimationModalOpen(true)}
            className={`flex items-center justify-center gap-2 w-9 h-9 sm:w-auto sm:px-4 sm:py-2 rounded-md font-medium text-sm transition-colors shrink-0 ${
              resolvedTheme === 'light'
                ? 'bg-slate-100 text-slate-900 hover:bg-slate-200 border border-slate-300'
                : 'bg-[#222] text-white hover:bg-[#333] border border-white/10'
            }`}
          >
            <Film className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{t('animation')}</span>
          </button>

          <button
            onClick={openDownloadModal}
            disabled={isExporting}
            className={`flex items-center justify-center gap-2 w-9 h-9 sm:w-auto sm:px-4 sm:py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${
              resolvedTheme === 'light'
                ? 'bg-slate-900 text-white hover:bg-slate-700'
                : 'bg-white text-black hover:bg-slate-200'
            }`}
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Download className="w-4 h-4 shrink-0" />}
            <span className="hidden sm:inline">{isExporting ? t('generating') : t('download')}</span>
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

          <Map2TitleBadge activeLayers={activeLayers} isNightIrFallbackActive={isNightIrFallbackActive} t={t} theme={resolvedTheme} />

            <Map2ControlBar
              activeLayers={activeLayers}
              adjustmentsRef={adjustmentsRef}
              autoReduceVisAtNight={autoReduceVisAtNight}
              effectiveHybridVisOpacity={effectiveHybridVisOpacity}
              effectiveSandwichOpacity={effectiveSandwichOpacity}
              irStyle={irStyle}
              isAdjustmentsOpen={isAdjustmentsOpen}
              mapOptions={mapOptions}
              onActiveLayersChange={(next) => setActiveLayers(sanitizeActiveLayers(next))}
              onAutoReduceVisAtNightChange={setAutoReduceVisAtNight}
              onIrStyleChange={setIrStyle}
              onMapOptionsChange={setMapOptions}
              onResetAdjustments={resetAdjustments}
              onRgbHdOpacityChange={setRgbHdOpacity}
              onRgbSaturationChange={setRgbSaturation}
              onSandwichOpacityChange={setSandwichOpacity}
              onToggleAdjustments={() => setIsAdjustmentsOpen((prev) => !prev)}
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

          <div ref={map2Ref} className="w-full h-full bg-[#0a0a0a] !z-0" />

          <TimeDock
            currentTime={currentTime}
            onLatest={() => handleTimeChange(getLatestAvailableTime())}
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

                <div className={`mt-2 h-1.5 w-full rounded overflow-hidden ${resolvedTheme === 'light' ? 'bg-slate-300' : 'bg-white/10'}`}>
                  <div
                    className="h-full bg-blue-400 transition-[width] duration-150"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>

                {loadingTileCount > 0 && (
                  <div className={`mt-1 text-[11px] font-mono ${resolvedTheme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>{t('pendingTiles')}: {loadingTileCount}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <InfoModal infoRef={infoRef} isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} t={t} theme={resolvedTheme} />

      <AnimationModal
        animationModalRef={animationModalRef}
        customDate={customAnimationDate}
        customEnd={customAnimationEnd}
        customEndStep={customEndStep}
        customLatestDate={latestAvailableDatePart}
        customMaxStep={customDayMaxStep}
        customStart={customAnimationStart}
        customStartStep={customStartStep}
        estimatedFrameCount={animationEstimatedFrameCount}
        fps={animationFps}
        gifColorCount={gifColorCount}
        gifDitherLevel={gifDitherLevel}
        gifFinalPauseMs={gifFinalPauseMs}
        gifMaxDimension={gifMaxDimension}
        gifPaletteMode={gifPaletteMode}
        gifProgress={gifExportProgress}
        isExportingGif={isGifExporting}
        isOpen={isAnimationModalOpen}
        onClose={() => {
          setIsAnimationModalOpen(false);
        }}
        onColorCountChange={setGifColorCount}
        onDitherLevelChange={setGifDitherLevel}
        onFinalPauseChange={setGifFinalPauseMs}
        onCustomDateChange={handleCustomDateChange}
        onCustomEndStepChange={handleCustomEndStepChange}
        onCustomStartStepChange={handleCustomStartStepChange}
        onExportGif={() => { void exportGif(); }}
        onFpsChange={setAnimationFps}
        onPaletteModeChange={setGifPaletteMode}
        onPresetChange={handleAnimationPresetChange}
        onResolutionChange={setGifMaxDimension}
        preset={animationPreset}
        rangeError={computedAnimationRangeError ?? animationRangeError}
        t={t}
        theme={resolvedTheme}
      />

      <DownloadModal
        availableExportKinds={availableExportKinds}
        downloadModalRef={downloadModalRef}
        isExporting={isExporting}
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        t={t}
        theme={resolvedTheme}
        onConfirm={() => {
          if (selectedExportKinds.length === 0) return;
          setIsDownloadModalOpen(false);
          void downloadPack(selectedExportKinds);
        }}
        onToggleKind={(kind, checked) => setSelectedExports((prev) => ({ ...prev, [kind]: checked }))}
        selectedExports={selectedExports}
        selectedExportKinds={selectedExportKinds}
      />

      {/* Dynamic stylesheets to apply adjustments in real-time */}
      <style>{`
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
          color: rgba(255, 255, 255, 0.88);
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.65);
          white-space: nowrap;
          pointer-events: none;
          font-family: Inter, system-ui, -apple-system, sans-serif;
          font-weight: 500;
          transform: translate(4px, -2px);
        }
        .city-label-sm { font-size: 10px; opacity: 0.82; }
        .city-label-md { font-size: 11px; opacity: 0.88; }
        .city-label-lg { font-size: 12px; opacity: 0.95; }
        .vis-layer-tiles {
          filter: brightness(${visBrightness}) contrast(${visContrast});
        }
        .rgb-layer-tiles {
          filter: saturate(${rgbLayerEffectiveSaturation}) brightness(${rgbLayerEffectiveBrightness});
        }
        .ir-overlay-layer-tiles {
          mix-blend-mode: color;
          filter: saturate(1.2) contrast(1.08);
        }
        .ir-cloud-only-layer-tiles {
          mix-blend-mode: color;
          filter: saturate(1.2) contrast(1.08);
        }
        .vis-overlay-layer-tiles {
          mix-blend-mode: soft-light;
          filter: brightness(${visBrightness}) contrast(${visContrast});
        }
        .vis-overlay-layer-tiles-rgb-hd {
          mix-blend-mode: luminosity;
          filter: brightness(${visHdLegacyBrightness}) contrast(${visHdLegacyContrast});
        }
        .vis-overlay-layer-tiles-on-ir {
          mix-blend-mode: screen;
          filter: brightness(${visBrightness}) contrast(${visContrast}) saturate(1.05);
        }
        .vis-overlay-layer-tiles-hybrid {
          mix-blend-mode: luminosity;
          filter: brightness(${visBrightness}) contrast(${visContrast});
        }
      `}</style>
    </div>
  );
}
