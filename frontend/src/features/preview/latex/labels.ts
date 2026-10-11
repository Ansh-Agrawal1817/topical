/**
 * Every `\label` in a LaTeX document, with the number and kind it refers to.
 *
 * The same numbering the renderer gives (`render.ts`): unstarred sections to
 * three levels (1, 1.2, 1.2.3); figures and tables counted separately;
 * numbered display maths — `equation`, `align`, `gather`, `multline`,
 * `eqnarray`, `flalign`, `alignat`, never their starred forms, `\[…\]` or
 * `$$` — one number per environment; theorem-like environments on one shared
 * counter. A label binds to the innermost numbered thing it sits in, or, in
 * running text, to the section above it.
 *
 * A cheap line scan rather than a render, so the live editor can resolve
 * `\ref` on every keystroke, and the AI can be told which labels exist.
 */

export type LabelKind = 'Section' | 'Figure' | 'Table' | 'Equation' | 'Theorem';

export interface LabelTarget {
  number: string;
  kind: LabelKind;
  /** The kind's own name for theorem-like environments: "Lemma", "Definition". */
  name: string;
  /** A short description — a caption or heading — for prompts and tooltips. */
  title: string;
}

const NUMBERED_MATH = new Set(['equation', 'align', 'gather', 'multline', 'eqnarray', 'flalign', 'alignat']);
const THEOREMS: Record<string, string> = {
  theorem: 'Theorem', lemma: 'Lemma', corollary: 'Corollary', proposition: 'Proposition',
  definition: 'Definition', example: 'Example', remark: 'Remark', claim: 'Claim',
  conjecture: 'Conjecture', axiom: 'Axiom', exercise: 'Exercise', problem: 'Problem',
};
const SECTIONS: Record<string, number> = { section: 1, subsection: 2, subsubsection: 3 };

interface Open { env: string; target: LabelTarget | null }

export function collectLabels(source: string): Map<string, LabelTarget> {
  const labels = new Map<string, LabelTarget>();
  const counters = { section: 0, subsection: 0, subsubsection: 0, figure: 0, table: 0, equation: 0, theorem: 0 };
  let current: LabelTarget | null = null; // the last numbered heading, for labels in running text
  const stack: Open[] = [];

  // Comments out, verbatim bodies out: neither numbers anything.
  const text = source
    .replace(/\\begin\{(verbatim|lstlisting|minted)\}[\s\S]*?\\end\{\1\}/g, '')
    .replace(/(^|[^\\])%.*$/gm, '$1');

  const token = /\\(section|subsection|subsubsection)(\*?)\s*\{([^}]*)\}|\\begin\{([a-zA-Z*]+)\}|\\end\{([a-zA-Z*]+)\}|\\label\{([^}]*)\}|\\caption(?:\[[^\]]*\])?\{([^}]*)\}|\\\[|\\\]|\$\$/g;
  let displayMath = false;
  for (let m; (m = token.exec(text));) {
    if (m[0] === '\\[' || m[0] === '$$' && !displayMath) { displayMath = true; continue; }
    if (m[0] === '\\]' || m[0] === '$$') { displayMath = false; continue; }
    if (m[1]) {
      if (m[2] === '*') continue;
      const level = SECTIONS[m[1]];
      if (level === 1) { counters.section++; counters.subsection = 0; counters.subsubsection = 0; }
      else if (level === 2) { counters.subsection++; counters.subsubsection = 0; }
      else { counters.subsubsection++; }
      const number = [counters.section, counters.subsection, counters.subsubsection].slice(0, level).join('.');
      current = { number, kind: 'Section', name: 'Section', title: m[3].trim() };
    } else if (m[4]) {
      const env = m[4];
      const bare = env.replace(/\*$/, '');
      let target: LabelTarget | null = null;
      if ((bare === 'figure' || bare === 'table') && !displayMath) {
        const n = ++counters[bare];
        target = { number: String(n), kind: bare === 'figure' ? 'Figure' : 'Table', name: bare === 'figure' ? 'Figure' : 'Table', title: '' };
      } else if (NUMBERED_MATH.has(env)) {
        target = { number: String(++counters.equation), kind: 'Equation', name: 'Equation', title: '' };
      } else if (THEOREMS[bare]) {
        target = { number: String(++counters.theorem), kind: 'Theorem', name: THEOREMS[bare], title: '' };
      }
      stack.push({ env, target });
    } else if (m[5]) {
      const at = stack.map(o => o.env).lastIndexOf(m[5]);
      if (at >= 0) stack.length = at;
    } else if (m[6]) {
      const numbered = [...stack].reverse().find(o => o.target)?.target;
      // In unnumbered display maths a label has nothing to point at — as in the renderer.
      if (displayMath && !numbered) continue;
      const inner = numbered ?? current;
      if (inner) labels.set(m[6].trim(), { ...inner });
    } else if (m[7] !== undefined) {
      const inner = [...stack].reverse().find(o => o.target)?.target;
      if (inner) {
        inner.title = m[7].trim();
        // Labels set before the caption pick the caption up too.
        for (const [key, value] of labels) if (value.number === inner.number && value.kind === inner.kind && !value.title) labels.set(key, { ...value, title: inner.title });
      }
    }
  }
  return labels;
}

/** How a reference command reads once resolved: `\ref` "2", `\eqref` "(2)", `\autoref` "Table 2". */
export function referenceText(command: string, target: LabelTarget | undefined): string {
  if (!target) return '??';
  if (command === 'eqref') return `(${target.number})`;
  if (command === 'autoref' || command === 'cref' || command === 'Cref') {
    return target.kind === 'Equation' ? `Equation (${target.number})` : `${target.name} ${target.number}`;
  }
  return target.number;
}

/** The labels as a short list for an AI prompt: "tab:errors → Table 2 (Error rates by model)". */
export function labelDigest(labels: Map<string, LabelTarget>, max = 40): string[] {
  return [...labels].slice(0, max).map(([key, t]) =>
    `${key} → ${t.kind === 'Equation' ? `Equation (${t.number})` : `${t.name} ${t.number}`}${t.title ? ` (${t.title.slice(0, 60)})` : ''}`);
}
