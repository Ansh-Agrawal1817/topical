import { clamp01, lerp, smooth, TAU, type Projector, type Vec3 } from '../scene/kit'
import type { Glows, Palette } from '../scene/palette'
import { CONTEXT_LOOP, CONTEXT_SOURCES, CONTEXT_TASKS, FORMATS, PROBES, SHOWER, SHOWER_LOOP } from './content'
import {
  beamDrawn, BRANCH, branchShown, claimAt, PRISM, probeAt, rayDrawn, rayEnd, ringPoint, showerShown, showerState, sourceAt,
  sourceProgress, sourceSeen, strayAt, taskAt, taskPhase, versionShown, VERSIONS, type Offset,
} from './earthside'
import type { GlobeProjector, GlobeView } from './globe'
import { arc, bead, circle, line, streak, strokeAlong, type Pt } from './paint'
import { drawPlanet, MOON_RADIUS, moonAt } from './solar'
import type { SolarTextures } from './textures'
import { loopClock, tree } from './tree'

/**
 * Everything drawn round the Earth while the camera holds it. Things in
 * orbit are drawn in two passes — the half behind the planet before it,
 * the half in front after — so a ring is seen to go round it.
 */

export type Pass = 'back' | 'front'

/** What the Earth scenes need to know about this frame. */
export interface EarthFrame {
  g: CanvasRenderingContext2D
  P: Projector
  pal: Palette
  glows: Glows
  view: GlobeView
  /** The globe's own projection, already set to `view`. */
  G: GlobeProjector
  /** The Earth's depth from the camera, for what is in front of it and what behind. */
  depth: number
  /** Screen angle toward the Sun, for which side of the Moon is lit. */
  toSun: number
  time: number
}

/** A point given as an offset in globe radii from the Earth's centre, on screen. */
export const onGlobe = (view: GlobeView, [dx, dy]: Offset): Pt => [view.cx + dx * view.R, view.cy + dy * view.R]

/** A point in the galaxy on screen, with whether it is behind the Earth. */
function place(f: EarthFrame, p: Vec3): { at: Pt; behind: boolean; hidden: boolean } | null {
  const z = f.P.project(p[0], p[1], p[2])
  if (z <= 0) return null
  const at: Pt = [f.P.x, f.P.y]
  const behind = z > f.depth
  const hidden = behind && Math.hypot(at[0] - f.view.cx, at[1] - f.view.cy) < f.view.R * 1.02
  return { at, behind, hidden }
}

/**
 * A closed orbit in the galaxy, its segments split by which side of the
 * Earth they are on; only this pass's half is stroked.
 */
function orbit(f: EarthFrame, point: (a: number) => Vec3, pass: Pass, drawn = 1, from = 0) {
  const N = 120
  const { g } = f
  g.beginPath()
  let pen = false
  for (let k = 0; k <= N * drawn; k++) {
    const a = from + (k / N) * TAU
    const p = point(a)
    const z = f.P.project(p[0], p[1], p[2])
    if (z <= 0 || (z > f.depth) !== (pass === 'back')) { pen = false; continue }
    if (pen) g.lineTo(f.P.x, f.P.y)
    else { g.moveTo(f.P.x, f.P.y); pen = true }
  }
  g.stroke()
}

/* ─────────────────────────── 04 · Context ─────────────────────────── */

/**
 * What you have brought in, in orbit on one ring round the Earth that
 * passes in front of it and behind; each task in turn lighting only the
 * sources it needs and drawing their light down, condensed as it comes;
 * and probes sent out on work of their own, round past the ring and home.
 */
