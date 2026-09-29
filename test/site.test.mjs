import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';
import { createListeningService } from '../lib/lastfm.mjs';
import { escape, externalUrl, embedUrl, assetUrl } from '../lib/content.mjs';

test('content URLs and markup cannot inject scripts or arbitrary embed hosts',()=>{
  assert.equal(externalUrl('javascript:alert(1)'), '');
  assert.equal(assetUrl('/assets/../.env'),'');
  assert.equal(embedUrl('spotify','https://evil.test/embed/album/abc'),'');
  assert.equal(embedUrl('soundcloud','https://w.soundcloud.com/player/?url=https://evil.test'),'');
  assert.match(escape('<script>"'),/^&lt;script&gt;&quot;$/);
  assert.equal(embedUrl('spotify','https://open.spotify.com/embed/album/abc?autoplay=1'),'https://open.spotify.com/embed/album/abc');
});

test('Last.fm needs configuration, normalizes data and deduplicates/caches requests',async()=>{
  let calls=0;
  const fetcher=async url=>{calls++;return {ok:true,json:async()=>url.searchParams.get('method')==='user.getRecentTracks' ? {recenttracks:{track:[{name:'Song',artist:{'#text':'Artist'},'@attr':{nowplaying:'true'},url:'javascript:bad'}]}} : {topartists:{artist:[{name:'Artist',playcount:'12'}]}}};};
  const unconfigured=createListeningService({fetcher});
  assert.equal((await unconfigured()).status,'unconfigured');assert.equal(calls,0);
  const service=createListeningService({username:'test',apiKey:'secret',fetcher});
  const [a,b]=await Promise.all([service(),service()]);
  assert.deepEqual(a,b);assert.equal(calls,2);assert.equal(a.recent[0].nowPlaying,true);assert.equal(a.recent[0].url,'');assert.equal(a.top[0].plays,12);
  await service();assert.equal(calls,2);assert.ok(!JSON.stringify(a).includes('secret'));
});

test('Last.fm empty, rate-limited and stale responses are distinct and retries are bounded',async()=>{
  let time=0,fail=false,calls=0;
  const service=createListeningService({username:'u',apiKey:'k',ttl:10,retry:5,now:()=>time,fetcher:async url=>{calls++;if(fail) return {ok:true,json:async()=>({error:29})};return {ok:true,json:async()=>url.searchParams.get('method')==='user.getRecentTracks'?{recenttracks:{}}:{topartists:{}}};}});
  const empty=await service();assert.equal(empty.status,'live');assert.deepEqual(empty.recent,[]);
  time=11;fail=true;assert.equal((await service()).status,'stale');assert.equal(calls,4);
  time=12;await service();assert.equal(calls,4);
  const unavailable=createListeningService({username:'u',apiKey:'k',fetcher:async()=>{throw new Error('timeout');}});
  assert.equal((await unavailable()).status,'unavailable');
});

test('server serves only public files and rejects traversal, symlinks and mutations',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'artist-site-'));
  const outside=await mkdtemp(join(tmpdir(),'artist-private-'));
  await writeFile(join(dir,'index.html'),'<h1>Artist</h1>');
  await writeFile(join(outside,'secret'),'private');
  await symlink(join(outside,'secret'),join(dir,'leak'));
  const server=createApp({directory:dir,listening:async()=>({status:'unconfigured'})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base)).status,200);
    for(const path of ['/.env','/content.json','/leak','/%2e%2e%2fsecret','/%00']) assert.equal((await fetch(base+path)).status,404,path);
    assert.equal((await fetch(base,{method:'POST'})).status,405);
    assert.equal((await fetch(base,{method:'HEAD'})).status,200);
    assert.equal((await fetch(base+'/api/listening')).status,200);
    assert.match((await fetch(base)).headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  } finally {await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true});await rm(outside,{recursive:true});}
});
