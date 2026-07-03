import L from 'leaflet';
import { applyPalette, GIFEncoder, nearestColorIndex, quantize } from 'gifenc';

import {
  computeCloudOnlyIrRgba,
  computeLayerBlendState,
  getExportBadge,
  getExportFileBaseName,
  getHdEnhancementProfile,
  LAYER_IR,
  LAYER_RGB,
  LAYER_VIS,
  RGB_VIS_FUSION,
  type ActiveLayers,
  type CityFeature,
  type ExportKind,
  type HdEnhancementPreset,
  type IrStyle,
  type MapOptions,
  WMS_URL_DIRECT,
} from './dualMapViewerShared';
import type { Language } from './i18n';

export type StillImageFormat = 'png' | 'jpeg';

type DownloadSatellitePackOptions = {
  requestedKinds: ExportKind[];
  map: L.Map;
  mapContainer: HTMLDivElement;
  currentTime: string;
  activeLayers: ActiveLayers;
  irStyle: IrStyle;
  visBrightness: number;
  visContrast: number;
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
  rgbSaturation: number;
  rgbHdOpacity: number;
  sandwichOpacity: number;
  autoReduceVisAtNight: boolean;
  exportSolarElevation: number;
  mapOptions: MapOptions;
  language: Language;
  map1BordersLayer: L.GeoJSON | null;
  map1DepartmentsLayer: L.GeoJSON | null;
  cityLoadPromise: Promise<void> | null;
  getVisibleCityFeatures: (bounds: L.LatLngBounds, zoom: number) => CityFeature[];
  maxDimension?: number;
  imageFormat?: StillImageFormat;
  onProgress?: (progress: number) => void;
};

type RenderSatelliteFramesOptions = Omit<DownloadSatellitePackOptions, 'currentTime'> & {
  currentTime: string;
  maxDimension?: number;
};

export type GifPaletteMode = 'per-frame' | 'global';
export type GifDitherLevel = 'none' | 'low' | 'medium' | 'high';
export type GifFinalPauseMs = number;

type ExportAnimationGifOptions = Omit<DownloadSatellitePackOptions, 'requestedKinds' | 'currentTime'> & {
  frameTimes: string[];
  fps: number;
  kind: ExportKind;
  colorCount?: number;
  paletteMode?: GifPaletteMode;
  ditherLevel?: GifDitherLevel;
  finalPauseMs?: GifFinalPauseMs;
  maxDimension?: number;
  onProgress?: (progress: number) => void;
};

function sampleRgbaPixels(rgba: Uint8ClampedArray, targetPixelCount: number): Uint8Array {
  const pixelCount = Math.max(1, Math.floor(rgba.length / 4));
  const safeTarget = Math.max(1, Math.floor(targetPixelCount));
  const step = Math.max(1, Math.floor(pixelCount / safeTarget));
  const sampled: number[] = [];

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += step) {
    const offset = pixelIndex * 4;
    sampled.push(rgba[offset], rgba[offset + 1], rgba[offset + 2], rgba[offset + 3]);
  }

  return Uint8Array.from(sampled);
}

