// Backdrop compositing: place the object on a backdrop image and pull its colours toward the backdrop's
// (Reinhard colour transfer in the l-alpha-beta space), so the two read as one photograph.

export interface Scene {
  backdrop: HTMLCanvasElement
  /** 0..1 strength of the colour match */
  match: number
  /** object size relative to "fit the stage" */
  scale: number
  /** object offset as a fraction of the stage width / height */
  x: number
  y: number
  /** 0..1 backdrop colours spilling over the object's edge */
  wrap: number
  /** 0..1 lighten the side facing the backdrop's brightest area, dim the other */
  light: number
  /** 0..1 blur on flying particles, growing with distance */
  depth: number
  /** 0..1 fade the object out toward the photo's own frame edges, so a cut-off crop blends into the backdrop */
  fade: number
}

const SRGB_TO_LIN = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  SRGB_TO_LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
const toSrgb = (l: number) => {
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, c * 255 + 0.5))
}

const S3 = Math.sqrt(3)
const S6 = Math.sqrt(6)
const S2 = Math.SQRT2
const LOG_EPS = 1e-4

/** sRGB bytes -> [l, a, b] */
function toLab(r: number, g: number, b: number, out: Float32Array | number[]) {
  const R = SRGB_TO_LIN[r], G = SRGB_TO_LIN[g], B = SRGB_TO_LIN[b]
  const L = Math.log10(Math.max(LOG_EPS, 0.3811 * R + 0.5783 * G + 0.0402 * B))
  const M = Math.log10(Math.max(LOG_EPS, 0.1967 * R + 0.7244 * G + 0.0782 * B))
  const S = Math.log10(Math.max(LOG_EPS, 0.0241 * R + 0.1288 * G + 0.8444 * B))
  out[0] = (L + M + S) / S3
  out[1] = (L + M - 2 * S) / S6
  out[2] = (L - M) / S2
}

function fromLab(l: number, a: number, b: number): [number, number, number] {
  const L = Math.pow(10, l / S3 + a / S6 + b / S2)
  const M = Math.pow(10, l / S3 + a / S6 - b / S2)
  const S = Math.pow(10, l / S3 - (2 * a) / S6)
  return [
    toSrgb(4.4679 * L - 3.5873 * M + 0.1193 * S),
    toSrgb(-1.2186 * L + 2.3809 * M - 0.1624 * S),
    toSrgb(0.0497 * L - 0.2439 * M + 1.2045 * S),
  ]
}

function stats(c: HTMLCanvasElement, maxSide: number, needAlpha: boolean) {
  const s = Math.min(1, maxSide / Math.max(c.width, c.height))
  const w = Math.max(1, Math.round(c.width * s))
  const h = Math.max(1, Math.round(c.height * s))
  const t = document.createElement('canvas')
  t.width = w
  t.height = h
  const ctx = t.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(c, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h).data
  const mean = [0, 0, 0]
  const sq = [0, 0, 0]
  const v = [0, 0, 0]
  let n = 0
  for (let i = 0; i < d.length; i += 4) {
    if (needAlpha && d[i + 3] < 200) continue
    toLab(d[i], d[i + 1], d[i + 2], v)
    for (let k = 0; k < 3; k++) {
      mean[k] += v[k]
      sq[k] += v[k] * v[k]
    }
    n++
  }
  if (n === 0) return null
  const std = [0, 1, 2].map((k) => Math.sqrt(Math.max(1e-8, sq[k] / n - (mean[k] / n) ** 2)))
  return { mean: mean.map((m) => m / n), std }
}

