import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { Annotation, Compartment, EditorState, Prec, Transaction, type Extension } from '@codemirror/state';
import {
  drawSelection, dropCursor, EditorView, highlightActiveLine, keymap, lineNumbers, placeholder as placeholderText,
  type KeyBinding,
} from '@codemirror/view';
import { tagHighlighter, tags } from '@lezer/highlight';
import { GFM } from '@lezer/markdown';
import type { DocFormat } from '@/lib/types';
import type { AwarenessCursor } from '@/hooks/useYjsCollab';
import { actionsFor } from '../lib/actions';
import type { SurfaceMode } from '../lib/viewOptions';
import { autoPair, continueBlock, indentLines, outdentLines, skipClosing, type EditResult, type Range } from '../lib/textOps';
import { tableEnter, tableTab } from '../lib/tables';
import { latexLanguage, latexLive } from './latexLive';
import { markdownBlocks, markdownInline, mathSyntax } from './markdownLive';
import { editorMarks, flashLine, setFinds, setPeers, setSection } from './marks';
import { safeHref } from './widgets';

/**
 * The writing surface: CodeMirror, set up to write in place.
 *
 * In live mode the document is shown as it will read — headings set as
 * headings, maths typeset, lists bulleted — with each piece of markup
 * hidden until the caret comes to it, when it shows, greyed, to be edited.
 * Source mode is the plain text, highlighted, for when the markup itself is
 * the work.
 *
 * The text is still a string owned by the screen above (and by Yjs, for
 * collaborators): edits flow out through `onChange`, and changes from
 * elsewhere — a collaborator, an outline operation, an AI edit — flow back
 * in through `value` and are applied as the smallest change that gets
 * there, so the caret and the undo history stay where the writer left them.
 */

export type { SurfaceMode } from '../lib/viewOptions';

export interface LiveEditorHandle {
  focus(): void;
  /** Take text changed elsewhere (a collaborator), now, as the smallest change — kept out of undo. */
  receive(text: string): void;
  /** The main selection. */
  selection(): Range;
  /**
   * Apply an edit computed against the current text, and put the selection
   * where it says. Focus moves to the text unless `focus: false` — a find
   * bar's Replace keeps it, so a second Enter replaces again instead of
   * typing a newline into the document.
   */
  apply(result: EditResult, options?: { focus?: boolean; scroll?: boolean }): void;
  /** Move the selection, optionally scrolling it into the middle of the view and flashing its line. */
  select(start: number, end?: number, options?: { reveal?: boolean; flash?: boolean; focus?: boolean }): void;
  /** Where a character is on screen, in viewport coordinates. */
  coordsAt(pos: number): { left: number; top: number; bottom: number } | null;
  /** The document position under a point on screen. */
  posAtCoords(x: number, y: number): number | null;
  undo(): void;
  redo(): void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelection: (selection: Range) => void;
  /** Text dropped in from outside the editor, at a document position. */
  onDropText?: (text: string, at: number) => void;
  /** Focus left the text — for popovers that only make sense while typing in it. */
  onBlur?: () => void;
  /** Image files pasted or dropped in, at a document position, to be uploaded and placed. */
  onImages?: (files: File[], at: number) => void;
  format: DocFormat;
  mode: SurfaceMode;
  fontSize: number;
  lineNumbers: boolean;
  focusMode: boolean;
  placeholder: string;
  finds?: Range[];
  activeFind?: number;
  /** Zero-based lines of the section the outline rail is pointing at. */
  sectionLines?: { from: number; to: number } | null;
  peers?: AwarenessCursor[];
  /** Overlays positioned over the surface: the slash menu, the AI chip and panel. */
  children?: ReactNode;
}

/**
 * Classes for the source view's colours, kept in the stylesheet so they
 * follow the theme. (`hl-`, so nothing collides with the app's own names.)
 */
