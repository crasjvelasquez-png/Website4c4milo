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
  const notice = section.querySelector('[data-preview-notice]');
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
    status.textContent = 'The next release: How deep is your love? Originally by the Bee Gees. Format checked locally; your contact was not verified or signed up.';
    input.value = '';
    invitation.hidden = true;
    form.hidden = true;
    notice.hidden = false;
  });
}
