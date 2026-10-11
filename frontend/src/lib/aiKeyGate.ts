import { getDefaultCredential } from "@/lib/aiCredentials";

/**
 * Asking for a model key at the moment one is needed.
 *
 * Every AI feature runs on the writer's own key. Without one, a request used
 * to go out bare and come back as a 400 toast pointing at a settings page —
 * after the writer had already typed their instruction. Now the request
 * waits: the API client asks here first, the dialog mounted in the root
 * shell (`AiKeyDialog`) collects a key, and the request carries on with it.
 *
 * Concurrent asks share one dialog — a batch of sections, or a panel and the
 * rail at once, should not stack prompts.
 */

/** The writer was asked for a key and declined. Not a failure worth a toast. */
export class AiKeyDeclined extends Error {
  constructor() {
    super("Add a model key to use the AI features.");
    this.name = "AiKeyDeclined";
  }
}

export const isAiKeyDeclined = (error: unknown): boolean => error instanceof AiKeyDeclined;

type Asker = (answer: (added: boolean) => void) => void;

let asker: Asker | null = null;
let pending: Promise<boolean> | null = null;

/** Register the dialog that asks. Returns its unregister. */
export function onAiKeyRequest(ask: Asker): () => void {
  asker = ask;
  return () => { if (asker === ask) asker = null; };
}

/** Resolves true once a key is available, false if the writer declines. */
export function requestAiKey(): Promise<boolean> {
  if (getDefaultCredential()) return Promise.resolve(true);
  if (!asker) return Promise.resolve(false);
  const ask = asker;
  pending ??= new Promise<boolean>(resolve => {
    ask(added => { pending = null; resolve(added); });
  });
  return pending;
}