const highlighter = tagHighlighter([
  { tag: tags.heading, class: 'hl-heading' },
  { tag: tags.strong, class: 'hl-strong' },
  { tag: tags.emphasis, class: 'hl-em' },
  { tag: tags.strikethrough, class: 'hl-strike' },
  { tag: [tags.link, tags.url], class: 'hl-link' },
  { tag: tags.monospace, class: 'hl-code' },
  { tag: tags.quote, class: 'hl-quote' },
  { tag: [tags.processingInstruction, tags.meta, tags.bracket], class: 'hl-mark' },
  { tag: tags.keyword, class: 'hl-command' },
  { tag: [tags.string, tags.atom], class: 'hl-math' },
  { tag: tags.comment, class: 'hl-comment' },
  { tag: [tags.angleBracket, tags.tagName, tags.attributeName], class: 'hl-tag' },
]);

/** The image files in a paste or a drop, if any. */
function imagesIn(files: FileList | null | undefined): File[] {
  return Array.from(files ?? []).filter(file => file.type.startsWith('image/'));
}

/** Marks a transaction as coming from outside — not the writer typing here. */
const external = Annotation.define<boolean>();

/** The smallest change that turns `a` into `b`. */
function changeBetween(a: string, b: string) {
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) { endA--; endB--; }
  return { from: start, to: endA, insert: b.slice(start, endB) };
}

/** Apply a whole-document edit as the change it really is, selection included. */
function applyResult(view: EditorView, result: EditResult, userEvent = 'input', scroll = true) {
  const current = view.state.doc.toString();
  const change = changeBetween(current, result.content);
  const size = result.content.length;
  view.dispatch({
    changes: change.from === change.to && !change.insert ? undefined : change,
    selection: { anchor: Math.min(result.start, size), head: Math.min(result.end, size) },
    scrollIntoView: scroll,
    userEvent,
  });
}

/** Text from elsewhere, applied as the smallest change, outside the writer's undo history. */
function receiveText(view: EditorView, text: string) {
  const current = view.state.doc.toString();
  if (text === current) return;
  view.dispatch({
    changes: changeBetween(current, text),
    annotations: [external.of(true), Transaction.addToHistory.of(false)],
  });
}

function languageFor(format: DocFormat): Extension {
  return format === 'latex' ? latexLanguage : markdown({ base: markdownLanguage, extensions: [GFM, mathSyntax] });
}

function liveFor(format: DocFormat, mode: SurfaceMode): Extension {
  if (mode !== 'live') return [];
  return format === 'latex' ? latexLive : [markdownInline, markdownBlocks];
}

/** The format's own shortcuts — ⌘B, ⌘I, ⌘1… — plus Tab, Shift-Tab and list-continuing Enter. */
function formatKeys(format: DocFormat): Extension {
  const run = (fn: (doc: string, sel: Range) => EditResult | null) => (view: EditorView) => {
    const main = view.state.selection.main;
    const result = fn(view.state.doc.toString(), { start: main.from, end: main.to });
    if (!result) return false;
    applyResult(view, result);
    return true;
  };
  const bindings: KeyBinding[] = actionsFor(format)
    .filter(action => action.key)
    .map(action => ({ key: `Mod-${action.shift ? 'Shift-' : ''}${action.key}`, run: run(action.apply), preventDefault: true }));
  // In a Markdown table, Tab and Enter move between cells (lib/tables);
  // everywhere else they indent and continue lists as before.
  const table = format === 'mdx';
  bindings.push(
    { key: 'Tab', run: run((doc, sel) => (table && tableTab(doc, sel, 1)) || indentLines(doc, sel)) },
    { key: 'Shift-Tab', run: run((doc, sel) => (table && tableTab(doc, sel, -1)) || outdentLines(doc, sel)) },
    { key: 'Enter', run: run((doc, sel) => (table && tableEnter(doc, sel)) || (sel.start === sel.end ? continueBlock(doc, sel.start, format) : null)) },
  );
  return Prec.high(keymap.of(bindings));
}

/** Brackets and dollars typed in pairs, and typed over when the closing half is already there. */
const PAIRED = new Set(['(', ')', '[', ']', '{', '}', '"', '`', '$']);

const pairs = EditorView.inputHandler.of((view, from, to, text) => {
  // Every other character is plain typing: bail before copying the document
  // out to a string, which this did on every keystroke.
  if (text.length !== 1 || view.composing || !PAIRED.has(text)) return false;
  const main = view.state.selection.main;
  if (main.from !== from || main.to !== to) return false;
  const doc = view.state.doc.toString();
  if (skipClosing(doc, { start: from, end: to }, text)) {
    view.dispatch({ selection: { anchor: from + 1 }, userEvent: 'input.type' });
    return true;
  }
  const paired = autoPair(doc, { start: from, end: to }, text);
  if (!paired) return false;
  applyResult(view, paired, 'input.type');
  return true;
});

