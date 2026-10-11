import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { useCompactEditor } from '@/hooks/useMediaQuery';
import type { LessonPlanResponse } from '@/lib/api';
import { documentShareUrl } from '@/lib/documentUrl';
import { uploadFile } from '@/lib/api';
import { useDocument } from './hooks/useDocument';
import { useFindReplace } from './hooks/useFindReplace';
import { EditorHeader } from './components/EditorHeader';
import { Toolbar } from './components/Toolbar';
import { ShortcutsSheet } from './components/ShortcutsSheet';
import { PreviewPane } from './components/PreviewPane';
import { OutlineRail } from './components/OutlineRail';
import { StatusBar } from './components/StatusBar';
import { FindBar } from './components/FindBar';
import { SlashMenu, type SlashCommand } from './components/SlashMenu';
import { PenLine, Sparkles } from 'lucide-react';
import { AiPanel, type AiFocus, type AiRequest } from './ai/AiPanel';
import { docStyleAttrs, pdfFromDocStyle, useDocStyle } from './lib/docStyle';
import { useTheme } from '@/lib/theme';
import { createAiQueue } from './ai/queue';
import { useContextShelf } from './ai/shelf';
import { CoAuthorsDialog } from './components/CoAuthorsDialog';
import { ImageDialog } from './components/ImageDialog';
import { LiveEditor, type LiveEditorHandle, type SurfaceMode } from './live/LiveEditor';
import { activeNode, buildOutline, type OutlineNode } from './lib/outline';
import { indexOutline, sectionWords, subtreeSpan } from './lib/tree';
import { useSectionWriter } from './hooks/useSectionWriter';
import { proseSample } from './lib/stats';
import {
  addSectionAfter, applyOutline, dropSection, moveSectionTo, placeSection,
  renameSection, shiftSection,
} from './lib/sections';
import { countWords, documentStats } from './lib/stats';
import { afterBlock, caretPosition, insertBlock, lineAt, separatorFor, type EditResult, type Range } from './lib/textOps';
import { LATEX_PREFIX, type DocFormat } from '@/lib/types';
import type { EditorAction } from './lib/actions';
import { copyText, downloadSource, printPreview, wrapLatexDocument } from './lib/exporters';
import { ExportPdfDialog } from './components/ExportPdfDialog';
import { loadOptions, saveOptions, type ViewOptions } from './lib/viewOptions';

export interface DocumentViewProps {
  /** The document, already loaded and access-checked by the route. */
  plan: LessonPlanResponse;
  /**
   * Whether this viewer owns the document.
   *
   * From the server, not inferred. This used to be decided with
   * `!authorUsername || authorUsername === currentUsername` — which reads
   * "nobody is named as the author, so it must be me". A document whose owner
   * has not set a username has no `authorUsername`, so every co-author on it
   * was treated as the owner: shown "by you" in the byline, and offered the
   * control that manages who else can edit.
   */
  isOwner: boolean;
  /** Whether the writing surface is live, or this is read mode. */
  editing: boolean;
  /** Switch between read mode and writing, in place. Absent for a viewer who may only read. */
  onMode?: (mode: 'read' | 'write') => void;
  /** Out to the projects list. */
  onBack: () => void;
}

/**
 * The document screen — reading and writing are two modes of it, not two
 * screens.
 *
 * Writing happens on one surface, in place: the live editor shows the
 * document as it will read and reveals the markup only where the caret is,
 * so there is no second pane to read a rendering in and no scrolling two
 * views against each other. Reading — for anyone who may not write — is the
 * fully typeset document, with LaTeX's numbering, references and
 * bibliography resolved.
 *
 * Composition only: the document lives in `useDocument`, text operations in
 * `lib/textOps`, the surface in `live/`, and each region of the screen in
 * its own component.
 */
