import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The rest of a suggestion, given what has been typed.
 *
 * Matched against the sentence being written — the text after the last
 * full stop or line break — so an instruction can be built a sentence at a
 * time: "Check facts and figures. Only fl" offers "ag spelling, grammar…".
 * Empty field, or a finished sentence: the next suggestion not already in
 * it. Suggestions already written are never offered again.
 */
function ghostFor(value: string, completions: string[], index = 0): string {
  const lower = value.toLowerCase();
  const fresh = completions.filter(c => !lower.includes(c.toLowerCase().trim()));
  if (!fresh.length) return '';
  const tail = value.slice(Math.max(value.lastIndexOf('\n') + 1, ...[...value.matchAll(/[.!?]\s+/g)].map(m => (m.index ?? 0) + m[0].length)));
  if (!tail.trim() || /[.!?]$/.test(value)) {
    const next = fresh[index % fresh.length];
    // After a finished sentence with no space yet, start the next one with one.
    return value && !/\s$/.test(value) ? ` ${next}` : next;
  }
  if (tail.trim().length < 2) return '';
  const typed = tail.toLowerCase();
  const match = fresh.find(c => c.length > tail.length && c.toLowerCase().startsWith(typed));
  return match ? match.slice(tail.length) : '';
}

type Common = {
  value: string;
  onChange: (next: string) => void;
  /** Suggestions, best first. Tab takes the one shown; ↑/↓ cycle them while empty. */
  completions: string[];
  className?: string;
  /** Classes for the field itself — shared with the ghost layer, so the two line up exactly. */
  fieldClassName?: string;
};
type TextareaProps = Common & { as?: 'textarea' } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'className'>;
type InputProps = Common & { as: 'input' } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'>;

export type GhostFieldHandle = { focus: () => void; element: () => HTMLTextAreaElement | HTMLInputElement | null };

/**
 * A text field that offers what to write: the suggestion sits in faded text
 * where the words would go, and Tab writes it in.
 *
 * Two layers with the same classes. Underneath, a copy that draws the
 * field's box and sizes it — the typed text invisible, the suggestion faded
 * after it — so the field grows to fit a suggestion instead of clipping it.
 * On top, the real field, transparent, where the typing and the caret are.
 * The ghost shows while the field has focus; while it does, the placeholder
 * steps aside rather than printing under it.
 */
export const GhostField = forwardRef<GhostFieldHandle, TextareaProps | InputProps>(function GhostField(props, ref) {
  const { value, onChange, completions, className, fieldClassName, onKeyDown, placeholder, ...rest } = props as TextareaProps;
  const as = (props as InputProps).as === 'input' ? 'input' : 'textarea';
  const fieldRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  useImperativeHandle(ref, () => ({ focus: () => fieldRef.current?.focus(), element: () => fieldRef.current }), []);

  // Only while the field has focus: an idle field keeps its placeholder, and does not look filled in.
  const ghost = useMemo(
    () => (rest.disabled || !focused ? '' : ghostFor(value, completions, index)),
    [completions, focused, index, rest.disabled, value],
  );

  const accept = () => {
    const next = value + ghost;
    onChange(next);
    setIndex(0);
    requestAnimationFrame(() => {
      const el = fieldRef.current;
      if (el) { el.focus(); el.setSelectionRange(next.length, next.length); }
    });
  };

  const keys = (event: React.KeyboardEvent<HTMLTextAreaElement & HTMLInputElement>) => {
    const el = event.currentTarget;
    const atEnd = el.selectionStart === value.length && el.selectionEnd === value.length;
    if (event.key === 'Tab' && !event.shiftKey && ghost && atEnd) {
      event.preventDefault();
      accept();
      return;
    }
    // An empty field has nothing for the arrows to move through: they choose the suggestion.
    if (!value && completions.length > 1 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setIndex(i => (i + (event.key === 'ArrowDown' ? 1 : completions.length - 1)) % completions.length);
      return;
    }
    (onKeyDown as React.KeyboardEventHandler<HTMLTextAreaElement & HTMLInputElement> | undefined)?.(event);
  };

  const shared = {
    ref: fieldRef,
    className: cn(fieldClassName, 'ghost-input'),
    value,
    placeholder: ghost && !value ? undefined : placeholder,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement & HTMLInputElement>) => onChange(event.target.value),
    onKeyDown: keys,
    onScroll: (event: React.UIEvent<HTMLElement>) => {
      if (mirrorRef.current) {
        mirrorRef.current.scrollLeft = event.currentTarget.scrollLeft;
        mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
      }
    },
    onFocus: (event: React.FocusEvent<HTMLTextAreaElement & HTMLInputElement>) => { setFocused(true); rest.onFocus?.(event as never); },
    onBlur: (event: React.FocusEvent<HTMLTextAreaElement & HTMLInputElement>) => { setFocused(false); rest.onBlur?.(event as never); },
    'aria-description': ghost ? `Suggestion: ${(value + ghost).trim()}. Press Tab to use it.` : undefined,
  };
  const { onFocus: _f, onBlur: _b, as: _as, ...fieldRest } = rest as typeof rest & { as?: string };

  return (
    <div className={cn('ghost-field', className)} data-kind={as} data-focused={focused || undefined}>
      <div ref={mirrorRef} className={cn(fieldClassName, 'ghost-mirror')} aria-hidden="true">
        <span className="ghost-typed">{value}</span>
        {ghost && <span className="ghost-text">{ghost}</span>}
        {ghost && <kbd className="ghost-key">Tab</kbd>}
        {/* Holds the height of a trailing empty line, which a text node alone does not. */}
        {'\u200b'}
      </div>
      {as === 'input'
        ? <input {...(fieldRest as React.InputHTMLAttributes<HTMLInputElement>)} {...shared} />
        : <textarea {...(fieldRest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} {...shared} />}
    </div>
  );
});
