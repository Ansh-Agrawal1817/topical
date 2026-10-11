import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquareText, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import { ProviderMark } from '@/components/ProviderTile';
import type { AiProvider } from '@/lib/aiCredentials';
import type { AiCollaborator } from '@/lib/types';
import type { ReviewerStatus } from '../ai/reviewers';
import { AiCollaboratorsSection } from './AiCollaboratorsSection';

const PANEL_WIDTH = 400;
const GAP = 8;
const MARGIN = 8;

interface Props {
  collaborators: AiCollaborator[];
  statuses: Record<string, ReviewerStatus>;
  /** Absent for anyone but the owner: they see who reviews, and cannot change it. */
  onChange?: (next: AiCollaborator[]) => void;
  myId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open the AI panel's Review tab. */
  onOpenReview: () => void;
  suggestions: number;
}

/**
 * The AI collaborators, in the header beside the people: their marks, lit
 * while one is reading, or "AI" with a plus when there are none yet. It
 * shimmers on hover — the one control here that brings a model in.
 *
 * Opens a panel that holds everything about them: adding one of your saved
 * models, switching each on or off, and its settings (name, what to watch
 * for, how often). Portalled, like the people list, because the header clips.
 */
export function AiCollaboratorsButton({
  collaborators, statuses, onChange, myId, open, onOpenChange, onOpenReview, suggestions,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const reading = collaborators.some(c => statuses[c.id]?.state === 'reviewing');

  const position = useCallback(() => {
    const box = triggerRef.current?.getBoundingClientRect();
    if (!box) return;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - MARGIN * 2);
    setPlace({
      top: box.bottom + GAP,
      left: Math.min(Math.max(MARGIN, box.left), window.innerWidth - width - MARGIN),
    });
  }, []);

  useLayoutEffect(() => { if (open) position(); else setPlace(null); }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      // A confirm or a dialog opened from inside the panel is not "outside" it.
      if ((target as Element).closest?.('[role="dialog"], [data-sonner-toast]')) return;
      onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', position);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', position);
    };
  }, [onOpenChange, open, position]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ai-collab-btn"
        data-open={open || undefined}
        data-reading={reading || undefined}
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={collaborators.length
          ? `AI collaborators: ${collaborators.map(c => c.name).join(', ')}`
          : 'Add an AI collaborator'}
        aria-label={collaborators.length
          ? `${collaborators.length} AI collaborator${collaborators.length === 1 ? '' : 's'} — settings`
          : 'Add an AI collaborator'}
      >
        {collaborators.length ? (
          <span className="ai-collab-marks">
            {collaborators.slice(0, 3).map(c => (
              <span key={c.id} className="ai-collab-mark" data-state={statuses[c.id]?.state ?? 'idle'}>
                <ProviderMark provider={c.provider as AiProvider} size="sm" />
              </span>
            ))}
            {collaborators.length > 3 && <span className="ai-collab-mark ai-collab-more">+{collaborators.length - 3}</span>}
          </span>
        ) : (
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span className="ai-collab-label">{collaborators.length ? 'AI' : 'Add AI'}</span>
        {onChange && <Plus className="ai-collab-plus h-3 w-3" aria-hidden="true" />}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className="ai-collab-pop menu-panel"
          role="dialog"
          aria-label="AI collaborators"
          style={{
            top: place?.top ?? -9999,
            left: place?.left ?? -9999,
            width: Math.min(PANEL_WIDTH, window.innerWidth - MARGIN * 2),
            visibility: place ? 'visible' : 'hidden',
          }}
        >
          <header className="ai-collab-pop-head">
            <span className="ai-collab-pop-icon" aria-hidden="true"><Sparkles className="h-4 w-4" /></span>
            <div className="min-w-0">
              <div className="ai-collab-pop-title">AI collaborators</div>
              <p className="ai-collab-pop-sub">
                Your models, reviewing as you write. Each reads only the section last worked on, and suggests a change
                only when something is wrong.
              </p>
            </div>
          </header>

          <div className="ai-collab-pop-body">
            <AiCollaboratorsSection
              collaborators={collaborators}
              onChange={onChange}
              myId={myId}
              statuses={statuses}
            />
          </div>

          {collaborators.length > 0 && (
            <footer className="ai-collab-pop-foot">
              <Button variant="secondary" size="sm" onClick={() => { onOpenChange(false); onOpenReview(); }}>
                <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                {suggestions ? `See ${suggestions} suggestion${suggestions === 1 ? '' : 's'}` : 'Open suggestions'}
              </Button>
            </footer>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
