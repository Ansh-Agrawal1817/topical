import { useCallback, useEffect, useState } from 'react';

export type ShelfPanel = 'ai' | 'sources';
export type ShelfPhase = 'in' | 'out' | 'idle';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Which panel the right-hand column shows, with the swap animated: the one
 * leaving slides out to the right, and only then does the next slide in —
 * a shelf going out and coming back, rather than one panel blinking into
 * another. Closing slides out before it unmounts; opening slides in.
 *
 * `onAnimationEnd` belongs on the panel itself, and ignores animations
 * bubbling up from inside it (cards fading in, spinners).
 */
export function useShelfSwap(want: ShelfPanel | null) {
  const [shown, setShown] = useState<ShelfPanel | null>(want);
  const [phase, setPhase] = useState<ShelfPhase>('idle');

  useEffect(() => {
    if (want === shown) {
      // Asked back for the panel on its way out: bring it straight in again.
      if (phase === 'out') setPhase(want ? 'in' : 'idle');
      return;
    }
    if (reducedMotion()) {
      setShown(want);
      setPhase('idle');
      return;
    }
    if (shown === null) {
      setShown(want);
      setPhase('in');
    } else {
      setPhase('out');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);

  const onAnimationEnd = useCallback((event: React.AnimationEvent) => {
    if (event.target !== event.currentTarget) return;
    if (phase === 'out') {
      setShown(want);
      setPhase(want ? 'in' : 'idle');
    } else if (phase === 'in') {
      setPhase('idle');
    }
  }, [phase, want]);

  return { shown, phase, onAnimationEnd };
}
