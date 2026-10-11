import { add, clamp01, smooth, TAU, type Vec3 } from '../scene/kit'
import {
  BRANCH, CONTEXT_RING, CONTEXT_SOURCES, CONTEXT_TASK_SECS, CONTEXT_TASKS, EARTH_PARTS, FORMATS, MILKY_WAY_TURN, PROBE_TRIP,
  PROBES, SHOWER, SHOWER_LOOP, VERSIONS,
} from './content'
import { EARTH, EARTH_RADIUS } from './solar'
import { tree } from './tree'

/**
 * What happens round the Earth once the camera holds it: its own parts
 * being written, the sources in orbit round it and the work sent out from
 * it, the claims traced back like a meteor shower to its comet, the drafts
 * along the Moon's orbit, and the forms the document goes out in.
 *
 * Flat things — the parts, the shower, the forms — are placed as offsets
 * from the Earth's centre on screen, in globe radii (x right, y down), so
 * they hold to the planet at any size. Things in orbit are placed in the
 * galaxy's own space round the Earth, so the camera sees them pass in front
 * of it and behind. The canvas draws from these and the labels pinned to
 * them read the same ones.
 */

export type Offset = [number, number]

const eased = (t: number) => smooth(0, 1, clamp01(t))
const rad = (deg: number) => (deg * Math.PI) / 180

/**
 * Where the Moon was drawn this frame, as an offset from the Earth in globe
 * radii with its own radius in the same units — written by the canvas loop,
 * read by the labels that sit under it.
 */
export const moonSeen = { x: 4, y: 0, r: 0.27 }

/** Just under the Moon, clear of it at any size. */
export const underMoon = (): Offset => [moonSeen.x, moonSeen.y + moonSeen.r + 0.12]

/**
 * A seamless loop: 0 for the first moments and the last, 1 between, so a
 * demonstration fades out before it starts over rather than jumping back.
 */
export const seam = (t: number, loop: number) => smooth(0, 0.5, t) * (1 - smooth(loop - 1, loop - 0.15, t))

/* ─────────────────────────── The Earth's parts ─────────────────────────── */

/**
 * The outline beside the planet: a column of the Earth's parts, its left
 * edge `x` globe radii right of the centre and its rows `row` pixels tall,
 * centred on the planet. The canvas draws a line from a part being worked
 * on to its row, so the two must agree; the CSS for `.v-outline-row` holds
 * the same height. Only shown where there is room for it beside the globe.
 */
export const OUTLINE = {
  x: 1.16,
  row: 48,
  /** The gap the anchor puts between its point and the list. */
  gap: 16,
  minWidth: 1180,
  shown: () => (typeof window !== 'undefined' && window.innerWidth >= OUTLINE.minWidth ? 1 : 0),
}

/** The left end of row `i` of the outline, on screen. */
export function outlineRowAt(view: { cx: number; cy: number; R: number }, i: number): [number, number] {
  const top = view.cy - (EARTH_PARTS.length * OUTLINE.row) / 2
  return [view.cx + OUTLINE.x * view.R + OUTLINE.gap, top + OUTLINE.row * (i + 0.5)]
}

/* ─────────────────────────── Sources in orbit ─────────────────────────── */

/*
 * The ring's axes in the galaxy: one along the screen's x at the Earth's
 * stops (the camera's turn there is the chapter's turn, MILKY_WAY_TURN),
 * one away from the camera, then tipped about the second.
 */
const RIGHT = -MILKY_WAY_TURN
const AXIS_U: Vec3 = [Math.cos(RIGHT) * Math.cos(CONTEXT_RING.incline), Math.sin(CONTEXT_RING.incline), Math.sin(RIGHT) * Math.cos(CONTEXT_RING.incline)]
const AXIS_V: Vec3 = [Math.cos(RIGHT + Math.PI / 2), 0, Math.sin(RIGHT + Math.PI / 2)]

/** A point on the ring at angle `a` (radians), `out` times its radius from the Earth. */
export function ringPoint(a: number, out = 1): Vec3 {
  const r = CONTEXT_RING.r * EARTH_RADIUS * out
  const c = Math.cos(a) * r, s = Math.sin(a) * r
  return add(EARTH, [AXIS_U[0] * c + AXIS_V[0] * s, AXIS_U[1] * c, AXIS_U[2] * c + AXIS_V[2] * s])
}

/** How far source `i` has come into its orbit, 0–1. */
export const sourceProgress = (i: number) => eased((tree.context * 1.4 - i * 0.1) / 0.8)

/** Where source `i` is at `time`: on the ring, coming in from farther out as it arrives. */
export const sourceAt = (i: number, time: number): Vec3 =>
  ringPoint(TAU * CONTEXT_SOURCES[i].phase + time * CONTEXT_RING.speed, 1 + 0.6 * (1 - sourceProgress(i)))

/**
 * How visible each source is this frame, 0–1: written by the canvas, which
 * knows when one has gone behind the planet, read by its label.
 */
export const sourceSeen = CONTEXT_SOURCES.map(() => 1)

