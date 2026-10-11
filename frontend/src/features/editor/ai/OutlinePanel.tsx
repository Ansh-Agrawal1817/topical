import { OUTLINE_COMPLETIONS, subjectCompletions } from './completions';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileSearch, RotateCcw, Sparkles, X } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { isRejection } from '@/lib/api';
import type { DocFormat } from '@/lib/types';
import type { OutlineNode } from '../lib/outline';
import type { PlanItem } from '../lib/plan';
import { indexOutline, sectionWords } from '../lib/tree';
import { fetchHierarchy, outlineDraft, refinePlan, type RefinedPlan } from '../lib/generation';
import { OutlineProposal } from '../components/OutlineProposal';
import { Composer, type Suggestion } from './Composer';
import { JobCancelled, type AiQueue } from './queue';

/**
 * Openers for the instruction, once there is a structure to change. The chip
 * is a word; the sentence it adds is the instruction. "Add a section on " is
 * left unfinished, with the caret at its end, for the subject to be typed.
 */
const SUGGESTIONS: Suggestion[] = [
  { label: 'Add section', text: 'Add a section on ', unfinished: true },
  { label: 'Reorder', text: 'Reorder so it builds logically.' },
  { label: 'Split', text: 'Split anything covering two ideas.' },
  { label: 'Trim', text: 'Trim it to the essentials.' },
  { label: 'Deepen', text: 'Break the long sections into sub-sections.' },
];

/**
 * What was asked: change the outline there is, build a new one from the
 * subject, or read one off the draft. Kept with the proposal, so "Try again"
 * asks the same question for a different answer.
 */
type Ask = { mode: 'refine' | 'fresh' | 'draft'; text: string };

const WORKING_TEXT: Record<Ask['mode'], string> = {
  refine: 'Reworking the structure…',
  fresh: 'Drafting an outline…',
  draft: 'Reading the draft…',
};

/**
 * AI over the document's structure: build an outline from a subject, change
 * the one there is with an instruction, or read one off the draft. Every
 * answer comes back as a proposal — the structure it would produce, what
 * each row keeps, and what it removes — to apply, ask again, or discard.
 * Runs in the AI queue.
 */
