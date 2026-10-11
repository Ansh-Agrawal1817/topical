/**
 * The small amount of maths the sky needs, in one place: easing, a seeded
 * random source, and the projector that turns a point in the galaxy into a
 * point on the screen.
 *
 * One projector is set up per frame and shared by everything that draws —
 * the galaxy, every station, and the HTML anchored to stars — so a label can
 * never drift off the star it belongs to: they are placed by the same numbers.
 */

export type Vec3 = [number, number, number]

export const TAU = Math.PI * 2
export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (lo: number, hi: number, t: number) => {
  const x = clamp01((t - lo) / (hi - lo))
  return x * x * (3 - 2 * x)
}
/** Shortest way round between two angles. */
export const lerpAngle = (a: number, b: number, t: number) => {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return a + d * t
}
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
/** A point on the galactic plane, by angle (degrees) and radius. */
export const polar = (deg: number, r: number, y = 0): Vec3 => {
  const a = (deg * Math.PI) / 180
  return [Math.cos(a) * r, y, Math.sin(a) * r]
}

/** mulberry32 — the sky is the same for every visitor and every reload. */
export function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand())
}

/** Where the camera is and what it looks at. */
export interface Pose {
  /** The point in the galaxy held at the screen position (cx, cy). */
  target: Vec3
  /** Distance from the target, in galaxy radii. */
  dist: number
  /** 0 = edge-on to the disc, π/2 = looking straight down on it. */
  tilt: number
  /** The camera's bearing around the target. */
  yaw: number
  /** Screen-plane roll. */
  roll: number
  /** Screen pixels the target lands on. */
  cx: number
  cy: number
}

/**
 * Galaxy space → screen. World points are first turned with the galaxy's
 * own rotation (`spin`), then seen from the pose.
 */
export class Projector {
  focal = 1
  /** Outputs of the last `project` call. */
  x = 0
  y = 0
  private cs = 1
  private ss = 0
  private cy = 1
  private sy = 0
  private ct = 1
  private st = 0
  private cr = 1
  private sr = 0
  private tx = 0
  private ty = 0
  private tz = 0
  private dist = 1
  private ox = 0
  private oy = 0
  /**
   * The near plane, as a fraction of the camera's distance: the voyage goes
   * from a galaxy's width down to a planet's, and a fixed near plane would
   * cut away everything once the camera is closer than it.
   */
  private near = 0.004

  setup(pose: Pose, spin: number, width: number, height: number) {
    this.focal = Math.max(width * 1.08, height * 1.05)
    this.cs = Math.cos(spin)
    this.ss = Math.sin(spin)
    this.cy = Math.cos(pose.yaw)
    this.sy = Math.sin(pose.yaw)
    this.ct = Math.cos(pose.tilt)
    this.st = Math.sin(pose.tilt)
    this.cr = Math.cos(pose.roll)
    this.sr = Math.sin(pose.roll)
    const [x, y, z] = pose.target
    this.tx = x * this.cs - z * this.ss
    this.ty = y
    this.tz = x * this.ss + z * this.cs
    this.dist = pose.dist
    this.ox = pose.cx
    this.oy = pose.cy
    this.near = pose.dist * 0.01
  }

  /** Camera space: x right, y down, z away from the camera. */
  view(px: number, py: number, pz: number): [number, number, number] {
    const x1 = px * this.cs - pz * this.ss - this.tx
    const z1 = px * this.ss + pz * this.cs - this.tz
    const y1 = py - this.ty
    const x2 = x1 * this.cy - z1 * this.sy
    const z2 = x1 * this.sy + z1 * this.cy
    return [x2, y1 * this.ct - z2 * this.st, y1 * this.st + z2 * this.ct + this.dist]
  }

  /** Depth in front of the camera, or -1 when the point is behind it. Writes `x`, `y`. */
  project(px: number, py: number, pz: number, near = this.near): number {
    const x1 = px * this.cs - pz * this.ss - this.tx
    const z1 = px * this.ss + pz * this.cs - this.tz
    const y1 = py - this.ty
    const x2 = x1 * this.cy - z1 * this.sy
    const z2 = x1 * this.sy + z1 * this.cy
    const y3 = y1 * this.ct - z2 * this.st
    const z3 = y1 * this.st + z2 * this.ct + this.dist
    if (z3 < near) return -1
    const sx = (x2 * this.focal) / z3
    const sy = (y3 * this.focal) / z3
    this.x = this.ox + sx * this.cr - sy * this.sr
    this.y = this.oy + sx * this.sr + sy * this.cr
    return z3
  }

  projectV(p: Vec3, near?: number) {
    return this.project(p[0], p[1], p[2], near)
  }
}
