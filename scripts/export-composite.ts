/**
 * Downloads a composite RGB+VIS(+IR) animation (GIF or WebM) from MTG-RGB-HD
 * without going through the UI by hand.
 *
 * This does NOT reimplement the compositing/HD-enhancement/GIF-encoding
 * pipeline server-side — it drives a real (headless) browser against the
 * already-deployed app the same way a person would through the "Export"
 * modal, using a share-link URL (`?view=...`, the same mechanism as the
 * "Copier lien" button) to pre-fill the date range, layers and export
 * settings. That keeps this script from ever drifting out of sync with
 * `dualMapExport.ts`'s actual rendering logic, at the cost of not being a
 * real HTTP API: it's a tool you run, not an endpoint anyone can curl.
 *
 * Usage: npm run export:composite -- --start <ISO> --end <ISO> [options]
 * Run with --help for the full option list.
 */

import { parseArgs } from 'node:util';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

type Layer = 'rgb' | 'vis' | 'ir';

// Kept in sync by hand with the equivalent constants in DualMapViewer.tsx —
// there's no shared module to import them from without dragging in the DOM-
// dependent app bundle, and they change rarely enough that this is fine.
const MAX_ANIMATION_EXPORT_FRAMES = 73;
const MAX_CUSTOM_RANGE_MS = 12 * 60 * 60 * 1000;
const MIN_CUSTOM_RANGE_MS = 1 * 60 * 60 * 1000;
const DAY_MAX_STEP = (24 * 60) / 10 - 1;
const TEN_MINUTES_MS = 10 * 60 * 1000;

// Mirrors HD_PRESET_SLIDER_VALUES in DualMapViewer.tsx: picking --hd-preset alone only changes the
// enhancement profile's multipliers (sharpen/contrast/saturation), not the underlying sliders — to
// faithfully reproduce what clicking that preset button in the UI does, the individual hdEnhance*
// fields below are seeded from this table before any --hd-* override is applied on top.
const HD_PRESET_SLIDER_VALUES = {
  natural: { highlightProtection: 0.38, localContrast: 0.18, noiseReduction: 0.18, radius: 1.2, saturationAdjust: 4, shadowProtection: 0.28, sharpen: 0.28, strength: 0.28 },
  balanced: { highlightProtection: 0.3, localContrast: 0.25, noiseReduction: 0.1, radius: 1.4, saturationAdjust: 8, shadowProtection: 0.2, sharpen: 0.4, strength: 0.35 },
  punchy: { highlightProtection: 0.2, localContrast: 0.42, noiseReduction: 0.08, radius: 1.65, saturationAdjust: 16, shadowProtection: 0.16, sharpen: 0.62, strength: 0.52 },
  analyze: { highlightProtection: 0.15, localContrast: 0.5, noiseReduction: 0.06, radius: 1.85, saturationAdjust: 2, shadowProtection: 0.1, sharpen: 0.72, strength: 0.62 },
} as const;

const DEFAULT_APP_URL = 'https://quentin-rey.github.io/MTG-RGB-HD/';
const GIF_MAX_DIMENSIONS = [960, 1280, 1600] as const;
const GIF_COLOR_COUNTS = [64, 128, 256] as const;
const GIF_DITHER_LEVELS = ['none', 'low', 'medium', 'high'] as const;
const GIF_FINAL_PAUSE_MS = [100, 500, 1000, 2000] as const;

