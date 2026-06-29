import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Download, Loader2, Info, Clock, Layers, Settings, X } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// EUMETView Configuration
// MSG standard layers are used by default for reliability as MTG is progressively rolling out on WMS.
// You can replace these with MTG layers (e.g., mtg_fci:rgb_truecolor) when they are fully stable.
const WMS_URL_DIRECT = 'https://view.eumetsat.int/geoserver/ows';
const WMS_URL_PROXY = '/api/wms';
const LAYER_VIS = 'mtg_fd:vis06_hrfi';
const LAYER_RGB = 'mtg_fd:rgb_truecolour';

export default function DualMapViewer() {
  const map1Ref = useRef<HTMLDivElement>(null);
  const map2Ref = useRef<HTMLDivElement>(null);
  const map1Instance = useRef<L.Map | null>(null);
  const map2Instance = useRef<L.Map | null>(null);
  const visLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const rgbLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const fusionLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const map1BordersRef = useRef<L.GeoJSON | null>(null);
  const map2BordersRef = useRef<L.GeoJSON | null>(null);
  const map1CitiesRef = useRef<L.TileLayer | null>(null);
  const map2CitiesRef = useRef<L.TileLayer | null>(null);
  
  const isSyncing = useRef(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isFusionMode, setIsFusionMode] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mapOptions, setMapOptions] = useState(() => {
    try {
      const saved = localStorage.getItem('mtg_map_options');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { showBorders: false, showCities: false };
  });

  useEffect(() => {
    localStorage.setItem('mtg_map_options', JSON.stringify(mapOptions));
  }, [mapOptions]);

  // Initialize time to current time (rounded to nearest 10 mins as MTG is every 10 min)
  const [currentTime, setCurrentTime] = useState(() => {
    const now = new Date();
    now.setMinutes(Math.floor(now.getMinutes() / 10) * 10);
    now.setSeconds(0);
    now.setMilliseconds(0);
    return now.toISOString().slice(0, 16); // format: YYYY-MM-DDThh:mm
  });

  useEffect(() => {
    if (!map1Ref.current || !map2Ref.current) return;
    if (map1Instance.current || map2Instance.current) return;

    // Fix for Leaflet tile pane z-index overlapping UI
    L.Icon.Default.imagePath = '/';

    // Initialize Map 1 (VIS)
    const map1 = L.map(map1Ref.current, {
      center: [46.603354, 1.888334],
      zoom: 5,
      zoomControl: false,
      attributionControl: false
    });
    
    // Add base map for orientation
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors, © CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map1);

    const visLayer = L.tileLayer.wms(WMS_URL_DIRECT, {
      layers: LAYER_VIS,
      format: 'image/png',
      transparent: true,
      attribution: '© EUMETSAT',
      time: new Date(currentTime).toISOString()
    } as any).addTo(map1);
    visLayerRef.current = visLayer;

    L.control.attribution({ position: 'bottomleft' }).addTo(map1);

    // Initialize Map 2 (RGB)
    const map2 = L.map(map2Ref.current, {
      center: [46.603354, 1.888334],
      zoom: 5,
      zoomControl: false,
      attributionControl: false
    });

    // Add base map for orientation
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors, © CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map2);

    const rgbLayer = L.tileLayer.wms(WMS_URL_DIRECT, {
      layers: LAYER_RGB,
      format: 'image/png',
      transparent: true,
      attribution: '© EUMETSAT',
      time: new Date(currentTime).toISOString()
    } as any).addTo(map2);
    rgbLayerRef.current = rgbLayer;

    // Create the fusion overlay layer (not added to map yet)
    const fusionLayer = L.tileLayer.wms(WMS_URL_DIRECT, {
      layers: LAYER_VIS,
      format: 'image/png',
      transparent: true,
      time: new Date(currentTime).toISOString(),
      className: 'mix-blend-luminosity contrast-125 transition-opacity duration-500 ease-in-out',
      opacity: 0
    } as any);
    fusionLayerRef.current = fusionLayer;

    L.control.attribution({ position: 'bottomright' }).addTo(map2);

    // Strict 2-way sync logic to prevent infinite loops
    const syncMaps = (source: L.Map, target: L.Map) => {
      source.on('move', () => {
        if (!isSyncing.current) {
          isSyncing.current = true;
          target.setView(source.getCenter(), source.getZoom(), { animate: false });
          isSyncing.current = false;
        }
      });
    };

    syncMaps(map1, map2);
    syncMaps(map2, map1);

    map1Instance.current = map1;
    map2Instance.current = map2;
    setMapsReady(true);

    return () => {
      map1.remove();
      map2.remove();
      map1Instance.current = null;
      map2Instance.current = null;
    };
  }, []); // Run once on mount

  // Effect to handle time changes
  useEffect(() => {
    try {
      const isoTime = new Date(currentTime).toISOString();
      if (visLayerRef.current) {
        visLayerRef.current.setParams({ time: isoTime } as any);
      }
      if (rgbLayerRef.current) {
        rgbLayerRef.current.setParams({ time: isoTime } as any);
      }
      if (fusionLayerRef.current) {
        fusionLayerRef.current.setParams({ time: isoTime } as any);
      }
    } catch (e) {
      console.warn("Invalid time format", e);
    }
  }, [currentTime]);

  // Effect to toggle fusion mode layer on Map 2
  useEffect(() => {
    if (!map2Instance.current || !fusionLayerRef.current) return;
    
    if (isFusionMode) {
      fusionLayerRef.current.addTo(map2Instance.current);
      setTimeout(() => {
        if (fusionLayerRef.current) {
          fusionLayerRef.current.setOpacity(0.8);
        }
      }, 50);
    } else {
      if (map2Instance.current.hasLayer(fusionLayerRef.current)) {
        fusionLayerRef.current.setOpacity(0);
        setTimeout(() => {
          if (!isFusionMode && fusionLayerRef.current) {
            fusionLayerRef.current.remove();
          }
        }, 500);
      }
    }
  }, [isFusionMode]);

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setIsDatePickerOpen(false);
      }
      if (infoRef.current && !infoRef.current.contains(event.target as Node)) {
        setIsInfoOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false);
        setIsDatePickerOpen(false);
        setIsInfoOpen(false);
      }
    };
    if (isSettingsOpen || isDatePickerOpen || isInfoOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isSettingsOpen, isDatePickerOpen, isInfoOpen]);

  // Effect to toggle overlays based on options
  useEffect(() => {
    if (!mapsReady || !map1Instance.current || !map2Instance.current) return;

    // Initialize borders
    if (!map1BordersRef.current) {
      map1BordersRef.current = L.geoJSON(undefined, {
        style: { color: 'rgba(255, 255, 255, 0.4)', weight: 1, fillOpacity: 0 },
        interactive: false
      });
      map2BordersRef.current = L.geoJSON(undefined, {
        style: { color: 'rgba(255, 255, 255, 0.4)', weight: 1, fillOpacity: 0 },
        interactive: false
      });
      
      fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
        .then(res => res.json())
        .then(data => {
          if (map1BordersRef.current) map1BordersRef.current.addData(data);
          if (map2BordersRef.current) map2BordersRef.current.addData(data);
        })
        .catch(err => console.error("Could not load borders:", err));
    }

    // Initialize cities/labels
    if (!map1CitiesRef.current) {
      const citiesUrl = 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png';
      map1CitiesRef.current = L.tileLayer(citiesUrl, {
        zIndex: 1000,
        opacity: 0.8,
        interactive: false
      } as any);
      map2CitiesRef.current = L.tileLayer(citiesUrl, {
        zIndex: 1000,
        opacity: 0.8,
        interactive: false
      } as any);
    }

    // Toggle Borders
    if (mapOptions.showBorders) {
      if (!map1Instance.current.hasLayer(map1BordersRef.current)) map1BordersRef.current.addTo(map1Instance.current);
      if (!map2Instance.current.hasLayer(map2BordersRef.current)) map2BordersRef.current.addTo(map2Instance.current);
    } else {
      if (map1Instance.current.hasLayer(map1BordersRef.current)) map1BordersRef.current.remove();
      if (map2Instance.current.hasLayer(map2BordersRef.current)) map2BordersRef.current.remove();
    }

    // Toggle Cities
    if (mapOptions.showCities) {
      if (!map1Instance.current.hasLayer(map1CitiesRef.current)) map1CitiesRef.current.addTo(map1Instance.current);
      if (!map2Instance.current.hasLayer(map2CitiesRef.current)) map2CitiesRef.current.addTo(map2Instance.current);
    } else {
      if (map1Instance.current.hasLayer(map1CitiesRef.current)) map1CitiesRef.current.remove();
      if (map2Instance.current.hasLayer(map2CitiesRef.current)) map2CitiesRef.current.remove();
    }
  }, [mapOptions, mapsReady]);

  const downloadPack = async () => {
    if (!map1Instance.current) return;
    setIsExporting(true);

    try {
      const map = map1Instance.current;
      const exportBounds = map.getBounds();
      const ne = L.CRS.EPSG3857.project(exportBounds.getNorthEast());
      const sw = L.CRS.EPSG3857.project(exportBounds.getSouthWest());
      const bbox = `${sw.x},${sw.y},${ne.x},${ne.y}`;
      
      // Determine export size based on the current container dimensions
      const rect = map1Ref.current!.getBoundingClientRect();
      const width = Math.min(Math.round(rect.width), 4096);
      const height = Math.min(Math.round(rect.height), 4096);
      const isoTime = new Date(currentTime).toISOString();

      const buildWmsUrl = (layer: string) => {
        return `${WMS_URL_PROXY}?service=WMS&request=GetMap&layers=${layer}&styles=&format=image/png&transparent=true&version=1.1.1&srs=EPSG:3857&bbox=${bbox}&width=${width}&height=${height}&time=${isoTime}`;
      };

      const loadImage = (url: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Failed to load: ${url}`));
          img.src = url;
        });
      };

      // Fetch images via our Express Proxy to bypass CORS restrictions for the Canvas processing
      const [imgVis, imgRgb] = await Promise.all([
        loadImage(buildWmsUrl(LAYER_VIS)),
        loadImage(buildWmsUrl(LAYER_RGB))
      ]);

      // Create an offscreen canvas to perform the fusion
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      // FUSION LOGIC: Draw RGB, then blend VIS 0.6 in "luminosity" mode
      // Improve saturation and brightness of RGB first
      ctx.filter = 'saturate(130%) brightness(105%)';
      ctx.drawImage(imgRgb, 0, 0);
      
      // Then apply VIS as luminosity with enhanced contrast
      ctx.filter = 'contrast(120%)';
      ctx.globalCompositeOperation = 'luminosity';
      ctx.globalAlpha = 0.85; // Allow some original RGB luminance to pass through
      ctx.drawImage(imgVis, 0, 0);
      
      // Reset context
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.filter = 'none';

      const applyWatermark = (context: CanvasRenderingContext2D, w: number, h: number) => {
        context.save();
        context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        context.fillRect(w - 320, h - 30, 320, 30);
        context.fillStyle = 'rgba(255, 255, 255, 0.9)';
        context.font = '12px "JetBrains Mono", monospace, sans-serif';
        context.textAlign = 'right';
        context.textBaseline = 'middle';
        context.fillText('Sources: EUMETSAT / MTG | Quentin Rey', w - 10, h - 15);
        context.restore();
      };

      // Apply watermark to fusion canvas
      // (Moved inside getBlob for individual application)

      const drawOverlays = async (context: CanvasRenderingContext2D, w: number, h: number) => {
        // Draw Borders
        if (mapOptions.showBorders && map1BordersRef.current) {
          const data = (map1BordersRef.current.toGeoJSON() as any);
          context.save();
          context.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          context.lineWidth = 1;
          context.beginPath();
          
          const drawLineString = (coords: any[]) => {
            coords.forEach((coord, i) => {
              const pt = map1Instance.current!.latLngToContainerPoint([coord[1], coord[0]]);
              if (i === 0) context.moveTo(pt.x, pt.y);
              else context.lineTo(pt.x, pt.y);
            });
          };

          data.features?.forEach((feature: any) => {
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
          context.restore();
        }

        // Draw Cities (CartoDB tiles)
        if (mapOptions.showCities) {
           const zoom = Math.round(map1Instance.current!.getZoom());
           const bounds = map1Instance.current!.getPixelBounds();
           const tileSize = 256;
           
           const minX = Math.floor(bounds.min!.x / tileSize);
           const maxX = Math.floor(bounds.max!.x / tileSize);
           const minY = Math.floor(bounds.min!.y / tileSize);
           const maxY = Math.floor(bounds.max!.y / tileSize);

           const promises = [];
           for (let x = minX; x <= maxX; x++) {
             for (let y = minY; y <= maxY; y++) {
               promises.push(new Promise<void>((resolve) => {
                 const img = new Image();
                 img.crossOrigin = 'anonymous';
                 img.onload = () => {
                   const px = x * tileSize - bounds.min!.x;
                   const py = y * tileSize - bounds.min!.y;
                   context.globalAlpha = 0.8;
                   context.drawImage(img, px, py, tileSize, tileSize);
                   context.globalAlpha = 1.0;
                   resolve();
                 };
                 img.onerror = () => resolve(); // Ignore failed tiles
                 img.src = `https://a.basemaps.cartocdn.com/dark_only_labels/${zoom}/${x}/${y}.png`;
               }));
             }
           }
           await Promise.all(promises);
        }
      };

      const getBlob = async (canvasObj: HTMLCanvasElement | HTMLImageElement): Promise<Blob> => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d')!;
        
        tempCtx.drawImage(canvasObj, 0, 0);

        await drawOverlays(tempCtx, width, height);
        applyWatermark(tempCtx, width, height);

        return new Promise(resolve => tempCanvas.toBlob(b => resolve(b!), 'image/png'));
      };

      const [blobVis, blobRgb, blobFusion] = await Promise.all([
        getBlob(imgVis),
        getBlob(imgRgb),
        getBlob(canvas)
      ]);

      const safeTimeStr = currentTime.replace('T', '_').replace(/:/g, '-');

      const zip = new JSZip();
      zip.file(`1_VIS_0.6_${safeTimeStr}.png`, blobVis);
      zip.file(`2_RGB_${safeTimeStr}.png`, blobRgb);
      zip.file(`3_FUSION_RGB_VIS_${safeTimeStr}.png`, blobFusion);

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, `MTG_SATELLITE_PACK_${safeTimeStr}.zip`);

    } catch (err) {
      console.error("Export failed:", err);
      alert("L'exportation a échoué. Assurez-vous que le serveur proxy fonctionne (pas d'erreurs réseau).");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-white font-sans overflow-hidden">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-6 bg-[#111] border-b border-white/10 shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
            <span className="font-bold text-sm tracking-tighter">MTG</span>
          </div>
          <div>
            <h1 className="text-lg font-medium tracking-tight text-slate-100">MTG-RGB-HD</h1>
            <p className="text-xs text-slate-400">Visualisation VIS 0.6 & RGB</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 relative">
          {/* Custom Date/Time Picker */}
          <div className="relative" ref={datePickerRef}>
            <button
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
              className="flex items-center gap-2 bg-[#222] border border-white/10 rounded-md px-3 py-1.5 text-sm text-white hover:bg-[#333] transition-colors"
            >
              <Clock className="w-4 h-4 text-slate-400" />
              {currentTime.split('T')[0]} à {currentTime.split('T')[1].replace(':', 'h')}
            </button>
            
            {isDatePickerOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[#1a1a1a] border border-white/10 rounded-md shadow-2xl p-4 z-50">
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1.5 block">Date</label>
                    <input 
                      type="date"
                      value={currentTime.split('T')[0]}
                      onChange={(e) => {
                        if(e.target.value) setCurrentTime(`${e.target.value}T${currentTime.split('T')[1]}`);
                      }}
                      className="w-full bg-[#222] border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500 [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert cursor-pointer"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-400 mb-1.5 block">Heure</label>
                      <select 
                        value={currentTime.split('T')[1].split(':')[0]}
                        onChange={(e) => {
                          const currentMins = currentTime.split('T')[1].split(':')[1];
                          setCurrentTime(`${currentTime.split('T')[0]}T${e.target.value}:${currentMins}`);
                        }}
                        className="w-full bg-[#222] border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500 cursor-pointer"
                      >
                        {Array.from({length: 24}).map((_, i) => {
                          const h = String(i).padStart(2, '0');
                          return <option key={h} value={h}>{h}h</option>
                        })}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-400 mb-1.5 block">Minute</label>
                      <select 
                        value={currentTime.split('T')[1].split(':')[1]}
                        onChange={(e) => {
                          const currentHour = currentTime.split('T')[1].split(':')[0];
                          setCurrentTime(`${currentTime.split('T')[0]}T${currentHour}:${e.target.value}`);
                        }}
                        className="w-full bg-[#222] border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500 cursor-pointer"
                      >
                        {['00', '10', '20', '30', '40', '50'].map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="flex items-center justify-center w-9 h-9 bg-[#222] border border-white/10 rounded-md hover:bg-[#333] transition-colors"
              title="Options"
            >
              <Settings className="w-4 h-4 text-slate-300" />
            </button>
            
            {isSettingsOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[#1a1a1a] border border-white/10 rounded-md shadow-2xl p-4 z-50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white">Options d'affichage</h3>
                  <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white transition-colors">
                    <input 
                      type="checkbox" 
                      checked={mapOptions.showBorders}
                      onChange={(e) => setMapOptions({...mapOptions, showBorders: e.target.checked})}
                      className="w-4 h-4 rounded-sm accent-blue-500"
                    />
                    Affichage des frontières
                  </label>
                  
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white transition-colors">
                    <input 
                      type="checkbox" 
                      checked={mapOptions.showCities}
                      onChange={(e) => setMapOptions({...mapOptions, showCities: e.target.checked})}
                      className="w-4 h-4 rounded-sm accent-blue-500"
                    />
                    Affichage des villes
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setIsInfoOpen(true)}
              className="flex items-center justify-center w-9 h-9 bg-[#222] border border-white/10 rounded-md hover:bg-[#333] transition-colors"
              title="Informations"
            >
              <Info className="w-4 h-4 text-slate-300" />
            </button>
          </div>

          <button
            onClick={downloadPack}
            disabled={isExporting}
            className="flex items-center gap-2 bg-white text-black hover:bg-slate-200 px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isExporting ? 'Génération du pack...' : 'Télécharger les images'}
          </button>
        </div>
      </div>

      {/* Maps Layout */}
      <div className="flex-1 flex flex-col md:flex-row w-full min-h-0 relative z-0">
        {/* Map 1: VIS */}
        <div className="flex-1 relative border-r border-white/10 z-0 h-full">
          <div className="absolute top-4 left-4 z-[400] bg-black/60 backdrop-blur-md px-3 py-1.5 rounded text-xs font-mono font-medium border border-white/10 pointer-events-none text-white shadow-xl">
            Couche: VIS 0.6 µm
          </div>
          <div ref={map1Ref} className="w-full h-full bg-[#0a0a0a] !z-0" />
        </div>
        
        {/* Map 2: RGB */}
        <div className="flex-1 relative z-0 h-full">
          <div className="absolute top-4 left-4 z-[400] bg-black/60 backdrop-blur-md px-3 py-1.5 rounded text-xs font-mono font-medium border border-white/10 pointer-events-none text-white shadow-xl">
            {isFusionMode ? 'Couche: FUSION (RGB + VIS)' : 'Couche: RGB Natural'}
          </div>
          
          <div className="absolute top-4 right-4 z-[400] flex items-center gap-2">
            <label 
              className={`flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer shadow-xl transition-colors ${
                isFusionMode 
                  ? 'border-blue-500 text-blue-400 hover:bg-black/80' 
                  : 'border-white/10 text-white hover:bg-black/80'
              }`}
              title="Visualisation HD"
            >
              <input 
                type="checkbox" 
                checked={isFusionMode}
                onChange={(e) => setIsFusionMode(e.target.checked)}
                className="w-3.5 h-3.5 rounded-sm accent-blue-500 cursor-pointer"
              />
              HD
            </label>
          </div>

          <div ref={map2Ref} className="w-full h-full bg-[#0a0a0a] !z-0" />
        </div>
      </div>

      {isInfoOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div ref={infoRef} className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">À propos</h3>
              <button onClick={() => setIsInfoOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
              <p>
                Cette application permet de visualiser, comparer et superposer les images satellites du canal visible (VIS) et du composite True Color (RGB) issues de Meteosat Third Generation (MTG). Elle offre également la possibilité d'exporter ces vues en haute résolution.
              </p>
              <p>
                Outil créé par <strong className="text-white">Quentin Rey</strong>.
              </p>
              <p>
                <strong className="text-white">Sources :</strong><br />
                Images satellites fournies par <strong className="text-blue-400">EUMETSAT / Meteosat Third Generation (MTG)</strong>.
              </p>
            </div>
            
            <div className="mt-6 text-center text-xs text-slate-500 font-mono">
              Version 1.0.0
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
