const BREVO_DOI_ENDPOINT = 'https://api.brevo.com/v3/contacts/doubleOptinConfirmation';
const BREVO_API = 'https://api.brevo.com/v3';
const MAX_BODY_BYTES = 4096;
const SMS_CONSENT_TEXT = 'I agree to receive recurring text updates from c4milo about music and shows. Message frequency varies. Message and data rates may apply. Reply STOP to cancel.';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ ok: false }, 403);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return json({ ok: false }, 415);
  }

  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY_BYTES) return json({ ok: false }, 413);

  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ ok: false }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false }, 400);

  // Quietly discard automated junk submissions.
  if (typeof body.website === 'string' && body.website.trim()) return json({ ok: true });

  const channel = body.channel;
  const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
  const listName = env.BREVO_LIST_NAME?.trim().toLowerCase();
  const templateName = env.BREVO_DOI_TEMPLATE_NAME?.trim().toLowerCase();
  if (body.consent !== true) return json({ ok: false }, 400);

  if (channel === 'email') {
    const email = contact.toLowerCase();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 254) return json({ ok: false }, 400);
  } else if (channel === 'phone') {
    const digits = contact.replace(/\D/g, '');
    if (!/^\+[\d\s().-]+$/.test(contact) || !/^[1-9]\d{7,14}$/.test(digits)) return json({ ok: false }, 400);
  } else {
    return json({ ok: false }, 400);
  }

  if (!env.BREVO_API_KEY) return json({ ok: false, code: 'configuration_api_key' }, 503);
  if (!listName) return json({ ok: false, code: 'configuration_list' }, 503);
  if (channel === 'email' && !templateName) return json({ ok: false, code: 'configuration_template' }, 503);

  const confirmation = new URL(request.url);
  confirmation.pathname = '/';
  confirmation.search = channel === 'email' ? '?signup=confirmed' : '';

  try {
    const apiHeaders = { 'accept': 'application/json', 'api-key': env.BREVO_API_KEY };
    const listsResponse = await fetch(`${BREVO_API}/contacts/lists?limit=50&offset=0`, { headers: apiHeaders });
    if (!listsResponse.ok) return json({ ok: false }, 502);
    const listsData = await listsResponse.json();
    const list = listsData.lists?.find(item => item.name?.trim().toLowerCase() === listName);
    if (!list) return json({ ok: false, code: 'configuration_list' }, 503);

    if (channel === 'phone') {
      const digits = contact.replace(/\D/g, '');
      const consentRecord = `${new Date().toISOString()} | Website signup v1 | ${SMS_CONSENT_TEXT}`;
      const response = await fetch(`${BREVO_API}/contacts`, {
        method: 'POST',
        headers: { ...apiHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          attributes: { SMS: `+${digits}`, SMS_CONSENT_RECORD: consentRecord },
          listIds: [list.id],
          smsBlacklisted: false,
          updateEnabled: true
        })
      });
      if (!response.ok) return json({ ok: false }, 502);
      return json({ ok: true });
    }

    const email = contact.toLowerCase();
    const templatesResponse = await fetch(`${BREVO_API}/smtp/templates?limit=50&offset=0&templateStatus=true`, { headers: apiHeaders });
    if (!templatesResponse.ok) return json({ ok: false }, 502);
    const templatesData = await templatesResponse.json();
    const template = templatesData.templates?.find(item => item.name?.trim().toLowerCase() === templateName && item.isActive);
    if (!template) return json({ ok: false, code: 'configuration_template' }, 503);

    const templateResponse = await fetch(`${BREVO_API}/smtp/templates/${template.id}`, { headers: apiHeaders });
    if (!templateResponse.ok) return json({ ok: false }, 502);
    const templateDetails = await templateResponse.json();
    if (templateDetails.doiTemplate !== true) return json({ ok: false, code: 'configuration_double_opt_in' }, 503);

    const response = await fetch(BREVO_DOI_ENDPOINT, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': env.BREVO_API_KEY
      },
      body: JSON.stringify({
        email,
        includeListIds: [list.id],
        templateId: template.id,
        redirectionUrl: confirmation.toString()
      })
    });
    if (!response.ok) return json({ ok: false }, 502);
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 502);
  }
}

export async function onRequest() {
  return new Response('Method not allowed', {
    status: 405,
    headers: { 'Allow': 'POST', 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
