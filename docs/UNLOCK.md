# Release puzzle

The standalone game lives at `/unlock` (also `/unlock/`). It has five letters, six guesses per round, a staggered tile-flip reveal, and unlimited retries. After six misses the board and keyboard clear automatically 1.2 seconds after the reveal finishes; the answer is never shown on a loss. A correct guess reveals the passcode and configured early-access link. No account, leaderboard, daily lockout, or server API is required.

## Configure the release

Edit the `unlock` section in `content.json`:

```json
"unlock": {
  "answer": "CRUSH",
  "releaseUrl": "https://untitled.stream/library/project/b9ByeI7v9WhElIUFOZrGQ",
  "dictionary": "english"
}
```

- `answer`: exactly five A–Z letters, case insensitive. Blank uses the clearly labeled AUDIO practice puzzle. The configured answer is always accepted even if absent from the English dictionary.
- `releaseUrl`: a full HTTPS destination. Blank keeps the early-access button hidden and shows an honest coming-soon message after solving. Practice never displays a release link.
- `dictionary`: `english` rejects guesses absent from the bundled list; `letters` accepts any five A–Z letters, useful for a code or non-English campaign. Spanish/accented keyboard and dictionary support are outside the current scope.

The current answer is **CRUSH**. The game palette is sampled from the existing CRUSH cover: primary deep green `#183d00`, secondary off-white `#e9e9e8`. Correct letters use off-white, misplaced letters use distinct mustard yellow, and absent letters use darker green. Neutral controls use green tints. Instructions describe these states; the masthead and layout remain familiar and unanimated. The cover itself is not displayed, since its title would expose the answer.

Run `npm run build` after editing. Refresh the local `/unlock` page; deploy the rebuilt site through the existing Cloudflare Worker deployment process to update production. Nothing adds a homepage link automatically, so the page can be shared directly when ready.

## Behavior and implementation

`lib/unlock-page.mjs` validates configuration and generates standalone markup; `scripts/build.mjs` emits `dist/unlock/index.html` and `dist/unlock-config.json`. `public/unlock.css`, `unlock.js`, and `unlock-engine.js` provide rendering and game logic. The local server maps both route variants to the generated page; Workers Static Assets resolves the directory's index page without changing Worker routing.

The puzzle runs in the browser. The answer and destination are public by design, as approved for this low-pressure campaign. There is no access enforcement. Every page load starts a fresh six-attempt board. Refresh clears guesses, partial input and keyboard colors. Wins and reward access last only until refresh or Play again. No game state is read from or written to browser storage; old saved wins are ignored. After six misses, the board resets automatically for another attempt.

