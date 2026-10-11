import { useMediaQuery } from './useMediaQuery';

/**
 * The OS "reduce motion" setting, watched rather than read once — it can
 * change mid-session. Scroll-linked depth, the sky's drift and the hero's
 * typing demonstration all stand still when it is on.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
