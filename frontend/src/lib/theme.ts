/**
 * Light/dark theme state.
 *
 * The resolved theme is written to `data-theme` on <html> as an explicit
 * "light" or "dark" — never left implicit for CSS to work out from
 * `prefers-color-scheme`. One place resolves the system preference, so the
 * stylesheet only answers to the attribute and the two can't disagree.
 *
 * A matching snippet in index.html runs this before first paint. Doing it in
 * React instead means a frame of the wrong theme on every load.
 */

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

const THEME_KEY = 'topical_theme';

function systemTheme(): Theme {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** What the user chose, or 'system' if they never have. */
function storedPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === 'light' || raw === 'dark' ? raw : 'system';
  } catch {
    // Private mode: fall back to following the OS.
    return 'system';
  }
}

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** A design token's computed value, as declared in tokens.css. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function paint(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

/**
 * Switch the theme, animated from the point the user clicked.
 *
 * The circular wipe needs the old and new paint to exist at once, which is
 * exactly what a view transition gives us. Without that API — or when the
 * reader has asked for less motion — the change still happens, it just
 * happens plainly.
 */
export async function setTheme(theme: Theme, origin?: { x: number; y: number }) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not being able to remember it is no reason not to apply it.
  }
  window.dispatchEvent(new Event(PREFERENCE_EVENT));

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const startViewTransition = (
    document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
  ).startViewTransition?.bind(document);

  if (reduced) {
    paint(theme);
    return;
  }

  if (!startViewTransition || !origin) {
    // No wipe available: cross-fade the colour properties instead.
    const root = document.documentElement;
    root.classList.add('theme-switching');
    paint(theme);
    window.setTimeout(() => root.classList.remove('theme-switching'), 300);
    return;
  }

  const transition = startViewTransition(() => paint(theme));
  await transition.ready;

  // Reach the furthest corner, or the circle stops short of the page edge.
  const { x, y } = origin;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  document.documentElement.animate(
    {
      clipPath: [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${radius}px at ${x}px ${y}px)`,
      ],
    },
    {
      // Read from the tokens, so the wipe and the CSS motion can't drift apart.
      duration: parseFloat(token('--dur-theme-wipe')) || 480,
      easing: token('--ease-out') || 'ease-out',
      pseudoElement: '::view-transition-new(root)',
    },
  );
}

/**
 * Follow the OS while the reader has expressed no preference of their own.
 * Returns an unsubscribe function.
 */
function watchSystemTheme(onChange: (theme: Theme) => void): () => void {
  const query = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!query) return () => {};
  const handler = () => {
    if (storedPreference() === 'system') onChange(systemTheme());
  };
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}

/**
 * The theme as it is currently painted, kept live.
 *
 * `data-theme` on <html> is the source of truth rather than a React context: a
 * boot script in index.html sets it before React exists, and `setTheme` writes
 * it directly so a view transition has two paints to animate between.
 * Observing the attribute lets any component read the theme with no provider
 * to forget to mount — which is how the toast surface ended up querying a
 * `next-themes` provider that was never installed, and always hearing
 * "system" no matter what the reader had chosen.
 */
export function useTheme(): Theme {
  const [theme, setLocal] = useState<Theme>(() =>
    (typeof document === 'undefined' ? 'light' : currentTheme()));

  useEffect(() => {
    // The attribute may have moved between first render and this effect.
    setLocal(currentTheme());
    const observer = new MutationObserver(() => setLocal(currentTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    // Until the reader presses the switch, the OS decides.
    const unwatch = watchSystemTheme(paint);
    return () => {
      observer.disconnect();
      unwatch();
    };
  }, []);

  return theme;
}

/**
 * Choose light, dark, or "follow the system". `setTheme` remembers an
 * explicit choice; 'system' forgets it, so the OS decides again — and keeps
 * deciding when it changes mid-session (see `watchSystemTheme`).
 */
export function setThemePreference(preference: ThemePreference, origin?: { x: number; y: number }) {
  if (preference !== 'system') return setTheme(preference, origin);
  try {
    localStorage.removeItem(THEME_KEY);
  } catch {
    // Nothing stored to forget.
  }
  paint(systemTheme());
  window.dispatchEvent(new Event(PREFERENCE_EVENT));
}

const PREFERENCE_EVENT = 'topical:theme-preference';

/** What the reader chose — light, dark or system — kept live. */
export function useThemePreference(): ThemePreference {
  const theme = useTheme();
  const [preference, setPreference] = useState<ThemePreference>(() =>
    (typeof window === 'undefined' ? 'system' : storedPreference()));
  useEffect(() => {
    setPreference(storedPreference());
    const sync = () => setPreference(storedPreference());
    window.addEventListener(PREFERENCE_EVENT, sync);
    return () => window.removeEventListener(PREFERENCE_EVENT, sync);
  }, [theme]);
  return preference;
}

/* ── Glass ──
   Two strengths of the material, as Apple offers them: clear, where the
   content behind shows through, and tinted, which is more opaque and easier
   to read over. Written to `data-glass` on <html>; the boot script in
   index.html applies it before first paint, like the theme. */

export type GlassMode = 'clear' | 'tinted';
const GLASS_KEY = 'topical_glass';
const GLASS_EVENT = 'topical:glass';

function storedGlass(): GlassMode {
  try {
    return localStorage.getItem(GLASS_KEY) === 'tinted' ? 'tinted' : 'clear';
  } catch {
    return 'clear';
  }
}

export function setGlass(mode: GlassMode) {
  try {
    localStorage.setItem(GLASS_KEY, mode);
  } catch {
    // Still apply it for this visit.
  }
  document.documentElement.dataset.glass = mode;
  window.dispatchEvent(new Event(GLASS_EVENT));
}

export function useGlass(): GlassMode {
  const [mode, setMode] = useState<GlassMode>(() => (typeof window === 'undefined' ? 'clear' : storedGlass()));
  useEffect(() => {
    const sync = () => setMode(storedGlass());
    window.addEventListener(GLASS_EVENT, sync);
    return () => window.removeEventListener(GLASS_EVENT, sync);
  }, []);
  return mode;
}
