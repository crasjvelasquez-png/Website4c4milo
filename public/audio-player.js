// Keep the fade and user volume independent (iOS ignores media-element volume).
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

export function createTransport(audio, {createContext, fadeIn = 1, fadeOut = 1.5, startAt = 0, volume = 1}) {
  let context, gain, volumeGain, generation = 0, needsStart = true, attackPending = false, wantsPlayback = false;
  const envelope = (attack = 0) => {
    if (gain && Number.isFinite(audio.duration)) scheduleEnvelope(gain.gain, context.currentTime, audio.currentTime, audio.duration, attack, fadeOut);
  };
  audio.addEventListener('playing', () => {
    if (audio.paused) return;
    envelope(attackPending ? fadeIn : 0);
    attackPending = false;
  });
  // The initial startAt seek can finish after 'playing'; never restart its attack.
  // Subsequent seeks and buffering resumes reschedule the end fade without a dip.
  audio.addEventListener('waiting', () => {
    if (gain) gain.gain.cancelScheduledValues(context.currentTime);
  });
  audio.addEventListener('ended', () => stop());
  async function play() {
    const token = ++generation;
    wantsPlayback = true;
    if (!context) {
      context = createContext();
      gain = context.createGain();
      volumeGain = context.createGain();
      volumeGain.gain.setValueAtTime(volume, context.currentTime);
      context.createMediaElementSource(audio).connect(gain);
      gain.connect(volumeGain);
      volumeGain.connect(context.destination);
    }
    if (needsStart) {
      audio.currentTime = Number.isFinite(audio.duration) ? Math.min(startAt, Math.max(0, audio.duration - 0.1)) : startAt;
      needsStart = false;
    }
    // Stay silent while loading; the 'playing' event schedules the fades.
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(0, context.currentTime);
    attackPending = true;
    // Invoke both inside the tap's activation, before yielding (Safari/iOS).
    await Promise.all([context.resume(), audio.play()]);
    if (token !== generation && !wantsPlayback) audio.pause();
  }
  function pause() {
    generation++;
    wantsPlayback = false;
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
  function setVolume(value) {
    volume = Math.max(0, Math.min(1, Number(value)));
    if (!Number.isFinite(volume)) volume = 1;
    if (volumeGain) {
      const param = volumeGain.gain;
      const current = param.value;
      param.cancelScheduledValues(context.currentTime);
      param.setValueAtTime(current, context.currentTime);
      param.linearRampToValueAtTime(volume, context.currentTime + 0.02);
    }
  }
  return {play, pause, stop, setVolume};
}

export function tapeGeometry(radius) {
  const top = 70 - radius, bottom = 70 + radius;
  return {
    loop: `M80 ${top} H520 A${radius} ${radius} 0 0 1 520 ${bottom} H80 A${radius} ${radius} 0 0 1 80 ${top} Z`,
    left: `M80 ${top} A${radius} ${radius} 0 0 1 80 ${bottom}`,
    right: `M520 ${bottom} A${radius} ${radius} 0 0 1 520 ${top}`
  };
}

function mountTapeReveal(root) {
  const loops = root.querySelectorAll('.tape-ribbon, .tape-travel');
  const left = root.querySelector('.tape-inner-rim-left');
  const right = root.querySelector('.tape-inner-rim-right');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let radius = 44, target = 44, frame;
  const draw = value => {
    radius = value;
    const paths = tapeGeometry(radius);
    for (const path of loops) path.setAttribute('d', paths.loop);
    left.setAttribute('d', paths.left);
    right.setAttribute('d', paths.right);
  };
  draw(radius);
  return playing => {
    const next = playing ? 48 : 44;
    if (next === target) return;
    target = next;
    cancelAnimationFrame(frame);
    if (reduced.matches) { draw(target); return; }
    const from = radius, start = performance.now();
    const tick = now => {
      const progress = Math.max(0, Math.min(1, (now - start) / 480));
      draw(from + (target - from) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };
}

export function mountPlayer(root) {
  const audio = root.querySelector('audio');
  const toggle = root.querySelector('.audio-toggle');
  const status = root.querySelector('.audio-status');
  const time = root.querySelector('.audio-time');
  const symbol = root.querySelector('[data-play-symbol]');
  const volume = root.querySelector('.audio-volume');
  if (!audio.getAttribute('src')) return;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) { status.textContent = 'This browser cannot use the audio player.'; toggle.disabled = true; return; }
  const volumeLabel = root.querySelector('.audio-volume-label');
  root.classList.add('progressive-player');
  document.documentElement.classList.remove('player-reveal-ready');
  const transport = createTransport(audio, {createContext:()=>new Context(), fadeIn:Number(root.dataset.fadeIn), fadeOut:Number(root.dataset.fadeOut), startAt:3, volume:Number(volume.value)});
  volume.addEventListener('input', () => transport.setVolume(volume.value));
  const reveal = mountTapeReveal(root);
  let loading = false;
  function render() {
    const playing = !audio.paused;
    root.classList.toggle('is-playing', playing);
    reveal(playing);
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
