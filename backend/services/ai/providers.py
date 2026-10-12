"""Provider plumbing: credentials, completion calls, and error translation.

Everything here is provider-agnostic — litellm routes `provider/model` to
whichever vendor the user configured in the browser.

Free of FastAPI: failures are raised as ``AppError``, which the HTTP layer
already renders in the one error shape the whole API uses. That keeps this
module callable from anywhere — a worker, a script, a test — rather than only
from inside a request.
"""

import asyncio
import json
import logging
import os
import random
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from functools import wraps
from typing import Dict, List, Optional

import litellm
from litellm.types.utils import Choices
from typing import cast

from ...core.errors import AppError

logger = logging.getLogger(__name__)

DEFAULT_PROVIDER = "gemini"
DEFAULT_MODEL = "gemini-3.7-flash"

OLLAMA_API_BASE = os.environ.get("OLLAMA_API_BASE", "http://localhost:11434").rstrip("/")


@dataclass(frozen=True)
class ProviderSpec:
    """One provider Topical offers, keyed by the id the browser stores.

    ``route`` is LiteLLM's prefix for it, where that differs from the id.
    ``models_url`` and ``listing`` say where its model list lives and which
    of the four response shapes it comes back in. A ``keyless`` provider runs
    on the writer's own machine and has no key to send.
    """
    name: str
    route: str
    models_url: str
    listing: str  # "openai" | "gemini" | "anthropic" | "ollama" | "together"
    keyless: bool = False
    api_base: Optional[str] = None


# The allowlist. A provider id that is not here is refused rather than handed
# to LiteLLM, which would otherwise try whatever prefix it was given.
PROVIDERS: Dict[str, ProviderSpec] = {
    "gemini": ProviderSpec("Gemini", "gemini", "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", "gemini"),
    "groq": ProviderSpec("Groq", "groq", "https://api.groq.com/openai/v1/models", "openai"),
    "openrouter": ProviderSpec("OpenRouter", "openrouter", "https://openrouter.ai/api/v1/models", "openai"),
    "cerebras": ProviderSpec("Cerebras", "cerebras", "https://api.cerebras.ai/v1/models", "openai"),
    "mistral": ProviderSpec("Mistral", "mistral", "https://api.mistral.ai/v1/models", "openai"),
    "deepseek": ProviderSpec("DeepSeek", "deepseek", "https://api.deepseek.com/models", "openai"),
    "together": ProviderSpec("Together AI", "together_ai", "https://api.together.xyz/v1/models", "together"),
    "openai": ProviderSpec("OpenAI", "openai", "https://api.openai.com/v1/models", "openai"),
    "anthropic": ProviderSpec("Anthropic", "anthropic", "https://api.anthropic.com/v1/models?limit=1000", "anthropic"),
    "xai": ProviderSpec("xAI", "xai", "https://api.x.ai/v1/models", "openai"),
    "ollama": ProviderSpec("Ollama", "ollama_chat", f"{OLLAMA_API_BASE}/api/tags", "ollama",
                           keyless=True, api_base=OLLAMA_API_BASE),
}

SETTINGS_HINT = "Settings → AI models"


@dataclass
class AiCredentials:
    provider: str
    model: str
    api_key: str

    @property
    def spec(self) -> ProviderSpec:
        return PROVIDERS[self.provider]

    def completion_args(self) -> dict:
        """What LiteLLM needs to reach this provider and model."""
        args: dict = {"model": f"{self.spec.route}/{self.model}"}
        if self.api_key:
            args["api_key"] = self.api_key
        if self.spec.api_base:
            args["api_base"] = self.spec.api_base
        return args


def build_credentials(provider: str, model: str, api_key: str) -> AiCredentials:
    """The provider/model/key trio, defaulted and checked.

    The key belongs to the user and lives in their browser; it reaches us only
    as a header on the request that needs it, and is never stored, never
    logged, and never written to the database.
    """
    provider = (provider or "").strip().lower() or DEFAULT_PROVIDER
    spec = PROVIDERS.get(provider)
    if spec is None:
        raise AppError(f"Topical does not support the provider '{provider}'.", 400)

    api_key = (api_key or "").strip()
    if not api_key and not spec.keyless:
        raise AppError(f"No API key configured. Add one under {SETTINGS_HINT}.", 400)

    return AiCredentials(
        provider=provider,
        model=(model or "").strip() or DEFAULT_MODEL,
        api_key=api_key,
    )


# Failures worth trying again at once: capacity, timeouts, and transport.
# Gemini in particular returns 503 "this model is currently experiencing high
# demand" often enough that a single attempt makes the app look broken when the
# retry that would have succeeded is one second away.
#
# Rate limits are deliberately *not* here. A per-minute token limit is not
# lifted by retrying 1.2s and 2.7s later — that only spends the attempts (the
# logs showed exactly that against Groq's 8,000 tokens/minute). A rate limit
# fails fast with the provider's own "try again in N s" as Retry-After, and
# the editor's AI queue waits that long before trying again.
_RETRYABLE = (
    litellm.ServiceUnavailableError,
    litellm.InternalServerError,
    litellm.APIConnectionError,
    litellm.Timeout,
)

