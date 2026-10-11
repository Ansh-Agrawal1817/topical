/**
 * Openers, so the common asks cost a click rather than a sentence.
 *
 * The chip is one word and the instruction it adds is not. They are toggles
 * (see `ai/Composer`): each adds its sentence to the instruction, so several
 * combine. Labels are kept to a word so the whole set sits on one line of
 * the AI panel instead of wrapping into a block of buttons.
 */
export const ASKS: { label: string; text: string }[] = [
  { label: 'Brief', text: 'Keep it under 250 words.' },
  { label: 'Example', text: 'Lead with a fully worked example before the general case.' },
  { label: 'In depth', text: 'Go deeper — include the derivations and the edge cases.' },
  { label: 'Simple', text: 'Plain language. Define any term a newcomer would not know.' },
  { label: 'Table', text: 'Include a comparison table.' },
];
