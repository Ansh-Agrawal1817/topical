import * as React from "react"

import { cn } from "@/lib/utils"
import { Depth } from "./depth"

/**
 * The marketing pages' rhythm: full-width bands, a centred 64rem column, a
 * section head, waypoints, index entries and ledgers. App screens use `Page` and `PageHeader`
 * instead — the split is deliberate (project.md, standing rules).
 */

/**
 * A full-width band holding one 64rem column. `hero` opens a page; `tight`
 * follows another band closely; `voyage` is a landing-page stop, with the
 * open sky above and below it that the scroll-linked depth needs to travel
 * through.
 */
export function Band({ spacing = "default", className, innerClassName, children, ...rest }:
  React.HTMLAttributes<HTMLElement> & { spacing?: "default" | "tight" | "hero" | "voyage"; innerClassName?: string }) {
  return (
    <section className={cn("band", spacing !== "default" && `band--${spacing}`, className)} {...rest}>
      <div className={cn("band-inner", innerClassName)}>{children}</div>
    </section>
  )
}

/**
 * A section's title and the line under it. `hero` is the page-opening scale
 * (the about page's h1); `align="center"` only for a closing call to action.
 */
export function SectionHead({ title, subtitle, eyebrow, level = 2, size = "section", align = "start", flush, className }: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  eyebrow?: React.ReactNode
  level?: 1 | 2
  size?: "section" | "hero"
  align?: "start" | "center"
  /** No space below — when the next thing is not a grid but the head's own action. */
  flush?: boolean
  className?: string
}) {
  const Title = `h${level}` as "h1" | "h2"
  return (
    <div className={cn("section-head", size === "hero" && "section-head--hero", align === "center" && "section-head--center", flush && "section-head--flush", className)}>
      {eyebrow}
      <Title className={cn("section-title", size === "hero" && "section-title--hero")}>{title}</Title>
      {subtitle && <p className="section-sub">{subtitle}</p>}
    </div>
  )
}

/**
 * Where on the page you are: a mono index, a short rule, a name. It sits
 * above a marketing section's title the way a chart's coordinates sit above
 * its plate — "02 — The map". Without an index it is a plain kicker.
 */
export function Waypoint({ index, children, className }: {
  index?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <p className={cn("waypoint", className)}>
      {index && <span className="waypoint-index">{index}</span>}
      {index && <span className="waypoint-rule" aria-hidden="true" />}
      <span>{children}</span>
    </p>
  )
}

/**
 * One entry in an index: a hanging numeral, a title, a line of copy. The
 * numeral hangs in its own column so a run of entries reads down one edge,
 * like the contents page of a book — structure, not a card per item.
 */
export function IndexEntry({ n, title, level = 3, children, className }: {
  n: string
  title: React.ReactNode
  /** The title's place in the outline: 3 under a section, 4 under a sub-group. */
  level?: 3 | 4
  children: React.ReactNode
  className?: string
}) {
  const Title = `h${level}` as "h3" | "h4"
  return (
    <div className={cn("index-entry", className)}>
      <span className="index-entry-n">{n}</span>
      <div className="index-entry-text">
        <Title className="index-entry-title">{title}</Title>
        <p className="index-entry-body">{children}</p>
      </div>
    </div>
  )
}

/**
 * Two columns that answer each other, row by row — a ledger rather than a
 * table, because each row is one pairing and not a record with fields. Each
 * cell carries its column's name for screen readers, so a row read alone
 * still says whose half it is. Rows rise in on scroll, one after another.
 */
export function Ledger({ heads, rows, className }: {
  heads: [string, string]
  rows: [React.ReactNode, React.ReactNode][]
  className?: string
}) {
  return (
    <div className={cn("ledger", className)}>
      <div className="ledger-heads" aria-hidden="true">
        <span>{heads[0]}</span>
        <span>{heads[1]}</span>
      </div>
      <ul className="ledger-rows">
        {rows.map(([left, right], i) => (
          <Depth as="li" key={i} lag={i * 0.05} className="ledger-row">
            <p className="ledger-cell"><span className="sr-only">{heads[0]}: </span>{left}</p>
            <p className="ledger-cell ledger-cell--answer"><span className="sr-only">{heads[1]}: </span>{right}</p>
          </Depth>
        ))}
      </ul>
    </div>
  )
}
