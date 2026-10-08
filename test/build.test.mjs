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

test('noise video is optional and copied into the build when supplied',async()=>fixture(async({directory})=>{
  await rm(join(directory,'public/assets/vhs-noise.mp4'),{force:true});
  await buildSite({directory});
  assert.doesNotMatch(await readFile(join(directory,'dist/index.html'),'utf8'),/data-noise-video/);
  await writeFile(join(directory,'public/assets/vhs-noise.mp4'),'video fixture');
  await buildSite({directory});
  const html = await readFile(join(directory,'dist/index.html'),'utf8');
  const video = html.match(/data-noise-video data-src="(\/_assets\/assets\/vhs-noise\.[a-f0-9]{12}\.mp4)" muted loop playsinline preload="none"/);
  assert.ok(video);
  assert.equal(await readFile(join(directory,'dist'+video[1]),'utf8'),'video fixture');
  assert.match(await readFile(join(directory,'dist/_headers'),'utf8'),/\/_assets\/\*[\s\S]*max-age=31536000, immutable/);
  assert.equal(await readFile(join(directory,'dist/assets/vhs-noise.mp4'),'utf8'),'video fixture');
}));

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

test('signup form exposes accessible email and text choices',async()=>fixture(async({directory,content,save})=>{
  content.signup = {enabled:true};
  await save(); await buildSite({directory});
  const html = await readFile(join(directory,'dist/index.html'),'utf8');
  assert.match(html,/Sign up to unlock the next single\./);
  assert.match(html,/<div class="preview-note" aria-hidden="true">(?:<canvas class="vhs-noise-bar" data-noise-bar><\/canvas>)?<\/div>/);
  assert.match(html,/<meta name="theme-color" content="#ffffff">/);
  assert.doesNotMatch(html,/<header class="site-header">/);
  assert.ok(html.indexOf('class="early-listen-invitation"') < html.indexOf('class="signup-entry"'));
  assert.ok(html.indexOf('class="signup-entry"') < html.indexOf('class="upcoming-preview"'));
  assert.doesNotMatch(html,/Structure preview|Preview includes placeholder content/);
  assert.match(html,/<label class="sr-only" for="early-listen-contact" data-contact-label>Your email address<\/label>/);
  assert.match(html,/data-signup-method="email" aria-label="Use email" aria-pressed="true"><svg[^>]*aria-hidden="true"/);
  assert.match(html,/data-signup-method="phone" aria-label="Use text messages" aria-pressed="false"><svg[^>]*aria-hidden="true"/);
  assert.match(html,/<select id="early-listen-country" name="countryCode" autocomplete="tel-country-code">/);
  assert.match(html,/<option value="1">US \+1<\/option>/);
  assert.match(html,/type="submit" aria-label="Subscribe to email updates"><span aria-hidden="true">→<\/span>/);
  assert.match(html,/<input name="consent" type="checkbox" required>/);
  assert.match(html,/<p id="early-listen-note" class="signup-note" role="status" aria-live="polite" hidden><\/p>/);
  assert.doesNotMatch(html,/Join the list for release news and upcoming shows\./);
}));


