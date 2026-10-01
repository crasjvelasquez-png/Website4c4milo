# Verification, September 28, 2026

## Passed

- `npm run build` successfully generates the static page from `content.json`.
- Eight Node tests cover URL/embed safety, markup escaping, Last.fm configuration/caching/concurrent request sharing, empty/stale/unavailable responses, and static-server traversal/symlink/private-file protection plus HTTP methods. Build regressions cover failed-edit preservation, field-specific content errors, empty discography and removing preview/noindex when placeholder listening is disabled.
- Browser inspection confirms rendering at 320, 390, 760 and 1280 CSS pixels wide without horizontal page overflow. No browser warnings or errors were reported.
- Listening tabs switch by click and Left Arrow; native release details expand with Enter. Main anchors navigate to their page sections.
- Missing assets and unverified links remain explicit placeholders. Last.fm requests remain disabled in demo mode; real Spotify players load only after a click.
- Neutral OKLCH text tokens produce about 18.69:1 primary and 8.46:1 secondary contrast against black (calculated for the current grayscale colors).

## Listening display verified with browser fixtures

An isolated temporary server copied the actual build, turned demo mode off only in that copy, and returned labeled test data. The artist's content.json, API credentials and main preview were unchanged. Browser checks confirmed:

1. Live data renders a now-playing marker and top-artist play counts.
2. Stale data keeps the cached rows and displays a stale-data message. Cached now-playing activity is labeled "Playing at last update", rather than claiming current playback; this wording was rechecked in the browser after the fix.
3. Empty data displays an empty-state message and per-panel empty rows.
4. A 503 response displays temporary-unavailability text; an unconfigured response displays an unconnected message.
5. Markup-like titles render as plain text, with no injected image or unsafe link. The stale state also fits a 390px viewport without horizontal overflow.

Results are saved in qa/listening-browser-results.json; qa/listening-stale-fixture.jpg is a clearly labeled test-data screenshot. The temporary server was stopped and removed afterward. These are UI fixture checks, not proof of a live Last.fm account connection.

## Intentional limits

No Last.fm account/API key, artist photos or logo was supplied. Music destinations were researched and verified; catalogue source details are in LINKS.md. Live API response handling is tested with fixtures; live credentials and provider playback still need verification. Docker is not installed in this workspace, so Docker build, production DNS and TLS are not exercised. They require your own server and domain. This is a structure preview, not the final artist branding or a completed WCAG audit.

Recent/top Last.fm are the prepared baseline, pending your feature choice. Listening history, recommendations, tours, shop and mailing list have not been enabled. No visitor login, scrobbling platform or social network is assumed.

## Verified catalogue and contact update

Build and all eight tests pass after adding info@c4milo.com, the verified artist profiles and four real releases. Browser DOM checks confirm the new contact destination, Querida Out now wording/date, artist links, discography count and the NMF disclosure links. Clicking Load spotify player inserts the official NMF iframe with the expected title and source; full audio playback was not exercised. The expanded page has no horizontal overflow at the current 1280px viewport. Prior mobile layout checks remain applicable to the unchanged layout, but this content update was not rechecked at every mobile width. No screenshot or artwork inspection was performed. Querida Spotify and social destinations remain pending.

## Retro player and logo-hub revision

All five browser annotations are implemented. Header navigation and featured format/date text are absent. The sleeve is 360px on desktop and capped at 280px on mobile. The hub has only white SVG marks with accessible names; CSS hover is gated to hover-capable fine pointers and disabled for reduced motion. No audio autoplays.

Build and all 11 tests pass. The three added tests exercise the gain envelope's attack and exact track-end release (including late seeks), cancellation of a pending Play after Stop/exit, and byte-range audio serving. An isolated temporary build with a six-second generated quiet tone verified real HTML audio playback, loaded duration, Stop resetting to zero, and page-exit stopping/resetting to zero. No artist audio was used.

Browser verification of isolated 320px, 390px and 760px frames confirms no page overflow and all five logos on one horizontal row. Covers are 280px at each tested mobile width; the player widths are 280px, 350px and 440px respectively. A desktop screenshot was visually inspected with placeholder cover artwork only. The final main preview confirms a 360px sleeve, no header navigation/date line, no visible hub text and the disabled Audio file pending state.

