import { clamp01, lerp, smooth } from '../scene/kit'
import { AURORA, BIOMES, CURRENTS, EARTH_LOOP, EARTH_PARTS, RIDGE, type EarthPart } from './content'
import { OUTLINE, outlineRowAt } from './earthside'
import { unit, type World } from './geo'
import { drawNight, traceLand, type GlobeProjector, type GlobeView } from './globe'
import type { EarthFrame } from './earthScenes'
import { circle, type Pt } from './paint'
import { earthStates, loopClock, tree, type PartState } from './tree'

/**
 * Chapter 03: the Earth's parts written onto the Earth itself, by two
 * writers at once.
 *
 * Each part draws its own picture as it is written — the ridge between the
 * plates glowing open down the Atlantic, the ocean's gyres traced and then
 * flowing, the air lit along the limb with an aurora over the pole, the
 * magnetic field's lines with particles running down them, life greening
 * the land — and whoever is writing it is there at the tip of the stroke,
 * as a named cursor: the AI's and yours, the way co-editors' cursors are in
 * a shared document. A numbered outline beside the planet says which part
 * is which and where each one stands.
 */

type U = [number, number, number]

/** Chaikin's corner cutting: a coarse polyline becomes a smooth curve. */
function chaikin(pts: [number, number][], closed: boolean, rounds = 2): [number, number][] {
  let out = pts
  for (let r = 0; r < rounds; r++) {
    const next: [number, number][] = []
    const n = closed ? out.length - 1 : out.length - 1
    if (!closed) next.push(out[0])
    for (let i = 0; i < n; i++) {
      const [x0, y0] = out[i]
      const [x1, y1] = out[i + 1]
      next.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75])
    }
    if (closed) next.push(next[0])
    else next.push(out[out.length - 1])
    out = next
  }
  return out
}

/** A smoothed [lon, lat] line on the sphere, as unit vectors with the running length along it. */
function onSphere(pts: [number, number][], closed: boolean) {
  const points = chaikin(pts, closed).map(([lon, lat]) => unit(lon, lat) as U)
  const run = [0]
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]]
    run.push(run[i - 1] + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
  }
  return { points, run, total: run[run.length - 1] }
}

const RIDGE_LINE = onSphere(RIDGE, false)
const GYRES = CURRENTS.map(loop => onSphere(loop, true))
const AURORA_LINE = onSphere(AURORA, false)
const BIOME_UNIT = BIOMES.map(([lon, lat, size]) => ({ at: unit(lon, lat) as U, size }))

type Line = ReturnType<typeof onSphere>

/** A point `t` (0–1, wrapping) of the way along a line on the sphere: its place on screen, and whether it faces the camera. */
function pointAlong(G: GlobeProjector, line: Line, t: number): { at: Pt; facing: boolean } {
  const d = (((t % 1) + 1) % 1) * line.total
  let i = 1
  while (i < line.run.length - 1 && line.run[i] < d) i++
  const seg = line.run[i] - line.run[i - 1] || 1
  const u = (d - line.run[i - 1]) / seg
  const a = line.points[i - 1], b = line.points[i]
  const z = G.project(lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u))
  return { at: [G.x, G.y], facing: z > 0.04 }
}

/** The first `t` (0–1) of a line on the sphere, stroked where it faces the camera. */
function strokeOnSphere(g: CanvasRenderingContext2D, G: GlobeProjector, line: Line, t: number) {
  if (t <= 0) return
  const end = t * line.total
  g.beginPath()
  let pen = false
  for (let i = 0; i < line.points.length; i++) {
    let p = line.points[i]
    if (line.run[i] > end) {
      // The tip, part way along the last segment.
      const a = line.points[i - 1]
      const u = (end - line.run[i - 1]) / (line.run[i] - line.run[i - 1] || 1)
      p = [lerp(a[0], p[0], u), lerp(a[1], p[1], u), lerp(a[2], p[2], u)]
    }
    if (G.project(p[0], p[1], p[2]) < 0.04) { pen = false }
    else if (pen) g.lineTo(G.x, G.y)
    else { g.moveTo(G.x, G.y); pen = true }
    if (line.run[i] > end) break
  }
  g.stroke()
}

