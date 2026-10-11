/**
 * The single registry of things you can insert into a document.
 *
 * The toolbar, the ⌘-shortcuts and the `/` menu all read from here, so a
 * construct is defined once and behaves identically however you reach it.
 */

import {
  Bold, Italic, Strikethrough, Code, Code2, Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks, Quote, Minus, Link2, Image, Table,
  Sigma, Radical, Info, FileText, Braces, BookMarked, SquareStack, Superscript,
  Heading4, Grid3x3, Lightbulb, BadgeAlert, AlertTriangle, OctagonAlert, Divide, CalendarDays, Hash, AlignCenter,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DocFormat } from '@/lib/types';
import { toggleWrap, toggleLinePrefix, type EditResult, type Range } from './textOps';

export type ActionGroup = 'Format' | 'Structure' | 'Blocks' | 'Callouts' | 'Theorems' | 'Math' | 'Media' | 'Insert';

export interface EditorAction {
  id: string;
  label: string;
  /** One line on what it is — the slash menu's description. */
  hint?: string;
  group: ActionGroup;
  icon: LucideIcon;
  /** Letter or digit combined with ⌘/Ctrl. */
  key?: string;
  /** Whether that shortcut also needs Shift. */
  shift?: boolean;
  /** Keywords the slash menu matches on, beyond the label. */
  terms?: string;
  apply: (doc: string, sel: Range) => EditResult;
}

/**
 * Place a multi-line construct on its own lines.
 *
 * `$SEL` is replaced by the current selection (or the placeholder) and `$0`
 * marks where the caret should land afterwards.
 */
function template(body: string, placeholder = '') {
  return (doc: string, sel: Range): EditResult => {
    const selected = doc.slice(sel.start, sel.end);
    // A placeholder right at the caret is selected, so typing replaces it —
    // it used to stay behind, after whatever was typed ("…colourable.Statement.").
    const selectPlaceholder = !selected && !!placeholder && body.includes('$0$SEL');
    let text = body.replace('$SEL', selected || placeholder);
    const caretAt = text.indexOf('$0');
    text = text.replace('$0', '');

    const before = doc.slice(0, sel.start);
    const after = doc.slice(sel.end);
    // Only add the blank line the construct needs, never a second one.
    const lead = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const trail = !after || after.startsWith('\n') ? '' : '\n';

    const head = before + lead + text;
    const caret = caretAt >= 0 ? before.length + lead.length + caretAt : head.length;
    return { content: head + trail + after, start: caret, end: selectPlaceholder ? caret + placeholder.length : caret };
  };
}

/** Plain text at the caret, replacing any selection. */
function insertText(doc: string, sel: Range, text: string): EditResult {
  const at = sel.start + text.length;
  return { content: doc.slice(0, sel.start) + text + doc.slice(sel.end), start: at, end: at };
}

const today = () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

function wrap(before: string, after: string, placeholder: string) {
  return (doc: string, sel: Range) => toggleWrap(doc, sel, before, after, placeholder);
}

function prefix(marker: string) {
  return (doc: string, sel: Range) => toggleLinePrefix(doc, sel, marker);
}

// ── Markdown / MDX ────────────────────────────────────────────────────────

