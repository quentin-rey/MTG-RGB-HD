export const WMS_URL_DIRECT = 'https://view.eumetsat.int/geoserver/ows';
export const WMS_URL_PROXY = 'https://view.eumetsat.int/geoserver/ows';
export const LAYER_VIS = 'mtg_fd:vis06_hrfi';
export const LAYER_RGB = 'mtg_fd:rgb_truecolour';
export const LAYER_IR = 'mtg_fd:ir105_hrfi';
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
  irStyle: 'mtg_ir_style',
  language: 'mtg_language',
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
export type ExportKind = 'vis' | 'rgb' | 'ir' | 'hd' | 'sandwich' | 'hybrid';
export type MapOptions = {
  bordersOpacity: number;
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

export const DEFAULT_ACTIVE_LAYERS: ActiveLayers = {
  rgb: true,
  vis: true,
  ir: false,
};

export function sanitizeActiveLayers(input: ActiveLayers): ActiveLayers {
  if (input.rgb || input.vis || input.ir) return input;
  return { ...DEFAULT_ACTIVE_LAYERS };
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