/** Shift the colours of `obj` (in place, alpha untouched) toward those of `backdrop` by `strength` (0..1). */
export function matchColors(obj: HTMLCanvasElement, backdrop: HTMLCanvasElement, strength: number) {
  if (strength <= 0.005) return
  const tb = stats(backdrop, 96, false)
  const to = stats(obj, 160, true)
  if (!tb || !to) return
  const ratio = [0, 1, 2].map((k) => Math.min(1.5, Math.max(0.6, tb.std[k] / to.std[k])))
  const ctx = obj.getContext('2d', { willReadFrequently: true })!
  const img = ctx.getImageData(0, 0, obj.width, obj.height)
  const d = img.data
  const v = [0, 0, 0]
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    toLab(d[i], d[i + 1], d[i + 2], v)
    const l = v[0] + (tb.mean[0] + (v[0] - to.mean[0]) * ratio[0] - v[0]) * strength
    const a = v[1] + (tb.mean[1] + (v[1] - to.mean[1]) * ratio[1] - v[1]) * strength
    const b = v[2] + (tb.mean[2] + (v[2] - to.mean[2]) * ratio[2] - v[2]) * strength
    const rgb = fromLab(l, a, b)
    d[i] = rgb[0]
    d[i + 1] = rgb[1]
    d[i + 2] = rgb[2]
  }
  ctx.putImageData(img, 0, 0)
}

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Pixels where the object is opaque: bounding box (stage px) or null. */
function bounds(obj: HTMLCanvasElement) {
  const s = Math.min(1, 200 / Math.max(obj.width, obj.height))
  const t = canvas(Math.max(1, Math.round(obj.width * s)), Math.max(1, Math.round(obj.height * s)))
  const ctx = t.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(obj, 0, 0, t.width, t.height)
  const d = ctx.getImageData(0, 0, t.width, t.height).data
  let x0 = t.width, y0 = t.height, x1 = -1, y1 = -1
  for (let y = 0; y < t.height; y++)
    for (let x = 0; x < t.width; x++)
      if (d[(y * t.width + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  if (x1 < 0) return null
  return { x0: x0 / s, y0: y0 / s, x1: (x1 + 1) / s, y1: (y1 + 1) / s }
}

/**
 * Relight the object from the side where the backdrop is brightest: the lit side gets lifted, the far side dims.
 * `amount` 0..1.
 */
export function relight(obj: HTMLCanvasElement, backdrop: HTMLCanvasElement, amount: number) {
  if (amount <= 0.005) return
  const t = canvas(48, 48)
  const bctx = t.getContext('2d', { willReadFrequently: true })!
  bctx.drawImage(backdrop, 0, 0, 48, 48)
  const bd = bctx.getImageData(0, 0, 48, 48).data
  let sx = 0, sy = 0, sw = 0
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const i = (y * 48 + x) * 4
      const l = (0.299 * bd[i] + 0.587 * bd[i + 1] + 0.114 * bd[i + 2]) / 255
      const w = l * l * l
      sx += (x / 47 - 0.5) * w
      sy += (y / 47 - 0.5) * w
      sw += w
    }
  if (sw <= 0) return
  let lx = sx / sw
  let ly = sy / sw
  const mag = Math.hypot(lx, ly)
  if (mag < 0.04) return // even light: nothing to do
  lx /= mag
  ly /= mag
  // how one-sided the light is decides how strong the effect can be
  const strength = amount * Math.min(1, mag / 0.25)

  const bb = bounds(obj)
  if (!bb) return
  const cx = (bb.x0 + bb.x1) / 2
  const cy = (bb.y0 + bb.y1) / 2
  const hw = Math.max(1, (bb.x1 - bb.x0) / 2)
  const hh = Math.max(1, (bb.y1 - bb.y0) / 2)
  const ctx = obj.getContext('2d', { willReadFrequently: true })!
  const img = ctx.getImageData(0, 0, obj.width, obj.height)
  const d = img.data
  for (let y = 0; y < obj.height; y++) {
    const ny = (y - cy) / hh
    for (let x = 0; x < obj.width; x++) {
      const i = (y * obj.width + x) * 4
      if (d[i + 3] === 0) continue
      const tt = Math.max(-1, Math.min(1, ((x - cx) / hw) * lx + ny * ly))
      const gain = 1 + strength * 0.4 * tt
      d[i] = Math.min(255, d[i] * gain)
      d[i + 1] = Math.min(255, d[i + 1] * gain)
      d[i + 2] = Math.min(255, d[i + 2] * gain)
    }
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * Light wrap: the backdrop's own colours spill a little way over the object's edge, as if the light behind
 * it bent around the silhouette. `amount` 0..1.
 */
export function lightWrap(obj: HTMLCanvasElement, backdrop: HTMLCanvasElement, amount: number) {
  if (amount <= 0.005) return
  const W = obj.width
  const H = obj.height
  const r = Math.max(2, Math.round(Math.max(W, H) * 0.012 * (0.6 + amount)))

  // edge band: object alpha minus its blurred self -> opaque only just inside the silhouette
  const band = canvas(W, H)
  const bctx = band.getContext('2d')!
  bctx.drawImage(obj, 0, 0)
  bctx.globalCompositeOperation = 'source-in'
  bctx.fillStyle = '#fff'
  bctx.fillRect(0, 0, W, H)
  const inner = canvas(W, H)
  const ictx = inner.getContext('2d')!
  ictx.filter = `blur(${r}px)`
  ictx.drawImage(band, 0, 0)
  bctx.globalCompositeOperation = 'destination-out'
  bctx.drawImage(inner, 0, 0)

  // colour it with a blurred backdrop
  bctx.globalCompositeOperation = 'source-in'
  bctx.filter = `blur(${r * 2}px)`
  bctx.drawImage(backdrop, 0, 0, W, H)
  bctx.filter = 'none'

  const octx = obj.getContext('2d')!
  octx.globalCompositeOperation = 'source-atop'
  octx.globalAlpha = Math.min(1, amount * 0.9)
  octx.drawImage(band, 0, 0)
  octx.globalAlpha = 1
  octx.globalCompositeOperation = 'source-over'
}

/**
 * Feather the object toward the edges of the photo's frame (`r`, in canvas px). Where the subject runs off
 * the photo (e.g. a cropped bottom) it fades out instead of ending in a hard line. Pixels away from the
 * frame edges are untouched. `amount` 0..1.
 */
export function fadeEdges(obj: HTMLCanvasElement, r: { x: number; y: number; w: number; h: number }, amount: number) {
  if (amount <= 0.005) return
  const W = obj.width
  const H = obj.height
  const fx = amount * 0.3 * r.w
  const fy = amount * 0.3 * r.h
  const mask = canvas(W, H)
  const m = mask.getContext('2d')!
  m.fillStyle = '#fff'
  m.fillRect(r.x, r.y, r.w, r.h)
  m.globalCompositeOperation = 'destination-out'
  // eased falloff: fully transparent at the frame edge, opaque `f` px inside
  const ease = (g: CanvasGradient) => {
    for (let i = 0; i <= 8; i++) {
      const u = i / 8
      g.addColorStop(u, `rgba(0,0,0,${(1 - u * u * (3 - 2 * u)).toFixed(3)})`)
    }
    return g
  }
  if (fy > 1) {
    m.fillStyle = ease(m.createLinearGradient(0, r.y, 0, r.y + fy))
    m.fillRect(r.x, r.y, r.w, fy)
    m.fillStyle = ease(m.createLinearGradient(0, r.y + r.h, 0, r.y + r.h - fy))
    m.fillRect(r.x, r.y + r.h - fy, r.w, fy)
  }
  if (fx > 1) {
    m.fillStyle = ease(m.createLinearGradient(r.x, 0, r.x + fx, 0))
    m.fillRect(r.x, r.y, fx, r.h)
    m.fillStyle = ease(m.createLinearGradient(r.x + r.w, 0, r.x + r.w - fx, 0))
    m.fillRect(r.x + r.w - fx, r.y, fx, r.h)
  }
  const ctx = obj.getContext('2d')!
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
}
