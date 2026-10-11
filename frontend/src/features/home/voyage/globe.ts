import type { Palette } from '../scene/palette'
import type { World } from './geo'

/**
 * The Earth: a small stylised planet, not a photograph. An ocean sphere,
 * the continents laid on it as flat shapes, a soft terminator, the lights
 * of cities on the night side and a rim of air. Orthographic: a sphere seen
 * from far enough off that its size on screen is all the camera's distance
 * changes.
 */

export interface GlobeView {
  cx: number
  cy: number
  /** Screen radius of the whole sphere. */
  R: number
  /** The longitude and latitude at the centre of the disc, degrees. */
  lon: number
  lat: number
}

/**
 * Where the light comes from, in view space (x right, y up, z toward the
 * viewer). Set each frame from where the Sun actually is relative to the
 * Earth, so the lit side faces the star the camera just flew past.
 */
const L = [-0.62, 0.32, 0.72]
export function setSunlight(x: number, y: number, z: number) {
  const n = Math.hypot(x, y, z) || 1
  L[0] = x / n
  L[1] = y / n
  L[2] = z / n
}
setSunlight(-0.62, 0.32, 0.72)

export class GlobeProjector {
  x = 0
  y = 0
  /** View-space normal of the last point, for lighting. */
  nx = 0
  ny = 0
  nz = 0
  private cl = 1
  private sl = 0
  private cp = 1
  private sp = 0
  private v: GlobeView = { cx: 0, cy: 0, R: 1, lon: 0, lat: 0 }

  set(view: GlobeView) {
    this.v = view
    const lo = (view.lon * Math.PI) / 180
    const la = (view.lat * Math.PI) / 180
    this.cl = Math.cos(lo)
    this.sl = Math.sin(lo)
    this.cp = Math.cos(la)
    this.sp = Math.sin(la)
  }

  /** Facing (z > 0 is on the near side); writes screen x, y and the normal. */
  project(x: number, y: number, z: number) {
    const x1 = x * this.cl - z * this.sl
    const z1 = x * this.sl + z * this.cl
    const y2 = y * this.cp - z1 * this.sp
    const z2 = y * this.sp + z1 * this.cp
    this.nx = x1
    this.ny = y2
    this.nz = z2
    this.x = this.v.cx + x1 * this.v.R
    this.y = this.v.cy - y2 * this.v.R
    return z2
  }

  /** How lit a point facing (nx, ny, nz) is, −1 (midnight) to 1 (noon). */
  light() {
    return this.nx * L[0] + this.ny * L[1] + this.nz * L[2]
  }
}

export interface GlobeStyle {
  alpha: number
  w: number
  h: number
}

/* ─────────────────────────── The night ─────────────────────────── */

/**
 * The night side as a mask over the disc, worked out per pixel at a low
 * resolution and stretched over the planet: it is soft by nature, so the
 * stretching costs nothing, and it is exact where a gradient would only be
 * a guess at a curved terminator. Repainted only when the light moves.
 */
const SHADE = 128
let shade: { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; img: ImageData; key: string } | null = null

function rgbOf(colour: string): [number, number, number] {
  const hex = colour.trim().match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const parts = colour.match(/[\d.]+/g)
  return parts ? [Number(parts[0]), Number(parts[1]), Number(parts[2])] : [0, 0, 0]
}

function nightMask(pal: Palette) {
  if (!shade) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SHADE
    const g = canvas.getContext('2d')!
    shade = { canvas, g, img: g.createImageData(SHADE, SHADE), key: '' }
  }
  const key = `${L[0].toFixed(3)},${L[1].toFixed(3)},${L[2].toFixed(3)},${pal.ground},${pal.dark}`
  if (shade.key === key) return shade.canvas
  shade.key = key
  const [r, gr, b] = rgbOf(pal.ground)
  const deepest = pal.dark ? 0.86 : 0.5
  const data = shade.img.data
  for (let j = 0; j < SHADE; j++) {
    const y = 1 - ((j + 0.5) / SHADE) * 2
    for (let i = 0; i < SHADE; i++) {
      const x = ((i + 0.5) / SHADE) * 2 - 1
      // Past the rim, carry on as if at the rim, so the clip edge stays clean.
      const nz = Math.sqrt(Math.max(0, 1 - x * x - y * y))
      const d = x * L[0] + y * L[1] + nz * L[2]
      // A terminator a few degrees soft, and the day side darkening a
      // little toward the limb, the way a lit sphere does.
      const t = Math.min(1, Math.max(0, (d + 0.08) / 0.3))
      const night = 1 - t * t * (3 - 2 * t)
      const limb = (1 - nz) ** 3 * 0.35
      const a = Math.min(1, night * deepest + limb * (1 - night))
      const k = (j * SHADE + i) * 4
      data[k] = r
      data[k + 1] = gr
      data[k + 2] = b
      data[k + 3] = Math.round(a * 255)
    }
  }
  shade.g.putImageData(shade.img, 0, 0)
  return shade.canvas
}

/* ─────────────────────────── Drawing ─────────────────────────── */

/**
 * Traces one coastline onto the path. Points round the far side are laid
 * on the rim where they went over it, so a continent crossing the edge of
 * the disc is cut along the edge. False when none of it faces the camera.
 */
