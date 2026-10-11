import type { Palette } from '../scene/palette'

/**
 * The Solar System's textures: the Sun and each planet painted once, per
 * theme, into a small canvas, so a frame only stamps them. They are painted
 * while the browser is idle after the page loads, long before the camera
 * reaches the system; a frame that needs them sooner paints them itself.
 *
 * Stylised, not photographic: each planet is a flat colour with a few soft
 * bands, the way an illustrated orrery would have them, and one shading
 * sprite turned toward the Sun gives every one the same light.
 */

export type PlanetKind = 'mercury' | 'venus' | 'earth' | 'moon' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune'

export interface SolarTextures {
  /** The Sun's disc. */
  sun: HTMLCanvasElement
  /** Its light: drawn several times the disc's size. */
  corona: HTMLCanvasElement
  /** Each planet's face, lit evenly; `shadow` adds the night side. */
  planets: Record<PlanetKind, HTMLCanvasElement>
  /** A sphere's shading with the light from −x: turned toward the Sun when stamped. */
  shadow: HTMLCanvasElement
  /** Saturn's rings: the half behind the planet and the half in front. */
  ringBack: HTMLCanvasElement
  ringFront: HTMLCanvasElement
}

/** Sprites are this many pixels across, with the body's radius at `BODY`. */
export const SPRITE = 96
export const BODY = 44
/** Ring sprites are wider: the outer edge sits at `RING_OUTER` body radii. */
export const RING_SPRITE = 256
export const RING_OUTER = 2.2

