/**
 * "Are you sure?" from anywhere, as a centred dialog.
 *
 * Confirmations used to be toasts with an action button in the screen's
 * corner — easy to miss, gone after a few seconds, and nowhere near the thing
 * being confirmed. Now any code can `await confirmAction(...)` and get the
 * one centred `ConfirmDialog`, mounted once by `ConfirmHost` in the root shell.
 */

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
}

type Asker = (request: ConfirmRequest, answer: (yes: boolean) => void) => void;
let asker: Asker | null = null;

export function onConfirmRequest(ask: Asker): () => void {
  asker = ask;
  return () => { if (asker === ask) asker = null; };
}

/** Resolves true if the writer confirms, false if they cancel. */
export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  const ask = asker;
  if (!ask) return Promise.resolve(window.confirm(`${request.title}\n\n${request.description}`));
  return new Promise(resolve => ask(request, resolve));
}
