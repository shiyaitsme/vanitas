// Canvas2D dissolve engine. Works in device pixels.
// Input: an `obj` layer (only the selected pixels) and a `bg` layer (everything else, hole filled).
// Particle position at time t is a pure function of (particle, t, params), so scrubbing and
// frame-accurate export need no accumulated simulation state.
import { rng } from './thorns'

export type Shape = 'square' | 'shard' | 'petal' | 'dot' | 'thorn' | 'letter'
export type ColorMode = 'original' | 'tint' | 'gradient'

export interface Params {
  mode: ColorMode
  tint: string
  tint2: string
  glow: number
  angle: number
  spread: number
  gravity: number
  turbulence: number
  speed: number
  sizeMin: number
  sizeMax: number
  decay: number
  count: number
  shape: Shape
  seed: number
}

export const DEFAULT_PARAMS: Params = {
  mode: 'original',
  tint: '#0E0E0E',
  tint2: '#F2A7C3',
  glow: 0.5,
  angle: 0,
  spread: 0.5,
  gravity: 0.2,
  turbulence: 0.4,
  speed: 0.8,
  sizeMin: 2,
  sizeMax: 9,
  decay: 0.5,
  count: 24000,
  shape: 'shard',
  seed: 7,
}

const PINK: [number, number, number] = [242, 167, 195]
const LETTERS = 'ashenvmortis'

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export class Dissolver {
  W = 0
  H = 0
  n = 0
  cell = 4
  obj: HTMLCanvasElement | null = null
  bg: HTMLCanvasElement | null = null
  layer: HTMLCanvasElement | null = null
  /** one pixel per particle cell; scaled up with smoothing to cut soft-edged holes in the intact layer */
  holes: HTMLCanvasElement | null = null
  gw = 0
  gh = 0
  minX = 0
  maxX = 0
  minY = 0
  maxY = 0
  x = new Float32Array(0)
  y = new Float32Array(0)
  r = new Uint8Array(0)
  g = new Uint8Array(0)
  b = new Uint8Array(0)
  luma = new Float32Array(0)
  s1 = new Float32Array(0)
  s2 = new Float32Array(0)
  s3 = new Float32Array(0)
  life = new Float32Array(0)
  cellIdx = new Int32Array(0)
  /** 255 for grid cells that hold no particle (outside the object), so the soft hole never leaves a rim there */
  outside = new Uint8Array(0)
  /** keep particles fully opaque and shrink them away instead of fading (no colour bleed over a green-screen matte) */
  solid = false
  /** 0..1 depth-of-field: far-flying particles are drawn on a separate layer and blurred */
  depth = 0
  far: HTMLCanvasElement | null = null

  /** Number of selected pixels sampled into particles (0 when nothing is selected). */
  get count() {
    return this.n
  }

  build(obj: HTMLCanvasElement, bg: HTMLCanvasElement | null, count: number, seed: number) {
    const W = obj.width
    const H = obj.height
    this.W = W
    this.H = H
    this.obj = obj
    this.bg = bg
    if (!this.layer) this.layer = document.createElement('canvas')
    this.layer.width = W
    this.layer.height = H
    if (!this.holes) this.holes = document.createElement('canvas')

    const data = obj.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data

    // estimate object area so the particle count adapts to object size
    let hits = 0
    for (let y = 0; y < H; y += 3) {
      for (let x = 0; x < W; x += 3) if (data[(y * W + x) * 4 + 3] > 24) hits++
    }
    const area = Math.max(1, hits * 9)
    const cell = Math.max(1.2, Math.sqrt(area / count))
    this.cell = cell
    this.gw = Math.ceil(W / cell)
    this.gh = Math.ceil(H / cell)
    this.holes!.width = this.gw
    this.holes!.height = this.gh

    const rand = rng(seed * 9973 + 1)
    const max = Math.ceil((W / cell) * (H / cell)) + 8
    const x = new Float32Array(max)
    const y = new Float32Array(max)
    const r = new Uint8Array(max)
    const g = new Uint8Array(max)
    const b = new Uint8Array(max)
    const luma = new Float32Array(max)
    const s1 = new Float32Array(max)
    const s2 = new Float32Array(max)
    const s3 = new Float32Array(max)
    const idx = new Int32Array(max)
    let n = 0
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (let gy = cell / 2; gy < H; gy += cell) {
      for (let gx = cell / 2; gx < W; gx += cell) {
        const px = Math.min(W - 1, Math.floor(gx))
        const py = Math.min(H - 1, Math.floor(gy))
        const i = (py * W + px) * 4
        if (data[i + 3] < 24) continue
        x[n] = gx
        y[n] = gy
        idx[n] = Math.floor(gy / cell) * this.gw + Math.floor(gx / cell)
        r[n] = data[i]
        g[n] = data[i + 1]
        b[n] = data[i + 2]
        luma[n] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
        s1[n] = rand()
        s2[n] = rand()
        s3[n] = rand()
        if (gx < minX) minX = gx
        if (gx > maxX) maxX = gx
        if (gy < minY) minY = gy
        if (gy > maxY) maxY = gy
        n++
      }
    }
    this.n = n
    this.minX = n ? minX : 0
    this.maxX = n ? maxX : 0
    this.minY = n ? minY : 0
    this.maxY = n ? maxY : 0
    this.x = x
    this.y = y
    this.r = r
    this.g = g
    this.b = b
    this.luma = luma
    this.s1 = s1
    this.s2 = s2
    this.s3 = s3
    this.life = new Float32Array(n)
    this.cellIdx = idx
    const outside = new Uint8Array(this.gw * this.gh).fill(255)
    for (let i = 0; i < n; i++) outside[idx[i]] = 0
    this.outside = outside
  }

  render(ctx: CanvasRenderingContext2D, t: number, p: Params, dpr: number) {
    const { W, H, n, cell } = this
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    if (this.bg) ctx.drawImage(this.bg, 0, 0)
    if (!this.obj || !this.layer || n === 0) return

    const rad = (p.angle * Math.PI) / 180
    const dx = Math.cos(rad)
    const dy = Math.sin(rad)

    // dissolve front sweeps exactly across the object's own extent
    const bcx = (this.minX + this.maxX) / 2
    const bcy = (this.minY + this.maxY) / 2
    let pmin = Infinity
    let pmax = -Infinity
    for (const X of [this.minX, this.maxX]) {
      for (const Y of [this.minY, this.maxY]) {
        const v = (X - bcx) * dx + (Y - bcy) * dy
        if (v < pmin) pmin = v
        if (v > pmax) pmax = v
      }
    }
    const span = Math.max(1, pmax - pmin)
    const T = t * 1.2
    const inv = 1 / dpr

    // 1. intact part of the object, with released cells punched out
    const lctx = this.layer.getContext('2d')!
    lctx.setTransform(1, 0, 0, 1, 0, 0)
    lctx.globalCompositeOperation = 'source-over'
    lctx.clearRect(0, 0, W, H)
    lctx.drawImage(this.obj, 0, 0)
    const { gw, gh } = this
    const hctx = this.holes!.getContext('2d')!
    const hd = hctx.createImageData(gw, gh)
    for (let j = 0; j < gw * gh; j++) hd.data[j * 4 + 3] = this.outside[j]
    for (let i = 0; i < n; i++) {
      const x0 = this.x[i]
      const y0 = this.y[i]
      const proj = ((x0 - bcx) * dx + (y0 - bcy) * dy - pmin) / span
      const noise = 0.5 + 0.5 * Math.sin(x0 * inv * 0.018 + Math.sin(y0 * inv * 0.023 + p.seed) * 2 + p.seed * 6)
      const delay = proj * 0.5 + noise * 0.18 + this.s1[i] * 0.08
      const life = clamp((T - delay) / 0.4)
      this.life[i] = life
      if (life > 0) hd.data[this.cellIdx[i] * 4 + 3] = 255
    }
    hctx.putImageData(hd, 0, 0)
    // the grid is upscaled with smoothing, so the eaten-away edge is soft instead of blocky
    lctx.globalCompositeOperation = 'destination-out'
    lctx.imageSmoothingEnabled = true
    lctx.imageSmoothingQuality = 'high'
    lctx.drawImage(this.holes!, 0, 0, gw, gh, 0, 0, gw * cell, gh * cell)
    lctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(this.layer, 0, 0)

    // 2. flying particles
    const D = 0.5 * (Math.hypot(W, H) + Math.hypot(this.maxX - this.minX, this.maxY - this.minY))
    const t1 = hex(p.tint)
    const t2 = hex(p.tint2)
    const isTint = p.mode !== 'original'
    const baseSize = cell * 1.06
    const sMin = p.sizeMin * dpr
    const sMax = p.sizeMax * dpr
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    let fctx: CanvasRenderingContext2D | null = null
    if (this.depth > 0.005) {
      if (!this.far) this.far = document.createElement('canvas')
      if (this.far.width !== W || this.far.height !== H) {
        this.far.width = W
        this.far.height = H
      }
      fctx = this.far.getContext('2d')!
      fctx.setTransform(1, 0, 0, 1, 0, 0)
      fctx.globalAlpha = 1
      fctx.clearRect(0, 0, W, H)
      fctx.textBaseline = 'middle'
      fctx.textAlign = 'center'
    }
    for (let i = 0; i < n; i++) {
      const life = this.life[i]
      if (life <= 0 || life >= 1) continue
      const c = fctx && life > 0.4 ? fctx : ctx
      const x0 = this.x[i]
      const y0 = this.y[i]
      let r = this.r[i]
      let g = this.g[i]
      let b = this.b[i]

      if (isTint) {
        const target =
          p.mode === 'gradient'
            ? [t1[0] + (t2[0] - t1[0]) * life, t1[1] + (t2[1] - t1[1]) * life, t1[2] + (t2[2] - t1[2]) * life]
            : t1
        const shade = 0.35 + 0.65 * this.luma[i]
        const k = smooth(0, 0.18, life)
        r += (target[0] * shade - r) * k
        g += (target[1] * shade - g) * k
        b += (target[2] * shade - b) * k
      }
      if (p.glow > 0 && life < 0.25) {
        const k = p.glow * (1 - life / 0.25)
        r += (PINK[0] - r) * k
        g += (PINK[1] - g) * k
        b += (PINK[2] - b) * k
      }

      const s1 = this.s1[i]
      const s2 = this.s2[i]
      const s3 = this.s3[i]
      const d = Math.pow(life, 1.2) * D * 0.38 * p.speed * (0.4 + s2 * 0.9)
      const side = (s3 - 0.5) * p.spread * d * 1.8
      const wob = Math.sin(life * 7 + s1 * 30) * p.turbulence * D * 0.022 * life
      const x = x0 + dx * d - dy * side - wob * dy
      const y = y0 + dy * d + dx * side + wob * dx + p.gravity * life * life * D * 0.28

      const target = sMin + (sMax - sMin) * s2 * s2
      const z =
        (baseSize + (target - baseSize) * smooth(0, 0.2, life)) *
        (1 - p.decay * life * 0.85) *
        (this.solid ? 1 - smooth(0.6, 1, life) : 1)
      const rot = s1 * 6.283 + life * (s2 - 0.5) * 9
      const cs = Math.cos(rot)
      const sn = Math.sin(rot)

      // tumbling facets catch the light: brighten and darken with the particle's angle
      const lit = 1 + 0.22 * Math.sin(rot * 1.7 + s3 * 6.283) * smooth(0, 0.15, life)
      r = Math.min(255, r * lit)
      g = Math.min(255, g * lit)
      b = Math.min(255, b * lit)

      c.globalAlpha = this.solid ? 1 : 1 - smooth(0.5, 1, life)
      c.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`
      c.setTransform(cs, sn, -sn, cs, x, y)

      switch (p.shape) {
        case 'square':
          c.fillRect(-z / 2, -z / 2, z, z)
          break
        case 'dot':
          c.beginPath()
          c.arc(0, 0, z * 0.5, 0, 6.283)
          c.fill()
          break
        case 'shard':
          c.beginPath()
          c.moveTo(-z * 0.5, -z * (0.2 + 0.4 * s1))
          c.lineTo(z * (0.6 + 0.5 * s2), z * 0.1)
          c.lineTo(-z * 0.1, z * (0.4 + 0.4 * s3))
          c.closePath()
          c.fill()
          break
        case 'petal':
          c.beginPath()
          c.ellipse(0, 0, z * 0.9, z * 0.4, 0, 0, 6.283)
          c.fill()
          break
        case 'thorn':
          c.beginPath()
          c.moveTo(-z * 0.2, -z * 0.15)
          c.quadraticCurveTo(z * 0.8, -z * 0.1, z * 1.7, 0)
          c.quadraticCurveTo(z * 0.8, z * 0.25, -z * 0.2, z * 0.15)
          c.fill()
          break
        case 'letter':
          c.font = `700 ${Math.max(6 * dpr, z * 2.2)}px UnifrakturCook, serif`
          c.fillText(LETTERS[(s1 * LETTERS.length) | 0], 0, 0)
          break
      }
    }
    if (fctx && this.far) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = 1
      ctx.filter = `blur(${(this.depth * 3.2 * dpr).toFixed(2)}px)`
      ctx.drawImage(this.far, 0, 0)
      ctx.filter = 'none'
    }
    ctx.globalAlpha = 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
}
