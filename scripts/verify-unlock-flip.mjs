const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base=process.env.UNLOCK_QA_URL || 'http://127.0.0.1:3012';
const {answer:configuredAnswer}=await (await fetch(`${base}/unlock-config.json`)).json();
const answer=configuredAnswer || 'AUDIO';
const results=[];
for (const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]) {
 const browser=await engine.launch();const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/unlock`);await page.waitForFunction(()=>!document.querySelector('[data-key="Q"]').disabled);
 await page.evaluate(()=>{window.changes=[];const tiles=[...document.querySelectorAll('.board-row:first-child .tile')];const start=performance.now();const observer=new MutationObserver(records=>{for(const r of records)if(r.attributeName==='class' && /correct|present|absent/.test(r.target.className))window.changes.push({col:tiles.indexOf(r.target),time:performance.now()-start});});tiles.forEach(t=>observer.observe(t,{attributes:true,attributeFilter:['class']}));window.observer=observer;});
 await page.keyboard.type('CRANE');await page.keyboard.press('Enter');
 assert.equal(await page.locator('.board').getAttribute('aria-busy'),'true');
 assert.equal(await page.locator('[data-win]').isVisible(),false);
 await page.keyboard.type(answer);await page.keyboard.press('Enter');
 assert.equal(await page.locator('.board-row').nth(1).textContent(),'');
 await page.waitForFunction(()=>document.querySelector('.board').getAttribute('aria-busy')==='false');
 const changes=await page.evaluate(()=>{window.observer.disconnect();return window.changes});
 assert.deepEqual(changes.slice(0,5).map(x=>x.col),[0,1,2,3,4]);
 assert.ok(changes[4].time-changes[0].time>=300);
 assert.equal(await page.locator('.board-row').nth(1).textContent(),'');
 assert.equal(await page.locator('.keyboard .correct,.keyboard .present,.keyboard .absent').count()>0,true);
 await page.reload();await page.waitForFunction(()=>!document.querySelector('[data-key="Q"]').disabled);assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
 await page.keyboard.type(answer);await page.keyboard.press('Enter');assert.equal(await page.locator('[data-win]').isVisible(),false);await page.locator('[data-win]').waitFor({state:'visible'});
 await page.locator('[data-again]').tap();await page.emulateMedia({reducedMotion:'reduce'});await page.keyboard.type('CRANE');await page.keyboard.press('Enter');assert.equal(await page.locator('.board').getAttribute('aria-busy'),'false');assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
 assert.deepEqual(errors,[]);results.push({browser:name,version:browser.version(),changes,checks:['left-to-right score reveal at tile midpoint','repeated input ignored during flip','keyboard scoring after reveal','win panel after final flip','restored guesses do not animate','reduced motion immediate','no page errors']});await browser.close();
}
await writeFile(new URL('../docs/qa/unlock-flip-results.json',import.meta.url),JSON.stringify({date:'2026-10-13',deployment:'local only',results},null,2)+'\n');console.log(JSON.stringify(results));
