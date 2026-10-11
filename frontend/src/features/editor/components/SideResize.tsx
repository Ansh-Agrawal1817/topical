import { useDragResize } from '../hooks/useDragResize';
import { DEFAULT_OPTIONS, MAX_AI_WIDTH, MIN_AI_WIDTH } from '../lib/viewOptions';

const clamp = (next: number) => Math.min(Math.max(Math.round(next), MIN_AI_WIDTH), MAX_AI_WIDTH);

/**
 * The left-edge handle of the right-hand column (the AI and Sources panels,
 * which share one width). Drag it, use ←/→ (Shift for bigger steps) on it,
 * or double-click to reset.
 */
export function SideResize({ width, onWidth, label }: { width: number; onWidth: (next: number) => void; label: string }) {
  // The handle is on the panel's left edge, so dragging left widens it.
  const start = useDragResize({ from: () => width, to: (dx, from) => clamp(from - dx), onChange: onWidth });
  const keys = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 64 : 16;
    const next = event.key === 'ArrowLeft' ? width + step : event.key === 'ArrowRight' ? width - step : null;
    if (next === null) return;
    event.preventDefault();
    onWidth(clamp(next));
  };
  return (
    <div className="ai-resize" onMouseDown={start} onKeyDown={keys} onDoubleClick={() => onWidth(DEFAULT_OPTIONS.aiWidth)}
      role="separator" aria-orientation="vertical" aria-label={label} tabIndex={0}
      aria-valuemin={MIN_AI_WIDTH} aria-valuemax={MAX_AI_WIDTH} aria-valuenow={width}
      title="Drag to resize · double-click to reset" />
  );
}
