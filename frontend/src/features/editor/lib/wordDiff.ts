/**
 * A word-level difference between two passages: what an AI edit kept, cut
 * and added. Shown before anything is applied, so a rewrite is read as a
 * set of changes rather than as a second paragraph to compare by eye.
 */

export interface DiffPart {
  kind: 'same' | 'cut' | 'added';
  text: string;
}

/** Words with the whitespace after each, so the parts join back into the text exactly. */
function tokens(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

/** Above this many cells the table costs more than a glance is worth; the caller shows the result alone. */
const MAX_CELLS = 360_000;

export function wordDiff(before: string, after: string): DiffPart[] | null {
  const a = tokens(before);
  const b = tokens(after);
  if (a.length * b.length > MAX_CELLS) return null;

  // Longest common subsequence over words, compared without their trailing space.
  const key = (t: string) => t.trimEnd();
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = key(a[i]) === key(b[j])
        ? table[(i + 1) * cols + j + 1] + 1
        : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  const push = (kind: DiffPart['kind'], text: string) => {
    const last = parts[parts.length - 1];
    if (last?.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (key(a[i]) === key(b[j])) { push('same', b[j]); i++; j++; }
    else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) push('cut', a[i++]);
    else push('added', b[j++]);
  }
  while (i < a.length) push('cut', a[i++]);
  while (j < b.length) push('added', b[j++]);
  return parts;
}

/** How much of the passage survived, 0–1 — for a one-line summary of the change. */
export function keptShare(parts: DiffPart[]): number {
  let same = 0;
  let total = 0;
  for (const part of parts) {
    const words = part.text.split(/\s+/).filter(Boolean).length;
    if (part.kind !== 'added') total += words;
    if (part.kind === 'same') same += words;
  }
  return total ? same / total : 0;
}