function applyPaletteWithDithering(
  rgba: Uint8ClampedArray,
  palette: number[][],
  width: number,
  height: number,
  ditherLevel: GifDitherLevel,
): Uint8Array {
  const ditherStrength = ditherLevel === 'low'
    ? 0.35
    : ditherLevel === 'medium'
      ? 0.6
      : ditherLevel === 'high'
        ? 0.85
        : 0;

  if (ditherStrength <= 0) {
    return applyPalette(rgba, palette, 'rgb565');
  }

  const pixelCount = width * height;
  const working = new Float32Array(pixelCount * 3);
  const indexed = new Uint8Array(pixelCount);

  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    working[j] = rgba[i];
    working[j + 1] = rgba[i + 1];
    working[j + 2] = rgba[i + 2];
  }

  const diffuse = (x: number, y: number, er: number, eg: number, eb: number, weight: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 3;
    working[idx] += er * weight;
    working[idx + 1] += eg * weight;
    working[idx + 2] += eb * weight;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const idx3 = idx * 3;
      const r = Math.max(0, Math.min(255, working[idx3]));
      const g = Math.max(0, Math.min(255, working[idx3 + 1]));
      const b = Math.max(0, Math.min(255, working[idx3 + 2]));

      const paletteIndex = nearestColorIndex(palette, [r, g, b]);
      indexed[idx] = paletteIndex;

      const selected = palette[paletteIndex] ?? [r, g, b];
      const er = (r - selected[0]) * ditherStrength;
      const eg = (g - selected[1]) * ditherStrength;
      const eb = (b - selected[2]) * ditherStrength;

      diffuse(x + 1, y, er, eg, eb, 7 / 16);
      diffuse(x - 1, y + 1, er, eg, eb, 3 / 16);
      diffuse(x, y + 1, er, eg, eb, 5 / 16);
      diffuse(x + 1, y + 1, er, eg, eb, 1 / 16);
    }
  }

  return indexed;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function applyHdEnhancement(sourceCanvas: HTMLCanvasElement, options: {
  strength: number;
  sharpen: number;
  radius: number;
  localContrast: number;
  highlightProtection: number;
  saturationAdjust: number;
  noiseReduction: number;
  shadowProtection: number;
  preset: HdEnhancementPreset;
}): HTMLCanvasElement {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const safeStrength = Math.max(0, Math.min(1, options.strength));
  if (safeStrength <= 0) {
    return sourceCanvas;
  }

  const profile = getHdEnhancementProfile(options.preset);

  const safeSharpen = Math.max(0, Math.min(1, options.sharpen));
  const safeRadius = Math.max(0.5, Math.min(3, options.radius));
  const safeLocalContrast = Math.max(0, Math.min(1, options.localContrast));
  const safeHighlights = Math.max(0, Math.min(1, options.highlightProtection));
  const safeSaturationAdjust = Math.max(-20, Math.min(30, options.saturationAdjust));
  const safeNoiseReduction = Math.max(0, Math.min(1, options.noiseReduction));
  const safeShadows = Math.max(0, Math.min(1, options.shadowProtection));

  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) {
    return sourceCanvas;
  }

  const inputCanvas = document.createElement('canvas');
  inputCanvas.width = width;
  inputCanvas.height = height;
  const inputCtx = inputCanvas.getContext('2d');
  if (!inputCtx) {
    return sourceCanvas;
  }
  inputCtx.drawImage(sourceCanvas, 0, 0, width, height);

  if (safeNoiseReduction > 0.01) {
    const denoiseCanvas = document.createElement('canvas');
    denoiseCanvas.width = width;
    denoiseCanvas.height = height;
    const denoiseCtx = denoiseCanvas.getContext('2d');
    if (denoiseCtx) {
      denoiseCtx.filter = `blur(${(0.4 + safeNoiseReduction * 1.2).toFixed(2)}px)`;
      denoiseCtx.drawImage(sourceCanvas, 0, 0, width, height);
      denoiseCtx.filter = 'none';
      inputCtx.globalAlpha = Math.min(0.5, safeNoiseReduction * 0.45);
      inputCtx.drawImage(denoiseCanvas, 0, 0, width, height);
      inputCtx.globalAlpha = 1;
    }
  }

  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = width;
  blurCanvas.height = height;
  const blurCtx = blurCanvas.getContext('2d');
  if (!blurCtx) {
    return sourceCanvas;
  }

  blurCtx.filter = `blur(${(safeRadius * (0.85 + safeStrength * 0.55)).toFixed(2)}px)`;
  blurCtx.drawImage(inputCanvas, 0, 0, width, height);
  blurCtx.filter = 'none';

  const sourceData = inputCtx.getImageData(0, 0, width, height);
  const blurData = blurCtx.getImageData(0, 0, width, height);
  const amount = 0.2 + safeStrength * safeSharpen * profile.sharpen * 1.45;
  const contrastAmount = safeStrength * safeLocalContrast * profile.contrast;
  const highlightAmount = safeStrength * safeHighlights;
  const shadowAmount = safeStrength * safeShadows;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    return sourceCanvas;
  }

  const outData = outCtx.createImageData(width, height);
  for (let i = 0; i < sourceData.data.length; i += 4) {
    const sr = sourceData.data[i];
    const sg = sourceData.data[i + 1];
    const sb = sourceData.data[i + 2];
    const sa = sourceData.data[i + 3];
    const br = blurData.data[i];
    const bg = blurData.data[i + 1];
    const bb = blurData.data[i + 2];

    let rr = sr + (sr - br) * amount;
    let gg = sg + (sg - bg) * amount;
    let bb2 = sb + (sb - bb) * amount;

    if (contrastAmount > 0) {
      const contrastFactor = 1 + contrastAmount * 0.45;
      rr = (rr - 128) * contrastFactor + 128;
      gg = (gg - 128) * contrastFactor + 128;
      bb2 = (bb2 - 128) * contrastFactor + 128;
    }

    const luma = (0.299 * rr + 0.587 * gg + 0.114 * bb2) / 255;
    if (highlightAmount > 0 && luma > 0.72) {
      const rolloff = ((luma - 0.72) / 0.28) * highlightAmount * 0.32;
      rr -= rr * rolloff;
      gg -= gg * rolloff;
      bb2 -= bb2 * rolloff;
    }
    if (shadowAmount > 0 && luma < 0.3) {
      const lift = ((0.3 - luma) / 0.3) * shadowAmount * 22;
      rr += lift;
      gg += lift;
      bb2 += lift;
    }

    outData.data[i] = clampByte(rr);
    outData.data[i + 1] = clampByte(gg);
    outData.data[i + 2] = clampByte(bb2);
    outData.data[i + 3] = sa;
  }

  outCtx.putImageData(outData, 0, 0);

  const gradeCanvas = document.createElement('canvas');
  gradeCanvas.width = width;
  gradeCanvas.height = height;
  const gradeCtx = gradeCanvas.getContext('2d');
  if (!gradeCtx) {
    return outCanvas;
  }
  const saturation = 100 + safeSaturationAdjust * safeStrength * profile.saturation;
  const postContrast = 100 + contrastAmount * 16 + amount * 6;
  gradeCtx.filter = `saturate(${Math.max(70, Math.min(150, saturation)).toFixed(0)}%) contrast(${Math.max(90, Math.min(150, postContrast)).toFixed(0)}%)`;
  gradeCtx.drawImage(outCanvas, 0, 0, width, height);
  gradeCtx.filter = 'none';

  return gradeCanvas;
}

type ExportOverlayLocale = {
  watermarkText: string;
  layerLabelSingle: string;
  layerLabelPlural: string;
  dateUtcLabel: string;
};

function getExportOverlayLocale(language: Language): ExportOverlayLocale {
  if (language === 'en') {
    return {
      watermarkText: 'Source: EUMETSAT / MTG | MTG-RGB-HD',
      layerLabelSingle: 'LAYER',
      layerLabelPlural: 'LAYERS',
      dateUtcLabel: 'UTC DATE',
    };
  }

  return {
    watermarkText: 'Sources: EUMETSAT / MTG | MTG-RGB-HD',
    layerLabelSingle: 'COUCHE',
    layerLabelPlural: 'COUCHES',
    dateUtcLabel: 'DATE UTC',
  };
}

