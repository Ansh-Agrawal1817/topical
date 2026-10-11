import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DocFormat } from '@/lib/types';
import type { LucideIcon } from 'lucide-react';
import { actionsFor, type EditorAction } from '../lib/actions';
import { Kbd, MenuEmpty, MenuItem, MenuLabel, MenuPanel } from '@/components/ui';

interface Props {
  format: DocFormat;
  query: string;
  /** Where to draw the menu — the caret's line, in viewport coordinates. */
  /* Shares the editor's line anchor with the AI panel: below the line when
     it fits, above it when the caret is near the foot of the surface. */
  anchor: {
    x: number; lineTop: number; lineBottom: number; boxWidth: number; boxHeight: number;
  } | null;
  onPick: (action: EditorAction) => void;
  /** Things the menu can *do* rather than insert — the AI, mostly. Listed first. */
  commands?: SlashCommand[];
  onCommand?: (command: SlashCommand) => void;
  onClose: () => void;
}

export interface SlashCommand {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  terms?: string;
  hint?: string;
}

type Entry = { kind: 'action'; item: EditorAction } | { kind: 'command'; item: SlashCommand };

/**
 * Type `/` and get every construct the format has, filtered as you keep
 * typing — the fastest path to a table or an aligned equation without
 * remembering its syntax.
 */
export function SlashMenu({ format, query, anchor, onPick, commands = [], onCommand, onClose }: Props) {
  const [cursor, setCursor] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  /** The highlighted row, kept in view as the arrow keys move past the panel's edge. */
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest' }); }, [cursor]);
  /** Placed after measuring, so it is never seen at the wrong place. */
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  const results = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (a: { label: string; group: string; terms?: string }) => !q
      || a.label.toLowerCase().includes(q) || a.group.toLowerCase().includes(q) || !!a.terms?.includes(q);
    return [
      ...commands.filter(matches).map(item => ({ kind: 'command' as const, item })),
      ...actionsFor(format).filter(matches).map(item => ({ kind: 'action' as const, item })),
    ];
  }, [commands, format, query]);

  const pick = (entry: Entry) => {
    if (entry.kind === 'command') onCommand?.(entry.item);
    else onPick(entry.item);
  };

  useEffect(() => { setCursor(0); }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setCursor(c => (results.length ? (c + 1) % results.length : 0));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCursor(c => (results.length ? (c - 1 + results.length) % results.length : 0));
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        if (!results[cursor]) return;
        event.preventDefault();
        pick(results[cursor]);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    // Capture: the textarea's own keydown handler would otherwise indent on Tab.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, onClose, onPick, onCommand, results]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !anchor) return;
    const { height, width } = panel.getBoundingClientRect();
    const GAP = 8;
    const below = anchor.lineBottom + GAP;
    const above = anchor.lineTop - height - GAP;
    const top = anchor.boxHeight - below >= height ? below : above >= GAP ? above : Math.max(GAP, anchor.boxHeight - height - GAP);
    setPlace({ left: Math.max(GAP, Math.min(anchor.x, anchor.boxWidth - width - GAP)), top });
  }, [anchor, results.length]);

  if (!anchor) return null;

  let lastGroup = '';

  return (
    <MenuPanel
      origin="top-left"
      className="slash-menu"
      ref={panelRef}
      style={place ?? { left: 0, top: 0, visibility: 'hidden' }}
      role="listbox"
    >
      {results.length === 0 ? (
        <MenuEmpty>Nothing matches “{query}”</MenuEmpty>
      ) : (
        results.map((entry, index) => {
          const { item } = entry;
          const header = item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          const Icon = item.icon;
          const key = entry.kind === 'action' ? entry.item.key : undefined;
          return (
            <div key={`${entry.kind}:${item.id}`}>
              {header && <MenuLabel>{header}</MenuLabel>}
              <MenuItem
                active={index === cursor}
                ref={index === cursor ? activeRef : undefined}
                onMouseEnter={() => setCursor(index)}
                onMouseDown={event => { event.preventDefault(); pick(entry); }}
                role="option"
                aria-selected={index === cursor}
                icon={<Icon className="h-3.5 w-3.5" />}
                trailing={key ? <Kbd>⌘{key.toUpperCase()}</Kbd> : entry.kind === 'command' && entry.item.hint ? <Kbd>{entry.item.hint}</Kbd> : undefined}
              >
                <span>{item.label}</span>
              </MenuItem>
            </div>
          );
        })
      )}
    </MenuPanel>
  );
}
