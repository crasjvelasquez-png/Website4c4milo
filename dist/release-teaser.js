// Local reveal preview. No contact details are stored or sent to a service.
export function validatePreviewContact(mode, value) {
  const contact = value.trim();
  if (mode === 'email') return contact.length <= 254 && /^[^\s@<>]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(contact);
  if (mode === 'phone') {
    const digits = contact.replace(/\D/g, '');
    return /^\+?[\d\s().-]+$/.test(contact) && digits.length >= 8 && digits.length <= 15;
  }
  return false;
}

export function mountReleaseTeaser(section) {
  const form = section.querySelector('[data-preview-signup]');
  const input = form.querySelector('input');
  const submit = form.querySelector('button[type="submit"]');
  const label = form.querySelector('[data-contact-label]');
  const methods = [...form.querySelectorAll('[data-signup-method]')];
  const identity = section.querySelector('[data-release-identity]');
  const invitation = section.querySelector('.early-listen-invitation');
  const error = form.querySelector('.signup-error');
  const player = section.querySelector('[data-upcoming-player]');
  const audio = player?.querySelector('audio');
  if (audio) {
    const toggle = player.querySelector('.secret-toggle');
    const seek = player.querySelector('.secret-seek');
    const feedback = player.querySelector('[data-upcoming-audio-status]');
    const render = () => {
      const playing = !audio.paused && !audio.ended;
      player.classList.toggle('is-playing', playing);
      toggle.setAttribute('aria-pressed', String(playing));
      toggle.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} How deep is your love? (Cover)`);
      const seconds = Math.floor(audio.currentTime || 0);
      const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      const ready = Number.isFinite(audio.duration) && audio.duration > 0;
      seek.disabled = !ready;
      seek.max = ready ? audio.duration : 100;
      seek.value = audio.currentTime || 0;
      seek.setAttribute('aria-valuetext', elapsed);
    };
    toggle.addEventListener('click', async () => {
      if (!audio.paused) { audio.pause(); return; }
      toggle.disabled = true;
      feedback.textContent = 'Loading audio…';
      try { await audio.play(); feedback.textContent = ''; }
      catch { feedback.textContent = 'Audio could not play. Try again.'; }
      finally { toggle.disabled = !audio.getAttribute('src'); render(); }
    });
    seek.addEventListener('input', () => { audio.currentTime = Number(seek.value); render(); });
    for (const event of ['play', 'pause', 'ended', 'loadedmetadata', 'timeupdate']) audio.addEventListener(event, render);
    audio.addEventListener('play', () => {
      document.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); });
    });
    document.querySelectorAll('audio').forEach(other => {
      if (other !== audio) other.addEventListener('play', () => audio.pause());
    });
    audio.addEventListener('error', () => {
      player.querySelector('[data-upcoming-audio-status]').textContent = 'Audio could not load. Reload the page to try again.';
    });
    const stop = () => { audio.pause(); if (audio.readyState > 0) audio.currentTime = 0; };
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  }
  const status = section.querySelector('[data-reveal-status]');
  let mode = 'email';

  input.disabled = false;
  submit.disabled = false;
  function clearError() {
    input.removeAttribute('aria-invalid');
    error.hidden = true;
  }
  input.addEventListener('input', clearError);

  for (const button of methods) button.addEventListener('click', () => {
    const next = button.dataset.signupMethod;
    if (next === mode) return;
    mode = next;
    for (const choice of methods) choice.setAttribute('aria-pressed', String(choice === button));
    input.value = '';
    input.type = mode === 'email' ? 'email' : 'tel';
    input.name = mode;
    input.inputMode = mode;
    input.autocomplete = mode;
    input.maxLength = mode === 'email' ? 254 : 30;
    input.placeholder = mode === 'email' ? 'Your email' : 'Your number';
    label.textContent = mode === 'email' ? 'Your email address' : 'Your phone number';
    clearError();
    input.focus();
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!validatePreviewContact(mode, input.value)) {
      error.textContent = mode === 'email'
        ? 'Enter a valid email address.'
        : 'Enter a phone number with 8–15 digits, including your country code.';
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    section.classList.add('is-revealed');
    identity.removeAttribute('aria-hidden');
    identity.removeAttribute('inert');
    status.textContent = 'The next release: How deep is your love? (Cover) by c4milo. Format checked locally; your contact was not verified or signed up.';
    input.value = '';
    invitation.style.visibility = 'hidden';
    form.style.visibility = 'hidden';
    form.inert = true;
    if (player) {
      player.hidden = false;
      if (audio?.dataset.src) audio.src = audio.dataset.src;
    }
    section.querySelector('#upcoming-heading')?.focus();
  });
}