function printUsage(): void {
  console.log(`Usage: npm run export:composite -- --start <UTC date-time> --end <UTC date-time> [options]

Required:
  --start <UTC date-time>   e.g. 2026-08-12T20:00 (rounded to the nearest 10 min)
  --end   <UTC date-time>   e.g. 2026-08-12T23:50 (must be the same UTC calendar day as --start)

Options:
  --layers <rgb,vis,ir>                Active layers, comma-separated (default: rgb,vis)
  --format <gif|webm>                  Output format (default: gif)
  --fps <n>                            Animation frame rate (default: 6)
  --out <path>                         Output file path (default: auto-generated)
  --url <base URL>                     App URL to drive (default: ${DEFAULT_APP_URL})
  --center <lat,lng>                   Map center override, e.g. "40,-10" (default: app's own default view)
  --zoom <n>                           Map zoom override (default: app's own default view)
  --hd-enhance                         Enable HD enhancement (default: off)
  --hd-preset <natural|balanced|punchy|analyze>  (default: balanced)
  --hd-strength <0-1>                  Overall HD enhancement amount (default: preset's)
  --hd-highlight-protection <0-1>      Pulls down blown-out/flat-white highlights (default: preset's)
  --hd-shadow-protection <0-1>         Lifts crushed shadows (default: preset's)
  --hd-local-contrast <0-1>            Local contrast / detail (default: preset's)
  --hd-sharpen <0-1>                   Sharpen amount (default: preset's)
  --hd-saturation-adjust <-20..30>     (default: preset's)
  --hd-noise-reduction <0-1>           (default: preset's)
  --hd-radius <0.5-3>                  Enhancement blur radius (default: preset's)
  --vis-brightness <0.6-1.8>           VIS layer brightness (default: app default 1.05)
  --vis-contrast <0.6-2>               VIS layer contrast (default: app default 1.15)
  --rgb-saturation <0.5-2>             RGB layer saturation (default: app default 1.15)
  --gif-max-dimension <${GIF_MAX_DIMENSIONS.join('|')}>    (default: 1280)
  --gif-colors <${GIF_COLOR_COUNTS.join('|')}>              (default: 128)
  --gif-dither <${GIF_DITHER_LEVELS.join('|')}>       (default: none)
  --gif-pause <${GIF_FINAL_PAUSE_MS.join('|')}>          Final frame pause in ms (default: 100)
  --webm-quality <0-1>                 WebM encoder quality (default: 0.8)
  --timeout-minutes <n>                Max time to wait for the export to finish (default: 15)
  --headed                             Show the browser window (for debugging)
  --help                               Show this help

Constraints inherited from the app's own animation export: the range must be
between 1h and 12h, fit within a single UTC calendar day, and produce at most
${MAX_ANIMATION_EXPORT_FRAMES} frames (10-minute steps).

Example — RGB+VIS composite of the evening of 12 Aug 2026 over the Atlantic/Spain:
  npm run export:composite -- \\
    --start 2026-08-12T19:00 --end 2026-08-12T22:00 \\
    --layers rgb,vis --center 40,-10 --zoom 4 --out eclipse-12aug.gif
`);
}

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      start: { type: 'string' },
      end: { type: 'string' },
      layers: { type: 'string', default: 'rgb,vis' },
      format: { type: 'string', default: 'gif' },
      fps: { type: 'string', default: '6' },
      out: { type: 'string' },
      url: { type: 'string', default: DEFAULT_APP_URL },
      center: { type: 'string' },
      zoom: { type: 'string' },
      'hd-enhance': { type: 'boolean', default: false },
      'hd-preset': { type: 'string', default: 'balanced' },
      'hd-strength': { type: 'string' },
      'hd-highlight-protection': { type: 'string' },
      'hd-shadow-protection': { type: 'string' },
      'hd-local-contrast': { type: 'string' },
      'hd-sharpen': { type: 'string' },
      'hd-saturation-adjust': { type: 'string' },
      'hd-noise-reduction': { type: 'string' },
      'hd-radius': { type: 'string' },
      'vis-brightness': { type: 'string' },
      'vis-contrast': { type: 'string' },
      'rgb-saturation': { type: 'string' },
      'gif-max-dimension': { type: 'string', default: '1280' },
      'gif-colors': { type: 'string', default: '128' },
      'gif-dither': { type: 'string', default: 'none' },
      'gif-pause': { type: 'string', default: '100' },
      'webm-quality': { type: 'string', default: '0.8' },
      'timeout-minutes': { type: 'string', default: '15' },
      headed: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  return values;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseUtcDateTime(value: string, flagName: string): Date {
  const iso = value.includes('T') ? value : `${value}T00:00`;
  const withZone = iso.endsWith('Z') ? iso : `${iso}Z`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) {
    fail(`--${flagName} "${value}" is not a valid date/time (expected e.g. 2026-08-12T20:00)`);
  }
  return date;
}

