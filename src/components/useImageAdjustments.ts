import { useEffect, useState } from 'react';

import {
  DEFAULT_FIRE_HOTSPOT_THRESHOLDS,
  type HdEnhancementPreset,
  IR_STYLES,
  STORAGE_KEYS,
  readStoredBoolean,
  readStoredNumber,
  readStoredString,
  safeSetLocalStorage,
  type IrStyle,
} from './dualMapViewerShared';

const DEFAULTS = {
  autoReduceVisAtNight: true,
  fireHotspotMinBrightness: DEFAULT_FIRE_HOTSPOT_THRESHOLDS.minBrightness,
  fireHotspotMinRedBlueDiff: DEFAULT_FIRE_HOTSPOT_THRESHOLDS.minRedBlueDiff,
  fireHotspotOpacity: 0.9,
  hdEnhanceEnabled: false,
  hdEnhanceHighlightProtection: 0.3,
  hdEnhanceLocalContrast: 0.25,
  hdEnhanceNoiseReduction: 0.1,
  hdEnhancePreset: 'balanced' as HdEnhancementPreset,
  hdEnhanceRadius: 1.4,
  hdEnhanceSaturationAdjust: 8,
  hdEnhanceShadowProtection: 0.2,
  hdEnhanceSharpen: 0.4,
  hdEnhanceStrength: 0.35,
  irStyle: 'mtg_fd:mtg_fd_ir105_hrfi_style_02' as IrStyle,
  rgbHdOpacity: 0.55,
  rgbSaturation: 1.15,
  sandwichOpacity: 0.4,
  visBrightness: 1.05,
  visContrast: 1.15,
} as const;

