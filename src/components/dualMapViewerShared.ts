export const WMS_URL_DIRECT = 'https://view.eumetsat.int/geoserver/ows';
export const LAYER_VIS = 'mtg_fd:vis06_hrfi';
export const LAYER_RGB = 'mtg_fd:rgb_truecolour';
export const LAYER_IR = 'mtg_fd:ir105_hrfi';
export const LAYER_FIRETEMP = 'mtg_fd:rgb_firetemperature';
export const IR_STYLES = [
  { id: 'mtg_fd:mtg_fd_ir105_hrfi_style_02', label: 'IR 10.5 - Style 02' },
  { id: 'mtg_fd:mtg_fd_ir105_hrfi_style_01', label: 'IR 10.5 - Style 01' },
  { id: 'mtg_fd:mtg_fd_ir105_hrfi_grayscale', label: 'IR 10.5 - Grayscale' },
] as const;
export const DEFAULT_MAP_CENTER: [number, number] = [46.603354, 1.888334];
export const DEFAULT_FRANCE_BOUNDS: [[number, number], [number, number]] = [
  [41.15, -5.8],
  [51.35, 9.7],
];
export const CITY_GEOJSON_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson';
export const FRANCE_DEPARTMENTS_GEOJSON_URL = 'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements.geojson';
export const STORAGE_KEYS = {
  activeLayers: 'mtg_active_layers',
  autoReduceVisAtNight: 'mtg_auto_reduce_vis_night',
  fireHotspotEnabled: 'mtg_fire_hotspot_enabled',
  fireHotspotMinBrightness: 'mtg_fire_hotspot_min_brightness',
  fireHotspotMinRedBlueDiff: 'mtg_fire_hotspot_min_red_blue_diff',
  fireHotspotOpacity: 'mtg_fire_hotspot_opacity',
  hdEnhanceEnabled: 'mtg_hd_enhance_enabled',
  hdEnhanceHighlightProtection: 'mtg_hd_enhance_highlight_protection',
  hdEnhanceLocalContrast: 'mtg_hd_enhance_local_contrast',
  hdEnhanceNoiseReduction: 'mtg_hd_enhance_noise_reduction',
  hdEnhancePreset: 'mtg_hd_enhance_preset',
  hdEnhanceRadius: 'mtg_hd_enhance_radius',
  hdEnhanceSaturationAdjust: 'mtg_hd_enhance_saturation_adjust',
  hdEnhanceShadowProtection: 'mtg_hd_enhance_shadow_protection',
  hdEnhanceSharpen: 'mtg_hd_enhance_sharpen',
  hdEnhanceStrength: 'mtg_hd_enhance_strength',
  irStyle: 'mtg_ir_style',
  language: 'mtg_language',
  lastMapView: 'mtg_last_map_view',
  mapOptions: 'mtg_map_options',
  rgbHdOpacity: 'mtg_rgb_hd_opacity',
  rgbSaturation: 'mtg_rgb_saturation',
  sandwichOpacity: 'mtg_sandwich_opacity',
  themeMode: 'mtg_theme_mode',
  visBrightness: 'mtg_vis_brightness',
  visContrast: 'mtg_vis_contrast',
} as const;

export type CityFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    NAME?: string;
    NAMEASCII?: string;
    POP_MAX?: number;
    FEATURECLA?: string;
  };
};

export type IrStyle = (typeof IR_STYLES)[number]['id'];
export type HdEnhancementPreset = 'natural' | 'balanced' | 'punchy' | 'analyze' | 'custom';
export type ExportKind = 'vis' | 'rgb' | 'ir' | 'hd' | 'sandwich' | 'hybrid';
export type MapOptions = {
  bordersOpacity: number;
  /** Multiplier on the per-zoom city visibility thresholds in `getVisibleCityFeatures`
   * (useDualMapLeaflet.ts): scales the population floor down and the on-screen city cap up as it
   * increases, so 1 keeps the original defaults, <1 shows only the biggest cities, and >1 shows
   * more/smaller ones. */
  cityDensity: number;
  franceDepartmentsOpacity: number;
  showBorders: boolean;
  showCities: boolean;
  showFranceDepartments: boolean;
};

