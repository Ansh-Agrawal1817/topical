import * as React from "react"

import { cn } from "@/lib/utils"

/** One run of a word- or line-level difference. */
export interface DiffRun {
  kind: "same" | "cut" | "added"
  text: string
}

/**
 * A word-level difference set inline: cuts struck through in rose, additions
 * washed in green. The surrounding block owns the typeface and size — an AI
 * edit's review card reads in the serif, a history line in the mono.
 * `fallback` is shown when there are no runs (a diff too large to compute).
 */
export function DiffText({ runs, fallback, className }: {
  runs: DiffRun[] | null
  fallback?: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn("diff-text", className)}>
      {runs
        ? runs.map((run, i) => (run.kind === "same"
          ? <span key={i}>{run.text}</span>
          : run.kind === "cut" ? <del key={i}>{run.text}</del> : <ins key={i}>{run.text}</ins>))
        : fallback}
    </span>
  )
}

/**
 * One line of a line-level difference, with its gutter mark. Changed lines
 * are tinted (and marked − / + for anyone who cannot tell the tints apart);
 * pass `DiffText` as the child to show which words in the line changed.
 */
export const DiffLine = React.forwardRef<HTMLDivElement, {
  kind: DiffRun["kind"]
  children: React.ReactNode
  className?: string
}>(({ kind, children, className }, ref) => (
  <div ref={ref} className={cn("diff-line", className)} data-kind={kind}>
    <span className="diff-gutter" aria-hidden="true">{kind === "added" ? "+" : kind === "cut" ? "−" : ""}</span>
    <span className="diff-line-text">
      {kind !== "same" && <span className="sr-only">{kind === "added" ? "Added: " : "Removed: "}</span>}
      {children}
    </span>
  </div>
))
DiffLine.displayName = "DiffLine"

/** A run of unchanged lines folded away. */
export function DiffFold({ count }: { count: number }) {
  return <div className="diff-fold">{count} unchanged line{count === 1 ? "" : "s"}</div>
}
