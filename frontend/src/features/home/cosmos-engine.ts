/**
 * The galaxy itself: a three-armed spiral of a few thousand stars in a unit
 * disc, a shell of far stars round it, neighbourhoods of extra stars where
 * the camera goes close, and the named topics the About page links.
 *
 * Plain maths over typed arrays, projected by the frame's shared `Projector`
 * (scene/kit.ts), so it lines up exactly with whatever is drawn on top of
 * it and with the HTML pinned to its stars.
 */

import { gaussian, Projector, random, TAU, type Vec3 } from './scene/kit'
import type { Glows, Palette } from './scene/palette'

const Tone = { Star: 0, Dust: 1, Ember: 2, Gold: 3 } as const

export interface Field {
  n: number
  x: Float32Array
  y: Float32Array
  z: Float32Array
  size: Float32Array
  alpha: Float32Array
  tone: Uint8Array
  /** Camera distance below which the star is drawn: Infinity for most, nearer for stars only seen close up. */
  lod: Float32Array
}

function field(n: number): Field {
  return {
    n,
    x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
    size: new Float32Array(n), alpha: new Float32Array(n), tone: new Uint8Array(n),
    lod: new Float32Array(n).fill(Infinity),
  }
}

const ARMS = 3
const TWIST = 3.4

export interface Neighbourhood {
  at: Vec3
  spread: number
  n: number
  /** Drawn only once the camera is nearer than this, fading in on the way. */
  lod?: number
}

/**
 * A clearing: no star in the cylinder of radius `r` round `at` sits on the
 * near side of the disc, so what is there is seen against stars, not
 * through them. The camera is always on the disc's −y side.
 */
export interface Clearing { at: Vec3; r: number }

/**
 * The disc, plus a neighbourhood of stars round each place the camera goes
 * close to: there it sees a few hundredths of the disc, where the spiral
 * alone would leave it nearly empty.
 */
export function buildGalaxy(n: number, neighbourhoods: Neighbourhood[], seed = 7, clearings: Clearing[] = []): Field {
  const extra = neighbourhoods.reduce((s, h) => s + h.n, 0)
  const rand = random(seed)
  const f = field(n + extra)
  const bulge = Math.floor(n * 0.14)
  let i = 0
  for (; i < n; i++) {
    let x: number, y: number, z: number, r: number
    if (i < bulge) {
      x = gaussian(rand) * 0.09
      z = gaussian(rand) * 0.09
      y = gaussian(rand) * 0.045
      r = Math.hypot(x, z)
    } else {
      r = Math.pow(rand(), 0.62)
      const scatter = gaussian(rand) * (0.16 + 0.22 * (1 - r))
      const a = ((i % ARMS) / ARMS) * TAU + r * TWIST + scatter
      const spread = 0.025 + 0.05 * r
      x = Math.cos(a) * r + gaussian(rand) * spread
      z = Math.sin(a) * r + gaussian(rand) * spread
      y = gaussian(rand) * (0.012 + 0.04 * (1 - r))
    }
    f.x[i] = x
    f.y[i] = y
    f.z[i] = z
    const roll = rand()
    f.size[i] = 0.55 + Math.pow(rand(), 4) * 2.1
    f.alpha[i] = 0.35 + rand() * 0.65
    f.tone[i] =
      r < 0.16 ? (roll < 0.6 ? Tone.Ember : roll < 0.8 ? Tone.Gold : Tone.Star)
      : roll < 0.06 ? Tone.Ember
      : roll < 0.12 ? Tone.Gold
      : roll < 0.45 ? Tone.Dust
      : Tone.Star
  }
  for (const hood of neighbourhoods) {
    for (let k = 0; k < hood.n; k++, i++) {
      f.x[i] = hood.at[0] + gaussian(rand) * hood.spread
      f.y[i] = hood.at[1] + gaussian(rand) * hood.spread * 0.3
      f.z[i] = hood.at[2] + gaussian(rand) * hood.spread
      f.size[i] = 0.5 + Math.pow(rand(), 5) * 1.8
      f.alpha[i] = 0.25 + rand() * 0.55
      f.lod[i] = hood.lod ?? Infinity
      const roll = rand()
      f.tone[i] = roll < 0.08 ? Tone.Gold : roll < 0.4 ? Tone.Dust : Tone.Star
    }
  }
  for (const c of clearings) {
    const floor = c.at[1] + c.r * 0.6
    for (let k = 0; k < f.n; k++) {
      const dx = f.x[k] - c.at[0]
      const dz = f.z[k] - c.at[2]
      if (dx * dx + dz * dz < c.r * c.r && f.y[k] < floor) f.y[k] = floor + Math.abs(f.y[k] - c.at[1])
    }
  }
  return f
}

