import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// onnxruntime-web ships a ~27 MB wasm that Cloudflare static assets reject (25 MiB per file limit).
// transformers.js loads it from jsDelivr at runtime, so the bundled copy is unused: drop it from the output.
const dropOrtWasm = (): Plugin => ({
  name: 'drop-ort-wasm',
  apply: 'build',
  generateBundle(_, bundle) {
    for (const name of Object.keys(bundle)) if (/ort-wasm.*\.wasm$/.test(name)) delete bundle[name]
  },
})

export default defineConfig({
  plugins: [react(), dropOrtWasm()],
  worker: { format: 'es' },
})
