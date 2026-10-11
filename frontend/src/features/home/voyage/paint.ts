import { clamp01, lerp, TAU } from '../scene/kit'

/**
 * The few marks every scene on the voyage is drawn with, so a node, a
 * line and a glint mean the same thing at every stop.
 */

export type Pt = [number, number]

export function line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  g.beginPath()
  g.moveTo(x0, y0)
  g.lineTo(x1, y1)
  g.stroke()
}

export function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill = false) {
  g.beginPath()
  g.arc(x, y, Math.max(0, r), 0, TAU)
  if (fill) g.fill()
  else g.stroke()
}

/** A soft bead of light, stamped from a glow sprite. */
export const bead = (g: CanvasRenderingContext2D, sprite: HTMLCanvasElement, [x, y]: Pt, r: number) =>
  g.drawImage(sprite, x - r, y - r, r * 2, r * 2)

/** A point `t` (0–1) of the way along a polyline. */
export function along(points: Pt[], t: number): Pt {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]))
  let d = lengths.reduce((a, b) => a + b, 0) * clamp01(t)
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i] || i === lengths.length - 1) {
      const u = lengths[i] ? Math.min(1, d / lengths[i]) : 0
      return [lerp(points[i][0], points[i + 1][0], u), lerp(points[i][1], points[i + 1][1], u)]
    }
    d -= lengths[i]
  }
  return points[points.length - 1]
}

/** The stretch of a polyline from `t0` to `t1` (0–1), stroked. */
export function strokeAlong(g: CanvasRenderingContext2D, points: Pt[], t1: number, t0 = 0) {
  if (t1 <= t0) return
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]))
  const total = lengths.reduce((a, b) => a + b, 0)
  const a = total * clamp01(t0), b = total * clamp01(t1)
  const start = along(points, t0)
  g.beginPath()
  g.moveTo(start[0], start[1])
  let run = 0
  for (let i = 0; i < lengths.length; i++) {
    const next = run + lengths[i]
    if (next > a && next < b) g.lineTo(points[i + 1][0], points[i + 1][1])
    run = next
  }
  const end = along(points, t1)
  g.lineTo(end[0], end[1])
  g.stroke()
}

/** Points along a quadratic curve from `a` to `b`, bowed by `bow` of its length to the left of travel. */
export function arc(a: Pt, b: Pt, bow: number, n = 24): Pt[] {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const cx = mx + dy * bow, cy = my - dx * bow
  return Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n
    return [
      (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cx + t * t * b[0],
      (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cy + t * t * b[1],
    ] as Pt
  })
}

/**
 * A streak: a bright head at `head` with a tail running back toward
 * `from`, fading to nothing — a meteor, a probe, anything in flight.
 */
export function streak(g: CanvasRenderingContext2D, from: Pt, head: Pt, length: number, colour: string, width: number, alpha: number) {
  const dx = head[0] - from[0], dy = head[1] - from[1]
  const d = Math.hypot(dx, dy)
  if (d < 0.5 || alpha <= 0.01) return
  const k = Math.min(length, d) / d
  const tail: Pt = [head[0] - dx * k, head[1] - dy * k]
  const grad = g.createLinearGradient(tail[0], tail[1], head[0], head[1])
  grad.addColorStop(0, 'transparent')
  grad.addColorStop(1, colour)
  g.save()
  g.globalAlpha = alpha
  g.strokeStyle = grad
  g.lineWidth = width
  g.lineCap = 'round'
  line(g, tail[0], tail[1], head[0], head[1])
  g.restore()
}

/** An expanding ring that fades as it goes: something waiting, or something arriving. */
export function ripple(g: CanvasRenderingContext2D, x: number, y: number, r: number, grow: number, f: number, alpha: number) {
  g.globalAlpha = alpha * (1 - f)
  circle(g, x, y, r + f * grow)
}
