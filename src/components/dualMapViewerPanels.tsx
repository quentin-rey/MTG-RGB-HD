import { useState, type React } from 'react';
import { Clock, Github, Info, Sliders, X } from 'lucide-react';

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
import type { Translator } from './i18n';

type UiTheme = 'dark' | 'light';

type TimeDockProps = {
  currentTime: string;
  t: Translator;
  theme: UiTheme;
  onLatest: () => void;
  onTimeChange: (newTime: string) => void;
};

export function TimeDock(props: TimeDockProps) {
  const { currentTime, onLatest, onTimeChange, t, theme } = props;
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

  return (
    <div className="absolute left-1/2 bottom-3 -translate-x-1/2 z-[420] w-[min(96vw,48rem)] pointer-events-auto">
      <div className={`backdrop-blur-md border rounded-xl shadow-2xl px-2.5 py-2 sm:px-4 sm:py-3 ${
        isLight ? 'bg-white/95 border-slate-300/80' : 'bg-black/65 border-white/15'
      }`}>
        <div className={`flex items-center justify-between gap-2 text-[10px] sm:text-[11px] mb-1.5 sm:mb-2 ${
          isLight ? 'text-slate-700' : 'text-slate-300'
        }`}>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Clock className="w-3.5 h-3.5 text-blue-300" />
            {t('utcTime')}
          </span>
          <span className={`font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{datePart} {hourPart}:{minutePart}</span>
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
                isLight ? 'bg-slate-300' : 'bg-white/10'
              }`}
            />
            <div className={`mt-1 flex justify-between text-[9px] sm:text-[10px] font-mono ${
              isLight ? 'text-slate-500' : 'text-slate-500'
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
              className={`border rounded-md px-2 py-1 text-[11px] transition-colors ${
                isLight
                  ? 'bg-slate-900 hover:bg-slate-700 border-slate-900 text-white'
                  : 'bg-[#333] hover:bg-[#444] border-white/10 text-white'
              }`}
            >
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
  irStyle: IrStyle;
  isOpen: boolean;
  mapOptions: MapOptions;
  onAutoReduceVisAtNightChange: (value: boolean) => void;
  onIrStyleChange: (value: IrStyle) => void;
  onMapOptionsChange: (next: MapOptions) => void;
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
    irStyle,
    isOpen,
    mapOptions,
    onAutoReduceVisAtNightChange,
    onIrStyleChange,
    onMapOptionsChange,
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
    t,
    theme,
    visBrightness,
    visContrast,
  } = props;
  const isLight = theme === 'light';

  return (
    <div className="relative" ref={adjustmentsRef}>
      <button
        onClick={onToggle}
        className={`flex items-center justify-center w-8 h-8 rounded-md border text-xs font-medium shadow-xl transition-colors backdrop-blur-md ${
          isLight ? 'bg-white/90 hover:bg-white border-slate-300' : 'bg-black/60 hover:bg-black/80 border-white/10'
        } ${
          isOpen ? 'border-blue-500 text-blue-500' : isLight ? 'text-slate-700' : 'text-white'
        }`}
        title={t('adjustmentsTooltip')}
      >
        <Sliders className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          className={`ui-scrollbar absolute right-0 top-full mt-2 w-[min(92vw,22rem)] backdrop-blur-md border rounded-lg shadow-2xl p-4 z-[500] overflow-auto max-h-[calc(100dvh-19rem)] sm:max-h-[calc(100dvh-17rem)] lg:max-h-[72vh] ${
          isLight ? 'bg-white/95 border-slate-300 text-slate-700' : 'bg-[#1a1a1a]/95 border-white/10 text-slate-200'
          }`}
        >
          <div className={`flex items-center justify-between mb-3 pb-2 ${isLight ? 'border-b border-slate-200' : 'border-b border-white/5'}`}>
            <span className={`text-xs font-semibold tracking-wider uppercase ${isLight ? 'text-slate-900' : 'text-white'}`}>{t('adjustmentsTitle')}</span>
            <button
              onClick={onReset}
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors uppercase font-medium"
            >
              {t('reset')}
            </button>
          </div>

          <div className="space-y-4">
            <div className={`rounded-md border p-2.5 space-y-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-black/20'}`}>
              <div className={`text-[11px] uppercase tracking-wide font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{t('mapLayers')}</div>
              <label className={`flex items-center gap-2 text-sm cursor-pointer transition-colors ${isLight ? 'text-slate-700 hover:text-slate-900' : 'text-slate-300 hover:text-white'}`}>
                <input
                  type="checkbox"
                  checked={mapOptions.showBorders}
                  onChange={(e) => onMapOptionsChange({ ...mapOptions, showBorders: e.target.checked })}
                  className="w-4 h-4 rounded-sm accent-blue-500"
                />
                {t('borders')}
              </label>
              {mapOptions.showBorders && (
                <div className="pl-6">
                  <div className="flex justify-between text-xs mb-1">
                    <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{t('bordersOpacity')}</span>
                    <span className={`font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{Math.round(mapOptions.bordersOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={mapOptions.bordersOpacity}
                    onChange={(e) => onMapOptionsChange({ ...mapOptions, bordersOpacity: parseFloat(e.target.value) })}
                    className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${isLight ? 'bg-slate-300' : 'bg-white/10'}`}
                  />
                </div>
              )}
              <label className={`flex items-center gap-2 text-sm cursor-pointer transition-colors ${isLight ? 'text-slate-700 hover:text-slate-900' : 'text-slate-300 hover:text-white'}`}>
                <input
                  type="checkbox"
                  checked={mapOptions.showFranceDepartments}
                  onChange={(e) => onMapOptionsChange({ ...mapOptions, showFranceDepartments: e.target.checked })}
                  className="w-4 h-4 rounded-sm accent-blue-500"
                />
                {t('departments')}
              </label>
              {mapOptions.showFranceDepartments && (
                <div className="pl-6">
                  <div className="flex justify-between text-xs mb-1">
                    <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{t('departmentsOpacity')}</span>
                    <span className={`font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{Math.round(mapOptions.franceDepartmentsOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={mapOptions.franceDepartmentsOpacity}
                    onChange={(e) => onMapOptionsChange({ ...mapOptions, franceDepartmentsOpacity: parseFloat(e.target.value) })}
                    className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${isLight ? 'bg-slate-300' : 'bg-white/10'}`}
                  />
                </div>
              )}
              <label className={`flex items-center gap-2 text-sm cursor-pointer transition-colors ${isLight ? 'text-slate-700 hover:text-slate-900' : 'text-slate-300 hover:text-white'}`}>
                <input
                  type="checkbox"
                  checked={mapOptions.showCities}
                  onChange={(e) => onMapOptionsChange({ ...mapOptions, showCities: e.target.checked })}
                  className="w-4 h-4 rounded-sm accent-blue-500"
                />
                {t('cities')}
              </label>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{t('visContrastClouds')}</span>
                <span className={`font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{visContrast.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="2.0"
                step="0.05"
                value={visContrast}
                onChange={(e) => onVisContrastChange(parseFloat(e.target.value))}
                className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${isLight ? 'bg-slate-300' : 'bg-white/10'}`}
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{t('visBrightnessClouds')}</span>
                <span className={`font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{visBrightness.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="1.8"
                step="0.05"
                value={visBrightness}
                onChange={(e) => onVisBrightnessChange(parseFloat(e.target.value))}
                className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${isLight ? 'bg-slate-300' : 'bg-white/10'}`}
              />
            </div>

            {activeLayers.rgb && (
              <div className={`pt-2 space-y-3 ${isLight ? 'border-t border-slate-200' : 'border-t border-white/5'}`}>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{t('rgbSaturationColors')}</span>
                    <span className={`font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{Math.round(rgbSaturation * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={rgbSaturation}
                    onChange={(e) => onRgbSaturationChange(parseFloat(e.target.value))}
                    className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${isLight ? 'bg-slate-300' : 'bg-white/10'}`}
                  />
                </div>

                {activeLayers.vis && !activeLayers.ir && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{t('visContributionOnRgb')}</span>
                      <span className={`font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{Math.round(rgbHdOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={rgbHdOpacity}
                      onChange={(e) => onRgbHdOpacityChange(parseFloat(e.target.value))}
                      className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${isLight ? 'bg-slate-300' : 'bg-white/10'}`}
                    />
                  </div>
                )}

                {activeLayers.vis && (
                  <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>{t('fixedHdRender')}</p>
                )}
              </div>
            )}

            {activeLayers.ir && (
              <div className={`pt-2 ${isLight ? 'border-t border-slate-200' : 'border-t border-white/5'}`}>
                <div className="space-y-3">
                  {activeLayers.vis && activeLayers.rgb && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{t('visContributionOnRgbIr')}</span>
                        <span className={`font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{Math.round(rgbHdOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={rgbHdOpacity}
                        onChange={(e) => onRgbHdOpacityChange(parseFloat(e.target.value))}
                        className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${isLight ? 'bg-slate-300' : 'bg-white/10'}`}
                      />
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{t('irStyle')}</span>
                    </div>
                    <select
                      value={irStyle}
                      onChange={(e) => onIrStyleChange(e.target.value as IrStyle)}
                      className={`w-full border rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 cursor-pointer ${
                        isLight ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-[#222] border-white/10 text-white'
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
                        <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{t('irSandwichIntensity')}</span>
                        <span className={`font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{Math.round(sandwichOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={sandwichOpacity}
                        onChange={(e) => onSandwichOpacityChange(parseFloat(e.target.value))}
                        className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${isLight ? 'bg-slate-300' : 'bg-white/10'}`}
                      />
                    </div>
                  )}

                  {activeLayers.vis && activeLayers.ir && (
                    <label className={`flex items-center gap-2 text-sm cursor-pointer transition-colors ${isLight ? 'text-slate-700 hover:text-slate-900' : 'text-slate-300 hover:text-white'}`}>
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
                    <div className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${isLight ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-white/10 bg-black/20 text-slate-300'}`}>
                      <div>{t('sunAtCenter')}: <span className={`font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{solarElevation.toFixed(1)}°</span></div>
                      {activeLayers.rgb ? (
                        <div>{t('effectiveVisContribution')}: <span className={`font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{Math.round(effectiveHybridVisOpacity * 100)}%</span></div>
                      ) : (
                        <div>{t('effectiveVisContribution')}: <span className={`font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{Math.round(effectiveSandwichOpacity * 100)}%</span></div>
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
      isLight ? 'bg-slate-900/35' : 'bg-black/50'
    }`}>
      <div ref={infoRef} className={`ui-scrollbar border rounded-xl shadow-2xl p-6 max-w-xl w-full max-h-[85vh] overflow-y-auto ${
        isLight ? 'bg-white border-slate-300' : 'bg-[#1a1a1a] border-white/10'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{t('aboutTitle')}</h3>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className={`p-1 rounded-md transition-colors ${
              isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={`space-y-4 text-sm leading-relaxed ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
          <p>
            {t('infoModalParagraph1')}
          </p>

          <p>
            {t('infoModalParagraph2')}
          </p>

          <p>
            <strong className={isLight ? 'text-slate-900' : 'text-white'}>{t('aboutAuthor')}</strong>
          </p>

          <p>
            <strong className={isLight ? 'text-slate-900' : 'text-white'}>{t('sources')}</strong><br />
            {t('eumetsatImagery')}{' '}<a href="https://www.eumetsat.int/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">EUMETSAT / Meteosat Third Generation (MTG)</a>.
          </p>

          <div className={`rounded-lg border p-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-black/20'}`}>
            <h4 className={`text-sm font-semibold mb-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>{t('infoLayersTitle')}</h4>
            <div className={`space-y-3 text-xs leading-relaxed ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              <div>
                <div className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>RGB True Color</div>
                <div>
                  {t('infoLayerRgbDesc')}
                </div>
              </div>

              <div>
                <div className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>VIS 0.6 um</div>
                <div>
                  {t('infoLayerVisDesc')}
                </div>
              </div>

              <div>
                <div className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>IR 10.5 um</div>
                <div>
                  {t('infoLayerIrDesc')}
                </div>
              </div>

              <div className={`pt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('seeEumetsatReferences')}
                {' '}
                <a href="https://www.eumetsat.int/mtg" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  MTG
                </a>
                {' '}|
                {' '}
                <a href="https://www.eumetsat.int/imagery-guide" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  Imagery Guide
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-500 font-mono">
          Version 1.3.1
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
  t: Translator;
  theme: UiTheme;
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
    t,
    theme,
    onToggleKind,
    selectedExports,
    selectedExportKinds,
  } = props;
  const isLight = theme === 'light';

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[510] flex items-center justify-center p-4 backdrop-blur-sm ${
      isLight ? 'bg-slate-900/35' : 'bg-black/55'
    }`}>
      <div ref={downloadModalRef} className={`ui-scrollbar border rounded-xl shadow-2xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto ${
        isLight ? 'bg-white border-slate-300' : 'bg-[#1a1a1a] border-white/10'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{t('preDownloadTitle')}</h3>
          <button
            onClick={onClose}
            className={`p-1 rounded-md transition-colors ${
              isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
            aria-label={t('close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className={`text-sm mb-4 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
          {t('downloadModalDescription')}
        </p>

        <div className="space-y-3">
          {availableExportKinds.map((kind) => (
            <label key={kind} className={`flex items-center gap-2 text-sm cursor-pointer ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
              <input
                type="checkbox"
                checked={selectedExports[kind]}
                onChange={(e) => onToggleKind(kind, e.target.checked)}
                className="w-4 h-4 rounded-sm accent-blue-500"
              />
              {getExportLabel(kind, {
                vis: t('exportLabelVis'),
                rgb: t('exportLabelRgb'),
                ir: t('exportLabelIr'),
                hd: t('exportLabelHd'),
                hybrid: t('exportLabelHybrid'),
                sandwich: t('exportLabelSandwich'),
              })}
            </label>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className={`px-3 py-2 text-sm rounded-md border transition-colors ${
              isLight
                ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'border-white/10 text-slate-200 hover:bg-white/10'
            }`}
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={selectedExportKinds.length === 0 || isExporting}
            className={`px-3 py-2 text-sm rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
              isLight
                ? 'bg-slate-900 text-white hover:bg-slate-700'
                : 'bg-white text-black hover:bg-slate-200'
            }`}
          >
            {t('downloadSelection')}
          </button>
        </div>
      </div>
    </div>
  );
}

type HeaderInfoButtonProps = {
  onClick: () => void;
  t: Translator;
  theme: UiTheme;
};

export function HeaderInfoButton(props: HeaderInfoButtonProps) {
  const isLight = props.theme === 'light';
  return (
    <div className="relative flex items-center gap-2">
      <a
        href="https://github.com/quentin-rey/MTG-RGB-HD"
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center justify-center w-9 h-9 border rounded-md transition-colors ${
          isLight
            ? 'bg-slate-100 border-slate-300 hover:bg-slate-200'
            : 'bg-[#222] border-white/10 hover:bg-[#333]'
        }`}
        title={props.t('githubProject')}
        aria-label={props.t('githubProject')}
      >
        <Github className={`w-4 h-4 ${isLight ? 'text-slate-700' : 'text-slate-300'}`} />
      </a>

      <button
        onClick={props.onClick}
        className={`flex items-center justify-center w-9 h-9 border rounded-md transition-colors ${
          isLight
            ? 'bg-slate-100 border-slate-300 hover:bg-slate-200'
            : 'bg-[#222] border-white/10 hover:bg-[#333]'
        }`}
        title={props.t('infoTitle')}
      >
        <Info className={`w-4 h-4 ${isLight ? 'text-slate-700' : 'text-slate-300'}`} />
      </button>
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
        isLight ? 'bg-white/95 border-slate-300 text-slate-900' : 'bg-black/60 border-white/10 text-white'
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
  irStyle: IrStyle;
  isAdjustmentsOpen: boolean;
  mapOptions: MapOptions;
  onActiveLayersChange: (next: ActiveLayers) => void;
  onAutoReduceVisAtNightChange: (value: boolean) => void;
  onIrStyleChange: (value: IrStyle) => void;
  onMapOptionsChange: (next: MapOptions) => void;
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
    irStyle,
    isAdjustmentsOpen,
    mapOptions,
    onActiveLayersChange,
    onAutoReduceVisAtNightChange,
    onIrStyleChange,
    onMapOptionsChange,
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
        isLight ? 'bg-white/95 border-slate-300' : 'bg-black/60 border-white/10'
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

      <AdjustmentsPanel
        activeLayers={activeLayers}
        adjustmentsRef={adjustmentsRef}
        autoReduceVisAtNight={autoReduceVisAtNight}
        effectiveHybridVisOpacity={effectiveHybridVisOpacity}
        effectiveSandwichOpacity={effectiveSandwichOpacity}
        irStyle={irStyle}
        isOpen={isAdjustmentsOpen}
        mapOptions={mapOptions}
        onAutoReduceVisAtNightChange={onAutoReduceVisAtNightChange}
        onIrStyleChange={onIrStyleChange}
        onMapOptionsChange={onMapOptionsChange}
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
        t={t}
        theme={theme}
        visBrightness={visBrightness}
        visContrast={visContrast}
      />
    </div>
  );
}