function applyWatermark(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  locale: ExportOverlayLocale,
  scale: number,
) {
  const text = locale.watermarkText;
  const horizontalPadding = 12 * scale;
  const badgeHeight = 28 * scale;
  const margin = 10 * scale;

  context.save();
  context.font = `600 ${Math.round(11 * scale)}px "JetBrains Mono", monospace, sans-serif`;
  const badgeWidth = Math.ceil(context.measureText(text).width + horizontalPadding * 2);
  const left = width - badgeWidth - margin;
  const top = height - badgeHeight - margin;

  drawGlassPanel(context, left, top, badgeWidth, badgeHeight, 0);

  context.fillStyle = 'rgba(245, 250, 255, 0.96)';
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  context.fillText(text, width - margin - horizontalPadding, top + badgeHeight / 2 + 0.5);
  context.restore();
}

function drawRoundedRectPath(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  radius: number,
) {
  const maxRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(left + maxRadius, top);
  context.lineTo(left + width - maxRadius, top);
  context.quadraticCurveTo(left + width, top, left + width, top + maxRadius);
  context.lineTo(left + width, top + height - maxRadius);
  context.quadraticCurveTo(left + width, top + height, left + width - maxRadius, top + height);
  context.lineTo(left + maxRadius, top + height);
  context.quadraticCurveTo(left, top + height, left, top + height - maxRadius);
  context.lineTo(left, top + maxRadius);
  context.quadraticCurveTo(left, top, left + maxRadius, top);
  context.closePath();
}

function drawGlassPanel(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  radius: number,
) {
  const sourceCanvas = context.canvas as HTMLCanvasElement;

  context.save();
  drawRoundedRectPath(context, left, top, width, height, radius);
  context.clip();

  context.filter = 'blur(7px) saturate(105%)';
  context.drawImage(sourceCanvas, left, top, width, height, left, top, width, height);
  context.filter = 'none';

  const tintGradient = context.createLinearGradient(0, top, 0, top + height);
  tintGradient.addColorStop(0, 'rgba(20, 30, 42, 0.42)');
  tintGradient.addColorStop(1, 'rgba(12, 20, 30, 0.56)');
  context.fillStyle = tintGradient;
  context.fillRect(left, top, width, height);

  context.restore();

  drawRoundedRectPath(context, left + 0.5, top + 0.5, width - 1, height - 1, radius - 0.5);
  context.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  context.stroke();

  drawRoundedRectPath(context, left + 1.5, top + 1.5, width - 3, height - 3, Math.max(0, radius - 1.5));
  context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  context.stroke();
}

function drawInfoBadge(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  label: string,
  value: string,
  scale: number,
) {
  const horizontalPadding = 11 * scale;
  const labelLineHeight = 11 * scale;
  const valueLineHeight = 16 * scale;
  const verticalPaddingTop = 7 * scale;
  const verticalGap = 4 * scale;
  const verticalPaddingBottom = 8 * scale;
  const height = verticalPaddingTop + labelLineHeight + verticalGap + valueLineHeight + verticalPaddingBottom;

  context.save();
  context.font = `600 ${Math.round(10 * scale)}px "JetBrains Mono", monospace, sans-serif`;
  const labelWidth = context.measureText(label).width;
  context.font = `700 ${Math.round(14 * scale)}px "JetBrains Mono", monospace, sans-serif`;
  const valueWidth = context.measureText(value).width;
  const width = Math.ceil(Math.max(labelWidth, valueWidth) + horizontalPadding * 2 + 2 * scale);

  drawGlassPanel(context, left, top, width, height, 0);

  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillStyle = 'rgba(220, 238, 252, 0.9)';
  context.font = `600 ${Math.round(10 * scale)}px "JetBrains Mono", monospace, sans-serif`;
  context.fillText(label, left + horizontalPadding, top + verticalPaddingTop);

  context.fillStyle = 'rgba(250, 252, 255, 0.98)';
  context.font = `700 ${Math.round(14 * scale)}px "JetBrains Mono", monospace, sans-serif`;
  context.fillText(value, left + horizontalPadding, top + verticalPaddingTop + labelLineHeight + verticalGap);
  context.restore();

  return { width, height };
}

function applyTopInfoBadges(
  context: CanvasRenderingContext2D,
  utcLabel: string,
  layerType: string,
  locale: ExportOverlayLocale,
  scale: number,
) {
  const left = 10 * scale;
  const top = 10 * scale;
  const gap = 8 * scale;
  const layerLabel = layerType.includes('+') ? locale.layerLabelPlural : locale.layerLabelSingle;

  const layerBadge = drawInfoBadge(context, left, top, layerLabel, layerType, scale);
  drawInfoBadge(context, left + layerBadge.width + gap, top, locale.dateUtcLabel, utcLabel, scale);
}

