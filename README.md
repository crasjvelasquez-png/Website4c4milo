# Artist home

A self-hosted music and link hub for c4milo, featuring Querida and a verified catalogue. The visual reference is mkgee.com; its logo, images, copy and videos are not reused. The design has been refined through your browser comments. Missing artwork, audio and destinations remain labeled placeholders. Listening activity and About are hidden at your request.

## Run locally

Estimated first setup: 2–5 minutes with Node already installed.

1. Install Node.js 24 LTS from [nodejs.org](https://nodejs.org/). Node 22 or newer is required.
2. Open a terminal in this folder.
3. Run `npm run dev`.
4. Open [the local preview](http://127.0.0.1:3000).
5. After content changes, run `npm run build` in another terminal and refresh. Restart the server only when server code or environment settings change.

There are no third-party npm dependencies and no `npm install` step. `npm run build` generates `dist/`; `npm start` serves the existing build. `npm test` runs the server, URL safety and Last.fm behavior checks.

## What works

- Mobile link hub with white Spotify, Apple Music, TikTok, Instagram, YouTube and Tidal marks; unverified destinations are inactive.
- Featured Querida release with a custom monochrome tape-loop audio player, play/pause, seeking, fades and immediate stop/reset on page exit or when the page is hidden.
- Three floating covers for CRUSH., circles and NMF, with the same lift/glow hover as the platform logos. Every cover, including featured Querida, opens a logo-only five-service dialogue above the cover on desktop and below it on mobile.
- Keyboard focus, descriptive screen-reader labels and reduced-motion support.
- Optional Last.fm and About code remains available but is disabled; header navigation was removed as requested.

For Querida audio, place `querida.mp3` in `public/assets/`, run `npm run build`, and refresh. Place its cover at `public/assets/querida.png` in the same way. No chat upload or agent artwork inspection is needed. Play is disabled until the audio file exists. Fade-in is 1 second and fade-out is 1.5 seconds; these values are editable in `content.json`.

The email/SMS updates form connects to Brevo through the Cloudflare Worker in `worker.js`, with static site assets served from `dist/`. The two non-secret Brevo names are in `wrangler.jsonc`; set `BREVO_API_KEY` as an encrypted Worker secret in Cloudflare. The SMS path also requires a Brevo text contact attribute named `SMS_CONSENT_RECORD` and an approved sender. See [verified destinations](docs/LINKS.md) and [editing instructions](docs/CONTENT.md).

## Source map

| File | Purpose |
| --- | --- |
| `content.json` | Artist text, release data, links, image paths and listening settings |
| `public/assets/` | Your optimized photos and cover art |
| `public/styles.css`, `public/app.js`, `public/audio-player.js` | Visual styling, custom audio transport and click-to-load embeds |
| `scripts/build.mjs`, `lib/` | Static page generator, content validation and Last.fm integration |
| `server.mjs`, `compose.yaml`, `Caddyfile` | Local/server hosting and HTTPS deployment |

Start with [the content guide](docs/CONTENT.md). [The launch guide](docs/LAUNCH.md) covers your existing Domain.com domain, DNS, self-hosted deployment, HTTPS, updates and backup restoration. [Hosting choices](docs/HOSTING_OPTIONS.md) compares the $6/month server with a free managed static alternative. [The intake checklist](docs/INTAKE.md) records decisions to revisit after the structure review. [Verification](docs/VERIFICATION.md) lists tested behavior and remaining limits.

## Optional Last.fm connection

1. Create an API application in **your own** [Last.fm account](https://www.last.fm/api/account/create).
2. Copy `.env.example` to `.env`. Set `LASTFM_USERNAME` and `LASTFM_API_KEY` locally; do not paste credentials into `content.json` or commit `.env`.
3. In `content.json`, set `listening.demo` to `false` and set `listening.enabled` to `true` only if you choose to restore the removed section.
4. Restart with `npm run dev`. Your public recent tracks and top artists replace the examples.
5. Check the activity shown is what you want public. To disconnect, set `listening.enabled` to `false`, clear the credentials and rebuild/restart.

These methods need an API key and username, but do not need your password, API shared secret, OAuth or a scrobbling session. [Recent tracks](https://www.last.fm/api/show/user.getRecentTracks) includes a now-playing marker when Last.fm provides it; [top artists](https://www.last.fm/api/show/user.getTopArtists) supports time periods. This site reads existing activity. Tracking your plays in Last.fm is configured separately in your music apps.

API keys stay server-side. Requests are shared and cached for five minutes; failures retry at most once per minute per server instance. A failed refresh retains the last successful result in memory and labels it stale. The browser refreshes activity on page load, with no background polling. A restart clears the cache. If you choose recommendations later, we can derive similar artists using [artist.getSimilar](https://www.last.fm/api/show/artist.getSimilar), or use your curated picks; these are different from Last.fm's personalized recommendations page.

## Portability

The generated `dist/` works on any static HTTPS host when listening remains in demo/off mode. Live Last.fm requires the Node server at `/api/listening`. On your own Linux VPS, the included Docker Compose setup runs Node behind Caddy. There is no database, proprietary build service or hosting account dependency.

The local development server binds to `127.0.0.1`. The Docker server binds inside its private network, and Caddy exposes only HTTP/HTTPS. Docker deployment and full provider playback have not been run in this workspace. The custom audio transport has been exercised with a temporary generated tone; final Querida audio is still pending.
