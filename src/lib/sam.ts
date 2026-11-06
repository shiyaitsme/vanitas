// Main-thread client for the SAM worker.

export type SamStatus = 'idle' | 'loading' | 'embedding' | 'ready' | 'error'

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void }

export class Sam {
  private worker: Worker | null = null
  private seq = 0
  private pending = new Map<number, Pending>()
  /** the canvas whose embedding is (being) computed */
  private forCanvas: HTMLCanvasElement | null = null
  private ready: Promise<void> | null = null
  onProgress: (percent: number) => void = () => {}

  private get w() {
    if (!this.worker) {
      this.worker = new Worker(new URL('./sam.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e) => {
        const m = e.data
        if (m.type === 'progress') return this.onProgress(m.value)
        const p = this.pending.get(m.id)
        if (!p) return
        this.pending.delete(m.id)
        if (m.type === 'error') p.reject(new Error(m.message))
        else p.resolve(m)
      }
    }
    return this.worker
  }

  private call<T>(msg: object, transfer: Transferable[] = []): Promise<T> {
    const id = ++this.seq
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.w.postMessage({ ...msg, id }, transfer)
    })
  }

  /** Download the model (first time) and compute the image embedding. Safe to call repeatedly for the same canvas. */
  prepare(base: HTMLCanvasElement): Promise<void> {
    if (this.forCanvas === base && this.ready) return this.ready
    this.forCanvas = base
    const img = base.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, base.width, base.height)
    const p = this.call({ type: 'embed', width: img.width, height: img.height, data: img.data }, [img.data.buffer])
      .then(() => undefined)
    this.ready = p
    p.catch(() => {
      if (this.ready === p) {
        this.ready = null
        this.forCanvas = null
      }
    })
    return p
  }

  /** Returns a mask canvas (white where selected) in the coordinates of the prepared image. */
  async segment(x: number, y: number): Promise<HTMLCanvasElement> {
    if (this.ready) await this.ready
    const r = await this.call<{ width: number; height: number; alpha: Uint8Array }>({ type: 'segment', x, y })
    const c = document.createElement('canvas')
    c.width = r.width
    c.height = r.height
    const ctx = c.getContext('2d')!
    const out = ctx.createImageData(r.width, r.height)
    for (let i = 0; i < r.alpha.length; i++) {
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = 255
      out.data[i * 4 + 3] = r.alpha[i]
    }
    ctx.putImageData(out, 0, 0)
    return c
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.ready = null
    this.forCanvas = null
    this.pending.clear()
  }
}
