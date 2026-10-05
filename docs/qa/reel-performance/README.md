# Reel performance verification — 2026-10-04

Changes: render decorative grain at 1x CSS resolution and 15fps on desktop as well as mobile; start decorative media after window load during idle time; prepare scratch PCM only on scratch-handle hover/focus/use; suspend offscreen reel/head updates without pausing audio.

Build and 26 build/audio tests passed. Chromium and WebKit passed touch playback/pause/resume, volume, release switching/dismissal, rapid taps, viewport rotation, reduced motion, failed decorative media, delayed/failed app loading and JavaScript-disabled fallback. Portrait 320/390/430, landscape 844×390, and 760/761×900 were exercised with no horizontal overflow or page errors. Screenshots inspected; existing narrow title wrapping at 761px remains (no layout styles changed). Desktop offscreen tests confirm audio advances while reels stop and animation resumes on return.

At 1280×900, DPR 2, Chromium with 4x CPU throttling, over approximately 5.2 seconds of playback:

| Metric | Before | After |
| --- | ---: | ---: |
| Grain paints | 156 | 76 |
| Canvas pixels repainted | 718,848,000 | 87,552,000 |
| Full-track scratch decodes on Play | 1 | 0 |
| Long tasks during measured playback | 147ms | None observed |
| 95th percentile frame interval | 16.8ms | 16.8ms |

This is an 87.8% reduction in background canvas pixels processed, not a measured 87.8% reduction in total CPU/GPU usage. A single local run does not establish real-device smoothness or cold-network loading improvements. First scratch interaction may wait for decode if hover/focus has not already prepared it. Video decoding still runs at the source cadence; only canvas painting is capped.

Full data: `results.json` and `offscreen.json`. Reproduce from the repository root with the site running on port 3001 and Playwright available:

```
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node docs/qa/reel-performance/verify.mjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node docs/qa/reel-performance/offscreen.mjs
```

The comparison harness serves HEAD source for its before sample; that baseline changes after committing. Chrome uses the standard macOS application path; WebKit uses Playwright's installed browser.

Not tested: physical iPhone/Android, Safari app, Instagram browser, device audio output/subjective listening, production, cold-network timings or live signup submission. No external contacts created or messages sent.
