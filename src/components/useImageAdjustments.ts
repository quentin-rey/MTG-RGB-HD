import { useEffect, useState } from 'react';

import {
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
  const [rgbHdOpacity, setRgbHdOpacity] = useState(() => readStoredNumber(STORAGE_KEYS.rgbHdOpacity, DEFAULTS.rgbHdOpacity));
  const [sandwichOpacity, setSandwichOpacity] = useState(() => readStoredNumber(STORAGE_KEYS.sandwichOpacity, DEFAULTS.sandwichOpacity));
  const [autoReduceVisAtNight, setAutoReduceVisAtNight] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.autoReduceVisAtNight, DEFAULTS.autoReduceVisAtNight),
  );
  const [irStyle, setIrStyle] = useState<IrStyle>(() => {
    const saved = readStoredString(STORAGE_KEYS.irStyle, DEFAULTS.irStyle);
    return IR_STYLES.some((style) => style.id === saved) ? (saved as IrStyle) : DEFAULTS.irStyle;
  });

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEYS.visBrightness, String(visBrightness));
    safeSetLocalStorage(STORAGE_KEYS.visContrast, String(visContrast));
    safeSetLocalStorage(STORAGE_KEYS.rgbSaturation, String(rgbSaturation));
    safeSetLocalStorage(STORAGE_KEYS.rgbHdOpacity, String(rgbHdOpacity));
    safeSetLocalStorage(STORAGE_KEYS.sandwichOpacity, String(sandwichOpacity));
    safeSetLocalStorage(STORAGE_KEYS.autoReduceVisAtNight, String(autoReduceVisAtNight));
    safeSetLocalStorage(STORAGE_KEYS.irStyle, irStyle);
  }, [
    autoReduceVisAtNight,
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
    setRgbSaturation(DEFAULTS.rgbSaturation);
    setRgbHdOpacity(DEFAULTS.rgbHdOpacity);
    setSandwichOpacity(DEFAULTS.sandwichOpacity);
    setAutoReduceVisAtNight(DEFAULTS.autoReduceVisAtNight);
    setIrStyle(DEFAULTS.irStyle);
  };

  return {
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
  };
}