function buildWmsUrl(
  layer: string,
  style: string,
  bbox: string,
  width: number,
  height: number,
  isoTime: string,
) {
  return `${WMS_URL_DIRECT}?service=WMS&request=GetMap&layers=${encodeURIComponent(layer)}&styles=${encodeURIComponent(style)}&format=image/png&transparent=true&version=1.1.1&srs=EPSG:3857&bbox=${bbox}&width=${width}&height=${height}&time=${encodeURIComponent(isoTime)}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
    img.src = url;
  });
}

async function renderSatelliteFrames(options: RenderSatelliteFramesOptions): Promise<{
  width: number;
  height: number;
  files: Array<{
    descriptor: {
      kind: ExportKind;
      badge: string;
      fileBaseName: string;
      sourceCanvas: HTMLCanvasElement;
    };
    blob: Blob;
  }>;
}> {
  const {
    requestedKinds,
    map,
    mapContainer,
    currentTime,
    activeLayers,
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
    exportSolarElevation,
    mapOptions,
    language,
    map1BordersLayer,
    map1DepartmentsLayer,
    cityLoadPromise,
    getVisibleCityFeatures,
    imageFormat = 'png',
    onProgress,
  } = options;

  if (requestedKinds.length === 0) return { width: 0, height: 0, files: [] };

  const exportBounds = map.getBounds();
  const ne = L.CRS.EPSG3857.project(exportBounds.getNorthEast());
  const sw = L.CRS.EPSG3857.project(exportBounds.getSouthWest());
  const bbox = `${sw.x},${sw.y},${ne.x},${ne.y}`;
  const rect = mapContainer.getBoundingClientRect();
  const rawWidth = Math.max(64, Math.round(rect.width));
  const rawHeight = Math.max(64, Math.round(rect.height));
  const maxDimension = Math.max(64, Math.min(options.maxDimension ?? 4096, 4096));
  // Always scale to hit maxDimension on the longer side — both up and down. WMS renders the
  // requested pixel size server-side (it's not a browser canvas upscale), so this is a real
  // resolution change, not just cosmetic. A `Math.min(1, ...)` here (i.e. only ever downscaling
  // from the on-screen map container's current CSS size) meant every resolution option above the
  // container's own size behaved identically, since the container is rarely wider than ~1920px —
  // picking 2560 or 4096 silently produced the same image as 1920.
  const scale = maxDimension / Math.max(rawWidth, rawHeight);
  const width = Math.max(64, Math.round(rawWidth * scale));
  const height = Math.max(64, Math.round(rawHeight * scale));
  // Badge/watermark/city-label text is drawn at fixed pixel sizes designed for the on-screen
  // container size (rawWidth/rawHeight) — without scaling those sizes up for higher export
  // resolutions, they'd shrink to an unreadable fraction of a 4096px-wide image. Never scale
  // below 1x (that would make text bigger than the source design at low resolutions).
  const overlayScale = Math.max(1, scale);
  const isoTime = new Date(currentTime + 'Z').toISOString();
  const {
    shouldPreferIrBaseAtNight,
    rgbToIrTransition,
    effectiveRgbVisOnlyVisOpacity: exportRgbVisOnlyVisOpacity,
    effectiveHybridOnlyVisOpacity: exportHybridVisOpacity,
    effectiveHybridIrOpacity: exportHybridIrOpacity,
    effectiveCloudOnlyIrOpacity: exportCloudOnlyIrOpacity,
    cloudOnlyIrVisMaskWeight: hybridVisMaskWeight,
    rgbVisOnlyNightBrightness,
  } = computeLayerBlendState({
    activeLayers,
    rgbHdOpacity,
    sandwichOpacity,
    autoReduceVisAtNight,
    solarElevation: exportSolarElevation,
  });
  const exportUtcLabel = `${currentTime.replace('T', ' ')} UTC`;
  const exportOverlayLocale = getExportOverlayLocale(language);
  const selectedKinds = new Set(requestedKinds);

  const needsVis = selectedKinds.has('vis') || selectedKinds.has('hd') || selectedKinds.has('sandwich') || selectedKinds.has('hybrid');
  const needsRgb = selectedKinds.has('rgb') || selectedKinds.has('hd') || selectedKinds.has('hybrid');
  const needsIr = selectedKinds.has('ir')
    || selectedKinds.has('sandwich')
    || selectedKinds.has('hybrid')
    || (selectedKinds.has('hd') && activeLayers.rgb && activeLayers.vis && shouldPreferIrBaseAtNight);

  const [imgVis, imgRgb, imgIr] = await Promise.all([
    needsVis ? loadImage(buildWmsUrl(LAYER_VIS, '', bbox, width, height, isoTime)) : Promise.resolve(undefined),
    needsRgb ? loadImage(buildWmsUrl(LAYER_RGB, '', bbox, width, height, isoTime)) : Promise.resolve(undefined),
    needsIr ? loadImage(buildWmsUrl(LAYER_IR, irStyle, bbox, width, height, isoTime)) : Promise.resolve(undefined),
  ]);
  onProgress?.(25);

  const visTempCanvas = document.createElement('canvas');
  visTempCanvas.width = width;
  visTempCanvas.height = height;
  const visTempCtx = visTempCanvas.getContext('2d')!;
  visTempCtx.filter = `brightness(${visBrightness}) contrast(${visContrast})`;
  if (imgVis) {
    visTempCtx.drawImage(imgVis, 0, 0);
  }
  visTempCtx.filter = 'none';

  const visRawCanvas = document.createElement('canvas');
  visRawCanvas.width = width;
  visRawCanvas.height = height;
  const visRawCtx = visRawCanvas.getContext('2d')!;
  if (imgVis) {
    visRawCtx.drawImage(imgVis, 0, 0);
  }

  const rgbTempCanvas = document.createElement('canvas');
  rgbTempCanvas.width = width;
  rgbTempCanvas.height = height;
  const rgbTempCtx = rgbTempCanvas.getContext('2d')!;
  rgbTempCtx.filter = `saturate(${Math.round(rgbSaturation * 100)}%)`;
  if (imgRgb) {
    rgbTempCtx.drawImage(imgRgb, 0, 0);
  }
  rgbTempCtx.filter = 'none';

  const rgbRawCanvas = document.createElement('canvas');
  rgbRawCanvas.width = width;
  rgbRawCanvas.height = height;
  const rgbRawCtx = rgbRawCanvas.getContext('2d')!;
  if (imgRgb) {
    rgbRawCtx.drawImage(imgRgb, 0, 0);
  }

  const irTempCanvas = document.createElement('canvas');
  irTempCanvas.width = width;
  irTempCanvas.height = height;
  const irTempCtx = irTempCanvas.getContext('2d')!;
  if (imgIr) {
    irTempCtx.drawImage(imgIr, 0, 0);
  }

  const composeVisOverlayCanvas = (
    baseCanvas: HTMLCanvasElement,
    overlayOpacity: number,
    blendMode: GlobalCompositeOperation,
  ) => {
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputCtx = outputCanvas.getContext('2d')!;

    outputCtx.drawImage(baseCanvas, 0, 0);
    outputCtx.globalCompositeOperation = blendMode;
    outputCtx.globalAlpha = overlayOpacity;
    outputCtx.drawImage(visTempCanvas, 0, 0);
    outputCtx.globalCompositeOperation = 'source-over';
    outputCtx.globalAlpha = 1;

    return outputCanvas;
  };

  const createCloudOnlyIrCanvas = (
    visMaskData: Uint8ClampedArray,
    rgbMaskData: Uint8ClampedArray | null,
    irData: Uint8ClampedArray,
    visMaskWeight: number,
    overlayOpacity: number,
  ) => {
    const cloudOnlyIrCanvas = document.createElement('canvas');
    cloudOnlyIrCanvas.width = width;
    cloudOnlyIrCanvas.height = height;
    const cloudOnlyIrCtx = cloudOnlyIrCanvas.getContext('2d')!;
    const cloudOnlyIrImage = cloudOnlyIrCtx.createImageData(width, height);
    cloudOnlyIrImage.data.set(
      computeCloudOnlyIrRgba(visMaskData, rgbMaskData, irData, { visMaskWeight, alphaMultiplier: overlayOpacity }),
    );

    cloudOnlyIrCtx.putImageData(cloudOnlyIrImage, 0, 0);
    return cloudOnlyIrCanvas;
  };

  const shouldExportHd = selectedKinds.has('hd') && activeLayers.rgb && activeLayers.vis;
  const shouldExportSandwich = selectedKinds.has('sandwich') && activeLayers.ir && activeLayers.vis;
  const shouldExportHybrid = selectedKinds.has('hybrid') && activeLayers.rgb && activeLayers.vis && activeLayers.ir;
  const exportRgbModeBaseCanvas = shouldPreferIrBaseAtNight && imgIr ? irTempCanvas : rgbTempCanvas;
  // Unfiltered base for the 'hd' (RGB+VIS) export below: it needs to apply the RGB_VIS_FUSION
  // boost on top of the RAW image, matching the live view's single-pass filter. Reusing
  // rgbTempCanvas/visTempCanvas (already filtered once for the plain 'rgb'/'vis' exports) here
  // would filter twice, squaring the saturation/contrast boost and making the export visibly
  // darker/harsher than the live view for the same slider settings — this was a real bug.
  const exportRgbModeRawBaseCanvas = shouldPreferIrBaseAtNight && imgIr ? irTempCanvas : rgbRawCanvas;
  const visRawData = imgVis ? visRawCtx.getImageData(0, 0, width, height).data : null;
  const rgbRawData = imgRgb ? rgbRawCtx.getImageData(0, 0, width, height).data : null;
  const irRawData = imgIr ? irTempCtx.getImageData(0, 0, width, height).data : null;

  const rgbHdCanvas = shouldExportHd ? (() => {
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputCtx = outputCanvas.getContext('2d')!;

    outputCtx.filter = `saturate(${Math.round(rgbSaturation * RGB_VIS_FUSION.rgbSaturationBoost * 100)}%) brightness(${Math.round(rgbVisOnlyNightBrightness * RGB_VIS_FUSION.rgbBrightnessBoost * 100)}%)`;
    outputCtx.drawImage(exportRgbModeRawBaseCanvas, 0, 0);
    outputCtx.filter = 'none';
    if (imgVis) {
      outputCtx.filter = `brightness(${Math.min(2, visBrightness * RGB_VIS_FUSION.visBrightnessBoost)}) contrast(${Math.min(2.4, visContrast * RGB_VIS_FUSION.visContrastBoost)})`;
      outputCtx.globalCompositeOperation = 'luminosity';
      outputCtx.globalAlpha = exportRgbVisOnlyVisOpacity;
      outputCtx.drawImage(visRawCanvas, 0, 0);
      outputCtx.globalCompositeOperation = 'source-over';
      outputCtx.globalAlpha = 1;
      outputCtx.filter = 'none';
    }

    return hdEnhanceEnabled
      ? applyHdEnhancement(outputCanvas, {
        strength: hdEnhanceStrength,
        sharpen: hdEnhanceSharpen,
        radius: hdEnhanceRadius,
        localContrast: hdEnhanceLocalContrast,
        highlightProtection: hdEnhanceHighlightProtection,
        saturationAdjust: hdEnhanceSaturationAdjust,
        noiseReduction: hdEnhanceNoiseReduction,
        shadowProtection: hdEnhanceShadowProtection,
        preset: hdEnhancePreset,
      })
      : outputCanvas;
  })() : null;
  const sandwichCanvas = shouldExportSandwich && visRawData && irRawData ? (() => {
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputCtx = outputCanvas.getContext('2d')!;

    outputCtx.drawImage(visTempCanvas, 0, 0);
    const cloudOnlyIrCanvas = createCloudOnlyIrCanvas(visRawData, null, irRawData, 1, sandwichOpacity);
    outputCtx.globalCompositeOperation = 'color';
    outputCtx.drawImage(cloudOnlyIrCanvas, 0, 0);
    outputCtx.globalCompositeOperation = 'source-over';
    outputCtx.globalAlpha = 1;
    return outputCanvas;
  })() : null;
  const hybridCanvas = shouldExportHybrid ? (() => {
    const outputCanvas = composeVisOverlayCanvas(exportRgbModeBaseCanvas, exportHybridVisOpacity, 'luminosity');
    const outputCtx = outputCanvas.getContext('2d')!;
    if (!visRawData || !rgbRawData || !irRawData) {
      return outputCanvas;
    }

    const cloudOnlyIrCanvas = createCloudOnlyIrCanvas(
      visRawData,
      rgbRawData,
      irRawData,
      hybridVisMaskWeight,
      exportCloudOnlyIrOpacity,
    );
    outputCtx.globalCompositeOperation = 'color';
    outputCtx.drawImage(cloudOnlyIrCanvas, 0, 0);
    outputCtx.globalCompositeOperation = 'source-over';
    outputCtx.globalAlpha = 1;
    return outputCanvas;
  })() : null;

  const drawOverlays = async (context: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) => {
    const drawGeoJsonFeatures = (geoJsonData: any, strokeStyle: string, lineWidth: number) => {
      const drawLineString = (coords: any[]) => {
        coords.forEach((coord, index) => {
          const projected = L.CRS.EPSG3857.project(L.latLng(coord[1], coord[0]));
          const xPercentage = (projected.x - sw.x) / (ne.x - sw.x);
          const yPercentage = (ne.y - projected.y) / (ne.y - sw.y);
          const canvasX = xPercentage * canvasWidth;
          const canvasY = yPercentage * canvasHeight;
          if (index === 0) context.moveTo(canvasX, canvasY);
          else context.lineTo(canvasX, canvasY);
        });
      };

      geoJsonData.features?.forEach((feature: any) => {
        if (feature.geometry.type === 'Polygon') {
          feature.geometry.coordinates.forEach(drawLineString);
        } else if (feature.geometry.type === 'MultiPolygon') {
          feature.geometry.coordinates.forEach((polygon: any[]) => {
            polygon.forEach(drawLineString);
          });
        } else if (feature.geometry.type === 'LineString') {
          drawLineString(feature.geometry.coordinates);
        }
      });

      context.stroke();
    };

    if (mapOptions.showBorders && map1BordersLayer) {
      const data = map1BordersLayer.toGeoJSON() as any;
      const bordersOpacity = Math.max(0, Math.min(1, mapOptions.bordersOpacity));
      context.save();
      context.strokeStyle = `rgba(255, 255, 255, ${bordersOpacity})`;
      context.lineWidth = Math.max(1, Math.round(canvasWidth / rect.width));
      context.beginPath();
      drawGeoJsonFeatures(data, `rgba(255, 255, 255, ${bordersOpacity})`, Math.max(1, Math.round(canvasWidth / rect.width)));
      context.restore();
    }

    if (mapOptions.showFranceDepartments && map1DepartmentsLayer) {
      const data = map1DepartmentsLayer.toGeoJSON() as any;
      const departmentsOpacity = Math.max(0, Math.min(1, mapOptions.franceDepartmentsOpacity));
      context.save();
      context.strokeStyle = `rgba(200, 220, 255, ${departmentsOpacity})`;
      context.lineWidth = Math.max(0.5, Math.round(canvasWidth / rect.width) * 0.6);
      context.beginPath();
      drawGeoJsonFeatures(data, `rgba(200, 220, 255, ${departmentsOpacity})`, Math.max(0.5, Math.round(canvasWidth / rect.width) * 0.6));
      context.restore();
    }

    if (mapOptions.showCities) {
      if (cityLoadPromise) {
        await cityLoadPromise;
      }
      const zoom = Math.round(map.getZoom());
      const visibleCities = getVisibleCityFeatures(map.getBounds(), zoom);
      const dotRadius = (zoom >= 8 ? 2.5 : zoom >= 6 ? 2 : 1.5) * overlayScale;
      const cityFontSize = Math.round((zoom >= 8 ? 13 : zoom >= 6 ? 12 : 11) * overlayScale);
      context.save();
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.shadowColor = 'rgba(0, 0, 0, 0.9)';
      context.shadowBlur = 4 * overlayScale;
      context.font = `${cityFontSize}px "Inter", sans-serif`;

      visibleCities.forEach((feature) => {
        const [lng, lat] = feature.geometry.coordinates;
        const name = feature.properties.NAME ?? feature.properties.NAMEASCII;
        if (!name) return;

        const projected = L.CRS.EPSG3857.project(L.latLng(lat, lng));
        const xPercentage = (projected.x - sw.x) / (ne.x - sw.x);
        const yPercentage = (ne.y - projected.y) / (ne.y - sw.y);
        const canvasX = xPercentage * canvasWidth;
        const canvasY = yPercentage * canvasHeight;

        if (canvasX >= 0 && canvasX <= canvasWidth && canvasY >= 0 && canvasY <= canvasHeight) {
          context.beginPath();
          context.arc(canvasX, canvasY, dotRadius, 0, Math.PI * 2);
          context.fillStyle = 'rgba(255, 255, 255, 0.95)';
          context.fill();

          context.fillStyle = 'rgba(255, 255, 255, 0.88)';
          context.fillText(name, canvasX + 4 * overlayScale, canvasY);
        }
      });

      context.restore();
    }
  };

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = width;
  overlayCanvas.height = height;
  const overlayCtx = overlayCanvas.getContext('2d')!;
  await drawOverlays(overlayCtx, width, height);
  onProgress?.(45);

  const mimeType = imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
  const getBlob = async (canvasObj: HTMLCanvasElement, layerType: string): Promise<Blob> => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;

    if (imageFormat === 'jpeg') {
      // JPEG has no alpha channel: fill an opaque background first so any transparent edge
      // (e.g. panned past WMS coverage) doesn't get an inconsistent browser-dependent color.
      tempCtx.fillStyle = '#05070c';
      tempCtx.fillRect(0, 0, width, height);
    }
    tempCtx.drawImage(canvasObj, 0, 0);
    tempCtx.drawImage(overlayCanvas, 0, 0);
    applyTopInfoBadges(tempCtx, exportUtcLabel, layerType, exportOverlayLocale, overlayScale);
    applyWatermark(tempCtx, width, height, exportOverlayLocale, overlayScale);

    return new Promise((resolve, reject) => {
      tempCanvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to generate image blob'));
      }, mimeType, imageFormat === 'jpeg' ? 0.92 : undefined);
    });
  };

  const exportDescriptors: Array<{
    kind: ExportKind;
    badge: string;
    fileBaseName: string;
    sourceCanvas: HTMLCanvasElement;
  }> = [];

  requestedKinds.forEach((kind) => {
    if (kind === 'vis' && needsVis) {
      exportDescriptors.push({ kind: 'vis', badge: getExportBadge('vis', hdEnhanceEnabled), fileBaseName: getExportFileBaseName('vis', hdEnhanceEnabled), sourceCanvas: visTempCanvas });
      return;
    }
    if (kind === 'rgb' && needsRgb) {
      exportDescriptors.push({ kind: 'rgb', badge: getExportBadge('rgb', hdEnhanceEnabled), fileBaseName: getExportFileBaseName('rgb', hdEnhanceEnabled), sourceCanvas: rgbTempCanvas });
      return;
    }
    if (kind === 'ir' && needsIr) {
      exportDescriptors.push({ kind: 'ir', badge: getExportBadge('ir', hdEnhanceEnabled), fileBaseName: getExportFileBaseName('ir', hdEnhanceEnabled), sourceCanvas: irTempCanvas });
      return;
    }
    if (kind === 'hd' && rgbHdCanvas) {
      exportDescriptors.push({
        kind: 'hd',
        badge: getExportBadge('hd', hdEnhanceEnabled),
        fileBaseName: getExportFileBaseName('hd', hdEnhanceEnabled),
        sourceCanvas: rgbHdCanvas,
      });
      return;
    }
    if (kind === 'sandwich' && sandwichCanvas) {
      exportDescriptors.push({ kind: 'sandwich', badge: getExportBadge('sandwich', hdEnhanceEnabled), fileBaseName: getExportFileBaseName('sandwich', hdEnhanceEnabled), sourceCanvas: sandwichCanvas });
      return;
    }
    if (kind === 'hybrid' && hybridCanvas) {
      exportDescriptors.push({ kind: 'hybrid', badge: getExportBadge('hybrid', hdEnhanceEnabled), fileBaseName: getExportFileBaseName('hybrid', hdEnhanceEnabled), sourceCanvas: hybridCanvas });
    }
  });

  const selectedDescriptors = exportDescriptors;
  const generatedFiles: Array<{
    descriptor: (typeof selectedDescriptors)[number];
    blob: Blob;
  }> = [];
  for (let index = 0; index < selectedDescriptors.length; index += 1) {
    const descriptor = selectedDescriptors[index];
    const blob = await getBlob(descriptor.sourceCanvas, descriptor.badge);
    generatedFiles.push({ descriptor, blob });
    if (onProgress) {
      onProgress(45 + Math.round(((index + 1) / selectedDescriptors.length) * 45));
    }
  }

  return { width, height, files: generatedFiles };
}

export async function downloadSatellitePack(options: DownloadSatellitePackOptions): Promise<void> {
  const { saveAs } = await import('file-saver');
  const { onProgress, imageFormat = 'png', maxDimension = 4096 } = options;
  const extension = imageFormat === 'jpeg' ? 'jpg' : 'png';

  const { width, height, files: generatedFiles } = await renderSatelliteFrames({
    ...options,
    maxDimension,
  });

  if (generatedFiles.length === 0) {
    return;
  }

  const safeTimeStr = options.currentTime.replace('T', '_').replace(/:/g, '-');
  const resolutionStr = `${width}x${height}`;

  // A single selected export doesn't need a ZIP wrapper — save the image directly.
  if (generatedFiles.length === 1) {
    const { descriptor, blob } = generatedFiles[0];
    saveAs(blob, `${descriptor.fileBaseName}_${resolutionStr}_${safeTimeStr}.${extension}`);
    onProgress?.(100);
    return;
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  generatedFiles.forEach(({ descriptor, blob }, index) => {
    zip.file(`${index + 1}_${descriptor.fileBaseName}_${resolutionStr}_${safeTimeStr}.${extension}`, blob);
  });

  const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    onProgress?.(90 + Math.round((metadata.percent / 100) * 10));
  });
  saveAs(zipBlob, `MTG_SATELLITE_PACK_${resolutionStr}_${safeTimeStr}.zip`);
  onProgress?.(100);
}

/**
 * Renders small, fast preview thumbnails for the given export kinds (same rendering pipeline
 * and blend math as the real export, just at a much smaller `maxDimension`), so the download
 * modal can show what each selected format will actually look like before committing to a
 * full-resolution render.
 */
export async function generateExportPreviews(
  options: Omit<DownloadSatellitePackOptions, 'onProgress' | 'maxDimension' | 'imageFormat'>,
): Promise<Array<{ kind: ExportKind; url: string }>> {
  const { files } = await renderSatelliteFrames({ ...options, maxDimension: 360 });
  return files.map(({ descriptor, blob }) => ({ kind: descriptor.kind, url: URL.createObjectURL(blob) }));
}

export async function exportAnimationGif(options: ExportAnimationGifOptions): Promise<Blob> {
  const {
    frameTimes,
    fps,
    kind,
    onProgress,
    colorCount = 128,
    paletteMode = 'per-frame',
    ditherLevel = 'none',
    finalPauseMs = 0,
    maxDimension = 1280,
    ...shared
  } = options;

  if (frameTimes.length === 0) {
    throw new Error('No frame times provided for GIF export');
  }

  const frameDelay = Math.max(40, Math.round(1000 / Math.max(1, fps)));
  const safeFinalPauseMs = Math.max(100, Math.min(2000, Math.round(finalPauseMs / 100) * 100));
  const gif = GIFEncoder();
  const scratchCanvas = document.createElement('canvas');
  const scratchCtx = scratchCanvas.getContext('2d');
  if (!scratchCtx) {
    throw new Error('Cannot create GIF rendering context');
  }

  let targetWidth = 0;
  let targetHeight = 0;
  const frameBlobs: Blob[] = [];

  for (let index = 0; index < frameTimes.length; index += 1) {
    const time = frameTimes[index];
    const frame = await renderSatelliteFrames({
      ...shared,
      currentTime: time,
      requestedKinds: [kind],
      maxDimension,
    });

    if (frame.files.length === 0) {
      throw new Error(`No render output for frame at ${time}`);
    }

    frameBlobs.push(frame.files[0].blob);

    if (onProgress) {
      onProgress(Math.round(((index + 1) / frameTimes.length) * 45));
    }
  }

  if (frameBlobs.length === 0) {
    throw new Error('No rendered frames available for GIF export');
  }

  const safeColorCount = Math.max(16, Math.min(256, Math.round(colorCount)));
  let globalPalette: number[][] | null = null;

  const firstFrameBitmap = await createImageBitmap(frameBlobs[0]);
  targetWidth = firstFrameBitmap.width;
  targetHeight = firstFrameBitmap.height;
  scratchCanvas.width = targetWidth;
  scratchCanvas.height = targetHeight;
  firstFrameBitmap.close();

  if (paletteMode === 'global') {
    const sampledChunks: Uint8Array[] = [];
    const maxSampledPixels = 240000;
    const targetPixelsPerFrame = Math.max(4000, Math.round(maxSampledPixels / frameBlobs.length));

    for (let index = 0; index < frameBlobs.length; index += 1) {
      const frameBitmap = await createImageBitmap(frameBlobs[index]);
      scratchCtx.clearRect(0, 0, targetWidth, targetHeight);
      scratchCtx.drawImage(frameBitmap, 0, 0, targetWidth, targetHeight);
      const rgba = scratchCtx.getImageData(0, 0, targetWidth, targetHeight).data;
      sampledChunks.push(sampleRgbaPixels(rgba, targetPixelsPerFrame));
      frameBitmap.close();

      if (onProgress) {
        const samplingProgress = Math.round(((index + 1) / frameBlobs.length) * 15);
        onProgress(45 + samplingProgress);
      }
    }

    const sampledLength = sampledChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const sampledData = new Uint8Array(sampledLength);
    let cursor = 0;
    sampledChunks.forEach((chunk) => {
      sampledData.set(chunk, cursor);
      cursor += chunk.length;
    });

    globalPalette = quantize(sampledData, safeColorCount, { format: 'rgb565' });
  }

  for (let index = 0; index < frameBlobs.length; index += 1) {
    const frameBitmap = await createImageBitmap(frameBlobs[index]);

    if (frameBitmap.width !== targetWidth || frameBitmap.height !== targetHeight) {
      frameBitmap.close();
      throw new Error('Inconsistent frame size during GIF export');
    }

    scratchCtx.clearRect(0, 0, targetWidth, targetHeight);
    scratchCtx.drawImage(frameBitmap, 0, 0, targetWidth, targetHeight);
    const rgba = scratchCtx.getImageData(0, 0, targetWidth, targetHeight).data;
    const palette = globalPalette ?? quantize(rgba, safeColorCount, { format: 'rgb565' });
    const indexedPixels = applyPaletteWithDithering(rgba, palette, targetWidth, targetHeight, ditherLevel);

    gif.writeFrame(indexedPixels, targetWidth, targetHeight, {
      palette: globalPalette ? (index === 0 ? palette : undefined) : palette,
      delay: index === frameBlobs.length - 1 ? frameDelay + safeFinalPauseMs : frameDelay,
      repeat: index === 0 ? 0 : undefined,
    });

    frameBitmap.close();

    if (onProgress) {
      const encodeProgress = Math.round(((index + 1) / frameBlobs.length) * 40);
      onProgress(60 + encodeProgress);
    }
  }

  gif.finish();
  return new Blob([gif.bytesView()], { type: 'image/gif' });
}