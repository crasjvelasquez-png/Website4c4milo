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
  const sideButtons = [...root.querySelectorAll('[data-side]')];
  let selected = projects[0];
  let transport = null;
  let audioContext = null;
  let loadToken = 0;
  let frame = 0;
  let activeSide = 'before';
  let loading = false;
  const coarsePointer = window.matchMedia('(pointer: coarse)');

  function paintTransport() {
    const elapsed = transport?.currentTime ?? 0;
    const length = transport?.duration ?? 0;
    currentTime.textContent = formatTime(elapsed);
    durationTime.textContent = formatTime(length);
    seek.value = length ? String((elapsed / length) * 100) : '0';
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

  async function loadProject(project) {
    const token = ++loadToken;
    transport?.dispose();
    transport = null;
    selected = project;
    activeSide = 'before';
    loading = false;
    root.classList.remove('is-playing');
    title.textContent = project.title;
    artist.textContent = project.artist;
    contribution.textContent = project.contribution;
    comparison.dataset.activeSide = activeSide;
    for (const button of sideButtons) button.setAttribute('aria-pressed', String(button.dataset.side === activeSide));
    updateHeroArtwork(project);
    for (const button of document.querySelectorAll('[data-project-id]')) {
      const isSelected = button.dataset.projectId === project.id;
      button.closest('.portfolio-project').classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
      button.closest('.portfolio-project').classList.remove('is-armed');
    }
    selectionStatus.textContent = `Loaded ${project.title} by ${project.artist}. ${project.contribution}.`;
    if (!project.audio?.before || !project.audio?.after) {
      status.textContent = '';
      updateAvailability();
      return;
    }
    loading = true;
    status.textContent = 'Loading both versions…';
    updateAvailability();
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('Web Audio is not supported in this browser.');
      audioContext ??= new Context();
      const [beforeBuffer, afterBuffer] = await Promise.all([decodeTrack(project.audio.before), decodeTrack(project.audio.after)]);
      if (token !== loadToken) return;
      transport = createABTransport(audioContext, beforeBuffer, afterBuffer, {onended: () => {
        status.textContent = 'Playback finished';
        paintTransport();
      }});
      transport.setSide(activeSide);
      status.textContent = 'Ready to play';
    } catch (error) {
      if (token !== loadToken) return;
      status.textContent = `${error.message} Try selecting the project again.`;
    } finally {
      if (token === loadToken) { loading = false; updateAvailability(); }
    }
  }

  function updateHeroArtwork(project) {
    for (const side of ['before', 'after']) {
      const old = root.querySelector(`[data-cover-${side}]`);
      const next = project.artwork
        ? Object.assign(document.createElement('img'), {className: 'portfolio-art', src: project.artwork, alt: project.artworkAlt || `${project.title} cover`, width: 800, height: 800, decoding: 'async'})
        : Object.assign(document.createElement('div'), {className: 'portfolio-art portfolio-art-empty', role: 'img', 'aria-label': `${project.title} cover artwork placeholder`, textContent: 'Artwork pending'});
      next.setAttribute(`data-cover-${side}`, '');
      old.replaceWith(next);
    }
  }

  for (const button of document.querySelectorAll('[data-project-id]')) button.addEventListener('click', event => {
    const project = byId.get(button.dataset.projectId);
    if (!project) return;
    if (coarsePointer.matches && event.detail > 0) {
      const item = button.closest('.portfolio-project');
      if (!item.classList.contains('is-armed')) {
        for (const other of document.querySelectorAll('.portfolio-project.is-armed')) other.classList.remove('is-armed');
        item.classList.add('is-armed');
        selectionStatus.textContent = `${project.title} by ${project.artist}. ${project.contribution}. Tap again to load.`;
        return;
      }
    }
    loadProject(project);
    if (coarsePointer.matches) root.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
  });
  document.addEventListener('click', event => {
    if (event.target.closest('.portfolio-project')) return;
    for (const item of document.querySelectorAll('.portfolio-project.is-armed')) item.classList.remove('is-armed');
  });

  for (const button of sideButtons) button.addEventListener('click', () => {
    activeSide = button.dataset.side;
    comparison.dataset.activeSide = activeSide;
    for (const item of sideButtons) item.setAttribute('aria-pressed', String(item === button));
    transport?.setSide(activeSide);
  });
  playButton.addEventListener('click', async () => {
    if (!transport) return;
    try {
      await audioContext.resume();
      if (transport.playing) { transport.pause(); status.textContent = 'Paused'; }
      else { transport.play(); status.textContent = 'Playing'; }
      paintTransport();
    } catch { status.textContent = 'Playback could not start. Try again.'; }
  });
  seek.addEventListener('input', () => {
    if (!transport) return;
    transport.seek((Number(seek.value) / 100) * transport.duration);
    paintTransport();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && transport?.playing) { transport.pause(); status.textContent = 'Paused'; paintTransport(); }
  });
  window.addEventListener('pagehide', () => { loadToken++; transport?.dispose(); audioContext?.close(); });
  loadProject(projects[0]);
}
