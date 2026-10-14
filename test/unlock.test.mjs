import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scoreGuess } from '../public/unlock-engine.js';
import { validateUnlockConfig } from '../lib/unlock-page.mjs';

test('scoring consumes exact matches before duplicate yellow letters', () => {
  assert.deepEqual(scoreGuess('ALLEY','APPLE'), ['correct','present','absent','present','absent']);
  assert.deepEqual(scoreGuess('LLAMA','APPLE'), ['present','absent','present','absent','absent']);
  assert.deepEqual(scoreGuess('PAPAL','APPLE'), ['present','present','correct','absent','present']);
  assert.deepEqual(scoreGuess('APPLE','APPLE'), Array(5).fill('correct'));
  assert.deepEqual(scoreGuess('ZZZZZ','APPLE'), Array(5).fill('absent'));
});

test('blank configuration stays in practice and a custom five-letter answer is accepted', () => {
  assert.deepEqual(validateUnlockConfig(),{answer:'',releaseUrl:'',dictionary:'english'});
  assert.deepEqual(validateUnlockConfig({answer:'amore',releaseUrl:'https://c4milo.com/early',dictionary:'letters'}),{answer:'AMORE',releaseUrl:'https://c4milo.com/early',dictionary:'letters'});
  for (const answer of ['SIXLET','four','12345','niñoo',42]) assert.throws(()=>validateUnlockConfig({answer}),/five A–Z/);
  for (const releaseUrl of ['javascript:alert(1)','http://example.com','https://user:pass@example.com','//example.com']) assert.throws(()=>validateUnlockConfig({releaseUrl}),/https URL/);
  assert.throws(()=>validateUnlockConfig({dictionary:'spanish'}),/english or letters/);
});

test('bundled English guesses are five-letter words and include familiar starters',async()=>{
  const words = (await readFile(new URL('../public/unlock-words.txt',import.meta.url),'utf8')).trim().split('\n');
  assert.ok(words.length > 10000);
  assert.ok(words.every(word => /^[A-Z]{5}$/.test(word)));
  for (const word of ['AUDIO','CRANE','SLATE','APPLE','STARE','ROAST']) assert.ok(words.includes(word));
});
