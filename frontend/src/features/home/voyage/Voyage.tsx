import { useEffect, useRef, type ReactNode } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { buildGalaxy, buildSky, drawGalaxy, type SkyFrame } from '../cosmos-engine'
import { Projector, smooth, TAU } from '../scene/kit'
import { glowsFor, readPalette, type Glows, type Palette } from '../scene/palette'
import { shot } from './camera'
import { EARTH_FACE, MILKY_WAY_TURN } from './content'
import { drawContext, drawHistory, drawShower, onGlobe, type EarthFrame } from './earthScenes'
import { drawEarthParts } from './earthParts'
import { moonSeen } from './earthside'
import { theWorld } from './geo'
import { drawGlobe, GlobeProjector, setSunlight, type GlobeView } from './globe'
import { AU, drawEarthMarker, drawPlanet, drawSolarSystem, EARTH, EARTH_RADIUS, MOON, MOON_RADIUS, SUN, SYSTEM_RADIUS, systemScale } from './solar'
import { cancelPrepare, prepareSolarTextures, solarTextures } from './textures'
import { drawTopicTree } from './topic'
import { partProgress, planetShown, SOLAR, stepTree, tree } from './tree'
import { anchors, CHAPTER_REST, CHAPTERS, voyage, type ChapterId } from './store'

/**
 * The voyage: one sticky stage the height of the screen, held in place while
 * the page scrolls past it, one canvas, and the chapter panels over it.
 *
 * It is a walk down a topic and back up. There is one camera and it never
 * cuts (camera.ts); every place on the way is in the same space at its own
 * scale:
 *
 *   the galaxy, whole and turning, under the name ─ settling to a view of
 *   it, where the topic comes apart into its parts and the pulls between
 *   them ─ a pan across to one of those parts, the Solar System, a single
 *   star until the camera closes in and its orbits draw out ─ its planets
 *   named, and the critic's pass ─ into one of them, the Earth, its own
 *   parts written on it ─ out a stop at a time: its sources in orbit, its
 *   claims traced back like a meteor shower, the Moon's orbit and its
 *   drafts ─ until the Earth sits whole in the middle, asking what the
 *   topic is.
 *
 * Nothing scroll-jacks: the page scrolls at the wheel's speed and the camera
 * is a function of how far it has gone. Under reduced motion it does not
 * fly: it cuts to each chapter's resting view as the chapter comes round.
 */

const ch = (p: number, id: ChapterId) => {
  const [a, b] = CHAPTERS[id]
  if (id === 'hero') return 1 - smooth(0.02, b, p)
  if (id === 'arrival') return smooth(a - 0.02, a + 0.015, p)
  return smooth(a - 0.02, a + 0.015, p) * (1 - smooth(b - 0.015, b + 0.02, p))
}

/** Reduced motion: the resting progress of the chapter nearest `p`. */
function rest(p: number) {
  const order = Object.keys(CHAPTER_REST) as ChapterId[]
  let best = order[0]
  for (const id of order) if (Math.abs(CHAPTER_REST[id] - p) < Math.abs(CHAPTER_REST[best] - p)) best = id
  return CHAPTER_REST[best]
}

