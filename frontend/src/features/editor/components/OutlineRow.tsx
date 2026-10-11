import { useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, Clock, GripVertical, IndentDecrease, IndentIncrease, Pencil, Plus,
  Sparkles, Trash2,
} from 'lucide-react';
import { IconButton, Spinner } from '@/components/ui';
import type { PlanItem } from '../lib/plan';
import { RowMenu } from './RowMenu';

export type RowStatus = 'queued' | 'generating' | 'failed';

interface RowProps {
  item: PlanItem;
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
  value: string;
  onValue: (next: string) => void;
  onEdit: () => void;
  onCommit: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onPrimary: () => void;
  /** Keys on the focused row: moving between rows, reordering, re-depthing, renaming. */
  onRowKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  /** Identity for keyboard focus to find this row again after it moves. */
  rowKey?: string;
  onWrite: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddAfter: () => void;
  onDelete: () => void;
  dragging: boolean;
  dropEdge: 'top' | 'bottom' | null;
  onDragStart: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragEnd: () => void;
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
 */
export function OutlineRow({
  item, status, words, active, onPath, canMoveUp, canMoveDown, editing, value, onValue, onEdit, onCommit,
  onKeyDown, onPrimary, onRowKeyDown, rowKey, onWrite, onIndent, onOutdent, onMoveUp, onMoveDown, onAddAfter, onDelete,
  dragging, dropEdge, onDragStart, onDragOver, onDrop, onDragEnd,
}: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const empty = !item.title.trim();
  const written = words > 0;
  const pending = status === 'queued' || status === 'generating';
  const title = empty
    ? 'Name this section'
    : written
      ? `Go to “${item.title}” — ${words.toLocaleString()} words`
      : `Go to “${item.title}” — not written yet`;

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
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      // Depth travels to CSS as a number: the indent and the type scale both
      // derive from it, so they can never disagree.
      style={{ ['--orow-level' as string]: item.level }}
      data-level={Math.min(item.level, 4)}
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
          onChange={event => onValue(event.target.value)}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
        />
      ) : (
        <button
          className="orow-name"
          data-empty={empty}
          disabled={empty}
          onClick={onPrimary}
          onDoubleClick={onEdit}
          onKeyDown={onRowKeyDown}
          title={title}
          aria-current={active ? 'location' : undefined}
        >
          {item.title || 'Untitled section'}
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
          <IconButton size="xs" onClick={onWrite} disabled={pending || empty}
            title={pending ? 'Already in the AI queue' : written ? 'Rewrite with AI' : 'Write with AI'}
            aria-label={written ? `Rewrite “${item.title}” with AI` : `Write “${item.title}” with AI`}>
            <Sparkles className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton size="xs" onClick={onAddAfter} title="Add a section below" aria-label="Add a section below">
            <Plus className="h-3.5 w-3.5" />
          </IconButton>
          <RowMenu
            label={`More for “${item.title || 'this section'}”`}
            onOpenChange={setMenuOpen}
            items={[
              { id: 'rename', label: 'Rename', icon: <Pencil className="h-3.5 w-3.5" />, shortcut: 'F2', onSelect: onEdit },
              { id: 'up', label: 'Move up', icon: <ArrowUp className="h-3.5 w-3.5" />, shortcut: '⌥↑', onSelect: onMoveUp, disabled: !canMoveUp, divided: true },
              { id: 'down', label: 'Move down', icon: <ArrowDown className="h-3.5 w-3.5" />, shortcut: '⌥↓', onSelect: onMoveDown, disabled: !canMoveDown },
              { id: 'indent', label: 'Indent', icon: <IndentIncrease className="h-3.5 w-3.5" />, shortcut: '⌥→', onSelect: onIndent },
              { id: 'outdent', label: 'Outdent', icon: <IndentDecrease className="h-3.5 w-3.5" />, shortcut: '⌥←', onSelect: onOutdent, disabled: item.level <= 1 },
              { id: 'delete', label: 'Delete section', icon: <Trash2 className="h-3.5 w-3.5" />, onSelect: onDelete, danger: true, divided: true },
            ]}
          />
        </span>
      )}
    </div>
  );
}
