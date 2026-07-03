import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { Bug, CircleHelp, Clock, Github, Info, Loader2, Monitor, Moon, Sliders, Sun, Wrench, X } from 'lucide-react';

import {
  type ActiveLayers,
  getExportFileBaseName,
  getExportLabel,
  getLatestAvailableTime,
  getSinglePanelTitle,
  IR_STYLES,
  themedClass,
  type ExportKind,
  type IrStyle,
  type MapOptions,
} from './dualMapViewerShared';
import type { StillImageFormat } from './dualMapExport';
import type { Language, Translator } from './i18n';

type UiTheme = 'dark' | 'light';

type TimeDockProps = {
  currentTime: string;
  isSyncingLatest: boolean;
  t: Translator;
  theme: UiTheme;
  onLatest: () => void;
  onTimeChange: (newTime: string) => void;
};

export function TimeDock(props: TimeDockProps) {
  const { currentTime, isSyncingLatest, onLatest, onTimeChange, t, theme } = props;
  const isLight = theme === 'light';
  const [isMobileActionsExpanded, setIsMobileActionsExpanded] = useState(false);
  const [datePart, timePart] = currentTime.split('T');
  const [hourPart, minutePart] = timePart.split(':');
  const totalMinutes = Number(hourPart) * 60 + Number(minutePart);

  const updateTimeFromTotalMinutes = (nextTotalMinutes: number) => {
    const normalized = Math.max(0, Math.min(23 * 60 + 50, Math.round(nextTotalMinutes / 10) * 10));
    const nextHour = String(Math.floor(normalized / 60)).padStart(2, '0');
    const nextMinute = String(normalized % 60).padStart(2, '0');
    onTimeChange(`${datePart}T${nextHour}:${nextMinute}`);
  };

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

      const target = event.target as HTMLElement | null;
      const targetTag = target?.tagName?.toLowerCase() ?? '';
      const isEditable = target?.isContentEditable
        || targetTag === 'input'
        || targetTag === 'textarea'
        || targetTag === 'select';
      if (isEditable) return;

      const baseStep = event.shiftKey ? 30 : event.ctrlKey || event.metaKey ? 60 : 10;
      const delta = event.key === 'ArrowLeft' ? -baseStep : baseStep;
      event.preventDefault();
      event.stopPropagation();
      updateTimeFromTotalMinutes(totalMinutes + delta);
    };

    // Capture phase ensures map keyboard handlers (Leaflet) do not consume arrows first.
    window.addEventListener('keydown', handleKeydown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeydown, { capture: true });
  }, [totalMinutes]);

  return (
    <div className="absolute left-1/2 bottom-3 -translate-x-1/2 z-[420] w-[min(96vw,48rem)] pointer-events-auto">
      <div className={`backdrop-blur-md border rounded-xl shadow-2xl px-2.5 py-2 sm:px-4 sm:py-3 ${
        themedClass(isLight, 'bg-white/95 border-slate-300/80', 'bg-black/65 border-white/15')
      }`}>
        <div className={`flex items-center justify-between gap-2 text-[10px] sm:text-[11px] mb-1.5 sm:mb-2 ${
          themedClass(isLight, 'text-slate-700', 'text-slate-300')
        }`}>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Clock className="w-3.5 h-3.5 text-blue-300" />
            {t('utcTime')}
          </span>
          <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{datePart} {hourPart}:{minutePart}</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="date"
            max={getLatestAvailableTime().split('T')[0]}
            value={datePart}
            onChange={(e) => {
              if (e.target.value) onTimeChange(`${e.target.value}T${timePart}`);
            }}
            className={`sm:w-[10rem] w-full border rounded-md px-2 py-1.5 text-[11px] sm:text-xs outline-none focus:border-blue-500 cursor-pointer ${
              isLight
                ? 'bg-slate-100 border-slate-300 text-slate-900'
                : 'bg-[#222] border-white/10 text-white [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert'
            }`}
          />

          <div className="flex-1 min-w-0">
            <input
              type="range"
              min={0}
              max={23 * 60 + 50}
              step={10}
              value={totalMinutes}
              onChange={(e) => updateTimeFromTotalMinutes(Number(e.target.value))}
              className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
                themedClass(isLight, 'bg-slate-300', 'bg-white/10')
              }`}
            />
            <div className={`mt-1 flex justify-between text-[9px] sm:text-[10px] font-mono ${
              themedClass(isLight, 'text-slate-500', 'text-slate-500')
            }`}>
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>23:50</span>
            </div>
          </div>

          <button
            onClick={() => setIsMobileActionsExpanded((prev) => !prev)}
            className={`sm:hidden border rounded-md px-2 py-1 text-[11px] transition-colors ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-200'
            }`}
          >
            {isMobileActionsExpanded ? t('hideActions') : t('showActions')}
          </button>

          <div className={`${isMobileActionsExpanded ? 'grid' : 'hidden'} grid-cols-5 gap-1 sm:flex sm:items-center sm:gap-1 sm:!flex`}>
            <button
              onClick={() => updateTimeFromTotalMinutes(totalMinutes - 30)}
              className={`border rounded-md px-2 py-1 text-[11px] transition-colors ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-200'
              }`}
            >
              -30m
            </button>
            <button
              onClick={() => updateTimeFromTotalMinutes(totalMinutes - 10)}
              className={`border rounded-md px-2 py-1 text-[11px] transition-colors ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-200'
              }`}
            >
              -10m
            </button>
            <button
              onClick={() => updateTimeFromTotalMinutes(totalMinutes + 10)}
              className={`border rounded-md px-2 py-1 text-[11px] transition-colors ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-200'
              }`}
            >
              +10m
            </button>
            <button
              onClick={() => updateTimeFromTotalMinutes(totalMinutes + 30)}
              className={`border rounded-md px-2 py-1 text-[11px] transition-colors ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-200'
              }`}
            >
              +30m
            </button>
            <button
              onClick={onLatest}
              disabled={isSyncingLatest}
              title={t('latestSyncingHint')}
              className={`flex items-center justify-center gap-1 border rounded-md px-2 py-1 text-[11px] transition-colors disabled:opacity-70 disabled:cursor-wait ${
                isLight
                  ? 'bg-slate-900 hover:bg-slate-700 border-slate-900 text-white'
                  : 'bg-[#333] hover:bg-[#444] border-white/10 text-white'
              }`}
            >
              {isSyncingLatest && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
              {t('latest')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type AdjustmentsPanelProps = {
  activeLayers: ActiveLayers;
  adjustmentsRef: React.RefObject<HTMLDivElement | null>;
  autoReduceVisAtNight: boolean;
  effectiveHybridVisOpacity: number;
  effectiveSandwichOpacity: number;
  hdEnhanceEnabled: boolean;
  hdEnhanceHighlightProtection: number;
  hdEnhanceLocalContrast: number;
  hdEnhanceNoiseReduction: number;
  hdEnhancePreset: 'natural' | 'balanced' | 'punchy' | 'analyze' | 'custom';
  hdEnhanceRadius: number;
  hdEnhanceSaturationAdjust: number;
  hdEnhanceShadowProtection: number;
  hdEnhanceSharpen: number;
  hdEnhanceStrength: number;
  irStyle: IrStyle;
  isOpen: boolean;
  mapOptions: MapOptions;
  onAutoReduceVisAtNightChange: (value: boolean) => void;
  onHdEnhanceEnabledChange: (value: boolean) => void;
  onHdEnhanceHighlightProtectionChange: (value: number) => void;
  onHdEnhanceLocalContrastChange: (value: number) => void;
  onHdEnhanceNoiseReductionChange: (value: number) => void;
  onHdEnhancePresetChange: (value: 'natural' | 'balanced' | 'punchy' | 'analyze' | 'custom') => void;
  onHdEnhanceRadiusChange: (value: number) => void;
  onHdEnhanceSaturationAdjustChange: (value: number) => void;
  onHdEnhanceShadowProtectionChange: (value: number) => void;
  onHdEnhanceSharpenChange: (value: number) => void;
  onHdEnhanceStrengthChange: (value: number) => void;
  onIrStyleChange: (value: IrStyle) => void;
  onMapOptionsChange: (next: MapOptions) => void;
  onReset: () => void;
  onRgbHdOpacityChange: (value: number) => void;
  onRgbSaturationChange: (value: number) => void;
  onSandwichOpacityChange: (value: number) => void;
  onToggle: () => void;
  onResetHdEnhancement: () => void;
  onVisBrightnessChange: (value: number) => void;
  onVisContrastChange: (value: number) => void;
  rgbHdOpacity: number;
  rgbSaturation: number;
  sandwichOpacity: number;
  solarElevation: number;
  t: Translator;
  theme: UiTheme;
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
    irStyle,
    isOpen,
    mapOptions,
    onAutoReduceVisAtNightChange,
    onHdEnhanceEnabledChange,
    onHdEnhanceHighlightProtectionChange,
    onHdEnhanceLocalContrastChange,
    onHdEnhanceNoiseReductionChange,
    onHdEnhancePresetChange,
    onHdEnhanceRadiusChange,
    onHdEnhanceSaturationAdjustChange,
    onHdEnhanceShadowProtectionChange,
    onHdEnhanceSharpenChange,
    onHdEnhanceStrengthChange,
    onIrStyleChange,
    onMapOptionsChange,
    onReset,
    onRgbHdOpacityChange,
    onRgbSaturationChange,
    onSandwichOpacityChange,
    onToggle,
    onResetHdEnhancement,
    onVisBrightnessChange,
    onVisContrastChange,
    rgbHdOpacity,
    rgbSaturation,
    sandwichOpacity,
    solarElevation,
    t,
    theme,
    visBrightness,
    visContrast,
  } = props;
  const isLight = theme === 'light';
  const isAnyBoundaryOverlayVisible = mapOptions.showBorders || mapOptions.showFranceDepartments;
  const sharedBoundaryOpacity = mapOptions.showBorders && mapOptions.showFranceDepartments
    ? (mapOptions.bordersOpacity + mapOptions.franceDepartmentsOpacity) / 2
    : mapOptions.showBorders
      ? mapOptions.bordersOpacity
      : mapOptions.franceDepartmentsOpacity;

  return (
    <div className="relative" ref={adjustmentsRef}>
      <button
        onClick={onToggle}
        className={`flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 rounded-md border text-xs font-medium shadow-xl transition-colors backdrop-blur-md ${
          themedClass(isLight, 'bg-white/90 hover:bg-white border-slate-300', 'bg-black/60 hover:bg-black/80 border-white/10')
        } ${
          isOpen ? 'border-blue-500 text-blue-500' : themedClass(isLight, 'text-slate-700', 'text-white')
        }`}
        title={t('adjustmentsTooltip')}
      >
        <Sliders className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          className={`ui-scrollbar absolute right-0 top-20 w-[calc(100vw-2rem)] max-h-[calc(100dvh-26rem)] sm:top-full sm:mt-2 sm:w-[22rem] sm:max-h-[calc(100dvh-17rem)] lg:max-h-[72vh] backdrop-blur-md border rounded-lg shadow-2xl p-4 z-[500] overflow-auto ${
          themedClass(isLight, 'bg-white/95 border-slate-300 text-slate-700', 'bg-[#1a1a1a]/95 border-white/10 text-slate-200')
          }`}
        >
          <div className={`flex items-center justify-between mb-3 pb-2 ${themedClass(isLight, 'border-b border-slate-200', 'border-b border-white/5')}`}>
            <span className={`text-xs font-semibold tracking-wider uppercase ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{t('adjustmentsTitle')}</span>
            <button
              onClick={onReset}
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors uppercase font-medium"
            >
              {t('reset')}
            </button>
          </div>

          <div className="space-y-4">
            <div className={`rounded-md border p-2.5 space-y-2 ${themedClass(isLight, 'border-slate-200 bg-slate-50', 'border-white/10 bg-black/20')}`}>
              <div className={`text-[11px] uppercase tracking-wide font-medium ${themedClass(isLight, 'text-slate-500', 'text-slate-400')}`}>{t('mapLayers')}</div>
              <label className={`flex items-center gap-2 text-sm cursor-pointer transition-colors ${themedClass(isLight, 'text-slate-700 hover:text-slate-900', 'text-slate-300 hover:text-white')}`}>
                <input
                  type="checkbox"
                  checked={mapOptions.showBorders}
                  onChange={(e) => onMapOptionsChange({ ...mapOptions, showBorders: e.target.checked })}
                  className="w-4 h-4 rounded-sm accent-blue-500"
                />
                {t('borders')}
              </label>
              <label className={`flex items-center gap-2 text-sm cursor-pointer transition-colors ${themedClass(isLight, 'text-slate-700 hover:text-slate-900', 'text-slate-300 hover:text-white')}`}>
                <input
                  type="checkbox"
                  checked={mapOptions.showFranceDepartments}
                  onChange={(e) => onMapOptionsChange({ ...mapOptions, showFranceDepartments: e.target.checked })}
                  className="w-4 h-4 rounded-sm accent-blue-500"
                />
                {t('departments')}
              </label>
              {isAnyBoundaryOverlayVisible && (
                <div className="pl-6">
                  <div className="flex justify-between text-xs mb-1">
                    <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('boundariesOpacity')}</span>
                    <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(sharedBoundaryOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={sharedBoundaryOpacity}
                    onChange={(e) => {
                      const nextOpacity = parseFloat(e.target.value);
                      onMapOptionsChange({
                        ...mapOptions,
                        bordersOpacity: nextOpacity,
                        franceDepartmentsOpacity: nextOpacity,
                      });
                    }}
                    className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`}
                  />
                </div>
              )}
              <label className={`flex items-center gap-2 text-sm cursor-pointer transition-colors ${themedClass(isLight, 'text-slate-700 hover:text-slate-900', 'text-slate-300 hover:text-white')}`}>
                <input
                  type="checkbox"
                  checked={mapOptions.showCities}
                  onChange={(e) => onMapOptionsChange({ ...mapOptions, showCities: e.target.checked })}
                  className="w-4 h-4 rounded-sm accent-blue-500"
                />
                {t('cities')}
              </label>
              {mapOptions.showCities && (
                <div className="pl-6">
                  <div className="flex justify-between text-xs mb-1">
                    <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('cityDensity')}</span>
                    <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{mapOptions.cityDensity.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.25"
                    max="3"
                    step="0.25"
                    value={mapOptions.cityDensity}
                    onChange={(e) => onMapOptionsChange({ ...mapOptions, cityDensity: parseFloat(e.target.value) })}
                    className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`}
                  />
                </div>
              )}
            </div>

            {activeLayers.vis && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('visContrastClouds')}</span>
                  <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{visContrast.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="2.0"
                  step="0.05"
                  value={visContrast}
                  onChange={(e) => onVisContrastChange(parseFloat(e.target.value))}
                  className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`}
                />
              </div>
            )}

            {activeLayers.vis && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('visBrightnessClouds')}</span>
                  <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{visBrightness.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="1.8"
                  step="0.05"
                  value={visBrightness}
                  onChange={(e) => onVisBrightnessChange(parseFloat(e.target.value))}
                  className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`}
                />
              </div>
            )}

            {activeLayers.rgb && (
              <div className={`pt-2 space-y-3 ${themedClass(isLight, 'border-t border-slate-200', 'border-t border-white/5')}`}>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('rgbSaturationColors')}</span>
                    <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(rgbSaturation * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={rgbSaturation}
                    onChange={(e) => onRgbSaturationChange(parseFloat(e.target.value))}
                    className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`}
                  />
                </div>

                {activeLayers.vis && !activeLayers.ir && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('visContributionOnRgb')}</span>
                      <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(rgbHdOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={rgbHdOpacity}
                      onChange={(e) => onRgbHdOpacityChange(parseFloat(e.target.value))}
                      className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`}
                    />
                  </div>
                )}

                {activeLayers.vis && (
                  <div className="space-y-2">
                    <p className={`text-[11px] ${themedClass(isLight, 'text-slate-500', 'text-slate-500')}`}>{t('fixedHdRender')}</p>
                    <label className={`flex items-center gap-2 text-sm cursor-pointer transition-colors ${themedClass(isLight, 'text-slate-700 hover:text-slate-900', 'text-slate-300 hover:text-white')}`}>
                      <input
                        type="checkbox"
                        checked={hdEnhanceEnabled}
                        onChange={(e) => onHdEnhanceEnabledChange(e.target.checked)}
                        className="w-4 h-4 rounded-sm accent-blue-500"
                      />
                      {t('hdAlgorithmicEnhancement')}
                    </label>
                    {hdEnhanceEnabled && (
                      <div className={`rounded-lg border p-3 space-y-3 ${themedClass(isLight, 'border-slate-200 bg-slate-50', 'border-white/10 bg-black/20')}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-semibold ${themedClass(isLight, 'text-slate-800', 'text-slate-200')}`}>{t('hdAlgorithmicEnhancement')}</span>
                          <button
                            type="button"
                            onClick={onResetHdEnhancement}
                            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors uppercase font-medium"
                          >
                            {t('hdEnhancementReset')}
                          </button>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('hdEnhancementPreset')}</span>
                          </div>
                          <select
                            value={hdEnhancePreset}
                            onChange={(e) => onHdEnhancePresetChange(e.target.value as 'natural' | 'balanced' | 'punchy' | 'analyze' | 'custom')}
                            className={`w-full border rounded-md px-3 py-1.5 text-xs outline-none focus:border-blue-500 cursor-pointer ${
                              themedClass(isLight, 'bg-white border-slate-300 text-slate-900', 'bg-[#222] border-white/10 text-white')
                            }`}
                          >
                            <option value="natural">{t('hdEnhancementPresetNatural')}</option>
                            <option value="balanced">{t('hdEnhancementPresetBalanced')}</option>
                            <option value="punchy">{t('hdEnhancementPresetPunchy')}</option>
                            <option value="analyze">{t('hdEnhancementPresetAnalyze')}</option>
                                                      <option value="custom">{t('hdEnhancementPresetCustom')}</option>
                          </select>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('hdEnhancementIntensity')}</span>
                            <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(hdEnhanceStrength * 100)}%</span>
                          </div>
                          <input type="range" min="0" max="1" step="0.05" value={hdEnhanceStrength} onChange={(e) => onHdEnhanceStrengthChange(parseFloat(e.target.value))} className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`} />
                        </div>

                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('hdEnhancementSharpen')}</span>
                            <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(hdEnhanceSharpen * 100)}%</span>
                          </div>
                          <input type="range" min="0" max="1" step="0.05" value={hdEnhanceSharpen} onChange={(e) => onHdEnhanceSharpenChange(parseFloat(e.target.value))} className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`} />
                        </div>

                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('hdEnhancementRadius')}</span>
                            <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{hdEnhanceRadius.toFixed(2)} px</span>
                          </div>
                          <input type="range" min="0.5" max="3" step="0.1" value={hdEnhanceRadius} onChange={(e) => onHdEnhanceRadiusChange(parseFloat(e.target.value))} className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`} />
                        </div>

                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('hdEnhancementLocalContrast')}</span>
                            <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(hdEnhanceLocalContrast * 100)}%</span>
                          </div>
                          <input type="range" min="0" max="1" step="0.05" value={hdEnhanceLocalContrast} onChange={(e) => onHdEnhanceLocalContrastChange(parseFloat(e.target.value))} className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`} />
                        </div>

                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('hdEnhancementHighlightProtection')}</span>
                            <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(hdEnhanceHighlightProtection * 100)}%</span>
                          </div>
                          <input type="range" min="0" max="1" step="0.05" value={hdEnhanceHighlightProtection} onChange={(e) => onHdEnhanceHighlightProtectionChange(parseFloat(e.target.value))} className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`} />
                        </div>

                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('hdEnhancementSaturationAdjust')}</span>
                            <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{hdEnhanceSaturationAdjust >= 0 ? `+${Math.round(hdEnhanceSaturationAdjust)}` : Math.round(hdEnhanceSaturationAdjust)}%</span>
                          </div>
                          <input type="range" min="-20" max="30" step="1" value={hdEnhanceSaturationAdjust} onChange={(e) => onHdEnhanceSaturationAdjustChange(parseFloat(e.target.value))} className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`} />
                        </div>

                        <div className={`pt-1 border-t ${themedClass(isLight, 'border-slate-200', 'border-white/10')}`}>
                          <div className={`text-[11px] uppercase tracking-wide font-medium mb-2 ${themedClass(isLight, 'text-slate-500', 'text-slate-400')}`}>{t('hdEnhancementAdvanced')}</div>

                          <div className="space-y-3">
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('hdEnhancementNoiseReduction')}</span>
                                <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(hdEnhanceNoiseReduction * 100)}%</span>
                              </div>
                              <input type="range" min="0" max="1" step="0.05" value={hdEnhanceNoiseReduction} onChange={(e) => onHdEnhanceNoiseReductionChange(parseFloat(e.target.value))} className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`} />
                            </div>

                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('hdEnhancementShadowProtection')}</span>
                                <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(hdEnhanceShadowProtection * 100)}%</span>
                              </div>
                              <input type="range" min="0" max="1" step="0.05" value={hdEnhanceShadowProtection} onChange={(e) => onHdEnhanceShadowProtectionChange(parseFloat(e.target.value))} className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeLayers.ir && (
              <div className={`pt-2 ${themedClass(isLight, 'border-t border-slate-200', 'border-t border-white/5')}`}>
                <div className="space-y-3">
                  {activeLayers.vis && activeLayers.rgb && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('visContributionOnRgbIr')}</span>
                        <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(rgbHdOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={rgbHdOpacity}
                        onChange={(e) => onRgbHdOpacityChange(parseFloat(e.target.value))}
                        className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`}
                      />
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('irStyle')}</span>
                    </div>
                    <select
                      value={irStyle}
                      onChange={(e) => onIrStyleChange(e.target.value as IrStyle)}
                      className={`w-full border rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 cursor-pointer ${
                        themedClass(isLight, 'bg-slate-100 border-slate-300 text-slate-900', 'bg-[#222] border-white/10 text-white')
                      }`}
                    >
                      {IR_STYLES.map((style) => (
                        <option key={style.id} value={style.id}>{style.label}</option>
                      ))}
                    </select>
                  </div>

                  {(activeLayers.vis || activeLayers.rgb) && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('irSandwichIntensity')}</span>
                        <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(sandwichOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={sandwichOpacity}
                        onChange={(e) => onSandwichOpacityChange(parseFloat(e.target.value))}
                        className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`}
                      />
                    </div>
                  )}

                  {activeLayers.vis && activeLayers.ir && (
                    <label className={`flex items-center gap-2 text-sm cursor-pointer transition-colors ${themedClass(isLight, 'text-slate-700 hover:text-slate-900', 'text-slate-300 hover:text-white')}`}>
                      <input
                        type="checkbox"
                        checked={autoReduceVisAtNight}
                        onChange={(e) => onAutoReduceVisAtNightChange(e.target.checked)}
                        className="w-4 h-4 rounded-sm accent-blue-500"
                      />
                      {t('autoReduceVisAtNight')}
                    </label>
                  )}

                  {activeLayers.vis && (
                    <div className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${themedClass(isLight, 'border-slate-200 bg-slate-50 text-slate-700', 'border-white/10 bg-black/20 text-slate-300')}`}>
                      <div>{t('sunAtCenter')}: <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{solarElevation.toFixed(1)}°</span></div>
                      {activeLayers.rgb ? (
                        <div>{t('effectiveVisContribution')}: <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(effectiveHybridVisOpacity * 100)}%</span></div>
                      ) : (
                        <div>{t('effectiveVisContribution')}: <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(effectiveSandwichOpacity * 100)}%</span></div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type FireHotspotPanelProps = {
  fireHotspotEnabled: boolean;
  fireHotspotMinBrightness: number;
  fireHotspotMinRedBlueDiff: number;
  fireHotspotOpacity: number;
  fireHotspotRef: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  onEnabledChange: (value: boolean) => void;
  onMinBrightnessChange: (value: number) => void;
  onMinRedBlueDiffChange: (value: number) => void;
  onOpacityChange: (value: number) => void;
  onToggle: () => void;
  t: Translator;
  theme: UiTheme;
};

