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

// Exact length of the loop drawn by tapeGeometry(): two 440-unit straights
// plus two half circles.
export function tapeLength(radius) {
  return 880 + 2 * Math.PI * radius;
}

// Exact point at a distance along tapeGeometry(radius).loop, measured from
// its start (80, 70 - radius) in the path's clockwise drawing direction.
// Pure math avoids per-frame SVG geometry queries.
export function tapePoint(radius, distance) {
  const arc = Math.PI * radius, length = 880 + 2 * arc;
  let d = (distance % length + length) % length;
  if (d < 440) return {x:80 + d, y:70 - radius};
  d -= 440;
  if (d < arc) { const a = d / radius; return {x:520 + radius * Math.sin(a), y:70 - radius * Math.cos(a)}; }
  d -= arc;
  if (d < 440) return {x:520 - d, y:70 + radius};
  d -= 440;
  const a = d / radius;
  return {x:80 - radius * Math.sin(a), y:70 + radius * Math.cos(a)};
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
    // Redraw dependents in this same frame so nothing trails the tape.
    update.onDraw?.(radius);
  };
  const update = playing => {
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
  update.radius = () => radius;
  draw(radius);
  return update;
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
  const minutesText = time.querySelector('[data-time-minutes]');
  const secondsText = time.querySelector('[data-time-seconds]');
  const heading = document.getElementById('featured-heading');
  function render() {
    const playing = !audio.paused || transport.scratching;
    root.classList.toggle('is-playing', playing);
    reveal(playing);
    if (volumeLabel.inert !== !playing) volumeLabel.inert = !playing;
    if (playing) time.removeAttribute('aria-hidden');
    else setAttr(time, 'aria-hidden', 'true');
    setText(symbol, playing ? 'Ⅱ' : '▶');
    setAttr(toggle, 'aria-label', `${playing ? 'Pause' : 'Play'} ${heading.textContent}`);
    setAttr(toggle, 'aria-pressed', String(playing));
    const seconds = Number.isFinite(transport.position) ? Math.floor(transport.position) : 0;
    const minutes = String(Math.floor(seconds / 60));
    const remainder = String(seconds % 60).padStart(2, '0');
    setText(minutesText, minutes);
    setText(secondsText, remainder);
    setAttr(time, 'aria-label', `Elapsed time: ${minutes}:${remainder}`);
  }
  toggle.addEventListener('click', async () => {
    if (loading || transport.scratching) return;
    if (!audio.paused) { transport.pause(); status.textContent = 'Paused'; render(); return; }
    loading = true; toggle.disabled = true; status.textContent = 'Loading audio…';
    try { await transport.play(); status.textContent = audio.paused ? 'Stopped' : 'Playing'; }
    catch { transport.stop(); status.textContent = 'Audio could not play. Try again or check the file.'; }
    finally { loading = false; toggle.disabled = false; render(); }
  });
  const cancelGesture = mountScratchHandle(root, transport, render, status, reveal);
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

// Skip identical DOM writes: each write can invalidate style, layout, or the
// accessibility tree even when the value does not change.
function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}
function setAttr(element, name, value) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

