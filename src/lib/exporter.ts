// Offline rendering for export. Builds its own Dissolver at the output size, so the export is
// independent of the on-screen stage and frame-exact (particles are a pure function of t).
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, getFirstEncodableVideoCodec } from 'mediabunny'
import { Dissolver } from './dissolve'
import type { Params } from './dissolve'
import { fillHoles } from './inpaint'
import { containRect, hasContent, isMostlyOpaque, mk } from './selection'

export const PAPER = '#f4f2ed'

/** Dilate a mask by r px so the fill tucks under the rim of the object's hole (no paper-coloured seam). */
function grow(m: HTMLCanvasElement, r: number) {
  const g = mk(m.width, m.height)
  const ctx = g.getContext('2d')!
  ctx.drawImage(m, 0, 0)
  for (let a = 0; a < 8; a++) {
    const th = (a * Math.PI) / 4
    ctx.drawImage(m, Math.cos(th) * r, Math.sin(th) * r)
  }
  return g
}

/** Split the image into the selected object and the (hole filled) rest, at W x H. */
export function buildLayers(base: HTMLCanvasElement, mask: HTMLCanvasElement, W: number, H: number) {
  const r = containRect(base.width, base.height, W, H)

  const src = mk(W, H)
  src.getContext('2d')!.drawImage(base, r.x, r.y, r.w, r.h)
  const m = mk(W, H)
  m.getContext('2d')!.drawImage(mask, r.x, r.y, r.w, r.h)
  const any = hasContent(mask)

  const obj = mk(W, H)
  const octx = obj.getContext('2d')!
  octx.drawImage(src, 0, 0)
  octx.globalCompositeOperation = 'destination-in'
  octx.drawImage(m, 0, 0)

  const bg = mk(W, H)
  const bctx = bg.getContext('2d')!
  if (any && isMostlyOpaque(base)) {
    const fill = fillHoles(src, m)
    const fctx = fill.getContext('2d')!
    fctx.globalCompositeOperation = 'destination-in'
    fctx.drawImage(grow(m, Math.max(2, Math.round(W / 300))), 0, 0)
    bctx.drawImage(fill, 0, 0)
  }
  const punched = mk(W, H)
  const pctx = punched.getContext('2d')!
  pctx.drawImage(src, 0, 0)
  pctx.globalCompositeOperation = 'destination-out'
  pctx.drawImage(m, 0, 0)
  bctx.drawImage(punched, 0, 0)

  return { obj, bg, any }
}

export type ExportFormat = 'mp4' | 'png'

export interface ExportOptions {
  format: ExportFormat
  /** length of the shorter output side in px */
  shortSide: number
  fps: number
  duration: number
  /** aspect ratio w / h of the stage */
  ratio: number
  /** stage width in CSS px; particle sizes are authored against it */
  stageW: number
  /** time of the still, 0..1 (PNG only) */
  t: number
  params: Params
  /** CSS filter string applied to the artwork (not to the paper behind it) */
  filter: string
  base: HTMLCanvasElement
  mask: HTMLCanvasElement
  onProgress?: (p: number) => void
  signal?: AbortSignal
}

export interface ExportResult {
  blob: Blob
  name: string
  note: string
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

export function outputSize(ratio: number, shortSide: number) {
  return ratio >= 1
    ? { w: even(shortSide * ratio), h: even(shortSide) }
    : { w: even(shortSide), h: even(shortSide / ratio) }
}

class Aborted extends Error {
  constructor() {
    super('Export cancelled')
  }
}

export async function renderExport(o: ExportOptions): Promise<ExportResult> {
  const { w: W, h: H } = outputSize(o.ratio, o.shortSide)
  const scale = W / o.stageW
  const { obj, bg } = buildLayers(o.base, o.mask, W, H)

  const dis = new Dissolver()
  dis.build(obj, bg, o.params.count, o.params.seed)

  const art = mk(W, H)
  const actx = art.getContext('2d')!
  const out = mk(W, H)
  const octx = out.getContext('2d', { alpha: false })!

  const frame = (t: number) => {
    dis.render(actx, t, o.params, scale)
    octx.filter = 'none'
    octx.fillStyle = PAPER
    octx.fillRect(0, 0, W, H)
    octx.filter = o.filter
    octx.drawImage(art, 0, 0)
    octx.filter = 'none'
  }

  const tag = `vanitas-${String(o.params.seed).padStart(3, '0')}-${W}x${H}`

  if (o.format === 'png') {
    frame(o.t)
    const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'))
    o.onProgress?.(1)
    return { blob, name: `${tag}.png`, note: `PNG ${W}×${H}` }
  }

  if (typeof VideoEncoder === 'undefined') {
    throw new Error('This browser has no WebCodecs video encoder. Use a recent Chrome, Edge or Safari.')
  }
  const format = new Mp4OutputFormat()
  const codec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width: W, height: H })
  if (!codec) throw new Error(`No video codec can encode ${W}×${H} here. Try a lower resolution.`)

  const output = new Output({ format, target: new BufferTarget() })
  const source = new CanvasSource(out, { codec, bitrate: QUALITY_HIGH })
  output.addVideoTrack(source, { frameRate: o.fps })
  await output.start()

  const total = Math.max(2, Math.round(o.duration * o.fps))
  try {
    for (let i = 0; i < total; i++) {
      if (o.signal?.aborted) throw new Aborted()
      frame(i / (total - 1))
      await source.add(i / o.fps, 1 / o.fps)
      o.onProgress?.((i + 1) / total)
      if (i % 3 === 2) await new Promise((r) => setTimeout(r))
    }
    source.close()
    await output.finalize()
  } catch (e) {
    await output.cancel().catch(() => {})
    throw e
  }

  const buf = (output.target as BufferTarget).buffer
  if (!buf) throw new Error('Encoder produced no data')
  const label = codec === 'avc' ? 'H.264' : codec.toUpperCase()
  return { blob: new Blob([buf], { type: 'video/mp4' }), name: `${tag}.mp4`, note: `MP4 ${label} ${W}×${H} · ${o.fps}fps` }
}

export const isAbort = (e: unknown) => e instanceof Aborted

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