export function useImageAdjustments() {
  const [visBrightness, setVisBrightness] = useState(() => readStoredNumber(STORAGE_KEYS.visBrightness, DEFAULTS.visBrightness));
  const [visContrast, setVisContrast] = useState(() => readStoredNumber(STORAGE_KEYS.visContrast, DEFAULTS.visContrast));
  const [rgbSaturation, setRgbSaturation] = useState(() => readStoredNumber(STORAGE_KEYS.rgbSaturation, DEFAULTS.rgbSaturation));
  const [hdEnhanceSharpen, setHdEnhanceSharpen] = useState(() => readStoredNumber(STORAGE_KEYS.hdEnhanceSharpen, DEFAULTS.hdEnhanceSharpen));
  const [hdEnhanceRadius, setHdEnhanceRadius] = useState(() => readStoredNumber(STORAGE_KEYS.hdEnhanceRadius, DEFAULTS.hdEnhanceRadius));
  const [hdEnhanceLocalContrast, setHdEnhanceLocalContrast] = useState(() =>
    readStoredNumber(STORAGE_KEYS.hdEnhanceLocalContrast, DEFAULTS.hdEnhanceLocalContrast),
  );
  const [hdEnhanceHighlightProtection, setHdEnhanceHighlightProtection] = useState(() =>
    readStoredNumber(STORAGE_KEYS.hdEnhanceHighlightProtection, DEFAULTS.hdEnhanceHighlightProtection),
  );
  const [hdEnhanceSaturationAdjust, setHdEnhanceSaturationAdjust] = useState(() =>
    readStoredNumber(STORAGE_KEYS.hdEnhanceSaturationAdjust, DEFAULTS.hdEnhanceSaturationAdjust),
  );
  const [hdEnhanceNoiseReduction, setHdEnhanceNoiseReduction] = useState(() =>
    readStoredNumber(STORAGE_KEYS.hdEnhanceNoiseReduction, DEFAULTS.hdEnhanceNoiseReduction),
  );
  const [hdEnhanceShadowProtection, setHdEnhanceShadowProtection] = useState(() =>
    readStoredNumber(STORAGE_KEYS.hdEnhanceShadowProtection, DEFAULTS.hdEnhanceShadowProtection),
  );
  const [hdEnhancePreset, setHdEnhancePreset] = useState<HdEnhancementPreset>(() => {
    const value = readStoredString(STORAGE_KEYS.hdEnhancePreset, DEFAULTS.hdEnhancePreset);
    return value === 'natural' || value === 'balanced' || value === 'punchy' || value === 'analyze' || value === 'custom'
      ? value
      : DEFAULTS.hdEnhancePreset;
  });
  const [hdEnhanceStrength, setHdEnhanceStrength] = useState(() => readStoredNumber(STORAGE_KEYS.hdEnhanceStrength, DEFAULTS.hdEnhanceStrength));
  const [hdEnhanceEnabled, setHdEnhanceEnabled] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.hdEnhanceEnabled, DEFAULTS.hdEnhanceEnabled),
  );
  const [rgbHdOpacity, setRgbHdOpacity] = useState(() => readStoredNumber(STORAGE_KEYS.rgbHdOpacity, DEFAULTS.rgbHdOpacity));
  const [sandwichOpacity, setSandwichOpacity] = useState(() => readStoredNumber(STORAGE_KEYS.sandwichOpacity, DEFAULTS.sandwichOpacity));
  const [autoReduceVisAtNight, setAutoReduceVisAtNight] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.autoReduceVisAtNight, DEFAULTS.autoReduceVisAtNight),
  );
  const [irStyle, setIrStyle] = useState<IrStyle>(() => {
    const saved = readStoredString(STORAGE_KEYS.irStyle, DEFAULTS.irStyle);
    return IR_STYLES.some((style) => style.id === saved) ? (saved as IrStyle) : DEFAULTS.irStyle;
  });
  const [fireHotspotOpacity, setFireHotspotOpacity] = useState(() =>
    readStoredNumber(STORAGE_KEYS.fireHotspotOpacity, DEFAULTS.fireHotspotOpacity),
  );
  const [fireHotspotMinRedBlueDiff, setFireHotspotMinRedBlueDiff] = useState(() =>
    readStoredNumber(STORAGE_KEYS.fireHotspotMinRedBlueDiff, DEFAULTS.fireHotspotMinRedBlueDiff),
  );
  const [fireHotspotMinBrightness, setFireHotspotMinBrightness] = useState(() =>
    readStoredNumber(STORAGE_KEYS.fireHotspotMinBrightness, DEFAULTS.fireHotspotMinBrightness),
  );

  useEffect(() => {
    try {
      // Cleanup legacy storage key from the removed multi-render HD option.
      localStorage.removeItem('mtg_export_hd_vis_blend_mode');
    } catch {
      // Ignore storage persistence failures.
    }
  }, []);

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.visBrightness, String(visBrightness));
    safeSetLocalStorage(STORAGE_KEYS.visContrast, String(visContrast));
    safeSetLocalStorage(STORAGE_KEYS.hdEnhanceSharpen, String(hdEnhanceSharpen));
    safeSetLocalStorage(STORAGE_KEYS.hdEnhanceRadius, String(hdEnhanceRadius));
    safeSetLocalStorage(STORAGE_KEYS.hdEnhanceLocalContrast, String(hdEnhanceLocalContrast));
    safeSetLocalStorage(STORAGE_KEYS.hdEnhanceHighlightProtection, String(hdEnhanceHighlightProtection));
    safeSetLocalStorage(STORAGE_KEYS.hdEnhanceSaturationAdjust, String(hdEnhanceSaturationAdjust));
    safeSetLocalStorage(STORAGE_KEYS.hdEnhanceNoiseReduction, String(hdEnhanceNoiseReduction));
    safeSetLocalStorage(STORAGE_KEYS.hdEnhanceShadowProtection, String(hdEnhanceShadowProtection));
    safeSetLocalStorage(STORAGE_KEYS.hdEnhancePreset, hdEnhancePreset);
    safeSetLocalStorage(STORAGE_KEYS.hdEnhanceStrength, String(hdEnhanceStrength));
    safeSetLocalStorage(STORAGE_KEYS.hdEnhanceEnabled, String(hdEnhanceEnabled));
    safeSetLocalStorage(STORAGE_KEYS.rgbSaturation, String(rgbSaturation));
    safeSetLocalStorage(STORAGE_KEYS.rgbHdOpacity, String(rgbHdOpacity));
    safeSetLocalStorage(STORAGE_KEYS.sandwichOpacity, String(sandwichOpacity));
    safeSetLocalStorage(STORAGE_KEYS.autoReduceVisAtNight, String(autoReduceVisAtNight));
    safeSetLocalStorage(STORAGE_KEYS.irStyle, irStyle);
    safeSetLocalStorage(STORAGE_KEYS.fireHotspotOpacity, String(fireHotspotOpacity));
    safeSetLocalStorage(STORAGE_KEYS.fireHotspotMinRedBlueDiff, String(fireHotspotMinRedBlueDiff));
    safeSetLocalStorage(STORAGE_KEYS.fireHotspotMinBrightness, String(fireHotspotMinBrightness));
  }, [
    autoReduceVisAtNight,
    fireHotspotMinBrightness,
    fireHotspotMinRedBlueDiff,
    fireHotspotOpacity,
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
    rgbHdOpacity,
    rgbSaturation,
    sandwichOpacity,
    visBrightness,
    visContrast,
  ]);

  const resetAdjustments = () => {
    setVisBrightness(DEFAULTS.visBrightness);
    setVisContrast(DEFAULTS.visContrast);
    setHdEnhanceSharpen(DEFAULTS.hdEnhanceSharpen);
    setHdEnhanceRadius(DEFAULTS.hdEnhanceRadius);
    setHdEnhanceLocalContrast(DEFAULTS.hdEnhanceLocalContrast);
    setHdEnhanceHighlightProtection(DEFAULTS.hdEnhanceHighlightProtection);
    setHdEnhanceSaturationAdjust(DEFAULTS.hdEnhanceSaturationAdjust);
    setHdEnhanceNoiseReduction(DEFAULTS.hdEnhanceNoiseReduction);
    setHdEnhanceShadowProtection(DEFAULTS.hdEnhanceShadowProtection);
    setHdEnhancePreset(DEFAULTS.hdEnhancePreset);
    setHdEnhanceStrength(DEFAULTS.hdEnhanceStrength);
    setHdEnhanceEnabled(DEFAULTS.hdEnhanceEnabled);
    setRgbSaturation(DEFAULTS.rgbSaturation);
    setRgbHdOpacity(DEFAULTS.rgbHdOpacity);
    setSandwichOpacity(DEFAULTS.sandwichOpacity);
    setAutoReduceVisAtNight(DEFAULTS.autoReduceVisAtNight);
    setIrStyle(DEFAULTS.irStyle);
    setFireHotspotOpacity(DEFAULTS.fireHotspotOpacity);
    setFireHotspotMinRedBlueDiff(DEFAULTS.fireHotspotMinRedBlueDiff);
    setFireHotspotMinBrightness(DEFAULTS.fireHotspotMinBrightness);
  };

  const resetHdEnhancement = () => {
    setHdEnhanceEnabled(DEFAULTS.hdEnhanceEnabled);
    setHdEnhanceStrength(DEFAULTS.hdEnhanceStrength);
    setHdEnhanceSharpen(DEFAULTS.hdEnhanceSharpen);
    setHdEnhanceRadius(DEFAULTS.hdEnhanceRadius);
    setHdEnhanceLocalContrast(DEFAULTS.hdEnhanceLocalContrast);
    setHdEnhanceHighlightProtection(DEFAULTS.hdEnhanceHighlightProtection);
    setHdEnhanceSaturationAdjust(DEFAULTS.hdEnhanceSaturationAdjust);
    setHdEnhanceNoiseReduction(DEFAULTS.hdEnhanceNoiseReduction);
    setHdEnhanceShadowProtection(DEFAULTS.hdEnhanceShadowProtection);
    setHdEnhancePreset(DEFAULTS.hdEnhancePreset);
  };

  return {
    autoReduceVisAtNight,
    fireHotspotMinBrightness,
    fireHotspotMinRedBlueDiff,
    fireHotspotOpacity,
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
    resetHdEnhancement,
    resetAdjustments,
    rgbHdOpacity,
    rgbSaturation,
    sandwichOpacity,
    setAutoReduceVisAtNight,
    setHdEnhanceEnabled,
    setHdEnhanceHighlightProtection,
    setHdEnhanceLocalContrast,
    setHdEnhanceNoiseReduction,
    setHdEnhancePreset,
    setHdEnhanceRadius,
    setHdEnhanceSaturationAdjust,
    setHdEnhanceShadowProtection,
    setHdEnhanceSharpen,
    setHdEnhanceStrength,
    setFireHotspotMinBrightness,
    setFireHotspotMinRedBlueDiff,
    setFireHotspotOpacity,
    setIrStyle,
    setRgbHdOpacity,
    setRgbSaturation,
    setSandwichOpacity,
    setVisBrightness,
    setVisContrast,
    visBrightness,
    visContrast,
  };
}
