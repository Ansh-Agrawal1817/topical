import { polar, type Vec3 } from '../scene/kit'

/**
 * What the voyage shows at each stop: a subject and its parts, the pulls
 * between them, and the parts of a subtopic being written. Every fact here
 * is real: a page about a tool that checks claims cannot make any up.
 */

/* ─────────────────────────── 01 · The Milky Way ─────────────────────────── */

/** Where the Sun is in the galaxy: between two arms, a little over half way out. */
export const SUN_IN_GALAXY: Vec3 = polar(167, 0.55, 0.004)

/**
 * The galaxy's turn, in radians, at which the chapter reads: the Sun up in
 * the top corner of the view, the tree below and left of it, clear of the
 * panel. The camera comes round to it from wherever the hero's slow spin
 * has left the disc.
 */
export const MILKY_WAY_TURN = (-127 * Math.PI) / 180

/** The subject itself, held over the centre before it comes apart. */
export const TOPIC_ROOT: Vec3 = [0, -0.2, 0]

/**
 * A part of the subject, and its own parts. Sections that are places sit
 * where they are; the rest sit near what they belong to, laid out so that
 * at the chapter's view the labels clear each other and the panel.
 */
export interface GalaxyPart { name: string; at: Vec3; align: 'right' | 'left' | 'below' }

export interface GalaxyItem {
  id: string
  name: string
  at: Vec3
  align: 'right' | 'left'
  parts: GalaxyPart[]
}

/** The subject's sections, from the centre out, each with two parts of its own. */
export const GALAXY_ITEMS: GalaxyItem[] = [
  {
    id: 'sgr', name: 'Sagittarius A*', at: [0, 0.01, 0], align: 'right',
    parts: [
      { name: 'S2’s orbit', at: polar(322, 0.11), align: 'left' },
      { name: 'The 2022 image', at: polar(57, 0.13), align: 'right' },
    ],
  },
  {
    id: 'arms', name: 'The spiral arms', at: polar(115, 0.3), align: 'right',
    parts: [
      { name: 'Perseus Arm', at: polar(135, 0.5), align: 'left' },
      { name: 'Scutum–Centaurus Arm', at: polar(87, 0.44), align: 'left' },
    ],
  },
  {
    id: 'spur', name: 'The Orion Spur', at: polar(189, 0.45), align: 'left',
    parts: [
      { name: 'The Solar System', at: SUN_IN_GALAXY, align: 'below' },
      { name: 'The Local Bubble', at: polar(152, 0.47), align: 'left' },
    ],
  },
  {
    id: 'halo', name: 'Dark-matter halo', at: polar(277, 0.36, -0.1), align: 'right',
    parts: [
      { name: 'Rotation curves', at: polar(252, 0.52, -0.1), align: 'right' },
      { name: 'The galaxy’s mass', at: polar(292, 0.46, -0.1), align: 'right' },
    ],
  },
  {
    id: 'group', name: 'The Local Group', at: polar(12, 0.3), align: 'right',
    parts: [
      { name: 'Andromeda', at: polar(45, 0.42), align: 'right' },
      { name: 'The Magellanic Clouds', at: polar(355, 0.44), align: 'right' },
    ],
  },
]

/** A node of the tree: a section, or one of its parts. */
export type NodeRef = [section: string, part?: number]

/**
 * What ties parts of different sections to each other, drawn once the tree
 * is out: no part means what it means on its own. Each pull is a real one.
 */
export const GALAXY_LINKS: { from: NodeRef; to: NodeRef; why: string }[] = [
  { from: ['sgr', 0], to: ['halo', 0], why: 'both weigh mass by what orbits it: S2 weighs the black hole, the curve the galaxy' },
  { from: ['halo', 0], to: ['spur', 0], why: 'the Sun’s own speed round the centre is one point on the rotation curve' },
  { from: ['halo', 1], to: ['group', 0], why: 'the two galaxies’ masses set how they fall toward each other' },
  { from: ['group', 1], to: ['halo'], why: 'the Large Magellanic Cloud is massive enough to pull the halo out of shape' },
  { from: ['arms', 0], to: ['spur'], why: 'the Orion Spur is a minor arm between the Perseus and Sagittarius arms' },
]

/* ─────────────────────────── 02 · The Solar System: the critic ─────────────────────────── */

/**
 * The critic at work, drawn the way Neptune was found — Uranus drifting from
 * where its orbit said it should be, the unseen mass worked out on paper,
 * Neptune found within a degree of the prediction in 1846 — but labelled in
 * the critic's own terms: a part that doesn't add up, a gap, the missing
 * part added. The scene carries the analogy; the words never need to.
 */
