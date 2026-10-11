import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DocFormat } from '@/lib/types';
import type { LucideIcon } from 'lucide-react';
import { CornerDownLeft, Search } from 'lucide-react';
import { actionsFor, type EditorAction } from '../lib/actions';
import { Kbd, MenuPanel } from '@/components/ui';

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
  /** One line on what it does. */
  hint?: string;
  /** Its keyboard shortcut, if it has one. */
  shortcut?: string;
}

type Entry =
  | { kind: 'action'; item: EditorAction; group: string }
  | { kind: 'command'; item: SlashCommand; group: string };

/** Sections in the order a writer reaches for them; anything unlisted goes last. */
const GROUP_ORDER = ['AI', 'Recent', 'Structure', 'Format', 'Callouts', 'Blocks', 'Theorems', 'Math', 'Media', 'Insert'];
const groupRank = (group: string) => {
  const at = GROUP_ORDER.indexOf(group);
  return at < 0 ? GROUP_ORDER.length : at;
};

const RECENT_KEY = 'topical_slash_recent';
const RECENT_MAX = 4;

function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function remember(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...loadRecent().filter(x => x !== id)].slice(0, RECENT_MAX)));
  } catch { /* a convenience */ }
}

/**
 * How well an entry answers the query: the label starting with it beats a
 * word in the label starting with it, which beats it appearing anywhere,
 * which beats a synonym. Zero is no match.
 */
function score(entry: { label: string; group: string; terms?: string; hint?: string }, q: string): number {
  const label = entry.label.toLowerCase();
  if (label.startsWith(q)) return 5;
  if (label.split(/[\s,×]+/).some(word => word.startsWith(q))) return 4;
  if (label.includes(q)) return 3;
  if (entry.terms?.toLowerCase().split(/\s+/).some(term => term.startsWith(q))) return 2;
  if (entry.group.toLowerCase().startsWith(q) || entry.hint?.toLowerCase().includes(q)) return 1;
  return 0;
}

/** What an insert puts on the page, from an empty line — the preview's code. */
function sample(action: EditorAction): string {
  try {
    return action.apply('', { start: 0, end: 0 }).content.trim();
  } catch {
    return '';
  }
}

/**
 * Type `/` and get everything the format can hold, plus the AI.
 *
 * A list on the left — icon, name, and one line on what each is, grouped,
 * with what was used last at the top — and on the right, what the
 * highlighted entry will actually put on the page, as markup. Typing keeps
 * filtering, ranked: "/ta" finds Table before it finds "Turn into a table".
 * Narrow, the preview drops and the list keeps its descriptions.
 */
