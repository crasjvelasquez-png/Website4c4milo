# Project instructions

## Quick orientation
- c4milo artist/music site; plain HTML/CSS/browser JavaScript with a Node ESM static generator. Node >=22; no third-party npm dependencies or install step.
- Edit source, not generated `dist/`. `scripts/build.mjs` generates HTML and copies `public/` into `dist/`.

## Task → source
| Task | Start here |
| --- | --- |
| Text, releases, links, feature settings | `content.json` |
| HTML structure, rendered markup | `scripts/build.mjs` |
| Styling/responsive layout | `public/styles.css` |
| General browser interactions | `public/app.js` |
| Audio / release teaser / Spotify save | `public/audio-player.js` / `public/release-teaser.js` / `public/spotify-save.js` |
| Artwork, audio, platform marks | `public/assets/` |
| Content validation, escaping, URL safety | `lib/content.mjs` |
| Email/SMS subscription (Brevo) | `functions/api/subscribe.js`, routed by `worker.js` |
| Local Node server / optional Last.fm | `server.mjs` / `lib/lastfm.mjs` |

## Commands and verification
- `npm run dev`: build once, then serve at `http://127.0.0.1:3000`; no automatic rebuild/watch.
- `npm run build`: regenerate after content, template, or public-file edits; refresh the browser. Restart for server/environment changes.
- `npm start`: serve existing build.
- `npm test`: all Node built-in tests. Target a relevant suite with `node --test test/<name>.test.mjs`; suites: `build`, `audio`, `release-teaser`, `site` (server/URL safety/Last.fm).
- For site-source changes, run the build and relevant tests; documentation-only edits need diff review.

## Mobile verification the agent performs
- For changes affecting mobile layout or browser behavior, build and serve the site, then use available browser automation to verify the rendered result. Use Chromium and WebKit when available, with touch/device emulation; identify the browsers actually exercised. Node tests alone do not verify mobile rendering.
- Check portrait widths of 320, 390 and 430 CSS pixels, a phone landscape viewport, and both sides of the 760/761px breakpoint. Inspect screenshots of affected sections and measure horizontal overflow, clipped text, overlaps and usable touch controls. Account for the current CSS zoom rather than relying on source dimensions.
- Exercise affected user journeys with touch input: audio play/pause/resume, seeking and volume; release-menu opening, switching and dismissal; email/SMS switching and form validation. Verify real browser audio state/output where supported, and distinguish it from subjective listening. Mock signup responses for success, failure and repeated submission so routine checks cannot create real contacts or send messages.
- For affected features, check reduced motion, slow loading, failed requests/assets, rapid repeated taps, orientation/viewport changes, focus visibility and JavaScript-failure fallback. Check keyboard-induced viewport changes where supported; emulation does not prove physical phone keyboard behavior. Capture browser errors and save useful screenshots/results with the browser, viewport and test conditions identified. Use stable screenshot baselines for repeatable states when a comparison harness is available; control animation timing to avoid noisy comparisons.
- Fix verified regressions and rerun the affected checks before reporting completion. State any unavailable browser/tool or untested condition plainly. Browser emulation does not establish physical iPhone/Android, Safari app, Instagram in-app browser, device audio or production compatibility. Report these as verification gaps unless actually tested; request a targeted real-device check only when the remaining gap matters to the change.

## Hosting
- The production website is hosted on Cloudflare Workers with static assets, deployed from this repository.
- `wrangler.jsonc` is the source of truth for Worker configuration and plain-text runtime variables. Keep secrets such as `BREVO_API_KEY` encrypted in Cloudflare; never put credentials in source or browser code.
- Route dynamic endpoints through `worker.js`; static files come from `dist/` using the `ASSETS` binding.
- Local Node and production Worker are separate entry points; check the relevant runtime when changing APIs. Docker/Caddy and self-hosting guides describe an alternative, not production.

## Efficient context
- Start with the task map; search targeted source paths. Exclude generated `dist/`, `.wrangler/`, `.git/`, and binary assets from broad content searches.
- Read only task-relevant docs: `DESIGN.md` / `PRODUCT.md` for design/product direction; `docs/CONTENT.md` for editing; `docs/LINKS.md` for verified destinations; `docs/VERIFICATION.md` for prior checks and limits.
- Confirm current behavior in source/config; older README and launch notes can describe earlier states. Do not copy transient status or duplicate long guides into this file.
