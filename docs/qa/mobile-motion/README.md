# Mobile motion verification — October 4, 2026

Changes: phone/touch grain uses a one-CSS-pixel backing store and samples the
30fps clip at up to 15fps; bar geometry is measured outside the paint loop and
an offscreen bar is not repainted. Hidden-tab, page-exit, autoplay-error, and
reduced-motion fallbacks are retained. Touch devices never prepare full-track
scratch buffers, including landscape. Desktop scratching is retained. Phone
section reveals last 420ms without the stagger, replacing 850ms plus stagger.

## Checks

- Build, 36 relevant Node tests (`noise-video`, `audio`, `build`), and
  `git diff --check` pass. New behavioral tests cover frame limits, avoiding
  layout reads inside paint, offscreen bars, resize, density/preference changes,
  and resuming a single animation callback after visibility changes.
- Chromium 154 and Playwright WebKit 26.6, touch emulation at DPR 3:
  320×568, 390×844, 430×932, 844×390, 760×900, and 761×900. No horizontal
  overflow. CSS body zoom is 1.2 through 760px and 1.3 above it.
- Play/pause/resume, volume taps, menu opening/switching/outside dismissal,
  rapid play taps, live rotation, reduced viewport height, reduced motion,
  blocked decorative video, stalled application code, JavaScript disabled,
  delayed artwork, and pagehide/pageshow checked. Real MP3 media clocks advance
  and Web Audio output is nonzero in both engines; no subjective listening.
- Desktop 1280px checks retain double-density grain, the visible scratch handle,
  and keyboard scratching/resume. Focused sections remain visible; Chromium's
  platform-link keyboard focus has a visible outline. WebKit's host-default
  keyboard settings skip links during Tab navigation, so only direct focus and
  section visibility were verified there.
- Screenshots were visually reviewed across the matrix. Existing 761px title
  wrapping remains; this change does not alter that layout. Saved full-page
  captures are compressed for review and contain untriggered offscreen reveals;
  `*-390-playing.jpg` shows the actual phone viewport during playback.

## Before/after experiment

`results.json` contains one five-second Chromium playback comparison at
390×844 / DPR 3 with 4× CPU throttling. The baseline served the original Git
HEAD versions of the three changed public assets; the after run served the
rebuilt local files. The main grain canvas painted 206,712,480 versus 25,016,160
pixels (87.9% fewer). Scratch decode calls fell from one to zero. The baseline
recorded a 110ms long task; the updated run recorded none. The 95th-percentile
frame interval was approximately 16.8ms in both runs. This demonstrates less
work and removal of a startup hitch in this experiment, not a universal FPS
increase or a physical-phone benchmark.

No production deployment, physical iPhone/Android, Safari app, Instagram browser,
physical keyboard, or device-speaker verification. Signup is hidden in this
configuration and was not submitted. The current phone player has no seek
control; desktop keyboard scratching was exercised instead.