export const CRITIC = {
  pulled: 'Uranus · doesn’t add up',
  gap: 'a gap: something is missing here',
  found: 'Neptune · the missing part, added',
}

/* ─────────────────────────── 03 · Earth: written together ─────────────────────────── */

/**
 * The Earth's own parts, each marked where it lives. Most are places on the
 * globe, given as [longitude, latitude] and turning with it: the plates on
 * the Mid-Atlantic Ridge, the oceans in the South Atlantic, life in the
 * Amazon. The air and the field are round the planet, not on it, so they
 * are offsets in globe radii from its centre on screen (x right, y down).
 *
 * And how each is written: by the AI or by you, at the same time. One you
 * wrote then gets an edit suggested by the AI, which you accept; one is
 * held back until a claim in it is traced to a source.
 */
export interface EarthPart {
  name: string
  at: [number, number]
  on: 'globe' | 'sky'
  /** What is drawn for it while it is written. */
  mark: 'plates' | 'ocean' | 'air' | 'field' | 'life'
  who: 'ai' | 'you'
  /** Seconds into the loop it starts being written, and for how long. */
  start: number
  dur: number
  /** Seconds an edit suggested by the AI waits for your answer. */
  review?: number
  /** Seconds it waits with a claim unsourced before it settles. */
  flag?: number
}

export const EARTH_PARTS: EarthPart[] = [
  { name: 'Plate tectonics', at: [-44, 24], on: 'globe', mark: 'plates', who: 'ai', start: 0.6, dur: 2.6 },
  { name: 'The oceans', at: [-26, -30], on: 'globe', mark: 'ocean', who: 'you', start: 1, dur: 3.6, review: 2.4 },
  { name: 'The atmosphere', at: [0.72, -0.72], on: 'sky', mark: 'air', who: 'ai', start: 7.2, dur: 2 },
  { name: 'The magnetic field', at: [0.02, -1.22], on: 'sky', mark: 'field', who: 'ai', start: 9.4, dur: 2.2, flag: 2.2 },
  { name: 'Life', at: [-62, -5], on: 'globe', mark: 'life', who: 'you', start: 7.4, dur: 3.6 },
]

/** The Mid-Atlantic Ridge, Iceland to the Southern Ocean, for the plates. */
export const RIDGE: [number, number][] = [
  [-19, 64], [-27, 58], [-30, 52], [-29, 45], [-33, 39], [-38, 33], [-44, 25], [-46, 17], [-44, 12], [-38, 7], [-30, 2],
  [-18, -1], [-13, -8], [-13, -15], [-14, -25], [-14, -35], [-16, -45], [-17, -53],
]

/**
 * The oceans' two great Atlantic gyres, as closed loops of [longitude,
 * latitude]: the north one up the Gulf Stream and back down past the Canary
 * Islands, the south one down the coast of Brazil and back up past
 * Benguela. Particles run round them once the part is written.
 */
export const CURRENTS: [number, number][][] = [
  [[-80, 25], [-78, 31], [-73, 36], [-65, 40], [-55, 42], [-44, 44], [-33, 46], [-24, 45], [-18, 39], [-17, 31], [-20, 24],
    [-28, 18], [-40, 15], [-52, 15], [-63, 17], [-72, 20], [-80, 25]],
  [[-35, -8], [-38, -16], [-43, -24], [-48, -32], [-46, -39], [-36, -43], [-22, -42], [-8, -39], [5, -34], [10, -27],
    [8, -19], [2, -13], [-8, -9], [-20, -7], [-35, -8]],
]

/** Where the aurora hangs: the oval round the north magnetic pole. */
export const AURORA: [number, number][] = [
  [-150, 64], [-130, 66], [-110, 66], [-95, 64], [-80, 62], [-65, 62], [-50, 63], [-35, 65], [-20, 67], [-5, 69], [10, 70], [25, 70], [40, 69],
]

/** Where life takes hold, in the order it spreads: the Amazon first, then outward. */
export const BIOMES: [number, number, number][] = [
  [-62, -5, 1.2], [-55, -11, 0.9], [-70, 1, 0.85], [-48, -2, 0.7], [-74, -12, 0.65], [22, 0, 1.1], [15, 5, 0.75], [27, -8, 0.75],
  [-86, 15, 0.6], [-80, 36, 0.8], [-90, 42, 0.7], [8, 48, 0.75], [25, 54, 0.75], [-60, -25, 0.55], [30, -22, 0.6],
]

