import { useCallback, useEffect, useState } from 'react';

/**
 * The context shelf: what a document's AI writing is grounded in.
 *
 * It replaced the three-way "web / model / URLs" switch that had to be set
 * before every write. Grounding is now a thing you collect — pages you add,
 * or the top results the shelf finds for you — and every section written
 * afterwards reads the relevant passages from it. An empty shelf means the
 * model writes from its own knowledge.
 *
 * Websites are live. Documents (other Topical documents, uploaded files) are
 * planned; the panel shows them as coming, so the shelf's shape is visible
 * before it is complete.
 *
 * Kept in this browser, per document. It is the writer's reading list, not
 * part of the document's text.
 */

export type ShelfKind = 'web' | 'document';

export interface ShelfItem {
  id: string;
  kind: ShelfKind;
  url: string;
  title: string;
  /** Whether sections should read it — an item can be kept but set aside. */
  on: boolean;
  addedAt: number;
}

const KEY = (docKey: string) => `topical_shelf:${docKey}`;
export const MAX_SHELF = 8;

function load(docKey: string): ShelfItem[] {
  try {
    const raw = localStorage.getItem(KEY(docKey));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.url === 'string') : [];
  } catch {
    return [];
  }
}

function save(docKey: string, items: ShelfItem[]) {
  try {
    localStorage.setItem(KEY(docKey), JSON.stringify(items));
  } catch {
    // Private mode: the shelf lasts for this visit.
  }
}

/** A URL as typed, made absolute — or null when it is not one. */
export function normaliseUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.hostname.includes('.') ? url.toString() : null;
  } catch {
    return null;
  }
}

export const hostOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

export interface ContextShelf {
  items: ShelfItem[];
  /** URLs sections should read: the items that are switched on. */
  urls: string[];
  add: (entries: { url: string; title?: string }[]) => number;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  clear: () => void;
}

export function useContextShelf(docKey: string): ContextShelf {
  const [items, setItems] = useState<ShelfItem[]>(() => load(docKey));
  useEffect(() => { setItems(load(docKey)); }, [docKey]);

  const commit = useCallback((next: ShelfItem[]) => {
    setItems(next);
    save(docKey, next);
  }, [docKey]);

  const add = useCallback((entries: { url: string; title?: string }[]) => {
    const current = load(docKey);
    const known = new Set(current.map(item => item.url));
    const fresh: ShelfItem[] = [];
    for (const entry of entries) {
      const url = normaliseUrl(entry.url);
      if (!url || known.has(url) || current.length + fresh.length >= MAX_SHELF) continue;
      known.add(url);
      fresh.push({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        kind: 'web', url, title: entry.title?.trim() || hostOf(url), on: true, addedAt: Date.now(),
      });
    }
    if (fresh.length) commit([...current, ...fresh]);
    return fresh.length;
  }, [commit, docKey]);

  return {
    items,
    urls: items.filter(item => item.on && item.kind === 'web').map(item => item.url),
    add,
    remove: id => commit(items.filter(item => item.id !== id)),
    toggle: id => commit(items.map(item => (item.id === id ? { ...item, on: !item.on } : item))),
    clear: () => commit([]),
  };
}