export function drawContext(f: EarthFrame, alpha: number, pass: Pass) {
  const a = alpha * Math.min(1, tree.context * 3)
  if (a <= 0.01) return
  const { g, pal, glows, view, time } = f
  const loop = loopClock('context', CONTEXT_LOOP) ?? 0
  const task = CONTEXT_TASKS[taskAt(loop)]
  const phase = taskPhase(loop)
  const lit = smooth(0.04, 0.18, phase) * (1 - smooth(0.82, 0.98, phase))

  // The ring, drawing itself round as the chapter opens.
  g.lineWidth = 1
  g.strokeStyle = pal.star
  g.globalAlpha = a * (pass === 'front' ? 0.32 : 0.18)
  orbit(f, t => ringPoint(t), pass, smooth(0, 0.8, tree.context), Math.PI * 0.5)

  CONTEXT_SOURCES.forEach((_, i) => {
    const q = sourceProgress(i)
    const spot = q > 0 ? place(f, sourceAt(i, time)) : null
    if (pass === 'front') sourceSeen[i] = spot && !spot.hidden ? Math.min(1, (sourceSeen[i] ?? 0) + 0.25) : Math.max(0, (sourceSeen[i] ?? 0) - 0.25)
    if (!spot || spot.hidden || spot.behind !== (pass === 'back')) return
    const [x, y] = spot.at
    const used = task.uses.includes(i)
    const on = used ? lit : 0
    const dim = spot.behind ? 0.6 : 1
    // Its light, condensed, coming down to the limb as a few beads that
    // shrink on the way.
    if (on > 0.01) {
      const d = Math.hypot(x - view.cx, y - view.cy) || 1
      const limb: Pt = [view.cx + ((x - view.cx) / d) * view.R * 1.02, view.cy + ((y - view.cy) / d) * view.R * 1.02]
      g.strokeStyle = pal.gold
      g.globalAlpha = a * on * 0.35 * dim
      line(g, x, y, limb[0], limb[1])
      for (let k = 0; k < 3; k++) {
        const u = (phase * 2.4 + k / 3) % 1
        g.globalAlpha = a * on * Math.sin(u * Math.PI) * dim
        bead(g, glows.gold, [lerp(x, limb[0], u), lerp(y, limb[1], u)], 6 * (1 - 0.6 * u))
      }
    }
    const s = 3.2 * (0.7 + 0.3 * q)
    g.globalAlpha = a * q * dim * (used ? 0.6 + 0.4 * on : 0.6 - 0.25 * lit)
    g.fillStyle = on > 0.3 ? pal.gold : pal.star
    g.save()
    g.translate(x, y)
    g.rotate(Math.PI / 4)
    g.fillRect(-s, -s, s * 2, s * 2)
    g.restore()
    if (on > 0.3) {
      g.globalAlpha = a * on * 0.55 * dim
      bead(g, glows.gold, [x, y], 11)
    }
  })

  if (pass === 'back') return
  // Work sent out, and coming back: each a light with a short trail.
  for (let i = 0; i < PROBES.length; i++) {
    const probe = probeAt(i, loop)
    if (!probe) continue
    const head = onGlobe(view, probe.at)
    const trail: Pt[] = []
    for (let k = 0; k < 10; k++) {
      const back = probeAt(i, loop - k * 0.07)
      if (!back) break
      trail.push(onGlobe(view, back.at))
    }
    const colour = probe.back ? pal.gold : pal.ember
    g.strokeStyle = colour
    g.lineWidth = 1.4
    for (let k = 1; k < trail.length; k++) {
      g.globalAlpha = a * (1 - k / trail.length) * 0.7
      line(g, trail[k - 1][0], trail[k - 1][1], trail[k][0], trail[k][1])
    }
    g.globalAlpha = a
    g.fillStyle = colour
    circle(g, head[0], head[1], 2.6, true)
    g.globalAlpha = a * 0.7
    bead(g, probe.back ? glows.gold : glows.ember, head, 9)
  }
  g.lineWidth = 1
  g.globalAlpha = 1
}

/* ─────────────────────────── 05 · Provenance: the shower ─────────────────────────── */

/**
 * Claims fall like meteors; each is traced back along its path, and the
 * paths meet at one point — what they all cite — and run on along the
 * stream to the comet that shed them, the primary source, whose light then
 * comes back down every path. One stray does not belong: traced back it
 * leads to a generated summary, on to the page that was generated from,
 * and round from that to the summary again — a loop with no parent — and
 * is dropped.
 */