export function Voyage({ children }: { children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    const g = canvas?.getContext('2d', { alpha: false })
    const root = track.current
    const box = stage.current
    if (!canvas || !g || !root || !box) return

    voyage.reduced = reduced
    const compact = window.innerWidth < 640
    // Round the Sun, stars that only resolve as the camera closes on it, so
    // the pan is over a field that thickens as it goes and the system is seen
    // against it; and a clearing, so none sits between the camera and the
    // planets.
    const galaxy = buildGalaxy(
      compact ? 2600 : 5200,
      [
        { at: SUN, spread: 0.2, n: compact ? 600 : 1200, lod: 1.6 },
        { at: SUN, spread: 0.08, n: compact ? 700 : 1400, lod: 0.8 },
      ],
      7,
      [{ at: SUN, r: SYSTEM_RADIUS * AU * 1.25 }],
    )
    const sky = buildSky(compact ? 420 : 900)
    const world = theWorld()
    let pal: Palette = readPalette()
    let glows: Glows = glowsFor(pal)
    prepareSolarTextures(pal)
    const P = new Projector()
    const G = new GlobeProjector()
    let w = 0
    let h = 0
    // The hero opens a little short of the chapter's view, so the turn to it
    // is small for anyone who scrolls on within a few seconds.
    let spin = MILKY_WAY_TURN - 0.12
    let raf = 0
    let last = performance.now()
    let view: GlobeView | null = null
    const panels = () => [...box.querySelectorAll<HTMLElement>('[data-chapter]')]

    const progress = () => {
      const r = root.getBoundingClientRect()
      const span = Math.max(1, r.height - window.innerHeight)
      return Math.min(1, Math.max(0, -r.top / span))
    }

    const frame = (dt: number) => {
      const target = progress()
      const p = (voyage.p = reduced ? rest(target) : dt > 0 ? voyage.p + (target - voyage.p) * (1 - Math.exp(-dt * 6)) : target)

      // Chapters: visibility, panels, and when each came on screen.
      for (const id of Object.keys(CHAPTERS) as ChapterId[]) {
        const v = ch(p, id)
        voyage.visible[id] = v
        if (v > 0.5 && voyage.since[id] == null) voyage.since[id] = voyage.time
        if (v < 0.02) delete voyage.since[id]
      }
      for (const el of panels()) {
        const v = voyage.visible[el.dataset.chapter as ChapterId] ?? 0
        el.style.opacity = v.toFixed(3)
        el.style.transform = `translate3d(0, ${((1 - v) * 18).toFixed(1)}px, 0)`
        el.style.visibility = v < 0.01 ? 'hidden' : 'visible'
        el.dataset.active = v > 0.6 ? 'true' : 'false'
      }
      stepTree(p, reduced ? 0 : dt)

      const pose = shot(p, w, h, spin)
      P.setup(pose, spin, w, h)
      view = null

      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = 1
      g.fillStyle = pal.ground
      g.fillRect(0, 0, w, h)

      const tex = solarTextures(pal)
      const sky0: SkyFrame = { g, P, pal, glows, w, h, dist: pose.dist, flare: 0, ground: false }
      drawGalaxy(sky0, galaxy, sky)
      // The system is there regardless by the time the camera sets off for
      // it; its orbits only draw out as the camera closes in.
      const system = Math.max(partProgress(SOLAR.section, SOLAR.part), smooth(0.16, 0.2, p))
      // Once the camera is down at the Earth the other planets' orbits have
      // nothing to say, however far out a small screen pulls it.
      const orbits = system * (1 - smooth(0.45, 0.48, p))
      drawSolarSystem(g, P, pal, tex, voyage.time, pose.dist, w, h, { shown: orbits, named: planetShown, critic: tree.critic })
      drawTopicTree(g, P, pal, glows, voyage.visible.milkyway ?? 0, voyage.time)

      // The Earth and the Moon, the farther drawn first, with whatever is
      // in orbit round the Earth split about it.
      const ze = P.project(EARTH[0], EARTH[1], EARTH[2])
      const ex = P.x, ey = P.y
      const zm = P.project(MOON[0], MOON[1], MOON[2])
      const mx = P.x, my = P.y
      const moonR = zm > 0 ? (MOON_RADIUS * P.focal) / zm : 0
      const R = ze > 0 ? (EARTH_RADIUS * P.focal) / ze : 0
      // The Sun's direction from the Earth, in the camera's frame: it can be
      // behind the camera here, so it is worked out in 3D, not on screen.
      const sv = P.view(SUN[0], SUN[1], SUN[2])
      const ev = P.view(EARTH[0], EARTH[1], EARTH[2])
      const toSun = Math.atan2(sv[1] - ev[1], sv[0] - ev[0])
      // The globe takes over from the planet's sprite as it grows.
      const globe = smooth(3, 7, R)
      if (ze > 0 && globe > 0) {
        const dx = sv[0] - ev[0], dy = sv[1] - ev[1], dz = sv[2] - ev[2]
        const len = Math.hypot(dx, dy, dz) || 1
        // Never wholly from behind: the face turned to the camera keeps
        // some daylight, so the planet is never just a dark disc.
        setSunlight(dx / len, -dy / len, Math.max(0.5, -dz / len))
        // The Earth turns as the page goes on, with a slow sway of its own.
        const lon = EARTH_FACE.lon + (p - EARTH_FACE.at) * EARTH_FACE.turn + 5 * Math.sin((voyage.time * TAU) / 110)
        view = { cx: ex, cy: ey, R, lon, lat: EARTH_FACE.lat }
        G.set(view)
      }
      const earthside: EarthFrame | null = view ? { g, P, pal, glows, view, G, depth: ze, toSun, time: voyage.time } : null
      if (earthside) {
        drawContext(earthside, voyage.visible.context ?? 0, 'back')
        drawHistory(earthside, tex, voyage.visible.history ?? 0, 'back')
      }
      const drawMoon = () => {
        if (zm <= 0) return
        g.globalAlpha = system * smooth(0.4, 1.2, moonR)
        drawPlanet(g, tex, 'moon', mx, my, moonR, toSun)
        g.globalAlpha = 1
      }
      if (zm > ze) drawMoon()
      if (ze > 0) {
        if (globe < 1) {
          g.globalAlpha = system * (1 - globe)
          drawPlanet(g, tex, 'earth', ex, ey, R, toSun)
          g.globalAlpha = 1
        }
        if (view) drawGlobe(g, G, view, pal, world, { alpha: globe, w, h })
        const marked = system * planetShown('Earth') * smooth(150, 260, systemScale(P, pose.dist))
        drawEarthMarker(g, pal, ex, ey, R, voyage.time, marked * (1 - smooth(8, 20, R)))
      }
      if (zm <= ze) drawMoon()
      if (earthside && view) {
        drawEarthParts(earthside, world, voyage.visible.earth ?? 0)
        drawContext(earthside, voyage.visible.context ?? 0, 'front')
        drawShower(earthside, voyage.visible.provenance ?? 0)
        drawHistory(earthside, tex, voyage.visible.history ?? 0, 'front')
        moonSeen.x = (mx - view.cx) / view.R
        moonSeen.y = (my - view.cy) / view.R
        moonSeen.r = moonR / view.R
      }

      placeAnchors()
    }

    /** Every pinned element, moved to its point with this frame's projections. */
    const placeAnchors = () => {
      for (const a of anchors) {
        // Pinned to no chapter: its own `shown` alone decides.
        let o = a.chapters.length ? 0 : 1
        for (const c of a.chapters) o = Math.max(o, voyage.visible[c] ?? 0)
        o *= a.shown ? a.shown() : 1
        let x = a.last.x
        let y = a.last.y
        if (o > 0.01) {
          const pt = a.point()
          let ok = !!pt
          if (pt && a.space === 'galaxy') {
            ok = P.project(pt[0], pt[1], pt[2]) > 0
            x = P.x
            y = P.y
          } else if (pt && a.space === 'earth') {
            ok = !!view
            if (view) [x, y] = onGlobe(view, [pt[0], pt[1]])
          }
          if (!ok || x < -200 || y < -100 || x > w + 200 || y > h + 100) o = 0
          // Tenths of a pixel: labels on things in orbit glide rather than step.
          x = Math.round(x * 10) / 10
          y = Math.round(y * 10) / 10
        }
        if (x !== a.last.x || y !== a.last.y) a.el.style.transform = `translate3d(${x}px, ${y}px, 0)`
        const op = Math.round(o * 100) / 100
        if (op !== a.last.o) {
          a.el.style.opacity = String(op)
          a.el.style.visibility = op <= 0.01 ? 'hidden' : 'visible'
        }
        a.last = { x, y, o: op }
      }
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      voyage.time += dt
      // The galaxy turns in the hero and comes to rest as the camera goes in.
      spin += dt * 0.022 * (1 - smooth(0.04, 0.12, voyage.p))
      frame(dt)
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      frame(0)
    }
    const start = () => {
      if (reduced || raf || document.hidden) return
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    const stop = () => { cancelAnimationFrame(raf); raf = 0 }
    const onVisibility = () => (document.hidden ? stop() : start())
    let pending = 0
    const onScroll = () => {
      if (!reduced || pending) return
      pending = requestAnimationFrame(() => { pending = 0; frame(0) })
    }

    if (reduced) voyage.time = 30
    const sizes = new ResizeObserver(resize)
    sizes.observe(canvas)
    const theme = new MutationObserver(() => { pal = readPalette(); glows = glowsFor(pal); prepareSolarTextures(pal); frame(0) })
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('scroll', onScroll, { passive: true })
    resize()
    start()
    return () => {
      stop()
      cancelPrepare()
      cancelAnimationFrame(pending)
      sizes.disconnect()
      theme.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('scroll', onScroll)
    }
  }, [reduced])

  return (
    <div ref={track} className="voyage">
      <div ref={stage} className="voyage-stage">
        <canvas ref={canvasRef} className="voyage-canvas" aria-hidden="true" />
        {children}
      </div>
    </div>
  )
}