export function DocumentView({ plan, isOwner, editing, onMode, onBack }: DocumentViewProps) {
  const { user } = useAuth();
  const doc = useDocument(user?.username || user?.given_name || 'Anonymous', plan, editing);

  const editorRef = useRef<LiveEditorHandle>(null);
  const contentRef = useRef('');
  const surfaceRef = useRef<HTMLDivElement>(null);

  /** Below ~900px the outline rail becomes a drawer and the header narrows. */
  const compact = useCompactEditor();
  const [showPdf, setShowPdf] = useState(false);
  /** The rendered document, mounted off-screen only while it is being printed. */
  const [printing, setPrinting] = useState(false);
  // Read before the first paint, not in an effect after it: the effect
  // version painted the defaults first, then reconfigured the editor and
  // toggled the panels into place a frame later.
  const [options, setOptions] = useState<ViewOptions>(loadOptions);
  /** The outline rail, open over the document rather than beside it. */
  const [railOpen, setRailOpen] = useState(false);
  const [selection, setSelection] = useState<Range>({ start: 0, end: 0 });
  const caret = selection.end;
  const [slash, setSlash] = useState<{ start: number; query: string } | null>(null);
  const slashOpen = useRef(false);
  slashOpen.current = slash !== null;
  /**
   * The AI that acts on this document: one queue every request runs through
   * (sections and edits alike, one at a time, retrying on rate limits), and
   * the context shelf they are grounded in.
   */
  const queue = useMemo(() => createAiQueue(), []);
  useEffect(() => () => queue.dispose(), [queue]);
  const shelf = useContextShelf(String(plan.id || 'local'));
  /** This document's page, accent and font — re-scoped tokens on the surface. */
  const [docStyle, setDocStyle] = useDocStyle(String(plan.id || 'local'));
  const appTheme = useTheme();
  const styleAttrs = docStyleAttrs(docStyle, appTheme === 'dark');
  const shelfUrlsRef = useRef<string[]>([]);
  shelfUrlsRef.current = shelf.urls;
  /** The AI panel as a drawer, in the compact layout (wide, it is `options.ai`). */
  const [aiDrawer, setAiDrawer] = useState(false);
  const [aiFocus, setAiFocus] = useState(0);
  const [aiRequest, setAiRequest] = useState<AiRequest | undefined>(undefined);
  const [showShare, setShowShare] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // The palette can reach the shortcut sheet, which only the editor owns.
  useEffect(() => {
    if (!editing) return;
    const open = () => setShowShortcuts(true);
    window.addEventListener('topical:shortcuts', open);
    return () => window.removeEventListener('topical:shortcuts', open);
  }, [editing]);

  /**
   * The heading of the section the outline rail is acting on.
   *
   * Reshaping a row used to change the document with nothing on screen
   * connecting the row to the text it stands for — the writer indented a
   * heading in the rail and had to go looking for what had moved. Holding the
   * offset here lets the surface mark the section instead.
   */
  const [focusOffset, setFocusOffset] = useState<number | null>(null);

  useEffect(() => { contentRef.current = doc.content; }, [doc.content]);

  // Collaborators' edits go straight onto the surface (see useDocument).
  const { bindSurface } = doc;
  useEffect(() => {
    bindSurface(text => {
      contentRef.current = text;
      editorRef.current?.receive(text);
    });
    return () => bindSurface(null);
  }, [bindSurface]);

  // A drawer that stays open across a route change would cover the next
  // document; closing it when the layout stops being compact is the same idea.
  useEffect(() => { if (!compact) setRailOpen(false); }, [compact]);

  /**
   * One control, two meanings — because the rail is two different things.
   *
   * Wide, it is a column of the layout and whether it is there is a stored
   * preference. Narrow, it is a drawer over the document, and "leave it open"
   * is not a preference anyone wants remembered: it would cover the writing
   * surface on every document they opened afterwards.
   */
  const toggleOutline = useCallback(() => {
    if (compact) setRailOpen(open => !open);
    else setOptions(prev => {
      const next = { ...prev, outline: !prev.outline };
      saveOptions(next);
      return next;
    });
  }, [compact]);
  const updateOptions = useCallback((patch: Partial<ViewOptions>) => {
    setOptions(prev => {
      const next = { ...prev, ...patch };
      saveOptions(next);
      return next;
    });
  }, []);

  // ── Editing ────────────────────────────────────────────────────────────
  /** Apply an edit computed against the newest text, and put the selection where it says. */
  const apply = useCallback((result: EditResult) => {
    contentRef.current = result.content;
    editorRef.current?.apply(result);
  }, []);

  const currentSelection = useCallback((): Range => editorRef.current?.selection() ?? selection, [selection]);

  const runAction = useCallback((action: EditorAction) => {
    apply(action.apply(contentRef.current, currentSelection()));
  }, [apply, currentSelection]);

  // ── Selection tracking ──────────────────────────────────────────────────
  const onSelection = useCallback((next: Range) => {
    setSelection(prev => (prev.start === next.start && prev.end === next.end ? prev : next));
    // The slash menu belongs to the "/word" being typed: a click or an arrow
    // key that takes the caret out of it closes the menu, which otherwise sat
    // open over the page catching every Enter and arrow key.
    setSlash(open => (open && (next.start !== next.end || next.end <= open.start || next.end > open.start + 1 + open.query.length)
      ? null : open));
    // The editor's caret is unreliable mid-remote-update, and reporting it
    // then would jump every collaborator's cursor to the wrong place.
    if (!doc.isRemoteUpdate.current) doc.updateCursor(next.start, next.end - next.start);
  }, [doc]);

  // ── Derived views of the document ───────────────────────────────────────
  /*
   * The text as the rest of the screen sees it — one step behind the surface.
   *
   * The outline, the word counts and the status bar are all whole-document
   * scans, and on a long draft they cost more per keystroke than the editor
   * itself: measured on a 13,000-word document, every key spent ~20ms
   * counting words before the next frame could paint. Deferring them lets
   * React paint the keystroke first and fold these in when it has the time;
   * a burst of typing collapses into one recount at the end of it.
   */
  const settled = useDeferredValue(doc.content);
  const outline = useMemo(() => buildOutline(settled, doc.format), [settled, doc.format]);
  const stats = useMemo(() => documentStats(settled, doc.format), [settled, doc.format]);
  const position = useMemo(() => caretPosition(doc.content, caret), [doc.content, caret]);
  const tree = useMemo(() => indexOutline(outline), [outline]);
  /** Words behind every heading — its own prose, and its whole subtree. One pass, shared by the rail and the writer. */
  const words = useMemo(() => sectionWords(tree, settled, doc.format), [tree, settled, doc.format]);
  /**
   * The heading the caret is inside, as an id.
   *
   * This used to be resolved to a *label* and the rail compared titles, so a
   * document with more than one section of the same name showed every one of
   * them as the current section at once.
   */
  const activeId = useMemo(() => activeNode(outline, caret), [caret, outline]);

  /** The heading and everything nested under it — what one rail row stands for. */
  const focusSpan = useMemo(() => {
    if (focusOffset === null) return null;
    const index = tree.byOffset.get(focusOffset);
    return index === undefined ? null : subtreeSpan(tree, index, settled.length);
  }, [settled.length, focusOffset, tree]);

  /** The same span as source lines, which is what the surface marks. */
  const focusLines = useMemo(() => {
    if (!focusSpan) return null;
    return {
      from: lineAt(settled, focusSpan.start).number,
      to: lineAt(settled, Math.max(focusSpan.start, focusSpan.end - 1)).number,
    };
  }, [settled, focusSpan]);

  /*
   * The mark follows the caret out of the section, and no further.
   *
   * Clearing it on any keystroke would drop it the moment the writer started
   * working in the section they had just gone to, which is the one time it is
   * useful; clearing it never would leave a stale highlight behind on the
   * previous section. Leaving the span is the event that actually means "I am
   * somewhere else now".
   */
  useEffect(() => {
    if (focusOffset === null) return;
    if (!focusSpan || caret < focusSpan.start || caret > focusSpan.end) setFocusOffset(null);
  }, [caret, focusOffset, focusSpan]);

  const selectedWords = useMemo(
    () => (selection.end > selection.start ? countWords(doc.content.slice(selection.start, selection.end), doc.format) : 0),
    [doc.content, doc.format, selection],
  );

  /** Move the caret to `offset`, bring it into the middle of the view, and flash its line. */
  const revealOffset = useCallback((offset: number, end = offset) => {
    editorRef.current?.select(offset, end, { reveal: true, flash: true });
  }, []);

  /**
   * Go to a section and mark it, so the row that was clicked and the text it
   * stands for are visibly the same thing.
   *
   * The mark is a highlight rather than a text selection on purpose: selecting
   * a whole section puts the writer one keystroke away from replacing it, and
   * pops the inline-AI chip over the very text they came here to read.
   */
  const goToSection = useCallback((node: OutlineNode) => {
    setFocusOffset(node.offset);
    revealOffset(node.offset);
    // As a drawer, the panel the jump came from covers the place it went to.
    if (compact) { setRailOpen(false); setAiDrawer(false); }
  }, [compact, revealOffset]);

  const find = useFindReplace({
    content: doc.content,
    caret: () => editorRef.current?.selection().start ?? 0,
    // Both keep focus in the find bar: the writer is driving from there.
    onReplace: (next, at) => {
      contentRef.current = next;
      editorRef.current?.apply({ content: next, ...at }, { focus: false });
    },
    onFocusMatch: match => editorRef.current?.select(match.start, match.end, { reveal: true, focus: false }),
  });
  /** Closing the bar hands the writer back to the text, on the match they found. */
  const findDone = useCallback(() => editorRef.current?.focus(), []);

  // ── Section-level edits ─────────────────────────────────────────────────
  /**
   * Run one of `lib/sections`' operations against the newest text.
   *
   * Every structural edit shares the same two rules, and they are stated here
   * rather than at each call site: read the document through `contentRef`, and
   * apply the result only when the operation found something to change (they
   * return null when the heading isn't there). The first rule is the one that
   * matters — "generate all sections" runs many of these without this
   * component re-rendering in between, so an operation reading the `doc.content`
   * closure would work once and then silently edit stale text.
   */
  const editSections = useCallback(
    <Args extends unknown[], Result extends EditResult | null>(
      operation: (content: string, format: DocFormat, ...args: Args) => Result,
      ...args: Args
    ): Result => {
      const result = operation(contentRef.current, doc.format, ...args);
      // Focus stays where the writer is working. These run from the rail's
      // keys and buttons and from AI jobs landing in the background; taking
      // focus into the text pulled the writer out of the rail mid-gesture —
      // the next ⌥↓ then moved a line of prose instead of a section — and out
      // of the AI panel's field mid-sentence.
      if (result) {
        contentRef.current = result.content;
        editorRef.current?.apply(result, { focus: false });
      }
      return result;
    },
    [doc.format],
  );

  /** File a generated section under its own heading, or append it. */
  const insertSection = useCallback((text: string, title: string, replace = false, near?: number) => {
    editSections(placeSection, title, text, replace, near);
  }, [editSections]);

  /**
   * Section writing, shared by the outline rail (each row's ✨) and the AI
   * panel's Write tab (the batch, and every section on its own). One writer,
   * so both show the same jobs and the same per-row state.
   */
  const wordsOf = useCallback((node: OutlineNode) => words.own.get(node.offset) ?? 0, [words]);
  const writer = useSectionWriter({
    format: doc.format,
    projectName: doc.name,
    tree,
    wordsOf,
    onInsertSection: insertSection,
    onFocusSection: node => setFocusOffset(node.offset),
    styleSample: () => proseSample(contentRef.current, doc.format),
    readContent: () => contentRef.current,
    readUrls: () => shelfUrlsRef.current,
    queue,
  });

  /** Remove a section and everything nested under it. By offset: two sections may share a title. */
  const deleteSection = useCallback((offset: number) => {
    editSections(dropSection, offset);
  }, [editSections]);

  /*
   * The outline rail's structural edits, applied to the document itself.
   *
   * The rail renders the document's headings rather than a copy of them, so
   * reshaping the outline *is* editing the page. There is no second structure
   * to reconcile, which is the only way the two stay in step under arbitrary
   * editing — including edits typed straight into the text.
   */
  const renameHeading = useCallback((offset: number, next: string) => {
    editSections(renameSection, offset, next);
  }, [editSections]);

  const shiftHeading = useCallback((offset: number, delta: 1 | -1) => {
    editSections(shiftSection, offset, delta);
  }, [editSections]);

  const moveHeading = useCallback((offset: number, target: number, edge: 'top' | 'bottom') => {
    editSections(moveSectionTo, offset, target, edge);
  }, [editSections]);

  /** Returns where the new heading landed, so the rail can open it to type in. */
  const addHeading = useCallback(
    (afterOffset: number | null) => editSections(addSectionAfter, afterOffset).headingOffset,
    [editSections],
  );

  /**
   * Rewrite the document so its headings match a proposed outline.
   *
   * Sections the proposal leaves out keep their prose and are moved to the end
   * rather than deleted — the writer is told how many, and can remove them
   * deliberately.
   */
  const applyProposedOutline = useCallback((proposal: { title: string; level: number }[]) => {
    const { result, orphans } = applyOutline(contentRef.current, doc.format, proposal);
    apply(result);
    if (orphans.length) {
      toast.info(
        `Structure updated — ${orphans.length} section${orphans.length === 1 ? '' : 's'} not in the outline moved to the end`,
        { description: orphans.slice(0, 4).join(', ') },
      );
    } else {
      toast.success('Structure updated');
    }
  }, [apply, doc.format]);

  /**
   * Put a refined passage back where it came from.
   *
   * The edit was reviewed in the AI tab while the document stayed editable,
   * so the passage may have moved: it is found again by its text near where
   * it was, and an edit whose passage is gone is inserted rather than
   * overwriting whatever now sits at the old offsets.
   */
  const replacePassage = useCallback((range: { start: number; end: number }, passage: string, text: string) => {
    const now = contentRef.current;
    let start = now.slice(range.start, range.end) === passage ? range.start : -1;
    if (start < 0) {
      const hits: number[] = [];
      for (let i = now.indexOf(passage); i >= 0; i = now.indexOf(passage, i + 1)) hits.push(i);
      start = hits.sort((a, b) => Math.abs(a - range.start) - Math.abs(b - range.start))[0] ?? -1;
    }
    if (start < 0) {
      toast.info('That passage has changed since — the edit was added below instead.');
      apply(insertBlock(now, text, afterBlock(now, range.end), separatorFor(doc.format)));
      return;
    }
    apply({ content: now.slice(0, start) + text + now.slice(start + passage.length), start, end: start + text.length });
  }, [apply, doc.format]);

  /*
   * The rail's own handlers, held stable so the rail — memoised — re-renders
   * when the outline or the counts change and not on every keystroke's
   * render of this screen.
   */
  const setOutlineWidth = useCallback((next: number) => updateOptions({ outlineWidth: next }), [updateOptions]);
  const closeRail = useCallback(
    () => (compact ? setRailOpen(false) : updateOptions({ outline: false })),
    [compact, updateOptions],
  );
  const focusSection = useCallback((node: OutlineNode | null) => setFocusOffset(node ? node.offset : null), []);

  /** Open or close the AI panel: a column when wide (remembered), a drawer when compact. */
  const setAiOpen = useCallback((open: boolean) => {
    // A request is for the panel it was made to: one left over would replay
    // on the next open — back to its tab, or its section re-sent to Write.
    if (!open) setAiRequest(undefined);
    if (compact) { setAiDrawer(open); if (open) setRailOpen(false); return; }
    setOptions(prev => {
      if (prev.ai === open) return prev;
      const next = { ...prev, ai: open };
      saveOptions(next);
      return next;
    });
  }, [compact]);
  const aiOpen = compact ? aiDrawer : options.ai;

  /** Open the AI panel on a tab — Refine's field for ⌘J — on the queue, or on Write with one section. */
  const openAi = useCallback((focus: AiFocus = 'refine', section?: OutlineNode) => {
    setAiOpen(true);
    setAiRequest({ focus, at: Date.now(), section });
    if (focus === 'refine') setAiFocus(n => n + 1);
  }, [setAiOpen]);

  // ── Popover anchoring ───────────────────────────────────────────────────
  /**
   * The line at `offset`, in the surface's own coordinates.
   *
   * The caller decides above or below, because only the caller knows how tall
   * it is.
   */
  const anchorForOffset = useCallback((offset: number) => {
    const surface = surfaceRef.current;
    const at = editorRef.current?.coordsAt(offset);
    if (!surface || !at) return null;
    const box = surface.getBoundingClientRect();
    return {
      x: at.left - box.left,
      lineTop: at.top - box.top,
      lineBottom: at.bottom - box.top,
      boxWidth: box.width,
      boxHeight: box.height,
    };
  }, []);

  // ── Editing surface events ──────────────────────────────────────────────
  const handleChange = useCallback((value: string) => {
    contentRef.current = value;
    doc.setContent(value);
    // `/` at the start of a word opens the insert menu, and keeps filtering
    // until whitespace ends the token.
    const at = editorRef.current?.selection().end ?? value.length;
    const trigger = /(?:^|\s)\/([\w-]*)$/.exec(value.slice(Math.max(0, at - 40), at));
    setSlash(trigger ? { start: at - trigger[1].length - 1, query: trigger[1] } : null);
  }, [doc]);

  const runSlashAction = useCallback((action: EditorAction) => {
    if (!slash) return;
    const at = editorRef.current?.selection().end ?? slash.start;
    // Drop the "/query" the user typed, then apply the action there.
    const stripped = contentRef.current.slice(0, slash.start) + contentRef.current.slice(at);
    setSlash(null);
    apply(action.apply(stripped, { start: slash.start, end: slash.start }));
  }, [apply, slash]);

  const closeSlash = useCallback(() => setSlash(null), []);

  /*
   * The AI, from the `/` menu — where the writer already is when they want
   * help, rather than across the screen in a panel. "Write this section" is
   * offered only for a section with nothing in it yet: it fills a heading,
   * and on one with prose it would replace the writer's words.
   */
  const caretSection = useMemo(() => tree.nodes.find(node => node.id === activeId) ?? null, [activeId, tree]);
  const slashCommands = useMemo<SlashCommand[]>(() => {
    const out: SlashCommand[] = [
      { id: 'ask-ai', label: 'Ask AI…', group: 'AI', icon: Sparkles, terms: 'ai assistant write help instruction', hint: '⌘J' },
    ];
    // At most one word: the "/query" being typed is itself counted as one.
    if (caretSection && wordsOf(caretSection) <= 1) {
      out.push({ id: 'write-section', label: `Write “${caretSection.label}” with AI`, group: 'AI', icon: PenLine, terms: 'ai generate draft section' });
    }
    return out;
  }, [caretSection, wordsOf]);

  const runSlashCommand = useCallback((command: SlashCommand) => {
    if (!slash) return;
    const at = editorRef.current?.selection().end ?? slash.start;
    // The "/ask" the writer typed goes, as it does for an insert.
    apply({
      content: contentRef.current.slice(0, slash.start) + contentRef.current.slice(at),
      start: slash.start,
      end: slash.start,
    });
    setSlash(null);
    if (command.id === 'ask-ai') openAi('refine');
    if (command.id === 'write-section' && caretSection) writer.writeSection(caretSection);
  }, [apply, caretSection, openAi, slash, writer]);

  /** How an image sits in this format's markup. */
  const imageMarkup = useCallback((url: string, alt = '') => (doc.format === 'latex'
    ? `\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{${url}}\n\\end{figure}`
    : `![${alt}](${url})`), [doc.format]);

  /**
   * Pasted or dropped pictures: a placeholder goes in at once, where the
   * picture will be, and becomes the image when the upload lands — so the
   * writer sees the paste take, and can keep typing while it uploads.
   */
  const handleImages = useCallback((files: File[], at: number) => {
    const latex = doc.format === 'latex';
    let pos = at;
    for (const file of files.slice(0, 6)) {
      const id = Math.random().toString(36).slice(2, 8);
      const name = (file.name || 'image').replace(/[[\]()%{}\n]/g, '');
      const placeholder = latex ? `% Uploading ${name}… (${id})` : `![Uploading ${name}…](uploading-${id})`;
      const placed = insertBlock(contentRef.current, placeholder, afterBlock(contentRef.current, pos), separatorFor(doc.format));
      apply(placed);
      pos = placed.end;
      const swap = (text: string) => {
        const now = contentRef.current;
        const where = now.indexOf(placeholder);
        if (where < 0) return;
        const next = now.slice(0, where) + text + now.slice(where + placeholder.length);
        // The writer kept typing while it uploaded: their caret stays on the
        // same character, shifted by however much the swap changed above it.
        const delta = text.length - placeholder.length;
        const sel = currentSelection();
        const keep = (n: number) => (n > where ? Math.max(where, n + delta) : n);
        contentRef.current = next;
        editorRef.current?.apply({ content: next, start: keep(sel.start), end: keep(sel.end) }, { focus: false, scroll: false });
      };
      uploadFile(file)
        .then(url => swap(imageMarkup(url, name.replace(/\.[a-z0-9]+$/i, ''))))
        .catch(error => {
          swap('');
          toast.error(error instanceof Error ? error.message : 'Upload failed');
        });
    }
  }, [apply, currentSelection, doc.format, imageMarkup]);

  const handleDropText = useCallback((text: string, at: number) => {
    apply(insertBlock(contentRef.current, text, afterBlock(contentRef.current, at), separatorFor(doc.format)));
    toast.success('Dropped into the document');
  }, [apply, doc.format]);

  // ── Global shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    // Every binding below acts on the text. None of them means anything while
    // reading, and ⌘S in particular should stay the browser's own.
    if (!editing) return;
    const onKey = (event: KeyboardEvent) => {
      // Escape from the text closes find, as it does from the bar — unless the
      // slash menu is open, which is nearer and takes it first.
      if (event.key === 'Escape' && find.open && !slashOpen.current
        && (document.activeElement as HTMLElement | null)?.closest('.cm-editor')) {
        find.setOpen(false);
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();

      if (key === 's') { event.preventDefault(); doc.save(); }
      if (key === '\\') { event.preventDefault(); toggleOutline(); }
      if (key === 'f') {
        event.preventDefault();
        const sel = currentSelection();
        find.openWith(contentRef.current.slice(sel.start, sel.end));
      }
      // ⌘G / ⇧⌘G: the next and previous match, from anywhere, while finding.
      if (key === 'g' && find.open) { event.preventDefault(); find.step(event.shiftKey ? -1 : 1); }
      // ⌘/ is the near-universal binding for "what are the shortcuts", and
      // toggling means the same key puts the sheet away again.
      if (key === '/') { event.preventDefault(); setShowShortcuts(open => !open); }
      // ⌘J opens the AI panel on Refine, with the selection already shown
      // there; pressed again from inside the panel, it closes it and returns
      // to the text.
      if (key === 'j') {
        event.preventDefault();
        const inPanel = (document.activeElement as HTMLElement | null)?.closest('.ai-side');
        if (inPanel) { setAiOpen(false); editorRef.current?.focus(); }
        else openAi('refine');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentSelection, doc, editing, find, openAi, setAiOpen, toggleOutline]);

  // ── Export ──────────────────────────────────────────────────────────────
  /*
   * Printing needs the typeset document, which only exists on screen while
   * reading. While writing it is mounted off-screen for the length of the
   * print, then dropped: keeping it rendered would re-typeset the whole
   * document on every keystroke for a view nobody is looking at.
   */
  useEffect(() => {
    if (!printing) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => printPreview()));
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const fallback = window.setTimeout(done, 1500);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
      window.clearTimeout(fallback);
    };
  }, [printing]);

  const handleExport = useCallback((kind: 'link' | 'source' | 'copy' | 'print' | 'pdf') => {
    const body = doc.format === 'latex' ? wrapLatexDocument(doc.name, doc.content) : doc.content;
    if (kind === 'link') {
      // The document's own address, which is the same one whoever receives it
      // will open — reading or writing is decided at their end, from what the
      // server says they may do.
      copyText(documentShareUrl(plan.id, doc.format === 'latex' ? LATEX_PREFIX : ''))
        .then(() => toast.success('Link copied'))
        .catch(() => toast.error('Could not copy the link'));
    } else if (kind === 'source') {
      downloadSource(doc.name, body, doc.format);
      toast.success('Downloaded');
    } else if (kind === 'copy') {
      copyText(body).then(() => toast.success('Copied to clipboard'));
    } else if (kind === 'pdf') {
      setShowPdf(true);
    } else if (editing) {
      setPrinting(true);
    } else {
      printPreview();
    }
  }, [doc.content, doc.format, doc.name, editing, plan.id]);

  /* Beside the document when there is room, over it when there is not. */
  const showRail = editing && (compact ? railOpen : options.outline);
  const surface: SurfaceMode = options.surface;
  /** The typeset document, for the PDF dialog and the printer, while writing. */
  const offscreen = editing && (showPdf || printing);

  return (
    <div className="editor-root" data-editing={editing}>
      <EditorHeader
        name={doc.name}
        onRename={doc.setName}
        authorUsername={doc.authorUsername}
        coAuthorUsernames={doc.coAuthorUsernames}
        isAuthor={isOwner}
        onManageCoAuthors={() => setShowShare(true)}
        peers={doc.peers}
        saveState={doc.saveState}
        onSave={() => doc.save()}
        onBack={onBack}
        onUndo={() => editorRef.current?.undo()}
        onRedo={() => editorRef.current?.redo()}
        surface={surface}
        onSurface={mode => updateOptions({ surface: mode })}
        compact={compact}
        editing={editing}
        onMode={onMode}
        options={options}
        onOptions={updateOptions}
        onExport={handleExport}
        docStyle={docStyle}
        onDocStyle={setDocStyle}
      />

      {editing && (
        <Toolbar
          format={doc.format}
          onRun={runAction}
          onUploadImage={() => setShowImage(true)}
          outlineOpen={compact ? railOpen : options.outline}
          onToggleOutline={toggleOutline}
          aiOpen={aiOpen}
          onToggleAi={() => setAiOpen(!aiOpen)}
          onShowShortcuts={() => setShowShortcuts(true)}
        />
      )}

      {editing && (
        <ShortcutsSheet
          open={showShortcuts}
          onClose={() => setShowShortcuts(false)}
          format={doc.format}
        />
      )}

      {editing && <FindBar find={find} onDone={findDone} />}

      <div className="editor-main">
        {/* A scrim, only in the compact layout: there the rail is a drawer over
            the document, and a drawer that can be left open with no obvious way
            to close it is a trap. Wide, the rail is a column and dimming the
            page behind it would be nonsense. */}
        {compact && railOpen && (
          <div className="editor-rail-scrim" onClick={() => setRailOpen(false)} aria-hidden="true" />
        )}

        {showRail && (
          <OutlineRail
            tree={tree}
            words={words}
            activeId={activeId}
            compact={compact}
            width={options.outlineWidth}
            onWidth={setOutlineWidth}
            onClose={closeRail}
            onJump={goToSection}
            onFocusSection={focusSection}
            writer={writer}
            onDeleteSection={deleteSection}
            onRenameHeading={renameHeading}
            onShiftHeading={shiftHeading}
            onMoveHeading={moveHeading}
            onAddHeading={addHeading}
            onOpenAi={openAi}
          />
        )}

        {editing ? (
          <div className="editor-pane doc-themed" ref={surfaceRef} {...styleAttrs}>
            <LiveEditor
              ref={editorRef}
              value={doc.content}
              onChange={handleChange}
              onSelection={onSelection}
              onDropText={handleDropText}
              onBlur={closeSlash}
              onImages={handleImages}
              format={doc.format}
              mode={surface}
              fontSize={options.fontSize}
              lineNumbers={options.lineNumbers}
              focusMode={options.focusMode}
              finds={find.matches}
              activeFind={find.current}
              sectionLines={focusLines}
              peers={doc.peers}
              placeholder={doc.format === 'latex'
                ? '\\section{Introduction} — start writing, or press / for everything you can insert.'
                : 'Start writing — or press / for everything you can insert.'}
            >
              {slash && (
                <SlashMenu
                  format={doc.format}
                  query={slash.query}
                  anchor={anchorForOffset(slash.start)}
                  onPick={runSlashAction}
                  commands={slashCommands}
                  onCommand={runSlashCommand}
                  onClose={closeSlash}
                />
              )}

            </LiveEditor>
          </div>
        ) : (
          <div className="editor-preview doc-themed" {...styleAttrs}>
            <PreviewPane content={doc.content} format={doc.format} fontSize={options.fontSize} />
          </div>
        )}

        {/* The AI panel: its own column on the right, apart from the outline —
            or a drawer over the document when the layout is compact. */}
        {editing && compact && aiOpen && (
          <div className="editor-rail-scrim" onClick={() => setAiOpen(false)} aria-hidden="true" />
        )}
        {editing && aiOpen && (
          <AiPanel
            queue={queue}
            shelf={shelf}
            subject={doc.name}
            selection={selection}
            content={doc.content}
            format={doc.format}
            title={doc.name}
            outline={outline}
            onReplace={replacePassage}
            onInsertAfter={(at, text) => apply(insertBlock(contentRef.current, text, afterBlock(contentRef.current, at), separatorFor(doc.format)))}
            onApplyOutline={applyProposedOutline}
            focusSignal={aiFocus}
            request={aiRequest}
            onClose={() => setAiOpen(false)}
            compact={compact}
            writer={writer}
            wordsOf={wordsOf}
            onJump={goToSection}
          />
        )}

        {offscreen && (
          <div className="editor-preview editor-print-source" aria-hidden="true">
            <PreviewPane content={doc.content} format={doc.format} />
          </div>
        )}
      </div>

      {showPdf && (
        <ExportPdfDialog
          initial={pdfFromDocStyle(docStyle)}
          title={doc.name}
          author={user?.given_name ? [user.given_name, user.family_name].filter(Boolean).join(' ') : null}
          /* Read at submit time, not at open time: the document can keep
             changing while the dialog is up, and the export should carry
             whatever it says when the button is actually pressed. */
          getHtml={() => document.querySelector('.doc-preview .doc-sheet')?.innerHTML ?? null}
          onClose={() => setShowPdf(false)}
        />
      )}

      <StatusBar
        editing={editing}
        saveState={doc.saveState}
        lastSavedAt={doc.lastSavedAt}
        stats={stats}
        line={position.line}
        column={position.column}
        selectedWords={selectedWords}
        connected={doc.connected}
        peerCount={doc.peers.length}
        format={doc.format}
      />

      {/* Both act on the document, so neither exists while reading it. */}
      {editing && (
        <>
          <CoAuthorsDialog
            open={showShare}
            onOpenChange={setShowShare}
            coAuthors={doc.coAuthors}
            coAuthorUsernames={doc.coAuthorUsernames}
            onChange={doc.setCoAuthors}
          />

          <ImageDialog
            open={showImage}
            onOpenChange={setShowImage}
            onInsert={url => {
              const at = currentSelection().start;
              apply(insertBlock(contentRef.current, imageMarkup(url), afterBlock(contentRef.current, at), separatorFor(doc.format)));
            }}
          />
        </>
      )}
    </div>
  );
}
