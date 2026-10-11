import { clamp01, mix, smooth, type Vec3 } from '../scene/kit'
import { EARTH_PARTS, GALAXY_ITEMS, GALAXY_LINKS, SUN_IN_GALAXY, TOPIC_ROOT, type NodeRef } from './content'
import { voyage, type ChapterId } from './store'

/**
 * Everything on the voyage that happens in stages. First the topic: "The
 * Milky Way" over the centre of the disc, splitting into its sections, which
 * fly out to where they are in the galaxy, and each of those splitting into
 * its own parts; then the pulls between parts of different sections drawing
 * themselves in, and last the whole of it drawing together. Then each stop
 * after it: the Solar System's planets named and the critic's pass over
 * them, the Earth's parts coming out of it, its sources coming into orbit,
 * its claims traced back like a meteor shower, the drafts along the Moon's
 * orbit and the forms the document goes out in.
 *
 * Scroll decides when each stage happens and the clock decides how: past
 * its point in the scroll a stage plays forward at its own pace, and back
 * before it, it folds up twice as fast. So the split is always seen moving,
 * however fast the page is scrolled, and stopping half way never leaves it
 * frozen mid-flight. The canvas draws the nodes and the lines between them;
 * the labels pinned to them, and the chapter's paragraphs, read the same
 * stages.
 */

export const tree = {
  /** 0–1 over each stage's length. */
  root: 0,
  split: 0,
  parts: 0,
  links: 0,
  whole: 0,
  /** The Solar System's planets, named. */
  planets: 0,
  /** The critic's pass over the Solar System. */
  critic: 0,
  /** The Earth's parts, out of it. */
  earth: 0,
  /** The sources, into orbit round the Earth. */
  context: 0,
  /** The claims traced back, like a meteor shower to its comet. */
  provenance: 0,
  /** The drafts along the Moon's orbit, and the branch. */
  versions: 0,
  /** The forms the document goes out in. */
  formats: 0,
}

const ROOT_SECS = 0.6
const SPLIT_SECS = 1.5
const PARTS_SECS = 1.5
const LINKS_SECS = 1.6
const WHOLE_SECS = 1.2
const PLANETS_SECS = 1.6
const CRITIC_SECS = 5
const EARTH_SECS = 1.4
const CONTEXT_SECS = 1.4
const PROVENANCE_SECS = 1
const VERSIONS_SECS = 2.4
const FORMATS_SECS = 1.6
/** Each node's flight from its parent, and the gap between one leaving and the next. */
const FLIGHT = 0.9
const SECTION_GAP = 0.15
const PART_GAP = 0.06
/** Each pull's draw, and the gap between one starting and the next. */
const PULL = 0.8
const PULL_GAP = 0.2

const step = (v: number, on: boolean, secs: number, dt: number) =>
  dt <= 0 ? (on ? 1 : 0) : on ? Math.min(1, v + dt / secs) : Math.max(0, v - (dt * 2) / secs)

/** Advance the stages for this frame; `dt` 0 jumps straight to where the scroll says. */
export function stepTree(p: number, dt: number) {
  tree.root = step(tree.root, p > 0.06, ROOT_SECS, dt)
  tree.split = step(tree.split, p > 0.075 && tree.root >= 1, SPLIT_SECS, dt)
  tree.parts = step(tree.parts, p > 0.095 && tree.split >= 1, PARTS_SECS, dt)
  tree.links = step(tree.links, p > 0.115 && tree.parts >= 1, LINKS_SECS, dt)
  tree.whole = step(tree.whole, p > 0.135 && tree.links >= 1, WHOLE_SECS, dt)
  tree.planets = step(tree.planets, p > 0.29 && p < 0.4, PLANETS_SECS, dt)
  tree.critic = step(tree.critic, p > 0.315 && tree.planets >= 1, CRITIC_SECS, dt)
  tree.earth = step(tree.earth, p > 0.46 && p < 0.575, EARTH_SECS, dt)
  tree.context = step(tree.context, p > 0.6 && p < 0.71, CONTEXT_SECS, dt)
  tree.provenance = step(tree.provenance, p > 0.73 && p < 0.84, PROVENANCE_SECS, dt)
  tree.versions = step(tree.versions, p > 0.855 && p < 0.94, VERSIONS_SECS, dt)
  tree.formats = step(tree.formats, p > 0.88 && p < 0.94 && tree.versions >= 1, FORMATS_SECS, dt)
}

/** The part that is the Solar System: where the camera goes next. */
export const SOLAR = (() => {
  const section = GALAXY_ITEMS.findIndex(item => item.parts.some(part => part.at === SUN_IN_GALAXY))
  return { section, part: GALAXY_ITEMS[section].parts.findIndex(part => part.at === SUN_IN_GALAXY) }
})()

const PART_INDEX = GALAXY_ITEMS.map((_, i) => GALAXY_ITEMS.slice(0, i).reduce((n, s) => n + s.parts.length, 0))

const eased = (t: number) => smooth(0, 1, clamp01(t))

/** How far section `i` has flown from the subject, 0–1. */
export const sectionProgress = (i: number) => eased((tree.split * SPLIT_SECS - i * SECTION_GAP) / FLIGHT)

/** How far part `j` of section `i` has flown from its section, 0–1. */
export const partProgress = (i: number, j: number) => eased((tree.parts * PARTS_SECS - (PART_INDEX[i] + j) * PART_GAP) / FLIGHT)

export const sectionAt = (i: number): Vec3 => mix(TOPIC_ROOT, GALAXY_ITEMS[i].at, sectionProgress(i))

export const partAt = (i: number, j: number): Vec3 => mix(sectionAt(i), GALAXY_ITEMS[i].parts[j].at, partProgress(i, j))

const nodeAt = ([id, part]: NodeRef): Vec3 => {
  const i = GALAXY_ITEMS.findIndex(item => item.id === id)
  return part == null ? sectionAt(i) : partAt(i, part)
}

/** Each pull between parts: where its ends are now, and how much of it is drawn, 0–1. */
export const pulls = () => GALAXY_LINKS.map((link, k) => ({
  from: nodeAt(link.from),
  to: nodeAt(link.to),
  drawn: eased((tree.links * LINKS_SECS - k * PULL_GAP) / PULL),
}))

/** The planets in order out from the Sun: each is named a beat after the one inside it. */
const PLANET_ORDER = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']

/** How far planet `name`'s label has come in, 0–1. */
export const planetShown = (name: string) => eased((tree.planets * PLANETS_SECS - PLANET_ORDER.indexOf(name) * 0.14) / 0.6)

export type PartState = 'queued' | 'writing' | 'review' | 'flagged' | 'done'

/**
 * Seconds into a stop's own loop, from when its chapter came on screen;
 * null while it is off. Under reduced motion: the end of the loop, where
 * everything has happened.
 */
export function loopClock(chapter: ChapterId, loop: number): number | null {
  const since = voyage.since[chapter]
  if (since == null) return null
  return voyage.reduced ? loop - 0.2 : (voyage.time - since) % loop
}

/** Each of the Earth's parts at `loop` seconds, and how far the one being written has got. */
export function earthStates(loop: number | null): { state: PartState; written: number }[] {
  return EARTH_PARTS.map(part => {
    if (loop == null || loop < part.start) return { state: 'queued', written: 0 }
    let end = part.start + part.dur
    if (loop < end) return { state: 'writing', written: (loop - part.start) / part.dur }
    if (part.review && loop < (end += part.review)) return { state: 'review', written: 1 }
    if (part.flag && loop < end + part.flag) return { state: 'flagged', written: 1 }
    return { state: 'done', written: 1 }
  })
}
