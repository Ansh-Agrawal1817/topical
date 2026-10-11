import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { registerAnchor, type Align, type ChapterId, type Space } from './store'

/**
 * HTML pinned to something in the scene — a star in the galaxy, a place on
 * the globe, a source in orbit. The voyage loop moves it there
 * every frame and fades it with its chapter; React only says what it reads.
 * `point` and `shown` are read every frame through a ref, so they may close
 * over the latest render's state or over the scene clock.
 */
export function Anchor({
  space,
  point,
  chapters,
  align = 'center',
  shown,
  className = '',
  children,
}: {
  space: Space
  point: () => number[] | null
  chapters: ChapterId[]
  align?: Align
  shown?: () => number
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const live = useRef({ point, shown })
  live.current = { point, shown }
  const key = chapters.join(',')

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    return registerAnchor(el, {
      space,
      point: () => live.current.point(),
      chapters: (key ? key.split(',') : []) as ChapterId[],
      align,
      shown: () => live.current.shown?.() ?? 1,
    })
  }, [space, key, align])

  return (
    <div ref={ref} className={`v-anchor v-anchor--${align} ${className}`}>
      <div className="v-anchor-body">{children}</div>
    </div>
  )
}