export function drawShower(f: EarthFrame, alpha: number) {
  const st = showerState(loopClock('provenance', SHOWER_LOOP))
  const a = alpha * showerShown() * st.alpha
  if (a <= 0.01) return
  const { g, pal, glows, view, time } = f
  const R = view.R
  const at = (o: Offset) => onGlobe(view, o)
  const radiant = at(SHOWER.radiant)
  const comet = at(SHOWER.comet)
  const claims = SHOWER.claims.map((_, k) => at(claimAt(k)))
  // The stream: from the radiant, bowing gently, on to the comet.
  const stream = arc(radiant, comet, -0.18)

  // The comet: there all along, faint, until the trace reaches it.
  const tail: Pt = [comet[0] + R * 1.5, comet[1] - R * 0.9]
  const found = st.cometFound ? 1 : 0.22
  streak(g, tail, comet, R * 1.75, pal.star, Math.max(2, R * 0.05), a * found * 0.55)
  g.globalAlpha = a * found
  bead(g, glows.gold, comet, 10 + (st.cometFound ? 3 * Math.sin(time * 2.4) : 0))
  g.fillStyle = pal.star
  circle(g, comet[0], comet[1], 2.4, true)

  // Each claim's streak, falling toward the Earth from the radiant's side.
  claims.forEach((end, k) => {
    const fall = st.fall(k)
    if (fall <= 0) return
    const start: Pt = [lerp(end[0], radiant[0], 0.55), lerp(end[1], radiant[1], 0.55)]
    const u = 1 - (1 - fall) ** 2
    const head: Pt = [lerp(start[0], end[0], u), lerp(start[1], end[1], u)]
    if (fall < 1) {
      streak(g, start, head, R * 0.9, pal.star, 1.8, a)
      g.globalAlpha = a
      bead(g, glows.star, head, 5)
    }
    // Where it burnt out: a glint, then the claim's node.
    const since = st.burnt(k)
    if (since > -0.1 && since < 1) {
      g.globalAlpha = a * smooth(-0.1, 0.05, since) * (1 - smooth(0.1, 1, since))
      bead(g, glows.star, end, 10)
    }
  })

  // Traced back: each path, from the claim toward the radiant.
  g.lineWidth = 1
  claims.forEach((end, k) => {
    const t = st.trace(k)
    if (t <= 0) return
    g.strokeStyle = pal.star
    g.globalAlpha = a * 0.38
    strokeAlong(g, [end, radiant], t)
  })
  if (st.stream > 0) {
    g.strokeStyle = pal.star
    g.globalAlpha = a * 0.38
    strokeAlong(g, stream, st.stream)
  }
  // The comet's light, back down the stream and every path.
  if (st.light > 0) {
    const down = clamp01(st.light * 2)
    const out = clamp01(st.light * 2 - 1)
    g.strokeStyle = pal.gold
    g.lineWidth = 1.4
    g.globalAlpha = a * 0.85
    const back = [...stream].reverse()
    strokeAlong(g, back, down)
    if (down < 1) bead(g, glows.gold, alongPts(back, down), 6)
    claims.forEach(end => {
      if (out <= 0) return
      strokeAlong(g, [radiant, end], out)
      if (out < 1) bead(g, glows.gold, [lerp(radiant[0], end[0], out), lerp(radiant[1], end[1], out)], 5)
    })
    g.lineWidth = 1
  }
  // The radiant, once the paths meet there.
  if (st.radiantFound) {
    g.globalAlpha = a
    g.strokeStyle = st.light > 0.45 ? pal.gold : pal.star
    g.lineWidth = 1.2
    circle(g, radiant[0], radiant[1], 5.5)
    g.fillStyle = g.strokeStyle
    circle(g, radiant[0], radiant[1], 2, true)
    g.lineWidth = 1
  }
  // The claims' nodes.
  claims.forEach((end, k) => {
    if (st.fall(k) < 1) return
    g.globalAlpha = a
    g.fillStyle = pal.ground
    circle(g, end[0], end[1], 6, true)
    g.strokeStyle = st.trusted ? pal.gold : pal.star
    g.lineWidth = 1.2
    circle(g, end[0], end[1], 4)
    if (st.trusted) {
      g.fillStyle = pal.gold
      circle(g, end[0], end[1], 2, true)
    }
  })

  // The stray, and where it leads.
  const strayEnd = at(strayAt())
  const summary = at(SHOWER.stray.summary)
  const page = at(SHOWER.stray.page)
  if (st.strayFall > 0) {
    const start: Pt = [lerp(strayEnd[0], summary[0], 0.5), lerp(strayEnd[1], summary[1], 0.5)]
    const u = 1 - (1 - st.strayFall) ** 2
    const head: Pt = [lerp(start[0], strayEnd[0], u), lerp(start[1], strayEnd[1], u)]
    if (st.strayFall < 1) {
      streak(g, start, head, R * 0.9, pal.star, 1.8, a)
      g.globalAlpha = a
      bead(g, glows.star, head, 5)
    }
    const dead = st.dropped ? 0.4 : 1
    g.strokeStyle = st.dropped ? pal.ember : pal.dust
    g.lineWidth = 1
    g.globalAlpha = a * 0.5 * dead
    strokeAlong(g, [strayEnd, summary], st.strayTrace)
    strokeAlong(g, arc(summary, page, 0.2), st.strayOn)
    strokeAlong(g, arc(page, summary, 0.2), st.strayLoop)
    const nodes: [Pt, number][] = [[strayEnd, st.strayFall >= 1 ? 1 : 0], [summary, st.strayTrace >= 1 ? 1 : 0], [page, st.strayOn >= 1 ? 1 : 0]]
    for (const [[x, y], on] of nodes) {
      if (!on) continue
      g.globalAlpha = a * (st.dropped ? 0.7 : 1)
      g.fillStyle = pal.ground
      circle(g, x, y, 6, true)
      g.strokeStyle = st.dropped ? pal.ember : pal.dust
      g.lineWidth = 1.2
      circle(g, x, y, 4)
      if (st.dropped) {
        line(g, x - 2.4, y - 2.4, x + 2.4, y + 2.4)
        line(g, x - 2.4, y + 2.4, x + 2.4, y - 2.4)
      }
    }
  }
  g.lineWidth = 1
  g.globalAlpha = 1
}

