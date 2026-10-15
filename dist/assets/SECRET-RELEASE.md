# Latest release files

Drop these files into `public/assets/`:

1. `how-deep-is-your-love.png` — square cover art, recommended 1200 × 1200 pixels.
2. `how-deep-is-your-love.mp3` — the track for the featured cassette player.

Run `npm run build` after adding or replacing them, then deploy the rebuilt site. Until then, the featured release uses a cover placeholder and a disabled play button.

The featured release is configured in `content.json` under `releases` and `featuredReleaseId`. Spotify, Apple Music, and Tidal link directly to this release. Amazon Music and YouTube Music remain unavailable until verified destinations are added to both its `links` and the top-level streaming `links`.

The existing signup preview also uses these filenames through `upcomingRelease`. Files in this folder are public URLs.
