import { Check, RotateCcw } from 'lucide-react';
import { Button, Chip, type ChipTone } from '@/components/ui';
import type { RefinedPlan } from '../lib/generation';
import { matchPlan } from '../lib/sections';

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

const wordsText = (words: number) => (words >= 1000 ? `${(words / 1000).toFixed(1)}k` : String(words));

interface Props {
  proposal: RefinedPlan;
  /** The outline on the page now, with the words each section holds. */
  current: { title: string; words: number }[];
  onApply: () => void;
  /** Ask the same question again, for a different answer. */
  onRetry: () => void;
  onDiscard: () => void;
}

/**
 * A structure the model proposes, and exactly what applying it does.
 *
 * Never applied on arrival. The outline *is* the document, so accepting one
 * rewrites the page. Each row says what it brings: the prose of the section
 * it keeps (by title, or the title it was renamed from) or nothing, because
 * it is new. Sections the proposal leaves out are listed with what they hold,
 * because applying removes them.
 */
export function OutlineProposal({ proposal, current, onApply, onRetry, onDiscard }: Props) {
  const changed = new Map(proposal.changes.map(change => [change.title.trim().toLowerCase(), change.kind]));
  const { sources, dropped } = matchPlan(current.map(row => row.title), proposal.plan);
  const removed = dropped.map(i => current[i]).filter(row => row.title.trim());
  const lostWords = removed.reduce((sum, row) => sum + row.words, 0);
  const added = sources.filter(i => i < 0).length;

  return (
    <section className="ai-proposal" aria-label="Proposed structure">
      <header className="ai-group-head">
        <h3 className="ai-label">Proposed structure</h3>
        <span className="ai-count">{proposal.plan.length}</span>
      </header>

      {proposal.summary && <p className="ai-proposal-summary">{proposal.summary}</p>}

      {current.length > 0 && (
        <p className="ai-proposal-tally">
          <span><b>{sources.filter(i => i >= 0).length}</b> kept</span>
          <span data-tone="new"><b>{added}</b> new</span>
          <span data-tone={removed.length ? 'removed' : undefined}><b>{removed.length}</b> removed</span>
        </p>
      )}

      <ol className="ai-proposal-tree">
        {proposal.plan.map((item, at) => {
          const kind = changed.get(item.title.trim().toLowerCase());
          const source = sources[at];
          const words = source >= 0 ? current[source]?.words ?? 0 : 0;
          const renamedFrom = source >= 0 && current[source].title.trim().toLowerCase() !== item.title.trim().toLowerCase()
            ? current[source].title : null;
          return (
            <li key={item.id} data-level={Math.min(item.level, 4)} data-kind={kind ?? (current.length && source < 0 ? 'added' : undefined)}
              style={{ ['--level' as string]: item.level }}
              title={renamedFrom ? `Renamed from “${renamedFrom}” — keeps its ${words} words` : kind ? KIND_LABEL[kind] ?? kind : undefined}>
              <span className="ai-proposal-name">{item.title}</span>
              {current.length > 0 && (
                <span className="ai-proposal-keep" data-new={source < 0 || undefined}>
                  {source < 0 ? 'new' : words ? `${wordsText(words)} w` : ''}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {removed.length > 0 && (
        <div className="ai-proposal-removed">
          <div className="ai-proposal-removed-head">
            Removes {removed.length} section{removed.length === 1 ? '' : 's'}
            {lostWords > 0 && <> and <b>{lostWords.toLocaleString()} words</b></>}
          </div>
          <ul>
            {removed.map((row, i) => (
              <li key={i}><span>{row.title}</span>{row.words > 0 && <span className="ai-proposal-keep">{wordsText(row.words)} w</span>}</li>
            ))}
          </ul>
        </div>
      )}

      {proposal.changes.length > 0 && (
        <ul className="ai-proposal-changes" aria-label="Changes">
          {proposal.changes.map((change, i) => (
            <li key={i}>
              <Chip size="xs" caps tone={KIND_TONE[change.kind] ?? 'neutral'} className="ai-proposal-kind">
                {KIND_LABEL[change.kind] ?? change.kind}
              </Chip>
              <div className="min-w-0">
                <div className="ai-proposal-title">
                  {change.from && change.from !== change.title ? <><s>{change.from}</s> → </> : null}{change.title}
                </div>
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
        <Button variant="secondary" size="xs" onClick={onRetry} title="Discard this and ask again">
          <RotateCcw className="h-3 w-3" aria-hidden="true" /> Try again
        </Button>
        <Button variant="ghost" size="xs" onClick={onDiscard}>Discard</Button>
        {current.length > 0 && (
          <span className="ai-proposal-note">
            Kept sections keep their text; new ones arrive empty{removed.length ? '; removed ones go with their text' : ''}. Undo reverts it.
          </span>
        )}
      </footer>
    </section>
  );
}
