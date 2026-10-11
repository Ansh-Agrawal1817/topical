import type { Palette } from '../scene/palette'
import { clamp01, smooth, TAU, type Projector, type Vec3 } from '../scene/kit'
import { CRITIC, SUN_IN_GALAXY } from './content'
import { BODY, RING_OUTER, SPRITE, type PlanetKind, type SolarTextures } from './textures'

/**
 * The Solar System, placed in the galaxy at the Sun's position and drawn
 * with the galaxy's own camera. From across the galaxy it is one star; the
 * camera pans across to it, and only as it closes in do the orbits draw
 * themselves out from the Sun, inner first, each a trail behind its planet.
 * Scales are nested and stylised — the planets far larger than they are and
 * the orbits more evenly spaced — but it is one coordinate system.
 */

/** One astronomical unit, in galaxy radii. */
export const AU = 0.012
export const SUN: Vec3 = SUN_IN_GALAXY
const SUN_RADIUS = 0.14 * AU
/** The outermost orbit, in AU: the system's radius. */
export const SYSTEM_RADIUS = 3.7
/** Earth's radius in galaxy radii (stylised: big enough to see from the Sun). */
export const EARTH_RADIUS = 0.045 * AU
/**
 * Where the Earth is on its orbit: up and to the right of the Sun at the
 * chapter's turn of the galaxy, on the far side of it from the camera, so
 * the face the camera closes on is the one in daylight.
 */
const EARTH_ANGLE = (172 * Math.PI) / 180

const at = (r: number, a: number): Vec3 => [SUN[0] + Math.cos(a) * r * AU, SUN[1], SUN[2] + Math.sin(a) * r * AU]

export const EARTH: Vec3 = at(1, EARTH_ANGLE)

/** The Moon, stylised: a little over a quarter of the Earth across, four Earth radii out. */
export const MOON_RADIUS = 0.27 * EARTH_RADIUS
export const MOON_DISTANCE = 4 * EARTH_RADIUS
/**
 * A point on the Moon's orbit: `back` degrees behind where the Moon is now
 * (just right of the Earth at the chapter's turn of the galaxy), `out` times
 * the orbit's radius from the Earth.
 */
export function moonAt(back = 0, out = 1): Vec3 {
  const a = ((135 + back) * Math.PI) / 180
  return [EARTH[0] + Math.cos(a) * MOON_DISTANCE * out, EARTH[1], EARTH[2] + Math.sin(a) * MOON_DISTANCE * out]
}
export const MOON: Vec3 = moonAt()

interface Planet { name: string; kind: PlanetKind; orbit: number; size: number; speed: number; phase: number }

/** Radii in AU, stylised so each reads at the size the system is held at. */
const PLANETS: Planet[] = [
  { name: 'Mercury', kind: 'mercury', orbit: 0.5, size: 0.026, speed: 0.32, phase: 2.1 },
  { name: 'Venus', kind: 'venus', orbit: 0.75, size: 0.04, speed: 0.14, phase: 4.2 },
  { name: 'Mars', kind: 'mars', orbit: 1.3, size: 0.032, speed: 0.045, phase: 3.3 },
  { name: 'Jupiter', kind: 'jupiter', orbit: 2.2, size: 0.11, speed: 0.012, phase: 5.4 },
  { name: 'Saturn', kind: 'saturn', orbit: 2.7, size: 0.09, speed: 0.006, phase: 1.3 },
  { name: 'Uranus', kind: 'uranus', orbit: 3.2, size: 0.06, speed: 0.003, phase: 3.9 },
  { name: 'Neptune', kind: 'neptune', orbit: 3.7, size: 0.058, speed: 0.0018, phase: 0.2 },
]
const URANUS_ORBIT = 3.2
const NEPTUNE_ORBIT = 3.7
const RING_TILT = -0.35
/** The order the orbits draw in, out from the Sun. */
const ORDER = [0.5, 0.75, 1, 1.3, 2.2, 2.7, 3.2, 3.7]

/** The system's size on screen: the outermost orbit's radius in pixels. */
export const systemScale = (P: Projector, dist: number) => (SYSTEM_RADIUS * AU * P.focal) / Math.max(dist, 1e-12)

export interface SystemState {
  /** 0–1: the orbits and planets, faded in (the Sun is always there, as a star). */
  shown: number
  /** How far each planet's name has come in. */
  named: (planet: string) => number
  /**
   * 0–1 through the critic's pass: Uranus seen pulled off its course, a gap
   * marked where the pull comes from, and Neptune found in it. Until then
   * Neptune is not drawn at all.
   */
  critic: number
}

/**
 * How much of each orbit is drawn as the camera closes on the system,
 * 0–1, from the size the system has on screen: none from across the
 * galaxy, then each in turn, inner first, as it grows.
 */
