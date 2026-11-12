export const formatTime = value => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export function createABTransport(context, beforeBuffer, afterBuffer, {crossfade = 0.008, onended = () => {}} = {}) {
  const master = context.createGain();
  const beforeGain = context.createGain();
  const afterGain = context.createGain();
  beforeGain.connect(master);
  afterGain.connect(master);
  master.connect(context.destination);
  master.gain.value = 1;
  const buffers = {before: beforeBuffer, after: afterBuffer};
  const gains = {before: beforeGain.gain, after: afterGain.gain};
  gains.before.value = 1;
  gains.after.value = 0;
  let activeSide = 'before';
  let sources = null;
  let playing = false;
  let offset = 0;
  let startedAt = 0;
  let generation = 0;
  let ramp = {fromBefore: 1, fromAfter: 0, toBefore: 1, toAfter: 0, at: 0};
  const duration = Math.min(beforeBuffer.duration, afterBuffer.duration);
  const position = () => playing ? Math.min(duration, offset + Math.max(0, context.currentTime - startedAt)) : offset;
  const rampValue = (from, to, at) => {
    const fraction = crossfade ? Math.max(0, Math.min(1, (at - ramp.at) / crossfade)) : 1;
    return from + (to - from) * fraction;
  };
  function applySide(side, fade = true) {
    activeSide = side;
    const now = context.currentTime;
    const fromBefore = rampValue(ramp.fromBefore, ramp.toBefore, now);
    const fromAfter = rampValue(ramp.fromAfter, ramp.toAfter, now);
    const toBefore = side === 'before' ? 1 : 0;
    const toAfter = side === 'after' ? 1 : 0;
    for (const param of Object.values(gains)) param.cancelScheduledValues(now);
    gains.before.setValueAtTime(fromBefore, now);
    gains.after.setValueAtTime(fromAfter, now);
    if (fade && crossfade > 0) {
      gains.before.linearRampToValueAtTime(toBefore, now + crossfade);
      gains.after.linearRampToValueAtTime(toAfter, now + crossfade);
    } else {
      gains.before.setValueAtTime(toBefore, now);
      gains.after.setValueAtTime(toAfter, now);
    }
    ramp = {fromBefore, fromAfter, toBefore, toAfter, at: now};
  }
  function stopSources() {
    if (!sources) return;
    for (const source of Object.values(sources)) {
      source.onended = null;
      try { source.stop(); } catch { /* Already stopped. */ }
      source.disconnect();
    }
    sources = null;
  }
  function startAt(positionSeconds) {
    offset = Math.max(0, Math.min(duration, positionSeconds));
    if (offset >= duration) offset = 0;
    const token = ++generation;
    const when = context.currentTime + 0.025;
    sources = {};
    for (const side of ['before', 'after']) {
      const source = context.createBufferSource();
      source.buffer = buffers[side];
      source.connect(side === 'before' ? beforeGain : afterGain);
      source.start(when, offset, duration - offset);
      sources[side] = source;
    }
    startedAt = when;
    playing = true;
    sources.before.onended = () => {
      if (token !== generation || !playing) return;
      offset = duration;
      playing = false;
      stopSources();
      onended();
    };
  }
  return {
    get duration() { return duration; },
    get currentTime() { return position(); },
    get playing() { return playing; },
    get activeSide() { return activeSide; },
    play() {
      if (playing) return;
      startAt(offset);
    },
    pause() {
      if (!playing) return;
      offset = position();
      playing = false;
      generation++;
      stopSources();
    },
    seek(seconds) {
      const wasPlaying = playing;
      if (wasPlaying) { playing = false; generation++; stopSources(); }
      offset = Math.max(0, Math.min(duration, Number(seconds) || 0));
      if (wasPlaying) startAt(offset);
    },
    setSide(side) {
      if (side !== 'before' && side !== 'after') return;
      if (side !== activeSide) applySide(side, playing);
    },
    dispose() {
      this.pause();
      beforeGain.disconnect(); afterGain.disconnect(); master.disconnect();
    }
  };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-portfolio-player]');
  if (root) mountPortfolio(root);
}

