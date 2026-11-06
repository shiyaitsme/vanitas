# VANITAS

Dissolve images into customizable particles. Prototype: UI only, particle preview is a placeholder.

## Develop

```
npm install
npm run dev
```

## Deploy to Cloudflare (static hosting)

First time, authenticate once on your own machine:

```
npx wrangler login
```

Or in CI, set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as environment variables
(token permission: Workers Scripts → Edit).

Then:

```
npm run deploy
```

The site is served from `https://vanitas.<your-subdomain>.workers.dev`.
Add a custom domain in the Cloudflare dashboard under Workers & Pages → vanitas → Settings → Domains.

### Alternative: Git-connected deploys

Push the repo to GitHub, then in the Cloudflare dashboard create a Workers & Pages project from it with
build command `npm run build` and output directory `dist`. Every push redeploys.