The bundled English list is a five-letter subset (15,921 entries) of [dwyl/english-words](https://github.com/dwyl/english-words), `words_alpha.txt`, retrieved October 12, 2026. It is broad, including uncommon words; it is not NYT's exact dictionary. Source and license are included in `public/unlock-words-LICENSE.txt`. All assets are local and require no npm packages or third-party runtime requests.

Config and dictionary failures show Reload puzzle; they do not consume guesses. Slow requests time out after ten seconds per file. Keyboard and touch controls, native help dialog, visible focus, letter-state announcements, and JavaScript-disabled fallback are included. Letter entry is instant. Submitted tiles flip around their horizontal axis for 300ms each, starting 100ms apart from left to right (about 700ms total). Colors change at the edge-on midpoint; keyboard scoring, announcements and the win panel update after the last tile settles. Input is ignored during the reveal. Reduced motion skips the flip and stagger, and page loads always start with an empty board. The play screen contains the header, board and keyboard; rules live in Help, and error/result messages float without changing layout. Routine guess counts remain screen-reader announcements. Phone landscape may scroll to preserve usable key sizes.

Production activation still needs the real answer, destination, and deployment. Browser emulation is not evidence of physical-device or social-app compatibility.

## Verification (October 12, 2026)

The build and all 60 Node tests passed. Chromium and WebKit passed touch-emulated portrait checks at 320, 390 and 430 CSS pixels, phone landscape at 844×390, both 760/761 breakpoint widths, and 1280×900 desktop. The game uses its own stylesheet with no inherited site zoom. Recorded checks cover square tiles, horizontal overflow, board/keyboard clearance, touch and physical keyboard guesses, invalid guesses, fourth-guess wins, automatic reset, refresh persistence, dialog/focus behavior, reduced motion, orientation changes, English and letters-only modes, custom reward configuration, request failures/retry, slow-loading input, JavaScript-disabled fallback, and blocked local storage. Accessible tile names were also checked in both engines; this does not establish actual screen-reader output.

Results: `docs/qa/unlock-browser-results.json`. Screenshots: `docs/qa/unlock/`. Checks were rerun with the CRUSH answer and theme. A separate Chromium/WebKit check also verified the actual 182×493 in-app panel after correcting its clipped masthead; evidence is in `docs/qa/unlock/narrow-panel-results.json`. This unusually narrow panel is not a phone-size touch-target certification. Scored-key text contrast exceeds 4.5:1 in all active states, and the board retains accessible tile labels. Physical phones, Safari app, Instagram browser, production routing and the ten-second timeout branch were not tested.

To repeat browser QA, start the local site on port 3012 and run `node scripts/verify-unlock.mjs` with an available Playwright installation. If it is outside this checkout, set `PLAYWRIGHT_MODULE_PATH` to that installation's `index.mjs`; no package is required by the site itself. `UNLOCK_QA_URL` can override the local origin. Use a local/test origin: the script mocks release/config failures and never follows the reward link.

The published-image Wordle comparison, concrete corrections and fidelity limits are recorded in `docs/qa/unlock-reference-comparison.md`. It is a structural comparison, not a pixel-identical certification of the inaccessible live site.

## Tile-flip verification (October 13, 2026)

Build and 18 relevant Node tests passed. The full browser suite passed again in Chromium 151 and WebKit 26.5 at all seven listed viewport sizes. Additional motion checks confirmed left-to-right color changes roughly 100ms apart, input ignored during the reveal, delayed keyboard/win updates, immediate reduced-motion results, and no animation on restored guesses. A Chromium 390×844 mid-flip screenshot was visually inspected. Evidence: `docs/qa/unlock-flip-results.json`; repeat with `scripts/verify-unlock-flip.mjs` using the same Playwright and local-origin settings as the main suite. This verification is local browser emulation; physical phones and production remain untested.

## Six-attempt verification (October 13, 2026)

The game now has six rows and resets after six misses. Instructions, metadata and accessible labels reflect six attempts. Eighteen relevant Node tests passed, including persistence after five misses and a sixth-guess win. Chromium and WebKit passed the full seven-viewport browser suite with sixth-guess win/reset checks, and the flip suite passed again. After reducing board width and key height on short viewports, an additional layout check passed both engines at 320×568, 390×844, 430×932, 844×390, 760×900 and 761×900: no horizontal overflow or board/keyboard overlap, key heights at least 44px, and the keyboard fits in portrait. The 320×568 screenshot was visually inspected. Verification remains local emulation.

## Refresh reset verification (October 13, 2026)

Progress persistence was removed. Sixteen relevant Node tests passed after removing obsolete storage-restoration tests. Chromium and WebKit verified that scored guesses, partial entry, solved rounds and keyboard colors clear on refresh. Additional checks confirmed that refreshing mid-flip starts fresh and old saved wins are ignored. The full browser suite was updated to expect reset behavior. Verification remains local; production has not been deployed.

## Remembered wins (October 13, 2026; superseded)

The board still clears on refresh, but a completed win now persists per answer and practice/release mode in local storage. The supplied Untitled destination is configured. Winners retain access while playing again; refreshing does not restore old guesses or keyboard colors. A changed answer requires a new win. Clearing browser storage, private sessions or another browser/device will not retain this local record. If storage is blocked, the link remains available only during the visit. Chromium and WebKit passed dedicated first-visit, win, replay, refresh, fresh-board input and answer-change checks; evidence is `docs/qa/unlock-remember-win-results.json`. A remembered-win mobile screenshot was visually inspected. Sixteen relevant Node tests passed. No public scoreboard has been added.

## Wins reset on refresh (October 13, 2026)

Remembered wins are disabled completely. The game does not read or write browser storage, and ignores any previously saved win. Refresh and Play again clear the board, keyboard colors and reward panel. Six misses still reset automatically for unlimited retries.

Build and 17 relevant Node tests passed. Chromium and WebKit passed the full browser suite at all seven viewport sizes, including old saved wins ignored, no storage reads or writes, refresh and Play again clearing rewards, and a playable fresh board after six misses. Evidence: `docs/qa/unlock-browser-results.json`. Verification is local browser emulation; production has not been deployed.
