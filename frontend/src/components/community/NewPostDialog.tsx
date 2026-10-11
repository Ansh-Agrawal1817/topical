import { useState } from 'react';
import { PenLine, FileText, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import type { Post } from '@/lib/communityApi';
import { createPost } from '@/lib/communityApi';
import { getPublicLessonPlans } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/utils';
import { Button, Field, Input, Textarea, MenuEmpty, MenuItem, MenuPanel, Stack, PanelHeader, Modal } from '@/components/ui';

interface NewPostDialogProps {
  onClose: () => void;
  onCreated: (post: Post) => void;
}

export function NewPostDialog({ onClose, onCreated }: NewPostDialogProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [attachedId, setAttachedId] = useState<number | null>(null);
  const [attachedName, setAttachedName] = useState('');
  const [showLessons, setShowLessons] = useState(false);
  const [submitting, setSubmitting] = useState(false);


  const { data: plansData } = useQuery({
    queryKey: ['public-lesson-plans'],
    queryFn: getPublicLessonPlans,
    enabled: showLessons,
  });

  const myPlans = (plansData?.lessonPlans ?? []).filter(p => p.userId === user?.id);

  async function handleSubmit() {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const post = await createPost({
        title: title.trim(),
        body: body.trim(),
        ...(attachedId ? { lessonPlanId: attachedId, lessonPlanName: attachedName } : {}),
      });
      onCreated(post);
      onClose();
    } catch (error) {
      // It used to fail silently: the button came back and nothing said why.
      toast.error(errorMessage(error, 'Could not post that discussion'));
      setSubmitting(false);
    }
  }

  return (
    <Modal label="New discussion" onClose={onClose} overlayClassName="modal-overlay">
      {/* A real form, so Enter in the title submits and the browser knows what
          this is. It was a `<div>` with a button at the bottom, which means the
          one key everybody presses to finish a short form did nothing. */}
      <form
        className="new-post-dialog"
        onSubmit={e => { e.preventDefault(); handleSubmit(); }}
      >
        <PanelHeader size="md" icon={<PenLine className="h-4 w-4" />} title="New discussion" onClose={onClose} />

        <Stack gap={4} className="p-5">
          {/* Labelled, not placeholder-only. A placeholder is gone the instant
              somebody types into it, so a half-filled form of placeholder-only
              fields no longer says what any of them are — and "Title*" put the
              required marker in the one place guaranteed to vanish first. */}
          <Field id="new-post-title" label="Title" requirement="required">
            <Input
              id="new-post-title"
              autoFocus
              required
              placeholder="What do you want to ask or share?"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
            />
          </Field>

          <Field id="new-post-body" label="Body" requirement="optional">
            <Textarea
              id="new-post-body"
              placeholder="Add the detail that makes it answerable."
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              maxLength={5000}
            />
          </Field>

          {/* Attach a published document: readers open it from the discussion. */}
          <Field id="new-post-doc" label="Attach a document" requirement="optional">
            <Button
              id="new-post-doc"
              type="button"
              variant="secondary"
              size="md"
              width="full"
              className="new-post-attach"
              aria-expanded={showLessons}
              onClick={() => setShowLessons(v => !v)}
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="truncate">{attachedName || 'None'}</span>
              <ChevronDown className="ml-auto h-3.5 w-3.5" />
            </Button>

            {showLessons && (
              <MenuPanel inset="sm" className="lesson-picker">
                <MenuItem checked={!attachedId} onClick={() => { setAttachedId(null); setAttachedName(''); setShowLessons(false); }}>
                  None
                </MenuItem>
                {myPlans.map(p => (
                  <MenuItem
                    key={p.id}
                    checked={attachedId === p.id}
                    onClick={() => { setAttachedId(p.id); setAttachedName(p.name); setShowLessons(false); }}
                  >
                    {p.name}
                  </MenuItem>
                ))}
                {myPlans.length === 0 && (
                  <MenuEmpty>You have no published documents yet. Publish one from your workspace to attach it.</MenuEmpty>
                )}
              </MenuPanel>
            )}
          </Field>

          {/* Cancel beside the action, as in every other dialog here; the
              full-width "Post to community" slab read as disabled until a
              title was typed, and gave no way out but the corner. */}
          <div className="new-post-actions">
            <Button type="button" variant="ghost" size="md" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" size="md" loading={submitting} disabled={!title.trim() || submitting}>
              Post discussion
            </Button>
          </div>
        </Stack>
      </form>
    </Modal>
  );
}
