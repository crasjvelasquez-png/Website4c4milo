# Change site content

Edit `content.json`, not the generated `dist/index.html`. JSON needs double quotes and no trailing commas. Invalid links, image paths, missing image files and unsupported embeds are checked before output is written, so these failed edits preserve the previously generated page. Fix the named field and rebuild. Keep the terminal's build error visible if a typo stops the build.

## Artist and links

1. Change `artist.name` and `artist.bio`.
2. Add `artist.email` for the public contact link; keep it blank to show a placeholder.
3. Put your portrait in `public/assets/`, then set `artist.photo` to `/assets/portrait.webp` and write a useful `photoAlt`.
4. Replace each `links[].url` with its full `https://` destination. Add, remove or reorder objects to change the link hub.
5. Run `npm run dev` and refresh. When real content is in place, set `artist.placeholder` to `false`.

`artist.aboutEnabled: false` hides the About section (portrait, bio and contact link) and its navigation item. Set it to true to restore them. The user requested this section be hidden.

Blank destinations render as labeled inactive text, rather than misleading buttons. External destinations open a new tab with a screen-reader label. Only HTTPS links are accepted. Use file names without spaces, such as `portrait.webp`.

## Releases

### Querida cover, local drop-in

Querida by c4milo is configured as a single dated September 29, 2026, with the explicit label "Out now". This label is not scheduled; it follows the requested wording.

1. Place your cover PNG at `public/assets/querida.png`. Keep the original artwork unchanged. No chat upload or agent image inspection is needed.
2. Run `npm run build` from the website folder and refresh the local preview. A running local server serves the rebuilt page without restarting.

The release already points to `/assets/querida.png`. `artworkOptional: true` keeps the artwork placeholder while the file is absent; a later build picks up the local file automatically. For future artwork that must exist before a build can pass, omit `artworkOptional` or set it to false. The agent should not view this PNG or include it in screenshots without a later explicit request from the user.

### Other covers, local drop-in

Place covers in `public/assets/` as `crush.png`, `circles.png` and `nmf.png`, then run `npm run build` and refresh. These optional paths are already configured. Missing covers show blank squares with accessible release names, with no visible placeholder text. No upload service is needed.

### How deep is your love? cover and download

Place the square cover at `public/assets/how-deep-is-your-love.png`, then run `npm run build`. The preview automatically uses it. To add the download, paste its full `https://` URL into `upcomingRelease.downloadUrl` in `content.json` and rebuild. The download link appears after the local title reveal. This preview does not collect contacts or restrict access; a real signup gate requires the planned signup integration.

The other releases show only square covers. Tapping CRUSH., circles or NMF blurs that cover and reveals five smaller logo buttons directly over it, three above two. The featured Querida cover retains its separate streaming picker. Gallery covers keep the platform logos' desktop hover treatment and respect reduced motion. Querida appears only in the featured area. Titles, dates, counts and embedded players are removed from the gallery.

### Other release edits

1. Copy a release object in `releases`, or edit an existing one. Give it a unique `id`, such as `first-ep`.
2. Fill in `title`, `type`, `year` and `description`.
3. Add its image to `public/assets/`, set `artwork` to `/assets/first-ep.webp`, and write `artworkAlt`.
4. Fill in the release's `links`; set `placeholder` to `false` once all displayed artist details are real.
5. Set `featuredReleaseId` to the release's `id` to feature it, then rebuild/restart.

The array order controls the cover order, excluding the featured release. An empty `releases` array is supported, with a no-releases message. A nonempty array requires a matching featured ID. Artwork is square-cropped; portraits currently use the same square aspect ratio. Adjust `.portrait` in the stylesheet if your photo needs a different crop.

Optional `date` uses `YYYY-MM-DD` and displays a full date for the featured release. Optional `statusLabel` overrides its introductory label, such as "Out now".

## Music embeds

Copy the **src URL from the provider's official iframe embed code**, not the entire iframe or an ordinary share URL. Set `embed.provider` and `embed.url` on the relevant release.

