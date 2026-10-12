/**
 * Markdown tables, edited as tables.
 *
 * A pipe table is a grid written as text, and editing one by hand means
 * counting pipes and padding cells so the source stays legible. Tab and
 * Enter do that here: they move between cells the way a spreadsheet does,
 * and tidy the whole table — every column padded to its widest cell — on the
 * way, adding a row when they run off the end.
 *
 * Pure text functions in the shape of `textOps`: document and selection in,
 * `EditResult` out, or null when the caret is not in a table.
 */

import type { EditResult, Range } from './textOps';
import { cellBorders, splitTableRow } from '@/lib/markdownTables';

/** A row of a table: `| a | b |`, `a | b`, with or without the outer pipes. */
const ROW = /^\s*\|?.*\|.*$/;
/** The rule under the header: `| --- | :-: |`. */
const RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

interface TableLines {
  /** Offsets of the first and last line of the table. */
  from: number;
  to: number;
  lines: string[];
  /** Index (into `lines`) of the line the caret is on. */
  caretLine: number;
  /** Column of the caret within that line. */
  caretColumn: number;
}

/** The table around `pos`, if `pos` is on a line of one. */
function tableAt(doc: string, pos: number): TableLines | null {
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd = doc.indexOf('\n', pos) === -1 ? doc.length : doc.indexOf('\n', pos);
  if (!ROW.test(doc.slice(lineStart, lineEnd))) return null;

  // Walk out to the first and last consecutive row lines.
  let from = lineStart;
  while (from > 0) {
    const prevStart = doc.lastIndexOf('\n', from - 2) + 1;
    const prev = doc.slice(prevStart, from - 1);
    if (!ROW.test(prev) || !prev.trim()) break;
    from = prevStart;
  }
  let to = lineEnd;
  while (to < doc.length) {
    const nextEnd = doc.indexOf('\n', to + 1) === -1 ? doc.length : doc.indexOf('\n', to + 1);
    const next = doc.slice(to + 1, nextEnd);
    if (!ROW.test(next) || !next.trim()) break;
    to = nextEnd;
  }

  const lines = doc.slice(from, to).split('\n');
  // A table has a header and a rule under it; anything else with pipes in it
  // (a line of prose mentioning `a | b`) is left alone.
  if (lines.length < 2 || !RULE.test(lines[1])) return null;

  let caretLine = 0;
  let offset = from;
  for (let i = 0; i < lines.length; i += 1) {
    if (pos <= offset + lines[i].length) { caretLine = i; break; }
    offset += lines[i].length + 1;
  }
  return { from, to, lines, caretLine, caretColumn: pos - offset };
}

/** Split a row into its cells: `\|`, and `|` inside maths or code, are content (see `markdownTables`). */
function cells(line: string): string[] {
  return splitTableRow(line);
}

/** Which cell of `line` column `column` falls in. */
function cellIndexAt(line: string, column: number): number {
  const startsWithPipe = line.trimStart().startsWith('|');
  const before = cellBorders(line).filter(at => at < column).length;
  return Math.max(0, startsWithPipe ? before - 1 : before);
}

type Align = 'left' | 'center' | 'right' | 'none';

function alignOf(rule: string): Align {
  const r = rule.trim();
  const left = r.startsWith(':');
  const right = r.endsWith(':');
  return left && right ? 'center' : right ? 'right' : left ? 'left' : 'none';
}

function ruleFor(align: Align, width: number): string {
  const dashes = '-'.repeat(Math.max(3, width - (align === 'center' ? 2 : align === 'none' ? 0 : 1)));
  return align === 'center' ? `:${dashes}:` : align === 'left' ? `:${dashes}` : align === 'right' ? `${dashes}:` : dashes;
}

function pad(text: string, width: number, align: Align): string {
  const gap = Math.max(0, width - text.length);
  if (align === 'right') return ' '.repeat(gap) + text;
  if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + text + ' '.repeat(Math.ceil(gap / 2));
  return text + ' '.repeat(gap);
}

/**
 * The table rewritten with every column padded to its widest cell, and where
 * each cell's text starts, so a caret can be put into any cell afterwards.
 */
