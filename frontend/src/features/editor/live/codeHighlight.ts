import { common, createLowlight } from 'lowlight';

/**
 * Syntax colours for fenced code in the live page.
 *
 * The read view has always coloured code (rehype-highlight); the live page
 * set it in a flat grey, so the same block looked like two different things
 * depending on the mode. This runs the same highlighter — lowlight, with
 * highlight.js's common languages — and hands back token spans for the
 * surface to mark with the same `.hljs-*` classes, so both modes share one
 * palette (tokens.css).
 */

const lowlight = createLowlight(common);

/** A coloured run inside the code: offsets into the code text, and its classes. */
export type CodeToken = [from: number, to: number, className: string];

type HastNode = {
  type: string;
  value?: string;
  properties?: { className?: string[] };
  children?: HastNode[];
};

/** The same block re-renders on every caret move; highlighting it once is enough. */
const cache = new Map<string, CodeToken[]>();
const CACHE_SIZE = 120;

/** Language aliases writers actually type on a fence. */
const ALIASES: Record<string, string> = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', shell: 'bash', yml: 'yaml', md: 'markdown' };

export function codeLanguage(info: string): string | null {
  const name = info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const lang = ALIASES[name] ?? name;
  return lang && lowlight.registered(lang) ? lang : null;
}

export function highlightCode(lang: string, code: string): CodeToken[] {
  const key = `${lang}\u0000${code}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const tokens: CodeToken[] = [];
  let offset = 0;
  const walk = (node: HastNode, classes: string[]) => {
    if (node.type === 'text') {
      const length = node.value?.length ?? 0;
      if (classes.length && length) tokens.push([offset, offset + length, classes.join(' ')]);
      offset += length;
      return;
    }
    const own = node.properties?.className ?? [];
    for (const child of node.children ?? []) walk(child, own.length ? [...classes, ...own] : classes);
  };
  try {
    walk(lowlight.highlight(lang, code) as unknown as HastNode, []);
  } catch {
    // A grammar that throws on odd input leaves the block plain, never broken.
  }

  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  cache.set(key, tokens);
  return tokens;
}