/**
 * The face the Earth turns to the camera: the Atlantic while its parts are
 * written, turning west as the page goes on (`turn` degrees of longitude
 * over the whole scroll), so it is seen to rotate as the camera pulls out.
 */
export const EARTH_FACE = { lon: -26, at: 0.52, turn: -60, lat: 16 }

export const EARTH_LOOP = 16.5

/* ─────────────────────────── 04 · Context: what you trust, in orbit ─────────────────────────── */

/**
 * The ring your sources orbit on: a circle round the Earth, `r` globe radii
 * out, tipped `incline` radians out of the plane the camera sees the Solar
 * System in, so it crosses in front of the planet and behind it.
 */
export const CONTEXT_RING = { r: 2.2, incline: -0.3, speed: 0.045 }

/** What you have brought in: each at a turn of the ring. */
export const CONTEXT_SOURCES: { name: string; phase: number }[] = [
  { name: 'a paper · PDF', phase: 0.02 },
  { name: 'a web page', phase: 0.18 },
  { name: 'your notes', phase: 0.35 },
  { name: 'a report · DOCX', phase: 0.52 },
  { name: 'lecture slides', phase: 0.68 },
  { name: 'a dataset', phase: 0.85 },
]

/** Tasks in turn, each drawing in only the sources it needs, condensed. */
export const CONTEXT_TASKS: { label: string; uses: number[]; from: number; to: number }[] = [
  { label: 'writing · The oceans', uses: [0, 4], from: 16, to: 2 },
  { label: 'checking · The magnetic field', uses: [1, 3, 5], from: 22, to: 3 },
  { label: 'outlining · Life', uses: [2, 4], from: 9, to: 1.5 },
]
export const CONTEXT_TASK_SECS = 4.5

/**
 * Work handed off: out from the Earth past the ring and back, with what it
 * found. `angle` is the screen direction it leaves in, degrees (0 right, 90
 * down).
 */
export const PROBES: { label: string; back: string; angle: number; start: number }[] = [
  { label: 'researching', back: '4 new sources', angle: -62, start: 0.5 },
  { label: 'fact-checking', back: '2 claims confirmed', angle: -14, start: 4.9 },
  { label: 'reviewing the draft', back: '1 gap found', angle: 32, start: 9.3 },
]
export const PROBE_TRIP = 6.5
export const CONTEXT_LOOP = 13.5

/* ─────────────────────────── 05 · Provenance: a meteor shower ─────────────────────────── */

/**
 * The Perseids look as if they come from nowhere. Traced back, every streak
 * meets the others at one point in the sky — the radiant, in Perseus — and
 * the stream they belong to leads on to the comet that shed them, 109P/
 * Swift–Tuttle. A claim is traced the same way: back through what it cites,
 * to where it began. One streak does not belong to the shower; traced back,
 * it runs to generated text that only cites more generated text, round in
 * a loop with no parent, and is not used.
 *
 * Positions are in globe radii from the Earth's centre on screen.
 */
export const SHOWER = {
  /** Where the claims' paths meet: the review they all cite. */
  radiant: [2.55, -2.25] as [number, number],
  /** The parent: the original measurement. */
  comet: [4.4, -3.15] as [number, number],
  /** Where each claim's streak burns out, as an angle round the limb (degrees) and a distance out. */
  claims: [-64, -42, -20, 2],
  reach: 1.1,
  /** The stray: where its streak ends, and the two generated pages it leads back to. */
  stray: { angle: -112, summary: [-0.55, -2.7] as [number, number], page: [0.85, -3.25] as [number, number] },
}

export const SHOWER_NAMES = {
  claims: 'claims in your draft',
  radiant: 'a review they all cite',
  comet: 'the original measurement',
  summary: 'a generated summary',
  page: 'a page generated from it',
}
export const SHOWER_LOOP = 15

/* ─────────────────────────── 06 · History and form ─────────────────────────── */

/**
 * Drafts as the Moon where it was, along its orbit behind where it is now
 * (degrees back), like a long exposure; and a branch that leaves the orbit
 * at one of them to try something else.
 */
export const VERSIONS: { name: string; back: number }[] = [
  { name: 'v1 · outline', back: 150 },
  { name: 'v2 · first draft', back: 100 },
  { name: 'v3 · reviewed', back: 52 },
]
export const BRANCH = { name: 'branch · for a younger reader', from: 1, back: 77, out: 1.5 }

/** One document, sent out in every form it needs. */
export const FORMATS = ['Markdown', 'MDX', 'LaTeX', 'PDF', 'Website']