export type ActiveLayers = {
  rgb: boolean;
  vis: boolean;
  ir: boolean;
};

export type MapViewState = {
  lat: number;
  lng: number;
  zoom: number;
};

export const DEFAULT_ACTIVE_LAYERS: ActiveLayers = {
  rgb: true,
  vis: true,
  ir: false,
};

export function sanitizeActiveLayers(input: ActiveLayers): ActiveLayers {
  if (input.rgb || input.vis || input.ir) return input;
  return { ...DEFAULT_ACTIVE_LAYERS };
}

/**
 * Picks between a light- and dark-theme class string. Replaces the
 * `isLight ? 'light classes' : 'dark classes'` ternary repeated throughout the
 * panel components with a single named call.
 */
export function themedClass(isLight: boolean, lightClasses: string, darkClasses: string): string {
  return isLight ? lightClasses : darkClasses;
}

export function getSinglePanelTitle(layers: ActiveLayers, localized: {
  layerPrefix: string;
  none: string;
  rgb: string;
  vis: string;
  ir: string;
}): string {
  const activeLabels: string[] = [];
  if (layers.rgb) activeLabels.push(localized.rgb);
  if (layers.vis) activeLabels.push(localized.vis);
  if (layers.ir) activeLabels.push(localized.ir);
  if (activeLabels.length === 0) return localized.none;
  return `${localized.layerPrefix} ${activeLabels.join(' + ')}`;
}

export function getAvailableExportKindsFromLayers(layers: ActiveLayers): ExportKind[] {
  const kinds: ExportKind[] = [];
  if (layers.vis) kinds.push('vis');
  if (layers.rgb) kinds.push('rgb');
  if (layers.ir) kinds.push('ir');
  if (layers.rgb && layers.vis) kinds.push('hd');
  if (layers.vis && layers.ir) kinds.push('sandwich');
  if (layers.rgb && layers.vis && layers.ir) kinds.push('hybrid');
  return kinds;
}

export function getExportLabel(kind: ExportKind, labels: {
  vis: string;
  rgb: string;
  ir: string;
  hd: string;
  hybrid: string;
  sandwich: string;
}): string {
  if (kind === 'vis') return labels.vis;
  if (kind === 'rgb') return labels.rgb;
  if (kind === 'ir') return labels.ir;
  if (kind === 'hd') return labels.hd;
  if (kind === 'hybrid') return labels.hybrid;
  return labels.sandwich;
}

/**
 * The on-image badge text and exported filename stem per export kind. Shared between the
 * export renderer (which draws the badge and names the file) and the download modal (which
 * needs to preview that same filename before a single, non-zipped export) so they can't drift
 * apart. The 'hd' kind's naming depends on whether HD enhancement is actually on — it used to
 * always say "HD" even when the enhancement toggle was off, which was misleading.
 */
export function getExportBadge(kind: ExportKind, hdEnhanceEnabled: boolean): string {
  if (kind === 'vis') return 'VIS';
  if (kind === 'rgb') return 'RGB';
  if (kind === 'ir') return 'IR10.5';
  if (kind === 'hd') return hdEnhanceEnabled ? 'RGB+VIS HD' : 'RGB+VIS';
  if (kind === 'hybrid') return 'VIS+RGB+SANDWICH';
  return 'SANDWICH(IR)';
}

export function getExportFileBaseName(kind: ExportKind, hdEnhanceEnabled: boolean): string {
  if (kind === 'vis') return 'VIS_0.6';
  if (kind === 'rgb') return 'RGB_TRUE_COLOR';
  if (kind === 'ir') return 'IR10.5';
  if (kind === 'hd') return hdEnhanceEnabled ? 'RGB_VIS_HD' : 'RGB_VIS';
  if (kind === 'hybrid') return 'VIS_RGB_SANDWICH';
  return 'SANDWICH_IR_VIS';
}

