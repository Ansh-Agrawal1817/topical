import { memo, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, Clock, GripVertical, IndentDecrease, IndentIncrease, Pencil, Plus,
  Sparkles, Trash2,
} from 'lucide-react';
import { IconButton, Spinner } from '@/components/ui';
import { RowMenu } from './RowMenu';

export type RowStatus = 'queued' | 'generating' | 'failed';

/** Everything a row can ask for. Gestures that need the DOM event carry it. */
export type RowAction =
  | { type: 'jump' | 'edit' | 'commit' | 'write' | 'add' | 'delete' | 'indent' | 'outdent' | 'up' | 'down' | 'dragEnd' }
  | { type: 'value'; value: string }
  | { type: 'editKey'; event: React.KeyboardEvent<HTMLInputElement> }
  | { type: 'rowKey'; event: React.KeyboardEvent<HTMLButtonElement> }
  | { type: 'dragStart' | 'dragOver' | 'drop'; event: React.DragEvent };

/**
 * Routes a row's gesture, by the row's key, to the heading that row is *now*.
 * Stable for the life of the rail — which is what lets rows skip rendering.
 */
export type RowAct = (rowKey: string, action: RowAction) => void;

interface RowProps {
  /** Identity across edits (title + occurrence), and the address for `act`. */
  rowKey: string;
  title: string;
  level: number;
  status?: RowStatus;
  /** Words written under this heading. Zero means the section is still a promise. */
  words: number;
  /** The section the caret is in. */
  active: boolean;
  /** A section the active one is nested inside. */
  onPath: boolean;
  /** Whether it has a sibling to move past, above and below. */
  canMoveUp: boolean;
  canMoveDown: boolean;
  editing: boolean;
  /** The rename field's text — empty unless this row is the one being renamed. */
  value: string;
  dragging: boolean;
  dropEdge: 'top' | 'bottom' | null;
  act: RowAct;
}

/** Compact enough for the end of a row and still read at a glance. */
function shortCount(words: number): string {
  return words >= 1000 ? `${(words / 1000).toFixed(1)}k` : String(words);
}

/**
 * One outline row: its depth, how much of it is written, and the handles for
 * reshaping it.
 *
 * At rest a row is a title and a word count. Hovered (or focused), the count
 * gives way to the two things people reach for — write it, add one after it —
 * and a "⋯" holding the rest with their keys. The six-icon tray that used to
 * sit there was unlabelled and covered the title it acted on.
 *
 * The sections the caret is inside carry a dot at their own indent, so the
 * path from the top of the outline down to where you are reads as a trail.
 *
 * Memoised, and that is load-bearing: every keystroke rebuilds the outline,
 * because every heading below the caret moves. A row's props are what it
 * shows, plus one stable `act`; its gestures name the row by key and are
 * resolved to the heading's current offset when they happen. With a dozen
 * closures per row capturing that offset instead, all of them re-rendered on
 * every character typed — 2.5ms a keystroke on a 40-section outline.
 */
