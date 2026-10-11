import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Text } from '@/components/ui';
import { GhostField } from '@/components/GhostField';
import { REVIEWER_COMPLETIONS } from '../ai/completions';
import { ProviderMark } from '@/components/ProviderTile';
import { getCredentials, presetFor, type AiProvider } from '@/lib/aiCredentials';
import type { AiCollaborator } from '@/lib/types';
import type { ReviewerStatus } from '../ai/reviewers';

/** What a reviewer can be asked to watch for, as one click. */
const FOCUS = [
  { label: 'Facts', text: 'Check facts and figures.' },
  { label: 'Maths', text: 'Check the maths and notation.' },
  { label: 'Grammar', text: 'Only spelling, grammar and punctuation.' },
  { label: 'Consistency', text: 'Keep terms and claims consistent with the rest of the outline.' },
  { label: 'Clarity', text: 'Flag sentences a reader would stumble on.' },
];

const INTERVALS = [5, 10, 15, 30, 60, 120, 300];

const STATE_TEXT: Record<ReviewerStatus['state'], string> = {
  idle: 'Watching', reviewing: 'Reading now', waiting: 'Rate limited', error: 'Stopped', off: 'Paused',
  elsewhere: 'Runs from the browser that added it', missing: 'Its model was removed from Settings',
};

interface Props {
  collaborators: AiCollaborator[];
  /** Absent: read-only — who reviews and how it is going, for anyone but the owner. */
  onChange?: (next: AiCollaborator[]) => void;
  myId?: string;
  statuses: Record<string, ReviewerStatus>;
}

/**
 * AI collaborators: the writer's own models, added to the document as
 * reviewers. Each reads only the section last worked on, at its own
 * interval, and suggests changes in the AI panel's Review tab.
 *
 * Added from the models saved in Settings. The key never leaves this
 * browser — the document stores which model and how it reviews — so this
 * browser is the one that runs it.
 */