function roundToTenMinutes(date: Date): Date {
  const rounded = new Date(date.getTime());
  rounded.setUTCMinutes(Math.round(rounded.getUTCMinutes() / 10) * 10, 0, 0);
  return rounded;
}

function stepFromDate(date: Date): number {
  return date.getUTCHours() * 6 + date.getUTCMinutes() / 10;
}

function encodeShareSnapshot(snapshot: Record<string, unknown>): string {
  const json = JSON.stringify(snapshot);
  return Buffer.from(json, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function parseNumericChoice<T extends number>(raw: string, choices: readonly T[], flagName: string): T {
  const parsed = Number(raw);
  const match = choices.find((choice) => choice === parsed);
  if (match === undefined) fail(`--${flagName} must be one of: ${choices.join(', ')} (got "${raw}")`);
  return match;
}

async function waitForVisibleExportError(page: Page, stop: { value: boolean }): Promise<string> {
  while (!stop.value) {
    const text = await page.locator('p.text-rose-600, p.text-rose-300').first().textContent().catch(() => null);
    if (text && text.trim()) return text.trim();
    await page.waitForTimeout(2000);
  }
  return '';
}

async function main() {
  const args = parseCliArgs();
  if (args.help) {
    printUsage();
    return;
  }
  if (!args.start || !args.end) {
    printUsage();
    fail('--start and --end are required');
  }

  const format = args.format === 'webm' ? 'webm' : args.format === 'gif' ? 'gif' : fail(`--format must be "gif" or "webm" (got "${args.format}")`);

  const layerList = args.layers!.split(',').map((s) => s.trim().toLowerCase());
  const validLayers: Layer[] = ['rgb', 'vis', 'ir'];
  for (const layer of layerList) {
    if (!validLayers.includes(layer as Layer)) fail(`--layers contains an unknown layer "${layer}" (expected rgb, vis, ir)`);
  }
  const activeLayers = {
    rgb: layerList.includes('rgb'),
    vis: layerList.includes('vis'),
    ir: layerList.includes('ir'),
  };
  if (!activeLayers.rgb && !activeLayers.vis && !activeLayers.ir) fail('--layers must include at least one of rgb, vis, ir');

  const startRaw = parseUtcDateTime(args.start!, 'start');
  const endRaw = parseUtcDateTime(args.end!, 'end');
  const start = roundToTenMinutes(startRaw);
  const end = roundToTenMinutes(endRaw);
  if (start.getTime() !== startRaw.getTime() || end.getTime() !== endRaw.getTime()) {
    console.log(`Note: rounded range to the nearest 10 minutes: ${start.toISOString().slice(0, 16)} -> ${end.toISOString().slice(0, 16)}`);
  }

  const startDatePart = start.toISOString().slice(0, 10);
  const endDatePart = end.toISOString().slice(0, 10);
  if (startDatePart !== endDatePart) {
    fail(`--start and --end must fall on the same UTC calendar day (the app's animation range is single-day). Got ${startDatePart} and ${endDatePart} — split this into one run per day.`);
  }

  const customStartStep = stepFromDate(start);
  const customEndStep = stepFromDate(end);
  if (customStartStep >= customEndStep) fail('--end must be after --start');
  if (customStartStep < 0 || customEndStep > DAY_MAX_STEP) fail('--start/--end must fall within 00:00-23:50 UTC');

  const durationMs = end.getTime() - start.getTime();
  if (durationMs < MIN_CUSTOM_RANGE_MS) fail(`the range must be at least 1h (got ${(durationMs / 60000).toFixed(0)} min)`);
  if (durationMs > MAX_CUSTOM_RANGE_MS) fail(`the range must be at most 12h (got ${(durationMs / 3600000).toFixed(1)} h)`);
  const frameCount = (customEndStep - customStartStep) / (TEN_MINUTES_MS / 60000 / 10) + 1;
  if (frameCount > MAX_ANIMATION_EXPORT_FRAMES) fail(`the range would produce ${frameCount} frames, more than the app's ${MAX_ANIMATION_EXPORT_FRAMES}-frame export cap`);

  const fps = Math.max(2, Math.min(20, Math.round(Number(args.fps))));
  const gifMaxDimension = parseNumericChoice(args['gif-max-dimension']!, GIF_MAX_DIMENSIONS, 'gif-max-dimension');
  const gifColorCount = parseNumericChoice(args['gif-colors']!, GIF_COLOR_COUNTS, 'gif-colors');
  const gifFinalPauseMs = parseNumericChoice(args['gif-pause']!, GIF_FINAL_PAUSE_MS, 'gif-pause');
  const gifDitherLevel = args['gif-dither']!;
  if (!GIF_DITHER_LEVELS.includes(gifDitherLevel as (typeof GIF_DITHER_LEVELS)[number])) {
    fail(`--gif-dither must be one of: ${GIF_DITHER_LEVELS.join(', ')}`);
  }
  const webmQuality = Math.max(0, Math.min(1, Number(args['webm-quality'])));
  const timeoutMs = Math.max(1, Number(args['timeout-minutes'])) * 60 * 1000;

  let mapView: { lat: number; lng: number; zoom: number } | undefined;
  if (args.center) {
    const parts = args.center.split(',').map((s) => Number(s.trim()));
    if (parts.length !== 2 || parts.some(Number.isNaN)) fail('--center must be "lat,lng", e.g. "40,-10"');
    mapView = { lat: parts[0]!, lng: parts[1]!, zoom: args.zoom ? Number(args.zoom) : 5 };
  } else if (args.zoom) {
    fail('--zoom requires --center to also be set');
  }

  const HD_PRESETS = ['natural', 'balanced', 'punchy', 'analyze'] as const;
  if (!HD_PRESETS.includes(args['hd-preset'] as (typeof HD_PRESETS)[number])) {
    fail(`--hd-preset must be one of: ${HD_PRESETS.join(', ')}`);
  }
  const numOrUndefined = (flagName: string, raw: string | undefined): number | undefined => {
    if (raw === undefined) return undefined;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) fail(`--${flagName} must be a number (got "${raw}")`);
    return parsed;
  };
  const presetDefaults = HD_PRESET_SLIDER_VALUES[args['hd-preset'] as keyof typeof HD_PRESET_SLIDER_VALUES];
  const hdOverrides = {
    hdEnhanceStrength: numOrUndefined('hd-strength', args['hd-strength']) ?? presetDefaults.strength,
    hdEnhanceHighlightProtection: numOrUndefined('hd-highlight-protection', args['hd-highlight-protection']) ?? presetDefaults.highlightProtection,
    hdEnhanceShadowProtection: numOrUndefined('hd-shadow-protection', args['hd-shadow-protection']) ?? presetDefaults.shadowProtection,
    hdEnhanceLocalContrast: numOrUndefined('hd-local-contrast', args['hd-local-contrast']) ?? presetDefaults.localContrast,
    hdEnhanceSharpen: numOrUndefined('hd-sharpen', args['hd-sharpen']) ?? presetDefaults.sharpen,
    hdEnhanceSaturationAdjust: numOrUndefined('hd-saturation-adjust', args['hd-saturation-adjust']) ?? presetDefaults.saturationAdjust,
    hdEnhanceNoiseReduction: numOrUndefined('hd-noise-reduction', args['hd-noise-reduction']) ?? presetDefaults.noiseReduction,
    hdEnhanceRadius: numOrUndefined('hd-radius', args['hd-radius']) ?? presetDefaults.radius,
  };
  const adjustmentOverrides = {
    visBrightness: numOrUndefined('vis-brightness', args['vis-brightness']),
    visContrast: numOrUndefined('vis-contrast', args['vis-contrast']),
    rgbSaturation: numOrUndefined('rgb-saturation', args['rgb-saturation']),
  };

  const snapshot: Record<string, unknown> = {
    activeLayers,
    animationPreset: 'custom',
    customAnimationDate: startDatePart,
    customStartStep,
    customEndStep,
    animationFps: fps,
    gifMaxDimension,
    gifColorCount,
    gifPaletteMode: 'per-frame',
    gifDitherLevel,
    gifFinalPauseMs,
    hdEnhanceEnabled: Boolean(args['hd-enhance']),
    hdEnhancePreset: args['hd-preset'],
    language: 'fr',
    themeMode: 'dark',
    ...(mapView ? { mapView } : {}),
    ...Object.fromEntries(Object.entries(hdOverrides).filter(([, v]) => v !== undefined)),
    ...Object.fromEntries(Object.entries(adjustmentOverrides).filter(([, v]) => v !== undefined)),
  };
  const url = `${args.url}?view=${encodeShareSnapshot(snapshot)}`;

  const layerLabel = layerList.map((l) => l.toUpperCase()).join('+');
  const rangeLabel = `${startDatePart}_${String(start.getUTCHours()).padStart(2, '0')}${String(start.getUTCMinutes()).padStart(2, '0')}-${String(end.getUTCHours()).padStart(2, '0')}${String(end.getUTCMinutes()).padStart(2, '0')}`;
  const outPath = path.resolve(args.out ?? `mtg_${layerLabel}_${rangeLabel}.${format === 'gif' ? 'gif' : 'webm'}`);
  await mkdir(path.dirname(outPath), { recursive: true });

  console.log(`Layers: ${layerLabel} | Range: ${start.toISOString().slice(0, 16)} -> ${end.toISOString().slice(0, 16)} UTC | Frames: ~${frameCount} | Format: ${format}`);
  console.log(`Driving: ${url}`);

  const browser = await chromium.launch({ headless: !args.headed });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    page.on('pageerror', (err) => console.error('  [page error]', String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('  [console]', msg.text());
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Temps UTC', { timeout: 30000 });

    await page.getByRole('button', { name: 'Exporter', exact: true }).click();
    const modeLabel = format === 'gif' ? 'Animation GIF' : 'Vidéo WebM';
    await page.getByRole('button', { name: modeLabel, exact: true }).click();

    if (format === 'webm') {
      // The WebM quality slider has no dedicated share-snapshot field; set it directly in the modal.
      const qualityInput = page.locator('input[type="range"]').last();
      await qualityInput.evaluate((el: HTMLInputElement, value: number) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(el, String(value));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, webmQuality).catch(() => {
        console.log('  Note: could not set --webm-quality via the slider, using the app default.');
      });
    }

    const confirmLabel = format === 'gif' ? 'Exporter GIF' : 'Exporter WebM';
    const stop = { value: false };
    const errorPromise = waitForVisibleExportError(page, stop);
    const downloadPromise = page.waitForEvent('download', { timeout: timeoutMs });

    const progressTimer = setInterval(() => {
      page
        .getByRole('button', { name: /^Génération/ })
        .first()
        .textContent()
        .then((text) => {
          if (text) console.log(`  ${text.trim()}`);
        })
        .catch(() => {});
    }, 5000);

    await page.getByRole('button', { name: confirmLabel, exact: true }).click();

    let download: Awaited<typeof downloadPromise> | null = null;
    try {
      const winner = await Promise.race([
        downloadPromise.then((d) => ({ kind: 'download' as const, download: d })),
        errorPromise.then((message) => ({ kind: 'error' as const, message })),
      ]);
      if (winner.kind === 'error') {
        throw new Error(`the app reported: ${winner.message}`);
      }
      download = winner.download;
    } finally {
      stop.value = true;
      clearInterval(progressTimer);
    }

    await download.saveAs(outPath);
    console.log(`Saved: ${outPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Export failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
