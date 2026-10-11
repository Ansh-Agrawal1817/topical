/**
 * What the AI fields offer to write for you — whole instructions, best
 * first, taken with Tab (see `GhostField`). The chips under a composer add
 * one short sentence each; these are the fuller asks people actually type.
 */

export const WRITE_COMPLETIONS = [
  'Make it more detailed, with a worked example in each section.',
  'Keep each section under 300 words.',
  'Write for first-year undergraduates — define every term on first use.',
  'Use a formal, academic tone.',
  'End each section with a two-sentence summary.',
  'Add a short table wherever it compares things.',
  'Include the key equations, each followed by what it means.',
  'Make it practical: steps, code and examples over theory.',
];

/** With text selected. */
export const REFINE_COMPLETIONS = [
  'Make it more detailed.',
  'Make it more concise without losing any point.',
  'Explain it for a beginner, with an example.',
  'Add a concrete example.',
  'Fix the grammar only — change nothing else.',
  'Turn it into a bulleted list.',
  'Make the argument flow more logically.',
  'Rewrite it in a more formal tone.',
];

/** At the caret, with nothing selected. */
export const CONTINUE_COMPLETIONS = [
  'Continue with a worked example.',
  'Continue with the next step of the argument.',
  'Write the next paragraph, about ',
  'Add a short summary of this section.',
];

export const OUTLINE_COMPLETIONS = [
  'Make it more detailed — break the long sections into sub-sections.',
  'Reorder it so each section builds on the one before.',
  'Merge sections that overlap.',
  'Add a section on ',
  'Make it suitable for beginners.',
  'Trim it to the essentials.',
  'Add a section of worked examples near the end.',
];

/** A subject for an outline, from the document's title. */
export function subjectCompletions(title: string): string[] {
  const t = title.trim();
  if (!t || /^untitled/i.test(t)) return [];
  return [t, `${t} — a complete introduction`, `${t} for beginners`, `${t}: theory, methods and applications`];
}

export const REVIEWER_COMPLETIONS = [
  'Check facts and figures.',
  'Check the maths and notation.',
  'Only flag spelling, grammar and punctuation.',
  'Keep terms and claims consistent with the rest of the outline.',
  'Flag sentences a reader would stumble on.',
  'Keep the tone formal and academic.',
];

/** Names for a snapshot in the history. */
export function snapshotNames(): string[] {
  const day = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return ['First full draft', 'Before major edit', 'Sent for review', `Draft — ${day}`, 'Final version'];
}
