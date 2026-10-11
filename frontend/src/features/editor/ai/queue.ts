import { useEffect, useState, useSyncExternalStore } from 'react';
import { ApiError } from '@/lib/api';
import { isAiKeyDeclined } from '@/lib/aiKeyGate';
import { BLOCKS_THE_LINE, noteStopped } from '@/lib/aiRejection';
import { errorMessage } from '@/lib/utils';

/**
 * Every AI request a document makes, in one line.
 *
 * Jobs run one at a time, in the order they were asked for. That is the
 * shape section-by-section writing needs — section 4 is written knowing
 * sections 1–3 exist, and two answers never race to the same part of the
 * page — and it is also what keeps a free-tier key inside its rate limit.
 *
 * A rate limit or an overloaded model is not a failure here: the job waits
 * and tries again, with the wait growing (5s, 10s, 20s … capped at a minute)
 * and shown in the AI tab as a countdown. It keeps trying until it succeeds
 * or the writer cancels it. A failure that waiting cannot fix — a rejected
 * key, a refused prompt — fails at once.
 */

export type JobKind = 'section' | 'refine' | 'outline';
export type JobStatus = 'queued' | 'running' | 'retrying' | 'done' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  kind: JobKind;
  /** What the queue shows: the section's title, the action's name. */
  label: string;
  /** A source offset for section jobs, so the outline row can show its state. */
  key?: number;
  /** Jobs started together (a "write all") share one, for one progress bar. */
  batch?: string;
  status: JobStatus;
  /** Attempts made so far. */
  attempt: number;
  /** When the next attempt starts, while `retrying`. */
  retryAt?: number;
  /** Why the last attempt failed. */
  reason?: string;
  queuedAt: number;
  finishedAt?: number;
}

/**
 * What the asker hears about each attempt. Called on every run, retries
 * included — the promise `add` returns settles once, so a panel that only
 * listened to it never heard about a retry it did not start.
 */
export interface JobEvents {
  start?: () => void;
  done?: () => void;
  fail?: (error: unknown) => void;
}

interface Entry {
  job: Job;
  run: (signal: AbortSignal) => Promise<void>;
  on?: JobEvents;
  controller?: AbortController;
  timer?: ReturnType<typeof setTimeout>;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000];

/** Whether waiting could fix this failure. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) return RETRYABLE.has(error.status);
  // `fetch` rejects with a TypeError when the network itself failed.
  return error instanceof TypeError;
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export interface AiQueue {
  subscribe: (listener: () => void) => () => void;
  snapshot: () => Job[];
  /** Add a job; resolves when it finishes, rejects if it fails or is cancelled. */
  add: (spec: {
    kind: JobKind; label: string; key?: number; batch?: string;
    run: (signal: AbortSignal) => Promise<void>;
    on?: JobEvents;
  }) => Promise<void>;
  cancel: (id: string) => void;
  /** Cancel every job not yet finished — of one kind, or all. */
  cancelAll: (kind?: JobKind) => void;
  /** Run a failed or cancelled job again. */
  retry: (id: string) => void;
  /** Skip the wait on a job that is backing off. */
  retryNow: (id: string) => void;
  /** Take one job off the list, cancelling it first if it has not finished. */
  remove: (id: string) => void;
  clearFinished: () => void;
  dispose: () => void;
}

export class JobCancelled extends Error {
  constructor() { super('Cancelled'); this.name = 'JobCancelled'; }
}

