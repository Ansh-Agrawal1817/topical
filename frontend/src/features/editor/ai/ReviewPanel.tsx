import { Check, Settings2, Sparkles, UserPlus, X } from 'lucide-react';
import { Button, Chip, DiffText, IconButton, Spinner, type ChipTone } from '@/components/ui';
import { ProviderMark } from '@/components/ProviderTile';
import type { AiProvider } from '@/lib/aiCredentials';
import type { AiCollaborator } from '@/lib/types';
import { wordDiff } from '../lib/wordDiff';
import type { AiReviewers, ReviewerStatus, Suggestion } from './reviewers';

const KIND_TONE: Record<Suggestion['kind'], ChipTone> = {
  error: 'danger', clarity: 'neutral', grammar: 'accent', consistency: 'accent', markup: 'neutral',
};

const STATE_TEXT: Record<ReviewerStatus['state'], string> = {
  idle: 'Watching', reviewing: 'Reading', waiting: 'Waiting', error: 'Stopped', off: 'Paused', elsewhere: 'Runs from another browser', missing: 'Model removed from Settings',
};

function ReviewerChip({ collaborator, status }: { collaborator: AiCollaborator; status?: ReviewerStatus }) {
  const state = status?.state ?? 'idle';
  return (
    <li className="review-who" data-state={state}
      title={`${collaborator.name} · ${collaborator.model} — ${STATE_TEXT[state]}${status?.detail ? `: ${status.detail}` : ''}`}>
      <ProviderMark provider={collaborator.provider as AiProvider} size="sm" />
      <span className="review-who-name">{collaborator.name}</span>
      <span className="review-who-state">
        {state === 'reviewing' ? <Spinner size="2xs" tone="accent" /> : <span className="review-dot" aria-hidden="true" />}
        {state === 'reviewing' && status?.detail ? `Reading “${status.detail}”` : state === 'error' || state === 'waiting' ? status?.detail ?? STATE_TEXT[state] : STATE_TEXT[state]}
      </span>
    </li>
  );
}

/**
 * What the AI collaborators suggest, to accept or dismiss one at a time.
 *
 * Each suggestion names who made it and where, shows the change as a word
 * diff, and says why. Selecting it finds the passage on the page. Accepting
 * replaces exactly the quoted text; dismissing tells that reviewer not to
 * raise it again. A suggestion whose passage has since been edited away
 * disappears on its own.
 */
export function ReviewPanel({ collaborators, reviewers, onManage, onLocate }: {
  collaborators: AiCollaborator[];
  reviewers: AiReviewers;
  /** Open the dialog where AI collaborators are added and configured. */
  onManage?: () => void;
  onLocate: (suggestion: Suggestion) => void;
}) {
  const { suggestions, statuses, accept, dismiss, dismissAll } = reviewers;

  if (!collaborators.length) {
    return (
      <div className="ai-tab">
        <div className="ai-blank">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          <div className="ai-blank-title">No AI collaborators yet</div>
          <p>
            Add one of your models as a collaborator. It reads the section being worked on — only that section — every
            few seconds, and suggests a change only when something is actually wrong.
          </p>
          {onManage
            ? <Button variant="primary" size="sm" onClick={onManage}><UserPlus className="h-3.5 w-3.5" /> Add an AI collaborator</Button>
            : <p>The document’s owner can add one.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="ai-tab">
      <section className="ai-group" aria-label="Reviewers">
        <div className="ai-group-head">
          <h3 className="ai-label">Reviewers</h3>
          {onManage && (
            <IconButton size="xs" onClick={onManage} title="Add or configure AI collaborators" aria-label="Manage AI collaborators" className="ml-auto">
              <Settings2 className="h-3.5 w-3.5" />
            </IconButton>
          )}
        </div>
        <ul className="review-whos">
          {collaborators.map(c => <ReviewerChip key={c.id} collaborator={c} status={statuses[c.id]} />)}
        </ul>
      </section>

      <section className="ai-group" aria-label="Suggestions">
        <div className="ai-group-head">
          <h3 className="ai-label">Suggestions</h3>
          <span className="ai-count">{suggestions.length}</span>
          {suggestions.length > 1 && (
            <Button variant="ghost" size="xs" className="ml-auto" onClick={dismissAll}>Dismiss all</Button>
          )}
        </div>
        {suggestions.length === 0 ? (
          <p className="ai-intro">
            Nothing to change. Suggestions appear here when a reviewer finds an error, an unclear sentence or broken
            markup in the section being written.
          </p>
        ) : (
          <ol className="review-list">
            {[...suggestions].reverse().map(s => {
              const diff = wordDiff(s.quote, s.replacement);
              return (
                <li key={s.id} className="review-card">
                  <button type="button" className="review-card-body" onClick={() => onLocate(s)} title="Show it in the document">
                    <span className="review-card-head">
                      <Chip size="xs" caps tone={KIND_TONE[s.kind] ?? 'neutral'}>{s.kind}</Chip>
                      <span className="review-card-where">{s.reviewerName} · {s.sectionLabel}</span>
                    </span>
                    <DiffText
                      className="review-card-diff"
                      runs={diff}
                      fallback={<><del>{s.quote}</del> <ins>{s.replacement}</ins></>}
                    />
                    {s.reason && <span className="review-card-reason">{s.reason}</span>}
                  </button>
                  <footer className="review-card-actions">
                    <Button variant="primary" size="xs" onClick={() => accept(s.id)}>
                      <Check className="h-3 w-3" aria-hidden="true" /> Accept
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => dismiss(s.id)}>
                      <X className="h-3 w-3" aria-hidden="true" /> Dismiss
                    </Button>
                  </footer>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
