import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, CornerDownLeft, Copy, RotateCcw, Sparkles, X } from 'lucide-react';
import { Button, IconButton, Spinner } from '@/components/ui';
import { transformSelection } from '@/lib/api';
import type { DocFormat } from '@/lib/types';
import { AI_ACTIONS, CONTEXT_CHARS, MIN_PASSAGE_WORDS, type AiAction } from '../lib/aiActions';
import { rawHeadings, type OutlineNode } from '../lib/outline';
import { countWords } from '../lib/stats';
import { copyText } from '../lib/exporters';
import { keptShare, wordDiff } from '../lib/wordDiff';
import { JobCancelled, type AiQueue } from './queue';
import { Composer, type ComposerHandle } from './Composer';
import { collectLabels, labelDigest } from '@/features/preview/latex/labels';

/** The headings `offset` sits under, outermost first: "Results > Error analysis". */
function sectionTrail(outline: OutlineNode[], offset: number): string {
  const stack: OutlineNode[] = [];
  for (const node of outline) {
    if (node.offset > offset) break;
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    stack.push(node);
  }
  return stack.map(node => node.label).join(' > ');
}

/** The outline as indented text, the shape the AI service reads it in. */
function outlineText(outline: OutlineNode[]): string {
  return outline.map(node => `${'  '.repeat(Math.max(0, node.level - 1))}- ${node.label}`).join('\n');
}

/** Markup level of the heading a passage sits under — an edit may not add one at or above it. */
function sectionLevel(content: string, format: DocFormat, offset: number): number | undefined {
  let level: number | undefined;
  for (const heading of rawHeadings(content, format)) {
    if (heading.lineStart > offset) break;
    level = heading.level;
  }
  return level;
}

interface Target {
  start: number;
  end: number;
  passage: string;
  hasSelection: boolean;
  trail: string;
}

interface Props {
  selection: { start: number; end: number };
  content: string;
  format: DocFormat;
  title: string;
  outline: OutlineNode[];
  queue: AiQueue;
  /** Put a rewrite where the passage was; the passage is passed to check it is still there. */
  onReplace: (range: { start: number; end: number }, passage: string, text: string) => void;
  onInsertAfter: (at: number, text: string) => void;
  /** Bumped by ⌘J, to put the cursor in the instruction field. */
  focusSignal: number;
  /** An action asked for from elsewhere (the slash menu), run once per `at`. */
  runRequest?: { action: string; at: number };
}

/** The last slash-menu request run, by its timestamp. */
let lastRunAt = 0;

/**
 * Refine what is selected, from the AI tab.
 *
 * This replaced a panel that opened over the paragraph being edited, at the
 * cursor, and covered the text it was about. Here the selection is shown, the
 * actions are one click, a free instruction is a field away, and the result
 * is reviewed as a diff before anything touches the page. The request runs in
 * the AI queue, so a rate limit retries instead of failing.
 */
