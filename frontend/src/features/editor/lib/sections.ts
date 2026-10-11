/**
 * Reading and rewriting whole sections of the document.
 *
 * The outline rail and the document have to agree about where a section
 * starts and stops — placing generated prose, replacing it, and deleting it
 * all depend on the same answer. Working that out at each call site is how
 * "insert under the heading" and "delete the heading" ended up meaning two
 * different ranges, so the boundaries are defined once, here.
 */

import type { DocFormat } from '@/lib/types';
import { buildOutline, headingLabel, rawHeadings, type OutlineNode, type RawHeading } from './outline';
import { headingMarkup, MAX_PLAN_LEVEL, stripLeadingHeading } from './plan';
import { insertBlock, type EditResult } from './textOps';

/**
 * Locate a heading by a source offset anywhere on its line.
 *
 * Offsets, not titles: two sections can legitimately share a name, and a
 * title lookup would silently reshape the first one instead of the row the
 * writer actually clicked.
 */
function indexAtOffset(headings: RawHeading[], offset: number): number {
  return headings.findIndex(h => offset >= h.lineStart && offset <= h.lineEnd);
}

/** Where a heading's own subtree stops, by raw depth. */
function subtreeEnd(headings: RawHeading[], index: number, content: string): number {
  const level = headings[index].level;
  for (let i = index + 1; i < headings.length; i += 1) {
    if (headings[i].level <= level) return headings[i].lineStart;
  }
  return content.length;
}

export interface SectionSpan {
  /** The heading itself. */
  node: OutlineNode;
  /** Offset of the newline that ends the heading line. */
  headingEnd: number;
  /**
   * Where this section's *own* prose stops — at the next heading of any
   * level. A parent's introduction lives above its children, not after them.
   */
  bodyEnd: number;
  /**
   * Where the section and everything nested under it stops — the next heading
   * at the same or shallower depth. This is what "delete the section" means.
   */
  end: number;
}

/**
 * Locate a section by its heading text. Case- and space-insensitive.
 *
 * With `near`, the match closest to that offset wins: two sections may share
 * a name, and a job that set out to write the second must not land in the
 * first. Offsets alone are not enough — the document moves while a request is
 * out — so the title finds the candidates and the offset picks among them.
 */
export function findSection(
  content: string,
  format: DocFormat,
  title: string,
  near?: number,
): SectionSpan | null {
  const nodes = buildOutline(content, format);
  const wanted = title.trim().toLowerCase();
  const matches = nodes.filter(candidate => candidate.label.trim().toLowerCase() === wanted);
  const node = near === undefined
    ? matches[0]
    : matches.sort((a, b) => Math.abs(a.offset - near) - Math.abs(b.offset - near))[0];
  if (!node) return null;

  const newline = content.indexOf('\n', node.offset);
  const headingEnd = newline === -1 ? content.length : newline;
  const nextAny = nodes.find(candidate => candidate.offset > node.offset);
  const nextPeer = nodes.find(
    candidate => candidate.offset > node.offset && candidate.level <= node.level,
  );

  return {
    node,
    headingEnd,
    bodyEnd: nextAny ? nextAny.offset : content.length,
    end: nextPeer ? nextPeer.offset : content.length,
  };
}

/**
 * File a generated section under its own heading.
 *
 * Sections are written in whatever order they are clicked, so the heading may
 * already be on the page — drafted from the outline — or not exist yet.
 * `replace` rewrites what is under the heading instead of stacking a second
 * copy beneath it.
 */
export function placeSection(
  content: string,
  format: DocFormat,
  title: string,
  text: string,
  replace: boolean,
  near?: number,
): EditResult {
  const span = findSection(content, format, title, near);

  // Nothing to file it under: the section keeps its own heading and lands at
  // the end of the document.
  if (!span) return insertBlock(content, text.trim(), content.length, '\n\n');

  // The heading is already there, so the copy the model wrote is a duplicate.
  // What is left is fitted under the heading as the markup actually spells
  // it, so the section stays one atomic unit of the outline.
  const shape = headingShape(content, format, span.node.offset);
  const body = fitUnderHeading(stripLeadingHeading(text, title, format).trim(), format, shape.level, shape.hasChildren);
  if (!replace) return insertBlock(content, body, span.bodyEnd, '\n\n');

  const cleared = content.slice(0, span.headingEnd) + '\n' + content.slice(span.bodyEnd);
  return insertBlock(cleared, body, span.headingEnd + 1, '\n\n');
}

/** A heading's depth as its markup spells it, and whether sub-sections sit under it. */
export function headingShape(content: string, format: DocFormat, offset: number): { level: number; hasChildren: boolean } {
  const headings = rawHeadings(content, format);
  const i = indexAtOffset(headings, offset);
  if (i < 0) return { level: 1, hasChildren: false };
  const next = headings[i + 1];
  return { level: headings[i].level, hasChildren: !!next && next.level > headings[i].level };
}

