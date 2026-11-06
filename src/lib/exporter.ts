// Offline rendering for export. Builds its own Dissolver at the output size, so the export is
// independent of the on-screen stage and frame-exact (particles are a pure function of t).
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat, canEncodeVideo } from 'mediabunny'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { Zip, ZipPassThrough } from 'fflate'
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

/** How the hole left by the dissolved object is filled. */
export type FillSpec =
  | { kind: 'auto' }
  | { kind: 'plate'; canvas: HTMLCanvasElement }
  | { kind: 'solid'; color: string }

/** Split the image into the selected object and the (filled) rest, at W x H. */
export function buildLayers(base: HTMLCanvasElement, mask: HTMLCanvasElement, W: number, H: number, fill: FillSpec = { kind: 'auto' }) {
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
  if (any) {
    let layer: HTMLCanvasElement | null = null
    if (fill.kind === 'plate') {
      // the clean plate is the same scene without the object: cover the photo's frame
      layer = mk(W, H)
      const lctx = layer.getContext('2d')!
      lctx.imageSmoothingQuality = 'high'
      const s = Math.max(r.w / fill.canvas.width, r.h / fill.canvas.height)
      const dw = fill.canvas.width * s
      const dh = fill.canvas.height * s
      lctx.drawImage(fill.canvas, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh)
    } else if (fill.kind === 'solid') {
      layer = mk(W, H)
      const lctx = layer.getContext('2d')!
      lctx.fillStyle = fill.color
      lctx.fillRect(0, 0, W, H)
    } else if (isMostlyOpaque(base)) {
      layer = fillHoles(src, m)
    }
    if (layer) {
      const lctx = layer.getContext('2d')!
      lctx.globalCompositeOperation = 'destination-in'
      lctx.drawImage(grow(m, Math.max(2, Math.round(W / 300))), 0, 0)
      bctx.drawImage(layer, 0, 0)
    }
  }
  const punched = mk(W, H)
  const pctx = punched.getContext('2d')!
  pctx.drawImage(src, 0, 0)
  pctx.globalCompositeOperation = 'destination-out'
  pctx.drawImage(m, 0, 0)
  bctx.drawImage(punched, 0, 0)

  return { obj, bg, any }
}

export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'seq' | 'png'

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
  /** true: no paper and no untouched background, only the object and its particles (WebM, PNG, PNG sequence) */
  transparent: boolean
  params: Params
  /** CSS filter string applied to the artwork (not to the paper behind it) */
  filter: string
  base: HTMLCanvasElement
  mask: HTMLCanvasElement
  fill?: FillSpec
  onProgress?: (p: number) => void
  signal?: AbortSignal
}

export interface ExportResult {
  blob: Blob
  name: string
  note: string
}

/** GIF has 256 colours and no inter-frame compression here, so it is capped to keep files usable. */
export const GIF_MAX_SIDE = 720

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

