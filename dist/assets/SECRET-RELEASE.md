# Secret release files

Put both files in this folder (`public/assets/`):

1. `how-deep-is-your-love.mp3` — the full track, used by both the player and Download MP3 button.
2. `how-deep-is-your-love.png` — square cover art (recommended 1200 × 1200 pixels).

Run `npm run build` after adding or replacing files, then deploy the rebuilt site. Do not put originals in `dist/`; it is build output.

Paths are configured under `upcomingRelease` in `content.json`. To use a JPG or WebP cover, change `cover` to match that filename. The local MP3 powers downloads; the older `downloadUrl` setting is not used by this player.

The form sends signups to Brevo through `/api/subscribe`. Email subscribers unlock the player when they return from the confirmation email; text subscribers unlock it after Brevo accepts their signup. Configure the encrypted `BREVO_API_KEY` Worker secret, the list and active double-opt-in template named in `wrangler.jsonc`, and the `SMS_CONSENT_RECORD` contact attribute for text signups. Files in `public/assets/` are public URLs, not protected downloads; the reveal is a visual gate.
