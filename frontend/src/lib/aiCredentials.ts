/**
 * Client-side store for AI provider API keys. Keys never leave the browser
 * except as request headers sent straight to our AI service — matches the
 * previous single-Gemini-key design, just generalized to a list of
 * provider/model/key entries the user can choose between.
 */

export type AiProvider =
  | "gemini" | "groq" | "openrouter" | "cerebras" | "mistral"
  | "deepseek" | "together" | "openai" | "anthropic" | "xai" | "ollama";

export interface AiCredential {
  id: string;
  provider: AiProvider;
  label: string;
  apiKey: string;
  model: string;
  isDefault: boolean;
}

/** What a provider costs to start with: a free tier, pay-as-you-go, or your own machine. */
export type ProviderTier = "free" | "paid" | "local";

export interface ProviderPreset {
  provider: AiProvider;
  name: string;
  tier: ProviderTier;
  /** One line on why you would pick it. */
  blurb: string;
  /**
   * Fallbacks only. Once a key is pasted the picker reads the provider's own
   * list (`/api/ai/models`), because names shipped here go stale within
   * months. The first entry is the recommendation when it is still offered.
   */
  models: string[];
  keyPlaceholder: string;
  getKeyUrl: string;
  /** How to get a key, in three short steps, in the provider's own words for its buttons. */
  steps: string[];
  /** The name of the page `getKeyUrl` opens — "Open Google AI Studio". */
  site: string;
  /** What the tier implies: limits, whether prompts may be used for training. */
  note?: string;
  /** Runs on the writer's machine; there is no key. */
  keyless?: boolean;
  /** Brand hue, so each saved credential is identifiable at a glance. */
  color: string;
}

