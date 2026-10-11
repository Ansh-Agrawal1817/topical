import { useEffect, useState } from 'react'

/**
 * What the voyage's canvas loop and its panels share, outside React.
 *
 * The loop owns the scroll position, the clock and each chapter's
 * visibility; the panels read the clock for their demonstrations, and
 * register the elements that must sit on something in the scene — a label
 * on a star, a city on the globe — so the loop can move them there every
 * frame with the same projection it just drew with.
 */

export type ChapterId = 'hero' | 'milkyway' | 'system' | 'earth' | 'context' | 'provenance' | 'history' | 'arrival'

/** Where each chapter sits in the voyage's scroll, 0–1. */
export const CHAPTERS: Record<ChapterId, [number, number]> = {
  hero: [0, 0.035],
  milkyway: [0.07, 0.185],
  system: [0.3, 0.39],
  earth: [0.47, 0.565],
  context: [0.61, 0.695],
  provenance: [0.74, 0.825],
  history: [0.865, 0.925],
  arrival: [0.96, 1],
}

/** Under reduced motion the camera cuts to these instead of flying. */
export const CHAPTER_REST: Record<ChapterId, number> = {
  hero: 0, milkyway: 0.155, system: 0.375, earth: 0.53, context: 0.67, provenance: 0.8, history: 0.91, arrival: 0.99,
}

export const voyage = {
  /** Smoothed progress through the voyage, 0–1. */
  p: 0,
  /** Seconds of scene time; frozen under reduced motion. */
  time: 0,
  reduced: false,
  visible: {} as Partial<Record<ChapterId, number>>,
  /** Scene time at which each chapter last became the one on screen. */
  since: {} as Partial<Record<ChapterId, number>>,
}

/**
 * Seconds since `chapter` came on screen, sampled for React a few times a
 * second; null while it is off screen. Under reduced motion it is always
 * "long ago", so every demonstration shows its finished state.
 */
export function useChapterClock(chapter: ChapterId, hz = 24): number | null {
  const [t, setT] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => {
      const since = voyage.since[chapter]
      setT(since == null ? null : voyage.reduced ? 999 : Math.round((voyage.time - since) * 20) / 20)
    }
    tick()
    const id = window.setInterval(tick, 1000 / hz)
    return () => window.clearInterval(id)
  }, [chapter, hz])
  return t
}

/* ─────────────────────────── Anchors ─────────────────────────── */

export type Space = 'galaxy' | 'earth'
export type Align = 'center' | 'below' | 'above' | 'right' | 'left'

export interface AnchorSpec {
  space: Space
  /** galaxy: [x, y, z] · earth: [x, y] from the globe's centre on screen, in globe radii. */
  point: () => number[] | null
  chapters: ChapterId[]
  align: Align
  shown?: () => number
}

export interface AnchorEntry extends AnchorSpec {
  el: HTMLElement
  last: { x: number; y: number; o: number }
}

export const anchors = new Set<AnchorEntry>()

export function registerAnchor(el: HTMLElement, spec: AnchorSpec) {
  const entry: AnchorEntry = { ...spec, el, last: { x: NaN, y: NaN, o: NaN } }
  anchors.add(entry)
  return () => {
    anchors.delete(entry)
  }
}
