/**
 * The sources a document already points at: links, footnotes and citations,
 * read out of its markup. The Sources panel lists them; it is the start of
 * what that panel will become (citations tied to claims, and where each
 * source itself came from).
 */

import type { DocFormat } from '@/lib/types';

export type ReferenceKind = 'link' | 'citation' | 'footnote';

export interface Reference {
  kind: ReferenceKind;
  /** The URL, citation key or footnote label — what makes two mentions the same source. */
  target: string;
  /** What the text calls it, where it says. */
  label: string;
  /** Where each mention starts, in document order. */
  offsets: number[];
}

const MD_LINK = /(!?)\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g;
const BARE_URL = /(?<![(<\]"'=])\bhttps?:\/\/[^\s<>()\]]+[^\s<>()\].,;:!?'"]/g;
const MD_FOOTNOTE = /^\[\^([^\]]+)\]:\s*(.+)$/gm;
const TEX_HREF = /\\href\{([^}]+)\}\{([^}]*)\}/g;
const TEX_URL = /\\url\{([^}]+)\}/g;
const TEX_CITE = /\\(?:cite|citep|citet|parencite|textcite|autocite)(?:\[[^\]]*\])*\{([^}]+)\}/g;
/** Code is not prose: a URL inside a fence is an example, not a source. */
const MD_FENCE = /^(```|~~~)[^\n]*\n[\s\S]*?^\1\s*$/gm;
const TEX_VERBATIM = /\\begin\{(verbatim|lstlisting)\}[\s\S]*?\\end\{\1\}/g;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function collectReferences(content: string, format: DocFormat): Reference[] {
  // Blank out code, keeping offsets, so matches inside it are ignored.
  const text = content.replace(format === 'latex' ? TEX_VERBATIM : MD_FENCE, block => ' '.repeat(block.length));
  const found = new Map<string, Reference>();
  const add = (kind: ReferenceKind, target: string, label: string, at: number) => {
    const key = `${kind}:${target}`;
    const seen = found.get(key);
    if (seen) {
      seen.offsets.push(at);
      if (!seen.label && label) seen.label = label;
    } else {
      found.set(key, { kind, target, label, offsets: [at] });
    }
  };

  if (format === 'latex') {
    for (const m of text.matchAll(TEX_HREF)) add('link', m[1].trim(), m[2].trim(), m.index ?? 0);
    for (const m of text.matchAll(TEX_URL)) add('link', m[1].trim(), '', m.index ?? 0);
    for (const m of text.matchAll(TEX_CITE)) {
      for (const key of m[1].split(',')) if (key.trim()) add('citation', key.trim(), '', m.index ?? 0);
    }
  } else {
    const linked = new Set<number>();
    for (const m of text.matchAll(MD_LINK)) {
      if (m[1]) continue; // an image is not a source
      add('link', m[3], m[2].trim(), m.index ?? 0);
      linked.add((m.index ?? 0) + m[0].indexOf(m[3]));
    }
    for (const m of text.matchAll(BARE_URL)) if (!linked.has(m.index ?? 0)) add('link', m[0], '', m.index ?? 0);
    for (const m of text.matchAll(MD_FOOTNOTE)) add('footnote', m[1], m[2].trim().slice(0, 140), m.index ?? 0);
  }
  return [...found.values()].sort((a, b) => a.offsets[0] - b.offsets[0]);
}
