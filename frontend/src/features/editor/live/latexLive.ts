import { StreamLanguage } from '@codemirror/language';
import { type EditorState, type Range, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { BulletWidget, FloatWidget, LabelWidget, linkMark, MathWidget, safely } from './widgets';
import { collectLabels, referenceText, type LabelTarget } from '@/features/preview/latex/labels';

/**
 * Live LaTeX: the same idea as live Markdown, for a language with no
 * grammar to lean on. `\section{Results}` is set as a heading and its
 * command hidden until the caret comes to the line; `\textbf{word}` is
 * bold with its command hidden until the caret is in it; maths is typeset;
 * `\item` is a bullet; a theorem is labelled "Theorem." and set off.
 *
 * Structure that spans lines — display maths, verbatim, lists and
 * theorem-like environments — is found by one scan of the document in a
 * state field. Everything inside a line is handled by a view plugin, for
 * the lines on screen only.
 */

/* ─────────────────────────── Source highlighting ─────────────────────────── */

/** A small LaTeX tokenizer for the source view: commands, maths, comments, brackets. */
export const latexLanguage = StreamLanguage.define<{ math: boolean }>({
  name: 'latex',
  startState: () => ({ math: false }),
  token(stream, state) {
    if (stream.match('%')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match(/^\\[a-zA-Z@]+\*?/)) return state.math ? 'atom' : 'keyword';
    if (stream.match(/^\\./)) return 'meta';
    if (stream.match('$$') || stream.match('$')) { state.math = !state.math; return 'processingInstruction'; }
    if (stream.match(/^[{}[\]]/)) return 'bracket';
    stream.next();
    return state.math ? 'string' : null;
  },
});

/* ─────────────────────────── Text helpers ─────────────────────────── */

/** Where an unescaped `%` starts a comment on this line, or -1. */
function commentAt(text: string) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '%') return i;
  }
  return -1;
}

/** The index of the `}` closing the `{` at `open`, or -1 if it is not on this line. */
function closeBrace(text: string, open: number) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

const MATH_ENVS = /^(equation|align|gather|multline|eqnarray|displaymath|alignat|flalign)\*?$/;
const CODE_ENVS = /^(verbatim|Verbatim|lstlisting|minted)\*?$/;
const LIST_ENVS = /^(itemize|enumerate|description)$/;
const THEOREMS: Record<string, string> = {
  theorem: 'Theorem', lemma: 'Lemma', proposition: 'Proposition', corollary: 'Corollary', definition: 'Definition',
  remark: 'Remark', example: 'Example', proof: 'Proof', abstract: 'Abstract', quote: '', quotation: '',
};

/** KaTeX takes the body of an environment, so the environment is translated into the nearest one it knows. */
function texFor(env: string, body: string) {
  const clean = body.replace(/\\label\{[^}]*\}/g, '').replace(/\\(nonumber|notag)\b/g, '');
  const name = env.replace(/\*$/, '');
  if (name === 'align' || name === 'eqnarray' || name === 'flalign') return `\\begin{aligned}${clean}\\end{aligned}`;
  if (name === 'alignat') return `\\begin{aligned}${clean.replace(/^\s*\{\d+\}/, '')}\\end{aligned}`;
  if (name === 'gather' || name === 'multline') return `\\begin{gathered}${clean}\\end{gathered}`;
  return clean;
}

/* ─────────────────────────── The document's structure ─────────────────────────── */

interface Structure {
  /** Display maths, with the TeX to typeset. */
  math: { from: number; to: number; tex: string }[];
  /** Line numbers inside verbatim-like environments, and inside display maths. */
  code: Set<number>;
  inMath: Set<number>;
  /** What each `\item` line's bullet says. */
  items: Map<number, string>;
  /** Lines inside a theorem-like or quote environment, and its name. */
  envBody: Map<number, string>;
  /** `\begin`/`\end` lines of environments that are only structure. */
  envTags: Map<number, { kind: 'begin' | 'end'; env: string; title?: string }>;
}

