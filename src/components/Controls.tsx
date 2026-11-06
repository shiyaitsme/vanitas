import { useRef } from 'react'
import type { CSSProperties, PointerEvent } from 'react'

interface SliderProps {
  label: string
  cn?: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  fmt?: (v: number) => string
}

export function Slider({ label, cn, value, min, max, step = 1, onChange, fmt }: SliderProps) {
  const p = ((value - min) / (max - min)) * 100
  return (
    <div className="sl">
      <div className="sl-h">
        <span className="sl-l">
          {label}
          {cn && <i className="cn">{cn}</i>}
        </span>
        <span className="mono">{fmt ? fmt(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--p': `${p}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function Chips<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; en: string; cn?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="chips">
      {items.map((it) => (
        <button key={it.id} className={`chip ${value === it.id ? 'on' : ''}`} onClick={() => onChange(it.id)}>
          <span>{it.en}</span>
          {it.cn && <i className="cn">{it.cn}</i>}
        </button>
      ))}
    </div>
  )
}

export function Swatches({
  colors,
  value,
  onChange,
}: {
  colors: { hex: string; name: string }[]
  value: string
  onChange: (hex: string) => void
}) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c.hex}
          title={c.name}
          aria-label={c.name}
          className={`swatch ${value.toLowerCase() === c.hex.toLowerCase() ? 'on' : ''}`}
          style={{ background: c.hex }}
          onClick={() => onChange(c.hex)}
        />
      ))}
    </div>
  )
}

/** Circular direction picker with a thorn-shaped needle. 0° points right, 90° points down. */
export function Dial({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<SVGSVGElement>(null)
  const set = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    let a = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI
    if (a < 0) a += 360
    onChange(Math.round(a))
  }
  return (
    <div className="dial">
      <svg
        ref={ref}
        viewBox="-70 -70 140 140"
        width="140"
        height="140"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          set(e)
        }}
        onPointerMove={(e) => e.buttons && set(e)}
      >
        <circle r="56" className="dial-ring" />
        <circle r="50" className="dial-ring thin" />
        {Array.from({ length: 36 }, (_, i) => (
          <line key={i} x1="0" y1={i % 3 === 0 ? -58 : -56} x2="0" y2={i % 3 === 0 ? -66 : -62} transform={`rotate(${i * 10})`} className="dial-tick" />
        ))}
        <g transform={`rotate(${value})`}>
          <path d="M0 -3 Q30 -5 54 0 Q30 5 0 3Z" className="dial-needle" />
          <path d="M-24 -1.2 L0 -1.2 L0 1.2 L-24 1.2Z" className="dial-needle" opacity=".35" />
        </g>
        <circle r="5" className="dial-gem" />
      </svg>
      <div className="dial-read">
        <span className="mono big">{String(value).padStart(3, '0')}°</span>
        <i className="cn">拖动旋转</i>
      </div>
    </div>
  )
}
