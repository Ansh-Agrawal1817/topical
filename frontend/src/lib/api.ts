import { queryOptions } from "@tanstack/react-query";
import type { AiCollaborator, DocFormat, LessonPlan } from "@/lib/types";
import { getDefaultCredential, type AiProvider } from "@/lib/aiCredentials";
import { AiKeyDeclined, requestAiKey } from "@/lib/aiKeyGate";
import { reportRejection, type AiRejection } from "@/lib/aiRejection";

/**
 * The HTTP client every call in this file goes through.
 *
 * It replaced Hono's RPC client, which typed the routes end-to-end by importing
 * the server's own route definitions — an arrangement that only works while
 * the server is TypeScript. The backend is Python now, so the types live here
 * instead, next to the functions that return them, and the request plumbing
 * (JSON body, credentials, error unwrapping) exists once rather than at each
 * call site.
 */

/** Everything the API is reached at. Relative, so Vite's proxy and the
 *  production server (which serves this bundle itself) both work unchanged. */
const API_BASE = "/api";

interface RequestOptions {
  method?: string;
  /** Serialised as JSON. Use `form` for multipart instead. */
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | undefined>;
  /** Attach the user's own AI provider credentials to this request. */
  ai?: boolean;
  /** Sentence shown if the response carries no message of its own. */
  failure: string;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

/**
 * The user's provider key travels on the AI request that needs it and nowhere
 * else — it lives in their browser, and the server never stores it.
 */
function aiHeaders(): Record<string, string> {
  const credential = getDefaultCredential();
  if (!credential) return {};
  return {
    "X-AI-Provider": credential.provider,
    "X-AI-Model": credential.model,
    "X-AI-Api-Key": credential.apiKey,
  };
}

/**
 * A failed API call, carrying its HTTP status — so a caller can tell "rate
 * limited, try again shortly" (429/502/503/504) from "wrong key" (401), which
 * a bare Error message could only be guessed from.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
    /** Set when the AI provider itself refused the request (see `lib/aiRejection`). */
    readonly rejection?: AiRejection,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Whether this failure is a refusal from the AI provider — shown as a dialog, not a toast. */
export const isRejection = (error: unknown): error is ApiError & { rejection: AiRejection } =>
  error instanceof ApiError && !!error.rejection;

/** Throw a descriptive ApiError if a response isn't OK; otherwise return it. */
async function ensureOk(res: Response, message: string): Promise<Response> {
  if (res.ok) return res;

  const body = await res.text().catch(() => "");
  // The API reports every failure as {"error": "...", "detail": "..."};
  // surface that sentence rather than the raw JSON, which used to be shown to
  // users verbatim.
  let detail = body;
  let rejection: AiRejection | undefined;
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error || parsed?.detail || body;
    if (parsed?.rejection?.kind) rejection = parsed.rejection as AiRejection;
  } catch {
    // Not JSON — use the body as-is.
  }
  const retryAfter = Number(res.headers.get("Retry-After"));
  throw new ApiError(
    detail || `${message} (${res.status} ${res.statusText})`,
    res.status,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    rejection,
  );
}

/** Issue one request, and throw a readable Error if it fails. */
async function request(path: string, options: RequestOptions): Promise<Response> {
  const { method = "GET", body, form, query, ai, failure } = options;

  // No key yet: ask for one and carry on with it, rather than sending a
  // request that can only come back 400.
  if (ai && !(await requestAiKey())) throw new AiKeyDeclined();

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (ai) Object.assign(headers, aiHeaders());

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    // The session is an httpOnly cookie, so it has to be sent explicitly.
    credentials: "same-origin",
  });

  return ai ? reportingRejections(res, failure) : ensureOk(res, failure);
}

/**
 * `ensureOk` for a model request: a refusal from the provider is also
 * reported to the rejection dialog. Key checks in Settings do not come
 * through here — they show their own answer beside the field.
 */
async function reportingRejections(res: Response, failure: string): Promise<Response> {
  try {
    return await ensureOk(res, failure);
  } catch (error) {
    if (isRejection(error)) reportRejection(error.rejection, error.message);
    throw error;
  }
}

