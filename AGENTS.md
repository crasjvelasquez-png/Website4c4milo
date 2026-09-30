# Project instructions

## Hosting
- The production website is hosted on Cloudflare Workers with static assets, deployed from this repository.
- `wrangler.jsonc` is the source of truth for Worker configuration and plain-text runtime variables. Keep secrets such as `BREVO_API_KEY` encrypted in Cloudflare; never put credentials in source or browser code.
- Route dynamic endpoints through `worker.js`; static files come from `dist/` using the `ASSETS` binding.
