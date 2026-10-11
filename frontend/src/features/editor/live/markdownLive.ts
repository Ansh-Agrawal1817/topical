import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Range, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { MarkdownConfig } from '@lezer/markdown';
import type { SyntaxNode } from '@lezer/common';
import { BulletWidget, CheckboxWidget, ImageWidget, linkMark, MathWidget, RuleWidget, safely, TableWidget } from './widgets';
import { codeLanguage, highlightCode } from './codeHighlight';

/**
 * Live Markdown: the document as it will read, written in place.
 *
 * Headings are set as headings, emphasis as emphasis, maths as maths — and
 * the markup that makes them is hidden, except where the caret is. Put the
 * caret on a heading and its `##` comes back, greyed; move into a bold word
 * and its `**` does. Nothing is a separate preview: the text is the
 * document, and the source is one caret away.
 *
 * Two layers. A view plugin handles everything inside a line, for the lines
 * on screen only, so it costs nothing on a long document. Blocks that span
 * lines — display maths and tables — are replaced whole by widgets, which a
 * plugin may not do, so a state field handles those.
 */

/* ─────────────────────────── Maths in the grammar ─────────────────────────── */

const DOLLAR = 36;
const BACKSLASH = 92;
const SPACE = 32;

/** `$x$` and `$$x$$` inline, and `$$ … $$` as a block, added to the Markdown grammar. */
export const mathSyntax: MarkdownConfig = {
  defineNodes: [
    { name: 'InlineMath' },
    { name: 'InlineMathMark' },
    { name: 'BlockMath', block: true },
    { name: 'BlockMathMark' },
  ],
  parseInline: [{
    name: 'InlineMath',
    before: 'Emphasis',
    parse(cx, next, pos) {
      if (next !== DOLLAR) return -1;
      if (cx.char(pos + 1) === DOLLAR) {
        const close = cx.slice(pos + 2, cx.end).indexOf('$$');
        if (close < 0) return -1;
        const end = pos + 2 + close;
        return cx.addElement(cx.elt('InlineMath', pos, end + 2, [
          cx.elt('InlineMathMark', pos, pos + 2), cx.elt('InlineMathMark', end, end + 2),
        ]));
      }
      // `$5 and $6` is money, not maths: no space just inside either
      // dollar, and no digit straight after the closing one.
      if (pos + 1 >= cx.end || cx.char(pos + 1) === SPACE) return -1;
      for (let i = pos + 1; i < cx.end; i++) {
        const c = cx.char(i);
        if (c === BACKSLASH) { i++; continue; }
        if (c !== DOLLAR) continue;
        if (cx.char(i - 1) === SPACE) return -1;
        const after = cx.char(i + 1);
        if (after >= 48 && after <= 57) return -1;
        return cx.addElement(cx.elt('InlineMath', pos, i + 1, [
          cx.elt('InlineMathMark', pos, pos + 1), cx.elt('InlineMathMark', i, i + 1),
        ]));
      }
      return -1;
    },
  }],
  parseBlock: [{
    name: 'BlockMath',
    before: 'FencedCode',
    parse(cx, line) {
      if (line.next !== DOLLAR || line.text.charCodeAt(line.pos + 1) !== DOLLAR) return false;
      const start = cx.lineStart + line.pos;
      const marks = [cx.elt('BlockMathMark', start, start + 2)];
      const rest = line.text.slice(line.pos + 2);
      const closeHere = rest.lastIndexOf('$$');
      if (closeHere >= 0 && rest.trim().length > 2) {
        const at = cx.lineStart + line.pos + 2 + closeHere;
        marks.push(cx.elt('BlockMathMark', at, at + 2));
        cx.addElement(cx.elt('BlockMath', start, cx.lineStart + line.text.length, marks));
        cx.nextLine();
        return true;
      }
      let end = cx.lineStart + line.text.length;
      while (cx.nextLine()) {
        end = cx.lineStart + line.text.length;
        const close = line.text.indexOf('$$');
        if (close >= 0) {
          marks.push(cx.elt('BlockMathMark', cx.lineStart + close, cx.lineStart + close + 2));
          cx.nextLine();
          break;
        }
      }
      cx.addElement(cx.elt('BlockMath', start, end, marks));
      return true;
    },
  }],
};

