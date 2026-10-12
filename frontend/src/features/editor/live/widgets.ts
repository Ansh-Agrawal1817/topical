import { renderLatex } from '@/features/preview/latex/render';
import katex from 'katex';
import { codeSpans, mathSpans, splitTableRow } from '@/lib/markdownTables';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';

/**
 * What the live surface draws in place of source it has rendered: maths,
 * images, list bullets, checkboxes, rules, tables, labels. Each is drawn
 * only while the caret is somewhere else; put the caret in it (or click
 * it) and the source comes back.
 */

/** Clicking a rendered widget puts the caret at the start of its source. */
function revealOnClick(dom: HTMLElement, view: EditorView) {
  dom.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    const pos = view.posAtDOM(dom);
    view.dispatch({ selection: { anchor: pos } });
    view.focus();
  });
}

const floatCache = new Map<string, string>();

/**
 * A LaTeX table (`table` float or a bare `tabular`), drawn by the read view's
 * own renderer so the live page and the read view cannot disagree. Its
 * caption carries the number the document gives it — `\ref{tab:…}` resolves
 * to that same number. Clicking it returns to the source.
 */
export class FloatWidget extends WidgetType {
  constructor(readonly source: string, readonly number: number) { super(); }
  eq(other: FloatWidget) { return other.source === this.source && other.number === this.number; }
  toDOM(view: EditorView) {
    const key = `${this.number}\u0000${this.source}`;
    let html = floatCache.get(key);
    if (html === undefined) {
      html = renderLatex(this.source).html
        .replace(/(lx-caption-label">Table )1\./, `$1${this.number}.`);
      if (floatCache.size > 200) floatCache.clear();
      floatCache.set(key, html);
    }
    const el = document.createElement('div');
    el.className = 'cm-live-float lx-doc';
    el.innerHTML = html;
    revealOnClick(el, view);
    return el;
  }
  ignoreEvent() { return false; }
}

const mathCache = new Map<string, string>();

/** KaTeX's HTML for a formula, cached: the same formula re-renders on every pass otherwise. */
function renderMath(tex: string, display: boolean): string {
  const key = (display ? 'D' : 'I') + tex;
  let html = mathCache.get(key);
  if (html === undefined) {
    try {
      html = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, output: 'html' });
    } catch {
      html = `<span class="cm-math-error">${escapeHtml(tex)}</span>`;
    }
    if (mathCache.size > 800) mathCache.clear();
    mathCache.set(key, html);
  }
  return html;
}

export function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class MathWidget extends WidgetType {
  constructor(readonly tex: string, readonly display: boolean) { super(); }
  eq(other: MathWidget) { return other.tex === this.tex && other.display === this.display; }
  toDOM(view: EditorView) {
    const el = document.createElement(this.display ? 'div' : 'span');
    el.className = this.display ? 'cm-live-math cm-live-math--display' : 'cm-live-math';
    el.innerHTML = renderMath(this.tex.trim(), this.display);
    revealOnClick(el, view);
    return el;
  }
  ignoreEvent() { return false; }
}

export class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super(); }
  eq(other: ImageWidget) { return other.src === this.src && other.alt === this.alt; }
  toDOM(view: EditorView) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-live-image';
    // A pasted picture still on its way up (EditorPage's placeholder): said
    // as such, rather than requested from a URL that does not exist yet and
    // shown as a broken image.
    if (this.src.startsWith('uploading-')) {
      wrap.classList.add('cm-live-image--broken', 'cm-live-image--uploading');
      wrap.textContent = this.alt || 'Uploading…';
      revealOnClick(wrap, view);
      return wrap;
    }
    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.alt;
    img.loading = 'lazy';
    img.onerror = () => {
      wrap.classList.add('cm-live-image--broken');
      wrap.textContent = this.alt ? `Image: ${this.alt}` : 'Image could not be loaded';
    };
    wrap.appendChild(img);
    revealOnClick(wrap, view);
    return wrap;
  }
  ignoreEvent() { return false; }
}

/** A list bullet, or a number for an ordered LaTeX list. */
export class BulletWidget extends WidgetType {
  constructor(readonly label = '•') { super(); }
  eq(other: BulletWidget) { return other.label === this.label; }
  toDOM() {
    const el = document.createElement('span');
    el.className = this.label === '•' ? 'cm-live-bullet' : 'cm-live-bullet cm-live-bullet--number';
    el.textContent = this.label;
    return el;
  }
}

/** A task's checkbox; clicking it ticks the source. */
export class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) { super(); }
  eq(other: CheckboxWidget) { return other.checked === this.checked; }
  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-live-check';
    box.checked = this.checked;
    box.setAttribute('aria-label', this.checked ? 'Done' : 'To do');
    box.addEventListener('mousedown', event => event.preventDefault());
    box.addEventListener('click', event => {
      event.preventDefault();
      const pos = view.posAtDOM(box);
      // The marker is `[ ]` or `[x]`: the character inside is at pos + 1.
      const inside = view.state.sliceDoc(pos + 1, pos + 2);
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: inside === ' ' ? 'x' : ' ' } });
    });
    return box;
  }
  ignoreEvent() { return false; }
}

