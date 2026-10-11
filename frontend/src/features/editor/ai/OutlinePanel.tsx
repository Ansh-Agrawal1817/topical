import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileSearch, Sparkles, X } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import type { DocFormat } from '@/lib/types';
import type { OutlineNode } from '../lib/outline';
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
 * AI over the document's structure: build an outline from a subject, change
 * the one there is with an instruction, or read one off the draft. Every
 * answer comes back as a proposal — the structure it would produce, with what
 * moved and why — to apply or discard. Runs in the AI queue.
 */
export function OutlinePanel({
  format, projectName, content, nodes, queue, onApplyOutline,
}: {
  format: DocFormat;
  projectName: string;
  content: string;
  nodes: OutlineNode[];
  queue: AiQueue;
  onApplyOutline: (plan: { title: string; level: number }[]) => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [working, setWorking] = useState<null | 'ask' | 'draft'>(null);
  const [proposal, setProposal] = useState<RefinedPlan | null>(null);
  const jobRef = useRef<string | null>(null);
  const tree = useMemo(() => indexOutline(nodes), [nodes]);
  const own = useMemo(() => sectionWords(tree, content, format).own, [tree, content, format]);
  const hasOutline = nodes.length > 0;
  const written = nodes.filter(node => (own.get(node.offset) ?? 0) > 0).length;
  const depth = nodes.reduce((deepest, node) => Math.max(deepest, node.level), 0);
  const hasDraft = content.trim().length > 0;

  const run = (fromDraft = false) => {
    if (fromDraft && !hasDraft) {
      toast.info('Write something first — this reads the page you already have.');
      return;
    }
    if (!fromDraft && !hasOutline && !instruction.trim()) return;
    const ask = instruction.trim();
    let result: RefinedPlan | null = null;
    setWorking(fromDraft ? 'draft' : 'ask');
    setProposal(null);
    const job = queue.add({
      kind: 'outline',
      label: fromDraft ? 'Outline from the draft' : hasOutline ? `Outline: ${ask || 'improve the structure'}` : `Outline for “${ask}”`,
      run: async () => {
        if (fromDraft) {
          const plan = await outlineDraft(content, format);
          result = { summary: `Read the draft and proposed ${plan.length} sections.`, plan, changes: [] };
        } else if (hasOutline) {
          // The model is told what each row already holds: moving a section
          // carrying 900 words is not the same as moving an empty heading.
          result = await refinePlan(
            nodes.map(node => ({ title: node.label, level: node.level, words: own.get(node.offset) ?? 0 })),
            projectName, ask, format,
          );
        } else {
          const plan = await fetchHierarchy(ask);
          result = { summary: `Proposed ${plan.length} sections.`, plan, changes: [] };
        }
      },
    });
    const all = queue.snapshot();
    jobRef.current = all[all.length - 1]?.id ?? null;
    job.then(() => {
      if (!result) return;
      if (hasOutline && !fromDraft && !result.changes.length) toast.info(result.summary || 'The model left the structure as it was.');
      setProposal(result);
      setInstruction('');
    }).catch(error => {
      if (!(error instanceof JobCancelled)) toast.error('The outline request failed — the queue below says why.');
    }).finally(() => setWorking(null));
  };

  // With no outline yet, the document's title is the obvious subject.
  const suggestions: Suggestion[] = hasOutline
    ? SUGGESTIONS
    : projectName.trim() ? [{ label: 'Use the title', text: projectName.trim() }] : [];

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
          : `e.g. ${projectName.trim() || 'Retrieval-augmented generation'}`}
        value={instruction}
        onChange={setInstruction}
        onSubmit={() => run()}
        suggestions={suggestions}
        submitDisabled={!hasOutline && !instruction.trim()}
        disabled={working !== null}
        submitIcon={<Sparkles className="h-3 w-3" aria-hidden="true" />}
        submitLabel={hasOutline ? 'Propose changes' : 'Build outline'}
        footer={hasDraft ? (
          <button type="button" className="ai-footer-link" onClick={() => run(true)} disabled={working !== null}
            title="Read the draft and propose the structure it is reaching for">
            <FileSearch className="h-3 w-3" aria-hidden="true" /> From my draft
          </button>
        ) : null}
      />

      {working && (
        <div className="ai-pending" aria-live="polite">
          <Spinner size="2xs" tone="accent" />
          <span>{working === 'draft' ? 'Reading the draft…' : hasOutline ? 'Reworking the structure…' : 'Drafting an outline…'}</span>
          <Button variant="ghost" size="xs" onClick={() => { if (jobRef.current) queue.cancel(jobRef.current); }}>
            <X className="h-3 w-3" aria-hidden="true" /> Cancel
          </Button>
        </div>
      )}

      {proposal && (
        <OutlineProposal
          proposal={proposal}
          replacing={hasOutline}
          onApply={() => { onApplyOutline(proposal.plan); setProposal(null); }}
          onDiscard={() => setProposal(null)}
        />
      )}
    </div>
  );
}
