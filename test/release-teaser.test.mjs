import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePreviewContact } from '../public/release-teaser.js';

test('signup preview validates email and international phone separately', () => {
  assert.equal(validatePreviewContact('email', ' artist@example.com '), true);
  assert.equal(validatePreviewContact('email', 'artist.example.com'), false);
  assert.equal(validatePreviewContact('email', 'artist@example.com<script>'), false);
  assert.equal(validatePreviewContact('phone', '+1 (602) 555-0123'), true);
  assert.equal(validatePreviewContact('phone', '602-555'), false);
  assert.equal(validatePreviewContact('phone', '+1 (602) 555-0123 ext 2'), false);
  assert.equal(validatePreviewContact('unknown', 'artist@example.com'), false);
});