The actual Querida audio still needs to be dropped locally and tested on target browsers. Exit stops immediately rather than relying on an unload fade, which browsers cannot reliably finish. Temporary QA servers and files are removed after verification; the main preview remains running.

## Minimal tape-loop revision

The cassette housing was replaced with an unboxed SVG tape-loop graphic and left-side circular Play/Pause control. The existing fade, seeking and exit-stop transport is unchanged. Moving tape marks use a paused CSS animation activated by the existing playing state; reduced motion disables it. Bandcamp in the hub was replaced with TikTok, and Tidal was added. Desktop logos now span up to 820px with evenly distributed spacing. Build and all 11 tests pass; desktop screenshot inspection confirms the new visual and six white marks.

Responsive browser fixtures at 320px, 390px and 760px confirm six logos stay on one row without horizontal page overflow; player widths are 280px, 350px and 440px. The tape animation is paused in the idle state. Temporary fixture data and server are removed after inspection.

## Simplified featured release panel

Removed repeated featured streaming links and decorative tape-head marks, reduced the title/player spacing and consolidated progress/time into one thin-line row. Stop is hidden when there is no playback/progress to reset. The tape uses one moving splice rather than repeated moving dots. Build and all 11 tests pass; browser DOM confirms the duplicate links are absent, idle Stop is hidden and the page has no horizontal overflow. A desktop screenshot with placeholder artwork was visually inspected. Actual artist audio remains pending.

## Full-goal continuation checks after simplification

The updated actual player was exercised with a temporary ten-second generated quiet tone. Play starts audio and the tape's animation; Pause pauses both while keeping Stop available; Stop resets currentTime to zero and hides itself. Navigating away logs paused=true/currentTime=0. At 320/390/760px the browser fixture reports page widths matching viewports, player widths 280/350/360px, positive seek-track widths and all six logos sharing a row. Only the fixture relaxed framing headers to permit these viewport checks. Production source and security headers were unaffected. The QA tab, server and temporary files were removed. README/PRODUCT/DESIGN and launch guidance are updated to reflect the user-removed sections and existing domain.

## Signup and tape refinement, September 29, 2026

The signup and Querida rows now share a 600px maximum width and matching 64px artwork slots, reducing to 48px at narrow widths. Local Chrome inspection found no horizontal overflow at 390px or 320px: document scroll width equaled viewport width, and the signup and Querida covers both measured 48px. Desktop and phone screenshots were visually inspected with placeholders only; no artist artwork was opened. The email/phone toggle changed input type, name and accessible label; invalid phone input showed an error, while valid input cleared and disabled the field and explicitly reported that no signup occurred. Emulated reduced motion removed the tape animation and transition. The tape's random variation is visual only; final audio is still pending, so motion during real playback needs a check after the file is supplied. `npm run build` and all 14 tests pass.

The icon-toggle follow-up replaced Email/Phone text with envelope/phone SVGs and constrained the signup controls to the blurred preview's text column. Chrome measured both identity and form at 280px on desktop and 390px mobile, and 222px at 320px mobile; signup and featured covers remained equal at each width. No horizontal overflow was observed. Desktop and 390px screenshots were inspected with placeholder artwork only. Build and all 14 tests pass.

The signup enclosure follow-up adds one 420px rectangular card around the blurred preview and controls. DOM-only local Chrome checks measured no horizontal overflow at 1280px, 390px or 320px. Invalid input kept the form open; valid email and phone formats hid the form, cleared the input, revealed the title, and displayed a notice that no contact was verified or signed up. The measured blur filter reached `none` after the reveal transition. Build and all 14 tests pass. Actual verification still requires an external signup service.

The latest layout widens that card to 600px and places the preview beside the form on desktop, closer to the Querida row below. At 390px and 320px the card stacks its content. The preview strip is blank and 40px tall. DOM-only Chrome checks showed document width equal to viewport width at 1280px, 760px, 390px and 320px; card dimensions were 600×199px on desktop, 350×251px at 390px and 280×251px at 320px. The form still hides and the title/preview notice remain after a valid local entry. No screenshots or artwork inspection were used for this check. Build and all 14 tests pass.

