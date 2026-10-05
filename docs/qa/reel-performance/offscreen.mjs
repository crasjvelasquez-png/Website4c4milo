const {chromium,webkit} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const results=[];
for (const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
 const b=await type.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 try {
 const p=await b.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2});
 await p.goto('http://127.0.0.1:3001');
 await p.getByRole('button',{name:'Play Querida',exact:true}).click();
 await p.waitForTimeout(900);
 const reel=p.locator('.tape-reel').first();
 const first=await reel.getAttribute('style');await p.waitForTimeout(250);assert.notEqual(await reel.getAttribute('style'),first);
 await p.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));await p.waitForTimeout(500);
 const stopped=await reel.getAttribute('style');const audio=p.locator('[data-audio-player] audio');const time=await audio.evaluate(a=>a.currentTime);
 await p.waitForTimeout(400);assert.equal(await reel.getAttribute('style'),stopped);assert.ok(await audio.evaluate(a=>a.currentTime)>time);
 await p.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await p.waitForTimeout(400);
 assert.notEqual(await reel.getAttribute('style'),stopped);
 await p.screenshot({path:`docs/qa/reel-performance/${name}-desktop.png`});
 results.push({browser:name,offscreenReelsStopped:true,audioContinued:true,reelsResumed:true});
 }finally {await b.close();}
}
await writeFile('docs/qa/reel-performance/offscreen.json',JSON.stringify(results,null,2)+'\n');
console.log(results);
