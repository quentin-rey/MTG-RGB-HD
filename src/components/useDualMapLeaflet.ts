import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

import {
  type ActiveLayers,
  CITY_GEOJSON_URL,
  DEFAULT_FRANCE_BOUNDS,
  DEFAULT_MAP_CENTER,
  FRANCE_DEPARTMENTS_GEOJSON_URL,
  getDaylightVisFactor,
  getSolarElevation,
  LAYER_IR,
  LAYER_RGB,
  LAYER_VIS,
  WMS_URL_DIRECT,
  type CityFeature,
  type IrStyle,
  type MapViewState,
  type MapOptions,
} from './dualMapViewerShared';

type UseDualMapLeafletArgs = {
  currentTime: string;
  activeLayers: ActiveLayers;
  irStyle: IrStyle;
  rgbHdOpacity: number;
  sandwichOpacity: number;
  autoReduceVisAtNight: boolean;
  mapOptions: MapOptions;
  initialMapView: MapViewState | null;
  onMapViewChange: (mapView: MapViewState) => void;
};

export function useDualMapLeaflet(args: UseDualMapLeafletArgs) {
  const {
    currentTime,
    activeLayers,
    irStyle,
    rgbHdOpacity,
    sandwichOpacity,
    autoReduceVisAtNight,
    mapOptions,
    initialMapView,
    onMapViewChange,
  } = args;

  const map1Ref = useRef<HTMLDivElement>(null);
  const map2Ref = useRef<HTMLDivElement>(null);
  const map1Instance = useRef<L.Map | null>(null);
  const map2Instance = useRef<L.Map | null>(null);
  const secondaryBaseLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const irFallbackBaseLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const visOverlayLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const irOverlayLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const irCloudOnlyLayerRef = useRef<L.GridLayer | null>(null);
  const map1BordersRef = useRef<L.GeoJSON | null>(null);
  const map2BordersRef = useRef<L.GeoJSON | null>(null);
  const map1DepartmentsRef = useRef<L.GeoJSON | null>(null);
  const map2DepartmentsRef = useRef<L.GeoJSON | null>(null);
  const map2CitiesRef = useRef<L.LayerGroup | null>(null);
  const cityFeaturesRef = useRef<CityFeature[] | null>(null);
  const cityLoadPromiseRef = useRef<Promise<void> | null>(null);
  const departmentsLoadPromiseRef = useRef<Promise<void> | null>(null);
  const isSyncing = useRef(false);
  const overlayFadeInTimeoutRef = useRef<number | null>(null);
  const overlayFadeOutTimeoutRef = useRef<number | null>(null);
  const pendingTilesRef = useRef(0);
  const startedTilesRef = useRef(0);
  const completedTilesRef = useRef(0);
  const activeLayerLoadsRef = useRef(0);
  const mapIsLoadingRef = useRef(false);
  const loadingIdleTimeoutRef = useRef<number | null>(null);
  const loadingNoStartTimeoutRef = useRef<number | null>(null);
  const loadingCycleRef = useRef(0);
  const hybridTileCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const hybridTileCacheOrderRef = useRef<string[]>([]);
  const initialMapViewRef = useRef<MapViewState | null>(initialMapView);
  const onMapViewChangeRef = useRef(onMapViewChange);

  const [mapsReady, setMapsReady] = useState(false);
  const [isMapLoading, setIsMapLoading] = useState(true);
  const [loadingTileCount, setLoadingTileCount] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [viewportCenter, setViewportCenter] = useState<{ lat: number; lng: number }>({
    lat: DEFAULT_MAP_CENTER[0],
    lng: DEFAULT_MAP_CENTER[1],
  });

  const solarElevation = getSolarElevation(new Date(currentTime + 'Z'), viewportCenter.lat, viewportCenter.lng);
  const visNightFactor = autoReduceVisAtNight && activeLayers.vis && activeLayers.ir
    ? getDaylightVisFactor(solarElevation)
    : 1;
  const daylightVisFactor = Math.max(0, Math.min(1, getDaylightVisFactor(solarElevation)));
  const hybridVisNightFactor = Math.pow(visNightFactor, 1.6);
  const effectiveSandwichOpacity = sandwichOpacity * visNightFactor;
  const isRgbVisOnlyMode = activeLayers.rgb && activeLayers.vis && !activeLayers.ir;
  // In luminosity blend mode, high VIS opacity can noticeably darken RGB.
  // Keep a conservative dynamic cap to preserve VIS detail without dimming daytime RGB too much.
  const hybridVisOpacityCap = 0.48 + daylightVisFactor * 0.14;
  const rgbVisOnlyOpacityCap = 0.8;
  const rgbVisOnlyNightFactor = Math.max(0.7, visNightFactor);
  const effectiveRgbVisOnlyVisOpacity = Math.min(
    rgbHdOpacity * rgbVisOnlyNightFactor,
    rgbVisOnlyOpacityCap,
  );
  const effectiveHybridOnlyVisOpacity = Math.min(rgbHdOpacity * hybridVisNightFactor, hybridVisOpacityCap);
  const effectiveHybridVisOpacity = isRgbVisOnlyMode ? effectiveRgbVisOnlyVisOpacity : effectiveHybridOnlyVisOpacity;
  const effectiveHybridIrOpacity = sandwichOpacity;
  const isHybridMode = activeLayers.rgb && activeLayers.vis && activeLayers.ir;
  const isRgbIrMode = activeLayers.rgb && activeLayers.ir && !activeLayers.vis;
  const isVisIrMode = activeLayers.vis && activeLayers.ir && !activeLayers.rgb;
  const shouldPreferIrBaseAtNight = activeLayers.rgb && (activeLayers.vis || activeLayers.ir) && solarElevation < 1.5;
  const isNightIrFallbackActive = shouldPreferIrBaseAtNight;
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
  const isVisOverlayEnabled = activeLayers.vis && baseLayer !== 'vis';
  const isIrOverlayEnabled = activeLayers.ir && baseLayer !== 'ir';
  const currentVisOverlayOpacity = activeLayers.rgb ? effectiveHybridVisOpacity : effectiveSandwichOpacity;
  const borderStrokeOpacity = Math.max(0, Math.min(1, mapOptions.bordersOpacity));
  const departmentsStrokeOpacity = Math.max(0, Math.min(1, mapOptions.franceDepartmentsOpacity));

  useEffect(() => {
    initialMapViewRef.current = initialMapView;
  }, [initialMapView]);

  useEffect(() => {
    onMapViewChangeRef.current = onMapViewChange;
  }, [onMapViewChange]);

  const getVisibleCityFeatures = (bounds: L.LatLngBounds, zoom: number): CityFeature[] => {
    const allCities = cityFeaturesRef.current;
    if (!allCities || zoom < 4) return [];

    const paddedBounds = bounds.pad(0.2);
    const minPopulation = zoom >= 8 ? 25000 : zoom >= 7 ? 60000 : zoom >= 6 ? 120000 : zoom >= 5 ? 300000 : 700000;
    const hardLimit = zoom >= 8 ? 250 : zoom >= 6 ? 180 : 120;

    return allCities
      .filter((feature) => {
        const [lng, lat] = feature.geometry.coordinates;
        const pop = feature.properties.POP_MAX ?? 0;
        return pop >= minPopulation && paddedBounds.contains(L.latLng(lat, lng));
      })
      .sort((a, b) => (b.properties.POP_MAX ?? 0) - (a.properties.POP_MAX ?? 0))
      .slice(0, hardLimit);
  };

  const buildCityLabelIcon = (zoom: number, text: string): L.DivIcon => {
    const sizeClass = zoom >= 8 ? 'city-label-lg' : zoom >= 6 ? 'city-label-md' : 'city-label-sm';
    return L.divIcon({
      className: `city-label ${sizeClass}`,
      html: text,
      iconSize: undefined,
      iconAnchor: [0, 0],
    });
  };

  const renderCityLabelsOnMap = (map: L.Map, layer: L.LayerGroup) => {
    const zoom = map.getZoom();
    const bounds = map.getBounds();
    const visibleCities = getVisibleCityFeatures(bounds, zoom);

    layer.clearLayers();
    visibleCities.forEach((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      const name = feature.properties.NAME ?? feature.properties.NAMEASCII;
      if (!name) return;

      layer.addLayer(
        L.marker([lat, lng], {
          icon: buildCityLabelIcon(zoom, name),
          interactive: false,
          keyboard: false,
          zIndexOffset: 1000,
        }),
      );
    });
  };

  const createSecondaryBaseLayer = (base: 'rgb' | 'ir' | 'vis', isoTime: string, nextIrStyle: IrStyle) => {
    return L.tileLayer.wms(WMS_URL_DIRECT, {
      layers: base === 'rgb' ? LAYER_RGB : base === 'ir' ? LAYER_IR : LAYER_VIS,
      styles: base === 'ir' ? nextIrStyle : '',
      format: 'image/png',
      transparent: true,
      attribution: '© EUMETSAT',
      time: isoTime,
      keepBuffer: 2,
      updateWhenIdle: true,
      className: base === 'rgb' ? 'rgb-layer-tiles' : base === 'ir' ? 'ir-base-layer-tiles' : 'vis-layer-tiles',
      zIndex: 200,
    } as any);
  };

  const createVisOverlayLayer = (
    isoTime: string,
    isHybridVariant: boolean,
    isVisOnIrVariant: boolean,
    isRgbVisOnlyVariant: boolean,
  ) => {
    const visOverlayClass = isHybridVariant
      ? 'vis-overlay-layer-tiles-hybrid'
      : isVisOnIrVariant
        ? 'vis-overlay-layer-tiles-on-ir'
        : isRgbVisOnlyVariant
          ? 'vis-overlay-layer-tiles-rgb-hd'
          : 'vis-overlay-layer-tiles';

    return L.tileLayer.wms(WMS_URL_DIRECT, {
      layers: LAYER_VIS,
      format: 'image/png',
      transparent: true,
      time: isoTime,
      keepBuffer: 2,
      updateWhenIdle: true,
      className: `${visOverlayClass} transition-opacity duration-500 ease-in-out`,
      opacity: 0,
      zIndex: 290,
    } as any);
  };

  const createIrOverlayLayer = (isoTime: string, nextIrStyle: IrStyle) => {
    return L.tileLayer.wms(WMS_URL_DIRECT, {
      layers: LAYER_IR,
      styles: nextIrStyle,
      format: 'image/png',
      transparent: true,
      time: isoTime,
      keepBuffer: 2,
      updateWhenIdle: true,
      className: 'ir-overlay-layer-tiles transition-opacity duration-500 ease-in-out',
      opacity: 0,
      zIndex: 330,
    } as any);
  };

  const createIrFallbackBaseLayer = (isoTime: string, nextIrStyle: IrStyle) => {
    return L.tileLayer.wms(WMS_URL_DIRECT, {
      layers: LAYER_IR,
      styles: nextIrStyle,
      format: 'image/png',
      transparent: true,
      attribution: '© EUMETSAT',
      time: isoTime,
      keepBuffer: 2,
      updateWhenIdle: true,
      className: 'ir-fallback-base-layer-tiles',
      zIndex: 220,
      opacity: 0,
    } as any);
  };

  const beginLoadingCycle = () => {
    loadingCycleRef.current += 1;
    pendingTilesRef.current = 0;
    startedTilesRef.current = 0;
    completedTilesRef.current = 0;
    activeLayerLoadsRef.current = 0;
    mapIsLoadingRef.current = false;
    setLoadingTileCount(0);
    setLoadingProgress(0);
    setIsMapLoading(true);

    if (loadingIdleTimeoutRef.current !== null) {
      window.clearTimeout(loadingIdleTimeoutRef.current);
      loadingIdleTimeoutRef.current = null;
    }
    if (loadingNoStartTimeoutRef.current !== null) {
      window.clearTimeout(loadingNoStartTimeoutRef.current);
      loadingNoStartTimeoutRef.current = null;
    }

    const cycleId = loadingCycleRef.current;
    loadingNoStartTimeoutRef.current = window.setTimeout(() => {
      if (loadingCycleRef.current !== cycleId) return;
      if (startedTilesRef.current === 0 && activeLayerLoadsRef.current === 0 && !mapIsLoadingRef.current) {
        setLoadingProgress(100);
        setLoadingTileCount(0);
        setIsMapLoading(false);
      }
      loadingNoStartTimeoutRef.current = null;
    }, 900);
  };

  const maybeFinishLoading = () => {
    if (pendingTilesRef.current !== 0) return;
    if (activeLayerLoadsRef.current !== 0) return;
    if (mapIsLoadingRef.current) return;

    if (loadingIdleTimeoutRef.current !== null) {
      window.clearTimeout(loadingIdleTimeoutRef.current);
    }
    loadingIdleTimeoutRef.current = window.setTimeout(() => {
      setLoadingProgress(100);
      setIsMapLoading(false);
      loadingIdleTimeoutRef.current = null;
    }, 180);
  };

  const bindLayerLoading = (layer: L.Layer | null) => {
    if (!layer) return () => undefined;
    const anyLayer = layer as any;
    if (typeof anyLayer.on !== 'function' || typeof anyLayer.off !== 'function') return () => undefined;

    const onLoading = () => {
      if (loadingNoStartTimeoutRef.current !== null) {
        window.clearTimeout(loadingNoStartTimeoutRef.current);
        loadingNoStartTimeoutRef.current = null;
      }
      if (loadingIdleTimeoutRef.current !== null) {
        window.clearTimeout(loadingIdleTimeoutRef.current);
        loadingIdleTimeoutRef.current = null;
      }

      activeLayerLoadsRef.current += 1;
      setIsMapLoading(true);
    };

    const onLoad = () => {
      activeLayerLoadsRef.current = Math.max(0, activeLayerLoadsRef.current - 1);
      maybeFinishLoading();
    };

    const onStart = () => {
      if (loadingNoStartTimeoutRef.current !== null) {
        window.clearTimeout(loadingNoStartTimeoutRef.current);
        loadingNoStartTimeoutRef.current = null;
      }
      if (loadingIdleTimeoutRef.current !== null) {
        window.clearTimeout(loadingIdleTimeoutRef.current);
        loadingIdleTimeoutRef.current = null;
      }
      startedTilesRef.current += 1;
      pendingTilesRef.current += 1;
      setLoadingTileCount(pendingTilesRef.current);
      if (startedTilesRef.current > 0) {
        const progress = Math.max(0, Math.min(99, Math.round((completedTilesRef.current / startedTilesRef.current) * 100)));
        setLoadingProgress(progress);
      }
      setIsMapLoading(true);
    };

    const onEnd = () => {
      completedTilesRef.current += 1;
      pendingTilesRef.current = Math.max(0, pendingTilesRef.current - 1);
      setLoadingTileCount(pendingTilesRef.current);

      if (startedTilesRef.current > 0) {
        const progress = Math.max(
          0,
          Math.min(100, Math.round((completedTilesRef.current / startedTilesRef.current) * 100)),
        );
        setLoadingProgress(progress);
      }

      maybeFinishLoading();
    };

    anyLayer.on('loading', onLoading);
    anyLayer.on('load', onLoad);
    anyLayer.on('tileloadstart', onStart);
    anyLayer.on('tileload', onEnd);
    anyLayer.on('tileerror', onEnd);

    return () => {
      anyLayer.off('loading', onLoading);
      anyLayer.off('load', onLoad);
      anyLayer.off('tileloadstart', onStart);
      anyLayer.off('tileload', onEnd);
      anyLayer.off('tileerror', onEnd);
    };
  };

  const buildWmsTileUrl = (layer: string, style: string, bbox: string, isoTime: string) => {
    return `${WMS_URL_DIRECT}?service=WMS&request=GetMap&layers=${encodeURIComponent(layer)}&styles=${encodeURIComponent(style)}&format=image/png&transparent=true&version=1.1.1&srs=EPSG:3857&bbox=${bbox}&width=256&height=256&time=${encodeURIComponent(isoTime)}`;
  };

  const loadImage = (url: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'Anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load tile: ${url}`));
      image.src = url;
    });
  };

  const createCloudOnlyIrLayer = (
    isoTime: string,
    nextIrStyle: IrStyle,
    visMaskWeight: number,
    useRgbMaskInCloudDetection: boolean,
  ) => {
    const HYBRID_TILE_CACHE_LIMIT = 320;

    const touchCacheKey = (key: string) => {
      const idx = hybridTileCacheOrderRef.current.indexOf(key);
      if (idx >= 0) {
        hybridTileCacheOrderRef.current.splice(idx, 1);
      }
      hybridTileCacheOrderRef.current.push(key);
    };

    const setCachedTile = (key: string, canvas: HTMLCanvasElement) => {
      hybridTileCacheRef.current.set(key, canvas);
      touchCacheKey(key);

      while (hybridTileCacheOrderRef.current.length > HYBRID_TILE_CACHE_LIMIT) {
        const oldest = hybridTileCacheOrderRef.current.shift();
        if (!oldest) break;
        hybridTileCacheRef.current.delete(oldest);
      }
    };

    const layer = L.gridLayer({
      tileSize: 256,
      opacity: 1,
      zIndex: 330,
      className: 'ir-cloud-only-layer-tiles',
    } as any);

    (layer as any).createTile = (coords: L.Coords, done: (error: Error | null, tile: HTMLCanvasElement) => void) => {
      const tile = document.createElement('canvas');
      tile.width = 256;
      tile.height = 256;

      const normalizedVisWeight = Math.max(0, Math.min(1, visMaskWeight));
      const useVisMask = normalizedVisWeight > 0.01;
      const useRgbMask = useRgbMaskInCloudDetection;

      const cacheKey = `${isoTime}|${nextIrStyle}|w${normalizedVisWeight.toFixed(2)}|${coords.z}|${coords.x}|${coords.y}`;
      const cachedTile = hybridTileCacheRef.current.get(cacheKey);
      if (cachedTile) {
        const tileCtx = tile.getContext('2d')!;
        tileCtx.drawImage(cachedTile, 0, 0);
        touchCacheKey(cacheKey);
        done(null, tile);
        return tile;
      }

      const map = map2Instance.current;
      if (!map) {
        done(null, tile);
        return tile;
      }

      const nwPoint = L.point(coords.x * 256, coords.y * 256);
      const sePoint = nwPoint.add([256, 256]);
      const nwLatLng = map.unproject(nwPoint, coords.z);
      const seLatLng = map.unproject(sePoint, coords.z);
      const nw3857 = L.CRS.EPSG3857.project(nwLatLng);
      const se3857 = L.CRS.EPSG3857.project(seLatLng);
      const bbox = `${nw3857.x},${se3857.y},${se3857.x},${nw3857.y}`;

      const visMaskUrl = buildWmsTileUrl(LAYER_VIS, '', bbox, isoTime);
      const rgbMaskUrl = buildWmsTileUrl(LAYER_RGB, '', bbox, isoTime);
      const irUrl = buildWmsTileUrl(LAYER_IR, nextIrStyle, bbox, isoTime);

      void Promise.all([
        useVisMask ? loadImage(visMaskUrl) : Promise.resolve(null),
        useRgbMask ? loadImage(rgbMaskUrl) : Promise.resolve(null),
        loadImage(irUrl),
      ])
        .then(([visMaskImage, rgbMaskImage, irImage]) => {
          let visMaskData: Uint8ClampedArray | null = null;
          let rgbMaskData: Uint8ClampedArray | null = null;

          if (visMaskImage) {
            const visMaskCanvas = document.createElement('canvas');
            visMaskCanvas.width = 256;
            visMaskCanvas.height = 256;
            const visMaskCtx = visMaskCanvas.getContext('2d')!;
            visMaskCtx.drawImage(visMaskImage, 0, 0);
            visMaskData = visMaskCtx.getImageData(0, 0, 256, 256).data;
          }

          if (rgbMaskImage) {
            const rgbMaskCanvas = document.createElement('canvas');
            rgbMaskCanvas.width = 256;
            rgbMaskCanvas.height = 256;
            const rgbMaskCtx = rgbMaskCanvas.getContext('2d')!;
            rgbMaskCtx.drawImage(rgbMaskImage, 0, 0);
            rgbMaskData = rgbMaskCtx.getImageData(0, 0, 256, 256).data;
          }

          const irCanvas = document.createElement('canvas');
          irCanvas.width = 256;
          irCanvas.height = 256;
          const irCtx = irCanvas.getContext('2d')!;
          irCtx.drawImage(irImage, 0, 0);
          const irData = irCtx.getImageData(0, 0, 256, 256).data;

          const outCtx = tile.getContext('2d')!;
          const outImage = outCtx.createImageData(256, 256);
          const outData = outImage.data;

          const visThresholdBase = 90;
          const visThresholdSpan = 100;
          const rgbThresholdBase = 120;
          const rgbThresholdSpan = 90;

          for (let i = 0; i < outData.length; i += 4) {
            const visLum = visMaskData ? (visMaskData[i] + visMaskData[i + 1] + visMaskData[i + 2]) / 3 : 0;
            const rgbLum = rgbMaskData ? (rgbMaskData[i] + rgbMaskData[i + 1] + rgbMaskData[i + 2]) / 3 : visLum;

            const rgbCloudMask = Math.min(1, Math.max(0, (rgbLum - rgbThresholdBase) / rgbThresholdSpan));
            const visCloudMask = Math.min(1, Math.max(0, (visLum - visThresholdBase) / visThresholdSpan));
            const refinedCloudMask = rgbCloudMask * (1 - normalizedVisWeight) + visCloudMask * normalizedVisWeight;
            // RGB floor increases only when VIS becomes unreliable (dusk/night).
            const rgbFloorFactor = (1 - normalizedVisWeight) * 0.85;
            const cloudMask = Math.max(rgbCloudMask * rgbFloorFactor, refinedCloudMask);

            if (cloudMask < 0.02) {
              outData[i + 3] = 0;
              continue;
            }

            const irR = irData[i];
            const irG = irData[i + 1];
            const irB = irData[i + 2];
            const mean = (irR + irG + irB) / 3;
            const satBoost = 1.2;

            const boostedR = Math.max(0, Math.min(255, mean + (irR - mean) * satBoost));
            const boostedG = Math.max(0, Math.min(255, mean + (irG - mean) * satBoost));
            const boostedB = Math.max(0, Math.min(255, mean + (irB - mean) * satBoost));

            outData[i] = boostedR;
            outData[i + 1] = boostedG;
            outData[i + 2] = boostedB;
            outData[i + 3] = Math.round(255 * cloudMask);
          }

          outCtx.putImageData(outImage, 0, 0);

          const cacheCanvas = document.createElement('canvas');
          cacheCanvas.width = 256;
          cacheCanvas.height = 256;
          const cacheCtx = cacheCanvas.getContext('2d')!;
          cacheCtx.drawImage(tile, 0, 0);
          setCachedTile(cacheKey, cacheCanvas);

          done(null, tile);
        })
        .catch((error: Error) => {
          done(error, tile);
        });

      return tile;
    };

    return layer;
  };

  useEffect(() => {
    if (!map1Ref.current || !map2Ref.current) return;
    if (map1Instance.current || map2Instance.current) return;

    L.Icon.Default.imagePath = '/';

    const map1 = L.map(map1Ref.current, {
      center: DEFAULT_MAP_CENTER,
      zoom: 6,
      zoomControl: false,
      attributionControl: false,
    });

    const map2 = L.map(map2Ref.current, {
      center: DEFAULT_MAP_CENTER,
      zoom: 6,
      zoomControl: false,
      attributionControl: false,
    });

    const rememberedMapView = initialMapViewRef.current;
    if (rememberedMapView) {
      const nextZoom = Math.max(3, Math.min(11, Math.round(rememberedMapView.zoom)));
      const nextLat = Math.max(-85, Math.min(85, rememberedMapView.lat));
      const nextLng = Math.max(-180, Math.min(180, rememberedMapView.lng));
      map1.setView([nextLat, nextLng], nextZoom, { animate: false });
      map2.setView([nextLat, nextLng], nextZoom, { animate: false });
    } else {
      const franceBounds = L.latLngBounds(DEFAULT_FRANCE_BOUNDS);
      map1.fitBounds(franceBounds, { animate: false, padding: [0, 0] });
      map2.fitBounds(franceBounds, { animate: false, padding: [0, 0] });
    }

    // Keep the satellite view clean: no opaque basemap underlay to avoid visual bleed-through.

    const initialIsoTime = new Date(currentTime + 'Z').toISOString();
    beginLoadingCycle();
    secondaryBaseLayerRef.current = createSecondaryBaseLayer(baseLayer, initialIsoTime, irStyle).addTo(map2);
    visOverlayLayerRef.current = createVisOverlayLayer(
      initialIsoTime,
      isHybridMode,
      !activeLayers.rgb && activeLayers.ir,
      activeLayers.rgb && activeLayers.vis && !activeLayers.ir,
    );
    irOverlayLayerRef.current = createIrOverlayLayer(initialIsoTime, irStyle);

    const unbindBaseLoading = bindLayerLoading(secondaryBaseLayerRef.current);

    const updateViewportCenter = () => {
      const center = map2.getCenter();
      setViewportCenter({ lat: center.lat, lng: center.lng });
      onMapViewChangeRef.current({
        lat: center.lat,
        lng: center.lng,
        zoom: map2.getZoom(),
      });
    };

    const handleMapLoading = () => {
      mapIsLoadingRef.current = true;
      if (loadingNoStartTimeoutRef.current !== null) {
        window.clearTimeout(loadingNoStartTimeoutRef.current);
        loadingNoStartTimeoutRef.current = null;
      }
      if (loadingIdleTimeoutRef.current !== null) {
        window.clearTimeout(loadingIdleTimeoutRef.current);
        loadingIdleTimeoutRef.current = null;
      }
      setIsMapLoading(true);
    };

    const handleMapLoad = () => {
      mapIsLoadingRef.current = false;
      maybeFinishLoading();
    };

    const syncMaps = (source: L.Map, target: L.Map) => {
      source.on('move', () => {
        if (!isSyncing.current) {
          isSyncing.current = true;
          target.setView(source.getCenter(), source.getZoom(), { animate: false });
          isSyncing.current = false;
        }
      });
    };

    L.control.attribution({ position: 'bottomright' }).addTo(map2);
    syncMaps(map1, map2);
    syncMaps(map2, map1);
    map2.on('loading', handleMapLoading);
    map2.on('load', handleMapLoad);
    map2.on('moveend', updateViewportCenter);
    map2.on('zoomend', updateViewportCenter);
    updateViewportCenter();

    map1Instance.current = map1;
    map2Instance.current = map2;
    setMapsReady(true);

    return () => {
      unbindBaseLoading();
      map2.off('loading', handleMapLoading);
      map2.off('load', handleMapLoad);
      map2.off('moveend', updateViewportCenter);
      map2.off('zoomend', updateViewportCenter);
      map1.remove();
      map2.remove();
      map1Instance.current = null;
      map2Instance.current = null;
      if (loadingIdleTimeoutRef.current !== null) {
        window.clearTimeout(loadingIdleTimeoutRef.current);
        loadingIdleTimeoutRef.current = null;
      }
      if (loadingNoStartTimeoutRef.current !== null) {
        window.clearTimeout(loadingNoStartTimeoutRef.current);
        loadingNoStartTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    try {
      const isoTime = new Date(currentTime + 'Z').toISOString();
      secondaryBaseLayerRef.current?.setParams({ time: isoTime } as any);
      irFallbackBaseLayerRef.current?.setParams({ time: isoTime, styles: irStyle } as any);
      visOverlayLayerRef.current?.setParams({ time: isoTime } as any);
      irOverlayLayerRef.current?.setParams({ time: isoTime } as any);
    } catch (e) {
      console.warn('Invalid time format', e);
    }
  }, [currentTime]);

  useEffect(() => {
    hybridTileCacheRef.current.clear();
    hybridTileCacheOrderRef.current = [];

    const map2 = map2Instance.current;
    if (!map2) return;

    beginLoadingCycle();

    const isoTime = new Date(currentTime + 'Z').toISOString();
    secondaryBaseLayerRef.current?.remove();
    secondaryBaseLayerRef.current = createSecondaryBaseLayer(baseLayer, isoTime, irStyle).addTo(map2);

    if (irFallbackBaseLayerRef.current && map2.hasLayer(irFallbackBaseLayerRef.current)) {
      irFallbackBaseLayerRef.current.remove();
    }
    irFallbackBaseLayerRef.current = createIrFallbackBaseLayer(isoTime, irStyle);
    if (baseLayer === 'rgb' && activeLayers.rgb && activeLayers.ir && rgbToIrTransition > 0.01) {
      irFallbackBaseLayerRef.current.addTo(map2);
      irFallbackBaseLayerRef.current.setOpacity(rgbToIrTransition);
    }

    if (visOverlayLayerRef.current && map2.hasLayer(visOverlayLayerRef.current)) {
      visOverlayLayerRef.current.remove();
    }
    if (irOverlayLayerRef.current && map2.hasLayer(irOverlayLayerRef.current)) {
      irOverlayLayerRef.current.remove();
    }

    visOverlayLayerRef.current = createVisOverlayLayer(
      isoTime,
      isHybridMode,
      !activeLayers.rgb && activeLayers.ir,
      activeLayers.rgb && activeLayers.vis && !activeLayers.ir,
    );
    irOverlayLayerRef.current = createIrOverlayLayer(isoTime, irStyle);

    const unbindBaseLoading = bindLayerLoading(secondaryBaseLayerRef.current);
    const unbindIrFallbackLoading = bindLayerLoading(irFallbackBaseLayerRef.current);
    const unbindVisOverlayLoading = bindLayerLoading(visOverlayLayerRef.current);
    const unbindIrOverlayLoading = bindLayerLoading(irOverlayLayerRef.current);

    const visOverlayLayer = visOverlayLayerRef.current;
    const irOverlayLayer = irOverlayLayerRef.current;

    visOverlayLayer.setParams({ time: isoTime } as any);
    irOverlayLayer.setParams({ time: isoTime, styles: irStyle } as any);

    if (overlayFadeInTimeoutRef.current !== null) {
      window.clearTimeout(overlayFadeInTimeoutRef.current);
      overlayFadeInTimeoutRef.current = null;
    }
    if (overlayFadeOutTimeoutRef.current !== null) {
      window.clearTimeout(overlayFadeOutTimeoutRef.current);
      overlayFadeOutTimeoutRef.current = null;
    }

    if (isVisOverlayEnabled) {
      if (!map2.hasLayer(visOverlayLayer)) {
        visOverlayLayer.addTo(map2);
      }
      visOverlayLayer.setOpacity(0);
      overlayFadeInTimeoutRef.current = window.setTimeout(() => {
        visOverlayLayerRef.current?.setOpacity(currentVisOverlayOpacity);
        overlayFadeInTimeoutRef.current = null;
      }, 50);
    } else if (map2.hasLayer(visOverlayLayer)) {
      visOverlayLayer.setOpacity(0);
      overlayFadeOutTimeoutRef.current = window.setTimeout(() => {
        if (visOverlayLayerRef.current && map2.hasLayer(visOverlayLayerRef.current)) {
          visOverlayLayerRef.current.remove();
        }
        overlayFadeOutTimeoutRef.current = null;
      }, 500);
    }

    if (isCloudOnlyIrMode) {
      if (map2.hasLayer(irOverlayLayer)) {
        irOverlayLayer.remove();
      }
      if (irCloudOnlyLayerRef.current && map2.hasLayer(irCloudOnlyLayerRef.current)) {
        irCloudOnlyLayerRef.current.remove();
      }
      const visMaskWeight = isHybridMode ? hybridVisMaskWeight : isVisIrMode ? 1 : 0;
      irCloudOnlyLayerRef.current = createCloudOnlyIrLayer(isoTime, irStyle, visMaskWeight, !isVisIrMode);
      const unbindHybridLoading = bindLayerLoading(irCloudOnlyLayerRef.current);
      irCloudOnlyLayerRef.current.addTo(map2);
      irCloudOnlyLayerRef.current.setOpacity(effectiveCloudOnlyIrOpacity);

      return () => {
        unbindBaseLoading();
        unbindIrFallbackLoading();
        unbindVisOverlayLoading();
        unbindIrOverlayLoading();
        unbindHybridLoading();
        if (overlayFadeInTimeoutRef.current !== null) {
          window.clearTimeout(overlayFadeInTimeoutRef.current);
          overlayFadeInTimeoutRef.current = null;
        }
        if (overlayFadeOutTimeoutRef.current !== null) {
          window.clearTimeout(overlayFadeOutTimeoutRef.current);
          overlayFadeOutTimeoutRef.current = null;
        }
      };
    } else {
      if (irCloudOnlyLayerRef.current && map2.hasLayer(irCloudOnlyLayerRef.current)) {
        irCloudOnlyLayerRef.current.remove();
      }
      if (isIrOverlayEnabled) {
        if (!map2.hasLayer(irOverlayLayer)) {
          irOverlayLayer.addTo(map2);
        }
        irOverlayLayer.setOpacity(activeLayers.rgb ? effectiveHybridIrOpacity : sandwichOpacity);
      } else if (map2.hasLayer(irOverlayLayer)) {
        irOverlayLayer.remove();
      }
    }

    return () => {
      unbindBaseLoading();
      unbindIrFallbackLoading();
      unbindVisOverlayLoading();
      unbindIrOverlayLoading();
      if (overlayFadeInTimeoutRef.current !== null) {
        window.clearTimeout(overlayFadeInTimeoutRef.current);
        overlayFadeInTimeoutRef.current = null;
      }
      if (overlayFadeOutTimeoutRef.current !== null) {
        window.clearTimeout(overlayFadeOutTimeoutRef.current);
        overlayFadeOutTimeoutRef.current = null;
      }
    };
  }, [
    baseLayer,
    currentTime,
    irStyle,
    isHybridMode,
    isVisIrMode,
    isRgbIrMode,
    isCloudOnlyIrMode,
    rgbToIrTransition,
    hybridVisMaskWeight,
    isIrOverlayEnabled,
    isVisOverlayEnabled,
  ]);

  useEffect(() => {
    const map2 = map2Instance.current;
    const visOverlayLayer = visOverlayLayerRef.current;
    const irFallbackBaseLayer = irFallbackBaseLayerRef.current;
    const irOverlayLayer = irOverlayLayerRef.current;
    const irCloudOnlyLayer = irCloudOnlyLayerRef.current;

    if (map2 && visOverlayLayer && isVisOverlayEnabled && map2.hasLayer(visOverlayLayer)) {
      visOverlayLayer.setOpacity(currentVisOverlayOpacity);
    }
    if (map2 && baseLayer === 'rgb' && activeLayers.rgb && activeLayers.ir && rgbToIrTransition > 0.01 && irFallbackBaseLayer) {
      if (!map2.hasLayer(irFallbackBaseLayer)) {
        irFallbackBaseLayer.addTo(map2);
      }
      irFallbackBaseLayer.setOpacity(rgbToIrTransition);
    } else if (map2 && irFallbackBaseLayer && map2.hasLayer(irFallbackBaseLayer)) {
      irFallbackBaseLayer.remove();
    }

    if (map2 && !isHybridMode && irOverlayLayer && isIrOverlayEnabled && map2.hasLayer(irOverlayLayer)) {
      irOverlayLayer.setOpacity(activeLayers.rgb ? effectiveHybridIrOpacity : sandwichOpacity);
    }
    if (map2 && isCloudOnlyIrMode && irCloudOnlyLayer && map2.hasLayer(irCloudOnlyLayer)) {
      irCloudOnlyLayer.setOpacity(effectiveCloudOnlyIrOpacity);
    }
  }, [
    baseLayer,
    activeLayers.rgb,
    activeLayers.ir,
    currentVisOverlayOpacity,
    effectiveCloudOnlyIrOpacity,
    effectiveHybridIrOpacity,
    isHybridMode,
    isVisIrMode,
    isRgbIrMode,
    isCloudOnlyIrMode,
    isIrOverlayEnabled,
    isVisOverlayEnabled,
    rgbToIrTransition,
    sandwichOpacity,
  ]);

  useEffect(() => {
    if (!mapsReady || !map1Instance.current || !map2Instance.current) return;

    if (!map1BordersRef.current) {
      map1BordersRef.current = L.geoJSON(undefined, {
        style: { color: `rgba(255, 255, 255, ${borderStrokeOpacity})`, weight: 1, fillOpacity: 0 },
        interactive: false,
      });
      map2BordersRef.current = L.geoJSON(undefined, {
        style: { color: `rgba(255, 255, 255, ${borderStrokeOpacity})`, weight: 1, fillOpacity: 0 },
        interactive: false,
      });

      fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
        .then((res) => res.json())
        .then((data) => {
          map1BordersRef.current?.addData(data);
          map2BordersRef.current?.addData(data);
        })
        .catch((err) => console.error('Could not load borders:', err));
    }

    if (!map2CitiesRef.current) {
      map2CitiesRef.current = L.layerGroup();

      if (!cityLoadPromiseRef.current) {
        cityLoadPromiseRef.current = fetch(CITY_GEOJSON_URL)
          .then((res) => res.json())
          .then((data) => {
            cityFeaturesRef.current = (data?.features ?? []) as CityFeature[];
          })
          .catch((err) => {
            console.error('Could not load city labels:', err);
            cityFeaturesRef.current = [];
          });
      }
    }

    if (!map1DepartmentsRef.current) {
      map1DepartmentsRef.current = L.geoJSON(undefined, {
        style: { color: `rgba(225, 225, 230, ${departmentsStrokeOpacity})`, weight: 1, fillOpacity: 0 },
        interactive: false,
      });
      map2DepartmentsRef.current = L.geoJSON(undefined, {
        style: { color: `rgba(225, 225, 230, ${departmentsStrokeOpacity})`, weight: 1, fillOpacity: 0 },
        interactive: false,
      });

      if (!departmentsLoadPromiseRef.current) {
        departmentsLoadPromiseRef.current = fetch(FRANCE_DEPARTMENTS_GEOJSON_URL)
          .then((res) => res.json())
          .then((data) => {
            map1DepartmentsRef.current?.addData(data);
            map2DepartmentsRef.current?.addData(data);
          })
          .catch((err) => {
            console.error('Could not load France departments:', err);
          });
      }
    }

    map1BordersRef.current?.setStyle({ color: `rgba(255, 255, 255, ${borderStrokeOpacity})`, weight: 1, fillOpacity: 0 });
    map2BordersRef.current?.setStyle({ color: `rgba(255, 255, 255, ${borderStrokeOpacity})`, weight: 1, fillOpacity: 0 });
    map1DepartmentsRef.current?.setStyle({ color: `rgba(225, 225, 230, ${departmentsStrokeOpacity})`, weight: 1, fillOpacity: 0 });
    map2DepartmentsRef.current?.setStyle({ color: `rgba(225, 225, 230, ${departmentsStrokeOpacity})`, weight: 1, fillOpacity: 0 });

    const refreshCityLabels = async () => {
      if (!map2CitiesRef.current) return;
      if (cityLoadPromiseRef.current) {
        await cityLoadPromiseRef.current;
      }
      if (!mapOptions.showCities) return;
      renderCityLabelsOnMap(map2Instance.current!, map2CitiesRef.current);
    };

    if (mapOptions.showBorders) {
      if (!map1Instance.current.hasLayer(map1BordersRef.current)) map1BordersRef.current.addTo(map1Instance.current);
      if (!map2Instance.current.hasLayer(map2BordersRef.current!)) map2BordersRef.current!.addTo(map2Instance.current);
    } else {
      if (map1Instance.current.hasLayer(map1BordersRef.current)) map1BordersRef.current.remove();
      if (map2Instance.current.hasLayer(map2BordersRef.current!)) map2BordersRef.current!.remove();
    }

    if (mapOptions.showCities) {
      if (!map2Instance.current.hasLayer(map2CitiesRef.current!)) map2CitiesRef.current!.addTo(map2Instance.current);
      void refreshCityLabels();
    } else {
      if (map2Instance.current.hasLayer(map2CitiesRef.current!)) map2CitiesRef.current!.remove();
    }

    if (mapOptions.showFranceDepartments) {
      if (departmentsLoadPromiseRef.current) {
        void departmentsLoadPromiseRef.current.then(() => {
          if (map1DepartmentsRef.current && !map1Instance.current!.hasLayer(map1DepartmentsRef.current)) {
            map1DepartmentsRef.current.addTo(map1Instance.current!);
          }
          if (map2DepartmentsRef.current && !map2Instance.current!.hasLayer(map2DepartmentsRef.current)) {
            map2DepartmentsRef.current.addTo(map2Instance.current!);
          }
        });
      }
    } else {
      if (map1DepartmentsRef.current && map1Instance.current.hasLayer(map1DepartmentsRef.current)) {
        map1DepartmentsRef.current.remove();
      }
      if (map2DepartmentsRef.current && map2Instance.current.hasLayer(map2DepartmentsRef.current)) {
        map2DepartmentsRef.current.remove();
      }
    }

    map2Instance.current.on('moveend zoomend', refreshCityLabels);

    return () => {
      map2Instance.current?.off('moveend zoomend', refreshCityLabels);
    };
  }, [mapOptions, mapsReady]);

  return {
    cityLoadPromiseRef,
    effectiveHybridVisOpacity,
    effectiveSandwichOpacity,
    getVisibleCityFeatures,
    isNightIrFallbackActive,
    map1BordersRef,
    map1DepartmentsRef,
    map1Ref,
    map2Instance,
    map2Ref,
    isMapLoading,
    loadingProgress,
    loadingTileCount,
    solarElevation,
  };
}