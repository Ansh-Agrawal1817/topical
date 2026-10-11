/**
 * Where the writer is reading, carried across a change of view.
 *
 * Read (the typeset document) and Live/Source (the editor) are different
 * surfaces with different heights for the same text, so a scroll offset
 * means nothing on the other side — switching used to land somewhere else
 * entirely. A position is kept as *which section* (its heading's title, and
 * which occurrence of that title) and *how far through it*, which both
 * surfaces can answer: the editor from source offsets, the read view from
 * its rendered headings.
 */

import type { OutlineNode } from './outline';

export interface ReadingAnchor {
  /** The section's title, normalised; null for text above the first heading. */
  label: string | null;
  /** Which of the sections with that title, in document order. */
  occurrence: number;
  /** How far through the section, 0–1. */
  fraction: number;
}

/**
 * Titles as both surfaces show them: no numbering ("1.2"), no case, single
 * spaces, and no anchor mark — the read view's headings end in a "#" link.
 */
const norm = (text: string) =>
  text.replace(/\s+/g, ' ').trim().replace(/\s*[#¶§]$/, '').replace(/^(\d+(\.\d+)*\.?)\s+/, '').toLowerCase();

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

// ── The editor side: source offsets ─────────────────────────────────────

export function anchorFromOffset(nodes: OutlineNode[], length: number, pos: number): ReadingAnchor {
  let index = -1;
  for (let i = 0; i < nodes.length && nodes[i].offset <= pos; i++) index = i;
  const start = index >= 0 ? nodes[index].offset : 0;
  const end = index + 1 < nodes.length ? nodes[index + 1].offset : length;
  if (index < 0) return { label: null, occurrence: 0, fraction: clamp01(pos / Math.max(1, end)) };
  const label = norm(nodes[index].label);
  const occurrence = nodes.slice(0, index).filter(node => norm(node.label) === label).length;
  return { label, occurrence, fraction: clamp01((pos - start) / Math.max(1, end - start)) };
}

export function offsetFromAnchor(nodes: OutlineNode[], length: number, anchor: ReadingAnchor): number {
  let index = -1;
  if (anchor.label !== null) {
    let seen = 0;
    index = nodes.findIndex(node => norm(node.label) === anchor.label && seen++ === anchor.occurrence);
    if (index < 0) return 0;
  }
  const start = index >= 0 ? nodes[index].offset : 0;
  const end = index + 1 < nodes.length ? nodes[index + 1].offset : length;
  return Math.round(start + anchor.fraction * (end - start));
}

// ── The read side: rendered headings ────────────────────────────────────

const headingsIn = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')];
/** An element's top within the scroller's content. */
const topIn = (scroller: HTMLElement, el: HTMLElement) =>
  el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;

export function anchorFromPreview(scroller: HTMLElement): ReadingAnchor {
  const headings = headingsIn(scroller);
  const y = scroller.scrollTop + 4;
  let index = -1;
  for (let i = 0; i < headings.length && topIn(scroller, headings[i]) <= y; i++) index = i;
  const start = index >= 0 ? topIn(scroller, headings[index]) : 0;
  const end = index + 1 < headings.length ? topIn(scroller, headings[index + 1]) : scroller.scrollHeight;
  if (index < 0) return { label: null, occurrence: 0, fraction: clamp01(y / Math.max(1, end)) };
  const label = norm(headings[index].textContent ?? '');
  const occurrence = headings.slice(0, index).filter(h => norm(h.textContent ?? '') === label).length;
  return { label, occurrence, fraction: clamp01((y - start) / Math.max(1, end - start)) };
}

/** Scroll the read view to the anchor. False when its headings have not rendered yet. */
export function scrollPreviewTo(scroller: HTMLElement, anchor: ReadingAnchor): boolean {
  const headings = headingsIn(scroller);
  if (anchor.label !== null && !headings.length) return false;
  let index = -1;
  if (anchor.label !== null) {
    let seen = 0;
    index = headings.findIndex(h => norm(h.textContent ?? '') === anchor.label && seen++ === anchor.occurrence);
    if (index < 0) return true; // a heading the read view does not have: leave it at the top
  }
  const start = index >= 0 ? topIn(scroller, headings[index]) : 0;
  const end = index + 1 < headings.length ? topIn(scroller, headings[index + 1]) : scroller.scrollHeight;
  scroller.scrollTop = Math.max(0, start + anchor.fraction * (end - start) - 4);
  return true;
}