function traceRing(g: CanvasRenderingContext2D, G: GlobeProjector, ring: Float32Array, cx: number, cy: number, R: number) {
  let facing = false
  for (let k = 0; k < ring.length; k += 3) {
    if (G.project(ring[k], ring[k + 1], ring[k + 2]) > 0) { facing = true; break }
  }
  if (!facing) return false
  for (let k = 0; k < ring.length; k += 3) {
    let x: number, y: number
    if (G.project(ring[k], ring[k + 1], ring[k + 2]) > 0) {
      x = G.x
      y = G.y
    } else {
      const dx = G.x - cx, dy = G.y - cy
      const d = Math.hypot(dx, dy) || 1
      x = cx + (dx / d) * R
      y = cy + (dy / d) * R
    }
    if (k === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.closePath()
  return true
}

/** The night side over the disc again, for anything painted on the globe after it. */
export function drawNight(g: CanvasRenderingContext2D, view: GlobeView, pal: Palette) {
  g.drawImage(nightMask(pal), view.cx - view.R, view.cy - view.R, view.R * 2, view.R * 2)
}

/** Every coastline onto the current path, for filling or clipping to the land. */
export function traceLand(g: CanvasRenderingContext2D, G: GlobeProjector, world: World, view: GlobeView) {
  for (const ring of world.land) traceRing(g, G, ring, view.cx, view.cy, view.R)
}

/** The sphere, its air, its land and its night. */
export function drawGlobe(g: CanvasRenderingContext2D, G: GlobeProjector, view: GlobeView, pal: Palette, world: World, s: GlobeStyle) {
  const { cx, cy, R } = view
  if (s.alpha <= 0.01) return
  // Nothing of the disc on screen: nothing to draw.
  if (cx + R * 1.3 < 0 || cx - R * 1.3 > s.w || cy + R * 1.3 < 0 || cy - R * 1.3 > s.h) return
  G.set(view)
  const sunX = L[0], sunY = -L[1]
  const a = s.alpha

  // The air: a haze round the whole limb, brightest on the Sun's side.
  const haze = g.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.22)
  haze.addColorStop(0, pal.air)
  haze.addColorStop(1, 'transparent')
  g.globalAlpha = a * (pal.dark ? 0.22 : 0.16)
  g.fillStyle = haze
  g.beginPath()
  g.arc(cx, cy, R * 1.22, 0, Math.PI * 2)
  g.fill()
  const glow = g.createRadialGradient(cx + sunX * R * 0.4, cy + sunY * R * 0.4, R * 0.7, cx, cy, R * 1.12)
  glow.addColorStop(0, pal.air)
  glow.addColorStop(1, 'transparent')
  g.globalAlpha = a * (pal.dark ? 0.32 : 0.2)
  g.fillStyle = glow
  g.beginPath()
  g.arc(cx, cy, R * 1.12, 0, Math.PI * 2)
  g.fill()

  g.save()
  g.beginPath()
  g.arc(cx, cy, R, 0, Math.PI * 2)
  g.clip()

  // The ocean, deepening away from the light.
  const sea = g.createRadialGradient(cx + sunX * R * 0.35, cy + sunY * R * 0.35, 0, cx, cy, R * 1.05)
  sea.addColorStop(0, pal.sea)
  sea.addColorStop(1, pal.deep)
  g.globalAlpha = a
  g.fillStyle = sea
  g.fillRect(cx - R, cy - R, R * 2, R * 2)

  // The land, flat, and the inland seas cut back out of it.
  if (R > 2.5) {
    g.beginPath()
    traceLand(g, G, world, view)
    g.fillStyle = pal.land
    g.fill()
    g.beginPath()
    let seas = false
    for (const ring of world.seas) seas = traceRing(g, G, ring, cx, cy, R) || seas
    if (seas) {
      g.fillStyle = sea
      g.fill()
    }
  }

  // A sheen where the Sun stands overhead.
  const sheen = g.createRadialGradient(cx + sunX * R * 0.5, cy + sunY * R * 0.5, 0, cx + sunX * R * 0.5, cy + sunY * R * 0.5, R * 0.75)
  sheen.addColorStop(0, pal.star)
  sheen.addColorStop(1, 'transparent')
  g.globalAlpha = a * (pal.dark ? 0.07 : 0.16)
  g.fillStyle = sheen
  g.fillRect(cx - R, cy - R, R * 2, R * 2)

  // The night.
  g.globalAlpha = a
  g.drawImage(nightMask(pal), cx - R, cy - R, R * 2, R * 2)

  // The cities, where it is dark.
  if (R > 36) {
    const d = Math.min(2.2, Math.max(1, R * 0.006))
    const lights = world.lights
    g.fillStyle = pal.gold
    for (let i = 0; i < lights.n; i++) {
      const z = G.project(lights.x[i], lights.y[i], lights.z[i])
      if (z <= 0.05) continue
      const dark = Math.min(1, Math.max(0, (-G.light() - 0.04) / 0.2))
      if (dark <= 0.02) continue
      g.globalAlpha = a * dark * (0.35 + 0.55 * z) * (pal.dark ? 0.9 : 0.6)
      g.fillRect(G.x - d / 2, G.y - d / 2, d, d)
    }
  }
  g.restore()

  // The rim: a thin line of lit air on the Sun's side, and the faintest
  // edge all the way round so the planet holds its shape on either ground.
  const a0 = Math.atan2(sunY, sunX)
  g.lineWidth = Math.max(1, R * 0.006)
  g.strokeStyle = pal.air
  g.globalAlpha = a * (pal.dark ? 0.75 : 0.6)
  g.beginPath()
  g.arc(cx, cy, R, a0 - 1.25, a0 + 1.25)
  g.stroke()
  g.lineWidth = 1
  g.strokeStyle = pal.dark ? pal.air : pal.star
  g.globalAlpha = a * (pal.dark ? 0.16 : 0.12)
  g.beginPath()
  g.arc(cx, cy, R, 0, Math.PI * 2)
  g.stroke()
  g.globalAlpha = 1
}
