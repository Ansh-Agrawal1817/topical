import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronUp, PanelRightClose, Sparkles } from 'lucide-react';
import { IconButton, Spinner } from '@/components/ui';
import { ProviderMark } from '@/components/ProviderTile';
import { getDefaultCredential, presetFor } from '@/lib/aiCredentials';
import type { DocFormat } from '@/lib/types';
import type { OutlineNode } from '../lib/outline';
import type { SectionWriter } from '../hooks/useSectionWriter';
import { OutlinePanel } from './OutlinePanel';
import { WritePanel } from './WritePanel';
import { RefinePanel } from './RefinePanel';
import { QueuePanel } from './QueuePanel';
import { ContextPanel } from './ContextPanel';
import { isActive, useAiJobs, type AiQueue, type Job } from './queue';
import type { ContextShelf } from './shelf';

export type AiTab = 'outline' | 'write' | 'refine' | 'context';
/** What can be asked to come into view: a tab, or the queue. */
export type AiFocus = AiTab | 'queue';
/** A request to show part of the panel; `section` sends one section to Write. */
export interface AiRequest {
  focus: AiFocus;
  at: number;
  section?: OutlineNode;
}

const TABS: { id: AiTab; label: string; title: string }[] = [
  { id: 'outline', label: 'Outline', title: 'Build or change the structure' },
  { id: 'write', label: 'Write', title: 'Write sections with AI' },
  { id: 'refine', label: 'Refine', title: 'Rewrite, extend or explain the selection' },
  { id: 'context', label: 'Context', title: 'What the model reads when it writes' },
];

const TAB_KEY = 'topical_ai_tab';
function loadTab(): AiTab {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return TABS.some(tab => tab.id === saved) ? (saved as AiTab) : 'refine';
  } catch {
    return 'refine';
  }
}

/** The queue in one line: what is happening right now. */
function queueSummary(jobs: Job[]): { text: string; state: 'idle' | 'busy' | 'failed' } {
  const running = jobs.find(job => job.status === 'running');
  const retrying = jobs.filter(job => job.status === 'retrying');
  const waiting = jobs.filter(job => job.status === 'queued').length;
  const failed = jobs.filter(job => job.status === 'failed').length;
  const more = waiting ? ` · ${waiting} waiting` : '';
  if (running) return { text: `${running.label}${more}`, state: 'busy' };
  if (retrying.length) {
    const next = Math.max(0, Math.ceil(((retrying[0].retryAt ?? Date.now()) - Date.now()) / 1000));
    return { text: `Rate limited — retrying in ${next}s${more}`, state: 'busy' };
  }
  if (failed) return { text: `${failed} failed — open to retry`, state: 'failed' };
  return { text: jobs.length ? 'All done' : 'Idle', state: 'idle' };
}

/**
 * The AI panel: its own column beside the document, apart from the outline.
 *
 * Four tabs, one per job — shape the structure (Outline), turn it into prose
 * (Write), work on the words (Refine), choose what the model reads (Context)
 * — and under all of them the queue: one line saying what is running or
 * waiting to retry, opening into the full list. The model answering is
 * always named at the top.
 *
 * Every tab is built the same way: what the request acts on, then the
 * composer (instruction, suggestions, the action), then what came back.
 */
