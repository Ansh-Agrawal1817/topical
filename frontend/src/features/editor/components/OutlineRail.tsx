import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListTree, PanelLeftClose, Plus, Sparkles } from 'lucide-react';
import { Button, IconButton, Progress, Spinner } from '@/components/ui';
import type { OutlineNode } from '../lib/outline';
import { ancestorDepths, childTitles, type OutlineTree, type SectionWordCounts } from '../lib/tree';
import { MAX_OUTLINE_WIDTH, MIN_OUTLINE_WIDTH } from '../lib/viewOptions';
import { useDragResize } from '../hooks/useDragResize';
import { useOutlineRows } from '../hooks/useOutlineRows';
import type { SectionWriter } from '../hooks/useSectionWriter';
import { OutlineRow, type RowAct } from './OutlineRow';
import type { AiFocus } from '../ai/AiPanel';

interface Props {
  /**
   * The document's headings, indexed as a tree, and the words behind each.
   * Computed once by the editor screen — the rail used to rebuild both from
   * the raw text on every render, doubling the cost of every keystroke.
   */
  tree: OutlineTree;
  words: SectionWordCounts;
  /** Id of the heading the caret is inside — not its title. See below. */
  activeId: string | null;
  /**
   * Whether the rail is a drawer over the document rather than a column beside
   * it. Set below ~900px, where a 300px column would leave the writing surface
   * narrower than the text in it.
   */
  compact?: boolean;
  width: number;
  onWidth: (width: number) => void;
  onClose: () => void;
  onJump: (node: OutlineNode) => void;
  /** Show, in the document itself, the section a rail gesture is acting on. */
  onFocusSection: (node: OutlineNode | null) => void;
  /** Remove a section and everything nested under it from the document. */
  onDeleteSection: (offset: number) => void;
  onRenameHeading: (offset: number, next: string) => void;
  onShiftHeading: (offset: number, delta: 1 | -1) => void;
  onMoveHeading: (offset: number, target: number, edge: 'top' | 'bottom') => void;
  /** Returns the offset of the heading it created. */
  onAddHeading: (afterOffset: number | null) => number;
  /** Section writing, shared with the AI panel's Write tab. */
  writer: SectionWriter;
  /** Open the AI panel on one of its tabs — or on Write, with one section to write. */
  onOpenAi: (focus: AiFocus, section?: OutlineNode) => void;
}

/**
 * The document's structure, and everything that acts on it.
 *
 * This replaced a read-only navigator sitting next to a separate generation
 * panel. Those were two views of the same thing — the shape of the document —
 * and keeping them apart meant the outline you edited and the outline you
 * navigated could disagree.
 *
 * Composition only. Row gestures live in `useOutlineRows`, generation in
 * `useSectionWriter`, the hierarchy relations in `lib/tree`, and the proposal
 * in its own component; what is left here is the arrangement and the calls
 * that restructure the whole outline at once.
 */