const toPng = (c: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'))

export async function renderExport(o: ExportOptions): Promise<ExportResult> {
  const fmt = o.format
  const transparent = o.transparent && (fmt === 'webm' || fmt === 'png' || fmt === 'seq')
  const short = fmt === 'gif' ? Math.min(o.shortSide, GIF_MAX_SIDE) : o.shortSide
  const { w: W, h: H } = outputSize(o.ratio, short)
  const scale = W / o.stageW
  const { obj, bg } = buildLayers(o.base, o.mask, W, H, o.fill)

  const dis = new Dissolver()
  dis.build(obj, transparent ? null : bg, o.params.count, o.params.seed)

  const art = mk(W, H)
  const actx = art.getContext('2d')!
  const out = mk(W, H)
  const octx = out.getContext('2d', { willReadFrequently: fmt === 'gif' })!

  const frame = (t: number) => {
    dis.render(actx, t, o.params, scale)
    octx.filter = 'none'
    octx.clearRect(0, 0, W, H)
    if (!transparent) {
      octx.fillStyle = PAPER
      octx.fillRect(0, 0, W, H)
    }
    octx.filter = o.filter
    octx.drawImage(art, 0, 0)
    octx.filter = 'none'
  }

  const tag = `vanitas-${String(o.params.seed).padStart(3, '0')}-${W}x${H}`
  const total = Math.max(2, Math.round(o.duration * o.fps))
  const size = `${W}×${H}`

  /** run `fn` for each frame in order with abort, progress and UI yielding */
  const eachFrame = async (fn: (i: number) => Promise<void> | void) => {
    for (let i = 0; i < total; i++) {
      if (o.signal?.aborted) throw new Aborted()
      frame(i / (total - 1))
      await fn(i)
      o.onProgress?.((i + 1) / total)
      if (i % 3 === 2) await new Promise((r) => setTimeout(r))
    }
  }

  if (fmt === 'png') {
    frame(o.t)
    const blob = await toPng(out)
    o.onProgress?.(1)
    return { blob, name: `${tag}.png`, note: `PNG ${size}${transparent ? ' · transparent' : ''}` }
  }

  if (fmt === 'seq') {
    const chunks: Uint8Array[] = []
    let zipErr: Error | null = null
    const zip = new Zip((err, chunk) => {
      if (err) zipErr = err
      else chunks.push(chunk)
    })
    await eachFrame(async (i) => {
      const buf = new Uint8Array(await (await toPng(out)).arrayBuffer())
      const f = new ZipPassThrough(`${tag}/frame_${String(i + 1).padStart(4, '0')}.png`)
      zip.add(f)
      f.push(buf, true)
      if (zipErr) throw zipErr
    })
    zip.end()
    if (zipErr) throw zipErr
    return {
      blob: new Blob(chunks as BlobPart[], { type: 'application/zip' }),
      name: `${tag}-frames.zip`,
      note: `${total} PNG frames ${size}${transparent ? ' · transparent' : ''}`,
    }
  }

  if (fmt === 'gif') {
    const gif = GIFEncoder()
    const delay = Math.round(1000 / o.fps)
    await eachFrame((i) => {
      const { data } = octx.getImageData(0, 0, W, H)
      const palette = quantize(data, 256)
      gif.writeFrame(applyPalette(data, palette), W, H, { palette, delay, repeat: 0 })
      void i
    })
    gif.finish()
    return {
      blob: new Blob([gif.bytes() as BlobPart], { type: 'image/gif' }),
      name: `${tag}.gif`,
      note: `GIF ${size} · ${o.fps}fps${short < o.shortSide ? ` · capped at ${GIF_MAX_SIDE}p` : ''}`,
    }
  }

  // mp4 / webm via WebCodecs
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('This browser has no WebCodecs video encoder. Use a recent Chrome, Edge or Safari.')
  }
  const format = fmt === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat()
  const alpha = transparent ? 'keep' : 'discard'
  const codecs = format.getSupportedVideoCodecs().filter((c) => (fmt === 'webm' ? c === 'vp9' || (!transparent && c !== 'avc') : true))
  let codec: (typeof codecs)[number] | null = null
  for (const c of codecs) {
    if (await canEncodeVideo(c, { width: W, height: H, alpha })) {
      codec = c
      break
    }
  }
  if (!codec) {
    throw new Error(
      transparent
        ? 'This browser cannot encode transparent VP9 video. Use PNG Sequence for transparency, or try desktop Chrome.'
        : `No video codec can encode ${size} here. Try a lower resolution.`,
    )
  }

  const output = new Output({ format, target: new BufferTarget() })
  const source = new CanvasSource(out, { codec, bitrate: QUALITY_HIGH, alpha })
  output.addVideoTrack(source, { frameRate: o.fps })
  await output.start()

  try {
    await eachFrame((i) => source.add(i / o.fps, 1 / o.fps))
    source.close()
    await output.finalize()
  } catch (e) {
    await output.cancel().catch(() => {})
    throw e
  }

  const buf = (output.target as BufferTarget).buffer
  if (!buf) throw new Error('Encoder produced no data')
  const label = codec === 'avc' ? 'H.264' : codec.toUpperCase()
  const ext = fmt === 'webm' ? 'webm' : 'mp4'
  return {
    blob: new Blob([buf], { type: `video/${ext}` }),
    name: `${tag}.${ext}`,
    note: `${ext.toUpperCase()} ${label} ${size} · ${o.fps}fps${transparent ? ' · transparent' : ''}`,
  }
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
