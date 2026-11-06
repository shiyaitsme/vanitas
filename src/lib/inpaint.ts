// Cheap background fill for the hole left by a dissolved object: push-pull diffusion.
// Good for walls, skies and other smooth backgrounds. A learned inpainter can replace it later.
import { mk } from './selection'

interface Level {
  w: number
  h: number
  d: Float32Array // premultiplied r, g, b, weight
}

function pull(l: Level): Level {
  const w = Math.max(1, Math.ceil(l.w / 2))
  const h = Math.max(1, Math.ceil(l.h / 2))
  const d = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let oy = 0; oy < 2; oy++) {
        for (let ox = 0; ox < 2; ox++) {
          const sx = Math.min(l.w - 1, x * 2 + ox)
          const sy = Math.min(l.h - 1, y * 2 + oy)
          const i = (sy * l.w + sx) * 4
          r += l.d[i]; g += l.d[i + 1]; b += l.d[i + 2]; a += l.d[i + 3]
        }
      }
      const o = (y * w + x) * 4
      d[o] = r / 4; d[o + 1] = g / 4; d[o + 2] = b / 4; d[o + 3] = a / 4
    }
  }
  return { w, h, d }
}

function sample(l: Level, fx: number, fy: number, out: number[]) {
  const x0 = Math.max(0, Math.min(l.w - 1, Math.floor(fx)))
  const y0 = Math.max(0, Math.min(l.h - 1, Math.floor(fy)))
  const x1 = Math.min(l.w - 1, x0 + 1)
  const y1 = Math.min(l.h - 1, y0 + 1)
  const tx = Math.max(0, Math.min(1, fx - x0))
  const ty = Math.max(0, Math.min(1, fy - y0))
  for (let c = 0; c < 4; c++) {
    const a = l.d[(y0 * l.w + x0) * 4 + c]
    const b = l.d[(y0 * l.w + x1) * 4 + c]
    const cc = l.d[(y1 * l.w + x0) * 4 + c]
    const d = l.d[(y1 * l.w + x1) * 4 + c]
    out[c] = (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + d * tx) * ty
  }
}

/**
 * Returns a canvas (same size as `src`) in which the pixels covered by `mask`
 * are replaced by colours diffused in from the surrounding known pixels.
 */
export function fillHoles(src: HTMLCanvasElement, mask: HTMLCanvasElement, maxSide = 160): HTMLCanvasElement {
  const W = src.width
  const H = src.height
  const s = Math.min(1, maxSide / Math.max(W, H))
  const w = Math.max(2, Math.round(W * s))
  const h = Math.max(2, Math.round(H * s))

  const a = mk(w, h)
  const actx = a.getContext('2d', { willReadFrequently: true })!
  actx.imageSmoothingQuality = 'high'
  actx.drawImage(src, 0, 0, w, h)
  const sd = actx.getImageData(0, 0, w, h).data

  const b = mk(w, h)
  const bctx = b.getContext('2d', { willReadFrequently: true })!
  bctx.drawImage(mask, 0, 0, w, h)
  const md = bctx.getImageData(0, 0, w, h).data

  const d0 = new Float32Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    // any partial mask coverage counts as hole, so object edges do not bleed into the fill
    const known = (sd[i * 4 + 3] / 255) * (1 - Math.min(1, (md[i * 4 + 3] / 255) * 3))
    d0[i * 4] = (sd[i * 4] / 255) * known
    d0[i * 4 + 1] = (sd[i * 4 + 1] / 255) * known
    d0[i * 4 + 2] = (sd[i * 4 + 2] / 255) * known
    d0[i * 4 + 3] = known
  }

  const pyramid: Level[] = [{ w, h, d: d0 }]
  while (pyramid[pyramid.length - 1].w > 1 || pyramid[pyramid.length - 1].h > 1) {
    pyramid.push(pull(pyramid[pyramid.length - 1]))
  }

  // push: fill each level from the next coarser one
  const filled: Level[] = new Array(pyramid.length)
  filled[pyramid.length - 1] = pyramid[pyramid.length - 1]
  const tmp = [0, 0, 0, 0]
  for (let L = pyramid.length - 2; L >= 0; L--) {
    const fine = pyramid[L]
    const coarse = filled[L + 1]
    const d = new Float32Array(fine.w * fine.h * 4)
    for (let y = 0; y < fine.h; y++) {
      for (let x = 0; x < fine.w; x++) {
        sample(coarse, (x + 0.5) / 2 - 0.5, (y + 0.5) / 2 - 0.5, tmp)
        const i = (y * fine.w + x) * 4
        const k = 1 - Math.min(1, fine.d[i + 3])
        // coarse weight is small when little is known; normalise so the fill has full weight
        const ca = Math.max(tmp[3], 1e-6)
        d[i] = fine.d[i] + (tmp[0] / ca) * k
        d[i + 1] = fine.d[i + 1] + (tmp[1] / ca) * k
        d[i + 2] = fine.d[i + 2] + (tmp[2] / ca) * k
        d[i + 3] = fine.d[i + 3] + k
      }
    }
    filled[L] = { w: fine.w, h: fine.h, d }
  }

  const out = mk(w, h)
  const octx = out.getContext('2d')!
  const img = octx.createImageData(w, h)
  const f = filled[0].d
  for (let i = 0; i < w * h; i++) {
    const wt = Math.max(f[i * 4 + 3], 1e-6)
    img.data[i * 4] = Math.max(0, Math.min(255, (f[i * 4] / wt) * 255))
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, (f[i * 4 + 1] / wt) * 255))
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, (f[i * 4 + 2] / wt) * 255))
    img.data[i * 4 + 3] = 255
  }
  octx.putImageData(img, 0, 0)

  const big = mk(W, H)
  const bigctx = big.getContext('2d')!
  bigctx.imageSmoothingEnabled = true
  bigctx.imageSmoothingQuality = 'high'
  bigctx.drawImage(out, 0, 0, W, H)
  return big
}