export function readStoredNumber(key: string, fallback: number): number {
  try {
    const value = localStorage.getItem(key);
    if (!value) return fallback;

    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return value === 'true';
  } catch {
    return fallback;
  }
}

export function readStoredString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function safeSetLocalStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage persistence failures.
  }
}

export function getLatestAvailableTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - 20);
  now.setMinutes(Math.floor(now.getMinutes() / 10) * 10);
  now.setSeconds(0);
  now.setMilliseconds(0);
  return now.toISOString().slice(0, 16);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function getSolarElevation(date: Date, latitude: number, longitude: number): number {
  const julianDay = date.getTime() / 86400000 + 2440587.5;
  const daysSinceJ2000 = julianDay - 2451545;

  const meanAnomaly = toRadians((357.5291 + 0.98560028 * daysSinceJ2000) % 360);
  const meanLongitude = (280.46646 + 0.98564736 * daysSinceJ2000) % 360;
  const eclipticLongitude = toRadians(
    (meanLongitude + 1.9148 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly) + 360) % 360,
  );
  const obliquity = toRadians(23.4393 - 0.00000036 * daysSinceJ2000);

  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude));
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));

  const gmstHours = (18.697374558 + 24.06570982441908 * daysSinceJ2000) % 24;
  const localSiderealTime = toRadians(((gmstHours * 15 + longitude) % 360 + 360) % 360);

  let hourAngle = localSiderealTime - rightAscension;
  if (hourAngle < -Math.PI) hourAngle += 2 * Math.PI;
  if (hourAngle > Math.PI) hourAngle -= 2 * Math.PI;

  const latitudeRad = toRadians(latitude);
  const elevation = Math.asin(
    Math.sin(latitudeRad) * Math.sin(declination) +
      Math.cos(latitudeRad) * Math.cos(declination) * Math.cos(hourAngle),
  );

  return toDegrees(elevation);
}

export function getDaylightVisFactor(solarElevation: number): number {
  if (solarElevation <= -6) return 0;
  if (solarElevation >= 12) return 1;
  return clamp((solarElevation + 6) / 18, 0, 1);
}

export const HD_ENHANCEMENT_PROFILES: Record<Exclude<HdEnhancementPreset, 'custom'>, {
  sharpen: number;
  contrast: number;
  saturation: number;
}> = {
  natural: { sharpen: 0.8, contrast: 0.85, saturation: 0.8 },
  balanced: { sharpen: 1, contrast: 1, saturation: 1 },
  punchy: { sharpen: 1.2, contrast: 1.25, saturation: 1.15 },
  analyze: { sharpen: 1.35, contrast: 1.35, saturation: 0.9 },
};

export function getHdEnhancementProfile(preset: HdEnhancementPreset): { sharpen: number; contrast: number; saturation: number } {
  return preset === 'custom' ? { sharpen: 1, contrast: 1, saturation: 1 } : HD_ENHANCEMENT_PROFILES[preset];
}

/**
 * The extra boost applied on top of the user's own saturation/brightness/contrast sliders
 * specifically in RGB+VIS-only mode (no IR), where the VIS layer is blended over RGB in
 * `mix-blend-mode: luminosity` to add cloud detail. Shared between the live CSS-filter
 * renderer and the still/GIF export canvas renderer so they can't silently drift apart —
 * they used to each hardcode their own slightly different numbers (e.g. 1.45x/1.30x for
 * the RGB saturation boost), which made exported RGB+VIS images look visibly darker than
 * the live view for the same slider settings.
 */
export const RGB_VIS_FUSION = {
  rgbSaturationBoost: 1.45,
  rgbBrightnessBoost: 1.12,
  visBrightnessBoost: 1.2,
  visContrastBoost: 1.2,
} as const;

