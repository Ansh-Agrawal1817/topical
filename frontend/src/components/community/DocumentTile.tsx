import { Link } from '@tanstack/react-router';
import type { LessonPlanResponse } from '@/lib/api';
import { documentRoute } from '@/lib/documentUrl';
import { documentContent } from '@/lib/documents';
import { excerptOf, wordsIn } from '@/lib/excerpt';
import { formatDate } from '@/lib/format';
import { formatOf } from '@/lib/types';
import { Avatar } from '@/components/ui';

/**
 * A published document in the library: what it is (its format), what it is
 * called, how it opens, who wrote it and how long it is. The whole tile is
 * the link — there is one thing to do with a document here, which is read it.
 */
export function DocumentTile({ plan, author, own }: { plan: LessonPlanResponse; author: string; own: boolean }) {
  const content = documentContent(plan.topics);
  const excerpt = excerptOf(content, plan.mainTopic);
  const words = wordsIn(content);
  const sections = (content.match(/^#{1,3}\s|\\(sub)*section\*?\{/gm) ?? []).length;
  const format = formatOf(plan.mainTopic);

  return (
    <Link {...documentRoute(plan.id, plan.mainTopic)} className="doc-tile">
      <span className="doc-tile-top">
        <span className="doc-tile-format" data-format={format}>{format === 'latex' ? 'LaTeX' : 'MDX'}</span>
        {own && <span className="doc-tile-own">Yours</span>}
        <span className="doc-tile-facts">
          {sections > 0 && <span>{sections} {sections === 1 ? 'section' : 'sections'}</span>}
          <span>{Math.max(1, Math.round(words / 220))} min</span>
        </span>
      </span>
      <span className="doc-tile-title">{plan.name}</span>
      <span className="doc-tile-excerpt">{excerpt || 'No prose yet — an outline waiting to be written.'}</span>
      <span className="doc-tile-foot">
        <span className="doc-tile-author">
          <Avatar seed={plan.userId} name={plan.authorUsername ?? author} size="xs" />
          <span className="truncate">{author}</span>
        </span>
        <span className="doc-tile-date">{formatDate(plan.updatedAt ?? plan.createdAt)}</span>
      </span>
    </Link>
  );
}