export function buildSky(n: number, seed = 11): Field {
  const rand = random(seed)
  const f = field(n)
  for (let i = 0; i < n; i++) {
    const u = rand() * 2 - 1
    const t = rand() * TAU
    const s = Math.sqrt(1 - u * u)
    const R = 7 + rand() * 3
    f.x[i] = Math.cos(t) * s * R
    f.y[i] = u * R
    f.z[i] = Math.sin(t) * s * R
    f.size[i] = 0.5 + Math.pow(rand(), 5) * 1.4
    f.alpha[i] = 0.25 + rand() * 0.5
    f.tone[i] = rand() < 0.3 ? Tone.Dust : Tone.Star
  }
  return f
}

export interface Label { text: string; x: number; y: number; z: number }

export function placeLabels(texts: string[], seed = 23): Label[] {
  const rand = random(seed)
  return texts.map((text, i) => {
    const r = 0.26 + (i / texts.length) * 0.66 + (rand() - 0.5) * 0.06
    const a = ((i % ARMS) / ARMS) * TAU + r * TWIST + (rand() - 0.5) * 0.2
    return { text, x: Math.cos(a) * r, y: (rand() - 0.5) * 0.03, z: Math.sin(a) * r }
  })
}

export interface SkyFrame {
  g: CanvasRenderingContext2D
  P: Projector
  pal: Palette
  glows: Glows
  w: number
  h: number
  /** Camera distance from its target. */
  dist: number
  /** Extra brightness on the core (the hero's milestones). */
  flare: number
  /** 0–1: the whole galaxy's strength, for crossfading into another scene. */
  alpha?: number
  /** False when the caller has already painted the ground. */
  ground?: boolean
}

