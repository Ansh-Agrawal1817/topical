import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { GitBranch } from 'lucide-react';
import { Chip, ChipButton, Heading, Text } from '@/components/ui';
import type { DocumentBranch, VersionKind } from '@/lib/api';
import { edgePath, laneColor, laneX, LANE_PAD, timeOf, type GraphLayout } from '../../lib/versionGraph';

const KIND: Record<VersionKind, string> = {
  auto: 'Auto', manual: 'Saved', checkpoint: 'Checkpoint', restore: 'Restore', merge: 'Merge', switch: 'Left',
};

export type Selection = number | 'now' | null;

/**
 * The history as a graph: one lane per branch, newest at the top. Rows are
 * listbox options (↑/↓ move, Home/End jump); the lanes are drawn behind them
 * as one SVG from the layout's numbers.
 */
export function VersionGraph({ layout, branches, currentBranchId, selected, onSelect, nowWords }: {
  layout: GraphLayout;
  branches: DocumentBranch[];
  currentBranchId: number | null;
  selected: Selection;
  onSelect: (selection: Selection) => void;
  /** Words on the page now, for the "now" row. */
  nowWords: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const laneByIndex = useMemo(() => new Map(layout.lanes.map(lane => [lane.index, lane])), [layout.lanes]);
  const options = useMemo(
    () => layout.rows.flatMap(row => (row.type === 'version' ? [row.version.id as Selection] : row.type === 'now' ? ['now' as Selection] : [])),
    [layout.rows],
  );
  const gutter = layout.width + LANE_PAD / 2;

  // Keep the chosen row in view when it is chosen from elsewhere (a branch chip).
  useEffect(() => {
    if (selected === null) return;
    listRef.current?.querySelector(`[data-key="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const at = options.indexOf(selected);
    const to = event.key === 'ArrowDown' ? Math.min(options.length - 1, at + 1)
      : event.key === 'ArrowUp' ? Math.max(0, at - 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? options.length - 1 : -1;
    if (to < 0 || !options.length) return;
    event.preventDefault();
    onSelect(options[to]);
    listRef.current?.querySelector<HTMLElement>(`[data-key="${options[to]}"]`)?.focus();
  }, [onSelect, options, selected]);

  const headOf = (branch: DocumentBranch) => branch.headVersionId;

  return (
    <div className="history-graph">
      {branches.length > 1 && (
        <div className="history-branches" role="group" aria-label="Branches">
          {[...branches].sort((a, b) => (a.id === currentBranchId ? -1 : b.id === currentBranchId ? 1 : a.id - b.id)).map(branch => {
            const lane = layout.lanes.find(l => l.branch.id === branch.id);
            const current = branch.id === currentBranchId;
            const head = current ? 'now' : headOf(branch);
            return (
              <ChipButton key={branch.id} size="sm" shape="rounded" selected={selected !== null && selected === head}
                onClick={() => head !== null && onSelect(current && options.includes('now') ? 'now' : headOf(branch))}
                title={current ? `${branch.name} — the document is on this branch` : `Go to the newest version on ${branch.name}`}>
                <span className="history-swatch" style={{ '--lane': laneColor(lane?.index ?? 0, current) } as React.CSSProperties} aria-hidden="true" />
                {branch.name}
                {current && <Chip size="xs" tone="accent" caps>on</Chip>}
              </ChipButton>
            );
          })}
        </div>
      )}

      <div className="history-list" ref={listRef} role="listbox" aria-label="Versions" tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="history-canvas" style={{ height: layout.height, '--gutter': `${gutter}px` } as React.CSSProperties}>
          <svg className="history-lanes" width={gutter} height={layout.height} aria-hidden="true">
            {layout.edges.map((edge, i) => {
              const lane = laneByIndex.get(edge.kind === 'merge' ? edge.to.lane : edge.from.lane);
              return (
                <path key={i} d={edgePath(edge)} data-kind={edge.kind}
                  style={{ '--lane': laneColor(lane?.index ?? 0, !!lane?.current) } as React.CSSProperties} />
              );
            })}
            {layout.rows.map(row => {
              if (row.type === 'day') return null;
              const lane = laneByIndex.get(row.lane);
              const cy = row.y + row.height / 2;
              const color = laneColor(lane?.index ?? 0, !!lane?.current);
              if (row.type === 'now') {
                return <circle key="now" className="history-node history-node--now" cx={laneX(row.lane)} cy={cy} r={5} style={{ '--lane': color } as React.CSSProperties} />;
              }
              const v = row.version;
              return (
                <circle key={row.key} className="history-node" data-named={v.name ? true : undefined} data-kind={v.kind}
                  data-ai={v.source === 'ai' || undefined} cx={laneX(row.lane)} cy={cy} r={v.name ? 5.5 : 4}
                  style={{ '--lane': color } as React.CSSProperties} />
              );
            })}
          </svg>

          {layout.rows.map(row => {
            if (row.type === 'day') {
              return (
                <Heading key={row.key} level={3} size="label" className="history-day" style={{ top: row.y, height: row.height }}>
                  {row.label}
                </Heading>
              );
            }
            if (row.type === 'now') {
              const active = selected === 'now';
              return (
                <button key="now" type="button" role="option" aria-selected={active} data-key="now" className="history-row"
                  data-active={active || undefined} style={{ top: row.y, height: row.height }} onClick={() => onSelect('now')}
                  tabIndex={active || (selected === null && options[0] === 'now') ? 0 : -1}>
                  <Text as="span" size="sm" weight="semibold" truncate>The page now</Text>
                  <Text as="span" size="2xs" tone="faint" truncate>Not saved as a version yet · {nowWords.toLocaleString()} words</Text>
                </button>
              );
            }
            const v = row.version;
            const active = selected === v.id;
            return (
              <button key={row.key} type="button" role="option" aria-selected={active} data-key={v.id} className="history-row"
                data-active={active || undefined} style={{ top: row.y, height: row.height }} onClick={() => onSelect(v.id)}
                tabIndex={active || (selected === null && options[0] === v.id) ? 0 : -1}>
                <span className="history-row-title">
                  <Text as="span" size="sm" weight={v.name ? 'semibold' : 'medium'} truncate>{v.name || timeOf(v.createdAt)}</Text>
                  {row.tags.map(tag => (
                    <Chip key={tag.id} size="xs" tone="outline" title={`${tag.name} starts here`}>
                      <GitBranch className="h-2.5 w-2.5" aria-hidden="true" />{tag.name}
                    </Chip>
                  ))}
                </span>
                <span className="history-row-meta">
                  <Text as="span" size="2xs" tone="faint" truncate>
                    {v.name && <>{timeOf(v.createdAt)} · </>}{v.createdByUsername ?? 'someone'}
                  </Text>
                  {row.delta !== null && row.delta !== 0 && (
                    <Text as="span" size="2xs" numeric mono tone="muted" data-delta={row.delta > 0 ? 'up' : 'down'} className="history-delta">
                      {row.delta > 0 ? '+' : '−'}{Math.abs(row.delta).toLocaleString()}
                    </Text>
                  )}
                  <span className="history-row-chips">
                    {v.source === 'ai' && <Chip size="xs" tone="accent" caps>AI</Chip>}
                    <Chip size="xs" tone="quiet" caps>{KIND[v.kind] ?? v.kind}</Chip>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
