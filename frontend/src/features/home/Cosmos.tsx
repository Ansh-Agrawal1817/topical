import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { buildGalaxy, buildSky, drawGalaxy, drawWeb, placeLabels, type SkyFrame } from './cosmos-engine';
import { lerp, Projector } from './scene/kit';
import { glowsFor, readPalette } from './scene/palette';
import { SKY_LINKS, SKY_TOPICS } from './capabilities';

/**
 * A quiet sky for a page that is not the voyage (the about page): one
 * fixed canvas, the galaxy seen whole and turning slowly, the camera easing
 * a little closer as the page scrolls, and the web of topics across it.
 *
 * Colours come from the `--cosmos-*` tokens and are re-read when the theme
 * changes. Under reduced motion it is drawn once and holds still.
 */
export function Cosmos() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !g) return;

    const compact = window.innerWidth < 640;
    const galaxy = buildGalaxy(compact ? 1800 : 3600, []);
    const sky = buildSky(compact ? 280 : 520);
    const labels = placeLabels(SKY_TOPICS);
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-serif').trim() || 'Georgia, serif';
    let pal = readPalette();
    let glows = glowsFor(pal);
    const P = new Projector();
    let width = 0;
    let height = 0;
    let spin = 0;
    let raf = 0;
    let last = performance.now();

    const draw = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const p = Math.min(1, window.scrollY / max);
      const dist = lerp(2.6, 1.9, p);
      P.setup(
        { target: [0, 0, 0], dist, tilt: lerp(0.45, 0.8, p), yaw: 0, roll: -0.16, cx: width / 2, cy: height * lerp(0.78, 0.6, p) },
        spin, width, height,
      );
      const frame: SkyFrame = { g, P, pal, glows, w: width, h: height, dist, flare: 0 };
      drawGalaxy(frame, galaxy, sky);
      drawWeb(frame, labels, SKY_LINKS, 0.55, font);
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      spin += Math.min(0.05, (now - last) / 1000) * 0.03;
      last = now;
      draw();
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };
    const start = () => {
      if (reduced || raf || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onScroll = () => { if (reduced) draw(); };

    const sizes = new ResizeObserver(resize);
    sizes.observe(canvas);
    const theme = new MutationObserver(() => { pal = readPalette(); glows = glowsFor(pal); draw(); });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.fonts?.ready.then(draw);
    resize();
    start();
    return () => {
      stop();
      sizes.disconnect();
      theme.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('scroll', onScroll);
    };
  }, [reduced]);

  return <canvas ref={ref} className="cosmos" aria-hidden="true" />;
}
