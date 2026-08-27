import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { ArrowLeftRight, Bug, CircleHelp, Clock, Download, Film, History, Info, Loader2, Minus, Monitor, Moon, Pause, Play, Plus, RefreshCw, Sliders, Square, Sun, Wrench, X } from 'lucide-react';

import {
  type ActiveLayers,
  getExportFileBaseName,
  getExportLabel,
  getSinglePanelTitle,
  IR_STYLES,
  themedClass,
  type ExportKind,
  type IrStyle,
  type MapOptions,
} from './dualMapViewerShared';
import type { StillImageFormat } from './dualMapExport';
import type { AnimationPreset } from './shareSnapshot';
import type { Language, Translator } from './i18n';

type UiTheme = 'dark' | 'light';

// lucide-react dropped brand/logo icons (including Github) in v1 — inlined here instead of
// pulling in a whole extra icon package for a single mark.
function GithubIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={props.className} aria-hidden="true">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.27 5.69.42.36.78 1.08.78 2.18 0 1.57-.01 2.84-.01 3.23 0 .31.21.67.8.56A10.52 10.52 0 0 0 23.5 12c0-6.27-5.23-11.5-11.5-11.5Z" />
    </svg>
  );
}

type TimeDockProps = {
  autoUpdateEnabled: boolean;
  currentTime: string;
  isAtLatest: boolean;
  isBackgroundRefreshing: boolean;
  isPlaying: boolean;
  isSyncingLatest: boolean;
  latestAvailableDatePart: string;
  latestAvailableTime: string;
  playbackCustomDate: string;
  playbackCustomDayMaxStep: number;
  playbackCustomEndStep: number;
  playbackCustomStartStep: number;
  playbackFps: number;
  playbackFpsMax: number;
  playbackFpsMin: number;
  isAnimationPanelOpen: boolean;
  isPlaybackStale: boolean;
  gifColorCount: 64 | 128 | 256;
  gifDitherLevel: 'none' | 'low' | 'medium' | 'high';
  gifFinalPauseMs: number;
  gifPaletteMode: 'per-frame' | 'global';
  webmQuality: number;
  playbackFramePreview: { count: number; start: string; end: string } | null;
  playbackFrames: string[];
  playbackIndex: number;
  playbackPreload: { done: number; total: number } | null;
  playbackBoomerang: boolean;
  playbackSkippedCount: number;
  playbackDownloadFormat: 'gif' | 'webm' | null;
  playbackDownloadProgress: number;
  playbackPreset: AnimationPreset;
  playbackQuality: number;
  playbackQualityChoices: readonly number[];
  t: Translator;
  theme: UiTheme;
  onAutoUpdateToggle: () => void;
  onLatest: () => void;
  onPlaybackCustomDateChange: (date: string) => void;
  onPlaybackCustomEndStepChange: (step: number) => void;
  onPlaybackCustomStartStepChange: (step: number) => void;
  onPlaybackFpsChange: (fps: number) => void;
  onPlaybackBoomerangToggle: () => void;
  onAnimationPanelToggle: () => void;
  onPlaybackRelaunch: () => void;
  onGifColorCountChange: (value: 64 | 128 | 256) => void;
  onGifDitherLevelChange: (value: 'none' | 'low' | 'medium' | 'high') => void;
  onGifFinalPauseChange: (value: number) => void;
  onGifPaletteModeChange: (value: 'per-frame' | 'global') => void;
  onWebmQualityChange: (value: number) => void;
  onPlaybackDownload: (format: 'gif' | 'webm') => void;
  onPlaybackPresetChange: (preset: AnimationPreset) => void;
  onPlaybackQualityChange: (quality: number) => void;
  onPlaybackSeek: (index: number) => void;
  onPlaybackStop: () => void;
  onPlaybackToggle: () => void;
  onTimeChange: (newTime: string) => void;
};

/** Compact "2 h 30" / "40 min" gap between the viewed time and the latest available one. Both are
 *  `YYYY-MM-DDTHH:MM` UTC strings, hence the explicit 'Z'. */
