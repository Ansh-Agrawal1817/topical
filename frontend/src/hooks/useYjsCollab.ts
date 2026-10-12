/**
 * React hook for Yjs collaborative editing over WebSocket.
 * Manages a Y.Doc, raw WebSocket connection, and cursor awareness.
 *
 * Cursor positions use Y.RelativePosition so they automatically adjust
 * when text is inserted/deleted around them by other peers.
 *
 * **The room seeds the text, never this hook on its own.** Two copies of a
 * Yjs text started independently merge into the text twice. This used to seed
 * its own copy after a fixed 500 ms when the server had not answered yet — on
 * a slow handshake (a reload, Read → Live, a second tab) two copies were
 * seeded, and replacing the document in one left the other copy's text glued
 * to the end. Now the room says whether it has text (`MSG_ROOM`); only an
 * unseeded room is offered the editor's text (`MSG_SEED`), and it takes the
 * first offer only. Until the room's text has arrived, local edits stay in the
 * editor and are reconciled once — see `reconcile`.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
/** Server → client: `{epoch, seeded}` — which room this is, and whether it has text. */
const MSG_ROOM = 100;
/** Client → server: the text to start an unseeded room with. */
const MSG_SEED = 101;

export interface AwarenessCursor {
  clientId: number;
  user: { name: string; color: string };
  cursor?: { index: number; length: number };
}

// Literal hex only. These are interpolated into 8-digit hex for the cursor's
// glow (`${color}50`), so a `var(--…)` entry here produced `var(--x)50` —
// invalid CSS, silently dropping the shadow for whoever drew that colour.
const COLORS = [
  '#f472b6', '#fb923c', '#a78bfa', '#34d399', '#4a6fa5',
  '#fbbf24', '#e879f9', '#22d3ee', '#fb7185', '#a3e635',
];

function pickColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

/**
 * Convert an absolute index in Y.Text to a JSON-serializable relative position.
 * Relative positions survive insertions/deletions at other positions.
 */
function indexToRelPos(ytext: Y.Text, index: number): object | null {
  try {
    const relPos = Y.createRelativePositionFromTypeIndex(ytext, index);
    return Y.relativePositionToJSON(relPos);
  } catch {
    return null;
  }
}

/**
 * Convert a JSON-serialized relative position back to an absolute index.
 * Returns -1 if the position can't be resolved.
 */
function relPosToIndex(ydoc: Y.Doc, relPosJson: object): number {
  try {
    const relPos = Y.createRelativePositionFromJSON(relPosJson);
    const absPos = Y.createAbsolutePositionFromRelativePosition(relPos, ydoc);
    return absPos ? absPos.index : -1;
  } catch {
    return -1;
  }
}

/**
 * One lineage of the shared text: a Y.Doc and the awareness bound to it.
 *
 * Replaced whole when the room turns out to be a different room (its epoch
 * changed while we were away): its history is not the new room's history, and
 * merging the two is how a document ends up in twice.
 */
interface Session {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  /** The room's epoch, once announced. */
  epoch: string | null;
  /** Whether the room has text to give. */
  seeded: boolean;
  /** Whether the room's full state (sync step 2) has arrived. */
  gotState: boolean;
  /** Both of the above, and reconciled with the editor: local edits flow from here on. */
  synced: boolean;
  dispose: () => void;
}

/** The smallest single-range edit that turns `from` into `to`. */
function spanDiff(from: string, to: string) {
  let start = 0;
  while (start < from.length && start < to.length && from[start] === to[start]) start++;
  let endFrom = from.length;
  let endTo = to.length;
  while (endFrom > start && endTo > start && from[endFrom - 1] === to[endTo - 1]) { endFrom--; endTo--; }
  return { start, endFrom, endTo };
}

/** How much text either side of an edit identifies where it goes. */
const REBASE_CONTEXT = 48;

/**
 * Carry an edit made to `base` (giving `local`) over to `remote`, which moved on
 * from `base` independently. Only a single-range edit whose surroundings are
 * still in `remote`, exactly once, is carried; anything else returns null.
 */
