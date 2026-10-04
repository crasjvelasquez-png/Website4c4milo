import { claimSiteAudio, allowsBackgroundAudio } from './site-audio.js';
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

// Reverse the decoded samples, not the media clock. The two buffers share
// the same timeline; reverse offsets are measured from the end of the track.
export function reverseTrack(context, buffer) {
  const reversed = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const input = buffer.getChannelData(channel), output = reversed.getChannelData(channel);
    for (let i = 0; i < input.length; i++) output[i] = input[input.length - 1 - i];
  }
  return reversed;
}

function ramp(param, context, value, seconds = 0.012) {
  const now = context.currentTime;
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
  else {
    const current = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
  }
  param.linearRampToValueAtTime(value, now + seconds);
}

export function createScratchVoice(context, output, forward, reverse) {
  let voice;
  const voices = new Set();
  function silence() {
    if (!voice) return;
    const old = voice;
    voice = undefined;
    ramp(old.gain.gain, context, 0, 0.008);
    old.source.stop(context.currentTime + 0.009);
  }
  function move(position, velocity) {
    silence();
    const rate = Math.min(8, Math.abs(velocity));
    const backwards = velocity < 0;
    const offset = backwards ? forward.duration - position : position;
    const remaining = forward.duration - offset;
    if (rate < 0.08 || offset < 0 || remaining <= 0) return;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = backwards ? reverse : forward;
    source.playbackRate.setValueAtTime(rate, context.currentTime);
    source.connect(gain); gain.connect(output);
    const length = Math.min(0.045, remaining / rate);
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.85, context.currentTime + Math.min(0.008, length / 2));
    gain.gain.setValueAtTime(0.85, context.currentTime + Math.max(length / 2, length - 0.008));
    gain.gain.linearRampToValueAtTime(0, context.currentTime + length);
    const next = {source, gain};
    voices.add(next); voice = next;
    source.onended = () => {
      source.disconnect(); gain.disconnect(); voices.delete(next);
      if (voice === next) voice = undefined;
    };
    source.start(context.currentTime, offset);
    source.stop(context.currentTime + length);
  }
  function stop() {
    silence();
    for (const item of voices) {
      ramp(item.gain.gain, context, 0, 0.008);
      item.source.stop(context.currentTime + 0.009);
    }
  }
  return {move, stop};
}

