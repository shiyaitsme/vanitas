# VANITAS 虚空

Import an image, select an object, dissolve it into customizable particles, export video or images.
Runs entirely in the browser. Live: https://vanitas.shiya9863.workers.dev/

Style: gothic / photocopy. Paper white, ink black, one pink accent. Two themes (paper, ink).
Type: Bodoni Moda (titles), Special Elite (small labels and numbers), UnifrakturCook (logo and drop line only).
Chinese is small annotation text in Noto Serif SC. Keep it to these three roles.

## Status

| Step | What | State |
| --- | --- | --- |
| UI | Home, workspace, export modal, themes, grain, thorn frames | Done |
| 1 | Manual selection (brush, erase, lasso, all / invert / clear / show mask) and object-only particle dissolve | Done |
| 2 | Export MP4, PNG, GIF, WebM (with alpha), PNG sequence (zip) | Done |
| 3 | Fill: Auto (diffusion), Clean plate upload, Solid colour | Done |
| 4 | Auto select by click (SlimSAM int8 in a worker, weights served from `/models/slimsam`) | Done, checked on the live site with the sample image |
| 4b | Backdrop: composite the object on a background image (colour match, light wrap, relight, depth blur, size / position) | Built. Colour match checked on the live site; light wrap, relight and depth blur checked in Node on synthetic images only |
| 4c | MP4 green-screen export (for editors that cannot read alpha, e.g. CapCut) | Done, one decoded frame checked |
| 5 | Record interaction, custom particle sprites, WebGL2 engine | Later |

Not done or deliberately left out:
- Animated WebP export (the browser cannot encode it without a WASM library).
- Manual alignment of the clean plate. It is scaled to cover the photo.
- A learned inpainter (LaMa). Auto fill is push-pull diffusion and smears busy backgrounds.
  A fix that fills with the dominant surrounding colour exists as a local, unmerged change (`src/lib/inpaint.ts`, stash on `fix/fill-background-2`); it is untested.
- Motion blur on particles, shadows cast by the object. Light direction is taken from the backdrop's brightest area, it cannot be set by hand.
- Tested only in Chromium, mostly with synthetic images and the sample. Real photos, 2K and 60 fps exports were not run.
- WebM with alpha is correct in Chrome, but CapCut ignores the alpha channel (shows black). For CapCut use MP4 green screen, or PNG sequence converted to ProRes 4444.

## Develop

```
npm install
npm run dev
npm run build      # tsc --noEmit && vite build
```

## How it works

- `src/lib/dissolve.ts`: Canvas2D engine. A particle's position is a pure function of (particle, t, params),
  with no accumulated simulation, so scrubbing and frame-exact export work. `Dissolver.build(obj, bg, count, seed)`,
  `render(ctx, t, params, dpr)`. The dissolve front sweeps across the object's own bounding extent, so t = 1 is fully dissolved.
- `src/lib/selection.ts`: the mask lives in source-image coordinates, so changing the output aspect never distorts it.
- `src/lib/sam.ts` + `sam.worker.ts`: click-to-select. The worker loads `Xenova/slimsam-77-uniform` through transformers.js (WebGPU if available, else wasm),
  embeds the photo once when the Auto tool is chosen, then returns a mask per click. A click adds to the selection; use Erase to subtract.
  `vite.config.ts` drops the 27 MB onnxruntime wasm from `dist` (Cloudflare limit is 25 MiB per file); it loads from jsDelivr at runtime.
