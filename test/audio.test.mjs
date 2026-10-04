import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleEnvelope, createTransport, tapeGeometry, tapePoint, tapeLength} from '../public/audio-player.js';
import {createApp} from '../server.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

function parameter() {
  const calls=[];
  return {value:1,calls,cancelScheduledValues:t=>calls.push(['cancel',t]),setValueAtTime:(v,t)=>calls.push(['set',v,t]),linearRampToValueAtTime:(v,t)=>calls.push(['ramp',v,t])};
}
test('fade envelope begins silent and reaches silence at the actual end, including late seeks',()=>{
  const p=parameter();
  scheduleEnvelope(p,10,0,180,1,1.5);
  assert.deepEqual(p.calls,[['cancel',10],['set',0,10],['ramp',1,11],['set',1,188.5],['ramp',0,190]]);
  p.calls.length=0;
  scheduleEnvelope(p,10,179.8,180,1,1.5);
  assert.ok(p.calls.every(c=>c.at(-1)>=10 && c.at(-1)<=10.21));
  assert.equal(p.calls.at(-1)[1],0);
  assert.ok(Math.abs(p.calls.at(-1)[2]-10.2)<0.0001);
});
test('leaving while context resumes cancels playback; stop resets media and cancels fades',async()=>{
  const audio=new EventTarget();Object.assign(audio,{currentTime:8,duration:180,readyState:1,paused:true});
  let starts=0,resolveResume;
  audio.play=async()=>{starts++;audio.paused=false;audio.dispatchEvent(new Event('playing'));};
  audio.pause=()=>{audio.paused=true;};
  const p=parameter();
  const context={currentTime:20,destination:{},createGain:()=>({gain:p,connect(){}}),createMediaElementSource:()=>({connect(){}}),resume:()=>new Promise(r=>resolveResume=r)};
  const t=createTransport(audio,{createContext:()=>context});
  const playing=t.play();t.stop();resolveResume();await playing;
  assert.equal(starts,1);assert.equal(audio.currentTime,0);assert.equal(audio.paused,true);
  const next=t.play();resolveResume();await next;
  assert.equal(starts,2);assert.equal(audio.paused,false);
  audio.currentTime=179;audio.dispatchEvent(new Event('seeked'));audio.dispatchEvent(new Event('playing'));
  assert.equal(p.calls.at(-1)[1],0);
  t.stop();assert.equal(audio.paused,true);assert.equal(audio.currentTime,0);assert.deepEqual(p.calls.at(-1),['set',0,20]);
});
test('play starts at three seconds, resumes from pause, and restarts there after stop',async()=>{
  const audio=new EventTarget();Object.assign(audio,{currentTime:0,duration:174,readyState:1,paused:true});
  const starts=[];
  audio.play=async()=>{starts.push(audio.currentTime);audio.paused=false;audio.dispatchEvent(new Event('playing'));};
  audio.pause=()=>{audio.paused=true;};
  const p=parameter();
  const context={currentTime:0,destination:{},createGain:()=>({gain:p,connect(){}}),createMediaElementSource:()=>({connect(){}}),resume:async()=>{}};
  const transport=createTransport(audio,{createContext:()=>context,startAt:3});
  await transport.play();
  assert.equal(starts[0],3);
  audio.currentTime=12;
  transport.pause();await transport.play();
  assert.equal(starts[1],12);
  transport.stop();await transport.play();
  assert.equal(starts[2],3);
});
test('audio is served with seekable byte ranges, correct media type and invalid-range rejection',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'audio-range-'));
  await writeFile(join(dir,'sample.mp3'),Buffer.from([1,2,3,4,5]));
  const server=createApp({directory:dir});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}/sample.mp3`;
  try {
    const response=await fetch(url,{headers:{Range:'bytes=1-3'}});
    assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'audio/mpeg');
    assert.equal(response.headers.get('content-range'),'bytes 1-3/5');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[2,3,4]);
    assert.equal((await fetch(url,{headers:{Range:'bytes=99-'}})).status,416);
    assert.deepEqual([...new Uint8Array(await (await fetch(url,{headers:{Range:'bytes=-2'}})).arrayBuffer())],[4,5]);
  } finally {await new Promise(r=>server.close(r));await rm(dir,{recursive:true});}
});

function transportFixture(options = {}) {
  const audio = new EventTarget();
  Object.assign(audio, {currentTime:0,duration:180,readyState:1,paused:true});
  const order=[], nodes=[];
  audio.play=async()=>{order.push('play');audio.paused=false;audio.dispatchEvent(new Event('playing'));};
  audio.pause=()=>{audio.paused=true;};
  const source={connect:node=>order.push(['source',node])};
  const context={currentTime:10,destination:{},createGain:()=>{
    const node={gain:parameter(),connect:target=>order.push([node,target])};nodes.push(node);return node;
  },createMediaElementSource:()=>source,resume:()=>{order.push('resume');return options.resume?.() ?? Promise.resolve();}};
  const transport=createTransport(audio,{createContext:()=>context,volume:0.8,...options});
  return {audio,order,nodes,context,transport};
}

test('resume and media play run synchronously within the user activation',async()=>{
  let resume;
  const f=transportFixture({resume:()=>new Promise(r=>resume=r)});
  const pending=f.transport.play();
  assert.deepEqual(f.order.slice(-2),['resume','play']);
  f.transport.stop();resume();await pending;
  assert.equal(f.audio.paused,true);
});

test('start seek completion and buffer recovery do not restart the fade attack',async()=>{
  const f=transportFixture({startAt:3});await f.transport.play();
  const fade=f.nodes[0].gain;
  const count=fade.calls.length;
  f.audio.dispatchEvent(new Event('seeked'));
  assert.equal(fade.calls.length,count);
  f.audio.currentTime=20;
  f.audio.dispatchEvent(new Event('waiting'));f.audio.dispatchEvent(new Event('playing'));
  assert.deepEqual(fade.calls.slice(count),[['cancel',10],['cancel',10],['set',1,10],['set',1,168.5],['ramp',0,170]]);
});

test('volume uses a separate gain after the fade, including mute and pre-play changes',async()=>{
  const f=transportFixture();f.transport.setVolume(0.25);await f.transport.play();
  const [fade,volume]=f.nodes;
  assert.ok(f.order.some(x=>Array.isArray(x)&&x[0]===fade&&x[1]===volume));
  assert.ok(f.order.some(x=>Array.isArray(x)&&x[0]===volume&&x[1]===f.context.destination));
  assert.deepEqual(volume.gain.calls,[['set',0.25,10]]);
  const fadeCalls=fade.gain.calls.length;
  f.transport.setVolume(0);
  assert.deepEqual(volume.gain.calls.at(-1),['ramp',0,10.02]);
  assert.equal(fade.gain.calls.length,fadeCalls);
  f.audio.dispatchEvent(new Event('playing'));
  assert.deepEqual(volume.gain.calls.at(-1),['ramp',0,10.02]);
  f.transport.setVolume(2);assert.deepEqual(volume.gain.calls.at(-1),['ramp',1,10.02]);
  // Cancelling an in-flight ramp can restore its old start value. Sample first.
  volume.gain.value=0.4;
  volume.gain.cancelScheduledValues=()=>{volume.gain.value=1;};
  f.transport.setVolume(0.1);
  assert.deepEqual(volume.gain.calls.at(-2),['set',0.4,10]);
});

test('a cancelled play completion cannot pause a newer playback',async()=>{
  const resumes=[];
  const f=transportFixture({resume:()=>new Promise(r=>resumes.push(r))});
  const first=f.transport.play();f.transport.stop();const second=f.transport.play();
  resumes[0]();await first;assert.equal(f.audio.paused,false);
  resumes[1]();await second;assert.equal(f.audio.paused,false);
});

test('all tape and reel endpoints share a radius throughout the reveal',()=>{
  for(const r of [44,44.125,46,47.99,48]) {
    const p=tapeGeometry(r), top=70-r, bottom=70+r;
    assert.equal(p.loop,`M80 ${top} H520 A${r} ${r} 0 0 1 520 ${bottom} H80 A${r} ${r} 0 0 1 80 ${top} Z`);
    assert.equal(p.left,`M80 ${top} A${r} ${r} 0 0 1 80 ${bottom}`);
    assert.equal(p.right,`M520 ${bottom} A${r} ${r} 0 0 1 520 ${top}`);
  }
});

test('analytic tape points trace the drawn loop continuously at every radius',()=>{
  const near=(p,x,y)=>{assert.ok(Math.abs(p.x-x)<1e-9&&Math.abs(p.y-y)<1e-9,`${p.x},${p.y} != ${x},${y}`);};
  for(const r of [44,46,48]) {
    const arc=Math.PI*r, length=tapeLength(r);
    assert.equal(length,880+2*arc);
    near(tapePoint(r,0),80,70-r);
    near(tapePoint(r,220),300,70-r);
    near(tapePoint(r,440),520,70-r);
    near(tapePoint(r,440+arc/2),520+r,70);
    near(tapePoint(r,440+arc),520,70+r);
    near(tapePoint(r,880+arc),80,70+r);
    near(tapePoint(r,880+arc*1.5),80-r,70);
    near(tapePoint(r,length),80,70-r);
    near(tapePoint(r,-10),tapePoint(r,length-10).x,tapePoint(r,length-10).y);
    // Every point lies on the stadium, and no step jumps farther than travelled.
    let previous=tapePoint(r,0);
    for(let d=0.5;d<=length*2;d+=0.5) {
      const p=tapePoint(r,d);
      const cx=p.x<80?80:p.x>520?520:p.x;
      assert.ok(Math.abs(Math.hypot(p.x-cx,p.y-70)-r)<1e-9);
      assert.ok(Math.hypot(p.x-previous.x,p.y-previous.y)<=0.5+1e-9);
      previous=p;
    }
  }
});

test('scratch reverses every channel of actual PCM without changing the original', async () => {
  const {reverseTrack} = await import('../public/audio-player.js');
  const channels = [Float32Array.from([0.1, 0.2, -0.3, 0.4]), Float32Array.from([1, 2, 3, 4])];
  const buffer = {numberOfChannels:2, length:4, sampleRate:48000, getChannelData:i=>channels[i]};
  const context = {createBuffer:(count,length,rate)=>{
    assert.equal(rate,48000);
    const data = Array.from({length:count},()=>new Float32Array(length));
    return {getChannelData:i=>data[i]};
  }};
  const reverse = reverseTrack(context, buffer);
  assert.deepEqual([...reverse.getChannelData(1)], [4,3,2,1]);
  assert.deepEqual([...reverse.getChannelData(0)], [...channels[0]].reverse());
  assert.deepEqual([...channels[1]], [1,2,3,4]);
});

test('scratch voice selects reverse offsets, changes pitch, fades, and stays inside the track', async () => {
  const {createScratchVoice} = await import('../public/audio-player.js');
  const sources=[], gains=[];
  const context={currentTime:2,createBufferSource:()=>{
    const source={playbackRate:parameter(),connect(){},disconnect(){},start:(...args)=>source.started=args,stop:t=>source.stopped=t};
    sources.push(source);return source;
  },createGain:()=>{const gain={gain:parameter(),connect(){},disconnect(){}};gains.push(gain);return gain;}};
  const forward={duration:180}, reverse={duration:180};
  const voice=createScratchVoice(context,{},forward,reverse);
  voice.move(30,-2);
  assert.equal(sources[0].buffer,reverse);
  assert.deepEqual(sources[0].started,[2,150]);
  assert.deepEqual(sources[0].playbackRate.calls,[['set',2,2]]);
  assert.equal(gains[0].gain.calls[0][1],0);
  assert.equal(gains[0].gain.calls.at(-1)[1],0);
  voice.move(31,100);
  assert.equal(sources[1].buffer,forward);
  assert.equal(sources[1].playbackRate.calls[0][1],8);
  assert.equal(sources[0].stopped,2.009);
  voice.move(0,-1); voice.move(180,1); voice.move(30,0);
  assert.equal(sources.length,2);
  voice.move(179.99,2);
  assert.ok(sources[2].stopped <= 2.006);
  voice.stop();
  assert.equal(gains.at(-1).gain.calls.at(-1)[1],0);
});

function scratchFixture() {
  const f=transportFixture({startAt:3});
  const channels=[Float32Array.from([1,2,3,4])];
  f.audio.src='/track.mp3';
  f.context.decodeAudioData=async()=>({numberOfChannels:1,length:4,sampleRate:1,duration:180,getChannelData:i=>channels[i]});
  f.context.createBuffer=(count,length)=>({duration:180,getChannelData:()=>new Float32Array(length)});
  f.context.createBufferSource=()=>({playbackRate:parameter(),connect(){},disconnect(){},start(){},stop(){}});
  return f;
}

test('scratch release resumes only previously active playback and preserves the selected position', async t => {
  t.mock.method(globalThis,'fetch',async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}));
  for (const active of [false,true]) {
    const f=scratchFixture();
    if(active) await f.transport.play();
    f.audio.currentTime=30;
    assert.equal(await f.transport.beginScratch(),true);
    assert.equal(f.audio.paused,true);
    f.transport.moveScratch(12,-2);
    assert.equal(f.transport.position,12);
    await f.transport.endScratch();
    assert.equal(f.audio.currentTime,12);
    assert.equal(f.audio.paused,!active);
    f.transport.stop();
    assert.equal(f.audio.currentTime,0);
    assert.equal(f.transport.scratching,false);
  }
});

test('page exit during scratch decoding cannot start a late voice or resume audio', async t => {
  let decode;
  t.mock.method(globalThis,'fetch',async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}));
  const f=scratchFixture();await f.transport.play();
  const original=f.context.decodeAudioData;
  f.context.decodeAudioData=()=>new Promise(resolve=>{decode=()=>original().then(resolve);});
  const pending=f.transport.beginScratch();
  await new Promise(resolve=>setTimeout(resolve,0));
  f.transport.stop();decode();
  assert.equal(await pending,false);
  f.transport.moveScratch(100,-2);await f.transport.endScratch();
  assert.equal(f.audio.paused,true);
  assert.equal(f.audio.currentTime,0);
});
