import type { ReactNode } from 'react';
import { Chip, Row } from '@/components/ui';
import { type AiCredential, type AiProvider, presetFor } from '@/lib/aiCredentials';
import anthropic from '@/assets/providers/anthropic.svg?raw';
import cerebras from '@/assets/providers/cerebras-color.svg?raw';
import deepseek from '@/assets/providers/deepseek-color.svg?raw';
import gemini from '@/assets/providers/gemini-color.svg?raw';
import groq from '@/assets/providers/groq.svg?raw';
import mistral from '@/assets/providers/mistral-color.svg?raw';
import ollama from '@/assets/providers/ollama.svg?raw';
import openai from '@/assets/providers/openai.svg?raw';
import openrouter from '@/assets/providers/openrouter.svg?raw';
import together from '@/assets/providers/together-color.svg?raw';
import xai from '@/assets/providers/xai.svg?raw';

/* Vendored, scanned SVGs (see assets/providers/README.md), inlined so a
   one-colour mark draws in `currentColor` and follows the theme while the
   coloured ones keep their brand colours. */
const LOGOS: Record<AiProvider, string> = {
  gemini, groq, openrouter, cerebras, mistral, deepseek, together, openai, anthropic, xai, ollama,
};

/** A provider's logo on a small tile — how a key is recognised at a glance. */
export function ProviderMark({ provider, size = 'md' }: { provider: AiProvider; size?: 'sm' | 'md' }) {
  return (
    <span
      className="provider-mark"
      data-size={size}
      role="img"
      aria-label={presetFor(provider).name}
      dangerouslySetInnerHTML={{ __html: LOGOS[provider] }}
    />
  );
}

/**
 * One connected AI provider: its mark, its name, the model it will use,
 * and — in settings — the actions that apply to it.
 */
export function ProviderTile({ credential, actions, children }: { credential: AiCredential; actions?: ReactNode; children?: ReactNode }) {
  const preset = presetFor(credential.provider);
  return (
    <div className="provider-tile" data-default={credential.isDefault}>
      <div className="provider-tile-row">
        <ProviderMark provider={credential.provider} />
        <div className="min-w-0 flex-1">
          <Row align="center" gap={1.5}>
            <span className="provider-name">{preset.name}</span>
            {credential.isDefault && <Chip size="xs" caps tone="accent">Default</Chip>}
          </Row>
          <p className="provider-model truncate">{credential.model}</p>
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