function drawn(scale: number, orbit: number) {
  const u = clamp01(Math.log(scale / 34) / Math.log(240 / 34))
  const k = ORDER.indexOf(orbit)
  return smooth(0, 1, (u * 1.7 - k * 0.09) / 0.95)
}

/**
 * A planet's orbit as a trail behind it: brightest where the planet is,
 * fading to nothing most of the way round. `sweep` is how much of the
 * circle it covers, and grows as the orbit draws itself in.
 */
function trail(g: CanvasRenderingContext2D, P: Projector, r: number, head: number, sweep: number, alpha: number) {
  if (sweep <= 0.002 || alpha <= 0.005) return
  const N = Math.max(8, Math.round(64 * sweep))
  let px = 0, py = 0, pen = false
  for (let k = 0; k <= N; k++) {
    const s = k / N
    const a = head - s * sweep * TAU
    if (P.project(SUN[0] + Math.cos(a) * r * AU, SUN[1], SUN[2] + Math.sin(a) * r * AU) < 0) { pen = false; continue }
    if (pen) {
      g.globalAlpha = alpha * (1 - s) ** 1.6
      g.beginPath()
      g.moveTo(px, py)
      g.lineTo(P.x, P.y)
      g.stroke()
    }
    px = P.x
    py = P.y
    pen = true
  }
}

/**
 * Draws the system as the camera sees it. `scale` — the system's size on
 * screen — decides what is worth drawing: a single star from across the
 * galaxy, the orbits drawing out as the camera closes, planets with names
 * once it is held in view, only the Sun's light once the camera is down at
 * the Earth.
 */
export function drawSolarSystem(g: CanvasRenderingContext2D, P: Projector, pal: Palette, tex: SolarTextures, time: number, dist: number, w: number, h: number, state: SystemState) {
  const { shown, named, critic } = state
  const scale = systemScale(P, dist)
  // The critic's pass, in its stages.
  const pulled = smooth(0.05, 0.3, critic)
  const gap = smooth(0.35, 0.5, critic) * (1 - smooth(0.8, 0.95, critic))
  const found = smooth(0.68, 0.9, critic)
  // Gone by the time the camera is down at the Earth, where an orbit
  // would only be a stray line through the planet.
  const show = shown * (1 - smooth(900, 2600, scale))
  const legible = smooth(170, 260, scale) * (1 - smooth(520, 900, scale))

  // The Sun: a star from across the galaxy, a disc in its light up close.
  const zs = P.project(SUN[0], SUN[1], SUN[2])
  const sx = P.x, sy = P.y
  if (zs > 0) {
    const r = Math.max(1.3, (SUN_RADIUS * P.focal) / zs)
    const glow = Math.min(Math.max(r * 7, 14), Math.max(w, h) * 1.4)
    if (pal.dark) g.globalCompositeOperation = 'lighter'
    g.globalAlpha = 1
    g.drawImage(tex.corona, sx - glow, sy - glow, glow * 2, glow * 2)
    g.globalCompositeOperation = 'source-over'
    if (r < 4000) g.drawImage(tex.sun, sx - r * (64 / 60), sy - r * (64 / 60), r * (128 / 60), r * (128 / 60))
  }
  if (show <= 0.01) { g.globalAlpha = 1; return }

  // The orbits, each a trail behind its planet. The Earth's runs behind
  // where the Earth is held; Uranus's goes gold while it is the clue, and
  // Neptune's draws in only once Neptune is found.
  const earthAngle = Math.atan2(EARTH[2] - SUN[2], EARTH[0] - SUN[0])
  const heads = new Map<number, number>([[1, earthAngle]])
  for (const p of PLANETS) heads.set(p.orbit, p.phase + time * p.speed)
  g.lineWidth = 1
  for (const r of ORDER) {
    const d = drawn(scale, r) * (r === NEPTUNE_ORBIT ? found : 1)
    if (d <= 0.002) continue
    const uranus = r === URANUS_ORBIT
    g.strokeStyle = uranus && pulled > 0.3 && found < 0.7 ? pal.gold : pal.star
    trail(g, P, r, heads.get(r)!, d * 0.86, show * (pal.dark ? 0.42 : 0.5) * (r === 1 ? 1.25 : 1))
  }

  g.font = '500 11px ui-monospace, "IBM Plex Mono", monospace'
  g.textAlign = 'center'
  for (const p of PLANETS) {
    const neptune = p.orbit === NEPTUNE_ORBIT
    const uranus = p.orbit === URANUS_ORBIT
    const d = drawn(scale, p.orbit)
    // Uranus, while it is the clue, runs a little ahead of and behind where
    // its orbit says it should be.
    const wobble = uranus ? Math.sin(time * 2.2) * 0.045 * pulled * (1 - found) : 0
    const pos = at(p.orbit, p.phase + time * p.speed + wobble)
    if (neptune && gap > 0.01 && P.project(pos[0], pos[1], pos[2]) > 0) {
      // Where the pull must come from: marked before anything is there.
      const f = (time % 1.6) / 1.6
      g.strokeStyle = pal.gold
      g.lineWidth = 1.2
      g.globalAlpha = show * gap * 0.9
      g.beginPath()
      g.arc(P.x, P.y, 6, 0, TAU)
      g.stroke()
      g.globalAlpha = show * gap * (1 - f) * 0.7
      g.beginPath()
      g.arc(P.x, P.y, 6 + f * 14, 0, TAU)
      g.stroke()
      g.globalAlpha = show * gap * legible
      g.fillStyle = pal.gold
      g.fillText(CRITIC.gap, P.x, P.y + 26)
      g.lineWidth = 1
    }
    if (neptune && found <= 0.01) continue
    const z = P.project(pos[0], pos[1], pos[2])
    if (z < 0) continue
    const x = P.x, y = P.y
    const r = (p.size * AU * P.focal) / z
    const reach = r * (p.kind === 'saturn' ? RING_OUTER : 1) + 2
    if (x < -reach || y < -reach || x > w + reach || y > h + reach) continue
    g.globalAlpha = show * smooth(0, 0.35, d) * (neptune ? found : 1)
    drawPlanet(g, tex, p.kind, x, y, r, Math.atan2(sy - y, sx - x))
    const below = y + Math.max(r, 2) * (p.kind === 'saturn' ? 1.3 : 1) + 15
    // The critic's findings take over the names of the two it is about.
    const told = uranus ? pulled * (1 - found) : 0
    const name = show * legible * (neptune ? found : named(p.name)) * (1 - told)
    if (name > 0.01) {
      g.globalAlpha = name * 0.8
      g.fillStyle = neptune ? pal.gold : pal.label
      g.fillText(neptune ? CRITIC.found : p.name, x, below)
    }
    if (told * legible > 0.01) {
      g.globalAlpha = show * told * legible
      g.fillStyle = pal.gold
      g.fillText(CRITIC.pulled, x, below)
    }
  }
  g.textAlign = 'start'
  g.globalAlpha = 1
}

