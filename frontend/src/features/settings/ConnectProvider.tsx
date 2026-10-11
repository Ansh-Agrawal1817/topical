import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, RotateCcw } from 'lucide-react';
import {
  Button, Chip, ChoiceItem, ChoiceList, Field, Input, NumberedSteps, Notice, Row, Segmented, Stack, Text, TextLink,
} from '@/components/ui';
import { ProviderMark } from '@/components/ProviderTile';
import {
  PROVIDER_PRESETS, TIER_LABEL, presetFor, recommendedModel, saveCredential,
  type AiCredential, type AiProvider, type ProviderPreset,
} from '@/lib/aiCredentials';
import { listAiModels, verifyAiKey, type AiModel } from '@/lib/api';
import { errorMessage } from '@/lib/utils';

type Phase = 'key' | 'loading' | 'pick' | 'verifying';

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';
const hostOf = (url: string) => new URL(url).host.replace(/^www\./, '');

/**
 * Connect an AI provider: choose one, follow its three steps to a key, pick
 * a model from the provider's own live list, and save once a tiny test call
 * has proved the pair works.
 *
 * `full` is the settings flow: every provider, and a real model picker.
 * `quick` is the "you need a key" dialog: only the free providers, and the
 * model is chosen for you — the request that opened it is waiting.
 */