export function rebaseEdit(base: string, local: string, remote: string): string | null {
  const { start, endFrom, endTo } = spanDiff(base, local);
  const before = base.slice(Math.max(0, start - REBASE_CONTEXT), start);
  const old = base.slice(start, endFrom);
  const after = base.slice(endFrom, endFrom + REBASE_CONTEXT);
  const needle = before + old + after;
  if (!needle) return local;
  const at = remote.indexOf(needle);
  if (at < 0 || remote.indexOf(needle, at + 1) >= 0) return null;
  const from = at + before.length;
  return remote.slice(0, from) + local.slice(start, endTo) + remote.slice(from + old.length);
}

interface Options {
  /** The editor's text right now — what is offered to an unseeded room, and reconciled. */
  readLocal: () => string;
}

export function useYjsCollab(
  docId: string | undefined,
  username: string,
  onRemoteContentChange: (text: string) => void,
  { readLocal }: Options,
) {
  const sessionRef = useRef<Session | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [peers, setPeers] = useState<AwarenessCursor[]>([]);
  const [connected, setConnected] = useState(false);
  const isRemoteUpdate = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanedUp = useRef(false);
  const peersKey = useRef('[]');
  // The newest receivers, read by handlers registered once per session.
  const onRemote = useRef(onRemoteContentChange);
  onRemote.current = onRemoteContentChange;
  const readLocalRef = useRef(readLocal);
  readLocalRef.current = readLocal;

  /** Write `next` into the session's text as the smallest edit. */
  const pushText = useCallback((session: Session, next: string) => {
    const ytext = session.doc.getText('content');
    const current = ytext.toString();
    if (current === next) return;
    const { start, endFrom, endTo } = spanDiff(current, next);
    session.doc.transact(() => {
      if (endFrom > start) ytext.delete(start, endFrom - start);
      if (endTo > start) ytext.insert(start, next.substring(start, endTo));
    });
  }, []);

  /** Hand text to the editor as a collaborator's change: shown, not echoed back. */
  const deliver = useCallback((text: string) => {
    isRemoteUpdate.current = true;
    try {
      onRemote.current(text);
    } finally {
      isRemoteUpdate.current = false;
    }
  }, []);

  // Apply local edits to Yjs with minimal diff — only once the room's text is
  // here. Before that the edit stays in the editor and `reconcile` carries it.
  const applyLocalChange = useCallback((newText: string) => {
    const session = sessionRef.current;
    if (!session?.synced || isRemoteUpdate.current) return;
    pushText(session, newText);
  }, [pushText]);

  // Update cursor position in awareness using Y.RelativePosition.
  // Relative positions automatically adjust when text is inserted/deleted
  // around them, so a peer's cursor moves correctly when others type nearby.
  const updateCursor = useCallback((index: number, length: number = 0) => {
    const session = sessionRef.current;
    if (!session?.synced) return;
    if (isRemoteUpdate.current) return;

    const ytext = session.doc.getText('content');
    const anchor = indexToRelPos(ytext, index);
    const head = length > 0 ? indexToRelPos(ytext, index + length) : anchor;

    if (anchor) {
      session.awareness.setLocalStateField('cursor', {
        anchor,
        head,
      });
    }
  }, []);

  // Resolve peer relative cursor positions to absolute indices.
  // Called whenever awareness state or document content changes.
  const resolvePeerCursors = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const { doc: ydoc, awareness } = session;

    const states = Array.from(awareness.getStates().entries());
    const peerList: AwarenessCursor[] = states
      .filter(([id]) => id !== ydoc.clientID)
      .filter(([_, state]) => state.user)
      .map(([id, state]) => {
        let cursor: { index: number; length: number } | undefined;

        if (session.synced && state.cursor?.anchor) {
          const anchorIdx = relPosToIndex(ydoc, state.cursor.anchor);
          const headIdx = state.cursor.head ? relPosToIndex(ydoc, state.cursor.head) : anchorIdx;

          if (anchorIdx >= 0) {
            cursor = {
              index: anchorIdx,
              length: Math.max(0, (headIdx >= 0 ? headIdx : anchorIdx) - anchorIdx),
            };
          }
        }

        return {
          clientId: id,
          user: state.user,
          cursor,
        };
      });

    // Awareness fires on every heartbeat; an unchanged list must not
    // re-render the editor and re-dispatch every caret into it.
    const key = JSON.stringify(peerList);
    if (key === peersKey.current) return;
    peersKey.current = key;
    setPeers(peerList);
  }, []);

  useEffect(() => {
    if (!docId) return;
    cleanedUp.current = false;
    /** The page as it was when joining began — so an edit made while waiting can be told apart. */
    const base = readLocalRef.current();

    let currentWs: WebSocket | null = null;
    /** Whether a room has been joined before in this mount — a later, different room is a rejoin. */
    let joinedBefore = false;

    const send = (bytes: Uint8Array) => {
      if (currentWs?.readyState === WebSocket.OPEN) currentWs.send(bytes);
    };
    const sendAwareness = (session: Session) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(session.awareness, [session.doc.clientID]),
      );
      send(encoding.toUint8Array(encoder));
    };

    /** A fresh lineage: a new Y.Doc and awareness, with every handler bound to them. */
    const createSession = (): Session => {
      const ydoc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(ydoc);
      awareness.setLocalStateField('user', {
        name: username,
        color: pickColor(username),
      });

      const session: Session = {
        doc: ydoc, awareness, epoch: null, seeded: false, gotState: false, synced: false,
        dispose: () => {},
      };

      // Listen for Y.Text changes → push to React state + re-resolve cursors
      const ytext = ydoc.getText('content');
      ytext.observe((_event, transaction) => {
        // Before the room's text is reconciled with the editor, what arrives is
        // not yet something to show — `reconcile` decides what the page holds.
        if (!session.synced) return;
        if (transaction.origin === 'ws') {
          // Applied synchronously, and the flag held only for exactly as long.
          // It used to stay up for 100ms on a timer, and every local keystroke in
          // that window was kept out of Yjs — so while a co-author typed, your
          // own characters were not sent, and their next change arrived without
          // them and erased them from your screen. The receiver puts the text
          // straight into the editor, so there is no window left to guard.
          deliver(ytext.toString());
          // Re-resolve all peer cursor positions against the new document state.
          // This is what makes cursors "move" when text is inserted before them.
          resolvePeerCursors();
        } else if (awareness.getStates().size > 1) {
          // A local edit: the screen already has this text. Only collaborators'
          // carets need moving, and only if there are any.
          resolvePeerCursors();
        }
      });

      const onAwarenessChange = () => resolvePeerCursors();
      awareness.on('change', onAwarenessChange);

      // Send Y.Doc updates over WS
      const updateHandler = (update: Uint8Array, origin: unknown) => {
        if (origin === 'ws') return;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        syncProtocol.writeUpdate(encoder, update);
        send(encoding.toUint8Array(encoder));
      };
      ydoc.on('update', updateHandler);

      // Send awareness updates over WS whenever local state changes
      const awarenessUpdateHandler = (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      ) => {
        const changedClients = added.concat(updated, removed);
        if (changedClients.length === 0) return;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
        );
        send(encoding.toUint8Array(encoder));
      };
      awareness.on('update', awarenessUpdateHandler);

      session.dispose = () => {
        ydoc.off('update', updateHandler);
        awareness.off('update', awarenessUpdateHandler);
        awareness.off('change', onAwarenessChange);
        awareness.setLocalState(null);
        awareness.destroy();
        ydoc.destroy();
      };
      return session;
    };

    /**
     * Settle what the page holds once the room's text is here.
     *
     * Joining: the room is the truth, unless this editor was typed into while
     * it waited — then that edit is carried onto the room's text. Rejoining a
     * room that was recreated (a server restart, or dropped while we were
     * away): this editor's text is the newest anyone has, so it is written in.
     * An empty room never wins over a page that has text.
     */
    const reconcile = (session: Session, rejoin: boolean) => {
      const remote = session.doc.getText('content').toString();
      const mine = readLocalRef.current();
      if (remote === mine) return;
      if (rejoin || !remote) { pushText(session, mine); return; }
      if (mine === base) { deliver(remote); return; }
      if (remote === base) { pushText(session, mine); return; }
      const merged = rebaseEdit(base, mine, remote);
      if (merged === null) {
        console.warn('Collaboration: an edit made while connecting could not be carried over.');
        deliver(remote);
        return;
      }
      pushText(session, merged);
      deliver(merged);
    };

    const maybeSynced = (session: Session, rejoin: boolean) => {
      if (session.synced || !session.gotState || !session.seeded) return;
      session.synced = true;
      reconcile(session, rejoin);
      resolvePeerCursors();
    };

    sessionRef.current = createSession();
    let rejoin = false;

    // WebSocket connection logic
    let failures = 0;
    function connect() {
      if (cleanedUp.current) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/doc/${docId}`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;
      currentWs = ws;

      ws.onopen = () => {
        failures = 0;
        setConnected(true);
        if (sessionRef.current) sendAwareness(sessionRef.current);
      };

      ws.onmessage = (event: MessageEvent) => {
        let session = sessionRef.current;
        if (!session) return;
        const data = new Uint8Array(event.data);
        const decoder = decoding.createDecoder(data);
        const messageType = decoding.readVarUint(decoder);

        switch (messageType) {
          case MSG_ROOM: {
            const room = JSON.parse(decoding.readVarString(decoder)) as { epoch: string; seeded: boolean };
            if (session.epoch !== null && session.epoch !== room.epoch) {
              // A different room: our history belongs to the old one.
              session.dispose();
              session = createSession();
              sessionRef.current = session;
              peersKey.current = '[]';
              setPeers([]);
              sendAwareness(session);
            }
            if (session.epoch !== room.epoch) {
              rejoin = joinedBefore;
              joinedBefore = true;
            }
            session.epoch = room.epoch;
            session.seeded = room.seeded;
            if (!room.seeded) {
              const encoder = encoding.createEncoder();
              encoding.writeVarUint(encoder, MSG_SEED);
              encoding.writeVarString(encoder, readLocalRef.current());
              ws.send(encoding.toUint8Array(encoder));
            }
            maybeSynced(session, rejoin);
            break;
          }
          case MSG_SYNC: {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MSG_SYNC);
            const kind = syncProtocol.readSyncMessage(decoder, encoder, session.doc, 'ws');
            if (encoding.length(encoder) > 1) {
              ws.send(encoding.toUint8Array(encoder));
            }
            if (kind === syncProtocol.messageYjsSyncStep2) {
              session.gotState = true;
              maybeSynced(session, rejoin);
            }
            break;
          }
          case MSG_AWARENESS: {
            const update = decoding.readVarUint8Array(decoder);
            awarenessProtocol.applyAwarenessUpdate(session.awareness, update, ws);
            break;
          }
        }
      };

      ws.onclose = () => {
        setConnected(false);
        currentWs = null;
        if (!cleanedUp.current) {
          // Backing off: a socket the server refuses (access removed while the
          // document was open) fails its handshake exactly like a dropped
          // network, and a flat 2s retry hammered it for as long as the tab
          // stayed open. 2s, 4s, 8s … capped at 30s; reset by a good open.
          const delay = Math.min(30_000, 2000 * 2 ** failures);
          failures += 1;
          reconnectTimer.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => { ws.close(); };
    }

    connect();

    return () => {
      cleanedUp.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      currentWs = null;

      sessionRef.current?.dispose();
      sessionRef.current = null;
      peersKey.current = '[]';
      setPeers([]);
    };
  }, [docId, username, resolvePeerCursors, pushText, deliver]);

  return { peers, connected, applyLocalChange, updateCursor, isRemoteUpdate };
}
