import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

import {
  type ActiveLayers,
  CITY_GEOJSON_URL,
  computeCloudOnlyIrRgba,
  computeFireHotspotRgba,
  computeLayerBlendState,
  DEFAULT_FRANCE_BOUNDS,
  DEFAULT_MAP_CENTER,
  type FireHotspotThresholds,
  FRANCE_DEPARTMENTS_GEOJSON_URL,
  getSolarElevation,
  LAYER_FIRETEMP,
  LAYER_IR,
  LAYER_RGB,
  LAYER_VIS,
  WMS_URL_DIRECT,
  type CityFeature,
  type IrStyle,
  type MapViewState,
  type MapOptions,
} from './dualMapViewerShared';

type CanvasTileWork = {
  /** Set once Leaflet has discarded the tile, so async work started for it can stop early. */
  __abandoned?: boolean;
  /** Cancellers for the WMS requests this tile still has in flight. */
  __cancelLoads?: Array<() => void>;
};

/** 1x1 transparent GIF — assigning it to an <img> src drops any request still pending on it. */
const EMPTY_IMAGE_DATA_URL = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

/**
 * Backoff between attempts to reload a tile whose request failed, spread by TILE_RETRY_JITTER so a
 * batch of tiles refused together doesn't retry in lockstep. Four tries then give up: long enough
 * to ride out a rate-limit refusal or a brief network drop, bounded so a slot the server genuinely
 * has no image for can't turn into an endless request loop.
 */
const TILE_RETRY_DELAYS_MS = [800, 2500, 6000, 15000];

/** Each delay is multiplied by a random factor in [1 - x, 1 + x]. */
const TILE_RETRY_JITTER = 0.4;

/**
 * Retries are dispatched a few at a time rather than all at once. A whole screen of tiles is
 * routinely refused together — that is what a concurrency limit does — and replaying them
 * simultaneously just reproduces the burst that caused the refusals, so every attempt fails and
 * the hole becomes permanent. Measured against a server refusing anything past 20 requests in
 * flight: retrying in lockstep left 30 tiles blank for good, trickling them left 0.
 */
const MAX_CONCURRENT_TILE_RETRIES = 4;
const TILE_RETRY_SPACING_MS = 150;

/**
 * How long a time change waits for the new imagery to be cached before switching anyway. A
 * warm-up costs as long as the reload it replaces, so this has to sit well past a normal load;
 * it is a deadlock guard, not a pacing knob. Changing the time again cancels the wait outright.
 */
const TIME_PREWARM_TIMEOUT_MS = 25000;

/** Per-tile retry counter, carried on the <img> element Leaflet hands back with 'tileerror'. */
type RetriableTile = HTMLImageElement & { __tileRetryCount?: number };

