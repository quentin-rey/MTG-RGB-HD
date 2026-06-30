import type React from 'react';
import { Clock, Github, Info, Settings, Sliders, X } from 'lucide-react';

import {
  type ActiveLayers,
  getExportLabel,
  getLatestAvailableTime,
  getSinglePanelTitle,
  IR_STYLES,
  type ExportKind,
  type IrStyle,
  type MapOptions,
} from './dualMapViewerShared';

type DateTimePopoverProps = {
  currentTime: string;
  datePickerRef: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  onLatest: () => void;
  onTimeChange: (newTime: string) => void;
  onToggle: () => void;
};

export function DateTimePopover(props: DateTimePopoverProps) {
  const { currentTime, datePickerRef, isOpen, onLatest, onTimeChange, onToggle } = props;

  return (
    <div className="relative" ref={datePickerRef}>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 bg-[#222] border border-white/10 rounded-md px-3 py-1.5 text-sm text-white hover:bg-[#333] transition-colors"
      >
        <Clock className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="hidden sm:inline">{currentTime.split('T')[0]} à {currentTime.split('T')[1].replace(':', 'h')} UTC</span>
        <span className="sm:hidden">{currentTime.split('T')[1].replace(':', 'h')} UTC</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-[#1a1a1a] border border-white/10 rounded-md shadow-2xl p-4 z-50">
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Date</label>
              <input
                type="date"
                max={getLatestAvailableTime().split('T')[0]}
                value={currentTime.split('T')[0]}
                onChange={(e) => {
                  if (e.target.value) onTimeChange(`${e.target.value}T${currentTime.split('T')[1]}`);
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
                    onTimeChange(`${currentTime.split('T')[0]}T${e.target.value}:${currentMins}`);
                  }}
                  className="w-full bg-[#222] border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500 cursor-pointer"
                >
                  {Array.from({ length: 24 }).map((_, i) => {
                    const hour = String(i).padStart(2, '0');
                    return <option key={hour} value={hour}>{hour}h</option>;
                  })}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Minute</label>
                <select
                  value={currentTime.split('T')[1].split(':')[1]}
                  onChange={(e) => {
                    const currentHour = currentTime.split('T')[1].split(':')[0];
                    onTimeChange(`${currentTime.split('T')[0]}T${currentHour}:${e.target.value}`);
                  }}
                  className="w-full bg-[#222] border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500 cursor-pointer"
                >
                  {['00', '10', '20', '30', '40', '50'].map((minute) => (
                    <option key={minute} value={minute}>{minute}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={onLatest}
              className="w-full mt-2 bg-[#333] hover:bg-[#444] border border-white/10 rounded-md px-3 py-2 text-sm text-white transition-colors"
            >
              Aller au plus récent
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type SettingsPopoverProps = {
  isOpen: boolean;
  mapOptions: MapOptions;
  onClose: () => void;
  onToggle: () => void;
  onUpdate: (next: MapOptions) => void;
  settingsRef: React.RefObject<HTMLDivElement | null>;
};

export function SettingsPopover(props: SettingsPopoverProps) {
  const { isOpen, mapOptions, onClose, onToggle, onUpdate, settingsRef } = props;

  return (
    <div className="relative" ref={settingsRef}>
      <button
        onClick={onToggle}
        className="flex items-center justify-center w-9 h-9 bg-[#222] border border-white/10 rounded-md hover:bg-[#333] transition-colors"
        title="Options"
      >
        <Settings className="w-4 h-4 text-slate-300" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-[#1a1a1a] border border-white/10 rounded-md shadow-2xl p-4 z-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-white">Options d'affichage</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={mapOptions.showBorders}
                onChange={(e) => onUpdate({ ...mapOptions, showBorders: e.target.checked })}
                className="w-4 h-4 rounded-sm accent-blue-500"
              />
              Affichage des frontières
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={mapOptions.showFranceDepartments}
                onChange={(e) => onUpdate({ ...mapOptions, showFranceDepartments: e.target.checked })}
                className="w-4 h-4 rounded-sm accent-blue-500"
              />
              Affichage des départements (France)
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={mapOptions.showCities}
                onChange={(e) => onUpdate({ ...mapOptions, showCities: e.target.checked })}
                className="w-4 h-4 rounded-sm accent-blue-500"
              />
              Affichage des villes
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

type AdjustmentsPanelProps = {
  activeLayers: ActiveLayers;
  adjustmentsRef: React.RefObject<HTMLDivElement | null>;
  autoReduceVisAtNight: boolean;
  effectiveHybridVisOpacity: number;
  effectiveSandwichOpacity: number;
  irStyle: IrStyle;
  isOpen: boolean;
  onAutoReduceVisAtNightChange: (value: boolean) => void;
  onClose: () => void;
  onIrStyleChange: (value: IrStyle) => void;
  onReset: () => void;
  onRgbHdOpacityChange: (value: number) => void;
  onRgbSaturationChange: (value: number) => void;
  onSandwichOpacityChange: (value: number) => void;
  onToggle: () => void;
  onVisBrightnessChange: (value: number) => void;
  onVisContrastChange: (value: number) => void;
  rgbHdOpacity: number;
  rgbSaturation: number;
  sandwichOpacity: number;
  solarElevation: number;
  visBrightness: number;
  visContrast: number;
};

export function AdjustmentsPanel(props: AdjustmentsPanelProps) {
  const {
    activeLayers,
    adjustmentsRef,
    autoReduceVisAtNight,
    effectiveHybridVisOpacity,
    effectiveSandwichOpacity,
    irStyle,
    isOpen,
    onAutoReduceVisAtNightChange,
    onIrStyleChange,
    onReset,
    onRgbHdOpacityChange,
    onRgbSaturationChange,
    onSandwichOpacityChange,
    onToggle,
    onVisBrightnessChange,
    onVisContrastChange,
    rgbHdOpacity,
    rgbSaturation,
    sandwichOpacity,
    solarElevation,
    visBrightness,
    visContrast,
  } = props;

  return (
    <div className="relative" ref={adjustmentsRef}>
      <button
        onClick={onToggle}
        className={`flex items-center justify-center w-8 h-8 rounded-md border text-xs font-medium shadow-xl transition-colors bg-black/60 backdrop-blur-md hover:bg-black/80 ${
          isOpen ? 'border-blue-500 text-blue-400' : 'border-white/10 text-white'
        }`}
        title="Ajustements d'image"
      >
        <Sliders className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-[#1a1a1a]/95 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl p-4 z-[500] text-slate-200">
          <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
            <span className="text-xs font-semibold text-white tracking-wider uppercase">Ajustements image</span>
            <button
              onClick={onReset}
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors uppercase font-medium"
            >
              Réinitialiser
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Contraste VIS (Nuages)</span>
                <span className="text-white font-mono">{visContrast.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="2.0"
                step="0.05"
                value={visContrast}
                onChange={(e) => onVisContrastChange(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Luminosité VIS (Nuages)</span>
                <span className="text-white font-mono">{visBrightness.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="1.8"
                step="0.05"
                value={visBrightness}
                onChange={(e) => onVisBrightnessChange(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {activeLayers.rgb && (
              <div className="border-t border-white/5 pt-2 space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Saturation Couleurs (RGB)</span>
                    <span className="text-white font-mono">{Math.round(rgbSaturation * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={rgbSaturation}
                    onChange={(e) => onRgbSaturationChange(parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {activeLayers.vis && !activeLayers.ir && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Apport VIS sur RGB</span>
                      <span className="text-white font-mono">{Math.round(rgbHdOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={rgbHdOpacity}
                      onChange={(e) => onRgbHdOpacityChange(parseFloat(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                )}
              </div>
            )}

            {activeLayers.ir && (
              <div className="border-t border-white/5 pt-2">
                <div className="space-y-3">
                  {activeLayers.vis && activeLayers.rgb && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">Apport VIS sur RGB + IR</span>
                        <span className="text-white font-mono">{Math.round(rgbHdOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={rgbHdOpacity}
                        onChange={(e) => onRgbHdOpacityChange(parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-400">Style IR 10.5</span>
                    </div>
                    <select
                      value={irStyle}
                      onChange={(e) => onIrStyleChange(e.target.value as IrStyle)}
                      className="w-full bg-[#222] border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500 cursor-pointer"
                    >
                      {IR_STYLES.map((style) => (
                        <option key={style.id} value={style.id}>{style.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Intensite IR/Sandwich</span>
                      <span className="text-white font-mono">{Math.round(sandwichOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={sandwichOpacity}
                      onChange={(e) => onSandwichOpacityChange(parseFloat(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  {activeLayers.vis && (
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white transition-colors">
                      <input
                        type="checkbox"
                        checked={autoReduceVisAtNight}
                        onChange={(e) => onAutoReduceVisAtNightChange(e.target.checked)}
                        className="w-4 h-4 rounded-sm accent-blue-500"
                      />
                      Reduire automatiquement le VIS la nuit
                    </label>
                  )}

                  <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300 leading-relaxed">
                    <div>Soleil au centre: <span className="text-white font-mono">{solarElevation.toFixed(1)}°</span></div>
                    {activeLayers.vis && activeLayers.rgb ? (
                      <div>Apport VIS effectif: <span className="text-white font-mono">{Math.round(effectiveHybridVisOpacity * 100)}%</span></div>
                    ) : (
                      <div>Apport VIS effectif: <span className="text-white font-mono">{Math.round(effectiveSandwichOpacity * 100)}%</span></div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type InfoModalProps = {
  infoRef: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  onClose: () => void;
};

export function InfoModal(props: InfoModalProps) {
  const { infoRef, isOpen, onClose } = props;
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div ref={infoRef} className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white">À propos</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
          <p>
            MTG-RGB-HD permet de visualiser et d'exporter les images satellites MTG a partir des couches
            VIS 0.6, RGB True Color et IR 10.5.
          </p>

          <p>
            Un panneau unique permet d'activer RGB, VIS et IR pour composer rapidement les combinaisons utiles,
            avec des ajustements adaptes aux couches actives. Les exports sont generes en ZIP selon la
            configuration courante, avec les overlays actifs (frontieres, departements, villes).
          </p>

          <p>
            <strong className="text-white">MTG-RGB-HD</strong> est un outil cree par <strong className="text-white">Quentin Rey</strong>.
          </p>

          <p>
            <strong className="text-white">Sources :</strong><br />
            Imagerie satellite fournie par <a href="https://www.eumetsat.int/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">EUMETSAT / Meteosat Third Generation (MTG)</a>.
          </p>
        </div>

        <div className="mt-6 text-center text-xs text-slate-500 font-mono">
          Version 1.3.0
        </div>
      </div>
    </div>
  );
}

type DownloadModalProps = {
  availableExportKinds: ExportKind[];
  downloadModalRef: React.RefObject<HTMLDivElement | null>;
  isExporting: boolean;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onToggleKind: (kind: ExportKind, checked: boolean) => void;
  selectedExports: Record<ExportKind, boolean>;
  selectedExportKinds: ExportKind[];
};

export function DownloadModal(props: DownloadModalProps) {
  const {
    availableExportKinds,
    downloadModalRef,
    isExporting,
    isOpen,
    onClose,
    onConfirm,
    onToggleKind,
    selectedExports,
    selectedExportKinds,
  } = props;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[510] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
      <div ref={downloadModalRef} className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white">Pré-téléchargement</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-300 mb-4">
          Choisis les images à inclure dans le ZIP selon le mode actuellement affiché.
        </p>

        <div className="space-y-3">
          {availableExportKinds.map((kind) => (
            <label key={kind} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedExports[kind]}
                onChange={(e) => onToggleKind(kind, e.target.checked)}
                className="w-4 h-4 rounded-sm accent-blue-500"
              />
              {getExportLabel(kind)}
            </label>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-md border border-white/10 text-slate-200 hover:bg-white/10 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={selectedExportKinds.length === 0 || isExporting}
            className="px-3 py-2 text-sm rounded-md bg-white text-black hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Télécharger la sélection
          </button>
        </div>
      </div>
    </div>
  );
}

type HeaderInfoButtonProps = {
  onClick: () => void;
};

export function HeaderInfoButton(props: HeaderInfoButtonProps) {
  return (
    <div className="relative flex items-center gap-2">
      <a
        href="https://github.com/quentin-rey/MTG-RGB-HD"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-9 h-9 bg-[#222] border border-white/10 rounded-md hover:bg-[#333] transition-colors"
        title="Voir le projet sur GitHub"
        aria-label="Voir le projet sur GitHub"
      >
        <Github className="w-4 h-4 text-slate-300" />
      </a>

      <button
        onClick={props.onClick}
        className="flex items-center justify-center w-9 h-9 bg-[#222] border border-white/10 rounded-md hover:bg-[#333] transition-colors"
        title="Informations"
      >
        <Info className="w-4 h-4 text-slate-300" />
      </button>
    </div>
  );
}

type Map2TitleBadgeProps = {
  activeLayers: ActiveLayers;
};

export function Map2TitleBadge(props: Map2TitleBadgeProps) {
  const { activeLayers } = props;

  return (
    <div className="absolute top-4 left-4 z-[400] bg-black/60 backdrop-blur-md px-3 py-1.5 rounded text-xs font-mono font-medium border border-white/10 pointer-events-none text-white shadow-xl">
      {getSinglePanelTitle(activeLayers)}
    </div>
  );
}

type Map2ControlBarProps = {
  activeLayers: ActiveLayers;
  adjustmentsRef: React.RefObject<HTMLDivElement | null>;
  autoReduceVisAtNight: boolean;
  effectiveHybridVisOpacity: number;
  effectiveSandwichOpacity: number;
  irStyle: IrStyle;
  isAdjustmentsOpen: boolean;
  onActiveLayersChange: (next: ActiveLayers) => void;
  onAutoReduceVisAtNightChange: (value: boolean) => void;
  onIrStyleChange: (value: IrStyle) => void;
  onResetAdjustments: () => void;
  onRgbHdOpacityChange: (value: number) => void;
  onRgbSaturationChange: (value: number) => void;
  onSandwichOpacityChange: (value: number) => void;
  onToggleAdjustments: () => void;
  onVisBrightnessChange: (value: number) => void;
  onVisContrastChange: (value: number) => void;
  rgbHdOpacity: number;
  rgbSaturation: number;
  sandwichOpacity: number;
  solarElevation: number;
  visBrightness: number;
  visContrast: number;
};

export function Map2ControlBar(props: Map2ControlBarProps) {
  const {
    activeLayers,
    adjustmentsRef,
    autoReduceVisAtNight,
    effectiveHybridVisOpacity,
    effectiveSandwichOpacity,
    irStyle,
    isAdjustmentsOpen,
    onActiveLayersChange,
    onAutoReduceVisAtNightChange,
    onIrStyleChange,
    onResetAdjustments,
    onRgbHdOpacityChange,
    onRgbSaturationChange,
    onSandwichOpacityChange,
    onToggleAdjustments,
    onVisBrightnessChange,
    onVisContrastChange,
    rgbHdOpacity,
    rgbSaturation,
    sandwichOpacity,
    solarElevation,
    visBrightness,
    visContrast,
  } = props;

  const toggleLayer = (key: keyof ActiveLayers) => {
    const next = { ...activeLayers, [key]: !activeLayers[key] };
    if (!next.rgb && !next.vis && !next.ir) {
      onActiveLayersChange({ ...activeLayers });
      return;
    }
    onActiveLayersChange(next);
  };

  return (
    <div className="absolute top-4 right-4 z-[400] flex items-center gap-2">
      <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md p-1 rounded-md border border-white/10 shadow-xl">
        <button
          onClick={() => toggleLayer('rgb')}
          className={`px-2.5 py-1.5 rounded text-[11px] sm:text-xs font-medium transition-colors ${
            activeLayers.rgb ? 'bg-blue-500 text-white' : 'text-slate-200 hover:bg-white/10'
          }`}
          title="Activer/desactiver RGB"
        >
          RGB
        </button>
        <button
          onClick={() => toggleLayer('vis')}
          className={`px-2.5 py-1.5 rounded text-[11px] sm:text-xs font-medium transition-colors ${
            activeLayers.vis ? 'bg-blue-500 text-white' : 'text-slate-200 hover:bg-white/10'
          }`}
          title="Activer/desactiver VIS"
        >
          VIS
        </button>
        <button
          onClick={() => toggleLayer('ir')}
          className={`px-2.5 py-1.5 rounded text-[11px] sm:text-xs font-medium transition-colors ${
            activeLayers.ir ? 'bg-blue-500 text-white' : 'text-slate-200 hover:bg-white/10'
          }`}
          title="Activer/desactiver IR"
        >
          IR
        </button>
      </div>

      <AdjustmentsPanel
        activeLayers={activeLayers}
        adjustmentsRef={adjustmentsRef}
        autoReduceVisAtNight={autoReduceVisAtNight}
        effectiveHybridVisOpacity={effectiveHybridVisOpacity}
        effectiveSandwichOpacity={effectiveSandwichOpacity}
        irStyle={irStyle}
        isOpen={isAdjustmentsOpen}
        onAutoReduceVisAtNightChange={onAutoReduceVisAtNightChange}
        onClose={() => {
          if (isAdjustmentsOpen) onToggleAdjustments();
        }}
        onIrStyleChange={onIrStyleChange}
        onReset={onResetAdjustments}
        onRgbHdOpacityChange={onRgbHdOpacityChange}
        onRgbSaturationChange={onRgbSaturationChange}
        onSandwichOpacityChange={onSandwichOpacityChange}
        onToggle={onToggleAdjustments}
        onVisBrightnessChange={onVisBrightnessChange}
        onVisContrastChange={onVisContrastChange}
        rgbHdOpacity={rgbHdOpacity}
        rgbSaturation={rgbSaturation}
        sandwichOpacity={sandwichOpacity}
        solarElevation={solarElevation}
        visBrightness={visBrightness}
        visContrast={visContrast}
      />
    </div>
  );
}