// Free tiers first, then paid, then local. Every provider here is routed
// through LiteLLM by the backend, which holds the matching allowlist.
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    provider: "gemini",
    name: "Gemini",
    tier: "free",
    blurb: "Google's models. The free tier is the easiest start.",
    models: ["gemini-3.7-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
    keyPlaceholder: "AIza...",
    getKeyUrl: "https://aistudio.google.com/apikey",
    steps: [
      "Open Google AI Studio and sign in with your Google account.",
      "Click Create API key. If it asks, choose a Google Cloud project or let it create one.",
      "Copy the key (it starts with AIza) and paste it below.",
    ],
    site: "Google AI Studio",
    note: "No card needed. Requests per minute and per day are capped, and Google may use free-tier prompts to improve its products.",
    color: "#4285F4",
  },
  {
    provider: "groq",
    name: "Groq",
    tier: "free",
    blurb: "Open models at very high speed, with a free tier.",
    models: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3-32b"],
    keyPlaceholder: "gsk_...",
    getKeyUrl: "https://console.groq.com/keys",
    steps: [
      "Open the GroqCloud console and sign in with Google, GitHub or email.",
      "Go to API Keys and click Create API Key. Any name will do.",
      "Copy the key straight away (it starts with gsk_ and is shown only once) and paste it below.",
    ],
    site: "GroqCloud console",
    note: "No card needed. Requests per minute and per day are capped; the console's Limits page shows yours.",
    color: "#F55036",
  },
  {
    provider: "openrouter",
    name: "OpenRouter",
    tier: "free",
    blurb: "One key for hundreds of models. Those marked free cost nothing.",
    models: ["openrouter/free", "google/gemma-4-31b-it:free", "nvidia/nemotron-3-super-120b-a12b:free"],
    keyPlaceholder: "sk-or-v1-...",
    getKeyUrl: "https://openrouter.ai/settings/keys",
    steps: [
      "Sign in to OpenRouter.",
      "Open Keys and click Create Key. Leave the credit limit empty.",
      "Copy the key (it starts with sk-or-v1-) and paste it below.",
    ],
    site: "OpenRouter",
    note: "Models ending in :free cost nothing but have a small daily allowance; any credit on the account raises it.",
    color: "#6467F2",
  },
  {
    provider: "cerebras",
    name: "Cerebras",
    tier: "free",
    blurb: "Fast open models with a free daily allowance.",
    models: ["gpt-oss-120b", "llama-3.3-70b", "qwen-3-32b"],
    keyPlaceholder: "csk-...",
    getKeyUrl: "https://cloud.cerebras.ai",
    steps: [
      "Sign in to Cerebras Cloud.",
      "Open API Keys in the sidebar and generate a key.",
      "Copy it (it starts with csk-) and paste it below.",
    ],
    site: "Cerebras Cloud",
    note: "No card needed. The free tier has a daily token allowance.",
    color: "#F05A28",
  },
  {
    provider: "mistral",
    name: "Mistral",
    tier: "free",
    blurb: "European models. The Experiment plan is free.",
    models: ["mistral-medium-latest", "mistral-small-latest", "mistral-large-latest"],
    keyPlaceholder: "Mistral API key",
    getKeyUrl: "https://console.mistral.ai/api-keys",
    steps: [
      "Sign in to the Mistral console (La Plateforme).",
      "Under Billing, choose the free Experiment plan. It asks you to verify a phone number.",
      "Open API Keys, click Create new key, and copy it.",
    ],
    site: "Mistral console",
    note: "On the free Experiment plan, Mistral may use your requests to train its models.",
    color: "#FA520F",
  },
  {
    provider: "deepseek",
    name: "DeepSeek",
    tier: "paid",
    blurb: "Strong models at a very low price per word.",
    models: ["deepseek-chat", "deepseek-reasoner"],
    keyPlaceholder: "sk-...",
    getKeyUrl: "https://platform.deepseek.com/api_keys",
    steps: [
      "Sign in to the DeepSeek Platform.",
      "Add a small top-up. The API has no free tier, but a few dollars lasts a long time.",
      "Open API Keys, create a key, and copy it (it starts with sk-).",
    ],
    site: "DeepSeek Platform",
    color: "#4D6BFE",
  },
  {
    provider: "together",
    name: "Together AI",
    tier: "paid",
    blurb: "A wide shelf of open models, pay as you go.",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "deepseek-ai/DeepSeek-V3"],
    keyPlaceholder: "Together API key",
    getKeyUrl: "https://api.together.ai/settings/api-keys",
    steps: [
      "Sign in to Together AI.",
      "Add credit under Billing if the account has none.",
      "Open Settings, then API Keys, and copy your key.",
    ],
    site: "Together AI",
    color: "#0F6FFF",
  },
  {
    provider: "openai",
    name: "OpenAI",
    tier: "paid",
    blurb: "GPT models. Needs prepaid credit.",
    models: ["gpt-5.2-chat-latest", "gpt-5.2-mini"],
    keyPlaceholder: "sk-...",
    getKeyUrl: "https://platform.openai.com/api-keys",
    steps: [
      "Sign in to the OpenAI Platform.",
      "Add prepaid credit under Settings, then Billing.",
      "Open API keys, click Create new secret key, and copy it (it starts with sk-).",
    ],
    site: "OpenAI Platform",
    color: "#10A37F",
  },
  {
    provider: "anthropic",
    name: "Anthropic",
    tier: "paid",
    blurb: "Claude models. Needs prepaid credit.",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
    keyPlaceholder: "sk-ant-...",
    getKeyUrl: "https://console.anthropic.com/settings/keys",
    steps: [
      "Sign in to the Anthropic Console.",
      "Add credit under Billing.",
      "Open API Keys, click Create Key, and copy it (it starts with sk-ant-).",
    ],
    site: "Anthropic Console",
    color: "#D97757",
  },
  {
    provider: "xai",
    name: "xAI",
    tier: "paid",
    blurb: "Grok models. Needs prepaid credit.",
    models: ["grok-4.6"],
    keyPlaceholder: "xai-...",
    getKeyUrl: "https://console.x.ai",
    steps: [
      "Sign in to the xAI Console.",
      "Add credit to your team.",
      "Open API Keys, create a key, and copy it (it starts with xai-).",
    ],
    site: "xAI Console",
    color: "#8B9099",
  },
  {
    provider: "ollama",
    name: "Ollama",
    tier: "local",
    blurb: "Models on your own computer. No key, no limits, no cost.",
    models: ["llama3.2", "qwen2.5", "gemma3"],
    keyPlaceholder: "",
    getKeyUrl: "https://ollama.com/download",
    steps: [
      "Download and install Ollama, then open it.",
      "In a terminal, pull a model, e.g. ollama pull llama3.2.",
      "Choose Continue below; Topical lists the models you have pulled.",
    ],
    site: "Ollama",
    note: "Runs entirely on your computer, so it works only when Topical runs there too.",
    keyless: true,
    color: "#7A746A",
  },
];

