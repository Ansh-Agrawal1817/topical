import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { onAiKeyRequest } from '@/lib/aiKeyGate';

/**
 * The dialog, loaded the first time a key is asked for. It carries the
 * provider picker and every provider's logo, and almost every visit never
 * needs it — mounted directly in the root shell, all of that sat in the
 * bundle every page loads.
 */
const AiKeyDialog = lazy(() => import('./AiKeyDialog').then(m => ({ default: m.AiKeyDialog })));

/**
 * Listens for `lib/aiKeyGate` asking for a model key, and shows the dialog
 * that collects one. The request that asked is still waiting: saving lets it
 * carry on, closing cancels it.
 */
export function AiKeyHost() {
  const answerRef = useRef<((added: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => onAiKeyRequest(answer => {
    answerRef.current = answer;
    setOpen(true);
  }), []);

  if (!open) return null;

  const finish = (added: boolean) => {
    setOpen(false);
    answerRef.current?.(added);
    answerRef.current = null;
  };

  return (
    <Suspense fallback={null}>
      <AiKeyDialog finish={finish} />
    </Suspense>
  );
}