const MDX_ACTIONS: EditorAction[] = [
  { id: 'bold', hint: 'Strong emphasis', label: 'Bold', group: 'Format', icon: Bold, key: 'b', apply: wrap('**', '**', 'bold text') },
  { id: 'italic', hint: 'Light emphasis', label: 'Italic', group: 'Format', icon: Italic, key: 'i', apply: wrap('*', '*', 'italic text') },
  { id: 'strike', hint: 'Cross text out', label: 'Strikethrough', group: 'Format', icon: Strikethrough, apply: wrap('~~', '~~', 'struck text') },
  { id: 'code', hint: 'A name or snippet in monospace', label: 'Inline code', group: 'Format', icon: Code, key: 'e', apply: wrap('`', '`', 'code') },

  { id: 'h1', hint: 'Top-level section', label: 'Heading 1', group: 'Structure', icon: Heading1, key: '1', apply: prefix('# ') },
  { id: 'h2', hint: 'Section within a section', label: 'Heading 2', group: 'Structure', icon: Heading2, key: '2', apply: prefix('## ') },
  { id: 'h3', hint: 'A smaller sub-section', label: 'Heading 3', group: 'Structure', icon: Heading3, key: '3', apply: prefix('### ') },
  { id: 'h4', hint: 'The smallest heading', label: 'Heading 4', group: 'Structure', icon: Heading4, apply: prefix('#### ') },
  { id: 'ul', hint: 'A simple bulleted list', label: 'Bulleted list', group: 'Structure', icon: List, apply: prefix('- ') },
  { id: 'ol', hint: 'Steps, in order', label: 'Numbered list', group: 'Structure', icon: ListOrdered, apply: prefix('1. ') },
  { id: 'task', hint: 'Checkboxes to tick off', label: 'Task list', group: 'Structure', icon: ListChecks, terms: 'todo checkbox', apply: prefix('- [ ] ') },
  { id: 'quote', hint: 'Set a passage apart', label: 'Quote', group: 'Structure', icon: Quote, apply: prefix('> ') },
  { id: 'hr', hint: 'A horizontal rule between parts', label: 'Divider', group: 'Structure', icon: Minus, terms: 'rule separator', apply: template('---\n$0') },

  { id: 'link', hint: 'Point to a page on the web', label: 'Link', group: 'Media', icon: Link2, key: 'k', apply: wrap('[', '](url)', 'label') },
  { id: 'image', hint: 'An image by its address', label: 'Image', group: 'Media', icon: Image, apply: wrap('![', '](url)', 'alt text') },
  {
    id: 'codeblock', hint: 'A fenced block, highlighted by language', label: 'Code block', group: 'Blocks', icon: Code2, terms: 'fence snippet',
    apply: template('```$0\n$SEL\n```', 'code here'),
  },
  {
    id: 'table', hint: 'Rows and columns', label: 'Table', group: 'Blocks', icon: Table,
    apply: template('| $0Column | Column |\n| --- | --- |\n| Cell | Cell |'),
  },
  {
    id: 'table-3', hint: 'Three columns, aligned', label: 'Table, 3 × 3', group: 'Blocks', icon: Grid3x3, terms: 'grid columns',
    apply: template('| $0Item | Value | Notes |\n| :--- | :---: | ---: |\n| A | 1 | — |\n| B | 2 | — |\n| C | 3 | — |'),
  },
  {
    id: 'callout', hint: 'A highlighted note beside the text', label: 'Note', group: 'Callouts', icon: Info, terms: 'callout note admonition',
    apply: template('> [!NOTE]\n> $0$SEL', 'Something worth flagging.'),
  },
  {
    id: 'callout-tip', hint: 'A shortcut or a better way', label: 'Tip', group: 'Callouts', icon: Lightbulb, terms: 'callout hint advice',
    apply: template('> [!TIP]\n> $0$SEL', 'A better way to do it.'),
  },
  {
    id: 'callout-important', hint: 'What the reader must not miss', label: 'Important', group: 'Callouts', icon: BadgeAlert, terms: 'callout key essential',
    apply: template('> [!IMPORTANT]\n> $0$SEL', 'The one thing to remember.'),
  },
  {
    id: 'callout-warning', hint: 'A pitfall to avoid', label: 'Warning', group: 'Callouts', icon: AlertTriangle, terms: 'callout pitfall careful',
    apply: template('> [!WARNING]\n> $0$SEL', 'What goes wrong if you do not.'),
  },
  {
    id: 'callout-caution', hint: 'Something risky or irreversible', label: 'Caution', group: 'Callouts', icon: OctagonAlert, terms: 'callout danger risk',
    apply: template('> [!CAUTION]\n> $0$SEL', 'This cannot be undone.'),
  },
  {
    id: 'details', hint: 'Content that opens on click', label: 'Collapsible section', group: 'Blocks', icon: SquareStack, terms: 'accordion toggle',
    apply: template('<details>\n<summary>$0Summary</summary>\n\n$SEL\n\n</details>', 'Hidden content.'),
  },
  {
    id: 'footnote', hint: 'A numbered note at the end', label: 'Footnote', group: 'Blocks', icon: Superscript,
    apply: template('$SEL[^1]\n\n[^1]: $0Footnote text.'),
  },

  { id: 'math-inline', hint: 'A formula within the sentence', label: 'Inline math', group: 'Math', icon: Radical, terms: 'katex equation formula', apply: wrap('$', '$', 'x^2') },
  {
    id: 'math-block', hint: 'A formula on its own line', label: 'Display equation', group: 'Math', icon: Sigma, terms: 'katex formula',
    apply: template('$$\n$0$SEL\n$$', 'E = mc^2'),
  },
  {
    id: 'align', hint: 'Several lines aligned at &', label: 'Aligned equations', group: 'Math', icon: Braces, terms: 'multi line katex',
    apply: template('$$\n\\begin{aligned}\n  $0a &= b + c \\\\\n  &= d\n\\end{aligned}\n$$'),
  },
  {
    id: 'matrix', hint: 'A bracketed matrix', label: 'Matrix', group: 'Math', icon: Grid3x3, terms: 'pmatrix katex',
    apply: template('$$\n\\begin{pmatrix}\n  $0a & b \\\\\n  c & d\n\\end{pmatrix}\n$$'),
  },
  {
    id: 'cases', hint: 'A piecewise definition', label: 'Cases', group: 'Math', icon: Braces, terms: 'piecewise katex',
    apply: template('$$\nf(x) = \\begin{cases}\n  $01 & x > 0 \\\\\n  0 & \\text{otherwise}\n\\end{cases}\n$$'),
  },
  {
    id: 'fraction', hint: 'A fraction, inline', label: 'Fraction', group: 'Math', icon: Divide, terms: 'frac over katex',
    apply: wrap('$\\frac{', '}{b}$', 'a'),
  },
  { id: 'date', hint: 'Today, written out', label: 'Today’s date', group: 'Insert', icon: CalendarDays, terms: 'now time day', apply: (doc, sel) => insertText(doc, sel, today()) },
];