export function createAiQueue(): AiQueue {
  const entries: Entry[] = [];
  const listeners = new Set<() => void>();
  const settle = new Map<string, { resolve: () => void; reject: (e: unknown) => void }>();
  let jobs: Job[] = [];
  let pumping = false;
  let seq = 0;

  const publish = () => {
    jobs = entries.map(e => e.job);
    listeners.forEach(listener => listener());
  };
  const update = (entry: Entry, patch: Partial<Job>) => {
    entry.job = { ...entry.job, ...patch };
    publish();
  };

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    try {
      for (;;) {
        const entry = entries.find(e => e.job.status === 'queued');
        if (!entry) break;
        const controller = new AbortController();
        entry.controller = controller;
        update(entry, { status: 'running', attempt: entry.job.attempt + 1, retryAt: undefined });
        entry.on?.start?.();
        // A cancel frees the line at once. Most runs cannot be interrupted
        // mid-request, and waiting for one held every job behind it — and a
        // retry pressed in the meantime never started, because the pump was
        // still parked on the cancelled run.
        const aborted = new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
        });
        try {
          await Promise.race([entry.run(controller.signal), aborted]);
          if (controller.signal.aborted || entry.job.status === 'cancelled') continue;
          update(entry, { status: 'done', finishedAt: Date.now(), reason: undefined });
          entry.on?.done?.();
          settle.get(entry.job.id)?.resolve();
        } catch (error) {
          if (entry.job.status === 'cancelled' || isAbort(error)) {
            entry.on?.fail?.(new JobCancelled());
            continue;
          }
          if (isAiKeyDeclined(error)) {
            // Asked for a key and the writer closed the dialog: everything
            // waiting would ask again, so the whole line stands down.
            cancelEverything();
            continue;
          }
          const reason = errorMessage(error, 'The request failed');
          if (error instanceof ApiError && error.rejection && BLOCKS_THE_LINE.has(error.rejection.kind)) {
            // A rejected key or a missing model fails every job behind this
            // one the same way: stop them, and say so in the dialog.
            update(entry, { status: 'failed', finishedAt: Date.now(), reason });
            entry.on?.fail?.(error);
            settle.get(entry.job.id)?.reject(error);
            const waiting = entries.filter(e => e !== entry && ['queued', 'retrying'].includes(e.job.status));
            waiting.forEach(stop);
            publish();
            noteStopped(waiting.length);
            continue;
          }
          if (isRetryable(error)) {
            // The provider's own "try again in N s" wins over the guess, plus
            // a little slack so the next attempt lands after its window opens.
            const asked = error instanceof ApiError && error.retryAfterSeconds ? error.retryAfterSeconds * 1000 + 750 : 0;
            const wait = asked || BACKOFF_MS[Math.min(entry.job.attempt - 1, BACKOFF_MS.length - 1)];
            update(entry, { status: 'retrying', retryAt: Date.now() + wait, reason });
            entry.timer = setTimeout(() => {
              if (entry.job.status !== 'retrying') return;
              update(entry, { status: 'queued', retryAt: undefined });
              void pump();
            }, wait);
            continue;
          }
          update(entry, { status: 'failed', finishedAt: Date.now(), reason });
          entry.on?.fail?.(error);
          settle.get(entry.job.id)?.reject(error);
        }
      }
    } finally {
      pumping = false;
    }
  };

  const stop = (entry: Entry) => {
    if (['done', 'failed', 'cancelled'].includes(entry.job.status)) return;
    if (entry.timer) clearTimeout(entry.timer);
    const running = entry.job.status === 'running';
    entry.job = { ...entry.job, status: 'cancelled', finishedAt: Date.now(), retryAt: undefined };
    entry.controller?.abort();
    // A running job hears about its cancel from the pump; one still waiting
    // has no attempt in flight to report it, so it is told here.
    if (!running) entry.on?.fail?.(new JobCancelled());
    settle.get(entry.job.id)?.reject(new JobCancelled());
  };
  const cancelEverything = () => { entries.forEach(stop); publish(); };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => jobs,
    add({ kind, label, key, batch, run, on }) {
      const id = `job-${++seq}`;
      const promise = new Promise<void>((resolve, reject) => settle.set(id, { resolve, reject }));
      // Nobody has to handle a cancellation they did not ask about.
      promise.catch(() => {});
      entries.push({ job: { id, kind, label, key, batch, status: 'queued', attempt: 0, queuedAt: Date.now() }, run, on });
      publish();
      void pump();
      return promise;
    },
    cancel(id) {
      const entry = entries.find(e => e.job.id === id);
      if (entry) { stop(entry); publish(); void pump(); }
    },
    cancelAll(kind) {
      entries.filter(e => !kind || e.job.kind === kind).forEach(stop);
      publish();
    },
    retry(id) {
      const entry = entries.find(e => e.job.id === id);
      if (!entry || !['failed', 'cancelled'].includes(entry.job.status)) return;
      const promise = new Promise<void>((resolve, reject) => settle.set(id, { resolve, reject }));
      promise.catch(() => {});
      entry.controller = undefined;
      update(entry, { status: 'queued', reason: undefined, finishedAt: undefined, attempt: 0, queuedAt: Date.now() });
      void pump();
    },
    retryNow(id) {
      const entry = entries.find(e => e.job.id === id);
      if (!entry || entry.job.status !== 'retrying') return;
      if (entry.timer) clearTimeout(entry.timer);
      update(entry, { status: 'queued', retryAt: undefined });
      void pump();
    },
    remove(id) {
      const at = entries.findIndex(e => e.job.id === id);
      if (at < 0) return;
      stop(entries[at]);
      entries.splice(at, 1);
      settle.delete(id);
      publish();
      void pump();
    },
    clearFinished() {
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (['done', 'failed', 'cancelled'].includes(entries[i].job.status)) entries.splice(i, 1);
      }
      publish();
    },
    dispose() {
      entries.forEach(stop);
      listeners.clear();
    },
  };
}

/** The queue's jobs, kept live. */
export function useAiJobs(queue: AiQueue): Job[] {
  return useSyncExternalStore(queue.subscribe, queue.snapshot, queue.snapshot);
}

export const isActive = (job: Job) => job.status === 'queued' || job.status === 'running' || job.status === 'retrying';

/** Re-render once a second while `active` — for the retry countdowns. */
export function useSecondTick(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick(n => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);
}
