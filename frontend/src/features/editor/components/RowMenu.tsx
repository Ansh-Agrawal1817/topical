import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { IconButton, MenuItem, MenuPanel } from '@/components/ui';

export interface RowMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** The key that does the same from a focused row, shown at the far end. */
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** A rule above this item, between groups. */
  divided?: boolean;
}

const MENU_WIDTH = 196;
const GAP = 4;

/**
 * The "⋯" on an outline row: everything a row can do that is not its main
 * gesture, in a menu that names each one and its key.
 *
 * These used to be six icons in a tray over the end of every hovered row —
 * outdent, indent, add, rename, delete and write — 18px each, unlabelled, and
 * sitting over the title they were about. Most were reachable by keyboard
 * too, but nothing on screen said so. A menu labels them, shows the key, and
 * leaves the row with the two actions people reach for: write and add.
 *
 * Portalled to the body and fixed to the viewport: the rail's list scrolls
 * and clips, and a menu hanging off its last row would be cut in half.
 */
export function RowMenu({ items, label, onOpenChange }: {
  items: RowMenuItem[];
  /** Names the trigger: "More for Optimal substructure". */
  label: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
    if (!next) setPlace(null);
  };

  // Placed under the trigger, right-aligned to it; flipped above when the
  // bottom of the window is closer than the menu is tall.
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const box = trigger.current.getBoundingClientRect();
    const height = panel.current?.offsetHeight ?? 0;
    const up = box.bottom + GAP + height > window.innerHeight - 8 && box.top - GAP - height > 8;
    setPlace({
      top: up ? box.top - GAP - height : box.bottom + GAP,
      left: Math.max(8, Math.min(box.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      up,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)')?.focus();
    const close = (event: Event) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || trigger.current?.contains(target)) return;
      setOpen(false);
    };
    const onScroll = (event: Event) => {
      if (panel.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', close, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
    // `setOpen` is stable in effect: it only sets state and calls the prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)') ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(at + step + buttons.length) % buttons.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus();
    }
  };

  return (
    <>
      <IconButton
        ref={trigger}
        size="xs"
        className="orow-more"
        aria-label={label}
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        data-open={open || undefined}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </IconButton>
      {open && createPortal(
        <MenuPanel
          ref={panel}
          role="menu"
          aria-label={label}
          inset="sm"
          origin={place?.up ? 'none' : 'top-right'}
          className="row-menu"
          style={{ top: place?.top ?? -9999, left: place?.left ?? -9999, width: MENU_WIDTH }}
          onKeyDown={onKeyDown}
        >
          {items.map(item => (
            <div key={item.id} className="row-menu-entry" data-divided={item.divided || undefined}>
              <MenuItem
                role="menuitem"
                icon={item.icon}
                disabled={item.disabled}
                className={item.danger ? 'row-menu-danger' : undefined}
                trailing={item.shortcut ? <kbd className="row-menu-key">{item.shortcut}</kbd> : undefined}
                onClick={() => { setOpen(false); trigger.current?.focus(); item.onSelect(); }}
              >
                {item.label}
              </MenuItem>
            </div>
          ))}
        </MenuPanel>,
        document.body,
      )}
    </>
  );
}
