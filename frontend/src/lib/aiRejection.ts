/**
 * A request the AI provider refused — a rejected key, a model it does not
 * have, a policy refusal — reported once, centrally, as a dialog.
 *
 * These are not "try again" failures: nothing changes until the writer does
 * something (fix the key, pick another model, shorten the request), so a
 * small toast that fades in four seconds was the wrong size for them. Any
 * AI call that comes back with a rejection reports it here; `AiRejectionHost`
 * shows it. The same rejection arriving again while the dialog is open (a
 * batch of sections, a reviewer) is counted rather than stacked.
 */

export type RejectionKind = 'auth' | 'access' | 'model' | 'too-long' | 'policy' | 'bad-request';

export interface AiRejection {
  kind: RejectionKind;
  provider: string;
  model: string;
  /** The provider's own words, trimmed. */
  reason: string;
}

export interface RejectionReport extends AiRejection {
  /** What the server said, in Topical's words. */
  message: string;
  /** How many requests failed this way while the dialog was up. */
  count: number;
  /** Requests still waiting that were stopped because of it. */
  stopped: number;
}

type Listener = (report: RejectionReport | null) => void;
let current: RejectionReport | null = null;
const listeners = new Set<Listener>();
const publish = () => listeners.forEach(listener => listener(current));

/** Kinds where every other request on the same key and model will fail the same way. */
export const BLOCKS_THE_LINE: ReadonlySet<RejectionKind> = new Set(['auth', 'access', 'model']);

export function reportRejection(rejection: AiRejection, message: string) {
  const same = current && current.kind === rejection.kind && current.provider === rejection.provider && current.model === rejection.model;
  current = same && current ? { ...current, count: current.count + 1 } : { ...rejection, message, count: 1, stopped: 0 };
  publish();
}

/** The queue stopped this many waiting requests because of the rejection on screen. */
export function noteStopped(count: number) {
  if (!current || count <= 0) return;
  current = { ...current, stopped: current.stopped + count };
  publish();
}

export function dismissRejection() {
  current = null;
  publish();
}

export function onRejection(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => { listeners.delete(listener); };
}