const alongPts = (pts: Pt[], t: number): Pt => {
  const i = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)))
  const u = t * (pts.length - 1) - i
  return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)]
}

/* ─────────────────────────── 06 · History and form ─────────────────────────── */

/**
 * Drafts as the Moon where it was, along its orbit, like a long exposure:
 * fainter the older they are. A branch leaves the orbit at one of them for
 * a path of its own, and a light runs from the first draft round to now.
 * Then the document's light leaves the Earth and splits, the way light
 * splits through a prism, into each form it goes out in.
 */
export function drawHistory(f: EarthFrame, tex: SolarTextures, alpha: number, pass: Pass) {
  const a = alpha * Math.min(1, tree.versions * 4)
  if (a <= 0.01) return
  const { g, P, pal, glows, view, time } = f
  const moonR = Math.max(3, (MOON_RADIUS * P.focal) / f.depth)

  g.lineWidth = 1
  g.strokeStyle = pal.star
  g.globalAlpha = a * (pass === 'front' ? 0.3 : 0.18)
  orbit(f, t => moonAt((t * 180) / Math.PI), pass)

  VERSIONS.forEach((version, i) => {
    const q = versionShown(i)
    const spot = q > 0 ? place(f, moonAt(version.back)) : null
    if (!spot || spot.hidden || spot.behind !== (pass === 'back')) return
    g.globalAlpha = a * q * (0.3 + 0.14 * i)
    drawPlanet(g, tex, 'moon', spot.at[0], spot.at[1], moonR, f.toSun)
  })

  if (pass === 'back') return
  const b = branchShown()
  const from = place(f, moonAt(VERSIONS[BRANCH.from].back))
  const to = place(f, moonAt(BRANCH.back, BRANCH.out))
  if (b > 0 && from && to) {
    g.strokeStyle = pal.ember
    g.lineWidth = 1.2
    g.globalAlpha = a * 0.75
    strokeAlong(g, arc(from.at, to.at, 0.22), b)
    g.globalAlpha = a * smooth(0.6, 1, b) * 0.6
    drawPlanet(g, tex, 'moon', to.at[0], to.at[1], moonR, f.toSun)
    g.globalAlpha = a * smooth(0.6, 1, b)
    circle(g, to.at[0], to.at[1], moonR + 4)
  }
  // History running forward, from the first draft round to now.
  if (tree.versions >= 1) {
    const u = (time / 4) % 1
    const spot = place(f, moonAt(lerp(VERSIONS[0].back, 0, u)))
    if (spot && !spot.hidden) {
      g.globalAlpha = a * Math.sin(u * Math.PI)
      bead(g, glows.star, spot.at, 7)
    }
  }

  // One document's light, split into every form it goes out in.
  const beam = beamDrawn()
  if (beam > 0) {
    const tones = [pal.star, pal.gold, pal.ember, pal.dust, pal.air]
    const d = Math.hypot(PRISM[0], PRISM[1])
    const limb = onGlobe(view, [PRISM[0] / d, PRISM[1] / d])
    const prism = onGlobe(view, PRISM)
    g.strokeStyle = pal.star
    g.lineWidth = 2
    g.globalAlpha = a * 0.8
    strokeAlong(g, [limb, prism], beam)
    // The prism itself: a small triangle the beam enters.
    const s = Math.max(7, view.R * 0.16)
    g.lineWidth = 1.2
    g.globalAlpha = a * smooth(0.5, 1, beam)
    g.beginPath()
    for (let k = 0; k < 3; k++) {
      const t = -Math.PI / 2 + 0.66 + (k * TAU) / 3
      const x = prism[0] + Math.cos(t) * s, y = prism[1] + Math.sin(t) * s
      if (k === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.closePath()
    g.fillStyle = pal.ground
    g.fill()
    g.stroke()
    g.lineWidth = 1.3
    FORMATS.forEach((_, i) => {
      const r = rayDrawn(i)
      if (r <= 0) return
      const end = onGlobe(view, rayEnd(i))
      g.strokeStyle = tones[i % tones.length]
      g.globalAlpha = a * 0.75
      strokeAlong(g, [prism, end], r)
      if (r >= 1) {
        const u = (time * 0.45 + i * 0.21) % 1
        g.globalAlpha = a * Math.sin(u * Math.PI)
        bead(g, glows.star, [lerp(prism[0], end[0], u), lerp(prism[1], end[1], u)], 4)
      }
    })
  }
  g.lineWidth = 1
  g.globalAlpha = 1
}
