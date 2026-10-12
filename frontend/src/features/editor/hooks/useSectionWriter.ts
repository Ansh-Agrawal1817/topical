import { useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import type { DocFormat } from '@/lib/types';
import type { OutlineNode } from '../lib/outline';
import {
  ancestorTitles, childTitles, coveredDigest, indexOutline, locateTarget, outlineDigest, pathNumber, sectionGist,
  sectionWords, targetKey, targetOf, type OutlineTree, type SectionTarget,
} from '../lib/tree';
import { buildOutline } from '../lib/outline';
import { headingShape } from '../lib/sections';
import { generateSection } from '../lib/generation';
import { collectLabels, labelDigest } from '@/features/preview/latex/labels';
import { isActive, useAiJobs, type AiQueue } from '../ai/queue';
import type { RowStatus } from '../components/OutlineRow';

/** Which sections a batch covers. */
export type WriteScope = 'all' | 'missing';

interface Options {
  format: DocFormat;
  projectName: string;
  tree: OutlineTree;
  /** Words written under a heading, by source offset. */
  wordsOf: (node: OutlineNode) => number;
  /** File a section under its heading; `near` picks between headings that share a title. */
  onInsertSection: (text: string, title: string, replace: boolean, near?: number) => void;
  /** Keep the document showing whichever section is being written. */
  onFocusSection?: (node: OutlineNode) => void;
  /** Prose already written, read at request time, so each section matches the document's voice. */
  styleSample?: () => string;
  /** The document as it stands now — a job reads it when it starts, not when it was queued. */
  readContent: () => string;
  /** The context shelf's switched-on pages, read when each job starts. */
  readUrls: () => string[];
  /**
   * A batch is about to write `count` sections, or has finished with `written`
   * of them — the moments worth a snapshot in the document's history.
   */
  onBatch?: (event: { phase: 'start'; count: number } | { phase: 'end'; written: number }) => void;
  queue: AiQueue;
}

/** How much of the document just before a section it is shown, to continue from. */
const LEAD_IN_CHARS = 700;

/**
 * Turning outline rows into prose, one section at a time, through the AI queue.
 *
 * Each row is a job. Jobs run in order, one at a time, and each reads the
 * document *when it starts* — so by the time section 4 is written, sections
 * 1–3 are on the page, the outline digest marks them written, and their
 * opening words are in the prompt as what is already covered. A rate limit
 * pauses the line and retries instead of failing it (see `ai/queue.ts`).
 *
 * What a request carries is deliberately thin: the outline as numbered
 * titles; a dozen words of what each *neighbouring* section says; the tail of
 * the text just before this one; a sample of the writer's voice; and the
 * shelf passages about this section. Enough to fit in, without sending the
 * document whole — which would defeat writing it section by section.
 */
export function useSectionWriter({
  format, projectName, tree, wordsOf, onInsertSection, onFocusSection, styleSample, readContent, readUrls, onBatch, queue,
}: Options) {
  const jobs = useAiJobs(queue);
  const latest = useRef({ format, projectName, onInsertSection, onFocusSection, styleSample, readContent, readUrls, onBatch });
  latest.current = { format, projectName, onInsertSection, onFocusSection, styleSample, readContent, readUrls, onBatch };

  /**
   * Row state by heading offset *now*: queued, being written (or retried),
   * failed. Jobs name their section by its place in the outline, so the state
   * follows the row wherever the text around it has moved.
   */
  const status = useMemo(() => {
    const byTarget: Record<string, RowStatus | undefined> = {};
    for (const job of jobs) {
      if (job.kind !== 'section' || job.target === undefined) continue;
      if (job.status === 'queued') byTarget[job.target] = 'queued';
      else if (job.status === 'running' || job.status === 'retrying') byTarget[job.target] = 'generating';
      else if (job.status === 'failed') byTarget[job.target] = 'failed';
      else delete byTarget[job.target];
    }
    const out: Record<number, RowStatus> = {};
    if (!Object.keys(byTarget).length) return out;
    tree.nodes.forEach((node, index) => {
      const state = byTarget[targetKey(targetOf(tree, index))];
      if (state) out[node.offset] = state;
    });
    return out;
  }, [jobs, tree]);

  /** Sections with no prose behind them yet — what "write the rest" means. */
  const missing = useMemo(
    () => tree.nodes.filter(node => node.label.trim() && wordsOf(node) === 0),
    [tree, wordsOf],
  );
  const outline = useRef({ tree, missing, status });
  outline.current = { tree, missing, status };

  /**
   * The row a job writes, found again in the document as it is now — by its
   * place in the outline, never by where its heading used to be.
   */
  const locate = (target: SectionTarget, label: string) => {
    const { format, readContent } = latest.current;
    const content = readContent();
    const nodes = buildOutline(content, format);
    const fresh = indexOutline(nodes);
    const index = locateTarget(fresh, target);
    if (index === null) throw new Error(`"${label}" is no longer in the outline — it was renamed, moved or removed.`);
    return { content, nodes, fresh, index, here: nodes[index] };
  };

  /** One section, as a job. The request is built when the job starts. */
  const enqueue = useCallback((node: OutlineNode, instruction: string, batch?: string) => {
    const { tree } = outline.current;
    const index = tree.byOffset.get(node.offset);
    const target = index === undefined ? { trail: [node.label.trim().toLowerCase()], nth: 0 } : targetOf(tree, index);
    return queue.add({
    kind: 'section',
    label: node.label,
    target: targetKey(target),
    batch,
    run: async signal => {
      const { format, projectName, onInsertSection, onFocusSection, styleSample, readUrls } = latest.current;
      const { content, nodes, fresh, index, here } = locate(target, node.label);
      onFocusSection?.(here);

      const own = sectionWords(fresh, content, format).own;
      const ownWords = (n: OutlineNode) => own.get(n.offset) ?? 0;
      const shape = headingShape(content, format, here.offset);
      const text = await generateSection({
        format,
        method: readUrls().length ? 'urls' : 'llm',
        mainTopic: projectName,
        section: { title: here.label, level: shape.level },
        children: childTitles(fresh, index),
        ancestors: ancestorTitles(fresh, index),
        sectionNumber: pathNumber(fresh.entries[index]),
        digest: outlineDigest(fresh, {
          words: ownWords,
          focus: index,
          gist: n => sectionGist(content, n, nodes[nodes.indexOf(n) + 1]),
        }),
        covered: coveredDigest(fresh, content, format, ownWords, index),
        urls: readUrls(),
        instruction,
        styleSample: styleSample?.(),
        leadIn: content.slice(Math.max(0, here.offset - LEAD_IN_CHARS), here.offset).trim(),
        labels: format === 'latex' ? labelDigest(collectLabels(content)) : undefined,
      });
      // Cancelled while the model was answering: the queue has moved on, and
      // the answer must not land in a document that stopped asking for it.
      if (signal.aborted) return;
      // Found again: the writer may have typed, or a collaborator edited,
      // while the model was answering. The heading is already on the page,
      // so this replaces what sits under it rather than adding a second copy.
      const now = locate(target, node.label).here;
      onInsertSection(text, now.label, true, now.offset);
    },
    });
  // `locate` reads only refs.
  }, [queue]);

  const writeSection = useCallback((node: OutlineNode, instruction = '') => {
    void enqueue(node, instruction).catch(() => { /* shown in the queue */ });
  }, [enqueue]);

  /**
   * Write a run of sections, in document order, as one batch in the queue.
   * Each still waits its turn, so the document is never written to twice at once.
   */
  const writeAll = useCallback((scope: WriteScope = 'missing', instruction = '') => {
    const { tree, missing, status } = outline.current;
    // A section already waiting or being written is not queued a second time —
    // pressing "write the empty ones" twice used to line every one up twice.
    const pending = (scope === 'all' ? tree.nodes : missing)
      .filter(node => node.label.trim() && status[node.offset] !== 'queued' && status[node.offset] !== 'generating');
    if (!pending.length) {
      toast.info(Object.values(status).some(s => s === 'queued' || s === 'generating')
        ? 'Those sections are already in the queue.'
        : scope === 'all' ? 'Add some sections to the outline first' : 'Every section already has content.');
      return;
    }
    const batch = `batch-${Date.now()}`;
    latest.current.onBatch?.({ phase: 'start', count: pending.length });
    const runs = pending.map(node => enqueue(node, instruction, batch));
    void Promise.allSettled(runs).then(results => {
      const done = results.filter(r => r.status === 'fulfilled').length;
      latest.current.onBatch?.({ phase: 'end', written: done });
      if (done === pending.length) toast.success(`Wrote ${done} ${done === 1 ? 'section' : 'sections'}`);
    });
  }, [enqueue]);

  /** The batch in flight, for the rail's progress bar. */
  const progress = useMemo(() => {
    const active = jobs.filter(job => job.kind === 'section' && job.batch && isActive(job));
    if (!active.length) return null;
    const batch = active[0].batch!;
    const all = jobs.filter(job => job.batch === batch);
    const done = all.filter(job => job.status === 'done').length;
    const now = all.find(job => job.status === 'running' || job.status === 'retrying');
    return { done, total: all.length, title: now?.label ?? active[0].label, retrying: now?.status === 'retrying' };
  }, [jobs]);

  const busy = jobs.some(job => job.kind === 'section' && isActive(job));
  const stop = useCallback(() => queue.cancelAll('section'), [queue]);

  // One object per meaningful change, so the panels it is handed to can skip
  // the renders that typing causes.
  return useMemo(() => ({
    status,
    busy,
    progress,
    missing: missing.length,
    writeSection,
    writeAll,
    stop,
  }), [status, busy, progress, missing.length, writeSection, writeAll, stop]);
}

export type SectionWriter = ReturnType<typeof useSectionWriter>;
