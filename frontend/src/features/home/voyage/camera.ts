import { lerp, lerpAngle, mix, smooth, type Pose, type Vec3 } from '../scene/kit'
import { MILKY_WAY_TURN } from './content'
import { AU, EARTH, EARTH_RADIUS, SUN, SYSTEM_RADIUS } from './solar'

/**
 * The camera: the whole flight as a function of scroll progress. There is
 * one camera and it never cuts. Every move is eased at both ends and every
 * hold drifts on the same curve, so its speed never jumps — it slows into a
 * stop and gathers itself out of one.
 */

/** Smootherstep: eases in and out with no jolt at either end. */
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
/** Where `x` sits between `a` and `b`, 0–1. */
const between = (a: number, b: number, x: number) => Math.min(1, Math.max(0, (x - a) / (b - a)))

/**
 * A pan and a zoom at once, done so that neither runs away from the other:
 * the scale changes at an even rate, and the point being travelled to
 * crosses the screen in a straight line at an even rate too. Returns the
 * camera's target and distance at `u` (0–1, eased) of the way from looking
 * at `from` at distance `d0` to looking at `to` at `d1`.
 */
function glide(from: Vec3, to: Vec3, d0: number, d1: number, u: number) {
  const dist = Math.exp(lerp(Math.log(d0), Math.log(d1), u))
  // The target closes on `to` in proportion to the distance, so `to` sits
  // (1 − u) of its first offset from the screen point the shot holds.
  return { target: mix(to, from, (1 - u) * (dist / d0)), dist }
}

/** Where the Earth sits on screen, and how big, at one of the stops that holds it. */
interface Framing { R: number; x: number; y: number }

/** The camera's tilt over the disc at each stage: looking down on the galaxy, lower over the Sun, lower still at the Earth. */
const TILT = { hero: 0.42, galaxy: 1.05, system: 0.66, earth: 0.4 }

/**
 * `spin` is how far the galaxy has turned: the camera turns against it once
 * the hero is left, so every chapter after it sees the galaxy the same way
 * however long the hero was watched.
 */
