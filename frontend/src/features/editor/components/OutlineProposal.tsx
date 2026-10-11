import { Check } from 'lucide-react';
import { Button, Chip, type ChipTone } from '@/components/ui';
import type { RefinedPlan } from '../lib/generation';

const KIND_LABEL: Record<string, string> = {
  moved: 'Moved', renamed: 'Renamed', added: 'Added',
  removed: 'Removed', nested: 'Nested', split: 'Split',
  // Models answer in either tense; the badge should not show the raw word.
  move: 'Moved', rename: 'Renamed', add: 'Added', remove: 'Removed', nest: 'Nested',
};

/** Additions read as growth, removals as loss, moves as the accent; the rest stay neutral. */
const KIND_TONE: Record<string, ChipTone> = {
  added: 'success', removed: 'danger', moved: 'accent', nested: 'accent',
  add: 'success', remove: 'danger', move: 'accent', nest: 'accent',
};

interface Props {
  proposal: RefinedPlan;
  /** There is a structure on the page that applying this will reshape. */
  replacing: boolean;
  onApply: () => void;
  onDiscard: () => void;
}

/**
 * A structure the model proposes, with the reason for each change.
 *
 * Never applied on arrival. The outline *is* the document, so accepting one
 * rewrites the page — and a restructure that lands silently is one nobody can
 * check. Rows the model changed are marked in the tree itself, so what moved
 * can be seen where it now sits, and the reasons follow.
 */
export function OutlineProposal({ proposal, replacing, onApply, onDiscard }: Props) {
  const changed = new Map(proposal.changes.map(change => [change.title.trim().toLowerCase(), change.kind]));

  return (
    <section className="ai-proposal" aria-label="Proposed structure">
      <header className="ai-group-head">
        <h3 className="ai-label">Proposed structure</h3>
        <span className="ai-count">{proposal.plan.length}</span>
      </header>

      {proposal.summary && <p className="ai-proposal-summary">{proposal.summary}</p>}

      <ol className="ai-proposal-tree">
        {proposal.plan.map(item => {
          const kind = changed.get(item.title.trim().toLowerCase());
          return (
            <li key={item.id} data-level={Math.min(item.level, 4)} data-kind={kind}
              style={{ ['--level' as string]: item.level }} title={kind ? KIND_LABEL[kind] ?? kind : undefined}>
              {item.title}
            </li>
          );
        })}
      </ol>

      {proposal.changes.length > 0 && (
        <ul className="ai-proposal-changes" aria-label="Changes">
          {proposal.changes.map((change, i) => (
            <li key={i}>
              <Chip size="xs" caps tone={KIND_TONE[change.kind] ?? 'neutral'} className="ai-proposal-kind">
                {KIND_LABEL[change.kind] ?? change.kind}
              </Chip>
              <div className="min-w-0">
                <div className="ai-proposal-title">{change.title}</div>
                {change.reason && <div className="ai-proposal-reason">{change.reason}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="ai-proposal-actions">
        <Button variant="primary" size="xs" onClick={onApply}>
          <Check className="h-3 w-3" aria-hidden="true" /> Apply
        </Button>
        <Button variant="ghost" size="xs" onClick={onDiscard}>Discard</Button>
        {replacing && <span className="ai-proposal-note">Nothing is deleted — sections it leaves out move to the end.</span>}
      </footer>
    </section>
  );
}
