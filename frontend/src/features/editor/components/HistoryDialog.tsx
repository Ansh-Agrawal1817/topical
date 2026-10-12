import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Camera, GitBranch, GitMerge, History, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import {
  checkoutBranch, deleteBranch, deleteVersion, forkBranch, getVersion, listVersions, renameBranch, renameVersion,
  restoreVersion, takeVersion, type DocumentVersion, type PageChange, type VersionGraph as Graph,
} from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import type { DocFormat } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import {
  Button, Checkbox, Chip, ChipButton, Dialog, DialogContent, DialogDescription, DialogTitle, EmptyState, IconButton, Input,
  Notice, PanelHeader, Segmented, Spinner, Text,
} from '@/components/ui';
import { GhostField } from '@/components/GhostField';
import { snapshotNames } from '../ai/completions';
import { countWords } from '../lib/stats';
import { labelOf, laneColor, layoutGraph, timeOf } from '../lib/versionGraph';
import { PreviewPane } from './PreviewPane';
import { ChangesView } from './history/ChangesView';
import { MergePane } from './history/MergePane';
import { VersionGraph, type Selection } from './history/VersionGraph';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: number;
  format: DocFormat;
  /** The document as it is now, read when needed. */
  readContent: () => string;
  /**
   * Put text on the page as one change — it reaches collaborators like any
   * edit, and ⌘Z takes it back. The history has already kept the page it replaces.
   */
  onPageChange: (content: string, title: string) => void;
  /** The branch the document is on, whenever the history learns it. */
  onBranch: (branch: { id: number; name: string } | null) => void;
}

type View = 'changes' | 'read' | 'source';
type Compare = 'previous' | 'now';
type Pane = { kind: 'detail' } | { kind: 'fork' } | { kind: 'merge'; branchId: number };

/**
 * The document's history as a graph.
 *
 * Every snapshot sits on a branch; a branch is a line of versions, and a fork
 * starts a new one from any version. On the left, the graph (newest first,
 * one lane per branch); on the right, the chosen version: what it changed
 * (against the version before it, or against the page now), how it reads,
 * and what can be done with it — restore it onto the current branch, start a
 * branch from it, move the document onto its branch, or merge that branch's
 * sections into the page. All of it lives in the database, so anyone who can
 * write the document sees the same history from any account or browser.
 */
