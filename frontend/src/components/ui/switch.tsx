import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * An on/off setting that takes effect at once — the toggle, not a checkbox.
 * A checkbox belongs in a form you submit; a switch is the setting itself.
 * It is a `button` with `role="switch"`, so Space and Enter both flip it and
 * a screen reader announces its state.
 */
export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Accessible name, when no visible label points at it with `aria-labelledby`. */
  "aria-label"?: string
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-checked={checked}
      className={cn("switch", className)}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span className="switch-thumb" aria-hidden="true" />
    </button>
  )
)
Switch.displayName = "Switch"
