import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchCoverPreviews } from '../lib/cover-previews.mjs';

test('cover previews require exact PNG/MP3 pairs, retaining optimized display artwork', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cover-matching-'));
  try {
    await mkdir(join(directory, 'assets'));
    for (const file of ['one.png', 'one.webp', 'one.mp3', 'two.png', 'Two.mp3', 'three.mp3', 'four.png', 'four-final.mp3']) {
      await writeFile(join(directory, 'assets', file), 'fixture');
    }
    const releases = ['one', 'two', 'three', 'four'].map(id => ({id, title:id, type:'Single', artwork:`/assets/${id}.webp`}));
    const { previews, warnings } = await matchCoverPreviews(releases, directory);
    assert.deepEqual([...previews], [['one', '/assets/one.mp3']]);
    assert.equal(warnings.length, 3);
    assert.match(warnings[0], /two.mp3/);
    assert.match(warnings[1], /three.png/);
    assert.match(warnings[2], /four.mp3/);
    assert.equal((await matchCoverPreviews(releases, directory, 'one')).previews.size, 0);
  } finally { await rm(directory, {recursive:true, force:true}); }
});