function mountPortfolio(root) {
  const projects = JSON.parse(root.closest('main').querySelector('[data-project-data]').textContent);
  const byId = new Map(projects.map(project => [project.id, project]));
  const title = root.querySelector('#portfolio-title');
  const artist = root.querySelector('[data-project-artist]');
  const contribution = root.querySelector('[data-project-contribution]');
  const comparison = root.querySelector('.portfolio-comparison');
  const playButton = root.querySelector('[data-play]');
  const seek = root.querySelector('[data-seek]');
  const currentTime = root.querySelector('[data-current-time]');
  const durationTime = root.querySelector('[data-duration]');
  const status = root.querySelector('[data-audio-status]');
  const selectionStatus = root.closest('main').querySelector('[data-selection-status]');
  const toggles = [...root.querySelectorAll('[data-toggle-side]')];
  let selected = null;
  let transport = null;
  let audioContext = null;
  let loadToken = 0;
  let frame = 0;
  let activeSide = 'before';
  let loading = false;
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function setStatus(text, visible = false) {
    status.textContent = text;
    status.classList.toggle('is-visible', visible);
  }

  function paintTransport() {
    const elapsed = transport?.currentTime ?? 0;
    const length = transport?.duration ?? 0;
    const percent = length ? (elapsed / length) * 100 : 0;
    currentTime.textContent = formatTime(elapsed);
    durationTime.textContent = formatTime(length);
    seek.value = String(percent);
    seek.style.setProperty('--progress', `${percent}%`);
    playButton.setAttribute('aria-label', transport?.playing ? 'Pause' : 'Play');
    root.classList.toggle('is-playing', Boolean(transport?.playing));
    if (transport?.playing) frame = requestAnimationFrame(paintTransport);
    else cancelAnimationFrame(frame);
  }

  function updateAvailability() {
    const ready = Boolean(transport) && !loading;
    playButton.disabled = !ready;
    seek.disabled = !ready;
    if (!ready) { currentTime.textContent = '0:00'; durationTime.textContent = '0:00'; seek.value = '0'; }
    paintTransport();
  }

  async function decodeTrack(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not load ${path}`);
    return audioContext.decodeAudioData(await response.arrayBuffer());
  }

  function applyProjectIdentity(project) {
    title.textContent = project.title;
    artist.textContent = project.artist;
    contribution.textContent = project.contribution;
    updateHeroArtwork(project);
  }

  async function loadProject(project) {
    const token = ++loadToken;
    const shouldSwap = Boolean(selected && selected.id !== project.id && !reducedMotion.matches);
    transport?.dispose();
    transport = null;
    selected = project;
    loading = false;
    root.classList.remove('is-playing');
    showSide('before');
    if (shouldSwap) {
      root.classList.add('is-swapping');
      setTimeout(() => {
        if (token !== loadToken) return;
        applyProjectIdentity(project);
        root.classList.remove('is-swapping');
      }, 160);
    } else {
      root.classList.remove('is-swapping');
      applyProjectIdentity(project);
    }
    for (const button of document.querySelectorAll('[data-project-id]')) {
      const isSelected = button.dataset.projectId === project.id;
      button.closest('.portfolio-project').classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
    }
    selectionStatus.textContent = `Loaded ${project.title} by ${project.artist}. ${project.contribution}.`;
    if (!project.audio?.before || !project.audio?.after) {
      setStatus('Before and after coming soon', true);
      updateAvailability();
      return;
    }
    loading = true;
    setStatus('Loading both versions…', true);
    updateAvailability();
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('Web Audio is not supported in this browser.');
      audioContext ??= new Context();
      const [beforeBuffer, afterBuffer] = await Promise.all([decodeTrack(project.audio.before), decodeTrack(project.audio.after)]);
      if (token !== loadToken) return;
      transport = createABTransport(audioContext, beforeBuffer, afterBuffer, {onended: () => {
        setStatus('Playback finished');
        paintTransport();
      }});
      transport.setSide(activeSide);
      setStatus('Ready to play');
    } catch (error) {
      if (token !== loadToken) return;
      setStatus(`${error.message} Try selecting the project again.`, true);
    } finally {
      if (token === loadToken) { loading = false; updateAvailability(); }
    }
  }

  function updateHeroArtwork(project) {
    const next = project.artwork
      ? Object.assign(document.createElement('img'), {className: 'portfolio-art', src: project.artwork, alt: project.artworkAlt || `${project.title} cover`, width: 800, height: 800, decoding: 'async'})
      : Object.assign(document.createElement('div'), {className: 'portfolio-art portfolio-art-empty', role: 'img', ariaLabel: `${project.title} cover artwork placeholder`, textContent: 'Artwork pending'});
    next.setAttribute('data-cover', '');
    root.querySelector('[data-cover]').replaceWith(next);
  }

  function showSide(side) {
    activeSide = side;
    root.dataset.activeSide = side;
    comparison.dataset.activeSide = side;
    for (const button of toggles) button.setAttribute('aria-pressed', String(side === 'after'));
    transport?.setSide(side);
  }

  for (const button of document.querySelectorAll('[data-project-id]')) button.addEventListener('click', () => {
    const project = byId.get(button.dataset.projectId);
    if (!project) return;
    loadProject(project);
    if (coarsePointer.matches) root.scrollIntoView({behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start'});
  });

  for (const button of toggles) button.addEventListener('click', () => showSide(activeSide === 'after' ? 'before' : 'after'));
  playButton.addEventListener('click', async () => {
    if (!transport) return;
    try {
      await audioContext.resume();
      if (transport.playing) { transport.pause(); setStatus('Paused'); }
      else { transport.play(); setStatus('Playing'); }
      paintTransport();
    } catch { setStatus('Playback could not start. Try again.', true); }
  });
  seek.addEventListener('input', () => {
    if (!transport) return;
    transport.seek((Number(seek.value) / 100) * transport.duration);
    paintTransport();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && transport?.playing) { transport.pause(); setStatus('Paused'); paintTransport(); }
  });
  window.addEventListener('pagehide', () => { loadToken++; transport?.dispose(); audioContext?.close(); });
  loadProject(projects[0]);
}
