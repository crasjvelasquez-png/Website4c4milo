---
version: 1
slug: "lib-unlock-page-mjs"
primary_target: "lib/unlock-page.mjs"
related_targets: ["public/unlock.css","public/unlock.js","public/unlock-engine.js"]
---

# Unlock surface

Scope: `/unlock`, a standalone release puzzle. Mode: Operate.

Listeners arriving from a shared link guess one fixed five-letter passcode to reveal the next release's early-access destination. The task is a familiar Wordle game with four guesses per round and unlimited rounds. The visible play surface stays limited to the masthead, board, keyboard and necessary recovery/reward controls; rules live in Help and accessible text. Validation/results float without taking a layout row; routine guess counts are screen-reader-only. Use the user-pinned Wordle composition: CRUSH deep-green page (#183d00), off-white text (#e9e9e8), centered serif masthead, a square 5×4 tile board, and three rows of tinted-green QWERTY keys. Off-white/yellow/dark-green feedback scores letters instantly; there are no tile flips, bounce, stagger, or entrance animation. Four misses reset the board and keyboard after a 1.2-second reading pause without revealing the answer.

No leaderboard, accounts, daily lockout, API, or enforced access protection. Browser-only answer and link are authorized. Keep the artist homepage independent. Show clearly labeled AUDIO practice while the real answer is blank; never expose a practice reward link. Persist rounds locally where storage is available. Support physical keyboards, touch, optional storage failure, reload recovery, help focus, accessible score labels, and request-failure retry. Landscape may scroll to preserve usable keys.

The real answer is CRUSH, as supplied by the user. Primary and secondary colors were sampled directly from public/assets/crush.webp; the cover lettering is not displayed since it would reveal the answer. Unresolved content: early-access HTTPS URL and preferred dictionary/language. Configuration defaults to English; letters-only guesses are available. Production activation and real-device/social-app verification remain outstanding.