function scan(state: EditorState): Structure {
  const doc = state.doc;
  const out: Structure = { math: [], code: new Set(), inMath: new Set(), items: new Map(), envBody: new Map(), envTags: new Map() };
  const lists: { env: string; count: number }[] = [];
  const blocks: string[] = [];
  let code: string | null = null;

  for (let n = 1; n <= doc.lines; n++) {
    const l = doc.line(n);
    const cut = commentAt(l.text);
    const text = cut >= 0 ? l.text.slice(0, cut) : l.text;
    const trimmed = text.trim();

    if (code) {
      out.code.add(n);
      if (new RegExp(`\\\\end\\{${code.replace('*', '\\*')}\\}`).test(text)) code = null;
      continue;
    }
    const begin = /\\begin\{([^}]+)\}(\[[^\]]*\])?/.exec(text);
    if (begin && CODE_ENVS.test(begin[1])) {
      code = begin[1];
      out.code.add(n);
      if (new RegExp(`\\\\end\\{${code.replace('*', '\\*')}\\}`).test(text.slice(begin.index + begin[0].length))) code = null;
      continue;
    }

    // Display maths: an environment, \[ … \], or $$ … $$.
    let mathEnd: RegExp | null = null;
    let env = '';
    let open = -1;
    if (begin && MATH_ENVS.test(begin[1])) { env = begin[1]; mathEnd = new RegExp(`\\\\end\\{${env.replace('*', '\\*')}\\}`); open = begin.index + begin[0].length; }
    else if (trimmed.startsWith('\\[')) { env = '\\['; mathEnd = /\\\]/; open = text.indexOf('\\[') + 2; }
    else if (trimmed.startsWith('$$')) { env = '$$'; mathEnd = /\$\$/; open = text.indexOf('$$') + 2; }
    if (mathEnd) {
      let end = n;
      let body = '';
      const sameLine = mathEnd.exec(text.slice(open));
      if (sameLine) {
        body = text.slice(open, open + sameLine.index);
      } else {
        body = text.slice(open);
        while (end < doc.lines) {
          end++;
          const next = doc.line(end).text;
          const close = mathEnd.exec(next);
          if (close) { body += '\n' + next.slice(0, close.index); break; }
          body += '\n' + next;
        }
      }
      for (let k = n; k <= end; k++) out.inMath.add(k);
      out.math.push({ from: l.from, to: doc.line(end).to, tex: env === '\\[' || env === '$$' ? body : texFor(env, body) });
      n = end;
      continue;
    }

    if (begin && LIST_ENVS.test(begin[1])) {
      lists.push({ env: begin[1], count: 0 });
      out.envTags.set(n, { kind: 'begin', env: begin[1] });
      continue;
    }
    if (begin && begin[1] in THEOREMS) {
      blocks.push(begin[1]);
      out.envTags.set(n, { kind: 'begin', env: begin[1], title: begin[2]?.slice(1, -1) });
      continue;
    }
    if (begin && (begin[1] === 'document' || begin[1] === 'center')) {
      out.envTags.set(n, { kind: 'begin', env: begin[1] });
      continue;
    }
    const end = /\\end\{([^}]+)\}/.exec(text);
    if (end && (LIST_ENVS.test(end[1]) || end[1] in THEOREMS || end[1] === 'document' || end[1] === 'center')) {
      if (LIST_ENVS.test(end[1])) lists.pop();
      if (end[1] in THEOREMS) blocks.pop();
      out.envTags.set(n, { kind: 'end', env: end[1] });
      continue;
    }

    if (/^\s*\\item\b/.test(text) && lists.length) {
      const list = lists[lists.length - 1];
      list.count++;
      out.items.set(n, list.env === 'enumerate' ? `${list.count}.` : list.env === 'description' ? '' : '•');
    }
    if (blocks.length) out.envBody.set(n, blocks[blocks.length - 1]);
  }
  return out;
}