/**
 * One planet, stamped from its texture with its night side turned away from
 * the Sun (`toSun` is the screen angle toward it). Below a pixel or two it
 * is a dot: the textures are for when there is something to see.
 */
export function drawPlanet(g: CanvasRenderingContext2D, tex: SolarTextures, kind: PlanetKind, x: number, y: number, r: number, toSun: number) {
  const a = g.globalAlpha
  if (r < 1.2) {
    const d = Math.max(0.8, r * 1.6)
    g.globalAlpha = a * Math.min(1, 0.45 + r)
    g.drawImage(tex.planets[kind], x - d, y - d, d * 2, d * 2)
    g.globalAlpha = a
    return
  }
  const s = SPRITE * (r / BODY)
  g.save()
  g.translate(x, y)
  if (kind === 'saturn') {
    g.rotate(RING_TILT)
    const rw = 2 * RING_OUTER * r
    g.drawImage(tex.ringBack, -rw / 2, -rw * 0.17, rw, rw * 0.34)
    g.drawImage(tex.planets.saturn, -s / 2, -s / 2, s, s)
    g.rotate(toSun + Math.PI - RING_TILT)
    g.drawImage(tex.shadow, -s / 2, -s / 2, s, s)
    g.rotate(-(toSun + Math.PI - RING_TILT))
    g.drawImage(tex.ringFront, -rw / 2, -rw * 0.17, rw, rw * 0.34)
  } else {
    g.drawImage(tex.planets[kind], -s / 2, -s / 2, s, s)
    g.rotate(toSun + Math.PI)
    g.drawImage(tex.shadow, -s / 2, -s / 2, s, s)
  }
  g.restore()
}

/** The Earth while it is still a point: a ring and its name, for finding it. */
export function drawEarthMarker(g: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number, time: number, alpha: number) {
  if (alpha <= 0.01) return
  const ring = Math.max(r + 5, 8)
  const f = (time % 2.2) / 2.2
  g.strokeStyle = pal.air
  g.lineWidth = 1.1
  g.globalAlpha = alpha * 0.85
  g.beginPath()
  g.arc(x, y, ring, 0, TAU)
  g.stroke()
  g.globalAlpha = alpha * (1 - f) * 0.6
  g.beginPath()
  g.arc(x, y, ring + f * 14, 0, TAU)
  g.stroke()
  g.globalAlpha = alpha
  g.font = '600 12px ui-monospace, "IBM Plex Mono", monospace'
  g.fillStyle = pal.star
  g.fillText('Earth', x + ring + 6, y - ring * 0.5)
  g.globalAlpha = 1
}