/** The task being done at `loop` seconds, by index into CONTEXT_TASKS. */
export const taskAt = (loop: number) => Math.floor(loop / CONTEXT_TASK_SECS) % CONTEXT_TASKS.length

/** 0–1 through the current task: its sources light, then their light comes down. */
export const taskPhase = (loop: number) => (loop % CONTEXT_TASK_SECS) / CONTEXT_TASK_SECS

/**
 * Probe `i` at `loop` seconds: out from the limb past the ring, a moment
 * away, and back in along the other side of its line, so each trip is one
 * clean loop; null when it is home.
 */
export function probeAt(i: number, loop: number): { at: Offset; back: boolean; s: number } | null {
  const probe = PROBES[i]
  const t = loop - probe.start
  if (t < 0 || t > PROBE_TRIP) return null
  const u = t / PROBE_TRIP
  // Round a teardrop: θ from 0 to 2π, out on one side and back on the other.
  const th = smooth(0, 1, u) * TAU
  const d = 1.04 + 1.95 * Math.sin(th / 2) ** 1.4
  const side = Math.sin(th) * 0.38 * Math.sin(th / 2)
  const a = rad(probe.angle)
  return {
    at: [Math.cos(a) * d - Math.sin(a) * side, Math.sin(a) * d + Math.cos(a) * side],
    back: u > 0.5,
    s: Math.sin(th / 2),
  }
}

/* ─────────────────────────── Provenance: the shower ─────────────────────────── */

/** How far the shower has come in, 0–1. */
export const showerShown = () => eased(tree.provenance)

/** Where claim `k`'s streak burns out, just off the limb. */
export const claimAt = (k: number): Offset => {
  const a = rad(SHOWER.claims[k])
  return [Math.cos(a) * SHOWER.reach, Math.sin(a) * SHOWER.reach]
}
export const strayAt = (): Offset => {
  const a = rad(SHOWER.stray.angle)
  return [Math.cos(a) * SHOWER.reach, Math.sin(a) * SHOWER.reach]
}

/**
 * The shower at `loop` seconds. The claims fall one after another; each is
 * traced back along its path until the paths meet at the radiant; the
 * trace runs on along the stream to the comet, and the comet's light comes
 * back down every path. Then the stray falls, is traced to a generated
 * summary, on to the page it was generated from, and round from that back
 * to the summary: a loop with no parent. All of it fades before the loop
 * starts over.
 */
export function showerState(loop: number | null) {
  const t = loop ?? 0
  const n = SHOWER.claims.length
  return {
    /** 0–1 through claim `k`'s streak. */
    fall: (k: number) => clamp01((t - 0.4 - k * 0.5) / 0.75),
    /** Seconds since claim `k`'s streak burnt out (negative before). */
    burnt: (k: number) => t - 0.4 - k * 0.5 - 0.75,
    /** 0–1 of claim `k`'s path traced back to the radiant. */
    trace: (k: number) => eased((t - 3.2 - k * 0.18) / 1.1),
    radiantFound: t >= 3.2 + (n - 1) * 0.18 + 1.1,
    /** 0–1 along the stream from the radiant to the comet. */
    stream: eased((t - 5.3) / 1.3),
    cometFound: t >= 6.6,
    /** 0–1 of the comet's light come back down the paths. */
    light: eased((t - 6.8) / 1.4),
    trusted: t >= 8.2,
    strayFall: clamp01((t - 8.8) / 0.75),
    /** 0–1 back from the stray to the summary, on to the page, and round to the summary again. */
    strayTrace: eased((t - 9.9) / 1),
    strayOn: eased((t - 11) / 0.9),
    strayLoop: eased((t - 12) / 0.9),
    dropped: t >= 12.9,
    /** The whole demonstration's strength, faded at the seam. */
    alpha: loop == null ? 0 : seam(t, SHOWER_LOOP),
  }
}

/* ─────────────────────────── History and form ─────────────────────────── */

/** How far draft `i` has appeared on the orbit, 0–1; the branch is last. */
export const versionShown = (i: number) => eased((tree.versions * 2.4 - i * 0.45) / 0.6)
export const branchShown = () => eased((tree.versions * 2.4 - VERSIONS.length * 0.45 - 0.1) / 0.8)
export { BRANCH, VERSIONS }

/** Where the light leaves the Earth and splits. */
export const PRISM: Offset = [Math.cos(rad(38)) * 1.9, Math.sin(rad(38)) * 1.9]

/** How far the beam to the split, and each form's ray out of it, are drawn, 0–1. */
export const beamDrawn = () => eased((tree.formats * 1.6) / 0.4)
export const rayDrawn = (i: number) => eased((tree.formats * 1.6 - 0.3 - i * 0.15) / 0.6)

/** The end of form `i`'s ray. */
export function rayEnd(i: number): Offset {
  const a = rad(8 + i * (52 / (FORMATS.length - 1)))
  return [PRISM[0] + Math.cos(a) * 2.5, PRISM[1] + Math.sin(a) * 2.5]
}
