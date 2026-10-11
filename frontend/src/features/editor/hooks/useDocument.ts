import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { saveLessonPlan, type LessonPlanResponse } from '@/lib/api';
import { documentContent } from '@/lib/documents';
import { formatOf, LATEX_PREFIX, type DocFormat, type LessonPlan } from '@/lib/types';
import { useYjsCollab } from '@/hooks/useYjsCollab';

/**
 * Autosave waits for a pause in the typing, and never longer than the cap.
 *
 * It used to be a fixed 15-second interval, so closing the tab (or pressing
 * Back) up to fifteen seconds after the last keystroke dropped that work —
 * and the status bar said "Unsaved changes" for most of every session. A
 * pause is the natural moment to save; the cap keeps a writer who never
 * pauses from going unsaved indefinitely.
 */
const AUTOSAVE_IDLE_MS = 1_200;
const AUTOSAVE_MAX_WAIT_MS = 10_000;
/** After a failed save, try again on this schedule rather than waiting for the next edit. */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export interface DocumentModel {
  projectId?: number;
  name: string;
  setName: (name: string) => void;
  format: DocFormat;
  content: string;
  /** Local edit — pushes to collaborators and marks the document dirty. */
  setContent: (value: string) => void;
  saveState: SaveState;
  lastSavedAt: number | null;
  save: (silent?: boolean) => Promise<void>;
  authorUsername: string | null;
  coAuthors: string[];
  coAuthorUsernames: (string | null)[];
  setCoAuthors: (ids: string[], usernames: (string | null)[]) => void;
  /** Whether the document is on the community library. */
  isPublic: boolean;
  /** Live collaboration. */
  peers: ReturnType<typeof useYjsCollab>['peers'];
  connected: boolean;
  updateCursor: (index: number, length: number) => void;
  isRemoteUpdate: React.MutableRefObject<boolean>;
  /** Register the surface that collaborators' changes are applied to directly. */
  bindSurface: (receive: ((text: string) => void) | null) => void;
}

/**
 * Everything about the document as a stored, shared thing: holding it,
 * saving it, autosaving it, and keeping it in sync with other editors.
 *
 * The editor screen deals with text and selection; this deals with the fact
 * that the text belongs to somebody and lives on a server.
 *
 * The document arrives already fetched. The route has to load it anyway — it
 * cannot know whether to show the reader or the editor until the server has
 * said what this viewer may do with it — so fetching again in here meant the
 * same document over the wire twice and a second spinner after the first had
 * cleared. It is also never null: a document is created before it is opened,
 * so there is no "unsaved, id-less document" state for anything downstream to
 * carry a branch for.
 */
