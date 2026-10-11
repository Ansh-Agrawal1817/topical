import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock, ListTree, PenLine, Sparkles, Square, X } from 'lucide-react';
import { Button, Progress, Spinner } from '@/components/ui';
import { confirmAction } from '@/lib/confirm';
import type { OutlineNode } from '../lib/outline';
import { indexOutline, pathNumber } from '../lib/tree';
import type { SectionWriter } from '../hooks/useSectionWriter';
import { ASKS } from '../lib/writeAsks';
import { Composer, type ComposerHandle } from './Composer';
import { ContextPill } from './ContextPanel';

type Scope = 'missing' | 'all';

/** The node `target` refers to now: same title, nearest to where it was. */
function locate(nodes: OutlineNode[], target: OutlineNode | null): OutlineNode | null {
  if (!target) return null;
  const same = nodes.filter(node => node.label === target.label);
  return same.sort((a, b) => Math.abs(a.offset - target.offset) - Math.abs(b.offset - target.offset))[0] ?? null;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/**
 * Write sections with AI: a run over many, or one on its own.
 *
 * A run covers the empty sections or all of them — chosen above the
 * instruction, so the button can say exactly what it will do — and the list
 * under it is that run: what will be written, in order, each leaving the list
 * as it lands. It used to list every section whatever the button would do,
 * which on a long document was the outline rail drawn a second time.
 *
 * One section arrives here from the outline (its ✦): the composer then names
 * it, and the same instruction field, suggestions and context apply.
 */
export function WritePanel({
  writer, nodes, wordsOf, contextCount, onOpenContext, onOpenOutline, onJump, target, onClearTarget, focusSignal,
}: {
  writer: SectionWriter;
  nodes: OutlineNode[];
  /** Words a heading has written itself (not counting its sub-sections). */
  wordsOf: (node: OutlineNode) => number;
  contextCount: number;
  onOpenContext: () => void;
  onOpenOutline: () => void;
  onJump: (node: OutlineNode) => void;
  /** One section to write, sent from the outline rail. */
  target: OutlineNode | null;
  onClearTarget: () => void;
  /** Bumped when a section is sent here, to put the cursor in the field. */
  focusSignal: number;
}) {
  const [instruction, setInstruction] = useState('');
  const [chosenScope, setScope] = useState<Scope>('missing');
  const composer = useRef<ComposerHandle>(null);

  const tree = useMemo(() => indexOutline(nodes), [nodes]);
  const sections = useMemo(() => nodes.filter(node => node.label.trim()), [nodes]);
  const written = sections.filter(node => wordsOf(node) > 0).length;
  const totalWords = sections.reduce((sum, node) => sum + wordsOf(node), 0);
  const empty = sections.length - written;
  // Nothing empty leaves "all" as the only run there is.
  const scope: Scope = empty ? chosenScope : 'all';
  const list = scope === 'missing' ? sections.filter(node => wordsOf(node) === 0) : sections;
  const numberOf = (node: OutlineNode) => {
    const index = tree.byOffset.get(node.offset);
    return index === undefined ? '' : pathNumber(tree.entries[index]);
  };

  const single = locate(nodes, target);
  // The section was deleted or renamed while it waited here.
  useEffect(() => { if (target && !single) onClearTarget(); }, [target, single, onClearTarget]);
  useEffect(() => { if (focusSignal) composer.current?.focus(); }, [focusSignal]);

  const ask = instruction.trim();

  const runAll = () => {
    if (scope === 'missing') { writer.writeAll('missing', ask); return; }
    if (!written) { writer.writeAll('all', ask); return; }
    void confirmAction({
      title: `Rewrite all ${sections.length} sections?`,
      description: `${totalWords.toLocaleString()} words across ${plural(written, 'written section')} will be replaced, one section at a time. You can stop the run from here.`,
      confirmLabel: 'Rewrite all',
      tone: 'danger',
    }).then(yes => { if (yes) writer.writeAll('all', ask); });
  };

  const runSingle = () => {
    if (!single) return;
    writer.writeSection(single, ask);
    onClearTarget();
    setInstruction('');
  };

  if (!sections.length) {
    return (
      <div className="ai-tab">
        <div className="ai-blank">
          <ListTree className="h-5 w-5" aria-hidden="true" />
          <p className="ai-blank-title">No sections to write yet</p>
          <p>Build an outline first, or add headings to the document.</p>
          <Button variant="secondary" size="sm" onClick={onOpenOutline}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Build an outline
          </Button>
        </div>
      </div>
    );
  }

  const singleWords = single ? wordsOf(single) : 0;
  const singleState = single ? writer.status[single.offset] : undefined;

  return (
    <div className="ai-tab">
      <div className="ai-stat">
        <div className="ai-stat-row">
          <span><b>{written}</b> of {plural(sections.length, 'section')} written</span>
          <span className="ai-stat-aside">{plural(totalWords, 'word')}</span>
        </div>
        <Progress value={sections.length ? written / sections.length : 0} />
      </div>

      {single ? (
        <Composer
          ref={composer}
          header={(
            <span className="ai-target-chip">
              <span className="ai-target-num">{numberOf(single)}</span>
              <span className="ai-target-name" title={single.label}>{single.label}</span>
              <button type="button" className="ai-target-clear" onClick={onClearTarget}
                aria-label="Back to writing every section" title="Back to writing every section">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          label={`How “${single.label}” should be written`}
          placeholder={singleWords ? 'What should change? e.g. tighter, with a worked example — optional' : 'Anything it must cover? Optional'}
          value={instruction}
          onChange={setInstruction}
          onSubmit={runSingle}
          suggestions={ASKS}
          submitDisabled={singleState === 'queued' || singleState === 'generating'}
          submitIcon={<Sparkles className="h-3 w-3" aria-hidden="true" />}
          submitLabel={singleState === 'queued' || singleState === 'generating' ? 'In the queue' : singleWords ? 'Rewrite section' : 'Write section'}
          footer={<ContextPill count={contextCount} onOpen={onOpenContext} />}
        />
      ) : writer.progress ? (
        <div className="ai-run" aria-live="polite">
          <div className="ai-run-head">
            <Spinner size="2xs" tone="accent" />
            <span className="ai-run-text" title={writer.progress.title}>
              {writer.progress.retrying ? 'Waiting to retry' : 'Writing'} <b>{writer.progress.title}</b>
            </span>
            <span className="ai-run-count">{writer.progress.done}/{writer.progress.total}</span>
          </div>
          <Progress size="md" value={writer.progress.done / writer.progress.total} label="Sections written" />
          <Button variant="secondary" size="xs" onClick={writer.stop}>
            <Square className="h-3 w-3" aria-hidden="true" /> Stop the run
          </Button>
        </div>
      ) : (
        <>
          {empty > 0 && (
            <div className="ai-switch ai-switch--fill" role="group" aria-label="Which sections">
              <button type="button" aria-pressed={scope === 'missing'} onClick={() => setScope('missing')}
                title="Only sections with nothing written under them">
                Empty <span className="seg-count">{empty}</span>
              </button>
              <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}
                title="Every section — written ones are replaced">
                All <span className="seg-count">{sections.length}</span>
              </button>
            </div>
          )}
          <Composer
            ref={composer}
            label="How the sections should be written"
            placeholder="How should they be written? Applies to every section — optional"
            value={instruction}
            onChange={setInstruction}
            onSubmit={runAll}
            suggestions={ASKS}
            submitDisabled={!list.length}
            submitIcon={<Sparkles className="h-3 w-3" aria-hidden="true" />}
            submitLabel={scope === 'missing' ? `Write ${plural(list.length, 'section')}` : `Rewrite ${plural(list.length, 'section')}`}
            footer={<ContextPill count={contextCount} onOpen={onOpenContext} />}
          />
        </>
      )}

      <section className="ai-group" aria-labelledby="ai-write-list">
        <div className="ai-group-head">
          <h3 id="ai-write-list" className="ai-label">{scope === 'missing' ? 'Still empty' : 'All sections'}</h3>
          <span className="ai-count">{list.length}</span>
        </div>
        {/* The number column is as wide as its longest entry, so "2.4" and
            "2.2.1" leave their titles on one edge. */}
        <ol className="ai-sections" style={{ ['--num-chars' as string]: Math.max(3, ...list.map(node => numberOf(node).length)) }}>
          {list.map(node => {
            const state = writer.status[node.offset];
            const words = wordsOf(node);
            const busy = state === 'queued' || state === 'generating';
            return (
              <li key={node.id} className="ai-section" data-state={state ?? (words ? 'written' : 'empty')}
                data-selected={single?.offset === node.offset || undefined}>
                <span className="ai-section-num">{numberOf(node)}</span>
                <button type="button" className="ai-section-title" onClick={() => onJump(node)} title={`Go to “${node.label}”`}>
                  {node.label}
                </button>
                <span className="ai-section-meta">
                  {state === 'generating' ? <Spinner size="2xs" tone="accent" label="Writing" />
                    : state === 'queued' ? <Clock className="h-3 w-3" aria-label="Waiting in the queue" />
                    : state === 'failed' ? <AlertTriangle className="h-3 w-3" aria-label="Failed" />
                    : words ? words.toLocaleString() : null}
                </span>
                <span className="ai-section-tools">
                  <Button variant="ghost" size="xs" disabled={busy}
                    onClick={() => writer.writeSection(node, ask)}
                    title={busy ? 'Already in the queue' : `${words ? 'Rewrite' : 'Write'} this section${ask ? ' with the instruction above' : ''}`}>
                    <PenLine className="h-3 w-3" aria-hidden="true" /> {state === 'failed' ? 'Retry' : words ? 'Rewrite' : 'Write'}
                  </Button>
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