function formatTimeBehind(currentTime: string, latestAvailableTime: string): string | null {
  const current = new Date(`${currentTime}Z`).getTime();
  const latest = new Date(`${latestAvailableTime}Z`).getTime();
  if (Number.isNaN(current) || Number.isNaN(latest)) return null;

  const minutesBehind = Math.round((latest - current) / 60000);
  if (minutesBehind < 10) return null;
  if (minutesBehind < 60) return `${minutesBehind} min`;

  const hours = Math.floor(minutesBehind / 60);
  const minutes = minutesBehind % 60;
  if (hours < 24) return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)} j`;
}

/**
 * Asked when the map is panned or zoomed while an animation is running or being prepared. The
 * frames are rendered for one framing, so a move makes them describe a view that is no longer
 * there — but silently ending the animation for a stray scroll is worse than asking (issue #78).
 */
export function PlaybackExitModal(props: {
  mode: 'session' | 'preload';
  reason: 'view' | 'time';
  t: Translator;
  theme: UiTheme;
  onLeave: () => void;
  onResume: () => void;
}) {
  const { mode, reason, t, theme, onLeave, onResume } = props;
  const isLight = theme === 'light';
  // Escape resumes rather than leaves: it is the conventional "cancel what I just did" key, and
  // here the thing being cancelled is the gesture that would have thrown the sequence away.
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onResume();
    };
    window.addEventListener('keydown', handleEsc, { capture: true });
    return () => window.removeEventListener('keydown', handleEsc, { capture: true });
  }, [onResume]);
  const resumeLabel = t(mode === 'preload' ? 'playbackExitRestart' : 'playbackExitResume');
  const resumeOutcome = reason === 'time'
    ? t('playbackExitTimeResumeOutcome')
    : t(mode === 'preload' ? 'playbackExitRestartOutcome' : 'playbackExitResumeOutcome');
  // During preparation nothing is laid over the map, so the move *is* visible and the wording has
  // to differ: only a running animation hides what the user just did.
  const leaveOutcome = reason === 'time'
    ? t('playbackExitTimeLeaveOutcome')
    : t(mode === 'preload' ? 'playbackExitLeavePreloadOutcome' : 'playbackExitLeaveOutcome');
  const lead = reason === 'time'
    ? t('playbackExitTimeLead')
    : t(mode === 'preload' ? 'playbackExitPreloadLead' : 'playbackExitLead');

  // Each choice is spelled out against its own button label rather than buried in a sentence:
  // the point of this dialog is that both gestures cannot win, and that has to be readable at a
  // glance rather than parsed out of a semicolon.
  const outcome = (label: string, text: string, emphasised: boolean) => (
    <li className="flex gap-2">
      <span className={`mt-[0.45rem] w-1 h-1 rounded-full shrink-0 ${
        emphasised
          ? themedClass(isLight, 'bg-slate-900', 'bg-blue-400')
          : themedClass(isLight, 'bg-slate-400', 'bg-slate-500')
      }`} />
      <span>
        <span className={`font-medium ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{label}</span>
        {' '}
        {text}
      </span>
    </li>
  );

  return (
    <div className="fixed inset-0 z-[560] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('playbackExitTitle')}
        className={`w-[min(92vw,30rem)] rounded-xl border shadow-2xl ${
          themedClass(isLight, 'bg-white border-slate-300', 'bg-[#141414] border-white/15')
        }`}
      >
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <span className={`mt-0.5 shrink-0 flex items-center justify-center w-8 h-8 rounded-full ${
            themedClass(isLight, 'bg-amber-100 text-amber-700', 'bg-amber-500/15 text-amber-300')
          }`}>
            <Film className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className={`text-sm sm:text-base font-semibold leading-snug ${
              themedClass(isLight, 'text-slate-900', 'text-white')
            }`}>
              {t('playbackExitTitle')}
            </h2>
            <p className={`mt-1.5 text-xs sm:text-[13px] leading-relaxed ${
              themedClass(isLight, 'text-slate-600', 'text-slate-300')
            }`}>
              {lead}
            </p>
            <ul className={`mt-3 space-y-1.5 text-xs sm:text-[13px] leading-relaxed ${
              themedClass(isLight, 'text-slate-600', 'text-slate-300')
            }`}>
              {outcome(resumeLabel, resumeOutcome, true)}
              {outcome(t('playbackExitLeave'), leaveOutcome, false)}
            </ul>
          </div>
        </div>
        <div className={`flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-4 sm:px-5 py-3 border-t rounded-b-xl ${
          themedClass(isLight, 'bg-slate-50 border-slate-200', 'bg-white/[0.03] border-white/10')
        }`}>
          <button
            onClick={onLeave}
            className={`rounded-md border px-3 py-2 text-xs sm:text-sm transition-colors ${
              isLight
                ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-200'
            }`}
          >
            {t('playbackExitLeave')}
          </button>
          <button
            onClick={onResume}
            autoFocus
            className={`rounded-md border px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
              isLight
                ? 'bg-slate-900 hover:bg-slate-700 border-slate-900 text-white'
                : 'bg-blue-500/80 hover:bg-blue-500 border-blue-400/60 text-white'
            }`}
          >
            {resumeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TimeDock(props: TimeDockProps) {
  const {
    autoUpdateEnabled,
    currentTime,
    isAtLatest,
    isBackgroundRefreshing,
    isPlaying,
    isSyncingLatest,
    latestAvailableDatePart,
    latestAvailableTime,
    playbackCustomDate,
    playbackCustomDayMaxStep,
    playbackCustomEndStep,
    playbackCustomStartStep,
    playbackFps,
    playbackFpsMax,
    playbackFpsMin,
    isAnimationPanelOpen,
    isPlaybackStale,
    gifColorCount,
    gifDitherLevel,
    gifFinalPauseMs,
    gifPaletteMode,
    webmQuality,
    playbackFramePreview,
    playbackFrames,
    playbackIndex,
    playbackPreload,
    playbackBoomerang,
    playbackSkippedCount,
    playbackDownloadFormat,
    playbackDownloadProgress,
    playbackPreset,
    playbackQuality,
    playbackQualityChoices,
    onAutoUpdateToggle,
    onLatest,
    onPlaybackCustomDateChange,
    onPlaybackCustomEndStepChange,
    onPlaybackCustomStartStepChange,
    onPlaybackFpsChange,
    onPlaybackBoomerangToggle,
    onAnimationPanelToggle,
    onPlaybackRelaunch,
    onGifColorCountChange,
    onGifDitherLevelChange,
    onGifFinalPauseChange,
    onGifPaletteModeChange,
    onWebmQualityChange,
    onPlaybackDownload,
    onPlaybackPresetChange,
    onPlaybackQualityChange,
    onPlaybackSeek,
    onPlaybackStop,
    onPlaybackToggle,
    onTimeChange,
    t,
    theme,
  } = props;
  const hasPlaybackSession = playbackFrames.length > 0;
  // Collapsed by default: these change what the *file* looks like, not what plays, and the dock
  // is already dense on a phone. They live here rather than in the export modal because since
  // issue #78 that modal produces stills only.
  const [areFileSettingsOpen, setAreFileSettingsOpen] = useState(false);
  // Owned by DualMapViewer since the `A` shortcut has to reach it too; the panel stays
  // collapsible while a sequence runs, because folding it away is a legitimate way to watch the
  // map without the controls in front of it.
  const showAnimationPanel = isAnimationPanelOpen;
  const playbackRangeLabel = hasPlaybackSession
    ? `${playbackFrames[0].slice(11)} → ${playbackFrames[playbackFrames.length - 1].slice(11)}`
    : null;
  const isLight = theme === 'light';
  const playbackSpeedControls = (
    <>
      {t('playbackSpeed')}
      <input
        type="range"
        min={playbackFpsMin}
        max={playbackFpsMax}
        step={1}
        value={playbackFps}
        onChange={(e) => onPlaybackFpsChange(Number(e.target.value))}
        aria-label={`${t('playbackSpeed')} (${t('playbackSpeedUnit')})`}
        className={`w-20 sm:w-24 h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
          themedClass(isLight, 'bg-slate-200', 'bg-white/10')
        }`}
      />
      <span className="font-mono tabular-nums w-[3.5rem] shrink-0">{playbackFps} {t('playbackSpeedUnit')}</span>
      <button
        onClick={onPlaybackBoomerangToggle}
        title={t('playbackBoomerangHint')}
        aria-label={t('playbackBoomerang')}
        aria-pressed={playbackBoomerang}
        className={`inline-flex items-center gap-1 border rounded px-1.5 py-0.5 transition-colors ${
          playbackBoomerang
            ? isLight ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white/20 border-white/30 text-white'
            : isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-300'
        }`}
      >
        <ArrowLeftRight className="w-3 h-3 shrink-0" />
      </button>
    </>
  );

  const stepToLabel = (step: number) => {
    const total = Math.max(0, Math.min(143, Math.round(step))) * 10;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  const [isMobileActionsExpanded, setIsMobileActionsExpanded] = useState(false);
  const [datePart, timePart] = currentTime.split('T');
  const [hourPart, minutePart] = timePart.split(':');
  const totalMinutes = Number(hourPart) * 60 + Number(minutePart);
  const timeBehindLabel = formatTimeBehind(currentTime, latestAvailableTime);

  /**
   * While the time slider is being dragged, the position is held here instead of being pushed
   * upward. Every ten-minute step used to commit immediately, so dragging across six hours fired
   * thirty-six time changes — each one a full WMS grid prewarm for a frame the user was only
   * passing through. The handle still tracks the finger and the read-out still follows it; only
   * the loading waits for the release.
   *
   * Keyboard and track-clicks are unaffected: they never open a drag, so they commit at once.
   */
  const [scrubMinutes, setScrubMinutes] = useState<number | null>(null);

  const updateTimeFromTotalMinutes = (nextTotalMinutes: number) => {
    const normalized = Math.max(0, Math.min(23 * 60 + 50, Math.round(nextTotalMinutes / 10) * 10));
    const nextHour = String(Math.floor(normalized / 60)).padStart(2, '0');
    const nextMinute = String(normalized % 60).padStart(2, '0');
    onTimeChange(`${datePart}T${nextHour}:${nextMinute}`);
  };

  // The pending value lives in a ref as well as in state: `pointerup` and `lostpointercapture`
  // both fire at the end of a drag, and reading the state would let the second one commit again
  // before React has flushed the first — which during playback means raising the exit dialog
  // twice for one gesture.
  const scrubRef = useRef<number | null>(null);

  const beginScrub = () => {
    scrubRef.current = totalMinutes;
    setScrubMinutes(totalMinutes);
  };

  const moveScrub = (value: number) => {
    scrubRef.current = value;
    setScrubMinutes(value);
  };

  const commitScrub = () => {
    const target = scrubRef.current;
    if (target === null) return;
    scrubRef.current = null;
    setScrubMinutes(null);
    if (target !== totalMinutes) updateTimeFromTotalMinutes(target);
  };

  // What the dock should read out: the position under the finger while dragging, the real current
  // time otherwise.
  const displayedMinutes = scrubMinutes ?? totalMinutes;
  const displayedHour = String(Math.floor(displayedMinutes / 60)).padStart(2, '0');
  const displayedMinute = String(displayedMinutes % 60).padStart(2, '0');

  // Same reason as DualMapViewer's shortcut listener: read the action at keypress time rather than
  // capturing it. Depending on the derived `totalMinutes` alone was what let the first arrow press
  // during an animation slip past the exit confirmation, since that value is frozen while a
  // sequence plays and the effect therefore never re-subscribed with a current callback.
  const stepTimeRef = useRef(updateTimeFromTotalMinutes);
  const totalMinutesRef = useRef(totalMinutes);
  useEffect(() => {
    stepTimeRef.current = updateTimeFromTotalMinutes;
    totalMinutesRef.current = totalMinutes;
  });

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
      stepTimeRef.current(totalMinutesRef.current + delta);
    };

    // Capture phase ensures map keyboard handlers (Leaflet) do not consume arrows first.
    window.addEventListener('keydown', handleKeydown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeydown, { capture: true });
  }, []);

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
            {isBackgroundRefreshing && (
              <Loader2 className="w-3 h-3 animate-spin shrink-0 text-blue-300" aria-label={t('autoUpdateRefreshing')} />
            )}
          </span>
          <span className="inline-flex items-center gap-2 min-w-0">
            {/* Issue #52: the app deliberately restores the time you left on, which is easy to
                forget about — this is the cue that you are not on live imagery, and a shortcut
                back. Only shown once genuinely behind (>= one 10-min slot), so it can't flicker
                on the boundary. */}
            {!isAtLatest && timeBehindLabel && !hasPlaybackSession && (
              <button
                onClick={onLatest}
                disabled={isSyncingLatest}
                title={t('notLatestHint')}
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium transition-colors disabled:cursor-wait ${
                  isLight
                    ? 'bg-amber-100 hover:bg-amber-200 border-amber-400 text-amber-900'
                    : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/50 text-amber-200'
                }`}
              >
                <History className="w-3 h-3 shrink-0" />
                <span className="hidden sm:inline">{t('notLatestBadge')} · </span>
                <span className="font-mono">−{timeBehindLabel}</span>
              </button>
            )}
            {/* While a sequence is on screen the headline time is the frame being shown, not the
                map's own time — which stays where the animation was opened from. */}
            <span className={`font-mono ${
              hasPlaybackSession
                ? themedClass(isLight, 'text-blue-700', 'text-blue-300')
                : themedClass(isLight, 'text-slate-900', 'text-white')
            }`}>
              {hasPlaybackSession
                ? playbackFrames[Math.min(playbackIndex, playbackFrames.length - 1)].replace('T', ' ')
                : `${datePart} ${displayedHour}:${displayedMinute}`}
            </span>
          </span>
        </div>

        {/* Animation panel (issue #78). Collapsed by default so the dock keeps its usual height,
            and never a modal: an animation is something you watch, so covering the map would
            defeat it — the same reason AdjustmentsPanel is an anchored dropdown. */}
        {showAnimationPanel && (
          <div className={`mb-2 rounded-lg border px-2.5 py-2 space-y-2 ${
            themedClass(isLight, 'bg-slate-50 border-slate-300', 'bg-white/5 border-white/10')
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
              <span className={`text-[9px] sm:text-[10px] uppercase tracking-wide shrink-0 ${
                themedClass(isLight, 'text-slate-500', 'text-slate-400')
              }`}>
                {t('playbackRangeSetting')}
              </span>
              <div className="grid grid-cols-4 gap-1 sm:flex sm:gap-1 flex-1 min-w-0">
                {([['3h', 'animationLast3h'], ['6h', 'animationLast6h'], ['12h', 'animationLast12h'], ['custom', 'playbackRangeCustomShort']] as const).map(([value, key]) => (
                  <button
                    key={value}
                    onClick={() => onPlaybackPresetChange(value)}
                    className={`border rounded-md px-1.5 py-1 text-[10px] sm:text-[11px] truncate transition-colors ${
                      playbackPreset === value
                        ? isLight
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white/20 border-white/30 text-white'
                        : isLight
                          ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                          : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-300'
                    }`}
                    title={t(key)}
                  >
                    {value === 'custom' ? t('playbackRangeCustomShort') : value}
                  </button>
                ))}
              </div>
              <span className={`hidden sm:inline-flex items-center gap-1.5 shrink-0 text-[10px] ${
                themedClass(isLight, 'text-slate-600', 'text-slate-400')
              }`}>
                {playbackSpeedControls}
              </span>
            </div>

            {playbackPreset === 'custom' && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                <input
                  type="date"
                  max={latestAvailableDatePart}
                  value={playbackCustomDate}
                  onChange={(e) => { if (e.target.value) onPlaybackCustomDateChange(e.target.value); }}
                  className={`sm:w-[9.5rem] w-full border rounded-md px-2 py-1 text-[11px] outline-none focus:border-blue-500 cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-[#222] border-white/10 text-white [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert'
                  }`}
                />
                <div className="flex-1 min-w-0 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
                  <span className={`font-mono text-[10px] ${themedClass(isLight, 'text-slate-600', 'text-slate-400')}`}>
                    {stepToLabel(playbackCustomStartStep)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, playbackCustomDayMaxStep)}
                    step={1}
                    value={playbackCustomStartStep}
                    onChange={(e) => onPlaybackCustomStartStepChange(Number(e.target.value))}
                    aria-label={t('animationStart')}
                    className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
                      themedClass(isLight, 'bg-slate-200', 'bg-white/10')
                    }`}
                  />
                  <span className={`font-mono text-[10px] ${themedClass(isLight, 'text-slate-600', 'text-slate-400')}`}>
                    {stepToLabel(playbackCustomEndStep)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, playbackCustomDayMaxStep)}
                    step={1}
                    value={playbackCustomEndStep}
                    onChange={(e) => onPlaybackCustomEndStepChange(Number(e.target.value))}
                    aria-label={t('animationEnd')}
                    className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
                      themedClass(isLight, 'bg-slate-200', 'bg-white/10')
                    }`}
                  />
                </div>
              </div>
            )}

            {playbackPreload ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-blue-400" />
                <div className="flex-1 min-w-0">
                  <div className={`flex items-center justify-between text-[10px] sm:text-[11px] ${
                    themedClass(isLight, 'text-slate-700', 'text-slate-300')
                  }`}>
                    <span className="truncate">{t('playbackPreparing')}</span>
                    <span className="font-mono shrink-0">{playbackPreload.done}/{playbackPreload.total}</span>
                  </div>
                  <div className={`mt-1 h-1 rounded-full overflow-hidden ${themedClass(isLight, 'bg-slate-200', 'bg-white/10')}`}>
                    <div
                      className="h-full bg-blue-500 transition-all duration-200 ease-out"
                      style={{ width: `${Math.round((playbackPreload.done / Math.max(1, playbackPreload.total)) * 100)}%` }}
                    />
                  </div>
                </div>
                <button
                  onClick={onPlaybackToggle}
                  className={`shrink-0 border rounded-md px-2 py-1 text-[10px] sm:text-[11px] transition-colors ${
                    isLight
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-200'
                  }`}
                >
                  {t('playbackCancel')}
                </button>
              </div>
            ) : hasPlaybackSession ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={onPlaybackToggle}
                    title={isPlaying ? t('playbackPause') : t('playbackPlay')}
                    aria-label={isPlaying ? t('playbackPause') : t('playbackPlay')}
                    className={`shrink-0 flex items-center justify-center rounded-md border w-9 h-9 sm:w-8 sm:h-8 transition-colors ${
                      isLight
                        ? 'bg-slate-900 hover:bg-slate-700 border-slate-900 text-white'
                        : 'bg-blue-500/80 hover:bg-blue-500 border-blue-400/60 text-white'
                    }`}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, playbackFrames.length - 1)}
                    step={1}
                    value={Math.min(playbackIndex, playbackFrames.length - 1)}
                    onChange={(e) => onPlaybackSeek(Number(e.target.value))}
                    aria-label={t('playbackSeekAria')}
                    className={`flex-1 min-w-0 h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
                      themedClass(isLight, 'bg-slate-200', 'bg-white/10')
                    }`}
                  />
                  <span className="shrink-0 inline-flex">
                    {(['gif', 'webm'] as const).map((format, index) => {
                      const isWriting = playbackDownloadFormat === format;
                      return (
                        <button
                          key={format}
                          onClick={() => onPlaybackDownload(format)}
                          disabled={playbackDownloadFormat !== null}
                          title={`${t('playbackDownload')} — ${format.toUpperCase()} · ${t('playbackDownloadHint')}`}
                          aria-label={`${t('playbackDownload')} ${format.toUpperCase()}`}
                          className={`flex items-center justify-center gap-1 border px-1.5 h-9 sm:h-8 text-[10px] font-medium tabular-nums transition-colors disabled:opacity-60 disabled:cursor-wait ${
                            index === 0 ? 'rounded-l-md' : 'rounded-r-md -ml-px'
                          } ${
                            isLight
                              ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                              : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-300'
                          }`}
                        >
                          {isWriting
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : index === 0 ? <Download className="w-3 h-3" /> : null}
                          {isWriting && playbackDownloadProgress > 0
                            ? `${playbackDownloadProgress}%`
                            : format.toUpperCase()}
                        </button>
                      );
                    })}
                  </span>
                  <button
                    onClick={onPlaybackStop}
                    title={t('playbackStop')}
                    aria-label={t('playbackStop')}
                    className={`shrink-0 flex items-center justify-center rounded-md border w-9 h-9 sm:w-8 sm:h-8 transition-colors ${
                      isLight
                        ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                        : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-300'
                    }`}
                  >
                    <Square className="w-3 h-3" />
                  </button>
                </div>
                {/* The range and quality controls stay live during a session, but pressing play
                    replays the cached sequence — so when the selection no longer matches what is
                    on screen, say so and offer the rebuild rather than letting them look inert. */}
                {hasPlaybackSession && (
                  <div className={`rounded-md border ${themedClass(isLight, 'border-slate-300 bg-white', 'border-white/10 bg-black/20')}`}>
                    <button
                      onClick={() => setAreFileSettingsOpen((previous) => !previous)}
                      aria-expanded={areFileSettingsOpen}
                      className={`w-full flex items-center justify-between gap-2 px-2 py-1 text-[10px] transition-colors ${
                        themedClass(isLight, 'text-slate-600 hover:text-slate-900', 'text-slate-400 hover:text-slate-200')
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Wrench className="w-3 h-3 shrink-0" />
                        {t('playbackFileSettings')}
                      </span>
                      <span className="font-mono opacity-70">{areFileSettingsOpen ? '−' : '+'}</span>
                    </button>
                    {areFileSettingsOpen && (
                      <div className={`px-2 pb-2 pt-1 space-y-1.5 text-[10px] border-t ${
                        themedClass(isLight, 'border-slate-200 text-slate-600', 'border-white/10 text-slate-400')
                      }`}>
                        <p className={themedClass(isLight, 'text-slate-500', 'text-slate-500')}>{t('playbackFileSettingsHint')}</p>
                        {([
                          [t('animationGifColorCount'), [64, 128, 256], gifColorCount, (v: number) => onGifColorCountChange(v as 64 | 128 | 256), (v: number) => String(v)],
                        ] as const).map(([label, choices, value, onChange, render]) => (
                          <div key={label} className="flex items-center justify-between gap-2">
                            <span className="truncate">{label}</span>
                            <span className="inline-flex shrink-0">
                              {choices.map((choice, index) => (
                                <button
                                  key={choice}
                                  onClick={() => onChange(choice)}
                                  className={`border px-1.5 py-0.5 transition-colors ${
                                    index === 0 ? 'rounded-l' : index === choices.length - 1 ? 'rounded-r -ml-px' : '-ml-px'
                                  } ${
                                    value === choice
                                      ? isLight ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white/20 border-white/30 text-white'
                                      : isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-300'
                                  }`}
                                >
                                  {render(choice)}
                                </button>
                              ))}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{t('animationGifPaletteMode')}</span>
                          <span className="inline-flex shrink-0">
                            {(['per-frame', 'global'] as const).map((mode, index) => (
                              <button
                                key={mode}
                                onClick={() => onGifPaletteModeChange(mode)}
                                className={`border px-1.5 py-0.5 transition-colors ${index === 0 ? 'rounded-l' : 'rounded-r -ml-px'} ${
                                  gifPaletteMode === mode
                                    ? isLight ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white/20 border-white/30 text-white'
                                    : isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-300'
                                }`}
                              >
                                {t(mode === 'per-frame' ? 'animationPaletteModePerFrame' : 'animationPaletteModeGlobal')}
                              </button>
                            ))}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{t('animationGifDither')}</span>
                          <span className="inline-flex shrink-0">
                            {([
                              ['none', 'animationDitherNone'],
                              ['low', 'animationDitherLow'],
                              ['medium', 'animationDitherMedium'],
                              ['high', 'animationDitherHigh'],
                            ] as const).map(([level, levelKey], index) => (
                              <button
                                key={level}
                                onClick={() => onGifDitherLevelChange(level)}
                                className={`border px-1.5 py-0.5 transition-colors ${
                                  index === 0 ? 'rounded-l' : index === 3 ? 'rounded-r -ml-px' : '-ml-px'
                                } ${
                                  gifDitherLevel === level
                                    ? isLight ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white/20 border-white/30 text-white'
                                    : isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-300'
                                }`}
                              >
                                {t(levelKey)}
                              </button>
                            ))}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{t('animationGifFinalPause')}</span>
                          <span className="inline-flex items-center gap-1.5 shrink-0">
                            <input
                              type="range"
                              min={0}
                              max={2000}
                              step={500}
                              value={gifFinalPauseMs}
                              onChange={(e) => onGifFinalPauseChange(Number(e.target.value))}
                              aria-label={t('animationGifFinalPause')}
                              className={`w-20 h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
                                themedClass(isLight, 'bg-slate-200', 'bg-white/10')
                              }`}
                            />
                            <span className="font-mono tabular-nums w-8 text-right">{(gifFinalPauseMs / 1000).toFixed(1)}s</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{t('animationWebmQuality')}</span>
                          <span className="inline-flex items-center gap-1.5 shrink-0">
                            <input
                              type="range"
                              min={0.5}
                              max={1}
                              step={0.05}
                              value={webmQuality}
                              onChange={(e) => onWebmQualityChange(Number(e.target.value))}
                              aria-label={t('animationWebmQuality')}
                              className={`w-20 h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
                                themedClass(isLight, 'bg-slate-200', 'bg-white/10')
                              }`}
                            />
                            <span className="font-mono tabular-nums w-8 text-right">{Math.round(webmQuality * 100)}%</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isPlaybackStale && (
                  <button
                    onClick={onPlaybackRelaunch}
                    className={`w-full flex items-center justify-center gap-1.5 border rounded-md px-2 py-1.5 text-[10px] sm:text-[11px] font-medium transition-colors ${
                      isLight
                        ? 'bg-amber-100 hover:bg-amber-200 border-amber-400 text-amber-900'
                        : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-200'
                    }`}
                  >
                    <RefreshCw className="w-3 h-3 shrink-0" />
                    {playbackFramePreview
                      ? `${t('playbackRelaunch')} · ${t('playbackFramesCount').replace('{count}', String(playbackFramePreview.count))}`
                      : t('playbackRelaunch')}
                  </button>
                )}
                <div className={`flex items-center justify-between gap-2 text-[10px] ${
                  themedClass(isLight, 'text-slate-600', 'text-slate-400')
                }`}>
                  <span className="font-mono truncate">
                    {playbackFrames[Math.min(playbackIndex, playbackFrames.length - 1)].slice(11)}
                    {' · '}
                    {t('playbackFrameOf')
                      .replace('{current}', String(playbackIndex + 1))
                      .replace('{total}', String(playbackFrames.length))}
                  </span>
                  <span className="hidden sm:inline font-mono truncate opacity-80">{playbackRangeLabel}</span>
                  {playbackSkippedCount > 0 && (
                    <span
                      className={`shrink-0 ${themedClass(isLight, 'text-amber-700', 'text-amber-300')}`}
                      title={t('playbackSkipped').replace('{count}', String(playbackSkippedCount))}
                    >
                      {t('playbackSkipped').replace('{count}', String(playbackSkippedCount))}
                    </span>
                  )}
                  <span className={`inline-flex sm:hidden items-center gap-1.5 shrink-0 text-[10px] ${
                    themedClass(isLight, 'text-slate-600', 'text-slate-400')
                  }`}>
                    {playbackSpeedControls}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className={`flex items-center justify-between gap-2 text-[10px] ${
                  themedClass(isLight, 'text-slate-600', 'text-slate-400')
                }`}>
                  <span className="inline-flex items-center gap-1.5 shrink-0">
                    {t('playbackQuality')}
                    {playbackQualityChoices.map((quality, index) => (
                      <button
                        key={quality}
                        onClick={() => onPlaybackQualityChange(quality)}
                        title={`${quality} px`}
                        className={`border rounded px-1.5 py-0.5 transition-colors ${
                          quality === playbackQuality
                            ? isLight ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white/20 border-white/30 text-white'
                            : isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-300'
                        }`}
                      >
                        {t(index === 0 ? 'playbackQualityFast' : index === 1 ? 'playbackQualityBalanced' : 'playbackQualityDetailed')}
                      </button>
                    ))}
                  </span>
                  {playbackFramePreview && (
                    <span className="font-mono truncate text-right">
                      {t('playbackResolvedRange')
                        .replace('{start}', playbackFramePreview.start.replace('T', ' '))
                        .replace('{end}', playbackFramePreview.end.replace('T', ' '))}
                    </span>
                  )}
                </div>
                <button
                  onClick={onPlaybackToggle}
                  className={`w-full flex items-center justify-center gap-2 border rounded-md px-2 py-2 sm:py-1.5 text-[11px] sm:text-xs font-medium transition-colors ${
                    isLight
                      ? 'bg-slate-900 hover:bg-slate-700 border-slate-900 text-white'
                      : 'bg-blue-500/80 hover:bg-blue-500 border-blue-400/60 text-white'
                  }`}
                >
                  <Play className="w-3.5 h-3.5 shrink-0" />
                  {t('playbackStart')}
                  {playbackFramePreview && (
                    <span className="font-mono opacity-80">
                      · {t('playbackFramesCount').replace('{count}', String(playbackFramePreview.count))}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="date"
            max={latestAvailableTime.split('T')[0]}
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
              value={displayedMinutes}
              onPointerDown={beginScrub}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (scrubRef.current !== null) moveScrub(next);
                else updateTimeFromTotalMinutes(next);
              }}
              onPointerUp={commitScrub}
              onPointerCancel={commitScrub}
              onLostPointerCapture={commitScrub}
              onBlur={commitScrub}
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

          {/* 7 actions: rows of 3 on mobile rather than one wide grid, which would squeeze
              each button well below the ~44px minimum touch target on narrow phones. Unchanged
              single flex row from sm: up. */}
          <div className={`${isMobileActionsExpanded ? 'grid' : 'hidden'} grid-cols-3 gap-1 sm:flex sm:items-stretch sm:gap-1 sm:!flex`}>
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
            {/* Issue #78: the animation lives in the time dock rather than the export modal — it
                is a way of *looking* at the imagery, not of producing a file. The button opens the
                panel rather than starting straight away: preparing a sequence costs a render per
                frame, which is not something to trigger by a stray click. */}
            <button
              onClick={onAnimationPanelToggle}
              title={t('playbackPanelToggle')}
              aria-label={t('playbackPanelToggle')}
              aria-expanded={showAnimationPanel}
              className={`flex items-center justify-center gap-1 border rounded-md px-2 py-1 text-[11px] transition-colors ${
                showAnimationPanel || hasPlaybackSession || playbackPreload
                  ? isLight
                    ? 'bg-blue-600 hover:bg-blue-700 border-blue-600 text-white'
                    : 'bg-blue-500/80 hover:bg-blue-500 border-blue-400/60 text-white'
                  : isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-200'
              }`}
            >
              <Film className="w-3.5 h-3.5 shrink-0" />
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
            {/* Issue #50. Paused-vs-active is a real distinction worth surfacing: auto-update
                only advances while you are on the latest slot, so scrubbing into the past
                suspends it until you come back — without this the toggle would look broken. */}
            <button
              onClick={onAutoUpdateToggle}
              title={
                autoUpdateEnabled
                  ? (isAtLatest ? t('autoUpdateOnHint') : t('autoUpdatePaused'))
                  : t('autoUpdateOffHint')
              }
              aria-pressed={autoUpdateEnabled}
              // The visible label is just "Auto" for width, which would otherwise collide with the
              // theme switch's own "Auto" option — two controls with the same accessible name.
              aria-label={t('autoUpdateAriaLabel')}
              className={`flex items-center justify-center gap-1 border rounded-md px-2 py-1 text-[11px] transition-colors ${
                autoUpdateEnabled
                  ? (isAtLatest
                    ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-600 text-white'
                    : 'bg-amber-600/80 hover:bg-amber-600 border-amber-600 text-white')
                  : isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    : 'bg-[#222] hover:bg-[#333] border-white/10 text-slate-200'
              }`}
            >
              <RefreshCw className={`w-3 h-3 shrink-0 ${autoUpdateEnabled && isAtLatest ? 'animate-spin [animation-duration:3s]' : ''}`} />
              {t('autoUpdate')}
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
    <div ref={adjustmentsRef}>
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
    <div ref={fireHotspotRef}>
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
      <div ref={infoRef} className={`flex flex-col border rounded-xl shadow-2xl max-w-xl w-full max-h-[85vh] overflow-hidden ${
        themedClass(isLight, 'bg-white border-slate-300', 'bg-[#1a1a1a] border-white/10')
      }`}>
        <div className="shrink-0 flex items-center justify-between px-6 pt-6 pb-4">
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

        <div className={`ui-scrollbar overflow-y-auto flex-1 min-h-0 px-6 space-y-4 text-sm leading-relaxed ${themedClass(isLight, 'text-slate-700', 'text-slate-300')}`}>
          <section className={`rounded-lg border p-3 ${themedClass(isLight, 'border-slate-200 bg-slate-50', 'border-white/10 bg-black/20')}`}>
            <h4 className={`text-sm font-semibold mb-2 ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{t('infoGoalTitle')}</h4>
            <p className="text-xs">{t('infoModalParagraph1')}</p>
            <p className="text-xs mt-1.5">{t('infoModalParagraph2')}</p>
          </section>

          {/* The `infoFeature*` strings existed in both languages but were rendered nowhere, so
              this section was invisible: features with no keyboard shortcut (auto-update, the
              freshness cue) had no in-app explanation beyond their button tooltip. */}
          <section className={`rounded-lg border p-3 ${themedClass(isLight, 'border-slate-200 bg-slate-50', 'border-white/10 bg-black/20')}`}>
            <h4 className={`text-sm font-semibold mb-2 ${themedClass(isLight, 'text-slate-900', 'text-white')}`}>{t('infoFeaturesTitle')}</h4>
            <ul className="text-xs space-y-1 list-disc pl-4">
              <li>{t('infoFeatureAutoUpdate')}</li>
              <li>{t('infoFeatureFreshness')}</li>
              <li>{t('infoFeatureMemory')}</li>
              <li>{t('infoFeatureShare')}</li>
              <li>{t('infoFeatureGif')}</li>
              <li>{t('infoFeatureShortcuts')}</li>
            </ul>
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

          <p className="text-xs pb-6">
            <strong className={themedClass(isLight, 'text-slate-900', 'text-white')}>{t('aboutAuthor')}</strong>
          </p>
        </div>

        <div className={`shrink-0 px-6 pb-6 pt-3 border-t ${themedClass(isLight, 'border-slate-200', 'border-white/10')}`}>
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
              <GithubIcon className="w-4 h-4 shrink-0" />
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

          <div className="mt-3 text-center text-xs text-slate-500 font-mono">
            Version 1.5.0
          </div>
        </div>
      </div>
    </div>
  );
}


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
  onClose: () => void;
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

};

