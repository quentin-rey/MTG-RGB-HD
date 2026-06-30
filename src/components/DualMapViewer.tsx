import React, { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { Download, Loader2 } from 'lucide-react';
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
import { downloadSatellitePack } from './dualMapExport';
import { useDualMapLeaflet } from './useDualMapLeaflet';
import {
  DateTimePopover,
  DownloadModal,
  HeaderInfoButton,
  InfoModal,
  Map2ControlBar,
  Map2TitleBadge,
  SettingsPopover,
} from './dualMapViewerPanels';
import { useImageAdjustments } from './useImageAdjustments';
import { useViewerPanelsState } from './useViewerPanelsState';

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

  const {
    adjustmentsRef,
    datePickerRef,
    downloadModalRef,
    infoRef,
    isAdjustmentsOpen,
    isDatePickerOpen,
    isDownloadModalOpen,
    isInfoOpen,
    isSettingsOpen,
    setIsAdjustmentsOpen,
    setIsDatePickerOpen,
    setIsDownloadModalOpen,
    setIsInfoOpen,
    setIsSettingsOpen,
    settingsRef,
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
  
  const [mapOptions, setMapOptions] = useState<MapOptions>(() => {
    const defaults: MapOptions = { showBorders: false, showCities: false, showFranceDepartments: false };
    const stored = readStoredJson<MapOptions>(STORAGE_KEYS.mapOptions, defaults);
    return { ...defaults, ...stored };
  });

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.mapOptions, JSON.stringify(mapOptions));
  }, [mapOptions]);

  // Initialize time to current time (rounded to nearest 10 mins as MTG is every 10 min, with buffer)
  const [currentTime, setCurrentTime] = useState(() => getLatestAvailableTime());

  const {
    cityLoadPromiseRef,
    effectiveHybridVisOpacity,
    effectiveSandwichOpacity,
    getVisibleCityFeatures,
    isMapLoading,
    loadingProgress,
    loadingTileCount,
    map1BordersRef,
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
  const availableExportKinds: ExportKind[] = getAvailableExportKindsFromLayers(activeLayers);
  const selectedExportKinds = availableExportKinds.filter((kind) => selectedExports[kind]);

  const handleTimeChange = (newTimeStr: string) => {
    const newTime = new Date(newTimeStr);
    const maxTime = new Date(getLatestAvailableTime());

    if (newTime > maxTime) {
      setCurrentTime(getLatestAvailableTime());
    } else {
      setCurrentTime(newTimeStr);
    }
  };

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
        map1BordersLayer: map1BordersRef.current,
        cityLoadPromise: cityLoadPromiseRef.current,
        getVisibleCityFeatures,
      });
    } catch (err) {
      console.error('Export failed:', err);
      alert("L'exportation a échoué. Veuillez vérifier votre connexion réseau.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-white font-sans overflow-hidden">
      <div className="h-16 flex items-center justify-between px-3 sm:px-6 bg-[#111] border-b border-white/10 shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
            <span className="font-bold text-sm tracking-tighter">MTG</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-base sm:text-lg font-medium tracking-tight text-slate-100 whitespace-nowrap">MTG-RGB-HD</h1>
            <p className="hidden md:block text-xs text-slate-400 whitespace-nowrap">Visualisation VIS 0.6, RGB et Sandwich(IR)</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 relative">
          <DateTimePopover
            currentTime={currentTime}
            datePickerRef={datePickerRef}
            isOpen={isDatePickerOpen}
            onLatest={() => handleTimeChange(getLatestAvailableTime())}
            onTimeChange={handleTimeChange}
            onToggle={() => setIsDatePickerOpen(!isDatePickerOpen)}
          />

          <SettingsPopover
            isOpen={isSettingsOpen}
            mapOptions={mapOptions}
            onClose={() => setIsSettingsOpen(false)}
            onToggle={() => setIsSettingsOpen(!isSettingsOpen)}
            onUpdate={setMapOptions}
            settingsRef={settingsRef}
          />

          <HeaderInfoButton onClick={() => setIsInfoOpen(true)} />

          <button
            onClick={openDownloadModal}
            disabled={isExporting}
            className="flex items-center justify-center gap-2 bg-white text-black hover:bg-slate-200 w-9 h-9 sm:w-auto sm:px-4 sm:py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Download className="w-4 h-4 shrink-0" />}
            <span className="hidden sm:inline">{isExporting ? 'Génération...' : 'Télécharger'}</span>
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

          <Map2TitleBadge activeLayers={activeLayers} />

            <Map2ControlBar
              activeLayers={activeLayers}
              adjustmentsRef={adjustmentsRef}
              autoReduceVisAtNight={autoReduceVisAtNight}
              effectiveHybridVisOpacity={effectiveHybridVisOpacity}
              effectiveSandwichOpacity={effectiveSandwichOpacity}
              irStyle={irStyle}
              isAdjustmentsOpen={isAdjustmentsOpen}
              onActiveLayersChange={(next) => setActiveLayers(sanitizeActiveLayers(next))}
              onAutoReduceVisAtNightChange={setAutoReduceVisAtNight}
              onIrStyleChange={setIrStyle}
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
              visBrightness={visBrightness}
              visContrast={visContrast}
            />

          <div ref={map2Ref} className="w-full h-full bg-[#0a0a0a] !z-0" />

          {isMapLoading && (
            <div className="absolute inset-0 z-[390] pointer-events-none flex items-end justify-center pb-6">
              <div className="bg-black/65 backdrop-blur-md border border-white/15 rounded-lg px-4 py-3 text-xs text-slate-100 shadow-2xl w-[280px]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-300" />
                    <span>Chargement des tuiles</span>
                  </div>
                  <span className="text-blue-200 font-mono tabular-nums">{loadingProgress}%</span>
                </div>

                <div className="mt-2 h-1.5 w-full rounded bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-blue-400 transition-[width] duration-150"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>

                {loadingTileCount > 0 && (
                  <div className="mt-1 text-[11px] text-slate-300 font-mono">Tuiles en attente: {loadingTileCount}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <InfoModal infoRef={infoRef} isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />

      <DownloadModal
        availableExportKinds={availableExportKinds}
        downloadModalRef={downloadModalRef}
        isExporting={isExporting}
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
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
          filter: saturate(${rgbSaturation});
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
          mix-blend-mode: luminosity;
          filter: brightness(${visBrightness}) contrast(${visContrast});
        }
      `}</style>
    </div>
  );
}