/*
 * The default keymap, less the bindings this screen gives other meanings:
 * ⌘/ opens the shortcut sheet (CodeMirror would toggle a comment), and ⌘I is
 * italic (it would select the parent syntax node).
 */
const baseKeys = keymap.of([
  ...defaultKeymap.filter(binding => binding.key !== 'Mod-/' && binding.key !== 'Mod-i' && binding.key !== 'Mod-Alt-['),
  ...historyKeymap,
]);

const structure = EditorView.theme({
  '&': { height: '100%' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit', lineHeight: 'inherit' },
});

export const LiveEditor = forwardRef<LiveEditorHandle, Props>(function LiveEditor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartments = useRef({
    language: new Compartment(),
    live: new Compartment(),
    keys: new Compartment(),
    gutter: new Compartment(),
    hint: new Compartment(),
  });
  // The newest callbacks, read by the editor's listeners without rebuilding it.
  const live = useRef(props);
  live.current = props;
  /** The last few values this editor sent out, so their echo coming back as `value` is not mistaken for news. */
  const sent = useRef<string[]>([]);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const c = compartments.current;
    const { value, format, mode, lineNumbers: numbers, placeholder } = live.current;
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          dropCursor(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          structure,
          c.language.of(languageFor(format)),
          syntaxHighlighting(highlighter),
          c.live.of(liveFor(format, mode)),
          c.keys.of(formatKeys(format)),
          pairs,
          baseKeys,
          c.gutter.of(mode === 'source' && numbers ? lineNumbers() : []),
          c.hint.of(placeholderText(placeholder)),
          editorMarks,
          EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'on', autocapitalize: 'sentences', 'aria-label': 'Document' }),
          EditorView.updateListener.of(update => {
            const p = live.current;
            if (update.docChanged && !update.transactions.some(tr => tr.annotation(external))) {
              const text = update.state.doc.toString();
              sent.current = [text, ...sent.current].slice(0, 8);
              p.onChange(text);
            }
            if (update.selectionSet || update.docChanged || update.focusChanged) {
              const main = update.state.selection.main;
              p.onSelection({ start: main.from, end: main.to });
            }
            if (update.focusChanged && !update.view.hasFocus) p.onBlur?.();
          }),
          EditorView.domEventHandlers({
            // ⌘-click (Ctrl-click) follows a link; a plain click edits it.
            mousedown: event => {
              if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false;
              const link = (event.target as HTMLElement).closest<HTMLElement>('.cm-live-link[data-href]');
              const href = link?.dataset.href;
              if (!href || !safeHref(href)) return false;
              event.preventDefault();
              window.open(href, '_blank', 'noopener,noreferrer');
              return true;
            },
            dragstart: (_event, v) => { (v.dom as HTMLElement).dataset.dragging = 'true'; return false; },
            dragend: (_event, v) => { delete (v.dom as HTMLElement).dataset.dragging; return false; },
            paste: (event, v) => {
              const data = event.clipboardData;
              if (!data) return false;
              // A screenshot or a copied picture: uploaded and placed, like
              // the toolbar's image button, without a dialog in between.
              const images = imagesIn(data.files);
              if (images.length && live.current.onImages) {
                event.preventDefault();
                live.current.onImages(images, v.state.selection.main.head);
                return true;
              }
              // A link pasted over selected words makes those words the link.
              const main = v.state.selection.main;
              const pasted = data.getData('text/plain').trim();
              if (!main.empty && safeHref(pasted) && !/\s/.test(pasted)) {
                const words = v.state.sliceDoc(main.from, main.to);
                if (words.includes('\n')) return false;
                event.preventDefault();
                const link = live.current.format === 'latex' ? `\\href{${pasted}}{${words}}` : `[${words}](${pasted})`;
                v.dispatch({
                  changes: { from: main.from, to: main.to, insert: link },
                  selection: { anchor: main.from + link.length },
                  userEvent: 'input.paste',
                });
                return true;
              }
              return false;
            },
            drop: (event, v) => {
              // Dragging within the document is CodeMirror's own move; only
              // text from outside goes through the screen's drop handler.
              if ((v.dom as HTMLElement).dataset.dragging) return false;
              const images = imagesIn(event.dataTransfer?.files);
              if (images.length && live.current.onImages) {
                const at = v.posAtCoords({ x: event.clientX, y: event.clientY }) ?? v.state.selection.main.head;
                event.preventDefault();
                live.current.onImages(images, at);
                return true;
              }
              const text = event.dataTransfer?.getData('text/plain');
              const handler = live.current.onDropText;
              if (!text || !handler) return false;
              const at = v.posAtCoords({ x: event.clientX, y: event.clientY });
              if (at == null) return false;
              event.preventDefault();
              handler(text, at);
              return true;
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The view is built once; everything after is reconfiguration.
  }, []);

  // ── Text from outside ──────────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view || sent.current.includes(props.value)) return;
    receiveText(view, props.value);
  }, [props.value]);

  // ── Configuration ─────────────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const c = compartments.current;
    view.dispatch({
      effects: [
        c.language.reconfigure(languageFor(props.format)),
        c.live.reconfigure(liveFor(props.format, props.mode)),
        c.keys.reconfigure(formatKeys(props.format)),
        c.gutter.reconfigure(props.mode === 'source' && props.lineNumbers ? lineNumbers() : []),
      ],
    });
  }, [props.format, props.mode, props.lineNumbers]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.hint.reconfigure(placeholderText(props.placeholder)) });
  }, [props.placeholder]);

  // ── Marks from the screen ─────────────────────────────────────────────
  const { finds, activeFind = -1, sectionLines = null, peers } = props;
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setFinds.of({ matches: finds ?? [], current: activeFind }) });
  }, [finds, activeFind]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setSection.of(sectionLines) });
  }, [sectionLines]);

  useEffect(() => {
    const marks = (peers ?? [])
      .filter(peer => peer.cursor)
      .map(peer => ({ id: peer.clientId, name: peer.user.name, color: peer.user.color, index: peer.cursor!.index, length: peer.cursor!.length }));
    viewRef.current?.dispatch({ effects: setPeers.of(marks) });
  }, [peers]);

  // ── What the screen can ask of it ─────────────────────────────────────
  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    receive: text => { if (viewRef.current) receiveText(viewRef.current, text); },
    selection: () => {
      const main = viewRef.current?.state.selection.main;
      return main ? { start: main.from, end: main.to } : { start: 0, end: 0 };
    },
    apply: (result, options = {}) => {
      const view = viewRef.current;
      if (!view) return;
      applyResult(view, result, 'input', options.scroll !== false);
      if (options.focus !== false) view.focus();
    },
    select: (start, end = start, options = {}) => {
      const view = viewRef.current;
      if (!view) return;
      const size = view.state.doc.length;
      const anchor = Math.min(start, size), head = Math.min(end, size);
      view.dispatch({
        selection: { anchor, head },
        effects: [
          ...(options.reveal ? [EditorView.scrollIntoView(head, { y: 'center' })] : []),
          ...(options.flash ? [flashLine.of(head)] : []),
        ],
      });
      if (options.focus !== false) view.focus();
      if (options.flash) window.setTimeout(() => viewRef.current?.dispatch({ effects: flashLine.of(null) }), 1200);
    },
    coordsAt: pos => {
      const view = viewRef.current;
      if (!view) return null;
      const rect = view.coordsAtPos(Math.min(pos, view.state.doc.length));
      return rect ? { left: rect.left, top: rect.top, bottom: rect.bottom } : null;
    },
    posAtCoords: (x, y) => viewRef.current?.posAtCoords({ x, y }) ?? null,
    undo: () => { const view = viewRef.current; if (view) { undo(view); view.focus(); } },
    redo: () => { const view = viewRef.current; if (view) { redo(view); view.focus(); } },
  }), []);

  return (
    <div
      className="live-surface"
      data-mode={props.mode}
      data-format={props.format}
      data-focus={props.focusMode}
      style={{ ['--live-size' as string]: `${props.fontSize}px` }}
    >
      <div className="live-host" ref={host} />
      {props.children}
    </div>
  );
});