type UseDualMapLeafletArgs = {
  currentTime: string;
  activeLayers: ActiveLayers;
  fireHotspotEnabled: boolean;
  fireHotspotMinBrightness: number;
  fireHotspotMinRedBlueDiff: number;
  fireHotspotOpacity: number;
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
    fireHotspotEnabled,
    fireHotspotMinBrightness,
    fireHotspotMinRedBlueDiff,
    fireHotspotOpacity,
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
  const fireHotspotLayerRef = useRef<L.GridLayer | null>(null);
  const fireHotspotTileCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const fireHotspotTileCacheOrderRef = useRef<string[]>([]);
  const fireHotspotThresholdDebounceRef = useRef<number | null>(null);
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
  // Per-layer tile-loading bookkeeping, one entry per live bindLayerLoading() binding. The
  // "how many tiles are still in flight" and "how many layers are still loading" numbers that
  // gate the loading indicator are *derived* from these (countPendingTiles/countLoadingLayers)
  // rather than kept as standalone +1/-1 counters. Both used to be counters, and both leaked the
  // same way (issue #49): any tile or layer whose end-event Leaflet never emits left the counter
  // permanently above zero, wedging the modal open with no way back down. Deriving them means a
  // missed event can only ever cost one stale entry, and clearing/removing an entry always fully
  // reconciles the total.
  type LayerLoadState = { pendingKeys: Set<string>; isLoading: boolean };
  const layerLoadStatesRef = useRef<Set<LayerLoadState>>(new Set());

  // Shared across every layer, deliberately: the point of the queue is to cap how many replayed
  // tiles are in flight *in total*, and a per-layer budget would multiply by the number of layers.
  // Read by the layer-building effect, which must know the time it is building for without
  // re-running whenever it changes — rebuilding every layer is exactly what a time change must
  // stop doing (issue #79).
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  const tileRetryQueueRef = useRef<Array<{ element: RetriableTile; url: string }>>([]);
  const tileRetryInFlightRef = useRef(0);
  const tileRetryPumpRef = useRef<number | null>(null);
  const startedTilesRef = useRef(0);
  const completedTilesRef = useRef(0);
  const mapIsLoadingRef = useRef(false);
  const loadingIdleTimeoutRef = useRef<number | null>(null);
  const loadingNoStartTimeoutRef = useRef<number | null>(null);
  const loadingStuckTimeoutRef = useRef<number | null>(null);
  const loadingCycleRef = useRef(0);
  const hybridTileCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const hybridTileCacheOrderRef = useRef<string[]>([]);
  // Deliberately NOT kept in sync with the `initialMapView` prop via an effect: React's
  // useRef initial value is only honored on the very first render, so this permanently freezes
  // the shared-link/remembered position at mount time, which is exactly the "initial" semantics
  // the name promises. A prior version resynced it on every change via `useEffect(() => {
  // initialMapViewRef.current = initialMapView }, [initialMapView])` — but `initialMapView` is
  // recomputed as a brand-new object on every DualMapViewer render (sharedSnapshot?.mapView is
  // read unconditionally for the whole session), so that effect kept re-arming this ref with the
  // originally-shared coordinates. It's only consulted once, by the mount effect below (guarded
  // to run once per mount), so in normal operation this was inert — but any future code path that
  // re-triggers that guarded effect (map instances becoming null again) would silently snap the
  // map back to the shared position instead of wherever the user had panned to.
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
  // Debounced copy of the fire hotspot thresholds: dragging those sliders fires onChange on every
  // intermediate value, and each one would otherwise tear down and re-fetch the whole hotspot
  // tile layer. Debouncing means the layer only rebuilds once the slider settles, instead of on
  // every tick — the previous version rebuilt (and re-triggered the shared tile-loading indicator)
  // dozens of times per drag, which read as "the whole map is recalculating".
  const [debouncedFireHotspotThresholds, setDebouncedFireHotspotThresholds] = useState<FireHotspotThresholds>({
    minRedBlueDiff: fireHotspotMinRedBlueDiff,
    minBrightness: fireHotspotMinBrightness,
  });

  useEffect(() => {
    if (fireHotspotThresholdDebounceRef.current !== null) {
      window.clearTimeout(fireHotspotThresholdDebounceRef.current);
    }
    fireHotspotThresholdDebounceRef.current = window.setTimeout(() => {
      setDebouncedFireHotspotThresholds({ minRedBlueDiff: fireHotspotMinRedBlueDiff, minBrightness: fireHotspotMinBrightness });
      fireHotspotThresholdDebounceRef.current = null;
    }, 400);

    return () => {
      if (fireHotspotThresholdDebounceRef.current !== null) {
        window.clearTimeout(fireHotspotThresholdDebounceRef.current);
        fireHotspotThresholdDebounceRef.current = null;
      }
    };
  }, [fireHotspotMinRedBlueDiff, fireHotspotMinBrightness]);

  const solarElevation = getSolarElevation(new Date(currentTime + 'Z'), viewportCenter.lat, viewportCenter.lng);
  const {
    isHybridMode,
    isRgbIrMode,
    isVisIrMode,
    shouldPreferIrBaseAtNight,
    baseLayer,
    isCloudOnlyIrMode,
    effectiveCloudOnlyIrOpacity,
    cloudOnlyIrVisMaskWeight,
    cloudOnlyIrNightFloor,
    isVisOverlayEnabled,
    isIrOverlayEnabled,
    currentVisOverlayOpacity,
    effectiveHybridVisOpacity,
    effectiveHybridIrOpacity,
    effectiveSandwichOpacity,
    isRgbVisOnlyMode,
    rgbVisOnlyNightBrightness,
  } = computeLayerBlendState({
    activeLayers,
    rgbHdOpacity,
    sandwichOpacity,
    autoReduceVisAtNight,
    solarElevation,
  });
  const isNightIrFallbackActive = shouldPreferIrBaseAtNight;
  const borderStrokeOpacity = Math.max(0, Math.min(1, mapOptions.bordersOpacity));
  const departmentsStrokeOpacity = Math.max(0, Math.min(1, mapOptions.franceDepartmentsOpacity));

  useEffect(() => {
    onMapViewChangeRef.current = onMapViewChange;
  }, [onMapViewChange]);

  const getVisibleCityFeatures = (bounds: L.LatLngBounds, zoom: number): CityFeature[] => {
    const allCities = cityFeaturesRef.current;
    if (!allCities || zoom < 4) return [];

    const paddedBounds = bounds.pad(0.2);
    // cityDensity (user-adjustable slider, default 1) scales both knobs in the same direction:
    // above 1, the population floor drops (more, smaller cities qualify) and the on-screen cap
    // rises (room to actually show them); below 1, only the biggest cities pass and fewer slots
    // are available. Dividing/multiplying by the same factor keeps the two effects proportional
    // instead of one dominating the other.
    const cityDensity = Math.max(0.25, Math.min(3, mapOptions.cityDensity ?? 1));
    const baseMinPopulation = zoom >= 8 ? 25000 : zoom >= 7 ? 60000 : zoom >= 6 ? 120000 : zoom >= 5 ? 300000 : 700000;
    const baseHardLimit = zoom >= 8 ? 250 : zoom >= 6 ? 180 : 120;
    const minPopulation = baseMinPopulation / cityDensity;
    const hardLimit = Math.max(1, Math.round(baseHardLimit * cityDensity));
    // Cities near each other in real distance (e.g. the Rhine-Ruhr conurbation, or Lille/Antwerp/
    // Lyon/Turin at a wide zoom) project to only a few screen pixels apart at low/mid zoom, so
    // their dot+label pairs visually cram into each other with no cue that they're actually
    // distinct, correctly-placed cities — this reads as "the layer doesn't track zoom right" even
    // though every dot is exactly on its true coordinate. Greedily keep the highest-population
    // candidate first and drop any lower-population one that lands within this pixel radius of an
    // already-kept city, so nearby small towns don't visually collide with a nearby major city.
    const minSpacingPx = 40;

    const candidates = allCities
      .filter((feature) => {
        const [lng, lat] = feature.geometry.coordinates;
        const pop = feature.properties.POP_MAX ?? 0;
        return pop >= minPopulation && paddedBounds.contains(L.latLng(lat, lng));
      })
      .sort((a, b) => (b.properties.POP_MAX ?? 0) - (a.properties.POP_MAX ?? 0));

    const kept: CityFeature[] = [];
    const keptPoints: L.Point[] = [];
    for (const feature of candidates) {
      if (kept.length >= hardLimit) break;
      const [lng, lat] = feature.geometry.coordinates;
      const point = L.CRS.EPSG3857.latLngToPoint(L.latLng(lat, lng), zoom);
      if (keptPoints.some((keptPoint) => point.distanceTo(keptPoint) < minSpacingPx)) continue;
      kept.push(feature);
      keptPoints.push(point);
    }
    return kept;
  };

  const buildCityLabelIcon = (zoom: number, text: string): L.DivIcon => {
    const sizeClass = zoom >= 8 ? 'city-label-lg' : zoom >= 6 ? 'city-label-md' : 'city-label-sm';
    return L.divIcon({
      className: `city-label ${sizeClass}`,
      html: `<span class="city-dot"></span><span class="city-label-text">${text}</span>`,
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

  const createSecondaryBaseLayer = (
    base: 'rgb' | 'ir' | 'vis',
    isoTime: string,
    nextIrStyle: IrStyle,
  ) => {
    // Every mode showing a raw IR base at night renders it identically — it is the same data, so
    // it should look the same. VIS+IR used to get its own brightened class, to match the
    // brightness of the cloud-only composite it stands in for. It matched the *average* and blew
    // out the highlights doing it: 23% of the scene clipped to pure white against 0.7% for the
    // very same imagery in RGB+VIS+IR or standalone IR, which destroys exactly the cold-cloud-top
    // detail IR is read for (issue #71).
    const className = base === 'rgb'
      ? 'rgb-layer-tiles'
      : base === 'ir'
        ? 'ir-base-layer-tiles'
        : 'vis-layer-tiles';
    return L.tileLayer.wms(WMS_URL_DIRECT, {
      layers: base === 'rgb' ? LAYER_RGB : base === 'ir' ? LAYER_IR : LAYER_VIS,
      styles: base === 'ir' ? nextIrStyle : '',
      format: 'image/png',
      transparent: true,
      attribution: '© EUMETSAT',
      time: isoTime,
      keepBuffer: 2,
      updateWhenIdle: true,
      className,
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

  const countPendingTiles = () => {
    let total = 0;
    layerLoadStatesRef.current.forEach((state) => {
      total += state.pendingKeys.size;
    });
    return total;
  };

  const countLoadingLayers = () => {
    let total = 0;
    layerLoadStatesRef.current.forEach((state) => {
      if (state.isLoading) total += 1;
    });
    return total;
  };

  const beginLoadingCycle = () => {
    loadingCycleRef.current += 1;
    layerLoadStatesRef.current.forEach((state) => {
      state.pendingKeys.clear();
      state.isLoading = false;
    });
    startedTilesRef.current = 0;
    completedTilesRef.current = 0;
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
    if (loadingStuckTimeoutRef.current !== null) {
      window.clearTimeout(loadingStuckTimeoutRef.current);
      loadingStuckTimeoutRef.current = null;
    }

    const cycleId = loadingCycleRef.current;
    loadingNoStartTimeoutRef.current = window.setTimeout(() => {
      if (loadingCycleRef.current !== cycleId) return;
      if (startedTilesRef.current === 0 && countLoadingLayers() === 0 && !mapIsLoadingRef.current) {
        setLoadingProgress(100);
        setLoadingTileCount(0);
        setIsMapLoading(false);
      }
      loadingNoStartTimeoutRef.current = null;
    }, 900);

    // Safety net for the opposite case: tiles that DID start but whose `tileload`/`tileerror`
    // counterpart never fires (e.g. Leaflet drops a tile mid-request when a rapid time change —
    // slider scrubbing — redraws the layer before the previous request resolves), which would
    // otherwise leave tiles counted as pending and the modal open forever. Generous timeout
    // so it never masks a genuinely slow WMS response; only kicks in for a cycle that's truly
    // wedged.
    loadingStuckTimeoutRef.current = window.setTimeout(() => {
      if (loadingCycleRef.current !== cycleId) return;
      setLoadingProgress(100);
      setLoadingTileCount(0);
      setIsMapLoading(false);
      loadingStuckTimeoutRef.current = null;
    }, 12000);
  };

  const maybeFinishLoading = () => {
    if (countPendingTiles() !== 0) return;
    if (countLoadingLayers() !== 0) return;
    if (mapIsLoadingRef.current) return;

    if (loadingIdleTimeoutRef.current !== null) {
      window.clearTimeout(loadingIdleTimeoutRef.current);
    }
    loadingIdleTimeoutRef.current = window.setTimeout(() => {
      setLoadingProgress(100);
      setIsMapLoading(false);
      loadingIdleTimeoutRef.current = null;
      if (loadingStuckTimeoutRef.current !== null) {
        window.clearTimeout(loadingStuckTimeoutRef.current);
        loadingStuckTimeoutRef.current = null;
      }
    }, 180);
  };

  /**
   * Drains the retry queue a few tiles at a time. Dispatching one per tick (rather than filling
   * the budget instantly) keeps replayed tiles interleaved with the fresh ones Leaflet is still
   * requesting, instead of stacking a second burst on top of the first.
   */
  const pumpTileRetries = () => {
    if (tileRetryPumpRef.current !== null) return;
    if (tileRetryQueueRef.current.length === 0) return;

    tileRetryPumpRef.current = window.setTimeout(() => {
      tileRetryPumpRef.current = null;

      while (
        tileRetryInFlightRef.current < MAX_CONCURRENT_TILE_RETRIES &&
        tileRetryQueueRef.current.length > 0
      ) {
        const next = tileRetryQueueRef.current.shift();
        if (!next) break;
        // Pruned while it waited its turn: Leaflet detaches the element, so reloading it would
        // fetch imagery nothing is going to show.
        if (!next.element.isConnected) continue;

        tileRetryInFlightRef.current += 1;
        const release = () => {
          next.element.removeEventListener('load', release);
          next.element.removeEventListener('error', release);
          tileRetryInFlightRef.current -= 1;
          pumpTileRetries();
        };
        // Alongside Leaflet's own onload/onerror properties, which stay bound and still carry the
        // tile through _tileReady — these listeners only free the slot.
        next.element.addEventListener('load', release);
        next.element.addEventListener('error', release);
        next.element.src = next.url;
        break;
      }

      pumpTileRetries();
    }, TILE_RETRY_SPACING_MS);
  };

  const bindLayerLoading = (layer: L.Layer | null) => {
    if (!layer) return () => undefined;
    const anyLayer = layer as any;
    if (typeof anyLayer.on !== 'function' || typeof anyLayer.off !== 'function') return () => undefined;

    // Tiles that started ('tileloadstart') but haven't resolved yet, keyed by coordinate and
    // scoped to this one layer instance (a fresh Set per bindLayerLoading call, since two layers
    // can legitimately be loading the same x/y/z tile at once).
    //
    // A tile that starts loading has FOUR possible ends in Leaflet, and every one of them must be
    // accounted for or the pending-tile count never returns to 0 and the "Chargement des tuiles" modal
    // stays up forever (issue #49):
    //   - 'tileload'  — it loaded;
    //   - 'tileerror' — it failed;
    //   - 'tileunload' — it was removed while still in flight (GridLayer._removeTile);
    //   - 'tileabort' — Leaflet's zoom handler called GridLayer._abortLoading(), which drops every
    //     in-flight tile from a now-stale zoom level. This is the one that made zooming break:
    //     _abortLoading deletes the tile from `_tiles` *directly* rather than through
    //     _removeTile (so NO 'tileunload') and overwrites the img's onload/onerror with
    //     falseFn (so NO 'tileload'/'tileerror' either). 'tileabort' is the only signal these
    //     tiles ever emit. Measured on a 20-gesture zoom burst: 204 starts, 49 loads and
    //     155 aborts — those 155 were exactly the count the modal stayed wedged on.
    const state: LayerLoadState = { pendingKeys: new Set<string>(), isLoading: false };
    layerLoadStatesRef.current.add(state);
    const { pendingKeys } = state;
    const tileKey = (coords: { x: number; y: number; z: number }) => `${coords.x}:${coords.y}:${coords.z}`;

    const onLoading = () => {
      if (loadingNoStartTimeoutRef.current !== null) {
        window.clearTimeout(loadingNoStartTimeoutRef.current);
        loadingNoStartTimeoutRef.current = null;
      }
      if (loadingIdleTimeoutRef.current !== null) {
        window.clearTimeout(loadingIdleTimeoutRef.current);
        loadingIdleTimeoutRef.current = null;
      }

      state.isLoading = true;
      setIsMapLoading(true);
    };

    const onLoad = () => {
      state.isLoading = false;
      maybeFinishLoading();
    };

    const onStart = (e: any) => {
      if (loadingNoStartTimeoutRef.current !== null) {
        window.clearTimeout(loadingNoStartTimeoutRef.current);
        loadingNoStartTimeoutRef.current = null;
      }
      if (loadingIdleTimeoutRef.current !== null) {
        window.clearTimeout(loadingIdleTimeoutRef.current);
        loadingIdleTimeoutRef.current = null;
      }
      if (e?.coords) {
        // Same coordinate starting again while still pending counts as one outstanding tile,
        // not two — there is only ever one resolution event coming for it.
        const key = tileKey(e.coords);
        if (pendingKeys.has(key)) return;
        pendingKeys.add(key);
      }
      state.isLoading = true;
      startedTilesRef.current += 1;
      setLoadingTileCount(countPendingTiles());
      if (startedTilesRef.current > 0) {
        const progress = Math.max(0, Math.min(99, Math.round((completedTilesRef.current / startedTilesRef.current) * 100)));
        setLoadingProgress(progress);
      }
      setIsMapLoading(true);
    };

    const resolveTile = (e: any) => {
      // Only the first of the four end-events to name this tile counts. A tile that already
      // loaded and is later unloaded during normal cache housekeeping is no longer in the set,
      // so this is a no-op for it rather than a double decrement.
      if (e?.coords) {
        const key = tileKey(e.coords);
        if (!pendingKeys.delete(key)) return false;
      }
      completedTilesRef.current += 1;
      // Leaflet only emits the layer-level 'load' from _tileReady, which aborted tiles never
      // reach — so a layer whose last in-flight tiles were all aborted would stay "loading"
      // forever even with zero pending tiles. Nothing is outstanding here, so settle it now and
      // let a later 'loading'/'tileloadstart' flip it back on.
      if (pendingKeys.size === 0) state.isLoading = false;
      setLoadingTileCount(countPendingTiles());

      if (startedTilesRef.current > 0) {
        const progress = Math.max(
          0,
          Math.min(100, Math.round((completedTilesRef.current / startedTilesRef.current) * 100)),
        );
        setLoadingProgress(progress);
      }

      maybeFinishLoading();
      return true;
    };

    // A tile whose request failed is left blank by Leaflet and never retried: it stays a hole in
    // the imagery until something rebuilds the whole grid, which is why zooming out and back in
    // repairs it by hand (issue #79). view.eumetsat.int rate-limits WMS
    // (`x-rate-limit-limit: 20`, action "Delay excess requests 1000ms"), so the occasional refused
    // tile is expected rather than exceptional, and a whole screenful can be refused at once.
    //
    // Only <img> tiles are retried. The canvas layers build their pixels from several WMS requests
    // at once and report failure through done(error, tile); replaying that here would re-run the
    // whole composite, and during a service-wide outage it would do so for every tile on screen.
    const retryTimers = new Set<number>();
    const retryFailedTile = (e: any) => {
      const element = e?.tile as RetriableTile | undefined;
      if (!element || typeof element.src !== 'string' || element.src === '') return;
      const attempt = element.__tileRetryCount ?? 0;
      if (attempt >= TILE_RETRY_DELAYS_MS.length) return;
      element.__tileRetryCount = attempt + 1;

      const url = element.src;
      const jitter = 1 + (Math.random() * 2 - 1) * TILE_RETRY_JITTER;
      const delay = Math.round(TILE_RETRY_DELAYS_MS[attempt] * jitter);
      const timer = window.setTimeout(() => {
        retryTimers.delete(timer);
        if (!element.isConnected) return;
        // Queued rather than reloaded on the spot: see pumpTileRetries. Leaflet leaves its own
        // onload/onerror bound, so a successful retry still reaches _tileReady and gets the tile
        // marked loaded and faded in.
        tileRetryQueueRef.current.push({ element, url });
        pumpTileRetries();
      }, delay);
      retryTimers.add(timer);
    };

    anyLayer.on('loading', onLoading);
    anyLayer.on('load', onLoad);
    anyLayer.on('tileloadstart', onStart);
    anyLayer.on('tileload', resolveTile);
    anyLayer.on('tileerror', resolveTile);
    anyLayer.on('tileerror', retryFailedTile);
    anyLayer.on('tileunload', resolveTile);
    anyLayer.on('tileabort', resolveTile);

    return () => {
      anyLayer.off('loading', onLoading);
      anyLayer.off('load', onLoad);
      anyLayer.off('tileloadstart', onStart);
      anyLayer.off('tileload', resolveTile);
      anyLayer.off('tileerror', resolveTile);
      anyLayer.off('tileerror', retryFailedTile);
      anyLayer.off('tileunload', resolveTile);
      anyLayer.off('tileabort', resolveTile);

      retryTimers.forEach((timer) => window.clearTimeout(timer));
      retryTimers.clear();

      // This layer instance is going away (recreated by an effect, or the map torn down):
      // whatever it still had in flight will never resolve, so drop its bookkeeping entirely
      // instead of leaving it counted as pending forever.
      layerLoadStatesRef.current.delete(state);
      setLoadingTileCount(countPendingTiles());
      maybeFinishLoading();
    };
  };

  const buildWmsTileUrl = (layer: string, style: string, bbox: string, isoTime: string) => {
    return `${WMS_URL_DIRECT}?service=WMS&request=GetMap&layers=${encodeURIComponent(layer)}&styles=${encodeURIComponent(style)}&format=image/png&transparent=true&version=1.1.1&srs=EPSG:3857&bbox=${bbox}&width=256&height=256&time=${encodeURIComponent(isoTime)}`;
  };


  /**
   * `loadImage` plus a way to call the request off. Needed by the two canvas GridLayers below:
   * their `createTile` kicks off WMS requests and a full 256x256 pixel pass, and zooming makes
   * Leaflet discard those tiles mid-flight (`GridLayer._abortLoading`) — a canvas tile has no
   * `complete` property, so *every* in-flight one is dropped. Nothing cancelled the work, so the
   * requests ran to completion and the pixels were computed for tiles that were already gone.
   * Assigning an empty image to `src` is how Leaflet's own `TileLayer._removeTile` drops a
   * pending request; the handlers are cleared first so the cancellation can't resolve or reject.
   */
  const loadImageCancellable = (url: string) => {
    const image = new Image();
    image.crossOrigin = 'Anonymous';
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load tile: ${url}`));
    });
    image.src = url;
    return {
      promise,
      cancel: () => {
        image.onload = null;
        image.onerror = null;
        image.src = EMPTY_IMAGE_DATA_URL;
      },
    };
  };

  /**
   * Marks a discarded canvas tile so its in-flight work stops: cancels the requests it still has
   * outstanding, and flags the element so the `.then()` bails before the pixel pass. Bound to both
   * 'tileabort' (zoom dropping a stale level) and 'tileunload' (ordinary pruning). For a tile that
   * already finished, both are no-ops — the promise has resolved and there is nothing left to cut.
   */
  const markCanvasTileAbandoned = (event: any) => {
    const element = event?.tile as (HTMLCanvasElement & CanvasTileWork) | undefined;
    if (!element) return;
    element.__abandoned = true;
    element.__cancelLoads?.forEach((cancel) => cancel());
    element.__cancelLoads = [];
  };

  const createCloudOnlyIrLayer = (
    isoTime: string,
    nextIrStyle: IrStyle,
    visMaskWeight: number,
    useRgbMaskInCloudDetection: boolean,
    nightFloor: number,
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
    layer.on('tileabort', markCanvasTileAbandoned);
    layer.on('tileunload', markCanvasTileAbandoned);

    (layer as any).createTile = (coords: L.Coords, done: (error: Error | null, tile: HTMLCanvasElement) => void) => {
      const tile = document.createElement('canvas');
      tile.width = 256;
      tile.height = 256;

      const normalizedVisWeight = Math.max(0, Math.min(1, visMaskWeight));
      const useVisMask = normalizedVisWeight > 0.01;
      const useRgbMask = useRgbMaskInCloudDetection;

      // Rounded to 10 buckets instead of 100: the mask weight drifts continuously with solar
      // elevation while panning, so a finer cache key would mint a near-duplicate entry for
      // almost every pan tick and starve the LRU cache of real hits. A 0.1 step is visually
      // indistinguishable in this blend but cuts key churn ~10x.
      const normalizedNightFloor = Math.max(0, Math.min(1, nightFloor));
      const cacheWeightBucket = (Math.round(normalizedVisWeight * 10) / 10).toFixed(1);
      const cacheNightFloorBucket = (Math.round(normalizedNightFloor * 10) / 10).toFixed(1);
      const cacheKey = `${isoTime}|${nextIrStyle}|w${cacheWeightBucket}|n${cacheNightFloorBucket}|${coords.z}|${coords.x}|${coords.y}`;
      const cachedTile = hybridTileCacheRef.current.get(cacheKey);
      if (cachedTile) {
        const tileCtx = tile.getContext('2d')!;
        tileCtx.drawImage(cachedTile, 0, 0);
        touchCacheKey(cacheKey);
        // Leaflet's GridLayer._addTile calls createTile(coords, done) and only registers
        // this._tiles[key] *after* createTile returns. Calling done() synchronously here (i.e.
        // before this function returns) makes _tileReady() run while that bookkeeping doesn't
        // exist yet, so it silently bails out (`if (!this._tiles[key]) return;`) — the tile div
        // is still appended to the DOM, but never gets marked loaded/active or faded to visible,
        // so it stays invisible until something else (e.g. a zoom change) forces Leaflet to
        // rebuild its tile grid. Deferring done() by a microtask lets createTile return first, so
        // _addTile's registration always happens before _tileReady runs.
        Promise.resolve().then(() => done(null, tile));
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

      const visMaskLoad = useVisMask ? loadImageCancellable(visMaskUrl) : null;
      const rgbMaskLoad = useRgbMask ? loadImageCancellable(rgbMaskUrl) : null;
      const irLoad = loadImageCancellable(irUrl);
      const work = tile as HTMLCanvasElement & CanvasTileWork;
      work.__cancelLoads = [visMaskLoad, rgbMaskLoad, irLoad]
        .filter((load): load is { promise: Promise<HTMLImageElement>; cancel: () => void } => load !== null)
        .map((load) => load.cancel);

      void Promise.all([
        visMaskLoad ? visMaskLoad.promise : Promise.resolve(null),
        rgbMaskLoad ? rgbMaskLoad.promise : Promise.resolve(null),
        irLoad.promise,
      ])
        .then(([visMaskImage, rgbMaskImage, irImage]) => {
          // Leaflet dropped this tile while its requests were in flight (zoom/pan). Everything
          // below is pure waste for a tile that will never be shown.
          if (work.__abandoned) return;
          work.__cancelLoads = [];
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
          outImage.data.set(computeCloudOnlyIrRgba(visMaskData, rgbMaskData, irData, { visMaskWeight: normalizedVisWeight, nightFloor: normalizedNightFloor }));
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

  const createFireHotspotLayer = (isoTime: string, thresholds: FireHotspotThresholds) => {
    const FIRE_HOTSPOT_TILE_CACHE_LIMIT = 320;

    const touchCacheKey = (key: string) => {
      const idx = fireHotspotTileCacheOrderRef.current.indexOf(key);
      if (idx >= 0) {
        fireHotspotTileCacheOrderRef.current.splice(idx, 1);
      }
      fireHotspotTileCacheOrderRef.current.push(key);
    };

    const setCachedTile = (key: string, canvas: HTMLCanvasElement) => {
      fireHotspotTileCacheRef.current.set(key, canvas);
      touchCacheKey(key);

      while (fireHotspotTileCacheOrderRef.current.length > FIRE_HOTSPOT_TILE_CACHE_LIMIT) {
        const oldest = fireHotspotTileCacheOrderRef.current.shift();
        if (!oldest) break;
        fireHotspotTileCacheRef.current.delete(oldest);
      }
    };

    const layer = L.gridLayer({
      tileSize: 256,
      opacity: 1,
      zIndex: 340,
      className: 'fire-hotspot-layer-tiles',
    } as any);
    layer.on('tileabort', markCanvasTileAbandoned);
    layer.on('tileunload', markCanvasTileAbandoned);

    (layer as any).createTile = (coords: L.Coords, done: (error: Error | null, tile: HTMLCanvasElement) => void) => {
      const tile = document.createElement('canvas');
      tile.width = 256;
      tile.height = 256;

      const cacheKey = `${isoTime}|${thresholds.minRedBlueDiff}|${thresholds.minBrightness}|${coords.z}|${coords.x}|${coords.y}`;
      const cachedTile = fireHotspotTileCacheRef.current.get(cacheKey);
      if (cachedTile) {
        const tileCtx = tile.getContext('2d')!;
        tileCtx.drawImage(cachedTile, 0, 0);
        touchCacheKey(cacheKey);
        // See the identical comment in createCloudOnlyIrLayer above: calling done() synchronously
        // here — before this function returns — runs into a Leaflet GridLayer bug where
        // _tileReady() fires before _addTile() has registered this._tiles[key], so it silently
        // bails out and the tile never fades to visible. This was the exact cause of "toggle the
        // fire layer off then on again and it stays blank until you zoom" — the first activation
        // always goes through the async network-fetch path below (done() fires naturally on a
        // later tick), but re-enabling hits already-cached tiles and took this synchronous path.
        Promise.resolve().then(() => done(null, tile));
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

      const fireUrl = buildWmsTileUrl(LAYER_FIRETEMP, '', bbox, isoTime);

      const fireLoad = loadImageCancellable(fireUrl);
      const work = tile as HTMLCanvasElement & CanvasTileWork;
      work.__cancelLoads = [fireLoad.cancel];

      void fireLoad.promise
        .then((fireImage) => {
          // Discarded mid-flight by a zoom/pan — skip the pixel pass entirely.
          if (work.__abandoned) return;
          work.__cancelLoads = [];
          const fireCanvas = document.createElement('canvas');
          fireCanvas.width = 256;
          fireCanvas.height = 256;
          const fireCtx = fireCanvas.getContext('2d')!;
          fireCtx.drawImage(fireImage, 0, 0);
          const fireData = fireCtx.getImageData(0, 0, 256, 256).data;

          const outCtx = tile.getContext('2d')!;
          const outImage = outCtx.createImageData(256, 256);
          outImage.data.set(computeFireHotspotRgba(fireData, thresholds));
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
      // Every variant below is picked from the base layer actually rendered, not from
      // `activeLayers`. Once the night fallback puts raw IR underneath, the only blend that
      // leaves it intact is `screen`: VIS is black at night, and both `luminosity` (RGB+VIS) and
      // `soft-light` (VIS alone) take that black and crush the IR base with it — RGB+VIS at night
      // measured 52/255 mean luminance against 116 for the identical IR data in every other mode
      // (issue #71).
      isHybridMode && baseLayer !== 'ir',
      baseLayer === 'ir',
      activeLayers.rgb && activeLayers.vis && !activeLayers.ir && baseLayer !== 'ir',
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
      if (loadingStuckTimeoutRef.current !== null) {
        window.clearTimeout(loadingStuckTimeoutRef.current);
        loadingStuckTimeoutRef.current = null;
      }
    };
    // Mount-only by design: this builds the two Leaflet instances. Re-running it for any of the
    // values it reads would tear the maps down and rebuild them.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Loads a set of layers' tiles for `isoTime` into the browser's HTTP cache, without touching
   * what is on screen.
   *
   * Changing the time calls setParams(), setParams() calls redraw(), and redraw() calls
   * `_removeAllTiles()`: Leaflet wipes the map the instant the time changes and leaves it black
   * until every tile has come back from the server. On a large window under EUMETSAT's rate
   * limiting that takes about ten seconds — measured on 2560x1189: 103 of 110 tiles blank one
   * second after a single time step, still 55 blank at five seconds, back to 0 at nine. Stepping
   * again in the meantime restarts the wipe, which is the "tiles flicker then go black" of #79.
   *
   * Warming the cache first turns that reload into cache hits, so the previous frame simply stays
   * up until the new one is ready to appear all at once.
   *
   * The URLs come from Leaflet's own `getTileUrl` with the time temporarily swapped in, because a
   * hand-built URL would order its parameters differently and miss the cache. GetMap answers with
   * `cache-control: max-age=604800`, and neither these requests nor Leaflet's set `crossOrigin`,
   * so both land in the same cache partition.
   */
  /**
   * Whether what is on screen is worth protecting. Waiting for the new imagery only makes sense
   * if the frame it would replace is actually complete: during the initial load — or right after
   * one, when the app jumps to the verified latest slot — the map is still half empty, and
   * holding the switch back would just leave those holes on screen for longer.
   */
  const hasCompleteFrameOnScreen = () => {
    const container = map2Instance.current?.getContainer();
    if (!container) return false;
    const tiles = Array.from(container.querySelectorAll('img.leaflet-tile')) as HTMLImageElement[];
    if (tiles.length === 0) return false;
    const blank = tiles.filter((tile) => !tile.complete || tile.naturalWidth === 0).length;
    return blank / tiles.length < 0.1;
  };

  const prewarmTilesForTime = (
    layers: L.TileLayer.WMS[],
    isoTime: string,
    onProgress: (done: number, total: number) => void,
  ) => {
    const map = map2Instance.current;
    const images: HTMLImageElement[] = [];
    const cancel = () => {
      for (const image of images) {
        image.onload = null;
        image.onerror = null;
        image.src = EMPTY_IMAGE_DATA_URL;
      }
      images.length = 0;
    };
    if (!map || layers.length === 0) return { promise: Promise.resolve(), cancel };

    // The coordinates Leaflet is *currently* showing, rather than a range recomputed from the
    // pixel bounds: it has to be exactly the set Leaflet will ask for after the switch, or the
    // warm-up pays for tiles nobody wants while the ones that matter still arrive cold.
    const urls: string[] = [];
    for (const layer of layers) {
      const anyLayer = layer as any;
      if (!anyLayer.wmsParams || typeof anyLayer.getTileUrl !== 'function') continue;
      const previousTime = anyLayer.wmsParams.time;
      anyLayer.wmsParams.time = isoTime;
      try {
        for (const tile of Object.values(anyLayer._tiles ?? {}) as any[]) {
          if (!tile?.current || !tile.coords) continue;
          urls.push(anyLayer.getTileUrl(tile.coords));
        }
      } finally {
        anyLayer.wmsParams.time = previousTime;
      }
    }

    const total = urls.length;
    if (total === 0) return { promise: Promise.resolve(), cancel };

    let done = 0;
    const promise = new Promise<void>((resolve) => {
      const settle = () => {
        done += 1;
        onProgress(done, total);
        if (done >= total) resolve();
      };
      for (const url of urls) {
        const image = new Image();
        image.onload = settle;
        image.onerror = settle;
        image.src = url;
        images.push(image);
      }
    });

    return { promise, cancel };
  };

  useEffect(() => {
    let cancelled = false;
    let applied = false;
    let prewarm: { cancel: () => void } | null = null;
    let switchTimeout: number | null = null;

    const cleanUp = () => {
      cancelled = true;
      prewarm?.cancel();
      if (switchTimeout !== null) {
        window.clearTimeout(switchTimeout);
        switchTimeout = null;
      }
    };

    try {
      const isoTime = new Date(currentTime + 'Z').toISOString();

      const applyTime = () => {
        if (cancelled || applied) return;
        applied = true;
        if (switchTimeout !== null) {
          window.clearTimeout(switchTimeout);
          switchTimeout = null;
        }
        // Whatever the warm-up still has in flight is now redundant: Leaflet is about to request
        // the same tiles itself, and leaving both running only splits the rate-limit budget.
        prewarm?.cancel();
        // `setParams` makes Leaflet redraw every tile immediately, abandoning whatever was still
        // in flight for the previous time — those abandoned tiles' `tileloadstart` already
        // marked tiles pending (bindLayerLoading, above) but their `tileload`/`tileerror`
        // counterpart never fires once Leaflet drops the tile, so without this reset the pending
        // count could never return to 0 again. That left the "Chargement des tuiles" modal stuck
        // open indefinitely on repeated/rapid time changes (scrubbing the time slider) until some
        // unrelated change (e.g. toggling a layer, which does call beginLoadingCycle() below)
        // happened to reset it. beginLoadingCycle() is idempotent — safe to call on every time
        // change, including the initial one right after the mount effect already called it.
        beginLoadingCycle();
        secondaryBaseLayerRef.current?.setParams({ time: isoTime } as any);
        irFallbackBaseLayerRef.current?.setParams({ time: isoTime, styles: irStyle } as any);
        visOverlayLayerRef.current?.setParams({ time: isoTime } as any);
        irOverlayLayerRef.current?.setParams({ time: isoTime } as any);
      };

      // Only the layers actually on the map: `getTileUrl` reads `layer._map`, and the IR fallback
      // and IR overlay are both added conditionally.
      const layers = [
        secondaryBaseLayerRef.current,
        irFallbackBaseLayerRef.current,
        visOverlayLayerRef.current,
        irOverlayLayerRef.current,
      ].filter((layer): layer is L.TileLayer.WMS => Boolean(layer) && Boolean((layer as any)._map));

      // Nothing to preserve on the very first pass: the mount effect built these layers with this
      // time already, and redrawing them here would fetch the whole grid a second time.
      const alreadyShowingThisTime =
        layers.length > 0 && layers.every((layer) => (layer as any).wmsParams?.time === isoTime);
      if (alreadyShowingThisTime) return cleanUp;

      if (layers.length === 0 || !map2Instance.current || !hasCompleteFrameOnScreen()) {
        applyTime();
        return cleanUp;
      }

      // The modal has to stand in for the wait, since Leaflet isn't loading anything yet: the
      // whole point is that the map still shows the previous frame while this runs.
      setIsMapLoading(true);
      const warm = prewarmTilesForTime(layers, isoTime, (done, total) => {
        if (cancelled) return;
        setLoadingTileCount(Math.max(0, total - done));
        setLoadingProgress(Math.max(0, Math.min(99, Math.round((done / total) * 100))));
      });
      prewarm = warm;
      switchTimeout = window.setTimeout(applyTime, TIME_PREWARM_TIMEOUT_MS);
      void warm.promise.then(applyTime);
    } catch (e) {
      console.warn('Invalid time format', e);
    }

    return cleanUp;
    // `irStyle` changes are handled by the layer-building effect, which recreates the layers; a
    // second path here would refetch the grid for a change already taken care of.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime]);

  useEffect(() => {
    hybridTileCacheRef.current.clear();
    hybridTileCacheOrderRef.current = [];

    const map2 = map2Instance.current;
    if (!map2) return;

    beginLoadingCycle();

    // `currentTimeRef`, not `currentTime`: this effect rebuilds every WMS layer from scratch, and
    // rebuilding means Leaflet drops all their tiles and refetches the grid. Doing that on a time
    // change blanked the map for as long as the refetch took — about ten seconds on a large
    // window under EUMETSAT's rate limiting (issue #79). Layer *identity* depends on the mode and
    // the style; the time is only a parameter, and the effect above now hands it over with
    // `setParams` once the new imagery is cached.
    const isoTime = new Date(currentTimeRef.current + 'Z').toISOString();
    secondaryBaseLayerRef.current?.remove();
    secondaryBaseLayerRef.current = createSecondaryBaseLayer(baseLayer, isoTime, irStyle).addTo(map2);

    if (irFallbackBaseLayerRef.current && map2.hasLayer(irFallbackBaseLayerRef.current)) {
      irFallbackBaseLayerRef.current.remove();
    }
    irFallbackBaseLayerRef.current = createIrFallbackBaseLayer(isoTime, irStyle);
    if (isVisIrMode && baseLayer !== 'ir' && cloudOnlyIrNightFloor > 0.01) {
      // Crossfades a bright raw-IR layer in underneath the cloud-only composite as dusk
      // approaches: the composite is blended in `mix-blend-mode: color`, which takes its
      // luminosity from the VIS backdrop, so it necessarily dims as VIS does. Brightening the
      // backdrop itself here (rather than just the composite's own alpha) is what lets the
      // whole stack ramp up smoothly instead of jumping the moment baseLayer hard-switches to
      // raw IR (see shouldPreferIrBaseAtNight) — by then cloudOnlyIrNightFloor is already 1, so
      // this layer is already at full opacity and looks identical to the post-switch base layer.
      // Kept in sync with further solar-elevation-driven changes (panning) by the dedicated
      // cloud-only-IR effect below, not here — this effect only runs on mode/time/style changes.
      irFallbackBaseLayerRef.current.addTo(map2);
      irFallbackBaseLayerRef.current.setOpacity(cloudOnlyIrNightFloor);
    }

    if (visOverlayLayerRef.current && map2.hasLayer(visOverlayLayerRef.current)) {
      visOverlayLayerRef.current.remove();
    }
    if (irOverlayLayerRef.current && map2.hasLayer(irOverlayLayerRef.current)) {
      irOverlayLayerRef.current.remove();
    }

    visOverlayLayerRef.current = createVisOverlayLayer(
      isoTime,
      // Every variant below is picked from the base layer actually rendered, not from
      // `activeLayers`. Once the night fallback puts raw IR underneath, the only blend that
      // leaves it intact is `screen`: VIS is black at night, and both `luminosity` (RGB+VIS) and
      // `soft-light` (VIS alone) take that black and crush the IR base with it — RGB+VIS at night
      // measured 52/255 mean luminance against 116 for the identical IR data in every other mode
      // (issue #71).
      isHybridMode && baseLayer !== 'ir',
      baseLayer === 'ir',
      activeLayers.rgb && activeLayers.vis && !activeLayers.ir && baseLayer !== 'ir',
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
      // The cloud-only IR canvas layer itself is created/refreshed by a dedicated
      // effect below, keyed only on the inputs that actually affect its pixels.
      // This avoids tearing down the (network-heavy) WMS base/overlay layers above
      // just because the cloud-detection mask weight nudged slightly on map pan.
    } else if (isIrOverlayEnabled) {
      if (!map2.hasLayer(irOverlayLayer)) {
        irOverlayLayer.addTo(map2);
      }
      irOverlayLayer.setOpacity(activeLayers.rgb ? effectiveHybridIrOpacity : sandwichOpacity);
    } else if (map2.hasLayer(irOverlayLayer)) {
      irOverlayLayer.remove();
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
    // Deliberately narrow. `currentTime` is absent because including it made `setParams` wipe the
    // entire tile grid on every time change (PR #82), and the opacities are applied by the sync
    // effect below instead of by tearing these layers down.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [
    baseLayer,
    irStyle,
    isHybridMode,
    isVisIrMode,
    isRgbIrMode,
    isCloudOnlyIrMode,
    isIrOverlayEnabled,
    isVisOverlayEnabled,
  ]);

  // Cloud-only IR canvas layer: split out from the effect above so that panning
  // (which continuously nudges cloudOnlyIrVisMaskWeight via solar elevation) only
  // regenerates this one already-cached canvas layer instead of tearing down and
  // re-fetching every WMS base/overlay layer on the map.
  useEffect(() => {
    const map2 = map2Instance.current;
    if (!map2 || !isCloudOnlyIrMode) {
      if (irCloudOnlyLayerRef.current && map2?.hasLayer(irCloudOnlyLayerRef.current)) {
        irCloudOnlyLayerRef.current.remove();
      }
      return;
    }

    const isoTime = new Date(currentTime + 'Z').toISOString();

    if (irCloudOnlyLayerRef.current && map2.hasLayer(irCloudOnlyLayerRef.current)) {
      irCloudOnlyLayerRef.current.remove();
    }
    irCloudOnlyLayerRef.current = createCloudOnlyIrLayer(isoTime, irStyle, cloudOnlyIrVisMaskWeight, !isVisIrMode, cloudOnlyIrNightFloor);
    const unbindHybridLoading = bindLayerLoading(irCloudOnlyLayerRef.current);
    irCloudOnlyLayerRef.current.addTo(map2);
    irCloudOnlyLayerRef.current.setOpacity(effectiveCloudOnlyIrOpacity);

    // Keep the dusk crossfade layer (mounted by the effect above, which doesn't re-run on pan)
    // in sync with cloudOnlyIrNightFloor as solar elevation drifts while panning.
    const irFallback = irFallbackBaseLayerRef.current;
    if (isVisIrMode && irFallback) {
      if (cloudOnlyIrNightFloor > 0.01) {
        if (!map2.hasLayer(irFallback)) {
          irFallback.addTo(map2);
        }
        irFallback.setOpacity(cloudOnlyIrNightFloor);
      } else if (map2.hasLayer(irFallback)) {
        irFallback.remove();
      }
    }

    return () => {
      unbindHybridLoading();
    };
    // The opacities are applied by the sync effect below rather than by rebuilding this layer:
    // panning nudges the mask weight continuously, and this canvas layer is expensive to remake.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [isCloudOnlyIrMode, isVisIrMode, currentTime, irStyle, cloudOnlyIrVisMaskWeight, cloudOnlyIrNightFloor]);

  // Fire hotspot overlay: isolated from the WMS base/overlay effect above for the same reason
  // as the cloud-only-IR canvas layer — its thresholds are tuned live via sliders, and bundling
  // it into the big rebuild effect would force a full tile refetch of every other layer on
  // every threshold tweak. Thresholds are the debounced copy (see above) so dragging a slider
  // doesn't tear the layer down on every intermediate value. Its tile loading is deliberately
  // NOT wired into bindLayerLoading/the shared "Chargement des tuiles" indicator: that banner is
  // meant for the base satellite imagery, and wiring this lightweight, client-side-recomputed
  // overlay into it made every threshold tweak look like the whole map was reloading.
  useEffect(() => {
    const map2 = map2Instance.current;
    if (!map2 || !fireHotspotEnabled) {
      if (fireHotspotLayerRef.current && map2?.hasLayer(fireHotspotLayerRef.current)) {
        fireHotspotLayerRef.current.remove();
      }
      return;
    }

    const isoTime = new Date(currentTime + 'Z').toISOString();

    if (fireHotspotLayerRef.current && map2.hasLayer(fireHotspotLayerRef.current)) {
      fireHotspotLayerRef.current.remove();
    }
    fireHotspotLayerRef.current = createFireHotspotLayer(isoTime, debouncedFireHotspotThresholds);
    fireHotspotLayerRef.current.addTo(map2);
    fireHotspotLayerRef.current.setOpacity(fireHotspotOpacity);
    // `fireHotspotOpacity` is applied by the opacity-sync effect below, which lists it. Adding it
    // here would rebuild the whole hotspot layer on every drag of the slider.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [fireHotspotEnabled, currentTime, debouncedFireHotspotThresholds]);

  useEffect(() => {
    const map2 = map2Instance.current;
    const visOverlayLayer = visOverlayLayerRef.current;
    const irOverlayLayer = irOverlayLayerRef.current;
    const irCloudOnlyLayer = irCloudOnlyLayerRef.current;

    if (map2 && visOverlayLayer && isVisOverlayEnabled && map2.hasLayer(visOverlayLayer)) {
      visOverlayLayer.setOpacity(currentVisOverlayOpacity);
    }
    if (map2 && !isHybridMode && irOverlayLayer && isIrOverlayEnabled && map2.hasLayer(irOverlayLayer)) {
      irOverlayLayer.setOpacity(activeLayers.rgb ? effectiveHybridIrOpacity : sandwichOpacity);
    }
    if (map2 && isCloudOnlyIrMode && irCloudOnlyLayer && map2.hasLayer(irCloudOnlyLayer)) {
      irCloudOnlyLayer.setOpacity(effectiveCloudOnlyIrOpacity);
    }
    if (map2 && fireHotspotEnabled && fireHotspotLayerRef.current && map2.hasLayer(fireHotspotLayerRef.current)) {
      fireHotspotLayerRef.current.setOpacity(fireHotspotOpacity);
    }
  }, [
    baseLayer,
    activeLayers.rgb,
    activeLayers.ir,
    currentVisOverlayOpacity,
    effectiveCloudOnlyIrOpacity,
    effectiveHybridIrOpacity,
    fireHotspotEnabled,
    fireHotspotOpacity,
    isHybridMode,
    isVisIrMode,
    isRgbIrMode,
    isCloudOnlyIrMode,
    isIrOverlayEnabled,
    isVisOverlayEnabled,
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
    // `borderStrokeOpacity` and `departmentsStrokeOpacity` are clamps *of* `mapOptions`, which is
    // already listed, and `renderCityLabelsOnMap` is a pure renderer recreated on every pass.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [mapOptions, mapsReady]);

  return {
    cityLoadPromiseRef,
    effectiveHybridVisOpacity,
    effectiveSandwichOpacity,
    getVisibleCityFeatures,
    isNightIrFallbackActive,
    isRgbVisOnlyMode,
    rgbVisOnlyNightBrightness,
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