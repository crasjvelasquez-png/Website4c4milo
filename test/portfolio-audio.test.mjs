import test from 'node:test';
import assert from 'node:assert/strict';
import {createABTransport,formatTime} from '../public/portfolio-player.js';

function fixture() {
  const starts=[], ramps=[], sources=[];
  const param=()=>({value:1,cancelScheduledValues(){},setValueAtTime(value,time){this.value=value;ramps.push(['set',value,time]);},linearRampToValueAtTime(value,time){ramps.push(['ramp',value,time]);}});
  const context={currentTime:10,destination:{},createGain(){return {gain:param(),connect(){},disconnect(){}};},createBufferSource(){const source={connect(){},disconnect(){},start(...args){starts.push(args);},stop(){}};sources.push(source);return source;}};
  const before={duration:100},after={duration:100};
  const transport=createABTransport(context,before,after);
  return {context,starts,ramps,sources,transport};
}

test('both aligned versions start on one clock at one offset and switch with a short complementary fade',()=>{
  const f=fixture();
  f.transport.play();
  assert.deepEqual(f.starts,[[10.025,0,100],[10.025,0,100]]);
  f.transport.setSide('after');
  assert.deepEqual(f.ramps.slice(-4),[['set',1,10],['set',0,10],['ramp',0,10.008],['ramp',1,10.008]]);
  f.context.currentTime=10.004;
  f.transport.setSide('before');
  const reversed=f.ramps.slice(-4);
  assert.ok(Math.abs(reversed[0][1]-.5)<1e-9 && Math.abs(reversed[1][1]-.5)<1e-9);
  assert.equal(reversed[0][2],10.004);
  assert.equal(reversed[1][2],10.004);
  assert.equal(reversed[2][1],1);
  assert.equal(reversed[3][1],0);
  assert.ok(Math.abs(reversed[2][2]-10.012)<1e-9 && Math.abs(reversed[3][2]-10.012)<1e-9);
});

test('pause, resume and seek preserve one shared playback position for both sources',()=>{
  const f=fixture();
  f.transport.play();
  f.context.currentTime=15.025;
  assert.equal(f.transport.currentTime,5);
  f.transport.pause();
  assert.equal(f.transport.currentTime,5);
  f.transport.play();
  assert.deepEqual(f.starts.slice(2),[[15.05,5,95],[15.05,5,95]]);
  f.context.currentTime=18.05;
  f.transport.seek(23);
  assert.deepEqual(f.starts.slice(4),[[18.075,23,77],[18.075,23,77]]);
  assert.equal(f.transport.currentTime,23);
});

test('duration follows the shorter aligned file and time formatting is stable',()=>{
  const f=fixture();
  f.transport.dispose();
  const other=createABTransport(f.context,{duration:95},{duration:100});
  other.play();
  assert.equal(other.duration,95);
  assert.deepEqual(f.starts.slice(-2),[[10.025,0,95],[10.025,0,95]]);
  assert.equal(formatTime(125.9),'2:05');
});