function canvas(w: number, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

interface Look {
  base: string
  /** Soft bands across the disc: centre (−1 top to 1 bottom), width, colour, strength. */
  bands?: [at: number, width: number, colour: string, alpha: number][]
  /** Patches: x, y and radius in body radii. */
  spots?: [x: number, y: number, r: number, colour: string, alpha: number][]
}

/** Each planet's look, the same in both themes: they are lit objects, not ink. */
const LOOKS: Record<PlanetKind, Look> = {
  mercury: { base: '#a29a90', spots: [[-0.3, -0.25, 0.18, '#7f776c', 0.5], [0.25, 0.2, 0.22, '#8b8378', 0.45], [0.1, -0.5, 0.1, '#7a7268', 0.4]] },
  venus: { base: '#e4c995', bands: [[-0.35, 0.35, '#f1dfb8', 0.55], [0.3, 0.4, '#d6b47a', 0.4]] },
  earth: {
    base: '#3f78ad',
    spots: [[-0.32, -0.18, 0.34, '#b9ae8d', 0.95], [0.3, 0.28, 0.26, '#b9ae8d', 0.9], [0.05, -0.82, 0.32, '#eef2f4', 0.9], [0.1, 0.86, 0.3, '#eef2f4', 0.85]],
    bands: [[-0.05, 0.12, '#ffffff', 0.18]],
  },
  moon: {
    base: '#cfc9be',
    spots: [[-0.28, -0.22, 0.24, '#9d968b', 0.55], [0.22, -0.35, 0.14, '#a39c91', 0.5], [0.28, 0.18, 0.26, '#a19a8f', 0.45], [-0.2, 0.36, 0.15, '#9d968b', 0.5], [-0.52, 0.06, 0.1, '#a7a095', 0.45]],
  },
  mars: { base: '#c46a43', bands: [[0.15, 0.45, '#a9502f', 0.45]], spots: [[0, -0.9, 0.3, '#f3e9e0', 0.85]] },
  jupiter: {
    base: '#dcc09a',
    bands: [[-0.62, 0.16, '#b98a62', 0.7], [-0.3, 0.2, '#f1e2c8', 0.6], [0.02, 0.22, '#c4936a', 0.65], [0.34, 0.16, '#efdcc0', 0.55], [0.62, 0.14, '#b38460', 0.6]],
    spots: [[0.32, 0.26, 0.15, '#c0603d', 0.75]],
  },
  saturn: { base: '#e3cd98', bands: [[-0.4, 0.3, '#f0e2bd', 0.55], [0.12, 0.22, '#cdb179', 0.5], [0.5, 0.18, '#d4b983', 0.45]] },
  uranus: { base: '#a6d5da', bands: [[-0.1, 0.5, '#bfe3e6', 0.4]] },
  neptune: { base: '#4f78c6', bands: [[0.2, 0.25, '#3d62aa', 0.5], [-0.35, 0.15, '#7697d8', 0.35]], spots: [[-0.2, 0.15, 0.12, '#2f4f90', 0.6]] },
}

function body(look: Look) {
  const [c, g] = canvas(SPRITE)
  const m = SPRITE / 2
  g.save()
  g.beginPath()
  g.arc(m, m, BODY, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = look.base
  g.fillRect(0, 0, SPRITE, SPRITE)
  // Bands and patches are blurred a touch so they read as weather, not paint.
  g.filter = 'blur(1.2px)'
  for (const [at, width, colour, alpha] of look.bands ?? []) {
    g.globalAlpha = alpha
    g.fillStyle = colour
    g.fillRect(0, m + at * BODY - (width * BODY) / 2, SPRITE, width * BODY)
  }
  for (const [x, y, r, colour, alpha] of look.spots ?? []) {
    g.globalAlpha = alpha
    g.fillStyle = colour
    g.beginPath()
    g.arc(m + x * BODY, m + y * BODY, r * BODY, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
  return c
}

/** Per pixel: Lambert light from −x and a little in front, softly terminated. */
function shading(pal: Palette) {
  const [c, g] = canvas(SPRITE)
  const img = g.createImageData(SPRITE, SPRITE)
  const m = SPRITE / 2
  const lx = -0.94, lz = 0.34
  const deepest = pal.dark ? 0.9 : 0.55
  const [r, gr, b] = pal.dark ? [8, 7, 6] : [42, 37, 30]
  for (let j = 0; j < SPRITE; j++) {
    for (let i = 0; i < SPRITE; i++) {
      const x = (i + 0.5 - m) / BODY
      const y = (j + 0.5 - m) / BODY
      const rr = x * x + y * y
      if (rr > 1.04) continue
      const nz = Math.sqrt(Math.max(0, 1 - rr))
      const d = x * lx + nz * lz
      const t = Math.min(1, Math.max(0, (d + 0.05) / 0.35))
      const night = 1 - t * t * (3 - 2 * t)
      const limb = (1 - nz) ** 2.5 * 0.4
      // Anti-aliased edge.
      const edge = Math.min(1, Math.max(0, (1.02 - Math.sqrt(rr)) / 0.04))
      const k = (j * SPRITE + i) * 4
      img.data[k] = r
      img.data[k + 1] = gr
      img.data[k + 2] = b
      img.data[k + 3] = Math.round(Math.min(1, night * deepest + limb * (1 - night)) * edge * 255)
    }
  }
  g.putImageData(img, 0, 0)
  return c
}

function paint(pal: Palette): SolarTextures {
  const [sun, gs] = canvas(128)
  const disc = gs.createRadialGradient(58, 56, 0, 64, 64, 60)
  if (pal.dark) {
    disc.addColorStop(0, '#fffaf0')
    disc.addColorStop(0.45, '#ffe2a6')
    disc.addColorStop(0.85, '#f6b45f')
    disc.addColorStop(1, '#e8924a')
  } else {
    disc.addColorStop(0, '#fbdc8f')
    disc.addColorStop(0.6, '#f0b456')
    disc.addColorStop(1, '#d9843a')
  }
  gs.fillStyle = disc
  gs.beginPath()
  gs.arc(64, 64, 60, 0, Math.PI * 2)
  gs.fill()

  const [corona, gc] = canvas(256)
  const light = gc.createRadialGradient(128, 128, 0, 128, 128, 128)
  light.addColorStop(0, pal.dark ? 'rgba(255, 226, 166, 0.85)' : 'rgba(240, 180, 86, 0.55)')
  light.addColorStop(0.1, pal.dark ? 'rgba(255, 206, 128, 0.42)' : 'rgba(240, 180, 86, 0.3)')
  light.addColorStop(0.32, pal.dark ? 'rgba(240, 150, 80, 0.12)' : 'rgba(217, 132, 58, 0.08)')
  light.addColorStop(1, 'rgba(240, 150, 80, 0)')
  gc.fillStyle = light
  gc.fillRect(0, 0, 256, 256)

  const planets = Object.fromEntries(
    (Object.keys(LOOKS) as PlanetKind[]).map(kind => [kind, body(LOOKS[kind])]),
  ) as Record<PlanetKind, HTMLCanvasElement>

  // The rings, face-on in a square, squashed into an ellipse when stamped.
  const ring = (half: 'back' | 'front') => {
    const [c, g] = canvas(RING_SPRITE)
    const r = RING_SPRITE / 2
    const unit = r / RING_OUTER
    g.save()
    g.beginPath()
    if (half === 'back') g.rect(0, 0, RING_SPRITE, r)
    else g.rect(0, r, RING_SPRITE, r)
    g.clip()
    const bands: [number, number, number][] = [[1.25, 1.5, 0.35], [1.52, 1.9, 0.8], [1.96, 2.18, 0.5]]
    for (const [a, b, alpha] of bands) {
      g.globalAlpha = alpha
      g.strokeStyle = '#d8c08c'
      g.lineWidth = (b - a) * unit
      g.beginPath()
      g.arc(r, r, ((a + b) / 2) * unit, 0, Math.PI * 2)
      g.stroke()
    }
    g.restore()
    return c
  }

  return { sun, corona, planets, shadow: shading(pal), ringBack: ring('back'), ringFront: ring('front') }
}

let cache: { pal: Palette; textures: SolarTextures } | null = null
let cancel: (() => void) | null = null

/** The textures for this palette, painting them now if they are not ready. */
export function solarTextures(pal: Palette): SolarTextures {
  if (cache?.pal !== pal) cache = { pal, textures: paint(pal) }
  return cache.textures
}

/** Paint the textures for this palette the next time the browser is idle. */
export function prepareSolarTextures(pal: Palette) {
  cancelPrepare()
  const run = () => { cancel = null; solarTextures(pal) }
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 1500 })
    cancel = () => window.cancelIdleCallback(id)
  } else {
    const id = setTimeout(run, 200)
    cancel = () => clearTimeout(id)
  }
}

export function cancelPrepare() {
  cancel?.()
  cancel = null
}
