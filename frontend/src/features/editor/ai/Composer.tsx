import { forwardRef, useImperativeHandle, useRef } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { GhostField, type GhostFieldHandle } from '@/components/GhostField';

/** A one-click addition to the instruction: a short label, the sentence it adds. */
export interface Suggestion {
  label: string;
  text: string;
  /** A prefix to finish ("Add a section on "): the caret is left at its end. */
  unfinished?: boolean;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  placeholder: string;
  /** Accessible name for the field. */
  label: string;
  submitLabel: React.ReactNode;
  submitIcon?: React.ReactNode;
  /** The button is off, but the field stays editable. */
  submitDisabled?: boolean;
  loading?: boolean;
  /** The whole composer is off — a request is in flight. */
  disabled?: boolean;
  suggestions?: Suggestion[];
  /**
   * Whole instructions offered in the field as you type, Tab to take one.
   * Defaults to the suggestions' own sentences.
   */
  completions?: string[];
  /** The left of the footer: what the request will read, or a second way in. */
  footer?: React.ReactNode;
  /** Above the field, inside the card: what the request acts on. */
  header?: React.ReactNode;
  rows?: number;
  className?: string;
}

export interface ComposerHandle {
  focus: () => void;
}

/** Does the instruction already carry this suggestion's sentence? */
const holds = (value: string, text: string) => value.includes(text.trim());

/**
 * The one way to ask the AI for something, in every tab.
 *
 * Outline, Write and Refine each grew their own: a textarea with chips under
 * it and a button row in one, an input with a Run button beside it in
 * another, a primary button plus a text link in the third — three shapes for
 * the same act. This is the shape they share: a card holding the instruction,
 * what it will act on above it, and the action (with what it reads) at its
 * foot, so the eye learns one layout and finds the button in one place.
 *
 * Suggestions are toggles, not presets. A click adds the sentence to the
 * instruction, a second click takes it out again, and the field stays the
 * one source of truth — so "brief" and "with a table" can be combined, and
 * what will be sent is always exactly what is written in the box. Enter
 * sends; Shift-Enter is a new line.
 */
export const Composer = forwardRef<ComposerHandle, Props>(function Composer({
  value, onChange, onSubmit, placeholder, label, submitLabel, submitIcon, submitDisabled, loading, disabled,
  suggestions, completions, footer, header, rows = 2, className,
}, ref) {
  const inputRef = useRef<GhostFieldHandle>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);
  const offered = completions ?? (suggestions ?? []).filter(s => !s.unfinished).map(s => s.text.trim());

  const toggle = (s: Suggestion) => {
    const text = s.text.trim();
    let next: string;
    if (holds(value, text)) {
      next = value.replace(text, '').replace(/\s{2,}/g, ' ').trim();
    } else {
      next = value.trim() ? `${value.trim().replace(/[.,;]?$/, '.')} ${s.text}` : s.text;
    }
    onChange(next);
    requestAnimationFrame(() => {
      const el = inputRef.current?.element();
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
    });
  };

  const submit = () => {
    if (submitDisabled || disabled || loading) return;
    onSubmit();
  };

  return (
    <div className={cn('ai-composer-wrap', className)}>
      <form
        className="ai-composer"
        data-disabled={disabled || undefined}
        onSubmit={event => { event.preventDefault(); submit(); }}
        onClick={event => {
          // The whole card is the field: a click on its padding lands in the text.
          if (event.target === event.currentTarget) inputRef.current?.focus();
        }}
      >
        {header && <div className="ai-composer-head">{header}</div>}
        <GhostField
          ref={inputRef}
          fieldClassName="ai-composer-input"
          completions={offered}
          rows={rows}
          aria-label={label}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={onChange}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="ai-composer-foot">
          <div className="ai-composer-meta">{footer}</div>
          <Button
            type="submit"
            variant="primary"
            size="xs"
            loading={loading}
            disabled={submitDisabled || disabled || loading}
            title="Enter"
          >
            {!loading && (submitIcon ?? <CornerDownLeft className="h-3 w-3" aria-hidden="true" />)}
            {submitLabel}
          </Button>
        </div>
      </form>

      {suggestions && suggestions.length > 0 && (
        <div className="ai-suggestions" role="group" aria-label="Suggestions">
          {suggestions.map(s => {
            const on = holds(value, s.text);
            return (
              <button
                key={s.label}
                type="button"
                className="ai-suggestion"
                aria-pressed={on}
                data-on={on || undefined}
                title={s.text.trim()}
                disabled={disabled}
                onClick={() => toggle(s)}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