function layout(rows: string[][], aligns: Align[], indent: string) {
  const columns = Math.max(...rows.map(row => row.length), aligns.length);
  // Wide enough for the rule's own dashes and colons as well as the text.
  const widths = Array.from({ length: columns }, (_, c) => {
    const align = aligns[c] ?? 'none';
    const floor = align === 'center' ? 5 : align === 'none' ? 3 : 4;
    return Math.max(floor, ...rows.map(row => (row[c] ?? '').length));
  });
  const starts: number[][] = [];
  const lines: string[] = [];
  let offset = 0;
  const all = [rows[0], null, ...rows.slice(1)];
  all.forEach(row => {
    let line = `${indent}|`;
    const rowStarts: number[] = [];
    for (let c = 0; c < columns; c += 1) {
      const align = aligns[c] ?? 'none';
      line += ' ';
      rowStarts.push(offset + line.length);
      line += row ? pad(row[c] ?? '', widths[c], align) : ruleFor(align, widths[c]);
      line += ' |';
    }
    if (row) starts.push(rowStarts);
    lines.push(line);
    offset += line.length + 1;
  });
  return { text: lines.join('\n'), starts };
}

/**
 * Tab (and Shift-Tab) in a table: tidy it, and move to the next (previous)
 * cell, selecting what is in it. Off the end of the last row, a new row is
 * added. Null when the caret is not in a table.
 */
export function tableTab(doc: string, sel: Range, direction: 1 | -1): EditResult | null {
  const table = tableAt(doc, sel.end);
  if (!table) return null;
  const indent = /^\s*/.exec(table.lines[0])?.[0] ?? '';
  const aligns = cells(table.lines[1]).map(alignOf);
  const rows = table.lines.filter((_, i) => i !== 1).map(cells);
  const columns = Math.max(...rows.map(row => row.length), aligns.length);

  // Row index among the content rows (the rule line is not a row you edit).
  const rowIndex = table.caretLine === 0 ? 0 : Math.max(0, table.caretLine - 1);
  const column = table.caretLine === 1 ? 0 : Math.min(cellIndexAt(table.lines[table.caretLine], table.caretColumn), columns - 1);

  let targetRow = rowIndex;
  let targetCol = column + direction;
  if (targetCol >= columns) { targetCol = 0; targetRow += 1; }
  if (targetCol < 0) { targetCol = columns - 1; targetRow -= 1; }
  if (targetRow < 0) { targetRow = 0; targetCol = 0; }
  if (targetRow >= rows.length) rows.push(Array(columns).fill(''));

  const { text, starts } = layout(rows, aligns, indent);
  const cellText = rows[targetRow][targetCol] ?? '';
  const start = table.from + starts[targetRow][targetCol];
  return {
    content: doc.slice(0, table.from) + text + doc.slice(table.to),
    start,
    end: start + cellText.length,
  };
}

/**
 * Enter in a table: tidy it and go down one row in the same column, adding a
 * row at the bottom. A pipe table cannot hold a line break, so Enter's usual
 * meaning would only have split the row in two.
 */
export function tableEnter(doc: string, sel: Range): EditResult | null {
  // A selected cell (which is what Tab leaves) moves down like a caret would:
  // falling through to the plain Enter replaced the cell with a line break
  // and split the table in two.
  if (doc.slice(sel.start, sel.end).includes('\n')) return null;
  const table = tableAt(doc, sel.end);
  if (!table) return null;
  const indent = /^\s*/.exec(table.lines[0])?.[0] ?? '';
  const aligns = cells(table.lines[1]).map(alignOf);
  const rows = table.lines.filter((_, i) => i !== 1).map(cells);
  const columns = Math.max(...rows.map(row => row.length), aligns.length);

  const rowIndex = table.caretLine === 0 ? 0 : Math.max(0, table.caretLine - 1);
  const column = table.caretLine === 1 ? 0 : Math.min(cellIndexAt(table.lines[table.caretLine], table.caretColumn), columns - 1);
  // Enter on an empty last row ends the table: the row goes, and the caret
  // lands on a fresh line below it — the way out of a table by keyboard.
  const last = rows[rows.length - 1];
  if (rowIndex === rows.length - 1 && rowIndex > 0 && last.every(cell => !cell.trim())) {
    rows.pop();
    const { text } = layout(rows, aligns, indent);
    // A blank line to type on, set apart from both the table and whatever follows.
    const rest = doc.slice(table.to).replace(/^\n+/, '');
    const content = doc.slice(0, table.from) + text + '\n\n' + (rest ? `\n\n${rest}` : '');
    const caret = table.from + text.length + 2;
    return { content, start: caret, end: caret };
  }
  const targetRow = rowIndex + 1;
  if (targetRow >= rows.length) rows.push(Array(columns).fill(''));
  const { text, starts } = layout(rows, aligns, indent);
  const start = table.from + starts[targetRow][column];
  return {
    content: doc.slice(0, table.from) + text + doc.slice(table.to),
    start,
    end: start + (rows[targetRow][column] ?? '').length,
  };
}
