# Secret release files

Put both files in this folder (`public/assets/`):

1. `how-deep-is-your-love.mp3` — the full track, used by both the player and Download MP3 button.
2. `how-deep-is-your-love.png` — square cover art (recommended 1200 × 1200 pixels).

Run `npm run build` after adding or replacing files, then deploy the rebuilt site. Do not put originals in `dist/`; it is build output.

Paths are configured under `upcomingRelease` in `content.json`. To use a JPG or WebP cover, change `cover` to match that filename. The local MP3 powers downloads; the older `downloadUrl` setting is not used by this player.

The form currently provides a local preview only: it checks contact format and reveals the player without collecting or verifying signups. Files in `public/assets/` are public URLs, not protected downloads. Real subscriber-only access needs a signup backend and protected file delivery.
