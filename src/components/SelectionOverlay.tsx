import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent, RefObject } from 'react'
import { containRect, mk } from '../lib/selection'
import { THORN_CURSOR } from './Icons'

type Tool = 'auto' | 'brush' | 'lasso' | 'erase'

interface Props {
  baseRef: RefObject<HTMLCanvasElement | null>
  maskRef: RefObject<HTMLCanvasElement | null>
  w: number
  h: number
  tool: Tool
  /** brush diameter in stage (CSS) pixels */
  brush: number
  /** draw the pink selection tint */
  visible: boolean
  /** bump to force a redraw after the mask changed from outside */
  tick: number
  onStart: () => void
  onCommit: () => void
  onAuto: (p: { x: number; y: number }) => void
}

const TINT = 'rgba(242,167,195,0.58)'

export function SelectionOverlay({ baseRef, maskRef, w, h, tool, brush, visible, tick, onStart, onCommit, onAuto }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tintRef = useRef<HTMLCanvasElement | null>(null)
  const posRef = useRef<{ x: number; y: number } | null>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const lassoRef = useRef<{ x: number; y: number }[]>([])
  const dprRef = useRef(1)

  const fit = useCallback(() => {
    const base = baseRef.current
    return base ? containRect(base.width, base.height, w, h) : null
  }, [baseRef, w, h])

  const redraw = useCallback(() => {
    const c = canvasRef.current
    const mask = maskRef.current
    const r = fit()
    if (!c || !mask || !r || c.width < 1 || c.height < 1) return
    const dpr = dprRef.current
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    if (visible) {
      let tint = tintRef.current
      if (!tint) tint = tintRef.current = mk(1, 1)
      if (tint.width !== c.width || tint.height !== c.height) {
        tint.width = c.width
        tint.height = c.height
      }
      const tctx = tint.getContext('2d')!
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      tctx.globalCompositeOperation = 'source-over'
      tctx.clearRect(0, 0, w, h)
      tctx.drawImage(mask, r.x, r.y, r.w, r.h)
      tctx.globalCompositeOperation = 'source-in'
      tctx.fillStyle = TINT
      tctx.fillRect(0, 0, w, h)
      tctx.globalCompositeOperation = 'source-over'
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(tint, 0, 0)
      ctx.restore()
    }

    // lasso preview
    const pts = lassoRef.current
    if (tool === 'lasso' && pts.length > 1) {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (const p of pts) ctx.lineTo(p.x, p.y)
      ctx.strokeStyle = '#0e0e0e'
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // brush ring
    const pos = posRef.current
    if (pos && (tool === 'brush' || tool === 'erase')) {
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, brush / 2, 0, Math.PI * 2)
      ctx.lineWidth = 1.4
      ctx.strokeStyle = '#0e0e0e'
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, brush / 2 + 1.6, 0, Math.PI * 2)
      ctx.lineWidth = 1
      ctx.strokeStyle = tool === 'erase' ? 'rgba(255,255,255,0.9)' : TINT
      ctx.stroke()
    }
  }, [fit, maskRef, w, h, visible, tool, brush])

  // size the backing store
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    dprRef.current = dpr
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    redraw()
  }, [w, h, redraw])

  useEffect(() => {
    redraw()
  }, [tick, redraw])

  const local = (e: PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const toBase = (p: { x: number; y: number }) => {
    const r = fit()!
    return { x: (p.x - r.x) / r.s, y: (p.y - r.y) / r.s }
  }

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const mask = maskRef.current
    const r = fit()
    if (!mask || !r) return
    const ctx = mask.getContext('2d')!
    ctx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = brush / r.s
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }

  const onDown = (e: PointerEvent) => {
    if (tool === 'auto') {
      onAuto(toBase(local(e)))
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    onStart()
    const p = local(e)
    posRef.current = p
    if (tool === 'lasso') {
      lassoRef.current = [p]
    } else {
      const b = toBase(p)
      lastRef.current = b
      stroke(b, b)
    }
    redraw()
  }

  const onMove = (e: PointerEvent) => {
    const p = local(e)
    posRef.current = p
    if (drawingRef.current) {
      if (tool === 'lasso') {
        lassoRef.current.push(p)
      } else if (lastRef.current) {
        const b = toBase(p)
        stroke(lastRef.current, b)
        lastRef.current = b
      }
    }
    redraw()
  }

  const finish = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const mask = maskRef.current
    if (tool === 'lasso') {
      const pts = lassoRef.current
      if (mask && pts.length > 2) {
        const ctx = mask.getContext('2d')!
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        pts.forEach((q, i) => {
          const b = toBase(q)
          if (i === 0) ctx.moveTo(b.x, b.y)
          else ctx.lineTo(b.x, b.y)
        })
        ctx.closePath()
        ctx.fill()
      }
      lassoRef.current = []
    }
    lastRef.current = null
    onCommit()
  }

  const cursor = tool === 'brush' || tool === 'erase' ? 'none' : THORN_CURSOR

  return (
    <canvas
      ref={canvasRef}
      className="sel-overlay"
      style={{ width: w, height: h, cursor }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onPointerLeave={() => {
        if (!drawingRef.current) {
          posRef.current = null
          redraw()
        }
      }}
    />
  )
}
