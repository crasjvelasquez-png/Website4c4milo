// Decorative media never starts sound or loads for reduced-motion visitors.
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
  const compact = window.matchMedia('(max-width: 760px), (pointer: coarse)');
  // Grain has no fine edges to preserve at Retina resolution. Keep its native
  // CSS-pixel scale on phones and leave rendering time for touch and playback.
  let width, height, pixelRatio, barHeight, barVisible = true;
  let lastPaint;
  function measure() {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = compact.matches ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    barHeight = bar?.clientHeight || 0;
    lastPaint = undefined;
  }
  measure();
  window.addEventListener('resize', measure, {passive:true});
  compact.addEventListener('change', measure);
  if (bar && window.IntersectionObserver) {
    new window.IntersectionObserver(([entry]) => { barVisible = entry.isIntersecting; }).observe(bar);
  }
  let leaving = false;
  let failed = false;
  const canPlay = () => !document.hidden && !reducedMotion.matches && !leaving && !failed;
  let frame = null;
  const videoFrames = typeof video.requestVideoFrameCallback === 'function';
  function showFallback() {
    lastPaint = undefined;
    document.body.classList.remove('video-noise-playing');
    if (frame !== null) {
      if (videoFrames) video.cancelVideoFrameCallback(frame);
      else window.cancelAnimationFrame(frame);
      frame = null;
    }
  }
  function paint() {
    if (!canPlay() || video.paused || !video.videoWidth || !video.videoHeight) return false;
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
    if (barContext && barVisible && barHeight > 0) {
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
  function draw(now = 0) {
    frame = null;
    if (!canPlay() || video.paused) return;
    // The clip is 30fps. Sample every other source frame on phones; fallback
    // rAF browsers must not repaint at their display's 60/120Hz refresh rate.
    const interval = 1000 / (compact.matches ? 15 : 30);
    try {
      if ((videoFrames && !compact.matches) || lastPaint === undefined || now - lastPaint >= interval - 2) {
        if (paint()) lastPaint = now;
      }
    }
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
  window.addEventListener('pagehide', () => { leaving = true; sync(); });
  window.addEventListener('pageshow', () => { leaving = false; sync(); });
  sync();
}
