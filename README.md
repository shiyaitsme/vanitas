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
| 4 | Auto select by click (SlimSAM in a worker, weights from Hugging Face on first use) | Built. Model calls checked in Node on a synthetic image; not yet run in a browser |
| 5 | Record interaction, custom particle sprites, WebGL2 engine | Later |

Not done or deliberately left out:
- Animated WebP export (the browser cannot encode it without a WASM library).
- Manual alignment of the clean plate. It is scaled to cover the photo.
- A learned inpainter (LaMa). Auto fill is push-pull diffusion and smears busy backgrounds.
- Tested only in Chromium, only with synthetic images. 2K and 60 fps exports were not run.

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
- `src/lib/inpaint.ts`: `fillHoles`, push-pull diffusion used by Auto fill (only when the photo is mostly opaque).
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

- Commit with explicit paths (`git add src package.json package-lock.json`), never `git add .`.
  Commits so far were made as `Kiro <kiro@users.noreply.github.com>`. Push to `main` after each verified step.
- Verifying in the sandbox: the headless browser cannot reach the sandbox dev server and `file:` is blocked.
  Build with `npx vite build --base=./ --outDir .preview`, strip `crossorigin` from `.preview/index.html`, then serve the files
  from a Playwright `page.route` handler on `https://app.local` (https is needed for WebCodecs). Delete `.preview` before committing.
  Screenshots can lag one step behind, so take a fresh one and re-read it.
- Product decisions: images only; selection both manual and auto; stack is Vite + TypeScript + React.
  Particle count adapts to object size. Stage backing is always light (`#f4f2ed`) so black lines stay visible in both themes.
- Open style questions from the user: home drop box covers part of the title (user is fine with it),
  thorn frame intensity (keep as is), name (VANITAS, decided). Workspace density not yet reviewed by the user.
