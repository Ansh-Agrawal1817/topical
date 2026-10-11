import * as React from "react"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/useReducedMotion"

/**
 * Scroll-linked depth: a block that travels in from behind the page as it is
 * scrolled to, and (for `recede`) flies past the viewer as it is scrolled
 * away from.
 *
 * Every Depth on a page shares one passive scroll listener and one animation
 * frame. Each frame reads all the rectangles first and writes all the
 * variables second, so the page lays out once per frame no matter how many
 * blocks are tracked. What gets written is three numbers, and the stylesheet
 * (`.depth--*` in primitives.css) decides what they mean:
 *
 *   --in   0 → 1  eased, as the block rises from the fold to 40% up the screen
 *   --out  0 → 1  as the block's bottom edge leaves through the top
 *   --q    0 → 1  linear, the whole pass from below the fold to above the top
 *
 * Nothing is hijacked: the page scrolls exactly as fast as the wheel says and
 * the motion is only ever a function of where the block is. Under reduced
 * motion nothing is tracked and the stylesheet's resting values (--in 1,
 * --out 0) apply, so every block simply sits in place.
 */

export type DepthVariant =
  /** rises out of the page, tipped back, and lands flat */
  | "rise"
  /** a wide panel tipped away on its top edge that swings upright (the product window) */
  | "tilt"
  /** flies toward the viewer and fades as it scrolls away (the hero) */
  | "recede"
  /** a plane that rises to face the viewer, then falls away past them (the hero's star system) */
  | "pass"
  /** swings in on its leading edge */
  | "swing-start"
  /** swings in on its trailing edge */
  | "swing-end"
  /** no motion of its own — only publishes the variables to its children */
  | "track"

interface Tracked {
  /** Fraction of the viewport the entrance is delayed by — a stagger in space, not time. */
  lag: number
  last: [number, number, number]
}

const tracked = new Map<HTMLElement, Tracked>()
let frame = 0

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
const easeOut = (n: number) => 1 - Math.pow(1 - n, 3)

function measure() {
  frame = 0
  const vh = window.innerHeight || 1
  const writes: [HTMLElement, Tracked, number, number, number][] = []
  tracked.forEach((entry, el) => {
    const r = el.getBoundingClientRect()
    const enter = easeOut(clamp01((vh * (1 - entry.lag) - r.top) / (vh * 0.6)))
    const leave = clamp01((vh * 0.35 - r.bottom) / (vh * 0.35))
    const through = clamp01((vh - r.top) / (vh + r.height))
    writes.push([el, entry, enter, leave, through])
  })
  for (const [el, entry, enter, leave, through] of writes) {
    const [i, o, q] = entry.last
    // Only touch the style when a value has moved enough to be seen, so a
    // block parked off screen costs nothing per frame.
    if (Math.abs(i - enter) > 0.001) el.style.setProperty("--in", enter.toFixed(3))
    if (Math.abs(o - leave) > 0.001) el.style.setProperty("--out", leave.toFixed(3))
    if (Math.abs(q - through) > 0.001) el.style.setProperty("--q", through.toFixed(3))
    entry.last = [enter, leave, through]
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(measure)
}

function track(el: HTMLElement, lag: number) {
  if (tracked.size === 0) {
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
  }
  // NaN forces the first write.
  tracked.set(el, { lag, last: [NaN, NaN, NaN] })
}

function untrack(el: HTMLElement) {
  tracked.delete(el)
  el.style.removeProperty("--in")
  el.style.removeProperty("--out")
  el.style.removeProperty("--q")
  if (tracked.size === 0) {
    window.removeEventListener("scroll", schedule)
    window.removeEventListener("resize", schedule)
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  }
}

export interface DepthProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: DepthVariant
  /** 0–0.4: how much later than its siblings this block starts its entrance. */
  lag?: number
  as?: "div" | "section" | "li" | "article" | "figure"
}

export const Depth = React.forwardRef<HTMLDivElement, DepthProps>(
  ({ variant = "rise", lag = 0, as: Tag = "div", className, children, ...rest }, forwarded) => {
    const ref = React.useRef<HTMLDivElement | null>(null)
    const reduced = useReducedMotion()

    // Layout effect: the first values are written before the first paint,
    // so a block below the fold never flashes in its resting position first.
    React.useLayoutEffect(() => {
      const el = ref.current
      if (!el || reduced) return
      track(el, lag)
      measure()
      return () => untrack(el)
    }, [reduced, lag])

    const setRef = (node: HTMLDivElement | null) => {
      ref.current = node
      if (typeof forwarded === "function") forwarded(node)
      else if (forwarded) forwarded.current = node
    }

    // Every option is a block element with the same ref contract.
    const Comp = Tag as "div"
    return (
      <Comp ref={setRef} className={cn("depth", `depth--${variant}`, className)} {...rest}>
        {children}
      </Comp>
    )
  },
)
Depth.displayName = "Depth"
