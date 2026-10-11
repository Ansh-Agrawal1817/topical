import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError, isRejection, reviewSection, type ReviewSuggestion } from '@/lib/api';
import { getCredentials, type AiCredential } from '@/lib/aiCredentials';
import type { AiCollaborator, DocFormat } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import type { OutlineNode } from '../lib/outline';
import { isRetryable } from './queue';

/**
 * AI collaborators at work: each one, on its own interval, reads the section
 * someone last touched and suggests the few changes it needs — usually none.
 *
 * What a review sends is one section, never the document: the section's own
 * text (heading to the next heading), the path of headings above it, and
 * the outline as titles. It runs only when that section has settled for a
 * moment (no half-typed sentences), only when its text changed since this
 * reviewer last read it, and not while the tab is hidden. Rate limits back
 * off; a rejected key stops that reviewer and says why.
 *
 * Only the browser of whoever added a collaborator holds its key, so only
 * that browser runs it. Everyone else sees it on the document.
 */

export interface Suggestion extends ReviewSuggestion {
  id: string;
  reviewerId: string;
  reviewerName: string;
  /** The section it was made in: its heading's offset then, and its title. */
  sectionStart: number;
  sectionLabel: string;
  at: number;
}

export type ReviewerState = 'idle' | 'reviewing' | 'waiting' | 'error' | 'off' | 'elsewhere' | 'missing';
export interface ReviewerStatus { state: ReviewerState; detail?: string; lastAt?: number }

/** Where the document last changed, and when — by anyone. */
export interface Touch { offset: number; at: number }

/** A section is reviewed once it has been left alone this long. */
const SETTLE_MS = 2_000;
/** Below this a section has nothing to review yet. */
const MIN_WORDS = 8;
/** A very long section is reviewed around where it changed, not whole. */
const MAX_CHARS = 12_000;
const MAX_BACKOFF_MS = 5 * 60_000;

interface Options {
  collaborators: AiCollaborator[];
  myId: string | undefined;
  /** Writing, and the document is open. */
  active: boolean;
  format: DocFormat;
  title: string;
  content: string;
  readContent: () => string;
  readNodes: () => OutlineNode[];
  touched: React.MutableRefObject<Touch | null>;
  onReplace: (start: number, end: number, text: string) => void;
}

/** The section around an offset: its own text, the headings above it, and its title. */
function sectionAt(content: string, nodes: OutlineNode[], offset: number) {
  let index = -1;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].offset <= offset) index = i;
    else break;
  }
  const start = index >= 0 ? nodes[index].offset : 0;
  const end = index + 1 < nodes.length ? nodes[index + 1].offset : content.length;
  const trail: string[] = [];
  if (index >= 0) {
    let level = nodes[index].level;
    trail.unshift(nodes[index].label);
    for (let i = index - 1; i >= 0 && level > 1; i--) {
      if (nodes[i].level < level) { trail.unshift(nodes[i].label); level = nodes[i].level; }
    }
  }
  let text = content.slice(start, end);
  let base = start;
  if (text.length > MAX_CHARS) {
    // Keep the paragraphs around the change.
    const local = Math.max(0, offset - start - MAX_CHARS / 2);
    const from = Math.max(0, text.lastIndexOf('\n\n', local));
    text = text.slice(from, from + MAX_CHARS);
    base = start + from;
  }
  return {
    start,
    base,
    text,
    label: index >= 0 ? nodes[index].label : 'Opening',
    path: trail.length ? trail.join(' > ') : 'The opening, before the first heading',
  };
}

function outlineText(nodes: OutlineNode[]): string {
  return nodes.map(node => `${'  '.repeat(Math.max(0, node.level - 1))}- ${node.label}`).join('\n').slice(0, 6000);
}

/** The saved credential that runs a collaborator, if this browser has it. */
export function credentialFor(collaborator: AiCollaborator): AiCredential | undefined {
  return getCredentials().find(credential => credential.id === collaborator.id);
}

let seq = 0;