export function OutlinePanel({
  format, projectName, content, nodes, queue, onApplyOutline,
}: {
  format: DocFormat;
  projectName: string;
  content: string;
  nodes: OutlineNode[];
  queue: AiQueue;
  onApplyOutline: (plan: PlanItem[]) => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [working, setWorking] = useState<Ask['mode'] | null>(null);
  const [proposal, setProposal] = useState<{ plan: RefinedPlan; ask: Ask } | null>(null);
  const jobRef = useRef<string | null>(null);
  const tree = useMemo(() => indexOutline(nodes), [nodes]);
  const own = useMemo(() => sectionWords(tree, content, format).own, [tree, content, format]);
  const hasOutline = nodes.length > 0;
  const written = nodes.filter(node => (own.get(node.offset) ?? 0) > 0).length;
  const depth = nodes.reduce((deepest, node) => Math.max(deepest, node.level), 0);
  const hasDraft = content.trim().length > 0;
  const subject = projectName.trim();

  /** The outline as it stands, with what each row holds — for the proposal's keep/remove preview. */
  const current = useMemo(
    () => nodes.map(node => ({ title: node.label, words: own.get(node.offset) ?? 0 })),
    [nodes, own],
  );

  const ask = (request: Ask) => {
    if (request.mode === 'draft' && !hasDraft) {
      toast.info('Write something first — this reads the page you already have.');
      return;
    }
    const topic = request.text || subject;
    if (request.mode === 'fresh' && !topic) {
      toast.info('Name the subject first.');
      return;
    }
    let result: RefinedPlan | null = null;
    setProposal(null);
    queue.add({
      kind: 'outline',
      label: request.mode === 'draft' ? 'Outline from the draft'
        : request.mode === 'refine' ? `Outline: ${request.text || 'improve the structure'}`
        : `New outline for “${topic}”`,
      run: async () => {
        if (request.mode === 'draft') {
          const plan = await outlineDraft(content, format);
          result = { summary: `Read the draft and proposed ${plan.length} sections.`, plan, changes: [] };
        } else if (request.mode === 'refine') {
          // The model is told what each row already holds: moving a section
          // carrying 900 words is not the same as moving an empty heading.
          result = await refinePlan(
            nodes.map(node => ({ title: node.label, level: node.level, words: own.get(node.offset) ?? 0 })),
            projectName, request.text, format,
          );
        } else {
          // A subject plus how to shape it: "Graph theory — for first-years, 6 sections".
          const query = request.text && subject && request.text !== subject ? `${subject} — ${request.text}` : topic;
          const plan = await fetchHierarchy(query);
          result = { summary: `Proposed ${plan.length} sections.`, plan, changes: [] };
        }
      },
      // Per attempt, so a retry from the queue comes back here too.
      on: {
        start: () => setWorking(request.mode),
        done: () => {
          setWorking(null);
          if (!result) return;
          if (request.mode === 'refine' && !result.changes.length) toast.info(result.summary || 'The model left the structure as it was.');
          setProposal({ plan: result, ask: request });
          setInstruction('');
        },
        fail: error => {
          setWorking(null);
          // A provider refusal has its own dialog; anything else is a toast.
          if (!(error instanceof JobCancelled) && !isRejection(error)) toast.error('The outline request failed — retry it from the queue below.');
        },
      },
    });
    const all = queue.snapshot();
    jobRef.current = all[all.length - 1]?.id ?? null;
  };

  const submit = () => ask({ mode: hasOutline ? 'refine' : 'fresh', text: instruction.trim() });

  // With no outline yet, the document's title is the obvious subject.
  const suggestions: Suggestion[] = hasOutline
    ? SUGGESTIONS
    : subject ? [{ label: 'Use the title', text: subject }] : [];

  return (
    <div className="ai-tab">
      {hasOutline ? (
        <div className="ai-stat">
          <div className="ai-stat-row">
            <span><b>{nodes.length}</b> section{nodes.length === 1 ? '' : 's'} · {depth} level{depth === 1 ? '' : 's'} deep</span>
            <span className="ai-stat-aside">{written} written</span>
          </div>
        </div>
      ) : (
        <p className="ai-intro">
          Name the subject and get a full outline to start from — sections and sub-sections, ready to write.
        </p>
      )}

      <Composer
        label={hasOutline ? 'How to change the outline' : 'What this document is about'}
        placeholder={hasOutline
          ? 'What should change? Leave it blank to let the model decide'
          : `e.g. ${subject || 'Retrieval-augmented generation'}`}
        value={instruction}
        onChange={setInstruction}
        onSubmit={submit}
        suggestions={suggestions}
        completions={hasOutline ? OUTLINE_COMPLETIONS : subjectCompletions(projectName)}
        submitDisabled={!hasOutline && !instruction.trim()}
        disabled={working !== null}
        submitIcon={<Sparkles className="h-3 w-3" aria-hidden="true" />}
        submitLabel={hasOutline ? 'Propose changes' : 'Build outline'}
        footer={(hasOutline || hasDraft) ? (
          <span className="ai-footer-links">
            {hasOutline && (
              <button type="button" className="ai-footer-link" disabled={working !== null}
                onClick={() => ask({ mode: 'fresh', text: instruction.trim() })}
                title="Draft a new outline from the subject (and anything typed above), to replace this one">
                <RotateCcw className="h-3 w-3" aria-hidden="true" /> Start over
              </button>
            )}
            {hasDraft && (
              <button type="button" className="ai-footer-link" onClick={() => ask({ mode: 'draft', text: '' })} disabled={working !== null}
                title="Read the draft and propose the structure it is reaching for">
                <FileSearch className="h-3 w-3" aria-hidden="true" /> From my draft
              </button>
            )}
          </span>
        ) : null}
      />

      {working && (
        <div className="ai-pending" aria-live="polite">
          <Spinner size="2xs" tone="accent" />
          <span>{WORKING_TEXT[working]}</span>
          <Button variant="ghost" size="xs" onClick={() => { if (jobRef.current) queue.cancel(jobRef.current); }}>
            <X className="h-3 w-3" aria-hidden="true" /> Cancel
          </Button>
        </div>
      )}

      {proposal && (
        <OutlineProposal
          proposal={proposal.plan}
          current={current}
          onApply={() => { onApplyOutline(proposal.plan.plan); setProposal(null); }}
          onRetry={() => ask(proposal.ask)}
          onDiscard={() => setProposal(null)}
        />
      )}
    </div>
  );
}
