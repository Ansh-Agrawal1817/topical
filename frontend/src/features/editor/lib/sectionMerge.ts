/**
 * A document as a list of sections, for comparing two versions of it and
 * merging one into the other a section at a time.
 *
 * A section here is a heading and its own text, up to the next heading of
 * any level — the same unit the outline rail and the writer work in. It is
 * named by where it sits (the titles above it, then its own), so "Results >
 * Error analysis" in one version is matched with the same section in the
 * other however far it moved in the text.
 */

import type { DocFormat } from '@/lib/types';
import { rawHeadings } from './outline';
import { countWords } from './stats';

export interface SectionBlock {
  key: string;
  title: string;
  level: number;
  /** The heading line and its own text, as written. */
  text: string;
  words: number;
}

const norm = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase();

/** The text before the first heading, then every section in order. */
export function sectionBlocks(content: string, format: DocFormat): { preamble: string; blocks: SectionBlock[] } {
  const heads = rawHeadings(content, format);
  const preamble = (heads.length ? content.slice(0, heads[0].lineStart) : content).trim();
  const trail: { level: number; title: string }[] = [];
  const seen = new Map<string, number>();
  const blocks = heads.map((head, i) => {
    while (trail.length && trail[trail.length - 1].level >= head.level) trail.pop();
    trail.push({ level: head.level, title: norm(head.title) });
    const path = trail.map(t => t.title).join(' > ');
    const nth = seen.get(path) ?? 0;
    seen.set(path, nth + 1);
    const text = content.slice(head.lineStart, i + 1 < heads.length ? heads[i + 1].lineStart : content.length).trim();
    return { key: `${path}#${nth}`, title: head.title.trim(), level: head.level, text, words: countWords(text, format) };
  });
  return { preamble, blocks };
}

export type SectionChangeKind = 'added' | 'removed' | 'changed';

export interface SectionChange {
  key: string;
  title: string;
  kind: SectionChangeKind;
  /** Words gained (or lost, negative). */
  delta: number;
}

/** Which sections differ between two versions, in the order of the newer one (removed ones where they were). */
export function sectionChanges(before: string, after: string, format: DocFormat): SectionChange[] {
  const a = sectionBlocks(before, format);
  const b = sectionBlocks(after, format);
  const old = new Map(a.blocks.map(block => [block.key, block]));
  const now = new Map(b.blocks.map(block => [block.key, block]));
  const out: SectionChange[] = [];
  if (a.preamble !== b.preamble) {
    out.push({ key: '', title: 'Before the first heading', kind: 'changed', delta: countWords(b.preamble, format) - countWords(a.preamble, format) });
  }
  for (const row of mergeOrder(a.blocks, b.blocks)) {
    const was = old.get(row.key);
    const is = now.get(row.key);
    if (was && is) {
      if (was.text !== is.text) out.push({ key: row.key, title: is.title, kind: 'changed', delta: is.words - was.words });
    } else if (is) {
      out.push({ key: row.key, title: is.title, kind: 'added', delta: is.words });
    } else if (was) {
      out.push({ key: row.key, title: was.title, kind: 'removed', delta: -was.words });
    }
  }
  return out;
}

/** Every section of either version once, in the newer version's order, with removed ones kept where they stood. */
function mergeOrder(first: SectionBlock[], second: SectionBlock[]): SectionBlock[] {
  const inSecond = new Set(second.map(block => block.key));
  const out: SectionBlock[] = [];
  const placed = new Set<string>();
  let i = 0;
  for (const block of second) {
    // Sections only the first version has, up to where this one stood there, go in first.
    const at = first.findIndex(b => b.key === block.key);
    if (at >= 0) {
      for (; i < at; i += 1) {
        if (!inSecond.has(first[i].key) && !placed.has(first[i].key)) { out.push(first[i]); placed.add(first[i].key); }
      }
      i = Math.max(i, at + 1);
    }
    out.push(block);
    placed.add(block.key);
  }
  for (; i < first.length; i += 1) {
    if (!placed.has(first[i].key) && !inSecond.has(first[i].key)) out.push(first[i]);
  }
  return out;
}

// ── Merging ──────────────────────────────────────────────────────────────

export type MergeState = 'same' | 'changed' | 'mine-only' | 'theirs-only';
export type MergeChoice = 'mine' | 'theirs' | 'drop';

export interface MergeRow {
  key: string;
  title: string;
  level: number;
  state: MergeState;
  mine?: SectionBlock;
  theirs?: SectionBlock;
}

const PREAMBLE_KEY = '\u0000preamble';

/** Every section of the page and of the branch being brought in, with how they differ — in the page's order. */
export function mergeRows(mine: string, theirs: string, format: DocFormat): MergeRow[] {
  const m = sectionBlocks(mine, format);
  const t = sectionBlocks(theirs, format);
  const mineBy = new Map(m.blocks.map(block => [block.key, block]));
  const theirsBy = new Map(t.blocks.map(block => [block.key, block]));
  const rows: MergeRow[] = [];
  if (m.preamble || t.preamble) {
    const wrap = (text: string): SectionBlock | undefined => (text
      ? { key: PREAMBLE_KEY, title: 'Before the first heading', level: 0, text, words: countWords(text, format) }
      : undefined);
    rows.push({
      key: PREAMBLE_KEY, title: 'Before the first heading', level: 0,
      state: m.preamble === t.preamble ? 'same' : !m.preamble ? 'theirs-only' : !t.preamble ? 'mine-only' : 'changed',
      mine: wrap(m.preamble), theirs: wrap(t.preamble),
    });
  }
  for (const block of mergeOrder(t.blocks, m.blocks)) {
    const a = mineBy.get(block.key);
    const b = theirsBy.get(block.key);
    rows.push({
      key: block.key, title: block.title, level: block.level, mine: a, theirs: b,
      state: a && b ? (a.text === b.text ? 'same' : 'changed') : a ? 'mine-only' : 'theirs-only',
    });
  }
  return rows;
}

/** What a merge does with a row unless the writer says otherwise: take the branch's version, keep what only the page has. */
export function defaultChoice(row: MergeRow): MergeChoice {
  return row.state === 'mine-only' || row.state === 'same' ? 'mine' : 'theirs';
}

/** The page after the merge: each row's chosen version, in order. */
export function applyMerge(rows: MergeRow[], choices: Record<string, MergeChoice>): string {
  const parts: string[] = [];
  for (const row of rows) {
    const choice = choices[row.key] ?? defaultChoice(row);
    const block = choice === 'mine' ? row.mine : choice === 'theirs' ? row.theirs : undefined;
    if (block?.text) parts.push(block.text);
  }
  return parts.join('\n\n') + '\n';
}