/**
 * Make generated text fit under a heading at `level` without changing the
 * outline around it.
 *
 * A heading in the text at `level` or above would split this section or close
 * its parent, so it is demoted to `level + 1` (or set as bold where the format
 * has no deeper level). Where the heading already has sub-sections, the text
 * is its introduction only and stops at its first heading of any kind — the
 * children are written in their own passes, and must not appear twice.
 *
 * The AI service applies the same rules; this is the editor refusing to
 * depend on that.
 */
export function fitUnderHeading(text: string, format: DocFormat, level: number, hasChildren: boolean): string {
  const heads = rawHeadings(text, format);
  if (!heads.length) return text;
  const lines = text.split('\n');
  if (hasChildren) return lines.slice(0, heads[0].line).join('\n').trimEnd();
  const maxLevel = format === 'latex' ? 5 : MAX_PLAN_LEVEL;
  for (const head of heads) {
    if (head.level > level) continue;
    const depth = level + 1;
    lines[head.line] = depth > maxLevel
      ? (format === 'latex' ? `\\textbf{${head.title}}` : `**${head.title}**`)
      : headingMarkup(head.title, depth, format);
  }
  return lines.join('\n');
}

/**
 * Remove a section, its prose, and everything nested under it.
 *
 * Returns null when the heading isn't in the document, so callers can tell
 * "nothing to remove" from "removed nothing".
 */
export function dropSection(
  content: string,
  format: DocFormat,
  offset: number,
): EditResult | null {
  // By the heading's offset, like every other row operation: by title, the
  // delete on the second of two "Overview" rows removed the first one.
  const node = buildOutline(content, format).find(candidate => candidate.offset === offset);
  const span = node ? findSection(content, format, node.label, node.offset) : null;
  if (!span) return null;

  // Closing the gap leaves the blank lines from both sides stacked up, so the
  // seam is tidied — and only the seam. This used to collapse every run of
  // blank lines in the whole document, reaching into code blocks and verbatim
  // that had nothing to do with the section being removed.
  const before = content.slice(0, span.node.offset).replace(/\n+$/, '');
  const after = content.slice(span.end).replace(/^\n+/, '');
  const seam = before && after ? '\n\n' : '';
  const next = (before + seam + after).trimEnd();
  const caret = Math.min(before.length + seam.length, next.length);
  return { content: next, start: caret, end: caret };
}

export function renameSection(
  content: string, format: DocFormat, offset: number, next: string,
): EditResult | null {
  const clean = next.trim();
  if (!clean) return null;
  const headings = rawHeadings(content, format);
  const i = indexAtOffset(headings, offset);
  if (i < 0) return null;

  const { titleStart, titleEnd } = headings[i];
  const updated = content.slice(0, titleStart) + clean + content.slice(titleEnd);
  const caret = titleStart + clean.length;
  return { content: updated, start: caret, end: caret };
}

/**
 * Change a section's depth, carrying its children with it.
 *
 * The whole subtree shifts by the same step so relative structure survives —
 * indenting a parent must not flatten it against its own children. Rewritten
 * back-to-front so earlier offsets stay valid as the text changes length.
 */
export function shiftSection(
  content: string, format: DocFormat, offset: number, delta: 1 | -1,
): EditResult | null {
  const headings = rawHeadings(content, format);
  const i = indexAtOffset(headings, offset);
  if (i < 0) return null;

  const target = headings[i].level + delta;
  if (target < 1 || target > MAX_PLAN_LEVEL) return null;
  // You can only nest under a sibling above you. Already being deeper than the
  // previous heading means you are its first child, and going further would
  // skip a level — a hole the outline cannot render.
  if (delta === 1 && (i === 0 || headings[i].level > headings[i - 1].level)) return null;

  const end = subtreeEnd(headings, i, content);
  const affected = headings.filter(
    (h, j) => j === i || (h.lineStart > headings[i].lineStart && h.lineStart < end),
  );
  if (affected.some(h => h.level + delta > MAX_PLAN_LEVEL)) return null;

  let updated = content;
  for (const heading of [...affected].reverse()) {
    const line = headingMarkup(heading.title, heading.level + delta, format);
    updated = updated.slice(0, heading.lineStart) + line + updated.slice(heading.lineEnd);
  }
  const caret = headings[i].lineStart;
  return { content: updated, start: caret, end: caret };
}

