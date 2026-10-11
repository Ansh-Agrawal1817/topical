/** Editor chrome preferences, remembered between sessions. */

/** Live: the document as it reads, markup shown only at the caret. Source: the plain text. */
export type SurfaceMode = 'live' | 'source';

export interface ViewOptions {
  outline: boolean;
  /** The AI panel, beside the document on the right. */
  ai: boolean;
  /** Width of the outline rail, in px — the writer drags it. */
  outlineWidth: number;
  surface: SurfaceMode;
  /** Line numbers, in the source view. */
  lineNumbers: boolean;
  focusMode: boolean;
  fontSize: number;
}

export const DEFAULT_OPTIONS: ViewOptions = {
  outline: true,
  ai: false,
  outlineWidth: 300,
  surface: 'live',
  lineNumbers: true,
  focusMode: false,
  fontSize: 17,
};

const STORAGE_KEY = 'topical_editor_view';

export function loadOptions(): ViewOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Merged over the defaults so a new option doesn't come back undefined.
    const stored = raw ? { ...DEFAULT_OPTIONS, ...JSON.parse(raw) } : DEFAULT_OPTIONS;
    return { ...stored, surface: stored.surface === 'source' ? 'source' : 'live' };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

export function saveOptions(options: ViewOptions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    // Private mode and full quotas are not worth failing an edit over.
  }
}

/** The rail has to hold an editable tree without becoming the whole screen. */
export const MIN_OUTLINE_WIDTH = 210;
export const MAX_OUTLINE_WIDTH = 620;