/**
 * Every label in the document and what it points at, so `\ref{tab:x}` can read
 * "2" as it is typed — the same numbering the read view gives (preview/latex/labels).
 * Rescanned only when the text changes; a line scan, cheap at document size.
 */
const labelsField = StateField.define<Map<string, LabelTarget>>({
  create: state => collectLabels(state.doc.toString()),
  update: (labels, tr) => (tr.docChanged ? collectLabels(tr.state.doc.toString()) : labels),
});

const structure = StateField.define<Structure>({
  create: scan,
  update: (value, tr) => (tr.docChanged ? scan(tr.state) : value),
});

/**
 * Which blocks the selection is in, as a key — so a caret move that stays
 * inside (or outside) every block leaves the block decorations exactly as they
 * were, instead of rebuilding them on every arrow key.
 */
function touchedKey(blocks: readonly { from: number; to: number }[], state: EditorState): string {
  const sel = state.selection.ranges;
  let key = '';
  blocks.forEach((block, i) => { if (sel.some(r => r.from <= block.to && r.to >= block.from)) key += `${i},`; });
  return key;
}

/** Display maths replaced by its typesetting, unless the selection is in it. */
const mathBlocks = StateField.define<{ key: string; set: DecorationSet }>({
  create: state => ({ key: touchedKey(state.field(structure).math, state), set: buildMath(state) }),
  update: (value, tr) => {
    if (!tr.docChanged && !tr.selection) return value;
    const key = touchedKey(tr.state.field(structure).math, tr.state);
    return !tr.docChanged && key === value.key ? value : { key, set: buildMath(tr.state) };
  },
  provide: field => EditorView.decorations.from(field, value => value.set),
});

function buildMath(state: EditorState): DecorationSet {
  const { math } = state.field(structure);
  const sel = state.selection.ranges;
  const out: Range<Decoration>[] = [];
  for (const block of math) {
    if (sel.some(r => r.from <= block.to && r.to >= block.from) || !block.tex.trim()) continue;
    out.push(Decoration.replace({ widget: new MathWidget(block.tex, true), block: true }).range(block.from, block.to));
  }
  return Decoration.set(out, true);
}

interface TableSpan { from: number; to: number; source: string; number: number }

/**
 * Where the tables are — `table`/`table*` floats and bare `tabular`s —
 * numbered in document order, as captions and `\ref` number them. Found
 * when the text changes; a caret move only asks which one it is in.
 */
const tableSpans = StateField.define<TableSpan[]>({
  create: state => findTables(state),
  update: (spans, tr) => (tr.docChanged ? findTables(tr.state) : spans),
});

function findTables(state: EditorState): TableSpan[] {
  const doc = state.doc;
  const out: TableSpan[] = [];
  let tables = 0;
  for (let n = 1; n <= doc.lines; n++) {
    const open = /^\s*\\begin\{(table\*?|tabularx?)\}/.exec(doc.line(n).text);
    if (!open) continue;
    const env = open[1];
    const close = `\\end{${env}}`;
    let end = n;
    while (end <= doc.lines && !doc.line(end).text.includes(close)) end++;
    if (end > doc.lines) break; // never closed: leave the source showing
    if (env.startsWith('table')) tables++;
    const from = doc.line(n).from, to = doc.line(end).to;
    out.push({ from, to, source: doc.sliceString(from, to), number: env.startsWith('table') ? tables : 0 });
    n = end;
  }
  return out;
}

/** Tables drawn as tables, unless the selection is inside one, where the source is what is being edited. */
const tableBlocks = StateField.define<{ key: string; set: DecorationSet }>({
  create: state => ({ key: touchedKey(state.field(tableSpans), state), set: buildTables(state) }),
  update: (value, tr) => {
    if (!tr.docChanged && !tr.selection) return value;
    const key = touchedKey(tr.state.field(tableSpans), tr.state);
    return !tr.docChanged && key === value.key ? value : { key, set: buildTables(tr.state) };
  },
  provide: field => EditorView.decorations.from(field, value => value.set),
});