/** Move a section, and everything under it, above or below another section. */
export function moveSectionTo(
  content: string, format: DocFormat, offset: number, targetOffset: number, edge: 'top' | 'bottom',
): EditResult | null {
  const headings = rawHeadings(content, format);
  const from = indexAtOffset(headings, offset);
  const to = indexAtOffset(headings, targetOffset);
  if (from < 0 || to < 0 || from === to) return null;

  const start = headings[from].lineStart;
  const end = subtreeEnd(headings, from, content);
  // Dropping inside your own subtree has nowhere to land.
  if (headings[to].lineStart > start && headings[to].lineStart < end) return null;

  const block = content.slice(start, end).replace(/\s+$/, '');
  const without = content.slice(0, start) + content.slice(end);

  // Removing the block moved everything after it, so the anchor is re-found by
  // where it landed rather than by the offset the caller passed in.
  const shifted = headings[to].lineStart > start ? headings[to].lineStart - (end - start) : headings[to].lineStart;
  const after = rawHeadings(without, format);
  const anchor = indexAtOffset(after, shifted);
  if (anchor < 0) return null;
  const at = edge === 'top' ? after[anchor].lineStart : subtreeEnd(after, anchor, without);

  const result = insertBlock(without, block, at, '\n\n');
  return { ...result, content: result.content.replace(/\n{3,}/g, '\n\n') };
}

/**
 * Add a heading below a section — or at the end of the document when there is
 * nothing to anchor to. Returns where the new title sits so the caller can put
 * the caret in it.
 */
export function addSectionAfter(
  content: string, format: DocFormat, afterOffset: number | null, title = 'New section',
): EditResult & { headingOffset: number } {
  const headings = rawHeadings(content, format);
  const i = afterOffset === null ? -1 : indexAtOffset(headings, afterOffset);
  const level = i >= 0 ? headings[i].level : 1;
  const at = i >= 0 ? subtreeEnd(headings, i, content) : content.length;

  const line = headingMarkup(title, level, format);
  const result = insertBlock(content, line, at, '\n\n');
  // Where the new heading landed, so the caller can open it for renaming.
  return { ...result, headingOffset: result.start - line.length };
}


/**
 * Which existing section each row of a proposed outline is.
 *
 * A row is the section with its exact title, if there is one nobody else has
 * claimed; failing that, the section it says it was renamed or split `from`.
 * Titles are matched first, across the whole plan, so a rename cannot take a
 * heading that a later row keeps under its own name. What no row claims is
 * what the proposal removes.
 */
export function matchPlan(
  labels: string[],
  plan: { title: string; from?: string }[],
): { sources: number[]; dropped: number[] } {
  const key = (text: string) => headingLabel(text).trim().toLowerCase();
  const keys = labels.map(key);
  const used = new Set<number>();
  const claim = (wanted: string) => {
    const i = wanted ? keys.findIndex((k, j) => !used.has(j) && k === wanted) : -1;
    if (i >= 0) used.add(i);
    return i;
  };
  const sources = plan.map(item => claim(key(item.title)));
  plan.forEach((item, at) => {
    if (sources[at] < 0 && item.from) sources[at] = claim(key(item.from));
  });
  const dropped = keys.map((_, j) => j).filter(j => !used.has(j));
  return { sources, dropped };
}

/**
 * Rewrite the document so its headings match a proposed outline.
 *
 * A section the proposal keeps — by title, or by the title it was renamed
 * from — keeps its own prose ("own" meaning up to the next heading of any
 * level, since every child is a row of its own). A new section arrives
 * empty. A section the proposal leaves out is removed with its prose: the
 * proposal shows which before it is applied, and an applied outline is one
 * undo away.
 *
 * Moving dropped sections to the end instead, as this used to, left every
 * renamed section on the page twice — once empty under its new name, once
 * full under the old one at the bottom.
 */
export function applyOutline(
  content: string,
  format: DocFormat,
  plan: { title: string; level: number; from?: string }[],
): { result: EditResult; removed: string[] } {
  const headings = rawHeadings(content, format);

  // Anything above the first heading belongs to the document, not a section.
  const preamble = (headings.length ? content.slice(0, headings[0].lineStart) : content).trim();

  const ownBodyEnd = (i: number) =>
    (i + 1 < headings.length ? headings[i + 1].lineStart : content.length);
  const bodyOf = (i: number) => content.slice(headings[i].lineEnd, ownBodyEnd(i)).trim();

  const rows = plan.filter(item => item.title.trim());
  const { sources, dropped } = matchPlan(headings.map(h => h.title), rows);
  const blocks = rows.map((item, at) => {
    const i = sources[at];
    const body = i >= 0 ? bodyOf(i) : '';
    const heading = headingMarkup(item.title.trim(), item.level, format);
    return body ? `${heading}\n\n${body}` : heading;
  });
  const removed = dropped.map(j => headingLabel(headings[j].title)).filter(Boolean);

  const next = [preamble, ...blocks].filter(Boolean).join('\n\n') + '\n';
  const caret = Math.min(preamble.length, next.length);
  return { result: { content: next, start: caret, end: caret }, removed };
}
