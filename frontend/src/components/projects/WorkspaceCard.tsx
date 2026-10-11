import { useMemo } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import { Collaborators } from '@/components/Collaborators';
import { Button, IconButton } from '@/components/ui';
import { buildOutline } from '@/features/editor/lib/outline';
import { documentContent } from '@/lib/documents';
import { excerptOf, wordsIn } from '@/lib/excerpt';
import { relativeTime } from '@/lib/format';
import { formatOf, type DocFormat } from '@/lib/types';
import type { LessonPlanResponse } from '@/lib/api';

/**
 * A document as its outline: the headings it is built from, and how many of
 * them have prose under them yet. That is the shape of the work — a topic
 * and its parts — which is what someone scanning their workspace is
 * actually looking for, more than the first sentence of the first section.
 */
export function docShape(doc: LessonPlanResponse) {
  const content = documentContent(doc.topics);
  const format: DocFormat = formatOf(doc.mainTopic);
  const outline = buildOutline(content, format);
  /*
   * Only sections that hold prose themselves are counted: a heading with
   * deeper headings straight under it is a grouping — the document's own
   * title, a part — and asking for prose under it would report every
   * document as unfinished at its first line.
   */
  const states = outline.map((node, i) => {
    const next = outline[i + 1];
    const end = next?.offset ?? content.length;
    const leaf = !next || next.level <= node.level;
    const written = wordsIn(content.slice(node.offset, end).split('\n').slice(1).join(' ')) >= 25;
    return { node, leaf, written };
  });
  const leaves = states.filter(s => s.leaf);
  return {
    content, format, outline, states,
    sections: leaves.length,
    written: leaves.filter(s => s.written).length,
    next: leaves.find(s => !s.written)?.node ?? null,
    words: wordsIn(content),
  };
}

interface Props {
  doc: LessonPlanResponse;
  /** The viewer owns it: they may delete it and change who can read it. */
  isAuthor: boolean;
  layout: 'card' | 'row';
  onOpen: (doc: LessonPlanResponse) => void;
  onDelete: (id: number) => void;
  /** The visibility control, which only the page can wire to its confirmation. */
  children?: React.ReactNode;
}

/** One document in the workspace, as a card in the grid or a row in the list. */
export function WorkspaceCard({ doc, isAuthor, layout, onOpen, onDelete, children }: Props) {
  // Walks the whole document; keyed on it so a keystroke in the search field does not redo it.
  const shape = useMemo(() => docShape(doc), [doc]);
  const edited = relativeTime(doc.updatedAt ?? doc.createdAt);
  const badge = shape.format === 'latex' ? 'LaTeX' : 'MDX';
  const sections = shape.sections;
  const people = doc.coAuthorUsernames && doc.coAuthorUsernames.length > 0 && (
    <Collaborators authorUsername={doc.authorUsername ?? null} coAuthorUsernames={doc.coAuthorUsernames} />
  );
  const remove = isAuthor && (
    <IconButton size="sm" tone="danger" revealOnHover onClick={() => onDelete(doc.id)} aria-label={`Delete ${doc.name}`} title="Delete">
      <Trash2 className="h-3.5 w-3.5" />
    </IconButton>
  );

  if (layout === 'row') {
    return (
      <div className="ws-row">
        <span className="ws-format" data-format={shape.format}>{badge}</span>
        <span className="ws-row-main">
          <button type="button" className="ws-title ws-open" onClick={() => onOpen(doc)}>{doc.name}</button>
          <span className="ws-facts">
            <span>{edited}</span>
            {sections > 0 && <span>{shape.written}/{sections} sections written</span>}
            <span>{shape.words.toLocaleString()} words</span>
          </span>
        </span>
        <span className="ws-row-side">
          {children}
          {people}
          {remove}
        </span>
        <button type="button" className="ws-hit" tabIndex={-1} aria-hidden="true" onClick={() => onOpen(doc)} />
      </div>
    );
  }

  // The card names the document below; a top heading that only repeats that
  // name is not part of the contents.
  const states = shape.states[0]?.node.label.trim().toLowerCase() === doc.name.trim().toLowerCase()
    ? shape.states.slice(1)
    : shape.states;
  const shown = states.slice(0, 5);
  const excerpt = states.length ? '' : excerptOf(shape.content, doc.mainTopic, 160);

  return (
    <div className="ws-card">
      {/* Its contents, in miniature: the outline, ticked where written. The
          title is set once, below — this used to print it twice. */}
      <div className="ws-page" aria-hidden="true">
        {shown.length > 0 ? (
          <ol className="ws-page-toc">
            {shown.map(({ node, leaf, written }) => (
              <li key={node.id} data-level={Math.min(node.level, 3)} data-written={written} data-leaf={leaf}>
                <span className="ws-page-dot" />
                {node.label}
              </li>
            ))}
            {states.length > shown.length && <li className="ws-page-more">+{states.length - shown.length} more</li>}
          </ol>
        ) : (
          <p className="ws-page-text">{excerpt || 'An empty page — open it and name the first section.'}</p>
        )}
      </div>

      <div className="ws-card-body">
        <div className="ws-card-head">
          <span className="ws-format" data-format={shape.format}>{badge}</span>
          <span className="ws-edited">{edited}</span>
          <span className="ws-card-tools">{remove}</span>
        </div>
        <h3 className="ws-title">
          <button type="button" className="ws-open" onClick={() => onOpen(doc)}>{doc.name}</button>
        </h3>
        {sections > 0 ? (
          <span className="ws-progress" title={`${shape.written} of ${sections} sections have prose`}>
            <span className="ws-progress-bar"><span style={{ width: `${(shape.written / sections) * 100}%` }} /></span>
            {shape.written}/{sections} written · {shape.words.toLocaleString()} words
          </span>
        ) : (
          <span className="ws-progress">{shape.words.toLocaleString()} words</span>
        )}
        <div className="ws-card-foot">
          {children}
          {people}
        </div>
      </div>
      <button type="button" className="ws-hit" tabIndex={-1} aria-hidden="true" onClick={() => onOpen(doc)} />
    </div>
  );
}

/** The document most recently worked on, given the room to say where it stands. */
export function ContinueCard({ doc, onContinue }: { doc: LessonPlanResponse; onContinue: (doc: LessonPlanResponse) => void }) {
  const shape = useMemo(() => docShape(doc), [doc]);
  const next = shape.next;
  const sections = shape.sections;
  const share = sections ? shape.written / sections : 0;

  return (
    <section className="ws-continue" aria-label="Continue where you left off">
      <div className="ws-continue-ring" aria-hidden="true" style={{ ['--share' as string]: share }}>
        <span>{sections ? `${Math.round(share * 100)}%` : '—'}</span>
      </div>
      <div className="ws-continue-text">
        <span className="ws-continue-kicker">Continue where you left off · {relativeTime(doc.updatedAt ?? doc.createdAt)}</span>
        <h2 className="ws-continue-title">{doc.name}</h2>
        <p className="ws-continue-next">
          {sections === 0
            ? 'No sections yet — open it and the outline rail will help you plan them.'
            : next
              ? <>Next up: <b>{next.label}</b> · {shape.written} of {sections} sections written</>
              : <>Every section has prose · {shape.words.toLocaleString()} words</>}
        </p>
      </div>
      <Button variant="primary" size="lg" onClick={() => onContinue(doc)}>
        Continue writing <ArrowRight className="h-4 w-4" />
      </Button>
    </section>
  );
}
