/**
 * The mark: an asterism, ⁂.
 *
 * Two meanings, both of them this product. In typography the asterism is the
 * old mark for a break between sections of a text — the unit Topical plans,
 * researches and writes in. In astronomy an asterism is a pattern of stars
 * someone noticed and named — which is what a topic is, in the sky of
 * everything that could be written about.
 *
 * The rays are deliberately uneven and each star is turned a little
 * differently, so it reads as drawn rather than typeset. The top star is the
 * largest: one topic, and the two that work it — you and the model — below.
 *
 * It replaced a terracotta tile with a serif "T" in it, which said "app icon"
 * and nothing else.
 */

type Star = { cx: number; cy: number; turn: number; rays: number[] };

// 24×24 box. Ray lengths are the star's own irregularity; `turn` is degrees.
const STARS: Star[] = [
  { cx: 12, cy: 6.4, turn: -90, rays: [4.2, 3.5, 3.9, 4.0, 3.6, 3.8] },
  { cx: 6.2, cy: 16.8, turn: 12, rays: [3.6, 3.2, 3.5, 3.7, 3.1, 3.4] },
  { cx: 17.8, cy: 16.8, turn: -18, rays: [3.4, 3.0, 3.3, 3.5, 3.0, 3.2] },
];

function starPath({ cx, cy, turn, rays }: Star) {
  return rays
    .map((len, i) => {
      const a = ((turn + i * 60) * Math.PI) / 180;
      const x = (cx + Math.cos(a) * len).toFixed(2);
      const y = (cy + Math.sin(a) * len).toFixed(2);
      return `M${cx} ${cy}L${x} ${y}`;
    })
    .join('');
}

const PATHS = STARS.map(starPath);

/**
 * The glyph alone. Sized by the font size it sits in (1em square).
 *
 * `alive` gives it a life of its own (pages.css): the rays draw out from
 * each centre when it first appears, then the top star — the topic — turns
 * slowly, and the two below it — you and the model — take turns, one
 * brightening as the other settles, like two people working the same page.
 */
export function BrandGlyph({ className = '', alive = false }: { className?: string; alive?: boolean }) {
  return (
    <svg
      className={`brand-glyph${alive ? ' brand-glyph--alive' : ''} ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS.map(d => (
        <g key={d} className="brand-life">
          <path className="brand-star" d={d} pathLength={1} />
        </g>
      ))}
    </svg>
  );
}

/**
 * The lockup: glyph and name, one measurement driving both (`--mark` in
 * pages.css), so scaling it never leaves the gap tuned for another size.
 */
export function BrandMark({ size = 'sm', alive = false }: { size?: 'sm' | 'md' | 'lg' | 'hero'; alive?: boolean }) {
  return (
    <span className={`brand-lockup brand-lockup--${size}`}>
      <BrandGlyph alive={alive} />
      <span className="font-brand brand-word">Topical</span>
    </span>
  );
}