function buildTables(state: EditorState): DecorationSet {
  const sel = state.selection.ranges;
  const out: Range<Decoration>[] = [];
  for (const table of state.field(tableSpans)) {
    if (sel.some(r => r.from <= table.to && r.to >= table.from)) continue;
    out.push(Decoration.replace({ widget: new FloatWidget(table.source, table.number), block: true }).range(table.from, table.to));
  }
  return Decoration.set(out, true);
}

/* ─────────────────────────── Inside a line ─────────────────────────── */

const mark = (cls: string) => Decoration.mark({ class: cls });
const line = (cls: string) => Decoration.line({ class: cls });
const hide = Decoration.replace({});
const MARKER = mark('cm-live-marker');

const SECTIONS: Record<string, number> = { part: 1, chapter: 1, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 4 };
const STYLES: Record<string, string> = {
  textbf: 'cm-live-strong', mathbf: 'cm-live-strong', textit: 'cm-live-em', emph: 'cm-live-em', textsl: 'cm-live-em',
  texttt: 'cm-live-code', underline: 'cm-live-underline', textsc: 'cm-live-smallcaps', textsf: '', textrm: '',
};
const PREAMBLE = /^\s*\\(documentclass|usepackage|newcommand|renewcommand|DeclareMathOperator|newtheorem|setlength|geometry|bibliographystyle|graphicspath|hypersetup)\b/;

