import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Modal, PanelHeader, TextLink } from '@/components/ui';
import { presetFor } from '@/lib/aiCredentials';
import { onAiKeyRequest } from '@/lib/aiKeyGate';
import { ConnectProvider } from '@/features/settings/ConnectProvider';

/**
 * "Add a model key" — asked the first time an AI feature is used without one.
 *
 * Mounted once in the root shell; `lib/aiKeyGate` opens it from inside the
 * API client, so every AI entry point gets it without knowing it exists. The
 * request that needed the key is still waiting while this is open: saving
 * lets it carry on, closing cancels it (and any check still in flight, since
 * `ConnectProvider` aborts on unmount — a key the writer walked away from is
 * never saved behind their back).
 *
 * It offers the free providers only, because the shortest path from "this
 * button did nothing" to a written section is a key that costs nothing.
 * Everything else is one link away, in Settings.
 */
export function AiKeyDialog() {
  const answerRef = useRef<((added: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => onAiKeyRequest(answer => {
    answerRef.current = answer;
    setOpen(true);
  }), []);

  const finish = (added: boolean) => {
    setOpen(false);
    answerRef.current?.(added);
    answerRef.current = null;
  };

  if (!open) return null;

  return (
    <Modal label="Add a model key" onClose={() => finish(false)} overlayClassName="modal-overlay">
      <div className="pdf-dialog aikey">
        <PanelHeader size="md" icon={<KeyRound className="h-4 w-4" />} title="Add a model key to use AI" onClose={() => finish(false)} />

        <div className="pdf-body">
          <p className="aikey-lede">
            Topical writes with your own AI key. It stays in this browser and is sent only with
            the request that needs it. Add one and what you just asked for carries on.
          </p>

          <ConnectProvider
            mode="quick"
            onConnected={credential => {
              toast.success(`${presetFor(credential.provider).name} connected — carrying on`);
              finish(true);
            }}
          />

          <p className="pdf-note">
            Free tiers need no card but are rate-limited, and some providers may use free-tier
            requests to improve their models — use a paid key for confidential work.
          </p>

          <p className="aikey-other">
            Want OpenAI, Anthropic, DeepSeek or a model on your own computer?{' '}
            <TextLink asChild variant="underline">
              <Link to="/settings" search={{ section: 'models' }} onClick={() => finish(false)}>All providers in Settings</Link>
            </TextLink>
          </p>
        </div>
      </div>
    </Modal>
  );
}
