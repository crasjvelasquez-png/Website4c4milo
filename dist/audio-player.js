// One media element, one gain envelope. No autoplay or background playback.
export function scheduleEnvelope(param, now, position, duration, fadeIn, fadeOut) {
  const remaining = Math.max(0, duration - position);
  const attack = Math.min(fadeIn, remaining / 2);
  const release = Math.min(fadeOut, remaining / 2);
  param.cancelScheduledValues(now);
  param.setValueAtTime(attack > 0 ? 0 : 1, now);
  if (attack > 0) param.linearRampToValueAtTime(1, now + attack);
  if (release > 0) {
    param.setValueAtTime(1, now + remaining - release);
    param.linearRampToValueAtTime(0, now + remaining);
  }
}

export function createTransport(audio, {createContext, fadeIn = 1, fadeOut = 1.5}) {
  let context, gain, generation = 0;
  const envelope = () => {
    if (gain && Number.isFinite(audio.duration)) scheduleEnvelope(gain.gain, context.currentTime, audio.currentTime, audio.duration, fadeIn, fadeOut);
  };
  audio.addEventListener('playing', envelope);
  audio.addEventListener('seeked', () => { if (!audio.paused) envelope(); });
  audio.addEventListener('ended', () => stop());
  async function play() {
    const token = ++generation;
    if (!context) {
      context = createContext();
      gain = context.createGain();
      context.createMediaElementSource(audio).connect(gain);
      gain.connect(context.destination);
    }
    await context.resume();
    if (token !== generation) return;
    // Stay silent while loading; the 'playing' event schedules the fades.
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(0, context.currentTime);
    await audio.play();
    if (token !== generation) stop();
  }
  function pause() {
    generation++;
    audio.pause();
    if (gain) {
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setValueAtTime(0, context.currentTime);
    }
  }
  function stop() {
    pause();
    if (audio.readyState > 0) audio.currentTime = 0;
  }
  return {play, pause, stop};
}

export function mountPlayer(root) {
  const audio = root.querySelector('audio');
  const toggle = root.querySelector('.audio-toggle');
  const status = root.querySelector('.audio-status');
  const symbol = root.querySelector('[data-play-symbol]');
  if (!audio.getAttribute('src')) return;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) { status.textContent = 'This browser cannot use the audio player.'; toggle.disabled = true; return; }
  const transport = createTransport(audio, {createContext:()=>new Context(), fadeIn:Number(root.dataset.fadeIn), fadeOut:Number(root.dataset.fadeOut)});
  let loading = false;
  let wobbleFrame;
  let nextRipple = 0;
  let ripples = [];
  const tapePaths = [...root.querySelectorAll('.tape-ribbon, .tape-travel')];
  const restingTape = 'M80 16 H520 A54 54 0 0 1 520 124 H80 A54 54 0 0 1 80 16 Z';
  let wasPlaying = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function stopWobble() {
    cancelAnimationFrame(wobbleFrame);
    nextRipple = 0;
    ripples = [];
    for (const path of tapePaths) path.setAttribute('d', restingTape);
  }
  function nudgeTape(now) {
    if (audio.paused || document.hidden || reducedMotion.matches) return;
    if (!nextRipple) nextRipple = now + 1600 + Math.random() * 1000;
    if (now >= nextRipple) {
      // A second ripple follows on the opposite span, well away from the first.
      ripples.push({start: now, side: 'top'});
      ripples.push({start: now + 650, side: 'bottom'});
      nextRipple = now + 6500 + Math.random() * 2500;
    }
    ripples = ripples.filter(ripple => now - ripple.start < 2500);
    const displacement = (x, side) => ripples.reduce((sum, ripple) => {
      if (ripple.side !== side) return sum;
      const age = (now - ripple.start) / 2500;
      if (age < 0 || age > 1) return sum;
      const center = side === 'top' ? 80 + 440 * age : 520 - 440 * age;
      const distance = x - center;
      const envelope = Math.sin(Math.PI * age) ** 2 * Math.exp(-((distance / 115) ** 2));
      return sum + 8 * envelope * Math.sin(distance * Math.PI / 180);
    }, 0);
    const top = Array.from({length: 45}, (_, i) => {
      const x = 80 + i * 10;
      return `${x} ${(16 + displacement(x, 'top')).toFixed(2)}`;
    }).join(' L');
    const bottom = Array.from({length: 45}, (_, i) => {
      const x = 520 - i * 10;
      return `${x} ${(124 + displacement(x, 'bottom')).toFixed(2)}`;
    }).join(' L');
    const shape = `M${top} A54 54 0 0 1 520 124 L${bottom} A54 54 0 0 1 80 16 Z`;
    for (const path of tapePaths) path.setAttribute('d', shape);
    wobbleFrame = requestAnimationFrame(nudgeTape);
  }
  reducedMotion.addEventListener('change', () => {
    stopWobble();
    if (!reducedMotion.matches && !audio.paused) wobbleFrame = requestAnimationFrame(nudgeTape);
  });
  function render() {
    const playing = !audio.paused;
    if (playing !== wasPlaying) {
      stopWobble();
      if (playing && !reducedMotion.matches) wobbleFrame = requestAnimationFrame(nudgeTape);
      wasPlaying = playing;
    }
    root.classList.toggle('is-playing', playing);
    symbol.textContent = playing ? 'Ⅱ' : '▶';
    toggle.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${document.getElementById('featured-heading').textContent}`);
    toggle.setAttribute('aria-pressed', String(playing));
  }
  toggle.addEventListener('click', async () => {
    if (loading) return;
    if (!audio.paused) { transport.pause(); status.textContent = 'Paused'; render(); return; }
    loading = true; toggle.disabled = true; status.textContent = 'Loading audio…';
    try { await transport.play(); status.textContent = audio.paused ? 'Stopped' : 'Playing'; }
    catch { transport.stop(); status.textContent = 'Audio could not play. Try again or check the file.'; }
    finally { loading = false; toggle.disabled = false; render(); }
  });
  const exit = () => { transport.stop(); status.textContent = 'Stopped'; render(); };
  for (const event of ['timeupdate','loadedmetadata','playing','pause']) audio.addEventListener(event, render);
  audio.addEventListener('waiting', () => { status.textContent = 'Buffering…'; });
  audio.addEventListener('playing', () => { status.textContent = 'Playing'; });
  audio.addEventListener('ended', () => { status.textContent = 'Finished'; render(); });
  audio.addEventListener('error', () => { exit(); status.textContent = 'Audio file unavailable. Check the local file and rebuild.'; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) exit(); });
  window.addEventListener('pagehide', exit);
  render();
}
