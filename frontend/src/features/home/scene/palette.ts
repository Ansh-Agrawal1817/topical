/**
 * The sky's colours, read from the `--cosmos-*` tokens so the light theme
 * draws a star atlas and the dark theme a night sky from the same code, and
 * the soft round sprites every glow is stamped from.
 */

export interface Palette {
  ground: string
  star: string
  dust: string
  ember: string
  gold: string
  ring: string
  label: string
  /** The Earth: its ocean in the light and away from it, its land, its air. */
  sea: string
  deep: string
  land: string
  air: string
  /** Additive glow is right for light on black and wrong for ink on paper. */
  dark: boolean
}

export function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    ground: v('--cosmos-ground'),
    star: v('--cosmos-star'),
    dust: v('--cosmos-dust'),
    ember: v('--cosmos-ember'),
    gold: v('--cosmos-gold'),
    ring: v('--cosmos-ring'),
    label: v('--cosmos-label'),
    sea: v('--cosmos-sea'),
    deep: v('--cosmos-deep'),
    land: v('--cosmos-land'),
    air: v('--cosmos-air'),
    dark: document.documentElement.dataset.theme === 'dark',
  }
}

export interface Glows {
  star: HTMLCanvasElement
  ember: HTMLCanvasElement
  gold: HTMLCanvasElement
}

export function makeGlow(colour: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, colour)
  grad.addColorStop(0.18, colour)
  grad.addColorStop(1, 'transparent')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return c
}

export const glowsFor = (pal: Palette): Glows => ({
  star: makeGlow(pal.star),
  ember: makeGlow(pal.ember),
  gold: makeGlow(pal.gold),
})