export function useAiReviewers({
  collaborators, myId, active, format, title, content, readContent, readNodes, touched, onReplace,
}: Options) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ReviewerStatus>>({});
  const dismissed = useRef(new Set<string>());
  /** What each reviewer last read of each section, so an unchanged one is not sent again. */
  const reviewed = useRef(new Map<string, string>());
  const busy = useRef(new Set<string>());
  const backoff = useRef(new Map<string, { until: number; step: number }>());
  const current = useRef(suggestions);
  current.current = suggestions;
  const latest = useRef({ format, title, readContent, readNodes });
  latest.current = { format, title, readContent, readNodes };

  const setStatus = (id: string, status: ReviewerStatus) =>
    setStatuses(all => ({ ...all, [id]: { ...all[id], ...status } }));

  /** Who runs here, with the credential they run on. */
  const runnable = useMemo(() => collaborators
    .filter(c => c.enabled && (!c.addedBy || !myId || c.addedBy === myId))
    .map(c => ({ collaborator: c, credential: credentialFor(c) }))
    .filter((row): row is { collaborator: AiCollaborator; credential: AiCredential } => !!row.credential),
  [collaborators, myId]);

  // What is shown for the ones that do not run here.
  const shown = useMemo(() => {
    const out: Record<string, ReviewerStatus> = {};
    for (const c of collaborators) {
      const mine = !c.addedBy || !myId || c.addedBy === myId;
      if (!c.enabled) out[c.id] = { state: 'off' };
      else if (!runnable.some(row => row.collaborator.id === c.id)) {
        // Added here but its model is gone from Settings, or added by someone else.
        out[c.id] = mine ? { state: 'missing', detail: 'Its model is no longer saved in Settings' } : { state: 'elsewhere' };
      }
      else out[c.id] = statuses[c.id] ?? { state: 'idle' };
    }
    return out;
  }, [collaborators, myId, runnable, statuses]);

  const tick = useCallback(async (collaborator: AiCollaborator, credential: AiCredential) => {
    const id = collaborator.id;
    if (document.visibilityState === 'hidden' || busy.current.has(id)) return;
    const wait = backoff.current.get(id);
    if (wait && Date.now() < wait.until) return;
    const touch = touched.current;
    if (!touch || Date.now() - touch.at < SETTLE_MS) return;

    const { format, title, readContent, readNodes } = latest.current;
    const content = readContent();
    const nodes = readNodes();
    const section = sectionAt(content, nodes, Math.min(touch.offset, content.length));
    const text = section.text.trim();
    if (text.split(/\s+/).filter(Boolean).length < MIN_WORDS) return;
    const key = `${id}|${section.path}`;
    if (reviewed.current.get(key) === text) return;

    busy.current.add(id);
    setStatus(id, { state: 'reviewing', detail: section.label });
    try {
      const seen = [
        ...current.current.filter(s => s.reviewerId === id).map(s => s.quote),
        ...dismissed.current,
      ].slice(-40);
      const found = await reviewSection({
        format, title, section: section.path, text, outline: outlineText(nodes),
        instructions: collaborator.instructions, seen,
      }, credential);
      reviewed.current.set(key, text);
      backoff.current.delete(id);
      setStatus(id, { state: 'idle', detail: undefined, lastAt: Date.now() });
      const fresh = found.filter(s => !dismissed.current.has(s.quote) && !current.current.some(o => o.quote === s.quote));
      if (fresh.length) {
        setSuggestions(all => [...all, ...fresh.map(s => ({
          ...s,
          id: `sg-${++seq}`,
          reviewerId: id,
          reviewerName: collaborator.name,
          sectionStart: section.start,
          sectionLabel: section.label,
          at: Date.now(),
        }))]);
      }
    } catch (error) {
      const step = (backoff.current.get(id)?.step ?? 0) + 1;
      if (isRetryable(error)) {
        const asked = error instanceof ApiError && error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : 0;
        const delay = Math.min(MAX_BACKOFF_MS, asked || collaborator.intervalSeconds * 1000 * 2 ** step);
        backoff.current.set(id, { until: Date.now() + delay, step });
        setStatus(id, { state: 'waiting', detail: `Rate limited — trying again in ${Math.ceil(delay / 1000)}s` });
      } else {
        // A rejected key or a refused request will not fix itself by asking
        // again. A provider refusal stops this reviewer until its settings
        // change (and has already been shown as a dialog); anything else
        // waits the longest backoff and says why.
        const refused = isRejection(error);
        backoff.current.set(id, { until: refused ? Infinity : Date.now() + MAX_BACKOFF_MS, step });
        const message = errorMessage(error, 'The review failed');
        setStatus(id, { state: 'error', detail: message });
        if (step === 1 && !refused) toast.error(`${collaborator.name} could not review`, { description: message });
      }
    } finally {
      busy.current.delete(id);
    }
  }, [touched]);

  useEffect(() => {
    if (!active) return;
    const timers = runnable.map(({ collaborator, credential }) =>
      window.setInterval(() => { void tick(collaborator, credential); }, Math.max(5, collaborator.intervalSeconds) * 1000));
    return () => timers.forEach(timer => window.clearInterval(timer));
  }, [active, runnable, tick]);

  // A suggestion whose passage is gone — edited away, or accepted — goes too.
  useEffect(() => {
    setSuggestions(all => (all.some(s => !content.includes(s.quote)) ? all.filter(s => content.includes(s.quote)) : all));
  }, [content]);

  // Settings changed (or a reviewer removed): forget what it last read, and drop its suggestions if it is gone.
  useEffect(() => {
    reviewed.current.clear();
    backoff.current.clear();
    setSuggestions(all => all.filter(s => collaborators.some(c => c.id === s.reviewerId && c.enabled)));
  }, [collaborators]);

  const accept = useCallback((id: string) => {
    const suggestion = current.current.find(s => s.id === id);
    if (!suggestion) return;
    const text = latest.current.readContent();
    const hits: number[] = [];
    for (let i = text.indexOf(suggestion.quote); i >= 0; i = text.indexOf(suggestion.quote, i + 1)) hits.push(i);
    const at = hits.sort((a, b) => Math.abs(a - suggestion.sectionStart) - Math.abs(b - suggestion.sectionStart))[0];
    dismissed.current.add(suggestion.quote);
    setSuggestions(all => all.filter(s => s.id !== id));
    if (at === undefined) {
      toast.info('That passage has changed since — nothing to replace.');
      return;
    }
    onReplace(at, at + suggestion.quote.length, suggestion.replacement);
  }, [onReplace]);

  const dismiss = useCallback((id: string) => {
    const suggestion = current.current.find(s => s.id === id);
    if (suggestion) dismissed.current.add(suggestion.quote);
    setSuggestions(all => all.filter(s => s.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    current.current.forEach(s => dismissed.current.add(s.quote));
    setSuggestions([]);
  }, []);

  return useMemo(() => ({
    suggestions, statuses: shown, accept, dismiss, dismissAll,
    running: runnable.length,
  }), [accept, dismiss, dismissAll, runnable.length, shown, suggestions]);
}

export type AiReviewers = ReturnType<typeof useAiReviewers>;
