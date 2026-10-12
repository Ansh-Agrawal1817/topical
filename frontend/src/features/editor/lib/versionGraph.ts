/**
 * The history drawn as a graph: one lane per branch, newest at the top.
 *
 * Pure layout. Every row has a fixed height, so a row's centre is known
 * without measuring the DOM, and the lines between rows — a branch running
 * down its lane, a fork curving out of the version it started from, a merge
 * drawn dashed back to what it brought in — are drawn once, as one SVG,
 * from these numbers.
 */

import type { DocumentBranch, DocumentVersion } from '@/lib/api';

export const ROW_H = 56;
export const DAY_H = 30;
export const LANE_W = 18;
export const LANE_PAD = 14;

export type GraphRow =
  | { type: 'day'; key: string; label: string; y: number; height: number }
  | { type: 'now'; key: 'now'; lane: number; y: number; height: number }
  | { type: 'version'; key: string; version: DocumentVersion; lane: number; y: number; height: number; delta: number | null; tags: DocumentBranch[] };

export interface Lane {
  branch: DocumentBranch;
  index: number;
  current: boolean;
}

export interface GraphEdge {
  kind: 'line' | 'fork' | 'merge';
  /** Lane of each end, and the y of each end (row centres, or the list's bottom for a cut-off line). */
  from: { lane: number; y: number };
  to: { lane: number; y: number };
}

export interface GraphLayout {
  rows: GraphRow[];
  lanes: Lane[];
  edges: GraphEdge[];
  height: number;
  width: number;
}

export function laneX(lane: number): number {
  return LANE_PAD + lane * LANE_W;
}

