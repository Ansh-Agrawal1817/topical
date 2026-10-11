import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Globe, Link2, Paperclip, Search, StickyNote, X } from 'lucide-react';
import { Button, IconButton, Input, Switch } from '@/components/ui';
import { findSources } from '@/lib/api';
import { errorMessage } from '@/lib/utils';
import { hostOf, MAX_SHELF, normaliseUrl, type ContextShelf } from './shelf';

/**
 * What the model reads, as one line in a composer's footer: "2 pages", or
 * "No context". A click opens the Context tab.
 *
 * It sits next to the button it qualifies. Grounding used to be a sentence
 * with an underlined "Add" floating at its far end, which read as a note
 * about the panel rather than as part of the request being made.
 */
export function ContextPill({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="ai-context-pill"
      data-empty={!count || undefined}
      onClick={onOpen}
      title={count ? 'What the model reads — open Context' : "Nothing in Context: the model writes from its own knowledge. Add pages in Context."}
    >
      <Paperclip className="h-3 w-3" aria-hidden="true" />
      {count ? `${count} page${count === 1 ? '' : 's'}` : 'No context'}
    </button>
  );
}

/** Kinds of context that are planned, shown so the tab's shape is visible before it is complete. */
const COMING = [
  { icon: FileText, title: 'Documents', text: 'Your other Topical documents' },
  { icon: Paperclip, title: 'Files', text: 'PDFs and uploads' },
  { icon: StickyNote, title: 'Notes', text: 'Facts and instructions to keep in mind' },
];

/**
 * Context: what AI writing is grounded in.
 *
 * Today that is web pages. Each section written while a page is switched on
 * reads the passages of it that are about that section — not the whole page —
 * so a handful of broad pages can sit here without every request becoming
 * enormous. Documents, files and notes are coming, and are listed as such.
 */
export function ContextPanel({ shelf, subject }: { shelf: ContextShelf; subject: string }) {
  const [url, setUrl] = useState('');
  const [finding, setFinding] = useState(false);
  const full = shelf.items.length >= MAX_SHELF;
  const query = subject.trim();

  const addUrl = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = normaliseUrl(url);
    if (!clean) { toast.error('That does not look like a web address.'); return; }
    if (!shelf.add([{ url: clean }])) toast.info(full ? `Context holds up to ${MAX_SHELF} pages.` : 'That page is already in Context.');
    setUrl('');
  };

  const findTop = async () => {
    if (!query) { toast.info('Give the document a title first — the search uses it.'); return; }
    setFinding(true);
    try {
      const found = await findSources(query, 5);
      const added = shelf.add(found.map(hit => ({ url: hit.url, title: hit.title })));
      toast.success(added ? `Added ${added} page${added === 1 ? '' : 's'} about “${query}”` : 'Those pages are already in Context.');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not search the web'));
    } finally {
      setFinding(false);
    }
  };

  return (
    <div className="ai-tab">
      <p className="ai-intro">
        What the model reads before it writes. Each section is given only the passages that are about it.
      </p>

      <section className="ai-group" aria-labelledby="ai-context-web">
        <div className="ai-group-head">
          <h3 id="ai-context-web" className="ai-label">Web pages</h3>
          <span className="ai-count">{shelf.items.length}/{MAX_SHELF}</span>
        </div>

        {shelf.items.length > 0 ? (
          <ul className="ai-context-list">
            {shelf.items.map(item => (
              <li key={item.id} className="ai-context-item" data-on={item.on}>
                {/* A plain mark, not a fetched favicon: asking a third party
                    for each site's icon would tell it what is in Context. */}
                <span className="ai-context-icon" aria-hidden="true"><Globe className="h-3.5 w-3.5" /></span>
                <a className="ai-context-text" href={item.url} target="_blank" rel="noreferrer" title={item.url}>
                  <span className="ai-context-title">{item.title}</span>
                  <span className="ai-context-host">{hostOf(item.url)}</span>
                </a>
                <Switch
                  checked={item.on}
                  onCheckedChange={() => shelf.toggle(item.id)}
                  aria-label={item.on ? `Stop reading ${item.title}` : `Read ${item.title}`}
                  title={item.on ? 'Read when writing' : 'Kept, but not read'}
                  className="switch--sm"
                />
                <IconButton size="sm" tone="danger" className="ai-context-remove" onClick={() => shelf.remove(item.id)}
                  aria-label={`Remove ${item.title}`} title="Remove">
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ai-context-empty">
            No pages yet — sections are written from the model's own knowledge.
          </div>
        )}

        <form className="ai-context-add" onSubmit={addUrl}>
          <Input size="sm" aria-label="Add a web page" placeholder="Paste a link" value={url}
            onChange={event => setUrl(event.target.value)} leading={<Link2 className="h-3.5 w-3.5" />} disabled={full} />
          <Button type="submit" variant="secondary" size="sm" disabled={!url.trim() || full}>Add</Button>
        </form>

        <Button variant="ghost" size="sm" className="ai-context-find" onClick={findTop} loading={finding}
          disabled={finding || full} title="Search the web and add the five most relevant pages">
          {!finding && <Search className="h-3.5 w-3.5" aria-hidden="true" />}
          <span className="truncate">{finding ? 'Searching the web…' : `Find pages about “${query || 'this document'}”`}</span>
        </Button>
        {full && <p className="ai-note">Context is full — remove a page to add another.</p>}
      </section>

      <section className="ai-group" aria-labelledby="ai-context-soon">
        <div className="ai-group-head">
          <h3 id="ai-context-soon" className="ai-label">Coming soon</h3>
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
  );
}
