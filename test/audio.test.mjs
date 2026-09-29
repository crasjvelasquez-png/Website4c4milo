import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleEnvelope, createTransport} from '../public/audio-player.js';
import {createApp} from '../server.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

function parameter() {
  const calls=[];
  return {calls,cancelScheduledValues:t=>calls.push(['cancel',t]),setValueAtTime:(v,t)=>calls.push(['set',v,t]),linearRampToValueAtTime:(v,t)=>calls.push(['ramp',v,t])};
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
  assert.equal(starts,0);assert.equal(audio.currentTime,0);assert.equal(audio.paused,true);
  const next=t.play();resolveResume();await next;
  assert.equal(starts,1);assert.equal(audio.paused,false);
  audio.currentTime=179;audio.dispatchEvent(new Event('seeked'));
  assert.equal(p.calls.at(-1)[1],0);
  t.stop();assert.equal(audio.paused,true);assert.equal(audio.currentTime,0);assert.deepEqual(p.calls.at(-1),['set',0,20]);
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
