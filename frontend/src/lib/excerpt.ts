import { formatOf } from './types';

/**
 * A document's opening prose, without its markup — for a card that has to
 * say what a document is about in two lines. Headings, code, maths blocks,
 * tables and LaTeX structure are skipped; inline markup is read through.
 */
export function excerptOf(content: string, mainTopic: string | null | undefined, length = 220): string {
  const latex = formatOf(mainTopic) === 'latex';
  let fenced = false;
  const out: string[] = [];
  for (const raw of content.split(/\n\s*\n/)) {
    const block = raw.trim();
    if (!block) continue;
    if (fenced) { if (/(```|~~~)\s*$/.test(block)) fenced = false; continue; }
    if (/^(```|~~~)/.test(block)) { fenced = !/\n(```|~~~)\s*$/.test(block); continue; }
    const lines = block.split('\n').filter(line => !(latex
      ? /^\s*\\(section|subsection|subsubsection|chapter|part|paragraph|begin|end|documentclass|usepackage|title|author|date|maketitle|label|item)\b/.test(line) || /^\s*%/.test(line)
      : /^\s*(#{1,6}\s|\||\$\$|<|>\s*\[!)/.test(line)));
    const text = plain(lines.join(' '), latex);
    if (text.split(/\s+/).length < 6) continue;
    out.push(text);
    if (out.join(' ').length >= length) break;
  }
  const joined = out.join(' ');
  return joined.length > length ? `${joined.slice(0, length).replace(/\s+\S*$/, '')}…` : joined;
}

function plain(text: string, latex: boolean): string {
  const stripped = latex
    ? text
      .replace(/(?<!\\)%.*$/gm, '')
      .replace(/\\(textbf|textit|emph|texttt|underline|textsc)\{([^}]*)\}/g, '$2')
      .replace(/\\(cite[pt]?|ref|eqref|label|footnote)\{[^}]*\}/g, '')
      .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, '$1')
      .replace(/\$([^$]*)\$/g, '$1')
      .replace(/\\[a-zA-Z@]+\*?/g, '')
      .replace(/[{}~]/g, ' ')
      .replace(/\\([%&$#_])/g, '$1')
    : text
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\$([^$]*)\$/g, '$1')
      .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, '$2')
      .replace(/^\s*([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/gm, '')
      .replace(/<[^>]+>/g, '');
  return stripped.replace(/\s+/g, ' ').trim();
}

/** Roughly how many words a document is, for "8 min read". */
export function wordsIn(content: string): number {
  return content.split(/\s+/).filter(word => /[A-Za-z0-9]/.test(word)).length;
}
