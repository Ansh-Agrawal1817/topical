import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Settings, laid out the way a system settings pane is: titled groups of
 * rows, each row a label (and a line on what it does) beside the control
 * that changes it. One group is one material sheet; rows inside it are
 * divided by hairlines rather than each being a card of its own.
 */

export function SettingsGroup({ title, description, footer, className, children }: {
  title?: React.ReactNode
  description?: React.ReactNode
  /** Small print under the sheet — what a setting implies, where data goes. */
  footer?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("settings-group", className)}>
      {(title || description) && (
        <header className="settings-group-head">
          {title && <h3 className="settings-group-title">{title}</h3>}
          {description && <p className="settings-group-description">{description}</p>}
        </header>
      )}
      <div className="settings-sheet">{children}</div>
      {footer && <p className="settings-group-footer">{footer}</p>}
    </section>
  )
}

export function SettingsRow({ label, hint, control, stacked, id, className, children }: {
  label: React.ReactNode
  hint?: React.ReactNode
  /** The control, at the row's far end. */
  control?: React.ReactNode
  /** Put the content under the label instead of beside it — for wide controls. */
  stacked?: boolean
  /** Names the control: the label gets `${id}-label` for `aria-labelledby`. */
  id?: string
  className?: string
  /** Anything under the label row: a form, a list, a picker. */
  children?: React.ReactNode
}) {
  return (
    <div className={cn("settings-row", stacked && "settings-row--stacked", className)}>
      <div className="settings-row-main">
        <div className="settings-row-text">
          <div className="settings-row-label" id={id ? `${id}-label` : undefined}>{label}</div>
          {hint && <p className="settings-row-hint">{hint}</p>}
        </div>
        {control != null && <div className="settings-row-control">{control}</div>}
      </div>
      {children != null && <div className="settings-row-body">{children}</div>}
    </div>
  )
}

/** A pane's own heading: what this part of settings is for. */
export function SettingsHeader({ title, description, actions }: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header className="settings-header">
      <div className="min-w-0">
        <h2 className="settings-title">{title}</h2>
        {description && <p className="settings-description">{description}</p>}
      </div>
      {actions && <div className="settings-header-actions">{actions}</div>}
    </header>
  )
}
