import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

/**
 * A list of places within one screen — the sections of settings. A column
 * beside the content on a wide screen; on a phone it becomes a row of
 * capsules that scrolls sideways, so the content is never pushed below a
 * wall of links.
 */
export function SideNav({ className, ...props }: React.HTMLAttributes<HTMLElement> & { "aria-label": string }) {
  return <nav className={cn("side-nav", className)} {...props} />
}

export interface SideNavItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  icon?: React.ReactNode
  active?: boolean
  /** Render the child (a router `Link`) as the item. */
  asChild?: boolean
}

export const SideNavItem = React.forwardRef<HTMLAnchorElement, SideNavItemProps>(
  ({ icon, active, asChild, className, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "a"
    return (
      <Comp
        ref={ref}
        className={cn("side-nav-item", className)}
        data-active={active ? "true" : undefined}
        aria-current={active ? "page" : undefined}
        {...props}
      >
        {asChild ? children : <>{icon && <span className="side-nav-icon" aria-hidden="true">{icon}</span>}{children}</>}
      </Comp>
    )
  }
)
SideNavItem.displayName = "SideNavItem"

/** The icon tile a side-nav item leads with, tinted per section like system settings. */
export function SideNavIcon({ hue, children }: { hue: "accent" | "latex" | "success" | "warning" | "neutral"; children: React.ReactNode }) {
  return <span className={cn("side-nav-icon", `side-nav-icon--${hue}`)} aria-hidden="true">{children}</span>
}
