import type { Shape } from '../lib/dissolve'

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinejoin: 'miter' as const,
}

export const IconAuto = () => (
  <svg {...base}>
    <path d="M5 3 L5 18 L9 14 L12 21 L14.5 20 L11.5 13 L17 13 Z" />
    <path d="M19 2 L19.8 4.6 L22.4 5.4 L19.8 6.2 L19 8.8 L18.2 6.2 L15.6 5.4 L18.2 4.6Z" fill="currentColor" stroke="none" />
  </svg>
)
export const IconBrush = () => (
  <svg {...base}>
    <path d="M4 21 L5 16 L16 5 L19 8 L8 19 Z" />
    <path d="M14 7 L17 10" />
  </svg>
)
export const IconLasso = () => (
  <svg {...base}>
    <path d="M5 9 L12 4 L20 8 L18 15 L10 18 L6 14 Z" strokeDasharray="2.5 2" />
    <path d="M10 18 L8 22" />
  </svg>
)
export const IconEraser = () => (
  <svg {...base}>
    <path d="M4 15 L12 5 L20 11 L13 20 L7 20 Z" />
    <path d="M8 10 L16 16" />
  </svg>
)
export const IconPlay = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <path d="M7 4 L20 12 L7 20 Z" />
  </svg>
)
export const IconPause = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <path d="M6 4 H10 V20 H6Z M14 4 H18 V20 H14Z" />
  </svg>
)
export const IconLoop = () => (
  <svg {...base}>
    <path d="M4 11 V8 H18 L15 5 M20 13 V16 H6 L9 19" />
  </svg>
)
export const IconPanel = () => (
  <svg {...base}>
    <path d="M3 4 H21 V20 H3Z M15 4 V20" />
  </svg>
)

export function ShapeGlyph({ shape }: { shape: Shape }) {
  const p = { width: 34, height: 34, viewBox: '-17 -17 34 34', fill: 'currentColor' }
  switch (shape) {
    case 'square':
      return <svg {...p}><rect x="-8" y="-8" width="16" height="16" /></svg>
    case 'shard':
      return <svg {...p}><path d="M-9 -4 L11 2 L-2 10Z" /></svg>
    case 'petal':
      return <svg {...p}><ellipse rx="12" ry="5.5" transform="rotate(-30)" /></svg>
    case 'dot':
      return <svg {...p}><circle r="7" /></svg>
    case 'thorn':
      return <svg {...p}><path d="M-10 -3 Q4 -3 13 0 Q4 4 -10 3Z" transform="rotate(-25)" /></svg>
    case 'letter':
      return (
        <svg {...p}>
          <text textAnchor="middle" dominantBaseline="central" fontFamily="UnifrakturCook, serif" fontSize="26" fontWeight="700">
            a
          </text>
        </svg>
      )
  }
}

const cursorSvg =
  "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><path d='M16 1 L17.3 13 L16 16 L14.7 13Z M16 31 L17.3 19 L16 16 L14.7 19Z M1 16 L13 14.7 L16 16 L13 17.3Z M31 16 L19 14.7 L16 16 L19 17.3Z' fill='black' stroke='white' stroke-width='.6'/><circle cx='16' cy='16' r='2' fill='#F2A7C3' stroke='black' stroke-width='.9'/></svg>"
export const THORN_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent(cursorSvg)}") 16 16, crosshair`
