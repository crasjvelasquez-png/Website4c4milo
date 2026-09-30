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
      { doiTemplate: true, isActive: true },
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

test('email failures identify the Brevo step without returning private provider messages', async t => {
  const logs = t.mock.method(console, 'error', () => {});
  const steps = ['lists', 'templates', 'template_details', 'email_confirmation'];
  const successful = [
    { lists: [{ id: 7, name: configured.BREVO_LIST_NAME }] },
    { templates: [{ id: 9, name: configured.BREVO_DOI_TEMPLATE_NAME, isActive: true }] },
    { doiTemplate: true, isActive: true }
  ];
  for (let failedStep = 0; failedStep < steps.length; failedStep++) {
    let index = 0;
    const mock = t.mock.method(globalThis, 'fetch', async () => {
      const current = index++;
      return current === failedStep
        ? Response.json({ code: 'invalid_parameter', message: 'Invalid sender listener@example.com xkeysib-test-secret' }, { status: 400 })
        : Response.json(successful[current]);
    });
    const response = await signup(email, configured);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      ok: false, code: `brevo_${steps[failedStep]}`, providerStatus: 400, providerCode: 'invalid_parameter'
    });
    mock.mock.restore();
  }
  assert.equal(logs.mock.callCount(), 4);
  for (const call of logs.mock.calls) {
    assert.equal(call.arguments[1].message, 'Invalid sender [email redacted] [key redacted]');
  }
});

test('explicit template ID bypasses name lookup and is used for confirmation', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return Response.json([
      { lists: [{ id: 7, name: configured.BREVO_LIST_NAME }] },
      { id: 2, isActive: true, doiTemplate: true },
      {}
    ][calls.length - 1]);
  });
  const response = await signup(email, { ...configured, BREVO_DOI_TEMPLATE_ID: '2', BREVO_DOI_TEMPLATE_NAME: '' });
  assert.equal(response.status, 200);
  assert.equal(calls[1].url, 'https://api.brevo.com/v3/smtp/templates/2');
  assert.equal(JSON.parse(calls[2].options.body).templateId, 2);
});

test('pinned template failures identify the exact template and prevent sending', async t => {
  for (const [details, code] of [
    [{ isActive: false, doiTemplate: true }, 'configuration_template_inactive'],
    [{ isActive: true, doiTemplate: false }, 'configuration_double_opt_in']
  ]) {
    let calls = 0;
    const mock = t.mock.method(globalThis, 'fetch', async () => Response.json(++calls === 1
      ? { lists: [{ id: 7, name: configured.BREVO_LIST_NAME }] } : details));
    const response = await signup(email, { ...configured, BREVO_DOI_TEMPLATE_ID: '2' });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, code, templateId: 2 });
    assert.equal(calls, 2);
    mock.mock.restore();
  }
});