export function RefinePanel({
  selection, content, format, title, outline, queue, onReplace, onInsertAfter, focusSignal, runRequest,
}: Props) {
  const [instruction, setInstruction] = useState('');
  const [phase, setPhase] = useState<'idle' | 'running' | 'result'>('idle');
  const [action, setAction] = useState<AiAction | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [result, setResult] = useState('');
  const [view, setView] = useState<'changes' | 'result'>('changes');
  const jobRef = useRef<string | null>(null);
  const composerRef = useRef<ComposerHandle>(null);

  useEffect(() => { if (focusSignal) composerRef.current?.focus(); }, [focusSignal]);

  const passage = content.slice(selection.start, selection.end);
  const hasSelection = passage.trim().length > 0;
  const words = countWords(passage, format);
  const actions = AI_ACTIONS.filter(a => a.id !== 'custom' && (hasSelection || a.worksOnCaret));

  const diff = useMemo(
    () => (phase === 'result' && action?.replaces && target?.hasSelection ? wordDiff(target.passage, result) : null),
    [action, phase, result, target],
  );

  /**
   * Ask for an edit. `again` re-runs on the passage the last result was for —
   * "Try another" used to read the *current* selection, so after clicking
   * anywhere in the document it rewrote whatever was selected now, or
   * nothing at all.
   */
  const run = (chosen: AiAction, custom = '', previous = '', again?: Target) => {
    const base = again ?? { start: selection.start, end: selection.end, passage, hasSelection };
    if (!again && chosen.needsPassage && words < MIN_PASSAGE_WORDS) {
      toast.info(`"${chosen.label}" needs at least ${MIN_PASSAGE_WORDS} words selected.`);
      return;
    }
    const runUp = content.slice(Math.max(0, base.start - (base.hasSelection ? CONTEXT_CHARS : CONTEXT_CHARS * 2)), base.start);
    const next: Target = {
      start: base.start, end: base.end, passage: base.passage, hasSelection: base.hasSelection,
      trail: sectionTrail(outline, base.start),
    };
    setTarget(next);
    setAction(chosen);
    setPhase('running');
    const preview = next.hasSelection ? `“${next.passage.trim().split(/\s+/).slice(0, 6).join(' ')}…”` : 'at the cursor';
    let text = '';
    queue.add({
      kind: 'refine',
      label: `${chosen.id === 'custom' ? 'Instruction' : chosen.label} · ${preview}`,
      run: async () => {
        text = (await transformSelection({
          action: chosen.id,
          selection: next.hasSelection ? next.passage : runUp,
          format,
          instruction: custom,
          before: next.hasSelection ? runUp : '',
          after: content.slice(next.end, next.end + CONTEXT_CHARS),
          title,
          section: next.trail,
          outline: outlineText(outline),
          previous,
          level: sectionLevel(content, format, next.start),
          labels: format === 'latex' ? labelDigest(collectLabels(content)) : undefined,
        })).trim();
        if (!text) throw new Error('The model returned nothing. Try again.');
      },
      // Per attempt, so a retry from the queue lands here as well.
      on: {
        start: () => { setTarget(next); setAction(chosen); setPhase('running'); },
        done: () => {
          setResult(text);
          setView('changes');
          setPhase('result');
        },
        fail: error => {
          setPhase('idle');
          if (!(error instanceof JobCancelled)) toast.error('The edit failed — retry it from the queue below.');
        },
      },
    });
    const all = queue.snapshot();
    jobRef.current = all[all.length - 1]?.id ?? null;
  };

  // An action sent from the slash menu runs once. Remembered outside the
  // component: switching tabs remounts this panel with the same request,
  // which must not run it a second time.
  useEffect(() => {
    if (!runRequest || runRequest.at <= lastRunAt) return;
    lastRunAt = runRequest.at;
    const chosen = AI_ACTIONS.find(a => a.id === runRequest.action);
    if (chosen) run(chosen);
  });

  const runInstruction = () => {
    const text = instruction.trim();
    if (!text) return;
    run(AI_ACTIONS.find(a => a.id === 'custom')!, text);
  };

  const accept = () => {
    if (!action || !target) return;
    if (action.replaces && target.hasSelection) onReplace(target, target.passage, result);
    else onInsertAfter(target.end, result);
    setPhase('idle');
    setResult('');
  };

  const insertBelow = () => {
    if (!target) return;
    onInsertAfter(target.end, result);
    setPhase('idle');
    setResult('');
  };

  // Where the passage sits, by its innermost heading: "in Error analysis".
  const where = sectionTrail(outline, selection.start).split(' > ').pop();
  const canReplace = !!(action?.replaces && target?.hasSelection);

  return (
    <div className="ai-tab">
      {phase !== 'result' && (
        <>
          <div className="ai-target" data-empty={!hasSelection || undefined}>
            <div className="ai-target-head">
              <span className="ai-label">{hasSelection ? 'Selection' : 'At the cursor'}</span>
              {hasSelection && <span className="ai-count">{words} {words === 1 ? 'word' : 'words'}</span>}
              {where && <span className="ai-target-where" title={sectionTrail(outline, selection.start)}>in {where}</span>}
            </div>
            {hasSelection ? (
              <p className="ai-target-text">{passage.trim().slice(0, 240)}{passage.trim().length > 240 ? '…' : ''}</p>
            ) : (
              <p className="ai-target-hint">Select a passage in the document to rewrite it. With nothing selected, the AI writes on from the cursor.</p>
            )}
          </div>

          <div className="ai-actions" role="group" aria-label="Quick edits" data-single={actions.length === 1 || undefined}>
            {actions.map(item => {
              const short = !!item.needsPassage && words < MIN_PASSAGE_WORDS;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="ai-action"
                  disabled={phase === 'running' || short}
                  title={short ? `Needs at least ${MIN_PASSAGE_WORDS} words selected` : item.hint}
                  onClick={() => run(item)}
                >
                  <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <Composer
            ref={composerRef}
            label="Instruction"
            placeholder={hasSelection ? 'Or describe the change…' : 'Or say what to write here…'}
            value={instruction}
            onChange={setInstruction}
            onSubmit={runInstruction}
            submitDisabled={!instruction.trim()}
            disabled={phase === 'running'}
            submitIcon={<Sparkles className="h-3 w-3" aria-hidden="true" />}
            submitLabel="Run"
          />
        </>
      )}

      {phase === 'running' && (
        <div className="ai-pending" aria-live="polite">
          <Spinner size="2xs" tone="accent" />
          <span>{action?.id === 'custom' ? 'Working on it…' : `${action?.label}…`}</span>
          <Button variant="ghost" size="xs" onClick={() => { if (jobRef.current) queue.cancel(jobRef.current); }}>
            <X className="h-3 w-3" aria-hidden="true" /> Cancel
          </Button>
        </div>
      )}

      {phase === 'result' && action && target && (
        <section className="ai-result" aria-label="Result">
          <header className="ai-result-head">
            <span className="ai-label">{action.id === 'custom' ? 'Instruction' : action.label}</span>
            {diff && (
              <span className="ai-result-kept" title="Share of the original words the edit kept">
                {Math.round(keptShare(diff) * 100)}% kept
              </span>
            )}
            {diff && (
              <div className="ai-switch ai-result-view" role="tablist" aria-label="Show">
                <button type="button" role="tab" aria-selected={view === 'changes'} onClick={() => setView('changes')}>Changes</button>
                <button type="button" role="tab" aria-selected={view === 'result'} onClick={() => setView('result')}>Result</button>
              </div>
            )}
          </header>

          {!action.replaces ? (
            <div className="ai-result-body ai-result-body--answer">
              {result.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}
            </div>
          ) : (
            <div className="ai-result-body" data-view={diff ? view : 'result'}>
              {diff && view === 'changes'
                ? diff.map((part, i) => (part.kind === 'same'
                  ? <span key={i}>{part.text}</span>
                  : part.kind === 'cut' ? <del key={i}>{part.text}</del> : <ins key={i}>{part.text}</ins>))
                : result}
            </div>
          )}

          <footer className="ai-result-actions">
            {canReplace && (
              <Button variant="primary" size="xs" onClick={accept}><Check className="h-3 w-3" aria-hidden="true" /> Replace</Button>
            )}
            <Button variant={canReplace ? 'secondary' : 'primary'} size="xs" onClick={insertBelow}>
              <CornerDownLeft className="h-3 w-3" aria-hidden="true" /> Insert below
            </Button>
            <span className="ai-result-tools">
              <IconButton size="sm" onClick={() => copyText(result).then(() => toast.success('Copied'))} title="Copy" aria-label="Copy the result">
                <Copy className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton size="sm" onClick={() => run(action, instruction, result, target)} title="Try another version" aria-label="Try another version">
                <RotateCcw className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton size="sm" onClick={() => setPhase('idle')} title="Discard" aria-label="Discard the result">
                <X className="h-3.5 w-3.5" />
              </IconButton>
            </span>
          </footer>
          <p className="ai-note">Nothing changes in the document until you choose.</p>
        </section>
      )}
    </div>
  );
}
