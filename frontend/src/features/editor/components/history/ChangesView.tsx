import { useMemo, useRef } from 'react';
import { Check } from 'lucide-react';
import { ChipButton, DiffFold, DiffLine, DiffText, EmptyState, Text, type DiffRun } from '@/components/ui';
import type { DocFormat } from '@/lib/types';
import { lineDiff, type DiffLine as Line } from '../../lib/lineDiff';
import { sectionChanges, type SectionChange } from '../../lib/sectionMerge';
import { wordDiff } from '../../lib/wordDiff';

/** Unchanged runs longer than this fold to one line. */
const CONTEXT_LINES = 3;

type Shown =
  | { kind: 'line'; line: Line; runs: DiffRun[] | null; index: number }
  | { kind: 'fold'; count: number; index: number };

/**
 * Pair each run of removed lines with the run of added lines right after it,
 * so a line that was edited shows which words changed — not a whole paragraph
 * struck out above a whole paragraph added.
 */
function withWords(lines: Line[]): { line: Line; runs: DiffRun[] | null }[] {
  const out: { line: Line; runs: DiffRun[] | null }[] = [];
  for (let i = 0; i < lines.length;) {
    if (lines[i].kind !== 'cut') { out.push({ line: lines[i], runs: null }); i += 1; continue; }
    let cutEnd = i;
    while (cutEnd < lines.length && lines[cutEnd].kind === 'cut') cutEnd += 1;
    let addEnd = cutEnd;
    while (addEnd < lines.length && lines[addEnd].kind === 'added') addEnd += 1;
    const cuts = lines.slice(i, cutEnd);
    const adds = lines.slice(cutEnd, addEnd);
    if (cuts.length === adds.length) {
      const pairs = cuts.map((cut, k) => wordDiff(cut.text, adds[k].text));
      cuts.forEach((cut, k) => out.push({ line: cut, runs: pairs[k]?.filter(run => run.kind !== 'added') ?? null }));
      adds.forEach((add, k) => out.push({ line: add, runs: pairs[k]?.filter(run => run.kind !== 'cut') ?? null }));
    } else {
      [...cuts, ...adds].forEach(line => out.push({ line, runs: null }));
    }
    i = addEnd;
  }
  return out;
}

function fold(lines: { line: Line; runs: DiffRun[] | null }[]): Shown[] {
  const out: Shown[] = [];
  let run: Shown[] = [];
  const flush = (last: boolean) => {
    if (run.length > CONTEXT_LINES * 2 + 1) {
      const lead = out.length === 0 ? [] : run.slice(0, CONTEXT_LINES);
      const trail = last ? [] : run.slice(-CONTEXT_LINES);
      out.push(...lead, { kind: 'fold', count: run.length - lead.length - trail.length, index: -1 }, ...trail);
    } else {
      out.push(...run);
    }
    run = [];
  };
  lines.forEach(({ line, runs }, index) => {
    const shown: Shown = { kind: 'line', line, runs, index };
    if (line.kind === 'same') { run.push(shown); return; }
    flush(false);
    out.push(shown);
  });
  flush(true);
  return out;
}

const deltaLabel = (change: SectionChange) => (
  change.kind === 'added' ? 'new' : change.kind === 'removed' ? 'removed'
    : change.delta === 0 ? 'edited' : `${change.delta > 0 ? '+' : '−'}${Math.abs(change.delta).toLocaleString()}`
);

/**
 * What changed between two texts: the sections touched (each one a jump to
 * where it changed), then the lines — with the words that changed inside an
 * edited line marked, and long unchanged stretches folded away.
 */
export function ChangesView({ before, after, format, beforeLabel, afterLabel }: {
  before: string;
  after: string;
  format: DocFormat;
  beforeLabel: string;
  afterLabel: string;
}) {
  const lines = useMemo(() => withWords(lineDiff(before, after)), [before, after]);
  const shown = useMemo(() => fold(lines), [lines]);
  const sections = useMemo(() => sectionChanges(before, after, format), [before, after, format]);
  const rows = useRef<Map<number, HTMLDivElement>>(new Map());

  if (before === after) {
    return <EmptyState variant="pane" icon={Check} title="No changes" description={`${afterLabel} is the same as ${beforeLabel.toLowerCase()}.`} />;
  }

  /** Scroll to the first changed line inside a section — found by its heading line, then the next change. */
  const jump = (change: SectionChange) => {
    const heading = lines.findIndex(({ line }) => line.text.includes(change.title));
    const from = heading < 0 ? 0 : heading;
    const target = lines.findIndex(({ line }, i) => i >= from && line.kind !== 'same');
    const el = rows.current.get(target >= 0 ? target : from) ?? rows.current.get(from);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  return (
    <div className="history-changes">
      {sections.length > 0 && (
        <div className="history-sections" role="group" aria-label="Sections that changed">
          <Text size="2xs" tone="faint">{sections.length} {sections.length === 1 ? 'section' : 'sections'} changed</Text>
          {sections.slice(0, 24).map(change => (
            <ChipButton key={change.key || 'preamble'} shape="rounded" size="sm" onClick={() => jump(change)}
              title={`Go to ${change.title}`} data-change={change.kind}>
              <span className="history-section-title">{change.title}</span>
              <Text as="span" size="2xs" numeric tone="faint">{deltaLabel(change)}</Text>
            </ChipButton>
          ))}
          {sections.length > 24 && <Text size="2xs" tone="faint">and {sections.length - 24} more</Text>}
        </div>
      )}
      <div className="history-legend" aria-hidden="true">
        <span data-tone="cut">{beforeLabel}</span>
        <span data-tone="added">{afterLabel}</span>
      </div>
      <div className="history-diff" aria-label={`Changes from ${beforeLabel.toLowerCase()} to ${afterLabel.toLowerCase()}`}>
        {shown.map((item, i) => (item.kind === 'fold'
          ? <DiffFold key={`f${i}`} count={item.count} />
          : (
            <DiffLine key={item.index} kind={item.line.kind}
              ref={el => { if (el) rows.current.set(item.index, el); else rows.current.delete(item.index); }}>
              {item.runs ? <DiffText runs={item.runs} /> : item.line.text || ' '}
            </DiffLine>
          )))}
      </div>
    </div>
  );
}
