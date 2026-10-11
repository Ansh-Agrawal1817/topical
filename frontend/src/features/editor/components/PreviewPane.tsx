import { forwardRef } from 'react';
import { Eye } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import type { DocFormat } from '@/lib/types';
import { MarkdownPreview } from '@/features/preview/MarkdownPreview';
import { LatexPreview } from '@/features/preview/LatexPreview';

interface Props {
  content: string;
  format: DocFormat;
  /**
   * The writer's chosen text size, in px — the same number that sizes the
   * live surface. Scaled here against `DEFAULT_OPTIONS`'s
   * 17px baseline into a multiplier the stylesheet applies to the rendered
   * type. Optional so a caller with no size preference (there is none today,
   * but nothing here should require one) gets the unscaled default.
   */
  fontSize?: number;
}

/** `viewOptions.ts`'s `DEFAULT_OPTIONS.fontSize` — the size the scale is 1 at. */
const BASE_FONT_SIZE = 17;

/** The typeset document: the reading view, and the source of a print or PDF. */
export const PreviewPane = forwardRef<HTMLDivElement, Props>(function PreviewPane(
  { content, format, fontSize }, ref,
) {
  return (
    <div
      className="doc-preview"
      ref={ref}
    >
      {content.trim() ? (
        <div
          className="doc-sheet"
          data-format={format}
          style={fontSize ? { ['--doc-font-scale' as string]: fontSize / BASE_FONT_SIZE } : undefined}
        >
          {/* Unresolved references and malformed environments are a writing
              problem. Someone reading the document can do nothing about them,
              and a panel of them above the prose is the first thing they see. */}
          {format === 'latex'
            ? <LatexPreview content={content} showIssues={false} />
            : <MarkdownPreview content={content} />}
        </div>
      ) : (
        <EmptyState variant="pane" icon={Eye} title="This document is empty." description="Nothing has been written in it yet." />
      )}
    </div>
  );
});