export function AiCollaboratorsSection({ collaborators, onChange, myId, statuses }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const credentials = getCredentials();
  const available = credentials.filter(credential => !collaborators.some(c => c.id === credential.id));

  const editable = !!onChange;
  const update = (id: string, patch: Partial<AiCollaborator>) =>
    onChange?.(collaborators.map(c => (c.id === id ? { ...c, ...patch } : c)));

  const add = (id: string) => {
    const credential = credentials.find(c => c.id === id);
    if (!credential || !onChange || collaborators.length >= 8) return;
    const name = presetFor(credential.provider).name;
    onChange([...collaborators, {
      id: credential.id,
      name: collaborators.some(c => c.name === name) ? `${name} ${collaborators.length + 1}` : name,
      provider: credential.provider,
      model: credential.model,
      instructions: '',
      intervalSeconds: 10,
      enabled: true,
      addedBy: myId ?? null,
    }]);
    setOpen(credential.id);
    toast.success(`${name} is now reviewing this document`);
  };

  return (
    <div className="aic">
      {collaborators.length === 0 && !editable && (
        <Text size="xs" tone="ghost">No AI collaborators yet. The document’s owner can add one.</Text>
      )}

      <ul className="aic-list">
        {collaborators.map(c => {
          const status = statuses[c.id];
          const expanded = open === c.id;
          return (
            <li key={c.id} className="aic-row" data-open={expanded || undefined}>
              <div className="aic-head">
                <ProviderMark provider={c.provider as AiProvider} size="sm" />
                <button type="button" className="aic-name" onClick={() => editable && setOpen(expanded ? null : c.id)}
                  aria-expanded={editable ? expanded : undefined} disabled={!editable}>
                  <span className="aic-title">{c.name}</span>
                  <span className="aic-sub">
                    {c.model} · every {c.intervalSeconds}s · {STATE_TEXT[status?.state ?? (c.enabled ? 'idle' : 'off')]}
                  </span>
                </button>
                {editable && (
                  <label className="aic-switch" title={c.enabled ? 'Pause' : 'Resume'}>
                    <input type="checkbox" role="switch" checked={c.enabled}
                      onChange={event => update(c.id, { enabled: event.target.checked })}
                      aria-label={c.enabled ? `Pause ${c.name}` : `Resume ${c.name}`} />
                    <span aria-hidden="true" />
                  </label>
                )}
                {editable && (
                  <IconButton size="xs" onClick={() => setOpen(expanded ? null : c.id)} aria-label={`Settings for ${c.name}`} title="Settings">
                    <ChevronDown className="aic-chevron h-3.5 w-3.5" />
                  </IconButton>
                )}
              </div>

              {expanded && editable && (
                <div className="aic-body">
                  <label className="aic-field">
                    <span>Name</span>
                    <input value={c.name} maxLength={60}
                      onChange={event => update(c.id, { name: event.target.value })}
                      onBlur={() => { if (!c.name.trim()) update(c.id, { name: presetFor(c.provider as AiProvider).name }); }} />
                  </label>
                  <label className="aic-field">
                    <span>What to watch for</span>
                    <GhostField
                      fieldClassName="aic-textarea"
                      completions={REVIEWER_COMPLETIONS.filter(text => !c.instructions.includes(text))}
                      rows={3}
                      maxLength={2000}
                      value={c.instructions}
                      placeholder="e.g. Check the maths. Keep the tone formal."
                      onChange={next => update(c.id, { instructions: next })}
                    />
                  </label>
                  <div className="ai-suggestions">
                    {FOCUS.map(focus => {
                      const on = c.instructions.includes(focus.text);
                      return (
                        <button key={focus.label} type="button" className="ai-suggestion" aria-pressed={on}
                          onClick={() => update(c.id, {
                            instructions: on
                              ? c.instructions.replace(focus.text, '').replace(/\s{2,}/g, ' ').trim()
                              : `${c.instructions.trim()} ${focus.text}`.trim(),
                          })}>
                          {focus.label}
                        </button>
                      );
                    })}
                  </div>
                  <label className="aic-field aic-field--row">
                    <span>Look at the last-touched section every</span>
                    <select value={c.intervalSeconds} onChange={event => update(c.id, { intervalSeconds: Number(event.target.value) })}>
                      {INTERVALS.map(seconds => (
                        <option key={seconds} value={seconds}>{seconds < 60 ? `${seconds} seconds` : `${seconds / 60} minute${seconds === 60 ? '' : 's'}`}</option>
                      ))}
                    </select>
                  </label>
                  <p className="aic-note">
                    Each look sends one section — its text, the headings above it and the outline’s titles — and only
                    when it changed since the last look. {status?.state === 'elsewhere' && 'Its key is in the browser of whoever added it, so it runs there.'}
                  </p>
                  <div className="aic-actions">
                    <Button variant="ghost" size="xs" tone="danger" onClick={() => { onChange?.(collaborators.filter(x => x.id !== c.id)); setOpen(null); }}>
                      <Trash2 className="h-3 w-3" aria-hidden="true" /> Remove
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!editable ? null : available.length > 0 ? (
        <div className="aic-add" aria-label="Add one of your models">
          {available.map(credential => (
            <button key={credential.id} type="button" className="aic-add-btn" onClick={() => add(credential.id)}
              disabled={collaborators.length >= 8} title={`Add ${presetFor(credential.provider).name} · ${credential.model}`}>
              <ProviderMark provider={credential.provider} size="sm" />
              <span className="aic-add-text">
                <span className="aic-title">{presetFor(credential.provider).name}</span>
                <span className="aic-sub">{credential.model}</span>
              </span>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : credentials.length === 0 ? (
        <Text size="xs" tone="ghost">
          No models saved yet — <Link to="/settings" search={{ section: 'models' }} className="underline">add one in Settings</Link>, then come back.
        </Text>
      ) : null}
    </div>
  );
}
