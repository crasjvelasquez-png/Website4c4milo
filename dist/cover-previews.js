import { claimSiteAudio } from './site-audio.js';

export function mountCoverPreviews() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  let context;
  for (const tile of document.querySelectorAll('[data-preview-src]')) {
    const cover = tile.querySelector('.release-cover');
    const audio = tile.querySelector('[data-cover-audio]');
    const status = tile.querySelector('[data-preview-status]');
    let gain, wanted = false, generation = 0, attackPending = false;
    const hint = text => { status.textContent = text; status.classList.toggle('sr-only', !text); };
    const silence = () => {
      if (!gain) return;
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setValueAtTime(0, context.currentTime);
    };
    function pause() {
      wanted = false;
      generation++;
      attackPending = false;
      silence();
      audio.pause();
      tile.classList.remove('is-previewing');
      hint('');
    }
    async function play() {
      if (wanted || document.hidden) return;
      claimSiteAudio(audio);
      const token = ++generation;
      wanted = true;
      hint('');
      try {
        context ??= new Context();
        if (!gain) {
          gain = context.createGain();
          gain.gain.value = 0;
          context.createMediaElementSource(audio).connect(gain);
          gain.connect(context.destination);
          audio.src = tile.dataset.previewSrc;
        }
        if (audio.ended) audio.currentTime = 0;
        silence();
        attackPending = true;
        // Both calls stay inside the tap/key activation, including on iOS.
        const resumed = context.resume();
        resumed.catch(() => {});
        const playing = audio.play();
        playing.catch(() => {});
        // A suspended Web Audio graph can also leave play() pending forever.
        // If autoplay is blocked, stay quiet and allow a later interaction to retry.
        if (context.state !== 'running' && !navigator.userActivation?.isActive) {
          pause();
          return;
        }
        await Promise.all([resumed, playing]);
        if (token !== generation && !wanted) audio.pause();
      } catch (error) {
        if (token !== generation) return;
        pause();
        if (error.name !== 'NotAllowedError') hint('Preview unavailable');
      }
    }
    audio.addEventListener('playing', () => {
      if (!wanted || document.hidden) { pause(); return; }
      if (attackPending) {
        silence();
        gain.gain.linearRampToValueAtTime(1, context.currentTime + 1);
        attackPending = false;
      }
      tile.classList.add('is-previewing');
    });
    audio.addEventListener('pause', () => { if (wanted && audio.paused) pause(); });
    audio.addEventListener('ended', pause);
    audio.addEventListener('error', () => { pause(); hint('Preview unavailable'); });
    // The service overlay occupies the same cover footprint, so entering it
    // must not synthesize a leave and stop a just-started touch preview.
    tile.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') play(); });
    tile.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') pause(); });
    tile.addEventListener('pointercancel', pause);
    cover.addEventListener('click', event => {
      if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) play();
    });
    cover.addEventListener('keydown', event => {
      if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) wanted ? pause() : play(); }
    });
    tile.addEventListener('focusout', event => { if (!tile.contains(event.relatedTarget)) pause(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') pause(); });
    document.addEventListener('pointerdown', event => { if (!tile.contains(event.target)) pause(); }, true);
    document.addEventListener('site-audio-claim', event => { if (event.detail !== audio) pause(); });
  }
}
