// Local reveal preview. No contact details are stored or sent to a service.
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
  const consent = form.querySelector('[name="consent"]');
  const consentCopy = form.querySelector('[data-consent-copy]');
  const honeypot = form.querySelector('[name="website"]');
  const error = form.querySelector('.signup-error');
  const note = form.querySelector('.signup-note');
  const confirmedNote = section.querySelector('[data-signup-confirmed]');
  const params = new URLSearchParams(window.location.search);
  if (params.get('signup') === 'confirmed') {
    form.hidden = true;
    confirmedNote.textContent = 'You’re subscribed. Watch your inbox for release news and show announcements.';
    confirmedNote.hidden = false;
  }
  let mode = 'email';
  for (const button of methods) button.addEventListener('click', () => {
    const next = button.dataset.signupMethod;
    if (next === mode) return;
    mode = next;
    methods.forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
    input.value = '';
    consent.checked = false;
    input.type = mode === 'email' ? 'email' : 'tel';
    input.name = mode === 'email' ? 'email' : 'phone';
    input.inputMode = mode === 'email' ? 'email' : 'tel';
    input.autocomplete = mode === 'email' ? 'email' : 'tel';
    input.maxLength = mode === 'email' ? 254 : 30;
    input.placeholder = mode === 'email' ? 'Your email' : 'Your phone (+country code)';
    label.textContent = mode === 'email' ? 'Your email address' : 'Your phone number, including country code';
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
  consent.addEventListener('change', () => { error.hidden = true; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    clearError();
    if (!validatePreviewContact(mode, input.value)) {
      error.textContent = mode === 'email'
        ? 'Enter a valid email address.'
        : 'Enter a valid phone number starting with + and your country code.';
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    if (!consent.checked) {
      error.textContent = 'Please check the box to agree to receive email updates.';
      error.hidden = false;
      consent.focus();
      return;
    }
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    note.textContent = 'Adding you to the list…';
    fetch('/api/subscribe', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({channel: mode, contact: input.value.trim(), consent: consent.checked, website: honeypot.value})
    }).then(async response => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error('subscribe_failed');
      note.textContent = mode === 'email'
        ? 'Check your inbox and confirm your email to finish subscribing.'
        : 'You’re signed up for text updates. Reply STOP anytime to unsubscribe.';
      note.classList.add('signup-confirmed');
      input.value = '';
      consent.checked = false;
    }).catch(() => {
      error.textContent = 'We couldn’t add you right now. Please try again in a moment.';
      error.hidden = false;
    }).finally(() => {
      submit.disabled = false;
      form.removeAttribute('aria-busy');
    });
  });
}