- `src/lib/scene.ts`: backdrop compositing. `matchColors` (Reinhard transfer in l-alpha-beta), `relight` (lifts the side facing the backdrop's
  brightest area), `lightWrap` (blurred backdrop colours over the object's edge band). `buildLayers(..., scene)` places the object with
  `placeRect` (scale and offset as fractions of the stage) and applies them in that order. Particles sample the graded object, so they inherit it.
  `Dissolver.depth` draws far-flying particles on a separate layer and blurs it (uses `ctx.filter`, so no blur in Safari).
- `src/lib/inpaint.ts`: `fillHoles`, push-pull diffusion used by Auto fill (only when the photo is mostly opaque).
- Dissolve edge: holes in the intact layer are cut from a one-pixel-per-cell grid scaled up with smoothing (soft edge, not blocks). `Dissolver.solid`
  (green-screen export) keeps particles opaque and shrinks them instead of fading, so no green bleeds into them.
- `src/lib/exporter.ts`:
  - `buildLayers` splits the photo into `obj` (selected) and `bg` (rest, with the hole filled by the chosen `FillSpec`).
  - `renderExport` builds its own `Dissolver` at the output size, so export does not depend on the on-screen stage.
  - Formats: MP4 and WebM through WebCodecs + `mediabunny` (MPL-2.0), GIF through `gifenc`, zip through `fflate`.
  - "Transparent" background drops the untouched part of the photo and exports only the object and its particles.
  - GIF is capped at 720p.
- `src/components/Workspace.tsx`: tools, panel tabs (Color, Direction, Size, Shape, Fill), timeline, export wiring.
- `src/components/SelectionOverlay.tsx`: pointer-event canvas for brush, erase and lasso (CSS selector `.stage canvas.sel-overlay`,
  it needs the extra specificity or `.stage canvas { position: relative }` overrides it).

Export needs WebCodecs, so it needs a secure context (https or localhost) and a recent Chrome, Edge or Safari.
CSS filters (Xerox, Negative, Soft) are applied to exports through `ctx.filter`, which Safari does not support.

## Deploy to Cloudflare (Workers Static Assets)

The repo is connected to Cloudflare in the dashboard (build `npm run build`, deploy `npx wrangler deploy`),
so every push to `main` redeploys. Config is in `wrangler.jsonc` (assets from `./dist`, SPA fallback).

Manual deploy from your own machine:

```
npx wrangler login
npm run deploy
```

Or in CI set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (token permission: Workers Scripts → Edit).
Add a custom domain in the dashboard under Workers & Pages → vanitas → Settings → Domains.

## Working notes (for whoever continues)

- Git: `main` is protected by convention. Work on a branch, push it, open a PR with `gh api repos/shiyaitsme/vanitas/pulls`, merge with
  `gh api -X PUT repos/shiyaitsme/vanitas/pulls/N/merge -f merge_method=merge`. Commit with explicit paths, never `git add .`.
  Commits are made as `Kiro <kiro@users.noreply.github.com>`. Every merge to `main` redeploys on Cloudflare (about 2 minutes; poll the asset hash on the live page).
- Cloudflare static assets reject files over 25 MiB. `vite.config.ts` drops the 27 MB onnxruntime wasm (loaded from jsDelivr at runtime).
  The SAM model files in `public/models/slimsam` are 13.8 MB in total. Do not add the fp32 ones.
- Hugging Face and hf-mirror were unreachable from the browser for the user, which is why the model is self-hosted. Do not switch back to the Hub.
- Verifying: the live site can be driven with the Playwright power (it reaches https://vanitas.shiya9863.workers.dev/). To feed an image into a file
  input, build a `File` in `page.evaluate` and set `input.files` with a `DataTransfer`; `Buffer` is not available in the snippet.
  Model and engine logic can also be run in Node: bundle the `src/lib` file with esbuild, stub `document.createElement` with `@napi-rs/canvas`
  (install in a temp folder inside the workspace, delete it before committing). To decode an MP4: `pip install --target <dir> imageio-ffmpeg`.
- The image viewer caches by path. After regenerating a screenshot, copy it to a new file name before reading it, and read only after the write finished.
- Product decisions: images only; selection both manual and auto; stack is Vite + TypeScript + React.
  Particle count adapts to object size. Stage backing is always light (`#f4f2ed`) so black lines stay visible in both themes.
  A transparent cut-out imported as the photo is pre-selected whole. The user's intended workflow: export the object and particles
  on a transparent / green / backdrop background, then composite elsewhere or here.
- Open style questions from the user: home drop box covers part of the title (user is fine with it),
  thorn frame intensity (keep as is), name (VANITAS, decided). Workspace density not yet reviewed by the user.
