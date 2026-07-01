import L from 'leaflet';

import {
  getDaylightVisFactor,
  LAYER_IR,
  LAYER_RGB,
  LAYER_VIS,
  type ActiveLayers,
  type CityFeature,
  type ExportKind,
  type IrStyle,
  type MapOptions,
  WMS_URL_PROXY,
} from './dualMapViewerShared';
import type { Language } from './i18n';

type DownloadSatellitePackOptions = {
  requestedKinds: ExportKind[];
  map: L.Map;
  mapContainer: HTMLDivElement;
  currentTime: string;
  activeLayers: ActiveLayers;
  irStyle: IrStyle;
  visBrightness: number;
  visContrast: number;
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
};

type ExportOverlayLocale = {
  watermarkText: string;
  layerLabelSingle: string;
  layerLabelPlural: string;
  dateUtcLabel: string;
};

function getExportOverlayLocale(language: Language): ExportOverlayLocale {
  if (language === 'en') {
    return {
      watermarkText: 'Source: EUMETSAT / MTG | MTG-RGB-HD by Quentin Rey',
      layerLabelSingle: 'LAYER',
      layerLabelPlural: 'LAYERS',
      dateUtcLabel: 'UTC DATE',
    };
  }

  return {
    watermarkText: 'Sources: EUMETSAT / MTG | MTG-RGB-HD par Quentin Rey',
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
) {
  const text = locale.watermarkText;
  const horizontalPadding = 12;
  const badgeHeight = 28;

  context.save();
  context.font = '600 11px "JetBrains Mono", monospace, sans-serif';
  const badgeWidth = Math.ceil(context.measureText(text).width + horizontalPadding * 2);
  const left = width - badgeWidth - 10;
  const top = height - badgeHeight - 10;

  drawGlassPanel(context, left, top, badgeWidth, badgeHeight, 0);

  context.fillStyle = 'rgba(245, 250, 255, 0.96)';
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  context.fillText(text, width - 10 - horizontalPadding, top + badgeHeight / 2 + 0.5);
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
) {
  const horizontalPadding = 11;
  const labelLineHeight = 11;
  const valueLineHeight = 16;
  const verticalPaddingTop = 7;
  const verticalGap = 4;
  const verticalPaddingBottom = 8;
  const height = verticalPaddingTop + labelLineHeight + verticalGap + valueLineHeight + verticalPaddingBottom;

  context.save();
  context.font = '600 10px "JetBrains Mono", monospace, sans-serif';
  const labelWidth = context.measureText(label).width;
  context.font = '700 14px "JetBrains Mono", monospace, sans-serif';
  const valueWidth = context.measureText(value).width;
  const width = Math.ceil(Math.max(labelWidth, valueWidth) + horizontalPadding * 2 + 2);

  drawGlassPanel(context, left, top, width, height, 0);

  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillStyle = 'rgba(220, 238, 252, 0.9)';
  context.font = '600 10px "JetBrains Mono", monospace, sans-serif';
  context.fillText(label, left + horizontalPadding, top + verticalPaddingTop);

  context.fillStyle = 'rgba(250, 252, 255, 0.98)';
  context.font = '700 14px "JetBrains Mono", monospace, sans-serif';
  context.fillText(value, left + horizontalPadding, top + verticalPaddingTop + labelLineHeight + verticalGap);
  context.restore();

  return { width, height };
}

function applyTopInfoBadges(
  context: CanvasRenderingContext2D,
  utcLabel: string,
  layerType: string,
  locale: ExportOverlayLocale,
) {
  const left = 10;
  const top = 10;
  const gap = 8;
  const layerLabel = layerType.includes('+') ? locale.layerLabelPlural : locale.layerLabelSingle;

  const layerBadge = drawInfoBadge(context, left, top, layerLabel, layerType);
  drawInfoBadge(context, left + layerBadge.width + gap, top, locale.dateUtcLabel, utcLabel);
}

function buildWmsUrl(
  layer: string,
  style: string,
  bbox: string,
  width: number,
  height: number,
  isoTime: string,
) {
  return `${WMS_URL_PROXY}?service=WMS&request=GetMap&layers=${encodeURIComponent(layer)}&styles=${encodeURIComponent(style)}&format=image/png&transparent=true&version=1.1.1&srs=EPSG:3857&bbox=${bbox}&width=${width}&height=${height}&time=${encodeURIComponent(isoTime)}`;
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

export async function downloadSatellitePack(options: DownloadSatellitePackOptions): Promise<void> {
  const {
    requestedKinds,
    map,
    mapContainer,
    currentTime,
    activeLayers,
    irStyle,
    visBrightness,
    visContrast,
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
  } = options;

  if (requestedKinds.length === 0) return;

  const [{ default: JSZip }, { saveAs }] = await Promise.all([
    import('jszip'),
    import('file-saver'),
  ]);

  const exportBounds = map.getBounds();
  const ne = L.CRS.EPSG3857.project(exportBounds.getNorthEast());
  const sw = L.CRS.EPSG3857.project(exportBounds.getSouthWest());
  const bbox = `${sw.x},${sw.y},${ne.x},${ne.y}`;
  const rect = mapContainer.getBoundingClientRect();
  const width = Math.min(Math.round(rect.width), 4096);
  const height = Math.min(Math.round(rect.height), 4096);
  const isoTime = new Date(currentTime + 'Z').toISOString();
  const visNightFactor = autoReduceVisAtNight && activeLayers.vis && activeLayers.ir
    ? getDaylightVisFactor(exportSolarElevation)
    : 1;
  const daylightVisFactor = Math.max(0, Math.min(1, getDaylightVisFactor(exportSolarElevation)));
  const hybridVisNightFactor = Math.pow(visNightFactor, 1.6);
  const hybridVisOpacityCap = 0.48 + daylightVisFactor * 0.14;
  const rgbVisOnlyOpacityCap = 0.60 + daylightVisFactor * 0.15;
  const rgbVisOnlyNightFactor = Math.max(0.7, visNightFactor);
  const exportRgbVisOnlyVisOpacity = Math.min(rgbHdOpacity * rgbVisOnlyNightFactor, rgbVisOnlyOpacityCap);
  const exportHybridVisOpacity = Math.min(rgbHdOpacity * hybridVisNightFactor, hybridVisOpacityCap);
  const exportHybridIrOpacity = sandwichOpacity;
  const rgbToIrTransition = activeLayers.rgb && activeLayers.ir
    ? Math.max(0, Math.min(1, (1.5 - exportSolarElevation) / 12))
    : 0;
  const hybridVisMaskWeight = Math.min(0.35, Math.max(0, (daylightVisFactor - 0.35) / 0.65));
  const shouldPreferIrBaseAtNight = activeLayers.rgb && (activeLayers.vis || activeLayers.ir) && exportSolarElevation < 1.5;
  const isRgbExportBase = !shouldPreferIrBaseAtNight;
  const exportCloudOnlyIrOpacity = isRgbExportBase
    ? exportHybridIrOpacity * (1 - rgbToIrTransition)
    : 0;
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
    const cloudOnlyIrData = cloudOnlyIrImage.data;

    const normalizedVisWeight = Math.max(0, Math.min(1, visMaskWeight));
    const visThresholdBase = 90;
    const visThresholdSpan = 100;
    const rgbThresholdBase = 120;
    const rgbThresholdSpan = 90;

    for (let i = 0; i < cloudOnlyIrData.length; i += 4) {
      const visLum = (visMaskData[i] + visMaskData[i + 1] + visMaskData[i + 2]) / 3;
      const rgbLum = rgbMaskData
        ? (rgbMaskData[i] + rgbMaskData[i + 1] + rgbMaskData[i + 2]) / 3
        : visLum;

      const visCloudMask = Math.min(1, Math.max(0, (visLum - visThresholdBase) / visThresholdSpan));
      const rgbCloudMask = Math.min(1, Math.max(0, (rgbLum - rgbThresholdBase) / rgbThresholdSpan));
      const refinedCloudMask = rgbCloudMask * (1 - normalizedVisWeight) + visCloudMask * normalizedVisWeight;
      const rgbFloorFactor = (1 - normalizedVisWeight) * 0.85;
      const cloudMask = Math.max(rgbCloudMask * rgbFloorFactor, refinedCloudMask);

      if (cloudMask < 0.02) {
        cloudOnlyIrData[i + 3] = 0;
        continue;
      }

      const irR = irData[i];
      const irG = irData[i + 1];
      const irB = irData[i + 2];
      const mean = (irR + irG + irB) / 3;
      const satBoost = 1.2;

      cloudOnlyIrData[i] = Math.max(0, Math.min(255, mean + (irR - mean) * satBoost));
      cloudOnlyIrData[i + 1] = Math.max(0, Math.min(255, mean + (irG - mean) * satBoost));
      cloudOnlyIrData[i + 2] = Math.max(0, Math.min(255, mean + (irB - mean) * satBoost));
      cloudOnlyIrData[i + 3] = Math.round(255 * cloudMask * overlayOpacity);
    }

    cloudOnlyIrCtx.putImageData(cloudOnlyIrImage, 0, 0);
    return cloudOnlyIrCanvas;
  };

  const shouldExportHd = selectedKinds.has('hd') && activeLayers.rgb && activeLayers.vis;
  const shouldExportSandwich = selectedKinds.has('sandwich') && activeLayers.ir && activeLayers.vis;
  const shouldExportHybrid = selectedKinds.has('hybrid') && activeLayers.rgb && activeLayers.vis && activeLayers.ir;
  const exportRgbModeBaseCanvas = shouldPreferIrBaseAtNight && imgIr ? irTempCanvas : rgbTempCanvas;
  const visRawData = imgVis ? visRawCtx.getImageData(0, 0, width, height).data : null;
  const rgbRawData = imgRgb ? rgbRawCtx.getImageData(0, 0, width, height).data : null;
  const irRawData = imgIr ? irTempCtx.getImageData(0, 0, width, height).data : null;

  const rgbHdCanvas = shouldExportHd ? (() => {
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputCtx = outputCanvas.getContext('2d')!;

    outputCtx.filter = `saturate(${Math.round(rgbSaturation * 130)}%) brightness(110%)`;
    outputCtx.drawImage(exportRgbModeBaseCanvas, 0, 0);
    outputCtx.filter = `brightness(${Math.min(2, visBrightness * 1.15)}) contrast(${Math.min(2.4, visContrast * 1.15)})`;
    outputCtx.globalCompositeOperation = 'luminosity';
    outputCtx.globalAlpha = Math.min(0.7, exportRgbVisOnlyVisOpacity);
    outputCtx.drawImage(visTempCanvas, 0, 0);
    outputCtx.globalCompositeOperation = 'source-over';
    outputCtx.globalAlpha = 1;
    outputCtx.filter = 'none';

    return outputCanvas;
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
      context.save();
      context.fillStyle = 'rgba(255, 255, 255, 0.88)';
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.shadowColor = 'rgba(0, 0, 0, 0.9)';
      context.shadowBlur = 4;
      context.font = zoom >= 8 ? '13px "Inter", sans-serif' : zoom >= 6 ? '12px "Inter", sans-serif' : '11px "Inter", sans-serif';

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
          context.fillText(name, canvasX + 4, canvasY);
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

  const getBlob = async (canvasObj: HTMLCanvasElement, layerType: string): Promise<Blob> => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;

    tempCtx.drawImage(canvasObj, 0, 0);
    tempCtx.drawImage(overlayCanvas, 0, 0);
    applyTopInfoBadges(tempCtx, exportUtcLabel, layerType, exportOverlayLocale);
    applyWatermark(tempCtx, width, height, exportOverlayLocale);

    return new Promise((resolve, reject) => {
      tempCanvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to generate PNG blob'));
      }, 'image/png');
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
      exportDescriptors.push({ kind: 'vis', badge: 'VIS', fileBaseName: 'VIS_0.6', sourceCanvas: visTempCanvas });
      return;
    }
    if (kind === 'rgb' && needsRgb) {
      exportDescriptors.push({ kind: 'rgb', badge: 'RGB', fileBaseName: 'RGB_TRUE_COLOR', sourceCanvas: rgbTempCanvas });
      return;
    }
    if (kind === 'ir' && needsIr) {
      exportDescriptors.push({ kind: 'ir', badge: 'IR10.5', fileBaseName: 'IR10.5', sourceCanvas: irTempCanvas });
      return;
    }
    if (kind === 'hd' && rgbHdCanvas) {
      exportDescriptors.push({ kind: 'hd', badge: 'RGB+VIS HD', fileBaseName: 'RGB_VIS_HD', sourceCanvas: rgbHdCanvas });
      return;
    }
    if (kind === 'sandwich' && sandwichCanvas) {
      exportDescriptors.push({ kind: 'sandwich', badge: 'SANDWICH(IR)', fileBaseName: 'SANDWICH_IR_VIS', sourceCanvas: sandwichCanvas });
      return;
    }
    if (kind === 'hybrid' && hybridCanvas) {
      exportDescriptors.push({ kind: 'hybrid', badge: 'VIS+RGB+SANDWICH', fileBaseName: 'VIS_RGB_SANDWICH', sourceCanvas: hybridCanvas });
    }
  });

  const selectedDescriptors = exportDescriptors;
  const generatedFiles = await Promise.all(
    selectedDescriptors.map(async (descriptor) => ({
      descriptor,
      blob: await getBlob(descriptor.sourceCanvas, descriptor.badge),
    })),
  );

  const safeTimeStr = currentTime.replace('T', '_').replace(/:/g, '-');
  const zip = new JSZip();
  generatedFiles.forEach(({ descriptor, blob }, index) => {
    zip.file(`${index + 1}_${descriptor.fileBaseName}_${safeTimeStr}.png`, blob);
  });

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(zipBlob, `MTG_SATELLITE_PACK_${safeTimeStr}.zip`);
}