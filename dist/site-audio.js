// Claim before asynchronous loading, so scratch voices and pending plays stop too.
export function claimSiteAudio(audio) {
  globalThis.document?.dispatchEvent(new CustomEvent('site-audio-claim', { detail: audio }));
}

export function mountSiteAudio() {
  const pauseOthers = active => {
    for (const audio of document.querySelectorAll('audio')) if (audio !== active) audio.pause();
  };
  document.addEventListener('site-audio-claim', event => pauseOthers(event.detail));
  document.addEventListener('play', event => {
    if (event.target instanceof HTMLAudioElement && !event.target.paused) claimSiteAudio(event.target);
  }, true);
  const stop = () => claimSiteAudio(null);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  window.addEventListener('blur', stop);
  for (const type of ['click', 'auxclick']) document.addEventListener(type, event => {
    const link = event.target.closest('a[href]');
    // The artwork's ordinary click opens the existing service chooser.
    if (link && (!link.hasAttribute('data-inline-services') || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || type === 'auxclick')) stop();
  }, true);
}
