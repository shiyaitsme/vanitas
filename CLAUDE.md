# VANITAS — instructions for coding agents

Read `README.md` first for status, architecture and how to verify. This file holds the rules.

## Project
Browser-only web app: import an image, select an object, dissolve it into customizable particles, export video or images.
Stack: Vite + TypeScript + React, Canvas2D engine (WebGL2 planned). Hosted on Cloudflare Workers Static Assets.
Live: https://vanitas.shiya9863.workers.dev/ . Repo: `shiyaitsme/vanitas`, branch `main`.

## Working with the user
- The user writes Chinese. Reply in Chinese, keep technical terms in English.
- Build in steps, verify each step, then push. Report what was verified and what was not. Do not claim more than was tested.
- No unrequested features or refactors. No tests unless asked. Ask before irreversible actions.
- Never ask for Cloudflare tokens in chat. Deploys happen through the Git-connected Cloudflare project on push to `main`.

## Style rules (do not drift)
- Gothic / photocopy look: paper white, ink black, one pink accent. Two themes (paper, ink). Mixed language, English-led, Chinese as small annotations.
- Exactly three type roles: Bodoni Moda (titles, slider labels, export list), Special Elite (small labels, values, numbers),
  UnifrakturCook (logo and the drop-zone line only). No italics. Do not add more fonts or decorative gothic text.
- Stage canvas backing stays light (`#f4f2ed`) in both themes. Thorn frame intensity stays as is. Name is VANITAS.

## Code rules
- Particle position is a pure function of (particle, t, params). No accumulated simulation, so scrubbing and frame-exact export keep working.
- The selection mask lives in source-image coordinates, not stage coordinates.
- Export renders offline at the output size with its own `Dissolver`. Do not read pixels from the on-screen canvas.
- `.stage canvas.sel-overlay` needs that specificity. A plain `.sel-overlay` loses to `.stage canvas { position: relative }`.
- `npm run build` runs `tsc --noEmit`; keep it passing.

## Git
- Commit with explicit paths (`git add src package.json package-lock.json`). Never `git add .` or `-A`.
- Commit as `Kiro <kiro@users.noreply.github.com>` via `git -c user.name=... -c user.email=...`. Do not change git config.
- Delete helper files (`.preview/`, runners, test images) before committing. `.gitignore` covers node_modules, dist, .wrangler.

## Next work
Step 4: click-to-select with SAM in the browser (the Auto tool is currently a stub). Then step 5: record interaction,
custom particle sprites, WebGL2 engine. Optional `?review` annotation mode if the user asks for it.