// Pointer Events cover mouse, pen, and touch without blocking page scrolling
// anywhere except the invisible handle. One animation clock drives all visuals.
function mountScratchHandle(root, transport, render, status, reveal) {
  const handle = root.querySelector('.tape-head-handle');
  const tape = root.querySelector('.tape-loop');
  const headPath = root.querySelector('.tape-head-mark path');
  const reels = root.querySelectorAll('.tape-reel');
  const audio = root.querySelector('audio');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 760px), (pointer: coarse)');
  let gesture, finishing = false, frame, keyTimer, lastTick;
  let visible = true;
  let headX = 94, lastHeadGeometry, reelPosition, lastReelTransform;
  // Measure outside the frame loop: reading layout right after the previous
  // frame's style writes would force a synchronous layout every frame.
  let tapeWidth = tape.getBoundingClientRect().width;
  const measure = () => { tapeWidth = tape.getBoundingClientRect().width; };
  new ResizeObserver(measure).observe(tape);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const drawHead = x => {
    headX = x;
    // Follow the existing continuous path around the left reel when pulled
    // past its top tangent, so the bump never separates from the white tape.
    const radius = reveal.radius();
    const geometry = `${x}:${radius}`;
    if (geometry === lastHeadGeometry) return;
    lastHeadGeometry = geometry;
    const middle = tapePoint(radius, x - 80);
    handle.style.left = `${middle.x / 6}%`;
    handle.style.top = `${middle.y / 140 * 100}%`;
    let d = '';
    for (let i = 0; i < 11; i++) {
      const p = tapePoint(radius, x - 94 + i * 2.8);
      d += `${i ? 'L' : 'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
    }
    headPath.setAttribute('d', d);
  };
  reveal.onDraw = () => { drawHead(headX); startTick(); };
  const startTick = () => {
    if (!frame && !document.hidden && visible) {
      lastTick = undefined;
      frame = requestAnimationFrame(tick);
    }
  };
  async function begin(pointerId, x, y = 0) {
    if (mobile.matches || gesture || finishing) return;
    startTick();
    const current = {pointerId, x, y, lastX:x, lastY:y, travel:0, headOrigin:headX, origin:transport.position, position:transport.position,
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
  const prepareScratch = () => {
    // The handle is unavailable on mobile: do not download, decode, and reverse
    // the entire track just because the visitor pressed Play.
    if (!mobile.matches) transport.prepareScratch().catch(() => {});
  };
  handle.addEventListener('pointerenter', prepareScratch);
  handle.addEventListener('focus', prepareScratch);
  handle.addEventListener('pointerdown', event => {
    if (mobile.matches || event.button !== 0 || gesture || finishing) return;
    event.preventDefault(); handle.focus({preventScroll:true});
    handle.setPointerCapture(event.pointerId);
    measure();
    void begin(event.pointerId, event.clientX, event.clientY);
  });
  handle.addEventListener('pointermove', event => {
    if (gesture?.pointerId === event.pointerId) { gesture.x = event.clientX; gesture.y = event.clientY; }
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    handle.addEventListener(name, event => {
      if (gesture?.pointerId === event.pointerId) void finish();
    });
  }
  handle.addEventListener('keydown', event => {
    if (mobile.matches) return;
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
  const syncMobileHandle = () => {
    handle.inert = mobile.matches;
    if (mobile.matches) void finish();
  };
  mobile.addEventListener('change', syncMobileHandle);
  syncMobileHandle();
  // audio.currentTime advances in coarse steps (one audio callback, or up to
  // 250 ms in some browsers), so reels driven by it directly stutter. Advance
  // a frame clock instead and discipline it toward the media clock, estimated
  // between its updates; the correction is capped at half speed, so reels
  // never stall or run backwards while playing.
  let mediaSample, sinceSample = 0;
  const advanceReels = (actual, elapsed) => {
    if (!Number.isFinite(actual)) return;
    const advancing = !transport.scratching && !audio.paused && !audio.seeking && audio.readyState >= 3;
    const rate = audio.playbackRate || 1;
    if (actual !== mediaSample || !advancing) { mediaSample = actual; sinceSample = 0; }
    else sinceSample += elapsed * rate;
    const estimate = actual + Math.min(sinceSample, 0.3);
    if (reelPosition === undefined || transport.scratching || Math.abs(estimate - reelPosition) > 0.5) {
      reelPosition = estimate;
      return;
    }
    if (!advancing) return;
    reelPosition += elapsed * rate;
    reelPosition += clamp((estimate - reelPosition) * Math.min(1, elapsed * 2), -elapsed / 2, elapsed / 2);
  };
  const tick = now => {
    const elapsedTick = lastTick === undefined ? 0 : Math.min(0.1, (now - lastTick) / 1000);
    lastTick = now;
    const length = tapeLength(reveal.radius());
    if (gesture?.ready) {
      // The tape runs clockwise: rightward on top, down the right reel,
      // leftward on the bottom, and up the left reel. Project pointer motion
      // onto the tape direction under the bump, in small steps so a fast drag
      // still turns the corners, so the bump always follows the pointer.
      const scale = 600 / Math.max(1, tapeWidth), radius = reveal.radius();
      let dx = (gesture.x - gesture.lastX) * scale, dy = (gesture.y - gesture.lastY) * scale;
      gesture.lastX = gesture.x; gesture.lastY = gesture.y;
      const steps = Math.ceil(Math.hypot(dx, dy) / 2);
      dx /= steps || 1; dy /= steps || 1;
      for (let i = 0; i < steps; i++) {
        const at = gesture.headOrigin + gesture.travel - 80;
        const a = tapePoint(radius, at - 1), b = tapePoint(radius, at + 1);
        const tx = b.x - a.x, ty = b.y - a.y, norm = Math.hypot(tx, ty) || 1;
        gesture.travel += (dx * tx + dy * ty) / norm;
      }
      const displacement = gesture.travel;
      // Map one complete trip around the actual tape to two audio seconds,
      // independent of player size or drag speed.
      const target = clamp(gesture.keyboardPosition ?? gesture.origin + displacement / length * 2, 0, transport.duration);
      const position = gesture.pointerId === null ? gesture.lastPosition + clamp(target - gesture.lastPosition, -0.12, 0.12) : target;
      const elapsed = Math.max(0.008, (now - gesture.lastTime) / 1000);
      const velocity = (position - gesture.lastPosition) / elapsed;
      transport.moveScratch(position, velocity);
      gesture.lastPosition = position; gesture.lastTime = now;
      drawHead(gesture.headOrigin + displacement);
      render();
    }
    if (!gesture && !finishing && !reduced.matches && !audio.paused && !handle.matches(':focus-visible')) {
      // Keep the bump and its invisible target together: one complete tape
      // circuit every eight seconds. Release continues from the grabbed point.
      headX += length * elapsedTick / 8;
      headX = (headX - 80) % length + 80;
    }
    drawHead(headX);
    const position = transport.position;
    setAttr(handle, 'aria-valuemax', String(Number.isFinite(transport.duration) ? transport.duration : 0));
    setAttr(handle, 'aria-valuenow', String(Math.round(position * 10) / 10));
    setAttr(handle, 'aria-valuetext', `${Math.floor(position / 60)}:${String(Math.floor(position % 60)).padStart(2, '0')}`);
    advanceReels(position, elapsedTick);
    if (!reduced.matches && reelPosition !== undefined) {
      // Wrap to one turn so the angle keeps full float precision.
      const angle = (reelPosition * 360 / 1.276) % 360;
      const transform = `rotate(${angle.toFixed(3)}deg)`;
      if (transform !== lastReelTransform) {
        lastReelTransform = transform;
        for (const reel of reels) reel.style.transform = transform;
      }
    }
    const shouldAnimate = !document.hidden && visible && (gesture !== undefined || finishing || (!audio.paused && !audio.ended));
    if (shouldAnimate) {
      frame = requestAnimationFrame(tick);
    } else {
      frame = undefined;
      lastTick = undefined;
      mediaSample = undefined;
    }
  };
  if (window.IntersectionObserver) {
    new window.IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        reelPosition = undefined;
        mediaSample = undefined;
        startTick();
      }
    }).observe(tape);
  }
  audio.addEventListener('play', startTick);
  audio.addEventListener('playing', startTick);
  audio.addEventListener('pause', () => { lastTick = undefined; });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(frame);
    frame = undefined;
    lastTick = undefined;
    reelPosition = undefined;
    mediaSample = undefined;
    if (!document.hidden && (gesture !== undefined || finishing || (!audio.paused && !audio.ended))) {
      startTick();
    }
  });
  // Initial frame to render the handle and head path at starting position
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    frame = undefined;
    void finish(false);
    lastTick = undefined;
    drawHead(headX);
  };
}
