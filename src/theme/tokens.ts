/**
 * Design tokens extracted verbatim from the original prototype's :root block
 * (the two <style> blocks were byte-identical for these values). This file is
 * the single source of truth:
 * tailwind.config.ts reads it for utility classes, theme.css mirrors it as
 * CSS custom properties for hand-written component CSS.
 */

export const colors = {
  paper: '#F2EEE4',
  'paper-2': '#E9E2D2',
  card: '#FCFAF3',
  ink: '#17140F',
  'ink-soft': '#6B6454',
  rule: '#DAD2BF',
  'rule-2': '#BEB49B',
  sun: '#B26A12',
  settle: '#245C43',
  volt: '#0d6625',
  bolt: '#1A6B2E',
  void: '#A31E17',
} as const

/**
 * The same tokens as RGB-triple strings, for composing `rgba(r,g,b,a)` in
 * Canvas 2D (which takes literal colour strings). Mirrors `colors` exactly —
 * change a hex token, update its triple here.
 */
export const rgb = {
  ink: '23,20,15',
  'rule-2': '190,178,155',
  sun: '178,106,18',
  settle: '36,92,67',
} as const

export const fonts = {
  sans: ['Archivo', 'system-ui', 'sans-serif'],
  serif: ['"Instrument Serif"', 'Georgia', 'serif'],
  mono: ['"Spline Sans Mono"', 'monospace'],
} as const

export const layout = {
  containerMax: '1200px',
  containerPadX: '40px',
  headerHeight: '66px',
} as const

export const easing = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const
