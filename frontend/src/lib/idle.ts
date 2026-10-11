/**
 * Run `fn` once the browser is idle, or after `timeout` ms at the latest.
 * Returns a cancel.
 *
 * Safari has no `requestIdleCallback`; there a short delay (`fallback`) does
 * the same job. Three places warmed work this way, each with its own copy of
 * the feature test and the two cancel paths.
 */
export function whenIdle(fn: () => void, timeout: number, fallback = 300): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => fn(), { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, fallback);
  return () => clearTimeout(id);
}
