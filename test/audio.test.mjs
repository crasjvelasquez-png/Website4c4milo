import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleEnvelope, createTransport, tapeGeometry} from '../public/audio-player.js';
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
