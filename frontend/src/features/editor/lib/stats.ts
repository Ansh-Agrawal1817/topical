/** Live document measurements for the status bar. */

import type { DocFormat } from '@/lib/types';

export interface DocStats {
  words: number;
  chars: number;
  sentences: number;
  paragraphs: number;
  /** Minutes at 200 wpm, the usual prose average. */
  readMinutes: number;
}

/** Strip markup so a heading's `##` doesn't count as a word. */
function plainText(content: string, format: DocFormat): string {
  if (format === 'latex') {
    return content
      .replace(/(?<!\\)%[^\n]*/g, ' ')
      .replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, ' ')
      .replace(/\\[a-zA-Z@]+\*?/g, ' ')
      .replace(/[{}$&#~^_\\]/g, ' ');
  }
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|-]/g, ' ');
}

export function documentStats(content: string, format: DocFormat): DocStats {
  const text = plainText(content, format).trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const sentences = text ? (text.match(/[.!?](?:\s|$)/g) ?? []).length : 0;
  const paragraphs = content.trim() ? content.trim().split(/\n\s*\n/).length : 0;

  return {
    words,
    chars: content.length,
    sentences,
    paragraphs,
    readMinutes: Math.max(1, Math.round(words / 200)),
  };
}

/** Word count of an arbitrary slice — used for "N words selected". */
export function countWords(text: string, format: DocFormat): number {
  const plain = plainText(text, format).trim();
  return plain ? plain.split(/\s+/).filter(Boolean).length : 0;
}

/**
 * A stretch of the document's own prose, for a generated section to match.
 *
 * Paragraphs only — headings, code, maths blocks, tables and LaTeX structure
 * say nothing about how the writer writes — taken from the start of the
 * body, up to about `limit` characters. Empty when nothing has been written.
 */
export function proseSample(content: string, format: DocFormat, limit = 1500): string {
  const blocks = content.split(/\n\s*\n/);
  const prose: string[] = [];
  let size = 0;
  let fenced = false;
  // A heading written straight above its paragraph shares the block; drop the line, keep the prose.
  const heading = format === 'latex'
    ? /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|label)\*?\{.*\}\s*$/
    : /^\s*#{1,6}\s/;
  for (const raw of blocks) {
    const block = raw.split('\n').filter(line => !heading.test(line)).join('\n').trim();
    if (!block) continue;
    // A code block can span blank lines: skip from its opening fence to its closing one.
    if (fenced) { if (/(```|~~~)\s*$/.test(block)) fenced = false; continue; }
    if (/^(```|~~~)/.test(block)) { fenced = !/\n(```|~~~)\s*$/.test(block); continue; }
    if (/^(\$\$|\|)/.test(block)) continue;
    if (format === 'latex'
      ? /^\\(section|subsection|subsubsection|chapter|part|paragraph|begin|end|documentclass|usepackage|title|author|maketitle|item)\b/.test(block)
      : /^(#{1,6}\s|[-*+]\s|\d+\.\s|>|<)/.test(block)) continue;
    if (countWords(block, format) < 12) continue;
    prose.push(block);
    size += block.length;
    if (size >= limit) break;
  }
  return prose.join('\n\n').slice(0, limit);
}