/** The magnetic field: lines out of one pole and into the other, pressed in on the Sun's side and drawn out away from it. */
function fieldLines(view: GlobeView): Pt[][] {
  const tilt = -0.18
  const lines: Pt[][] = []
  const shells: [number, number][] = [[1.07, -1], [1.15, -1], [1.3, 1], [1.55, 1], [1.85, 1]]
  for (const [L, side] of shells) {
    const t0 = Math.asin(1 / Math.sqrt(L))
    const pts: Pt[] = []
    for (let k = 0; k <= 48; k++) {
      const th = t0 + ((Math.PI - 2 * t0) * k) / 48
      const r = L * Math.sin(th) ** 2
      const x = side * r * Math.sin(th)
      const y = -r * Math.cos(th)
      pts.push([view.cx + (x * Math.cos(tilt) - y * Math.sin(tilt)) * view.R, view.cy + (x * Math.sin(tilt) + y * Math.cos(tilt)) * view.R])
    }
    lines.push(pts)
  }
  return lines
}

function screenAlong(pts: Pt[], t: number): Pt {
  const f = clamp01(t) * (pts.length - 1)
  const i = Math.min(pts.length - 2, Math.floor(f))
  const u = f - i
  return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)]
}

function strokeScreen(g: CanvasRenderingContext2D, pts: Pt[], t: number) {
  if (t <= 0) return
  const f = clamp01(t) * (pts.length - 1)
  g.beginPath()
  g.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i <= Math.floor(f); i++) g.lineTo(pts[i][0], pts[i][1])
  const tip = screenAlong(pts, t)
  g.lineTo(tip[0], tip[1])
  g.stroke()
}

/** The aurora's colour: the green of oxygen high in the air, the same in either theme. */
const AURORA_RGB = '126, 224, 176'
/** The green of living land. */
const LIFE_RGB = '128, 182, 108'

/* ─────────────────────────── Cursors ─────────────────────────── */

/**
 * The two writers' cursors, eased toward wherever each is writing so that
 * moving from one part to the next is a glide across the planet, not a jump.
 */
const cursors = {
  ai: { x: 0, y: 0, a: 0, placed: false },
  you: { x: 0, y: 0, a: 0, placed: false },
}
let lastTime = 0

function drawCursor(g: CanvasRenderingContext2D, x: number, y: number, label: string, fill: string, ink: string, alpha: number) {
  if (alpha <= 0.01) return
  g.globalAlpha = alpha
  // The caret: a short upright bar, standing on the point being written.
  g.fillStyle = fill
  g.fillRect(x - 1, y - 15, 2, 17)
  // The name, flagged off the top of it.
  g.font = '600 10.5px "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif'
  const w = g.measureText(label).width + 12
  const top = y - 31
  g.beginPath()
  if (typeof g.roundRect === 'function') g.roundRect(x - 1, top, w, 16, [4, 4, 4, 0])
  else g.rect(x - 1, top, w, 16)
  g.fill()
  g.fillStyle = ink
  g.textBaseline = 'middle'
  g.fillText(label, x + 5, top + 8.5)
  g.textBaseline = 'alphabetic'
}

/* ─────────────────────────── The parts ─────────────────────────── */

interface Spot { at: Pt; facing: number }

/** Where each part's numbered mark sits this frame. */
function spotOf(G: GlobeProjector, view: GlobeView, part: EarthPart): Spot {
  if (part.on === 'sky') return { at: [view.cx + part.at[0] * view.R, view.cy + part.at[1] * view.R], facing: 1 }
  const [x, y, z] = unit(part.at[0], part.at[1])
  const depth = G.project(x, y, z)
  return { at: [G.x, G.y], facing: smooth(0.05, 0.2, depth) }
}

/**
 * One part's picture, drawn to `drawn` (0–1) of the way, at strength `a`.
 * Returns the point the writer is at — the tip of the stroke — or null.
 */