export function ExportModal(props: ExportModalProps) {
  const {
    availableExportKinds,
    currentTime,
    downloadProgress,
    exportFormat,
    exportModalRef,
    exportResolution,
    exportResolutionText,
    fireHotspotEnabled,
    hdEnhanceEnabled,
    isExporting,
    isOpen,
    isPreviewLoading,
    onClose,
    onConfirmImage,
    onExportFormatChange,
    onExportResolutionChange,
    onToggleImageKind,
    previewImages,
    selectedExportKinds,
    t,
    theme,
  } = props;
  const isLight = theme === 'light';
  if (!isOpen) return null;

  // Image-only since issue #78: GIF and WebM are produced from the animation panel, where the
  // sequence can be watched before it is downloaded.
  const isExportingCurrent = isExporting;
  const currentProgress = downloadProgress;
  const fileExtension = exportFormat === 'jpeg' ? 'jpg' : 'png';
  const safeZipSuffix = currentTime.replace('T', '_').replace(/:/g, '-');
  const isSingleFile = selectedExportKinds.length === 1;
  const canConfirm = selectedExportKinds.length > 0;

  return (
    <div className={`fixed inset-0 z-[510] flex items-center justify-center p-4 backdrop-blur-sm ${
      themedClass(isLight, 'bg-slate-900/35', 'bg-black/55')
    }`}>
      <div ref={exportModalRef} className={`flex flex-col border rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden ${
        themedClass(isLight, 'bg-white border-slate-300', 'bg-[#1a1a1a] border-white/10')
      }`}>
        <div className="shrink-0 flex items-center justify-between px-6 pt-6 pb-4">
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

        <div className="ui-scrollbar overflow-y-auto flex-1 min-h-0 px-6 pb-4">

<p className={`text-sm mb-4 ${themedClass(isLight, 'text-slate-700', 'text-slate-300')}`}>
          {t('downloadModalDescription')}
        </p>

        {fireHotspotEnabled && (
          <div className={`mb-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${
            themedClass(isLight, 'border-orange-300 bg-orange-50 text-orange-800', 'border-orange-400/30 bg-orange-500/10 text-orange-200')
          }`}>
            <span className="text-sm leading-none shrink-0" aria-hidden="true">🔥</span>
            <span>{t('downloadFireHotspotHint')}</span>
          </div>
        )}

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

          <div className="flex items-center justify-end gap-2">
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
              onClick={onConfirmImage}
              disabled={!canConfirm || isExportingCurrent}
              className={`px-3 py-2 text-sm rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                isLight
                  ? 'bg-slate-900 text-white hover:bg-slate-700'
                  : 'bg-white text-black hover:bg-slate-200'
              }`}
            >
              {isExportingCurrent
                ? `${t('generating')} ${currentProgress}%`
                : t('downloadSelection')}
            </button>
          </div>
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
      <div ref={helpRef} className={`flex flex-col border rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden ${
        themedClass(isLight, 'bg-white border-slate-300', 'bg-[#1a1a1a] border-white/10')
      }`}>
        <div className="shrink-0 flex items-center justify-between px-6 pt-6 pb-4">
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

        <div className="ui-scrollbar overflow-y-auto flex-1 min-h-0 px-6 pb-6 space-y-3 text-sm">
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
    <div className="pointer-events-none">
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

type ZoomControlProps = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  t: Translator;
  theme: UiTheme;
};

export function ZoomControl(props: ZoomControlProps) {
  const { onZoomIn, onZoomOut, t, theme } = props;
  const isLight = theme === 'light';
  const buttonClass = `flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 rounded-md border shadow-xl transition-colors backdrop-blur-md ${
    themedClass(isLight, 'bg-white/90 hover:bg-white border-slate-300 text-slate-700', 'bg-black/60 hover:bg-black/80 border-white/10 text-white')
  }`;

  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      <button onClick={onZoomIn} className={buttonClass} title={t('zoomIn')}>
        <Plus className="w-4 h-4" />
      </button>
      <button onClick={onZoomOut} className={buttonClass} title={t('zoomOut')}>
        <Minus className="w-4 h-4" />
      </button>
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
    <div className="relative ml-auto pointer-events-auto flex items-center gap-2 flex-wrap justify-end">
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

      {/* AdjustmentsPanel and FireHotspotPanel both render `absolute right-0 top-20 w-[calc(100vw-2rem)]`
          dropdowns, but neither has its own `position: relative` wrapper anymore — that wrapper used
          to be each button's own ~40px box, so only whichever of the two was last in this row had its
          `right-0` actually coincide with the row's true right edge; the other's ~full-viewport-width
          dropdown was anchored one button-width too far left, pushing its own left edge off-screen
          (this is what read as "part of the panel is hidden on mobile" — reordering once "fixed" it
          for whichever panel happened to move last, silently reintroducing it on the other). Both
          dropdowns now resolve against the shared `relative` row container above instead, so render
          order here no longer affects either one's anchoring. */}
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
    </div>
  );
}