export type LayerBlendState = {
  daylightVisFactor: number;
  visNightFactor: number;
  hybridVisNightFactor: number;
  effectiveSandwichOpacity: number;
  isRgbVisOnlyMode: boolean;
  /** RGB base brightness factor (0.55-1) that dims RGB+VIS-only mode at night; 1 in every other mode. */
  rgbVisOnlyNightBrightness: number;
  hybridVisOpacityCap: number;
  rgbVisOnlyOpacityCap: number;
  /** VIS-on-RGB opacity capped for the RGB+VIS-only blend (no IR involved). */
  effectiveRgbVisOnlyVisOpacity: number;
  /** VIS-on-RGB opacity capped for the RGB+VIS+IR hybrid blend. */
  effectiveHybridOnlyVisOpacity: number;
  /** Whichever of the two above applies to the layers currently active on the map. */
  effectiveHybridVisOpacity: number;
  effectiveHybridIrOpacity: number;
  isHybridMode: boolean;
  isRgbIrMode: boolean;
  isVisIrMode: boolean;
  shouldPreferIrBaseAtNight: boolean;
  baseLayer: 'rgb' | 'ir' | 'vis';
  rgbToIrTransition: number;
  isRgbBasedCloudOnlyMode: boolean;
  isCloudOnlyIrMode: boolean;
  effectiveCloudOnlyIrOpacity: number;
  cloudOnlyIrVisMaskWeight: number;
  isVisOverlayEnabled: boolean;
  isIrOverlayEnabled: boolean;
  currentVisOverlayOpacity: number;
};

/**
 * Derives every layer-blending flag/opacity from the active layers and solar elevation.
 * Shared by the live Leaflet renderer and the still/GIF export renderer so the two
 * never drift apart (they previously duplicated this math with a divergent formula).
 */