export function shot(p: number, w: number, h: number, spin: number): Pose {
  const narrow = w < 820
  const f = Math.max(w * 1.08, h * 1.05)
  const distFor = (R: number) => (EARTH_RADIUS * f) / R
  // Each stop that holds the Earth: beside the panel on a wide screen,
  // above the sheet on a phone.
  // Writing: the planet a little left of the far side, leaving room beside
  // it for the outline of its parts.
  const writing: Framing = narrow
    ? { R: Math.min(w * 0.36, h * 0.22), x: w * 0.5, y: h * 0.29 }
    : { R: Math.min(h * 0.31, w * 0.2), x: w * 0.61, y: h * 0.53 }
  const sources: Framing = narrow ? { R: w * 0.15, x: w * 0.5, y: h * 0.27 } : { R: Math.min(h * 0.16, w * 0.12), x: w * 0.66, y: h * 0.5 }
  const shower: Framing = narrow ? { R: w * 0.1, x: w * 0.3, y: h * 0.38 } : { R: Math.min(h * 0.12, w * 0.09), x: w * 0.55, y: h * 0.68 }
  const history: Framing = narrow ? { R: w * 0.07, x: w * 0.5, y: h * 0.27 } : { R: Math.min(h * 0.08, w * 0.06), x: w * 0.63, y: h * 0.5 }
  const question: Framing = narrow ? { R: w * 0.2, x: w * 0.5, y: h * 0.5 } : { R: Math.min(h * 0.13, w * 0.1), x: w * 0.5, y: h * 0.52 }
  // The Solar System when it is held: modest, to the right of the panel.
  const sysR = narrow ? w * 0.4 : Math.min(w * 0.24, h * 0.34)
  const sysAt = { x: narrow ? w * 0.5 : w * 0.66, y: narrow ? h * 0.3 : h * 0.54 }
  const dSystem = (SYSTEM_RADIUS * AU * f) / sysR

  const centre: Vec3 = [0, 0, 0]
  const hero = { dist: narrow ? 3.4 : 2.75, roll: -0.1, cx: w * 0.5, cy: h * (narrow ? 0.66 : 0.7) }
  const inside = { dist: narrow ? 2.6 : 2.0, roll: -0.04, cx: narrow ? w * 0.5 : w * 0.69, cy: narrow ? h * 0.3 : h * 0.52 }
  // The camera's bearing that holds the galaxy at the chapter's turn.
  const held = MILKY_WAY_TURN - spin
  const onEarth = (d: number, x: number, y: number): Pose => ({ target: EARTH, dist: d, tilt: TILT.earth, yaw: held, roll: 0, cx: x, cy: y })

  // ── The topic: the galaxy turning, then the chapter's view of it ──
  if (p < 0.19) {
    const e = ease(between(0.02, 0.07, p))
    const drift = smooth(0.07, 0.19, p)
    return {
      target: centre,
      dist: Math.exp(lerp(Math.log(hero.dist), Math.log(inside.dist * (1 - drift * 0.05)), e)),
      tilt: lerp(TILT.hero, TILT.galaxy, e),
      yaw: lerpAngle(spin, MILKY_WAY_TURN, e) - spin,
      roll: lerp(hero.roll, inside.roll, e),
      cx: lerp(hero.cx, inside.cx, e),
      cy: lerp(hero.cy, inside.cy, e),
    }
  }

  // ── A subtopic: the pan across to the Solar System, settling lower over it ──
  if (p < 0.39) {
    const u = ease(between(0.19, 0.3, p))
    const g = glide(centre, SUN, inside.dist * 0.95, dSystem, u)
    const stay = smooth(0.3, 0.39, p)
    return {
      target: g.target,
      dist: g.dist * (1 - 0.05 * stay),
      tilt: lerp(TILT.galaxy, TILT.system, u),
      yaw: held,
      roll: lerp(inside.roll, 0, u),
      cx: lerp(inside.cx, sysAt.x, u),
      cy: lerp(inside.cy, sysAt.y, u),
    }
  }

  // ── Another: into the Earth, and a while there ──
  if (p < 0.57) {
    const u = ease(between(0.39, 0.47, p))
    const g = glide(SUN, EARTH, dSystem * 0.95, distFor(writing.R), u)
    const stay = smooth(0.47, 0.57, p)
    return {
      target: g.target,
      dist: g.dist * (1 - 0.04 * stay),
      tilt: lerp(TILT.system, TILT.earth, u),
      yaw: held,
      roll: 0,
      cx: lerp(sysAt.x, writing.x, u),
      cy: lerp(sysAt.y, writing.y, u),
    }
  }

  // ── Then outward, a stop at a time, the Earth held all the way: its
  //    sources in orbit, the shower over it, the Moon's whole orbit, and
  //    the Earth in the middle under the question ──
  const legs: { from: number; to: number; frame: Framing }[] = [
    { from: 0.57, to: 0.61, frame: sources },
    { from: 0.7, to: 0.74, frame: shower },
    { from: 0.83, to: 0.865, frame: history },
    { from: 0.93, to: 0.96, frame: question },
  ]
  let d = distFor(writing.R) * 0.96
  let x = writing.x
  let y = writing.y
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]
    const d1 = distFor(leg.frame.R)
    if (p < leg.to) {
      const u = ease(between(leg.from, leg.to, p))
      return onEarth(Math.exp(lerp(Math.log(d), Math.log(d1), u)), lerp(x, leg.frame.x, u), lerp(y, leg.frame.y, u))
    }
    const next = legs[i + 1]
    if (!next) return onEarth(d1, leg.frame.x, leg.frame.y)
    const push = 1 - 0.03 * smooth(leg.to, next.from, p)
    if (p < next.from) return onEarth(d1 * push, leg.frame.x, leg.frame.y)
    d = d1 * push
    x = leg.frame.x
    y = leg.frame.y
  }
  return onEarth(d, x, y)
}