export const TIER_LABEL: Record<ProviderTier, string> = {
  free: "Free tier",
  paid: "Paid",
  local: "On this computer",
};

const STORAGE_KEY = "topical_ai_credentials";
const LEGACY_GEMINI_KEY = "gemini_api_key";

/**
 * Every access is guarded.
 *
 * `localStorage` is not merely unreliable here, it can *throw* — private
 * windows and "block all cookies" make even a read raise. An unguarded read
 * on this path took the whole app down before any of it rendered, since the
 * API client reads credentials on the way to every request.
 */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode and full quotas are not worth failing a request over.
  }
}

function readRaw(): AiCredential[] {
  const raw = readStored(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // Anything but a list means the entry is corrupt; a non-array would
      // reach `.find`/`.filter` below and throw on every later call.
      if (Array.isArray(parsed)) return parsed as AiCredential[];
    } catch {
      // Unparseable — fall through and start clean.
    }
  }

  // Auto-migrate a pre-existing single Gemini key so nobody loses it.
  const legacy = readStored(LEGACY_GEMINI_KEY);
  if (legacy) {
    const migrated: AiCredential[] = [
      {
        id: crypto.randomUUID(),
        provider: "gemini",
        label: "Gemini",
        apiKey: legacy,
        model: "gemini-3.7-flash",
        isDefault: true,
      },
    ];
    writeStored(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  }

  return [];
}

export function getCredentials(): AiCredential[] {
  return readRaw();
}

function write(creds: AiCredential[]) {
  writeStored(STORAGE_KEY, JSON.stringify(creds));
}

export function saveCredential(cred: Omit<AiCredential, "id"> & { id?: string }): AiCredential[] {
  const creds = readRaw();
  const id = cred.id || crypto.randomUUID();
  const next = creds.filter((c) => c.id !== id);
  const entry: AiCredential = { ...cred, id };

  // First saved key becomes the default automatically.
  if (next.length === 0) entry.isDefault = true;
  if (entry.isDefault) next.forEach((c) => (c.isDefault = false));

  next.push(entry);
  write(next);
  return next;
}

export function deleteCredential(id: string): AiCredential[] {
  const creds = readRaw().filter((c) => c.id !== id);
  // If the default got deleted, promote the first remaining entry.
  if (creds.length && !creds.some((c) => c.isDefault)) creds[0].isDefault = true;
  write(creds);
  return creds;
}

export function setDefaultCredential(id: string): AiCredential[] {
  const creds = readRaw().map((c) => ({ ...c, isDefault: c.id === id }));
  write(creds);
  return creds;
}

export function getDefaultCredential(): AiCredential | null {
  const creds = readRaw();
  return creds.find((c) => c.isDefault) || creds[0] || null;
}

export function presetFor(provider: AiProvider): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.provider === provider) || PROVIDER_PRESETS[0];
}

/**
 * The model to suggest from a provider's live list: the first preset that is
 * still offered, else a free one, else whatever comes first.
 */
export function recommendedModel(preset: ProviderPreset, live: { id: string; free: boolean }[]): string {
  const ids = new Set(live.map(m => m.id));
  return preset.models.find(m => ids.has(m))
    ?? live.find(m => m.free)?.id
    ?? live[0]?.id
    ?? preset.models[0];
}