// ── LaTeX ─────────────────────────────────────────────────────────────────

const LATEX_ACTIONS: EditorAction[] = [
  { id: 'bold', hint: '\\textbf — strong emphasis', label: 'Bold', group: 'Format', icon: Bold, key: 'b', apply: wrap('\\textbf{', '}', 'bold text') },
  { id: 'italic', hint: '\\textit — italic shape', label: 'Italic', group: 'Format', icon: Italic, key: 'i', apply: wrap('\\textit{', '}', 'italic text') },
  { id: 'strike', hint: '\\emph — emphasis', label: 'Emphasis', group: 'Format', icon: Strikethrough, apply: wrap('\\emph{', '}', 'emphasis') },
  { id: 'code', hint: '\\texttt — typewriter face', label: 'Monospace', group: 'Format', icon: Code, key: 'e', apply: wrap('\\texttt{', '}', 'code') },

  { id: 'h1', hint: '\\section — top-level section', label: 'Section', group: 'Structure', icon: Heading1, key: '1', apply: template('\\section{$SEL}$0', 'Section title') },
  { id: 'h2', hint: '\\subsection', label: 'Subsection', group: 'Structure', icon: Heading2, key: '2', apply: template('\\subsection{$SEL}$0', 'Subsection title') },
  { id: 'h3', hint: '\\subsubsection', label: 'Subsubsection', group: 'Structure', icon: Heading3, key: '3', apply: template('\\subsubsection{$SEL}$0', 'Subsubsection title') },
  { id: 'h4', hint: '\\paragraph — a run-in heading', label: 'Paragraph heading', group: 'Structure', icon: Heading4, apply: template('\\paragraph{$SEL}$0', 'Heading') },
  { id: 'ul', hint: 'A bulleted list', label: 'Itemize', group: 'Structure', icon: List, apply: template('\\begin{itemize}\n  \\item $0$SEL\n\\end{itemize}', 'First item') },
  { id: 'ol', hint: 'A numbered list', label: 'Enumerate', group: 'Structure', icon: ListOrdered, apply: template('\\begin{enumerate}\n  \\item $0$SEL\n\\end{enumerate}', 'First item') },
  { id: 'task', hint: 'Terms and their definitions', label: 'Description list', group: 'Structure', icon: ListChecks, apply: template('\\begin{description}\n  \\item[$0Term] $SEL\n\\end{description}', 'Definition') },
  { id: 'quote', hint: 'Set a passage apart', label: 'Quote', group: 'Structure', icon: Quote, apply: template('\\begin{quote}\n$0$SEL\n\\end{quote}', 'Quoted passage') },
  { id: 'hr', hint: 'A horizontal rule', label: 'Rule', group: 'Structure', icon: Minus, apply: template('\\hrule$0') },

  { id: 'link', hint: '\\href — a link with its own text', label: 'Hyperlink', group: 'Media', icon: Link2, key: 'k', apply: wrap('\\href{url}{', '}', 'label') },
  {
    id: 'image', hint: 'Graphic with caption and label', label: 'Figure', group: 'Media', icon: Image, terms: 'graphic includegraphics',
    apply: template(
      '\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{$0image.png}\n  \\caption{$SEL}\n  \\label{fig:label}\n\\end{figure}',
      'Caption',
    ),
  },
  { id: 'codeblock', hint: 'Text exactly as typed', label: 'Verbatim', group: 'Blocks', icon: Code2, apply: template('\\begin{verbatim}\n$0$SEL\n\\end{verbatim}', 'code here') },
  {
    id: 'table', hint: 'tabular inside a captioned float', label: 'Table', group: 'Blocks', icon: Table,
    apply: template(
      '\\begin{table}[h]\n  \\centering\n  \\begin{tabular}{lcr}\n    \\hline\n    $0Left & Center & Right \\\\\n    \\hline\n    a & b & c \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{$SEL}\n\\end{table}',
      'Caption',
    ),
  },
  {
    id: 'callout', hint: 'A numbered theorem', label: 'Theorem', group: 'Theorems', icon: BookMarked, terms: 'lemma proof proposition',
    apply: template('\\begin{theorem}\n$0$SEL\n\\end{theorem}', 'State the theorem.'),
  },
  {
    id: 'details', hint: 'A proof, closed with ∎', label: 'Proof', group: 'Theorems', icon: SquareStack,
    apply: template('\\begin{proof}\n$0$SEL\n\\end{proof}', 'Argument.'),
  },
  ...(['lemma', 'definition', 'corollary', 'proposition', 'example', 'remark'] as const).map((env): EditorAction => ({
    id: `thm-${env}`, hint: `A numbered ${env}`, label: env[0].toUpperCase() + env.slice(1), group: 'Theorems', icon: BookMarked,
    terms: 'theorem environment', apply: template(`\\begin{${env}}\n$0$SEL\n\\end{${env}}`, 'Statement.'),
  })),
  { id: 'footnote', hint: 'A note at the foot of the page', label: 'Footnote', group: 'Blocks', icon: Superscript, apply: wrap('\\footnote{', '}', 'Footnote text.') },
  { id: 'ref', hint: '\\ref — point to a label', label: 'Cross-reference', group: 'Blocks', icon: Hash, terms: 'ref label eqref autoref', apply: wrap('\\autoref{', '}', 'sec:label') },
  { id: 'center', hint: 'Centre a block of text', label: 'Centred block', group: 'Blocks', icon: AlignCenter, terms: 'center', apply: template('\\begin{center}\n$0$SEL\n\\end{center}', 'Centred text') },
  { id: 'cite', hint: 'Cite a bibliography key', label: 'Citation', group: 'Blocks', icon: FileText, terms: 'reference bibliography', apply: wrap('\\cite{', '}', 'key') },

  { id: 'math-inline', hint: 'A formula within the sentence', label: 'Inline math', group: 'Math', icon: Radical, apply: wrap('$', '$', 'x^2') },
  { id: 'math-block', hint: 'A numbered display equation', label: 'Equation', group: 'Math', icon: Sigma, apply: template('\\begin{equation}\n  $0$SEL\n\\end{equation}', 'E = mc^2') },
  { id: 'align', hint: 'Several lines aligned at &', label: 'Aligned equations', group: 'Math', icon: Braces, terms: 'multi line math', apply: template('\\begin{align}\n  $0a &= b \\\\\n  c &= d\n\\end{align}') },
  { id: 'matrix', hint: 'A bracketed matrix', label: 'Matrix', group: 'Math', icon: Table, apply: template('\\begin{equation}\n  \\begin{pmatrix}\n    $0a & b \\\\\n    c & d\n  \\end{pmatrix}\n\\end{equation}') },
  { id: 'gather', hint: 'Several centred equations', label: 'Gathered equations', group: 'Math', icon: Sigma, terms: 'gather multi', apply: template('\\begin{gather}\n  $0a = b \\\\\n  c = d\n\\end{gather}') },
  { id: 'fraction', hint: 'A fraction, inline', label: 'Fraction', group: 'Math', icon: Divide, terms: 'frac over', apply: wrap('$\\frac{', '}{b}$', 'a') },
  { id: 'date', hint: 'Today, written out', label: 'Today’s date', group: 'Insert', icon: CalendarDays, terms: 'now time day', apply: (doc, sel) => insertText(doc, sel, today()) },
  { id: 'cases', hint: 'A piecewise definition', label: 'Cases', group: 'Math', icon: Braces, terms: 'piecewise', apply: template('\\begin{equation}\n  f(x) = \\begin{cases}\n    $01 & x > 0 \\\\\n    0 & \\text{otherwise}\n  \\end{cases}\n\\end{equation}') },
];

