import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const signup = (body, env = {}) => worker.fetch(new Request('https://c4milo.com/api/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://c4milo.com' },
  body: JSON.stringify(body)
}), env);
const email = { channel: 'email', contact: 'listener@example.com', consent: true };
const configured = {
  BREVO_API_KEY: 'test-only',
  BREVO_LIST_NAME: 'c4milo Updates',
  BREVO_DOI_TEMPLATE_NAME: 'c4milo Email Confirmation'
};

test('invalid contacts are rejected before checking provider configuration', async () => {
  assert.equal((await signup({ ...email, contact: 'invalid' })).status, 400);
});

test('missing Brevo setup returns actionable codes without exposing credentials', async () => {
  for (const [env, code] of [
    [{}, 'configuration_api_key'],
    [{ BREVO_API_KEY: 'test-only' }, 'configuration_list'],
    [{ BREVO_API_KEY: 'test-only', BREVO_LIST_NAME: 'c4milo Updates' }, 'configuration_template']
  ]) {
    const response = await signup(email, env);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, code });
  }
});

test('email signup uses the DOI endpoint with the reveal return URL', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    const responses = [
      { lists: [{ id: 7, name: 'c4milo Updates' }] },
      { templates: [{ id: 9, name: 'c4milo Email Confirmation', isActive: true }] },
      { doiTemplate: true },
      {}
    ];
    return Response.json(responses[calls.length - 1]);
  });
  assert.deepEqual(await (await signup(email, configured)).json(), { ok: true });
  assert.equal(calls[3].url, 'https://api.brevo.com/v3/contacts/doubleOptinConfirmation');
  assert.deepEqual(JSON.parse(calls[3].options.body), {
    email: email.contact, includeListIds: [7], templateId: 9,
    redirectionUrl: 'https://c4milo.com/?signup=confirmed'
  });
});

test('missing provider list is reported as configuration failure', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ lists: [] }));
  const response = await signup(email, configured);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'configuration_list');
});
