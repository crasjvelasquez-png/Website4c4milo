import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';

const source = (await readFile(new URL('../public/noise-video.js',import.meta.url),'utf8')).replace('export function','function');
function fixture({ reduced = false, reject = false, videoFrames = true, hasBar = true, compact = false, saveData = false, lowEnd = false } = {}) {
  const video = new EventTarget();
  const classes = new Set();
  const callbacks = new Map();
  let callbackId = 0;
  const draws = [];
  const context = {createPattern:(source,repeat)=>({source,repeat}),setTransform:()=>{},fillRect:(...args)=>draws.push(args)};
  const canvas = {width:0,height:0,getContext:()=>context};
  const barDraws = [];
  const barContext = {setTransform:()=>{},fillRect:(...args)=>barDraws.push(args)};
  const bar = {width:0,height:0,clientHeight:40,getContext:()=>barContext};
  Object.assign(video, {dataset:{src:'/assets/vhs-noise.mp4'},src:'',plays:0,paused:true,videoWidth:640,videoHeight:360,
    requestVideoFrameCallback:callback=>{callbacks.set(++callbackId,callback);return callbackId;},
    cancelVideoFrameCallback:id=>callbacks.delete(id),
    getAttribute:() => video.src,
    play:() => {
      video.plays++;
      if (reject) return Promise.reject(new Error('Autoplay denied'));
      video.paused = false;
      video.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    },
    pause:() => {video.paused = true;video.dispatchEvent(new Event('pause'));}
  });
  if (!videoFrames) {
    delete video.requestVideoFrameCallback;
    delete video.cancelVideoFrameCallback;
  }
  const motion = new EventTarget();motion.matches = reduced;
  const device = new EventTarget();device.matches = compact;
  let intersect;
  const document = new EventTarget();
  Object.assign(document, {hidden:false,readyState:'complete',querySelector:selector => selector === '[data-noise-video]' ? video : selector === '[data-noise-bar]' ? (hasBar ? bar : null) : canvas,body:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}}});
  const window = new EventTarget();Object.assign(window,{matchMedia:query => query.includes('reduced-motion') ? motion : device,innerWidth:1280,innerHeight:900,devicePixelRatio:2,
    requestIdleCallback:callback=>{callback();return 1;},
    IntersectionObserver:class { constructor(callback) { intersect = callback; } observe() {} },
    requestAnimationFrame:callback=>{callbacks.set(++callbackId,callback);return callbackId;},
    cancelAnimationFrame:id=>callbacks.delete(id)
  });
  runInNewContext(`${source}\nmountNoiseVideo();`, {document,window,navigator:{deviceMemory:lowEnd?2:8,hardwareConcurrency:lowEnd?4:8,connection:{saveData}}});
  const nextFrame = now => {
    const [id,callback] = [...callbacks][0];
    callbacks.delete(id);callback(now);
  };
  return {video,document,window,motion,device,classes,canvas,context,callbacks,draws,bar,barContext,barDraws,nextFrame,intersect:visible=>intersect([{isIntersecting:visible}])};
}

test('noise pauses while hidden and exited, and resumes when visible or restored',()=>{
  const f = fixture();
  assert.equal(f.video.muted,true);
  assert.equal(f.video.src,'/assets/vhs-noise.mp4');
  assert.ok(f.classes.has('video-noise-playing'));
  f.document.hidden = true;f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.video.paused,true);
  assert.equal(f.classes.size,0);
  assert.equal(f.callbacks.size,0);
  f.document.hidden = false;f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.video.paused,false);
  f.window.dispatchEvent(new Event('pagehide'));
  assert.equal(f.video.paused,true);
  f.window.dispatchEvent(new Event('pageshow'));
  assert.equal(f.video.paused,false);
});

test('video frames tile the full viewport at native scale and resize without extra playback',()=>{
  const f = fixture();
  assert.equal(f.context.fillStyle.source,f.video);
  assert.equal(f.context.fillStyle.repeat,'repeat');
  assert.deepEqual(f.draws[0],[0,0,1280,900]);
  assert.equal(f.canvas.width,1280);
  assert.equal(f.canvas.height,900);
  assert.equal(f.barContext.fillStyle,f.context.fillStyle);
  assert.deepEqual(f.barDraws[0],[0,0,1280,40]);
  assert.equal(f.bar.height,40);
  f.window.innerWidth = 390;f.window.innerHeight = 844;
  f.window.dispatchEvent(new Event('resize'));
  const [id,callback] = [...f.callbacks][0];
  f.callbacks.delete(id);callback();
  assert.deepEqual(f.draws.at(-1),[0,0,390,844]);
  assert.equal(f.canvas.width,390);
  assert.equal(f.canvas.height,844);
  assert.equal(f.bar.width,390);
  assert.deepEqual(f.barDraws.at(-1),[0,0,390,40]);
  assert.equal(f.video.plays,1);
  assert.equal(f.callbacks.size,1);
});