test('gallery covers have five inline services while featured Querida has no popup',async()=>fixture(async({directory,content,save})=>{
  content.releases[0].title = 'Querida <special>';
  await save(); await buildSite({directory});
  const html = await readFile(join(directory,'dist/index.html'),'utf8');
  assert.equal((html.match(/data-service-picker=/g) ?? []).length,0);
  assert.doesNotMatch(html,/class="service-picker"/);
  assert.match(html,/<span class="featured-cover">/);
  assert.doesNotMatch(html,/featured-cover floating-link|aria-haspopup="dialog"/);
  const gallery = html.match(/<div class="release-covers">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(gallery);
  assert.doesNotMatch(gallery,/featured-cover|Image placeholder|Release artwork/);
  const tiles = gallery.split(/<div class="release-tile(?: has-release-title)?" data-release-tile\b[^>]*>/).slice(1);
  assert.equal(tiles.length,content.releases.length-1);
  for (const [index,tile] of tiles.entries()) {
    assert.match(tile,new RegExp(`data-inline-services="services-inline-${index+1}"`));
    assert.match(tile,new RegExp(`class="release-services" id="services-inline-${index+1}"`));
    assert.equal((tile.match(/<a class="platform-logo/g) ?? []).length,5);
    for (const name of ['spotify','applemusic','amazonmusic','youtubemusic','tidal']) assert.match(tile,new RegExp(`/_assets/assets/logos/${name}\\.[a-f0-9]{12}\\.svg`));
  }
  assert.doesNotMatch(gallery,/<img[^>]*alt="[^"\s]+/);
  assert.match(html,/<h1 id="featured-heading">Querida &lt;special&gt;<\/h1>/);
  assert.match(tiles[0],/Listen to CRUSH. on Tidal/);
  assert.match(tiles[1],/Search for circles by c4milo on YouTube Music/);
  assert.match(tiles[2],/Listen to NMF on Spotify/);
  assert.doesNotMatch(html,/Querida <special>/);
}));

test('hidden signup omits the early-listen box while keeping page spacing',async()=>fixture(async({directory,content,save})=>{
  content.signup = {enabled:false};
  await save(); await buildSite({directory});
  const html = await readFile(join(directory,'dist/index.html'),'utf8');
  assert.doesNotMatch(html,/id="early-listen"|Sign up to unlock the next single/);
  assert.match(html,/id="links"/);
  assert.match(html,/id="releases"/);
}));

test('portfolio builds a 15-project grid and leaves incomplete paired audio disabled',async()=>fixture(async({directory})=>{
  await buildSite({directory});
  const html = await readFile(join(directory,'dist/portafolio.html'),'utf8');
  assert.equal((html.match(/class="portfolio-project(?: is-selected)?"/g) ?? []).length,15);
  assert.match(html,/data-active-side="before"/);
  assert.match(html,/data-side="before" aria-pressed="true"/);
  assert.match(html,/data-side="after" aria-pressed="false"/);
  assert.match(html,/data-play aria-label="Play" disabled/);
  assert.match(html,/<p class="portfolio-audio-status" data-audio-status role="status" aria-live="polite"><\/p>/);
  assert.doesNotMatch(html,/Audio pending/);
  assert.match(html,/portfolio-player\.js/);
  assert.match(html,/Project 01/);
}));

test('portfolio audio is enabled only after both configured MP3s exist and content stays escaped',async()=>fixture(async({directory,content,save})=>{
  content.portfolio.projects[0].title = '<Song>';
  content.portfolio.projects[0].audio = {before:'/assets/before.mp3',after:'/assets/after.mp3'};
  await save();
  await buildSite({directory});
  let html = await readFile(join(directory,'dist/portafolio.html'),'utf8');
  assert.doesNotMatch(html,/Audio pending/);
  await writeFile(join(directory,'public/assets/before.mp3'),'before');
  await writeFile(join(directory,'public/assets/after.mp3'),'after');
  await buildSite({directory});
  html = await readFile(join(directory,'dist/portafolio.html'),'utf8');
  assert.match(html,/&lt;Song&gt;/);
  const before = html.match(/"before":"(\/_assets\/assets\/before\.[a-f0-9]{12}\.mp3)"/);
  assert.match(html,/"after":"\/_assets\/assets\/after\.[a-f0-9]{12}\.mp3"/);
  assert.ok(before);
  assert.match(html,/data-play aria-label="Play" disabled/);
  assert.equal(await readFile(join(directory,'dist'+before[1]),'utf8'),'before');
}));

test('portfolio requires exactly 15 uniquely identified projects and MP3 tracks',()=>{
  const content = structuredClone(baseline);
  content.portfolio = {projects:[]};
  assert.throws(()=>validateContent(content),/exactly 15 projects/);
  content.portfolio.projects = Array.from({length:15},(_,i)=>({id:`p${i}`,title:`P${i}`,artist:'Artist',contribution:'Mixing',artwork:'',audio:{before:'',after:''}}));
  content.portfolio.projects[1].audio.before = '/assets/track.wav';
  assert.throws(()=>validateContent(content),/needs a local MP3/);
});

test('secret release enables playback and a local MP3 download only when its file exists',async()=>fixture(async({directory,content,save})=>{
  content.signup = {enabled:true};
  content.upcomingRelease = {audio:'/assets/secret-test.mp3',cover:''};
  await save(); await buildSite({directory});
  let html = await readFile(join(directory,'dist/index.html'),'utf8');
  assert.match(html,/data-upcoming-player hidden/);
  assert.match(html,/aria-label="Download MP3 \(unavailable\)"[^>]*disabled/);
  assert.doesNotMatch(html,/data-src="\/assets\/secret-test.mp3"/);
  await writeFile(join(directory,'public/assets/secret-test.mp3'),'test media fixture');
  await buildSite({directory});
  html = await readFile(join(directory,'dist/index.html'),'utf8');
  const secret = html.match(/<audio preload="none" aria-labelledby="upcoming-heading" data-src="(\/_assets\/assets\/secret-test\.[a-f0-9]{12}\.mp3)"/);
  assert.ok(secret);
  assert.match(html,/href="\/_assets\/assets\/secret-test\.[a-f0-9]{12}\.mp3" download="how-deep-is-your-love.mp3"/);
  assert.doesNotMatch(html,/disabled>Download MP3/);
  assert.equal(await readFile(join(directory,'dist'+secret[1]),'utf8'),'test media fixture');
  content.upcomingRelease.audio = '/assets/secret.wav';
  assert.throws(()=>validateContent(content),/upcomingRelease.audio needs a local MP3/);
}));
