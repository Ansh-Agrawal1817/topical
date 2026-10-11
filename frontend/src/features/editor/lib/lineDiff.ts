/**
 * Line-level diff between two versions of a document, for the history view.
 *
 * Lines rather than words: a version can be thousands of words apart from
 * the page, and what a writer scans history for is which paragraphs changed.
 * The common head and tail are matched first, so the LCS table only covers
 * the middle that actually differs.
 */

export type LineKind = 'same' | 'cut' | 'added';
export interface DiffLine { kind: LineKind; text: string }

/** Past this many cells the middle is shown as one replacement instead. */
const MAX_CELLS = 4_000_000;

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;

  const out: DiffLine[] = a.slice(0, head).map(text => ({ kind: 'same', text }));
  const x = a.slice(head, a.length - tail);
  const y = b.slice(head, b.length - tail);

  if (x.length * y.length > MAX_CELLS) {
    out.push(...x.map(text => ({ kind: 'cut' as const, text })), ...y.map(text => ({ kind: 'added' as const, text })));
  } else {
    const cols = y.length + 1;
    const table = new Uint32Array((x.length + 1) * cols);
    for (let i = x.length - 1; i >= 0; i--) {
      for (let j = y.length - 1; j >= 0; j--) {
        table[i * cols + j] = x[i] === y[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < x.length && j < y.length) {
      if (x[i] === y[j]) { out.push({ kind: 'same', text: x[i] }); i++; j++; }
      else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) out.push({ kind: 'cut', text: x[i++] });
      else out.push({ kind: 'added', text: y[j++] });
    }
    while (i < x.length) out.push({ kind: 'cut', text: x[i++] });
    while (j < y.length) out.push({ kind: 'added', text: y[j++] });
  }

  out.push(...a.slice(a.length - tail).map(text => ({ kind: 'same' as const, text })));
  return out;
}

/** Lines added and removed, for a one-line summary. */
export function diffCounts(lines: DiffLine[]): { added: number; cut: number } {
  let added = 0;
  let cut = 0;
  for (const line of lines) {
    if (line.kind === 'added') added++;
    else if (line.kind === 'cut') cut++;
  }
  return { added, cut };
}
