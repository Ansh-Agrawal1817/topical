import { useMemo } from 'react';
import { BookMarked, ExternalLink, GitFork, Library, Link2, PanelRightClose, ShieldCheck, Quote } from 'lucide-react';
import { IconButton } from '@/components/ui';
import type { DocFormat } from '@/lib/types';
import { collectReferences, hostOf, type Reference } from '../lib/references';

/**
 * What the Sources panel is for, and is not yet. Listed so the panel says
 * where it is going rather than looking finished.
 */
const COMING = [
  { icon: Quote, title: 'Claims and their sources', text: 'Each claim tied to the passage that supports it; unsupported ones flagged' },
  { icon: GitFork, title: 'Provenance graph', text: 'Where every source came from, back to primary or human material' },
  { icon: ShieldCheck, title: 'Fact-check', text: 'Conflicting evidence surfaced beside the sentence it contradicts' },
  { icon: Library, title: 'Bibliography', text: 'References kept, formatted and exported with the document' },
];

/** A bare link's last path segment, readable: ".../wiki/Dynamic_programming" → "Dynamic programming". */
function pageName(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    const name = last ? decodeURIComponent(last).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_+]+/g, ' ').trim() : '';
    return name ? name[0].toUpperCase() + name.slice(1) : hostOf(url);
  } catch {
    return hostOf(url);
  }
}

const KIND_TITLE: Record<Reference['kind'], string> = { link: 'Links', citation: 'Citations', footnote: 'Footnotes' };

interface Props {
  content: string;
  format: DocFormat;
  /** Put the caret on a mention. */
  onJump: (offset: number) => void;
  onClose: () => void;
  compact?: boolean;
}

/**
 * Sources: what the document cites, as opposed to Context (in the AI panel),
 * which is what the model reads while writing.
 *
 * For now it lists the links, citations and footnotes already in the text,
 * each with where it is used. Claims, provenance and fact-checking come next
 * and are listed as such.
 */
export function SourcesPanel({ content, format, onJump, onClose, compact }: Props) {
  const references = useMemo(() => collectReferences(content, format), [content, format]);
  const groups = (['link', 'citation', 'footnote'] as const)
    .map(kind => ({ kind, items: references.filter(ref => ref.kind === kind) }))
    .filter(group => group.items.length > 0);
  const hosts = new Set(references.filter(ref => ref.kind === 'link').map(ref => hostOf(ref.target))).size;

  return (
    <aside className="ai-side sources-side" data-drawer={compact || undefined} aria-label="Sources">
      <header className="side-head">
        <BookMarked className="side-head-icon h-4 w-4" aria-hidden="true" />
        <h2 className="side-head-title">Sources</h2>
        <span className="side-head-tools">
          <IconButton size="md" onClick={onClose} title="Close sources" aria-label="Close the sources panel">
            <PanelRightClose className="h-4 w-4" />
          </IconButton>
        </span>
      </header>

      <div className="ai-body">
        <div className="ai-tab">
        <div className="ai-stat">
          <div className="ai-stat-row">
            <span><b>{references.length}</b> source{references.length === 1 ? '' : 's'} cited</span>
            {hosts > 0 && <span className="ai-stat-aside">{hosts} site{hosts === 1 ? '' : 's'}</span>}
          </div>
        </div>

        {groups.length === 0 ? (
          <p className="ai-intro">
            Nothing cited yet. {format === 'latex'
              ? <>Links (<code>\href</code>, <code>\url</code>) and citations (<code>\cite</code>) appear here as you add them.</>
              : <>Links and footnotes (<code>[^1]</code>) appear here as you add them.</>}
          </p>
        ) : groups.map(group => (
          <section className="ai-group" key={group.kind} aria-label={KIND_TITLE[group.kind]}>
            <div className="ai-group-head">
              <h3 className="ai-label">{KIND_TITLE[group.kind]}</h3>
              <span className="ai-count">{group.items.length}</span>
            </div>
            <ul className="sources-list">
              {group.items.map(ref => (
                <li key={`${ref.kind}:${ref.target}`} className="sources-item">
                  <button type="button" className="sources-jump" onClick={() => onJump(ref.offsets[0])}
                    title={`Go to where it is ${ref.offsets.length > 1 ? 'first ' : ''}used`}>
                    <span className="ai-context-icon" aria-hidden="true">
                      {ref.kind === 'link' ? <Link2 className="h-3.5 w-3.5" /> : ref.kind === 'citation' ? <BookMarked className="h-3.5 w-3.5" /> : <Quote className="h-3.5 w-3.5" />}
                    </span>
                    <span className="ai-context-text">
                      <span className="ai-context-title">
                        {ref.kind === 'link' ? (ref.label || pageName(ref.target)) : ref.kind === 'footnote' ? `[^${ref.target}]` : ref.target}
                      </span>
                      <span className="ai-context-host">
                        {ref.kind === 'link' ? hostOf(ref.target) : ref.label || (ref.kind === 'citation' ? 'Bibliography key' : '')}
                        {ref.offsets.length > 1 && ` · used ${ref.offsets.length}×`}
                      </span>
                    </span>
                  </button>
                  {ref.kind === 'link' && /^https?:\/\//.test(ref.target) && (
                    <a className="sources-open" href={ref.target} target="_blank" rel="noopener noreferrer"
                      title="Open in a new tab" aria-label={`Open ${hostOf(ref.target)} in a new tab`}>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="ai-group" aria-labelledby="sources-soon">
          <div className="ai-group-head">
            <h3 id="sources-soon" className="ai-label">Coming soon</h3>
          </div>
          <ul className="ai-context-soon">
            {COMING.map(kind => (
              <li key={kind.title}>
                <span className="ai-context-icon" aria-hidden="true"><kind.icon className="h-3.5 w-3.5" /></span>
                <span className="ai-context-text">
                  <span className="ai-context-title">{kind.title}</span>
                  <span className="ai-context-host">{kind.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        </div>
      </div>
    </aside>
  );
}
