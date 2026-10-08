// Decorative media never starts sound or loads for reduced-motion visitors.
export function mountNoiseVideo() {
  const video = document.querySelector('[data-noise-video]');
  const canvas = document.querySelector('[data-noise-canvas]');
  if (!video || !canvas) return;
  const {deviceMemory = 8, hardwareConcurrency = 8, connection} = typeof navigator === 'undefined' ? {} : navigator;
  const lighterEffects = connection?.saveData === true
    || (deviceMemory <= 4 && hardwareConcurrency <= 4);
  if (lighterEffects) {
    document.body.classList.add('lighter-effects');
    return;
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  const bar = document.querySelector('[data-noise-bar]');
  const barContext = bar?.getContext('2d');
  // CSS pixels per tile: the supplied 640 × 360 clip stays at native scale.
  const tileWidth = 640;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Grain has no fine edges to preserve at Retina resolution. Use CSS pixels
  // on every screen so decoration leaves rendering time for the player.
  let width, height, pixelRatio, barHeight, barVisible = true;
  let lastPaint;
  function measure() {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = 1;
    barHeight = bar?.clientHeight || 0;
    lastPaint = undefined;
  }
  measure();
  window.addEventListener('resize', measure, {passive:true});
  if (bar && window.IntersectionObserver) {
    new window.IntersectionObserver(([entry]) => { barVisible = entry.isIntersecting; }).observe(bar);
  }
  let ready = false;
  let leaving = false;
  let failed = false;
  const canPlay = () => ready && !document.hidden && !reducedMotion.matches && !leaving && !failed;
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
    // Sample the 30fps decoration at 15fps; keep the player at display cadence.
    const interval = 1000 / 15;
    try {
      if (lastPaint === undefined || now - lastPaint >= interval - 2) {
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
  // Give artwork and the initial reveal priority over decorative video loading.
  const start = () => {
    const activate = () => { ready = true; sync(); };
    if (window.requestIdleCallback) window.requestIdleCallback(activate, {timeout:1500});
    else window.setTimeout(activate, 200);
  };
  if (document.readyState === 'complete' || document.readyState == null) start();
  else window.addEventListener('load', start, {once:true});
}