/** Ids the toolbar shows, in order. Everything else lives in the `/` menu. */
/**
 * The formatting bar, as named groups.
 *
 * Named rather than separated by bare `'|'` markers because the bar is a
 * WAI-ARIA toolbar: each group is announced ("Text style, group") before its
 * buttons, which is what makes eighteen unlabelled icons navigable by
 * keyboard. The visual dividers fall out of the same structure, so the
 * grouping a sighted reader sees and the one a screen reader hears cannot
 * drift apart.
 */
/**
 * The bar, and what each group keeps behind its own chevron.
 *
 * Six actions the editor already implements — strikethrough, task lists,
 * dividers, callouts, collapsibles and footnotes — had no button at all and
 * were reachable only by typing `/`. Putting all twenty-one on one row is the
 * other failure: a wall of icons where nothing is findable because everything
 * is equally prominent.
 *
 * So `ids` is what stays on the bar and `more` is what sits under the group's
 * chevron. The split is by frequency, not by category — bold belongs on the
 * bar and a footnote does not, however neatly they file.
 */
export const TOOLBAR_GROUPS: { label: string; ids: string[]; more?: string[] }[] = [
  { label: 'Text style', ids: ['bold', 'italic', 'code'], more: ['strike'] },
  { label: 'Headings', ids: ['h1', 'h2', 'h3'] },
  { label: 'Lists and quotes', ids: ['ul', 'ol', 'quote'], more: ['task', 'hr'] },
  { label: 'Blocks', ids: ['codeblock', 'link', 'image', 'table'], more: ['callout', 'details', 'footnote'] },
  { label: 'Maths', ids: ['math-inline', 'math-block'] },
];

export function actionsFor(format: DocFormat): EditorAction[] {
  return format === 'latex' ? LATEX_ACTIONS : MDX_ACTIONS;
}

export function actionById(format: DocFormat, id: string): EditorAction | undefined {
  return actionsFor(format).find(a => a.id === id);
}