export class RuleWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-live-rule';
    return el;
  }
}

/** A short label drawn in place of a command: "Theorem", "[smith2020]", "§ fig:one". */
export class LabelWidget extends WidgetType {
  constructor(readonly text: string, readonly kind: string, readonly tip = '') { super(); }
  eq(other: LabelWidget) { return other.text === this.text && other.kind === this.kind && other.tip === this.tip; }
  toDOM(view: EditorView) {
    const el = document.createElement('span');
    el.className = `cm-live-label cm-live-label--${this.kind}`;
    el.textContent = this.text;
    if (this.tip) el.title = this.tip;
    revealOnClick(el, view);
    return el;
  }
  ignoreEvent() { return false; }
}

/**
 * Inline Markdown inside a table cell: enough to read, not a second renderer.
 *
 * Maths and code are lifted out first and rendered from their own source.
 * Escaping the cell first handed KaTeX `&lt;` for `<` and `&amp;` for `&`,
 * and running bold/italic over maths turned `$a*b*c$` into emphasis.
 */
function cellHtml(text: string) {
  const cell = text.trim();
  const spans = [...mathSpans(cell).map(s => ['math', ...s] as const), ...codeSpans(cell).map(s => ['code', ...s] as const)]
    .sort((a, b) => a[1] - b[1]);
  let out = '';
  let at = 0;
  const prose = (chunk: string) => escapeHtml(chunk.replace(/\\\|/g, '|'))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  for (const [kind, start, end] of spans) {
    if (start < at) continue;
    out += prose(cell.slice(at, start));
    const inner = cell.slice(start, end);
    if (kind === 'code') {
      const ticks = inner.length - inner.replace(/^`+/, '').length;
      out += `<code>${escapeHtml(inner.slice(ticks, inner.length - ticks).replace(/\\\|/g, '|'))}</code>`;
    } else {
      const fence = inner.startsWith('$$') ? 2 : 1;
      out += renderMath(inner.slice(fence, inner.length - fence), false);
    }
    at = end;
  }
  return out + prose(cell.slice(at));
}

export class TableWidget extends WidgetType {
  constructor(readonly source: string) { super(); }
  eq(other: TableWidget) { return other.source === this.source; }
  toDOM(view: EditorView) {
    const lines = this.source.split('\n').filter(line => line.trim());
    const wrap = document.createElement('div');
    wrap.className = 'cm-live-table';
    const align = splitTableRow(lines[1] ?? '').map(cell => {
      const c = cell.trim();
      return c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left';
    });
    const head = splitTableRow(lines[0] ?? '');
    const body = lines.slice(2).map(splitTableRow);
    const th = head.map((cell, i) => `<th style="text-align:${align[i] ?? 'left'}">${cellHtml(cell)}</th>`).join('');
    const rows = body.map(row => `<tr>${row.map((cell, i) => `<td style="text-align:${align[i] ?? 'left'}">${cellHtml(cell)}</td>`).join('')}</tr>`).join('');
    wrap.innerHTML = `<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
    revealOnClick(wrap, view);
    return wrap;
  }
  ignoreEvent() { return false; }
}

/** A collaborator's caret, with their name. */
export class PeerCaretWidget extends WidgetType {
  constructor(readonly name: string, readonly color: string) { super(); }
  eq(other: PeerCaretWidget) { return other.name === this.name && other.color === this.color; }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-peer-caret';
    el.style.setProperty('--peer', this.color);
    const name = document.createElement('span');
    name.className = 'cm-peer-name';
    name.textContent = this.name;
    el.appendChild(name);
    return el;
  }
}

/**
 * A link in the live page, carrying where it goes.
 *
 * The text was styled as a link and that was all — there was no way to follow
 * one without copying the URL out of the source. ⌘-click (Ctrl-click) opens it
 * now (LiveEditor), and hovering says so; a plain click still places the
 * caret, because this is a page being written, not a page being browsed.
 */
export function linkMark(href: string) {
  const url = href.trim();
  return Decoration.mark({
    class: 'cm-live-link',
    attributes: safeHref(url) ? { 'data-href': url, title: `${url}\n⌘-click to open` } : {},
  });
}

/** Only addresses that open a page or a mail client — never `javascript:` or `data:`. */
export function safeHref(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url.trim());
}

/**
 * Build a live view's decorations, keeping the last good set if building throws.
 *
 * CodeMirror answers an exception in a view plugin by switching that plugin
 * off for the rest of the session — so one unexpected piece of markup (an
 * empty `\textbf{}`, mid-typing) left the whole page as raw source until a
 * reload. A failed pass is logged and the previous rendering, mapped through
 * the edit, stands in until the next keystroke builds a good one.
 */
export function safely(build: () => DecorationSet, fallback: DecorationSet): DecorationSet {
  try {
    return build();
  } catch (error) {
    console.error('Live rendering skipped a pass:', error);
    return fallback;
  }
}

