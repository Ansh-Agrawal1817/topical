import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Range } from '../lib/textOps';

interface Options {
  content: string;
  /** Where the caret is now — a new search starts from the first match at or after it. */
  caret: () => number;
  /** Apply a replacement, leaving focus in the find bar. */
  onReplace: (next: string, selection: Range) => void;
  /** Show a match in the text without taking focus from the bar. */
  onFocusMatch: (match: Range) => void;
}

export interface FindReplace {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Open the bar, seeded with `seed` when there is one (the selected text). */
  openWith: (seed?: string) => void;
  query: string;
  setQuery: (q: string) => void;
  replacement: string;
  setReplacement: (r: string) => void;
  caseSensitive: boolean;
  setCaseSensitive: (v: boolean) => void;
  wholeWord: boolean;
  setWholeWord: (v: boolean) => void;
  matches: Range[];
  current: number;
  step: (direction: 1 | -1) => void;
  replaceCurrent: () => void;
  replaceAll: () => number;
  /** Bumped whenever the bar should take focus again (⌘F while it is open). */
  focusSignal: number;
}

const MAX_MATCHES = 2000;

/** A word character, for whole-word matching — letters in any script, digits, underscore. */
const WORD = /[\p{L}\p{N}_]/u;

/** Find and replace over the raw document text. */
export function useFindReplace({ content, caret, onReplace, onFocusMatch }: Options): FindReplace {
  const [open, setOpenRaw] = useState(false);
  const [query, setQueryRaw] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [current, setCurrent] = useState(0);
  const [focusSignal, setFocusSignal] = useState(0);

  const matches = useMemo(() => {
    if (!open || query.length === 0) return [];
    const found: Range[] = [];
    const haystack = caseSensitive ? content : content.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    let at = haystack.indexOf(needle);
    while (at !== -1 && found.length < MAX_MATCHES) {
      const end = at + needle.length;
      const bounded = !wholeWord || (!WORD.test(content[at - 1] ?? '') && !WORD.test(content[end] ?? ''));
      if (bounded) found.push({ start: at, end });
      at = haystack.indexOf(needle, at + Math.max(needle.length, 1));
    }
    return found;
  }, [caseSensitive, content, open, query, wholeWord]);

  /*
   * A new search lands on the first match at or after the caret, and shows it.
   *
   * It used to count matches and leave the document where it was, so typing a
   * word into the bar said "1/6" while the text showed none of the six — the
   * writer had to press Enter to see the first one, which is not what any
   * find-as-you-type in any editor does.
   */
  const latest = useRef({ caret, onFocusMatch });
  latest.current = { caret, onFocusMatch };
  const searched = useRef('');
  /** After a Replace: carry on from here, to the next match after the one just replaced. */
  const resumeFrom = useRef<number | null>(null);
  useEffect(() => {
    const key = `${query}\u0000${caseSensitive}\u0000${wholeWord}`;
    if (!open) { searched.current = ''; resumeFrom.current = null; return; }
    if (!matches.length) {
      // Nothing found is still this search: if typing in the document later
      // produces a match, the bar must not grab the writer's own words.
      searched.current = key;
      resumeFrom.current = null;
      return;
    }
    if (searched.current === key) {
      if (resumeFrom.current !== null) {
        const from = resumeFrom.current;
        resumeFrom.current = null;
        const index = matches.findIndex(match => match.start >= from);
        const next = index < 0 ? 0 : index;
        setCurrent(next);
        latest.current.onFocusMatch(matches[next]);
        return;
      }
      // Same search, text edited: keep the cursor inside the result set.
      setCurrent(c => Math.min(c, matches.length - 1));
      return;
    }
    searched.current = key;
    const from = latest.current.caret();
    const first = Math.max(0, matches.findIndex(match => match.end > from));
    setCurrent(first);
    latest.current.onFocusMatch(matches[first]);
  }, [caseSensitive, matches, open, query, wholeWord]);

  const setOpen = useCallback((next: boolean) => {
    setOpenRaw(next);
    if (!next) searched.current = '';
  }, []);

  const setQuery = useCallback((q: string) => setQueryRaw(q), []);

  const openWith = useCallback((seed?: string) => {
    // A short, single-line selection is almost always what the writer wants
    // to look for; a paragraph is not a search term.
    if (seed && seed.length <= 120 && !seed.includes('\n')) setQueryRaw(seed);
    setOpenRaw(true);
    setFocusSignal(n => n + 1);
  }, []);

  const step = useCallback((direction: 1 | -1) => {
    if (!matches.length) return;
    const next = (current + direction + matches.length) % matches.length;
    setCurrent(next);
    onFocusMatch(matches[next]);
  }, [current, matches, onFocusMatch]);

  const replaceCurrent = useCallback(() => {
    const match = matches[current];
    if (!match) return;
    const next = content.slice(0, match.start) + replacement + content.slice(match.end);
    const caretAt = match.start + replacement.length;
    // The replaced text is selected, and the search carries on from after it:
    // Enter, Enter, Enter walks through the document replacing as it goes.
    resumeFrom.current = caretAt;
    onReplace(next, { start: match.start, end: caretAt });
  }, [content, current, matches, onReplace, replacement]);

  /** Replace every match; returns how many. The caret stays where it was, shifted by the edits before it. */
  const replaceAll = useCallback(() => {
    if (!matches.length) return 0;
    const at = caret();
    let next = '';
    let cursor = 0;
    let shift = 0;
    for (const match of matches) {
      next += content.slice(cursor, match.start) + replacement;
      cursor = match.end;
      if (match.end <= at) shift += replacement.length - (match.end - match.start);
    }
    next += content.slice(cursor);
    const kept = Math.max(0, Math.min(next.length, at + shift));
    onReplace(next, { start: kept, end: kept });
    return matches.length;
  }, [caret, content, matches, onReplace, replacement]);

  return {
    open, setOpen, openWith, query, setQuery, replacement, setReplacement,
    caseSensitive, setCaseSensitive, wholeWord, setWholeWord,
    matches, current, step, replaceCurrent, replaceAll, focusSignal,
  };
}