function buildInline(view: EditorView): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const info = state.field(structure);
  const focused = view.hasFocus;
  const sel = focused ? state.selection.ranges : [];
  const caretLines = new Set<number>();
  for (const r of sel) for (let n = doc.lineAt(r.from).number; n <= doc.lineAt(r.to).number; n++) caretLines.add(n);
  const touches = (from: number, to: number) => sel.some(r => r.from <= to && r.to >= from);
  const out: Range<Decoration>[] = [];
  const markup = (from: number, to: number, shown: boolean) => { if (to > from) out.push((shown ? MARKER : hide).range(from, to)); };

  for (const { from, to } of view.visibleRanges) {
    for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) {
      const l = doc.line(n);
      const onLine = caretLines.has(n);
      if (info.code.has(n)) { out.push(line('cm-live-codeblock').range(l.from)); continue; }
      if (info.inMath.has(n)) {
        // Off the caret the block is a widget; on it, the source is shown as maths source.
        if (info.math.some(b => b.from <= l.from && b.to >= l.to && touches(b.from, b.to))) out.push(line('cm-live-math-block').range(l.from));
        continue;
      }

      const cut = commentAt(l.text);
      const text = cut >= 0 ? l.text.slice(0, cut) : l.text;
      if (cut >= 0) out.push(mark('cm-live-comment').range(l.from + cut, l.to));
      if (!text.trim()) continue;

      // Environments that are only structure: their tags fold away.
      const tag = info.envTags.get(n);
      if (tag) {
        const label = THEOREMS[tag.env];
        if (tag.kind === 'begin' && label) {
          const m = /\\begin\{[^}]+\}(\[[^\]]*\])?/.exec(text)!;
          out.push(line('cm-live-env-head').range(l.from));
          if (onLine) out.push(MARKER.range(l.from + m.index, l.from + m.index + m[0].length));
          else out.push(Decoration.replace({ widget: new LabelWidget(`${label}${tag.title ? ` (${tag.title})` : ''}.`, tag.env === 'proof' ? 'proof' : 'theorem') }).range(l.from + m.index, l.from + m.index + m[0].length));
        } else if (tag.kind === 'end' && tag.env === 'proof' && !onLine) {
          const m = /\\end\{proof\}/.exec(text)!;
          out.push(line('cm-live-env-body cm-live-env-foot').range(l.from));
          out.push(Decoration.replace({ widget: new LabelWidget('∎', 'qed') }).range(l.from + m.index, l.from + m.index + m[0].length));
        } else {
          out.push(line(onLine ? 'cm-live-env-tag' : 'cm-live-env-tag cm-live-folded').range(l.from));
          out.push((onLine ? MARKER : mark('cm-live-folded-text')).range(l.from, l.from + text.length));
        }
        continue;
      }
      const body = info.envBody.get(n);
      if (body) out.push(line(body === 'quote' || body === 'quotation' ? 'cm-live-quote' : 'cm-live-env-body').range(l.from));

      if (PREAMBLE.test(text)) {
        out.push(line('cm-live-preamble').range(l.from));
        continue;
      }

      // Sectioning, the title block, \maketitle.
      const heading = /^(\s*)\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph|title|author|date)(\*)?\{/.exec(text);
      if (heading) {
        const open = heading[0].length - 1;
        const close = closeBrace(text, open);
        if (close > 0) {
          const kind = heading[2];
          const cls = kind === 'title' ? 'cm-live-title' : kind === 'author' || kind === 'date' ? 'cm-live-byline' : `cm-live-h cm-live-h${SECTIONS[kind]}`;
          out.push(line(cls).range(l.from));
          markup(l.from + heading[1].length, l.from + open + 1, onLine);
          markup(l.from + close, l.from + close + 1, onLine);
        }
      }
      if (/^\s*\\(maketitle|tableofcontents|newpage|clearpage|noindent)\s*$/.test(text)) {
        out.push(line(onLine ? 'cm-live-env-tag' : 'cm-live-env-tag cm-live-folded').range(l.from));
        out.push((onLine ? MARKER : mark('cm-live-folded-text')).range(l.from, l.from + text.length));
        continue;
      }

      // \item: a bullet, or the list's number.
      const item = /^(\s*)\\item\b\s?(\[[^\]]*\])?/.exec(text);
      if (item && info.items.has(n)) {
        const start = l.from + item[1].length;
        const label = info.items.get(n)!;
        out.push(line('cm-live-item').range(l.from));
        if (onLine) out.push(MARKER.range(start, l.from + item[0].length));
        else if (item[2]) {
          // A description list's term, set bold in place of `\item[…]`.
          const open = l.from + item[0].length - item[2].length;
          const close = l.from + item[0].length - 1;
          out.push(hide.range(start, open + 1));
          if (close > open + 1) out.push(mark('cm-live-strong').range(open + 1, close));
          out.push(hide.range(close, close + 1));
        } else out.push(Decoration.replace({ widget: new BulletWidget(label || '•') }).range(start, l.from + item[0].length));
      }

      // Inline maths first, so nothing inside it is read as a command.
      const taken: [number, number][] = [];
      const free = (a: number, b: number) => !taken.some(([x, y]) => a < y && b > x);
      const mathRe = /(?<!\\)\$(?!\$)((?:\\.|[^$\\])+?)\$|\\\(((?:\\.|[^\\])+?)\\\)/g;
      for (let m; (m = mathRe.exec(text));) {
        const a = l.from + m.index, b = a + m[0].length;
        taken.push([m.index, m.index + m[0].length]);
        if (touches(a, b)) {
          out.push(mark('cm-live-math-src').range(a, b));
          const open = m[1] !== undefined ? 1 : 2;
          out.push(MARKER.range(a, a + open), MARKER.range(b - open, b));
        } else {
          out.push(Decoration.replace({ widget: new MathWidget(m[1] ?? m[2], false) }).range(a, b));
        }
      }

      // Commands with one argument that is the text itself.
      const cmdRe = /\\(textbf|textit|emph|textsl|texttt|underline|textsc|textsf|textrm|footnote|url)\{/g;
      for (let m; (m = cmdRe.exec(text));) {
        const open = m.index + m[0].length - 1;
        const close = closeBrace(text, open);
        if (close < 0 || !free(m.index, close + 1)) continue;
        const a = l.from + m.index, b = l.from + close + 1;
        const shown = touches(a, b);
        const cls = m[1] === 'footnote' ? 'cm-live-footnote' : m[1] === 'url' ? 'cm-live-link' : STYLES[m[1]];
        // An empty argument — `\textbf{}`, which is exactly what typing
        // `\textbf{` produces once the brace auto-closes — has nothing to
        // style, and CodeMirror throws on an empty mark.
        if (close > open + 1) {
          if (m[1] === 'url') out.push(linkMark(text.slice(open + 1, close)).range(l.from + open + 1, l.from + close));
          else if (cls) out.push(mark(cls).range(l.from + open + 1, l.from + close));
        }
        markup(a, l.from + open + 1, shown);
        markup(l.from + close, b, shown);
      }

      // \href{url}{text}: the text, as a link.
      const hrefRe = /\\href\{/g;
      for (let m; (m = hrefRe.exec(text));) {
        const urlClose = closeBrace(text, m.index + 5);
        if (urlClose < 0 || text[urlClose + 1] !== '{') continue;
        const close = closeBrace(text, urlClose + 1);
        if (close < 0 || !free(m.index, close + 1)) continue;
        const a = l.from + m.index, b = l.from + close + 1;
        const shown = touches(a, b);
        if (close > urlClose + 2) out.push(linkMark(text.slice(m.index + 6, urlClose)).range(l.from + urlClose + 2, l.from + close));
        markup(a, l.from + urlClose + 2, shown);
        markup(l.from + close, b, shown);
      }

      // References, citations and labels, as small labels.
      const refRe = /\\(cite[pt]?|ref|eqref|autoref|cref|Cref|label|pageref)(\[[^\]]*\])?\{([^}]*)\}/g;
      for (let m; (m = refRe.exec(text));) {
        if (!free(m.index, m.index + m[0].length)) continue;
        const a = l.from + m.index, b = a + m[0].length;
        if (touches(a, b)) { out.push(mark('cm-live-ref-src').range(a, b)); continue; }
        const key = m[3];
        const kind = m[1].startsWith('cite') ? 'cite' : m[1] === 'label' ? 'label' : 'ref';
        if (kind === 'ref') {
          // Resolved, as the reader will see it: "2", "(3)", "Table 2" — or
          // "??" for a label that does not exist yet, as LaTeX itself prints.
          const target = view.state.field(labelsField, false)?.get(key.trim());
          const shown = referenceText(m[1], target);
          const tip = target ? `${target.name} ${target.number}${target.title ? ` — ${target.title}` : ''} (${key})` : `No \\label{${key}} in this document`;
          out.push(Decoration.replace({ widget: new LabelWidget(shown, target ? 'ref' : 'ref-missing', tip) }).range(a, b));
          continue;
        }
        const textOf = kind === 'cite' ? `[${key}]` : `# ${key}`;
        out.push(Decoration.replace({ widget: new LabelWidget(textOf, kind) }).range(a, b));
      }

      // ~ is a space that does not break: shown as the space it is.
      for (let i = text.indexOf('~'); i >= 0; i = text.indexOf('~', i + 1)) {
        if (i > 0 && text[i - 1] === '\\') continue;
        if (!free(i, i + 1) || touches(l.from + i, l.from + i + 1)) continue;
        out.push(mark('cm-live-tie').range(l.from + i, l.from + i + 1));
      }

      // \% \& \$ \# \_ — the character, without its backslash.
      const escRe = /\\([%&$#_{}])/g;
      for (let m; (m = escRe.exec(text));) {
        if (!free(m.index, m.index + 2)) continue;
        markup(l.from + m.index, l.from + m.index + 1, touches(l.from + m.index, l.from + m.index + 2));
      }
    }
  }
  return Decoration.set(out, true);
}

const latexInline = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = safely(() => buildInline(view), Decoration.none); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
      this.decorations = safely(() => buildInline(update.view), this.decorations.map(update.changes));
    }
  }
}, { decorations: plugin => plugin.decorations });

/** Everything live LaTeX needs, in order. */
export const latexLive = [labelsField, structure, tableSpans, mathBlocks, tableBlocks, latexInline];