_TRY_AGAIN = re.compile(r"try again in\s+(?:(\d+)m)?\s*([\d.]+)\s*s", re.IGNORECASE)


def retry_after_seconds(exc: Exception) -> Optional[int]:
    """The wait a rate-limited provider asked for, from its message, in whole seconds."""
    m = _TRY_AGAIN.search(str(exc))
    if not m:
        return None
    minutes = int(m.group(1) or 0)
    return max(1, int(minutes * 60 + float(m.group(2)) + 0.999))

MAX_ATTEMPTS = 3
_BASE_DELAY_SECONDS = 1.0


@dataclass(frozen=True)
class Completion:
    """A model's answer, and why it stopped."""

    text: str
    #: "stop" for a finished answer; "length" when the token limit cut it off.
    finish_reason: str = "stop"

    @property
    def truncated(self) -> bool:
        """Cut off by the token limit — the end of the text is not where the model meant to stop."""
        return self.finish_reason == "length"


async def complete(
    prompt: str, credentials: AiCredentials, *, json_mode: bool = False, system: Optional[str] = None,
) -> Completion:
    """One completion via litellm, retrying the failures that are worth retrying.

    Async all the way down: a blocking call here would stall every other
    request for the length of a model round-trip, and the backoff would stall
    it further still.

    ``system`` carries the standing rules — the house style a section is
    written in — apart from the request itself. Models weigh a system message
    as the brief rather than as one more paragraph of the ask, and it is the
    part of the prompt that stays the same from call to call.

    No temperature is passed. Gemini 3 models warn that anything below the
    default degrades reasoning and can fail outright, and the other providers'
    defaults are already appropriate for this kind of writing.
    """
    delay = _BASE_DELAY_SECONDS
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            # acompletion() is typed to also allow a streaming response; we never
            # pass stream=True, so this is always a plain ModelResponse at runtime.
            response = cast(
                litellm.ModelResponse,
                await litellm.acompletion(
                    messages=messages,
                    # JSON mode where the provider has one; `drop_params`
                    # silently removes it for providers that do not, rather
                    # than failing the request.
                    **({"response_format": {"type": "json_object"}, "drop_params": True} if json_mode else {}),
                    **credentials.completion_args(),
                ),
            )
            choice = cast(Choices, response.choices[0])
            return Completion(choice.message.content or "", str(choice.finish_reason or "stop"))

        except _RETRYABLE as exc:
            if attempt == MAX_ATTEMPTS:
                raise
            # Jitter so a burst of parallel requests doesn't retry in lockstep.
            wait = delay + random.uniform(0, 0.4)
            logger.info(
                "%s/%s attempt %d failed (%s); retrying in %.1fs",
                credentials.provider, credentials.model, attempt, type(exc).__name__, wait,
            )
            await asyncio.sleep(wait)
            delay *= 2.5
    raise AssertionError("unreachable")


async def generate_content(
    prompt: str, credentials: AiCredentials, *, json_mode: bool = False, system: Optional[str] = None,
) -> str:
    """The text of one completion — for callers that do not need to know how it ended."""
    return (await complete(prompt, credentials, json_mode=json_mode, system=system)).text


VERIFY_TIMEOUT_SECONDS = 20