The current signup revision builds on the wider 820px card: its invitation spans one line at 1280px and 760px, then wraps on phone widths. The entry underline spans the card's inner width, with email/phone icons at its left edge and the submit arrow at its right. DOM-only Chrome checks at 1280px, 760px, 390px and 320px found no horizontal overflow. Placeholder opacity is 0.48 and entered text remains full white. The phone toggle still sets `type=tel`, and valid email submission still hides the form and shows the preview notice. Build and all 14 tests pass; no artwork captures were made.

## Inline gallery streaming choices

CRUSH., circles and NMF now reveal their existing five streaming links directly over a blurred cover in a 3-over-2 grid. Querida retains its featured-cover picker. DOM-only Chrome checks at 1280px, 390px and 320px found three gallery tiles, one featured picker, no horizontal overflow, five 44×44px service targets per opened tile and the expected three/second-row-two positions. Opening another cover closes the first; Escape, the close button and an outside pointer press close the overlay. Keyboard activation focuses the first service, and reduced motion removes the blur transition. All 14 tests pass. No screenshots or artwork inspection were used.

The signup entry line is raised within its card, letting it overlap the lower blurred preview area. DOM-only Chrome checks measured card heights of 161px at 1280px and 177px at 760/390/320px, with the entry line 28px and 12px into the preview respectively. The note remains within the card, the gap to Querida remains 48px on desktop and 36px on phones, and no horizontal overflow was found. After a valid preview entry the form hides, the notice remains inside the card, and the card measures 128px at 320px. Build and all 14 tests pass; no artwork captures were made.

## Gallery animation timing, September 30, 2026

Gallery menus now fade in over 240ms, with a 20ms icon stagger finishing by 320ms, and fade out over 180ms. A single backdrop blur replaces animated artwork filtering and nested icon blurs. Exit completion respects rapid reopening, and dismissing a menu makes its links inert immediately. Hover feedback is 240ms.

Integrated with the newer main branch while preserving its baked background images, background pause behavior, page reveals, external motion setup, teaser and signup changes. Rebuilding also synchronizes the previously stale generated release-teaser.js with its existing source.

Build and all 23 Node tests pass. Local Chromium checks at 320, 390, 760 and 1280px cover normal/reduced motion under 4× CPU throttling, layout overflow, audio play/pause, menu opening and dismissal, keyboard focus, repeated interrupted exits/reopening, switching tiles and outside clicks. Results are saved in qa/motion-browser-results.json. These mobile checks use touch and viewport emulation; physical phones and Safari are not tested. Cloudflare deployment is not verified.

## Cassette player mobile fixes, October 1, 2026

The tape outline used CSS `d:path()` to expand from radius 44 to 48, while the
SVG inner rims defaulted to radius 48. Browsers without CSS path morphing left
the rims disconnected, matching the reported phone screenshot. The player now
animates SVG `d` attributes with one radius shared by the tape, travel marker,
and both inner rims. Reduced motion applies the final geometry immediately.

Volume now has a separate Web Audio gain after the fade gain, so it works when
iOS ignores `HTMLMediaElement.volume`. Changes ramp over 20ms. Media playback
and AudioContext resume are both invoked synchronously within the play gesture.
The startup seek no longer restarts the fade, and buffering recovery reschedules
the end fade without another attack. Cancelled startup completion cannot pause
a newer playback request.

`npm run build` and all 37 Node tests pass, including regressions for the gain
routing, mute, startup seek, buffering recovery, gesture activation, cancellation,
and shared reel endpoints. Local Chromium interaction checks cover 320, 390,
760 and 1280px, normal/reduced motion, and 4× CPU throttling. They deliberately
disable CSS path morphing and make media-element volume assignments ineffective.
Checks cover joined rims during expansion and interrupted reveals, touch/mouse
volume dragging, keyboard mute/restore, measured audio output, play/pause/resume,
layout overflow and browser errors.

Results: `qa/cassette-browser-results.json`. Screenshots:
`qa/cassette-mobile-fixed.png`, `qa/cassette-desktop-fixed.png`, and
`qa/cassette-mobile-morph-disabled-before.png` (a compatibility reproduction).
These are local browser checks with mobile touch/viewport emulation and output
measurements; physical iPhones, Safari/Instagram's browser, subjective listening,
and production deployment were not tested.
