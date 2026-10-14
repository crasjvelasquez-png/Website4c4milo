# Wordle reference comparison

Checked October 12, 2026. The blocked live Wordle site was not bypassed. These independently hosted, published images were inspected instead:

1. [Official NYT Games App Store listing](https://apps.apple.com/us/app/nyt-games-wordle-crossword/id307569751), Wordle screenshot. This is native-app presentation, not proof of the current web page.
2. [Creator-credited original board screenshot in The Guardian](https://www.theguardian.com/games/2021/dec/23/what-is-wordle-the-new-viral-word-game-delighting-the-internet), December 2021. Board-only historical evidence.
3. [Published web screenshot in Tom's Guide](https://www.tomsguide.com/phones/you-can-finally-create-your-own-wordle-puzzle-heres-how-to-make-a-real-head-scratcher), November 2025. The screenshot is a cropped view with a publication's annotation; it does not establish original CSS dimensions.

## Compared and corrected

| Element | Reference observation | Local result |
| --- | --- | --- |
| Board | Five columns, square tiles, narrow even gaps, strong letter weights | Five columns, square tiles, 5px gaps, bold 32px letters. Four rows are the user's custom rule. |
| Keyboard | Three QWERTY rows, indented middle row, wide Enter/Delete | Same ordering and structure, wider action keys, 58px heights. |
| Screen chrome | Play screen centers on header, board and keyboard | Removed permanent invented subtitle/footer; their text remains accessible and rules are in Help. |
| Feedback | Color-coded tiles/keys; play screen has no ongoing guess-count paragraph | Routine guess counts now announce to screen readers; validation/loading/result messages float without consuming a layout row. |
| Brand/rules | Reference uses Wordle identity, six guesses and standard state colors | Unlock identity, CRUSH palette and answer, four guesses, unlimited retries, early-access reward, no leaderboard and no decorative animation remain explicit user requirements. |

## Verification and limits

Build and all 60 Node tests pass. The 18 Chromium/WebKit QA result groups passed again across 320, 390, 430, 844×390 landscape, 760/761 and 1280px widths. Screenshots and results are in this directory and `../unlock-browser-results.json`. The actual 182px in-app panel was also checked and its header overflow corrected.

This verifies functional behavior and a screenshot-informed structural match. It does **not** certify pixel-identical typography, current live-site styling, exact CSS dimensions, the NYT dictionary, settings/statistics screens, physical devices or production hosting. Published screenshots cannot establish those. No NYT code or art was copied into the game.