function drawPart(f: EarthFrame, world: World, part: EarthPart, state: PartState, written: number, a: number): Pt | null {
  const { g, G, pal, view, time } = f
  if (state === 'queued' || a <= 0.01) return null
  const active = state === 'writing' || state === 'review' || state === 'flagged'
  const drawn = state === 'writing' ? written : 1
  let tip: Pt | null = null
  g.lineCap = 'round'

  switch (part.mark) {
    case 'plates': {
      // The ridge, glowing open from Iceland southward as it is written,
      // then cooling to a warm seam.
      const hot = active ? 1 : 0.45
      g.strokeStyle = pal.ember
      g.globalAlpha = a * 0.22 * hot
      g.lineWidth = Math.max(4, view.R * 0.022)
      strokeOnSphere(g, G, RIDGE_LINE, drawn)
      g.globalAlpha = a * 0.9 * (0.55 + 0.45 * hot)
      g.lineWidth = 1.5
      strokeOnSphere(g, G, RIDGE_LINE, drawn)
      if (state === 'writing') {
        const p = pointAlong(G, RIDGE_LINE, drawn)
        if (p.facing) tip = p.at
      }
      // Once it is there, the seam breathes: a slow glow running down it.
      if (state === 'done') {
        for (let k = 0; k < 3; k++) {
          const p = pointAlong(G, RIDGE_LINE, (time * 0.05 + k / 3) % 1)
          if (!p.facing) continue
          g.globalAlpha = a * 0.5
          g.drawImage(f.glows.ember, p.at[0] - 7, p.at[1] - 7, 14, 14)
        }
      }
      break
    }
    case 'ocean': {
      // The gyres traced one after the other, then the water moving round them.
      g.lineWidth = 1.3
      GYRES.forEach((gyre, k) => {
        const t = clamp01(drawn * GYRES.length - k)
        if (t <= 0) return
        g.strokeStyle = state === 'review' && k === 0 ? pal.ember : pal.star
        g.globalAlpha = a * (active ? 0.6 : 0.32)
        strokeOnSphere(g, G, gyre, t)
        if (state === 'writing' && t > 0 && t < 1) {
          const p = pointAlong(G, gyre, t)
          if (p.facing) tip = p.at
        }
      })
      if (state !== 'writing') {
        // The current, flowing: beads with short tails round each loop.
        GYRES.forEach((gyre, k) => {
          for (let n = 0; n < 9; n++) {
            const u = (time * 0.035 * (k ? -1 : 1) + n / 9 + k * 0.05) % 1
            const head = pointAlong(G, gyre, u)
            const tail = pointAlong(G, gyre, u - 0.03 * (k ? -1 : 1))
            if (!head.facing || !tail.facing) continue
            const grad = g.createLinearGradient(tail.at[0], tail.at[1], head.at[0], head.at[1])
            grad.addColorStop(0, 'transparent')
            grad.addColorStop(1, pal.star)
            g.strokeStyle = grad
            g.globalAlpha = a * 0.85
            g.lineWidth = 2
            g.beginPath()
            g.moveTo(tail.at[0], tail.at[1])
            g.lineTo(head.at[0], head.at[1])
            g.stroke()
          }
        })
      }
      // The AI's suggested edit: it reads down the Gulf Stream, marking it.
      if (state === 'review') {
        const u = (time * 0.12) % 1
        const p = pointAlong(G, GYRES[0], u)
        if (p.facing) tip = p.at
      }
      break
    }
    case 'air': {
      // A line of light along the limb on the Sun's side, and the aurora.
      const sweep = 2.5 * drawn
      g.strokeStyle = pal.air
      g.globalAlpha = a * (active ? 0.9 : 0.55)
      g.lineWidth = Math.max(2, view.R * 0.009)
      g.beginPath()
      g.arc(view.cx, view.cy, view.R * 1.025, -2.75, -2.75 + sweep)
      g.stroke()
      if (state === 'writing') tip = [view.cx + Math.cos(-2.75 + sweep) * view.R * 1.025, view.cy + Math.sin(-2.75 + sweep) * view.R * 1.025]
      // The aurora: curtains standing up off the pole's oval, swaying.
      const glow = state === 'writing' ? smooth(0.5, 1, written) : 1
      if (glow > 0.01) {
        const N = 64
        for (let i = 0; i <= N; i++) {
          const p = pointAlong(G, AURORA_LINE, i / N)
          if (!p.facing) continue
          const dx = p.at[0] - view.cx, dy = p.at[1] - view.cy
          const d = Math.hypot(dx, dy) || 1
          const sway = 0.55 + 0.45 * Math.sin(time * 1.6 + i * 0.45) * Math.sin(time * 0.7 + i * 0.13)
          const len = view.R * (0.05 + 0.07 * sway)
          const x1 = p.at[0] + (dx / d) * len, y1 = p.at[1] + (dy / d) * len
          const grad = g.createLinearGradient(p.at[0], p.at[1], x1, y1)
          grad.addColorStop(0, `rgba(${AURORA_RGB}, ${0.55 * sway})`)
          grad.addColorStop(1, `rgba(${AURORA_RGB}, 0)`)
          g.strokeStyle = grad
          g.globalAlpha = a * glow
          g.lineWidth = Math.max(2, view.R * 0.012)
          g.beginPath()
          g.moveTo(p.at[0], p.at[1])
          g.lineTo(x1, y1)
          g.stroke()
        }
      }
      break
    }
    case 'field': {
      const lines = fieldLines(view)
      const flagged = state === 'flagged'
      g.strokeStyle = flagged ? pal.gold : pal.air
      const pulse = flagged ? 0.6 + 0.4 * Math.sin(time * 4) : 1
      g.globalAlpha = a * (active ? 0.5 : 0.28) * pulse
      g.lineWidth = 1.1
      for (const pts of lines) strokeScreen(g, pts, drawn)
      if (state === 'writing') tip = screenAlong(lines[lines.length - 1], drawn)
      if (state !== 'writing') {
        // Charged particles running pole to pole.
        lines.forEach((pts, k) => {
          for (let n = 0; n < 3; n++) {
            const u = (time * 0.09 + n / 3 + k * 0.17) % 1
            const p = screenAlong(pts, u)
            g.globalAlpha = a * Math.sin(u * Math.PI) * 0.9
            g.drawImage(flagged ? f.glows.gold : f.glows.star, p[0] - 4, p[1] - 4, 8, 8)
          }
        })
      }
      break
    }
    case 'life': {
      // Green spreading over the land from the Amazon outward as a soft
      // front, kept to the land, and shaded by the night like the land is.
      const [ax, ay, az] = BIOME_UNIT[0].at
      G.project(ax, ay, az)
      const ox = G.x, oy = G.y
      const reach = view.R * 2.3 * smooth(0, 1, drawn)
      if (reach > 1) {
        g.save()
        g.beginPath()
        traceLand(g, G, world, view)
        g.clip()
        const wash = g.createRadialGradient(ox, oy, 0, ox, oy, reach)
        wash.addColorStop(0, `rgba(${LIFE_RGB}, 0.78)`)
        wash.addColorStop(0.75, `rgba(${LIFE_RGB}, 0.5)`)
        wash.addColorStop(0.92, `rgba(${LIFE_RGB}, 0.62)`)
        wash.addColorStop(1, `rgba(${LIFE_RGB}, 0)`)
        g.globalAlpha = a * (active ? 0.9 : 0.7)
        g.fillStyle = wash
        g.fillRect(view.cx - view.R, view.cy - view.R, view.R * 2, view.R * 2)
        g.globalAlpha = a
        drawNight(g, view, pal)
        g.restore()
      }
      if (state === 'writing') {
        // The writer at the spreading edge, over land on the near side.
        for (const { at } of BIOME_UNIT.slice(1)) {
          if (G.project(at[0], at[1], at[2]) < 0.1) continue
          const d = Math.hypot(G.x - ox, G.y - oy)
          if (Math.abs(d - reach * 0.92) < view.R * 0.08) { tip = [G.x, G.y]; break }
        }
        tip ??= [ox, oy]
      }
      break
    }
  }
  g.lineCap = 'butt'
  g.lineWidth = 1
  return tip
}

