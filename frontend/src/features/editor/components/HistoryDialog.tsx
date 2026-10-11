import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Check, History, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import {
  deleteVersion, getVersion, listVersions, renameVersion, takeVersion, type DocumentVersion,
} from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { errorMessage } from '@/lib/utils';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, IconButton, Spinner } from '@/components/ui';
import { diffCounts, lineDiff, type DiffLine } from '../lib/lineDiff';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: number;
  /** The document as it is now, read when needed. */
  readContent: () => string;
  /** Put a version's text on the page. The dialog has already snapshotted the current text. */
  onRestore: (content: string, label: string) => void;
}

const KIND_LABEL: Record<DocumentVersion['kind'], string> = {
  auto: 'Auto', manual: 'Saved', restore: 'Before restore', checkpoint: 'Checkpoint',
};

/** Unchanged runs longer than this fold to one line in the changes view. */
const CONTEXT_LINES = 3;

function timeOf(value: string | null): string {
  return value ? new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
}

function dayOf(value: string | null): string {
  if (!value) return 'Earlier';
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

const labelOf = (version: DocumentVersion) => version.name || `${dayOf(version.createdAt)}, ${timeOf(version.createdAt)}`;

/** Fold long unchanged runs, keeping a little context either side of each change. */
function folded(lines: DiffLine[]): (DiffLine | { kind: 'fold'; count: number })[] {
  const out: (DiffLine | { kind: 'fold'; count: number })[] = [];
  let run: DiffLine[] = [];
  const flush = (last: boolean) => {
    const first = out.length === 0;
    if (run.length > CONTEXT_LINES * 2 + 1) {
      const lead = first ? [] : run.slice(0, CONTEXT_LINES);
      const trail = last ? [] : run.slice(-CONTEXT_LINES);
      out.push(...lead, { kind: 'fold', count: run.length - lead.length - trail.length }, ...trail);
    } else {
      out.push(...run);
    }
    run = [];
  };
  for (const line of lines) {
    if (line.kind === 'same') { run.push(line); continue; }
    flush(false);
    out.push(line);
  }
  flush(true);
  return out;
}

/**
 * The document's history: every snapshot, what each changed against the page
 * as it is now, and the way back to it.
 *
 * Snapshots come from three places — automatically while anyone writes (one
 * every ten minutes at most), by hand from here, and just before a large
 * change such as an applied outline or a restore — so restoring is itself
 * undoable from this same list. Any snapshot can be named; a named one is
 * kept when the automatic ones are pruned.
 */
export function HistoryDialog({ open, onOpenChange, planId, readContent, onRestore }: Props) {
  const [versions, setVersions] = useState<DocumentVersion[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [view, setView] = useState<'changes' | 'text'>('changes');
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [snapName, setSnapName] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      const list = await listVersions(planId);
      setVersions(list);
      setSelected(current => (current !== null && list.some(v => v.id === current) ? current : list[0]?.id ?? null));
    } catch (error) {
      setFailed(errorMessage(error, 'Could not load the history'));
    }
  }, [planId]);

  useEffect(() => {
    if (!open) return;
    setVersions(null);
    void load();
  }, [load, open]);

  // The text of the chosen version, fetched once.
  useEffect(() => {
    if (selected === null || texts[selected] !== undefined) return;
    let live = true;
    getVersion(planId, selected)
      .then(version => { if (live) setTexts(all => ({ ...all, [selected]: version.content })); })
      .catch(error => toast.error(errorMessage(error, 'Could not load that version')));
    return () => { live = false; };
  }, [planId, selected, texts]);

  const chosen = versions?.find(v => v.id === selected) ?? null;
  const text = selected !== null ? texts[selected] : undefined;
  // Compared with the page when the dialog is showing it; the page may move on
  // underneath (a collaborator), and the diff is recomputed with it.
  const current = open ? readContent() : '';
  const diff = useMemo(() => (text === undefined ? null : lineDiff(text, current)), [current, text]);
  const counts = diff ? diffCounts(diff) : null;

  const snapshot = async () => {
    setBusy(true);
    try {
      const made = await takeVersion(planId, readContent(), 'manual', snapName.trim() || undefined);
      setSnapName('');
      if (made) {
        toast.success(made.name ? `Saved “${made.name}”` : 'Snapshot saved');
        await load();
        setSelected(made.id);
        listRef.current?.scrollTo({ top: 0 });
      }
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save a snapshot'));
    } finally {
      setBusy(false);
    }
  };

  const commitRename = async (version: DocumentVersion) => {
    const name = draftName.trim();
    setRenaming(null);
    if (name === (version.name ?? '')) return;
    try {
      const next = await renameVersion(planId, version.id, name);
      setVersions(all => all?.map(v => (v.id === next.id ? { ...v, name: next.name } : v)) ?? all);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not rename that version'));
    }
  };

  const remove = async (version: DocumentVersion) => {
    const ok = await confirmAction({
      title: 'Delete this snapshot?',
      description: `“${labelOf(version)}” is removed from the history. The document itself is not changed.`,
      confirmLabel: 'Delete snapshot',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteVersion(planId, version.id);
      setVersions(all => all?.filter(v => v.id !== version.id) ?? all);
      if (selected === version.id) setSelected(versions?.find(v => v.id !== version.id)?.id ?? null);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not delete that snapshot'));
    }
  };

  const restore = async () => {
    if (!chosen || text === undefined) return;
    const label = labelOf(chosen);
    const ok = await confirmAction({
      title: `Restore “${label}”?`,
      description: 'The page is replaced with this version. What is there now is saved to the history first, so you can come back to it.',
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await takeVersion(planId, readContent(), 'restore', `Before restoring “${label}”`.slice(0, 120));
      onRestore(text, label);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the current text first — nothing was restored'));
    } finally {
      setBusy(false);
    }
  };

  let lastDay = '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent material="solid" className="history-dialog">
        <header className="history-head">
          <History className="h-4 w-4" aria-hidden="true" />
          <div className="min-w-0">
            <DialogTitle className="history-title">Version history</DialogTitle>
            <DialogDescription className="history-sub">
              Snapshots are taken as you write. Name one to keep it; restore any of them.
            </DialogDescription>
          </div>
        </header>

        <div className="history-body">
          <div className="history-side">
            <form className="history-snap" onSubmit={event => { event.preventDefault(); void snapshot(); }}>
              <input
                className="history-snap-input"
                value={snapName}
                onChange={event => setSnapName(event.target.value)}
                placeholder="Name this version (optional)"
                aria-label="Name for the new snapshot"
                maxLength={120}
              />
              <Button type="submit" variant="secondary" size="sm" disabled={busy}>
                <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Save
              </Button>
            </form>

            <div className="history-list" ref={listRef} role="listbox" aria-label="Snapshots">
              {failed ? (
                <div className="history-empty">{failed} <Button variant="ghost" size="xs" onClick={() => void load()}>Retry</Button></div>
              ) : versions === null ? (
                <div className="history-empty"><Spinner size="sm" /></div>
              ) : versions.length === 0 ? (
                <div className="history-empty">No snapshots yet. One is taken as soon as you edit, or save one now.</div>
              ) : versions.map(version => {
                const day = dayOf(version.createdAt);
                const header = day !== lastDay ? day : null;
                lastDay = day;
                const active = version.id === selected;
                return (
                  <div key={version.id}>
                    {header && <div className="history-day">{header}</div>}
                    <div className="history-row" data-active={active || undefined} data-named={version.name ? true : undefined}>
                      {renaming === version.id ? (
                        <input
                          className="history-rename"
                          autoFocus
                          value={draftName}
                          maxLength={120}
                          placeholder="Name this version"
                          aria-label="Version name"
                          onChange={event => setDraftName(event.target.value)}
                          onBlur={() => void commitRename(version)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') { event.preventDefault(); void commitRename(version); }
                            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setRenaming(null); }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="history-pick"
                          role="option"
                          aria-selected={active}
                          onClick={() => setSelected(version.id)}
                          onDoubleClick={() => { setRenaming(version.id); setDraftName(version.name ?? ''); }}
                        >
                          <span className="history-name">{version.name || timeOf(version.createdAt)}</span>
                          <span className="history-meta">
                            {version.name && <>{timeOf(version.createdAt)} · </>}
                            {version.createdByUsername ?? 'someone'} · {version.words.toLocaleString()} words
                          </span>
                          <span className="history-kind" data-kind={version.kind}>{KIND_LABEL[version.kind]}</span>
                        </button>
                      )}
                      {renaming !== version.id && (
                        <span className="history-tools">
                          <IconButton size="xs" title="Rename" aria-label={`Rename ${labelOf(version)}`}
                            onClick={() => { setRenaming(version.id); setDraftName(version.name ?? ''); }}>
                            <Pencil className="h-3 w-3" />
                          </IconButton>
                          <IconButton size="xs" tone="danger" title="Delete snapshot" aria-label={`Delete ${labelOf(version)}`}
                            onClick={() => void remove(version)}>
                            <Trash2 className="h-3 w-3" />
                          </IconButton>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <section className="history-main" aria-label="Selected version">
            {chosen ? (
              <>
                <div className="history-main-head">
                  <div className="min-w-0">
                    <div className="history-main-title">{labelOf(chosen)}</div>
                    <div className="history-main-meta">
                      {counts
                        ? counts.added + counts.cut === 0
                          ? 'Same as the page now'
                          : <>Since then: <b data-tone="added">+{counts.added}</b> <b data-tone="cut">−{counts.cut}</b> lines</>
                        : 'Loading…'}
                    </div>
                  </div>
                  <div className="ai-switch" role="group" aria-label="Show">
                    <button type="button" aria-pressed={view === 'changes'} onClick={() => setView('changes')}>Changes</button>
                    <button type="button" aria-pressed={view === 'text'} onClick={() => setView('text')}>Text</button>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => void restore()}
                    disabled={busy || text === undefined || (counts !== null && counts.added + counts.cut === 0)}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Restore
                  </Button>
                </div>
                <div className="history-view">
                  {text === undefined ? (
                    <div className="history-empty"><Spinner size="sm" /></div>
                  ) : view === 'text' ? (
                    <pre className="history-text">{text}</pre>
                  ) : diff && counts && counts.added + counts.cut === 0 ? (
                    <div className="history-empty"><Check className="h-4 w-4" aria-hidden="true" /> Nothing has changed since this version.</div>
                  ) : (
                    <div className="history-diff" aria-label="Changes from this version to the page now">
                      <div className="history-legend"><span data-tone="cut">In this version</span><span data-tone="added">On the page now</span></div>
                      {folded(diff ?? []).map((line, i) => line.kind === 'fold' ? (
                        <div key={i} className="history-fold">{line.count} unchanged line{line.count === 1 ? '' : 's'}</div>
                      ) : (
                        <div key={i} className="history-line" data-kind={line.kind}>
                          <span className="history-gutter" aria-hidden="true">{line.kind === 'added' ? '+' : line.kind === 'cut' ? '−' : ''}</span>
                          <span>{line.text || ' '}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="history-empty">Choose a snapshot to see what changed since.</div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
