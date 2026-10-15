import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

test('Worker redirects retired unlock routes before accessing static assets',async()=>{
  for (const path of ['/unlock','/unlock/','/unlock/index.html','/unlock-config.json']) {
    const response = await worker.fetch(new Request(`https://c4milo.com${path}`), {ASSETS:{fetch(){throw new Error('Retired page reached assets');}}});
    assert.equal(response.status,302);
    assert.equal(response.headers.get('Location'),'/');
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
});
