// Placeholder 2D-canvas dissolve engine, used to judge look & feel in the prototype.
// It will be replaced by a WebGL2 implementation; the parameter model stays the same.
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
  n = 0
  w = 0
  h = 0
  cell = 4
  x = new Float32Array(0)
  y = new Float32Array(0)
  r = new Uint8Array(0)
  g = new Uint8Array(0)
  b = new Uint8Array(0)
  luma = new Float32Array(0)
  s1 = new Float32Array(0)
  s2 = new Float32Array(0)
  s3 = new Float32Array(0)

  src: HTMLCanvasElement | null = null
  lifeBuf = new Float32Array(0)

  build(source: HTMLCanvasElement, w: number, h: number, count: number, seed: number) {
    this.w = w
    this.h = h
    this.src = source
    const tmp = document.createElement('canvas')
    tmp.width = Math.max(1, Math.round(w))
    tmp.height = Math.max(1, Math.round(h))
    const tctx = tmp.getContext('2d', { willReadFrequently: true })!
    tctx.drawImage(source, 0, 0, tmp.width, tmp.height)
    const data = tctx.getImageData(0, 0, tmp.width, tmp.height).data
    const cell = Math.max(1.5, Math.sqrt((w * h) / count))
    this.cell = cell
    const rand = rng(seed * 9973 + 1)
    const max = Math.ceil((w / cell) * (h / cell)) + 8
    const x = new Float32Array(max)
    const y = new Float32Array(max)
    const r = new Uint8Array(max)
    const g = new Uint8Array(max)
    const b = new Uint8Array(max)
    const luma = new Float32Array(max)
    const s1 = new Float32Array(max)
    const s2 = new Float32Array(max)
    const s3 = new Float32Array(max)
    let n = 0
    for (let gy = cell / 2; gy < h; gy += cell) {
      for (let gx = cell / 2; gx < w; gx += cell) {
        const px = Math.min(tmp.width - 1, Math.floor(gx))
        const py = Math.min(tmp.height - 1, Math.floor(gy))
        const i = (py * tmp.width + px) * 4
        if (data[i + 3] < 24) continue
        x[n] = gx
        y[n] = gy
        r[n] = data[i]
        g[n] = data[i + 1]
        b[n] = data[i + 2]
        luma[n] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
        s1[n] = rand()
        s2[n] = rand()
        s3[n] = rand()
        n++
      }
    }
    this.n = n
    this.x = x
    this.y = y
    this.r = r
    this.g = g
    this.b = b
    this.luma = luma
    this.s1 = s1
    this.s2 = s2
    this.s3 = s3
    this.lifeBuf = new Float32Array(n)
  }

  render(ctx: CanvasRenderingContext2D, t: number, p: Params, dpr: number) {
    const { w, h, n, cell } = this
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.globalAlpha = 1
    if (n === 0 || !this.src) return

    // 1. the intact image, drawn crisp
    ctx.drawImage(this.src, 0, 0, ctx.canvas.width, ctx.canvas.height)

    const rad = (p.angle * Math.PI) / 180
    const dx = Math.cos(rad)
    const dy = Math.sin(rad)
    const cx = w / 2
    const cy = h / 2
    const diag = Math.hypot(w, h)
    const T = t * 1.2
    const t1 = hex(p.tint)
    const t2 = hex(p.tint2)
    const isTint = p.mode !== 'original'
    const baseSize = cell * 1.06
    ctx.font = `700 12px UnifrakturCook, serif`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    // 2. erase the cells that have started to leave
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const half = cell / 2 + 0.6
    for (let i = 0; i < n; i++) {
      const x0 = this.x[i]
      const y0 = this.y[i]
      const proj = ((x0 - cx) * dx + (y0 - cy) * dy) / diag + 0.5
      const noise = 0.5 + 0.5 * Math.sin(x0 * 0.018 + Math.sin(y0 * 0.023 + p.seed) * 2 + p.seed * 6)
      const delay = proj * 0.5 + noise * 0.18 + this.s1[i] * 0.08
      const life = clamp((T - delay) / 0.4)
      this.lifeBuf[i] = life
      if (life > 0) ctx.clearRect(x0 - half, y0 - half, half * 2, half * 2)
    }

    // 3. draw the flying particles
    for (let i = 0; i < n; i++) {
      const life = this.lifeBuf[i]
      if (life <= 0 || life >= 1) continue
      const x0 = this.x[i]
      const y0 = this.y[i]
      let r = this.r[i]
      let g = this.g[i]
      let b = this.b[i]

      // colour
      if (isTint) {
        const target = p.mode === 'gradient'
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

      // motion
      const s1 = this.s1[i]
      const s2 = this.s2[i]
      const s3 = this.s3[i]
      const d = Math.pow(life, 1.2) * diag * 0.38 * p.speed * (0.4 + s2 * 0.9)
      const side = (s3 - 0.5) * p.spread * d * 1.8
      const wob = Math.sin(life * 7 + s1 * 30) * p.turbulence * diag * 0.022 * life
      const x = x0 + dx * d - dy * side + wob * -dy
      const y = y0 + dy * d + dx * side + wob * dx + p.gravity * life * life * diag * 0.28

      const target = p.sizeMin + (p.sizeMax - p.sizeMin) * s2 * s2
      const z = (baseSize + (target - baseSize) * smooth(0, 0.2, life)) * (1 - p.decay * life * 0.85)
      const alpha = 1 - smooth(0.5, 1, life)
      const rot = s1 * 6.283 + life * (s2 - 0.5) * 9

      ctx.globalAlpha = alpha
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`
      const cs = Math.cos(rot) * dpr
      const sn = Math.sin(rot) * dpr
      ctx.setTransform(cs, sn, -sn, cs, x * dpr, y * dpr)

      switch (p.shape) {
        case 'square':
          ctx.fillRect(-z / 2, -z / 2, z, z)
          break
        case 'dot':
          ctx.beginPath()
          ctx.arc(0, 0, z * 0.5, 0, 6.283)
          ctx.fill()
          break
        case 'shard':
          ctx.beginPath()
          ctx.moveTo(-z * 0.5, -z * (0.2 + 0.4 * s1))
          ctx.lineTo(z * (0.6 + 0.5 * s2), z * 0.1)
          ctx.lineTo(-z * 0.1, z * (0.4 + 0.4 * s3))
          ctx.closePath()
          ctx.fill()
          break
        case 'petal':
          ctx.beginPath()
          ctx.ellipse(0, 0, z * 0.9, z * 0.4, 0, 0, 6.283)
          ctx.fill()
          break
        case 'thorn':
          ctx.beginPath()
          ctx.moveTo(-z * 0.2, -z * 0.15)
          ctx.quadraticCurveTo(z * 0.8, -z * 0.1, z * 1.7, 0)
          ctx.quadraticCurveTo(z * 0.8, z * 0.25, -z * 0.2, z * 0.15)
          ctx.fill()
          break
        case 'letter':
          ctx.font = `700 ${Math.max(6, z * 2.2)}px UnifrakturCook, serif`
          ctx.fillText(LETTERS[(s1 * LETTERS.length) | 0], 0, 0)
          break
      }
    }
    ctx.globalAlpha = 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
}
