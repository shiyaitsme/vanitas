import { useEffect, useMemo, useRef, useState } from 'react'
import { framePath } from '../lib/thorns'

interface Props {
  seed?: number
  pad?: number
  active?: boolean
}

/** Barbed-wire frame drawn around the parent element. Parent must be positioned. */
export function ThornFrame({ seed = 3, pad = 64, active = false }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth / 8) * 8
      const h = Math.round(el.clientHeight / 8) * 8
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const geo = useMemo(() => (size.w > 0 ? framePath(size.w, size.h, seed) : null), [size, seed])

  return (
    <div ref={ref} className={`thorn-frame${active ? ' active' : ''}`} aria-hidden>
      {geo && (
        <svg
          width={size.w + pad * 2}
          height={size.h + pad * 2}
          viewBox={`${-pad} ${-pad} ${size.w + pad * 2} ${size.h + pad * 2}`}
          style={{ left: -pad, top: -pad }}
        >
          <path d={geo.lineA} className="tf-line" />
          <path d={geo.lineB} className="tf-line thin" />
          <path d={geo.thorns} className="tf-thorns" />
          {geo.gems.map((g, i) => (
            <g key={i} transform={`translate(${g.x} ${g.y}) rotate(${g.angle})`}>
              <ellipse rx="8" ry="12" className="tf-gem" />
              <ellipse rx="2" ry="4.5" cx="-2.5" cy="-2" className="tf-gem-hi" />
            </g>
          ))}
        </svg>
      )}
    </div>
  )
}
