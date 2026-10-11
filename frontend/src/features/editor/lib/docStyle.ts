import { useCallback, useEffect, useState } from 'react';
import type { PdfAccent, PdfFace, PdfOptions, PdfTheme } from './pdfExport';

/**
 * How one document looks: its page, its accent colour, its typeface.
 *
 * Applied by re-scoping the app's own design tokens on the writing surface
 * and the read view (`styles/doc-style.css`), so everything inside — the live
 * editor, rendered maths, tables, code — follows without each part knowing a
 * theme exists. "Paper" is the app's own look and follows its light/dark
 * setting; the others are fixed palettes. New documents open in Sepia.
 *
 * Remembered per document in this browser, and carried into Export PDF as
 * its starting options.
 */

export type DocTheme = 'paper' | 'sepia' | 'slate' | 'night' | 'plain';
export type DocAccent = 'terracotta' | 'indigo' | 'forest' | 'plum' | 'graphite';
export type DocFont = 'serif' | 'classic' | 'sans' | 'mono';

export interface DocStyle {
  theme: DocTheme;
  accent: DocAccent;
  font: DocFont;
}

export const DEFAULT_DOC_STYLE: DocStyle = { theme: 'sepia', accent: 'terracotta', font: 'serif' };

export const DOC_THEMES: { value: DocTheme; label: string; swatch: string; ink: string }[] = [
  { value: 'paper', label: 'Paper', swatch: 'var(--bg)', ink: 'var(--ink)' },
  { value: 'sepia', label: 'Sepia', swatch: '#f4ecd8', ink: '#3b2f20' },
  { value: 'slate', label: 'Slate', swatch: '#eef1f5', ink: '#1d2733' },
  { value: 'night', label: 'Night', swatch: '#14161b', ink: '#e8e6e1' },
  { value: 'plain', label: 'Plain', swatch: '#ffffff', ink: '#111111' },
];

export const DOC_ACCENTS: { value: DocAccent; label: string; swatch: string }[] = [
  { value: 'terracotta', label: 'Terracotta', swatch: '#c25e38' },
  { value: 'indigo', label: 'Indigo', swatch: '#4a5b8c' },
  { value: 'forest', label: 'Forest', swatch: '#3d6b4a' },
  { value: 'plum', label: 'Plum', swatch: '#7a4a7e' },
  { value: 'graphite', label: 'Graphite', swatch: '#4a4a4a' },
];

export const DOC_FONTS: { value: DocFont; label: string; family: string }[] = [
  { value: 'serif', label: 'Newsreader', family: 'var(--font-serif)' },
  { value: 'classic', label: 'Classic', family: "'Iowan Old Style', Charter, Georgia, serif" },
  { value: 'sans', label: 'Sans', family: 'var(--font-sans)' },
  { value: 'mono', label: 'Mono', family: 'var(--font-mono)' },
];

const KEY = (docKey: string) => `topical_doc_style:${docKey}`;

function load(docKey: string): DocStyle {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(docKey)) || 'null');
    return raw ? { ...DEFAULT_DOC_STYLE, ...raw } : DEFAULT_DOC_STYLE;
  } catch {
    return DEFAULT_DOC_STYLE;
  }
}

export function useDocStyle(docKey: string): [DocStyle, (patch: Partial<DocStyle>) => void] {
  const [style, setStyle] = useState<DocStyle>(() => load(docKey));
  useEffect(() => { setStyle(load(docKey)); }, [docKey]);
  const update = useCallback((patch: Partial<DocStyle>) => {
    setStyle(current => {
      const next = { ...current, ...patch };
      try { localStorage.setItem(KEY(docKey), JSON.stringify(next)); } catch { /* this visit only */ }
      return next;
    });
  }, [docKey]);
  return [style, update];
}

/** The data attributes the surface carries; `appDark` decides Paper's accent shades. */
export function docStyleAttrs(style: DocStyle, appDark: boolean) {
  const dark = style.theme === 'night' || (style.theme === 'paper' && appDark);
  return {
    'data-doc-theme': style.theme,
    'data-doc-accent': style.accent,
    'data-doc-font': style.font,
    'data-doc-dark': dark ? 'true' : 'false',
  } as const;
}

/** Export PDF starts from the document's own look. */
export function pdfFromDocStyle(style: DocStyle): Partial<PdfOptions> {
  const theme: PdfTheme = style.theme === 'night' ? 'ink' : style.theme === 'plain' ? 'plain' : 'paper';
  const accent: PdfAccent = style.accent === 'plum' || style.accent === 'graphite' ? 'none' : style.accent;
  const face: PdfFace = style.font === 'sans' ? 'sans' : 'serif';
  return { theme, accent, face };
}
