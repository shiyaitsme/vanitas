// Selection mask helpers. The mask lives in the coordinate space of the source image
// (not the stage), so changing the output aspect ratio never distorts it.

export const mk = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/** Fit (sw x sh) inside (dw x dh), centred. */
export function containRect(sw: number, sh: number, dw: number, dh: number) {
  const s = Math.min(dw / sw, dh / sh)
  const w = sw * s
  const h = sh * s
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h, s }
}

export function clearMask(mask: HTMLCanvasElement) {
  mask.getContext('2d')!.clearRect(0, 0, mask.width, mask.height)
}

export function selectAll(mask: HTMLCanvasElement) {
  const ctx = mask.getContext('2d')!
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, mask.width, mask.height)
}

export function invertMask(mask: HTMLCanvasElement) {
  const t = mk(mask.width, mask.height)
  const tctx = t.getContext('2d')!
  tctx.fillStyle = '#fff'
  tctx.fillRect(0, 0, t.width, t.height)
  tctx.globalCompositeOperation = 'destination-out'
  tctx.drawImage(mask, 0, 0)
  const ctx = mask.getContext('2d')!
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, mask.width, mask.height)
  ctx.drawImage(t, 0, 0)
}

/** Select every non-transparent pixel of the source. */
export function maskFromAlpha(base: HTMLCanvasElement, mask: HTMLCanvasElement) {
  const ctx = mask.getContext('2d')!
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, mask.width, mask.height)
  ctx.drawImage(base, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, mask.width, mask.height)
  ctx.globalCompositeOperation = 'source-over'
}

export function hasContent(mask: HTMLCanvasElement) {
  const s = mk(64, 64)
  const ctx = s.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(mask, 0, 0, 64, 64)
  const d = ctx.getImageData(0, 0, 64, 64).data
  for (let i = 3; i < d.length; i += 4) if (d[i] > 2) return true
  return false
}

/** True for photos (fully opaque); false for cut-outs with transparent surroundings. */
export function isMostlyOpaque(base: HTMLCanvasElement) {
  const s = mk(32, 32)
  const ctx = s.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(base, 0, 0, 32, 32)
  const d = ctx.getImageData(0, 0, 32, 32).data
  let opaque = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 250) opaque++
  return opaque / 1024 > 0.9
}

/** Where the source image sits in a (dw x dh) stage: contained, then scaled about the centre and shifted by a fraction of the stage. */
export function placeRect(sw: number, sh: number, dw: number, dh: number, scale = 1, ox = 0, oy = 0) {
  const r = containRect(sw, sh, dw, dh)
  const w = r.w * scale
  const h = r.h * scale
  return { x: (dw - w) / 2 + ox * dw, y: (dh - h) / 2 + oy * dh, w, h, s: r.s * scale }
}
