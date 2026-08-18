import { Component, type ErrorInfo, type ReactNode } from 'react';

import { STORAGE_KEYS } from './dualMapViewerShared';

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { error: Error | null };

/**
 * Last line of defence for the whole app. Without it, any exception thrown during render leaves
 * an empty `#root` — a blank page with no message and no way out. That was reachable from
 * ordinary bad input (a truncated share link, a corrupted `mtg_current_time`), and the
 * localStorage variant was unrecoverable in practice: every reload replayed the same bad value
 * and nothing in the UI could clear it.
 *
 * The reset button is the important part, not the message. Individual bad values are now
 * validated at their entry points, so this exists for the failures nobody predicted — hence
 * clearing *all* known keys rather than guessing which one is at fault, and dropping `?view=`
 * too since a share payload can carry the same poison across a reload.
 *
 * Deliberately a plain component with its own two-language strings rather than a consumer of
 * i18n/theme state: it has to keep working when the tree that owns that state is exactly what
 * failed. Language is read straight from localStorage for the same reason.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MTG-RGB-HD crashed during render:', error, info.componentStack);
  }

  private handleReset = () => {
    try {
      Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    } catch {
      // Storage can be unavailable (private mode, blocked cookies) — reloading clean is still
      // worth attempting, so don't let this stop the redirect below.
    }
    window.location.replace(window.location.origin + window.location.pathname);
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    let isFrench = true;
    try {
      isFrench = JSON.parse(localStorage.getItem(STORAGE_KEYS.language) ?? '"fr"') !== 'en';
    } catch {
      isFrench = true;
    }

    const text = isFrench
      ? {
        title: 'Une erreur est survenue',
        body: "L'application n'a pas pu s'afficher. Cela vient souvent d'un lien de partage invalide ou de préférences enregistrées corrompues.",
        reset: 'Réinitialiser les préférences et recharger',
        detail: 'Détail technique',
      }
      : {
        title: 'Something went wrong',
        body: 'The app failed to render. This is usually caused by an invalid share link or corrupted saved preferences.',
        reset: 'Reset preferences and reload',
        detail: 'Technical detail',
      };

    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0a0a0a] text-slate-200 p-6">
        <div className="max-w-lg w-full border border-white/15 rounded-xl bg-black/60 p-6 shadow-2xl">
          <h1 className="text-lg font-semibold text-white">{text.title}</h1>
          <p className="mt-2 text-sm text-slate-300">{text.body}</p>
          <button
            onClick={this.handleReset}
            className="mt-4 w-full rounded-md border border-white/10 bg-[#333] hover:bg-[#444] px-3 py-2 text-sm text-white transition-colors"
          >
            {text.reset}
          </button>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-slate-400">{text.detail}</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-slate-400">
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
