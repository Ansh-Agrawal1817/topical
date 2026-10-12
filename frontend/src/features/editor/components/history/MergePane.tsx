import { useMemo, useState } from 'react';
import { GitMerge } from 'lucide-react';
import { Button, Chip, EmptyState, Segmented, Text } from '@/components/ui';
import type { DocFormat } from '@/lib/types';
import { applyMerge, defaultChoice, mergeRows, type MergeChoice, type MergeRow } from '../../lib/sectionMerge';

const STATE_LABEL: Record<Exclude<MergeRow['state'], 'same'>, string> = {
  changed: 'Edited on both', 'theirs-only': 'New on the branch', 'mine-only': 'Only on the page',
};

/**
 * Bring another branch into the page a section at a time.
 *
 * Every section that differs is listed with a choice: for one edited on both,
 * which version to keep; for one only the branch has, whether to add it; for
 * one only the page has, whether to keep it. By default the branch's version
 * is taken and nothing the page has alone is lost.
 */
export function MergePane({ page, theirs, branchName, format, busy, onApply, onCancel }: {
  page: string;
  theirs: string;
  branchName: string;
  format: DocFormat;
  busy: boolean;
  onApply: (content: string) => void;
  onCancel: () => void;
}) {
  const rows = useMemo(() => mergeRows(page, theirs, format), [page, theirs, format]);
  const differing = rows.filter(row => row.state !== 'same');
  const [choices, setChoices] = useState<Record<string, MergeChoice>>({});
  const choiceOf = (row: MergeRow) => choices[row.key] ?? defaultChoice(row);
  const taking = differing.filter(row => choiceOf(row) === 'theirs').length;

  if (!differing.length) {
    return (
      <EmptyState variant="pane" icon={GitMerge} title="Nothing to bring in"
        description={`Every section on ${branchName} is already on the page.`}
        action={<Button variant="secondary" size="sm" onClick={onCancel}>Back</Button>} />
    );
  }

  return (
    <div className="history-merge">
      <div className="history-merge-list" role="list" aria-label={`Sections that differ from ${branchName}`}>
        {differing.map(row => {
          const options = row.state === 'changed'
            ? [{ value: 'mine' as const, label: 'Keep the page' }, { value: 'theirs' as const, label: `Take ${branchName}` }]
            : row.state === 'theirs-only'
              ? [{ value: 'theirs' as const, label: 'Add it' }, { value: 'drop' as const, label: 'Leave it out' }]
              : [{ value: 'mine' as const, label: 'Keep it' }, { value: 'drop' as const, label: 'Remove it' }];
          const words = (row.theirs?.words ?? 0) - (row.mine?.words ?? 0);
          return (
            <div key={row.key} role="listitem" className="history-merge-row">
              <span className="history-merge-what">
                <Text as="span" size="sm" weight="medium" truncate>{row.title}</Text>
                <span className="history-merge-meta">
                  <Chip size="xs" tone={row.state === 'changed' ? 'outline' : 'quiet'} caps>{STATE_LABEL[row.state as keyof typeof STATE_LABEL]}</Chip>
                  {row.state === 'changed' && words !== 0 && (
                    <Text as="span" size="2xs" numeric mono tone="faint">{words > 0 ? '+' : '−'}{Math.abs(words)} words on {branchName}</Text>
                  )}
                </span>
              </span>
              <Segmented size="xs" aria-label={`For ${row.title}`} value={choiceOf(row)} options={options}
                onChange={value => setChoices(all => ({ ...all, [row.key]: value }))} />
            </div>
          );
        })}
      </div>
      <footer className="history-merge-foot">
        <Text size="xs" tone="muted">
          {differing.length} {differing.length === 1 ? 'section differs' : 'sections differ'} · taking {taking} from {branchName}.
          The page is saved as a version first.
        </Text>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="primary" size="sm" loading={busy} onClick={() => onApply(applyMerge(rows, choices))}>
          <GitMerge className="h-3.5 w-3.5" aria-hidden="true" /> Merge into the page
        </Button>
      </footer>
    </div>
  );
}