export function HistoryDialog({ open, onOpenChange, planId, format, readContent, onPageChange, onBranch }: Props) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [view, setView] = useState<View>('changes');
  const [compare, setCompare] = useState<Compare>('previous');
  const [pane, setPane] = useState<Pane>({ kind: 'detail' });
  const [snapName, setSnapName] = useState('');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ kind: 'version' | 'branch'; id: number; draft: string } | null>(null);
  const [forkName, setForkName] = useState('');
  const [forkSwitch, setForkSwitch] = useState(true);
  // The page, read when the dialog opens and after each step that changes it.
  const [page, setPage] = useState('');

  const byId = useMemo(() => new Map((graph?.versions ?? []).map(v => [v.id, v])), [graph]);
  const branchById = useMemo(() => new Map((graph?.branches ?? []).map(b => [b.id, b])), [graph]);
  const current = graph?.currentBranchId != null ? branchById.get(graph.currentBranchId) ?? null : null;
  const head = current?.headVersionId != null ? byId.get(current.headVersionId) ?? null : null;
  const headText = head ? texts[head.id] : undefined;
  const showNow = !!current && (head === null || (headText !== undefined && headText !== page));

  const layout = useMemo(
    () => layoutGraph(graph?.versions ?? [], graph?.branches ?? [], graph?.currentBranchId ?? null, showNow),
    [graph, showNow],
  );

  const load = useCallback(async (select?: Selection) => {
    setFailed(null);
    try {
      const next = await listVersions(planId);
      setGraph(next);
      const branch = next.branches.find(b => b.id === next.currentBranchId);
      onBranch(branch ? { id: branch.id, name: branch.name } : null);
      setSelected(was => {
        const wanted = select !== undefined ? select : was;
        if (wanted === 'now' || (typeof wanted === 'number' && next.versions.some(v => v.id === wanted))) return wanted;
        return next.versions[0]?.id ?? null;
      });
    } catch (error) {
      setFailed(errorMessage(error, 'Could not load the history'));
    }
  }, [onBranch, planId]);

  useEffect(() => {
    if (!open) return;
    setGraph(null);
    setPane({ kind: 'detail' });
    setPage(readContent());
    void load(null);
    // `readContent` is a stable reader; the page is read once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, open]);

  /** Fetch a version's text once. */
  const need = useCallback((id: number | null | undefined) => {
    if (id == null || texts[id] !== undefined) return;
    getVersion(planId, id)
      .then(version => setTexts(all => ({ ...all, [id]: version.content })))
      .catch(error => toast.error(errorMessage(error, 'Could not load that version')));
  }, [planId, texts]);

  const chosen = typeof selected === 'number' ? byId.get(selected) ?? null : null;
  const parent = chosen?.parentId != null ? byId.get(chosen.parentId) ?? null : null;
  useEffect(() => { need(head?.id); }, [head?.id, need]);
  useEffect(() => { need(chosen?.id); need(parent?.id); }, [chosen?.id, parent?.id, need]);
  const mergeHead = pane.kind === 'merge' ? branchById.get(pane.branchId)?.headVersionId ?? null : null;
  useEffect(() => { need(mergeHead); }, [mergeHead, need]);

  // ── What is being compared ──────────────────────────────────────────────
  const text = selected === 'now' ? page : chosen ? texts[chosen.id] : undefined;
  const before = selected === 'now'
    ? headText ?? ''
    : compare === 'now' ? text : chosen?.parentId == null ? '' : parent ? texts[parent.id] : undefined;
  const after = selected === 'now' ? page : compare === 'now' ? page : text;
  const labels = selected === 'now'
    ? { before: head ? `Last version (${timeOf(head.createdAt)})` : 'Empty', after: 'The page now' }
    : compare === 'now'
      ? { before: 'This version', after: 'The page now' }
      : { before: parent ? `Version before (${timeOf(parent.createdAt)})` : 'Empty', after: 'This version' };

  // ── Actions ─────────────────────────────────────────────────────────────
  const run = async (work: () => Promise<void>, failure: string) => {
    setBusy(true);
    try { await work(); } catch (error) { toast.error(errorMessage(error, failure)); } finally { setBusy(false); }
  };

  /** A step that changed the page: show it, learn the branch, redraw the graph. */
  const landed = async (change: PageChange, title: string, select?: Selection) => {
    if (change.content !== page) onPageChange(change.content, title);
    setPage(change.content);
    if (change.version) setTexts(all => ({ ...all, [change.version!.id]: change.content }));
    await load(select ?? change.version?.id ?? 'now');
  };

  const snapshot = () => run(async () => {
    const { version } = await takeVersion(planId, readContent(), 'manual', { name: snapName.trim() || undefined, branchId: current?.id });
    setSnapName('');
    if (version) {
      toast.success(version.name ? `Saved “${version.name}”` : 'Version saved');
      setPage(readContent());
      await load(version.id);
    }
  }, 'Could not save a version');

  const restore = (version: DocumentVersion) => run(async () => {
    const label = labelOf(version);
    const ok = await confirmAction({
      title: `Restore “${label}”?`,
      description: `The page becomes this version, as a new step on ${current?.name ?? 'this branch'}. What is on the page now is kept in the history first.`,
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    await landed(await restoreVersion(planId, version.id, readContent()), `Restored “${label}”`);
  }, 'Could not restore that version — the page was not changed');

  const fork = (version: DocumentVersion) => run(async () => {
    const name = forkName.trim() || `From ${labelOf(version)}`;
    const change = await forkBranch(planId, version.id, name, readContent(), forkSwitch);
    setPane({ kind: 'detail' });
    setForkName('');
    if (forkSwitch) {
      await landed(change, `On the new branch “${change.branch?.name ?? name}”`, 'now');
      toast.success(`Started “${change.branch?.name ?? name}”`, { description: 'The page is on the new branch. The page you left is kept on the old one.' });
    } else {
      await load(version.id);
      toast.success(`Started “${change.branch?.name ?? name}”`);
    }
  }, 'Could not start that branch');

  const switchTo = (branchId: number) => run(async () => {
    const target = branchById.get(branchId);
    const change = await checkoutBranch(planId, branchId, readContent());
    await landed(change, `Switched to “${target?.name ?? 'branch'}”`, 'now');
    toast.success(`On “${target?.name}”`, { description: `The page you left is kept on ${current?.name ?? 'its branch'}.` });
  }, 'Could not switch branches');

  const merge = (branchId: number, content: string) => run(async () => {
    const branch = branchById.get(branchId);
    const from = branch?.headVersionId ?? undefined;
    await takeVersion(planId, readContent(), 'checkpoint', { name: `Before merging “${branch?.name}”`.slice(0, 120), branchId: current?.id });
    onPageChange(content, `Merged “${branch?.name}”`);
    setPage(content);
    const { version } = await takeVersion(planId, content, 'merge', {
      name: `Merged “${branch?.name}”`.slice(0, 120), mergedFromId: from, branchId: current?.id,
    });
    setPane({ kind: 'detail' });
    await load(version?.id ?? 'now');
  }, 'Could not merge — the page was not changed');

  const removeVersion = (version: DocumentVersion) => run(async () => {
    const ok = await confirmAction({
      title: 'Delete this version?',
      description: `“${labelOf(version)}” is removed from the history; the versions around it stay connected. The page is not changed.`,
      confirmLabel: 'Delete version',
      tone: 'danger',
    });
    if (!ok) return;
    await deleteVersion(planId, version.id);
    await load(version.parentId ?? null);
  }, 'Could not delete that version');

  const removeBranch = (branchId: number) => run(async () => {
    const branch = branchById.get(branchId);
    const ok = await confirmAction({
      title: `Delete the branch “${branch?.name}”?`,
      description: 'Its versions are deleted with it. Versions on other branches, and the page, are not changed.',
      confirmLabel: 'Delete branch',
      tone: 'danger',
    });
    if (!ok) return;
    await deleteBranch(planId, branchId);
    await load(null);
  }, 'Could not delete that branch');

  const commitRename = () => {
    const edit = renaming;
    setRenaming(null);
    if (!edit) return;
    void run(async () => {
      if (edit.kind === 'version') await renameVersion(planId, edit.id, edit.draft.trim());
      else if (edit.draft.trim()) await renameBranch(planId, edit.id, edit.draft.trim());
      await load();
    }, 'Could not rename it');
  };

  // ── What the chosen row is ──────────────────────────────────────────────
  const chosenBranch = chosen?.branchId != null ? branchById.get(chosen.branchId) ?? null : null;
  const onOtherBranch = !!chosen && !!chosenBranch && chosenBranch.id !== current?.id;
  const isBranchHead = !!chosen && chosenBranch?.headVersionId === chosen.id;
  const forksHere = (graph?.branches ?? []).filter(b => b.headVersionId === chosen?.id && b.id !== chosen?.branchId);
  const samePage = text !== undefined && text === page;
  const lane = layout.lanes.find(l => l.branch.id === chosenBranch?.id);

  const actions = chosen && pane.kind === 'detail' && (
    <div className="history-actions">
      {onOtherBranch && isBranchHead ? (
        <>
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void switchTo(chosenBranch!.id)}>
            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" /> Switch to {chosenBranch!.name}
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setPane({ kind: 'merge', branchId: chosenBranch!.id })}>
            <GitMerge className="h-3.5 w-3.5" aria-hidden="true" /> Merge into {current?.name ?? 'the page'}
          </Button>
        </>
      ) : (
        <Button variant="primary" size="sm" disabled={busy || text === undefined || samePage} onClick={() => void restore(chosen)}
          title={samePage ? 'The page already says this' : undefined}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Restore
        </Button>
      )}
      {forksHere.map(b => (
        <Button key={b.id} variant="secondary" size="sm" disabled={busy} onClick={() => void switchTo(b.id)}>
          <GitBranch className="h-3.5 w-3.5" aria-hidden="true" /> Switch to {b.name}
        </Button>
      ))}
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setForkName(''); setForkSwitch(true); setPane({ kind: 'fork' }); }}>
        <GitBranch className="h-3.5 w-3.5" aria-hidden="true" /> Branch from here
      </Button>
    </div>
  );

  const body = () => {
    if (failed) {
      return (
        <div className="history-empty">
          <Notice tone="danger">{failed}</Notice>
          <Button variant="secondary" size="sm" onClick={() => void load()}>Try again</Button>
        </div>
      );
    }
    if (graph === null) return <div className="history-empty"><Spinner size="md" label="Loading the history" /></div>;
    if (!graph.versions.length && !showNow) {
      return (
        <EmptyState variant="pane" icon={History} title="No versions yet"
          description="A version is kept as soon as you edit, every ten minutes while you write, and before any large change. Save one now with a name to mark this moment." />
      );
    }
    return null;
  };

  const empty = body();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent material="solid" size="workspace" aria-describedby="history-description">
        <PanelHeader size="md" icon={<History className="h-4 w-4" />}
          title={<DialogTitle className="history-title">Version history</DialogTitle>} />
        <DialogDescription id="history-description" className="sr-only">
          Every version of this document, as a graph of branches. Choose one to see what it changed, restore it,
          branch from it, or merge a branch into the page.
        </DialogDescription>

        <div className="history-body">
          <div className="history-side">
            <form className="history-snap" onSubmit={event => { event.preventDefault(); void snapshot(); }}>
              <GhostField
                as="input"
                className="history-snap-field"
                fieldClassName="history-snap-input"
                completions={snapshotNames()}
                value={snapName}
                onChange={setSnapName}
                placeholder="Name this moment (optional)"
                aria-label="Name for the new version"
                maxLength={120}
              />
              <Button type="submit" variant="secondary" size="sm" disabled={busy}>
                <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Save version
              </Button>
            </form>
            {empty ?? (
              <VersionGraph layout={layout} branches={graph!.branches} currentBranchId={graph!.currentBranchId}
                selected={selected} onSelect={next => { setSelected(next); setPane({ kind: 'detail' }); setRenaming(null); }}
                nowWords={countWords(page, format)} />
            )}
          </div>

          <section className="history-main" aria-label="Chosen version">
            {empty ? null : selected === null ? (
              <EmptyState variant="pane" icon={History} title="Choose a version" description="See what it changed, and restore it or branch from it." />
            ) : (
              <>
                <header className="history-main-head">
                  <div className="history-main-title">
                    {renaming ? (
                      <Input size="sm" autoFocus value={renaming.draft} maxLength={renaming.kind === 'branch' ? 80 : 120}
                        aria-label={renaming.kind === 'branch' ? 'Branch name' : 'Version name'}
                        placeholder={renaming.kind === 'branch' ? 'Branch name' : 'Name this version'}
                        onChange={event => setRenaming(r => (r ? { ...r, draft: event.target.value } : r))}
                        onBlur={commitRename}
                        onKeyDown={event => {
                          if (event.key === 'Enter') { event.preventDefault(); commitRename(); }
                          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setRenaming(null); }
                        }} />
                    ) : (
                      <Text as="h3" size="md" weight="semibold" truncate>
                        {selected === 'now' ? 'The page now' : chosen ? labelOf(chosen) : '…'}
                      </Text>
                    )}
                    <div className="history-main-meta">
                      {selected === 'now' ? (
                        <Text as="span" size="xs" tone="faint">Changes since the last version on {current?.name ?? 'this branch'}</Text>
                      ) : chosen && (
                        <>
                          {chosenBranch && (isBranchHead ? (
                            // The newest version of a branch is where its name is edited.
                            <ChipButton size="sm" title={`Rename the branch “${chosenBranch.name}”`} aria-label={`Branch ${chosenBranch.name}. Rename it`}
                              onClick={() => setRenaming({ kind: 'branch', id: chosenBranch.id, draft: chosenBranch.name })}>
                              <span className="history-swatch" style={{ '--lane': laneColor(lane?.index ?? 0, chosenBranch.id === current?.id) } as React.CSSProperties} aria-hidden="true" />
                              {chosenBranch.name}
                              <Pencil className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />
                            </ChipButton>
                          ) : (
                            <Chip size="sm" tone="outline">
                              <span className="history-swatch" style={{ '--lane': laneColor(lane?.index ?? 0, chosenBranch.id === current?.id) } as React.CSSProperties} aria-hidden="true" />
                              {chosenBranch.name}
                            </Chip>
                          ))}
                          {chosen.source === 'ai' && <Chip size="sm" tone="accent">Written by AI</Chip>}
                          <Text as="span" size="xs" tone="faint" truncate>
                            {chosen.createdByUsername ?? 'someone'} · {timeOf(chosen.createdAt)} · {chosen.words.toLocaleString()} words
                            {chosen.restoredFromId != null && <> · restored from {byId.get(chosen.restoredFromId) ? labelOf(byId.get(chosen.restoredFromId)!) : 'an older version'}</>}
                          </Text>
                        </>
                      )}
                    </div>
                  </div>
                  {chosen && !renaming && (
                    <div className="history-tools">
                      <IconButton size="md" aria-label="Rename this version" title="Rename this version"
                        onClick={() => setRenaming({ kind: 'version', id: chosen.id, draft: chosen.name ?? '' })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton size="md" tone="danger" aria-label="Delete this version" title="Delete this version" disabled={busy}
                        onClick={() => void removeVersion(chosen)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  )}
                </header>

                {actions}

                {pane.kind === 'fork' && chosen && (
                  <form className="history-fork" onSubmit={event => { event.preventDefault(); void fork(chosen); }}>
                    <Text size="xs" tone="muted">
                      A branch is a separate line of the document, starting from this version. Try an alternative there; the
                      other branches are kept as they are.
                    </Text>
                    <Input size="sm" autoFocus value={forkName} maxLength={80} onChange={event => setForkName(event.target.value)}
                      placeholder={`From ${labelOf(chosen)}`} aria-label="Name for the new branch" />
                    <Checkbox checked={forkSwitch} onChange={event => setForkSwitch(event.target.checked)}
                      label="Move the document onto it now" note="The page you are leaving is kept on its branch." />
                    <div className="history-fork-actions">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setPane({ kind: 'detail' })}>Cancel</Button>
                      <Button type="submit" variant="primary" size="sm" loading={busy}>
                        <GitBranch className="h-3.5 w-3.5" aria-hidden="true" /> Start branch
                      </Button>
                    </div>
                  </form>
                )}

                {pane.kind === 'merge' ? (
                  mergeHead !== null && texts[mergeHead] !== undefined ? (
                    <MergePane page={page} theirs={texts[mergeHead]} branchName={branchById.get(pane.branchId)?.name ?? 'the branch'}
                      format={format} busy={busy} onCancel={() => setPane({ kind: 'detail' })}
                      onApply={content => void merge(pane.branchId, content)} />
                  ) : <div className="history-empty"><Spinner size="md" label="Loading the branch" /></div>
                ) : (
                  <>
                    <div className="history-switches">
                      <Segmented size="sm" aria-label="Show" value={view} onChange={setView} options={[
                        { value: 'changes', label: 'Changes' }, { value: 'read', label: 'Read' }, { value: 'source', label: 'Source' },
                      ]} />
                      {view === 'changes' && selected !== 'now' && (
                        <Segmented size="sm" variant="pills" aria-label="Compare with" value={compare} onChange={setCompare} options={[
                          { value: 'previous', label: 'What it changed' }, { value: 'now', label: 'Against the page now' },
                        ]} />
                      )}
                      {isBranchHead && onOtherBranch && chosenBranch && (
                        <Button variant="ghost" size="sm" tone="danger" className="ml-auto" disabled={busy} onClick={() => void removeBranch(chosenBranch.id)}>
                          Delete branch
                        </Button>
                      )}
                    </div>
                    <div className="history-view">
                      {text === undefined || after === undefined || before === undefined ? (
                        <div className="history-empty"><Spinner size="md" label="Loading the version" /></div>
                      ) : view === 'read' ? (
                        <div className="history-read"><PreviewPane content={text} format={format} /></div>
                      ) : view === 'source' ? (
                        <Text as="pre" size="xs" mono tone="muted" className="history-source">{text}</Text>
                      ) : (
                        <ChangesView before={before} after={after} format={format} beforeLabel={labels.before} afterLabel={labels.after} />
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