| Provider | Provider value | Accepted src shape |
| --- | --- | --- |
| [Spotify](https://developer.spotify.com/documentation/embeds) | `spotify` | `https://open.spotify.com/embed/album/REAL_ID` (also track, artist, playlist) |
| [SoundCloud](https://developers.soundcloud.com/docs/api/html5-widget) | `soundcloud` | `https://w.soundcloud.com/player/?url=ENCODED_SOUNDCLOUD_URL` |
| [YouTube](https://developers.google.com/youtube/player_parameters) | `youtube` | `https://www.youtube-nocookie.com/embed/REAL_VIDEO_ID` |

These examples describe shapes, not real playable IDs. Unsupported embed URLs stop the build with an explanation. Spotify and SoundCloud must allow embedding of your content. YouTube accepts the usual eleven-character video ID. Standard YouTube embed URLs are converted to the privacy-enhanced host.

Players load only after clicking **Load [provider] player**. No autoplay is requested. The provider may limit playback according to its own login, rights, region and availability rules. Clicking to load connects the visitor to that provider; its own player handles playback.

## Listening and launch labels

- `listening.enabled: false` removes the listening section and disables the configured Last.fm connection after server restart.
- `listening.demo: true` shows explicitly labeled examples and prevents server-side Last.fm access.
- `listening.demo: false` uses your account when both environment variables are configured. It shows an unconnected message otherwise.
- `listening.period` accepts `overall`, `7day`, `1month`, `3month`, `6month`, or `12month`.
- Preview banner and `noindex` remain while `artist.placeholder`, any release's `placeholder`, or an enabled section's `listening.demo` are true. Set these to false only when the artist content is ready; remove or disable the demo section if not launching it.

If all placeholders are removed but a link or artwork is still blank, that individual slot stays clearly labeled. Optional sections should be scoped and built later rather than filled with invented tour dates.

## Images and styling

Use WebP or AVIF for photography. Suggested starting sizes: square cover around 1200×1200, portrait around 800×800. Aim for less than 250 KB per image as an estimate, checking that the artwork still looks good. Keep original high-resolution files outside `public/`; only web-ready files belong there.

Change palette variables at the top of `public/styles.css`; all current tones are provisional black/white/gray. The title uses local Georgia and controls use local system sans. Final brand type, photos, color and artwork come after the structure review.

## Querida custom tape-loop player

1. Drop the audio into `public/assets/querida.mp3`. This is separate from `querida.png`, the cover.
2. Run `npm run build` from the website folder and refresh. The tape-loop player's Play button becomes available when the audio file exists.

The featured release's `audio.src` is `/assets/querida.mp3`; MP3, WAV, M4A and OGG are accepted. If you use another format, change that path to the actual filename. An absent file leaves a visible “Audio file pending” state with disabled controls. Audio never autoplays and uses `preload=none`.

`audio.fadeIn` defaults to 1 second; `audio.fadeOut` defaults to 1.5 seconds (both configurable from 0 to 5 seconds). Web Audio schedules the gain envelope at play/resume and after seeking, with the fade-out aligned to the track's end. Very short remaining segments shorten the fades so they don't overlap. Stop resets to the beginning. Switching tabs/apps or leaving the page stops and resets immediately; exit cannot reliably wait for a fade. Returning does not resume playback. Pause holds position.

The player needs JavaScript and Web Audio support. Test the actual final audio on your target browsers once supplied; this implementation was checked with a generated test tone. The player does not change your audio file.

## White logo links

The hub uses local SVG marks and screen-reader labels; there is no visible link text. Verified destinations are clickable. Missing destinations remain white but inactive, with “link pending” accessible labels. Fill the existing `links[].url` values to activate them. Desktop hover uses a small upward lift and glow; touch devices and reduced-motion users receive no hover motion. Brand marks are sourced from Simple Icons, recorded in `public/assets/logos/README.md`.

The current player is an unboxed black-and-white SVG tape loop with two reel circles and a central Play/Pause button. A single tape splice moves along the loop only while playing, with a subtle randomized visual wobble. It pauses with playback and remains static under reduced motion. This treatment never changes audio playback speed or adds delay to the track. The link hub now uses Spotify, Apple Music, TikTok, Instagram, YouTube and Tidal in that order. TikTok and Tidal URLs are blank until supplied; their logos remain white and inactive.

## Next release signup preview

The row above Querida is a wide 820px rectangular frame. The invitation spans the top on desktop; the blurred next-release preview sits beneath it, with the full-width entry line raised over the lower portion of that preview to keep the frame compact. The envelope and phone switches sit at the left and the arrow at the right. Its underline spans the frame, while the empty placeholder is subdued and typed text is full white. The invitation wraps on narrow screens. The arrow submits a **local preview only**: it validates the contact format, clears the input, hides the signup interface and reveals the title. A visible notice states that no verification or signup occurred. No details are stored or sent. Connect a real signup and verification provider before advertising it as a working signup. The white strip above the header stays blank in preview mode; `noindex` still prevents accidental indexing while placeholders are enabled.

The release panel omits repeated streaming links; those destinations remain in the logo hub and cover links. Playback time sits beside the thin seek line. Stop is hidden at the beginning and appears during playback, loading or a paused track with progress. The pending-file notice remains until the local audio is available.


## Release streaming picker

Every release uses five services: Spotify, YouTube Music, Pandora, Amazon Music and Apple Music. This is the US monthly-use top five from Edison's 2026 Infinite Dial (see `docs/LINKS.md`), rather than a worldwide subscriber ranking. The artist's separate social/link hub keeps its existing platforms.

Each release's `links` object has `kind: "release"` for a verified direct destination or `kind: "search"` for a provider search. Searches are honestly named in accessible labels and hover tooltips; no extra text is displayed in the picker. Replace a search URL with a verified release URL and change its kind to `release` when supplied. Querida is currently pre-release: only its Apple Music destination is verified. The three older releases have direct Spotify, Apple Music, Amazon Music and Pandora links; YouTube Music links search for the artist and release.

Querida's nonmodal dialogue opens by cover tap or Enter and sits above the cover on desktop, below it on mobile (up to 760px). The other three covers reveal inline logo choices over the blurred cover, with 44px tap targets and three logos above two. A close control, Escape or an outside tap closes them; keyboard activation focuses the first service, and closing with the control or Escape returns focus to the cover. At widths up to 560px, gallery covers use one column so all five buttons remain tappable. Without JavaScript, covers follow their first configured streaming URL directly. No music autoplays when choosing a service.