/* ─────────────────────────── Where the caret is ─────────────────────────── */

/** What decides whether a construct shows its markup: the selection, while the editor has focus. */
interface Caret {
  ranges: readonly { from: number; to: number }[];
  /** Line numbers the selection touches. */
  lines: Set<number>;
}

function caretOf(state: EditorState, focused: boolean): Caret {
  if (!focused) return { ranges: [], lines: new Set() };
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) lines.add(n);
  }
  return { ranges: state.selection.ranges, lines };
}

const touches = (caret: Caret, from: number, to: number) => caret.ranges.some(r => r.from <= to && r.to >= from);

const mark = (cls: string) => Decoration.mark({ class: cls });
const line = (cls: string) => Decoration.line({ class: cls });
const hide = Decoration.replace({});
const MARKER = mark('cm-live-marker');

/* ─────────────────────────── Inline: the view plugin ─────────────────────────── */

/** Hide `node`'s markup when the caret is elsewhere; grey it when the caret is on it. */
function markup(out: Range<Decoration>[], from: number, to: number, shown: boolean) {
  if (to <= from) return;
  out.push((shown ? MARKER : hide).range(from, to));
}

function children(node: SyntaxNode, name: string) {
  const found: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) if (child.name === name) found.push(child);
  return found;
}

function buildInline(view: EditorView): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const caret = caretOf(state, view.hasFocus);
  const out: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter: ref => {
        const node = ref.node;
        const name = ref.name;
        const heading = /^ATXHeading(\d)$/.exec(name);
        if (heading) {
          const l = doc.lineAt(ref.from);
          out.push(line(`cm-live-h cm-live-h${heading[1]}`).range(l.from));
          const shown = caret.lines.has(l.number);
          for (const m of children(node, 'HeaderMark')) {
            // The space after the opening `##` goes with it.
            const end = m.from === l.from || doc.sliceString(m.to, m.to + 1) === ' ' ? Math.min(m.to + 1, l.to) : m.to;
            const to = m.from === l.from ? end : m.to;
            if (shown && m.from === l.from && to > m.from) {
              // The opening marks hang in the margin, so the title does not
              // jump sideways by their width when the caret arrives.
              out.push(Decoration.mark({
                class: 'cm-live-marker cm-live-hang',
                attributes: { style: `--hang: ${to - m.from}` },
              }).range(m.from, to));
            } else {
              markup(out, m.from, to, shown);
            }
          }
          return;
        }
        const setext = /^SetextHeading(\d)$/.exec(name);
        if (setext) {
          const first = doc.lineAt(ref.from);
          out.push(line(`cm-live-h cm-live-h${setext[1]}`).range(first.from));
          for (const m of children(node, 'HeaderMark')) {
            const l = doc.lineAt(m.from);
            out.push(line('cm-live-setext').range(l.from));
            markup(out, m.from, m.to, caret.lines.has(l.number) || caret.lines.has(first.number));
          }
          return;
        }
        switch (name) {
          case 'Emphasis':
          case 'StrongEmphasis':
          case 'Strikethrough': {
            const cls = name === 'Emphasis' ? 'cm-live-em' : name === 'StrongEmphasis' ? 'cm-live-strong' : 'cm-live-strike';
            out.push(mark(cls).range(ref.from, ref.to));
            const shown = touches(caret, ref.from, ref.to);
            for (const m of children(node, name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark')) markup(out, m.from, m.to, shown);
            return;
          }
          case 'InlineCode': {
            const marks = children(node, 'CodeMark');
            const shown = touches(caret, ref.from, ref.to);
            if (marks.length === 2) {
              if (marks[1].from > marks[0].to) out.push(mark('cm-live-code').range(marks[0].to, marks[1].from));
              markup(out, marks[0].from, marks[0].to, shown);
              markup(out, marks[1].from, marks[1].to, shown);
            }
            return false;
          }
          case 'InlineMath': {
            const marks = children(node, 'InlineMathMark');
            if (marks.length !== 2) return false;
            if (touches(caret, ref.from, ref.to)) {
              out.push(mark('cm-live-math-src').range(ref.from, ref.to));
              for (const m of marks) out.push(MARKER.range(m.from, m.to));
            } else {
              const tex = doc.sliceString(marks[0].to, marks[1].from);
              out.push(Decoration.replace({ widget: new MathWidget(tex, marks[0].to - marks[0].from === 2) }).range(ref.from, ref.to));
            }
            return false;
          }
          case 'BlockMath': {
            // Off the caret the state field replaces it whole; on it, it is source.
            if (!touches(caret, ref.from, ref.to)) return false;
            for (let n = doc.lineAt(ref.from).number; n <= doc.lineAt(ref.to).number; n++) {
              out.push(line('cm-live-math-block').range(doc.line(n).from));
            }
            for (const m of children(node, 'BlockMathMark')) out.push(MARKER.range(m.from, m.to));
            return false;
          }
          case 'Table': {
            if (!touches(caret, ref.from, ref.to)) return false;
            for (let n = doc.lineAt(ref.from).number; n <= doc.lineAt(ref.to).number; n++) {
              out.push(line('cm-live-table-src').range(doc.line(n).from));
            }
            return false;
          }
          case 'Link': {
            const shown = touches(caret, ref.from, ref.to);
            const marks = children(node, 'LinkMark');
            // `> [!NOTE]` opening a quote is a callout's kind, not a link.
            if (/^\[![A-Za-z]+\]$/.test(doc.sliceString(ref.from, ref.to)) && node.parent?.name === 'Paragraph'
              && node.parent.parent?.name === 'Blockquote') {
              out.push(mark('cm-live-callout').range(ref.from + 2, ref.to - 1));
              markup(out, ref.from, ref.from + 2, shown);
              markup(out, ref.to - 1, ref.to, shown);
              return false;
            }
            // `[` text `]` then `(` url `)`, or a reference `[` text `][` ref `]`.
            const url = children(node, 'URL')[0];
            // `[](url)` has no text to mark — and an empty mark throws.
            if (marks.length >= 2 && marks[1].from > marks[0].to) {
              out.push((url ? linkMark(doc.sliceString(url.from, url.to)) : mark('cm-live-link')).range(marks[0].to, marks[1].from));
            }
            if (marks.length >= 2) {
              markup(out, marks[0].from, marks[0].to, shown);
              markup(out, marks[1].from, ref.to, shown);
            }
            return false;
          }
          case 'Image': {
            if (touches(caret, ref.from, ref.to)) {
              out.push(mark('cm-live-marker').range(ref.from, ref.to));
              return false;
            }
            const url = children(node, 'URL')[0];
            const marks = children(node, 'LinkMark');
            const alt = marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : '';
            if (url) out.push(Decoration.replace({ widget: new ImageWidget(doc.sliceString(url.from, url.to), alt) }).range(ref.from, ref.to));
            return false;
          }
          case 'Autolink':
          case 'URL': {
            const text = doc.sliceString(ref.from, ref.to);
            out.push(linkMark(name === 'Autolink' ? text.replace(/^<|>$/g, '') : text).range(ref.from, ref.to));
            return false;
          }
          case 'Blockquote': {
            for (let n = doc.lineAt(ref.from).number; n <= doc.lineAt(ref.to).number; n++) {
              out.push(line('cm-live-quote').range(doc.line(n).from));
            }
            return;
          }
          case 'QuoteMark': {
            const l = doc.lineAt(ref.from);
            const end = doc.sliceString(ref.to, ref.to + 1) === ' ' ? ref.to + 1 : ref.to;
            markup(out, ref.from, end, caret.lines.has(l.number));
            return;
          }
          case 'ListMark': {
            const l = doc.lineAt(ref.from);
            const text = doc.sliceString(ref.from, ref.to);
            const bullet = text === '-' || text === '*' || text === '+';
            const task = node.parent?.getChild('Task');
            if (bullet && !task) {
              if (caret.lines.has(l.number)) out.push(MARKER.range(ref.from, ref.to));
              else out.push(Decoration.replace({ widget: new BulletWidget() }).range(ref.from, ref.to));
            } else if (!bullet) {
              out.push(mark('cm-live-number').range(ref.from, ref.to));
            } else {
              // A task's own bullet goes; the checkbox stands in for it.
              const end = doc.sliceString(ref.to, ref.to + 1) === ' ' ? ref.to + 1 : ref.to;
              markup(out, ref.from, end, caret.lines.has(l.number));
            }
            return;
          }
          case 'TaskMarker': {
            const l = doc.lineAt(ref.from);
            const checked = /x/i.test(doc.sliceString(ref.from, ref.to));
            if (caret.lines.has(l.number)) out.push(MARKER.range(ref.from, ref.to));
            else out.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(ref.from, ref.to));
            if (checked) out.push(line('cm-live-done').range(l.from));
            return;
          }
          case 'FencedCode': {
            const first = doc.lineAt(ref.from).number;
            const last = doc.lineAt(ref.to).number;
            const shown = touches(caret, ref.from, ref.to);
            const closed = last > first && /^\s*(```|~~~)/.test(doc.line(last).text);
            for (let n = first; n <= last; n++) {
              const fence = n === first || (n === last && closed);
              const cls = fence
                ? `cm-live-fence${shown ? '' : ' cm-live-fence--quiet'}${n === first ? ' cm-live-fence--open' : ' cm-live-fence--close'}`
                : 'cm-live-codeblock';
              out.push(line(cls).range(doc.line(n).from));
            }
            const info = children(node, 'CodeInfo')[0];
            const lang = info ? codeLanguage(doc.sliceString(info.from, info.to)) : null;
            // Off the caret the opening fence says only what language this is,
            // as the read view's block header does.
            const open = children(node, 'CodeMark')[0];
            if (!shown && open && info) {
              out.push(hide.range(open.from, open.to));
              out.push(mark('cm-live-codelang').range(info.from, info.to));
            }
            if (lang && last > first) {
              const from = doc.line(first + 1).from;
              const to = closed ? doc.line(last).from - 1 : ref.to;
              if (to > from) {
                for (const [a, b, cls] of highlightCode(lang, doc.sliceString(from, to))) {
                  out.push(mark(cls).range(from + a, from + b));
                }
              }
            }
            return false;
          }
          case 'HorizontalRule': {
            const l = doc.lineAt(ref.from);
            if (caret.lines.has(l.number)) out.push(MARKER.range(ref.from, ref.to));
            else out.push(Decoration.replace({ widget: new RuleWidget() }).range(ref.from, ref.to));
            return false;
          }
          case 'HTMLBlock':
          case 'HTMLTag':
          case 'CommentBlock':
          case 'Comment': {
            out.push(mark('cm-live-html').range(ref.from, ref.to));
            return false;
          }
          case 'Escape': {
            markup(out, ref.from, ref.from + 1, touches(caret, ref.from, ref.to));
            return false;
          }
        }
        return;
      },
    });
  }
  return Decoration.set(out, true);
}

export const markdownInline = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = safely(() => buildInline(view), Decoration.none); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged
      || syntaxTree(update.state) !== syntaxTree(update.startState)) {
      this.decorations = safely(() => buildInline(update.view), this.decorations.map(update.changes));
    }
  }
}, { decorations: plugin => plugin.decorations });

/* ─────────────────────────── Blocks: the state field ─────────────────────────── */

const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

interface BlockSpan { from: number; to: number; kind: 'math' | 'table'; source: string }

/**
 * Display maths and tables, found by a scan of the lines (fenced code
 * skipped). Only when the text changes: this used to run on every caret move
 * as well, re-reading the whole document to learn which block an arrow key
 * had landed in.
 */
function findBlocks(state: EditorState): BlockSpan[] {
  const doc = state.doc;
  const out: BlockSpan[] = [];
  let fence: string | null = null;

  for (let n = 1; n <= doc.lines; n++) {
    const l = doc.line(n);
    const text = l.text.trim();
    const fenceMark = /^(```|~~~)/.exec(text);
    if (fence) {
      if (fenceMark && text.startsWith(fence)) fence = null;
      continue;
    }
    if (fenceMark) { fence = fenceMark[1]; continue; }

    if (text.startsWith('$$')) {
      let end = n;
      const single = text.length > 4 && text.endsWith('$$');
      if (!single) {
        while (end < doc.lines && !doc.line(end + 1).text.includes('$$')) end++;
        if (end < doc.lines) end++;
      }
      const from = l.from, to = doc.line(end).to;
      const tex = doc.sliceString(from, to).trim().replace(/^\$\$/, '').replace(/\$\$\s*$/, '');
      if (tex.trim()) out.push({ from, to, kind: 'math', source: tex });
      n = end;
      continue;
    }

    if (text.includes('|') && n < doc.lines && TABLE_RULE.test(doc.line(n + 1).text) && doc.line(n + 1).text.includes('-')) {
      let end = n + 1;
      while (end < doc.lines && doc.line(end + 1).text.includes('|') && doc.line(end + 1).text.trim()) end++;
      const from = l.from, to = doc.line(end).to;
      out.push({ from, to, kind: 'table', source: doc.sliceString(from, to) });
      n = end;
    }
  }
  return out;
}

const blockSpans = StateField.define<BlockSpan[]>({
  create: findBlocks,
  update: (spans, tr) => (tr.docChanged ? findBlocks(tr.state) : spans),
});

/** Which blocks the selection is in — the only thing a caret move can change about them. */
function touchedKey(spans: BlockSpan[], state: EditorState): string {
  const sel = state.selection.ranges;
  let key = '';
  spans.forEach((span, i) => { if (sel.some(r => r.from <= span.to && r.to >= span.from)) key += `${i},`; });
  return key;
}

/** Each block replaced whole by its rendering, unless the selection is in it. */
function buildBlocks(state: EditorState): DecorationSet {
  const sel = state.selection.ranges;
  const out: Range<Decoration>[] = [];
  for (const span of state.field(blockSpans)) {
    if (sel.some(r => r.from <= span.to && r.to >= span.from)) continue;
    const widget = span.kind === 'math' ? new MathWidget(span.source, true) : new TableWidget(span.source);
    out.push(Decoration.replace({ widget, block: true }).range(span.from, span.to));
  }
  return Decoration.set(out, true);
}

const blockDecorations = StateField.define<{ key: string; set: DecorationSet }>({
  create: state => ({ key: touchedKey(state.field(blockSpans), state), set: buildBlocks(state) }),
  update(value, tr) {
    if (!tr.docChanged && !tr.selection) return value;
    const key = touchedKey(tr.state.field(blockSpans), tr.state);
    // A caret move between blocks, or within one, changes nothing drawn.
    return !tr.docChanged && key === value.key ? value : { key, set: buildBlocks(tr.state) };
  },
  provide: field => EditorView.decorations.from(field, value => value.set),
});

export const markdownBlocks = [blockSpans, blockDecorations];