async def check_credentials(credentials: AiCredentials) -> None:
    """Prove a key and model work: one trivial call, tried once, time-boxed.

    Not ``generate_content``. That retries an overloaded model with backoff
    and inherits litellm's ten-minute default timeout — right for writing a
    section, wrong for a key check, which used to ask for a whole topic
    outline that way and could leave "Checking the key…" spinning for minutes.
    A key check that cannot answer in seconds should say so and let the writer
    try again.
    """
    try:
        await asyncio.wait_for(
            litellm.acompletion(
                messages=[{"role": "user", "content": "Reply with the single word OK."}],
                timeout=VERIFY_TIMEOUT_SECONDS,
                **credentials.completion_args(),
            ),
            VERIFY_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        raise AppError(
            f"{credentials.spec.name} did not answer within {VERIFY_TIMEOUT_SECONDS} "
            "seconds. It may be busy — try again in a moment.",
            504,
        )


MODELS_TIMEOUT_SECONDS = 10

# Ids in a provider's list that are not chat models: embeddings, speech,
# images, moderation, reranking. Generating a section with one fails, so the
# picker should not offer them.
_NOT_CHAT = re.compile(
    r"embed|whisper|tts|speech|transcri|dall-e|imagen|image|veo|moderation|guard|rerank|"
    r"audio|realtime|aqa|computer-use|babbage|davinci|lyria|content-safety",
    re.IGNORECASE,
)


# Several providers (Groq, Cerebras, OpenRouter) sit behind Cloudflare, which
# answers urllib's default "Python-urllib/3.x" agent with a 403 "Error 1010:
# Access denied" before the provider ever sees the key — and that 403 was
# reported as "rejected that key", so a correct Groq key could never connect.
USER_AGENT = "Topical/1.0 (+https://github.com/topical)"


def _get_json(url: str, headers: dict) -> object:
    request = urllib.request.Request(
        url, headers={"Accept": "application/json", "User-Agent": USER_AGENT, **headers}
    )
    with urllib.request.urlopen(request, timeout=MODELS_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def _model_entries(spec: ProviderSpec, body: object) -> List[dict]:
    """The provider's response, in whichever of its shapes, as id + free flag."""
    entries: List[dict] = []
    if spec.listing == "gemini":
        for item in (body or {}).get("models", []):
            if "generateContent" in item.get("supportedGenerationMethods", []):
                entries.append({"id": str(item.get("name", "")).removeprefix("models/")})
    elif spec.listing == "ollama":
        entries = [{"id": item.get("name", "")} for item in (body or {}).get("models", [])]
    elif spec.listing == "together":
        items = body if isinstance(body, list) else (body or {}).get("data", [])
        entries = [{"id": item.get("id", "")} for item in items if item.get("type") in (None, "chat")]
    else:  # openai-shaped, and anthropic's is the same list under "data"
        for item in (body or {}).get("data", []):
            # OpenRouter says what a model produces; music and image models
            # carry names no pattern would catch.
            outputs = (item.get("architecture") or {}).get("output_modalities")
            if outputs and "text" not in outputs:
                continue
            pricing = item.get("pricing") or {}
            free = str(item.get("id", "")).endswith(":free") or (
                str(pricing.get("prompt")) == "0" and str(pricing.get("completion")) == "0"
            )
            entries.append({"id": item.get("id", ""), "free": free})

    seen, out = set(), []
    for entry in entries:
        model_id = entry["id"]
        if model_id and model_id not in seen and not _NOT_CHAT.search(model_id):
            seen.add(model_id)
            out.append({"id": model_id, "free": bool(entry.get("free"))})
    return sorted(out, key=lambda e: (not e["free"], e["id"]))


def _error_detail(exc: urllib.error.HTTPError) -> Optional[str]:
    """The provider's own error message, if the body is one; never the key."""
    try:
        body = exc.read().decode("utf-8", "replace")
    except Exception:
        return None
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return body[:300] or None
    error = parsed.get("error") if isinstance(parsed, dict) else None
    if isinstance(error, dict):
        return str(error.get("message") or error.get("code") or "")
    return str(error or parsed.get("title") or parsed.get("message") or "")[:300] or None


async def list_models(credentials: AiCredentials) -> List[dict]:
    """The chat models this key can use, read from the provider itself.

    Model names go stale faster than any list shipped in the app — a preset
    written last month already names models that have been retired — so the
    picker asks the provider. Reading a list is free and quick, unlike the
    completion ``check_credentials`` makes. Blocking I/O, so it runs off the
    event loop, like the crawler.
    """
    spec = credentials.spec
    key = credentials.api_key
    if spec.listing == "gemini":
        headers = {"x-goog-api-key": key}
    elif spec.listing == "anthropic":
        headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}
    else:
        headers = {"Authorization": f"Bearer {key}"} if key else {}

    try:
        body = await asyncio.to_thread(_get_json, spec.models_url, headers)
    except urllib.error.HTTPError as exc:
        detail = _error_detail(exc)
        # Only the provider saying so means the key is wrong. A 403 from a
        # proxy in front of it (Cloudflare) is about the request, not the key.
        key_said_bad = bool(detail and re.search(r"api.?key", detail, re.I)
                            and re.search(r"invalid|incorrect|not valid|expired|revoked", detail, re.I))
        if exc.code == 401 or (exc.code == 403 and detail and "1010" not in detail) or key_said_bad:
            raise AppError(f"{spec.name} rejected that key. Check it was copied whole.", 401)
        logger.warning("listing %s models: HTTP %s %s", spec.name, exc.code, (detail or "")[:200])
        raise AppError(f"{spec.name} would not list its models (HTTP {exc.code}). Try again in a moment.", 502)
    except (TimeoutError, urllib.error.URLError, OSError) as exc:
        logger.info("listing %s models failed: %s", spec.name, exc)
        if spec.keyless:
            raise AppError(f"Could not reach {spec.name} at {spec.api_base}. Is it running?", 502)
        raise AppError(f"Could not reach {spec.name}. Try again in a moment.", 502)
    except json.JSONDecodeError:
        raise AppError(f"{spec.name} sent back a model list Topical could not read.", 502)
    return _model_entries(spec, body)


# Provider failures map to the status the client should actually act on, with a
# message safe to show a user. The raw provider payload is logged, never
# returned — it carries request IDs and echoes the caller's own prompt.
_PROVIDER_ERRORS: List[tuple] = [
    (litellm.AuthenticationError, 401,
     "That API key was rejected by {provider}. Check it under " + SETTINGS_HINT + "."),
    (litellm.PermissionDeniedError, 403,
     "Your {provider} key doesn't have access to '{model}'."),
    (litellm.NotFoundError, 404,
     "{provider} has no model called '{model}'. Pick a different model."),
    (litellm.ContextWindowExceededError, 413,
     "That document is too long for '{model}'. Try a shorter section."),
    (litellm.ContentPolicyViolationError, 422,
     "{provider} declined to generate this content."),
    (litellm.RateLimitError, 429,
     "{provider} is rate-limiting your key. Wait a minute and try again."),
    (litellm.Timeout, 504,
     "{provider} took too long to respond. Try again, or use a faster model."),
    (litellm.ServiceUnavailableError, 502,
     "{provider} says '{model}' is overloaded right now — tried " + str(MAX_ATTEMPTS)
     + " times. Wait a moment, or pick another model under " + SETTINGS_HINT + "."),
    (litellm.APIConnectionError, 502, "Could not reach {provider}."),
    (litellm.InternalServerError, 502, "{provider} returned an internal error."),
    # Least specific last: several of the above subclass BadRequestError.
    (litellm.BadRequestError, 400,
     "{provider} rejected the request for '{model}'."),
]


#: Statuses that mean the provider refused the request itself — not busy, not
#: unreachable — and the kind of refusal each is, for the client's dialog.
_REJECTION_KINDS = {401: "auth", 403: "access", 404: "model", 413: "too-long", 422: "policy", 400: "bad-request"}

_PROVIDER_MESSAGE = re.compile(r"""["']message["']\s*:\s*["']((?:[^"'\\]|\\.){4,})["']""")


def _provider_reason(exc: Exception) -> str:
    """The provider's own words, as short as they can be made.

    litellm wraps them as "litellm.BadRequestError: XException - {...json...}";
    the JSON's ``message`` is the sentence a person can act on. Capped, and
    cut to one line — it can echo part of the request.
    """
    text = getattr(exc, "message", None) or str(exc)
    found = _PROVIDER_MESSAGE.search(text)
    reason = found.group(1) if found else text.rsplit(" - ", 1)[-1]
    reason = re.sub(r"^(?:litellm\.\w+:\s*)+", "", reason)
    return " ".join(reason.split())[:400]


def _describe(exc: Exception, creds: Optional[AiCredentials]) -> Optional[tuple]:
    """Map a provider exception to (status, user-facing message), or None."""
    provider = creds.spec.name if creds else "The AI provider"
    model = creds.model if creds else "the selected model"
    for exc_type, status, template in _PROVIDER_ERRORS:
        if isinstance(exc, exc_type):
            return status, template.format(provider=provider, model=model)
    return None


def endpoint(func):
    """Translate provider and parsing failures into actionable responses.

    Without this every failure reached the browser as a 500 carrying a raw
    provider exception, so a mistyped API key was indistinguishable from an
    outage and the UI had nothing to branch on.

    Applied to the service functions rather than the route handlers, so a
    caller that is not an HTTP request gets the same translated failure.
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # The credentials are a keyword argument; used only to name the
        # provider and model in the message.
        creds = kwargs.get("credentials")
        try:
            return await func(*args, **kwargs)
        except AppError:
            raise
        except json.JSONDecodeError as e:
            logger.error("%s: model returned unparseable JSON: %s", func.__name__, e)
            raise AppError("The model returned a malformed response. Try again.", 502)
        except Exception as e:
            described = _describe(e, creds)
            if described:
                status, message = described
                logger.warning("%s: %s (%s)", func.__name__, type(e).__name__, e)
                headers = None
                if status == 429:
                    wait = retry_after_seconds(e)
                    if wait:
                        headers = {"Retry-After": str(wait)}
                        message = f"{creds.spec.name if creds else 'The provider'} is rate-limiting your key; it asks to wait {wait}s."
                extra = None
                kind = _REJECTION_KINDS.get(status)
                if kind:
                    extra = {"rejection": {
                        "kind": kind,
                        "provider": creds.spec.name if creds else "The AI provider",
                        "model": creds.model if creds else "",
                        "reason": _provider_reason(e),
                    }}
                raise AppError(message, status, headers=headers, extra=extra)
            logger.exception("%s failed unexpectedly", func.__name__)
            raise AppError("Content generation failed unexpectedly. Please try again.", 500)
    return wrapper