export const OutlineRail = memo(function OutlineRail({
  tree, words, activeId, compact, width, onWidth,
  onClose, onJump, onFocusSection, onDeleteSection,
  onRenameHeading, onShiftHeading, onMoveHeading, onAddHeading,
  writer, onOpenAi,
}: Props) {

  // The rail renders the document's headings. There is no second copy of the
  // structure, so there is nothing to keep in step — editing a row edits the
  // page, and typing a heading into the page adds a row.
  const nodes = tree.nodes;
  /* The sections the active row sits inside, each with how far above it is.
     Lighting only the active row tells you where the caret is but not where
     that *is*: in a deep outline a lit third-level row, with its parents
     looking identical to every other row, leaves you scanning upward to work
     out which chapter you are in. */
  const ancestors = useMemo(() => ancestorDepths(tree, activeId), [tree, activeId]);

  /**
   * What a row has written *itself*.
   *
   * A parent's prose stops at its first child. Counting the subtree instead
   * marked every chapter heading written the moment anything under it was,
   * which made the coverage count a tally of nothing: a document of eight
   * headings and one paragraph read as "5 of 16 written".
   */
  const wordsOf = (node: OutlineNode) => words.own.get(node.offset) ?? 0;
  /** What deleting a row would take with it — its children included. */
  const subtreeWordsOf = (node: OutlineNode) => words.subtree.get(node.offset) ?? 0;

  const rows = useOutlineRows({
    nodes,
    childrenOf: node => {
      const index = tree.byOffset.get(node.offset);
      return index === undefined ? [] : childTitles(tree, index);
    },
    wordsOf: subtreeWordsOf,
    onRenameHeading, onShiftHeading, onMoveHeading, onAddHeading, onDeleteSection,
  });

  /*
   * Row identity across edits: the title and which occurrence of it this is.
   *
   * Not the node id — that is the heading's offset, and every character typed
   * above a heading moves it. Keyed on that, each keystroke unmounted and
   * rebuilt every row below the caret (dozens of icons apiece), which was
   * the single largest cost of typing in a long document.
   */
  const rowKeys = useMemo(() => {
    const seen = new Map<string, number>();
    return nodes.map(node => {
      const n = (seen.get(node.label) ?? 0) + 1;
      seen.set(node.label, n);
      return `${node.label}\u0000${n}`;
    });
  }, [nodes]);

  /*
   * The rail by keyboard. A row's title is a button, so Tab reaches it; from
   * there ↑/↓ walk the outline, ⌥↑/⌥↓ move the section past its neighbour,
   * ⌥←/⌥→ change its depth, and F2 renames it. Focus follows a row that
   * moves — it is found again by its key once the document has re-rendered.
   */
  const [refocus, setRefocus] = useState<{ key: string; from: OutlineNode[] } | null>(null);
  useEffect(() => {
    // Wait for the outline the move produced, not the one it started from.
    if (!refocus || refocus.from === nodes) return;
    const row = document.querySelector<HTMLElement>(`.outline-list [data-row-key="${CSS.escape(refocus.key)}"] .orow-name`);
    row?.focus();
    setRefocus(null);
  }, [refocus, nodes]);

  const rowKeyDown = (node: OutlineNode, index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const entry = tree.entries[index];
    const siblings = entry.parent === null ? tree.roots : tree.entries[entry.parent].children;
    const at = siblings.indexOf(index);
    const focusRow = (i: number) => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('.outline-list .orow-name'));
      rows[Math.max(0, Math.min(rows.length - 1, i))]?.focus();
    };
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const neighbour = siblings[at + (event.key === 'ArrowUp' ? -1 : 1)];
      if (neighbour === undefined) return;
      onFocusSection(node);
      onMoveHeading(node.offset, nodes[neighbour].offset, event.key === 'ArrowUp' ? 'top' : 'bottom');
      setRefocus({ key: rowKeys[index], from: nodes });
    } else if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      onFocusSection(node);
      onShiftHeading(node.offset, event.key === 'ArrowRight' ? 1 : -1);
      setRefocus({ key: rowKeys[index], from: nodes });
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      focusRow(index + (event.key === 'ArrowUp' ? -1 : 1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusRow(event.key === 'Home' ? 0 : nodes.length - 1);
    } else if (event.key === 'F2') {
      event.preventDefault();
      onFocusSection(node);
      rows.startEdit(node);
    }
  };

  const written = nodes.filter(node => wordsOf(node) > 0).length;
  const totalWords = nodes.reduce((sum, node) => sum + wordsOf(node), 0);

  const startResize = useDragResize({
    from: () => width,
    to: (dx, start) => Math.min(Math.max(start + dx, MIN_OUTLINE_WIDTH), MAX_OUTLINE_WIDTH),
    onChange: onWidth,
  });

  const addAtEnd = () => rows.addAfter(nodes[nodes.length - 1] ?? null);

  /** The sibling a row would move past, above (-1) or below (1). */
  const neighbourOf = (index: number, step: -1 | 1) => {
    const entry = tree.entries[index];
    const siblings = entry.parent === null ? tree.roots : tree.entries[entry.parent].children;
    return siblings[siblings.indexOf(index) + step];
  };
  const moveRow = (node: OutlineNode, index: number, step: -1 | 1) => {
    const neighbour = neighbourOf(index, step);
    if (neighbour === undefined) return;
    onFocusSection(node);
    onMoveHeading(node.offset, nodes[neighbour].offset, step === -1 ? 'top' : 'bottom');
  };

  /*
   * One stable handler for every row's every gesture. A row passes its key;
   * the heading it means is looked up here, now — not captured when the row
   * last rendered, since rows skip renders and a captured offset goes stale
   * with the first character typed above it.
   */
  const latest = useRef({ nodes, rowKeys, rows, rowKeyDown, moveRow, onJump, onFocusSection, onOpenAi, onShiftHeading });
  latest.current = { nodes, rowKeys, rows, rowKeyDown, moveRow, onJump, onFocusSection, onOpenAi, onShiftHeading };
  const act = useCallback<RowAct>((key, action) => {
    const L = latest.current;
    const index = L.rowKeys.indexOf(key);
    const node = L.nodes[index];
    if (!node) return;
    const touch = (run: () => void) => { L.onFocusSection(node); run(); };
    switch (action.type) {
      case 'jump': return touch(() => L.onJump(node));
      case 'edit': return touch(() => L.rows.startEdit(node));
      case 'commit': return L.rows.commitEdit();
      case 'value': return L.rows.setEditValue(action.value);
      case 'editKey': return L.rows.editKeys(node)(action.event);
      case 'rowKey': return L.rowKeyDown(node, index)(action.event);
      case 'write': return touch(() => L.onOpenAi('write', node));
      case 'add': return touch(() => L.rows.addAfter(node));
      case 'delete': return L.rows.deleteRow(node);
      case 'indent': return touch(() => L.onShiftHeading(node.offset, 1));
      case 'outdent': return touch(() => L.onShiftHeading(node.offset, -1));
      case 'up': return L.moveRow(node, index, -1);
      case 'down': return L.moveRow(node, index, 1);
      case 'dragStart': return L.rows.rowDragStart(node)(action.event);
      case 'dragOver': return L.rows.rowDragOver(node)(action.event);
      case 'drop': L.onFocusSection(null); return L.rows.rowDrop(node)(action.event);
      case 'dragEnd': return L.rows.endDrag();
    }
  }, []);

  return (
    /* As a drawer the rail sizes itself from the viewport, so the stored width
       — a number chosen on a wide screen — is not applied. */
    <aside className="outline-rail" data-drawer={compact || undefined} style={compact ? undefined : { width }} aria-label="Outline">
      <header className="side-head">
        <ListTree className="side-head-icon h-4 w-4" aria-hidden="true" />
        <h2 className="side-head-title">Outline</h2>
        <span className="side-head-tools">
          {nodes.length > 0 && (
            <IconButton size="md" onClick={() => onOpenAi('outline')} title="Restructure with AI" aria-label="Restructure the outline with AI">
              <Sparkles className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton size="md" onClick={onClose} title="Hide outline  ⌘\" aria-label="Hide outline">
            <PanelLeftClose className="h-4 w-4" />
          </IconButton>
        </span>
      </header>

      {/* How much of the structure is written, stated once — not as a tick
          repeated down every row. */}
      {nodes.length > 0 && (
        <div className="side-stat">
          <div className="side-stat-row">
            <span><b>{written}</b> of {nodes.length} written</span>
            <span className="side-stat-aside">{totalWords.toLocaleString()} words</span>
          </div>
          <Progress value={nodes.length ? written / nodes.length : 0} />
        </div>
      )}

      {nodes.length === 0 ? (
        <div className="outline-empty">
          <span className="outline-empty-icon" aria-hidden="true"><ListTree className="h-5 w-5" /></span>
          <p className="outline-empty-title">No sections yet</p>
          <p>Give AI the subject and it proposes the whole structure — or add sections yourself.</p>
          <div className="outline-empty-actions">
            <Button variant="secondary" size="sm" onClick={() => onOpenAi('outline')}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Build with AI
            </Button>
            <Button variant="ghost" size="sm" onClick={() => rows.addAfter(null)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add a section
            </Button>
          </div>
        </div>
      ) : (
        // A real list, so the count is announced and rows are navigable as
        // items rather than as a run of anonymous buttons.
        <div className="outline-list" role="list" aria-label={`Outline, ${nodes.length} sections`}>
          {nodes.map((node, index) => (
            <OutlineRow
              key={rowKeys[index]}
              rowKey={rowKeys[index]}
              title={node.label}
              level={node.level}
              status={writer.status[node.offset]}
              words={wordsOf(node)}
              // Identity is the node, never its text. Comparing titles lit up
              // every row that happened to be called the same thing.
              active={node.id === activeId}
              onPath={ancestors.has(node.id)}
              canMoveUp={neighbourOf(index, -1) !== undefined}
              canMoveDown={neighbourOf(index, 1) !== undefined}
              editing={rows.editingOffset === node.offset}
              value={rows.editingOffset === node.offset ? rows.editValue : ''}
              dragging={rows.dragOffset === node.offset}
              dropEdge={rows.dropAt?.offset === node.offset ? rows.dropAt.edge : null}
              act={act}
            />
          ))}
          {/* Adding belongs at the end of the list: it appends *there*. */}
          <button type="button" className="outline-add" onClick={addAtEnd} title="Add a section at the end">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add section
          </button>
        </div>
      )}

      {/* Writing lives in the AI panel's Write tab; the foot is its shortcut,
          and where a running batch stays visible from here. */}
      {writer.progress ? (
        <div className="outline-foot">
          <button type="button" className="outline-run" onClick={() => onOpenAi('write')} title="Show the run in the AI panel">
            <span className="outline-run-row">
              <Spinner size="2xs" tone="accent" />
              <span className="outline-run-text">
                {writer.progress.retrying ? 'Waiting to retry' : 'Writing'} <b>{writer.progress.title}</b>
              </span>
              <span className="outline-run-count">{writer.progress.done}/{writer.progress.total}</span>
            </span>
            <Progress size="md" value={writer.progress.done / writer.progress.total} label="Sections written" />
          </button>
        </div>
      ) : writer.missing > 0 ? (
        <div className="outline-foot">
          <Button variant="secondary" size="sm" width="full" onClick={() => onOpenAi('write')}
            title="Write the empty sections with AI — opens the AI panel">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Write {writer.missing} empty section{writer.missing === 1 ? '' : 's'}…
          </Button>
        </div>
      ) : null}

      {/* Nothing to resize against when the rail is a drawer, and a col-resize
          handle over the document's left edge on a touch screen is a trap. */}
      {!compact && (
        <div className="outline-resize" onMouseDown={startResize} role="separator" aria-orientation="vertical" aria-label="Resize outline" />
      )}
    </aside>
  );
});
