// Click-to-select: SlimSAM running in a worker (transformers.js). Weights come from the Hugging Face CDN on first use.
import { AutoProcessor, RawImage, SamModel, Tensor, env } from '@huggingface/transformers'

env.allowLocalModels = false

const MODEL = 'Xenova/slimsam-77-uniform'

type In =
  | { type: 'embed'; id: number; width: number; height: number; data: Uint8ClampedArray }
  | { type: 'segment'; id: number; x: number; y: number }

type Loaded = { model: SamModel; processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> }
let loading: Promise<Loaded> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let current: { image: RawImage; embeddings: any } | null = null

function load(): Promise<Loaded> {
  if (!loading) {
    const progress_callback = (p: { status: string; progress?: number }) => {
      if (p.status === 'progress' && typeof p.progress === 'number') postMessage({ type: 'progress', value: p.progress })
    }
    const device = 'gpu' in navigator ? 'webgpu' : 'wasm'
    // try the Hugging Face Hub first, then a public mirror (the Hub is unreachable from some networks)
    const hosts = ['https://huggingface.co/', 'https://hf-mirror.com/']
    const attempt = async (i: number): Promise<Loaded> => {
      env.remoteHost = hosts[i]
      try {
        const [model, processor] = await Promise.all([
          SamModel.from_pretrained(MODEL, { device, progress_callback }),
          AutoProcessor.from_pretrained(MODEL),
        ])
        return { model: model as SamModel, processor }
      } catch (err) {
        if (i + 1 < hosts.length) return attempt(i + 1)
        const m = err instanceof Error ? err.message : String(err)
        throw new Error(`${m} (${hosts.join(', ')}; device ${device})`)
      }
    }
    const p: Promise<Loaded> = attempt(0)
    p.catch(() => {
      loading = null
    })
    loading = p
  }
  return loading
}

self.onmessage = async (e: MessageEvent<In>) => {
  const msg = e.data
  try {
    const { model, processor } = await load()
    if (msg.type === 'embed') {
      current = null
      const image = new RawImage(msg.data, msg.width, msg.height, 4).rgb()
      const inputs = await processor(image)
      const embeddings = await model.get_image_embeddings(inputs)
      current = { image, embeddings }
      postMessage({ type: 'embedded', id: msg.id })
    } else if (msg.type === 'segment') {
      if (!current) throw new Error('No image embedded')
      const { image, embeddings } = current
      const inputs = await processor(image, { input_points: [[[msg.x, msg.y]]] })
      const out = await model({ ...embeddings, input_points: inputs.input_points, input_labels: new Tensor('int64', new BigInt64Array([1n]), [1, 1, 1]) })
      const masks = await (processor as any).post_process_masks(out.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes)
      const m = masks[0] // [1, 3, H, W] boolean masks (3 candidates)
      const scores = out.iou_scores.data as Float32Array
      let best = 0
      for (let i = 1; i < 3; i++) if (scores[i] > scores[best]) best = i
      const [, , H, W] = m.dims
      const slice = (m.data as Uint8Array).slice(best * H * W, (best + 1) * H * W)
      const alpha = new Uint8Array(H * W)
      for (let i = 0; i < alpha.length; i++) alpha[i] = slice[i] ? 255 : 0
      postMessage({ type: 'mask', id: msg.id, width: W, height: H, alpha }, { transfer: [alpha.buffer] })
    }
  } catch (err) {
    postMessage({ type: 'error', id: 'id' in msg ? msg.id : -1, message: err instanceof Error ? err.message : String(err) })
  }
}
