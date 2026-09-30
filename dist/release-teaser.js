// Brevo signup and the public early-listen reveal. Never autoplay.
export function validatePreviewContact(mode, value) {
  const contact = value.trim();
  if (mode === 'email') return contact.length <= 254 && /^[^\s@<>]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(contact);
  if (mode === 'phone') {
    const digits = contact.replace(/\D/g, '');
    return /^\+[\d\s().-]+$/.test(contact) && /^[1-9]\d{7,14}$/.test(digits);
  }
  return false;
}

export function mountReleaseTeaser(section) {
  const form = section.querySelector('[data-preview-signup]');
  const input = form.querySelector('input');
  const submit = form.querySelector('button[type="submit"]');
  const label = form.querySelector('[data-contact-label]');
  const methods = [...form.querySelectorAll('[data-signup-method]')];
  const countryCode = form.querySelector('[name="countryCode"]');
  const countryCodeWrap = countryCode.closest('.country-code');
  const countryTrigger = document.createElement('button');
  countryTrigger.type = 'button';
  countryTrigger.className = 'country-trigger';
  countryTrigger.setAttribute('aria-haspopup', 'listbox');
  countryTrigger.setAttribute('aria-expanded', 'false');
  countryTrigger.setAttribute('aria-controls', 'country-options');
  const countryMenu = document.createElement('div');
  countryMenu.id = 'country-options';
  countryMenu.className = 'country-menu';
  countryMenu.setAttribute('role', 'listbox');
  countryMenu.setAttribute('aria-label', 'Country calling code');
  countryMenu.hidden = true;
  const countryOptions = [...countryCode.options];
  const optionButtons = countryOptions.map((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'country-option';
    button.textContent = option.text;
    button.setAttribute('role', 'option');
    button.addEventListener('click', () => {
      countryCode.selectedIndex = index;
      updateCountry();
      closeCountries(true);
      clearError();
    });
    countryMenu.append(button);
    return button;
  });
  function updateCountry() {
    const option = countryOptions[countryCode.selectedIndex];
    const countryAbbreviations = ['US', 'CA', 'AU', 'BR', 'FR', 'DE', 'IN', 'JP', 'MX', 'NZ', 'PH', 'ES', 'GB'];
    countryTrigger.textContent = `${countryAbbreviations[countryCode.selectedIndex]} +${option.value}`;
    countryTrigger.setAttribute('aria-label', `Country calling code: ${option.text}`);
    optionButtons.forEach((button, index) => button.setAttribute('aria-selected', String(index === countryCode.selectedIndex)));
  }
  function closeCountries(restoreFocus = false) {
    countryMenu.hidden = true;
    countryTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) countryTrigger.focus();
  }
  function openCountries() {
    countryMenu.hidden = false;
    countryTrigger.setAttribute('aria-expanded', 'true');
    optionButtons[countryCode.selectedIndex].focus();
  }
  countryTrigger.addEventListener('click', () => countryMenu.hidden ? openCountries() : closeCountries());
  countryTrigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openCountries();
    }
  });
  countryMenu.addEventListener('keydown', event => {
    const index = optionButtons.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); closeCountries(true); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? optionButtons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + optionButtons.length) % optionButtons.length;
      optionButtons[next].focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!countryCodeWrap.contains(event.target)) closeCountries();
  });
  countryCodeWrap.addEventListener('focusout', event => {
    if (!countryCodeWrap.contains(event.relatedTarget)) closeCountries();
  });
  countryCode.hidden = true;
  countryCodeWrap.append(countryTrigger, countryMenu);
  updateCountry();
  const consent = form.querySelector('[name="consent"]');
  const consentCopy = form.querySelector('[data-consent-copy]');
  const honeypot = form.querySelector('[name="website"]');
  const error = form.querySelector('.signup-error');
  const note = form.querySelector('.signup-note');
  const confirmedNote = section.querySelector('[data-signup-confirmed]');
  const player = section.querySelector('[data-upcoming-player]');
  const audio = player.querySelector('audio');
  const toggle = player.querySelector('.secret-toggle');
  const seek = player.querySelector('.secret-seek');
  const audioStatus = player.querySelector('[data-upcoming-audio-status]');
  function renderPlayer() {
    player.classList.toggle('is-playing', !audio.paused);
    toggle.setAttribute('aria-pressed', String(!audio.paused));
    toggle.setAttribute('aria-label', `${audio.paused ? 'Play' : 'Pause'} How deep is your love? (Cover)`);
    seek.disabled = !Number.isFinite(audio.duration) || audio.duration <= 0;
    seek.value = seek.disabled ? 0 : audio.currentTime / audio.duration * 100;
  }
  toggle.addEventListener('click', async () => {
    if (!audio.paused) { audio.pause(); return; }
    for (const other of document.querySelectorAll('audio')) if (other !== audio) other.pause();
    try {
      audioStatus.textContent = '';
      await audio.play();
    } catch { audioStatus.textContent = 'The track could not play. Please try again or reload the page.'; }
  });
  seek.addEventListener('input', () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value) / 100 * audio.duration;
  });
  for (const event of ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata']) audio.addEventListener(event, renderPlayer);
  audio.addEventListener('error', () => { audioStatus.textContent = 'The track is temporarily unavailable. Please try reloading the page.'; });
  document.addEventListener('play', event => { if (event.target !== audio && event.target instanceof HTMLMediaElement) audio.pause(); }, true);
  function stopAudio() {
    audio.pause();
    if (audio.readyState > 0) audio.currentTime = 0;
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudio(); });
  window.addEventListener('pagehide', stopAudio);
  function revealRelease() {
    form.hidden = true;
    confirmedNote.classList.add('sr-only');
    section.classList.add('is-revealed');
    const identity = section.querySelector('[data-release-identity]');
    identity.removeAttribute('aria-hidden');
    identity.inert = false;
    player.hidden = false;
    if (audio.dataset.src) audio.src = audio.dataset.src;
    else audioStatus.textContent = 'The full track is coming soon.';
    section.querySelector('#upcoming-heading').focus({preventScroll: true});
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get('signup') === 'confirmed') {
    revealRelease();
    confirmedNote.textContent = 'You’re subscribed. Watch your inbox for release news and show announcements.';
    confirmedNote.hidden = false;
  }
  let mode = 'email';
  form.dataset.signupMode = mode;
  countryCodeWrap.hidden = true;
  for (const button of methods) button.addEventListener('click', () => {
    if (form.getAttribute('aria-busy') === 'true') return;
    const next = button.dataset.signupMethod;
    if (next === mode) return;
    mode = next;
    closeCountries();
    form.dataset.signupMode = mode;
    methods.forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
    input.value = '';
    consent.checked = false;
    countryCodeWrap.hidden = mode !== 'phone';
    input.type = mode === 'email' ? 'email' : 'tel';
    input.name = mode === 'email' ? 'email' : 'phone';
    input.inputMode = mode === 'email' ? 'email' : 'tel';
    input.autocomplete = mode === 'email' ? 'email' : 'tel';
    input.maxLength = mode === 'email' ? 254 : 30;
    input.placeholder = mode === 'email' ? 'Your email' : 'Your mobile number';
    label.textContent = mode === 'email' ? 'Your email address' : 'Your mobile number';
    submit.setAttribute('aria-label', mode === 'email' ? 'Subscribe to email updates' : 'Subscribe to text updates');
    consentCopy.textContent = mode === 'email'
      ? 'Send me occasional email updates about c4milo releases and shows. Unsubscribe anytime.'
      : 'I agree to receive recurring text updates from c4milo about music and shows. Message frequency varies. Message and data rates may apply. Reply STOP to cancel.';
    clearError();
    input.focus();
  });
  function clearError() {
    input.removeAttribute('aria-invalid');
    error.hidden = true;
  }
  input.addEventListener('input', clearError);
  countryCode.addEventListener('change', clearError);
  consent.addEventListener('change', () => { error.hidden = true; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;
    clearError();
    const contact = mode === 'phone'
      ? `+${countryCode.value}${input.value.replace(/\D/g, '')}`
      : input.value.trim();
    if (!validatePreviewContact(mode, contact)) {
      error.textContent = mode === 'email'
        ? 'Enter a valid email address.'
        : 'Enter a valid mobile number.';
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    if (!consent.checked) {
      error.textContent = `Please check the box to agree to receive ${mode === 'email' ? 'email' : 'text'} updates.`;
      error.hidden = false;
      consent.focus();
      return;
    }
    submit.disabled = true;
    const submittedMode = mode;
    form.setAttribute('aria-busy', 'true');
    note.hidden = false;
    note.classList.remove('signup-confirmed');
    note.textContent = 'Adding you to the list…';
    fetch('/api/subscribe', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({channel: mode, contact, consent: consent.checked, website: honeypot.value})
    }).then(async response => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.code || 'subscribe_failed');
      note.textContent = submittedMode === 'email'
        ? 'Check your inbox and confirm your email to finish subscribing.'
        : 'You’re signed up for text updates. Reply STOP anytime to unsubscribe.';
      note.classList.add('signup-confirmed');
      input.value = '';
      consent.checked = false;
      if (submittedMode === 'phone') {
        confirmedNote.textContent = note.textContent;
        confirmedNote.hidden = false;
        revealRelease();
      }
    }).catch(failure => {
      note.hidden = true;
      note.textContent = '';
      error.textContent = String(failure.message).startsWith('configuration_')
        ? 'Signup is not available yet. Please try again later.'
        : 'We couldn’t add you right now. Please try again in a moment.';
      error.hidden = false;
    }).finally(() => {
      submit.disabled = false;
      form.removeAttribute('aria-busy');
    });
  });
}
