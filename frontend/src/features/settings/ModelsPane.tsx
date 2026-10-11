import { useEffect, useState } from 'react';
import { ArrowLeftRight, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button, Chip, ChoiceItem, ChoiceList, EmptyState, IconButton, Input, Notice, Row, SettingsGroup, SettingsHeader, Spinner, Stack,
} from '@/components/ui';
import { ProviderTile } from '@/components/ProviderTile';
import {
  deleteCredential, getCredentials, presetFor, saveCredential, setDefaultCredential, type AiCredential,
} from '@/lib/aiCredentials';
import { listAiModels, type AiModel } from '@/lib/api';
import { errorMessage } from '@/lib/utils';
import { ConnectProvider } from './ConnectProvider';
import { Sparkles } from 'lucide-react';

/** Swap a connected provider's model, picking from its live list with the saved key. */
function ModelSwitcher({ credential, onDone }: { credential: AiCredential; onDone: (next: AiCredential[] | null) => void }) {
  const [models, setModels] = useState<AiModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    listAiModels(credential.provider, credential.apiKey, controller.signal)
      .then(setModels)
      .catch(err => { if (!controller.signal.aborted) setError(errorMessage(err, 'Could not load the models')); });
    return () => controller.abort();
  }, [credential]);

  if (error) return <Notice variant="inline">{error}</Notice>;
  if (!models) return <Row align="center" gap={2} className="settings-loading"><Spinner size="xs" /> Reading {presetFor(credential.provider).name}'s models…</Row>;

  const q = query.trim().toLowerCase();
  const shown = q ? models.filter(m => m.id.toLowerCase().includes(q)) : models;
  return (
    <Stack gap={2} className="model-switcher">
      {models.length > 8 && <Input size="sm" autoFocus placeholder="Filter models" value={query} onChange={e => setQuery(e.target.value)} aria-label="Filter models" />}
      <ChoiceList aria-label="Model" maxRows={6}>
        {shown.map(m => (
          <ChoiceItem
            key={m.id}
            selected={m.id === credential.model}
            className="choice-item--mono"
            onSelect={() => {
              if (m.id === credential.model) { onDone(null); return; }
              const next = saveCredential({ ...credential, model: m.id });
              toast.success(`${presetFor(credential.provider).name} now writes with ${m.id}`);
              onDone(next);
            }}
            trailing={m.free ? <Chip size="xs" tone="success">Free</Chip> : undefined}
          >
            {m.id}
          </ChoiceItem>
        ))}
      </ChoiceList>
    </Stack>
  );
}

/** The models Topical writes with: what is connected, which is the default, and connecting another. */
export function ModelsPane() {
  const [credentials, setCredentials] = useState<AiCredential[]>(() => getCredentials());
  const [switching, setSwitching] = useState<string | null>(null);

  return (
    <>
      <SettingsHeader
        title="AI models"
        description="Every AI feature runs on a key of your own. Connect a free provider in a minute, or bring a paid one."
      />

      <SettingsGroup
        title="Connected"
        description={credentials.length > 1 ? 'The default writes everything. Switch it any time.' : undefined}
      >
        {credentials.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            tone="muted"
            title="No model connected yet"
            description="Connect one below. Until then, any AI feature you use will ask for a key first."
          />
        ) : credentials.map(cred => {
          const name = presetFor(cred.provider).name;
          return (
            <ProviderTile key={cred.id} credential={cred} actions={
              <Row gap={1} align="center">
                {!cred.isDefault && (
                  <Button variant="ghost" size="sm" onClick={() => setCredentials(setDefaultCredential(cred.id))}>
                    Make default
                  </Button>
                )}
                <IconButton size="sm" onClick={() => setSwitching(switching === cred.id ? null : cred.id)}
                  aria-expanded={switching === cred.id} title="Change model" aria-label={`Change ${name}'s model`}>
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton size="sm" tone="danger" title="Remove" aria-label={`Remove ${name} key`}
                  onClick={() => { setCredentials(deleteCredential(cred.id)); toast.success(`${name} key removed`); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </Row>
            }>
              {switching === cred.id && (
                <ModelSwitcher credential={cred} onDone={next => { if (next) setCredentials(next); setSwitching(null); }} />
              )}
            </ProviderTile>
          );
        })}
      </SettingsGroup>

      <SettingsGroup
        title="Connect a provider"
        description="Pick one, follow its three steps, and choose a model from its live list. Free tiers are marked."
        footer={
          <Row as="span" align="start" gap={1.5}>
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-px text-[var(--status-success)]" />
            <span>Keys stay in this browser and go to the provider only with the request that needs them. Topical never stores or logs them.</span>
          </Row>
        }
      >
        <div className="settings-pad">
          <ConnectProvider
            mode="full"
            onConnected={credential => {
              setCredentials(getCredentials());
              toast.success(`${presetFor(credential.provider).name} connected and set as default`);
            }}
          />
        </div>
      </SettingsGroup>
    </>
  );
}
