import { useEffect, useState } from 'react';
import { History, Sparkles, Wifi, WifiOff } from 'lucide-react';
import { Spinner } from '@/components/ui';
import type { DocFormat } from '@/lib/types';
import type { SaveState } from '../hooks/useDocument';
import type { DocStats } from '../lib/stats';

interface Props {
  /** Whether the writing surface is live, or this is the reading view. */
  editing: boolean;
  saveState: SaveState;
  lastSavedAt: number | null;
  stats: DocStats;
  line: number;
  column: number;
  selectedWords: number;
  connected: boolean;
  peerCount: number;
  format: DocFormat;
  /** Open the version history. Absent where there is none to show (reading). */
  onHistory?: () => void;
  /** Open AI suggestions waiting, and whether a reviewer is reading right now. */
  suggestions?: number;
  reviewing?: boolean;
  onSuggestions?: () => void;
}

/*
 * Autosave runs a moment after every pause, so "unsaved" is a state that
 * lasts about a second. Announcing it as "Unsaved changes" made the bar
 * flicker between alarms all session; it is the save in progress, and says so.
 */
function savedLabel(state: SaveState, at: number | null, now: number): string {
  if (state === 'saving' || state === 'dirty') return 'Saving…';
  if (state === 'error') return 'Couldn’t save — retrying';
  if (!at) return 'All changes saved';
  const seconds = Math.round((now - at) / 1000);
  if (seconds < 45) return 'Saved just now';
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `Saved ${minutes} min ago` : 'Saved over an hour ago';
}

/** Re-render every so often, so "Saved 3 min ago" does not stay "just now" forever. */
function useMinuteClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/** Ambient feedback while writing: length, position, save and session state. */
export function StatusBar({
  editing, saveState, lastSavedAt, stats, line, column, selectedWords, connected, peerCount, format, onHistory, suggestions = 0, reviewing, onSuggestions,
}: Props) {
  const now = useMinuteClock(editing && saveState === 'saved' && lastSavedAt !== null);
  return (
    // A `contentinfo` landmark, so the bar is reachable by landmark navigation
    // rather than only by tabbing past the whole document.
    <div className="editor-status" role="contentinfo" aria-label="Document status">
      {/* Only the save state is announced. The rest changes on every keystroke,
          and a live region that reads the column number aloud as you type is
          unusable — those are marked aria-hidden and remain readable on screen. */}
      {/* Nothing is being saved while reading, and nothing is unsaved — a
          bar that says "all changes saved" to someone who cannot make changes
          is reporting on a thing that is not happening. */}
      {/* The save state is also the way into the history: "saved 3 min ago"
          is the question history answers the long form of. */}
      {editing && (
        <button type="button" className="editor-status-item editor-status-button" onClick={onHistory}
          disabled={!onHistory} title="Version history — see, name and restore snapshots" aria-label="Open version history">
          <span className="editor-status-dot" data-state={saveState} aria-hidden="true" />
          <span role="status" aria-live="polite" data-state={saveState}>{savedLabel(saveState, lastSavedAt, now)}</span>
          <History className="h-3 w-3 opacity-70" aria-hidden="true" />
        </button>
      )}
      {/* `--aux` marks the readings that are nice to have rather than needed.
          A narrow window drops them (see editor.css) so the two that matter —
          whether the work is saved, and whether the session is live — are not
          pushed off the end of the bar by a character count. */}
      {/* A caret position, with no caret. */}
      {editing && (
        <span className="editor-status-item editor-status-item--aux" aria-hidden="true">Ln {line}, Col {column}</span>
      )}
      <span className="editor-status-item" aria-hidden="true">
        {selectedWords > 0
          ? `${selectedWords.toLocaleString()} of ${stats.words.toLocaleString()} words`
          : `${stats.words.toLocaleString()} words`}
      </span>
      <span className="editor-status-item editor-status-item--aux" aria-hidden="true">{stats.chars.toLocaleString()} characters</span>
      <span className="editor-status-item editor-status-item--aux" aria-hidden="true">{stats.readMinutes} min read</span>

      {/* The AI collaborators: whether one is reading, and what they suggest. */}
      {editing && onSuggestions && (
        <button type="button" className="editor-status-item editor-status-button ml-auto" onClick={onSuggestions}
          data-count={suggestions || undefined}
          title={suggestions ? 'Open the AI suggestions' : 'AI collaborators are watching — nothing to change'}>
          {reviewing ? <Spinner size="2xs" tone="accent" /> : <Sparkles className="h-3 w-3" aria-hidden="true" />}
          {suggestions ? `${suggestions} suggestion${suggestions === 1 ? '' : 's'}` : reviewing ? 'Reviewing…' : 'No suggestions'}
        </button>
      )}

      {/* Reading does not join the collaboration session at all, so there is
          no connection to report on. */}
      {editing && (
        <span className={`editor-status-item${onSuggestions ? '' : ' ml-auto'}`}>
          {connected
            ? <><Wifi className="h-3 w-3" style={{ color: 'var(--status-success)' }} />
                {peerCount > 0 ? `${peerCount + 1} editing` : 'Live'}</>
            : <><WifiOff className="h-3 w-3 opacity-50" /> Offline</>}
        </span>
      )}
      <span className={`editor-status-item uppercase tracking-wider${editing ? '' : ' ml-auto'}`} style={{ fontSize: 10 }}>{format}</span>
    </div>
  );
}