/** A request whose body is JSON. */
async function json<T>(path: string, options: RequestOptions): Promise<T> {
  const res = await request(path, options);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** A request whose body is the model's raw text. */
async function text(path: string, options: RequestOptions): Promise<string> {
  return (await request(path, options)).text();
}

// ── Current user ──────────────────────────────────────────────────────────

/** The shape `/api/me` and both sign-in routes answer with. */
export interface SessionResponse {
  user: {
    id: string;
    email?: string | null;
    given_name?: string | null;
    family_name?: string | null;
    picture?: string | null;
    username?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
  } | null;
  isNewUser?: boolean;
}

async function getCurrentUser(): Promise<SessionResponse> {
  // An anonymous visitor is answered with 200 and a null user rather than a
  // failure, so this never throws for the expected first-visit case.
  return json<SessionResponse>("/me", { failure: "Failed to fetch current user" });
}

export const userQueryOptions = queryOptions({
  queryKey: ["get-current-user"],
  queryFn: getCurrentUser,
  staleTime: 1000 * 60 * 5,
  retry: false,
});

export interface ProfileUpdate {
  username?: string;
  bio?: string | null;
  avatarUrl?: string | null;
}

export async function updateProfile(update: ProfileUpdate) {
  return json("/profile", {
    method: "PATCH",
    body: update,
    failure: "Failed to update profile",
  });
}

// ── Sign in, sign up, sign out ────────────────────────────────────────────

export interface Credentials {
  email: string;
  password: string;
}

export interface Registration extends Credentials {
  given_name?: string;
  family_name?: string;
}

/** Create an account. The response is already signed in. */
export async function registerAccount(payload: Registration): Promise<SessionResponse> {
  return json<SessionResponse>("/auth/register", {
    method: "POST",
    body: payload,
    failure: "Could not create that account",
  });
}

export async function loginWithPassword(payload: Credentials): Promise<SessionResponse> {
  return json<SessionResponse>("/auth/login", {
    method: "POST",
    body: payload,
    failure: "Could not sign in",
  });
}

/** End this browser's session. The cookie is cleared by the response. */
export async function logoutSession(): Promise<void> {
  await request("/auth/logout", { method: "POST", failure: "Could not sign out" });
}

/** Change the signed-in user's password, signing every other browser out. */
export async function changePassword(payload: {
  current_password: string;
  new_password: string;
}): Promise<void> {
  await request("/auth/password", {
    method: "POST",
    body: payload,
    failure: "Could not change your password",
  });
}

/** Upload an image file (avatar, etc.) and return its public URL. */
export async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const { url } = await json<{ url: string }>("/files/upload", {
    method: "POST",
    form,
    failure: "Upload failed",
  });
  return url;
}

// ── AI ────────────────────────────────────────────────────────────────────

/**
 * POST to an AI route, with the user's provider credentials attached.
 *
 * Every AI call goes through here, so the body, the headers and the error
 * unwrapping exist once. They used to be spread across three idioms — the Hono
 * RPC client, a LaTeX-only helper, and bare `fetch` — which is how the same
 * failure reached the user with three different messages.
 */
function aiJson<T>(path: string, body: unknown, failure: string): Promise<T> {
  return json<T>(`/ai/${path}`, { method: "POST", body, ai: true, failure });
}

function aiText(path: string, body: unknown, failure: string): Promise<string> {
  return text(`/ai/${path}`, { method: "POST", body, ai: true, failure });
}

/** Past this, a key check reports a timeout rather than spinning. The server gives up at 20s. */
const VERIFY_TIMEOUT_MS = 30_000;
const MODELS_TIMEOUT_MS = 15_000;

/**
 * A request made with a key that is not saved yet, so its headers are given
 * rather than read from storage. Deadline-bound, and cancellable by `signal`
 * (which rejects with an AbortError).
 */