export function computeLayerBlendState(params: {
  activeLayers: ActiveLayers;
  rgbHdOpacity: number;
  sandwichOpacity: number;
  autoReduceVisAtNight: boolean;
  solarElevation: number;
}): LayerBlendState {
  const { activeLayers, rgbHdOpacity, sandwichOpacity, autoReduceVisAtNight, solarElevation } = params;

  const visNightFactor = autoReduceVisAtNight && activeLayers.vis && activeLayers.ir
    ? getDaylightVisFactor(solarElevation)
    : 1;
  const daylightVisFactor = Math.max(0, Math.min(1, getDaylightVisFactor(solarElevation)));
  const hybridVisNightFactor = Math.pow(visNightFactor, 1.6);
  const effectiveSandwichOpacity = sandwichOpacity * visNightFactor;
  const isRgbVisOnlyMode = activeLayers.rgb && activeLayers.vis && !activeLayers.ir;
  const rgbVisNightFade = Math.max(0, Math.min(1, (solarElevation + 2) / 6));
  const rgbVisOnlyNightBrightness = isRgbVisOnlyMode ? 0.55 + rgbVisNightFade * 0.45 : 1;
  // In luminosity blend mode, high VIS opacity can noticeably darken RGB.
  // Keep a conservative dynamic cap to preserve VIS detail without dimming daytime RGB too much.
  const hybridVisOpacityCap = 0.48 + daylightVisFactor * 0.14;
  const rgbVisOnlyOpacityCap = 0.8;
  const rgbVisOnlyNightFactor = Math.max(0.7, visNightFactor);
  const effectiveRgbVisOnlyVisOpacity = Math.min(rgbHdOpacity * rgbVisOnlyNightFactor, rgbVisOnlyOpacityCap);
  const effectiveHybridOnlyVisOpacity = Math.min(rgbHdOpacity * hybridVisNightFactor, hybridVisOpacityCap);
  const effectiveHybridVisOpacity = isRgbVisOnlyMode ? effectiveRgbVisOnlyVisOpacity : effectiveHybridOnlyVisOpacity;
  const effectiveHybridIrOpacity = sandwichOpacity;
  const isHybridMode = activeLayers.rgb && activeLayers.vis && activeLayers.ir;
  const isRgbIrMode = activeLayers.rgb && activeLayers.ir && !activeLayers.vis;
  const isVisIrMode = activeLayers.vis && activeLayers.ir && !activeLayers.rgb;
  const shouldPreferIrBaseAtNight = activeLayers.rgb && (activeLayers.vis || activeLayers.ir) && solarElevation < 1.5;
  const baseLayer: 'rgb' | 'ir' | 'vis' = shouldPreferIrBaseAtNight
    ? 'ir'
    : activeLayers.rgb
      ? 'rgb'
      : activeLayers.vis
        ? 'vis'
        : 'ir';
  const rgbToIrTransition = activeLayers.rgb && activeLayers.ir
    ? Math.max(0, Math.min(1, (1.5 - solarElevation) / 12))
    : 0;
  const isRgbBasedCloudOnlyMode = baseLayer === 'rgb' && (isHybridMode || isRgbIrMode);
  const isCloudOnlyIrMode = isVisIrMode || isRgbBasedCloudOnlyMode;
  const effectiveCloudOnlyIrOpacity = isRgbBasedCloudOnlyMode
    ? effectiveHybridIrOpacity * (1 - rgbToIrTransition)
    : isVisIrMode
      ? sandwichOpacity
      : 0;
  const hybridVisMaskWeight = Math.min(0.35, Math.max(0, (daylightVisFactor - 0.35) / 0.65));
  const cloudOnlyIrVisMaskWeight = isHybridMode ? hybridVisMaskWeight : isVisIrMode ? 1 : 0;
  const isVisOverlayEnabled = activeLayers.vis && baseLayer !== 'vis';
  const isIrOverlayEnabled = activeLayers.ir && baseLayer !== 'ir';
  const currentVisOverlayOpacity = activeLayers.rgb ? effectiveHybridVisOpacity : effectiveSandwichOpacity;

  return {
    daylightVisFactor,
    visNightFactor,
    hybridVisNightFactor,
    effectiveSandwichOpacity,
    isRgbVisOnlyMode,
    rgbVisOnlyNightBrightness,
    hybridVisOpacityCap,
    rgbVisOnlyOpacityCap,
    effectiveRgbVisOnlyVisOpacity,
    effectiveHybridOnlyVisOpacity,
    effectiveHybridVisOpacity,
    effectiveHybridIrOpacity,
    isHybridMode,
    isRgbIrMode,
    isVisIrMode,
    shouldPreferIrBaseAtNight,
    baseLayer,
    rgbToIrTransition,
    isRgbBasedCloudOnlyMode,
    isCloudOnlyIrMode,
    effectiveCloudOnlyIrOpacity,
    cloudOnlyIrVisMaskWeight,
    isVisOverlayEnabled,
    isIrOverlayEnabled,
    currentVisOverlayOpacity,
  };
}

export type FireHotspotThresholds = {
  /** Minimum (red - blue) channel gap, 0-255. Fire Temperature RGB renders land/sea in blue-ish
   * tones and fires in red/orange/yellow, so this is the primary discriminator. */
  minRedBlueDiff: number;
  /** Minimum brightness (max of R/G/B), 0-255. Filters out dim reddish noise (e.g. sun glint,
   * bare soil at low sun angle) that passes the red/blue gap but isn't an actual hotspot. */
  minBrightness: number;
};

export const DEFAULT_FIRE_HOTSPOT_THRESHOLDS: FireHotspotThresholds = {
  minRedBlueDiff: 60,
  minBrightness: 140,
};