export function createTransport(audio, {createContext, fadeIn = 1, fadeOut = 1.5, startAt = 0, volume = 1}) {
  let context, gain, volumeGain, generation = 0, needsStart = true, attackPending = false, wantsPlayback = false;
  let scratchVoice, buffers, bufferPromise, scratching = false, scratchPosition = 0, resumeAfterScratch = false;
  const envelope = (attack = 0) => {
    if (gain && Number.isFinite(audio.duration)) scheduleEnvelope(gain.gain, context.currentTime, audio.currentTime, audio.duration, attack, fadeOut);
  };
  audio.addEventListener('playing', () => {
    if (audio.paused || scratching) return;
    envelope(attackPending ? fadeIn : 0);
    attackPending = false;
  });
  // The initial startAt seek can finish after 'playing'; never restart its attack.
  // Subsequent seeks and buffering resumes reschedule the end fade without a dip.
  audio.addEventListener('waiting', () => {
    if (gain) gain.gain.cancelScheduledValues(context.currentTime);
  });
  audio.addEventListener('ended', () => stop());
  function initialize() {
    if (!context) {
      context = createContext();
      gain = context.createGain();
      volumeGain = context.createGain();
      volumeGain.gain.setValueAtTime(volume, context.currentTime);
      context.createMediaElementSource(audio).connect(gain);
      gain.connect(volumeGain);
      volumeGain.connect(context.destination);
    }
  }
  async function prepareScratch() {
    initialize();
    if (!bufferPromise) {
      bufferPromise = (async () => {
        const response = await fetch(audio.currentSrc || audio.src);
        if (!response.ok) throw new Error('Track download failed');
        const forward = await context.decodeAudioData(await response.arrayBuffer());
        buffers = {forward, reverse:reverseTrack(context, forward)};
        scratchVoice = createScratchVoice(context, volumeGain, buffers.forward, buffers.reverse);
      })().catch(error => { bufferPromise = undefined; throw error; });
    }
    return bufferPromise;
  }
  async function beginScratch() {
    if (scratching) return;
    claimSiteAudio(audio);
    initialize();
    const token = ++generation;
    resumeAfterScratch = !audio.paused;
    scratchPosition = audio.currentTime;
    scratching = true;
    // Unlock in the pointer/key activation, before download or decode yields.
    const resumed = context.resume();
    await Promise.all([resumed, prepareScratch()]);
    if (token !== generation || !scratching) return false;
    ramp(gain.gain, context, 0);
    // Let the outgoing media fade finish before freezing its clock.
    await new Promise(resolve => setTimeout(resolve, 14));
    if (token !== generation || !scratching) return false;
    audio.pause();
    wantsPlayback = false;
    needsStart = false;
    return true;
  }
  function moveScratch(position, velocity) {
    if (!scratching || !buffers) return;
    scratchPosition = Math.max(0, Math.min(buffers.forward.duration, position));
    scratchVoice.move(scratchPosition, velocity);
  }
  async function endScratch(resume = true) {
    if (!scratching) return;
    generation++;
    scratching = false;
    scratchVoice?.stop();
    audio.pause();
    audio.currentTime = Math.max(0, Math.min(Number.isFinite(audio.duration) ? audio.duration : scratchPosition, scratchPosition));
    needsStart = false;
    const shouldPlay = resume && resumeAfterScratch && !globalThis.document?.hidden;
    resumeAfterScratch = false;
    if (shouldPlay && audio.currentTime < audio.duration - 0.001) await play();
    else if (gain) ramp(gain.gain, context, 0);
  }
  async function play() {
    claimSiteAudio(audio);
    const token = ++generation;
    wantsPlayback = true;
    initialize();
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
    scratching = false;
    resumeAfterScratch = false;
    scratchVoice?.stop();
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
  return {play, pause, stop, setVolume, prepareScratch, beginScratch, moveScratch, endScratch,
    get scratching() { return scratching; },
    get position() { return scratching ? scratchPosition : audio.currentTime; },
    get duration() { return buffers?.forward.duration || audio.duration; }};
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
  const section = root.closest('.featured');
  const tape = root.querySelector('.tape-loop');
  let tapeWidth = tape.getBoundingClientRect().width;
  let radius = 44, target = 44, frame;
  const alignLabel = () => {
    section?.style.setProperty('--tape-bottom-inset', `${(70 - radius) * tapeWidth / 600}px`);
  };
  const resize = new ResizeObserver(entries => {
    tapeWidth = entries[0].contentRect.width;
    alignLabel();
  });
  resize.observe(tape);
  const draw = value => {
    radius = value;
    const paths = tapeGeometry(radius);
    for (const path of loops) path.setAttribute('d', paths.loop);
    left.setAttribute('d', paths.left);
    right.setAttribute('d', paths.right);
    root.style.setProperty('--head-shift', `${44 - radius}px`);
    root.style.setProperty('--head-top', `${(70 - radius) / 140 * 100}%`);
    alignLabel();
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
    const playing = !audio.paused || transport.scratching;
    root.classList.toggle('is-playing', playing);
    reveal(playing);
    volumeLabel.inert = !playing;
    if (playing) time.removeAttribute('aria-hidden');
    else time.setAttribute('aria-hidden', 'true');
    symbol.textContent = playing ? 'Ⅱ' : '▶';
    toggle.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${document.getElementById('featured-heading').textContent}`);
    toggle.setAttribute('aria-pressed', String(playing));
    const seconds = Number.isFinite(transport.position) ? Math.floor(transport.position) : 0;
    const minutes = String(Math.floor(seconds / 60));
    const remainder = String(seconds % 60).padStart(2, '0');
    time.querySelector('[data-time-minutes]').textContent = minutes;
    time.querySelector('[data-time-seconds]').textContent = remainder;
    time.setAttribute('aria-label', `Elapsed time: ${minutes}:${remainder}`);
  }
  toggle.addEventListener('click', async () => {
    if (loading || transport.scratching) return;
    if (!audio.paused) { transport.pause(); status.textContent = 'Paused'; render(); return; }
    loading = true; toggle.disabled = true; status.textContent = 'Loading audio…';
    try { await transport.play(); status.textContent = audio.paused ? 'Stopped' : 'Playing'; }
    catch { transport.stop(); status.textContent = 'Audio could not play. Try again or check the file.'; }
    finally { loading = false; toggle.disabled = false; render(); }
  });
  const cancelGesture = mountScratchHandle(root, transport, render, status);
  const exit = () => { cancelGesture(); transport.stop(); status.textContent = 'Stopped'; render(); };
  for (const event of ['timeupdate','loadedmetadata','seeked','playing','pause']) audio.addEventListener(event, render);
  audio.addEventListener('waiting', () => { status.textContent = 'Buffering…'; });
  audio.addEventListener('playing', () => { status.textContent = 'Playing'; });
  audio.addEventListener('ended', () => { status.textContent = 'Finished'; render(); });
  audio.addEventListener('error', () => { exit(); status.textContent = 'Audio file unavailable. Check the local file and rebuild.'; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !allowsBackgroundAudio()) exit(); });
  window.addEventListener('pagehide', exit);
  document.addEventListener('site-audio-claim', event => {
    if (event.detail !== audio) { cancelGesture(); transport.pause(); status.textContent = 'Paused'; render(); }
  });
  render();
}

// Pointer Events cover mouse, pen, and touch without blocking page scrolling
// anywhere except the invisible handle. One animation clock drives all visuals.
function mountScratchHandle(root, transport, render, status) {
  const handle = root.querySelector('.tape-head-handle');
  const tape = root.querySelector('.tape-loop');
  const head = root.querySelector('.tape-head-mark');
  const reels = root.querySelectorAll('.tape-reel');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let gesture, finishing = false, frame, keyTimer, lastTick;
  let headX = 94, lastHeadGeometry;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const drawHead = x => {
    headX = x;
    // Follow the existing continuous path around the left reel when pulled
    // past its top tangent, so the bump never separates from the white tape.
    const ribbon = root.querySelector('.tape-ribbon');
    const geometry = `${x}:${ribbon.getAttribute('d')}`;
    if (geometry === lastHeadGeometry) return;
    lastHeadGeometry = geometry;
    const length = ribbon.getTotalLength();
    const point = distance => ribbon.getPointAtLength((distance % length + length) % length);
    const middle = point(x - 80);
    handle.style.left = `${middle.x / 6}%`;
    handle.style.top = `${middle.y / 140 * 100}%`;
    const points = Array.from({length:11}, (_, i) => point(x - 94 + i * 2.8));
    head.querySelector('path').setAttribute('d', points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' '));
  };
  async function begin(pointerId, x) {
    if (gesture || finishing) return;
    const current = {pointerId, startX:x, x, headOrigin:headX, origin:transport.position, position:transport.position,
      lastPosition:transport.position, lastTime:performance.now(), ready:false};
    gesture = current;
    root.classList.add('is-scratching');
    handle.setAttribute('aria-busy', 'true');
    status.textContent = 'Preparing scratch audio…';
    try {
      const ready = await transport.beginScratch();
      if (gesture !== current || !ready) return;
      current.origin = transport.position;
      current.lastPosition = current.origin;
      current.lastTime = performance.now();
      current.ready = true;
      if (current.pointerId === null) keyTimer = setTimeout(() => { void finish(); }, 180);
      status.textContent = 'Scratching';
    } catch {
      await finish();
      status.textContent = 'Scratch audio could not load. Try the handle again.';
    } finally { handle.removeAttribute('aria-busy'); }
  }
  async function finish(resume = true) {
    if (!gesture) return;
    const id = gesture.pointerId;
    if (gesture.ready && gesture.keyboardPosition !== undefined) transport.moveScratch(gesture.keyboardPosition, 0);
    gesture = undefined;
    finishing = true;
    clearTimeout(keyTimer);
    if (id !== null && handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
    root.classList.remove('is-scratching');
    try {
      await transport.endScratch(resume);
      if (resume) status.textContent = !root.querySelector('audio').paused ? 'Playing' : 'Paused';
    }
    catch { transport.pause(); status.textContent = 'Audio could not resume. Press play to retry.'; }
    finally { finishing = false; render(); }
  }
  handle.addEventListener('pointerenter', () => { transport.prepareScratch().catch(() => {}); });
  handle.addEventListener('focus', () => { transport.prepareScratch().catch(() => {}); });
  root.querySelector('.audio-toggle').addEventListener('click', () => { transport.prepareScratch().catch(() => {}); });
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || gesture || finishing) return;
    event.preventDefault(); handle.focus({preventScroll:true});
    handle.setPointerCapture(event.pointerId);
    void begin(event.pointerId, event.clientX);
  });
  handle.addEventListener('pointermove', event => {
    if (gesture?.pointerId === event.pointerId) gesture.x = event.clientX;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    handle.addEventListener(name, event => {
      if (gesture?.pointerId === event.pointerId) void finish();
    });
  }
  handle.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') { void finish(); return; }
    if (gesture?.pointerId != null || finishing) return;
    if (!gesture) void begin(null, 0);
    if (!gesture) return;
    const step = event.shiftKey ? 5 : 1;
    gesture.keyboardPosition = event.key === 'Home' ? 0 : event.key === 'End' ? transport.duration :
      (gesture.keyboardPosition ?? gesture.origin) + (event.key === 'ArrowLeft' ? -step : step);
    clearTimeout(keyTimer);
    if (gesture.ready) keyTimer = setTimeout(() => { void finish(); }, 180);
  });
  handle.addEventListener('blur', () => { void finish(); });
  const tick = now => {
    const elapsedTick = lastTick === undefined ? 0 : Math.min(0.1, (now - lastTick) / 1000);
    lastTick = now;
    if (gesture?.ready) {
      const width = tape.getBoundingClientRect().width;
      const displacement = (gesture.x - gesture.startX) * 600 / width;
      const tapeLength = root.querySelector('.tape-ribbon').getTotalLength();
      // Map one complete trip around the actual tape to two audio seconds,
      // independent of player size or drag speed.
      const target = clamp(gesture.keyboardPosition ?? gesture.origin + displacement / tapeLength * 2, 0, transport.duration);
      const position = gesture.pointerId === null ? gesture.lastPosition + clamp(target - gesture.lastPosition, -0.12, 0.12) : target;
      const elapsed = Math.max(0.008, (now - gesture.lastTime) / 1000);
      const velocity = (position - gesture.lastPosition) / elapsed;
      transport.moveScratch(position, velocity);
      gesture.lastPosition = position; gesture.lastTime = now;
      drawHead(gesture.headOrigin + displacement);
      render();
    }
    if (!gesture && !finishing && !reduced.matches && !root.querySelector('audio').paused && !handle.matches(':focus-visible')) {
      // Keep the bump and its invisible target together: one complete tape
      // circuit every eight seconds. Release continues from the grabbed point.
      const length = root.querySelector('.tape-ribbon').getTotalLength();
      headX += length * elapsedTick / 8;
      headX = (headX - 80) % length + 80;
    }
    drawHead(headX);
    const position = transport.position;
    handle.setAttribute('aria-valuemax', String(Number.isFinite(transport.duration) ? transport.duration : 0));
    handle.setAttribute('aria-valuenow', String(Math.round(position * 10) / 10));
    handle.setAttribute('aria-valuetext', `${Math.floor(position / 60)}:${String(Math.floor(position % 60)).padStart(2, '0')}`);
    if (!reduced.matches) {
      for (const reel of reels) reel.style.transform = `rotate(${position * 360 / 1.276}deg)`;
    }
    if (!document.hidden) frame = requestAnimationFrame(tick);
  };
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(frame);
    if (!document.hidden) frame = requestAnimationFrame(tick);
  });
  frame = requestAnimationFrame(tick);
  return () => {
    void finish(false);
    lastTick = undefined;
    drawHead(headX);
  };
}
