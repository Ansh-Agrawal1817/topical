/**
 * Inline AI actions offered on a selection.
 *
 * Ids match the `TRANSFORM_ACTIONS` table in `ai_service/prompts.py`; the
 * wording of the instruction lives there, and only what the writer sees lives
 * here.
 */

import {
  Wand2, Expand, Shrink, SpellCheck, Baby, GraduationCap,
  List, Table, Sigma, ArrowRight, HelpCircle, MessageSquare,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface AiAction {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Whether the result replaces the selection, or is just shown as an answer. */
  replaces: boolean;
  /** Offered even with nothing selected (operates on the passage around the caret). */
  worksOnCaret?: boolean;
  /**
   * Needs several ideas to restructure. Running these on a word or two returns
   * something shaped like a table or a list but carrying nothing, which reads
   * as the feature being broken rather than misapplied.
   */
  needsPassage?: boolean;
}

/** Below this, the structural actions have nothing to restructure. */
export const MIN_PASSAGE_WORDS = 6;

export const AI_ACTIONS: AiAction[] = [
  { id: 'improve', label: 'Improve writing', hint: 'Clearer and more precise, same voice', icon: Wand2, replaces: true },
  { id: 'expand', label: 'Expand', hint: 'Add detail, examples, reasoning', icon: Expand, replaces: true },
  { id: 'shorten', label: 'Make it shorter', hint: 'About half the length, same points', icon: Shrink, replaces: true, needsPassage: true },
  { id: 'grammar', label: 'Fix grammar', hint: 'Spelling and punctuation only', icon: SpellCheck, replaces: true },
  { id: 'simplify', label: 'Simplify', hint: 'Plain language, jargon defined', icon: Baby, replaces: true },
  { id: 'academic', label: 'Academic tone', hint: 'Formal and impersonal', icon: GraduationCap, replaces: true },
  { id: 'bullets', label: 'Turn into bullets', hint: 'One idea per line', icon: List, replaces: true, needsPassage: true },
  { id: 'table', label: 'Turn into a table', hint: 'Columns with headers', icon: Table, replaces: true, needsPassage: true },
  { id: 'math', label: 'Set the maths', hint: 'Real notation and display equations', icon: Sigma, replaces: true },
  { id: 'continue', label: 'Continue writing', hint: 'Keep going from here', icon: ArrowRight, replaces: true, worksOnCaret: true },
  { id: 'explain', label: 'Explain this', hint: 'What it says and what it misses', icon: HelpCircle, replaces: false },
  { id: 'custom', label: 'Custom instruction…', hint: 'Tell it exactly what to do', icon: MessageSquare, replaces: true, worksOnCaret: true },
];

/**
 * At most this much of the text either side of a passage goes with an edit,
 * cut back to whole paragraphs — the neighbouring sentences set the voice
 * and the thread; a page of them only dilutes the request.
 */
export const CONTEXT_CHARS = 800;

/** The text just before `at`, up to `chars`, starting at a paragraph where one falls inside. */
export function textBefore(content: string, at: number, chars = CONTEXT_CHARS): string {
  const window = content.slice(Math.max(0, at - chars), at);
  if (at - chars <= 0) return window;
  const cut = window.indexOf('\n\n');
  return cut >= 0 && cut < window.length - 120 ? window.slice(cut + 2) : window;
}

/** The text just after `at`, up to `chars`, ending at a paragraph break where one falls inside. */
export function textAfter(content: string, at: number, chars = CONTEXT_CHARS): string {
  const window = content.slice(at, at + chars);
  if (at + chars >= content.length) return window;
  const cut = window.lastIndexOf('\n\n');
  return cut > 120 ? window.slice(0, cut) : window;
}