export function FireHotspotPanel(props: FireHotspotPanelProps) {
  const {
    fireHotspotEnabled,
    fireHotspotMinBrightness,
    fireHotspotMinRedBlueDiff,
    fireHotspotOpacity,
    fireHotspotRef,
    isOpen,
    onEnabledChange,
    onMinBrightnessChange,
    onMinRedBlueDiffChange,
    onOpacityChange,
    onToggle,
    t,
    theme,
  } = props;
  const isLight = theme === 'light';

  return (
    <div className="relative" ref={fireHotspotRef}>
      <button
        onClick={onToggle}
        className={`flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 rounded-md border text-xs font-medium shadow-xl transition-colors backdrop-blur-md ${
          fireHotspotEnabled
            ? 'bg-orange-500 border-orange-500 text-white hover:bg-orange-600'
            : themedClass(
              isLight,
              'bg-white/90 hover:bg-white border-slate-300 text-slate-700',
              'bg-black/60 hover:bg-black/80 border-white/10 text-white',
            )
        } ${isOpen ? 'ring-2 ring-offset-1 ring-orange-400' : ''}`}
        title={t('toggleFireHotspot')}
        aria-pressed={fireHotspotEnabled}
      >
        🔥
      </button>

      {isOpen && (
        <div
          className={`ui-scrollbar absolute right-0 top-20 w-[calc(100vw-2rem)] max-h-[calc(100dvh-26rem)] sm:top-full sm:mt-2 sm:w-[20rem] sm:max-h-[calc(100dvh-17rem)] lg:max-h-[72vh] backdrop-blur-md border rounded-lg shadow-2xl p-4 z-[500] overflow-auto ${
            themedClass(isLight, 'bg-white/95 border-slate-300 text-slate-700', 'bg-[#1a1a1a]/95 border-white/10 text-slate-200')
          }`}
        >
          <div className={`flex items-center justify-between mb-3 pb-2 ${themedClass(isLight, 'border-b border-slate-200', 'border-b border-white/5')}`}>
            <span className={`text-xs font-semibold tracking-wider uppercase ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{t('fireHotspotSectionTitle')}</span>
          </div>

          <div className="space-y-4">
            <p className={`text-[11px] leading-relaxed ${themedClass(isLight, 'text-slate-500', 'text-slate-500')}`}>{t('fireHotspotSectionHint')}</p>

            <label className={`flex items-center gap-2 text-sm cursor-pointer transition-colors ${themedClass(isLight, 'text-slate-700 hover:text-slate-900', 'text-slate-300 hover:text-white')}`}>
              <input
                type="checkbox"
                checked={fireHotspotEnabled}
                onChange={(e) => onEnabledChange(e.target.checked)}
                className="w-4 h-4 rounded-sm accent-orange-500"
              />
              {t('fireHotspotEnableLabel')}
            </label>

            {fireHotspotEnabled && (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('fireHotspotOpacity')}</span>
                    <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(fireHotspotOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={fireHotspotOpacity}
                    onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
                    className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-orange-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('fireHotspotMinRedBlueDiff')}</span>
                    <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(fireHotspotMinRedBlueDiff)}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="150"
                    step="5"
                    value={fireHotspotMinRedBlueDiff}
                    onChange={(e) => onMinRedBlueDiffChange(parseFloat(e.target.value))}
                    className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-orange-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={themedClass(isLight, 'text-slate-500', 'text-slate-400')}>{t('fireHotspotMinBrightness')}</span>
                    <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{Math.round(fireHotspotMinBrightness)}</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="255"
                    step="5"
                    value={fireHotspotMinBrightness}
                    onChange={(e) => onMinBrightnessChange(parseFloat(e.target.value))}
                    className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-orange-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`}
                  />
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
  t: Translator;
  theme: UiTheme;
};

export function InfoModal(props: InfoModalProps) {
  const { infoRef, isOpen, onClose, t, theme } = props;
  const isLight = theme === 'light';
  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[500] flex items-center justify-center p-4 backdrop-blur-sm ${
      themedClass(isLight, 'bg-slate-900/35', 'bg-black/50')
    }`}>
      <div ref={infoRef} className={`ui-scrollbar border rounded-xl shadow-2xl p-6 max-w-xl w-full max-h-[85vh] overflow-y-auto ${
        themedClass(isLight, 'bg-white border-slate-300', 'bg-[#1a1a1a] border-white/10')
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-medium ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{t('aboutTitle')}</h3>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className={`p-1 rounded-md transition-colors ${
              themedClass(isLight, 'text-slate-500 hover:text-slate-900 hover:bg-slate-100', 'text-slate-400 hover:text-white hover:bg-white/10')
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={`space-y-4 text-sm leading-relaxed ${themedClass(isLight, 'text-slate-700', 'text-slate-300')}`}>
          <section className={`rounded-lg border p-3 ${themedClass(isLight, 'border-slate-200 bg-slate-50', 'border-white/10 bg-black/20')}`}>
            <h4 className={`text-sm font-semibold mb-2 ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{t('infoGoalTitle')}</h4>
            <p className="text-xs">{t('infoModalParagraph1')}</p>
            <p className="text-xs mt-1.5">{t('infoModalParagraph2')}</p>
          </section>

          <section className={`rounded-lg border p-3 ${themedClass(isLight, 'border-slate-200 bg-slate-50', 'border-white/10 bg-black/20')}`}>
            <h4 className={`text-sm font-semibold mb-2 ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{t('infoLayersTitle')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <article className={`rounded-md border p-2 ${themedClass(isLight, 'border-slate-200 bg-white/70', 'border-white/10 bg-black/20')}`}>
                <div className={`font-semibold mb-1 ${themedClass(isLight, 'text-slate-900', 'text-slate-100')}`}>RGB True Color</div>
                <div>{t('infoLayerRgbDesc')}</div>
              </article>
              <article className={`rounded-md border p-2 ${themedClass(isLight, 'border-slate-200 bg-white/70', 'border-white/10 bg-black/20')}`}>
                <div className={`font-semibold mb-1 ${themedClass(isLight, 'text-slate-900', 'text-slate-100')}`}>VIS 0.6 um</div>
                <div>{t('infoLayerVisDesc')}</div>
              </article>
              <article className={`rounded-md border p-2 ${themedClass(isLight, 'border-slate-200 bg-white/70', 'border-white/10 bg-black/20')}`}>
                <div className={`font-semibold mb-1 ${themedClass(isLight, 'text-slate-900', 'text-slate-100')}`}>IR 10.5 um</div>
                <div>{t('infoLayerIrDesc')}</div>
              </article>
              <article className={`rounded-md border p-2 ${themedClass(isLight, 'border-slate-200 bg-white/70', 'border-white/10 bg-black/20')}`}>
                <div className={`font-semibold mb-1 ${themedClass(isLight, 'text-slate-900', 'text-slate-100')}`}>Fire Temperature RGB</div>
                <div>{t('infoLayerFireDesc')}</div>
              </article>
            </div>
          </section>

          <section className={`rounded-lg border p-3 ${themedClass(isLight, 'border-slate-200 bg-slate-50', 'border-white/10 bg-black/20')}`}>
            <h4 className={`text-sm font-semibold mb-2 ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{t('infoHdAlgoTitle')}</h4>
            <p className="text-xs">{t('infoHdAlgoDesc')}</p>
          </section>

          <section className={`rounded-lg border p-3 ${themedClass(isLight, 'border-slate-200 bg-slate-50', 'border-white/10 bg-black/20')}`}>
            <h4 className={`text-sm font-semibold mb-2 ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{t('infoDataSourcesTitle')}</h4>
            <p className="text-xs">
              {t('eumetsatImagery')}{' '}
              <a href="https://www.eumetsat.int/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">EUMETSAT / Meteosat Third Generation (MTG)</a>.
            </p>
            <div className={`pt-1 text-xs ${themedClass(isLight, 'text-slate-500', 'text-slate-400')}`}>
              {t('seeEumetsatReferences')}
              {' '}
              <a href="https://www.eumetsat.int/mtg" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">MTG</a>
              {' '}|{' '}
              <a href="https://www.eumetsat.int/imagery-guide" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Imagery Guide</a>
            </div>
          </section>

          <p className="text-xs">
            <strong className={themedClass(isLight, 'text-slate-900', 'text-white')}>{t('aboutAuthor')}</strong>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <a
              href="https://github.com/quentin-rey/MTG-RGB-HD"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                isLight
                  ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                  : 'bg-[#222] border-white/10 text-slate-200 hover:bg-[#333]'
              }`}
            >
              <Github className="w-4 h-4 shrink-0" />
              {t('githubProject')}
            </a>
            <a
              href="https://github.com/quentin-rey/MTG-RGB-HD/issues"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                isLight
                  ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                  : 'bg-[#222] border-white/10 text-slate-200 hover:bg-[#333]'
              }`}
            >
              <Bug className="w-4 h-4 shrink-0" />
              {t('reportBug')}
            </a>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-500 font-mono">
          Version 1.4.1
        </div>
      </div>
    </div>
  );
}

type ExportMode = 'image' | 'gif';

type ExportKindGridProps = {
  availableExportKinds: ExportKind[];
  hdEnhanceEnabled: boolean;
  isDisabled: boolean;
  isLight: boolean;
  isPreviewLoading: boolean;
  previewImages: Partial<Record<ExportKind, string>>;
  selectedKinds: ExportKind[];
  selectionMode: 'multiple' | 'single';
  onSelect: (kind: ExportKind, checked: boolean) => void;
  t: Translator;
};

/** Shared by both export modes: multi-select checkboxes for still images, single-select radios for the GIF's source layer. */
function ExportKindGrid(props: ExportKindGridProps) {
  const { availableExportKinds, hdEnhanceEnabled, isDisabled, isLight, isPreviewLoading, previewImages, selectedKinds, selectionMode, onSelect, t } = props;

  return (
    <div className="grid grid-cols-2 gap-3">
      {availableExportKinds.map((kind) => {
        const isComposite = kind === 'hd' || kind === 'sandwich' || kind === 'hybrid';
        const isSelected = selectedKinds.includes(kind);
        const label = getExportLabel(kind, {
          vis: t('exportLabelVis'),
          rgb: t('exportLabelRgb'),
          ir: t('exportLabelIr'),
          hd: hdEnhanceEnabled ? t('exportLabelHd') : t('exportLabelRgbVis'),
          hybrid: t('exportLabelHybrid'),
          sandwich: t('exportLabelSandwich'),
        });
        const previewUrl = previewImages[kind];
        return (
          <label
            key={kind}
            className={`relative block h-24 rounded-lg border overflow-hidden transition-colors ${isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${
              isSelected ? 'border-blue-400' : themedClass(isLight, 'border-slate-300', 'border-white/15')
            }`}
          >
            <div className={`absolute inset-0 ${themedClass(isLight, 'bg-slate-200', 'bg-black/40')}`}>
              {previewUrl && (
                <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
              )}
              {!previewUrl && isPreviewLoading && (
                <div className={`w-full h-full animate-pulse ${themedClass(isLight, 'bg-slate-300', 'bg-white/5')}`} />
              )}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

            <input
              type={selectionMode === 'multiple' ? 'checkbox' : 'radio'}
              name={selectionMode === 'single' ? 'export-kind-single' : undefined}
              checked={isSelected}
              disabled={isDisabled}
              onChange={(e) => onSelect(kind, e.target.checked)}
              className="absolute top-2 right-2 w-5 h-5 rounded accent-blue-500 disabled:cursor-not-allowed"
            />
            <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full border border-white/25 text-white bg-black/35 backdrop-blur-sm">
              {isComposite ? t('downloadCompositeBadge') : t('downloadSimpleBadge')}
            </span>

            <div className="absolute bottom-0 left-0 right-0 px-3 py-2">
              <span className="text-sm font-semibold text-white drop-shadow-sm">{label}</span>
            </div>
          </label>
        );
      })}
    </div>
  );
}

type ExportModalProps = {
  // Shared
  availableExportKinds: ExportKind[];
  currentTime: string;
  exportModalRef: React.RefObject<HTMLDivElement | null>;
  fireHotspotEnabled: boolean;
  hdEnhanceEnabled: boolean;
  isOpen: boolean;
  isPreviewLoading: boolean;
  mode: ExportMode;
  onClose: () => void;
  onModeChange: (mode: ExportMode) => void;
  previewImages: Partial<Record<ExportKind, string>>;
  t: Translator;
  theme: UiTheme;

  // Image mode
  downloadProgress: number;
  exportFormat: StillImageFormat;
  exportResolution: 1920 | 2560 | 4096;
  exportResolutionText: string;
  isExporting: boolean;
  onConfirmImage: () => void;
  onExportFormatChange: (format: StillImageFormat) => void;
  onExportResolutionChange: (value: 1920 | 2560 | 4096) => void;
  onToggleImageKind: (kind: ExportKind, checked: boolean) => void;
  selectedExports: Record<ExportKind, boolean>;
  selectedExportKinds: ExportKind[];

  // GIF mode
  customDate: string;
  customEnd: string;
  customEndStep: number;
  customLatestDate: string;
  customMaxStep: number;
  customStart: string;
  customStartStep: number;
  estimatedFrameCount: number;
  fps: number;
  gifColorCount: 64 | 128 | 256;
  gifDitherLevel: 'none' | 'low' | 'medium' | 'high';
  gifFileName: string;
  gifFinalPauseMs: number;
  gifMaxDimension: 960 | 1280 | 1600;
  gifPaletteMode: 'per-frame' | 'global';
  gifProgress: number;
  gifSelectedKind: ExportKind;
  isExportingGif: boolean;
  onColorCountChange: (value: 64 | 128 | 256) => void;
  onCustomDateChange: (value: string) => void;
  onCustomEndStepChange: (value: number) => void;
  onCustomStartStepChange: (value: number) => void;
  onDitherLevelChange: (value: 'none' | 'low' | 'medium' | 'high') => void;
  onExportGif: () => void;
  onFinalPauseChange: (value: number) => void;
  onFpsChange: (value: number) => void;
  onGifKindChange: (kind: ExportKind) => void;
  onPaletteModeChange: (value: 'per-frame' | 'global') => void;
  onPresetChange: (value: '3h' | '6h' | '12h' | 'custom') => void;
  onResolutionChange: (value: 960 | 1280 | 1600) => void;
  preset: '3h' | '6h' | '12h' | 'custom';
  rangeError: string | null;
};

export function ExportModal(props: ExportModalProps) {
  const {
    availableExportKinds,
    currentTime,
    customDate,
    customEnd,
    customEndStep,
    customLatestDate,
    customMaxStep,
    customStart,
    customStartStep,
    downloadProgress,
    estimatedFrameCount,
    exportFormat,
    exportModalRef,
    exportResolution,
    exportResolutionText,
    fireHotspotEnabled,
    fps,
    gifColorCount,
    gifDitherLevel,
    gifFileName,
    gifFinalPauseMs,
    gifMaxDimension,
    gifPaletteMode,
    gifProgress,
    gifSelectedKind,
    hdEnhanceEnabled,
    isExporting,
    isExportingGif,
    isOpen,
    isPreviewLoading,
    mode,
    onClose,
    onColorCountChange,
    onConfirmImage,
    onCustomDateChange,
    onDitherLevelChange,
    onFinalPauseChange,
    onCustomEndStepChange,
    onCustomStartStepChange,
    onExportFormatChange,
    onExportGif,
    onExportResolutionChange,
    onFpsChange,
    onGifKindChange,
    onModeChange,
    onPaletteModeChange,
    onPresetChange,
    onResolutionChange,
    onToggleImageKind,
    preset,
    previewImages,
    rangeError,
    selectedExports,
    selectedExportKinds,
    t,
    theme,
  } = props;
  const isLight = theme === 'light';
  const sliderMin = 0;
  const sliderMax = Math.max(0, customMaxStep);
  const rangeSliderRef = useRef<HTMLDivElement | null>(null);
  const startStep = Math.max(sliderMin, Math.min(sliderMax, customStartStep));
  const endStep = Math.max(sliderMin, Math.min(sliderMax, customEndStep));
  const startRatio = sliderMax === 0 ? 0 : startStep / sliderMax;
  const endRatio = sliderMax === 0 ? 0 : endStep / sliderMax;

  const stepToTime = (step: number): string => {
    const safeStep = Math.max(sliderMin, Math.min(sliderMax, Math.round(step)));
    const totalMinutes = safeStep * 10;
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const finalPauseLabel = `${(gifFinalPauseMs / 1000).toFixed(1)}s`;

  const getStepFromClientX = (clientX: number): number => {
    if (!rangeSliderRef.current || sliderMax <= sliderMin) return sliderMin;
    const rect = rangeSliderRef.current.getBoundingClientRect();
    const ratio = (clientX - rect.left) / Math.max(1, rect.width);
    const clamped = Math.max(0, Math.min(1, ratio));
    return Math.round(sliderMin + clamped * (sliderMax - sliderMin));
  };

  const startDrag = (handle: 'start' | 'end', pointerId: number) => {
    const onMove = (event: PointerEvent) => {
      const nextStep = getStepFromClientX(event.clientX);
      if (handle === 'start') onCustomStartStepChange(nextStep);
      else onCustomEndStepChange(nextStep);
    };

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const nextStep = getStepFromClientX(event.clientX);
    const useStart = Math.abs(nextStep - startStep) <= Math.abs(nextStep - endStep);
    if (useStart) onCustomStartStepChange(nextStep);
    else onCustomEndStepChange(nextStep);
    startDrag(useStart ? 'start' : 'end', event.pointerId);
  };

  const handleKnobPointerDown = (handle: 'start' | 'end') => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    startDrag(handle, event.pointerId);
  };

  if (!isOpen) return null;

  const isImageMode = mode === 'image';
  const isExportingCurrent = isImageMode ? isExporting : isExportingGif;
  const currentProgress = isImageMode ? downloadProgress : gifProgress;
  const fileExtension = exportFormat === 'jpeg' ? 'jpg' : 'png';
  const safeZipSuffix = currentTime.replace('T', '_').replace(/:/g, '-');
  const isSingleFile = selectedExportKinds.length === 1;
  const canConfirm = isImageMode ? selectedExportKinds.length > 0 : estimatedFrameCount > 0;

  return (
    <div className={`fixed inset-0 z-[510] flex items-center justify-center p-4 backdrop-blur-sm ${
      themedClass(isLight, 'bg-slate-900/35', 'bg-black/55')
    }`}>
      <div ref={exportModalRef} className={`ui-scrollbar border rounded-xl shadow-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto ${
        themedClass(isLight, 'bg-white border-slate-300', 'bg-[#1a1a1a] border-white/10')
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-medium ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{t('exportModalTitle')}</h3>
          <button
            onClick={onClose}
            className={`p-1 rounded-md transition-colors ${
              themedClass(isLight, 'text-slate-500 hover:text-slate-900 hover:bg-slate-100', 'text-slate-400 hover:text-white hover:bg-white/10')
            }`}
            aria-label={t('close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={`mb-4 grid grid-cols-2 gap-1 p-1 rounded-lg ${themedClass(isLight, 'bg-slate-100', 'bg-black/30')}`}>
          {([
            ['image', t('exportModeImage')],
            ['gif', t('exportModeGif')],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onModeChange(value)}
              disabled={isExportingCurrent}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                mode === value
                  ? isLight ? 'bg-white text-slate-900 shadow' : 'bg-white/10 text-white shadow'
                  : themedClass(isLight, 'text-slate-500 hover:text-slate-800', 'text-slate-400 hover:text-slate-200')
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className={`text-sm mb-4 ${themedClass(isLight, 'text-slate-700', 'text-slate-300')}`}>
          {isImageMode ? t('downloadModalDescription') : t('animationDescription')}
        </p>

        {fireHotspotEnabled && (
          <div className={`mb-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${
            themedClass(isLight, 'border-orange-300 bg-orange-50 text-orange-800', 'border-orange-400/30 bg-orange-500/10 text-orange-200')
          }`}>
            <span className="text-sm leading-none shrink-0" aria-hidden="true">🔥</span>
            <span>{t('downloadFireHotspotHint')}</span>
          </div>
        )}

        {isImageMode ? (
          <>
            <div className={`mb-3 text-xs ${themedClass(isLight, 'text-slate-500', 'text-slate-400')}`}>
              {t('downloadSelectedCount')}: <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{selectedExportKinds.length}</span>
            </div>

            <ExportKindGrid
              availableExportKinds={availableExportKinds}
              hdEnhanceEnabled={hdEnhanceEnabled}
              isDisabled={isExporting}
              isLight={isLight}
              isPreviewLoading={isPreviewLoading}
              previewImages={previewImages}
              selectedKinds={selectedExportKinds}
              selectionMode="multiple"
              onSelect={onToggleImageKind}
              t={t}
            />

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-xs font-medium mb-1 ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>{t('downloadFormatLabel')}</label>
                <select
                  value={exportFormat}
                  disabled={isExporting}
                  onChange={(event) => onExportFormatChange(event.target.value as 'png' | 'jpeg')}
                  className={`w-full border rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:opacity-50 ${
                    themedClass(isLight, 'bg-slate-100 border-slate-300 text-slate-900', 'bg-[#222] border-white/10 text-white')
                  }`}
                >
                  <option value="png">{t('downloadFormatPng')}</option>
                  <option value="jpeg">{t('downloadFormatJpeg')}</option>
                </select>
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>{t('downloadResolutionLabel')}</label>
                <select
                  value={exportResolution}
                  disabled={isExporting}
                  onChange={(event) => onExportResolutionChange(parseInt(event.target.value, 10) as 1920 | 2560 | 4096)}
                  className={`w-full border rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:opacity-50 ${
                    themedClass(isLight, 'bg-slate-100 border-slate-300 text-slate-900', 'bg-[#222] border-white/10 text-white')
                  }`}
                >
                  <option value={1920}>{t('downloadResolution1920')}</option>
                  <option value={2560}>{t('downloadResolution2560')}</option>
                  <option value={4096}>{t('downloadResolution4096')}</option>
                </select>
              </div>
            </div>

            {selectedExportKinds.length > 0 && (
              <div className={`mt-4 rounded-lg border p-3 text-xs ${themedClass(isLight, 'border-slate-200 bg-slate-50 text-slate-700', 'border-white/10 bg-black/20 text-slate-300')}`}>
                <div className={`font-medium mb-1 ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>
                  {isSingleFile ? t('downloadFilePreview') : t('downloadZipPreview')}
                </div>
                {isSingleFile && selectedExportKinds[0] ? (
                  <div className="font-mono break-all">
                    {getExportFileBaseName(selectedExportKinds[0], hdEnhanceEnabled)}_{exportResolutionText}_{safeZipSuffix}.{fileExtension}
                  </div>
                ) : (
                  <div className="font-mono break-all">MTG_SATELLITE_PACK_{exportResolutionText}_{safeZipSuffix}.zip</div>
                )}
                <div className={`mt-2 ${themedClass(isLight, 'text-slate-500', 'text-slate-400')}`}>{t('downloadZipHint')}</div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={`block text-xs font-medium mb-1 ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>{t('exportGifKindLabel')}</label>
              <ExportKindGrid
                availableExportKinds={availableExportKinds}
                hdEnhanceEnabled={hdEnhanceEnabled}
                isDisabled={isExportingGif}
                isLight={isLight}
                isPreviewLoading={isPreviewLoading}
                previewImages={previewImages}
                selectedKinds={[gifSelectedKind]}
                selectionMode="single"
                onSelect={(kind) => onGifKindChange(kind)}
                t={t}
              />
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1 ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>{t('animationPreset')}</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  ['3h', t('animationLast3h')],
                  ['6h', t('animationLast6h')],
                  ['12h', t('animationLast12h')],
                  ['custom', t('animationCustom')],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onPresetChange(value)}
                    className={`px-2 py-1.5 rounded border text-xs transition-colors ${
                      preset === value
                        ? 'bg-blue-500 text-white border-blue-500'
                        : isLight
                          ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                          : 'bg-[#222] border-white/10 text-slate-200 hover:bg-[#333]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {preset === 'custom' && (
              <div className="space-y-3">
                <div>
                  <label className={`block text-xs font-medium mb-1 ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>{t('animationCustomDate')}</label>
                  <input
                    type="date"
                    max={customLatestDate}
                    value={customDate}
                    onChange={(event) => onCustomDateChange(event.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 cursor-pointer ${
                      isLight
                        ? 'bg-slate-100 border-slate-300 text-slate-900'
                        : 'bg-[#222] border-white/10 text-white [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className={`rounded-md px-3 py-2 ${themedClass(isLight, 'bg-slate-100 border border-slate-300 text-slate-700', 'bg-[#222] border border-white/10 text-slate-200')}`}>
                    <div className="text-[11px] opacity-75 mb-0.5">{t('animationStart')}</div>
                    <div className="font-mono text-xs">{customStart.replace('T', ' ')} UTC</div>
                  </div>
                  <div className={`rounded-md px-3 py-2 ${themedClass(isLight, 'bg-slate-100 border border-slate-300 text-slate-700', 'bg-[#222] border border-white/10 text-slate-200')}`}>
                    <div className="text-[11px] opacity-75 mb-0.5">{t('animationEnd')}</div>
                    <div className="font-mono text-xs">{customEnd.replace('T', ' ')} UTC</div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={themedClass(isLight, 'text-slate-600', 'text-slate-300')}>{t('animationCustomWindow')}</span>
                    <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{customStart.split('T')[1]} - {customEnd.split('T')[1]}</span>
                  </div>
                  <div
                    ref={rangeSliderRef}
                    onPointerDown={handleTrackPointerDown}
                    className={`relative h-10 rounded-md px-3 py-2 touch-none cursor-pointer ${themedClass(isLight, 'bg-slate-100 border border-slate-300', 'bg-[#222] border border-white/10')}`}
                  >
                    <div className={`absolute left-3 right-3 top-1/2 -translate-y-1/2 h-1 rounded ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`} />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-1 rounded bg-blue-500"
                      style={{
                        left: `calc(12px + (100% - 24px) * ${startRatio})`,
                        width: `calc((100% - 24px) * ${Math.max(0, endRatio - startRatio)})`,
                      }}
                    />
                    <button
                      type="button"
                      aria-label={t('animationStart')}
                      onPointerDown={handleKnobPointerDown('start')}
                      className={`absolute z-10 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 shadow ${themedClass(isLight, 'bg-white border-blue-600', 'bg-slate-100 border-blue-500')}`}
                      style={{ left: `calc(12px + (100% - 24px) * ${startRatio} - 8px)` }}
                    />
                    <button
                      type="button"
                      aria-label={t('animationEnd')}
                      onPointerDown={handleKnobPointerDown('end')}
                      className={`absolute z-20 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 shadow ${themedClass(isLight, 'bg-white border-blue-600', 'bg-slate-100 border-blue-500')}`}
                      style={{ left: `calc(12px + (100% - 24px) * ${endRatio} - 8px)` }}
                    />
                  </div>

                  <div className={`mt-2 flex justify-between text-[11px] font-mono ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>
                    <span>{t('animationWindowStart')}: 00:00</span>
                    <span>{t('animationWindowEnd')}: {stepToTime(sliderMax)}</span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className={themedClass(isLight, 'text-slate-600', 'text-slate-300')}>{t('animationFps')}</span>
                <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{fps}</span>
              </div>
              <input
                type="range"
                min="4"
                max="12"
                step="1"
                value={fps}
                onChange={(event) => onFpsChange(parseInt(event.target.value, 10))}
                className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={`block text-xs font-medium mb-1 ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>{t('animationGifResolution')}</label>
                <select
                  value={gifMaxDimension}
                  onChange={(event) => onResolutionChange(parseInt(event.target.value, 10) as 960 | 1280 | 1600)}
                  className={`w-full border rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 ${
                    themedClass(isLight, 'bg-slate-100 border-slate-300 text-slate-900', 'bg-[#222] border-white/10 text-white')
                  }`}
                >
                  <option value={960}>{t('animationResolution960')}</option>
                  <option value={1280}>{t('animationResolution1280')}</option>
                  <option value={1600}>{t('animationResolution1600')}</option>
                </select>
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>{t('animationGifColorCount')}</label>
                <select
                  value={gifColorCount}
                  onChange={(event) => onColorCountChange(parseInt(event.target.value, 10) as 64 | 128 | 256)}
                  className={`w-full border rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 ${
                    themedClass(isLight, 'bg-slate-100 border-slate-300 text-slate-900', 'bg-[#222] border-white/10 text-white')
                  }`}
                >
                  <option value={64}>64</option>
                  <option value={128}>128</option>
                  <option value={256}>256</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={`block text-xs font-medium mb-1 ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>{t('animationGifPaletteMode')}</label>
                <select
                  value={gifPaletteMode}
                  onChange={(event) => onPaletteModeChange(event.target.value as 'per-frame' | 'global')}
                  className={`w-full border rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 ${
                    themedClass(isLight, 'bg-slate-100 border-slate-300 text-slate-900', 'bg-[#222] border-white/10 text-white')
                  }`}
                >
                  <option value="per-frame">{t('animationPaletteModePerFrame')}</option>
                  <option value="global">{t('animationPaletteModeGlobal')}</option>
                </select>
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>{t('animationGifDither')}</label>
                <select
                  value={gifDitherLevel}
                  onChange={(event) => onDitherLevelChange(event.target.value as 'none' | 'low' | 'medium' | 'high')}
                  className={`w-full border rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 ${
                    themedClass(isLight, 'bg-slate-100 border-slate-300 text-slate-900', 'bg-[#222] border-white/10 text-white')
                  }`}
                >
                  <option value="none">{t('animationDitherNone')}</option>
                  <option value="low">{t('animationDitherLow')}</option>
                  <option value="medium">{t('animationDitherMedium')}</option>
                  <option value="high">{t('animationDitherHigh')}</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className={themedClass(isLight, 'text-slate-600', 'text-slate-300')}>{t('animationGifFinalPause')}</span>
                <span className={`font-mono ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{finalPauseLabel}</span>
              </div>
              <input
                type="range"
                min={100}
                max={2000}
                step={100}
                value={gifFinalPauseMs}
                onChange={(event) => onFinalPauseChange(parseInt(event.target.value, 10))}
                className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${themedClass(isLight, 'bg-slate-300', 'bg-white/10')}`}
              />
              <div className={`mt-1 flex justify-between text-[11px] font-mono ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>
                <span>0.1s</span>
                <span>1.0s</span>
                <span>2.0s</span>
              </div>
            </div>

            <div className={`text-xs ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>
              {t('animationFrameCount')}: <span className="font-mono">{estimatedFrameCount}</span>
            </div>

            {rangeError && (
              <p className={`text-xs ${themedClass(isLight, 'text-rose-600', 'text-rose-300')}`}>{rangeError}</p>
            )}

            {estimatedFrameCount === 0 && !rangeError ? (
              <p className={`text-xs ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>{t('animationNoFrames')}</p>
            ) : null}

            {estimatedFrameCount > 0 && (
              <div className={`rounded-lg border p-3 text-xs ${themedClass(isLight, 'border-slate-200 bg-slate-50 text-slate-700', 'border-white/10 bg-black/20 text-slate-300')}`}>
                <div className={`font-medium mb-1 ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{t('downloadFilePreview')}</div>
                <div className="font-mono break-all">{gifFileName}</div>
              </div>
            )}
          </div>
        )}

        {isExportingCurrent && (
          <div className="mt-4">
            <div className={`flex justify-between text-xs mb-1 ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>
              <span>{t('generating')}</span>
              <span className="font-mono">{currentProgress}%</span>
            </div>
            <div className={`h-1.5 rounded-full overflow-hidden ${themedClass(isLight, 'bg-slate-200', 'bg-white/10')}`}>
              <div
                className="h-full bg-blue-500 transition-all duration-200 ease-out"
                style={{ width: `${currentProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className={`mt-6 pt-3 border-t flex items-center justify-end gap-2 ${themedClass(isLight, 'border-slate-200', 'border-white/10')}`}>
          <button
            onClick={onClose}
            disabled={isExportingCurrent}
            className={`px-3 py-2 text-sm rounded-md border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              isLight
                ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'border-white/10 text-slate-200 hover:bg-white/10'
            }`}
          >
            {t('cancel')}
          </button>
          <button
            onClick={isImageMode ? onConfirmImage : onExportGif}
            disabled={!canConfirm || isExportingCurrent}
            className={`px-3 py-2 text-sm rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
              isLight
                ? 'bg-slate-900 text-white hover:bg-slate-700'
                : 'bg-white text-black hover:bg-slate-200'
            }`}
          >
            {isExportingCurrent
              ? `${t('generating')} ${currentProgress}%`
              : isImageMode ? t('downloadSelection') : t('animationExportGif')}
          </button>
        </div>
      </div>
    </div>
  );
}

type HeaderInfoButtonProps = {
  onHelpClick: () => void;
  onInfoClick: () => void;
  t: Translator;
  theme: UiTheme;
};

export function HeaderInfoButton(props: HeaderInfoButtonProps) {
  const isLight = props.theme === 'light';
  return (
    <div className="relative flex items-center gap-2">
      <button
        onClick={props.onHelpClick}
        className={`flex items-center justify-center w-9 h-9 border rounded-md transition-colors ${
          isLight
            ? 'bg-slate-100 border-slate-300 hover:bg-slate-200'
            : 'bg-[#222] border-white/10 hover:bg-[#333]'
        }`}
        title={props.t('helpTitle')}
      >
        <CircleHelp className={`w-4 h-4 ${themedClass(isLight, 'text-slate-700', 'text-slate-300')}`} />
      </button>

      <button
        onClick={props.onInfoClick}
        className={`flex items-center justify-center w-9 h-9 border rounded-md transition-colors ${
          isLight
            ? 'bg-slate-100 border-slate-300 hover:bg-slate-200'
            : 'bg-[#222] border-white/10 hover:bg-[#333]'
        }`}
        title={props.t('infoTitle')}
      >
        <Info className={`w-4 h-4 ${themedClass(isLight, 'text-slate-700', 'text-slate-300')}`} />
      </button>
    </div>
  );
}

type HeaderOverflowButtonProps = {
  onOpen: () => void;
  t: Translator;
  theme: UiTheme;
};

export function HeaderOverflowButton(props: HeaderOverflowButtonProps) {
  const { onOpen, t, theme } = props;
  const isLight = theme === 'light';
  return (
    <button
      onClick={onOpen}
      className={`sm:hidden flex items-center justify-center w-11 h-11 border rounded-md transition-colors ${
        isLight
          ? 'bg-slate-100 border-slate-300 hover:bg-slate-200'
          : 'bg-[#222] border-white/10 hover:bg-[#333]'
      }`}
      title={t('moreOptionsTooltip')}
      aria-label={t('moreOptionsTooltip')}
    >
      <Wrench className={`w-4 h-4 ${themedClass(isLight, 'text-slate-700', 'text-slate-300')}`} />
    </button>
  );
}

type HeaderOverflowMenuProps = {
  isOpen: boolean;
  language: Language;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onHelpClick: () => void;
  onInfoClick: () => void;
  onLanguageChange: (language: Language) => void;
  onThemeModeChange: (mode: 'dark' | 'light' | 'auto') => void;
  t: Translator;
  theme: UiTheme;
  themeMode: 'dark' | 'light' | 'auto';
};

export function HeaderOverflowMenu(props: HeaderOverflowMenuProps) {
  const {
    isOpen,
    language,
    menuRef,
    onClose,
    onHelpClick,
    onInfoClick,
    onLanguageChange,
    onThemeModeChange,
    t,
    theme,
    themeMode,
  } = props;
  const isLight = theme === 'light';

  if (!isOpen) return null;

  const segmentedButtonClass = (isActive: boolean) => `relative z-10 flex-1 flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
    isActive
      ? 'text-white'
      : themedClass(isLight, 'text-slate-700 hover:text-slate-900', 'text-slate-200 hover:text-white')
  }`;

  return (
    <div className={`sm:hidden fixed inset-0 z-[520] flex items-center justify-center p-4 backdrop-blur-sm ${
      themedClass(isLight, 'bg-slate-900/35', 'bg-black/50')
    }`}>
      <div ref={menuRef} className={`border rounded-xl shadow-2xl p-5 max-w-sm w-full ${
        themedClass(isLight, 'bg-white border-slate-300', 'bg-[#1a1a1a] border-white/10')
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-medium ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{t('moreOptionsTitle')}</h3>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className={`p-1 rounded-md transition-colors ${
              themedClass(isLight, 'text-slate-500 hover:text-slate-900 hover:bg-slate-100', 'text-slate-400 hover:text-white hover:bg-white/10')
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className={`text-[11px] uppercase tracking-wide font-medium mb-1.5 ${themedClass(isLight, 'text-slate-500', 'text-slate-400')}`}>{t('languageLabel')}</div>
            <div className={`relative grid grid-cols-2 rounded-md p-0.5 border ${
              themedClass(isLight, 'bg-slate-100 border-slate-200', 'bg-black/30 border-white/10')
            }`}>
              <span
                className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-[5px] bg-blue-500 shadow-sm transition-all duration-200"
                style={{ left: language === 'fr' ? 2 : 'calc(50% + 0px)' }}
                aria-hidden="true"
              />
              <button type="button" onClick={() => onLanguageChange('fr')} aria-pressed={language === 'fr'} className={segmentedButtonClass(language === 'fr')}>
                {t('langFrench')}
              </button>
              <button type="button" onClick={() => onLanguageChange('en')} aria-pressed={language === 'en'} className={segmentedButtonClass(language === 'en')}>
                {t('langEnglish')}
              </button>
            </div>
          </div>

          <div>
            <div className={`text-[11px] uppercase tracking-wide font-medium mb-1.5 ${themedClass(isLight, 'text-slate-500', 'text-slate-400')}`}>{t('themeLabel')}</div>
            <div className={`relative grid grid-cols-3 rounded-md p-0.5 border ${
              themedClass(isLight, 'bg-slate-100 border-slate-200', 'bg-black/30 border-white/10')
            }`}>
              <span
                className="absolute top-0.5 bottom-0.5 w-[calc(33.333%-2px)] rounded-[5px] bg-blue-500 shadow-sm transition-all duration-200"
                style={{
                  left: themeMode === 'dark' ? 2 : themeMode === 'light' ? 'calc(33.333% + 1px)' : 'calc(66.666% + 0px)',
                }}
                aria-hidden="true"
              />
              <button type="button" onClick={() => onThemeModeChange('dark')} aria-pressed={themeMode === 'dark'} aria-label={t('themeDark')} className={segmentedButtonClass(themeMode === 'dark')}>
                <Moon className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => onThemeModeChange('light')} aria-pressed={themeMode === 'light'} aria-label={t('themeLight')} className={segmentedButtonClass(themeMode === 'light')}>
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => onThemeModeChange('auto')} aria-pressed={themeMode === 'auto'} aria-label={t('themeAuto')} className={segmentedButtonClass(themeMode === 'auto')}>
                <Monitor className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={onHelpClick}
              className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                themedClass(isLight, 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200', 'bg-[#222] border-white/10 text-slate-200 hover:bg-[#333]')
              }`}
            >
              <CircleHelp className="w-4 h-4 shrink-0" />
              {t('helpTitle')}
            </button>
            <button
              onClick={onInfoClick}
              className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                themedClass(isLight, 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200', 'bg-[#222] border-white/10 text-slate-200 hover:bg-[#333]')
              }`}
            >
              <Info className="w-4 h-4 shrink-0" />
              {t('infoTitle')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type HelpModalProps = {
  helpRef: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  onClose: () => void;
  t: Translator;
  theme: UiTheme;
};

export function HelpModal(props: HelpModalProps) {
  const { helpRef, isOpen, onClose, t, theme } = props;
  const isLight = theme === 'light';
  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[505] flex items-center justify-center p-4 backdrop-blur-sm ${
      themedClass(isLight, 'bg-slate-900/35', 'bg-black/50')
    }`}>
      <div ref={helpRef} className={`ui-scrollbar border rounded-xl shadow-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto ${
        themedClass(isLight, 'bg-white border-slate-300', 'bg-[#1a1a1a] border-white/10')
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-medium ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{t('helpTitle')}</h3>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className={`p-1 rounded-md transition-colors ${
              themedClass(isLight, 'text-slate-500 hover:text-slate-900 hover:bg-slate-100', 'text-slate-400 hover:text-white hover:bg-white/10')
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          {[
            {
              title: t('helpGroupTime'),
              rows: [
                { keys: ['←', '→'], action: t('helpActionTime10') },
                { keys: ['Shift', '←', '→'], action: t('helpActionTime30') },
                { keys: ['Ctrl/Cmd', '←', '→'], action: t('helpActionTime60') },
              ],
            },
            {
              title: t('helpGroupPanels'),
              rows: [
                { keys: ['A'], action: t('helpActionAnimation') },
                { keys: ['D'], action: t('helpActionDownload') },
                { keys: ['I'], action: t('helpActionInfo') },
                { keys: ['?'], action: t('helpActionHelp') },
              ],
            },
            {
              title: t('helpGroupActions'),
              rows: [
                { keys: ['F'], action: t('helpActionFireHotspot') },
                { keys: ['L'], action: t('helpActionLatest') },
                { keys: ['R'], action: t('helpActionReset') },
                { keys: ['S'], action: t('helpActionAdjustments') },
                { keys: ['Shift', 'S'], action: t('helpActionShare') },
              ],
            },
          ].map((group) => (
            <section key={group.title} className={`rounded-lg border p-3 ${themedClass(isLight, 'border-slate-200 bg-slate-50', 'border-white/10 bg-black/20')}`}>
              <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${themedClass(isLight, 'text-slate-600', 'text-slate-300')}`}>{group.title}</h4>
              <div className="space-y-2">
                {group.rows.map((row) => (
                  <div key={`${group.title}-${row.action}`} className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-1.5 shrink-0">
                      {row.keys.map((keyLabel) => (
                        <span
                          key={`${row.action}-${keyLabel}`}
                          className={`inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-md font-mono text-[11px] border shadow-sm ${
                            isLight
                              ? 'bg-gradient-to-b from-white to-slate-100 border-slate-300 text-slate-700'
                              : 'bg-gradient-to-b from-slate-700/80 to-slate-900/90 border-white/20 text-slate-100'
                          }`}
                        >
                          {keyLabel}
                        </span>
                      ))}
                    </div>
                    <span className={`text-right ${themedClass(isLight, 'text-slate-700', 'text-slate-200')}`}>{row.action}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

type Map2TitleBadgeProps = {
  activeLayers: ActiveLayers;
  isNightIrFallbackActive: boolean;
  t: Translator;
  theme: UiTheme;
};

export function Map2TitleBadge(props: Map2TitleBadgeProps) {
  const { activeLayers, isNightIrFallbackActive, t, theme } = props;
  const isLight = theme === 'light';

  return (
    <div className="absolute top-4 left-4 z-[400] pointer-events-none">
      <div className={`backdrop-blur-md px-3 py-1.5 rounded text-xs font-mono font-medium border shadow-xl ${
        themedClass(isLight, 'bg-white/95 border-slate-300 text-slate-900', 'bg-black/60 border-white/10 text-white')
      }`}>
        {getSinglePanelTitle(activeLayers, {
          layerPrefix: t('panelLayerPrefix'),
          none: t('panelNone'),
          rgb: t('layerRgb'),
          vis: t('layerVis'),
          ir: t('layerIr'),
        })}
      </div>
      {isNightIrFallbackActive && (
        <div className={`mt-1.5 inline-flex items-center backdrop-blur-md px-2 py-1 rounded text-[10px] font-medium border shadow-xl ${
          isLight
            ? 'bg-blue-50 border-blue-300 text-blue-700'
            : 'bg-black/60 border-blue-400/35 text-blue-200'
        }`}>
          {t('fallbackIrNightActive')}
        </div>
      )}
    </div>
  );
}

type Map2ControlBarProps = {
  activeLayers: ActiveLayers;
  adjustmentsRef: React.RefObject<HTMLDivElement | null>;
  autoReduceVisAtNight: boolean;
  effectiveHybridVisOpacity: number;
  effectiveSandwichOpacity: number;
  fireHotspotEnabled: boolean;
  fireHotspotMinBrightness: number;
  fireHotspotMinRedBlueDiff: number;
  fireHotspotOpacity: number;
  fireHotspotRef: React.RefObject<HTMLDivElement | null>;
  hdEnhanceEnabled: boolean;
  hdEnhanceHighlightProtection: number;
  hdEnhanceLocalContrast: number;
  hdEnhanceNoiseReduction: number;
  hdEnhancePreset: 'natural' | 'balanced' | 'punchy' | 'analyze' | 'custom';
  hdEnhanceRadius: number;
  hdEnhanceSaturationAdjust: number;
  hdEnhanceShadowProtection: number;
  hdEnhanceSharpen: number;
  hdEnhanceStrength: number;
  irStyle: IrStyle;
  isAdjustmentsOpen: boolean;
  isFireHotspotOpen: boolean;
  mapOptions: MapOptions;
  onActiveLayersChange: (next: ActiveLayers) => void;
  onAutoReduceVisAtNightChange: (value: boolean) => void;
  onFireHotspotEnabledChange: (value: boolean) => void;
  onFireHotspotMinBrightnessChange: (value: number) => void;
  onFireHotspotMinRedBlueDiffChange: (value: number) => void;
  onFireHotspotOpacityChange: (value: number) => void;
  onToggleFireHotspot: () => void;
  onHdEnhanceEnabledChange: (value: boolean) => void;
  onHdEnhanceHighlightProtectionChange: (value: number) => void;
  onHdEnhanceLocalContrastChange: (value: number) => void;
  onHdEnhanceNoiseReductionChange: (value: number) => void;
  onHdEnhancePresetChange: (value: 'natural' | 'balanced' | 'punchy' | 'analyze' | 'custom') => void;
  onHdEnhanceRadiusChange: (value: number) => void;
  onHdEnhanceSaturationAdjustChange: (value: number) => void;
  onHdEnhanceShadowProtectionChange: (value: number) => void;
  onHdEnhanceSharpenChange: (value: number) => void;
  onHdEnhanceStrengthChange: (value: number) => void;
  onIrStyleChange: (value: IrStyle) => void;
  onMapOptionsChange: (next: MapOptions) => void;
  onResetAdjustments: () => void;
  onRgbHdOpacityChange: (value: number) => void;
  onRgbSaturationChange: (value: number) => void;
  onSandwichOpacityChange: (value: number) => void;
  onToggleAdjustments: () => void;
  onResetHdEnhancement: () => void;
  onVisBrightnessChange: (value: number) => void;
  onVisContrastChange: (value: number) => void;
  rgbHdOpacity: number;
  rgbSaturation: number;
  sandwichOpacity: number;
  solarElevation: number;
  t: Translator;
  theme: UiTheme;
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
    fireHotspotEnabled,
    fireHotspotMinBrightness,
    fireHotspotMinRedBlueDiff,
    fireHotspotOpacity,
    fireHotspotRef,
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
    irStyle,
    isAdjustmentsOpen,
    isFireHotspotOpen,
    mapOptions,
    onActiveLayersChange,
    onAutoReduceVisAtNightChange,
    onFireHotspotEnabledChange,
    onFireHotspotMinBrightnessChange,
    onFireHotspotMinRedBlueDiffChange,
    onFireHotspotOpacityChange,
    onToggleFireHotspot,
    onHdEnhanceEnabledChange,
    onHdEnhanceHighlightProtectionChange,
    onHdEnhanceLocalContrastChange,
    onHdEnhanceNoiseReductionChange,
    onHdEnhancePresetChange,
    onHdEnhanceRadiusChange,
    onHdEnhanceSaturationAdjustChange,
    onHdEnhanceShadowProtectionChange,
    onHdEnhanceSharpenChange,
    onHdEnhanceStrengthChange,
    onIrStyleChange,
    onMapOptionsChange,
    onResetAdjustments,
    onRgbHdOpacityChange,
    onRgbSaturationChange,
    onSandwichOpacityChange,
    onToggleAdjustments,
    onResetHdEnhancement,
    onVisBrightnessChange,
    onVisContrastChange,
    rgbHdOpacity,
    rgbSaturation,
    sandwichOpacity,
    solarElevation,
    t,
    theme,
    visBrightness,
    visContrast,
  } = props;
  const isLight = theme === 'light';

  const toggleLayer = (key: keyof ActiveLayers) => {
    const next = { ...activeLayers, [key]: !activeLayers[key] };
    if (!next.rgb && !next.vis && !next.ir) return;
    onActiveLayersChange(next);
  };

  return (
    <div className="absolute top-4 right-4 z-[400] flex items-center gap-2">
      <div className={`flex items-center gap-1 backdrop-blur-md p-1 rounded-md border shadow-xl ${
        themedClass(isLight, 'bg-white/95 border-slate-300', 'bg-black/60 border-white/10')
      }`}>
        <button
          onClick={() => toggleLayer('rgb')}
          className={`px-2.5 py-1.5 rounded text-[11px] sm:text-xs font-medium transition-colors ${
            activeLayers.rgb
              ? 'bg-blue-500 text-white'
              : isLight
                ? 'text-slate-700 hover:bg-slate-200'
                : 'text-slate-200 hover:bg-white/10'
          }`}
          title={t('toggleRgb')}
        >
          RGB
        </button>
        <button
          onClick={() => toggleLayer('vis')}
          className={`px-2.5 py-1.5 rounded text-[11px] sm:text-xs font-medium transition-colors ${
            activeLayers.vis
              ? 'bg-blue-500 text-white'
              : isLight
                ? 'text-slate-700 hover:bg-slate-200'
                : 'text-slate-200 hover:bg-white/10'
          }`}
          title={t('toggleVis')}
        >
          VIS
        </button>
        <button
          onClick={() => toggleLayer('ir')}
          className={`px-2.5 py-1.5 rounded text-[11px] sm:text-xs font-medium transition-colors ${
            activeLayers.ir
              ? 'bg-blue-500 text-white'
              : isLight
                ? 'text-slate-700 hover:bg-slate-200'
                : 'text-slate-200 hover:bg-white/10'
          }`}
          title={t('toggleIr')}
        >
          IR
        </button>
      </div>

      <FireHotspotPanel
        fireHotspotEnabled={fireHotspotEnabled}
        fireHotspotMinBrightness={fireHotspotMinBrightness}
        fireHotspotMinRedBlueDiff={fireHotspotMinRedBlueDiff}
        fireHotspotOpacity={fireHotspotOpacity}
        fireHotspotRef={fireHotspotRef}
        isOpen={isFireHotspotOpen}
        onEnabledChange={onFireHotspotEnabledChange}
        onMinBrightnessChange={onFireHotspotMinBrightnessChange}
        onMinRedBlueDiffChange={onFireHotspotMinRedBlueDiffChange}
        onOpacityChange={onFireHotspotOpacityChange}
        onToggle={onToggleFireHotspot}
        t={t}
        theme={theme}
      />

      <AdjustmentsPanel
        activeLayers={activeLayers}
        adjustmentsRef={adjustmentsRef}
        autoReduceVisAtNight={autoReduceVisAtNight}
        effectiveHybridVisOpacity={effectiveHybridVisOpacity}
        effectiveSandwichOpacity={effectiveSandwichOpacity}
        hdEnhanceEnabled={hdEnhanceEnabled}
        hdEnhanceHighlightProtection={hdEnhanceHighlightProtection}
        hdEnhanceLocalContrast={hdEnhanceLocalContrast}
        hdEnhanceNoiseReduction={hdEnhanceNoiseReduction}
        hdEnhancePreset={hdEnhancePreset}
        hdEnhanceRadius={hdEnhanceRadius}
        hdEnhanceSaturationAdjust={hdEnhanceSaturationAdjust}
        hdEnhanceShadowProtection={hdEnhanceShadowProtection}
        hdEnhanceSharpen={hdEnhanceSharpen}
        hdEnhanceStrength={hdEnhanceStrength}
        irStyle={irStyle}
        isOpen={isAdjustmentsOpen}
        mapOptions={mapOptions}
        onAutoReduceVisAtNightChange={onAutoReduceVisAtNightChange}
        onHdEnhanceEnabledChange={onHdEnhanceEnabledChange}
        onHdEnhanceHighlightProtectionChange={onHdEnhanceHighlightProtectionChange}
        onHdEnhanceLocalContrastChange={onHdEnhanceLocalContrastChange}
        onHdEnhanceNoiseReductionChange={onHdEnhanceNoiseReductionChange}
        onHdEnhancePresetChange={onHdEnhancePresetChange}
        onHdEnhanceRadiusChange={onHdEnhanceRadiusChange}
        onHdEnhanceSaturationAdjustChange={onHdEnhanceSaturationAdjustChange}
        onHdEnhanceShadowProtectionChange={onHdEnhanceShadowProtectionChange}
        onHdEnhanceSharpenChange={onHdEnhanceSharpenChange}
        onHdEnhanceStrengthChange={onHdEnhanceStrengthChange}
        onIrStyleChange={onIrStyleChange}
        onMapOptionsChange={onMapOptionsChange}
        onReset={onResetAdjustments}
        onRgbHdOpacityChange={onRgbHdOpacityChange}
        onRgbSaturationChange={onRgbSaturationChange}
        onSandwichOpacityChange={onSandwichOpacityChange}
        onToggle={onToggleAdjustments}
        onResetHdEnhancement={onResetHdEnhancement}
        onVisBrightnessChange={onVisBrightnessChange}
        onVisContrastChange={onVisContrastChange}
        rgbHdOpacity={rgbHdOpacity}
        rgbSaturation={rgbSaturation}
        sandwichOpacity={sandwichOpacity}
        solarElevation={solarElevation}
        t={t}
        theme={theme}
        visBrightness={visBrightness}
        visContrast={visContrast}
      />
    </div>
  );
}