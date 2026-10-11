import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui';
import { onConfirmRequest, type ConfirmRequest } from '@/lib/confirm';

/** The one centred confirmation the whole app asks through (see `lib/confirm`). */
export function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const answerRef = useRef<((yes: boolean) => void) | null>(null);

  useEffect(() => onConfirmRequest((next, answer) => {
    answerRef.current?.(false);
    answerRef.current = answer;
    setRequest(next);
  }), []);

  const finish = (yes: boolean) => {
    answerRef.current?.(yes);
    answerRef.current = null;
    setRequest(null);
  };

  return (
    <ConfirmDialog
      open={request !== null}
      onOpenChange={open => { if (!open) finish(false); }}
      title={request?.title ?? ''}
      description={request?.description ?? ''}
      confirmLabel={request?.confirmLabel ?? 'Confirm'}
      tone={request?.tone}
      onConfirm={() => finish(true)}
    />
  );
}
