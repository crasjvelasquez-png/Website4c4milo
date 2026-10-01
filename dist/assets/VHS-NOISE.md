# VHS noise video

Add the finished loop here as `vhs-noise.mp4`, then run `npm run build`.
The generator detects this exact filename and adds the background video.
Without it, the existing film-grain SVG remains active, with no missing-video request.

Recommended export budget for this decorative texture:

- 1280 × 720 pixels (16:9). No 4K or separate mobile export needed.
- 4–6 seconds, seamless loop, 24 fps.
- MP4 with H.264, yuv420p pixel format, web fast-start enabled, no audio track.
- Aim for 1–3 MB; keep below 5 MB. Random noise compresses poorly; reduce
  detail, frame rate, or duration before increasing the size budget.
- Grayscale specks on black. The page uses screen blending at 40% opacity:
  black disappears and light specks show over the green.

One video supplies a canvas pattern repeated horizontally and vertically across
the viewport, including while scrolling. It uses 640 CSS-pixel-wide tiles, so
the supplied 640 × 360 clip is not stretched. Tile edges should match to avoid
visible seams. Adjust `tileWidth` in `public/noise-video.js` to change the grain
scale, or `.vhs-noise` opacity in `public/styles.css` to change its strength.
The canvas follows the clip's frame rate where video frame callbacks are supported
and caps its backing resolution at 2× for high-density screens.
The white top bar reuses the same frame, inverted and multiplied onto white
at the same opacity, so its noise appears as dark specks.

The video loops silently, pauses when the page is hidden or exited, and resumes
when visible. Reduced-motion visitors get the still texture without an initial
video download. Playback errors, autoplay rejection, and disabled JavaScript also
keep the still texture. The video cannot intercept clicks or enter keyboard focus.
