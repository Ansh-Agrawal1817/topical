import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Pick one from a list that is too long, or too wordy, for a segmented
 * control — models, providers, sections. A radio group with real rows: the
 * mark, a label, an optional line under it, and something at the far end
 * (a "Free" chip, a count). Arrow keys move the choice, as in any radio group.
 */
export interface ChoiceListProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  "aria-label": string
  /** Scroll inside the list past this many rows' worth of height. */
  maxRows?: number
  /** `grid` lays rows out as tiles, two or three to a line. */
  layout?: "list" | "grid"
}

export function ChoiceList({ maxRows, layout = "list", className, style, onKeyDown, ...props }: ChoiceListProps) {
  const move = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key]
    if (!step) return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='radio']:not(:disabled)"))
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    event.preventDefault()
    const next = items[(at + step + items.length) % items.length]
    next.focus()
    next.click()
  }
  return (
    <div
      role="radiogroup"
      className={cn("choice-list", `choice-list--${layout}`, maxRows && "choice-list--scroll", className)}
      style={maxRows ? { ...style, ["--choice-rows" as string]: maxRows } : style}
      onKeyDown={move}
      {...props}
    />
  )
}

export interface ChoiceItemProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect"> {
  selected: boolean
  onSelect: () => void
  /** A line under the label. */
  description?: React.ReactNode
  /** At the far end of the row. */
  trailing?: React.ReactNode
  /** A leading mark in place of the radio dot — a brand initial, an icon. */
  mark?: React.ReactNode
}

export const ChoiceItem = React.forwardRef<HTMLButtonElement, ChoiceItemProps>(
  ({ selected, onSelect, description, trailing, mark, className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      data-selected={selected}
      className={cn("choice-item", className)}
      onClick={onSelect}
      {...props}
    >
      {mark ?? <span className="choice-dot" aria-hidden="true" />}
      <span className="choice-text">
        <span className="choice-label">{children}</span>
        {description != null && <span className="choice-description">{description}</span>}
      </span>
      {trailing != null && <span className="choice-trailing">{trailing}</span>}
    </button>
  )
)
ChoiceItem.displayName = "ChoiceItem"
