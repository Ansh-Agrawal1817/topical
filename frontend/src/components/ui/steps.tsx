import * as React from "react"

import { cn } from "@/lib/utils"

/** Short instructions to follow in order: each step a numbered disc and a line. */
export function NumberedSteps({ items, className }: { items: React.ReactNode[]; className?: string }) {
  return (
    <ol className={cn("steps", className)}>
      {items.map((item, i) => <li key={i} className="steps-item">{item}</li>)}
    </ol>
  )
}