test('reduced motion avoids downloading the video and responds to preference changes',()=>{
  const f = fixture({reduced:true});
  assert.equal(f.video.src,'');assert.equal(f.video.plays,0);
  f.motion.matches = false;f.motion.dispatchEvent(new Event('change'));
  assert.ok(f.classes.has('video-noise-playing'));
  f.motion.matches = true;f.motion.dispatchEvent(new Event('change'));
  assert.equal(f.video.paused,true);assert.equal(f.classes.size,0);
});

test('phone sizes and orientation changes keep the bar covered and cap high-density rendering',()=>{
  const f = fixture({compact:true});
  for (const [width,height] of [[320,568],[390,844],[430,932],[844,390]]) {
    Object.assign(f.window,{innerWidth:width,innerHeight:height,devicePixelRatio:3});
    f.window.dispatchEvent(new Event('resize'));
    const [id,callback] = [...f.callbacks][0];
    f.callbacks.delete(id);callback();
    assert.equal(f.canvas.width,width);
    assert.equal(f.canvas.height,height);
    assert.equal(f.bar.width,width);
    assert.equal(f.bar.height,40);
    assert.deepEqual(f.barDraws.at(-1),[0,0,width,40]);
  }
  assert.equal(f.video.plays,1);
});

test('mobile grain samples 15fps and does not read bar layout during drawing',()=>{
  const f = fixture({compact:true});
  Object.defineProperty(f.bar,'clientHeight',{get:()=>{throw new Error('layout read during paint');}});
  for (let i=1;i<=30;i++) f.nextFrame(i * 1000 / 30);
  assert.equal(f.draws.length,16); // Initial still plus fifteen updates.
  assert.equal(f.callbacks.size,1);
  f.intersect(false);
  const count=f.barDraws.length;
  f.nextFrame(1100);
  assert.equal(f.barDraws.length,count);
  f.intersect(true);f.nextFrame(1200);
  assert.equal(f.barDraws.length,count+1);
});

test('fallback rAF caps 120Hz drawing, changes density at breakpoints, and resumes immediately',()=>{
  const f = fixture({videoFrames:false});
  for (let i=1;i<=120;i++) f.nextFrame(i * 1000 / 120);
  assert.equal(f.draws.length,16);
  f.device.matches=true;f.device.dispatchEvent(new Event('change'));
  f.nextFrame(1001);
  assert.equal(f.canvas.width,1280);
  f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.callbacks.size,0);
  const count=f.draws.length;
  f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.draws.length,count+1);
  assert.equal(f.callbacks.size,1);
});

test('desktop grain caps paint cadence at 15fps when video callbacks arrive unevenly',()=>{
  const f=fixture();
  for (const now of [31,61,99,127,166]) f.nextFrame(now);
  assert.equal(f.draws.length,3);
});

test('older browsers use animation frames and pages without a white bar still work',()=>{
  const f = fixture({videoFrames:false,hasBar:false});
  assert.ok(f.classes.has('video-noise-playing'));
  assert.equal(f.callbacks.size,1);
  f.window.dispatchEvent(new Event('pagehide'));
  assert.equal(f.callbacks.size,0);
  assert.equal(f.classes.size,0);
});

test('autoplay rejection and media errors keep the still fallback',async()=>{
  const rejected = fixture({reject:true});
  await Promise.resolve();
  assert.equal(rejected.classes.size,0);
  const f = fixture();
  f.video.dispatchEvent(new Event('error'));
  assert.equal(f.classes.size,0);
  const starts = f.video.plays;
  f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.video.plays,starts);
});

test('adaptive low-resource mode keeps static grain and skips video decoding',()=>{
  for (const options of [{lowEnd:true},{saveData:true}]) {
    const f = fixture(options);
    assert.equal(f.video.src,'');
    assert.ok(f.classes.has('lighter-effects'));
    assert.equal(f.classes.has('video-noise-playing'),false);
    assert.equal(f.callbacks.size,0);
  }
});

test('local video serving supports byte ranges and the correct MIME type',async()=>{
  const dir = await mkdtemp(join(tmpdir(),'noise-video-'));
  await writeFile(join(dir,'noise.mp4'),Buffer.from([1,2,3,4,5]));
  const server = createApp({directory:dir});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/noise.mp4`,{headers:{Range:'bytes=1-3'}});
    assert.equal(response.status,206);
    assert.equal(response.headers.get('content-type'),'video/mp4');
    assert.equal(response.headers.get('content-range'),'bytes 1-3/5');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[2,3,4]);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true});
  }
});
