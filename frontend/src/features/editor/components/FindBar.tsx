import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, CaseSensitive, WholeWord, X, Replace } from 'lucide-react';
import { Button, IconButton, Input, Divider, Text } from '@/components/ui';
import type { FindReplace } from '../hooks/useFindReplace';

/**
 * Find and replace, opened with ⌘F and closed with Escape.
 *
 * Focus stays in the bar for as long as it is open — Enter steps, Replace
 * replaces and moves on — and goes back to the text, on the match, when it
 * closes. `onDone` is that return trip.
 */
export function FindBar({ find, onDone }: { find: FindReplace; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘F focuses (and selects) the query every time, including when the bar is
  // already open and focus has wandered back to the text.
  useEffect(() => {
    if (find.open) inputRef.current?.select();
  }, [find.open, find.focusSignal]);

  if (!find.open) return null;

  const close = () => { find.setOpen(false); onDone(); };
  const count = find.matches.length;

  const replaceAll = () => {
    const n = find.replaceAll();
    if (n) toast.success(`Replaced ${n} ${n === 1 ? 'match' : 'matches'}`);
  };

  return (
    <div
      className="find-bar"
      role="search"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
      }}
    >
      <Input
        ref={inputRef}
        size="sm"
        className="find-input"
        placeholder="Find in document"
        value={find.query}
        onChange={e => find.setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); find.step(e.shiftKey ? -1 : 1); }
        }}
        aria-label="Find"
        aria-describedby="find-count"
        data-empty={find.query.length > 0 && count === 0}
      />
      <Text as="span" id="find-count" mono size="2xs" tone={find.query && !count ? 'danger' : 'faint'} className="find-count" aria-live="polite">
        {find.query ? (count ? `${find.current + 1} of ${count >= 2000 ? '2000+' : count}` : 'No results') : ''}
      </Text>
      <IconButton onClick={() => find.step(-1)} disabled={!count} title="Previous match  ⇧⏎" aria-label="Previous match">
        <ChevronUp className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton onClick={() => find.step(1)} disabled={!count} title="Next match  ⏎" aria-label="Next match">
        <ChevronDown className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton
        active={find.caseSensitive}
        aria-pressed={find.caseSensitive}
        onClick={() => find.setCaseSensitive(!find.caseSensitive)}
        title="Match case"
        aria-label="Match case"
      >
        <CaseSensitive className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton
        active={find.wholeWord}
        aria-pressed={find.wholeWord}
        onClick={() => find.setWholeWord(!find.wholeWord)}
        title="Whole words only"
        aria-label="Whole words only"
      >
        <WholeWord className="h-3.5 w-3.5" />
      </IconButton>

      <Divider orientation="vertical" space="sm" />

      <Input
        size="sm"
        className="find-input"
        placeholder="Replace with"
        value={find.replacement}
        onChange={e => find.setReplacement(e.target.value)}
        onKeyDown={e => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          // ⌘⏎ is "all", as in every editor that has the two.
          if (e.metaKey || e.ctrlKey) replaceAll();
          else find.replaceCurrent();
        }}
        aria-label="Replace with"
      />
      <Button variant="secondary" size="md" onClick={find.replaceCurrent} disabled={!count} title="Replace, then go to the next  ⏎">
        <Replace className="h-3 w-3" /> Replace
      </Button>
      <Button variant="secondary" size="md" onClick={replaceAll} disabled={!count} title="Replace every match  ⌘⏎">
        All
      </Button>

      <IconButton className="ml-auto" onClick={close} title="Close  Esc" aria-label="Close find">
        <X className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}
