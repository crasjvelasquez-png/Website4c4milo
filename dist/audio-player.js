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

export function createTransport(audio, {createContext, fadeIn = 1, fadeOut = 1.5, startAt = 0}) {
  let context, gain, generation = 0, needsStart = true;
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
    if (needsStart) {
      audio.currentTime = Number.isFinite(audio.duration) ? Math.min(startAt, Math.max(0, audio.duration - 0.1)) : startAt;
      needsStart = false;
    }
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
    needsStart = true;
  }
  return {play, pause, stop};
}

export function mountPlayer(root) {
  const audio = root.querySelector('audio');
  const toggle = root.querySelector('.audio-toggle');
  const status = root.querySelector('.audio-status');
  const time = root.querySelector('.audio-time');
  const symbol = root.querySelector('[data-play-symbol]');
  const volume = root.querySelector('.audio-volume');
  if (!audio.getAttribute('src')) return;
  audio.volume = Number(volume.value);
  volume.addEventListener('input', () => { audio.volume = Number(volume.value); });
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) { status.textContent = 'This browser cannot use the audio player.'; toggle.disabled = true; return; }
  const volumeLabel = root.querySelector('.audio-volume-label');
  root.classList.add('progressive-player');
  document.documentElement.classList.remove('player-reveal-ready');
  const transport = createTransport(audio, {createContext:()=>new Context(), fadeIn:Number(root.dataset.fadeIn), fadeOut:Number(root.dataset.fadeOut), startAt:3});
  let loading = false;
  function render() {
    const playing = !audio.paused;
    root.classList.toggle('is-playing', playing);
    volumeLabel.inert = !playing;
    if (playing) time.removeAttribute('aria-hidden');
    else time.setAttribute('aria-hidden', 'true');
    symbol.textContent = playing ? 'Ⅱ' : '▶';
    toggle.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${document.getElementById('featured-heading').textContent}`);
    toggle.setAttribute('aria-pressed', String(playing));
    const seconds = Number.isFinite(audio.currentTime) ? Math.floor(audio.currentTime) : 0;
    const minutes = String(Math.floor(seconds / 60));
    const remainder = String(seconds % 60).padStart(2, '0');
    time.querySelector('[data-time-minutes]').textContent = minutes;
    time.querySelector('[data-time-seconds]').textContent = remainder;
    time.setAttribute('aria-label', `Elapsed time: ${minutes}:${remainder}`);
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
  for (const event of ['timeupdate','loadedmetadata','seeked','playing','pause']) audio.addEventListener(event, render);
  audio.addEventListener('waiting', () => { status.textContent = 'Buffering…'; });
  audio.addEventListener('playing', () => { status.textContent = 'Playing'; });
  audio.addEventListener('ended', () => { status.textContent = 'Finished'; render(); });
  audio.addEventListener('error', () => { exit(); status.textContent = 'Audio file unavailable. Check the local file and rebuild.'; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) exit(); });
  window.addEventListener('pagehide', exit);
  render();
}
