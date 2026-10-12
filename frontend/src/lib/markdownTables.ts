/**
 * Table rows whose bars are only cell borders.
 *
 * GFM splits a row on every unescaped `|` before maths or code is read. So
 * `| Dirac | If $|V|\ge 3$ … |` became five cells instead of two, the table
 * grew columns, and the live view squeezed each column to a letter wide. Every
 * place that reads a table row — the live widget, the read view, the table
 * tools — splits it here, treating a `|` inside `$…$`, inside code, or escaped
 * as content. The read view also has its rows rewritten first
 * (`protectTableBars`), since remark-gfm cannot be told about maths.
 *
 * The rules mirror the AI service's `shape.math_spans` / `table_row_pipes`, so
 * a table renders the same whether it was written by hand or generated.
 */

type Span = [number, number];

/** Where inline code sits in a line — backtick runs of equal length, as [start, end). */
export function codeSpans(line: string): Span[] {
  const spans: Span[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '`') { i += 1; continue; }
    let run = 0;
    while (line[i + run] === '`') run += 1;
    const close = line.indexOf('`'.repeat(run), i + run);
    if (close < 0) break;
    spans.push([i, close + run]);
    i = close + run;
  }
  return spans;
}

/**
 * Inline `$…$` (and `$$…$$`) in one line, as [start, end) including the dollars.
 *
 * Pandoc's rule, so prices are not maths: an opening `$` has a non-space after
 * it; a closing `$` has a non-space before it and no digit after it.
 */
export function mathSpans(line: string): Span[] {
  const code = codeSpans(line);
  const inCode = (i: number) => code.some(([a, b]) => a <= i && i < b);
  const spans: Span[] = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === '$' && !inCode(i)) {
      if (line.startsWith('$$', i)) {
        const close = line.indexOf('$$', i + 2);
        if (close > i + 2) { spans.push([i, close + 2]); i = close + 2; continue; }
        i += 2;
        continue;
      }
      if (i + 1 < n && !/\s/.test(line[i + 1])) {
        let j = i + 1;
        while (j < n) {
          if (line[j] === '\\') { j += 2; continue; }
          if (line[j] === '$' && !/\s/.test(line[j - 1]) && !(j + 1 < n && /\d/.test(line[j + 1]))) break;
          j += 1;
        }
        if (j < n) { spans.push([i, j + 1]); i = j + 1; continue; }
      }
    }
    i += 1;
  }
  return spans;
}

const inside = (spans: Span[], i: number) => spans.some(([a, b]) => a < i && i < b - 1);

/** Offsets of the `|` characters that border cells — not those in maths, code, or escaped. */
export function cellBorders(line: string): number[] {
  const guarded = [...mathSpans(line), ...codeSpans(line)];
  const borders: number[] = [];
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '\\') { i += 1; continue; }
    if (line[i] === '|' && !inside(guarded, i)) borders.push(i);
  }
  return borders;
}

/** A row's cells, trimmed, with the outer bars dropped. `\|` stays as written. */
export function splitTableRow(line: string): string[] {
  const borders = cellBorders(line);
  const cells: string[] = [];
  let start = 0;
  for (const at of borders) { cells.push(line.slice(start, at)); start = at + 1; }
  cells.push(line.slice(start));
  if (line.trimStart().startsWith('|')) cells.shift();
  const last = borders[borders.length - 1];
  if (last !== undefined && !line.slice(last + 1).trim()) cells.pop();
  return cells.map(cell => cell.trim());
}

/** `\vert` with a space when a letter follows, so `\vert V` is not read as `\vertV`. */
const vert = (line: string, at: number, word: string) => word + (/[A-Za-z]/.test(line[at] ?? '') ? ' ' : '');

/** One row rewritten so GFM sees only its borders: `|` in maths → `\vert`, in code → `\|`. */
export function protectRow(line: string): string {
  if (!line.trimStart().startsWith('|') || !line.includes('$') && !line.includes('`')) return line;
  const maths = mathSpans(line);
  const code = codeSpans(line);
  if (!maths.length && !code.length) return line;
  let out = '';
  for (let i = 0; i < line.length; i += 1) {
    const inMath = inside(maths, i);
    if (inMath && line.startsWith('\\|', i)) { out += vert(line, i + 2, '\\Vert'); i += 1; continue; }
    if (line[i] === '\\') { out += line.slice(i, i + 2); i += 1; continue; }
    if (line[i] === '|' && inMath) out += vert(line, i + 1, '\\vert');
    else if (line[i] === '|' && inside(code, i)) out += '\\|';
    else out += line[i];
  }
  return out;
}

/** The whole document with every table row protected; code fences are left alone. */
export function protectTableBars(markdown: string): string {
  if (!markdown.includes('|')) return markdown;
  let fence = false;
  return markdown.split('\n').map(line => {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return line; }
    return fence ? line : protectRow(line);
  }).join('\n');
}