export const OutlineRow = memo(function OutlineRow({
  rowKey, title: label, level, status, words, active, onPath, canMoveUp, canMoveDown, editing, value,
  dragging, dropEdge, act,
}: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const empty = !label.trim();
  const written = words > 0;
  const pending = status === 'queued' || status === 'generating';
  const title = empty
    ? 'Name this section'
    : written
      ? `Go to “${label}” — ${words.toLocaleString()} words`
      : `Go to “${label}” — not written yet`;

  return (
    <div
      className="orow"
      role="listitem"
      data-status={status ?? 'idle'}
      data-active={active}
      data-path={onPath || active || undefined}
      data-written={written}
      data-dragging={dragging}
      data-drop={dropEdge ?? undefined}
      data-menu={menuOpen || undefined}
      // Editing puts a text input in the row; a draggable ancestor stops the
      // caret from being placed by mouse, so dragging is off while renaming.
      draggable={!editing}
      onDragStart={event => act(rowKey, { type: 'dragStart', event })}
      onDragOver={event => act(rowKey, { type: 'dragOver', event })}
      onDrop={event => act(rowKey, { type: 'drop', event })}
      onDragEnd={() => act(rowKey, { type: 'dragEnd' })}
      // Depth travels to CSS as a number: the indent and the type scale both
      // derive from it, so they can never disagree.
      style={{ ['--orow-level' as string]: level }}
      data-level={Math.min(level, 4)}
      data-row-key={rowKey}
    >
      <span className="orow-lead" aria-hidden="true">
        <span className="orow-dot" />
        <GripVertical className="orow-grip h-3 w-3" />
      </span>

      {editing ? (
        <input
          className="orow-input"
          autoFocus
          value={value}
          placeholder="Section title"
          aria-label="Section title"
          onChange={event => act(rowKey, { type: 'value', value: event.target.value })}
          onBlur={() => act(rowKey, { type: 'commit' })}
          onKeyDown={event => act(rowKey, { type: 'editKey', event })}
        />
      ) : (
        <button
          className="orow-name"
          data-empty={empty}
          disabled={empty}
          onClick={() => act(rowKey, { type: 'jump' })}
          onDoubleClick={() => act(rowKey, { type: 'edit' })}
          onKeyDown={event => act(rowKey, { type: 'rowKey', event })}
          title={title}
          aria-current={active ? 'location' : undefined}
        >
          {label || 'Untitled section'}
        </button>
      )}

      {/* The one piece of per-row status. Idle sections show what they weigh;
          a section being written, waiting, or failed takes the slot over. */}
      {!editing && (
        <span className="orow-meta" data-kind={status ?? (written ? 'words' : 'todo')}>
          {status === 'generating' ? (
            <Spinner size="2xs" label="Writing" />
          ) : status === 'queued' ? (
            <Clock className="h-3 w-3" aria-label="Waiting in the AI queue" />
          ) : status === 'failed' ? (
            <AlertTriangle className="h-3 w-3" aria-label="Writing failed — write it again to retry" />
          ) : written ? (
            <span title={`${words.toLocaleString()} words`}>{shortCount(words)}</span>
          ) : null}
        </span>
      )}

      {!editing && (
        <span className="orow-tools">
          <IconButton size="xs" onClick={() => act(rowKey, { type: 'write' })} disabled={pending || empty}
            title={pending ? 'Already in the AI queue' : written ? 'Rewrite with AI' : 'Write with AI'}
            aria-label={written ? `Rewrite “${label}” with AI` : `Write “${label}” with AI`}>
            <Sparkles className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton size="xs" onClick={() => act(rowKey, { type: 'add' })} title="Add a section below" aria-label="Add a section below">
            <Plus className="h-3.5 w-3.5" />
          </IconButton>
          <RowMenu
            label={`More for “${label || 'this section'}”`}
            onOpenChange={setMenuOpen}
            items={[
              { id: 'rename', label: 'Rename', icon: <Pencil className="h-3.5 w-3.5" />, shortcut: 'F2', onSelect: () => act(rowKey, { type: 'edit' }) },
              { id: 'up', label: 'Move up', icon: <ArrowUp className="h-3.5 w-3.5" />, shortcut: '⌥↑', onSelect: () => act(rowKey, { type: 'up' }), disabled: !canMoveUp, divided: true },
              { id: 'down', label: 'Move down', icon: <ArrowDown className="h-3.5 w-3.5" />, shortcut: '⌥↓', onSelect: () => act(rowKey, { type: 'down' }), disabled: !canMoveDown },
              { id: 'indent', label: 'Indent', icon: <IndentIncrease className="h-3.5 w-3.5" />, shortcut: '⌥→', onSelect: () => act(rowKey, { type: 'indent' }) },
              { id: 'outdent', label: 'Outdent', icon: <IndentDecrease className="h-3.5 w-3.5" />, shortcut: '⌥←', onSelect: () => act(rowKey, { type: 'outdent' }), disabled: level <= 1 },
              { id: 'delete', label: 'Delete section', icon: <Trash2 className="h-3.5 w-3.5" />, onSelect: () => act(rowKey, { type: 'delete' }), danger: true, divided: true },
            ]}
          />
        </span>
      )}
    </div>
  );
});