export function AiPanel({
  queue, shelf, subject, selection, content, format, title, outline, onReplace, onInsertAfter, onApplyOutline,
  focusSignal, request, onClose, compact, writer, wordsOf, onJump,
}: {
  writer: SectionWriter;
  wordsOf: (node: OutlineNode) => number;
  onJump: (node: OutlineNode) => void;
  queue: AiQueue;
  shelf: ContextShelf;
  subject: string;
  selection: { start: number; end: number };
  content: string;
  format: DocFormat;
  title: string;
  outline: OutlineNode[];
  onReplace: (range: { start: number; end: number }, passage: string, text: string) => void;
  onInsertAfter: (at: number, text: string) => void;
  onApplyOutline: (plan: { title: string; level: number }[]) => void;
  /** Bumped by ⌘J, to put the cursor in Refine's instruction field. */
  focusSignal: number;
  /** A tab, the queue, or one section to write, asked to be shown. */
  request?: AiRequest;
  onClose: () => void;
  compact?: boolean;
}) {
  const jobs = useAiJobs(queue);
  const [tab, setTabState] = useState<AiTab>(loadTab);
  const [queueOpen, setQueueOpen] = useState(false);
  const [writeTarget, setWriteTarget] = useState<OutlineNode | null>(null);
  const [writeFocus, setWriteFocus] = useState(0);
  const [, tick] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);

  const setTab = useCallback((next: AiTab) => {
    setTabState(next);
    try { localStorage.setItem(TAB_KEY, next); } catch { /* the tab is a convenience */ }
  }, []);

  useEffect(() => {
    if (!request) return;
    if (request.focus === 'queue') { setQueueOpen(true); return; }
    setTab(request.focus);
    if (request.focus === 'write') {
      setWriteTarget(request.section ?? null);
      if (request.section) setWriteFocus(n => n + 1);
    }
  }, [request, setTab]);

  // The one-line summary counts down while something waits to retry.
  const retrying = jobs.some(job => job.status === 'retrying');
  useEffect(() => {
    if (!retrying) return;
    const id = window.setInterval(() => tick(n => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [retrying]);

  /** Tabs by keyboard: ←/→ move and select, Home/End jump — the tablist pattern. */
  const tabKeys = (event: React.KeyboardEvent) => {
    const at = TABS.findIndex(item => item.id === tab);
    const to = event.key === 'ArrowRight' ? (at + 1) % TABS.length
      : event.key === 'ArrowLeft' ? (at - 1 + TABS.length) % TABS.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? TABS.length - 1
      : -1;
    if (to < 0) return;
    event.preventDefault();
    setTab(TABS[to].id);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[to]?.focus();
  };

  const clearTarget = useCallback(() => setWriteTarget(null), []);
  const openContext = useCallback(() => setTab('context'), [setTab]);
  const openOutline = useCallback(() => setTab('outline'), [setTab]);

  const active = jobs.filter(isActive).length;
  const summary = queueSummary(jobs);
  const credential = getDefaultCredential();
  const contextCount = shelf.urls.length;

  return (
    <aside className="ai-side" data-drawer={compact || undefined} aria-label="AI">
      <header className="side-head">
        <Sparkles className="side-head-icon side-head-icon--accent h-4 w-4" aria-hidden="true" />
        <h2 className="side-head-title">AI</h2>
        {credential ? (
          <Link to="/settings" search={{ section: 'models' }} className="ai-model" title="The model answering — change it in Settings">
            <ProviderMark provider={credential.provider} size="sm" />
            <span className="ai-model-name">{presetFor(credential.provider).name} · {credential.model}</span>
          </Link>
        ) : (
          <Link to="/settings" search={{ section: 'models' }} className="ai-model ai-model--none">Connect a model</Link>
        )}
        <IconButton size="md" onClick={onClose} title="Close the AI panel  ⌘J" aria-label="Close the AI panel">
          <PanelRightClose className="h-4 w-4" />
        </IconButton>
      </header>

      <div className="ai-tabs" role="tablist" aria-label="AI tools" ref={tabsRef} onKeyDown={tabKeys}>
        {TABS.map(item => {
          const selected = item.id === tab;
          const count = item.id === 'context' ? contextCount : item.id === 'write' ? writer.missing : 0;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`ai-tab-${item.id}`}
              aria-controls="ai-tabpanel"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className="ai-tab-btn"
              title={item.title}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {count > 0 && (
                <span className="ai-tab-count" aria-label={item.id === 'context' ? `${count} in use` : `${count} empty`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="ai-body" role="tabpanel" id="ai-tabpanel" aria-labelledby={`ai-tab-${tab}`}>
        {tab === 'outline' && (
          <OutlinePanel format={format} projectName={subject} content={content} nodes={outline} queue={queue} onApplyOutline={onApplyOutline} />
        )}
        {tab === 'write' && (
          <WritePanel
            writer={writer} nodes={outline} wordsOf={wordsOf} contextCount={contextCount}
            onOpenContext={openContext} onOpenOutline={openOutline} onJump={onJump}
            target={writeTarget} onClearTarget={clearTarget} focusSignal={writeFocus}
          />
        )}
        {tab === 'refine' && (
          <RefinePanel
            selection={selection} content={content} format={format} title={title} outline={outline}
            queue={queue} onReplace={onReplace} onInsertAfter={onInsertAfter} focusSignal={focusSignal}
          />
        )}
        {tab === 'context' && <ContextPanel shelf={shelf} subject={subject} />}
      </div>

      <section className="ai-dock" data-open={queueOpen}>
        <button type="button" className="ai-dock-bar" aria-expanded={queueOpen} onClick={() => setQueueOpen(open => !open)}>
          <span className="ai-dock-state" data-state={summary.state} aria-hidden="true">
            {summary.state === 'busy' ? <Spinner size="2xs" tone="accent" /> : <span className="ai-dock-dot" />}
          </span>
          <span className="ai-dock-label">Queue</span>
          {active > 0 && <span className="ai-tab-count">{active}</span>}
          <span className="ai-dock-summary" data-state={summary.state} title={summary.text}>{summary.text}</span>
          <ChevronUp className="ai-dock-chevron h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {queueOpen && <div className="ai-dock-body"><QueuePanel queue={queue} /></div>}
      </section>
    </aside>
  );
}