export function useDocument(
  currentUsername: string,
  plan: LessonPlanResponse,
  /**
   * Whether the writing surface is live.
   *
   * Gates the collaboration session. A reader has nothing to send — there is
   * no textarea for them to type into — but joining the room would still put
   * them in everyone else's peer list and stream them the writers' cursors,
   * and on a published document that is a stranger appearing in the owner's
   * editor. Reading is not participating.
   */
  editing: boolean,
): DocumentModel {
  const [projectId, setProjectId] = useState<number | undefined>(plan.id);
  const [name, setName] = useState(plan.name);
  const [format] = useState<DocFormat>(formatOf(plan.mainTopic));
  const [content, setContentRaw] = useState(() => documentContent(plan.topics));
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [authorUsername] = useState<string | null>(plan.authorUsername ?? null);
  const [coAuthors, setCoAuthorIds] = useState<string[]>(plan.coAuthors ?? []);
  const [coAuthorUsernames, setCoAuthorUsernames] = useState<(string | null)[]>(
    plan.coAuthorUsernames ?? [],
  );
  /**
   * Whether the document is published, carried so every save can say so.
   *
   * It was never held here at all, so the editor's payload never contained
   * the field — and the API writes every column it is handed, defaulting a
   * missing `isPublic` to false. Publishing a document and then typing one
   * character silently withdrew it from the community library, as did adding
   * a co-author. The server no longer clears an omitted flag, but the editor
   * should still be able to state the truth rather than rely on that.
   */
  const [isPublic] = useState(!!plan.isPublic);

  /**
   * Where a collaborator's change lands first: the writing surface itself,
   * synchronously, before React hears about it. Through React state alone
   * there was a gap between Yjs having the change and the editor showing it,
   * and a keystroke typed in that gap was diffed against the old text — which
   * read the collaborator's insertion as something to delete.
   */
  const surface = useRef<((text: string) => void) | null>(null);
  const bindSurface = useCallback((receive: ((text: string) => void) | null) => { surface.current = receive; }, []);

  const { peers, connected, initContent, applyLocalChange, updateCursor, isRemoteUpdate } =
    useYjsCollab(
      editing && projectId ? String(projectId) : undefined,
      currentUsername,
      remote => {
        surface.current?.(remote);
        setContentRaw(remote);
      },
    );

  /**
   * Bumped by every local change. A save remembers the revision it sent, and
   * only marks the document clean if nothing has changed since — typing while
   * a save was in flight used to be marked saved when it was not, and stayed
   * unsaved until the writer happened to type again.
   */
  const revision = useRef(0);
  const markDirty = useCallback(() => {
    revision.current += 1;
    setIsDirty(true);
  }, []);

  const setContent = useCallback((value: string) => {
    setContentRaw(value);
    markDirty();
    // Only push to Yjs for local edits, or a remote change echoes back.
    if (!isRemoteUpdate.current) applyLocalChange(value);
  }, [applyLocalChange, isRemoteUpdate, markDirty]);

  // ── Adopt ───────────────────────────────────────────────────────────────
  /*
   * The document arrives already fetched, so every field above is seeded from
   * it at first render rather than being filled in by an effect afterwards.
   * What is left for an effect is the one thing that cannot happen during
   * render: seeding the shared Yjs document for collaborators.
   *
   * Keyed on the id so that opening a second document — which the router does
   * by remounting this route — starts its own handshake, and so that a re-render
   * for any other reason does not re-seed and clobber a peer's edits.
   */
  useEffect(() => {
    if (!editing) return;
    const combined = documentContent(plan.topics);
    // Ignored if a peer already populated it.
    const timer = setTimeout(() => initContent(combined), 500);
    return () => clearTimeout(timer);
    // `initContent` is recreated on every collaboration state change; keying
    // this on the document id is what actually matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id, editing]);

  // ── Save ────────────────────────────────────────────────────────────────
  const planFor = useCallback((overrides: Partial<LessonPlan> = {}): LessonPlan => {
    const mainTopic = format === 'latex' ? `${LATEX_PREFIX}${name}` : name;
    return {
      id: projectId,
      name,
      mainTopic,
      topics: [{ topic: name, mdxContent: content, isSubtopic: false, parentTopic: name, mainTopic }],
      coAuthors,
      isPublic,
      ...overrides,
    };
  }, [coAuthors, content, format, isPublic, name, projectId]);

  /** The newest payload, for saves that fire from timers and teardown. */
  const latestPlan = useRef(planFor);
  latestPlan.current = planFor;

  const savingRef = useRef(false);
  /** A save was asked for while one was in flight; it runs when that one lands. */
  const queuedRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const failures = useRef(0);

  const save = useCallback(async (silent = false): Promise<void> => {
    // One request at a time — but a save asked for mid-flight is owed, not
    // dropped: ⌘S during an autosave used to do nothing at all.
    if (savingRef.current) { queuedRef.current = true; return; }
    savingRef.current = true;
    setIsSaving(true);
    const sent = revision.current;
    try {
      const result = await saveLessonPlan(latestPlan.current());
      setProjectId(result.id);
      if (revision.current === sent) setIsDirty(false);
      setLastSavedAt(Date.now());
      setFailed(false);
      failures.current = 0;
    } catch (error) {
      setFailed(true);
      failures.current += 1;
      if (!silent) toast.error(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
    if (queuedRef.current) {
      queuedRef.current = false;
      await save(true);
    }
  }, []);

  // ── Autosave ────────────────────────────────────────────────────────────
  const dirtySince = useRef<number | null>(null);
  useEffect(() => {
    if (!isDirty) { dirtySince.current = null; return; }
    dirtySince.current ??= Date.now();
    if (!editing || !projectId) return;
    // A failed save retries on its own schedule; an edit does not hurry it.
    const delay = failed
      ? RETRY_DELAYS_MS[Math.min(failures.current - 1, RETRY_DELAYS_MS.length - 1)]
      : Math.max(0, Math.min(AUTOSAVE_IDLE_MS, AUTOSAVE_MAX_WAIT_MS - (Date.now() - dirtySince.current)));
    const timer = window.setTimeout(() => { void save(true); }, delay);
    return () => window.clearTimeout(timer);
  }, [content, name, isDirty, editing, projectId, failed, save]);

  /*
   * Leaving with work unsaved. The browser asks before the tab closes, and
   * leaving the screen in-app (Back, a link) sends whatever is pending on the
   * way out instead of dropping it.
   */
  const unsaved = useRef(false);
  unsaved.current = isDirty || isSaving;
  useEffect(() => {
    if (!editing) return;
    const onUnload = (event: BeforeUnloadEvent) => {
      if (!unsaved.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const onHide = () => { if (document.visibilityState === 'hidden' && unsaved.current) void save(true); };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onHide);
      if (unsaved.current && !savingRef.current) void save(true);
    };
  }, [editing, save]);

  // ── Co-authors ──────────────────────────────────────────────────────────
  const setCoAuthors = useCallback((ids: string[], usernames: (string | null)[]) => {
    setCoAuthorIds(ids);
    setCoAuthorUsernames(usernames);
    // Persist immediately: waiting for autosave means a collaborator who was
    // just added can't open the document yet.
    saveLessonPlan(planFor({ coAuthors: ids }))
      .then(() => setLastSavedAt(Date.now()))
      .catch(() => toast.error('Failed to save co-author changes'));
  }, [planFor]);

  return {
    projectId,
    name,
    setName: (next: string) => { setName(next); markDirty(); },
    format,
    content,
    setContent,
    saveState: isSaving ? 'saving' : failed && isDirty ? 'error' : isDirty ? 'dirty' : 'saved',
    lastSavedAt,
    save,
    authorUsername,
    coAuthors,
    coAuthorUsernames,
    setCoAuthors,
    isPublic,
    peers,
    connected,
    updateCursor,
    isRemoteUpdate,
    bindSurface,
  };
}