/**
 * Isolates fire hotspot pixels out of a Fire Temperature RGB tile. That WMS layer has no alpha
 * transparency of its own (it's a full-disk composite, not sparse markers on a transparent
 * background) and renders land/sea/cloud in blue-ish tones with fires in red-orange-to-white —
 * but daytime bare soil/desert/coastline can also read as mildly red, so a fixed threshold would
 * false-positive. The thresholds are therefore exposed as live-adjustable sliders
 * (`FireHotspotThresholds`) rather than baked-in constants. Shared by the live per-tile renderer
 * (useDualMapLeaflet) and the still/GIF export renderer (dualMapExport) for the same reason as
 * `computeCloudOnlyIrRgba` below.
 */
export function computeFireHotspotRgba(
  fireData: Uint8ClampedArray,
  thresholds: FireHotspotThresholds,
  alphaMultiplier = 1,
): Uint8ClampedArray {
  const { minRedBlueDiff, minBrightness } = thresholds;
  const out = new Uint8ClampedArray(fireData.length);

  for (let i = 0; i < out.length; i += 4) {
    const r = fireData[i];
    const g = fireData[i + 1];
    const b = fireData[i + 2];
    const brightness = Math.max(r, g, b);
    const redBlueDiff = r - b;

    if (redBlueDiff < minRedBlueDiff || brightness < minBrightness) {
      out[i + 3] = 0;
      continue;
    }

    const intensity = Math.max(0.55, Math.min(1, (redBlueDiff - minRedBlueDiff) / 120));
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = Math.round(255 * intensity * alphaMultiplier);
  }

  return out;
}

export type CloudOnlyIrRenderOptions = {
  visMaskWeight: number;
  alphaMultiplier?: number;
};

/**
 * Blends VIS/RGB cloud-detection masks with the IR band into a cloud-only RGBA buffer.
 * Shared by the live per-tile renderer (useDualMapLeaflet) and the still/GIF export
 * renderer (dualMapExport) so the two cloud-detection algorithms never drift apart.
 */
export function computeCloudOnlyIrRgba(
  visData: Uint8ClampedArray | null,
  rgbData: Uint8ClampedArray | null,
  irData: Uint8ClampedArray,
  options: CloudOnlyIrRenderOptions,
): Uint8ClampedArray {
  const { visMaskWeight, alphaMultiplier = 1 } = options;
  const normalizedVisWeight = Math.max(0, Math.min(1, visMaskWeight));
  const visThresholdBase = 90;
  const visThresholdSpan = 100;
  const rgbThresholdBase = 120;
  const rgbThresholdSpan = 90;
  const satBoost = 1.2;

  const out = new Uint8ClampedArray(irData.length);

  for (let i = 0; i < out.length; i += 4) {
    const visLum = visData ? (visData[i] + visData[i + 1] + visData[i + 2]) / 3 : 0;
    const rgbLum = rgbData ? (rgbData[i] + rgbData[i + 1] + rgbData[i + 2]) / 3 : visLum;

    const rgbCloudMask = Math.min(1, Math.max(0, (rgbLum - rgbThresholdBase) / rgbThresholdSpan));
    const visCloudMask = Math.min(1, Math.max(0, (visLum - visThresholdBase) / visThresholdSpan));
    const refinedCloudMask = rgbCloudMask * (1 - normalizedVisWeight) + visCloudMask * normalizedVisWeight;
    // RGB floor increases only when VIS becomes unreliable (dusk/night).
    const rgbFloorFactor = (1 - normalizedVisWeight) * 0.85;
    const cloudMask = Math.max(rgbCloudMask * rgbFloorFactor, refinedCloudMask);

    if (cloudMask < 0.02) {
      out[i + 3] = 0;
      continue;
    }

    const irR = irData[i];
    const irG = irData[i + 1];
    const irB = irData[i + 2];
    const mean = (irR + irG + irB) / 3;

    out[i] = Math.max(0, Math.min(255, mean + (irR - mean) * satBoost));
    out[i + 1] = Math.max(0, Math.min(255, mean + (irG - mean) * satBoost));
    out[i + 2] = Math.max(0, Math.min(255, mean + (irB - mean) * satBoost));
    out[i + 3] = Math.round(255 * cloudMask * alphaMultiplier);
  }

  return out;
}