function dayOf(value: string | null): string {
  if (!value) return 'Earlier';
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * Lay the history out.
 *
 * `showNow` adds a row at the top for the page as it is, on the current
 * branch's lane — when the page has moved on from that branch's newest version.
 */
export function layoutGraph(
  versions: DocumentVersion[],
  branches: DocumentBranch[],
  currentBranchId: number | null,
  showNow: boolean,
): GraphLayout {
  const byId = new Map(versions.map(v => [v.id, v]));
  const own = new Map<number, DocumentVersion[]>();
  for (const v of versions) {
    if (v.branchId === null) continue;
    own.set(v.branchId, [...(own.get(v.branchId) ?? []), v]);
  }

  // A lane for every branch that has versions of its own, and for the
  // current one (its "now" row) — the oldest branch first, so "main" is the
  // trunk on the left.
  const laned = [...branches]
    .filter(b => own.has(b.id) || (b.id === currentBranchId && showNow))
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id - b.id);
  const lanes: Lane[] = laned.map((branch, index) => ({ branch, index, current: branch.id === currentBranchId }));
  const laneOf = new Map(lanes.map(l => [l.branch.id, l.index]));
  const currentLane = currentBranchId !== null ? laneOf.get(currentBranchId) : undefined;

  // A branch with nothing of its own yet sits on the version it was forked
  // from: its name is shown there as a tag.
  const tags = new Map<number, DocumentBranch[]>();
  for (const b of branches) {
    if (!own.has(b.id) && b.headVersionId !== null && !(b.id === currentBranchId && showNow)) {
      tags.set(b.headVersionId, [...(tags.get(b.headVersionId) ?? []), b]);
    }
  }

  const rows: GraphRow[] = [];
  let y = 0;
  if (showNow && currentLane !== undefined) {
    rows.push({ type: 'now', key: 'now', lane: currentLane, y, height: ROW_H });
    y += ROW_H;
  }
  let lastDay = '';
  for (const v of versions) {
    const day = dayOf(v.createdAt);
    if (day !== lastDay) {
      rows.push({ type: 'day', key: `day-${v.id}`, label: day, y, height: DAY_H });
      y += DAY_H;
      lastDay = day;
    }
    const parent = v.parentId !== null ? byId.get(v.parentId) : undefined;
    rows.push({
      type: 'version', key: `v-${v.id}`, version: v, lane: laneOf.get(v.branchId ?? -1) ?? 0, y, height: ROW_H,
      delta: parent ? v.words - parent.words : null, tags: tags.get(v.id) ?? [],
    });
    y += ROW_H;
  }
  const height = y;
  const centre = new Map<number | 'now', number>();
  for (const row of rows) {
    if (row.type === 'version') centre.set(row.version.id, row.y + row.height / 2);
    if (row.type === 'now') centre.set('now', row.y + row.height / 2);
  }

  const edges: GraphEdge[] = [];
  for (const lane of lanes) {
    const mine = own.get(lane.branch.id) ?? [];
    const ys = mine.map(v => centre.get(v.id)!).filter(n => n !== undefined);
    if (lane.current && showNow) ys.unshift(centre.get('now')!);
    if (!ys.length) continue;
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    if (bottom > top) edges.push({ kind: 'line', from: { lane: lane.index, y: top }, to: { lane: lane.index, y: bottom } });

    // Where the lane comes from: the parent of its oldest version — or, for a
    // fork with only a "now" row, the version it was forked from.
    const oldest = mine[mine.length - 1];
    const rootParent = oldest ? oldest.parentId : lane.branch.headVersionId;
    if (rootParent === null) continue;
    const parent = byId.get(rootParent);
    if (!parent) {
      // Its history goes on past what is listed.
      edges.push({ kind: 'line', from: { lane: lane.index, y: bottom }, to: { lane: lane.index, y: height } });
      continue;
    }
    const parentLane = laneOf.get(parent.branchId ?? -1);
    if (parentLane === undefined || parentLane === lane.index) continue;
    edges.push({ kind: 'fork', from: { lane: lane.index, y: bottom }, to: { lane: parentLane, y: centre.get(parent.id)! } });
  }
  for (const v of versions) {
    if (v.mergedFromId === null) continue;
    const from = byId.get(v.mergedFromId);
    if (!from) continue;
    edges.push({
      kind: 'merge',
      from: { lane: laneOf.get(v.branchId ?? -1) ?? 0, y: centre.get(v.id)! },
      to: { lane: laneOf.get(from.branchId ?? -1) ?? 0, y: centre.get(from.id)! },
    });
  }

  return { rows, lanes, edges, height, width: laneX(Math.max(lanes.length, 1) - 1) + LANE_PAD };
}

/** An SVG path for an edge: straight down a lane, or a curve between lanes. */
export function edgePath(edge: GraphEdge): string {
  const x1 = laneX(edge.from.lane);
  const x2 = laneX(edge.to.lane);
  const { y: y1 } = edge.from;
  const { y: y2 } = edge.to;
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
  // Down its own lane until a row above the other end, then a curve across.
  const bend = Math.max(y1, y2 - ROW_H * 0.75);
  return `M ${x1} ${y1} L ${x1} ${bend} C ${x1} ${bend + ROW_H * 0.45}, ${x2} ${y2 - ROW_H * 0.35}, ${x2} ${y2}`;
}

/** The colour of each lane: the branch the document is on takes the accent; the rest cycle through quiet hues. */
const LANE_HUES = ['var(--ink-muted)', 'var(--latex-500)', 'var(--status-info)', 'var(--hue-violet)', 'var(--status-success)', 'var(--status-warning)'];
export function laneColor(index: number, current: boolean): string {
  return current ? 'var(--accent-400)' : LANE_HUES[index % LANE_HUES.length];
}

/** A version's time of day, as the rows show it. */
export function timeOf(value: string | null): string {
  return value ? new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
}

/** What a version is called: its name, or when it was taken. */
export function labelOf(version: DocumentVersion): string {
  if (version.name) return version.name;
  const when = version.createdAt ? new Date(version.createdAt) : null;
  return when ? when.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Version';
}
