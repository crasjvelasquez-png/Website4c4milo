import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSite } from '../scripts/build.mjs';
import { validateContent } from '../lib/content.mjs';

const source = new URL('../', import.meta.url);
const baseline = JSON.parse(await readFile(new URL('content.json',source),'utf8'));
async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(),'artist-build-'));
  const content = structuredClone(baseline);
  await cp(new URL('public',source),join(directory,'public'),{recursive:true});
  const save = () => writeFile(join(directory,'content.json'),JSON.stringify(content));
  try { await save(); await run({directory,content,save}); }
  finally { await rm(directory,{recursive:true}); }
}

test('bad content edits fail before replacing the working generated page',async()=>fixture(async({directory,content,save})=>{
  await buildSite({directory});
  const previous = await readFile(join(directory,'dist/index.html'),'utf8');
  content.releases[0].embed.url = 'https://invalid.example/player';
  await save();
  await assert.rejects(buildSite({directory}),/Unsupported embed URL/);
  assert.equal(await readFile(join(directory,'dist/index.html'),'utf8'),previous);
  content.releases[0].embed.url = '';
  content.releases[0].artwork = '/assets/missing.webp';
  content.releases[0].artworkOptional = false;
  await save();
  await assert.rejects(buildSite({directory}),/Missing artwork.*leave artwork blank/);
  assert.equal(await readFile(join(directory,'dist/index.html'),'utf8'),previous);
  await writeFile(join(directory,'content.json'),'{broken JSON');
  await assert.rejects(buildSite({directory}),SyntaxError);
  assert.equal(await readFile(join(directory,'dist/index.html'),'utf8'),previous);
}));

test('disabling demo listening lets a finished artist site leave preview mode',async()=>fixture(async({directory,content,save})=>{
  content.artist.placeholder = false;
  for (const release of content.releases) release.placeholder = false;
  content.listening.enabled = false;
  await save();
  assert.equal((await buildSite({directory})).placeholder,false);
  const html = await readFile(join(directory,'dist/index.html'),'utf8');
  assert.doesNotMatch(html,/name="robots"|class="preview-note"|id="listening"/);
  content.listening.enabled = true;
  await save(); await buildSite({directory});
  assert.match(await readFile(join(directory,'dist/index.html'),'utf8'),/noindex, nofollow/);
}));

test('empty discography and safe content escaping build without inventing releases',async()=>fixture(async({directory,content,save})=>{
  content.releases = [];
  content.artist.name = 'Artist <script>alert(1)</script>';
  content.listening.enabled = false;
  await save(); await buildSite({directory});
  const html = await readFile(join(directory,'dist/index.html'),'utf8');
  assert.match(html,/No releases yet/);
  assert.match(html,/Artist &lt;script&gt;/);
  assert.doesNotMatch(html,/<script>alert\(1\)/);
}));

test('invalid link and asset edits explain the affected content field',()=>{
  const content = structuredClone(baseline);
  content.links[0].url = 'spotify.com/artist/example';
  assert.throws(()=>validateContent(content),/Spotify needs a full https/);
  content.links[0].url = '';
  content.artist.photo = '/assets/a photo.webp';
  assert.throws(()=>validateContent(content),/artist.photo must be/);
  content.artist.photo = '';
  content.listening.enabled = 'false';
  assert.throws(()=>validateContent(content),/enabled must be true or false, without quotes/);
});

test('signup preview exposes accessible email and phone choices without a real submission',async()=>fixture(async({directory,save})=>{
  await save(); await buildSite({directory});
  const html = await readFile(join(directory,'dist/index.html'),'utf8');
  assert.match(html,/Sign up for updates and a download of the next release\./);
  assert.match(html,/<div class="preview-note" aria-hidden="true"><\/div>/);
  assert.doesNotMatch(html,/Structure preview|Preview includes placeholder content/);
  assert.match(html,/<label class="sr-only" for="early-listen-contact" data-contact-label>Your email address<\/label>/);
  assert.match(html,/data-signup-method="email" aria-label="Use email" aria-pressed="true"><svg[^>]*aria-hidden="true"/);
  assert.match(html,/data-signup-method="phone" aria-label="Use phone" aria-pressed="false"><svg[^>]*aria-hidden="true"/);
  assert.match(html,/type="submit" aria-label="Preview the next release" disabled><span aria-hidden="true">→<\/span>/);
  assert.match(html,/Preview only · Nothing is saved or sent\./);
  assert.match(html,/data-preview-notice hidden>Preview only · No contact was verified or signed up\./);
}));


test('gallery covers have five inline services while featured Querida keeps its picker',async()=>fixture(async({directory,content,save})=>{
  content.releases[0].title = 'Querida <special>';
  await save(); await buildSite({directory});
  const html = await readFile(join(directory,'dist/index.html'),'utf8');
  assert.equal((html.match(/data-service-picker=/g) ?? []).length,1);
  const gallery = html.match(/<div class="release-covers">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(gallery);
  assert.doesNotMatch(gallery,/featured-cover|Image placeholder|Release artwork/);
  const tiles = gallery.split('<div class="release-tile" data-release-tile>').slice(1);
  assert.equal(tiles.length,content.releases.length-1);
  for (const [index,tile] of tiles.entries()) {
    assert.match(tile,new RegExp(`data-inline-services="services-inline-${index+1}"`));
    assert.match(tile,new RegExp(`class="release-services" id="services-inline-${index+1}"`));
    assert.equal((tile.match(/<a class="platform-logo/g) ?? []).length,5);
    for (const name of ['spotify','applemusic','pandora','tidal','youtubemusic']) assert.ok(tile.includes(`/logos/${name}.svg`));
  }
  const dialogs = [...html.matchAll(/<div class="service-picker" role="dialog" popover="auto"[\s\S]*?<\/div><\/div>/g)].map(x=>x[0]);
  assert.equal(dialogs.length,1);
  assert.match(dialogs[0],/id="services-0"/);
  assert.equal((dialogs[0].match(/<a class="platform-logo/g) ?? []).length,5);
  assert.doesNotMatch(gallery,/<img[^>]*alt="[^"\s]+/);
  assert.match(dialogs[0],/Listen to Querida &lt;special&gt; on Spotify/);
  assert.match(tiles[0],/Listen to CRUSH. on Tidal/);
  assert.match(tiles[1],/Search for circles by c4milo on YouTube Music/);
  assert.match(tiles[2],/Listen to NMF on Spotify/);
  assert.doesNotMatch(html,/Querida <special>/);
}));
