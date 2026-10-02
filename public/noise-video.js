// Use CSS raster grain on mobile: full-viewport video/canvas blending competes with
// scrolling and the cassette animation, especially on high-density screens.
export function mountNoiseVideo() {
  const video = document.querySelector('[data-noise-video]');
  const canvas = document.querySelector('[data-noise-canvas]');
  if (!video || !canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const bar = document.querySelector('[data-noise-bar]');
  const barContext = bar?.getContext('2d');
  // CSS pixels per tile: the supplied 640 × 360 clip stays at native scale.
  const tileWidth = 640;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 760px), (pointer: coarse)');
  let leaving = false;
  let failed = false;
  const canPlay = () => !document.hidden && !reducedMotion.matches && !mobile.matches && !leaving && !failed;
  let frame = null;
  const videoFrames = typeof video.requestVideoFrameCallback === 'function';
  function showFallback() {
    document.body.classList.remove('video-noise-playing');
    if (frame !== null) {
      if (videoFrames) video.cancelVideoFrameCallback(frame);
      else window.cancelAnimationFrame(frame);
      frame = null;
    }
  }
  function paint() {
    if (!canPlay() || video.paused || !video.videoWidth || !video.videoHeight) return false;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const backingWidth = Math.round(width * pixelRatio);
    const backingHeight = Math.round(height * pixelRatio);
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }
    const pattern = context.createPattern(video, 'repeat');
    if (!pattern) return false;
    const scale = tileWidth / video.videoWidth;
    context.setTransform(pixelRatio * scale, 0, 0, pixelRatio * scale, 0, 0);
    context.imageSmoothingEnabled = false;
    context.fillStyle = pattern;
    context.fillRect(0, 0, width / scale, height / scale);
    if (barContext) {
      const barHeight = bar.clientHeight;
      const backingBarHeight = Math.round(barHeight * pixelRatio);
      if (bar.width !== backingWidth || bar.height !== backingBarHeight) {
        bar.width = backingWidth;
        bar.height = backingBarHeight;
      }
      // Reuse this decoded frame; CSS inverts it to dark specks on white.
      barContext.setTransform(pixelRatio * scale, 0, 0, pixelRatio * scale, 0, 0);
      barContext.imageSmoothingEnabled = false;
      barContext.fillStyle = pattern;
      barContext.fillRect(0, 0, width / scale, barHeight / scale);
    }
    document.body.classList.add('video-noise-playing');
    return true;
  }
  function draw() {
    frame = null;
    if (!canPlay() || video.paused) return;
    try { paint(); }
    catch { failed = true; video.pause(); showFallback(); return; }
    frame = videoFrames ? video.requestVideoFrameCallback(draw) : window.requestAnimationFrame(draw);
  }
  video.muted = true;
  video.addEventListener('playing', () => {
    if (canPlay()) { showFallback(); draw(); }
    else { video.pause(); showFallback(); }
  });
  video.addEventListener('pause', showFallback);
  video.addEventListener('error', () => { failed = true; showFallback(); });
  function sync() {
    if (!canPlay()) {
      video.pause();
      showFallback();
      return;
    }
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    // Browser policy (including mobile power saving) may reject autoplay.
    const playback = video.play();
    if (playback) playback.catch(showFallback);
  }
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);
  mobile.addEventListener('change', sync);
  window.addEventListener('pagehide', () => { leaving = true; sync(); });
  window.addEventListener('pageshow', () => { leaving = false; sync(); });
  sync();
}