export function ConnectProvider({ mode, onConnected, providers }: {
  mode: 'full' | 'quick';
  onConnected: (credential: AiCredential) => void;
  /** Defaults to every provider (full) or the free ones (quick). */
  providers?: ProviderPreset[];
}) {
  const offered = useMemo(
    () => providers ?? (mode === 'quick' ? PROVIDER_PRESETS.filter(p => p.tier === 'free').slice(0, 3) : PROVIDER_PRESETS),
    [providers, mode],
  );
  const [provider, setProvider] = useState<AiProvider>(offered[0].provider);
  const [key, setKey] = useState('');
  const [phase, setPhase] = useState<Phase>('key');
  const [models, setModels] = useState<AiModel[]>([]);
  const [model, setModel] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const preset = presetFor(provider);

  // A request in flight is cancelled when the flow is left or restarted.
  const inflight = useRef<AbortController | null>(null);
  useEffect(() => () => inflight.current?.abort(), []);
  const begin = () => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    return controller.signal;
  };

  const reset = (next: AiProvider = provider) => {
    inflight.current?.abort();
    setProvider(next);
    setPhase('key');
    setModels([]);
    setModel('');
    setQuery('');
    setError(null);
    if (next !== provider) setKey('');
  };

  const keyReady = preset.keyless || key.trim().length > 0;

  const loadModels = async (): Promise<{ list: AiModel[]; pick: string } | null> => {
    const signal = begin();
    setPhase('loading');
    setError(null);
    try {
      const list = await listAiModels(provider, key.trim(), signal);
      if (!list.length) throw new Error(`${preset.name} lists no chat models for this key.`);
      const pick = recommendedModel(preset, list);
      setModels(list);
      setModel(pick);
      setPhase('pick');
      return { list, pick };
    } catch (err) {
      if (isAbort(err)) return null;
      setError(errorMessage(err, `Could not load ${preset.name}'s models.`));
      setPhase('key');
      return null;
    }
  };

  const connect = async (chosen: string) => {
    const signal = begin();
    setPhase('verifying');
    setError(null);
    try {
      await verifyAiKey(provider, chosen, key.trim(), signal);
      const saved = saveCredential({ provider, label: preset.name, apiKey: key.trim(), model: chosen, isDefault: true });
      const credential = saved.find(c => c.provider === provider && c.model === chosen && c.isDefault) ?? saved[saved.length - 1];
      onConnected(credential);
      reset(provider);
      setKey('');
    } catch (err) {
      if (isAbort(err)) return;
      setError(errorMessage(err, 'That key and model did not work together.'));
      setPhase('pick');
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!keyReady) { setError(`Paste the key you copied from ${preset.name}.`); return; }
    if (mode === 'quick') {
      const loaded = phase === 'pick' ? { pick: model } : await loadModels();
      if (loaded) await connect(loaded.pick);
      return;
    }
    if (phase === 'key') await loadModels();
    else if (phase === 'pick' && model) await connect(model);
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? models.filter(m => m.id.toLowerCase().includes(q)) : models;
  }, [models, query]);

  const busy = phase === 'loading' || phase === 'verifying';
  const keyField = !preset.keyless && (
    <Field id="connect-key" label={`${preset.name} API key`} error={phase === 'key' ? error : null}>
      <Input
        id="connect-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        autoFocus={mode === 'quick'}
        placeholder={preset.keyPlaceholder}
        value={key}
        disabled={busy}
        onChange={e => { setKey(e.target.value); if (phase !== 'key') reset(); else setError(null); }}
        aria-invalid={error && phase === 'key' ? true : undefined}
      />
    </Field>
  );

  return (
    <form className="connect" onSubmit={submit} data-mode={mode}>
      {mode === 'quick' ? (
        <Segmented
          size="sm"
          fill
          aria-label="Provider"
          value={provider}
          onChange={next => reset(next)}
          options={offered.map(p => ({ value: p.provider, label: p.name, icon: <ProviderMark provider={p.provider} size="sm" /> }))}
        />
      ) : (
        <ChoiceList aria-label="Provider" layout="grid">
          {offered.map(p => (
            <ChoiceItem
              key={p.provider}
              selected={provider === p.provider}
              onSelect={() => reset(p.provider)}
              mark={<ProviderMark provider={p.provider} />}
              description={p.blurb}
              trailing={<Chip size="xs" tone={p.tier === 'free' ? 'success' : p.tier === 'local' ? 'latex' : 'quiet'}>{TIER_LABEL[p.tier]}</Chip>}
            >
              {p.name}
            </ChoiceItem>
          ))}
        </ChoiceList>
      )}

      <div className="connect-steps">
        <Row align="center" justify="between" gap={2} wrap>
          <Text as="span" size="xs" weight="semibold" tone="muted" className="connect-steps-title">
            {preset.keyless ? `Set up ${preset.name}` : `Get a ${preset.name} key`}
            {mode === 'quick' && preset.tier === 'free' && ' — free, about a minute'}
          </Text>
          <TextLink asChild variant="accent" size="xs">
            <a href={preset.getKeyUrl} target="_blank" rel="noreferrer" title={hostOf(preset.getKeyUrl)}>
              Open {preset.site} <ExternalLink className="h-3 w-3" />
            </a>
          </TextLink>
        </Row>
        <NumberedSteps items={preset.steps} />
        {preset.note && <Text size="xs" tone="faint" leading="relaxed">{preset.note}</Text>}
      </div>

      {keyField}

      {mode === 'full' && phase !== 'key' && phase !== 'loading' && (
        <Stack gap={2}>
          <Row align="center" justify="between" gap={2}>
            <Text as="span" size="xs" weight="semibold" tone="muted">
              Model · {models.length} available
            </Text>
            <TextLink size="xs" onClick={() => reset()} disabled={busy}>
              <RotateCcw className="h-3 w-3" /> Change key
            </TextLink>
          </Row>
          {models.length > 8 && (
            <Input size="sm" placeholder="Filter models" value={query} onChange={e => setQuery(e.target.value)} aria-label="Filter models" />
          )}
          <ChoiceList aria-label="Model" maxRows={6}>
            {shown.map(m => (
              <ChoiceItem
                key={m.id}
                selected={model === m.id}
                onSelect={() => setModel(m.id)}
                className="choice-item--mono"
                trailing={
                  <Row gap={1} as="span">
                    {m.id === recommendedModel(preset, models) && <Chip size="xs" tone="accent">Suggested</Chip>}
                    {m.free && <Chip size="xs" tone="success">Free</Chip>}
                  </Row>
                }
              >
                {m.id}
              </ChoiceItem>
            ))}
            {!shown.length && <Text size="xs" tone="faint" className="px-3 py-2">No model matches “{query}”.</Text>}
          </ChoiceList>
          {error && <Notice variant="inline">{error}</Notice>}
        </Stack>
      )}
      {mode === 'quick' && error && phase !== 'key' && <Notice variant="inline">{error}</Notice>}

      <Button type="submit" variant="primary" size={mode === 'quick' ? 'xl' : 'lg'} width={mode === 'quick' ? 'full' : 'auto'} loading={busy} disabled={busy}>
        {phase === 'loading' ? 'Reading the model list…'
          : phase === 'verifying' ? 'Checking the key…'
          : mode === 'quick' ? 'Save and continue'
          : phase === 'pick' ? `Connect ${preset.name}`
          : <>Continue <ArrowRight className="h-4 w-4" /></>}
      </Button>
    </form>
  );
}