async function keyRequest(
  path: string,
  creds: { provider: AiProvider; model?: string; apiKey: string },
  { signal, timeoutMs, failure }: { signal?: AbortSignal; timeoutMs: number; failure: string },
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel);
  try {
    const res = await fetch(`${API_BASE}/ai/${path}`, {
      method: "POST",
      headers: { "X-AI-Provider": creds.provider, "X-AI-Model": creds.model ?? "", "X-AI-Api-Key": creds.apiKey },
      credentials: "same-origin",
      signal: controller.signal,
    });
    return await ensureOk(res, failure);
  } catch (error) {
    if (timedOut) throw new Error(`No answer from the provider in ${timeoutMs / 1000} seconds. Check your connection and try again.`);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

/**
 * Try a key before it is saved, so a typo fails where it was typed rather
 * than midway through writing a document. One tiny real completion on its
 * own route, tried once, with a deadline at both ends.
 */
export async function verifyAiKey(
  provider: AiProvider, model: string, apiKey: string, signal?: AbortSignal,
): Promise<void> {
  await keyRequest("verify-key", { provider, model, apiKey },
    { signal, timeoutMs: VERIFY_TIMEOUT_MS, failure: "That key or model was rejected" });
}

export interface AiModel {
  id: string;
  /** Costs nothing on this provider (OpenRouter marks these). */
  free: boolean;
}

/** The chat models a key can use, read live from the provider. Quick and free. */
export async function listAiModels(
  provider: AiProvider, apiKey: string, signal?: AbortSignal,
): Promise<AiModel[]> {
  const res = await keyRequest("models", { provider, apiKey },
    { signal, timeoutMs: MODELS_TIMEOUT_MS, failure: "Could not load the models" });
  return ((await res.json()) as { models: AiModel[] }).models;
}

/** The envelope both hierarchy endpoints return: a ```json fence inside JSON. */
export type HierarchyEnvelope = { status: string; data?: { topics?: string } };

/** Ask for a topic hierarchy for a subject the writer names. */
export async function searchTopics(query: string) {
  return aiJson<HierarchyEnvelope>("search-topics", { query }, "Failed to search topics");
}

/** Derive an outline from a draft that already exists. */
export async function outlineFromDocument(document: string, format: DocFormat) {
  return aiJson<HierarchyEnvelope>(
    "outline-from-document",
    { document, format },
    "Failed to outline this document",
  );
}

/** Where a section's reference material comes from. */
export type GenerationSource = "web" | "llm" | "urls";

/** The wire body of a section request — one endpoint for every format/source. */
export interface SectionBody {
  topic: string;
  main_topic: string;
  format: DocFormat;
  source: GenerationSource;
  /** Pages to ground the section in. Read only when `source` is "urls". */
  urls?: string[];
  /**
   * The whole outline as a numbered tree, marked with what is already
   * written. "Do not repeat the other sections" is only followable if the
   * model can see which of them exist.
   */
  hierarchy?: string;
  /** Sub-sections written separately; a parent must not cover them. */
  children?: string[];
  /** Headings this section is nested inside, outermost first. */
  ancestors?: string[];
  /** Its number in the outline — "2.3" — so the model knows where it sits. */
  section_number?: string;
  /**
   * What the writer asked for beyond the title. `topic` says what the section
   * is about; this says how it should be written, and the prompt lets it
   * override the standing rules it contradicts.
   */
  instruction?: string;
  /** Prose already in the document, so the new section sounds like it. */
  style_sample?: string;
  /** Heading depth as written in the markup, so the section opens at the right level. */
  level?: number;
  /** The last lines of the document before this section, to continue from. */
  lead_in?: string;
  /** LaTeX labels already in the document ("tab:x → Table 2 (…)"), to reference and not redefine. */
  labels?: string[];
  /** What the written sections already define, one line per section. */
  covered?: string;
}

/** Write one section of a document. Returns the model's raw markup. */
export async function requestSection(body: SectionBody): Promise<string> {
  return aiText("generate-section", body, "Failed to generate the section");
}

export interface TransformRequest {
  action: string;
  selection: string;
  format: DocFormat;
  /** Free-text instruction; required for the `custom` action. */
  instruction?: string;
  /** Surrounding text, so the model matches the voice around the passage. */
  before?: string;
  after?: string;
  title?: string;
  /** The headings the passage sits under — "Results > Error analysis". */
  section?: string;
  /** The document's headings, indented by depth. */
  outline?: string;
  /** The last attempt, when the writer asks for a different one. */
  previous?: string;
  /** Markup level of the section the passage is in: the edit adds no heading at or above it. */
  level?: number;
  /** LaTeX labels already in the document. */
  labels?: string[];
}

export interface SourceHit {
  url: string;
  title: string;
  snippet: string;
}

/** Top pages for a subject, for the context shelf. No model involved, so no key. */
export async function findSources(query: string, limit = 5): Promise<SourceHit[]> {
  const body = await json<{ sources: SourceHit[] }>("/ai/sources", {
    method: "POST",
    body: { query, limit },
    failure: "Could not search for sources",
  });
  return body.sources;
}

/** Rewrite, extend, or explain one passage. Returns the model's plain text. */
export async function transformSelection(req: TransformRequest): Promise<string> {
  return aiText("transform", req, "The AI edit failed");
}

/** One row of a model-proposed restructure, with its justification. */
export interface OutlineChange {
  title: string;
  kind: string;
  reason: string;
  /** For a rename or split: the current title the row came from. */
  from?: string;
}

export interface RefinedOutline {
  summary: string;
  outline: { title: string; level: number }[];
  changes: OutlineChange[];
}

/** One row of the outline sent for refinement, with what it already cost. */
export interface OutlineRowIn {
  title: string;
  level: number;
  /**
   * Words already written under it. A restructure that moves a section
   * carrying 900 words is a different proposition from moving an empty
   * heading, and the model cannot weigh that if it only sees titles.
   */
  words?: number;
}

/** Ask for a better-organised outline, and the reasoning behind each move. */
export async function refineOutline(
  outline: OutlineRowIn[],
  subject: string,
  instruction: string,
  format: DocFormat,
): Promise<RefinedOutline> {
  return aiJson<RefinedOutline>(
    "refine-outline",
    { outline, subject, instruction, format },
    "Could not refine the outline",
  );
}

// ── Lesson plans ──────────────────────────────────────────────────────────

export type LessonPlanResponse = {
  id: number;
  userId: string;
  name: string;
  mainTopic: string;
  topics: {
    topic: string;
    mdxContent: string;
    isSubtopic: boolean;
    parentTopic?: string;
    mainTopic?: string;
  }[];
  coAuthors?: string[];
  authorUsername?: string;
  /** Positional against `coAuthors`; null where that person has no handle. */
  coAuthorUsernames?: (string | null)[];
  isPublic: boolean;
  aiCollaborators?: AiCollaborator[];
  createdAt: string | null;
  updatedAt: string | null;
};

/** Create a new lesson plan, or update it in place when it already has an id. */
export async function saveLessonPlan(lessonPlan: LessonPlan) {
  return lessonPlan.id
    ? json<LessonPlanResponse>(`/lessonPlans/${lessonPlan.id}`, {
        method: "PUT",
        body: lessonPlan,
        failure: "Failed to save lesson plan",
      })
    : json<LessonPlanResponse>("/lessonPlans", {
        method: "POST",
        body: lessonPlan,
        failure: "Failed to save lesson plan",
      });
}

export async function getLessonPlans() {
  return json<{ lessonPlans: LessonPlanResponse[] }>("/lessonPlans", {
    failure: "Failed to get lesson plans",
  });
}

export async function deleteLessonPlan(id: number) {
  await request(`/lessonPlans/${id}`, {
    method: "DELETE",
    failure: "Failed to delete lesson plan",
  });
  return true;
}

export async function getPublicLessonPlans() {
  return json<{ lessonPlans: LessonPlanResponse[] }>("/lessonPlans/public", {
    failure: "Failed to get public lesson plans",
  });
}

/** What the viewer holding a document's link may do with it. */
export type DocumentAccess = "owner" | "co-author" | "reader";

export interface SharedDocument {
  plan: LessonPlanResponse;
  access: DocumentAccess;
}

/**
 * One document as its share link reaches it, whoever is holding the link.
 *
 * The single fetch behind `/projects/:format/:id`. It replaces the two-step
 * dance the reader used — ask for it as yours, and if that 404s ask for it as
 * published — which could not tell "not yours" from "not there", spent two
 * round trips proving a document was private, and left the caller guessing at
 * whether to open the editor or the reader. The server decides, once.
 *
 * Rejects rather than returning an error shape: the caller has three outcomes
 * to distinguish (edit, read, nothing), and folding "no access" into the same
 * union as the other two is what made the old call sites ambiguous.
 */
export async function fetchSharedDocument(id: number): Promise<SharedDocument> {
  return json<SharedDocument>(`/lessonPlans/${id}/shared`, {
    failure: "That document is not available",
  });
}

// ── Users ─────────────────────────────────────────────────────────────────

/** One row of the co-author picker's autocomplete. */
export interface UsernameMatch {
  id: string;
  username: string;
  givenName?: string | null;
}

/** Username autocomplete. Answers with an empty list rather than throwing:
 *  a failed lookup while typing should not surface as an error. */
export async function searchUsername(query: string): Promise<UsernameMatch[]> {
  try {
    const data = await json<{ users: UsernameMatch[] }>("/search/username", {
      query: { q: query },
      failure: "Failed to search users",
    });
    return data.users ?? [];
  } catch {
    return [];
  }
}

// ── People / public profiles ─────────────────────────────────────────────
export interface Person {
  id: string;
  username: string | null;
  givenName: string | null;
  familyName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
}

export interface PublishedDoc {
  id: number;
  name: string;
  mainTopic: string;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Browse profiles. An empty query lists everyone with a username. */
export async function fetchPeople(query = ""): Promise<Person[]> {
  const data = await json<{ people: Person[] }>("/people", {
    query: { q: query },
    failure: "Failed to load people",
  });
  return data.people ?? [];
}

export async function fetchPersonProfile(
  username: string,
): Promise<{ person: Person; published: PublishedDoc[] }> {
  return json<{ person: Person; published: PublishedDoc[] }>(
    `/people/${encodeURIComponent(username)}`,
    { failure: "Profile not found" },
  );
}

/** Full display name, falling back to the handle. */
export function personName(p: Pick<Person, "givenName" | "familyName" | "username">): string {
  const full = [p.givenName, p.familyName].filter(Boolean).join(" ").trim();
  return full || p.username || "Member";
}

// ── Document history ──────────────────────────────────────────────────────

/**
 * How a version came to be: taken on a timer, saved by hand, kept before a
 * large change, a restore of an older one, a merge of another branch, or the
 * page as it was left when the document moved to another branch.
 */
export type VersionKind = "auto" | "manual" | "checkpoint" | "restore" | "merge" | "switch";

/** One version of a document's text, without the text, and where it sits in the history graph. */
export interface DocumentVersion {
  id: number;
  name: string | null;
  kind: VersionKind;
  words: number;
  createdBy: string;
  createdByUsername: string | null;
  createdAt: string | null;
  branchId: number | null;
  /** The version this one was taken on top of. */
  parentId: number | null;
  mergedFromId: number | null;
  restoredFromId: number | null;
  source: "human" | "ai";
}

/** A line of the history. `headVersionId` is its newest version — or, for a fresh fork, the one it started from. */
export interface DocumentBranch {
  id: number;
  name: string;
  headVersionId: number | null;
  createdBy: string;
  createdAt: string | null;
}

export interface VersionGraph {
  versions: DocumentVersion[];
  branches: DocumentBranch[];
  /** The branch the document is on; null before its first version. */
  currentBranchId: number | null;
}

/** A history step that changes the page: what the page says now, and the branch it is on. */
export interface PageChange {
  content: string;
  currentBranchId: number;
  version?: DocumentVersion | null;
  branch?: DocumentBranch | null;
}

export async function listVersions(planId: number): Promise<VersionGraph> {
  return json<VersionGraph>(`/lessonPlans/${planId}/versions`, { failure: "Could not load the history" });
}

export async function getVersion(planId: number, versionId: number): Promise<DocumentVersion & { content: string }> {
  return json(`/lessonPlans/${planId}/versions/${versionId}`, { failure: "Could not load that version" });
}

export interface TakeVersionOptions {
  name?: string;
  source?: "human" | "ai";
  /** The branch this tab believes the document is on; a stale automatic snapshot is dropped. */
  branchId?: number | null;
  mergedFromId?: number;
}

/** Take a snapshot. `version` is null when the server declined one that would add nothing. */
export async function takeVersion(
  planId: number, content: string, kind: "auto" | "manual" | "checkpoint" | "merge", options: TakeVersionOptions = {},
): Promise<{ version: DocumentVersion | null; currentBranchId: number | null }> {
  return json(`/lessonPlans/${planId}/versions`, {
    method: "POST",
    body: { content, kind, name: options.name, source: options.source, branchId: options.branchId ?? undefined, mergedFromId: options.mergedFromId },
    failure: "Could not save a snapshot",
  });
}

export async function renameVersion(planId: number, versionId: number, name: string): Promise<DocumentVersion> {
  return json(`/lessonPlans/${planId}/versions/${versionId}`, {
    method: "PATCH",
    body: { name },
    failure: "Could not rename that version",
  });
}

export async function deleteVersion(planId: number, versionId: number): Promise<void> {
  await request(`/lessonPlans/${planId}/versions/${versionId}`, {
    method: "DELETE",
    failure: "Could not delete that version",
  });
}

/** Bring a version back as a new step on the current branch. `page` is kept first. */
export async function restoreVersion(planId: number, versionId: number, page: string): Promise<PageChange> {
  return json(`/lessonPlans/${planId}/versions/${versionId}/restore`, {
    method: "POST",
    body: { content: page },
    failure: "Could not restore that version",
  });
}

/** Start a branch from a version; with `switchTo`, the document moves onto it (`page` is kept first). */
export async function forkBranch(
  planId: number, fromVersionId: number, name: string, page: string, switchTo = true,
): Promise<PageChange> {
  return json(`/lessonPlans/${planId}/branches`, {
    method: "POST",
    body: { fromVersionId, name, content: page, switch: switchTo },
    failure: "Could not start that branch",
  });
}

/** Move the document onto another branch; `page` is kept on the branch it leaves. */
export async function checkoutBranch(planId: number, branchId: number, page: string): Promise<PageChange> {
  return json(`/lessonPlans/${planId}/branches/${branchId}/checkout`, {
    method: "POST",
    body: { content: page },
    failure: "Could not switch branches",
  });
}

export async function renameBranch(planId: number, branchId: number, name: string): Promise<DocumentBranch> {
  return json(`/lessonPlans/${planId}/branches/${branchId}`, {
    method: "PATCH",
    body: { name },
    failure: "Could not rename that branch",
  });
}

export async function deleteBranch(planId: number, branchId: number): Promise<void> {
  await request(`/lessonPlans/${planId}/branches/${branchId}`, {
    method: "DELETE",
    failure: "Could not delete that branch",
  });
}


// ── AI review ─────────────────────────────────────────────────────────────

export interface ReviewSuggestion {
  /** Exact text from the section — what the replacement replaces. */
  quote: string;
  replacement: string;
  kind: "error" | "clarity" | "grammar" | "consistency" | "markup";
  reason: string;
}

export interface ReviewBody {
  format: DocFormat;
  title?: string;
  section: string;
  text: string;
  outline?: string;
  instructions?: string;
  seen?: string[];
}

/**
 * One section reviewed by one AI collaborator, with *its* credential rather
 * than the default one — each collaborator is its own model.
 */
export async function reviewSection(
  body: ReviewBody,
  credential: { provider: string; model: string; apiKey: string },
  signal?: AbortSignal,
): Promise<ReviewSuggestion[]> {
  const res = await fetch(`${API_BASE}/ai/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AI-Provider": credential.provider,
      "X-AI-Model": credential.model,
      "X-AI-Api-Key": credential.apiKey,
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
    signal,
  });
  await reportingRejections(res, "The review failed");
  return ((await res.json()) as { suggestions?: ReviewSuggestion[] }).suggestions ?? [];
}