/** The ground, the core's light, the far shell and the disc. */
export function drawGalaxy(s: SkyFrame, galaxy: Field, sky: Field) {
  const { g, P, pal, glows, w, h, dist } = s
  const tones = [pal.star, pal.dust, pal.ember, pal.gold]
  const sprites = [glows.star, glows.star, glows.ember, glows.gold]

  const fade = s.alpha ?? 1
  g.globalCompositeOperation = 'source-over'
  if (s.ground !== false) {
    g.globalAlpha = 1
    g.fillStyle = pal.ground
    g.fillRect(0, 0, w, h)
  }
  if (fade <= 0.01) return

  // The core's light, wherever the core is from here.
  const coreZ = P.project(0, 0, 0)
  if (coreZ > 0) {
    const radius = Math.min((P.focal * 0.42) / coreZ, Math.max(w, h) * 1.4)
    const grad = g.createRadialGradient(P.x, P.y, 0, P.x, P.y, radius)
    grad.addColorStop(0, pal.ember)
    grad.addColorStop(1, 'transparent')
    g.globalAlpha = Math.min(0.55, (pal.dark ? 0.2 : 0.07) * (1 + s.flare * 1.8)) * fade
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
  }

  if (pal.dark) g.globalCompositeOperation = 'lighter'

  for (let i = 0; i < sky.n; i++) {
    if (P.project(sky.x[i], sky.y[i], sky.z[i]) < 0) continue
    const x = P.x, y = P.y
    if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue
    g.globalAlpha = sky.alpha[i] * 0.8 * fade
    g.fillStyle = tones[sky.tone[i]]
    const d = sky.size[i]
    g.fillRect(x - d / 2, y - d / 2, d, d)
  }

  // Ink on paper loses what light on black gains from additive blending, so
  // the atlas prints its stars a little heavier and never below a pixel.
  const ink = pal.dark ? 1 : 1.45
  // Never below a pixel: a far star drawn smaller than that is not drawn.
  const minDot = pal.dark ? 1 : 1.1
  const nearFrom = dist * 0.08
  const nearTo = dist * 0.32
  for (let i = 0; i < galaxy.n; i++) {
    const lod = galaxy.lod[i]
    if (dist >= lod) continue
    const z = P.project(galaxy.x[i], galaxy.y[i], galaxy.z[i])
    const x = P.x, y = P.y
    if (z < 0 || x < -40 || y < -40 || x > w + 40 || y > h + 40) continue
    // Sized against the camera's own distance: a star at the depth of what
    // the camera is looking at draws at its natural size, nearer is bigger.
    const scale = Math.min(4.5, Math.max(0.3, dist / z))
    const near = z < nearTo ? Math.max(0, (z - nearFrom) / (nearTo - nearFrom)) : 1
    const fog = Math.min(1, Math.max(0.3, 1.5 - z / (dist * 2 + 1.2)))
    const resolve = lod === Infinity ? 1 : Math.min(1, (lod - dist) / (lod * 0.5))
    const a = Math.min(1, galaxy.alpha[i] * near * fog * ink * resolve) * fade
    if (a <= 0.02) continue
    const d = Math.max(minDot, Math.min(galaxy.size[i] * scale * 0.9, 6))
    const tone = galaxy.tone[i]
    g.globalAlpha = a
    if (pal.dark && d > 1.5) {
      const r = d * 2.4
      g.drawImage(sprites[tone], x - r, y - r, r * 2, r * 2)
    }
    g.fillStyle = tones[tone]
    if (d > 2) {
      g.beginPath()
      g.arc(x, y, d / 2, 0, TAU)
      g.fill()
    } else {
      g.fillRect(x - d / 2, y - d / 2, d, d)
    }
  }
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
}

// Scratch space for the named stars' screen positions.
let lx = new Float32Array(0)
let ly = new Float32Array(0)
let la = new Float32Array(0)

/**
 * The named topics and the web between them — the arrival's view of the
 * whole: every topic in the galaxy, linked to the ones it touches.
 */
export function drawWeb(s: SkyFrame, labels: Label[], links: [number, number][], shown: number, font: string) {
  if (shown <= 0.01) return
  const { g, P, pal, w, h } = s
  const n = labels.length
  if (lx.length !== n) { lx = new Float32Array(n); ly = new Float32Array(n); la = new Float32Array(n) }
  for (let i = 0; i < n; i++) {
    const z = P.project(labels[i].x, labels[i].y, labels[i].z)
    la[i] = z < 0 ? 0 : 0.5 * shown
    lx[i] = P.x
    ly[i] = P.y
  }
  g.strokeStyle = pal.ember
  g.lineWidth = 1
  for (let k = 0; k < links.length; k++) {
    const grow = Math.min(1, Math.max(0, (shown - (k / links.length) * 0.6) / 0.4))
    if (grow <= 0) break
    const [a, b] = links[k]
    const alpha = Math.min(la[a], la[b])
    if (alpha < 0.03) continue
    g.globalAlpha = alpha * 0.7
    g.beginPath()
    g.moveTo(lx[a], ly[a])
    g.lineTo(lx[a] + (lx[b] - lx[a]) * grow, ly[a] + (ly[b] - ly[a]) * grow)
    g.stroke()
  }
  g.textBaseline = 'middle'
  g.font = `italic 400 12px ${font}`
  for (let i = 0; i < n; i++) {
    if (la[i] < 0.03 || lx[i] < -200 || lx[i] > w + 20 || ly[i] < -20 || ly[i] > h + 20) continue
    g.globalAlpha = la[i]
    g.strokeStyle = pal.ember
    g.beginPath()
    g.arc(lx[i], ly[i], 3, 0, TAU)
    g.stroke()
    g.fillStyle = pal.label
    g.fillText(labels[i].text, lx[i] + 8, ly[i])
  }
  g.globalAlpha = 1
}
