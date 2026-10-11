import { TAU, type Projector } from '../scene/kit'
import type { Glows, Palette } from '../scene/palette'
import { GALAXY_ITEMS, TOPIC_ROOT } from './content'
import { circle, line } from './paint'
import { partAt, partProgress, pulls, sectionAt, sectionProgress, SOLAR, tree } from './tree'

const ease = (t: number) => t * t * (3 - 2 * t)

/**
 * The topic and its parts, on the galaxy itself: a node for each, a line
 * from each to what it came out of, drawn to wherever it has got to on its
 * way out, and the pulls between parts of different sections arcing in once
 * they are all out. The Solar System's node is the Sun itself, ringed, with
 * a slow pulse: it is where the camera goes next.
 */
export function drawTopicTree(g: CanvasRenderingContext2D, P: Projector, pal: Palette, glows: Glows, alpha: number, time: number) {
  const a = alpha * tree.root
  if (a <= 0.01 || P.project(TOPIC_ROOT[0], TOPIC_ROOT[1], TOPIC_ROOT[2]) < 0) return
  const rx = P.x, ry = P.y
  // Once the whole is drawn together, everything in it holds a little firmer.
  const firm = 1 + 0.4 * tree.whole

  // Where every node is this frame, then the lines, then the nodes over them.
  const sections = GALAXY_ITEMS.map((item, i) => {
    const at = sectionAt(i)
    const z = P.project(at[0], at[1], at[2])
    const x = P.x, y = P.y
    const parts = item.parts.map((_, j) => {
      const pt = partAt(i, j)
      const zp = P.project(pt[0], pt[1], pt[2])
      return { x: P.x, y: P.y, ok: zp > 0, q: partProgress(i, j), solar: i === SOLAR.section && j === SOLAR.part }
    })
    return { x, y, ok: z > 0, s: sectionProgress(i), parts }
  })

  g.lineWidth = 1
  g.strokeStyle = pal.dust
  for (const n of sections) {
    if (!n.ok || n.s <= 0) continue
    g.globalAlpha = a * 0.42 * firm * Math.min(1, n.s * 4)
    line(g, rx, ry, n.x, n.y)
    for (const pt of n.parts) {
      if (!pt.ok || pt.q <= 0) continue
      g.globalAlpha = alpha * 0.3 * firm * Math.min(1, pt.q * 4)
      line(g, n.x, n.y, pt.x, pt.y)
    }
  }

  // The pulls: arcs bowed away from the centre, drawing from one end to the
  // other, then carrying a bead of light along them.
  pulls().forEach((pull, k) => {
    if (pull.drawn <= 0) return
    if (P.project(pull.from[0], pull.from[1], pull.from[2]) < 0) return
    const x0 = P.x, y0 = P.y
    if (P.project(pull.to[0], pull.to[1], pull.to[2]) < 0) return
    const x1 = P.x, y1 = P.y
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
    const span = Math.hypot(x1 - x0, y1 - y0) || 1
    let nx = (y0 - y1) / span, ny = (x1 - x0) / span
    if ((mx - rx) * nx + (my - ry) * ny < 0) { nx = -nx; ny = -ny }
    const cx = mx + nx * span * 0.1, cy = my + ny * span * 0.1
    // The first `t` of the curve, by de Casteljau: still a quadratic.
    const t = pull.drawn
    const ax = x0 + (cx - x0) * t, ay = y0 + (cy - y0) * t
    const ex = ax + (cx + (x1 - cx) * t - ax) * t, ey = ay + (cy + (y1 - cy) * t - ay) * t
    g.strokeStyle = pal.gold
    g.lineWidth = 1
    g.globalAlpha = alpha * 0.3 * firm
    g.beginPath()
    g.moveTo(x0, y0)
    g.quadraticCurveTo(ax, ay, ex, ey)
    g.stroke()
    if (t >= 1) {
      const u = (time * 0.2 + k * 0.37) % 1
      const bx = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1
      const by = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1
      g.globalAlpha = alpha * Math.sin(u * Math.PI)
      g.drawImage(glows.gold, bx - 6, by - 6, 12, 12)
    }
  })
  g.lineWidth = 1

  for (const n of sections) {
    if (!n.ok || n.s <= 0) continue
    for (const pt of n.parts) {
      if (!pt.ok || pt.q <= 0) continue
      if (pt.solar) {
        // The Sun is already a star here: ring it, and let it call.
        const f = (time % 2.4) / 2.4
        g.strokeStyle = pal.gold
        g.lineWidth = 1.1
        g.globalAlpha = alpha * pt.q * 0.85
        circle(g, pt.x, pt.y, 7)
        g.globalAlpha = alpha * pt.q * 0.5 * (1 - f)
        circle(g, pt.x, pt.y, 7 + f * 12)
        g.lineWidth = 1
        continue
      }
      g.globalAlpha = alpha * pt.q * 0.85
      g.fillStyle = pal.label
      circle(g, pt.x, pt.y, 1.8, true)
    }
    g.globalAlpha = a * Math.min(1, n.s * 2)
    g.strokeStyle = pal.ember
    g.lineWidth = 1.3
    circle(g, n.x, n.y, 5.5)
    g.fillStyle = pal.ember
    circle(g, n.x, n.y, 2.2, true)
  }

  // The topic: the largest node, where everything came from — and, as the
  // whole draws together, one ring going out from it across the rest.
  g.globalAlpha = a
  g.strokeStyle = pal.star
  g.lineWidth = 1.4
  circle(g, rx, ry, 9 * (0.6 + 0.4 * tree.root))
  g.fillStyle = pal.star
  circle(g, rx, ry, 3, true)
  if (tree.whole > 0 && tree.whole < 1) {
    g.globalAlpha = alpha * 0.5 * (1 - tree.whole)
    g.lineWidth = 1
    g.beginPath()
    g.arc(rx, ry, 9 + ease(tree.whole) * 340, 0, TAU)
    g.stroke()
  }
  g.lineWidth = 1
  g.globalAlpha = 1
}
