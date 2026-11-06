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