/**
 * Everything in chapter 03 over the globe: each part's picture, its
 * numbered mark, the writers' cursors, and the line from the part being
 * worked on to its row in the outline beside the planet.
 */
export function drawEarthParts(f: EarthFrame, world: World, alpha: number) {
  const a = alpha * Math.min(1, tree.earth * 3)
  const dt = Math.min(0.1, Math.max(0, f.time - lastTime))
  lastTime = f.time
  if (a <= 0.01) {
    cursors.ai.a = cursors.you.a = 0
    cursors.ai.placed = cursors.you.placed = false
    return
  }
  const { g, G, pal, view, time } = f
  const loop = loopClock('earth', EARTH_LOOP)
  const states = earthStates(loop)
  // Before the loop starts over, everything settles back to unwritten.
  const reset = loop == null ? 0 : smooth(EARTH_LOOP - 1.1, EARTH_LOOP - 0.2, loop)

  const spots = EARTH_PARTS.map(part => spotOf(G, view, part))

  // The pictures, and where each writer is.
  const target: { ai: Pt | null; you: Pt | null } = { ai: null, you: null }
  EARTH_PARTS.forEach((part, i) => {
    const q = smooth(0, 1, clamp01((tree.earth * 1.4 - i * 0.12) / 0.9))
    const { state, written } = states[i]
    const tip = drawPart(f, world, part, state, written, a * q * (1 - reset))
    if (!tip) return
    // The review is the AI's work on your part.
    const who = state === 'review' ? 'ai' : part.who
    target[who] = tip
  })

  // The line from each part being worked on to its row in the outline.
  const rows = OUTLINE.shown()
  EARTH_PARTS.forEach((part, i) => {
    const { state } = states[i]
    if (state === 'queued' || state === 'done' || reset > 0.5 || rows <= 0.01) return
    const spot = spots[i]
    if (spot.facing < 0.5) return
    const [rx, ry] = outlineRowAt(view, i)
    const colour = state === 'flagged' ? pal.gold : state === 'review' || part.who === 'ai' ? pal.ember : pal.star
    const midX = lerp(spot.at[0], rx, 0.6)
    g.strokeStyle = colour
    g.lineWidth = 1
    g.globalAlpha = a * 0.5 * rows
    g.beginPath()
    g.moveTo(spot.at[0], spot.at[1])
    g.bezierCurveTo(midX, spot.at[1], midX, ry, rx - 6, ry)
    g.stroke()
  })

  // The numbered marks.
  g.font = '600 9px "IBM Plex Mono", ui-monospace, monospace'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const pulse = (time % 1.6) / 1.6
  EARTH_PARTS.forEach((part, i) => {
    const q = smooth(0, 1, clamp01((tree.earth * 1.4 - i * 0.12) / 0.9)) * spots[i].facing
    if (q <= 0.01) return
    const [x, y] = spots[i].at
    const { state } = states[i]
    const settled = reset > 0.5 ? 'queued' : state
    const colour = settled === 'flagged' ? pal.gold : settled === 'review' ? pal.ember : settled === 'queued' ? pal.label
      : part.who === 'you' ? pal.star : pal.ember
    g.globalAlpha = a * q * 0.8
    g.fillStyle = pal.ground
    circle(g, x, y, 9, true)
    g.globalAlpha = a * q
    g.strokeStyle = colour
    g.lineWidth = 1.2
    circle(g, x, y, 7.5)
    if (settled === 'flagged' || settled === 'review') {
      g.globalAlpha = a * q * (1 - pulse) * 0.8
      circle(g, x, y, 7.5 + pulse * 11)
      g.globalAlpha = a * q
    }
    if (settled === 'done') {
      g.fillStyle = colour
      circle(g, x, y, 7.5, true)
      g.fillStyle = pal.ground
    } else {
      g.fillStyle = colour
    }
    g.fillText(String(i + 1), x, y + 0.5)
  })
  g.textAlign = 'start'
  g.textBaseline = 'alphabetic'

  // The writers, gliding to wherever they are writing.
  const k = 1 - Math.exp(-dt * 9)
  for (const who of ['ai', 'you'] as const) {
    const c = cursors[who]
    const t = target[who]
    if (t) {
      if (!c.placed) { c.x = t[0]; c.y = t[1]; c.placed = true }
      c.x += (t[0] - c.x) * k
      c.y += (t[1] - c.y) * k
    }
    c.a += ((t ? 1 : 0) - c.a) * (1 - Math.exp(-dt * 6))
    if (!t && c.a < 0.02) c.placed = false
    drawCursor(g, c.x, c.y, who === 'ai' ? 'AI' : 'You', who === 'ai' ? pal.ember : pal.star, pal.ground, a * c.a)
  }
  g.lineWidth = 1
  g.globalAlpha = 1
}