export function SlashMenu({ format, query, anchor, onPick, commands = [], onCommand, onClose }: Props) {
  const [cursor, setCursor] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  /** The highlighted row, kept in view as the arrow keys move past the list's edge. */
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest' }); }, [cursor]);
  /** Placed after measuring, so it is never seen at the wrong place. */
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const [recent] = useState(loadRecent);

  const results = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const all: Entry[] = [
      ...commands.map(item => ({ kind: 'command' as const, item, group: item.group })),
      ...actionsFor(format).map(item => ({ kind: 'action' as const, item, group: item.group as string })),
    ];
    if (q) {
      return all
        .map((entry, at) => ({ entry, at, rank: score({ ...entry.item, group: entry.group }, q) }))
        .filter(row => row.rank > 0)
        .sort((a, b) => b.rank - a.rank || groupRank(a.entry.group) - groupRank(b.entry.group) || a.at - b.at)
        // Ranked, the groups no longer run in one block each; one heading for the lot reads better.
        .map(row => ({ ...row.entry, group: 'Best matches' }));
    }
    const recentEntries = recent
      .map(id => all.find(entry => `${entry.kind}:${entry.item.id}` === id))
      .filter((entry): entry is Entry => !!entry)
      .map(entry => ({ ...entry, group: 'Recent' }));
    const grouped = all
      .map((entry, at) => ({ entry, at }))
      .sort((a, b) => groupRank(a.entry.group) - groupRank(b.entry.group) || a.at - b.at)
      .map(row => row.entry);
    // AI stays first; recent sits right under it.
    const ai = grouped.filter(entry => entry.group === 'AI');
    return [...ai, ...recentEntries, ...grouped.filter(entry => entry.group !== 'AI')];
  }, [commands, format, query, recent]);

  const pick = (entry: Entry) => {
    remember(`${entry.kind}:${entry.item.id}`);
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
    // Capture: the editor's own keydown handler would otherwise indent on Tab.
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

  const current = results[cursor];
  const preview = current?.kind === 'action' ? sample(current.item) : '';
  const shortcutOf = (entry: Entry) => entry.kind === 'action'
    ? (entry.item.key ? `⌘${entry.item.shift ? '⇧' : ''}${entry.item.key.toUpperCase()}` : undefined)
    : entry.item.shortcut;
  let lastGroup = '';

  return (
    <MenuPanel
      origin="top-left"
      className="slash-menu"
      ref={panelRef}
      style={place ?? { left: 0, top: 0, visibility: 'hidden' }}
    >
      <div className="slash-head">
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        {query
          ? <span className="slash-query">/{query}</span>
          : <span className="slash-placeholder">Type to filter — blocks, maths, callouts, AI…</span>}
        <span className="slash-total">{results.length}</span>
      </div>

      <div className="slash-body">
        <div className="slash-list" role="listbox" aria-label="Insert">
          {results.length === 0 ? (
            <div className="slash-empty">
              Nothing matches “{query}”.
              <span>Keep typing, or press Esc to write it as text.</span>
            </div>
          ) : (
            results.map((entry, index) => {
              const { item } = entry;
              const header = entry.group !== lastGroup ? entry.group : null;
              lastGroup = entry.group;
              const Icon = item.icon;
              const shortcut = shortcutOf(entry);
              return (
                <div key={`${entry.group}:${entry.kind}:${item.id}`}>
                  {header && <div className="slash-group">{header}</div>}
                  <button
                    type="button"
                    className="slash-item"
                    data-active={index === cursor || undefined}
                    data-ai={entry.kind === 'command' && item.group === 'AI' ? true : undefined}
                    ref={index === cursor ? activeRef : undefined}
                    onMouseMove={() => { if (index !== cursor) setCursor(index); }}
                    onMouseDown={event => { event.preventDefault(); pick(entry); }}
                    role="option"
                    aria-selected={index === cursor}
                  >
                    <span className="slash-icon" aria-hidden="true"><Icon className="h-4 w-4" /></span>
                    <span className="slash-text">
                      <span className="slash-label">{item.label}</span>
                      {item.hint && <span className="slash-hint">{item.hint}</span>}
                    </span>
                    {shortcut && <Kbd className="slash-kbd">{shortcut}</Kbd>}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {current && (
          <aside className="slash-preview" aria-hidden="true">
            <div className="slash-preview-icon"><current.item.icon className="h-5 w-5" /></div>
            <div className="slash-preview-title">{current.item.label}</div>
            {current.item.hint && <p className="slash-preview-hint">{current.item.hint}</p>}
            {preview ? (
              <>
                <div className="slash-preview-label">Inserts</div>
                <pre className="slash-preview-code">{preview}</pre>
              </>
            ) : current.kind === 'command' ? (
              <p className="slash-preview-note">Opens in the AI panel and runs through its queue, which retries on rate limits and can be stopped.</p>
            ) : null}
            {shortcutOf(current) && (
              <div className="slash-preview-key">Shortcut <Kbd>{shortcutOf(current)}</Kbd></div>
            )}
          </aside>
        )}
      </div>

      <footer className="slash-foot" aria-hidden="true">
        <span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
        <span><Kbd><CornerDownLeft className="h-2.5 w-2.5" /></Kbd> insert</span>
        <span><Kbd>esc</Kbd> close</span>
      </footer>
    </MenuPanel>
  );
}
