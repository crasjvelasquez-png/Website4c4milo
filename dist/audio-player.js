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
  const stop = root.querySelector('.audio-stop');
  const status = root.querySelector('.audio-status');
  const symbol = root.querySelector('[data-play-symbol]');
  if (!audio.getAttribute('src')) return;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) { status.textContent = 'This browser cannot use the audio player.'; toggle.disabled = true; return; }
  const transport = createTransport(audio, {createContext:()=>new Context(), fadeIn:Number(root.dataset.fadeIn), fadeOut:Number(root.dataset.fadeOut)});
  let loading = false;
  let wobbleTimer;
  let wasPlaying = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function stopWobble() {
    clearTimeout(wobbleTimer);
    root.style.removeProperty('--tape-wobble-y');
    root.style.removeProperty('--tape-wobble-turn');
    root.style.removeProperty('--tape-speed');
  }
  function nudgeTape() {
    if (audio.paused || document.hidden || reducedMotion.matches) return;
    // Small irregular visual changes evoke tape speed drift; audio gain/rate stay untouched.
    root.style.setProperty('--tape-wobble-y', `${((Math.random() - .5) * 1.1).toFixed(2)}px`);
    root.style.setProperty('--tape-wobble-turn', `${((Math.random() - .5) * .35).toFixed(2)}deg`);
    root.style.setProperty('--tape-speed', `${(5.4 + Math.random() * 1.2).toFixed(2)}s`);
    wobbleTimer = setTimeout(nudgeTape, 1100 + Math.random() * 900);
  }
  reducedMotion.addEventListener('change', () => {
    stopWobble();
    if (!reducedMotion.matches && !audio.paused) nudgeTape();
  });
  function render() {
    const playing = !audio.paused;
    if (playing !== wasPlaying) {
      stopWobble();
      if (playing) nudgeTape();
      wasPlaying = playing;
    }
    root.classList.toggle('is-playing', playing);
    symbol.textContent = playing ? 'Ⅱ' : '▶';
    toggle.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${document.getElementById('featured-heading').textContent}`);
    toggle.setAttribute('aria-pressed', String(playing));
    stop.disabled = audio.paused && audio.currentTime === 0 && !loading;
    stop.hidden = stop.disabled;
  }
  toggle.addEventListener('click', async () => {
    if (loading) return;
    if (!audio.paused) { transport.pause(); status.textContent = 'Paused'; render(); return; }
    loading = true; toggle.disabled = true; stop.disabled = false; stop.hidden = false; status.textContent = 'Loading audio…';
    try { await transport.play(); status.textContent = audio.paused ? 'Stopped' : 'Playing'; }
    catch { transport.stop(); status.textContent = 'Audio could not play. Try again or check the file.'; }
    finally { loading = false; toggle.disabled = false; render(); }
  });
  const exit = () => { transport.stop(); status.textContent = 'Stopped'; render(); };
  stop.addEventListener('click', exit);
  for (const event of ['timeupdate','loadedmetadata','playing','pause']) audio.addEventListener(event, render);
  audio.addEventListener('waiting', () => { status.textContent = 'Buffering…'; });
  audio.addEventListener('playing', () => { status.textContent = 'Playing'; });
  audio.addEventListener('ended', () => { status.textContent = 'Finished'; render(); });
  audio.addEventListener('error', () => { exit(); status.textContent = 'Audio file unavailable. Check the local file and rebuild.'; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) exit(); });
  window.addEventListener('pagehide', exit);
  render();
}
